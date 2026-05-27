//! ログモジュール
//!
//! - アプリ本体のログ: `simplelog::WriteLogger` で `%LOCALAPPDATA%\ImageCreator\logs\app.log` に追記
//! - ComfyUI / llama-server のログ: 各プロセスの stdout/stderr を `<data>/runtime/logs/{comfyui,llama}.log` に書き出し
//! - 読み取り API はフロントから `read_log` / `clear_log` / `log_path` で呼び出す

use crate::settings;
use serde::Deserialize;
use std::path::PathBuf;
use tauri::Manager;

const APP_LOG_FILENAME: &str = "app.log";
const COMFYUI_LOG_FILENAME: &str = "comfyui.log";
const LLAMA_LOG_FILENAME: &str = "llama.log";
const DEFAULT_TAIL_LINES: usize = 1000;

#[derive(Debug, Deserialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum LogKind {
    App,
    Comfyui,
    Llama,
}

/// アプリ本体ログのファイルパス
pub fn app_log_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("local data dir 取得失敗: {}", e))?;
    Ok(dir.join("logs").join(APP_LOG_FILENAME))
}

/// ランタイム（ComfyUI / llama-server）のログディレクトリ
pub fn runtime_log_dir(data_folder: &std::path::Path) -> PathBuf {
    data_folder.join("runtime").join("logs")
}

pub fn comfyui_log_path(data_folder: &std::path::Path) -> PathBuf {
    runtime_log_dir(data_folder).join(COMFYUI_LOG_FILENAME)
}

pub fn llama_log_path(data_folder: &std::path::Path) -> PathBuf {
    runtime_log_dir(data_folder).join(LLAMA_LOG_FILENAME)
}

/// アプリ起動時にロガーを初期化する
/// 失敗してもアプリは継続（ログが残らないだけ）
pub fn init_app_logger(app: &tauri::AppHandle) {
    let path = match app_log_path(app) {
        Ok(p) => p,
        Err(e) => {
            eprintln!("ログパス取得失敗: {}", e);
            return;
        }
    };

    if let Some(parent) = path.parent() {
        if let Err(e) = std::fs::create_dir_all(parent) {
            eprintln!("ログディレクトリ作成失敗: {}", e);
            return;
        }
    }

    // 追記モードで開く（前回のログを残す）
    let file = match std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("ログファイル open 失敗: {}", e);
            return;
        }
    };

    let config = simplelog::ConfigBuilder::new()
        .set_time_format_rfc3339()
        .build();

    let level = if cfg!(debug_assertions) {
        simplelog::LevelFilter::Debug
    } else {
        simplelog::LevelFilter::Info
    };

    if let Err(e) = simplelog::WriteLogger::init(level, config, file) {
        // 2回目の呼び出しなどで失敗する場合 — 無視
        eprintln!("logger init 失敗 (無視): {}", e);
    } else {
        log::info!("ImageCreator backend 起動 v{}", env!("CARGO_PKG_VERSION"));
    }
}

/// ランタイムログファイルを書き込み用に開く
/// プロセス起動時に stdout/stderr を流し込むのに使う
/// 既存ファイルは末尾追記
pub fn open_runtime_log(data_folder: &std::path::Path, kind: LogKind) -> Result<std::fs::File, String> {
    let dir = runtime_log_dir(data_folder);
    std::fs::create_dir_all(&dir).map_err(|e| format!("ログディレクトリ作成失敗: {}", e))?;
    let path = match kind {
        LogKind::Comfyui => comfyui_log_path(data_folder),
        LogKind::Llama => llama_log_path(data_folder),
        LogKind::App => return Err("App ログはランタイム側では開けません".into()),
    };
    // セッション区切りを書き込む
    {
        use std::io::Write;
        let mut file = std::fs::OpenOptions::new()
            .create(true)
            .append(true)
            .open(&path)
            .map_err(|e| format!("ログファイル open 失敗 ({}): {}", path.display(), e))?;
        // 区切り行の書き込み失敗は致命的ではない (続く stdout/stderr 連携で本体ログは書ける)
        // が、サイレントに失う代わりに warn ログだけ残す。
        if let Err(e) = writeln!(
            file,
            "\n========== {} 起動 {} ==========",
            match kind {
                LogKind::Comfyui => "ComfyUI",
                LogKind::Llama => "llama-server",
                LogKind::App => "",
            },
            chrono::Utc::now().to_rfc3339()
        ) {
            log::warn!("セッション区切りの書き込みに失敗 ({}): {}", path.display(), e);
        }
    }
    std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| format!("ログファイル open 失敗 ({}): {}", path.display(), e))
}

/// 指定種別のログファイルパスを得る
fn resolve_log_path(app: &tauri::AppHandle, kind: LogKind) -> Result<PathBuf, String> {
    match kind {
        LogKind::App => app_log_path(app),
        LogKind::Comfyui | LogKind::Llama => {
            let s = settings::load_settings(app)?;
            let data_folder = s
                .data_folder
                .ok_or_else(|| "データフォルダが設定されていません".to_string())?;
            let data = PathBuf::from(&data_folder);
            Ok(if matches!(kind, LogKind::Comfyui) {
                comfyui_log_path(&data)
            } else {
                llama_log_path(&data)
            })
        }
    }
}

// ---- Tauri コマンド ----

/// ログ tail 読み込み時の上限バイト数 (4MB)
/// 数MB級ログでメモリ展開を避けるため、末尾から最大 4MB だけ読み込む。
/// 1行 平均 200byte と仮定すると 4MB ≒ 2万行であり、DEFAULT_TAIL_LINES (1000) には十分。
const MAX_TAIL_BYTES: u64 = 4 * 1024 * 1024;

#[tauri::command]
pub async fn read_log(
    app: tauri::AppHandle,
    kind: LogKind,
    tail_lines: Option<usize>,
) -> Result<String, String> {
    let path = resolve_log_path(&app, kind)?;
    if !path.exists() {
        return Ok(format!(
            "(ログファイル未生成: {})\n該当プロセスが一度も起動されていない可能性があります。",
            path.display()
        ));
    }

    let tail_n = tail_lines.unwrap_or(DEFAULT_TAIL_LINES);

    // ファイルサイズを取得し、大きすぎる場合は末尾だけ読み込む。
    // ただし呼び出し側が `tail_n == 0` (= 全件要求) を明示している場合は切り詰めず全件返す。
    // (旧 API 契約: tail_n=0 は「制限なし」)
    let metadata = tokio::fs::metadata(&path)
        .await
        .map_err(|e| format!("ログメタデータ取得失敗: {}", e))?;
    let file_size = metadata.len();

    let content = if tail_n > 0 && file_size > MAX_TAIL_BYTES {
        // 末尾 MAX_TAIL_BYTES だけ読み込む。
        // 先頭の不完全行は捨てる (バイト境界で切るので最初の行が中途半端な可能性)。
        use tokio::io::{AsyncReadExt, AsyncSeekExt};
        let mut file = tokio::fs::File::open(&path)
            .await
            .map_err(|e| format!("ログオープン失敗: {}", e))?;
        let offset = file_size - MAX_TAIL_BYTES;
        file.seek(std::io::SeekFrom::Start(offset))
            .await
            .map_err(|e| format!("ログシーク失敗: {}", e))?;
        let mut buf = Vec::with_capacity(MAX_TAIL_BYTES as usize);
        file.read_to_end(&mut buf)
            .await
            .map_err(|e| format!("ログ読み込み失敗: {}", e))?;
        // 不完全行を除外: 最初の改行までを破棄
        let text = String::from_utf8_lossy(&buf).into_owned();
        if let Some(idx) = text.find('\n') {
            format!(
                "(...先頭 {} バイトを省略...)\n{}",
                offset,
                &text[idx + 1..]
            )
        } else {
            text
        }
    } else {
        tokio::fs::read_to_string(&path)
            .await
            .map_err(|e| format!("ログ読み込み失敗: {}", e))?
    };

    if tail_n == 0 {
        return Ok(content);
    }
    let lines: Vec<&str> = content.lines().collect();
    if lines.len() <= tail_n {
        Ok(content)
    } else {
        let start = lines.len() - tail_n;
        let snippet = lines[start..].join("\n");
        Ok(format!("(...先頭 {} 行を省略...)\n{}", start, snippet))
    }
}

#[tauri::command]
pub async fn clear_log(app: tauri::AppHandle, kind: LogKind) -> Result<(), String> {
    let path = resolve_log_path(&app, kind)?;
    if !path.exists() {
        return Ok(());
    }
    tokio::fs::write(&path, b"")
        .await
        .map_err(|e| format!("ログクリア失敗: {}", e))?;
    Ok(())
}

#[tauri::command]
pub async fn log_path(app: tauri::AppHandle, kind: LogKind) -> Result<String, String> {
    Ok(resolve_log_path(&app, kind)?.to_string_lossy().to_string())
}
