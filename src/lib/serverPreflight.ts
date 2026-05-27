// サーバ起動状態のプリフライトチェック
//
// 画像生成・プロンプト変換などの API 呼び出し前に呼び、サーバが応答可能か確認する。
// 起動していなければ「○○ パネルで起動ボタンを押してください」という具体的指示を返す。
//
// 戻り値:
//   null  → サーバ OK、本処理を続行可能
//   string → エラーメッセージ（UIに表示して return すべき）

import { comfyuiStatus, llmStatus } from './tauri';

/** プリフライトのタイムアウト (ミリ秒) */
const PREFLIGHT_TIMEOUT_MS = 5000;

/**
 * Promise.race ベースのタイムアウト付き実行。
 * 指定時間内に解決しなければ専用エラーを throw する。
 */
async function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: number | undefined;
  const timeoutPromise = new Promise<never>((_, reject) => {
    timer = window.setTimeout(() => {
      reject(new Error(`${label} のステータス取得がタイムアウトしました (${PREFLIGHT_TIMEOUT_MS}ms)`));
    }, PREFLIGHT_TIMEOUT_MS);
  });
  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timer !== undefined) window.clearTimeout(timer);
  }
}

/**
 * ComfyUI の起動チェック
 * - processRunning=false: プロセスが起動していない → 起動指示
 * - apiReachable=false: プロセスはあるが API 応答なし → 起動中（モデルロード中）の可能性
 */
export async function preflightComfyUI(dataFolder: string): Promise<string | null> {
  try {
    const st = await withTimeout(comfyuiStatus(dataFolder), 'ComfyUI');
    if (!st.processRunning) {
      return (
        'ComfyUI が起動していません。\n\n' +
        '対処方法:\n' +
        '1. 画面上部の「ComfyUI」パネルで「起動」ボタンをクリック\n' +
        '2. 起動完了まで 1〜3 分待つ（モデルロード含む）\n' +
        '3. 緑色の「起動中」バッジに変わったら再度実行してください'
      );
    }
    if (!st.apiReachable) {
      return (
        'ComfyUI のプロセスは起動していますが API が応答していません。\n' +
        '初回起動時のモデルロード中の可能性があります。少し待ってから再試行してください。'
      );
    }
    return null;
  } catch (e) {
    console.warn('[preflight] ComfyUI status check failed:', e);
    return null; // ステータス取得自体に失敗した場合は通常フローに任せる
  }
}

/**
 * プロンプト変換 LLM (llama-server) の起動チェック
 */
export async function preflightLlm(dataFolder: string): Promise<string | null> {
  try {
    const st = await withTimeout(llmStatus(dataFolder), 'LLM');
    if (!st.processRunning) {
      return (
        'プロンプト変換 LLM (llama-server) が起動していません。\n\n' +
        '対処方法:\n' +
        '1. 画面上部の「プロンプト変換 LLM」パネルで「起動」ボタンをクリック\n' +
        '2. 起動完了（10〜20 秒）まで待つ\n' +
        '3. 緑色の「起動中」バッジに変わったら再度実行してください'
      );
    }
    if (!st.apiReachable) {
      return (
        'プロンプト変換 LLM のプロセスは起動していますが API が応答していません。\n' +
        '初回モデルロード中の可能性があります。少し待ってから再試行してください。'
      );
    }
    return null;
  } catch (e) {
    console.warn('[preflight] LLM status check failed:', e);
    return null;
  }
}
