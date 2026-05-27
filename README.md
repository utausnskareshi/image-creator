# ImageCreator

オフラインで動作する画像生成 AI クライアントアプリ（Windows / NVIDIA GPU 向け）。

日本語でプロンプトを入力するだけで、内蔵 LLM が画像生成 AI に最適化された英語プロンプトに変換し、ComfyUI をバックエンドとして画像を生成します。

---

## ✨ 特徴

- **完全オフライン**: 外部 API を使わず、すべての推論をローカル PC で実行
- **日本語プロンプト対応**: 日本語入力 → 内蔵 LLM (Qwen2.5-3B) が画像生成向けタグに自動変換
- **初心者にも玄人にも**: シンプルモード/詳細モードの 2 層 UI
- **拡張可能**: registry.json への追記だけで Anima 以外のモデルにも対応可能
- **VRAM 8GB に最適化**: RTX 4060 クラスでも快適動作
- **ライブプレビュー**: 生成中の中間ステップをリアルタイム表示
- **ギャラリー**: 履歴・お気に入り・「同じ設定で再生成」機能
- **簡単インストール／アンインストール**: 標準 NSIS インストーラ。アンインストール時に「アプリケーションデータを削除」を選べばモデル・ランタイムを含むデータフォルダも連動削除

## 🖥️ 動作要件

- **OS**: Windows 11 / 10（64bit）
- **GPU**: NVIDIA GPU（**VRAM 8GB 以上** 推奨、CUDA 対応ドライバ）
- **RAM**: 16GB 以上推奨
- **ストレージ**: 初回セットアップ時に約 10GB の空き容量

## 📥 インストール方法

### 推奨: GitHub Releases からダウンロード

1. [Releases ページ](../../releases) を開く
2. 最新版の `ImageCreator_X.Y.Z_x64-setup.exe` をダウンロード
3. ダブルクリックで実行

### ⚠️ Windows SmartScreen の警告について

現在コード署名証明書を取得していないため、初回実行時に以下の警告が出ます:

```
WindowsによってPCが保護されました
このアプリの実行はWindowsによってブロックされました
```

**回避方法**: 「**詳細情報**」をクリック → 「**実行**」ボタンが現れるのでクリック

これは OSS の初期リリースで一般的な挙動で、悪意のあるソフトではありません。
気になる方は[ダウンロード時の SHA256 をリリースノートで確認](../../releases)してください。

### 初回起動

アプリを起動すると **セットアップウィザード** が開き、以下を順番に行います:

1. NVIDIA GPU の検出
2. ライセンス同意（Anima は非商用ライセンス）
3. データフォルダの選択（モデル・ランタイム保存先）
4. 必要ファイルのダウンロード（**合計約 10GB**、30 分〜2 時間）
   - ComfyUI portable（画像生成エンジン）
   - llama.cpp + Qwen2.5-3B GGUF（プロンプト変換 LLM）
   - Anima モデル本体（3 ファイル）

セットアップが終わると、メイン画面で **「ComfyUI 起動」「llama-server 起動」** ボタンを押し、日本語プロンプトを入力するだけで画像生成できます。

## 🧠 既定モデル: Anima

[circlestone-labs/Anima](https://huggingface.co/circlestone-labs/Anima) は NVIDIA Cosmos-Predict2-2B ベースのアニメ特化モデルです。

> ⚠️ **Anima は非商用ライセンス**で配布されています。商用利用には CircleStone Labs からの個別ライセンス取得が必要です。

詳細は Hugging Face のモデルページを参照してください。

## 📚 ドキュメント

- [アーキテクチャ](docs/architecture.md) — 全体構成と各モジュールの役割
- [モデル拡張ガイド](docs/model-extensibility.md) — Anima 以外のモデルを追加する手順
- [ユーザーガイド](docs/user-guide.md) — 使い方と画面解説
- [アイコン差し替え](docs/icon-replacement.md) — カスタムアイコンを使う方法
- [リリース手順](docs/release-process.md) — メンテナ向けリリースフロー

## 🛠️ 開発環境セットアップ

### 必要なツール

- **Node.js** 20+ / **npm** 10+
- **Rust** stable (x86_64-pc-windows-msvc)
- **Visual Studio Build Tools 2022**（C++ ワークロード）
- **Git**

### ローカル開発

```powershell
# 依存インストール
npm install

# 開発モード起動（Vite + Tauri ホットリロード）
npm run tauri:dev

# 型チェック
npm run typecheck

# 本番ビルド（NSIS インストーラ生成）
npm run tauri:build

# アプリアイコン再生成（installer/assets/icon-source.png を差し替えた後）
npm run icon:regen
```

### Rust 側

```powershell
cd src-tauri
cargo check
cargo test
```

## 🏗️ 自動ビルド（CI / Release）

- **Push to main / PR**: 自動でビルド検証（[ci.yml](.github/workflows/ci.yml)）
- **タグ push (`v*.*.*`)**: 自動でビルド→ドラフト Release 作成（[release.yml](.github/workflows/release.yml)）

## 📄 ライセンス

- **アプリ本体**: MIT License（[LICENSE](LICENSE) 参照）
- **利用するモデル・ランタイム**: それぞれのライセンスに従う
  - Anima: Non-Commercial License（CircleStone Labs）
  - ComfyUI: GPL-3.0
  - llama.cpp: MIT
  - Qwen2.5: Apache 2.0

ライセンス順守はユーザー責任です。

## 🙏 謝辞

- [CircleStone Labs](https://huggingface.co/circlestone-labs) — Anima モデル提供
- [comfyanonymous/ComfyUI](https://github.com/comfyanonymous/ComfyUI) — 画像生成エンジン
- [ggml-org/llama.cpp](https://github.com/ggml-org/llama.cpp) — 軽量 LLM 実行環境
- [Qwen Team](https://huggingface.co/Qwen) — Qwen2.5 モデル提供
- [Tauri](https://tauri.app/) — 軽量デスクトップアプリフレームワーク
- [Mantine](https://mantine.dev/) — React UI コンポーネント
