import { useEffect, useState } from 'react';
import { AppShell, Burger, Group, Title, Text } from '@mantine/core';
import { useDisclosure } from '@mantine/hooks';
import { Outlet } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { Sidebar } from './Sidebar';
import { useTranslation } from '../../i18n/useTranslation';

// メインレイアウト
// 左サイドバー＋上ヘッダー＋メインコンテンツ領域
export function Layout() {
  const [opened, { toggle }] = useDisclosure(true);
  const { t } = useTranslation();
  // バージョンは tauri.conf.json を単一の真実として動的取得する
  const [appVersion, setAppVersion] = useState<string>('');
  useEffect(() => {
    getVersion()
      .then(setAppVersion)
      .catch((e) => console.error('バージョン取得失敗', e));
  }, []);

  return (
    <AppShell
      header={{ height: 56 }}
      navbar={{
        width: 220,
        breakpoint: 'sm',
        collapsed: { mobile: !opened, desktop: !opened },
      }}
      padding="md"
    >
      <AppShell.Header>
        <Group h="100%" px="md" justify="space-between">
          <Group>
            <Burger opened={opened} onClick={toggle} size="sm" />
            <Title order={4}>{t('app.title')}</Title>
          </Group>
          <Text size="xs" c="dimmed">
            {appVersion ? `v${appVersion}` : ''}
          </Text>
        </Group>
      </AppShell.Header>

      <AppShell.Navbar p="xs">
        <Sidebar />
      </AppShell.Navbar>

      {/*
        AppShell.Main 領域に縦スクロールを有効化。
        global.css で body の overflow: hidden を維持しつつ、
        Main の内部だけがスクロールするアプリ風レイアウトを実現する。
        height は viewport - header の 56px。
      */}
      <AppShell.Main style={{ height: '100vh', overflowY: 'auto' }}>
        <Outlet />
      </AppShell.Main>
    </AppShell>
  );
}
