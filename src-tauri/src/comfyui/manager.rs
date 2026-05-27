//! ComfyUI セットアップとプロセス制御
//!
//! - セットアップ: ダウンロード済み .7z を展開し、extra_model_paths.yaml を書き出す
//! - 起動: python_embeded\python.exe で main.py をAPIモード起動
//! - 停止: 子プロセスを kill
//! - 状態: 子プロセスハンドル + HTTPヘルスチェック

use crate::app_state::AppState;
use crate::archive::extract_async;
use crate::logs::{open_runtime_log, LogKind};
use serde::Serialize;
use std::path::{Path, PathBuf};
use std::time::{Duration, Instant};
use tokio::process::Command;

/// 既定の ComfyUI ポート
pub const COMFYUI_PORT: u16 = 8188;
/// ComfyUI 既定の listen ホスト
pub const COMFYUI_HOST: &str = "127.0.0.1";

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ComfyUIStatus {
    pub extracted: bool,
    pub process_running: bool,
    pub api_reachable: bool,
    pub port: u16,
    pub root_path: Option<String>,
}

/// 抽出済み ComfyUI のルート（…\runtime\ComfyUI_windows_portable）
fn comfyui_root(data_folder: &Path) -> PathBuf {
    data_folder.join("runtime").join("ComfyUI_windows_portable")
}

fn comfyui_python(data_folder: &Path) -> PathBuf {
    comfyui_root(data_folder)
        .join("python_embeded")
        .join("python.exe")
}

fn comfyui_main_py(data_folder: &Path) -> PathBuf {
    comfyui_root(data_folder).join("ComfyUI").join("main.py")
}

fn extra_model_paths_yaml(data_folder: &Path) -> PathBuf {
    comfyui_root(data_folder)
        .join("ComfyUI")
        .join("extra_model_paths.yaml")
}

/// 任意の文字列を YAML のダブルクォート文字列として安全にエスケープする
/// `"` と `\` をエスケープし、改行・タブを `\n` `\t` に変換する。
/// データフォルダのパスに特殊文字が混ざっても YAML パーサが誤解釈しないようにする防御策。
fn yaml_quote(s: &str) -> String {
    let mut out = String::with_capacity(s.len() + 2);
    out.push('"');
    for ch in s.chars() {
        match ch {
            '"' => out.push_str("\\\""),
            '\\' => out.push_str("\\\\"),
            '\n' => out.push_str("\\n"),
            '\r' => out.push_str("\\r"),
            '\t' => out.push_str("\\t"),
            _ => out.push(ch),
        }
    }
    out.push('"');
    out
}

/// 既に展開済みかチェック
pub async fn is_extracted(data_folder: &Path) -> bool {
    tokio::fs::try_exists(comfyui_main_py(data_folder))
        .await
        .unwrap_or(false)
}

/// extra_model_paths.yaml を書き出す
/// `<data>/models/anima/` 配下の各サブディレクトリを ComfyUI に認識させる
async fn write_extra_model_paths_yaml(data_folder: &Path) -> Result<(), String> {
    let yaml_path = extra_model_paths_yaml(data_folder);

    // YAML 仕様上、パスは forward slash の方が安全
    let data_folder_str = data_folder.to_string_lossy().replace('\\', "/");

    // YAML として安全に埋め込むためにダブルクォート + バックスラッシュエスケープ。
    // データフォルダのパスに `:` (Windows ドライブ文字)、`#` (コメント記号)、空白等が
    // 含まれてもパーサが誤解釈しないよう、すべての値をクォート文字列にする。
    let q_anima = yaml_quote(&format!("{}/models/anima", data_folder_str));
    let q_models = yaml_quote(&format!("{}/models", data_folder_str));

    let yaml = format!(
        "# ImageCreator により自動生成された extra_model_paths.yaml\n\
         # ComfyUI に <data>/models/<model_id>/<subdir>/ を参照させる\n\
         \n\
         imagecreator:\n  \
           base_path: {anima}\n  \
           diffusion_models: diffusion_models/\n  \
           text_encoders: text_encoders/\n  \
           vae: vae/\n  \
           loras: loras/\n\
         \n\
         imagecreator_extras:\n  \
           base_path: {models}\n  \
           loras: extras/loras/\n",
        anima = q_anima,
        models = q_models,
    );

    if let Some(parent) = yaml_path.parent() {
        tokio::fs::create_dir_all(parent)
            .await
            .map_err(|e| format!("ディレクトリ作成失敗: {}", e))?;
    }
    tokio::fs::write(&yaml_path, yaml)
        .await
        .map_err(|e| format!("extra_model_paths.yaml 書き込み失敗: {}", e))?;
    log::info!("extra_model_paths.yaml を書き出しました: {}", yaml_path.display());
    Ok(())
}

/// セットアップ: 7z 展開 + extra_model_paths.yaml 生成
/// 既に展開済みの場合は YAML の更新のみ行う（冪等）
pub async fn setup_comfyui(app: tauri::AppHandle, data_folder: PathBuf) -> Result<(), String> {
    if !is_extracted(&data_folder).await {
        let archive_path = data_folder
            .join("downloads")
            .join("ComfyUI_windows_portable_nvidia.7z");
        if !archive_path.exists() {
            return Err(format!(
                "ComfyUI アーカイブが見つかりません: {} (Phase 3 でダウンロード済みか確認してください)",
                archive_path.display()
            ));
        }
        let runtime_dir = data_folder.join("runtime");
        tokio::fs::create_dir_all(&runtime_dir)
            .await
            .map_err(|e| format!("runtime ディレクトリ作成失敗: {}", e))?;

        log::info!("ComfyUI 展開開始: {}", archive_path.display());
        extract_async(app, "comfyui".to_string(), &archive_path, &runtime_dir).await?;

        if !is_extracted(&data_folder).await {
            return Err(format!(
                "展開完了したが {} が見つかりません。アーカイブ構造を確認してください。",
                comfyui_main_py(&data_folder).display()
            ));
        }
    } else {
        log::info!("ComfyUI は既に展開済みです: {}", comfyui_root(&data_folder).display());
    }

    write_extra_model_paths_yaml(&data_folder).await?;
    Ok(())
}

/// ComfyUI が API 応答可能かチェック
async fn ping_comfyui(port: u16) -> bool {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(2))
        .build()
        .ok();
    let Some(client) = client else { return false };
    let url = format!("http://{}:{}/system_stats", COMFYUI_HOST, port);
    matches!(client.get(&url).send().await, Ok(r) if r.status().is_success())
}

/// 起動後 API 応答するまで待機
async fn wait_for_api_ready(port: u16, timeout_secs: u64) -> Result<(), String> {
    let start = Instant::now();
    loop {
        if ping_comfyui(port).await {
            return Ok(());
        }
        if start.elapsed().as_secs() > timeout_secs {
            return Err(format!("ComfyUI API 応答待ちタイムアウト ({}秒)", timeout_secs));
        }
        tokio::time::sleep(Duration::from_millis(750)).await;
    }
}

/// ComfyUI を起動する
/// すでに起動中（プロセスハンドルが有効）なら何もしない
pub async fn start_comfyui(state: &AppState, data_folder: PathBuf) -> Result<(), String> {
    // すでに起動中かチェック
    {
        let mut handle = state.comfyui_handle.lock().await;
        if let Some(child) = handle.as_mut() {
            // 子プロセスが生存しているか確認
            match child.try_wait() {
                Ok(None) => {
                    log::info!("ComfyUI は既に起動中です");
                    return Ok(());
                }
                _ => {
                    *handle = None; // 死んでいたらクリア
                }
            }
        }
    }

    let python = comfyui_python(&data_folder);
    let main_py = comfyui_main_py(&data_folder);
    let comfyui_dir = comfyui_root(&data_folder);

    if !python.exists() {
        return Err(format!("python.exe が見つかりません: {}", python.display()));
    }
    if !main_py.exists() {
        return Err(format!("ComfyUI main.py が見つかりません: {}", main_py.display()));
    }

    // stdout / stderr をログファイルにキャプチャ
    let stdout_file = open_runtime_log(&data_folder, LogKind::Comfyui).map_err(|e| {
        log::warn!("ComfyUI ログファイル open 失敗 (起動継続): {}", e);
        e
    });
    let stderr_file = stdout_file
        .as_ref()
        .ok()
        .and_then(|f| f.try_clone().ok());

    let mut cmd = Command::new(&python);
    cmd.arg("-s")
        .arg(&main_py)
        .args([
            "--listen",
            COMFYUI_HOST,
            "--port",
            &COMFYUI_PORT.to_string(),
            "--disable-auto-launch",
        ])
        .current_dir(&comfyui_dir)
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

    // Windows でコンソールウィンドウを非表示
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    log::info!("ComfyUI を起動: {} {}", python.display(), main_py.display());
    let child = cmd
        .spawn()
        .map_err(|e| format!("ComfyUI 起動失敗: {}", e))?;

    {
        let mut handle = state.comfyui_handle.lock().await;
        *handle = Some(child);
    }

    // API が応答するまで最大 120 秒待機（初回起動はモデルロードで時間がかかる）
    wait_for_api_ready(COMFYUI_PORT, 120).await?;

    log::info!("ComfyUI 起動完了");
    Ok(())
}

/// ComfyUI を停止する
pub async fn stop_comfyui(state: &AppState) -> Result<(), String> {
    let mut handle = state.comfyui_handle.lock().await;
    if let Some(mut child) = handle.take() {
        if let Err(e) = child.kill().await {
            log::warn!("ComfyUI kill 失敗 (既に終了している可能性): {}", e);
        }
        log::info!("ComfyUI 停止");
        Ok(())
    } else {
        Err("ComfyUI は起動していません".into())
    }
}

/// ステータス取得
pub async fn comfyui_status(state: &AppState, data_folder: PathBuf) -> ComfyUIStatus {
    let extracted = is_extracted(&data_folder).await;

    let process_running = {
        let mut handle = state.comfyui_handle.lock().await;
        if let Some(child) = handle.as_mut() {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    };

    let api_reachable = ping_comfyui(COMFYUI_PORT).await;

    ComfyUIStatus {
        extracted,
        process_running,
        api_reachable,
        port: COMFYUI_PORT,
        root_path: if extracted {
            Some(comfyui_root(&data_folder).to_string_lossy().to_string())
        } else {
            None
        },
    }
}
