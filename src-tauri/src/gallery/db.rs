//! ギャラリー SQLite データベース層
//!
//! - DB 配置: `%LOCALAPPDATA%\ImageCreator\gallery.db`
//! - スキーマ: 単一テーブル `images`
//! - 起動時に自動マイグレーション（CREATE TABLE IF NOT EXISTS）

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GalleryItemRow {
    pub id: i64,
    pub created_at: String,
    pub file_path: String,
    pub thumb_path: String,
    pub model_id: String,
    pub workflow_template: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub width: i32,
    pub height: i32,
    pub steps: i32,
    pub cfg: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: i64,
    pub japanese_prompt: Option<String>,
    pub is_favorite: bool,
    pub comfyui_filename: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct InsertImageInput {
    pub file_path: String,
    pub thumb_path: String,
    pub model_id: String,
    pub workflow_template: Option<String>,
    pub positive_prompt: String,
    pub negative_prompt: Option<String>,
    pub width: i32,
    pub height: i32,
    pub steps: i32,
    pub cfg: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: i64,
    pub japanese_prompt: Option<String>,
    pub comfyui_filename: Option<String>,
}

/// 接続を保持するシングルトン
/// AppState に置く案もあるが、Gallery 専用なのでモジュール内に持つ
pub struct GalleryDb {
    conn: Mutex<Connection>,
}

impl GalleryDb {
    pub fn new(app: &tauri::AppHandle) -> Result<Self, String> {
        let db_path = db_path(app)?;
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("DBディレクトリ作成失敗: {}", e))?;
        }
        let conn = Connection::open(&db_path)
            .map_err(|e| format!("SQLite open 失敗 ({}): {}", db_path.display(), e))?;
        initialize_schema(&conn)?;
        Ok(Self {
            conn: Mutex::new(conn),
        })
    }

    pub fn insert(&self, input: InsertImageInput) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let created_at = chrono::Utc::now().to_rfc3339();
        conn.execute(
            "INSERT INTO images (
                created_at, file_path, thumb_path, model_id, workflow_template,
                positive_prompt, negative_prompt, width, height, steps,
                cfg, sampler, scheduler, seed, japanese_prompt, is_favorite, comfyui_filename
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15, 0, ?16)",
            params![
                created_at,
                input.file_path,
                input.thumb_path,
                input.model_id,
                input.workflow_template,
                input.positive_prompt,
                input.negative_prompt,
                input.width,
                input.height,
                input.steps,
                input.cfg,
                input.sampler,
                input.scheduler,
                input.seed,
                input.japanese_prompt,
                input.comfyui_filename,
            ],
        )
        .map_err(|e| format!("INSERT 失敗: {}", e))?;
        Ok(conn.last_insert_rowid())
    }

    pub fn list(
        &self,
        limit: i64,
        offset: i64,
        favorites_only: bool,
    ) -> Result<Vec<GalleryItemRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = if favorites_only {
            "SELECT id, created_at, file_path, thumb_path, model_id, workflow_template,
                    positive_prompt, negative_prompt, width, height, steps, cfg,
                    sampler, scheduler, seed, japanese_prompt, is_favorite, comfyui_filename
             FROM images WHERE is_favorite = 1
             ORDER BY datetime(created_at) DESC LIMIT ?1 OFFSET ?2"
        } else {
            "SELECT id, created_at, file_path, thumb_path, model_id, workflow_template,
                    positive_prompt, negative_prompt, width, height, steps, cfg,
                    sampler, scheduler, seed, japanese_prompt, is_favorite, comfyui_filename
             FROM images
             ORDER BY datetime(created_at) DESC LIMIT ?1 OFFSET ?2"
        };
        let mut stmt = conn
            .prepare(sql)
            .map_err(|e| format!("SELECT prepare 失敗: {}", e))?;
        let rows = stmt
            .query_map(params![limit, offset], row_to_item)
            .map_err(|e| format!("query_map 失敗: {}", e))?;

        let mut items = Vec::new();
        for r in rows {
            items.push(r.map_err(|e| format!("行取得失敗: {}", e))?);
        }
        Ok(items)
    }

    pub fn count(&self, favorites_only: bool) -> Result<i64, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = if favorites_only {
            "SELECT COUNT(*) FROM images WHERE is_favorite = 1"
        } else {
            "SELECT COUNT(*) FROM images"
        };
        let count: i64 = conn
            .query_row(sql, [], |r| r.get(0))
            .map_err(|e| format!("COUNT 失敗: {}", e))?;
        Ok(count)
    }

    pub fn get(&self, id: i64) -> Result<Option<GalleryItemRow>, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        let sql = "SELECT id, created_at, file_path, thumb_path, model_id, workflow_template,
                          positive_prompt, negative_prompt, width, height, steps, cfg,
                          sampler, scheduler, seed, japanese_prompt, is_favorite, comfyui_filename
                   FROM images WHERE id = ?1";
        let result = conn
            .query_row(sql, params![id], row_to_item)
            .optional()
            .map_err(|e| format!("SELECT by id 失敗: {}", e))?;
        Ok(result)
    }

    pub fn toggle_favorite(&self, id: i64) -> Result<bool, String> {
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        // UPDATE と SELECT を別ステートメントで分けると、複数クライアントから連打された
        // ときに新値の取得値が誤る可能性がある。SQLite 3.35+ の RETURNING 句で
        // 単一ステートメントにまとめてアトミック化する。
        // (rusqlite を `bundled` で使っているため SQLite 本体はバンドル済みの 3.4x+)
        let new_value: i64 = conn
            .query_row(
                "UPDATE images SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END \
                 WHERE id = ?1 RETURNING is_favorite",
                params![id],
                |r| r.get(0),
            )
            .map_err(|e| format!("UPDATE favorite 失敗: {}", e))?;
        Ok(new_value == 1)
    }

    /// DB 行と関連ファイル（フル画像・サムネイル）を削除
    /// ファイル削除失敗は警告にとどめ、DB 削除は続行する
    pub fn delete(&self, id: i64) -> Result<(), String> {
        let row = self.get(id)?;
        if let Some(row) = row {
            // ファイル削除（失敗してもDB削除は続行）
            if let Err(e) = std::fs::remove_file(&row.file_path) {
                log::warn!("フル画像削除失敗 ({}): {}", row.file_path, e);
            }
            if let Err(e) = std::fs::remove_file(&row.thumb_path) {
                log::warn!("サムネイル削除失敗 ({}): {}", row.thumb_path, e);
            }
        }
        let conn = self.conn.lock().map_err(|e| e.to_string())?;
        conn.execute("DELETE FROM images WHERE id = ?1", params![id])
            .map_err(|e| format!("DELETE 失敗: {}", e))?;
        Ok(())
    }
}

fn row_to_item(row: &rusqlite::Row) -> rusqlite::Result<GalleryItemRow> {
    let is_favorite_int: i64 = row.get("is_favorite")?;
    Ok(GalleryItemRow {
        id: row.get("id")?,
        created_at: row.get("created_at")?,
        file_path: row.get("file_path")?,
        thumb_path: row.get("thumb_path")?,
        model_id: row.get("model_id")?,
        workflow_template: row.get("workflow_template")?,
        positive_prompt: row.get("positive_prompt")?,
        negative_prompt: row.get("negative_prompt")?,
        width: row.get("width")?,
        height: row.get("height")?,
        steps: row.get("steps")?,
        cfg: row.get("cfg")?,
        sampler: row.get("sampler")?,
        scheduler: row.get("scheduler")?,
        seed: row.get("seed")?,
        japanese_prompt: row.get("japanese_prompt")?,
        is_favorite: is_favorite_int != 0,
        comfyui_filename: row.get("comfyui_filename")?,
    })
}

fn db_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("local data dir 取得失敗: {}", e))?;
    Ok(dir.join("gallery.db"))
}

fn initialize_schema(conn: &Connection) -> Result<(), String> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS images (
            id                INTEGER PRIMARY KEY AUTOINCREMENT,
            created_at        TEXT    NOT NULL,
            file_path         TEXT    NOT NULL,
            thumb_path        TEXT    NOT NULL,
            model_id          TEXT    NOT NULL,
            workflow_template TEXT,
            positive_prompt   TEXT    NOT NULL,
            negative_prompt   TEXT,
            width             INTEGER NOT NULL,
            height            INTEGER NOT NULL,
            steps             INTEGER NOT NULL,
            cfg               REAL    NOT NULL,
            sampler           TEXT    NOT NULL,
            scheduler         TEXT    NOT NULL,
            seed              INTEGER NOT NULL,
            japanese_prompt   TEXT,
            is_favorite       INTEGER NOT NULL DEFAULT 0,
            comfyui_filename  TEXT
        );

        CREATE INDEX IF NOT EXISTS idx_images_created_at ON images(created_at DESC);
        CREATE INDEX IF NOT EXISTS idx_images_favorite   ON images(is_favorite);
        ",
    )
    .map_err(|e| format!("スキーマ初期化失敗: {}", e))?;
    Ok(())
}
