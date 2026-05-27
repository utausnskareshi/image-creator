import { Stack, Title, Text, Tabs } from '@mantine/core';
import { IconAdjustments, IconBox, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from '../i18n/useTranslation';
import { GeneralTab } from '../components/settings/GeneralTab';
import { ModelManagementTab } from '../components/settings/ModelManagementTab';
import { AboutTab } from '../components/settings/AboutTab';

// 設定ページ
// 一般 / モデル管理 / 詳細 の 3 タブ構成
export function SettingsPage() {
  const { t } = useTranslation();

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{t('settings.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('settings.description')}
        </Text>
      </div>

      <Tabs defaultValue="general" keepMounted={false}>
        <Tabs.List>
          <Tabs.Tab value="general" leftSection={<IconAdjustments size={14} />}>
            {t('settings.tab.general')}
          </Tabs.Tab>
          <Tabs.Tab value="models" leftSection={<IconBox size={14} />}>
            {t('settings.tab.models')}
          </Tabs.Tab>
          <Tabs.Tab value="about" leftSection={<IconInfoCircle size={14} />}>
            {t('settings.tab.about')}
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general" pt="md">
          <GeneralTab />
        </Tabs.Panel>
        <Tabs.Panel value="models" pt="md">
          <ModelManagementTab />
        </Tabs.Panel>
        <Tabs.Panel value="about" pt="md">
          <AboutTab />
        </Tabs.Panel>
      </Tabs>
    </Stack>
  );
}
