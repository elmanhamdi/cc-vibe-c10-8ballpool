/**
 * Join Vite `import.meta.env.BASE_URL` with manifest paths served from `public/`.
 * Bundled assets (e.g. `new URL(..., import.meta.url).href`) should be passed through unchanged.
 */
export function resolveBrowserAssetUrl(baseUrl: string, browserUrl: string): string {
  if (/^(https?:|blob:|data:)/i.test(browserUrl)) return browserUrl;
  const base = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const path = browserUrl.startsWith('/') ? browserUrl.slice(1) : browserUrl;
  return `${base}${path}`;
}
