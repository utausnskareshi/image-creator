# Changelog

このプロジェクトの主要な変更履歴を記録します。
書式は [Keep a Changelog](https://keepachangelog.com/ja/1.1.0/) に準拠し、
バージョニングは [Semantic Versioning](https://semver.org/lang/ja/) に従います。

## [Unreleased]
<!-- 次回リリースに含まれる変更を追記 -->

## [1.0.0] - 2026-05-27

### 追加 (Added)
- 初回リリース
- Tauri + React + TypeScript ベースの GUI アプリケーション
- ComfyUI portable をバックエンドとした画像生成機能
- 既定モデル: **Anima** (circlestone-labs/Anima)
- 日本語プロンプトの自動英語変換（ローカル LLM `Qwen2.5-3B-Instruct` を CPU 実行）
- シンプルモード（初心者向け：日本語入力＋サイズ・枚数のみ）
- 詳細モード（玄人向け：全パラメータ手動制御＋Accordion UI）
- セットアップウィザード（GPU 検出・ライセンス同意・データフォルダ選択・自動ダウンロード）
- ライブプレビュー（WebSocket 経由で ComfyUI の中間ステップを表示）
- ギャラリー機能（SQLite 履歴＋PNG メタデータ＋お気に入り＋「同じ設定で再生成」）
- Turbo LoRA 対応（高速生成オプション）
- ログビューア（アプリ / ComfyUI / llama-server をタブ切替で参照）
- 言語切替（日本語 / 英語、即時反映。全画面 i18n 対応）
- モデル拡張性（registry.json でモデルを追加可能）
- 標準 NSIS インストーラ（「アプリケーションデータを削除」チェックボックスで
  モデル・ランタイムを含むデータフォルダを連動削除）

### 既知の制約 (Known Limitations)
- コード署名なしのため Windows SmartScreen の警告が表示される
- Anima 用 ComfyUI ワークフローは暫定版（実機検証で調整が必要な可能性あり）
- バッチ生成は逐次実行（ComfyUI のキュー仕様による）

[Unreleased]: https://github.com/utausnskareshi/image-creator/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/utausnskareshi/image-creator/releases/tag/v1.0.0
