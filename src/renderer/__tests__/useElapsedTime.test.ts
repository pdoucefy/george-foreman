import { formatElapsed, formatTimeAgo } from '@renderer/hooks/useElapsedTime';

describe('formatElapsed', () => {
  it('formats sub-minute as seconds', () => {
    expect(formatElapsed(34_000)).toBe('34s');
  });

  it('formats exactly 1 minute', () => {
    expect(formatElapsed(60_000)).toBe('1m 0s');
  });

  it('formats minutes and seconds', () => {
    expect(formatElapsed(2 * 60_000 + 34_000)).toBe('2m 34s');
  });

  it('formats hours and minutes (no seconds)', () => {
    expect(formatElapsed(1 * 3_600_000 + 12 * 60_000 + 45_000)).toBe('1h 12m');
  });

  it('handles zero', () => {
    expect(formatElapsed(0)).toBe('0s');
  });

  it('handles negative (clamps to 0)', () => {
    expect(formatElapsed(-5_000)).toBe('0s');
  });
});

describe('formatTimeAgo', () => {
  it('returns "just now" for very recent timestamps', () => {
    expect(formatTimeAgo(Date.now() - 500)).toBe('just now');
  });

  it('returns Xm ago for minutes', () => {
    expect(formatTimeAgo(Date.now() - 5 * 60_000)).toBe('5m ago');
  });

  it('returns Xh ago for hours', () => {
    expect(formatTimeAgo(Date.now() - 2 * 3_600_000)).toBe('2h ago');
  });

  it('returns Xd ago for days', () => {
    expect(formatTimeAgo(Date.now() - 3 * 24 * 3_600_000)).toBe('3d ago');
  });

  it('returns Xmo ago for months', () => {
    expect(formatTimeAgo(Date.now() - 31 * 24 * 3_600_000)).toBe('1mo ago');
  });
});
