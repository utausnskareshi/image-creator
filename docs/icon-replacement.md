# アイコンの差し替え手順

ImageCreator のアプリアイコンは、ソース画像1枚を差し替えるだけで全形式（Windows ICO、各種PNG）が再生成される構成になっています。

## ソース画像

- **パス**: `installer/assets/icon-source.png`
- **推奨フォーマット**: PNG、**1024×1024 ピクセル**、透過対応
- **推奨デザイン**:
  - 中央寄せ
  - 端から10%程度の余白（OSによってクロップされる場合がある）
  - シンプルかつ視認性の高いシルエット（16×16でも判別可能なこと）

## 差し替え手順

1. 上記パスに新しい `icon-source.png` を上書き保存する
2. プロジェクトルートで以下のコマンドを実行する

   ```powershell
   npm run icon:regen
   ```

3. `src-tauri/icons/` 配下の以下のファイルが自動再生成される
   - `icon.ico` （Windows用、複数解像度同梱）
   - `32x32.png`
   - `128x128.png`
   - `128x128@2x.png`
   - その他プラットフォーム用ファイル

4. 動作確認

   ```powershell
   npm run tauri:dev
   ```

   タイトルバー左上とタスクバーアイコンが新しいデザインになっていれば成功。

## 内部仕組み

`npm run icon:regen` は内部で `tauri icon` コマンドを呼び出しています。

```jsonc
// package.json
"scripts": {
  "icon:regen": "tauri icon installer/assets/icon-source.png --output src-tauri/icons"
}
```

`tauri icon` は単一のソースPNGからWindows/macOS/iOS/Android/Linuxすべてのアイコン形式を生成するため、Windows向けに限らず複数プラットフォームでビルドする場合もそのまま流用できます。

## インストーラへの影響

NSIS インストーラのショートカット・アンインストーラ表示にも `icon.ico` が使われるため、差し替え後はインストーラの再生成も推奨されます。

```powershell
# アイコン再生成 → そのまま Tauri 標準 NSIS インストーラを再ビルド
npm run icon:regen
npm run tauri:build
```

## トラブルシューティング

- **コマンド実行時に「ICO形式が無効」エラー**: ソースPNGが256×256未満の場合に発生。1024×1024で用意し直してください
- **アイコンが透過されない**: ソースPNGの背景が不透明な可能性。Photoshop/GIMP等で背景レイヤを削除してください
- **`tauri icon` コマンドが見つからない**: `npm install` を先に実行してください
