// React フック: 現在の locale で t() を返す
// locale が変わると自動的に再描画される（useAppStore 経由）

import { useCallback } from 'react';
import { useAppStore } from '../stores/appStore';
import { t, type Locale, type TranslationKey } from './index';

export function useTranslation() {
  const locale = useAppStore((s) => s.settings.locale);

  const tr = useCallback(
    (key: TranslationKey, params?: Record<string, string | number>) =>
      t(locale as Locale, key, params),
    [locale],
  );

  return {
    t: tr,
    locale: locale as Locale,
  };
}
