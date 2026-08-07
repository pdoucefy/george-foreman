import { useEffect, useState } from 'react';

export const formatElapsed = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  return `${seconds}s`;
};

/**
 * Returns a human-readable elapsed time string that counts up from `startMs`
 * while the job is active. Updates every second.
 *
 * Format: "34s" | "2m 34s" | "1h 12m"
 */
export const useElapsedTime = (startMs: number): string => {
  const [elapsed, setElapsed] = useState(() => Date.now() - startMs);

  useEffect(() => {
    const id = setInterval(() => {
      setElapsed(Date.now() - startMs);
    }, 1000);
    return () => clearInterval(id);
  }, [startMs]);

  return formatElapsed(elapsed);
};

/**
 * Returns a human-readable "Xm ago" / "Xh ago" / "Xd ago" / "Xmo ago" string for a past timestamp.
 */
export const formatTimeAgo = (ms: number): string => {
  const totalSeconds = Math.max(0, Math.floor((Date.now() - ms) / 1000));
  const months = Math.floor(totalSeconds / (30 * 24 * 3600));
  const days = Math.floor(totalSeconds / (24 * 3600));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);

  if (months > 0) return `${months}mo ago`;
  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'just now';
};
