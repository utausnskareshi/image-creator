import { useEffect, useState } from 'react';
import { TurboLoraSetup } from './TurboLoraSetup';
import {
  Card,
  Stack,
  Textarea,
  Button,
  Group,
  Text,
  Progress,
  Alert,
  Badge,
  NumberInput,
  Select,
  Slider,
  ActionIcon,
  Switch,
  Tooltip,
  Accordion,
  Box,
  SegmentedControl,
} from '@mantine/core';
import {
  IconWand,
  IconAlertCircle,
  IconDice,
  IconLanguage,
  IconRefresh,
  IconRestore,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  useGenerationStore,
  QUALITY_PREFIX,
  MAX_SEED,
  randomSeed,
} from '../../stores/generationStore';
import { useAppStore } from '../../stores/appStore';
import {
  generateImage,
  translatePrompt,
  loadModelRegistry,
} from '../../lib/tauri';
import { preflightComfyUI, preflightLlm } from '../../lib/serverPreflight';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n';
import { ImageResultsGrid } from './ImageResultsGrid';
import type { GeneratedImageData, ModelRegistry } from '../../types';

type TFn = (key: TranslationKey, params?: Record<string, string | number>) => string;

// reqwest 由来のテクニカルなエラーメッセージを判定し、対処方法付きのテキストに変換する
function humanizeTranslateError(rawMessage: string, t: TFn): string {
  const lower = rawMessage.toLowerCase();
  if (
    lower.includes('error sending request') ||
    lower.includes('connection refused') ||
    lower.includes('connect error') ||
    lower.includes('tcp connect') ||
    lower.includes('os error 10061')
  ) {
    return t('gen.adv.errLlmConnect', { raw: rawMessage });
  }
  if (lower.includes('プロファイル') && lower.includes('見つかりません')) {
    return t('gen.adv.errProfile', { raw: rawMessage });
  }
  return rawMessage;
}

// ComfyUI 公式のサンプラー名。A1111/Forge 系の 'euler_a' は ComfyUI では 'euler_ancestral'
const SAMPLERS = ['euler_ancestral', 'euler', 'er_sde', 'dpmpp_2m', 'dpmpp_2m_sde_gpu', 'dpmpp_sde'];
const SCHEDULERS = ['normal', 'karras', 'exponential', 'sgm_uniform', 'simple'];

const RESOLUTION_PRESETS: Array<{ label: string; w: number; h: number }> = [
  { label: '1024×1024', w: 1024, h: 1024 },
  { label: '832×1216', w: 832, h: 1216 },
  { label: '1216×832', w: 1216, h: 832 },
  { label: '768×768', w: 768, h: 768 },
  { label: '1536×1536', w: 1536, h: 1536 },
];

// 詳細モード
// すべてのパラメータを手動制御できる
// Accordion でセクション分けして見通しを良くする
export function AdvancedMode() {
  const { t } = useTranslation();
  const advanced = useGenerationStore((s) => s.advanced);
  const setAdvanced = useGenerationStore((s) => s.setAdvanced);
  const reset = useGenerationStore((s) => s.resetAdvancedToDefaults);
  const selectedModelId = useGenerationStore((s) => s.selectedModelId);
  const setSelectedModelId = useGenerationStore((s) => s.setSelectedModelId);
  // LLM 起動状態のプリフライトチェック用
  const dataFolder = useAppStore((s) => s.settings.dataFolder);

  // モデル一覧（拡張性のために registry を読む）
  const [models, setModels] = useState<ModelRegistry['models']>([]);
  // Turbo LoRA のローカル存在フラグ（トグル有効化に使う）
  const [turboLoraAvailable, setTurboLoraAvailable] = useState(false);

  // 実行中状態
  const [phase, setPhase] = useState<'idle' | 'translating' | 'generating' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [results, setResults] = useState<GeneratedImageData[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [translationInfo, setTranslationInfo] = useState<string | null>(null);
  // 変換専用のエラー（生成エラー [error] とは別管理）。プロンプトAccordion 内に表示
  const [translationError, setTranslationError] = useState<string | null>(null);

  // 起動時にモデル一覧をロード
  useEffect(() => {
    loadModelRegistry()
      .then((r) => setModels(r.models.filter((m) => m.enabled)))
      .catch((e) => {
        // registry が読めないとモデル選択 Select が空になり、生成自体が不可になる重大障害。
        // console だけでは UI 上のヒントが無いため通知も出す。
        console.error('registry ロード失敗', e);
        notifications.show({
          title: t('gen.adv.registryLoadFailTitle'),
          message: t('gen.adv.registryLoadFailMessage'),
          color: 'red',
          autoClose: 10000,
        });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const isBusy = phase === 'translating' || phase === 'generating';

  const onTranslate = async () => {
    if (!advanced.japanesePrompt.trim()) {
      notifications.show({
        title: t('gen.adv.inputEmptyTitle'),
        message: t('gen.adv.inputEmptyMessage'),
        color: 'yellow',
      });
      return;
    }
    setTranslating(true);
    setTranslationError(null);
    setTranslationInfo(null);

    // プリフライト: LLM 起動状態を確認
    if (dataFolder) {
      const preflightMsg = await preflightLlm(dataFolder);
      if (preflightMsg) {
        setTranslationError(preflightMsg);
        notifications.show({
          title: t('gen.simple.llmNotStartedTitle'),
          message: t('gen.simple.llmNotStartedMessage'),
          color: 'red',
          autoClose: 10000,
        });
        setTranslating(false);
        return;
      }
    }

    // 診断用ログ（開発時のみ確認できる）
    console.log('[translate] 開始', {
      text: advanced.japanesePrompt,
      profile: 'anime_tags',
    });
    try {
      const resp = await translatePrompt({
        text: advanced.japanesePrompt,
        profile: 'anime_tags',
      });
      console.log('[translate] 完了', {
        elapsedMs: resp.elapsedMs,
        fromCache: resp.fromCache,
        translatedLength: resp.translated.length,
        translatedPreview: resp.translated.slice(0, 80),
      });
      // LLM が空文字を返した場合の防御（Rust 側で空はエラーになる想定だが念のため）
      if (!resp.translated || resp.translated.trim() === '') {
        throw new Error(t('gen.adv.llmEmptyError'));
      }
      setAdvanced({ englishPrompt: resp.translated });
      setTranslationInfo(
        resp.fromCache
          ? t('gen.adv.translateInfoCache', { ms: resp.elapsedMs })
          : t('gen.adv.translateInfoFresh', { sec: (resp.elapsedMs / 1000).toFixed(1) }),
      );
      notifications.show({
        title: t('gen.adv.translateDoneTitle'),
        message: t('gen.adv.translateDoneMessage', { count: resp.translated.length }),
        color: 'green',
      });
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : String(e);
      const humanized = humanizeTranslateError(rawMsg, t);
      console.error('[translate] 失敗', e);
      setTranslationError(humanized);
      notifications.show({
        title: t('gen.adv.translateFailTitle'),
        message: humanized.split('\n')[0] ?? rawMsg, // 通知は1行目だけ表示
        color: 'red',
        autoClose: 10000,
      });
    } finally {
      setTranslating(false);
    }
  };

  const onRandomSeed = () => {
    setAdvanced({ seed: randomSeed() });
  };

  // バッチ生成時の seed 計算
  const calcSeed = (baseSeed: number, index: number): number => {
    if (advanced.seedMode === 'fixed') return baseSeed >= 0 ? baseSeed : randomSeed();
    if (advanced.seedMode === 'increment') {
      const base = baseSeed >= 0 ? baseSeed : randomSeed();
      return base + index;
    }
    // random
    return randomSeed();
  };

  const onGenerate = async () => {
    if (!advanced.englishPrompt.trim()) {
      notifications.show({
        title: t('gen.adv.englishEmptyTitle'),
        message: t('gen.adv.englishEmptyMessage'),
        color: 'yellow',
      });
      return;
    }

    // プリフライト: ComfyUI 起動状態を確認
    if (dataFolder) {
      const preflightMsg = await preflightComfyUI(dataFolder);
      if (preflightMsg) {
        setError(preflightMsg);
        setPhase('error');
        notifications.show({
          title: t('gen.simple.comfyNotStartedTitle'),
          message: t('gen.simple.comfyNotStartedMessage'),
          color: 'red',
          autoClose: 10000,
        });
        return;
      }
    }

    setPhase('generating');
    setError(null);
    setResults([]);
    setProgress({ current: 0, total: advanced.batchSize });
    const startedAt = performance.now();
    const finalPositive = advanced.usePrefix ? QUALITY_PREFIX + advanced.englishPrompt : advanced.englishPrompt;

    try {
      const collected: GeneratedImageData[] = [];
      for (let i = 0; i < advanced.batchSize; i++) {
        setProgress({ current: i, total: advanced.batchSize });
        const seed = calcSeed(advanced.seed, i);
        // Turbo LoRA 有効時は専用ワークフローと LoRA ファイル名を渡す
        const useTurbo = advanced.useTurboLora && turboLoraAvailable;
        const resp = await generateImage({
          positivePrompt: finalPositive,
          negativePrompt: advanced.negativePrompt,
          width: advanced.width,
          height: advanced.height,
          steps: advanced.steps,
          cfg: advanced.cfg,
          sampler: advanced.sampler,
          scheduler: advanced.scheduler,
          seed,
          modelId: selectedModelId,
          workflowTemplate: useTurbo ? 'anima_turbo.json' : 'anima_base.json',
          loraFile: useTurbo ? 'anima_turbo_lora.safetensors' : null,
          loraStrength: useTurbo ? 1.0 : null,
          japanesePrompt: advanced.japanesePrompt || null,
        });
        collected.push(...resp.images);
        setResults([...collected]);
      }
      setProgress({ current: advanced.batchSize, total: advanced.batchSize });
      setElapsedMs(performance.now() - startedAt);
      setPhase('done');

      notifications.show({
        title: t('gen.simple.doneTitle'),
        message: t('gen.simple.doneMessage', { count: collected.length }),
        color: 'green',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('error');
      // バッチ生成失敗時に「画像生成中... (N/M)」表示が残らないよう進捗をリセット
      setProgress({ current: 0, total: 0 });
      notifications.show({
        title: t('gen.simple.failTitle'),
        message: msg,
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Group justify="space-between">
            <Text fw={600}>{t('gen.adv.heading')}</Text>
            <Group gap="xs">
              <Tooltip label={t('gen.adv.resetTooltip')}>
                <ActionIcon variant="default" onClick={reset} disabled={isBusy}>
                  <IconRestore size={16} />
                </ActionIcon>
              </Tooltip>
            </Group>
          </Group>

          <Accordion variant="separated" multiple defaultValue={['prompt', 'sampling']}>
            {/* プロンプト */}
            <Accordion.Item value="prompt">
              <Accordion.Control>{t('gen.adv.section.prompt')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Textarea
                    label={t('gen.adv.japanesePromptLabel')}
                    description={t('gen.adv.japanesePromptDescription')}
                    placeholder={t('gen.adv.japanesePromptPlaceholder')}
                    value={advanced.japanesePrompt}
                    onChange={(e) => setAdvanced({ japanesePrompt: e.currentTarget.value })}
                    minRows={2}
                    autosize
                    disabled={isBusy}
                  />
                  <Group justify="flex-end">
                    {translationInfo && (
                      <Badge color="teal" variant="light" size="sm">
                        {translationInfo}
                      </Badge>
                    )}
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconLanguage size={14} />}
                      onClick={onTranslate}
                      loading={translating}
                      disabled={isBusy}
                    >
                      {t('gen.adv.translateButton')}
                    </Button>
                  </Group>

                  {/* 変換中・変換失敗の表示（プロンプトセクション内、ボタンの近く） */}
                  {translating && (
                    <Alert color="blue" variant="light" p="xs">
                      <Text size="xs">{t('gen.adv.translating')}</Text>
                    </Alert>
                  )}
                  {translationError && !translating && (
                    <Alert
                      color="red"
                      variant="light"
                      icon={<IconAlertCircle size={14} />}
                      title={t('gen.adv.translationFailTitle')}
                      p="xs"
                    >
                      <Text size="xs" style={{ whiteSpace: 'pre-wrap' }}>
                        {translationError}
                      </Text>
                      <Text size="xs" c="dimmed" mt={4}>
                        {t('gen.adv.translationFailHint')}
                      </Text>
                    </Alert>
                  )}

                  <Textarea
                    label={t('gen.adv.englishPromptLabel')}
                    description={
                      advanced.usePrefix
                        ? t('gen.adv.englishPromptDescPrefixOn', { prefix: QUALITY_PREFIX })
                        : t('gen.adv.englishPromptDescPrefixOff')
                    }
                    value={advanced.englishPrompt}
                    onChange={(e) => setAdvanced({ englishPrompt: e.currentTarget.value })}
                    minRows={3}
                    autosize
                    disabled={isBusy}
                    styles={{ input: { fontFamily: 'monospace' } }}
                  />
                  <Switch
                    label={t('gen.adv.usePrefix')}
                    description={QUALITY_PREFIX}
                    checked={advanced.usePrefix}
                    onChange={(e) => setAdvanced({ usePrefix: e.currentTarget.checked })}
                    disabled={isBusy}
                    color="image-creator"
                  />

                  <Textarea
                    label={t('gen.adv.negativeLabel')}
                    value={advanced.negativePrompt}
                    onChange={(e) => setAdvanced({ negativePrompt: e.currentTarget.value })}
                    minRows={2}
                    autosize
                    disabled={isBusy}
                    styles={{ input: { fontFamily: 'monospace' } }}
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* 解像度 */}
            <Accordion.Item value="resolution">
              <Accordion.Control>{t('gen.adv.section.resolution')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Group gap="xs">
                    {RESOLUTION_PRESETS.map((p) => (
                      <Button
                        key={p.label}
                        size="xs"
                        variant={
                          advanced.width === p.w && advanced.height === p.h ? 'filled' : 'default'
                        }
                        onClick={() => setAdvanced({ width: p.w, height: p.h })}
                        disabled={isBusy}
                      >
                        {p.label}
                      </Button>
                    ))}
                  </Group>
                  <Group grow>
                    <NumberInput
                      label={t('gen.adv.widthLabel')}
                      value={advanced.width}
                      onChange={(v) => setAdvanced({ width: typeof v === 'number' ? v : 1024 })}
                      min={256}
                      max={2048}
                      step={64}
                      disabled={isBusy}
                    />
                    <NumberInput
                      label={t('gen.adv.heightLabel')}
                      value={advanced.height}
                      onChange={(v) => setAdvanced({ height: typeof v === 'number' ? v : 1024 })}
                      min={256}
                      max={2048}
                      step={64}
                      disabled={isBusy}
                    />
                  </Group>
                  <Text size="xs" c="dimmed">
                    {t('gen.adv.resHintVram')}
                  </Text>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* サンプラー / Steps / CFG */}
            <Accordion.Item value="sampling">
              <Accordion.Control>{t('gen.adv.section.sampling')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Group grow>
                    <Select
                      label={t('gen.adv.samplerLabel')}
                      data={SAMPLERS}
                      value={advanced.sampler}
                      onChange={(v) => v && setAdvanced({ sampler: v })}
                      disabled={isBusy}
                    />
                    <Select
                      label={t('gen.adv.schedulerLabel')}
                      data={SCHEDULERS}
                      value={advanced.scheduler}
                      onChange={(v) => v && setAdvanced({ scheduler: v })}
                      disabled={isBusy}
                    />
                  </Group>
                  <Box>
                    <Group justify="space-between" mb={4}>
                      <Text size="sm" fw={500}>{t('gen.adv.stepsLabel')}</Text>
                      <Text size="sm" c="dimmed">{advanced.steps}</Text>
                    </Group>
                    <Slider
                      value={advanced.steps}
                      onChange={(v) => setAdvanced({ steps: v })}
                      min={10}
                      max={60}
                      step={1}
                      disabled={isBusy}
                      marks={[
                        { value: 20, label: '20' },
                        { value: 30, label: t('gen.adv.stepsMarkRecommended') },
                        { value: 50, label: '50' },
                      ]}
                    />
                  </Box>
                  <Box>
                    <Group justify="space-between" mb={4}>
                      <Text size="sm" fw={500}>{t('gen.adv.cfgLabel')}</Text>
                      <Text size="sm" c="dimmed">{advanced.cfg.toFixed(1)}</Text>
                    </Group>
                    <Slider
                      value={advanced.cfg}
                      onChange={(v) => setAdvanced({ cfg: v })}
                      min={1}
                      max={12}
                      step={0.5}
                      disabled={isBusy}
                      marks={[
                        { value: 4, label: '4' },
                        { value: 4.5, label: t('gen.adv.cfgMarkRecommended') },
                        { value: 8, label: '8' },
                      ]}
                    />
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* シード・バッチ */}
            <Accordion.Item value="seed">
              <Accordion.Control>{t('gen.adv.section.seed')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Group align="end" gap="xs">
                    <NumberInput
                      label={t('gen.adv.seedLabel')}
                      description={t('gen.adv.seedDescription')}
                      value={advanced.seed}
                      onChange={(v) => setAdvanced({ seed: typeof v === 'number' ? v : -1 })}
                      min={-1}
                      max={MAX_SEED}
                      style={{ flex: 1 }}
                      disabled={isBusy}
                    />
                    <Tooltip label={t('gen.adv.randomSeedTooltip')}>
                      <ActionIcon size="lg" variant="default" onClick={onRandomSeed} disabled={isBusy}>
                        <IconDice size={18} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>

                  <NumberInput
                    label={t('gen.adv.batchLabel')}
                    value={advanced.batchSize}
                    onChange={(v) => setAdvanced({ batchSize: typeof v === 'number' ? v : 1 })}
                    min={1}
                    max={10}
                    step={1}
                    disabled={isBusy}
                  />

                  <Box>
                    <Text size="sm" fw={500} mb={4}>
                      {t('gen.adv.seedMode')}
                    </Text>
                    <SegmentedControl
                      value={advanced.seedMode}
                      onChange={(v) =>
                        setAdvanced({ seedMode: v as 'fixed' | 'random' | 'increment' })
                      }
                      disabled={isBusy}
                      fullWidth
                      data={[
                        { value: 'random', label: t('gen.adv.seedMode.random') },
                        { value: 'increment', label: t('gen.adv.seedMode.increment') },
                        { value: 'fixed', label: t('gen.adv.seedMode.fixed') },
                      ]}
                    />
                    <Text size="xs" c="dimmed" mt={4}>
                      {advanced.seedMode === 'random' && t('gen.adv.seedMode.descRandom')}
                      {advanced.seedMode === 'increment' && t('gen.adv.seedMode.descIncrement')}
                      {advanced.seedMode === 'fixed' && t('gen.adv.seedMode.descFixed')}
                    </Text>
                  </Box>
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>

            {/* モデル選択・拡張機能 */}
            <Accordion.Item value="extensions">
              <Accordion.Control>{t('gen.adv.section.extensions')}</Accordion.Control>
              <Accordion.Panel>
                <Stack gap="sm">
                  <Select
                    label={t('gen.adv.modelLabel')}
                    description={t('gen.adv.modelDescription')}
                    data={models.map((m) => ({ value: m.id, label: m.id }))}
                    value={selectedModelId}
                    onChange={(v) => v && setSelectedModelId(v)}
                    disabled={isBusy}
                    leftSection={<IconRefresh size={14} />}
                  />

                  <TurboLoraSetup onAvailabilityChange={setTurboLoraAvailable} />

                  <Switch
                    label={t('gen.adv.useTurboLora')}
                    description={
                      turboLoraAvailable
                        ? t('gen.adv.turboLoraOn')
                        : t('gen.adv.turboLoraOff')
                    }
                    checked={advanced.useTurboLora}
                    onChange={(e) => setAdvanced({ useTurboLora: e.currentTarget.checked })}
                    disabled={!turboLoraAvailable || isBusy}
                    color="image-creator"
                  />
                </Stack>
              </Accordion.Panel>
            </Accordion.Item>
          </Accordion>

          <Button
            color="image-creator"
            size="md"
            leftSection={<IconWand size={16} />}
            onClick={onGenerate}
            loading={isBusy}
            fullWidth
          >
            {phase === 'generating'
              ? t('gen.adv.generating', { current: progress.current + 1, total: progress.total })
              : t('gen.adv.generate', { n: advanced.batchSize })}
          </Button>

          {isBusy && progress.total > 0 && (
            <Progress
              value={(progress.current / progress.total) * 100}
              striped
              animated
              color="image-creator"
            />
          )}
        </Stack>
      </Card>

      {error && (
        <Alert color="red" icon={<IconAlertCircle />} title={t('gen.adv.errorTitle')}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {error}
          </Text>
        </Alert>
      )}

      <ImageResultsGrid
        images={results}
        elapsedMs={elapsedMs}
        meta={{ prompt: advanced.englishPrompt }}
      />
    </Stack>
  );
}
