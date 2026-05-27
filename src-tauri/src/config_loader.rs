//! リソース設定（runtime.json / registry.json / モデル定義 / ワークフロー）のロード
//!
//! Tauri バンドルされた `resources/` 配下のJSONを読み込んでフロントエンドに返す。
//! dev / prod の両モードで動作するように複数のパス候補を試す。
//! 内部利用向け（Rust 側）には `read_resource_value` を公開する。

use serde_json::Value;
use std::path::PathBuf;
use tauri::Manager;

/// resource_dir 配下のサブパスからファイルを読み込む（文字列）
///
/// Tauri 2.x はバンドル設定 `"resources": ["../resources/**/*"]` のように `..` を含むパターンを使うと、
/// 配布時の物理パスに `_up_` というディレクトリプレフィックスを付与する。
/// たとえばソースの `../resources/models/registry.json` は、本番では:
///   `<install>/_up_/resources/models/registry.json`
/// dev ビルドでは:
///   `<src-tauri>/target/debug/_up_/resources/models/registry.json`
/// に配置される。
///
/// この関数は環境差を吸収するため、以下の候補パスを順に試す:
///   1. `<resource_dir>/_up_/resources/<sub>`  (本番 / dev とも標準的な配置)
///   2. `<resource_dir>/resources/<sub>`        ( "_up_" が剥がされた場合)
///   3. `<resource_dir>/<sub>`                  (resource_dir 直接配下)
///   4. `<resource_dir>/../resources/<sub>`     (1階層上)
///   5. `../resources/<sub>`                    (CWD 相対、最終 fallback)
pub fn read_resource_string(app: &tauri::AppHandle, sub_path: &str) -> Result<String, String> {
    let base = app
        .path()
        .resource_dir()
        .map_err(|e| format!("resource_dir 取得失敗: {}", e))?;

    let candidates: Vec<PathBuf> = vec![
        base.join("_up_").join("resources").join(sub_path),
        base.join("resources").join(sub_path),
        base.join(sub_path),
        base.join("..").join("resources").join(sub_path),
        // 開発時に cargo run で起動した場合の念のためのフォールバック
        PathBuf::from("..").join("resources").join(sub_path),
    ];

    for candidate in &candidates {
        if candidate.exists() {
            return std::fs::read_to_string(candidate).map_err(|e| {
                format!(
                    "リソース読み込み失敗 ({}): {}",
                    candidate.display(),
                    e
                )
            });
        }
    }

    Err(format!(
        "リソースファイルが見つかりません: {} (試行: {})",
        sub_path,
        candidates
            .iter()
            .map(|p| p.display().to_string())
            .collect::<Vec<_>>()
            .join(", ")
    ))
}

/// Rust 内部から JSON Value としてリソースを読み込む（他モジュール向け）
pub fn read_resource_value(app: &tauri::AppHandle, sub_path: &str) -> Result<Value, String> {
    let content = read_resource_string(app, sub_path)?;
    serde_json::from_str(&content).map_err(|e| format!("{} パース失敗: {}", sub_path, e))
}

/// モデル ID からそのモデル定義 (descriptor) を読み込む
/// registry.json を経由して `<id>.json` を解決する
pub fn load_descriptor_by_model_id(
    app: &tauri::AppHandle,
    model_id: &str,
) -> Result<Value, String> {
    let registry = read_resource_value(app, "models/registry.json")?;
    let models = registry
        .get("models")
        .and_then(|m| m.as_array())
        .ok_or_else(|| "registry.json の models 配列が見つかりません".to_string())?;

    let entry = models
        .iter()
        .find(|m| m.get("id").and_then(|v| v.as_str()) == Some(model_id))
        .ok_or_else(|| format!("モデル ID '{}' は registry に存在しません", model_id))?;

    let descriptor_filename = entry
        .get("descriptor")
        .and_then(|v| v.as_str())
        .ok_or_else(|| format!("モデル '{}' の descriptor フィールドがありません", model_id))?;

    read_resource_value(app, &format!("models/{}", descriptor_filename))
}

// ---- Tauri コマンド ----

#[tauri::command]
pub fn load_model_registry(app: tauri::AppHandle) -> Result<Value, String> {
    read_resource_value(&app, "models/registry.json")
}

#[tauri::command]
pub fn load_model_descriptor(
    app: tauri::AppHandle,
    descriptor_filename: String,
) -> Result<Value, String> {
    read_resource_value(&app, &format!("models/{}", descriptor_filename))
}

#[tauri::command]
pub fn load_runtime_config(app: tauri::AppHandle) -> Result<Value, String> {
    read_resource_value(&app, "runtime/runtime.json")
}

#[tauri::command]
pub fn load_workflow_template(
    app: tauri::AppHandle,
    name: String,
) -> Result<Value, String> {
    read_resource_value(&app, &format!("workflows/{}", name))
}
