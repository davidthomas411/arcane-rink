import { resolve } from "node:path";
import { defineConfig } from "vite";

/**
 * The game reaches the body-tracking server (the 3d-mesh-demo-webcam repo) through
 * "/body" on its own address, so the browser never makes a cross-site request and
 * that server needs no changes. Point BODY_SERVER at wherever its page opens.
 */
const bodyProxy = {
  "/body": {
    target: process.env.BODY_SERVER ?? "http://localhost:8098",
    changeOrigin: true,
    ws: true,
    rewrite: (path: string) => path.replace(/^\/body/, "")
  }
};

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173,
    proxy: bodyProxy
  },
  preview: {
    proxy: bodyProxy
  },
  build: {
    rollupOptions: {
      input: {
        // The Realm game is the front door; the original pad game stays reachable.
        main: resolve(__dirname, "index.html"),
        legacy: resolve(__dirname, "legacy.html")
      }
    }
  }
});
