// ダウンロード計画の組み立て
// registry.json / モデル定義 / runtime.json から DownloadJob のリストを構築する

import { loadModelRegistry, loadModelDescriptor, loadRuntimeConfig } from './tauri';
import type { DownloadJob, ModelDescriptor, RuntimeAsset } from '../types';

// Windows パス結合（区切り文字: バックスラッシュ）
function joinWinPath(...parts: string[]): string {
  return parts
    .filter(Boolean)
    .join('\\')
    .replace(/[\\/]+/g, '\\');
}

// runtime.json のエントリを DownloadJob に変換
function runtimeAssetToJob(asset: RuntimeAsset, dataFolder: string): DownloadJob {
  return {
    id: asset.id,
    displayName: asset.displayName,
    url: asset.url,
    destPath: joinWinPath(dataFolder, asset.saveTo, asset.filename),
    // runtime.json も model 同様、不正値 (null / TBD / プレースホルダ) は検証スキップに統一
    expectedSha256: normalizeSha256(asset.sha256),
    expectedSize: asset.sizeBytes,
    releasePage: asset.releasePage ?? null,
    sourceProject: asset.sourceProject ?? null,
  };
}

// モデルファイル定義 → DownloadJob
// 保存先は ComfyUI が認識するサブディレクトリ構造に合わせる
// 例: <data>/models/anima/diffusion_models/anima-base-v1.0.safetensors
// 64桁 hex 文字列 (大小文字いずれも可) の SHA256 か判定する。
// "TBD_FILL_AT_RUNTIME" などの未確定プレースホルダ・空文字・null を一律 null として扱うことで、
// プレースホルダの種類が増えても検証スキップ判定が安全に保たれる。
function normalizeSha256(value: string | null | undefined): string | null {
  if (typeof value !== 'string') return null;
  return /^[0-9a-f]{64}$/i.test(value) ? value : null;
}

function modelFileToJob(
  descriptor: ModelDescriptor,
  file: ModelDescriptor['files'][number],
  dataFolder: string,
): DownloadJob {
  const sha256 = normalizeSha256(file.sha256);

  return {
    id: `model-${descriptor.id}-${file.role}`,
    displayName: `${descriptor.displayName} / ${file.filename}`,
    url: file.url,
    destPath: joinWinPath(
      dataFolder,
      'models',
      descriptor.id,
      file.comfyUISubdir,
      file.filename,
    ),
    expectedSha256: sha256,
    expectedSize: file.sizeBytes,
    // モデルの場合は descriptor の homepage を診断用リンクとして使う
    releasePage: descriptor.homepage ?? null,
    sourceProject: descriptor.vendor
      ? `${descriptor.vendor} / ${descriptor.id}`
      : descriptor.id,
  };
}

/**
 * セットアップ時にダウンロードすべきファイル群を組み立てる
 *
 * 順序:
 *  1. ComfyUI portable（最大）→ 先に走らせて並列効果を享受
 *  2. llama.cpp server バイナリ
 *  3. プロンプト変換用 LLM（Qwen2.5-3B GGUF）
 *  4. 既定モデル（Anima）の必須ファイル群
 *
 * @param dataFolder 保存先ルート（ユーザーが選んだフォルダ）
 * @param modelId ダウンロードするモデルID（既定: anima）
 */
export async function buildSetupDownloadPlan(
  dataFolder: string,
  modelId: string,
): Promise<DownloadJob[]> {
  if (!dataFolder) throw new Error('データフォルダが未指定です');

  const [registry, runtime] = await Promise.all([
    loadModelRegistry(),
    loadRuntimeConfig(),
  ]);

  const entry = registry.models.find((m) => m.id === modelId);
  if (!entry) {
    throw new Error(`モデル ID "${modelId}" は registry.json に存在しません`);
  }

  const descriptor = await loadModelDescriptor(entry.descriptor);

  const jobs: DownloadJob[] = [
    runtimeAssetToJob(runtime.comfyui, dataFolder),
    runtimeAssetToJob(runtime.llamaServer, dataFolder),
    runtimeAssetToJob(runtime.llmModel, dataFolder),
    ...descriptor.files.map((file) => modelFileToJob(descriptor, file, dataFolder)),
  ];

  return jobs;
}
