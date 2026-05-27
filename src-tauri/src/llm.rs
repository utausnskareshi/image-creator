//! 日本語→英語プロンプト変換用 LLM 連携モジュール
//!
//! - `manager`: llama-server プロセス管理（zip展開・起動・停止・状態）
//! - `client`: OpenAI 互換 API クライアント
//! - `translator`: 日本語プロンプト → 英語タグへの変換 + キャッシュ
//!
//! ポート 8189 を localhost でリッスンする（ComfyUI 8188 と衝突しないよう+1）

pub mod client;
pub mod manager;
pub mod translator;

use crate::app_state::AppState;
use manager::LlmServerStatus;
use std::path::PathBuf;
use translator::{TranslateRequest, TranslateResponse};

// ---- Tauri コマンドラッパー ----

#[tauri::command]
pub async fn llm_setup(app: tauri::AppHandle, data_folder: String) -> Result<(), String> {
    manager::setup_llm_server(app, PathBuf::from(&data_folder)).await
}

#[tauri::command]
pub async fn llm_start(
    state: tauri::State<'_, AppState>,
    data_folder: String,
) -> Result<(), String> {
    manager::start_llm_server(&state, PathBuf::from(&data_folder)).await
}

#[tauri::command]
pub async fn llm_stop(state: tauri::State<'_, AppState>) -> Result<(), String> {
    manager::stop_llm_server(&state).await
}

#[tauri::command]
pub async fn llm_status(
    state: tauri::State<'_, AppState>,
    data_folder: String,
) -> Result<LlmServerStatus, String> {
    Ok(manager::llm_server_status(&state, PathBuf::from(&data_folder)).await)
}

#[tauri::command]
pub async fn translate_prompt(
    app: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
    request: TranslateRequest,
) -> Result<TranslateResponse, String> {
    translator::translate_prompt_impl(&app, &state, request).await
}

#[tauri::command]
pub async fn clear_translation_cache(state: tauri::State<'_, AppState>) -> Result<usize, String> {
    let mut cache = state.translation_cache.lock().await;
    let count = cache.map.len();
    cache.map.clear();
    cache.order.clear();
    Ok(count)
}
