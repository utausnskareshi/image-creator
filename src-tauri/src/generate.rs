//! 画像生成コマンド
//!
//! フローの統合:
//!  1. モデル descriptor を読み込みファイル名を解決
//!  2. ワークフローテンプレートを読み込みパラメータを置換
//!  3. ComfyUI に prompt を投入
//!  4. 完了を待ち画像を取得
//!  5. PNG にメタデータを埋め込みディスク保存 + DB 登録（ギャラリー）
//!  6. base64 化してフロントへ返す

use crate::comfyui::client::ComfyUIClient;
use crate::comfyui::manager::{COMFYUI_HOST, COMFYUI_PORT};
use crate::comfyui::workflow::{build_workflow, WorkflowParams};
use crate::config_loader;
use crate::gallery::{self, GalleryMetadata};
use base64::Engine;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageRequest {
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: i64,
    pub model_id: String,
    pub workflow_template: String,
    /// ギャラリー記録用の日本語入力（オプション）
    #[serde(default)]
    pub japanese_prompt: Option<String>,
    /// LoRA ファイル名（Turbo LoRA 使用時）
    #[serde(default)]
    pub lora_file: Option<String>,
    /// LoRA 強度
    #[serde(default)]
    pub lora_strength: Option<f64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GeneratedImageData {
    pub filename: String,
    pub subfolder: String,
    pub kind: String,
    pub data_base64: String,
    pub mime_type: String,
    /// ギャラリーDBに登録された行のID（保存に失敗した場合は None）
    pub gallery_id: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateImageResponse {
    pub prompt_id: String,
    pub images: Vec<GeneratedImageData>,
}

/// モデル descriptor の files 配列から特定の role を持つファイル名を取り出す
fn pick_filename_by_role(descriptor: &serde_json::Value, role: &str) -> Result<String, String> {
    let files = descriptor
        .get("files")
        .and_then(|f| f.as_array())
        .ok_or_else(|| "descriptor の files 配列が見つかりません".to_string())?;

    let entry = files
        .iter()
        .find(|f| f.get("role").and_then(|v| v.as_str()) == Some(role))
        .ok_or_else(|| format!("role '{}' のファイル定義が見つかりません", role))?;

    entry
        .get("filename")
        .and_then(|v| v.as_str())
        .map(|s| s.to_string())
        .ok_or_else(|| format!("role '{}' に filename がありません", role))
}

#[tauri::command]
pub async fn generate_image(
    app: tauri::AppHandle,
    request: GenerateImageRequest,
) -> Result<GenerateImageResponse, String> {
    // 1. モデル descriptor 読み込み
    let descriptor = config_loader::load_descriptor_by_model_id(&app, &request.model_id)?;

    let model_file = pick_filename_by_role(&descriptor, "diffusion_model")?;
    let text_encoder_file = pick_filename_by_role(&descriptor, "text_encoder")?;
    let vae_file = pick_filename_by_role(&descriptor, "vae")?;

    // 2. ワークフローテンプレート読み込み＆置換
    let template = config_loader::read_resource_value(
        &app,
        &format!("workflows/{}", request.workflow_template),
    )?;

    let params = WorkflowParams {
        positive_prompt: request.positive_prompt.clone(),
        negative_prompt: request.negative_prompt.clone(),
        width: request.width,
        height: request.height,
        steps: request.steps,
        cfg: request.cfg,
        sampler: request.sampler.clone(),
        scheduler: request.scheduler.clone(),
        seed: request.seed,
        model_file,
        text_encoder_file,
        vae_file,
        lora_file: request.lora_file.clone(),
        lora_strength: request.lora_strength,
    };

    let workflow = build_workflow(template, &params)?;

    // 3. ComfyUI に投入
    let client = ComfyUIClient::new(COMFYUI_HOST, COMFYUI_PORT);
    if !client.ping().await {
        return Err(format!(
            "ComfyUI が応答しません (http://{}:{})。先に「ComfyUI 起動」を行ってください。",
            COMFYUI_HOST, COMFYUI_PORT
        ));
    }

    let prompt_id = client.submit_prompt(workflow).await?;

    // 4. 完了待ち
    let images = client.wait_for_completion(&prompt_id, 600).await?;

    // 5. ファイル保存 + DB 登録 + base64 化
    let mut result_images = Vec::with_capacity(images.len());
    for (idx, img) in images.into_iter().enumerate() {
        let bytes = client
            .fetch_image(&img.filename, &img.subfolder, &img.kind)
            .await?;

        // ギャラリー保存（失敗しても base64 は返す）
        let gallery_meta = GalleryMetadata {
            model_id: request.model_id.clone(),
            workflow_template: request.workflow_template.clone(),
            positive_prompt: request.positive_prompt.clone(),
            negative_prompt: request.negative_prompt.clone(),
            width: request.width,
            height: request.height,
            steps: request.steps,
            cfg: request.cfg,
            sampler: request.sampler.clone(),
            scheduler: request.scheduler.clone(),
            seed: request.seed,
            japanese_prompt: request.japanese_prompt.clone(),
            comfyui_filename: Some(img.filename.clone()),
        };

        let gallery_id = match gallery::save_to_gallery(&app, &bytes, &gallery_meta, idx).await {
            Ok(id) => Some(id),
            Err(e) => {
                log::warn!("ギャラリー保存失敗 (idx={}): {}", idx, e);
                None
            }
        };

        // gallery 側と判定ロジックを揃える (大文字拡張子・クエリ付き末尾の差異対応)
        let mime_type = gallery::detect_image_mime(&img.filename);

        result_images.push(GeneratedImageData {
            filename: img.filename,
            subfolder: img.subfolder,
            kind: img.kind,
            data_base64: base64::engine::general_purpose::STANDARD.encode(&bytes),
            mime_type: mime_type.to_string(),
            gallery_id,
        });
    }

    Ok(GenerateImageResponse {
        prompt_id,
        images: result_images,
    })
}
