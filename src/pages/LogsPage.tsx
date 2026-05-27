import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Stack,
  Title,
  Text,
  Group,
  Button,
  Tabs,
  TextInput,
  ScrollArea,
  Card,
  Switch,
  CopyButton,
  Tooltip,
  ActionIcon,
  Loader,
  Code,
} from '@mantine/core';
import {
  IconRefresh,
  IconCopy,
  IconCheck,
  IconTrash,
  IconSearch,
  IconFile,
} from '@tabler/icons-react';
import { notifications } from '@mantine/notifications';
import { readLog, clearLog, logPath } from '../lib/tauri';
import { useTranslation } from '../i18n/useTranslation';
import type { TranslationKey } from '../i18n';
import type { LogKind } from '../types';

const TABS: Array<{ value: LogKind; labelKey: TranslationKey; descKey: TranslationKey }> = [
  { value: 'app', labelKey: 'logs.tab.app', descKey: 'logs.tab.app.desc' },
  { value: 'comfyui', labelKey: 'logs.tab.comfyui', descKey: 'logs.tab.comfyui.desc' },
  { value: 'llama', labelKey: 'logs.tab.llama', descKey: 'logs.tab.llama.desc' },
];

const AUTO_REFRESH_INTERVAL_MS = 3000;

// ログビューア
// 3タブ（アプリ / ComfyUI / llama-server）でログ閲覧
// 自動更新トグル / フィルタ / 全コピー / クリア
export function LogsPage() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<LogKind>('app');
  const [content, setContent] = useState('');
  const [path, setPath] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [autoRefresh, setAutoRefresh] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (kind: LogKind) => {
    setLoading(true);
    try {
      const [logContent, logFilePath] = await Promise.all([
        readLog(kind, 1000),
        logPath(kind),
      ]);
      setContent(logContent);
      setPath(logFilePath);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setContent(t('logs.fetchFailed', { message: msg }));
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // タブ切替時にロード
  useEffect(() => {
    load(activeTab);
  }, [activeTab, load]);

  // 自動更新タイマー
  useEffect(() => {
    if (!autoRefresh) return;
    const id = setInterval(() => {
      load(activeTab);
    }, AUTO_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [autoRefresh, activeTab, load]);

  // フィルタ後の内容
  const displayContent = useMemo(() => {
    if (!filter.trim()) return content;
    const needle = filter.toLowerCase();
    return content
      .split('\n')
      .filter((line) => line.toLowerCase().includes(needle))
      .join('\n');
  }, [content, filter]);

  // ロード or フィルタ変更後に末尾までスクロール
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [displayContent]);

  const onClear = async () => {
    if (!confirm(t('logs.clearConfirm', { kind: activeTab }))) return;
    try {
      await clearLog(activeTab);
      await load(activeTab);
      notifications.show({
        title: t('logs.clearSuccessTitle'),
        message: t('logs.clearSuccessMessage', { kind: activeTab }),
        color: 'blue',
      });
    } catch (e) {
      notifications.show({
        title: t('logs.clearFailedTitle'),
        message: e instanceof Error ? e.message : String(e),
        color: 'red',
      });
    }
  };

  const lineCount = displayContent.split('\n').length;

  return (
    <Stack gap="md">
      <div>
        <Title order={2}>{t('logs.title')}</Title>
        <Text c="dimmed" size="sm">
          {t('logs.description')}
        </Text>
      </div>

      <Tabs value={activeTab} onChange={(v) => v && setActiveTab(v as LogKind)} keepMounted={false}>
        <Tabs.List>
          {TABS.map((tab) => (
            <Tabs.Tab key={tab.value} value={tab.value}>
              {t(tab.labelKey)}
            </Tabs.Tab>
          ))}
        </Tabs.List>

        {TABS.map((tab) => (
          <Tabs.Panel key={tab.value} value={tab.value} pt="md">
            <Stack gap="sm">
              <Card withBorder padding="sm" radius="md">
                <Group justify="space-between" wrap="wrap" gap="xs">
                  <Group gap="xs" wrap="nowrap" style={{ flex: 1, minWidth: 200 }}>
                    <IconFile size={14} />
                    <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                      {path || t('logs.pathLoading')}
                    </Text>
                  </Group>
                  <Group gap="xs">
                    <Switch
                      size="xs"
                      label={t('logs.autoRefresh')}
                      checked={autoRefresh}
                      onChange={(e) => setAutoRefresh(e.currentTarget.checked)}
                    />
                    <Button
                      size="xs"
                      variant="default"
                      leftSection={<IconRefresh size={12} />}
                      onClick={() => load(activeTab)}
                      loading={loading}
                    >
                      {t('common.refresh')}
                    </Button>
                    <CopyButton value={content} timeout={1500}>
                      {({ copied, copy }) => (
                        <Tooltip label={copied ? t('common.copied') : t('logs.copyAll')}>
                          <ActionIcon size="lg" variant="default" onClick={copy}>
                            {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                          </ActionIcon>
                        </Tooltip>
                      )}
                    </CopyButton>
                    <Tooltip label={t('logs.clearTooltip')}>
                      <ActionIcon size="lg" variant="default" color="red" onClick={onClear}>
                        <IconTrash size={14} />
                      </ActionIcon>
                    </Tooltip>
                  </Group>
                </Group>
              </Card>

              <TextInput
                placeholder={t('logs.filterPlaceholder')}
                value={filter}
                onChange={(e) => setFilter(e.currentTarget.value)}
                leftSection={<IconSearch size={14} />}
                size="sm"
              />

              <Group justify="space-between">
                <Text size="xs" c="dimmed">
                  {t(tab.descKey)}
                </Text>
                <Text size="xs" c="dimmed">
                  {t('logs.linesShown', { count: lineCount })}
                </Text>
              </Group>

              <ScrollArea
                h={520}
                type="auto"
                viewportRef={scrollRef as React.RefObject<HTMLDivElement>}
                style={{
                  border: '1px solid var(--mantine-color-default-border)',
                  borderRadius: 8,
                  background: 'rgba(0,0,0,0.2)',
                }}
              >
                {loading && !content ? (
                  <Group justify="center" py="xl">
                    <Loader size="sm" />
                  </Group>
                ) : (
                  <Code
                    block
                    style={{
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all',
                      fontSize: 11,
                      background: 'transparent',
                      padding: 12,
                      minHeight: '100%',
                    }}
                  >
                    {displayContent || t('logs.empty')}
                  </Code>
                )}
              </ScrollArea>
            </Stack>
          </Tabs.Panel>
        ))}
      </Tabs>
    </Stack>
  );
}
