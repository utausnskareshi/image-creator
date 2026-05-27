import { useEffect, useState } from 'react';
import {
  Stack,
  Text,
  Title,
  TextInput,
  Button,
  Group,
  Card,
  Alert,
  Loader,
  Badge,
} from '@mantine/core';
import { IconFolderOpen, IconCircleCheck, IconAlertCircle } from '@tabler/icons-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { checkDiskSpace, checkWritable, suggestDefaultDataFolder } from '../../../lib/tauri';
import { REQUIRED_DATA_FOLDER_GB } from '../../../types';
import { useTranslation } from '../../../i18n/useTranslation';
import type { DiskSpaceInfo } from '../../../types';

interface DataFolderStepProps {
  dataFolder: string;
  onDataFolderChange: (path: string) => void;
  onValidationResult: (valid: boolean) => void;
}

// ステップ4: データフォルダ選択
// モデル・ランタイムを保存する先のフォルダを選び、空き容量・書込可否を検証する
export function DataFolderStep({
  dataFolder,
  onDataFolderChange,
  onValidationResult,
}: DataFolderStepProps) {
  const { t } = useTranslation();
  const [diskInfo, setDiskInfo] = useState<DiskSpaceInfo | null>(null);
  const [writable, setWritable] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 既定パスを初回ロード時に推奨
  useEffect(() => {
    if (!dataFolder) {
      suggestDefaultDataFolder()
        .then((path) => onDataFolderChange(path))
        .catch((e) => {
          console.error('既定パスの取得に失敗:', e);
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // dataFolder が変わるたびに検証を再実行（デバウンス込み）
  useEffect(() => {
    if (!dataFolder) {
      setDiskInfo(null);
      setWritable(null);
      onValidationResult(false);
      return;
    }

    const timer = setTimeout(() => {
      validate();
    }, 400);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dataFolder]);

  const validate = async () => {
    setLoading(true);
    setError(null);
    try {
      const [disk, isWritable] = await Promise.all([
        checkDiskSpace(dataFolder, REQUIRED_DATA_FOLDER_GB),
        checkWritable(dataFolder),
      ]);
      setDiskInfo(disk);
      setWritable(isWritable);
      onValidationResult(disk.meetsRequirement && isWritable);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onValidationResult(false);
    } finally {
      setLoading(false);
    }
  };

  const browseFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t('setup.folder.dialogTitle'),
        defaultPath: dataFolder || undefined,
      });
      if (typeof selected === 'string') {
        onDataFolderChange(selected);
      }
    } catch (e) {
      console.error('フォルダ選択でエラー:', e);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.folder.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.folder.intro', { gb: REQUIRED_DATA_FOLDER_GB })}
        </Text>
      </div>

      <Group align="end" gap="xs">
        <TextInput
          label={t('setup.folder.pathLabel')}
          placeholder={t('setup.folder.placeholder')}
          value={dataFolder}
          onChange={(e) => onDataFolderChange(e.currentTarget.value)}
          style={{ flex: 1 }}
        />
        <Button variant="default" leftSection={<IconFolderOpen size={16} />} onClick={browseFolder}>
          {t('common.browse')}
        </Button>
      </Group>

      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Text size="sm" fw={600}>{t('setup.folder.validationTitle')}</Text>

          {loading && (
            <Group gap="xs">
              <Loader size="xs" />
              <Text size="sm" c="dimmed">{t('setup.folder.validating')}</Text>
            </Group>
          )}

          {!loading && error && (
            <Alert color="red" icon={<IconAlertCircle />} variant="light">
              {error}
            </Alert>
          )}

          {!loading && diskInfo && (
            <Group justify="space-between">
              <Group gap="xs">
                {diskInfo.meetsRequirement ? (
                  <IconCircleCheck size={18} color="var(--mantine-color-green-6)" />
                ) : (
                  <IconAlertCircle size={18} color="var(--mantine-color-red-6)" />
                )}
                <Text size="sm">{t('setup.folder.diskFree')}</Text>
              </Group>
              <Group gap="xs">
                <Text size="sm">{diskInfo.availableGb.toFixed(1)} GB</Text>
                <Badge color={diskInfo.meetsRequirement ? 'green' : 'red'} variant="light">
                  {diskInfo.meetsRequirement
                    ? t('setup.folder.diskOk', { gb: REQUIRED_DATA_FOLDER_GB })
                    : t('setup.folder.diskNg')}
                </Badge>
              </Group>
            </Group>
          )}

          {!loading && writable != null && (
            <Group justify="space-between">
              <Group gap="xs">
                {writable ? (
                  <IconCircleCheck size={18} color="var(--mantine-color-green-6)" />
                ) : (
                  <IconAlertCircle size={18} color="var(--mantine-color-red-6)" />
                )}
                <Text size="sm">{t('setup.folder.writable')}</Text>
              </Group>
              <Badge color={writable ? 'green' : 'red'} variant="light">
                {writable ? t('setup.folder.writableOk') : t('setup.folder.writableNg')}
              </Badge>
            </Group>
          )}
        </Stack>
      </Card>

      <Text size="xs" c="dimmed">
        {t('setup.folder.hint')}
      </Text>
    </Stack>
  );
}
