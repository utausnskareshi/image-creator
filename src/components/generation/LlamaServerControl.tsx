import { useCallback, useEffect, useState } from 'react';
import { Card, Group, Text, Badge, Button, Stack, Loader, Alert } from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconAlertCircle,
  IconLanguage,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { llmStart, llmStop, llmStatus } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { LlmServerStatus } from '../../types';

/** llama-server ステータスポーリング間隔 (ミリ秒) */
const LLAMA_STATUS_POLL_INTERVAL_MS = 5000;

// llama-server（プロンプト変換用LLM）のステータス表示＋起動/停止
// Phase 5 テスト用パネル
export function LlamaServerControl() {
  const { settings } = useAppStore();
  const { t } = useTranslation();
  const [status, setStatus] = useState<LlmServerStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataFolder = settings.dataFolder ?? '';

  // useCallback で dataFolder を依存に取り、useEffect の依存配列から refresh が漏れる
  // stale closure を防止する。
  const refresh = useCallback(async () => {
    if (!dataFolder) return;
    try {
      const s = await llmStatus(dataFolder);
      setStatus(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [dataFolder]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, LLAMA_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await llmStart(dataFolder);
      notifications.show({
        title: t('gen.llm.startNotifyTitle'),
        message: t('gen.llm.startNotifyMessage'),
        color: 'green',
      });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      notifications.show({
        title: t('gen.llm.startFailTitle'),
        message: msg,
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const handleStop = async () => {
    setBusy(true);
    setError(null);
    try {
      await llmStop();
      notifications.show({
        title: t('gen.llm.stopNotifyTitle'),
        message: t('gen.llm.stopNotifyMessage'),
        color: 'blue',
      });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setBusy(false);
    }
  };

  if (!dataFolder) {
    return null; // ComfyUIControl 側で同じメッセージを出すため重複表示しない
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <IconLanguage size={18} />
            <Text fw={600}>{t('gen.llm.label')}</Text>
            {status?.processRunning && status?.apiReachable ? (
              <Badge color="green" variant="filled">{t('gen.llm.statusRunning')}</Badge>
            ) : status?.processRunning ? (
              <Badge color="yellow" variant="light">{t('gen.llm.statusWaitingApi')}</Badge>
            ) : status?.extracted && status?.modelPresent ? (
              <Badge color="gray" variant="light">{t('gen.llm.statusStopped')}</Badge>
            ) : !status?.extracted ? (
              <Badge color="red" variant="light">{t('gen.llm.statusNotSetup')}</Badge>
            ) : (
              <Badge color="red" variant="light">{t('gen.llm.statusModelMissing')}</Badge>
            )}
          </Group>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={refresh}
            disabled={busy}
          >
            {t('common.refresh')}
          </Button>
        </Group>

        <Group gap="xs">
          {status?.processRunning ? (
            <Button
              size="xs"
              color="red"
              leftSection={<IconPlayerStop size={14} />}
              onClick={handleStop}
              loading={busy}
            >
              {t('common.stop')}
            </Button>
          ) : (
            <Button
              size="xs"
              color="image-creator"
              leftSection={<IconPlayerPlay size={14} />}
              onClick={handleStart}
              loading={busy}
              disabled={!status?.extracted || !status?.modelPresent}
            >
              {t('common.start')}
            </Button>
          )}
          {busy && <Loader size="xs" />}
        </Group>

        {status?.serverPath && (
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {t('gen.llm.serverPath', { path: status.serverPath })}
          </Text>
        )}
        {status?.modelPath && (
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {t('gen.llm.modelPath', { path: status.modelPath, port: status.port })}
          </Text>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertCircle />} variant="light">
            <Text size="xs">{error}</Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
