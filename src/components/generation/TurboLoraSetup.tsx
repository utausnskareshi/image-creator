import { useEffect, useRef, useState } from 'react';
import {
  Stack,
  Group,
  Text,
  Badge,
  Button,
  Progress,
  Alert,
  Card,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconCircleCheck,
  IconDownload,
  IconRefresh,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import {
  downloadFiles,
  loadModelDescriptor,
  pathExists,
} from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { DownloadJob, DownloadProgress, ModelDescriptor } from '../../types';
import { formatBytes, formatPercent } from '../../lib/format';

interface TurboLoraSetupProps {
  /// Turbo LoRA ファイルの有無を親に通知（トグル有効化判定）
  onAvailabilityChange?: (available: boolean) => void;
}

// Turbo LoRA の単独ダウンロードUI
// 既にローカルにあれば「ダウンロード済み」表示、なければダウンロードボタン
export function TurboLoraSetup({ onAvailabilityChange }: TurboLoraSetupProps) {
  const { settings } = useAppStore();
  const { t } = useTranslation();
  const dataFolder = settings.dataFolder ?? '';

  const [descriptor, setDescriptor] = useState<ModelDescriptor | null>(null);
  const [available, setAvailable] = useState<boolean>(false);
  const [checking, setChecking] = useState(true);
  const [downloading, setDownloading] = useState(false);
  const [progress, setProgress] = useState<DownloadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const unlistenRef = useRef<UnlistenFn | null>(null);

  // ファイルのフルパス
  const loraJobInfo = (): { job: DownloadJob; localPath: string } | null => {
    if (!descriptor || !dataFolder) return null;
    const optional = descriptor.optionalFiles?.find((f) => f.role === 'lora');
    if (!optional) return null;
    const localPath = [dataFolder, 'models', descriptor.id, optional.comfyUISubdir, optional.filename]
      .join('\\')
      .replace(/[\\/]+/g, '\\');
    const sha256 = optional.sha256 && optional.sha256 !== 'TBD_FILL_AT_RUNTIME' ? optional.sha256 : null;
    return {
      job: {
        id: `optional-${descriptor.id}-turbo-lora`,
        displayName: optional.displayName ?? optional.filename,
        url: optional.url,
        destPath: localPath,
        expectedSha256: sha256,
        expectedSize: optional.sizeBytes,
        // 失敗時の診断 UI が公式ページへ誘導できるよう情報を引き渡す
        releasePage: optional.releasePage ?? descriptor.homepage ?? null,
        sourceProject: optional.sourceProject ?? descriptor.vendor ?? null,
      },
      localPath,
    };
  };

  // descriptor をロード & 存在チェック
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const d = await loadModelDescriptor('anima.json');
        if (cancelled) return;
        setDescriptor(d);
      } catch (e) {
        if (cancelled) return;
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const checkAvailability = async () => {
    if (!descriptor || !dataFolder) return;
    const info = loraJobInfo();
    if (!info) return;
    setChecking(true);
    try {
      const exists = await pathExists(info.localPath);
      setAvailable(exists);
      onAvailabilityChange?.(exists);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setChecking(false);
    }
  };

  useEffect(() => {
    if (descriptor && dataFolder) {
      checkAvailability();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [descriptor, dataFolder]);

  // 進捗イベント購読
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const fn = await listen<DownloadProgress>('download:progress', (event) => {
        if (cancelled) return;
        if (event.payload.jobId.includes('turbo-lora')) {
          setProgress(event.payload);
        }
      });
      if (cancelled) {
        fn();
      } else {
        unlistenRef.current = fn;
      }
    })();
    return () => {
      cancelled = true;
      unlistenRef.current?.();
      unlistenRef.current = null;
    };
  }, []);

  const onDownload = async () => {
    const info = loraJobInfo();
    if (!info) {
      notifications.show({
        title: t('gen.turbo.notFoundTitle'),
        message: t('gen.turbo.notFoundMessage'),
        color: 'red',
      });
      return;
    }
    setDownloading(true);
    setError(null);
    try {
      await downloadFiles([info.job]);
      notifications.show({
        title: t('gen.turbo.doneTitle'),
        message: t('gen.turbo.doneMessage'),
        color: 'green',
      });
      await checkAvailability();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      notifications.show({
        title: t('gen.turbo.failTitle'),
        message: msg,
        color: 'red',
      });
    } finally {
      setDownloading(false);
    }
  };

  const info = loraJobInfo();
  const optionalDef = descriptor?.optionalFiles?.find((f) => f.role === 'lora');

  if (!dataFolder) {
    return (
      <Alert color="yellow" icon={<IconAlertCircle />} variant="light">
        {t('gen.turbo.dataFolderMissing')}
      </Alert>
    );
  }

  return (
    <Card withBorder padding="sm" radius="md">
      <Stack gap="xs">
        <Group justify="space-between" wrap="nowrap">
          <Group gap="xs">
            <Text size="sm" fw={600}>
              {t('gen.turbo.label')}
            </Text>
            {checking ? (
              <Badge variant="light" color="gray">{t('gen.turbo.checking')}</Badge>
            ) : available ? (
              <Badge variant="filled" color="teal" leftSection={<IconCircleCheck size={12} />}>
                {t('gen.turbo.downloaded')}
              </Badge>
            ) : (
              <Badge variant="light" color="orange">{t('gen.turbo.notDownloaded')}</Badge>
            )}
          </Group>
          <Button
            size="xs"
            variant="default"
            leftSection={<IconRefresh size={12} />}
            onClick={checkAvailability}
            disabled={downloading || checking}
          >
            {t('gen.turbo.recheck')}
          </Button>
        </Group>

        {optionalDef?.description && (
          <Text size="xs" c="dimmed">
            {optionalDef.description}
          </Text>
        )}
        {info && (
          <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
            {t('gen.turbo.localPath', { path: info.localPath })}
          </Text>
        )}

        {!available && (
          <Button
            size="sm"
            color="image-creator"
            leftSection={<IconDownload size={14} />}
            onClick={onDownload}
            loading={downloading}
          >
            {t('gen.turbo.downloadButton')}
          </Button>
        )}

        {downloading && progress && (
          <div>
            <Group justify="space-between" mb={4}>
              <Text size="xs" c="dimmed">
                {progress.status === 'downloading' ? t('gen.turbo.downloading') : progress.status}
              </Text>
              <Text size="xs" c="dimmed">
                {formatBytes(progress.downloadedBytes)}
                {progress.totalBytes != null && ` / ${formatBytes(progress.totalBytes)}`}
              </Text>
            </Group>
            <Progress
              value={formatPercent(progress.downloadedBytes, progress.totalBytes)}
              striped
              animated
              color="image-creator"
              size="xs"
            />
          </div>
        )}

        {error && (
          <Alert color="red" icon={<IconAlertCircle />} variant="light">
            <Text size="xs">{error}</Text>
          </Alert>
        )}

        {available && (
          <Alert color="teal" icon={<IconCircleCheck />} variant="light">
            <Text size="xs">
              {t('gen.turbo.availableHint', { workflow: 'anima_turbo.json' })}
            </Text>
          </Alert>
        )}
      </Stack>
    </Card>
  );
}
