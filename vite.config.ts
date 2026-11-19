import { resolve } from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 5173
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
