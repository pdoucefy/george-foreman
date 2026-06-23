/**
 * Tray icon generator.
 *
 * createTrayIconDataURL() is a pure function — no Electron dependency.
 * It returns a PNG data URL that the main process feeds to
 * nativeImage.createFromDataURL().
 *
 * The PNG is a minimal valid 22×22 image encoded as a static base64 string.
 * Keeping it static avoids a canvas dependency in the main process and makes
 * the function trivially testable.
 */

export const TRAY_ICON_SIZE = 22;

// A flame-themed 22×22 RGBA PNG, base64-encoded.
// Generated programmatically — orange/red flame with white-yellow hot core.
export const TRAY_PNG_BASE64 =
  'iVBORw0KGgoAAAANSUhEUgAAABYAAAAWCAYAAADEtGw7AAACr0lEQVR42sWUa2iPYRjGrzHDkLHN2CGH5pB8Evmy9kW+8EUh0Yoi5ygfNKwkp0U5RQ45JiV8Yw6bMTFsZsYYc1prbCOJ8Xeu2/17/1NaDjuV98vVdd/X/et9nvd5Xul/P5WDlW6HNBFtN+jFaKXZbGU7+DCKbxfwjTits0w9cHADim8z9EwHpZUl65hl66WDDcVTbxP4UjfNqRikPNuhNwHYFU+91dDTUuq13lr7aIhu2H69C8CueOr0WwU+30kTSvpqj03XXYe+D8Coe+r0W/O2cb7ceb6fx22uKh0YagSH8NTpk2sROCdCYwp7adW9ATprS1Vl5dGfzEZaoO6p0yfXInBeZ00qite2h6m6bCtVYxU9Pgdg1D11+uRasg3DCrprwa1+Ovh4qIpsjeqsMuZLAEbdU6dPjnyzwGc7auzVGGXdSdEJm6oy26hX9qR3GIzivU6fHPnmvG3KhS6a5rdrk+9jjs3Ufduq1/Ys7msARvFep0+OPHP/+mijfXkLbyZot1+EfJunR7bTL0dVfBiM4r1Onxx55v72trF+Nsdf6akVpYk64n+yq7ZET22v3lp1wrcAjOK9Tp8ceeaY/xN4eH5XZVyP1Qbfv5PBh1umajvgt66mbxiM4r1Onxx55pj/HbSb/1jSWVZxH20v769TNkWlluVHrSiiwZ73C4NRPHXvkyPPHPNwmoIH5kZpoi9ruV/Xfb5/uZahclutWiuJ/GAvkr4HYBRP3fvkyDPHPJym4FG+nBn8XG4n6ahfgAKb5f/g9aq30qiQ1SaHwSieuvfJkWeOeTi/QhPPRWqcL2eR36bN7Jt/mEKb7yeCM1vWOWR1jWAUT9375MgzxzwceD/BI/xqTvblZPrx2cW++YcptsV+Irb4mb3b9aPVp4TBKJ6698mRZ455OPB+AIKG+jn3C57iAAAAAElFTkSuQmCC';

/**
 * Returns a PNG data URL for the tray icon.
 * Pure function — safe to call in any environment.
 */
export const createTrayIconDataURL = (): string => `data:image/png;base64,${TRAY_PNG_BASE64}`;
