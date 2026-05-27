//! ファイルシステム関連ユーティリティ
//!
//! - 指定パスのディスク空き容量取得
//! - パスの妥当性チェック

use fs4::available_space;
use serde::Serialize;
use std::path::{Path, PathBuf};

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiskSpaceInfo {
    /// チェック対象のパス
    pub path: String,
    /// 空き容量（バイト）
    pub available_bytes: u64,
    /// 空き容量（GB、表示用）
    pub available_gb: f64,
    /// 必要量を満たすか
    pub meets_requirement: bool,
    /// 補足メッセージ
    pub message: String,
}

/// 指定パスの空き容量を取得する
/// パスが存在しない場合は親ディレクトリを遡って最も近い存在パスをチェック
fn resolve_existing_ancestor(path: &Path) -> Option<PathBuf> {
    let mut current = Some(path.to_path_buf());
    while let Some(p) = current {
        if p.exists() {
            return Some(p);
        }
        current = p.parent().map(|p| p.to_path_buf());
    }
    None
}

const GB: u64 = 1024 * 1024 * 1024;

/// 空き容量チェック
/// `required_gb` はギガバイト単位の必要容量
pub fn check_disk_space_impl(path_str: &str, required_gb: u64) -> Result<DiskSpaceInfo, String> {
    let target = PathBuf::from(path_str);
    let check_path = resolve_existing_ancestor(&target)
        .ok_or_else(|| format!("有効な親ディレクトリが見つかりません: {}", path_str))?;

    let available = available_space(&check_path)
        .map_err(|e| format!("空き容量の取得に失敗 ({}): {}", check_path.display(), e))?;

    let required = required_gb * GB;
    let meets = available >= required;
    let available_gb = available as f64 / GB as f64;

    let message = if meets {
        format!(
            "空き容量 {:.1} GB（必要量 {} GB を満たします）",
            available_gb, required_gb
        )
    } else {
        format!(
            "空き容量 {:.1} GB（必要量 {} GB を満たしません）。別のドライブを選択してください。",
            available_gb, required_gb
        )
    };

    Ok(DiskSpaceInfo {
        path: path_str.to_string(),
        available_bytes: available,
        available_gb,
        meets_requirement: meets,
        message,
    })
}

/// 指定パスが書き込み可能かを試す
/// テンポラリファイルを作成→削除で判定
pub fn check_writable_impl(path_str: &str) -> Result<bool, String> {
    let target = PathBuf::from(path_str);

    // ディレクトリが無ければ作成
    if !target.exists() {
        std::fs::create_dir_all(&target)
            .map_err(|e| format!("ディレクトリ作成に失敗 ({}): {}", target.display(), e))?;
    }

    let test_file = target.join(".imagecreator_write_test");
    let result = std::fs::write(&test_file, b"test")
        .and_then(|_| std::fs::remove_file(&test_file))
        .is_ok();

    Ok(result)
}

// ---- Tauri コマンド ----

#[tauri::command]
pub fn check_disk_space(path: String, required_gb: u64) -> Result<DiskSpaceInfo, String> {
    check_disk_space_impl(&path, required_gb)
}

#[tauri::command]
pub fn check_writable(path: String) -> Result<bool, String> {
    check_writable_impl(&path)
}

/// 既定のデータフォルダ候補を返す
/// %LOCALAPPDATA%\ImageCreator\data を既定とする
#[tauri::command]
pub fn suggest_default_data_folder(app: tauri::AppHandle) -> Result<String, String> {
    use tauri::Manager;
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("ローカルデータディレクトリの取得に失敗: {}", e))?;
    Ok(dir.join("data").to_string_lossy().to_string())
}

/// ファイル／ディレクトリの存在チェック
/// Phase 9 で Turbo LoRA の有無判定に使用
#[tauri::command]
pub async fn path_exists(path: String) -> bool {
    tokio::fs::try_exists(&path).await.unwrap_or(false)
}
