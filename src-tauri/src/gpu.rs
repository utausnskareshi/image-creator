//! GPU 検出
//!
//! `nvidia-smi` を呼び出してGPU情報を取得する。
//! nvidia-smi が見つからない／非NVIDIA環境では `available = false` を返す。

use serde::Serialize;
use tokio::process::Command;

/// 推奨 VRAM のしきい値 (MB)。Anima などの SDXL ファインチューンを 1024² で生成するには
/// 8GB VRAM が現実的な下限。実機 NVIDIA カードは 8192MB と表示せず 8188MB 等になるため、
/// 切り捨て分を考慮して 8000MB をしきい値に置いている。
const MIN_RECOMMENDED_VRAM_MB: u64 = 8000;

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GpuInfo {
    /// nvidia-smi がインストールされていて実行可能か
    pub available: bool,
    /// GPU 名（例: "NVIDIA GeForce RTX 4060 Laptop GPU"）
    pub name: Option<String>,
    /// ドライババージョン
    pub driver_version: Option<String>,
    /// VRAM 総量（MB）
    pub vram_total_mb: Option<u64>,
    /// VRAM 空き（MB）
    pub vram_free_mb: Option<u64>,
    /// 検出時のメッセージ（成功時もユーザー向け補足を入れる）
    pub message: String,
    /// 推奨VRAMを満たすか（Phase 2 では 8GB を判定基準とする）
    pub meets_recommended_vram: bool,
}

impl GpuInfo {
    fn unavailable(message: impl Into<String>) -> Self {
        Self {
            available: false,
            name: None,
            driver_version: None,
            vram_total_mb: None,
            vram_free_mb: None,
            message: message.into(),
            meets_recommended_vram: false,
        }
    }
}

/// nvidia-smi を呼び出して結果を解析する
async fn run_nvidia_smi() -> Result<String, String> {
    // CSV出力で必要項目のみ取得（単位なし）
    let mut cmd = Command::new("nvidia-smi");
    cmd.args([
        "--query-gpu=name,driver_version,memory.total,memory.free",
        "--format=csv,noheader,nounits",
    ]);

    // Windowsでコンソールウィンドウを表示しない
    // tokio::process::Command は creation_flags を組込メソッドとして提供するため
    // 別途 CommandExt トレイトの import は不要
    #[cfg(windows)]
    {
        const CREATE_NO_WINDOW: u32 = 0x08000000;
        cmd.creation_flags(CREATE_NO_WINDOW);
    }

    let output = cmd
        .output()
        .await
        .map_err(|e| format!("nvidia-smi の実行に失敗: {}", e))?;

    if !output.status.success() {
        let stderr = String::from_utf8_lossy(&output.stderr);
        return Err(format!(
            "nvidia-smi がエラー終了しました ({}): {}",
            output.status, stderr
        ));
    }

    let stdout = String::from_utf8_lossy(&output.stdout).to_string();
    Ok(stdout)
}

/// CSV 一行をパースして GpuInfo を構築
fn parse_nvidia_smi_line(line: &str) -> Option<GpuInfo> {
    let parts: Vec<&str> = line.split(',').map(|s| s.trim()).collect();
    if parts.len() < 4 {
        return None;
    }

    let name = parts[0].to_string();
    let driver_version = parts[1].to_string();
    let vram_total_mb = parts[2].parse::<u64>().ok()?;
    let vram_free_mb = parts[3].parse::<u64>().ok()?;

    let meets_recommended_vram = vram_total_mb >= MIN_RECOMMENDED_VRAM_MB;

    let message = if meets_recommended_vram {
        format!(
            "{}（VRAM {:.1} GB）を検出しました。推奨環境を満たしています。",
            name,
            vram_total_mb as f64 / 1024.0
        )
    } else {
        format!(
            "{}（VRAM {:.1} GB）を検出しましたが、推奨は 8GB 以上です。低解像度モードでの利用を推奨します。",
            name,
            vram_total_mb as f64 / 1024.0
        )
    };

    Some(GpuInfo {
        available: true,
        name: Some(name),
        driver_version: Some(driver_version),
        vram_total_mb: Some(vram_total_mb),
        vram_free_mb: Some(vram_free_mb),
        message,
        meets_recommended_vram,
    })
}

/// GPU 情報を取得する（非同期）
pub async fn detect_gpu_async() -> GpuInfo {
    match run_nvidia_smi().await {
        Ok(output) => {
            let first_line = output.lines().next().unwrap_or("");
            match parse_nvidia_smi_line(first_line) {
                Some(info) => info,
                None => GpuInfo::unavailable(format!(
                    "nvidia-smi の出力をパースできませんでした: {}",
                    first_line
                )),
            }
        }
        Err(e) => GpuInfo::unavailable(format!(
            "NVIDIA GPU を検出できませんでした。ドライバ未インストールの可能性があります。詳細: {}",
            e
        )),
    }
}

// ---- Tauri コマンド ----

#[tauri::command]
pub async fn detect_gpu() -> GpuInfo {
    detect_gpu_async().await
}
