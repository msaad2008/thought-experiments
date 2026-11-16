import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    rollupOptions: {
      input: {
        main: 'index.html',
        about: 'about/index.html',
        notFound: '404.html',
      },
    },
  },
});
