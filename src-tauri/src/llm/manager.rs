//! llama-server プロセス管理
//!
//! - セットアップ: zip 展開（llama-server.exe を取り出す）
//! - 起動: CPU実行（--n-gpu-layers 0）。VRAM を消費しない設定
//! - 停止: kill
//! - 状態: 抽出済み・モデル存在・プロセス・API応答

use crate::app_state::AppState;
use crate::archive::extract_async;
use crate::logs::{open_runtime_log, LogKind};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::process::Command;

/// llama-server リッスンポート
pub const LLM_PORT: u16 = 8189;
/// llama-server バインドホスト
pub const LLM_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LlmServerStatus {
    pub extracted: bool,
    pub model_present: bool,
    pub process_running: bool,
    pub api_reachable: bool,
    pub port: u16,
    pub server_path: Option<String>,
    pub model_path: Option<String>,
}

fn llm_root(data_folder: &Path) -> PathBuf {
    data_folder.join("runtime").join("llama-server")
}

fn llm_model_path(data_folder: &Path) -> PathBuf {
    data_folder
        .join("models")
        .join("llm")
        .join("qwen2.5-3b-instruct-q4_k_m.gguf")
}

/// llama-server.exe を探す
/// 1. <root>/llama-server.exe
/// 2. <root>/<subdir>/llama-server.exe（1階層下まで）
async fn find_llama_server_exe(root: &Path) -> Option<PathBuf> {
    let direct = root.join("llama-server.exe");
    if tokio::fs::try_exists(&direct).await.unwrap_or(false) {
        return Some(direct);
    }
    let mut entries = match tokio::fs::read_dir(root).await {
        Ok(e) => e,
        Err(_) => return None,
    };
    while let Ok(Some(entry)) = entries.next_entry().await {
        let path = entry.path();
        if tokio::fs::metadata(&path)
            .await
            .map(|m| m.is_dir())
            .unwrap_or(false)
        {
            let candidate = path.join("llama-server.exe");
            if tokio::fs::try_exists(&candidate).await.unwrap_or(false) {
                return Some(candidate);
            }
        }
    }
    None
}

pub async fn is_extracted(data_folder: &Path) -> bool {
    find_llama_server_exe(&llm_root(data_folder)).await.is_some()
}

/// セットアップ: zip 展開
pub async fn setup_llm_server(
    app: tauri::AppHandle,
    data_folder: PathBuf,
) -> Result<(), String> {
    if is_extracted(&data_folder).await {
        log::info!("llama-server は既に展開済みです");
        return Ok(());
    }

    let archive_path = data_folder
        .join("downloads")
        .join("llama-cpu-windows.zip");
    if !archive_path.exists() {
        return Err(format!(
            "llama.cpp アーカイブが見つかりません: {} (Phase 3 でダウンロード済みか確認してください)",
            archive_path.display()
        ));
    }

    let runtime_dir = llm_root(&data_folder);
    tokio::fs::create_dir_all(&runtime_dir)
        .await
        .map_err(|e| format!("llama-server 展開先作成失敗: {}", e))?;

    log::info!("llama-server 展開開始: {}", archive_path.display());
    extract_async(app, "llama-server".to_string(), &archive_path, &runtime_dir).await?;

    if !is_extracted(&data_folder).await {
        return Err(
            "展開完了したが llama-server.exe が見つかりません。アーカイブの構造を確認してください。"
                .to_string(),
        );
    }
    Ok(())
}

async fn ping_llm_server(port: u16) -> bool {
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    // llama.cpp server は /health に応答する
    let url = format!("http://{}:{}/health", LLM_HOST, port);
    matches!(client.get(&url).send().await, Ok(r) if r.status().is_success())
}

async fn wait_for_api_ready(port: u16, timeout_secs: u64) -> Result<(), String> {
    let start = Instant::now();
    loop {
        if ping_llm_server(port).await {
            return Ok(());
        }
        if start.elapsed().as_secs() > timeout_secs {
            return Err(format!(
                "llama-server API 応答待ちタイムアウト ({}秒)",
                timeout_secs
            ));
        }
        tokio::time::sleep(Duration::from_millis(750)).await;
    }
}

pub async fn start_llm_server(
    state: &AppState,
    data_folder: PathBuf,
) -> Result<(), String> {
    // 起動中チェック
    {
        let mut handle = state.llama_handle.lock().await;
        if let Some(child) = handle.as_mut() {
            match child.try_wait() {
                Ok(None) => {
                    log::info!("llama-server は既に起動中です");
                    return Ok(());
                }
                _ => {
                    *handle = None;
                }
            }
        }
    }

    let exe = find_llama_server_exe(&llm_root(&data_folder))
        .await
        .ok_or_else(|| {
            "llama-server.exe が見つかりません。先にセットアップを実行してください。".to_string()
        })?;

    let model = llm_model_path(&data_folder);
    if !model.exists() {
        return Err(format!(
            "LLM モデルが見つかりません: {}",
            model.display()
        ));
    }

    // stdout / stderr をログファイルにキャプチャ
    let stdout_file = open_runtime_log(&data_folder, LogKind::Llama).map_err(|e| {
        log::warn!("llama-server ログファイル open 失敗 (起動継続): {}", e);
        e
    });
    let stderr_file = stdout_file
        .as_ref()
        .ok()
        .and_then(|f| f.try_clone().ok());

    let mut cmd = Command::new(&exe);
    cmd.args([
        "-m",
        model.to_string_lossy().as_ref(),
        "--host",
        LLM_HOST,
        "--port",
        &LLM_PORT.to_string(),
        "-c",
        "2048", // context window
        "-ngl",
        "0", // GPU layers: 0 (CPU only, VRAM 消費ゼロ)
        "-t",
        "4", // CPU スレッド数
    ])
    .kill_on_drop(true);

    match (stdout_file, stderr_file) {
        (Ok(out), Some(err)) => {
            cmd.stdout(std::process::Stdio::from(out))
                .stderr(std::process::Stdio::from(err));
        }
        _ => {
            cmd.stdout(std::process::Stdio::null())
                .stderr(std::process::Stdio::null());
        }
    }

    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    log::info!("llama-server 起動: {} -m {}", exe.display(), model.display());
    let child = cmd
        .spawn()
        .map_err(|e| format!("llama-server 起動失敗: {}", e))?;

    {
        let mut handle = state.llama_handle.lock().await;
        *handle = Some(child);
    }

    // モデルロード含めて最大 90 秒待機
    wait_for_api_ready(LLM_PORT, 90).await?;

    log::info!("llama-server 起動完了");
    Ok(())
}

pub async fn stop_llm_server(state: &AppState) -> Result<(), String> {
    let mut handle = state.llama_handle.lock().await;
    if let Some(mut child) = handle.take() {
        if let Err(e) = child.kill().await {
            log::warn!("llama-server kill 失敗 (既に終了している可能性): {}", e);
        }
        log::info!("llama-server 停止");
        Ok(())
    } else {
        Err("llama-server は起動していません".into())
    }
}

pub async fn llm_server_status(state: &AppState, data_folder: PathBuf) -> LlmServerStatus {
    let server_path = find_llama_server_exe(&llm_root(&data_folder)).await;
    let extracted = server_path.is_some();

    let model_path = llm_model_path(&data_folder);
    let model_present = tokio::fs::try_exists(&model_path).await.unwrap_or(false);

    let process_running = {
        let mut handle = state.llama_handle.lock().await;
        if let Some(child) = handle.as_mut() {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    };

    let api_reachable = ping_llm_server(LLM_PORT).await;

    LlmServerStatus {
        extracted,
        model_present,
        process_running,
        api_reachable,
        port: LLM_PORT,
        server_path: server_path.map(|p| p.to_string_lossy().to_string()),
        model_path: if model_present {
            Some(model_path.to_string_lossy().to_string())
        } else {
            None
        },
    }
}
