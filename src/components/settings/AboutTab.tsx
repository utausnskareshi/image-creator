import { useEffect, useState } from 'react';
import {
  Stack,
  Card,
  Group,
  Text,
  Title,
  Button,
  Code,
  Badge,
  Divider,
  CopyButton,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconEraser,
  IconRestore,
  IconFolderOpen,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { getVersion } from '@tauri-apps/api/app';
import {
  clearTranslationCache,
  getSettingsPath,
  logPath,
  saveSettings,
} from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import { createDefaultSettings } from '../../types';

// 設定: 詳細タブ
// バージョン情報、ストレージパス、ユーティリティ
export function AboutTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, setSettings } = useAppStore();

  const [paths, setPaths] = useState<{
    settings?: string;
    appLog?: string;
  }>({});
  const [busy, setBusy] = useState(false);
  // バージョンは tauri.conf.json を単一の真実とし getVersion() で動的取得する。
  // (複数箇所にハードコードしてドリフトする問題を防ぐ)
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((e) => console.error('バージョン取得失敗', e));
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const [s, lg] = await Promise.all([
          getSettingsPath(),
          logPath('app'),
        ]);
        setPaths({ settings: s, appLog: lg });
      } catch (e) {
        console.error('パス取得失敗', e);
      }
    })();
  }, []);

  const onClearCache = async () => {
    setBusy(true);
    try {
      const count = await clearTranslationCache();
      notifications.show({
        title: t('common.confirm'),
        message: t('settings.about.cleared', { count }),
        color: 'blue',
      });
    } catch (e) {
      notifications.show({
        title: 'エラー',
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const onReset = async () => {
    if (!confirm(`${t('settings.about.resetSettings')}\n\n${t('settings.about.resetSettingsDescription')}`)) {
      return;
    }
    setBusy(true);
    try {
      // データフォルダだけは保持（モデル類はそのままに）
      const fresh = {
        ...createDefaultSettings(),
        dataFolder: settings.dataFolder,
      };
      await saveSettings(fresh);
      setSettings(fresh);
      notifications.show({
        title: t('common.confirm'),
        message: t('settings.about.resetSettings'),
        color: 'blue',
      });
      navigate('/setup');
    } catch (e) {
      notifications.show({
        title: 'エラー',
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const onOpenDataFolder = async () => {
    if (!settings.dataFolder) return;
    try {
      // Tauri の shell plugin 経由でエクスプローラで開く
      await openUrl(settings.dataFolder);
    } catch (e) {
      notifications.show({
        title: 'エラー',
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  return (
    <Stack gap="md">
      <Title order={4}>{t('settings.about.title')}</Title>

      {/* バージョン情報 */}
      <Card withBorder padding="md" radius="md">
        <Stack gap="xs">
          <Group justify="space-between">
            <Text fw={500}>{t('app.title')}</Text>
            <Badge variant="light">{appVersion ? `v${appVersion}` : '...'}</Badge>
          </Group>
          <Text size="xs" c="dimmed">
            {t('app.subtitle')}
          </Text>
        </Stack>
      </Card>

      {/* ストレージパス */}
      <Card withBorder padding="md" radius="md">
        <Stack gap="sm">
          <Text fw={500}>{t('settings.about.storagePaths')}</Text>

          <PathRow label={t('settings.about.settingsPath')} path={paths.settings} />
          <PathRow label={t('settings.general.dataFolder')} path={settings.dataFolder ?? '-'} />
          <PathRow label={t('settings.about.appLogPath')} path={paths.appLog} />

          {settings.dataFolder && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconFolderOpen size={14} />}
              onClick={onOpenDataFolder}
              style={{ alignSelf: 'flex-start' }}
            >
              {t('settings.about.openDataFolder')}
            </Button>
          )}
        </Stack>
      </Card>

      <Divider />

      {/* ユーティリティ */}
      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <Text fw={500}>{t('settings.about.utilities')}</Text>

          <div>
            <Group justify="space-between" align="end" gap="xs">
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={500}>
                  {t('settings.about.clearTranslationCache')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('settings.about.clearTranslationCacheDescription')}
                </Text>
              </div>
              <Button
                variant="default"
                leftSection={<IconEraser size={14} />}
                onClick={onClearCache}
                loading={busy}
              >
                {t('settings.about.clearTranslationCache')}
              </Button>
            </Group>
          </div>

          <Divider />

          <div>
            <Group justify="space-between" align="end" gap="xs">
              <div style={{ flex: 1 }}>
                <Text size="sm" fw={500}>
                  {t('settings.about.resetSettings')}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('settings.about.resetSettingsDescription')}
                </Text>
              </div>
              <Button
                color="red"
                variant="light"
                leftSection={<IconRestore size={14} />}
                onClick={onReset}
                loading={busy}
              >
                {t('settings.about.resetSettings')}
              </Button>
            </Group>
          </div>
        </Stack>
      </Card>
    </Stack>
  );
}

function PathRow({ label, path }: { label: string; path: string | undefined }) {
  if (!path) return null;
  return (
    <Group justify="space-between" gap="xs" wrap="nowrap">
      <Text size="xs" c="dimmed" style={{ minWidth: 120 }}>
        {label}
      </Text>
      <Group gap="xs" style={{ flex: 1, justifyContent: 'flex-end' }}>
        <Code style={{ fontSize: 11, wordBreak: 'break-all' }}>{path}</Code>
        <CopyButton value={path} timeout={1200}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? 'コピーしました' : 'コピー'}>
              <ActionIcon size="xs" variant="subtle" onClick={copy}>
                {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
    </Group>
  );
}
