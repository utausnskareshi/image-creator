import { Stack, Text, Title, Alert, Checkbox, Card, Anchor, Group } from '@mantine/core';
import { IconAlertTriangle, IconExternalLink } from '@tabler/icons-react';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useTranslation } from '../../../i18n/useTranslation';

interface LicenseStepProps {
  accepted: boolean;
  onAcceptedChange: (value: boolean) => void;
}

// ステップ2: ライセンス確認
// Anima 非商用ライセンスへの同意を取得する
export function LicenseStep({ accepted, onAcceptedChange }: LicenseStepProps) {
  const { t } = useTranslation();

  // ブラウザを開く（Tauri shell plugin 経由でデフォルトブラウザを起動）
  const openExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('URL を開けませんでした:', e);
    }
  };

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.license.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.license.intro')}
        </Text>
      </div>

      <Alert
        variant="light"
        color="yellow"
        title={t('setup.license.alertTitle')}
        icon={<IconAlertTriangle />}
      >
        <Text size="sm" mb="xs">
          {t('setup.license.alertBody1')}
        </Text>
        <Text size="sm" mb="xs">
          {t('setup.license.alertProhibitedHeader')}
        </Text>
        <Text size="sm" pl="md" mb="xs">
          {t('setup.license.prohibited.commercial')}
          <br />
          {t('setup.license.prohibited.service')}
          <br />
          {t('setup.license.prohibited.redistribute')}
        </Text>
        <Group gap={4}>
          <Anchor
            size="sm"
            onClick={() => openExternal('https://huggingface.co/circlestone-labs/Anima')}
            style={{ cursor: 'pointer' }}
          >
            {t('setup.license.fullLink')}
          </Anchor>
          <IconExternalLink size={12} />
        </Group>
      </Alert>

      <Card withBorder padding="sm" radius="md">
        <Text size="xs" c="dimmed" mb="xs">
          {t('setup.license.othersInfo')}
        </Text>
      </Card>

      <Checkbox
        checked={accepted}
        onChange={(e) => onAcceptedChange(e.currentTarget.checked)}
        label={
          <Text size="sm">
            <strong>{t('setup.license.checkbox')}</strong>
          </Text>
        }
      />
    </Stack>
  );
}
