import { SegmentedControl, Tooltip } from '@mantine/core';
import { useGenerationStore } from '../../stores/generationStore';
import { useTranslation } from '../../i18n/useTranslation';

// シンプル / 詳細モードの切替コントロール
// 永続化（localStorage）された値を読み書きする
export function ModeSwitch() {
  const mode = useGenerationStore((s) => s.mode);
  const setMode = useGenerationStore((s) => s.setMode);
  const { t } = useTranslation();

  return (
    <Tooltip label={t('gen.modeSwitch.tooltip')} position="bottom">
      <SegmentedControl
        value={mode}
        onChange={(v) => setMode(v as 'simple' | 'advanced')}
        data={[
          { label: t('gen.simple'), value: 'simple' },
          { label: t('gen.advanced'), value: 'advanced' },
        ]}
        color="image-creator"
        size="sm"
      />
    </Tooltip>
  );
}
