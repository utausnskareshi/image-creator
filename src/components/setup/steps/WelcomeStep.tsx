import { Stack, Text, Title, List, ThemeIcon } from '@mantine/core';
import { IconCircleCheck, IconDownload, IconSparkles } from '@tabler/icons-react';
import { useTranslation } from '../../../i18n/useTranslation';

// ステップ1: ようこそ画面
// セットアップウィザード全体の流れを説明する
export function WelcomeStep() {
  const { t } = useTranslation();
  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.welcome.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.welcome.intro')}
        </Text>
      </div>

      <Stack gap="xs">
        <Title order={5}>{t('setup.welcome.thisSetup')}</Title>
        <List
          spacing="xs"
          size="sm"
          icon={
            <ThemeIcon color="image-creator" size={22} radius="xl">
              <IconCircleCheck size={14} />
            </ThemeIcon>
          }
        >
          <List.Item>{t('setup.welcome.item.license')}</List.Item>
          <List.Item>{t('setup.welcome.item.gpu')}</List.Item>
          <List.Item>{t('setup.welcome.item.folder')}</List.Item>
          <List.Item>{t('setup.welcome.item.summary')}</List.Item>
        </List>
      </Stack>

      <Stack gap="xs">
        <Title order={5}>{t('setup.welcome.nextSteps')}</Title>
        <List
          spacing="xs"
          size="sm"
          icon={
            <ThemeIcon color="gray" size={22} radius="xl">
              <IconDownload size={14} />
            </ThemeIcon>
          }
        >
          <List.Item>{t('setup.welcome.next.comfy')}</List.Item>
          <List.Item>{t('setup.welcome.next.anima')}</List.Item>
          <List.Item>{t('setup.welcome.next.llama')}</List.Item>
        </List>
        <Text size="xs" c="dimmed">
          {t('setup.welcome.diskHint')}
        </Text>
      </Stack>

      <Stack gap="xs">
        <Title order={5}>{t('setup.welcome.envTitle')}</Title>
        <List
          spacing="xs"
          size="sm"
          icon={
            <ThemeIcon color="image-creator" size={22} radius="xl" variant="light">
              <IconSparkles size={14} />
            </ThemeIcon>
          }
        >
          <List.Item>{t('setup.welcome.env.gpu')}</List.Item>
          <List.Item>{t('setup.welcome.env.os')}</List.Item>
          <List.Item>{t('setup.welcome.env.ram')}</List.Item>
        </List>
      </Stack>
    </Stack>
  );
}
