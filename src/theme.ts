import { createTheme, type MantineColorsTuple } from '@mantine/core';

// アプリ全体のテーマ定義
// プライマリカラーは紫系（暫定）。将来アイコンと合わせて変更可能
const imageCreatorPurple: MantineColorsTuple = [
  '#f4eeff',
  '#e0d7fb',
  '#bfacf2',
  '#9d7feb',
  '#7f59e3',
  '#6c41df',
  '#6334de',
  '#5326c5',
  '#4920b1',
  '#3e189c',
];

export const theme = createTheme({
  primaryColor: 'image-creator',
  colors: {
    'image-creator': imageCreatorPurple,
  },
  fontFamily:
    "'Inter', 'Hiragino Kaku Gothic ProN', 'Hiragino Sans', 'BIZ UDPGothic', 'Yu Gothic UI', Meiryo, system-ui, sans-serif",
  defaultRadius: 'md',
  cursorType: 'pointer',
});
