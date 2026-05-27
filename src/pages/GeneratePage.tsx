import { Stack, Title, Text, Group, SimpleGrid, Badge } from '@mantine/core';
import { IconWifi, IconWifiOff } from '@tabler/icons-react';
import { ComfyUIControl } from '../components/generation/ComfyUIControl';
import { LlamaServerControl } from '../components/generation/LlamaServerControl';
import { ModeSwitch } from '../components/generation/ModeSwitch';
import { SimpleMode } from '../components/generation/SimpleMode';
import { AdvancedMode } from '../components/generation/AdvancedMode';
import { GenerationProgressPanel } from '../components/generation/GenerationProgressPanel';
import { useGenerationStore } from '../stores/generationStore';
import { useComfyUIWebSocket } from '../lib/useComfyUIWebSocket';
import { useTranslation } from '../i18n/useTranslation';

// 生成ページ
// シンプル/詳細モードを切り替えて使用する
// WebSocket を通じて ComfyUI からのライブ進捗・プレビューを受信する（Phase 7）
export function GeneratePage() {
  const mode = useGenerationStore((s) => s.mode);
  const ws = useComfyUIWebSocket({ port: 8188 });
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>{t('gen.title')}</Title>
          <Text c="dimmed" size="sm">
            {mode === 'simple' ? t('gen.subtitleSimple') : t('gen.subtitleAdvanced')}
          </Text>
        </div>
        <Group gap="sm">
          <Badge
            variant="light"
            color={ws.connected ? 'teal' : 'gray'}
            leftSection={
              ws.connected ? <IconWifi size={12} /> : <IconWifiOff size={12} />
            }
          >
            {t('gen.live.prefix')} {ws.connected ? t('gen.live.connected') : t('gen.live.disconnected')}
          </Badge>
          <ModeSwitch />
        </Group>
      </Group>

      <SimpleGrid cols={{ base: 1, md: 2 }} spacing="md">
        <ComfyUIControl />
        <LlamaServerControl />
      </SimpleGrid>

      <GenerationProgressPanel ws={ws} />

      {mode === 'simple' ? <SimpleMode /> : <AdvancedMode />}
    </Stack>
  );
}
