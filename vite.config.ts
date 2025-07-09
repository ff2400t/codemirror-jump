import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  build: {
    copyPublicDir: false,
    lib: {
      entry: resolve(__dirname, "lib/main.js"),
      // Name is only required for umd and iife builds
      name: "codemirror-jump",
      fileName: "main",
      formats: ["es"],
    },
    rollupOptions: {
      // make sure to externalize deps that shouldn't be bundled
      // into the library
      external: [
        "@codemirror/commands",
        "@codemirror/state",
        "@codemirror/view",
        "@types/node",
        "codemirror",
      ],
    },
  },
});
