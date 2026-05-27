# ImageCreator アーキテクチャ

## 全体像

```
┌────────────────────────────────────────────────────────────┐
│  ImageCreator.exe                                          │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Frontend (React + TypeScript / Vite)               │  │
│  │   - シンプル/詳細モードUI                            │  │
│  │   - ギャラリー / 設定                                │  │
│  │   - セットアップウィザード                           │  │
│  └──────────────────────────────────────────────────────┘  │
│                          ▲                                 │
│                          │ Tauri IPC                       │
│                          ▼                                 │
│  ┌──────────────────────────────────────────────────────┐  │
│  │  Backend (Rust / Tauri)                              │  │
│  │   - プロセス制御 (ComfyUI / llama.cpp)               │  │
│  │   - ダウンロードマネージャ                           │  │
│  │   - SQLite (ギャラリー)                              │  │
│  │   - GPU検出 / 設定管理                               │  │
│  └──────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────┘
         │ HTTP                       │ HTTP
         ▼                            ▼
┌──────────────────┐         ┌──────────────────┐
│ llama.cpp server │         │ ComfyUI (API)    │
│  CPU実行         │         │  CUDA実行        │
│  Qwen2.5-3B GGUF │         │  Anima 2B        │
│  ポート: 8189    │         │  ポート: 8188    │
└──────────────────┘         └──────────────────┘
   日本語→英語                  画像生成
   プロンプト変換                ComfyUIワークフロー実行
                                       │
                                       ▼
                              ┌──────────────────┐
                              │ NVIDIA GPU       │
                              │ (CUDA / VRAM)    │
                              └──────────────────┘
```

## 主要コンポーネント

### 1. Frontend (React + TypeScript)
- **役割**: ユーザーインターフェース全般
- **状態管理**: Zustand
- **画面構成**:
  - セットアップウィザード（初回のみ）
  - 生成画面（シンプル/詳細モード切替）
  - ギャラリー画面
  - 設定画面（モデル管理・パス変更等）
  - ログビューア

### 2. Backend (Tauri / Rust)
- **役割**: OSリソースアクセス・プロセス制御・永続化
- **主要モジュール**:
  - `comfyui_manager`: ComfyUIプロセス起動/停止/監視
  - `llm_manager`: llama-serverプロセス起動/停止/監視
  - `downloader`: HTTP/HFからのファイルDL（進捗・レジューム・SHA256）
  - `gpu_detect`: nvidia-smiラッパー（CUDA有無・VRAM容量検出）
  - `gallery`: SQLite永続化、PNG metadata読み書き
  - `settings`: ユーザー設定（JSON）

### 3. 推論バックエンド

#### ComfyUI (画像生成)
- 公式 Windows portable版を初回DL（CUDA同梱、Pythonエンベデッド版）
- `--listen 127.0.0.1 --port 8188 --disable-auto-launch` で起動
- HTTP/WebSocket APIで制御
- 中間プレビュー画像をWebSocket経由で取得

#### llama.cpp server (プロンプト変換)
- 公式リリースのCPU専用ビルドを採用（軽量・依存最小）
- Qwen2.5-3B-Instruct Q4_K_M（約2GB、日本語精度高）を初回DL
- `llama-server -m model.gguf --port 8189 --host 127.0.0.1` で起動
- OpenAI互換API（`/v1/chat/completions`）を使用

## ファイルレイアウト（実行時）

```
C:\Program Files\ImageCreator\          # アプリ本体（Tauri 標準 NSIS でインストール）
  image-creator.exe
  resources\
    workflows\
      anima_base.json
      anima_turbo.json
    models\
      registry.json
      anima.json
    prompts\
      translation_anime_tags.txt
  uninstall.exe                          # アンインストーラ（NSIS 生成）

%LOCALAPPDATA%\ImageCreator\             # ユーザーデータ（チェックボックス ON で削除 → データフォルダも連動削除）
  settings.json                          # ユーザー設定 + .uninstall_info（データフォルダパス退避）
  gallery.db                             # SQLite履歴
  logs\                                  # ログファイル

<ユーザー選択フォルダ>\                  # 推論ランタイム＆モデル（容量大）
  runtime\
    ComfyUI_windows_portable\            # ComfyUI portable一式
    llama-server\
      llama-server.exe
  models\
    anima\
      anima-base-v1.0.safetensors
      qwen_3_06b_base.safetensors
      qwen_image_vae.safetensors
    llm\
      qwen2.5-3b-instruct-q4_k_m.gguf
  output\                                # 生成画像（既定）
```

## モデル拡張性設計

将来Anima以外のモデルを追加できるよう、モデルは以下の抽象化を介して扱います。

### ModelDescriptor (`resources/models/<id>.json`)
```jsonc
{
  "id": "anima",
  "displayName": "Anima v1.0",
  "version": "1.0",
  "architecture": "cosmos-predict2-2b",
  "license": {
    "name": "CircleStone Labs Non-Commercial License",
    "url": "https://huggingface.co/circlestone-labs/Anima",
    "commercialUse": false
  },
  "files": [
    {
      "filename": "anima-base-v1.0.safetensors",
      "url": "https://huggingface.co/circlestone-labs/Anima/resolve/main/...",
      "sha256": "...",
      "size": 4200000000,
      "comfyUISubdir": "diffusion_models"
    }
    // ...
  ],
  "workflowTemplate": "anima_base.json",
  "defaults": {
    "width": 1024,
    "height": 1024,
    "steps": 30,
    "cfg": 4.5,
    "sampler": "euler_a",
    "scheduler": "normal"
  },
  "promptFormat": {
    "qualityPrefix": "masterpiece, best quality, score_7, safe, ",
    "negativeDefault": "worst quality, low quality, score_1, score_2, score_3, artist name",
    "tagOrder": ["meta", "subject", "character", "series", "artist", "general"]
  },
  "minVramGb": 6
}
```

### registry.json
```jsonc
{
  "version": 1,
  "models": [
    { "id": "anima", "descriptor": "anima.json", "default": true }
  ]
}
```

新モデルを追加するには:
1. `resources/models/<new-model>.json` を追加
2. `resources/workflows/<new-workflow>.json` を追加（ComfyUI APIフォーマット）
3. `registry.json` にエントリ追加

詳細は [model-extensibility.md](model-extensibility.md) を参照。

## アンインストール戦略

Tauri 標準の NSIS インストーラ + カスタムフック (`src-tauri/nsis/hooks.nsi`) が以下を担当:

1. **PREUNINSTALL**: 関連プロセス (image-creator.exe / llama-server.exe / ComfyUI python.exe) を kill し、
   データフォルダのパスを退避（`%LOCALAPPDATA%\ImageCreator\.uninstall_info` または
   `HKCU\Software\ImageCreator\DataFolder` から取得し `%TEMP%` に保存）
2. アプリ本体 `C:\Program Files\ImageCreator\` を削除
3. Tauri 標準の **「アプリケーションデータを削除」チェックボックス**が
   `%LOCALAPPDATA%\ImageCreator`（ユーザーデータ）を削除するか決定
4. **POSTUNINSTALL**: ユーザーデータが削除されたか（`settings.json` の有無）で判定し、
   - 削除済み → 退避パスを使ってデータフォルダ（モデル・ランタイム）も**連動削除**
   - 残存 → データフォルダも保持
5. レジストリエントリ（プログラムと機能への登録 + `HKCU\Software\ImageCreator`）も削除

> 設計メモ: MessageBox ダイアログは使わない。Windows 設定経由のアンインストールが
> silent モードでダイアログを抑制する事例があったため、チェックボックスの結果を
> 「ユーザーデータの有無」で検出して連動させる方式を採用している。

チェックボックスを OFF にした場合、再インストール時に同じデータフォルダを指定すれば
既存ファイルがサイズ判定で再 DL 不要として自動認識されます。

## セキュリティ・プライバシー

- 外部通信は **モデル/ランタイムDL時のみ**（HF / GitHub Release）
- 推論はすべてローカル
- テレメトリ送信なし
- DL前にURLとSHA256を表示し、改ざん検知可能に

## ライセンス境界

- アプリ本体: MIT
- Anima: Non-Commercial（ユーザーが順守）
- ComfyUI: GPL-3.0（バイナリ配布のためインストール後ユーザーフォルダに展開／コードベースには取り込まない）
- llama.cpp: MIT
- Qwen2.5: Apache 2.0
