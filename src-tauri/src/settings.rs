//! ユーザー設定の永続化
//!
//! 設定は `%LOCALAPPDATA%\ImageCreator\settings.json` に保存される。
//! Tauri の `path().app_local_data_dir()` を利用して OS 依存パスを抽象化している。

use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use tauri::Manager;

/// アプリ設定の本体
/// 拡張時はフィールド追加のみで後方互換を保つ（Default + #[serde(default)]）
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    /// 初回セットアップ完了フラグ
    #[serde(default)]
    pub setup_completed: bool,

    /// ユーザー選択のデータフォルダ（モデル・ランタイム格納先）
    /// 未設定の場合は None
    #[serde(default)]
    pub data_folder: Option<String>,

    /// 既定モデル ID（registry.json と対応）
    #[serde(default = "default_model_id")]
    pub selected_model_id: String,

    /// UI 言語
    #[serde(default = "default_locale")]
    pub locale: String,

    /// Anima 非商用ライセンスの同意フラグ
    #[serde(default)]
    pub license_accepted: bool,

    /// 最後に起動したアプリバージョン（マイグレーション判定用）
    #[serde(default)]
    pub last_used_version: String,
}

fn default_model_id() -> String {
    "anima".to_string()
}

fn default_locale() -> String {
    "ja".to_string()
}

impl Default for Settings {
    fn default() -> Self {
        Self {
            setup_completed: false,
            data_folder: None,
            selected_model_id: default_model_id(),
            locale: default_locale(),
            license_accepted: false,
            last_used_version: String::new(),
        }
    }
}

/// 設定ファイルのフルパスを取得する
fn settings_path(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_local_data_dir()
        .map_err(|e| format!("ローカルデータディレクトリの取得に失敗: {}", e))?;
    Ok(dir.join("settings.json"))
}

/// 設定をロードする
/// ファイルが存在しない場合は Default を返す（初回起動）
pub fn load_settings(app: &tauri::AppHandle) -> Result<Settings, String> {
    let path = settings_path(app)?;

    if !path.exists() {
        return Ok(Settings::default());
    }

    let content = std::fs::read_to_string(&path)
        .map_err(|e| format!("設定ファイルの読み込みに失敗 ({}): {}", path.display(), e))?;

    // パースエラー時は Default を返す。
    // ただし元ファイルは `.broken-<unix_ts>` にリネームしてからバックアップする。
    // こうしないと次回 save_settings がそのまま上書きしてユーザーの編集履歴が完全に失われる。
    let settings: Settings = match serde_json::from_str(&content) {
        Ok(s) => s,
        Err(e) => {
            log::warn!(
                "設定ファイルのパースに失敗、既定値を使用します: {} ({})",
                e,
                path.display()
            );
            // 破損ファイルを退避（タイムスタンプ付きで上書きを防ぐ）
            let ts = chrono::Utc::now().timestamp();
            let backup_path = path.with_extension(format!("broken-{}.json", ts));
            if let Err(rename_err) = std::fs::rename(&path, &backup_path) {
                log::warn!(
                    "破損した設定ファイルの退避に失敗 ({} → {}): {}",
                    path.display(),
                    backup_path.display(),
                    rename_err
                );
            } else {
                log::info!(
                    "破損した設定ファイルを退避しました: {}",
                    backup_path.display()
                );
            }
            Settings::default()
        }
    };

    Ok(settings)
}

/// 設定を保存する
/// 親ディレクトリが無ければ作成する
///
/// 副作用: data_folder が設定されている場合、`.uninstall_info` ファイルにパスを記録する。
/// このファイルは NSIS アンインストーラがデータフォルダ削除確認時に読み出す。
pub fn save_settings(app: &tauri::AppHandle, settings: &Settings) -> Result<(), String> {
    let path = settings_path(app)?;

    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent).map_err(|e| {
            format!(
                "設定ディレクトリの作成に失敗 ({}): {}",
                parent.display(),
                e
            )
        })?;
    }

    let content = serde_json::to_string_pretty(settings)
        .map_err(|e| format!("設定のJSONシリアライズに失敗: {}", e))?;

    std::fs::write(&path, content)
        .map_err(|e| format!("設定ファイルの書き込みに失敗 ({}): {}", path.display(), e))?;

    // アンインストーラ向けにデータフォルダパスを二重化して記録する。
    //
    // 経緯: 5版テストで `.uninstall_info` を %LOCALAPPDATA%\ImageCreator に
    //   置く方式が動かなかった (test5 12.91GB が連動削除されなかった)。
    //   - 「Delete application data」チェックボックスにより `.uninstall_info`
    //     自体が消えてしまう順序関係や、NSIS 側の読み込み失敗の切り分けが困難。
    //   - そこでファイル + Windows レジストリの 2 経路で持たせ、NSIS は両方を
    //     試して読めた方を使う設計にする。
    //
    // 1. %LOCALAPPDATA%\ImageCreator\.uninstall_info (従来通り、UTF-8 プレーンテキスト)
    // 2. HKCU\Software\ImageCreator\DataFolder (Windows のみ)
    if let Some(data_folder) = &settings.data_folder {
        // 経路1: ファイル
        if let Some(parent) = path.parent() {
            let hint_path = parent.join(".uninstall_info");
            if let Err(e) = std::fs::write(&hint_path, data_folder.as_bytes()) {
                log::warn!(
                    "アンインストール情報ファイルの書き込みに失敗 ({}): {}",
                    hint_path.display(),
                    e
                );
            }
        }

        // 経路2: Windows レジストリ (Windows ビルド時のみ有効)
        #[cfg(windows)]
        {
            use winreg::enums::*;
            use winreg::RegKey;
            let hkcu = RegKey::predef(HKEY_CURRENT_USER);
            match hkcu.create_subkey("Software\\ImageCreator") {
                Ok((key, _)) => {
                    if let Err(e) = key.set_value("DataFolder", data_folder) {
                        log::warn!(
                            "レジストリ HKCU\\Software\\ImageCreator\\DataFolder への書き込みに失敗: {}",
                            e
                        );
                    }
                }
                Err(e) => {
                    log::warn!("レジストリキー作成に失敗: {}", e);
                }
            }
        }
    }

    Ok(())
}

// ---- Tauri コマンド ----

#[tauri::command]
pub fn get_settings(app: tauri::AppHandle) -> Result<Settings, String> {
    load_settings(&app)
}

#[tauri::command]
pub fn save_settings_cmd(app: tauri::AppHandle, settings: Settings) -> Result<(), String> {
    save_settings(&app, &settings)
}

#[tauri::command]
pub fn get_settings_path(app: tauri::AppHandle) -> Result<String, String> {
    settings_path(&app).map(|p| p.to_string_lossy().to_string())
}
