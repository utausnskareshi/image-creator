//! ダウンロードマネージャ
//!
//! 機能:
//! - HTTPストリーミングダウンロード（メモリ消費小）
//! - Range ヘッダによるレジューム
//! - SHA256 検証（オプション）
//! - Tauri イベント経由の進捗通知
//!
//! Tauri イベント名: `download:progress`
//! ペイロード: [`DownloadProgress`]
//!
//! 内部構造: [`download_one`] が薄いオーケストレーターとなり、
//! 以下の責務別関数を順に呼び出す:
//!   1. [`prepare_destination`] — 親ディレクトリ作成・既存ファイル検証・レジューム位置決定
//!   2. [`open_remote`]         — Range 付き HTTP GET、416 / 200-on-Range の透過リトライ
//!   3. [`stream_to_file`]      — ストリーミング書き込み・進捗イベント送出
//!   4. [`verify_hash`]         — SHA256 照合
//! SHA256 計算は [`hash_file`] (async) / [`hash_file_sync`] に集約。

use futures_util::StreamExt;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::io::Read;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tauri::Emitter;
use tokio::fs::{File, OpenOptions};
use tokio::io::AsyncWriteExt;

/// 進捗イベント名
pub const EVENT_PROGRESS: &str = "download:progress";

/// 進捗送信の最小インターバル（ミリ秒）
const PROGRESS_INTERVAL_MS: u128 = 200;

/// 1ジョブの定義
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadJob {
    /// 一意の識別子（UI 側で進捗を紐付ける）
    pub id: String,
    /// 表示名（UI 表示用）
    pub display_name: String,
    /// ダウンロード元 URL
    pub url: String,
    /// 保存先フルパス（親ディレクトリは自動作成）
    pub dest_path: String,
    /// 期待される SHA256（小文字16進。None なら検証スキップ）
    pub expected_sha256: Option<String>,
    /// 期待ファイルサイズ（None なら検証スキップ）
    pub expected_size: Option<u64>,
}

/// ダウンロード状態
/// Rust 側は実行中・完了系のみ emit する。
/// `Pending` はフロントエンドが UI 初期化に使うのみで Rust からは送出されないが、
/// TypeScript 側の型と整合させるため列挙メンバとして残しておく。
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "lowercase")]
#[allow(dead_code)]
pub enum DownloadStatus {
    Pending,
    Downloading,
    Verifying,
    Completed,
    Failed,
    AlreadyExists,
}

/// 進捗ペイロード
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub job_id: String,
    pub status: DownloadStatus,
    pub downloaded_bytes: u64,
    pub total_bytes: Option<u64>,
    /// バイト/秒（直近サンプル）
    pub speed_bps: u64,
    /// 補足メッセージ（エラー詳細等）
    pub message: Option<String>,
}

/// 進捗イベントを発火する
fn emit_progress(app: &tauri::AppHandle, payload: DownloadProgress) {
    if let Err(e) = app.emit(EVENT_PROGRESS, &payload) {
        log::warn!("進捗イベント発火失敗: {}", e);
    }
}

// ============================================================================
// SHA256 計算（同期/非同期 共通実装）
// ============================================================================

/// ファイル全体の SHA256 を計算する（同期I/O。spawn_blocking 内で呼ぶ前提）
fn hash_file_sync(path: &Path) -> Result<String, String> {
    let mut file =
        std::fs::File::open(path).map_err(|e| format!("ファイルを開けません: {}", e))?;
    let mut hasher = Sha256::new();
    let mut buffer = vec![0u8; 256 * 1024]; // 256KB
    loop {
        let n = file
            .read(&mut buffer)
            .map_err(|e| format!("ファイル読み込みエラー: {}", e))?;
        if n == 0 {
            break;
        }
        hasher.update(&buffer[..n]);
    }
    Ok(hex::encode(hasher.finalize()))
}

/// ファイル全体の SHA256 を非同期で計算する
async fn hash_file(path: PathBuf) -> Result<String, String> {
    tokio::task::spawn_blocking(move || hash_file_sync(&path))
        .await
        .map_err(|e| format!("SHA256 計算タスクがパニック: {}", e))?
}

// ============================================================================
// Step 1: 保存先準備
// ============================================================================

/// `prepare_destination` の結果
enum PrepareOutcome {
    /// 既存ファイルが期待値と一致しているのでダウンロード不要（呼び出し側は Ok(()) を返す）
    AlreadyComplete,
    /// 続行: `resume_from` バイト目から DL する（0 なら新規作成、>0 ならレジューム）
    Continue { resume_from: u64 },
}

/// 親ディレクトリ作成と既存ファイルの整合性検証を行い、レジューム位置を返す。
///
/// 挙動:
/// - 親ディレクトリが無ければ作成
/// - 既存ファイルのサイズが期待値と一致する場合:
///   - 期待 SHA256 あり → ハッシュ照合し、一致なら [`PrepareOutcome::AlreadyComplete`]
///     不一致なら部分ファイルとして削除して新規 DL
///   - 期待 SHA256 なし → サイズ一致のみで [`PrepareOutcome::AlreadyComplete`]
/// - 既存ファイルが小さい場合は [`PrepareOutcome::Continue { resume_from: 既存サイズ }`]
async fn prepare_destination(
    app: &tauri::AppHandle,
    job: &DownloadJob,
    dest: &Path,
) -> Result<PrepareOutcome, String> {
    // 親ディレクトリ作成
    if let Some(parent) = dest.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("親ディレクトリ作成失敗 ({}): {}", parent.display(), e))?;
    }

    // 既存ファイルサイズ取得（存在しなければ 0）
    let existing_size = match tokio::fs::metadata(dest).await {
        Ok(meta) if meta.is_file() => meta.len(),
        _ => 0,
    };

    // 期待サイズと比較: 一致したらハッシュ検証 or スキップ判定へ
    if let Some(expected) = job.expected_size {
        if existing_size == expected {
            if let Some(ref expected_hash) = job.expected_sha256 {
                // ハッシュ検証
                emit_progress(
                    app,
                    DownloadProgress {
                        job_id: job.id.clone(),
                        status: DownloadStatus::Verifying,
                        downloaded_bytes: existing_size,
                        total_bytes: Some(expected),
                        speed_bps: 0,
                        message: Some("既存ファイルの整合性を検証中".into()),
                    },
                );
                let actual = hash_file(dest.to_path_buf()).await?;
                if actual.eq_ignore_ascii_case(expected_hash) {
                    emit_progress(
                        app,
                        DownloadProgress {
                            job_id: job.id.clone(),
                            status: DownloadStatus::AlreadyExists,
                            downloaded_bytes: existing_size,
                            total_bytes: Some(expected),
                            speed_bps: 0,
                            message: Some("既存ファイルが正しいためスキップ".into()),
                        },
                    );
                    return Ok(PrepareOutcome::AlreadyComplete);
                }
                // ハッシュ不一致 → 破損とみなして再ダウンロード
                log::warn!(
                    "既存ファイルの SHA256 不一致、再ダウンロードします: {}",
                    dest.display()
                );
                tokio::fs::remove_file(dest).await.ok();
                return Ok(PrepareOutcome::Continue { resume_from: 0 });
            }
            // ハッシュ未提供、サイズ一致のみで OK
            emit_progress(
                app,
                DownloadProgress {
                    job_id: job.id.clone(),
                    status: DownloadStatus::AlreadyExists,
                    downloaded_bytes: existing_size,
                    total_bytes: Some(expected),
                    speed_bps: 0,
                    message: Some("既存ファイルが期待サイズと一致するためスキップ".into()),
                },
            );
            return Ok(PrepareOutcome::AlreadyComplete);
        }
    }

    // 既存サイズが期待値より小さい（または期待値未指定）→ そのバイト目からレジューム
    Ok(PrepareOutcome::Continue {
        resume_from: existing_size,
    })
}

// ============================================================================
// Step 2: HTTP リクエスト（Range / 416 / 200-on-Range フォールバック）
// ============================================================================

/// `open_remote` の戻り値
struct RemoteStream {
    /// ストリーミング可能なレスポンス
    response: reqwest::Response,
    /// 実効的な再開位置。416 / 200-on-Range フォールバックが起きた場合は 0。
    /// この値に応じて呼び出し側はファイルを `append` or `truncate` で開く。
    effective_resume_from: u64,
    /// 総ファイルサイズ（Content-Range / Content-Length / 期待サイズの順で推定）
    total_size: Option<u64>,
}

/// HTTP GET を実行し、必要に応じて 416 / 200-on-Range のフォールバックを行う。
///
/// 透過リトライ条件:
/// - サーバが 416 Range Not Satisfiable を返した（部分ファイルがサーバファイルサイズを超過）
/// - Range 付きリクエストにサーバが 200 OK で全量応答した（Range 無視）
///
/// いずれの場合も、既存の部分ファイルを削除して `effective_resume_from = 0` とし、
/// Range ヘッダなしで再リクエストする。フォールバック発生時には進捗イベントも emit する。
async fn open_remote(
    app: &tauri::AppHandle,
    job: &DownloadJob,
    client: &reqwest::Client,
    dest: &Path,
    resume_from: u64,
) -> Result<RemoteStream, String> {
    // 初回 emit: Downloading 開始
    emit_progress(
        app,
        DownloadProgress {
            job_id: job.id.clone(),
            status: DownloadStatus::Downloading,
            downloaded_bytes: resume_from,
            total_bytes: job.expected_size,
            speed_bps: 0,
            message: if resume_from > 0 {
                Some(format!("再開: {} バイトから", resume_from))
            } else {
                None
            },
        },
    );

    // 初回リクエスト
    let mut request = client.get(&job.url);
    if resume_from > 0 {
        request = request.header("Range", format!("bytes={}-", resume_from));
    }
    let mut response = request
        .send()
        .await
        .map_err(|e| format!("リクエスト失敗 ({}): {}", job.url, e))?;

    let mut effective_resume_from = resume_from;

    // 416 Range Not Satisfiable: 部分ファイルがサーバ側ファイルサイズを超えている
    if response.status().as_u16() == 416 && resume_from > 0 {
        log::warn!(
            "416 を受信。部分ファイルを削除して全量再ダウンロードします: {}",
            dest.display()
        );
        drop(response);
        tokio::fs::remove_file(dest).await.ok();
        effective_resume_from = 0;

        emit_progress(
            app,
            DownloadProgress {
                job_id: job.id.clone(),
                status: DownloadStatus::Downloading,
                downloaded_bytes: 0,
                total_bytes: job.expected_size,
                speed_bps: 0,
                message: Some("既存ファイルがサーバと不整合のため全量再取得します".into()),
            },
        );

        response = client
            .get(&job.url)
            .send()
            .await
            .map_err(|e| format!("再リクエスト失敗 ({}): {}", job.url, e))?;
    }

    let mut status = response.status();
    if !status.is_success() && status.as_u16() != 206 {
        return Err(format!("サーバーエラー: {} ({})", status, job.url));
    }

    // レジューム要求 (Range ヘッダ送信) に対しサーバが 200 OK で返した場合は、
    // Range を無視して全量を返してきている。append=true のままだと既存の部分
    // ファイルに先頭からのバイト列を継ぎ足してファイルが破損する。
    // → 部分ファイルを削除し、effective_resume_from を 0 にして全量受信に切り替える。
    if effective_resume_from > 0 && status.as_u16() == 200 {
        log::warn!(
            "サーバが Range ヘッダを無視して 200 OK を返したため全量再取得します: {}",
            job.url
        );
        drop(response);
        tokio::fs::remove_file(dest).await.ok();
        effective_resume_from = 0;
        response = client
            .get(&job.url)
            .send()
            .await
            .map_err(|e| format!("再リクエスト失敗 ({}): {}", job.url, e))?;
        status = response.status();
        if !status.is_success() {
            return Err(format!(
                "サーバーエラー (再リクエスト): {} ({})",
                status, job.url
            ));
        }
    }

    // Content-Length / Content-Range から総サイズを算出
    let total_size = if status.as_u16() == 206 {
        // 206 Partial Content: Content-Range: bytes start-end/total
        response
            .headers()
            .get("content-range")
            .and_then(|v| v.to_str().ok())
            .and_then(|s| s.rsplit('/').next())
            .and_then(|t| t.parse::<u64>().ok())
            .or(job.expected_size)
    } else {
        response.content_length().or(job.expected_size)
    };

    Ok(RemoteStream {
        response,
        effective_resume_from,
        total_size,
    })
}

// ============================================================================
// Step 3: ストリーミング書き込み + 進捗イベント
// ============================================================================

/// `stream_to_file` の戻り値
struct StreamStats {
    /// 最終的にファイルに存在するバイト数（レジューム分含む）
    downloaded: u64,
    /// 平均速度（バイト/秒）。今回受信分のみで算出。
    avg_speed_bps: u64,
}

/// レスポンスボディをストリーミング受信してファイルに書き込みつつ、
/// [`PROGRESS_INTERVAL_MS`] ごとに進捗イベントを emit する。
///
/// - `append = true` のとき既存ファイルに追記（レジューム）、`false` のとき truncate して新規作成
/// - `initial_downloaded` は既にディスクに存在するバイト数（進捗イベントの初期値・速度算出基準）
async fn stream_to_file(
    app: &tauri::AppHandle,
    job_id: &str,
    response: reqwest::Response,
    dest: &Path,
    append: bool,
    initial_downloaded: u64,
    total_size: Option<u64>,
) -> Result<StreamStats, String> {
    // 追記モード or 新規作成でファイルを開く
    let file: File = OpenOptions::new()
        .create(true)
        .append(append)
        .write(true)
        .truncate(!append)
        .open(dest)
        .await
        .map_err(|e| format!("ファイル作成失敗 ({}): {}", dest.display(), e))?;

    let mut writer = tokio::io::BufWriter::with_capacity(1024 * 1024, file);
    let mut stream = response.bytes_stream();

    let mut downloaded: u64 = initial_downloaded;
    let mut last_emit = Instant::now();
    let mut last_emit_bytes = initial_downloaded;
    let started_at = Instant::now();

    while let Some(chunk_result) = stream.next().await {
        let chunk = chunk_result.map_err(|e| format!("受信エラー: {}", e))?;
        writer
            .write_all(&chunk)
            .await
            .map_err(|e| format!("書き込みエラー: {}", e))?;
        downloaded += chunk.len() as u64;

        // 進捗イベント（インターバル制御）
        let elapsed_since_emit = last_emit.elapsed().as_millis();
        if elapsed_since_emit >= PROGRESS_INTERVAL_MS {
            let delta_bytes = downloaded - last_emit_bytes;
            // elapsed_since_emit が 0 だと除算できない
            // (実際には PROGRESS_INTERVAL_MS >= 200ms 以上経過していて 0 にならないが、
            // 静的解析を満たすため checked_div を使用)
            let speed_bps = (delta_bytes as u128 * 1000)
                .checked_div(elapsed_since_emit)
                .map(|v| v as u64)
                .unwrap_or(0);
            emit_progress(
                app,
                DownloadProgress {
                    job_id: job_id.to_string(),
                    status: DownloadStatus::Downloading,
                    downloaded_bytes: downloaded,
                    total_bytes: total_size,
                    speed_bps,
                    message: None,
                },
            );
            last_emit = Instant::now();
            last_emit_bytes = downloaded;
        }
    }

    writer
        .flush()
        .await
        .map_err(|e| format!("バッファフラッシュ失敗: {}", e))?;
    writer
        .into_inner()
        .sync_all()
        .await
        .map_err(|e| format!("sync_all 失敗: {}", e))?;

    let total_elapsed_ms = started_at.elapsed().as_millis().max(1);
    let avg_speed_bps =
        ((downloaded - initial_downloaded) as u128 * 1000 / total_elapsed_ms) as u64;

    Ok(StreamStats {
        downloaded,
        avg_speed_bps,
    })
}

// ============================================================================
// Step 4: SHA256 検証
// ============================================================================

/// ファイル全体の SHA256 を計算し、期待値と照合する。
/// 大文字小文字の差異は無視する。
async fn verify_hash(path: PathBuf, expected_sha256: &str) -> Result<(), String> {
    let actual = hash_file(path).await?;
    if !actual.eq_ignore_ascii_case(expected_sha256) {
        return Err(format!(
            "SHA256 不一致: 期待 {}, 実際 {}",
            expected_sha256, actual
        ));
    }
    Ok(())
}

// ============================================================================
// オーケストレーター
// ============================================================================

/// 1ジョブをダウンロードする本体（薄いオーケストレーター）
async fn download_one(app: &tauri::AppHandle, job: DownloadJob) -> Result<(), String> {
    let dest = PathBuf::from(&job.dest_path);

    // Step 1: 保存先準備 + 既存ファイル検証
    let resume_from = match prepare_destination(app, &job, &dest).await? {
        PrepareOutcome::AlreadyComplete => return Ok(()),
        PrepareOutcome::Continue { resume_from } => resume_from,
    };

    // HTTP クライアント構築
    // 注: .timeout() はリクエスト全体の所要時間に適用されるため、
    //   数GB級のファイル DL で短すぎると途中で切断されてしまう。
    //   接続確立のみ 30 秒で打ち切り、ボディ転送は時間制限なしとする。
    //   接続が無音状態で stall した場合は OS / reqwest 側のソケット idle で検知される。
    let client = reqwest::Client::builder()
        .user_agent(format!("ImageCreator/{}", env!("CARGO_PKG_VERSION")))
        .connect_timeout(Duration::from_secs(30))
        .build()
        .map_err(|e| format!("HTTP クライアント構築失敗: {}", e))?;

    // Step 2: HTTP リクエスト発行（416 / 200-on-Range は内部で透過リトライ）
    let RemoteStream {
        response,
        effective_resume_from,
        total_size,
    } = open_remote(app, &job, &client, &dest, resume_from).await?;

    // Step 3: ストリーミング書き込み
    let StreamStats {
        downloaded,
        avg_speed_bps,
    } = stream_to_file(
        app,
        &job.id,
        response,
        &dest,
        effective_resume_from > 0,
        effective_resume_from,
        total_size,
    )
    .await?;

    // Step 4: SHA256 検証（期待値があるときのみ）
    if let Some(expected_hash) = job.expected_sha256.as_ref() {
        emit_progress(
            app,
            DownloadProgress {
                job_id: job.id.clone(),
                status: DownloadStatus::Verifying,
                downloaded_bytes: downloaded,
                total_bytes: total_size,
                speed_bps: avg_speed_bps,
                message: Some("SHA256 検証中".into()),
            },
        );
        verify_hash(dest.clone(), expected_hash).await?;
    }

    // 完了 emit
    emit_progress(
        app,
        DownloadProgress {
            job_id: job.id.clone(),
            status: DownloadStatus::Completed,
            downloaded_bytes: downloaded,
            total_bytes: total_size,
            speed_bps: avg_speed_bps,
            message: None,
        },
    );

    Ok(())
}

/// 複数ジョブを順次ダウンロードする
/// 任意の1ジョブが失敗したら以降は中止し、エラーを返す
pub async fn download_files_impl(
    app: tauri::AppHandle,
    jobs: Vec<DownloadJob>,
) -> Result<(), String> {
    for job in jobs {
        let job_id = job.id.clone();
        let display = job.display_name.clone();
        if let Err(e) = download_one(&app, job).await {
            emit_progress(
                &app,
                DownloadProgress {
                    job_id: job_id.clone(),
                    status: DownloadStatus::Failed,
                    downloaded_bytes: 0,
                    total_bytes: None,
                    speed_bps: 0,
                    message: Some(e.clone()),
                },
            );
            return Err(format!("[{}] ダウンロード失敗: {}", display, e));
        }
    }
    Ok(())
}

// ---- Tauri コマンド ----

#[tauri::command]
pub async fn download_files(
    app: tauri::AppHandle,
    jobs: Vec<DownloadJob>,
) -> Result<(), String> {
    download_files_impl(app, jobs).await
}

/// 単一ファイルの SHA256 を取得（既存ファイルの検証用）
#[tauri::command]
pub async fn compute_file_sha256(path: String) -> Result<String, String> {
    hash_file(PathBuf::from(path)).await
}
