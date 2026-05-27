import {
  Card,
  Stack,
  Group,
  Title,
  Badge,
  Image,
  Text,
  SimpleGrid,
  ActionIcon,
  Tooltip,
} from '@mantine/core';
import { IconDeviceFloppy } from '@tabler/icons-react';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import { notifications } from '@mantine/notifications';
import { gallerySaveAs } from '../../lib/tauri';
import { useTranslation } from '../../i18n/useTranslation';
import type { GeneratedImageData } from '../../types';

interface ImageResultsGridProps {
  images: GeneratedImageData[];
  elapsedMs?: number | null;
  meta?: {
    seed?: number;
    prompt?: string;
    count?: number;
  };
}

// 生成結果のグリッド表示
// シンプル/詳細モードの両方で使用される共通コンポーネント
// 各画像に「名前を付けて保存」ボタンを配置（ギャラリーDBへの登録が前提）
export function ImageResultsGrid({ images, elapsedMs, meta }: ImageResultsGridProps) {
  const { t } = useTranslation();
  if (images.length === 0) return null;

  // ユーザー指定の場所にPNGを保存
  const onSaveAs = async (img: GeneratedImageData) => {
    if (img.galleryId == null) {
      notifications.show({
        title: t('gen.results.cannotSaveTitle'),
        message: t('gen.results.cannotSaveMessage'),
        color: 'red',
      });
      return;
    }
    try {
      const selected = await saveDialog({
        defaultPath: img.filename,
        filters: [{ name: t('gen.results.pngFilter'), extensions: ['png'] }],
        title: t('gen.results.saveDialogTitle'),
      });
      if (!selected) return; // ユーザーがキャンセル
      await gallerySaveAs(img.galleryId, selected);
      notifications.show({
        title: t('gen.results.savedTitle'),
        message: selected,
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        title: t('gen.results.saveFailedTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  return (
    <Card withBorder padding="md" radius="md">
      <Stack gap="sm">
        <Group justify="space-between">
          <Title order={5}>{t('gen.results.title', { count: images.length })}</Title>
          {elapsedMs != null && (
            <Badge variant="light">{t('gen.results.elapsed', { sec: (elapsedMs / 1000).toFixed(1) })}</Badge>
          )}
        </Group>

        <SimpleGrid cols={{ base: 1, sm: 2, lg: images.length >= 3 ? 3 : 2 }} spacing="md">
          {images.map((img, i) => (
            <Stack key={`${img.filename}-${i}`} gap={4}>
              <Image
                src={`data:${img.mimeType};base64,${img.dataBase64}`}
                alt={img.filename}
                radius="md"
                fit="contain"
              />
              <Group justify="space-between" gap="xs">
                <Text size="xs" c="dimmed" lineClamp={1} style={{ flex: 1 }}>
                  {img.filename}
                </Text>
                <Tooltip label={t('gen.results.saveAsTooltip')}>
                  <ActionIcon
                    size="sm"
                    variant="default"
                    onClick={() => onSaveAs(img)}
                    disabled={img.galleryId == null}
                  >
                    <IconDeviceFloppy size={14} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Stack>
          ))}
        </SimpleGrid>

        {meta?.prompt && (
          <Text size="xs" c="dimmed" style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {t('gen.results.promptPrefix', { prompt: meta.prompt })}
          </Text>
        )}
      </Stack>
    </Card>
  );
}
