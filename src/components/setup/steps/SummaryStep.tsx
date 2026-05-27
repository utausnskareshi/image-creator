import { Stack, Text, Title, Card, Group, Alert } from '@mantine/core';
import { IconCircleCheck, IconInfoCircle } from '@tabler/icons-react';
import { useTranslation } from '../../../i18n/useTranslation';
import type { GpuInfo } from '../../../types';

interface SummaryStepProps {
  gpuInfo: GpuInfo | null;
  dataFolder: string;
  licenseAccepted: boolean;
}

// ステップ5: 確認・保存
// 入力内容をまとめて表示し、設定保存→次フェーズへ
export function SummaryStep({ gpuInfo, dataFolder, licenseAccepted }: SummaryStepProps) {
  const { t } = useTranslation();

  const rows: Array<{ label: string; value: string; ok: boolean }> = [
    {
      label: t('setup.summary.row.license'),
      value: licenseAccepted
        ? t('setup.summary.row.licenseAccepted')
        : t('setup.summary.row.licenseNotAccepted'),
      ok: licenseAccepted,
    },
    {
      label: t('setup.summary.row.gpu'),
      value: gpuInfo?.available
        ? t('setup.summary.row.gpuValue', {
            name: gpuInfo.name ?? '-',
            vram:
              gpuInfo.vramTotalMb != null
                ? (gpuInfo.vramTotalMb / 1024).toFixed(1)
                : '-',
          })
        : t('setup.summary.row.gpuNotFound'),
      ok: gpuInfo?.available ?? false,
    },
    {
      label: t('setup.summary.row.folder'),
      value: dataFolder || t('setup.summary.row.folderUnset'),
      ok: dataFolder.length > 0,
    },
    {
      label: t('setup.summary.row.model'),
      value: t('setup.summary.row.modelValue'),
      ok: true,
    },
    {
      label: t('setup.summary.row.language'),
      value: t('setup.summary.row.languageValue'),
      ok: true,
    },
  ];

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.summary.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.summary.intro')}
        </Text>
      </div>

      <Card withBorder padding="lg" radius="md">
        <Stack gap="sm">
          {rows.map((row) => (
            <Group key={row.label} justify="space-between" wrap="nowrap">
              <Group gap="xs">
                <IconCircleCheck
                  size={18}
                  color={row.ok ? 'var(--mantine-color-green-6)' : 'var(--mantine-color-red-6)'}
                />
                <Text size="sm" fw={500}>
                  {row.label}
                </Text>
              </Group>
              <Text
                size="sm"
                c={row.ok ? undefined : 'red'}
                style={{
                  maxWidth: '70%',
                  textAlign: 'right',
                  wordBreak: 'break-all',
                }}
              >
                {row.value}
              </Text>
            </Group>
          ))}
        </Stack>
      </Card>

      {/*
        次ステップ案内は Mantine の Alert を使用する。
        Alert の variant="light" は light/dark の両カラースキームで適切なコントラストを保つため、
        独自背景色（mantine-color-*-0）を使うより読みやすい。
      */}
      <Alert
        variant="light"
        color="image-creator"
        icon={<IconInfoCircle size={18} />}
        title={t('setup.summary.nextStepTitle')}
      >
        <Text size="sm">{t('setup.summary.nextStepBody')}</Text>
      </Alert>
    </Stack>
  );
}
