import { defineConfig } from "vite"
import react from "@vitejs/plugin-react"
import { fileURLToPath, URL } from "node:url"

// GitHub Pages serves this from /job-lab/ unless a custom domain is attached,
// and every asset URL plus the data fetches are resolved against BASE_URL. Set
// JOBLAB_BASE=/ in CI once jobs.kousikdutta.com is pointed here.
const base = process.env.JOBLAB_BASE ?? "/job-lab/"

export default defineConfig(({ command }) => ({
  base: command === "serve" ? "/" : base,
  plugins: [react()],
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  build: { outDir: "dist", sourcemap: false },
}))
