import { defineConfig } from 'vite';

/**
 * GitHub Pages project URL: https://<user>.github.io/<repo>/ (or /repo without trailing slash).
 * `base: './'` breaks when the site is opened as `.../repo` (no slash): `./assets/x.js` can resolve to `/assets/x.js`.
 * Production builds therefore use an absolute repo prefix: `/repo/assets/...`.
 *
 * Override: `VITE_GH_PAGES_BASE=/my-repo/` npm run build
 * In GitHub Actions, `GITHUB_REPOSITORY` is `owner/repo`; we use the repo segment only → `/repo/`.
 */
function productionBase(): string {
  const override = process.env.VITE_GH_PAGES_BASE?.trim();
  if (override) return override.endsWith('/') ? override : `${override}/`;
  const repo = process.env.GITHUB_REPOSITORY?.split('/')[1];
  if (repo) return `/${repo}/`;
  // Local `npm run build` — must match your GitHub repository name (last segment of the Pages URL).
  return '/cc-vibe-c10-8ballpool/';
}

export default defineConfig(({ command }) => ({
  base: command === 'serve' ? '/' : productionBase(),
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: { port: 5174, open: true },
}));
