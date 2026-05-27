import { useState } from 'react';
import {
  Stack,
  Card,
  Group,
  Text,
  Select,
  TextInput,
  Button,
  Title,
  Alert,
  Code,
} from '@mantine/core';
import {
  IconAlertCircle,
  IconFolderOpen,
  IconRefresh,
  IconWand,
} from '@tabler/icons-react';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { useNavigate } from 'react-router-dom';
import { notifications } from '@mantine/notifications';
import { useAppStore } from '../../stores/appStore';
import { saveSettings } from '../../lib/tauri';
import { useTranslation } from '../../i18n/useTranslation';

// 設定: 一般タブ
// 言語切替・データフォルダ表示と変更・セットアップ再実行
export function GeneralTab() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { settings, setSettings } = useAppStore();
  const [busy, setBusy] = useState(false);

  const persistLocale = async (newLocale: 'ja' | 'en') => {
    const newSettings = { ...settings, locale: newLocale };
    setSettings(newSettings); // 即時UI反映
    try {
      await saveSettings(newSettings);
    } catch (e) {
      notifications.show({
        title: 'エラー',
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  const changeDataFolder = async () => {
    try {
      const selected = await openDialog({
        directory: true,
        multiple: false,
        title: t('settings.general.dataFolder'),
        defaultPath: settings.dataFolder ?? undefined,
      });
      if (typeof selected !== 'string') return;
      setBusy(true);
      const newSettings = { ...settings, dataFolder: selected };
      await saveSettings(newSettings);
      setSettings(newSettings);
      notifications.show({
        title: t('common.save'),
        message: t('settings.general.changeDataFolderHint'),
        color: 'blue',
        autoClose: 8000,
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

  const runSetupAgain = () => {
    navigate('/setup');
  };

  return (
    <Stack gap="md">
      <Title order={4}>{t('settings.general.title')}</Title>

      <Card withBorder padding="md" radius="md">
        <Stack gap="md">
          <Select
            label={t('settings.general.language')}
            description={t('settings.general.languageDescription')}
            data={[
              { value: 'ja', label: t('language.ja') },
              { value: 'en', label: t('language.en') },
            ]}
            value={settings.locale}
            onChange={(v) => v && persistLocale(v as 'ja' | 'en')}
            allowDeselect={false}
          />

          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('settings.general.dataFolder')}
            </Text>
            <Text size="xs" c="dimmed" mb={6}>
              {t('settings.general.dataFolderDescription')}
            </Text>
            <Group align="end" gap="xs">
              <TextInput
                value={settings.dataFolder ?? ''}
                readOnly
                style={{ flex: 1 }}
                styles={{ input: { fontFamily: 'monospace', fontSize: 12 } }}
              />
              <Button
                variant="default"
                leftSection={<IconFolderOpen size={14} />}
                onClick={changeDataFolder}
                loading={busy}
              >
                {t('settings.general.changeDataFolder')}
              </Button>
            </Group>
            <Alert color="yellow" variant="light" mt="xs" p="xs" icon={<IconAlertCircle size={14} />}>
              <Text size="xs">{t('settings.general.changeDataFolderHint')}</Text>
            </Alert>
          </div>

          <div>
            <Text size="sm" fw={500} mb={4}>
              {t('settings.general.runSetupAgain')}
            </Text>
            <Text size="xs" c="dimmed" mb={6}>
              {t('settings.general.runSetupAgainHint')}
            </Text>
            <Button
              variant="light"
              leftSection={<IconWand size={14} />}
              onClick={runSetupAgain}
            >
              {t('settings.general.runSetupAgain')}
            </Button>
          </div>

          <Group justify="space-between" gap={4}>
            <Text size="xs" c="dimmed">
              {t('settings.general.dataFolder')}: <Code>{settings.dataFolder ?? '-'}</Code>
            </Text>
            <Button
              size="xs"
              variant="subtle"
              leftSection={<IconRefresh size={12} />}
              onClick={() => window.location.reload()}
            >
              アプリ再読込
            </Button>
          </Group>
        </Stack>
      </Card>
    </Stack>
  );
}
