import { useCallback, useEffect, useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Group,
  Button,
  SimpleGrid,
  SegmentedControl,
  Loader,
  Card,
  Alert,
  Badge,
  Center,
} from '@mantine/core';
import {
  IconRefresh,
  IconAlertCircle,
  IconPhotoOff,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { GalleryItemCard } from '../components/gallery/GalleryItemCard';
import { GalleryDetailModal } from '../components/gallery/GalleryDetailModal';
import { galleryList, galleryCount, galleryToggleFavorite, galleryDelete } from '../lib/tauri';
import { useTranslation } from '../i18n/useTranslation';
import type { GalleryItem } from '../types';

const PAGE_SIZE = 24;

// ギャラリーページ
// SQLite に蓄積された履歴をサムネイルグリッドで表示
export function GalleryPage() {
  const { t } = useTranslation();
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [offset, setOffset] = useState(0);
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [detailId, setDetailId] = useState<number | null>(null);
  const [detailOpened, setDetailOpened] = useState(false);

  const load = useCallback(
    async (resetOffset = false) => {
      setLoading(true);
      setError(null);
      try {
        const newOffset = resetOffset ? 0 : offset;
        const [list, count] = await Promise.all([
          galleryList({ limit: PAGE_SIZE, offset: newOffset, favoritesOnly }),
          galleryCount(favoritesOnly),
        ]);
        if (resetOffset) {
          setItems(list);
          setOffset(0);
        } else {
          setItems((prev) => (newOffset === 0 ? list : [...prev, ...list]));
        }
        setTotal(count);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
      } finally {
        setLoading(false);
      }
    },
    [offset, favoritesOnly],
  );

  // 初回・フィルタ変更時にリセットロード
  useEffect(() => {
    load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [favoritesOnly]);

  const loadMore = async () => {
    const nextOffset = items.length;
    setOffset(nextOffset);
    setLoading(true);
    try {
      const more = await galleryList({
        limit: PAGE_SIZE,
        offset: nextOffset,
        favoritesOnly,
      });
      setItems((prev) => [...prev, ...more]);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  const openDetail = (id: number) => {
    setDetailId(id);
    setDetailOpened(true);
  };

  const closeDetail = () => {
    setDetailOpened(false);
  };

  // カードのお気に入りトグル（楽観的更新）
  const onToggleFavorite = async (item: GalleryItem) => {
    try {
      const newVal = await galleryToggleFavorite(item.id);
      setItems((prev) =>
        prev.map((it) => (it.id === item.id ? { ...it, isFavorite: newVal } : it)),
      );
      // お気に入りフィルタ表示中で、解除した場合はリストから消す
      if (favoritesOnly && !newVal) {
        setItems((prev) => prev.filter((it) => it.id !== item.id));
        setTotal((tt) => Math.max(0, tt - 1));
      }
    } catch (e) {
      notifications.show({
        title: t('gallery.favoriteFailTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  const onDelete = async (item: GalleryItem) => {
    if (!confirm(t('gallery.deleteConfirm'))) return;
    try {
      await galleryDelete(item.id);
      setItems((prev) => prev.filter((it) => it.id !== item.id));
      setTotal((tt) => Math.max(0, tt - 1));
      notifications.show({
        title: t('gallery.deleteSuccessTitle'),
        message: t('gallery.deleteSuccessMessage'),
        color: 'blue',
      });
    } catch (e) {
      notifications.show({
        title: t('gallery.deleteFailTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  const hasMore = items.length < total;

  return (
    <Stack gap="md">
      <Group justify="space-between" align="flex-end">
        <div>
          <Title order={2}>{t('gallery.title')}</Title>
          <Text c="dimmed" size="sm">
            {t('gallery.description')}
          </Text>
        </div>
        <Group gap="sm">
          <Badge variant="light" size="lg">
            {t('gallery.totalItems', { total })}
          </Badge>
          <SegmentedControl
            value={favoritesOnly ? 'fav' : 'all'}
            onChange={(v) => setFavoritesOnly(v === 'fav')}
            data={[
              { value: 'all', label: t('gallery.filter.all') },
              { value: 'fav', label: t('gallery.filter.favorites') },
            ]}
            color="image-creator"
            size="sm"
          />
          <Button
            size="sm"
            variant="default"
            leftSection={<IconRefresh size={14} />}
            onClick={() => load(true)}
            loading={loading}
          >
            {t('common.refresh')}
          </Button>
        </Group>
      </Group>

      {error && (
        <Alert color="red" icon={<IconAlertCircle />}>
          {error}
        </Alert>
      )}

      {!loading && items.length === 0 ? (
        <Card withBorder padding="xl" radius="md">
          <Center>
            <Stack gap="xs" align="center">
              <IconPhotoOff size={48} color="gray" />
              <Text c="dimmed" size="sm">
                {favoritesOnly ? t('gallery.emptyFavorites') : t('gallery.empty')}
              </Text>
            </Stack>
          </Center>
        </Card>
      ) : (
        <SimpleGrid cols={{ base: 1, xs: 2, sm: 3, md: 4, lg: 5 }} spacing="md">
          {items.map((item) => (
            <GalleryItemCard
              key={item.id}
              item={item}
              onClick={() => openDetail(item.id)}
              onToggleFavorite={() => onToggleFavorite(item)}
              onDelete={() => onDelete(item)}
            />
          ))}
        </SimpleGrid>
      )}

      {hasMore && (
        <Group justify="center">
          <Button variant="default" onClick={loadMore} loading={loading}>
            {t('gallery.loadMore', { n: total - items.length })}
          </Button>
        </Group>
      )}

      {loading && items.length === 0 && (
        <Group justify="center" py="xl">
          <Loader />
        </Group>
      )}

      <GalleryDetailModal
        itemId={detailId}
        opened={detailOpened}
        onClose={closeDetail}
        onChanged={() => load(true)}
      />
    </Stack>
  );
}
