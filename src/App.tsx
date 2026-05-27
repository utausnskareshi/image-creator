import { Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/common/Layout';
import { BootGate } from './components/common/BootGate';
import { GeneratePage } from './pages/GeneratePage';
import { GalleryPage } from './pages/GalleryPage';
import { SettingsPage } from './pages/SettingsPage';
import { LogsPage } from './pages/LogsPage';
import { SetupPage } from './pages/SetupPage';
import { HelpPage } from './pages/HelpPage';

// アプリのルーティング定義
// BootGate が settings.json をロードし、初回セットアップ未完了なら /setup へ自動遷移する
// /setup は共通レイアウトを持たない単独ページ
export default function App() {
  return (
    <BootGate>
      <Routes>
        <Route path="/setup" element={<SetupPage />} />
        <Route element={<Layout />}>
          <Route path="/" element={<GeneratePage />} />
          <Route path="/gallery" element={<GalleryPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/logs" element={<LogsPage />} />
          <Route path="/help" element={<HelpPage />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BootGate>
  );
}
