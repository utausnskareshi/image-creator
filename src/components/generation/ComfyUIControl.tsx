import { useCallback, useEffect, useState } from 'react';
import { Card, Group, Text, Badge, Button, Stack, Loader, Alert } from '@mantine/core';
import {
  IconPlayerPlay,
  IconPlayerStop,
  IconRefresh,
  IconAlertCircle,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { comfyuiStart, comfyuiStop, comfyuiStatus } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ComfyUIStatus } from '../../types';

/** ComfyUI ステータスポーリング間隔 (ミリ秒) */
const COMFYUI_STATUS_POLL_INTERVAL_MS = 5000;

// ComfyUI のステータス表示＋起動・停止コントロール
// Phase 4 テスト用パネル。Phase 6 で正式UIに統合する
export function ComfyUIControl() {
  const { settings } = useAppStore();
  const { t } = useTranslation();
  const [status, setStatus] = useState<ComfyUIStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const dataFolder = settings.dataFolder ?? '';

  // useCallback で dataFolder を依存に取り、useEffect の依存配列から refresh が漏れる
  // stale closure を防止する (旧実装は eslint-disable で回避していた)。
  const refresh = useCallback(async () => {
    if (!dataFolder) return;
    try {
      const s = await comfyuiStatus(dataFolder);
      setStatus(s);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    }
  }, [dataFolder]);

  // 自動ポーリング
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, COMFYUI_STATUS_POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const handleStart = async () => {
    setBusy(true);
    setError(null);
    try {
      await comfyuiStart(dataFolder);
      notifications.show({
        title: t('gen.comfy.startNotifyTitle'),
        message: t('gen.comfy.startNotifyMessage'),
        color: 'green',
      });
      await refresh();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      notifications.show({
        title: t('gen.comfy.startFailTitle'),
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
      await comfyuiStop();
      notifications.show({
        title: t('gen.comfy.stopNotifyTitle'),
        message: t('gen.comfy.stopNotifyMessage'),
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
    return (
      <Alert color="yellow" icon={<IconAlertCircle />}>
        {t('gen.comfy.dataFolderMissing')}
      </Alert>
    );
  }

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Text fw={600}>{t('gen.comfy.label')}</Text>
            {status?.processRunning && status?.apiReachable ? (
              <Badge color="green" variant="filled">{t('gen.comfy.statusRunning')}</Badge>
            ) : status?.processRunning ? (
              <Badge color="yellow" variant="light">{t('gen.comfy.statusWaitingApi')}</Badge>
            ) : status?.extracted ? (
              <Badge color="gray" variant="light">{t('gen.comfy.statusStopped')}</Badge>
            ) : (
              <Badge color="red" variant="light">{t('gen.comfy.statusNotSetup')}</Badge>
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
              disabled={!status?.extracted}
            >
              {t('common.start')}
            </Button>
          )}
          {busy && <Loader size="xs" />}
        </Group>

        {status?.rootPath && (
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {t('gen.comfy.pathInfo', { path: status.rootPath, port: status.port })}
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
