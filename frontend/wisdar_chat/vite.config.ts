// frontend/wisdar_chat/vite.config.ts
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');

  return {
    plugins: [react()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    server: {
      host: true, // Allows access from your network
      proxy: {
        // This rule says: "if a request starts with /api,
        // send it to the target server instead."
        '/api': {
          target: env.VITE_API_URL || 'http://localhost:5000', // Your backend URL
          changeOrigin: true, // Recommended for virtual hosts
          secure: false,      // Useful if your backend is not on https
        },
      },
    },
  }
})