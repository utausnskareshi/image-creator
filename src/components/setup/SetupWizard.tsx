import { useState } from 'react';
import { Stepper, Group, Button, Stack, Card, Title, Box } from '@mantine/core';
import { notifications } from '@mantine/notifications';
import { useNavigate } from 'react-router-dom';
import { getVersion } from '@tauri-apps/api/app';
import { IconArrowLeft, IconArrowRight, IconCheck } from '@tabler/icons-react';
import { WelcomeStep } from './steps/WelcomeStep';
import { LicenseStep } from './steps/LicenseStep';
import { GpuCheckStep } from './steps/GpuCheckStep';
import { DataFolderStep } from './steps/DataFolderStep';
import { SummaryStep } from './steps/SummaryStep';
import { DownloadStep } from './steps/DownloadStep';
import { saveSettings } from '../../lib/tauri';
import { useAppStore } from '../../stores/appStore';
import { useTranslation } from '../../i18n/useTranslation';
import type { GpuInfo } from '../../types';

// セットアップウィザード本体
// Mantine の Stepper をベースにステップ管理し、各ステップで集めた入力を統合する
//
// ステップ構成:
//   0: ようこそ
//   1: ライセンス同意
//   2: GPU 検出
//   3: 保存先フォルダ選択
//   4: 確認（サマリ）
//   5: ダウンロード実行
export function SetupWizard() {
  const navigate = useNavigate();
  const { settings, setSettings } = useAppStore();
  const { t } = useTranslation();

  const [active, setActive] = useState(0);

  // 各ステップの状態
  const [licenseAccepted, setLicenseAccepted] = useState(settings.licenseAccepted);
  const [gpuInfo, setGpuInfo] = useState<GpuInfo | null>(null);
  const [dataFolder, setDataFolder] = useState<string>(settings.dataFolder ?? '');
  const [dataFolderValid, setDataFolderValid] = useState(false);

  // 保存・ダウンロード制御
  const [saving, setSaving] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [downloadCompleted, setDownloadCompleted] = useState(false);

  const totalSteps = 6;

  // 各ステップから次へ進めるかの判定
  const canProceed = (): boolean => {
    switch (active) {
      case 0:
        return true; // Welcome は常に進める
      case 1:
        return licenseAccepted;
      case 2:
        return gpuInfo?.available === true;
      case 3:
        return dataFolderValid;
      case 4:
        return true; // Summary は確認のみ
      case 5:
        return downloadCompleted; // ダウンロードが完了するまで進めない
      default:
        return false;
    }
  };

  const goNext = () => {
    if (!canProceed()) return;
    setActive((s) => Math.min(s + 1, totalSteps - 1));
  };

  const goPrev = () => {
    if (downloading) return; // ダウンロード中の戻るは禁止
    setActive((s) => Math.max(s - 1, 0));
  };

  // 最終的に設定保存→トップへ
  const finish = async () => {
    setSaving(true);
    try {
      // lastUsedVersion は tauri.conf.json のバージョンを単一の真実とし動的取得する
      // (ハードコードによるドリフトを防ぐ)。取得失敗時は空文字で続行。
      const currentVersion = await getVersion().catch(() => '');
      const newSettings = {
        ...settings,
        setupCompleted: true,
        licenseAccepted: true,
        dataFolder: dataFolder,
        selectedModelId: 'anima',
        lastUsedVersion: currentVersion,
      };
      await saveSettings(newSettings);
      setSettings(newSettings);
      notifications.show({
        title: t('setup.completeNotifyTitle'),
        message: t('setup.completeNotifyMessage'),
        color: 'green',
        icon: <IconCheck size={16} />,
      });
      navigate('/', { replace: true });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      notifications.show({
        title: t('setup.saveErrorTitle'),
        message: msg,
        color: 'red',
      });
    } finally {
      setSaving(false);
    }
  };

  const isLastStep = active === totalSteps - 1;
  const goBackDisabled = active === 0 || saving || downloading;

  return (
    // SetupPage は Layout（AppShell）でラップされないため、ここで直接スクロール領域を確保する
    <div style={{ height: '100vh', overflowY: 'auto' }}>
      <Stack
        gap="md"
        p="xl"
        style={{
          maxWidth: 900,
          margin: '24px auto',
        }}
      >
      <Title order={2}>{t('setup.title')}</Title>

      <Stepper active={active} onStepClick={setActive} allowNextStepsSelect={false} size="sm">
        <Stepper.Step label={t('setup.step.welcome.label')} description={t('setup.step.welcome.desc')} />
        <Stepper.Step label={t('setup.step.license.label')} description={t('setup.step.license.desc')} />
        <Stepper.Step label={t('setup.step.gpu.label')} description={t('setup.step.gpu.desc')} />
        <Stepper.Step label={t('setup.step.folder.label')} description={t('setup.step.folder.desc')} />
        <Stepper.Step label={t('setup.step.summary.label')} description={t('setup.step.summary.desc')} />
        <Stepper.Step label={t('setup.step.download.label')} description={t('setup.step.download.desc')} />
      </Stepper>

      <Card withBorder padding="lg" radius="md">
        <Box style={{ minHeight: 360 }}>
          {active === 0 && <WelcomeStep />}
          {active === 1 && (
            <LicenseStep accepted={licenseAccepted} onAcceptedChange={setLicenseAccepted} />
          )}
          {active === 2 && <GpuCheckStep onResult={setGpuInfo} />}
          {active === 3 && (
            <DataFolderStep
              dataFolder={dataFolder}
              onDataFolderChange={setDataFolder}
              onValidationResult={setDataFolderValid}
            />
          )}
          {active === 4 && (
            <SummaryStep
              gpuInfo={gpuInfo}
              dataFolder={dataFolder}
              licenseAccepted={licenseAccepted}
            />
          )}
          {active === 5 && (
            <DownloadStep
              dataFolder={dataFolder}
              modelId="anima"
              onBusyChange={setDownloading}
              onAllComplete={() => setDownloadCompleted(true)}
            />
          )}
        </Box>
      </Card>

      <Group justify="space-between">
        <Button
          variant="default"
          leftSection={<IconArrowLeft size={16} />}
          onClick={goPrev}
          disabled={goBackDisabled}
        >
          {t('common.back')}
        </Button>

        {!isLastStep ? (
          <Button
            rightSection={<IconArrowRight size={16} />}
            onClick={goNext}
            disabled={!canProceed()}
          >
            {active === 4 ? t('setup.toDownload') : t('setup.next')}
          </Button>
        ) : (
          <Button
            color="image-creator"
            rightSection={<IconCheck size={16} />}
            onClick={finish}
            loading={saving}
            disabled={!canProceed() || downloading}
          >
            {t('setup.finish')}
          </Button>
        )}
      </Group>
      </Stack>
    </div>
  );
}
