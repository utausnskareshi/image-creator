// Tauri コマンド呼び出しの薄いラッパー
// 各 Phase で増えるバックエンドコマンドはここに集約する
import { invoke } from '@tauri-apps/api/core';
import type {
  GpuInfo,
  DiskSpaceInfo,
  Settings,
  DownloadJob,
  ModelDescriptor,
  ModelRegistry,
  RuntimeConfig,
  ComfyUIStatus,
  GenerateImageRequest,
  GenerateImageResponse,
  LlmServerStatus,
  TranslateRequest,
  TranslateResponse,
  GalleryItem,
  GalleryItemDetail,
  ListGalleryArgs,
  ImageData,
} from '../types';

// 疎通確認
export async function ping(): Promise<string> {
  return invoke<string>('ping');
}

// ---- 設定 ----
export async function getSettings(): Promise<Settings> {
  return invoke<Settings>('get_settings');
}

export async function saveSettings(settings: Settings): Promise<void> {
  return invoke<void>('save_settings_cmd', { settings });
}

export async function getSettingsPath(): Promise<string> {
  return invoke<string>('get_settings_path');
}

// ---- GPU ----
export async function detectGpu(): Promise<GpuInfo> {
  return invoke<GpuInfo>('detect_gpu');
}

// ---- ファイルシステム ----
export async function checkDiskSpace(path: string, requiredGb: number): Promise<DiskSpaceInfo> {
  return invoke<DiskSpaceInfo>('check_disk_space', { path, requiredGb });
}

export async function checkWritable(path: string): Promise<boolean> {
  return invoke<boolean>('check_writable', { path });
}

export async function suggestDefaultDataFolder(): Promise<string> {
  return invoke<string>('suggest_default_data_folder');
}

// ---- ダウンロードマネージャ ----
export async function downloadFiles(jobs: DownloadJob[]): Promise<void> {
  return invoke<void>('download_files', { jobs });
}

export async function computeFileSha256(path: string): Promise<string> {
  return invoke<string>('compute_file_sha256', { path });
}

// ---- リソース設定（registry / model descriptor / runtime） ----
export async function loadModelRegistry(): Promise<ModelRegistry> {
  return invoke<ModelRegistry>('load_model_registry');
}

export async function loadModelDescriptor(descriptorFilename: string): Promise<ModelDescriptor> {
  return invoke<ModelDescriptor>('load_model_descriptor', { descriptorFilename });
}

export async function loadRuntimeConfig(): Promise<RuntimeConfig> {
  return invoke<RuntimeConfig>('load_runtime_config');
}

export async function loadWorkflowTemplate(name: string): Promise<unknown> {
  return invoke<unknown>('load_workflow_template', { name });
}

// ---- ComfyUI 制御 ----
export async function comfyuiSetup(dataFolder: string): Promise<void> {
  return invoke<void>('comfyui_setup', { dataFolder });
}

export async function comfyuiStart(dataFolder: string): Promise<void> {
  return invoke<void>('comfyui_start', { dataFolder });
}

export async function comfyuiStop(): Promise<void> {
  return invoke<void>('comfyui_stop');
}

export async function comfyuiStatus(dataFolder: string): Promise<ComfyUIStatus> {
  return invoke<ComfyUIStatus>('comfyui_status', { dataFolder });
}

export async function comfyuiInterrupt(): Promise<void> {
  return invoke<void>('comfyui_interrupt');
}

// ---- 画像生成 ----
export async function generateImage(
  request: GenerateImageRequest,
): Promise<GenerateImageResponse> {
  return invoke<GenerateImageResponse>('generate_image', { request });
}

// ---- LLM（llama-server）制御 ----
export async function llmSetup(dataFolder: string): Promise<void> {
  return invoke<void>('llm_setup', { dataFolder });
}

export async function llmStart(dataFolder: string): Promise<void> {
  return invoke<void>('llm_start', { dataFolder });
}

export async function llmStop(): Promise<void> {
  return invoke<void>('llm_stop');
}

export async function llmStatus(dataFolder: string): Promise<LlmServerStatus> {
  return invoke<LlmServerStatus>('llm_status', { dataFolder });
}

// ---- プロンプト変換 ----
export async function translatePrompt(request: TranslateRequest): Promise<TranslateResponse> {
  return invoke<TranslateResponse>('translate_prompt', { request });
}

export async function clearTranslationCache(): Promise<number> {
  return invoke<number>('clear_translation_cache');
}

// ---- ギャラリー ----
export async function galleryList(args: ListGalleryArgs): Promise<GalleryItem[]> {
  return invoke<GalleryItem[]>('gallery_list', { args });
}

export async function galleryCount(favoritesOnly: boolean): Promise<number> {
  return invoke<number>('gallery_count', { favoritesOnly });
}

export async function galleryGetDetail(id: number): Promise<GalleryItemDetail> {
  return invoke<GalleryItemDetail>('gallery_get_detail', { id });
}

export async function galleryGetFullImage(id: number): Promise<ImageData> {
  return invoke<ImageData>('gallery_get_full_image', { id });
}

export async function galleryToggleFavorite(id: number): Promise<boolean> {
  return invoke<boolean>('gallery_toggle_favorite', { id });
}

export async function galleryDelete(id: number): Promise<void> {
  return invoke<void>('gallery_delete', { id });
}

export async function gallerySaveAs(id: number, targetPath: string): Promise<void> {
  return invoke<void>('gallery_save_as', { id, targetPath });
}

// ---- ログ ----
import type { LogKind } from '../types';

export async function readLog(kind: LogKind, tailLines: number | null = 1000): Promise<string> {
  return invoke<string>('read_log', { kind, tailLines });
}

export async function clearLog(kind: LogKind): Promise<void> {
  return invoke<void>('clear_log', { kind });
}

export async function logPath(kind: LogKind): Promise<string> {
  return invoke<string>('log_path', { kind });
}

// ---- ファイル存在チェック ----
export async function pathExists(path: string): Promise<boolean> {
  return invoke<boolean>('path_exists', { path });
}
