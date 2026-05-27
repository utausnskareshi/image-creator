import { useState } from 'react';
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
  SegmentedControl,
  Title,
  Box,
} from '@mantine/core';
import {
  IconWand,
  IconAlertCircle,
  IconSquare,
  IconRectangleVertical,
  IconRectangle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import {
  useGenerationStore,
  ASPECT_RATIO_DIMENSIONS,
  ANIMA_DEFAULTS,
  QUALITY_PREFIX,
  randomSeed,
  type AspectRatio,
} from '../../stores/generationStore';
import { generateImage, translatePrompt } from '../../lib/tauri';
import { ImageResultsGrid } from './ImageResultsGrid';
import { useAppStore } from '../../stores/appStore';
import { preflightComfyUI, preflightLlm } from '../../lib/serverPreflight';
import { useTranslation } from '../../i18n/useTranslation';
import type { GeneratedImageData } from '../../types';

// シンプルモード
// 日本語入力 → サイズ・枚数選択 → 1ボタンで生成
// 初心者向け：パラメータの細かい調整は不要
export function SimpleMode() {
  const { t } = useTranslation();
  const simple = useGenerationStore((s) => s.simple);
  const setSimple = useGenerationStore((s) => s.setSimple);
  const selectedModelId = useGenerationStore((s) => s.selectedModelId);
  // サーバ起動プリフライト用
  const dataFolder = useAppStore((s) => s.settings.dataFolder);

  // 一時状態（永続化不要）
  const [phase, setPhase] = useState<'idle' | 'translating' | 'generating' | 'done' | 'error'>('idle');
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [results, setResults] = useState<GeneratedImageData[]>([]);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [lastEnglish, setLastEnglish] = useState<string>('');

  const dims = ASPECT_RATIO_DIMENSIONS[simple.aspectRatio];

  const isBusy = phase === 'translating' || phase === 'generating';

  const onGenerate = async () => {
    if (!simple.japanesePrompt.trim()) {
      notifications.show({
        title: t('gen.simple.inputErrorTitle'),
        message: t('gen.simple.inputErrorMessage'),
        color: 'yellow',
      });
      return;
    }
    setError(null);
    setResults([]);

    // プリフライト: シンプルモードは LLM → 生成 の2段階なので両方確認
    if (dataFolder) {
      const llmMsg = await preflightLlm(dataFolder);
      if (llmMsg) {
        setError(llmMsg);
        setPhase('error');
        notifications.show({
          title: t('gen.simple.llmNotStartedTitle'),
          message: t('gen.simple.llmNotStartedMessage'),
          color: 'red',
          autoClose: 10000,
        });
        return;
      }
      const comfyMsg = await preflightComfyUI(dataFolder);
      if (comfyMsg) {
        setError(comfyMsg);
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

    setPhase('translating');
    setProgress({ current: 0, total: simple.count });
    const startedAt = performance.now();

    try {
      // Step 1: 日本語 → 英語タグ変換
      const translation = await translatePrompt({
        text: simple.japanesePrompt,
        profile: 'anime_tags',
      });
      setLastEnglish(translation.translated);

      // Step 2: 枚数分ループで生成（毎回ランダムシード）
      setPhase('generating');
      const collected: GeneratedImageData[] = [];
      const finalPositive = QUALITY_PREFIX + translation.translated;

      for (let i = 0; i < simple.count; i++) {
        setProgress({ current: i, total: simple.count });
        const seed = randomSeed();
        const resp = await generateImage({
          positivePrompt: finalPositive,
          negativePrompt: ANIMA_DEFAULTS.negativePrompt,
          width: dims.width,
          height: dims.height,
          steps: ANIMA_DEFAULTS.steps,
          cfg: ANIMA_DEFAULTS.cfg,
          sampler: ANIMA_DEFAULTS.sampler,
          scheduler: ANIMA_DEFAULTS.scheduler,
          seed,
          modelId: selectedModelId,
          workflowTemplate: 'anima_base.json',
          japanesePrompt: simple.japanesePrompt, // ギャラリー記録用
        });
        collected.push(...resp.images);
        setResults([...collected]);
      }

      setProgress({ current: simple.count, total: simple.count });
      setElapsedMs(performance.now() - startedAt);
      setPhase('done');

      notifications.show({
        title: t('gen.simple.doneTitle'),
        message: t('gen.simple.doneMessage', { count: collected.length }),
        color: 'green',
      });
    } catch (e) {
      const rawMsg = e instanceof Error ? e.message : String(e);
      // 接続エラー系を分かりやすいメッセージに変換
      const lower = rawMsg.toLowerCase();
      let msg = rawMsg;
      if (
        lower.includes('error sending request') ||
        lower.includes('connection refused') ||
        lower.includes('connect error') ||
        lower.includes('os error 10061')
      ) {
        // どちらのサーバに繋がらないかは含まれる URL（8188 or 8189）から判定
        if (rawMsg.includes(':8189')) {
          msg = t('gen.simple.errLlmConnect', { raw: rawMsg });
        } else if (rawMsg.includes(':8188')) {
          msg = t('gen.simple.errComfyConnect', { raw: rawMsg });
        }
      }
      setError(msg);
      setPhase('error');
      // 失敗時に「生成中... (N/M)」表示が残らないよう進捗をリセット
      setProgress({ current: 0, total: 0 });
      notifications.show({
        title: t('gen.simple.failTitle'),
        message: msg.split('\n')[0] ?? rawMsg,
        color: 'red',
        autoClose: 10000,
      });
    }
  };

  return (
    <Stack gap="md">
      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <Title order={4}>{t('gen.simple.title')}</Title>

          <Textarea
            label={t('gen.simple.promptLabel')}
            description={t('gen.simple.promptDescription')}
            placeholder={t('gen.simple.promptPlaceholder')}
            value={simple.japanesePrompt}
            onChange={(e) => setSimple({ japanesePrompt: e.currentTarget.value })}
            minRows={3}
            autosize
            disabled={isBusy}
          />

          {/* サイズ選択（アイコン付き） */}
          <Box>
            <Text size="sm" fw={500} mb={6}>
              {t('gen.simple.size')}
            </Text>
            <SegmentedControl
              value={simple.aspectRatio}
              onChange={(v) => setSimple({ aspectRatio: v as AspectRatio })}
              disabled={isBusy}
              color="image-creator"
              fullWidth
              data={[
                {
                  value: 'square',
                  label: (
                    <Group gap={6} justify="center">
                      <IconSquare size={16} />
                      <span>{t('gen.simple.square')}</span>
                    </Group>
                  ),
                },
                {
                  value: 'portrait',
                  label: (
                    <Group gap={6} justify="center">
                      <IconRectangleVertical size={16} />
                      <span>{t('gen.simple.portrait')}</span>
                    </Group>
                  ),
                },
                {
                  value: 'landscape',
                  label: (
                    <Group gap={6} justify="center">
                      <IconRectangle size={16} />
                      <span>{t('gen.simple.landscape')}</span>
                    </Group>
                  ),
                },
              ]}
            />
            <Text size="xs" c="dimmed" mt={4}>
              {dims.width} × {dims.height} px
            </Text>
          </Box>

          {/* 枚数選択 */}
          <Box>
            <Text size="sm" fw={500} mb={6}>
              {t('gen.simple.count')}
            </Text>
            <SegmentedControl
              value={String(simple.count)}
              onChange={(v) => setSimple({ count: parseInt(v, 10) })}
              disabled={isBusy}
              color="image-creator"
              fullWidth
              data={[
                { value: '1', label: t('gen.simple.countN', { n: 1 }) },
                { value: '2', label: t('gen.simple.countN', { n: 2 }) },
                { value: '3', label: t('gen.simple.countN', { n: 3 }) },
                { value: '4', label: t('gen.simple.countN', { n: 4 }) },
              ]}
            />
          </Box>

          <Button
            color="image-creator"
            size="lg"
            leftSection={<IconWand size={18} />}
            onClick={onGenerate}
            loading={isBusy}
            fullWidth
          >
            {phase === 'translating'
              ? t('gen.simple.translating')
              : phase === 'generating'
                ? t('gen.simple.generating', { current: progress.current + 1, total: progress.total })
                : t('gen.simple.generate')}
          </Button>

          {isBusy && progress.total > 0 && (
            <Progress
              value={(progress.current / progress.total) * 100}
              striped
              animated
              color="image-creator"
            />
          )}

          {lastEnglish && phase !== 'error' && (
            <Card padding="xs" radius="sm" withBorder>
              <Text size="xs" c="dimmed" mb={2}>
                {t('gen.simple.translatedLabel')}
              </Text>
              <Text size="xs" style={{ fontFamily: 'monospace', wordBreak: 'break-word' }}>
                {lastEnglish}
              </Text>
              <Badge size="xs" variant="light" color="teal" mt={4}>
                {t('gen.simple.advancedHint')}
              </Badge>
            </Card>
          )}
        </Stack>
      </Card>

      {error && (
        <Alert color="red" icon={<IconAlertCircle />} title={t('common.error')}>
          <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
            {error}
          </Text>
        </Alert>
      )}

      <ImageResultsGrid images={results} elapsedMs={elapsedMs} />
    </Stack>
  );
}
