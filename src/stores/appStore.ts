import { create } from 'zustand';
import type { Settings } from '../types';
import { createDefaultSettings } from '../types';

// Locale 型は i18n モジュール側を一次定義として扱い、ここでは再 export だけにする。
// (旧実装は appStore / i18n の両方で `Locale = 'ja' | 'en'` を独自定義していて DRY 違反だった)
export type { Locale } from '../i18n';

// アプリケーション全体の状態管理（Zustand）
// settings は Rust 側 settings.json を React 側にもキャッシュしたもの
interface AppState {
  // ---- 設定 ----
  settings: Settings;
  setSettings: (settings: Settings) => void;
  patchSettings: (partial: Partial<Settings>) => void;

  // ---- 起動状態 ----
  // 設定ロードが完了したか（false の間はスプラッシュ画面表示）
  isBootstrapped: boolean;
  setBootstrapped: (value: boolean) => void;
}

export const useAppStore = create<AppState>((set) => ({
  settings: createDefaultSettings(),
  setSettings: (settings) => set({ settings }),
  patchSettings: (partial) =>
    set((state) => ({ settings: { ...state.settings, ...partial } })),

  isBootstrapped: false,
  setBootstrapped: (value) => set({ isBootstrapped: value }),
}));
