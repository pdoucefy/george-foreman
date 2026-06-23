import { describe, expect, it } from 'vitest';

import { shouldAllowNewInstance, shouldHideOnClose } from '../window.ts';

describe('shouldHideOnClose', () => {
  it('returns "hide" when app is not quitting', () => {
    expect(shouldHideOnClose(false)).toBe('hide');
  });

  it('returns "quit" when app is quitting', () => {
    expect(shouldHideOnClose(true)).toBe('quit');
  });
});

describe('shouldAllowNewInstance', () => {
  it('returns "continue" when this instance holds the lock', () => {
    expect(shouldAllowNewInstance(true)).toBe('continue');
  });

  it('returns "quit" when another instance already holds the lock', () => {
    expect(shouldAllowNewInstance(false)).toBe('quit');
  });
});
