# リリース手順

ImageCreator の新バージョンを GitHub Releases として配布するまでの手順。

## 概要

```
タグ push (vX.Y.Z) → GitHub Actions が自動でビルド → ドラフト Release を作成
                  → メンテナが内容を確認し公開（Publish）
```

公開は GitHub UI 上で手動操作です（誤公開防止）。

---

## 前提条件

- メインブランチがビルド可能な状態であること
  - ローカルで `npm run typecheck` / `npm run build` / `cd src-tauri && cargo check && cargo test` が成功
- `CHANGELOG.md` の `[Unreleased]` セクションに今回の変更が記載されていること
- GitHub リポジトリの `Actions` が有効になっていること

---

## 手順

### 1. バージョン番号を確定する

採用する version 番号（例: `0.1.0`）を 3 箇所で揃えます:

| ファイル | 場所 |
|---|---|
| [package.json](../package.json) | `"version"` フィールド |
| [src-tauri/Cargo.toml](../src-tauri/Cargo.toml) | `[package].version` |
| [src-tauri/tauri.conf.json](../src-tauri/tauri.conf.json) | `"version"` フィールド |

> 💡 将来的に `scripts/bump-version.ps1` などで自動化する余地あり

### 2. CHANGELOG.md を更新する

- `[Unreleased]` → `[X.Y.Z] - YYYY-MM-DD` にリネーム
- 末尾の比較リンクを追加
- 新しい `[Unreleased]` セクションを先頭に追加

### 3. コミット & プッシュ

```powershell
git add -A
git commit -m "chore(release): vX.Y.Z"
git push origin main
```

### 4. タグを作成してプッシュ

```powershell
git tag vX.Y.Z
git push origin vX.Y.Z
```

→ GitHub Actions の `Release` ワークフローが自動的に発火します。

### 5. ワークフローの完了を待つ

- GitHub の `Actions` タブで `Release` ワークフローの進行を確認（約 5〜15 分）
- 初回ビルドは Rust の依存クレートをすべてコンパイルするため長い

### 6. ドラフト Release を確認・公開

- GitHub の `Releases` タブで作成されたドラフトを開く
- 内容（タイトル、説明、添付された `.exe`）を確認
- 必要なら本文を編集
- `Publish release` ボタンで公開

---

## トラブルシューティング

### ワークフローが失敗する

- `Actions` タブから当該ワークフローのログを確認
- よくある失敗:
  - npm/Cargo の依存解決失敗 → Cache を `Actions → Caches` から削除して再実行
  - NSIS インストーラ生成失敗 → `src-tauri/nsis/hooks.nsi` の構文エラーを確認

### タグを間違えた

```powershell
# ローカルとリモートからタグを削除
git tag -d vX.Y.Z
git push origin :refs/tags/vX.Y.Z

# 必要なら GitHub UI で関連する Draft Release も削除
# 修正後、再度タグを打ち直す
```

### Re-run

- `Actions` タブから失敗した実行を選び `Re-run all jobs` で再実行可能

---

## バージョニング指針 (SemVer)

- `MAJOR`: 互換性のない変更（設定ファイル形式の破壊的変更など）
- `MINOR`: 後方互換のある機能追加
- `PATCH`: 後方互換のあるバグ修正

開発初期の `0.x.y` 期間は MINOR を機能追加、PATCH を修正に充てます。

---

## コード署名（将来対応）

現状コード署名なしのため、ユーザー側で Windows SmartScreen の警告が表示されます。
将来対応する場合の選択肢:

1. **EV / OV コード署名証明書購入**（年間 1〜5 万円程度）
2. [SignPath.io](https://signpath.io/) の OSS 無料プログラム
3. Microsoft Store 経由配布（別途審査あり）

対応時は `release.yml` に signtool / signpath などの署名ステップを追加します。
