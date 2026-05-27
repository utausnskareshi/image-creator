import { useEffect, useState } from 'react';
import { Center, Loader, Stack, Text } from '@mantine/core';
import { useLocation, useNavigate } from 'react-router-dom';
import { getSettings } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';

interface BootGateProps {
  children: React.ReactNode;
}

// 起動時の設定ロードと初回セットアップ判定を行う
// - settings.json をロード
// - setupCompleted=false なら /setup へ自動遷移
// - ロード中はスプラッシュ表示
export function BootGate({ children }: BootGateProps) {
  const navigate = useNavigate();
  const location = useLocation();
  // settings は今は使っていない (BootGate 内で参照する必要がないため)。
  // 後続コンポーネントは useAppStore() を直接呼んで取得する。
  const { setSettings, isBootstrapped, setBootstrapped } = useAppStore();
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const loaded = await getSettings();
        if (cancelled) return;
        setSettings(loaded);

        // 初回セットアップ未完了 → /setup へ
        // ただし既に /setup にいるなら何もしない
        if (!loaded.setupCompleted && location.pathname !== '/setup') {
          navigate('/setup', { replace: true });
        }

        setBootstrapped(true);
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        setError(msg);
        // 致命的エラーでも UI は出す（設定が壊れた等のリカバリのため）
        setBootstrapped(true);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // (旧: 「セットアップ完了済みなのに /setup にいる場合の追従」用 useEffect を置いていたが、
  //   本体のコメントだけで処理が空だったため削除した。
  //   現状 SetupWizard.tsx の finish() が `navigate('/', { replace: true })` を呼ぶため、
  //   このガードは不要。)

  if (!isBootstrapped) {
    return (
      <Center style={{ height: '100vh' }}>
        <Stack align="center" gap="md">
          <Loader size="lg" color="image-creator" />
          <Text size="sm" c="dimmed">
            {t('boot.starting')}
          </Text>
          {error && (
            <Text size="xs" c="red">
              {error}
            </Text>
          )}
        </Stack>
      </Center>
    );
  }

  return <>{children}</>;
}
