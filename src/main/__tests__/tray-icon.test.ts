import { describe, expect, it } from 'vitest';

import { TRAY_ICON_SIZE, createTrayIconDataURL } from '../tray-icon.ts';

// PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('createTrayIconDataURL', () => {
  it('returns a non-empty data URL string', () => {
    const dataURL = createTrayIconDataURL();
    expect(typeof dataURL).toBe('string');
    expect(dataURL.length).toBeGreaterThan(0);
  });

  it('returns a PNG data URL', () => {
    const dataURL = createTrayIconDataURL();
    expect(dataURL).toMatch(/^data:image\/png;base64,/);
  });

  it('base64 payload decodes to a valid PNG (correct magic bytes)', () => {
    const dataURL = createTrayIconDataURL(),
      base64 = dataURL.replace(/^data:image\/png;base64,/, ''),
      bytes = Buffer.from(base64, 'base64');
    expect(bytes.subarray(0, 8)).toEqual(PNG_MAGIC);
  });

  it('uses the expected icon size', () => {
    expect(TRAY_ICON_SIZE).toBe(22);
  });
});
