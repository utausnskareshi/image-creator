import { useCallback, useEffect, useState } from 'react';
import {
  Stack,
  Card,
  Group,
  Text,
  Badge,
  Title,
  Button,
  Loader,
  List,
  ThemeIcon,
  Anchor,
  Alert,
  Divider,
} from '@mantine/core';
import {
  IconCircleCheck,
  IconCircleX,
  IconExternalLink,
  IconRefresh,
  IconAlertTriangle,
} from '@tabler/icons-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import {
  loadModelRegistry,
  loadModelDescriptor,
  pathExists,
} from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { ModelDescriptor, ModelRegistry } from '../../types';

interface FileStatus {
  filename: string;
  role: string;
  comfyUISubdir: string;
  fullPath: string;
  exists: boolean;
}

interface ModelEntry {
  id: string;
  descriptor: ModelDescriptor;
  requiredStatus: FileStatus[];
  optionalStatus: FileStatus[];
  loading: boolean;
}

function joinWinPath(...parts: string[]): string {
  return parts.filter(Boolean).join('\\').replace(/[\\/]+/g, '\\');
}

// 設定: モデル管理タブ
// registry.json に登録されているすべてのモデルを表示
// 各モデルの必須/任意ファイルの取得状態を一覧表示
export function ModelManagementTab() {
  const { t } = useTranslation();
  const { settings } = useAppStore();
  const dataFolder = settings.dataFolder ?? '';

  const [entries, setEntries] = useState<ModelEntry[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const loadAll = useCallback(async () => {
    setRefreshing(true);
    setError(null);
    try {
      const registry: ModelRegistry = await loadModelRegistry();
      const enabled = registry.models.filter((m) => m.enabled);
      const items: ModelEntry[] = [];
      for (const m of enabled) {
        const descriptor: ModelDescriptor = await loadModelDescriptor(m.descriptor);
        // 必須ファイル
        const required: FileStatus[] = await Promise.all(
          descriptor.files.map(async (f) => {
            const full = joinWinPath(dataFolder, 'models', descriptor.id, f.comfyUISubdir, f.filename);
            const exists = dataFolder ? await pathExists(full) : false;
            return {
              filename: f.filename,
              role: f.role,
              comfyUISubdir: f.comfyUISubdir,
              fullPath: full,
              exists,
            };
          }),
        );
        // 任意ファイル
        const optional: FileStatus[] = await Promise.all(
          (descriptor.optionalFiles ?? []).map(async (f) => {
            const full = joinWinPath(dataFolder, 'models', descriptor.id, f.comfyUISubdir, f.filename);
            const exists = dataFolder ? await pathExists(full) : false;
            return {
              filename: f.filename,
              role: f.role,
              comfyUISubdir: f.comfyUISubdir,
              fullPath: full,
              exists,
            };
          }),
        );
        items.push({
          id: descriptor.id,
          descriptor,
          requiredStatus: required,
          optionalStatus: optional,
          loading: false,
        });
      }
      setEntries(items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshing(false);
    }
  }, [dataFolder]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const openLicense = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('URL を開けませんでした:', e);
    }
  };

  return (
    <Stack gap="md">
      <Group justify="space-between">
        <div>
          <Title order={4}>{t('settings.models.title')}</Title>
          <Text size="sm" c="dimmed">
            {t('settings.models.description')}
          </Text>
        </div>
        <Button
          size="sm"
          variant="default"
          leftSection={<IconRefresh size={14} />}
          onClick={loadAll}
          loading={refreshing}
        >
          {t('common.refresh')}
        </Button>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertTriangle />}>
          {error}
        </Alert>
      )}

      {entries == null && !error && (
        <Group justify="center" py="xl">
          <Loader size="sm" />
          <Text size="sm" c="dimmed">
            {t('settings.models.checkingFiles')}
          </Text>
        </Group>
      )}

      {entries?.map((entry) => {
        const allRequired = entry.requiredStatus.every((f) => f.exists);
        const someRequired = entry.requiredStatus.some((f) => f.exists);
        const status = allRequired
          ? 'all'
          : someRequired
            ? 'partial'
            : 'missing';

        return (
          <Card key={entry.id} withBorder padding="md" radius="md">
            <Stack gap="sm">
              <Group justify="space-between" wrap="wrap" gap="xs">
                <Group gap="xs">
                  <Text fw={600}>{entry.descriptor.displayName}</Text>
                  <Badge variant="light" size="xs">
                    v{entry.descriptor.version}
                  </Badge>
                </Group>
                <Group gap="xs">
                  {status === 'all' && (
                    <Badge color="green" variant="light">
                      {t('settings.models.allDownloaded')}
                    </Badge>
                  )}
                  {status === 'partial' && (
                    <Badge color="yellow" variant="light">
                      {t('settings.models.partiallyDownloaded')}
                    </Badge>
                  )}
                  {status === 'missing' && (
                    <Badge color="red" variant="light">
                      {t('settings.models.missing')}
                    </Badge>
                  )}
                  <Badge
                    color={entry.descriptor.license.commercialUse ? 'teal' : 'orange'}
                    variant="light"
                  >
                    {entry.descriptor.license.commercialUse
                      ? t('settings.models.commercialUseAllowed')
                      : t('settings.models.commercialUseProhibited')}
                  </Badge>
                </Group>
              </Group>

              {entry.descriptor.description && (
                <Text size="xs" c="dimmed">
                  {entry.descriptor.description}
                </Text>
              )}

              <Group gap="xs">
                <Anchor
                  size="xs"
                  onClick={() => openLicense(entry.descriptor.license.url)}
                  style={{ cursor: 'pointer' }}
                >
                  {t('settings.models.licenseLink')}
                </Anchor>
                <IconExternalLink size={10} />
              </Group>

              <Divider />

              <div>
                <Text size="sm" fw={500} mb={4}>
                  {t('settings.models.requiredFiles')}（{entry.requiredStatus.length} 件）
                </Text>
                <List
                  spacing={4}
                  size="sm"
                  icon={
                    <ThemeIcon color="gray" size={18} radius="xl" variant="light">
                      <IconCircleCheck size={10} />
                    </ThemeIcon>
                  }
                >
                  {entry.requiredStatus.map((f) => (
                    <List.Item
                      key={f.filename}
                      icon={
                        <ThemeIcon
                          color={f.exists ? 'green' : 'red'}
                          size={18}
                          radius="xl"
                          variant={f.exists ? 'filled' : 'light'}
                        >
                          {f.exists ? <IconCircleCheck size={10} /> : <IconCircleX size={10} />}
                        </ThemeIcon>
                      }
                    >
                      <Group gap={6}>
                        <Text size="xs" style={{ fontFamily: 'monospace' }}>
                          {f.comfyUISubdir}/{f.filename}
                        </Text>
                        <Badge size="xs" variant="light" color="gray">
                          {f.role}
                        </Badge>
                      </Group>
                    </List.Item>
                  ))}
                </List>
              </div>

              {entry.optionalStatus.length > 0 && (
                <div>
                  <Text size="sm" fw={500} mb={4}>
                    {t('settings.models.optionalFiles')}（{entry.optionalStatus.length} 件）
                  </Text>
                  <List
                    spacing={4}
                    size="sm"
                    icon={
                      <ThemeIcon color="gray" size={18} radius="xl" variant="light">
                        <IconCircleCheck size={10} />
                      </ThemeIcon>
                    }
                  >
                    {entry.optionalStatus.map((f) => (
                      <List.Item
                        key={f.filename}
                        icon={
                          <ThemeIcon
                            color={f.exists ? 'teal' : 'gray'}
                            size={18}
                            radius="xl"
                            variant={f.exists ? 'filled' : 'light'}
                          >
                            {f.exists ? <IconCircleCheck size={10} /> : <IconCircleX size={10} />}
                          </ThemeIcon>
                        }
                      >
                        <Text size="xs" style={{ fontFamily: 'monospace' }}>
                          {f.comfyUISubdir}/{f.filename}
                        </Text>
                      </List.Item>
                    ))}
                  </List>
                </div>
              )}
            </Stack>
          </Card>
        );
      })}
    </Stack>
  );
}
