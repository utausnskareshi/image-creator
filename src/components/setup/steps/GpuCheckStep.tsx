import { useEffect, useState } from 'react';
import { Stack, Text, Title, Card, Alert, Group, Badge, Button, Loader } from '@mantine/core';
import { IconCircleCheck, IconAlertCircle, IconRefresh } from '@tabler/icons-react';
import { detectGpu } from '../../../lib/tauri';
import { useTranslation } from '../../../i18n/useTranslation';
import type { GpuInfo } from '../../../types';

interface GpuCheckStepProps {
  // 検出結果を親に通知（次へ進む可否の判定に使う）
  onResult: (info: GpuInfo | null) => void;
}

// ステップ3: GPU 検出
// nvidia-smi 経由で NVIDIA GPU 情報を取得する
export function GpuCheckStep({ onResult }: GpuCheckStepProps) {
  const { t } = useTranslation();
  const [info, setInfo] = useState<GpuInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const runDetection = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await detectGpu();
      setInfo(result);
      onResult(result);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      onResult(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    runDetection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.gpu.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.gpu.intro')}
        </Text>
      </div>

      {loading && (
        <Card withBorder padding="lg" radius="md">
          <Group>
            <Loader size="sm" />
            <Text size="sm">{t('setup.gpu.detecting')}</Text>
          </Group>
        </Card>
      )}

      {!loading && error && (
        <Alert color="red" icon={<IconAlertCircle />} title={t('setup.gpu.detectErrorTitle')}>
          <Text size="sm">{error}</Text>
        </Alert>
      )}

      {!loading && info && info.available && (
        <Card withBorder padding="lg" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Group gap="xs">
                <IconCircleCheck size={20} color="var(--mantine-color-green-6)" />
                <Text fw={600}>{t('setup.gpu.detected')}</Text>
              </Group>
              {info.meetsRecommendedVram ? (
                <Badge color="green" variant="light">{t('setup.gpu.recommendEnv')}</Badge>
              ) : (
                <Badge color="yellow" variant="light">{t('setup.gpu.minEnv')}</Badge>
              )}
            </Group>

            <Stack gap={4} mt="xs">
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t('setup.gpu.gpuName')}</Text>
                <Text size="sm">{info.name ?? '-'}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t('setup.gpu.driverVersion')}</Text>
                <Text size="sm">{info.driverVersion ?? '-'}</Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t('setup.gpu.vramTotal')}</Text>
                <Text size="sm">
                  {info.vramTotalMb != null ? `${(info.vramTotalMb / 1024).toFixed(1)} GB` : '-'}
                </Text>
              </Group>
              <Group justify="space-between">
                <Text size="sm" c="dimmed">{t('setup.gpu.vramFree')}</Text>
                <Text size="sm">
                  {info.vramFreeMb != null ? `${(info.vramFreeMb / 1024).toFixed(1)} GB` : '-'}
                </Text>
              </Group>
            </Stack>

            <Text size="xs" c="dimmed" mt="xs">
              {info.message}
            </Text>
          </Stack>
        </Card>
      )}

      {!loading && info && !info.available && (
        <Alert color="red" icon={<IconAlertCircle />} title={t('setup.gpu.notFoundTitle')}>
          <Stack gap="xs">
            <Text size="sm">{info.message}</Text>
            <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
              {t('setup.gpu.notFoundHint')}
            </Text>
          </Stack>
        </Alert>
      )}

      <Group>
        <Button
          variant="default"
          leftSection={<IconRefresh size={16} />}
          onClick={runDetection}
          disabled={loading}
        >
          {t('setup.gpu.redetect')}
        </Button>
      </Group>
    </Stack>
  );
}
