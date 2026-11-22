import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { defineConfig, type Plugin } from 'vite';

// Replaces <!-- @partial NAME --> with src/partials/NAME.html. An unknown
// NAME throws, so a typo fails the build.
function partials(): Plugin {
  return {
    name: 'html-partials',
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        return html.replace(/<!--\s*@partial\s+([\w-]+)\s*-->/g, (_m, name: string) => {
          try {
            return readFileSync(resolve(import.meta.dirname, 'src/partials', `${name}.html`), 'utf8').trimEnd();
          } catch {
            throw new Error(`Unknown HTML partial "${name}" (no src/partials/${name}.html)`);
          }
        });
      },
    },
  };
}

export default defineConfig({
  plugins: [partials()],
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about/index.html',
        gravity: 'gravity/index.html',
        uncertainty: 'uncertainty/index.html',
        relativity: 'relativity/index.html',
        notFound: '404.html',
      },
    },
  },
});
