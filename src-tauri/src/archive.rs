//! アーカイブ展開モジュール
//!
//! - 7z (ComfyUI portable)
//! - zip (llama.cpp release)
//!
//! 進捗は Tauri イベント `extract:progress` で発火する。

use serde::Serialize;
use std::path::{Path, PathBuf};
use tauri::Emitter;

pub const EVENT_EXTRACT_PROGRESS: &str = "extract:progress";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ExtractProgress {
    pub archive_id: String,
    pub current_entry: String,
    pub entries_done: u64,
    pub entries_total: Option<u64>,
    pub completed: bool,
    pub message: Option<String>,
}

fn emit_progress(app: &tauri::AppHandle, payload: ExtractProgress) {
    if let Err(e) = app.emit(EVENT_EXTRACT_PROGRESS, &payload) {
        log::warn!("展開進捗イベント発火失敗: {}", e);
    }
}

/// 7z アーカイブを展開する
///
/// sevenz-rust2 は同期API（spawn_blocking でラップ）。進捗は最後にまとめて発火する。
/// 大量ファイルがある場合は別途エントリ単位の発火も可能だが、まず動作することを優先。
pub async fn extract_7z_async(
    app: tauri::AppHandle,
    archive_id: String,
    src: PathBuf,
    dest: PathBuf,
) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("アーカイブが見つかりません: {}", src.display()));
    }
    tokio::fs::create_dir_all(&dest)
        .await
        .map_err(|e| format!("展開先ディレクトリ作成失敗: {}", e))?;

    let archive_id_clone = archive_id.clone();
    let src_clone = src.clone();
    let dest_clone = dest.clone();

    // sevenz-rust2 は同期APIなので spawn_blocking 内で実行
    // 展開結果は () で意味を持たないため bind しない
    tokio::task::spawn_blocking(move || {
        sevenz_rust2::decompress_file(&src_clone, &dest_clone)
            .map_err(|e| format!("7z 展開失敗 ({}): {}", src_clone.display(), e))
    })
    .await
    .map_err(|e| format!("展開タスクがパニック: {}", e))??;

    emit_progress(
        &app,
        ExtractProgress {
            archive_id: archive_id_clone,
            current_entry: src
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            entries_done: 0,
            entries_total: None,
            completed: true,
            message: Some("7z 展開完了".into()),
        },
    );

    Ok(())
}

/// zip アーカイブを展開する
///
/// `zip` クレートを使ったエントリ単位の展開。
/// 簡単な進捗（処理済みファイル数）を発火する。
pub async fn extract_zip_async(
    app: tauri::AppHandle,
    archive_id: String,
    src: PathBuf,
    dest: PathBuf,
) -> Result<(), String> {
    if !src.exists() {
        return Err(format!("アーカイブが見つかりません: {}", src.display()));
    }
    tokio::fs::create_dir_all(&dest)
        .await
        .map_err(|e| format!("展開先ディレクトリ作成失敗: {}", e))?;

    let archive_id_clone = archive_id.clone();
    let src_clone = src.clone();
    let dest_clone = dest.clone();
    let app_clone = app.clone();

    tokio::task::spawn_blocking(move || -> Result<(), String> {
        let file = std::fs::File::open(&src_clone)
            .map_err(|e| format!("zip を開けません: {}", e))?;
        let mut archive = zip::ZipArchive::new(file)
            .map_err(|e| format!("zip パース失敗: {}", e))?;

        // ループ前に総件数を確定（ループ内では archive を mut で借りるため）
        let total = archive.len();

        for i in 0..total {
            let mut entry = archive
                .by_index(i)
                .map_err(|e| format!("entry {} 読込失敗: {}", i, e))?;
            let outpath = match entry.enclosed_name() {
                Some(p) => dest_clone.join(p),
                None => continue,
            };

            // 進捗イベントに使う情報を entry が live なうちに取得
            let entry_name = entry.name().to_string();
            let is_last = i + 1 == total;
            let should_emit = i % 10 == 0 || is_last;

            if entry.is_dir() {
                std::fs::create_dir_all(&outpath)
                    .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;
            } else {
                if let Some(parent) = outpath.parent() {
                    std::fs::create_dir_all(parent)
                        .map_err(|e| format!("親ディレクトリ作成失敗: {}", e))?;
                }
                let mut outfile = std::fs::File::create(&outpath)
                    .map_err(|e| format!("ファイル作成失敗 ({}): {}", outpath.display(), e))?;
                std::io::copy(&mut entry, &mut outfile)
                    .map_err(|e| format!("ファイル展開失敗 ({}): {}", outpath.display(), e))?;
            }

            // entry のスコープを抜けてから emit（archive を再度借りられる）
            drop(entry);

            if should_emit {
                emit_progress(
                    &app_clone,
                    ExtractProgress {
                        archive_id: archive_id_clone.clone(),
                        current_entry: entry_name,
                        entries_done: (i + 1) as u64,
                        entries_total: Some(total as u64),
                        completed: is_last,
                        message: None,
                    },
                );
            }
        }
        Ok(())
    })
    .await
    .map_err(|e| format!("展開タスクがパニック: {}", e))??;

    emit_progress(
        &app,
        ExtractProgress {
            archive_id,
            current_entry: src
                .file_name()
                .map(|n| n.to_string_lossy().to_string())
                .unwrap_or_default(),
            entries_done: 0,
            entries_total: None,
            completed: true,
            message: Some("zip 展開完了".into()),
        },
    );

    Ok(())
}

/// 拡張子で判別して展開する
pub async fn extract_async(
    app: tauri::AppHandle,
    archive_id: String,
    src: &Path,
    dest: &Path,
) -> Result<(), String> {
    let ext = src
        .extension()
        .and_then(|e| e.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();

    match ext.as_str() {
        "7z" => extract_7z_async(app, archive_id, src.to_path_buf(), dest.to_path_buf()).await,
        "zip" => extract_zip_async(app, archive_id, src.to_path_buf(), dest.to_path_buf()).await,
        other => Err(format!("未対応の拡張子: .{}", other)),
    }
}
