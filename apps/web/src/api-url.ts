/** Keep API routing at the transport boundary; the value is set per Vite environment. */
export function apiRequestUrl(path: string, configuredBase = import.meta.env.VITE_API_BASE_URL, development = import.meta.env.DEV): string {
  if (!/^\/api(?:\/|\?|$)/.test(path)) throw new Error('INVALID_API_PATH');
  const base = (configuredBase?.trim() || (development ? '/api' : '')).replace(/\/+$/, '');
  if (!base) throw new Error('API_BASE_URL_NOT_CONFIGURED');
  return `${base}${path.slice('/api'.length)}`;
}
