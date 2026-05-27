//! llama-server OpenAI 互換 API クライアント
//!
//! llama.cpp server は OpenAI Chat Completions 互換のエンドポイントを提供する。
//! 使用エンドポイント: POST /v1/chat/completions

use serde::{Deserialize, Serialize};
use std::time::Duration;

pub struct LlmClient {
    base_url: String,
    client: reqwest::Client,
}

#[derive(Debug, Clone, Serialize)]
pub struct ChatMessage {
    pub role: String,
    pub content: String,
}

#[derive(Debug, Serialize)]
struct ChatRequest {
    messages: Vec<ChatMessage>,
    temperature: f32,
    max_tokens: u32,
    stream: bool,
}

#[derive(Debug, Deserialize)]
struct ChatResponse {
    choices: Vec<ChatChoice>,
}

#[derive(Debug, Deserialize)]
struct ChatChoice {
    message: ChatMessageResponse,
}

#[derive(Debug, Deserialize)]
struct ChatMessageResponse {
    content: String,
}

impl LlmClient {
    /// クライアントを構築する。
    /// 注: .timeout() (リクエスト全体) を設定すると、初回モデルロード後の推論や
    /// 長文プロンプトで時間がかかる際に途中で打ち切られ "error decoding response body"
    /// などのエラーになる。接続確立のみ 30 秒で打ち切り、応答ボディは時間制限なしとする。
    /// reqwest ビルダーが失敗した場合は既定値の Client にフォールバックし、Tauri ハンドラからの
    /// パニックでランタイムを落とすのを防ぐ。
    pub fn new(host: &str, port: u16) -> Self {
        let client = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(30))
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
        }
    }

    /// chat completion を実行し、最初の choice の content を返す
    pub async fn chat_completion(
        &self,
        messages: Vec<ChatMessage>,
        temperature: f32,
        max_tokens: u32,
    ) -> Result<String, String> {
        let req = ChatRequest {
            messages,
            temperature,
            max_tokens,
            stream: false,
        };
        let url = format!("{}/v1/chat/completions", self.base_url);
        let resp = self
            .client
            .post(&url)
            .json(&req)
            .send()
            .await
            .map_err(|e| format!("chat completion リクエスト失敗: {}", e))?;

        let status = resp.status();
        let body_text = resp
            .text()
            .await
            .map_err(|e| format!("レスポンス取得失敗: {}", e))?;

        if !status.is_success() {
            return Err(format!("LLM サーバーエラー ({}): {}", status, body_text));
        }

        let parsed: ChatResponse = serde_json::from_str(&body_text).map_err(|e| {
            format!("レスポンス JSON パース失敗: {} (body={})", e, body_text)
        })?;

        parsed
            .choices
            .into_iter()
            .next()
            .map(|c| c.message.content)
            .ok_or_else(|| "LLM レスポンスに choices がありません".to_string())
    }
}
