import { SetupWizard } from '../components/setup/SetupWizard';

// セットアップウィザードのページ
// 初回起動時に /setup に自動遷移される（BootGate参照）
export function SetupPage() {
  return <SetupWizard />;
}
