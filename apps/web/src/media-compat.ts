const browserNavigator = typeof navigator === 'undefined' ? null : navigator;

const appleTouchBrowser = browserNavigator !== null && (
  /\b(iPhone|iPad|iPod)\b/i.test(browserNavigator.userAgent)
  || (/Macintosh/i.test(browserNavigator.userAgent) && browserNavigator.maxTouchPoints > 1)
);
const iosJpegFallbackEnabled = import.meta.env.VITE_IOS_JPEG_FALLBACK === 'true';

/** Use JPEG copies on Apple touch browsers; all other browsers keep their WebP URLs. */
export function mediaUrlForBrowser(url: string): string {
  return iosJpegFallbackEnabled && appleTouchBrowser && url.toLowerCase().endsWith('.webp')
    ? `${url.slice(0, -5)}.jpg`
    : url;
}
