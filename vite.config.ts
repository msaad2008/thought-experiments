import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        // Enabled in Task 5:
        // about: 'about/index.html',
        // notFound: '404.html',
      },
    },
  },
});
