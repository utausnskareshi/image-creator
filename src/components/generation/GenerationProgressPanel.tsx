import { useEffect, useState } from 'react';
import {
  Card,
  Stack,
  Group,
  Text,
  Progress,
  Image,
  Badge,
  Button,
  Alert,
  Box,
} from '@mantine/core';
import { IconAlertCircle, IconX } from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { comfyuiInterrupt } from '../../lib/tauri';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n';
import type { ComfyUIWebSocketState } from '../../lib/useComfyUIWebSocket';

interface GenerationProgressPanelProps {
  ws: ComfyUIWebSocketState;
}

// anima_base.json のノードID → i18n キー
// ワークフロー差し替え時はここを更新する（将来 _meta.title から自動取得予定）
const NODE_LABEL_KEY: Record<string, TranslationKey> = {
  '1': 'gen.progress.node.model',
  '2': 'gen.progress.node.textEncoder',
  '3': 'gen.progress.node.vae',
  '4': 'gen.progress.node.positive',
  '5': 'gen.progress.node.negative',
  '6': 'gen.progress.node.latent',
  '7': 'gen.progress.node.sampling',
  '8': 'gen.progress.node.vaeDecode',
  '9': 'gen.progress.node.save',
};

// 生成中の進捗・プレビュー・キャンセルを統合表示
// ws.executing が true、もしくは進行中のプレビューがある間だけ表示する
export function GenerationProgressPanel({ ws }: GenerationProgressPanelProps) {
  const { t } = useTranslation();
  const [interrupting, setInterrupting] = useState(false);

  const nodeLabel = (nodeId: string | null): string => {
    if (!nodeId) return '-';
    const key = NODE_LABEL_KEY[nodeId];
    if (key) return t(key);
    return t('gen.progress.node.generic', { id: nodeId });
  };

  // 実行が終わったらキャンセル状態もリセット
  useEffect(() => {
    if (!ws.executing) {
      setInterrupting(false);
    }
  }, [ws.executing]);

  const onInterrupt = async () => {
    setInterrupting(true);
    try {
      await comfyuiInterrupt();
      notifications.show({
        title: t('gen.progress.cancelNotifyTitle'),
        message: t('gen.progress.cancelNotifyMessage'),
        color: 'blue',
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notifications.show({
        title: t('gen.progress.cancelFailTitle'),
        message: msg,
        color: 'red',
      });
      setInterrupting(false);
    }
  };

  // 表示する内容がない場合は何も描画しない
  const hasContent = ws.executing || ws.previewUrl != null || ws.error != null;
  if (!hasContent) return null;

  const stepPercent =
    ws.step != null && ws.step.max > 0
      ? (ws.step.value / ws.step.max) * 100
      : null;

  // サンプリング以外（モデル読込など）でも視覚的フィードバックを出すため、
  // step がない時は不確定スピナー（不定進捗）を使う
  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Badge color="image-creator" variant="filled">
              {t('gen.progress.badge')}
            </Badge>
            <Text size="sm" fw={600}>
              {nodeLabel(ws.currentNode)}
            </Text>
          </Group>
          {ws.executing && (
            <Button
              size="xs"
              color="red"
              variant="light"
              leftSection={<IconX size={14} />}
              onClick={onInterrupt}
              loading={interrupting}
            >
              {t('gen.progress.cancel')}
            </Button>
          )}
        </Group>

        {ws.step != null ? (
          <Box>
            <Group justify="space-between" mb={4}>
              <Text size="xs" c="dimmed">
                {t('gen.progress.step', { value: ws.step.value, max: ws.step.max })}
              </Text>
              <Text size="xs" c="dimmed">
                {stepPercent != null ? `${stepPercent.toFixed(0)}%` : ''}
              </Text>
            </Group>
            <Progress
              value={stepPercent ?? 0}
              striped
              animated
              color="image-creator"
              size="md"
            />
          </Box>
        ) : (
          <Progress value={100} striped animated color="image-creator" size="md" />
        )}

        {ws.previewUrl && (
          <Box>
            <Text size="xs" c="dimmed" mb={4}>
              {t('gen.progress.preview')}
            </Text>
            <Image
              src={ws.previewUrl}
              alt={t('gen.progress.previewAlt')}
              radius="md"
              fit="contain"
              h={320}
              style={{ background: 'rgba(0,0,0,0.2)' }}
            />
          </Box>
        )}

        {ws.error && (
          <Alert color="red" icon={<IconAlertCircle />} variant="light">
            <Text size="sm">{ws.error}</Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
