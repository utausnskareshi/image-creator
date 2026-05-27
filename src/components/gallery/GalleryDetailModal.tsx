import { useEffect, useState } from 'react';
import {
  Modal,
  Stack,
  Image,
  Text,
  Group,
  Button,
  Badge,
  Loader,
  Box,
  Card,
  ActionIcon,
  Tooltip,
  Divider,
  CopyButton,
} from '@mantine/core';
import {
  IconCopy,
  IconCheck,
  IconStar,
  IconStarFilled,
  IconTrash,
  IconWand,
  IconDeviceFloppy,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { save as saveDialog } from '@tauri-apps/plugin-dialog';
import {
  galleryGetDetail,
  galleryGetFullImage,
  galleryToggleFavorite,
  galleryDelete,
  gallerySaveAs,
} from '../../lib/tauri';
import { useGenerationStore } from '../../stores/generationStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { GalleryItemDetail, ImageData } from '../../types';

interface GalleryDetailModalProps {
  itemId: number | null;
  opened: boolean;
  onClose: () => void;
  onChanged: () => void; // お気に入り変更・削除後にリスト再読込
}

// ギャラリーアイテムの詳細表示モーダル
// フル画像 + 全メタデータ + 操作（お気に入り/削除/再現）
export function GalleryDetailModal({
  itemId,
  opened,
  onClose,
  onChanged,
}: GalleryDetailModalProps) {
  const navigate = useNavigate();
  const { t, locale } = useTranslation();
  const setMode = useGenerationStore((s) => s.setMode);
  const setAdvanced = useGenerationStore((s) => s.setAdvanced);

  const [detail, setDetail] = useState<GalleryItemDetail | null>(null);
  const [image, setImage] = useState<ImageData | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!opened || itemId == null) {
      setDetail(null);
      setImage(null);
      return;
    }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [d, img] = await Promise.all([
          galleryGetDetail(itemId),
          galleryGetFullImage(itemId),
        ]);
        if (cancelled) return;
        setDetail(d);
        setImage(img);
      } catch (e) {
        if (cancelled) return;
        notifications.show({
          title: t('gallery.detail.loadFailTitle'),
          message: e instanceof Error ? e.message : String(e),
          color: 'red',
        });
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [itemId, opened]);

  const onToggleFavorite = async () => {
    if (!detail) return;
    setBusy(true);
    try {
      const newVal = await galleryToggleFavorite(detail.id);
      setDetail({ ...detail, isFavorite: newVal });
      onChanged();
    } catch (e) {
      notifications.show({
        title: t('gallery.detail.opFailTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  const onDelete = async () => {
    if (!detail) return;
    if (!confirm(t('gallery.detail.deleteConfirm'))) return;
    setBusy(true);
    try {
      await galleryDelete(detail.id);
      notifications.show({
        title: t('gallery.detail.deleteSuccessTitle'),
        message: t('gallery.detail.deleteSuccessMessage'),
        color: 'blue',
      });
      onChanged();
      onClose();
    } catch (e) {
      notifications.show({
        title: t('gallery.detail.deleteFailTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  // 画像を任意のパスへ「名前を付けて保存」
  const onSaveAs = async () => {
    if (!detail) return;
    try {
      // 既定のファイル名はギャラリー保存時の名前から取り出す
      const defaultName = detail.filePath.split(/[\\/]/).pop() ?? 'imagecreator.png';
      const selected = await saveDialog({
        defaultPath: defaultName,
        filters: [{ name: t('gallery.detail.pngFilter'), extensions: ['png'] }],
        title: t('gallery.detail.saveDialogTitle'),
      });
      if (!selected) return;
      setBusy(true);
      await gallerySaveAs(detail.id, selected);
      notifications.show({
        title: t('gallery.detail.saveSuccessTitle'),
        message: selected,
        color: 'green',
      });
    } catch (e) {
      notifications.show({
        title: t('gallery.detail.saveFailTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    } finally {
      setBusy(false);
    }
  };

  // 同じ設定で生成画面へ移動
  const onReproduce = () => {
    if (!detail) return;
    setMode('advanced');
    setAdvanced({
      japanesePrompt: detail.japanesePrompt ?? '',
      englishPrompt: detail.positivePrompt,
      negativePrompt: detail.negativePrompt ?? '',
      width: detail.width,
      height: detail.height,
      steps: detail.steps,
      cfg: detail.cfg,
      sampler: detail.sampler,
      scheduler: detail.scheduler,
      seed: detail.seed,
      batchSize: 1,
      seedMode: 'fixed',
      usePrefix: false, // 既に prefix 含まれている可能性が高いため OFF
      useTurboLora: false,
    });
    notifications.show({
      title: t('gallery.detail.reproduceTitle'),
      message: t('gallery.detail.reproduceMessage'),
      color: 'image-creator',
    });
    onClose();
    navigate('/');
  };

  if (!detail && loading) {
    return (
      <Modal opened={opened} onClose={onClose} size="xl" title={t('gallery.detail.loading')}>
        <Group justify="center" py="xl">
          <Loader size="lg" />
        </Group>
      </Modal>
    );
  }

  const dateLocale = locale === 'ja' ? 'ja-JP' : 'en-US';

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="80%"
      title={detail ? t('gallery.detail.title', { id: detail.id }) : t('gallery.detail.titleFallback')}
      centered
    >
      {detail && (
        <Stack gap="md">
          {/* 画像本体 */}
          <Box
            style={{
              display: 'flex',
              justifyContent: 'center',
              background: 'rgba(0,0,0,0.15)',
              borderRadius: 8,
              padding: 8,
            }}
          >
            {image ? (
              <Image
                src={`data:${image.mimeType};base64,${image.dataBase64}`}
                alt={`gallery-${detail.id}`}
                fit="contain"
                style={{ maxHeight: '60vh' }}
              />
            ) : (
              <Loader />
            )}
          </Box>

          {/* 操作ボタン */}
          <Group justify="space-between">
            <Group gap="xs">
              <Button
                variant="filled"
                color="image-creator"
                leftSection={<IconWand size={16} />}
                onClick={onReproduce}
                disabled={busy}
              >
                {t('gallery.detail.regenerate')}
              </Button>
              <Button
                variant="default"
                leftSection={<IconDeviceFloppy size={16} />}
                onClick={onSaveAs}
                loading={busy}
              >
                {t('gallery.detail.saveAs')}
              </Button>
              <Button
                variant="default"
                leftSection={
                  detail.isFavorite ? (
                    <IconStarFilled size={16} color="orange" />
                  ) : (
                    <IconStar size={16} />
                  )
                }
                onClick={onToggleFavorite}
                loading={busy}
              >
                {detail.isFavorite ? t('gallery.detail.unfavorite') : t('gallery.detail.favorite')}
              </Button>
            </Group>
            <Button
              variant="light"
              color="red"
              leftSection={<IconTrash size={16} />}
              onClick={onDelete}
              loading={busy}
            >
              {t('gallery.detail.delete')}
            </Button>
          </Group>

          <Divider />

          {/* メタデータ */}
          <Card withBorder padding="md" radius="md">
            <Stack gap="xs">
              <Group justify="space-between">
                <Badge variant="light">{detail.modelId}</Badge>
                <Text size="xs" c="dimmed">
                  {new Date(detail.createdAt).toLocaleString(dateLocale)}
                </Text>
              </Group>

              {detail.japanesePrompt && (
                <PromptRow label={t('gallery.detail.labelJapanese')} value={detail.japanesePrompt} />
              )}
              <PromptRow label={t('gallery.detail.labelPositive')} value={detail.positivePrompt} mono />
              {detail.negativePrompt && (
                <PromptRow label={t('gallery.detail.labelNegative')} value={detail.negativePrompt} mono />
              )}

              <Divider />

              <Group gap="md" wrap="wrap">
                <ParamItem label={t('gallery.detail.labelSize')} value={`${detail.width}×${detail.height}`} />
                <ParamItem label={t('gallery.detail.labelSteps')} value={String(detail.steps)} />
                <ParamItem label={t('gallery.detail.labelCfg')} value={detail.cfg.toFixed(1)} />
                <ParamItem label={t('gallery.detail.labelSampler')} value={detail.sampler} />
                <ParamItem label={t('gallery.detail.labelScheduler')} value={detail.scheduler} />
                <ParamItem label={t('gallery.detail.labelSeed')} value={String(detail.seed)} copyable />
                {detail.workflowTemplate && (
                  <ParamItem label={t('gallery.detail.labelWorkflow')} value={detail.workflowTemplate} />
                )}
              </Group>

              <Divider />
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                {t('gallery.detail.labelFile', { path: detail.filePath })}
              </Text>
            </Stack>
          </Card>
        </Stack>
      )}
    </Modal>
  );
}

function PromptRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  const { t } = useTranslation();
  return (
    <Box>
      <Group justify="space-between" gap="xs">
        <Text size="xs" c="dimmed" fw={600}>
          {label}
        </Text>
        <CopyButton value={value} timeout={1500}>
          {({ copied, copy }) => (
            <Tooltip label={copied ? t('common.copied') : t('common.copy')}>
              <ActionIcon size="xs" variant="subtle" onClick={copy}>
                {copied ? <IconCheck size={12} /> : <IconCopy size={12} />}
              </ActionIcon>
            </Tooltip>
          )}
        </CopyButton>
      </Group>
      <Text
        size="sm"
        style={{
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          fontFamily: mono ? 'monospace' : undefined,
        }}
      >
        {value}
      </Text>
    </Box>
  );
}

function ParamItem({ label, value, copyable }: { label: string; value: string; copyable?: boolean }) {
  return (
    <Group gap={4}>
      <Text size="xs" c="dimmed">
        {label}:
      </Text>
      <Text size="xs" fw={500}>
        {value}
      </Text>
      {copyable && (
        <CopyButton value={value} timeout={1200}>
          {({ copied, copy }) => (
            <ActionIcon size="xs" variant="subtle" onClick={copy}>
              {copied ? <IconCheck size={10} /> : <IconCopy size={10} />}
            </ActionIcon>
          )}
        </CopyButton>
      )}
    </Group>
  );
}
