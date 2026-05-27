//! アプリケーション全体で共有するステート
//!
//! ComfyUI / llama-server の子プロセスハンドルを保持する。
//! Tauri 2.x の `app.manage(state)` 経由で全コマンドから参照可能。

use std::collections::{HashMap, VecDeque};
use std::sync::Arc;
use tokio::process::Child;
use tokio::sync::Mutex;

/// 子プロセスハンドル（Option = 未起動なら None）
pub type ProcessHandle = Arc<Mutex<Option<Child>>>;

/// プロンプト変換キャッシュ本体
/// `map` が値、`order` が挿入順 (FIFO 破棄に使う) を保持する。
/// `HashMap.keys().next()` は順序未定義なので順序トラッキングを明示的に持つ必要がある。
#[derive(Default)]
pub struct TranslationCacheInner {
    pub map: HashMap<String, String>,
    pub order: VecDeque<String>,
}

/// プロンプト変換キャッシュ
/// キー: "<profile>|<japanese_text>"、値: 変換後英語タグ
pub type TranslationCache = Arc<Mutex<TranslationCacheInner>>;

/// アプリ共有ステート
#[derive(Clone)]
pub struct AppState {
    /// ComfyUI プロセスハンドル
    pub comfyui_handle: ProcessHandle,
    /// llama-server プロセスハンドル
    pub llama_handle: ProcessHandle,
    /// 日本語→英語プロンプト変換のセッション内キャッシュ
    pub translation_cache: TranslationCache,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            comfyui_handle: Arc::new(Mutex::new(None)),
            llama_handle: Arc::new(Mutex::new(None)),
            translation_cache: Arc::new(Mutex::new(TranslationCacheInner::default())),
        }
    }
}

impl Default for AppState {
    fn default() -> Self {
        Self::new()
    }
}
