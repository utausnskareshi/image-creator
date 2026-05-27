import { Card, Image, Text, Group, ActionIcon, Badge, Tooltip, Box, Stack } from '@mantine/core';
import { IconStar, IconStarFilled, IconTrash } from '@tabler/icons-react';
import { useTranslation } from '../../i18n/useTranslation';
import type { GalleryItem } from '../../types';

interface GalleryItemCardProps {
  item: GalleryItem;
  onClick: () => void;
  onToggleFavorite: () => void;
  onDelete: () => void;
}

// ギャラリーグリッドの1要素
// クリックで詳細表示、お気に入りトグル、削除アイコン
export function GalleryItemCard({
  item,
  onClick,
  onToggleFavorite,
  onDelete,
}: GalleryItemCardProps) {
  const { t, locale } = useTranslation();
  const date = new Date(item.createdAt);
  // ロケールに応じて表示形式を切替（ja-JP / en-US）
  const dateLocale = locale === 'ja' ? 'ja-JP' : 'en-US';
  const dateStr = date.toLocaleString(dateLocale, {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <Card withBorder padding="xs" radius="md" style={{ position: 'relative' }}>
      <Card.Section style={{ cursor: 'pointer' }} onClick={onClick}>
        {item.thumbnailBase64 ? (
          <Image
            src={`data:${item.thumbnailMimeType};base64,${item.thumbnailBase64}`}
            alt={`gallery-${item.id}`}
            h={200}
            fit="cover"
          />
        ) : (
          <Box
            h={200}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.2)',
            }}
          >
            <Text size="xs" c="dimmed">
              {t('gallery.card.thumbnailMissing')}
            </Text>
          </Box>
        )}
      </Card.Section>

      {/* お気に入り・削除（オーバーレイ） */}
      <Group
        gap={4}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          background: 'rgba(0,0,0,0.55)',
          borderRadius: 8,
          padding: '2px 4px',
        }}
      >
        <Tooltip label={item.isFavorite ? t('gallery.card.removeFavorite') : t('gallery.card.addFavorite')}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color={item.isFavorite ? 'yellow' : 'gray'}
            onClick={(e) => {
              e.stopPropagation();
              onToggleFavorite();
            }}
          >
            {item.isFavorite ? <IconStarFilled size={14} /> : <IconStar size={14} />}
          </ActionIcon>
        </Tooltip>
        <Tooltip label={t('gallery.card.delete')}>
          <ActionIcon
            size="sm"
            variant="subtle"
            color="red"
            onClick={(e) => {
              e.stopPropagation();
              onDelete();
            }}
          >
            <IconTrash size={14} />
          </ActionIcon>
        </Tooltip>
      </Group>

      <Stack gap={2} mt={6}>
        <Group justify="space-between" gap={4}>
          <Badge size="xs" variant="light">
            {item.modelId}
          </Badge>
          <Text size="xs" c="dimmed">
            {item.width}×{item.height}
          </Text>
        </Group>
        <Text size="xs" lineClamp={2} title={item.positivePrompt}>
          {item.positivePrompt}
        </Text>
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t('gallery.card.seed', { seed: item.seed })}
          </Text>
          <Text size="xs" c="dimmed">
            {dateStr}
          </Text>
        </Group>
      </Stack>
    </Card>
  );
}
