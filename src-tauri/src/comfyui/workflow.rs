//! ワークフローテンプレートのプレースホルダ置換
//!
//! JSON テンプレート内の `{{POSITIVE_PROMPT}}` 等の文字列を実際の値に置換する。
//! 数値プレースホルダは置換時に JSON Number へ変換される（型を保つため）。

use serde::{Deserialize, Serialize};
use serde_json::{Number, Value};

#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkflowParams {
    pub positive_prompt: String,
    pub negative_prompt: String,
    pub width: u32,
    pub height: u32,
    pub steps: u32,
    pub cfg: f64,
    pub sampler: String,
    pub scheduler: String,
    pub seed: i64,
    pub model_file: String,
    pub text_encoder_file: String,
    pub vae_file: String,
    /// Phase 6 で LoRA 連携時に使用
    #[serde(default)]
    pub lora_file: Option<String>,
    #[serde(default)]
    pub lora_strength: Option<f64>,
}

/// テンプレート JSON にパラメータを流し込む
/// `prompt` キー配下のオブジェクトを ComfyUI API 形式として返す
pub fn build_workflow(template: Value, params: &WorkflowParams) -> Result<Value, String> {
    // テンプレートが `{ "prompt": {...}, ... }` 形式なら prompt 部分のみ取り出す
    let prompt_value = if let Some(p) = template.get("prompt") {
        p.clone()
    } else {
        template
    };

    let mut result = prompt_value;
    substitute(&mut result, params);

    // 置換漏れチェック: `{{XXX}}` 形式が残っていれば早期にエラーを返す。
    // (例: anima_turbo.json で LORA_FILE/LORA_STRENGTH 未指定のまま呼ばれた等)
    if let Some(leftover) = find_unresolved_placeholder(&result) {
        return Err(format!(
            "ワークフローのプレースホルダ '{}' に値が割り当てられていません。\
             テンプレート (例: Turbo LoRA) と渡したパラメータ (lora_file/lora_strength 等) を確認してください。",
            leftover
        ));
    }

    Ok(result)
}

/// 値ツリーを走査し、`{{NAME}}` 形式の未置換プレースホルダが残っていれば
/// そのキー名を返す。すべて置換済みなら None。
/// プレースホルダ名は ASCII 大文字 + アンダースコアに限定し、JSON リテラル風文字列
/// (例: `"{{ \"k\": \"v\" }}"`) を誤って placeholder と認識しないようにする。
fn find_unresolved_placeholder(value: &Value) -> Option<String> {
    match value {
        Value::String(s) => {
            if s.starts_with("{{") && s.ends_with("}}") && s.len() > 4 {
                let inner = &s[2..s.len() - 2];
                // 厳密に [A-Z_]+ にマッチする場合のみ未置換プレースホルダと判定する
                if !inner.is_empty()
                    && inner
                        .chars()
                        .all(|c| c.is_ascii_uppercase() || c == '_')
                {
                    return Some(inner.to_string());
                }
            }
            None
        }
        Value::Array(arr) => arr.iter().find_map(find_unresolved_placeholder),
        Value::Object(obj) => obj.values().find_map(find_unresolved_placeholder),
        _ => None,
    }
}

fn substitute(value: &mut Value, params: &WorkflowParams) {
    match value {
        Value::String(s) => {
            if let Some(replacement) = resolve_placeholder(s, params) {
                *value = replacement;
            }
        }
        Value::Array(arr) => {
            for v in arr.iter_mut() {
                substitute(v, params);
            }
        }
        Value::Object(obj) => {
            for (_, v) in obj.iter_mut() {
                substitute(v, params);
            }
        }
        _ => {}
    }
}

/// `{{KEY}}` 形式の文字列から対応する値を返す
fn resolve_placeholder(s: &str, params: &WorkflowParams) -> Option<Value> {
    if !(s.starts_with("{{") && s.ends_with("}}")) {
        return None;
    }
    let key = &s[2..s.len() - 2];
    match key {
        "POSITIVE_PROMPT" => Some(Value::String(params.positive_prompt.clone())),
        "NEGATIVE_PROMPT" => Some(Value::String(params.negative_prompt.clone())),
        "WIDTH" => Some(Value::Number(params.width.into())),
        "HEIGHT" => Some(Value::Number(params.height.into())),
        "STEPS" => Some(Value::Number(params.steps.into())),
        "CFG" => Number::from_f64(params.cfg).map(Value::Number),
        "SAMPLER" => Some(Value::String(params.sampler.clone())),
        "SCHEDULER" => Some(Value::String(params.scheduler.clone())),
        "SEED" => Some(Value::Number(params.seed.into())),
        "MODEL_FILE" => Some(Value::String(params.model_file.clone())),
        "TEXT_ENCODER_FILE" => Some(Value::String(params.text_encoder_file.clone())),
        "VAE_FILE" => Some(Value::String(params.vae_file.clone())),
        "LORA_FILE" => params.lora_file.clone().map(Value::String),
        "LORA_STRENGTH" => params.lora_strength.and_then(Number::from_f64).map(Value::Number),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    fn params() -> WorkflowParams {
        WorkflowParams {
            positive_prompt: "1girl, smile".to_string(),
            negative_prompt: "low quality".to_string(),
            width: 1024,
            height: 1024,
            steps: 30,
            cfg: 4.5,
            sampler: "euler_a".to_string(),
            scheduler: "normal".to_string(),
            seed: 42,
            model_file: "anima.safetensors".to_string(),
            text_encoder_file: "qwen.safetensors".to_string(),
            vae_file: "vae.safetensors".to_string(),
            lora_file: None,
            lora_strength: None,
        }
    }

    #[test]
    fn does_not_flag_json_like_strings_as_placeholders() {
        // `{{ ... }}` で囲まれていてもプレースホルダ名に該当しない (空白や記号を含む)
        // 文字列は誤検出してはならない。
        let template = json!({
            "prompt": {
                "1": {
                    "inputs": {
                        // ユーザー定義のテキスト中に偶然 {{ }} があるケース
                        "label": "{{ note: not a placeholder }}",
                        "another": "{{lowercase}}",
                        "valid": "{{POSITIVE_PROMPT}}"
                    }
                }
            }
        });
        // POSITIVE_PROMPT は params() で値を持つので置換成功、他は誤検出されないはず
        let result = build_workflow(template, &params());
        assert!(result.is_ok(), "誤検出による偽エラーが発生: {:?}", result);
    }

    #[test]
    fn errors_when_lora_placeholder_left_unresolved() {
        // anima_turbo 風テンプレートで lora_file/lora_strength を渡さなかった場合、
        // 置換漏れチェックが効いてエラーになることを確認
        let template = json!({
            "prompt": {
                "10": {
                    "inputs": {
                        "lora_name": "{{LORA_FILE}}",
                        "strength_model": "{{LORA_STRENGTH}}"
                    }
                }
            }
        });
        let result = build_workflow(template, &params());
        assert!(result.is_err());
        let msg = result.unwrap_err();
        assert!(msg.contains("LORA_FILE") || msg.contains("LORA_STRENGTH"));
    }

    #[test]
    fn substitutes_string_and_number_placeholders() {
        let template = json!({
            "prompt": {
                "1": {
                    "inputs": {
                        "text": "{{POSITIVE_PROMPT}}",
                        "width": "{{WIDTH}}",
                        "cfg": "{{CFG}}",
                        "seed": "{{SEED}}"
                    }
                }
            }
        });
        let result = build_workflow(template, &params()).unwrap();
        assert_eq!(result["1"]["inputs"]["text"], json!("1girl, smile"));
        assert_eq!(result["1"]["inputs"]["width"], json!(1024));
        assert!(result["1"]["inputs"]["cfg"].as_f64().unwrap() - 4.5 < 0.001);
        assert_eq!(result["1"]["inputs"]["seed"], json!(42));
    }
}
