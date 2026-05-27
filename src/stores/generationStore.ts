import { create } from 'zustand';
import { persist } from 'zustand/middleware';

// 画像生成画面の状態管理
// 入力中のプロンプトや設定は localStorage に永続化する
// 一時的な状態（結果画像・エラー・生成中フラグ）は store には入れない

export type GenerationMode = 'simple' | 'advanced';
export type AspectRatio = 'square' | 'portrait' | 'landscape';
export type SeedMode = 'fixed' | 'random' | 'increment';

export interface SimpleModeState {
  japanesePrompt: string;
  aspectRatio: AspectRatio;
  count: number; // 1〜4
}

export interface AdvancedModeState {
  japanesePrompt: string;
  englishPrompt: string;
  negativePrompt: string;
  width: number;
  height: number;
  steps: number;
  cfg: number;
  sampler: string;
  scheduler: string;
  seed: number; // -1 = ランダム
  batchSize: number;
  seedMode: SeedMode;
  usePrefix: boolean;
  useTurboLora: boolean; // Phase 9 で実装予定（現状は表示のみ）
}

interface GenerationState {
  mode: GenerationMode;
  setMode: (mode: GenerationMode) => void;

  selectedModelId: string;
  setSelectedModelId: (id: string) => void;

  simple: SimpleModeState;
  setSimple: (patch: Partial<SimpleModeState>) => void;

  advanced: AdvancedModeState;
  setAdvanced: (patch: Partial<AdvancedModeState>) => void;

  resetAdvancedToDefaults: () => void;
}

/**
 * Anima/SDXL 系の品質プレフィックス。
 * シンプル/詳細モードの両方で同じ値を使うため共通定数として持つ。
 * anima.json:promptFormat.qualityPrefix と整合させること。
 */
export const QUALITY_PREFIX = 'masterpiece, best quality, score_7, safe, ';

/**
 * シード値の上限 (32bit 符号付き整数の最大値)。
 * ComfyUI の seed パラメータは int32 想定なので 2^31-1 = 2147483647 を上限とする。
 */
export const MAX_SEED = 2147483647;

/** ランダムシード値を生成する */
export function randomSeed(): number {
  return Math.floor(Math.random() * MAX_SEED);
}

// Anima 既定値（resources/models/anima.json の defaults と整合）
export const ANIMA_DEFAULTS: AdvancedModeState = {
  japanesePrompt: '',
  englishPrompt: '',
  negativePrompt: 'worst quality, low quality, score_1, score_2, score_3, artist name',
  width: 1024,
  height: 1024,
  steps: 30,
  cfg: 4.5,
  sampler: 'euler_ancestral',
  scheduler: 'normal',
  seed: -1,
  batchSize: 1,
  seedMode: 'random',
  usePrefix: true,
  useTurboLora: false,
};

export const SIMPLE_DEFAULTS: SimpleModeState = {
  japanesePrompt: '',
  aspectRatio: 'square',
  count: 1,
};

// aspect ratio → 解像度マップ（VRAM 8GB 最適）
export const ASPECT_RATIO_DIMENSIONS: Record<
  AspectRatio,
  { width: number; height: number; label: string }
> = {
  square: { width: 1024, height: 1024, label: '正方形 (1024×1024)' },
  portrait: { width: 832, height: 1216, label: '縦長 (832×1216)' },
  landscape: { width: 1216, height: 832, label: '横長 (1216×832)' },
};

export const useGenerationStore = create<GenerationState>()(
  persist(
    (set) => ({
      mode: 'simple',
      setMode: (mode) => set({ mode }),

      selectedModelId: 'anima',
      setSelectedModelId: (id) => set({ selectedModelId: id }),

      simple: { ...SIMPLE_DEFAULTS },
      setSimple: (patch) =>
        set((s) => ({ simple: { ...s.simple, ...patch } })),

      advanced: { ...ANIMA_DEFAULTS },
      setAdvanced: (patch) =>
        set((s) => ({ advanced: { ...s.advanced, ...patch } })),

      resetAdvancedToDefaults: () =>
        set({ advanced: { ...ANIMA_DEFAULTS } }),
    }),
    {
      name: 'image-creator-generation',
      // 初回公開リリースのため永続化スキーマは version 1 から開始する。
      // (開発中は version 2 で euler_a→euler_ancestral 移行を行っていたが、
      //  公開ユーザーには旧データが存在せず、既定値も euler_ancestral のため移行は不要。
      //  将来スキーマを変更する際は version を 2 以降に上げ migrate を追加すること)
      version: 1,
      partialize: (state) => ({
        mode: state.mode,
        selectedModelId: state.selectedModelId,
        simple: state.simple,
        advanced: state.advanced,
      }),
    },
  ),
);
