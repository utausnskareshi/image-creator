//! ImageCreator Tauri バックエンド
//!
//! モジュール一覧:
//! - app_state    : 共有ステート（プロセスハンドル）
//! - settings     : ユーザー設定 JSON I/O
//! - gpu          : NVIDIA GPU 検出
//! - fs_utils     : ディスク空き容量・書き込み可否
//! - downloader   : HTTP ファイルダウンロード + SHA256
//! - archive      : 7z / zip 展開
//! - config_loader: registry / model descriptor / runtime / workflow のロード
//! - comfyui      : ComfyUI セットアップ・起動・クライアント・ワークフロー
//! - llm          : llama-server 制御 + プロンプト変換
//! - gallery      : 生成画像の永続化（SQLite + PNGメタデータ + サムネイル）
//! - generate     : 画像生成統合コマンド

mod app_state;
mod archive;
mod comfyui;
mod config_loader;
mod downloader;
mod fs_utils;
mod gallery;
mod generate;
mod gpu;
mod llm;
mod logs;
mod settings;

use app_state::AppState;

/// 疎通確認用コマンド
#[tauri::command]
fn ping() -> String {
    format!(
        "ImageCreator backend OK (v{})",
        env!("CARGO_PKG_VERSION")
    )
}

/// Tauri アプリのエントリポイント
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        // 共有ステート（プロセスハンドル）
        .manage(AppState::new())
        // ロガー＆ギャラリー DB の初期化（setup フックでアプリハンドルを取得）
        .setup(|app| {
            // ロガーは他の初期化より先に
            // 注: app.handle() は既に &AppHandle を返すため二重借用しない
            logs::init_app_logger(app.handle());
            if let Err(e) = gallery::init_gallery_db(app.handle()) {
                log::error!("Gallery DB 初期化失敗: {}", e);
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            ping,
            // settings
            settings::get_settings,
            settings::save_settings_cmd,
            settings::get_settings_path,
            // gpu
            gpu::detect_gpu,
            // fs_utils
            fs_utils::check_disk_space,
            fs_utils::check_writable,
            fs_utils::suggest_default_data_folder,
            // downloader
            downloader::download_files,
            downloader::compute_file_sha256,
            // config_loader
            config_loader::load_model_registry,
            config_loader::load_model_descriptor,
            config_loader::load_runtime_config,
            config_loader::load_workflow_template,
            // comfyui
            comfyui::comfyui_setup,
            comfyui::comfyui_start,
            comfyui::comfyui_stop,
            comfyui::comfyui_status,
            comfyui::comfyui_interrupt,
            // llm
            llm::llm_setup,
            llm::llm_start,
            llm::llm_stop,
            llm::llm_status,
            llm::translate_prompt,
            llm::clear_translation_cache,
            // gallery
            gallery::gallery_list,
            gallery::gallery_count,
            gallery::gallery_get_detail,
            gallery::gallery_get_full_image,
            gallery::gallery_toggle_favorite,
            gallery::gallery_delete,
            gallery::gallery_save_as,
            // logs
            logs::read_log,
            logs::clear_log,
            logs::log_path,
            // fs - file existence check
            fs_utils::path_exists,
            // generate
            generate::generate_image,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
