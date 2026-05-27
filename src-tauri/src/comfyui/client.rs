//! ComfyUI HTTP API クライアント
//!
//! 主なエンドポイント:
//! - POST /prompt        : ワークフローを投入
//! - GET  /history/{id}  : 実行結果の取得（ポーリング）
//! - GET  /view          : 生成画像の取得
//! - GET  /system_stats  : ヘルスチェック

use serde::Deserialize;
use serde_json::Value;
use std::time::{Duration, Instant};

/// ComfyUI から取得した生成画像情報
#[derive(Debug, Clone, Deserialize)]
pub struct OutputImage {
    pub filename: String,
    pub subfolder: String,
    /// "output" / "temp" のいずれか
    #[serde(rename = "type")]
    pub kind: String,
}

pub struct ComfyUIClient {
    base_url: String,
    client: reqwest::Client,
    client_id: String,
}

impl ComfyUIClient {
    /// クライアントを構築する。
    /// reqwest のビルダーが失敗した場合は規定値の `Client::new()` にフォールバックし、
    /// Tauri コマンドハンドラからパニックでランタイムスレッドを落とすことを避ける。
    pub fn new(host: &str, port: u16) -> Self {
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .unwrap_or_else(|e| {
                log::warn!(
                    "reqwest client 構築失敗、既定値にフォールバック: {}",
                    e
                );
                reqwest::Client::new()
            });
        Self {
            base_url: format!("http://{}:{}", host, port),
            client,
            client_id: uuid::Uuid::new_v4().to_string(),
        }
    }

    /// ComfyUI が応答するかチェック
    pub async fn ping(&self) -> bool {
        let url = format!("{}/system_stats", self.base_url);
        self.client
            .get(&url)
            .timeout(Duration::from_secs(2))
            .send()
            .await
            .map(|r| r.status().is_success())
            .unwrap_or(false)
    }

    /// ワークフロー JSON を投入し prompt_id を返す
    pub async fn submit_prompt(&self, prompt: Value) -> Result<String, String> {
        let body = serde_json::json!({
            "prompt": prompt,
            "client_id": self.client_id,
        });
        let url = format!("{}/prompt", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("prompt 投入失敗: {}", e))?;

        let status = resp.status();
        let body_text = resp
            .text()
            .await
            .map_err(|e| format!("レスポンス読み込み失敗: {}", e))?;

        if !status.is_success() {
            return Err(format!(
                "ComfyUI prompt エラー ({}): {}",
                status, body_text
            ));
        }

        let value: Value = serde_json::from_str(&body_text)
            .map_err(|e| format!("レスポンスJSONパース失敗: {}", e))?;
        value
            .get("prompt_id")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string())
            .ok_or_else(|| format!("prompt_id がレスポンスに含まれません: {}", value))
    }

    /// 指定 prompt_id の完了を待ち、生成画像情報を返す
    pub async fn wait_for_completion(
        &self,
        prompt_id: &str,
        timeout_secs: u64,
    ) -> Result<Vec<OutputImage>, String> {
        let start = Instant::now();
        let mut poll_interval_ms = 500u64;

        loop {
            if start.elapsed().as_secs() > timeout_secs {
                return Err(format!("生成タイムアウト ({}秒)", timeout_secs));
            }

            let url = format!("{}/history/{}", self.base_url, prompt_id);
            let resp_result = self.client.get(&url).send().await;
            let resp = match resp_result {
                Ok(r) => r,
                Err(e) => {
                    log::debug!("history 取得一時失敗: {}", e);
                    tokio::time::sleep(Duration::from_millis(poll_interval_ms)).await;
                    poll_interval_ms = (poll_interval_ms + 200).min(2000);
                    continue;
                }
            };

            let body: Value = match resp.json().await {
                Ok(v) => v,
                Err(_) => {
                    tokio::time::sleep(Duration::from_millis(poll_interval_ms)).await;
                    continue;
                }
            };

            if let Some(entry) = body.get(prompt_id) {
                // status.completed = true で完了
                let completed = entry
                    .get("status")
                    .and_then(|s| s.get("completed"))
                    .and_then(|v| v.as_bool())
                    .unwrap_or(false);

                if completed {
                    return extract_output_images(entry);
                }

                // ComfyUI のバージョン差異を吸収するため、エラー検出は複数経路で行う。
                // 経路1: status.status_str == "error" (新しい ComfyUI で出力)
                if let Some(status_str) = entry
                    .get("status")
                    .and_then(|s| s.get("status_str"))
                    .and_then(|v| v.as_str())
                {
                    if status_str == "error" {
                        return Err(format!(
                            "ComfyUI 実行エラー (status_str=error): {}",
                            entry
                                .get("status")
                                .map(|s| s.to_string())
                                .unwrap_or_default()
                        ));
                    }
                }

                // 経路2: status.messages[*][0] == "execution_error"
                if let Some(messages) =
                    entry.get("status").and_then(|s| s.get("messages")).and_then(|m| m.as_array())
                {
                    for m in messages {
                        if let Some(typ) = m.get(0).and_then(|v| v.as_str()) {
                            if typ == "execution_error" {
                                return Err(format!("ComfyUI 実行エラー: {}", m));
                            }
                        }
                    }
                }
            }

            tokio::time::sleep(Duration::from_millis(poll_interval_ms)).await;
        }
    }

    /// /view から画像バイト列を取得
    pub async fn fetch_image(
        &self,
        filename: &str,
        subfolder: &str,
        kind: &str,
    ) -> Result<Vec<u8>, String> {
        let url = format!("{}/view", self.base_url);
        // reqwest の query ビルダーは URL エンコードを正しく行う。
        // 自前の urlencoding 関数を持つよりも標準ライブラリに委譲する方が安全。
        let resp = self
            .client
            .get(&url)
            .query(&[
                ("filename", filename),
                ("subfolder", subfolder),
                ("type", kind),
            ])
            .send()
            .await
            .map_err(|e| format!("画像取得失敗: {}", e))?;
        if !resp.status().is_success() {
            return Err(format!("画像取得エラー: {}", resp.status()));
        }
        let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
        Ok(bytes.to_vec())
    }
}

fn extract_output_images(entry: &Value) -> Result<Vec<OutputImage>, String> {
    let outputs = entry
        .get("outputs")
        .and_then(|o| o.as_object())
        .ok_or_else(|| "outputs フィールドが見つかりません".to_string())?;

    // ノード ID 順にソートして決定的な順序を保証する。
    // serde_json::Map は内部的に BTreeMap or LinkedHashMap で順序を維持するが、
    // バッチ生成で複数の SaveImage ノードがある場合に UI の表示順を一致させる目的。
    let mut node_ids: Vec<&String> = outputs.keys().collect();
    node_ids.sort();

    let mut images = Vec::new();
    for node_id in node_ids {
        let output = match outputs.get(node_id) {
            Some(o) => o,
            None => continue,
        };
        if let Some(arr) = output.get("images").and_then(|i| i.as_array()) {
            for img in arr {
                if let Ok(parsed) = serde_json::from_value::<OutputImage>(img.clone()) {
                    images.push(parsed);
                }
            }
        }
    }

    if images.is_empty() {
        return Err("生成画像が見つかりませんでした".into());
    }
    Ok(images)
}

