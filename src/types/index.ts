// アプリ全体で使う共通型定義
// 各 Phase で必要な型を追記していく

// モデル定義（resources/models/<id>.json と対応）
export interface ModelFile {
  role: string;
  filename: string;
  url: string;
  sha256: string;
  sizeBytes: number | null;
  comfyUISubdir: string;
  /// 失敗時の診断・案内に使う。配信元のページ（リリース・モデル詳細）
  releasePage?: string;
  /// 表示用ソース識別子（例: "Owner/Repo" や "Civitai / model-name"）
  sourceProject?: string;
}

export interface ModelDescriptor {
  id: string;
  displayName: string;
  version: string;
  architecture: string;
  description?: string;
  homepage?: string;
  vendor?: string;
  license: {
    name: string;
    url: string;
    commercialUse: boolean;
    noticeJa?: string;
    noticeEn?: string;
  };
  files: ModelFile[];
  optionalFiles?: Array<ModelFile & { id?: string; displayName?: string; description?: string }>;
  workflowTemplate: string;
  defaults: {
    width: number;
    height: number;
    steps: number;
    cfg: number;
    sampler: string;
    scheduler: string;
    denoise?: number;
  };
  samplerOptions: string[];
  resolutionPresets: Array<{ name: string; width: number; height: number; highVram?: boolean }>;
  promptFormat: {
    qualityPrefix: string;
    negativeDefault: string;
    tagOrder: string[];
    separator: string;
  };
  minVramGb: number;
  recommendedVramGb?: number;
  promptTranslationProfile: string;
}

export interface ModelRegistry {
  version: number;
  models: Array<{
    id: string;
    descriptor: string;
    default: boolean;
    enabled: boolean;
  }>;
}

// 生成パラメータ
export interface GenerationParams {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number; // -1 でランダム
  batchSize: number;
  modelId: string;
  loraId?: string;
  loraStrength?: number;
}

// Rust 側 gpu::GpuInfo と対応
export interface GpuInfo {
  available: boolean;
  name: string | null;
  driverVersion: string | null;
  vramTotalMb: number | null;
  vramFreeMb: number | null;
  message: string;
  meetsRecommendedVram: boolean;
}

// Rust 側 fs_utils::DiskSpaceInfo と対応
export interface DiskSpaceInfo {
  path: string;
  availableBytes: number;
  availableGb: number;
  meetsRequirement: boolean;
  message: string;
}

// Rust 側 settings::Settings と対応
// serde の rename_all = "camelCase" によりフィールド名は camelCase になる
export interface Settings {
  setupCompleted: boolean;
  dataFolder: string | null;
  selectedModelId: string;
  locale: 'ja' | 'en';
  licenseAccepted: boolean;
  lastUsedVersion: string;
}

export function createDefaultSettings(): Settings {
  return {
    setupCompleted: false,
    dataFolder: null,
    selectedModelId: 'anima',
    locale: 'ja',
    licenseAccepted: false,
    lastUsedVersion: '',
  };
}

// セットアップウィザードで必要となる最低ディスク容量（GB）
// ComfyUI portable (~2GB) + Anima 3ファイル (~6GB) + LLM (~2GB) ≒ 10GB + バッファ
export const REQUIRED_DATA_FOLDER_GB = 12;

// ---- ダウンロードマネージャ関連（Rust 側 downloader.rs と対応） ----

export interface DownloadJob {
  id: string;
  displayName: string;
  url: string;
  destPath: string;
  expectedSha256: string | null;
  expectedSize: number | null;
  // 失敗時の診断・案内に使う追加情報（Rust 側は無視する）
  releasePage?: string | null;
  sourceProject?: string | null;
}

export type DownloadStatus =
  | 'pending'
  | 'downloading'
  | 'verifying'
  | 'completed'
  | 'failed'
  | 'alreadyexists';

export interface DownloadProgress {
  jobId: string;
  status: DownloadStatus;
  downloadedBytes: number;
  totalBytes: number | null;
  speedBps: number;
  message: string | null;
}

// ---- ランタイム設定（resources/runtime/runtime.json と対応） ----

export interface RuntimeAsset {
  id: string;
  displayName: string;
  description?: string;
  url: string;
  filename: string;
  sha256: string | null;
  sizeBytes: number | null;
  saveTo: string; // 例: "downloads" / "models/llm"
  /// 配信元の公式リリース/トップページ。URL 変更時のユーザー誘導に使う
  releasePage?: string;
  /// "<owner>/<repo>" 形式のプロジェクト識別子（表示用）
  sourceProject?: string;
  extract?: {
    type: '7z' | 'zip';
    extractTo: string;
    entryPoint?: string;
    executable?: string;
  };
}

export interface RuntimeConfig {
  version: number;
  comfyui: RuntimeAsset;
  llamaServer: RuntimeAsset;
  llmModel: RuntimeAsset;
}

// ---- アーカイブ展開（Rust 側 archive.rs と対応） ----

export interface ExtractProgress {
  archiveId: string;
  currentEntry: string;
  entriesDone: number;
  entriesTotal: number | null;
  completed: boolean;
  message: string | null;
}

// ---- ComfyUI（Rust 側 comfyui::manager::ComfyUIStatus と対応） ----

export interface ComfyUIStatus {
  extracted: boolean;
  processRunning: boolean;
  apiReachable: boolean;
  port: number;
  rootPath: string | null;
}

// ---- 画像生成（Rust 側 generate.rs と対応） ----

export interface GenerateImageRequest {
  positivePrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  modelId: string;
  workflowTemplate: string;
  /// ギャラリー記録用の日本語入力（任意）
  japanesePrompt?: string | null;
  /// LoRA ファイル名（Turbo LoRA 使用時）
  loraFile?: string | null;
  /// LoRA 強度
  loraStrength?: number | null;
}

// ---- ログ ----
export type LogKind = 'app' | 'comfyui' | 'llama';

/**
 * ComfyUI からの画像出力種別 (代表値)。
 * - output: 通常の保存画像
 * - temp:   一時画像 (中間段階)
 * - input:  入力 (画像→画像変換などで使用)
 *
 * 値自体は ComfyUI の将来バージョンで追加されうるため `string` 型を維持する。
 * IDE 補完を兼ねた型ヒントとしては `string & {}` で文字列リテラル union を残す
 * 慣用パターンが TypeScript には存在するが、ここでは可読性を優先しコメントで代用する。
 */
export type ComfyUIImageKind = 'output' | 'temp' | 'input';

export interface GeneratedImageData {
  filename: string;
  subfolder: string;
  /** ComfyUI が返す画像種別。代表値は {@link ComfyUIImageKind} 参照。 */
  kind: string;
  dataBase64: string;
  mimeType: string;
  /** ギャラリーDB登録時の ID（保存失敗時は null） */
  galleryId: number | null;
}

export interface GenerateImageResponse {
  promptId: string;
  images: GeneratedImageData[];
}

// ---- LLM（Rust 側 llm::manager::LlmServerStatus と対応） ----

export interface LlmServerStatus {
  extracted: boolean;
  modelPresent: boolean;
  processRunning: boolean;
  apiReachable: boolean;
  port: number;
  serverPath: string | null;
  modelPath: string | null;
}

export interface TranslateRequest {
  text: string;
  profile: string; // 例: "anime_tags"
}

export interface TranslateResponse {
  translated: string;
  fromCache: boolean;
  elapsedMs: number;
}

// ---- ギャラリー（Rust 側 gallery モジュールと対応） ----

// 一覧アイテム（サムネイル base64 同梱）
export interface GalleryItem {
  id: number;
  createdAt: string;
  filePath: string;
  modelId: string;
  positivePrompt: string;
  width: number;
  height: number;
  seed: number;
  isFavorite: boolean;
  thumbnailBase64: string;
  thumbnailMimeType: string;
}

// 詳細表示用（全パラメータ含む）
export interface GalleryItemDetail {
  id: number;
  createdAt: string;
  filePath: string;
  thumbPath: string;
  modelId: string;
  workflowTemplate: string | null;
  positivePrompt: string;
  negativePrompt: string | null;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number;
  japanesePrompt: string | null;
  isFavorite: boolean;
  comfyuiFilename: string | null;
}

export interface ListGalleryArgs {
  limit: number;
  offset: number;
  favoritesOnly: boolean;
}

export interface ImageData {
  dataBase64: string;
  mimeType: string;
}

// (旧 GalleryReference 型はどこからも参照されていないため削除した)
