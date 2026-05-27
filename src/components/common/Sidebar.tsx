import { NavLink, Stack } from '@mantine/core';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  IconWand,
  IconPhoto,
  IconSettings,
  IconFileText,
  IconHelp,
} from '@tabler/icons-react';
import { useTranslation } from '../../i18n/useTranslation';
import type { TranslationKey } from '../../i18n';

// サイドバーのナビゲーション項目定義
// 新しいページを追加する場合は items 配列を編集する
const items: Array<{ labelKey: TranslationKey; path: string; icon: typeof IconWand }> = [
  { labelKey: 'nav.generate', path: '/', icon: IconWand },
  { labelKey: 'nav.gallery', path: '/gallery', icon: IconPhoto },
  { labelKey: 'nav.settings', path: '/settings', icon: IconSettings },
  { labelKey: 'nav.logs', path: '/logs', icon: IconFileText },
  { labelKey: 'nav.help', path: '/help', icon: IconHelp },
];

export function Sidebar() {
  const navigate = useNavigate();
  const location = useLocation();
  const { t } = useTranslation();

  return (
    <Stack gap="xs">
      {items.map((item) => {
        const Icon = item.icon;
        const active = location.pathname === item.path;
        return (
          <NavLink
            key={item.path}
            label={t(item.labelKey)}
            leftSection={<Icon size={18} stroke={1.6} />}
            active={active}
            onClick={() => navigate(item.path)}
            variant={active ? 'filled' : 'subtle'}
          />
        );
      })}
    </Stack>
  );
}
