import { useEffect, useMemo, useState } from 'react';
import {
  Stack,
  Text,
  Title,
  Card,
  Progress,
  Group,
  Button,
  Badge,
  Alert,
  Loader,
  ScrollArea,
  Anchor,
  List,
} from '@mantine/core';
import {
  IconCircleCheck,
  IconAlertCircle,
  IconDownload,
  IconRefresh,
  IconClockHour4,
  IconExternalLink,
  IconBulb,
} from '@tabler/icons-react';
import { listen, type UnlistenFn } from '@tauri-apps/api/event';
import { open as openUrl } from '@tauri-apps/plugin-shell';
import { useNavigate } from 'react-router-dom';
import { downloadFiles, comfyuiSetup, llmSetup } from '../../../lib/tauri';
import { buildSetupDownloadPlan } from '../../../lib/downloadPlanner';
import { formatBytes, formatSpeed, formatEta, formatPercent } from '../../../lib/format';
import { useTranslation } from '../../../i18n/useTranslation';
import type { TranslationKey } from '../../../i18n';
import type { DownloadJob, DownloadProgress, DownloadStatus } from '../../../types';

// 受信エラーメッセージから HTTP ステータスコードを抽出する
// 例: "サーバーエラー: 404 Not Found (...)" → 404
function extractHttpStatus(message: string): number | null {
  const match = message.match(/サーバーエラー[^:]*:\s*(\d{3})/);
  return match && match[1] ? parseInt(match[1], 10) : null;
}

// エラー診断カテゴリ（タイトル/ヒント文言は呼び出し側で t() に渡す）
type Diagnosis = {
  category: 'url-changed' | 'network' | 'integrity' | 'unknown';
  titleKey: TranslationKey;
  hintKey: TranslationKey;
  titleParams?: Record<string, string | number>;
};

function diagnoseError(message: string): Diagnosis {
  const status = extractHttpStatus(message);
  if (status === 404) {
    return {
      category: 'url-changed',
      titleKey: 'setup.download.failTitle.404',
      hintKey: 'setup.download.failHint.404',
    };
  }
  if (status === 403) {
    return {
      category: 'url-changed',
      titleKey: 'setup.download.failTitle.403',
      hintKey: 'setup.download.failHint.403',
    };
  }
  if (status === 410) {
    return {
      category: 'url-changed',
      titleKey: 'setup.download.failTitle.410',
      hintKey: 'setup.download.failHint.410',
    };
  }
  if (status && status >= 500) {
    return {
      category: 'network',
      titleKey: 'setup.download.failTitle.5xx',
      hintKey: 'setup.download.failHint.5xx',
      titleParams: { status },
    };
  }
  if (/SHA256|整合性|hash/i.test(message)) {
    return {
      category: 'integrity',
      titleKey: 'setup.download.failTitle.integrity',
      hintKey: 'setup.download.failHint.integrity',
    };
  }
  if (/受信エラー|connection|connect|timeout|タイムアウト|dns/i.test(message)) {
    return {
      category: 'network',
      titleKey: 'setup.download.failTitle.network',
      hintKey: 'setup.download.failHint.network',
    };
  }
  return {
    category: 'unknown',
    titleKey: 'setup.download.failTitle.unknown',
    hintKey: 'setup.download.failHint.unknown',
  };
}

interface DownloadStepProps {
  dataFolder: string;
  modelId: string;
  // ダウンロード中フラグ。親（SetupWizard）がボタン制御に使う
  onBusyChange: (busy: boolean) => void;
  // 全件成功通知
  onAllComplete: () => void;
}

type Phase = 'planning' | 'ready' | 'downloading' | 'extracting' | 'completed' | 'failed';

const STATUS_LABEL_KEY: Record<DownloadStatus, TranslationKey> = {
  pending: 'setup.download.statusPending',
  downloading: 'setup.download.statusDownloading',
  verifying: 'setup.download.statusVerifying',
  completed: 'setup.download.statusCompleted',
  failed: 'setup.download.statusFailed',
  alreadyexists: 'setup.download.statusAlreadyExists',
};

const STATUS_COLOR: Record<DownloadStatus, string> = {
  pending: 'gray',
  downloading: 'blue',
  verifying: 'yellow',
  completed: 'green',
  failed: 'red',
  alreadyexists: 'teal',
};

// ステップ6: ダウンロード実行
// ComfyUI / llama.cpp / LLM / モデル本体をまとめて取得し、進捗を可視化する
export function DownloadStep({
  dataFolder,
  modelId,
  onBusyChange,
  onAllComplete,
}: DownloadStepProps) {
  const { t } = useTranslation();
  const [jobs, setJobs] = useState<DownloadJob[]>([]);
  const [progressMap, setProgressMap] = useState<Record<string, DownloadProgress>>({});
  const [phase, setPhase] = useState<Phase>('planning');
  const [error, setError] = useState<string | null>(null);

  // 初回ロード: 計画作成
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const plan = await buildSetupDownloadPlan(dataFolder, modelId);
        if (cancelled) return;
        setJobs(plan);
        // 初期状態: 全件 pending
        const initial: Record<string, DownloadProgress> = {};
        for (const j of plan) {
          initial[j.id] = {
            jobId: j.id,
            status: 'pending',
            downloadedBytes: 0,
            totalBytes: j.expectedSize,
            speedBps: 0,
            message: null,
          };
        }
        setProgressMap(initial);
        setPhase('ready');
      } catch (e) {
        if (cancelled) return;
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        setPhase('failed');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dataFolder, modelId]);

  // 進捗イベントの購読
  useEffect(() => {
    let cancelled = false;
    let localFn: UnlistenFn | null = null;
    (async () => {
      const fn = await listen<DownloadProgress>('download:progress', (event) => {
        if (cancelled) return;
        const p = event.payload;
        setProgressMap((prev) => ({
          ...prev,
          [p.jobId]: p,
        }));
      });
      if (cancelled) {
        fn();
      } else {
        localFn = fn;
      }
    })();
    return () => {
      cancelled = true;
      if (localFn) {
        localFn();
        localFn = null;
      }
    };
  }, []);

  const startDownloads = async () => {
    setPhase('downloading');
    setError(null);
    onBusyChange(true);
    try {
      const freshPlan = await buildSetupDownloadPlan(dataFolder, modelId);
      setJobs(freshPlan);
      const initial: Record<string, DownloadProgress> = {};
      for (const j of freshPlan) {
        initial[j.id] = {
          jobId: j.id,
          status: 'pending',
          downloadedBytes: 0,
          totalBytes: j.expectedSize,
          speedBps: 0,
          message: null,
        };
      }
      setProgressMap(initial);

      await downloadFiles(freshPlan);
      // ファイル取得完了後、ComfyUI portable と llama-server をそれぞれ展開
      setPhase('extracting');
      await comfyuiSetup(dataFolder);
      await llmSetup(dataFolder);
      setPhase('completed');
      onAllComplete();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg);
      setPhase('failed');
    } finally {
      onBusyChange(false);
    }
  };

  // 全体集計
  const summary = useMemo(() => {
    let totalBytes = 0;
    let downloadedBytes = 0;
    let knownTotal = true;
    let completed = 0;
    let downloadingPartial = 0;
    for (const j of jobs) {
      const p = progressMap[j.id];
      const tt = p?.totalBytes ?? j.expectedSize;
      const d = p?.downloadedBytes ?? 0;
      if (tt == null) {
        knownTotal = false;
      } else {
        totalBytes += tt;
      }
      downloadedBytes += d;
      if (p && (p.status === 'completed' || p.status === 'alreadyexists')) {
        completed += 1;
      } else if (p?.status === 'downloading' && tt != null && tt > 0) {
        downloadingPartial += Math.min(1, d / tt);
      }
    }

    let percentValue = 0;
    if (knownTotal && totalBytes > 0) {
      percentValue = (downloadedBytes / totalBytes) * 100;
    } else if (jobs.length > 0) {
      percentValue = ((completed + downloadingPartial) / jobs.length) * 100;
    }

    return {
      totalBytes: knownTotal ? totalBytes : null,
      downloadedBytes,
      completed,
      total: jobs.length,
      percentValue,
    };
  }, [jobs, progressMap]);

  return (
    <Stack gap="md">
      <div>
        <Title order={3}>{t('setup.download.title')}</Title>
        <Text c="dimmed" size="sm" mt={4}>
          {t('setup.download.intro')}
        </Text>
      </div>

      {/* 計画中スピナー */}
      {phase === 'planning' && (
        <Card withBorder padding="lg" radius="md">
          <Group>
            <Loader size="sm" />
            <Text size="sm">{t('setup.download.planning')}</Text>
          </Group>
        </Card>
      )}

      {/* エラー表示（診断情報付き） */}
      {phase === 'failed' && error && <FailureCard
        error={error}
        jobs={jobs}
        progressMap={progressMap}
        onReset={() => { setError(null); setPhase('ready'); }}
        onRetry={startDownloads}
      />}

      {/* 全体進捗バー */}
      {phase !== 'planning' && jobs.length > 0 && (
        <Card withBorder padding="md" radius="md">
          <Stack gap="xs">
            <Group justify="space-between">
              <Text fw={600} size="sm">
                {t('setup.download.overall')}
              </Text>
              <Group gap="xs">
                <Badge variant="light">
                  {t('setup.download.completedCount', {
                    done: summary.completed,
                    total: summary.total,
                  })}
                </Badge>
                <Text size="sm" c="dimmed">
                  {formatBytes(summary.downloadedBytes)}
                  {summary.totalBytes != null && ` / ${formatBytes(summary.totalBytes)}`}
                </Text>
              </Group>
            </Group>
            <Progress
              value={summary.percentValue}
              striped={phase === 'downloading'}
              animated={phase === 'downloading'}
              color={phase === 'completed' ? 'green' : 'image-creator'}
              size="lg"
            />
          </Stack>
        </Card>
      )}

      {/* ファイル一覧（個別進捗） */}
      {phase !== 'planning' && jobs.length > 0 && (
        <Card withBorder padding="sm" radius="md">
          <ScrollArea h={260} type="auto">
            <Stack gap="sm">
              {jobs.map((job) => {
                const p = progressMap[job.id];
                const status = p?.status ?? 'pending';
                const percent = formatPercent(
                  p?.downloadedBytes ?? 0,
                  p?.totalBytes ?? job.expectedSize,
                );
                return (
                  <div key={job.id}>
                    <Group justify="space-between" gap="xs" wrap="nowrap">
                      <Text size="sm" lineClamp={1} style={{ flex: 1 }}>
                        {job.displayName}
                      </Text>
                      <Badge color={STATUS_COLOR[status]} variant="light" size="sm">
                        {t(STATUS_LABEL_KEY[status])}
                      </Badge>
                    </Group>
                    <Group justify="space-between" gap="xs" mt={2}>
                      <Text size="xs" c="dimmed">
                        {formatBytes(p?.downloadedBytes ?? 0)}
                        {(p?.totalBytes ?? job.expectedSize) != null &&
                          ` / ${formatBytes(p?.totalBytes ?? job.expectedSize)}`}
                      </Text>
                      <Group gap="md">
                        {status === 'downloading' && (
                          <>
                            <Text size="xs" c="dimmed">
                              {formatSpeed(p?.speedBps ?? 0)}
                            </Text>
                            <Text size="xs" c="dimmed">
                              <IconClockHour4
                                size={12}
                                style={{ verticalAlign: 'middle', marginRight: 2 }}
                              />
                              {formatEta(
                                p?.downloadedBytes ?? 0,
                                p?.totalBytes ?? job.expectedSize,
                                p?.speedBps ?? 0,
                              )}
                            </Text>
                          </>
                        )}
                      </Group>
                    </Group>
                    <Progress
                      value={percent}
                      mt={4}
                      color={STATUS_COLOR[status]}
                      size="xs"
                      striped={status === 'downloading'}
                      animated={status === 'downloading'}
                    />
                  </div>
                );
              })}
            </Stack>
          </ScrollArea>
        </Card>
      )}

      {/* アクション */}
      {phase === 'ready' && (
        <Group justify="space-between">
          <Text size="xs" c="dimmed">
            {t('setup.download.startHint')}
          </Text>
          <Button
            color="image-creator"
            leftSection={<IconDownload size={16} />}
            onClick={startDownloads}
          >
            {t('setup.download.start')}
          </Button>
        </Group>
      )}

      {phase === 'extracting' && (
        <Card withBorder padding="md" radius="md">
          <Group>
            <Loader size="sm" />
            <Stack gap={2}>
              <Text fw={600} size="sm">
                {t('setup.download.extracting')}
              </Text>
              <Text size="xs" c="dimmed">
                {t('setup.download.extractingHint')}
              </Text>
            </Stack>
          </Group>
        </Card>
      )}

      {phase === 'completed' && (
        <Alert color="green" icon={<IconCircleCheck />} title={t('setup.download.completedTitle')}>
          {t('setup.download.completedBody')}
        </Alert>
      )}
    </Stack>
  );
}

// ---- ダウンロード失敗時の詳細表示 ----

interface FailureCardProps {
  error: string;
  jobs: DownloadJob[];
  progressMap: Record<string, DownloadProgress>;
  onReset: () => void;
  onRetry: () => void;
}

function FailureCard({ error, jobs, progressMap, onReset, onRetry }: FailureCardProps) {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const diag = diagnoseError(error);

  // 失敗ジョブを progressMap から特定（status === 'failed' のエントリ）
  const failedJobId = Object.entries(progressMap).find(
    ([, p]) => p.status === 'failed',
  )?.[0];
  const failedJob = failedJobId ? jobs.find((j) => j.id === failedJobId) : undefined;

  const openExternal = async (url: string) => {
    try {
      await openUrl(url);
    } catch (e) {
      console.error('URL を開けませんでした:', e);
    }
  };

  return (
    <Alert
      color="red"
      icon={<IconAlertCircle />}
      title={t(diag.titleKey, diag.titleParams)}
      variant="light"
    >
      <Stack gap="sm">
        <Text size="sm" style={{ whiteSpace: 'pre-wrap' }}>
          {error}
        </Text>

        {failedJob && (
          <Card padding="xs" radius="sm" withBorder bg="rgba(0,0,0,0.15)">
            <Stack gap={4}>
              <Text size="xs" c="dimmed" fw={600}>
                {t('setup.download.failedFile')}
              </Text>
              <Text size="sm" fw={500}>
                {failedJob.displayName}
              </Text>
              <Text size="xs" c="dimmed">
                {t('setup.download.sourceProject', { project: failedJob.sourceProject ?? '-' })}
              </Text>
              <Text size="xs" c="dimmed" style={{ wordBreak: 'break-all' }}>
                {t('setup.download.urlLabel', { url: failedJob.url })}
              </Text>
            </Stack>
          </Card>
        )}

        <Card padding="xs" radius="sm" withBorder>
          <Group gap={6} mb={4}>
            <IconBulb size={14} />
            <Text size="xs" fw={600}>
              {t('setup.download.howTo')}
            </Text>
          </Group>
          <Text size="xs" mb={6}>
            {t(diag.hintKey)}
          </Text>

          {diag.category === 'url-changed' && failedJob?.releasePage && (
            <Stack gap={4}>
              <Group gap={4} wrap="nowrap">
                <Text size="xs" c="dimmed">
                  {t('setup.download.releasePage')}
                </Text>
                <Anchor
                  size="xs"
                  onClick={() => openExternal(failedJob.releasePage!)}
                  style={{ cursor: 'pointer' }}
                >
                  {failedJob.releasePage}
                </Anchor>
                <IconExternalLink size={10} />
              </Group>
              <Text size="xs" c="dimmed">
                {t('setup.download.runtimeUpdateHint', {
                  runtimeJson: 'resources/runtime/runtime.json',
                  modelJson: 'resources/models/<model>.json',
                })}
              </Text>
            </Stack>
          )}

          <List size="xs" mt="xs" spacing={2}>
            {diag.category === 'network' && (
              <>
                <List.Item>{t('setup.download.networkAdvice.connection')}</List.Item>
                <List.Item>{t('setup.download.networkAdvice.proxy')}</List.Item>
                <List.Item>{t('setup.download.networkAdvice.retry')}</List.Item>
              </>
            )}
            {diag.category === 'integrity' && (
              <>
                <List.Item>{t('setup.download.integrityAdvice.retry')}</List.Item>
                <List.Item>{t('setup.download.integrityAdvice.recurring')}</List.Item>
              </>
            )}
            <List.Item>
              {t('setup.download.helpLinkPrefix')}
              <Anchor
                size="xs"
                onClick={() => navigate('/help')}
                style={{ cursor: 'pointer' }}
              >
                {t('setup.download.helpLink')}
              </Anchor>
              {t('setup.download.helpLinkSuffix')}
            </List.Item>
          </List>
        </Card>

        <Group>
          <Button
            size="xs"
            leftSection={<IconRefresh size={14} />}
            onClick={onReset}
          >
            {t('setup.download.reset')}
          </Button>
          {jobs.length > 0 && (
            <Button
              size="xs"
              variant="default"
              leftSection={<IconDownload size={14} />}
              onClick={onRetry}
            >
              {t('setup.download.retry')}
            </Button>
          )}
        </Group>
      </Stack>
    </Alert>
  );
}
