import { defineConfig } from "vite";

export default defineConfig({
  base: "/picross/",       // fine for Cloudflare Pages + Discord
  envDir: "../",

  server: {
    host: true,
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
    allowedHosts: ["play.kemonopicross.xyz"],
    hmr: { clientPort: 443 },
  },
});
