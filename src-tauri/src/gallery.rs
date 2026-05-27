//! ギャラリーモジュール
//!
//! 生成画像のディスク保存と SQLite による履歴管理を担う。
//! - `db`: SQLite スキーマ・CRUD
//! - `storage`: PNG メタデータ挿入、サムネイル生成、ファイル保存

pub mod db;
pub mod storage;

use crate::settings;
use base64::Engine;
use db::{GalleryDb, GalleryItemRow, InsertImageInput};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::OnceLock;

/// ギャラリー DB のグローバル接続
/// アプリ起動時に setup_hook で初期化する
static GALLERY_DB: OnceLock<GalleryDb> = OnceLock::new();

pub fn init_gallery_db(app: &tauri::AppHandle) -> Result<(), String> {
    let db = GalleryDb::new(app)?;
    GALLERY_DB
        .set(db)
        .map_err(|_| "GalleryDb の二重初期化".to_string())
}

fn gallery_db() -> Result<&'static GalleryDb, String> {
    GALLERY_DB
        .get()
        .ok_or_else(|| "GalleryDb 未初期化".to_string())
}

/// フロント向けに整形した一覧アイテム
/// サムネイルは base64 で同梱（256px JPEG なので軽量）
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItemDto {
    pub id: i64,
    pub created_at: String,
    pub file_path: String,
    pub model_id: String,
    pub positive_prompt: String,
    pub width: i32,
    pub height: i32,
    pub seed: i64,
    pub is_favorite: bool,
    pub thumbnail_base64: String,
    pub thumbnail_mime_type: String,
}

/// 詳細表示用 DTO
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItemDetailDto {
    #[serde(flatten)]
    pub row: GalleryItemRow,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageData {
    pub data_base64: String,
    pub mime_type: String,
}

/// 共通: ファイルを base64 で読み出す
async fn read_file_base64(path: &str) -> Result<(String, String), String> {
    let bytes = tokio::fs::read(path)
        .await
        .map_err(|e| format!("ファイル読み込み失敗 ({}): {}", path, e))?;
    Ok((
        base64::engine::general_purpose::STANDARD.encode(&bytes),
        detect_image_mime(path).to_string(),
    ))
}

/// 拡張子から画像 MIME タイプを推定する。
/// 大文字拡張子 (.JPG) も小文字化して比較するため大小無視。
/// generate.rs からも参照するため pub(crate)。
///
/// `_` 分岐は「画像コンテキストから呼ばれている前提のフォールバック」として
/// `image/png` を返す (ComfyUI 出力・サムネ・フル画像は全て画像のため安全)。
pub(crate) fn detect_image_mime(path: &str) -> &'static str {
    let ext = std::path::Path::new(path)
        .extension()
        .and_then(|os| os.to_str())
        .map(|s| s.to_ascii_lowercase())
        .unwrap_or_default();
    match ext.as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/png",
    }
}

/// 生成画像をギャラリーに保存する
/// ComfyUI が返した PNG バイト列にメタデータを埋め込み、サムネイルを作り、DB に登録
pub async fn save_to_gallery(
    app: &tauri::AppHandle,
    png_bytes: &[u8],
    metadata: &GalleryMetadata,
    index: usize,
) -> Result<i64, String> {
    let settings = settings::load_settings(app)?;
    let data_folder = settings
        .data_folder
        .ok_or_else(|| "データフォルダが設定されていません".to_string())?;
    let data_folder = PathBuf::from(&data_folder);

    // PNG に tEXt メタデータを埋め込む
    let chunks = build_metadata_chunks(metadata);
    let png_with_metadata = storage::insert_png_text_chunks(png_bytes, &chunks)?;

    // サムネイル生成
    let thumb_jpeg = storage::generate_thumbnail_jpeg(&png_with_metadata)?;

    // 保存
    let filename = storage::build_image_filename(&metadata.model_id, metadata.seed, index);
    let (full_path, thumb_path) =
        storage::persist_to_disk(&data_folder, &filename, &png_with_metadata, &thumb_jpeg).await?;

    // DB 登録
    let input = InsertImageInput {
        file_path: full_path.to_string_lossy().to_string(),
        thumb_path: thumb_path.to_string_lossy().to_string(),
        model_id: metadata.model_id.clone(),
        workflow_template: Some(metadata.workflow_template.clone()),
        positive_prompt: metadata.positive_prompt.clone(),
        negative_prompt: Some(metadata.negative_prompt.clone()),
        width: metadata.width as i32,
        height: metadata.height as i32,
        steps: metadata.steps as i32,
        cfg: metadata.cfg,
        sampler: metadata.sampler.clone(),
        scheduler: metadata.scheduler.clone(),
        seed: metadata.seed,
        japanese_prompt: metadata.japanese_prompt.clone(),
        comfyui_filename: metadata.comfyui_filename.clone(),
    };

    // 同期 SQLite を tokio ランタイム上でブロックしないよう spawn_blocking で実行
    db_call(move |db| db.insert(input)).await
}

/// generate.rs から渡される保存用メタデータ
#[derive(Debug, Clone)]
pub struct GalleryMetadata {
    pub model_id: String,
    pub workflow_template: String,
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: i64,
    pub japanese_prompt: Option<String>,
    pub comfyui_filename: Option<String>,
}

fn build_metadata_chunks(meta: &GalleryMetadata) -> Vec<(String, String)> {
    let mut chunks = vec![
        (
            "imagecreator:version".to_string(),
            env!("CARGO_PKG_VERSION").to_string(),
        ),
        ("imagecreator:model_id".to_string(), meta.model_id.clone()),
        (
            "imagecreator:workflow".to_string(),
            meta.workflow_template.clone(),
        ),
        (
            "imagecreator:positive_prompt".to_string(),
            meta.positive_prompt.clone(),
        ),
        (
            "imagecreator:negative_prompt".to_string(),
            meta.negative_prompt.clone(),
        ),
        ("imagecreator:width".to_string(), meta.width.to_string()),
        ("imagecreator:height".to_string(), meta.height.to_string()),
        ("imagecreator:steps".to_string(), meta.steps.to_string()),
        ("imagecreator:cfg".to_string(), meta.cfg.to_string()),
        ("imagecreator:sampler".to_string(), meta.sampler.clone()),
        (
            "imagecreator:scheduler".to_string(),
            meta.scheduler.clone(),
        ),
        ("imagecreator:seed".to_string(), meta.seed.to_string()),
        (
            "imagecreator:created_at".to_string(),
            chrono::Utc::now().to_rfc3339(),
        ),
    ];
    if let Some(ja) = &meta.japanese_prompt {
        if !ja.is_empty() {
            chunks.push(("imagecreator:japanese_prompt".to_string(), ja.clone()));
        }
    }
    chunks
}

// ---- Tauri コマンド ----

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListGalleryArgs {
    pub limit: i64,
    pub offset: i64,
    pub favorites_only: bool,
}

/// rusqlite は同期 API なので、Tauri の async コマンドハンドラ内で直接呼ぶと
/// tokio ランタイムスレッドを長時間ブロックする恐れがある。
/// すべての DB アクセスを `spawn_blocking` 経由に統一して安全化する。
async fn db_call<F, T>(f: F) -> Result<T, String>
where
    F: FnOnce(&'static GalleryDb) -> Result<T, String> + Send + 'static,
    T: Send + 'static,
{
    let db = gallery_db()?;
    tokio::task::spawn_blocking(move || f(db))
        .await
        .map_err(|e| format!("DB タスクがパニック: {}", e))?
}

#[tauri::command]
pub async fn gallery_list(args: ListGalleryArgs) -> Result<Vec<GalleryItemDto>, String> {
    let rows = db_call(move |db| db.list(args.limit, args.offset, args.favorites_only)).await?;

    let mut items = Vec::with_capacity(rows.len());
    for row in rows {
        // サムネイル base64
        let (thumb_b64, thumb_mime) = match read_file_base64(&row.thumb_path).await {
            Ok(v) => v,
            Err(e) => {
                log::warn!("サムネイル読み込み失敗 (id={}): {}", row.id, e);
                (String::new(), "image/jpeg".to_string())
            }
        };
        items.push(GalleryItemDto {
            id: row.id,
            created_at: row.created_at,
            file_path: row.file_path,
            model_id: row.model_id,
            positive_prompt: row.positive_prompt,
            width: row.width,
            height: row.height,
            seed: row.seed,
            is_favorite: row.is_favorite,
            thumbnail_base64: thumb_b64,
            thumbnail_mime_type: thumb_mime,
        });
    }
    Ok(items)
}

#[tauri::command]
pub async fn gallery_count(favorites_only: bool) -> Result<i64, String> {
    db_call(move |db| db.count(favorites_only)).await
}

#[tauri::command]
pub async fn gallery_get_detail(id: i64) -> Result<GalleryItemDetailDto, String> {
    let row = db_call(move |db| db.get(id)).await?
        .ok_or_else(|| format!("ID {} のアイテムが見つかりません", id))?;
    Ok(GalleryItemDetailDto { row })
}

#[tauri::command]
pub async fn gallery_get_full_image(id: i64) -> Result<ImageData, String> {
    let row = db_call(move |db| db.get(id)).await?
        .ok_or_else(|| format!("ID {} のアイテムが見つかりません", id))?;
    let (b64, mime) = read_file_base64(&row.file_path).await?;
    Ok(ImageData {
        data_base64: b64,
        mime_type: mime,
    })
}

#[tauri::command]
pub async fn gallery_toggle_favorite(id: i64) -> Result<bool, String> {
    db_call(move |db| db.toggle_favorite(id)).await
}

#[tauri::command]
pub async fn gallery_delete(id: i64) -> Result<(), String> {
    db_call(move |db| db.delete(id)).await
}

/// ギャラリー画像を任意のパスにコピー保存する
/// 既存ファイル（gallery/full/ 配下、PNG メタデータ埋込み済み）をユーザー指定パスへ複製
#[tauri::command]
pub async fn gallery_save_as(id: i64, target_path: String) -> Result<(), String> {
    let row = db_call(move |db| db.get(id)).await?
        .ok_or_else(|| format!("ID {} のアイテムが見つかりません", id))?;

    if let Some(parent) = std::path::Path::new(&target_path).parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("親ディレクトリ作成失敗 ({}): {}", parent.display(), e))?;
    }

    tokio::fs::copy(&row.file_path, &target_path)
        .await
        .map_err(|e| format!("ファイルコピー失敗: {}", e))?;

    log::info!("画像保存: {} → {}", row.file_path, target_path);
    Ok(())
}
