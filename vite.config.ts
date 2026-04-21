import { defineConfig } from 'vite';

// GitHub Pages "project" sites are served from https://<user>.github.io/<repo>/.
// Default base "/" makes the build reference /assets/... at the domain root, which 404s.
// Relative base keeps asset URLs correct under any subdirectory (and still works locally).
export default defineConfig({
  base: './',
  build: { outDir: 'dist', assetsDir: 'assets' },
  server: { port: 5174, open: true },
});
