import { defineConfig } from 'vite';

export default defineConfig({
  base: "/",
  envDir: '../',
  server: {
    host: true,                 // listen on all interfaces
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
    allowedHosts: [
      'play.kemonopicross.xyz'
    ],
    hmr: {
      clientPort: 443,
    },
  },
});
