# モデル拡張ガイド

ImageCreatorはAnima以外の画像生成AIモデルにも対応できる設計です。本ドキュメントでは、新規モデルを追加する手順と設計思想を解説します。

## 基本コンセプト

モデルは「データ駆動」で管理されます。Rust/TypeScriptコードに直接モデル情報を書き込まず、JSONファイルとComfyUIワークフローテンプレートだけで新規モデルを定義可能です。

```
resources/
  models/
    registry.json              ← モデル一覧
    anima.json                 ← Anima定義
    <new-model>.json           ← 新規モデル定義をここに追加
  workflows/
    anima_base.json            ← Anima用ComfyUIワークフロー
    <new-model>.json           ← 新規モデル用ワークフロー
  prompts/
    translation_system.txt           ← Anima用のプロンプト変換指示
    translation_<new-model>.txt      ← 必要なら追加
```

## 新規モデル追加手順

### Step 1: ModelDescriptor JSON を作成

`resources/models/<model-id>.json` を作成:

```jsonc
{
  "id": "<model-id>",
  "displayName": "表示名 v1.0",
  "version": "1.0",
  "architecture": "sdxl | sd15 | flux | cosmos-predict2 | ...",
  "license": {
    "name": "ライセンス名",
    "url": "ライセンス確認URL",
    "commercialUse": true | false
  },
  "files": [
    {
      "filename": "model.safetensors",
      "url": "https://huggingface.co/.../resolve/main/model.safetensors",
      "sha256": "abcdef...",
      "size": 1234567890,
      "comfyUISubdir": "checkpoints | diffusion_models | vae | text_encoders | loras"
    }
  ],
  "workflowTemplate": "<model-id>.json",
  "defaults": {
    "width": 1024,
    "height": 1024,
    "steps": 30,
    "cfg": 7.0,
    "sampler": "euler_a",
    "scheduler": "normal"
  },
  "promptFormat": {
    "qualityPrefix": "",
    "negativeDefault": "",
    "tagOrder": []
  },
  "minVramGb": 6,
  "promptTranslationProfile": "default | anime | photoreal | ..."
}
```

#### フィールド説明

| フィールド | 説明 |
|---|---|
| `id` | 内部識別子（英数小文字+ハイフン） |
| `displayName` | UI表示名 |
| `architecture` | 内部ロジックでの分岐用（同じアーキテクチャは同じワークフローを流用可） |
| `license.commercialUse` | 商用OKならtrue。falseならアプリ内で警告表示 |
| `files[]` | ダウンロード対象ファイル一覧（複数可） |
| `comfyUISubdir` | ComfyUI標準のサブフォルダ名（`models/`配下） |
| `workflowTemplate` | `resources/workflows/`内のテンプレートファイル名 |
| `defaults` | UIに反映される推奨値 |
| `promptFormat` | プロンプト整形ルール |
| `minVramGb` | 警告判定の下限VRAM |
| `promptTranslationProfile` | 日本語→英語変換時のスタイル指定（タグ系/自然文系等） |

### Step 2: ComfyUIワークフローを用意

`resources/workflows/<model-id>.json` に、ComfyUI APIフォーマットのワークフローJSONを配置します。

ComfyUIで通常のワークフローを組んだあと、「Save (API Format)」で書き出したJSONをベースにします。**プロンプトとパラメータはプレースホルダ**にしておきます:

```jsonc
{
  "3": {
    "class_type": "CheckpointLoaderSimple",
    "inputs": {
      "ckpt_name": "{{MODEL_FILE}}"
    }
  },
  "6": {
    "class_type": "CLIPTextEncode",
    "inputs": {
      "text": "{{POSITIVE_PROMPT}}",
      "clip": ["3", 1]
    }
  },
  // ...
}
```

プレースホルダ:
- `{{MODEL_FILE}}`: メインモデルファイル名
- `{{POSITIVE_PROMPT}}`: ポジティブプロンプト
- `{{NEGATIVE_PROMPT}}`: ネガティブプロンプト
- `{{WIDTH}}`, `{{HEIGHT}}`, `{{STEPS}}`, `{{CFG}}`, `{{SAMPLER}}`, `{{SCHEDULER}}`, `{{SEED}}`

Rust側 `comfyui_manager` がこれらを実行時に置換します。

### Step 3: registry.json に登録

`resources/models/registry.json` を編集:

```jsonc
{
  "version": 1,
  "models": [
    { "id": "anima", "descriptor": "anima.json", "default": true },
    { "id": "<new-model>", "descriptor": "<new-model>.json", "default": false }
  ]
}
```

### Step 4: （任意）プロンプト変換プロファイル追加

新モデルがタグ系（Animaやanime系）と異なるスタイルを要求する場合、専用の変換システムプロンプトを用意できます:

`resources/prompts/translation_<profile>.txt`

`ModelDescriptor.promptTranslationProfile` で参照されます。

### Step 5: 再起動

アプリ起動時にregistry.jsonを読み込むので、再起動すると新モデルが設定画面に現れます。

## 内部実装の指針（開発者向け）

- フロント: `src/lib/model-registry.ts` がregistry.jsonをロードし、UI選択肢を生成
- バックエンド: `src-tauri/src/model_registry.rs` がワークフローテンプレートを置換・ComfyUIに投入
- ファイル整合性チェックはダウンロード後にSHA256検証
- モデル切替時はComfyUI側のモデルキャッシュを破棄（VRAM逼迫回避）

## 既知の制約

- 異なるアーキテクチャ間でワークフローテンプレートは共有不可（明示的に別ファイルを用意）
- ControlNet等の高度な拡張は現状非対応（将来Phase）
