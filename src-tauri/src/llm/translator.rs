//! 日本語プロンプト → 英語タグ変換
//!
//! フロー:
//! 1. キャッシュチェック（profile + 日本語入力でキー化）
//! 2. システムプロンプト (`resources/prompts/translation_<profile>.txt`) 読み込み
//! 3. LLM 呼び出し (chat completions, temperature=0.3, max_tokens=256)
//! 4. レスポンス整形（改行除去・余計な装飾削除）
//! 5. キャッシュ保存
//!
//! 注意: 品質プレフィックス (`masterpiece, best quality, ...`) はフロント側で付加する。
//! 本関数は LLM 由来の英語タグ列だけを返す。

use crate::app_state::AppState;
use crate::config_loader;
use crate::llm::client::{ChatMessage, LlmClient};
use crate::llm::manager::{LLM_HOST, LLM_PORT};
use serde::{Deserialize, Serialize};
use std::time::Instant;

/// キャッシュの最大エントリ数（超過時は古い順に破棄）
const MAX_CACHE_ENTRIES: usize = 200;

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateRequest {
    /// 日本語入力（または英語をそのまま渡すことも可）
    pub text: String,
    /// プロンプト変換プロファイル名（例: "anime_tags"）
    /// `resources/prompts/translation_<profile>.txt` を読み込む
    pub profile: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TranslateResponse {
    /// 変換後の英語タグ列
    pub translated: String,
    /// キャッシュからのヒットなら true
    pub from_cache: bool,
    /// 経過時間（ミリ秒）
    pub elapsed_ms: u64,
}

/// LLM からの生レスポンスを整形する
fn normalize_response(raw: &str) -> String {
    let trimmed = raw.trim();
    // 改行を ", " に置換（複数行返してくる場合への対策）
    let line_joined = trimmed.replace('\n', ", ").replace('\r', "");
    // 連続するカンマ・空白の正規化
    let mut result = String::with_capacity(line_joined.len());
    let mut last_was_comma = false;
    for ch in line_joined.chars() {
        if ch == ',' {
            if last_was_comma {
                continue;
            }
            result.push(',');
            last_was_comma = true;
        } else if ch.is_whitespace() {
            if !result.is_empty() {
                result.push(' ');
            }
            // 連続スペースは追加しない
            while result.ends_with("  ") {
                result.pop();
            }
        } else {
            result.push(ch);
            last_was_comma = false;
        }
    }
    // 末尾のカンマ/空白を削る
    while result.ends_with(',') || result.ends_with(' ') {
        result.pop();
    }
    result
}

pub async fn translate_prompt_impl(
    app: &tauri::AppHandle,
    state: &AppState,
    request: TranslateRequest,
) -> Result<TranslateResponse, String> {
    let start = Instant::now();

    let trimmed_text = request.text.trim();
    if trimmed_text.is_empty() {
        return Err("入力プロンプトが空です".into());
    }

    let cache_key = format!("{}|{}", request.profile, trimmed_text);

    // キャッシュチェック (HashMap 部分のみ参照、order には触れない)
    {
        let cache = state.translation_cache.lock().await;
        if let Some(cached) = cache.map.get(&cache_key) {
            return Ok(TranslateResponse {
                translated: cached.clone(),
                from_cache: true,
                elapsed_ms: start.elapsed().as_millis() as u64,
            });
        }
    }

    // システムプロンプト読み込み
    let prompt_file = format!("prompts/translation_{}.txt", request.profile);
    let system_prompt = config_loader::read_resource_string(app, &prompt_file).map_err(|_| {
        format!(
            "プロンプト変換プロファイル '{}' が見つかりません (期待パス: {})",
            request.profile, prompt_file
        )
    })?;

    // LLM 呼び出し
    let client = LlmClient::new(LLM_HOST, LLM_PORT);
    let messages = vec![
        ChatMessage {
            role: "system".into(),
            content: system_prompt,
        },
        ChatMessage {
            role: "user".into(),
            content: trimmed_text.to_string(),
        },
    ];
    let raw_response = client.chat_completion(messages, 0.3, 256).await?;
    let cleaned = normalize_response(&raw_response);

    if cleaned.is_empty() {
        return Err("LLM が空の応答を返しました".into());
    }

    // キャッシュ保存（FIFO で上限管理）
    // VecDeque で挿入順を保持しており、上限超過時は最古キーを pop_front して破棄する。
    // 旧実装は `HashMap.keys().next()` を使っていたが、HashMap の反復順は未定義のため
    // 「FIFO ではなくランダム削除」になっていた。
    {
        let mut cache = state.translation_cache.lock().await;
        while cache.map.len() >= MAX_CACHE_ENTRIES {
            if let Some(oldest) = cache.order.pop_front() {
                cache.map.remove(&oldest);
            } else {
                break;
            }
        }
        // 既存キーの更新時は order に重複追加しないよう、一度 map 側に未存在のときだけ push
        if !cache.map.contains_key(&cache_key) {
            cache.order.push_back(cache_key.clone());
        }
        cache.map.insert(cache_key, cleaned.clone());
    }

    Ok(TranslateResponse {
        translated: cleaned,
        from_cache: false,
        elapsed_ms: start.elapsed().as_millis() as u64,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn normalize_keeps_tags_clean() {
        let input = "1girl, solo,blonde_hair,  smile,\n blue_sky\n";
        let result = normalize_response(input);
        // 改行除去、複数スペース除去、末尾整形が効くこと
        assert!(result.starts_with("1girl"));
        assert!(result.contains("blue_sky"));
        assert!(!result.ends_with(','));
        assert!(!result.contains("  "));
    }

    #[test]
    fn normalize_handles_double_commas() {
        let input = "a, , b,,c";
        let result = normalize_response(input);
        assert!(!result.contains(",,"));
    }
}
