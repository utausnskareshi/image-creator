// ComfyUI WebSocket クライアントフック
// Reactから直接 ws://127.0.0.1:8188/ws?clientId=<uuid> に接続する
//
// 受信メッセージ:
//   テキストJSON: status / execution_start / executing / progress / executed / execution_error
//   バイナリ: プレビュー画像（先頭8バイトがメタデータ）
//
// 提供する状態:
//   - connected:        WebSocket 接続中か
//   - queueRemaining:   キュー残数（ComfyUI 全体）
//   - executing:        実行中フラグ（execution_start で true / executing.node === null で false）
//   - currentNode:      現在処理中のノード ID
//   - step:             サンプリングステップ進捗（valueとmax）
//   - previewUrl:       中間プレビュー画像の Blob URL
//   - error:            エラーメッセージ
//
// 提供する関数:
//   - resetPreview: プレビューURLとステップ情報をクリア（新規生成開始時に呼ぶ）

import { useCallback, useEffect, useRef, useState } from 'react';

interface ComfyUIWebSocketOptions {
  port?: number;
  enabled?: boolean;
}

export interface ComfyUIWebSocketState {
  connected: boolean;
  queueRemaining: number;
  executing: boolean;
  currentNode: string | null;
  step: { value: number; max: number } | null;
  previewUrl: string | null;
  error: string | null;
  promptId: string | null;
  resetPreview: () => void;
}

interface WsMessage {
  type: string;
  data?: {
    status?: { exec_info?: { queue_remaining?: number } };
    node?: string | null;
    prompt_id?: string;
    value?: number;
    max?: number;
    exception_message?: string;
    [key: string]: unknown;
  };
}

// ComfyUI のバイナリプレビューフォーマット:
// bytes[0..4]  event type (big-endian u32)。1 = preview
// bytes[4..8]  image type (big-endian u32)。1 = JPEG, 2 = PNG
// bytes[8..]   画像バイト列
function parsePreviewBinary(buffer: ArrayBuffer): Blob | null {
  if (buffer.byteLength < 8) return null;
  const view = new DataView(buffer);
  const eventType = view.getUint32(0, false);
  if (eventType !== 1) return null;
  const imageType = view.getUint32(4, false);
  const mime = imageType === 1 ? 'image/jpeg' : 'image/png';
  const imageBytes = new Uint8Array(buffer, 8);
  return new Blob([imageBytes], { type: mime });
}

export function useComfyUIWebSocket(
  options: ComfyUIWebSocketOptions = {},
): ComfyUIWebSocketState {
  const port = options.port ?? 8188;
  const enabled = options.enabled ?? true;

  const [connected, setConnected] = useState(false);
  const [queueRemaining, setQueueRemaining] = useState(0);
  const [executing, setExecuting] = useState(false);
  const [currentNode, setCurrentNode] = useState<string | null>(null);
  const [step, setStep] = useState<{ value: number; max: number } | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promptId, setPromptId] = useState<string | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimerRef = useRef<number | null>(null);
  const previousUrlRef = useRef<string | null>(null);
  const clientIdRef = useRef<string>(
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID()
      : Math.random().toString(36).slice(2),
  );
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  // unmount フラグ。コンポーネントが unmount されたあとに onclose が遅延発火し
  // 再接続を schedule する race を防ぐため。enabled とは独立で、cleanup でのみ false にする。
  const mountedRef = useRef(true);
  // 指数バックオフの試行カウンタ。
  // ComfyUI 未起動状態が長期化すると 3 秒固定だと CPU/ログ/ネットワークを浪費するため、
  // 失敗回数に応じて待機時間を 3s→6s→12s→24s→30s(最大) と引き伸ばす。
  const reconnectAttemptsRef = useRef(0);
  const RECONNECT_INITIAL_MS = 3000;
  const RECONNECT_MAX_MS = 30000;

  const cleanupPreview = useCallback(() => {
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
      previousUrlRef.current = null;
    }
    setPreviewUrl(null);
  }, []);

  const resetPreview = useCallback(() => {
    cleanupPreview();
    setStep(null);
    setCurrentNode(null);
    setError(null);
  }, [cleanupPreview]);

  const handleMessage = useCallback(
    (msg: WsMessage) => {
      switch (msg.type) {
        case 'status': {
          setQueueRemaining(msg.data?.status?.exec_info?.queue_remaining ?? 0);
          break;
        }
        case 'execution_start': {
          setExecuting(true);
          setPromptId(msg.data?.prompt_id ?? null);
          setStep(null);
          setError(null);
          break;
        }
        case 'executing': {
          const node = msg.data?.node;
          setCurrentNode(node ?? null);
          if (node === null || node === undefined) {
            // 完了
            setExecuting(false);
            setStep(null);
            // プレビューは結果が表示されるまで残しておく（即消すと一瞬何もなくなる）
          }
          break;
        }
        case 'progress': {
          const value = msg.data?.value ?? 0;
          const max = msg.data?.max ?? 1;
          setStep({ value, max });
          break;
        }
        case 'execution_error': {
          const exMsg = msg.data?.exception_message ?? '不明なエラー';
          setError(`ComfyUI 実行エラー: ${exMsg}`);
          setExecuting(false);
          break;
        }
        case 'execution_cached':
        case 'executed':
        case 'execution_interrupted':
        default:
          break;
      }
    },
    [],
  );

  const handleBinary = useCallback((buffer: ArrayBuffer) => {
    const blob = parsePreviewBinary(buffer);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    // 古いURLは破棄
    if (previousUrlRef.current) {
      URL.revokeObjectURL(previousUrlRef.current);
    }
    previousUrlRef.current = url;
    setPreviewUrl(url);
  }, []);

  // 次の再接続までの遅延 (ミリ秒) を試行回数から算出する
  const computeBackoffDelay = useCallback((): number => {
    const attempt = reconnectAttemptsRef.current;
    const delay = RECONNECT_INITIAL_MS * Math.pow(2, attempt);
    return Math.min(delay, RECONNECT_MAX_MS);
  }, []);

  // `connect` の最新版を保持する ref。
  // scheduleReconnect → connect の循環参照を deps に出さず stale closure を避けるため、
  // setTimeout 内では connectRef.current() を呼ぶ。
  // connectRef は下で useEffect により毎レンダで最新の connect に同期される。
  const connectRef = useRef<() => void>(() => {});

  const scheduleReconnect = useCallback(() => {
    // unmount 後 or enabled=false なら再接続スケジュールしない
    if (!mountedRef.current || !enabledRef.current) return;
    if (reconnectTimerRef.current !== null) return; // 既にスケジュール済み
    const delay = computeBackoffDelay();
    reconnectTimerRef.current = window.setTimeout(() => {
      reconnectTimerRef.current = null;
      // setTimeout 発火時点で mount 中かつ enabled なら接続を試みる
      if (mountedRef.current && enabledRef.current) {
        reconnectAttemptsRef.current += 1;
        connectRef.current();
      }
    }, delay);
  }, [computeBackoffDelay]);

  const connect = useCallback(() => {
    if (!enabledRef.current) return;
    if (wsRef.current) return;

    let ws: WebSocket;
    try {
      const url = `ws://127.0.0.1:${port}/ws?clientId=${clientIdRef.current}`;
      ws = new WebSocket(url);
    } catch (e) {
      // 接続自体ができない場合（ComfyUI 未起動など）
      const msg = e instanceof Error ? e.message : String(e);
      setError(`WebSocket 初期化失敗: ${msg}`);
      scheduleReconnect();
      return;
    }
    ws.binaryType = 'arraybuffer';

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      // 成功したらバックオフ試行カウンタをリセット
      reconnectAttemptsRef.current = 0;
    };

    ws.onmessage = (event) => {
      if (typeof event.data === 'string') {
        try {
          const parsed = JSON.parse(event.data) as WsMessage;
          handleMessage(parsed);
        } catch (e) {
          console.warn('WS テキスト解析失敗', e);
        }
      } else if (event.data instanceof ArrayBuffer) {
        handleBinary(event.data);
      } else if (event.data instanceof Blob) {
        // 念のため Blob 形式にも対応
        event.data
          .arrayBuffer()
          .then(handleBinary)
          .catch((err) => console.warn('WS Blob→ArrayBuffer 変換失敗', err));
      }
    };

    ws.onerror = () => {
      // onclose 内で再接続を扱う
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // unmount/disable 中 (enabledRef.current=false) のときは新しい接続を作らない
      // これにより useEffect cleanup → onclose の競合で「mountされていないのに新規接続」を作るリークを防ぐ
      scheduleReconnect();
    };

    wsRef.current = ws;
  }, [port, handleMessage, handleBinary, scheduleReconnect]);

  // connect が再生成されるたびに connectRef へ同期する。
  // (これにより scheduleReconnect の setTimeout コールバック内 connectRef.current() が
  //  常に最新の connect を呼べる)
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);

  useEffect(() => {
    // 新しい effect 開始時に mounted を再確立する
    // (cleanup と「依存変更による再 mount」を区別するため、毎回 true に戻す)
    mountedRef.current = true;
    if (!enabled) {
      // disable 時は再接続が走らないようカウンタもクリアする
      reconnectAttemptsRef.current = 0;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      setConnected(false);
      return;
    }
    connect();
    return () => {
      // cleanup は onclose より先に走るとは限らないため、mountedRef で「unmount 後の再接続」を防ぐ。
      // enabledRef は次の render で line 91 により更新されるので、cleanup では触らない。
      mountedRef.current = false;
      if (reconnectTimerRef.current !== null) {
        window.clearTimeout(reconnectTimerRef.current);
        reconnectTimerRef.current = null;
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
      cleanupPreview();
    };
  }, [enabled, connect, cleanupPreview]);

  return {
    connected,
    queueRemaining,
    executing,
    currentNode,
    step,
    previewUrl,
    error,
    promptId,
    resetPreview,
  };
}
