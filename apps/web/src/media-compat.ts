const browserNavigator = typeof navigator === 'undefined' ? null : navigator;

const appleTouchBrowser = browserNavigator !== null && (
  /\b(iPhone|iPad|iPod)\b/i.test(browserNavigator.userAgent)
  || (/Macintosh/i.test(browserNavigator.userAgent) && browserNavigator.maxTouchPoints > 1)
);

/** Use the included JPEG copy on Apple touch browsers; other browsers keep WebP. */
export function mediaUrlForBrowser(url: string): string {
  return appleTouchBrowser && url.toLowerCase().endsWith('.webp')
    ? `${url.slice(0, -5)}.jpg`
    : url;
}
