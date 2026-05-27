// シンプルな i18n 実装
// 内部はキー→文字列のマッピング。Mustache 風の `{name}` プレースホルダ展開を最低限サポート

import { ja } from './ja';
import { en } from './en';

export type Locale = 'ja' | 'en';
export type TranslationKey = keyof typeof ja;

// 各言語の辞書（型は ja に揃える）
const dictionaries = {
  ja,
  en,
} as const;

/**
 * 翻訳ルックアップ
 * - 主言語に該当キーがなければ ja にフォールバック
 * - `params` 指定時は `{name}` 形式のプレースホルダを置換
 */
export function t(
  locale: Locale,
  key: TranslationKey,
  params?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] as Record<string, string>;
  const text = dict[key] ?? (dictionaries.ja as Record<string, string>)[key] ?? key;
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (_, name) => {
    const val = params[name];
    return val != null ? String(val) : `{${name}}`;
  });
}
