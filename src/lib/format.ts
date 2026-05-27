// 表示用フォーマッタ群
// バイト数・速度・残り時間など、UIで多用するフォーマットを集約

/**
 * バイト数を人間可読な単位に変換する。
 * 不正値 (NaN, Infinity, 負数, null/undefined) はすべて `'-'` を返す。
 */
export function formatBytes(bytes: number | null | undefined): string {
  if (bytes == null) return '-';
  if (!Number.isFinite(bytes)) return '-';
  if (bytes < 0) return '-';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(1)} MB`;
  const gb = mb / 1024;
  return `${gb.toFixed(2)} GB`;
}

export function formatSpeed(bytesPerSec: number): string {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return '-';
  return `${formatBytes(bytesPerSec)}/s`;
}

export function formatEta(
  downloadedBytes: number,
  totalBytes: number | null,
  bytesPerSec: number,
): string {
  if (!totalBytes || !Number.isFinite(bytesPerSec) || bytesPerSec <= 0 || totalBytes <= downloadedBytes) {
    return '計算中...';
  }
  const remaining = totalBytes - downloadedBytes;
  const seconds = remaining / bytesPerSec;
  if (!Number.isFinite(seconds)) return '計算中...';
  if (seconds < 60) return `残り ${Math.ceil(seconds)} 秒`;
  if (seconds < 3600) return `残り ${Math.ceil(seconds / 60)} 分`;
  return `残り ${(seconds / 3600).toFixed(1)} 時間`;
}

export function formatPercent(downloadedBytes: number, totalBytes: number | null): number {
  if (!totalBytes || totalBytes <= 0) return 0;
  if (!Number.isFinite(downloadedBytes) || downloadedBytes < 0) return 0;
  return Math.min(100, (downloadedBytes / totalBytes) * 100);
}
