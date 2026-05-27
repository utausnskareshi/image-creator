//! ComfyUI 連携モジュール
//!
//! - `manager`: プロセス起動・停止・セットアップ（7z展開、extra_model_paths.yaml）
//! - `workflow`: ワークフローテンプレートのプレースホルダ置換
//! - `client`: ComfyUI HTTP API クライアント
//!
//! ポート 8188（ComfyUI 既定）を localhost でリッスンする前提。

pub mod client;
pub mod manager;
pub mod workflow;

use crate::app_state::AppState;
use manager::ComfyUIStatus;
use std::path::PathBuf;

// ---- Tauri コマンドラッパー ----

#[tauri::command]
pub async fn comfyui_setup(
    app: tauri::AppHandle,
    data_folder: String,
) -> Result<(), String> {
    manager::setup_comfyui(app, PathBuf::from(&data_folder)).await
}

#[tauri::command]
pub async fn comfyui_start(
    state: tauri::State<'_, AppState>,
    data_folder: String,
) -> Result<(), String> {
    manager::start_comfyui(&state, PathBuf::from(&data_folder)).await
}

#[tauri::command]
pub async fn comfyui_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    manager::stop_comfyui(&state).await
}

#[tauri::command]
pub async fn comfyui_status(
    state: tauri::State<'_, AppState>,
    data_folder: String,
) -> Result<ComfyUIStatus, String> {
    Ok(manager::comfyui_status(&state, PathBuf::from(&data_folder)).await)
}

/// 実行中の生成をキャンセルする（ComfyUI `/interrupt`）
/// フロントから fetch すると CORS で弾かれるため Rust 経由で送信
#[tauri::command]
pub async fn comfyui_interrupt() -> Result<(), String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(5))
        .build()
        .map_err(|e| format!("HTTPクライアント構築失敗: {}", e))?;
    let url = format!(
        "http://{}:{}/interrupt",
        manager::COMFYUI_HOST,
        manager::COMFYUI_PORT
    );
    let resp = client
        .post(&url)
        .send()
        .await
        .map_err(|e| format!("interrupt 送信失敗: {}", e))?;
    if !resp.status().is_success() {
        return Err(format!("interrupt エラー: {}", resp.status()));
    }
    Ok(())
}
