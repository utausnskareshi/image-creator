import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { MantineProvider } from '@mantine/core';
import { Notifications } from '@mantine/notifications';

// Mantine v7 はグローバルCSSを明示インポートする必要がある
import '@mantine/core/styles.css';
import '@mantine/notifications/styles.css';

import './styles/global.css';
import App from './App';
import { theme } from './theme';

// React アプリのエントリポイント
// MantineProvider と React Router をルートでラップして全画面で利用可能にする
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" />
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </MantineProvider>
  </React.StrictMode>,
);
