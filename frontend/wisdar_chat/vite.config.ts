// frontend/wisdar_chat/vite.config.ts
import path from "path"
import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  server: { // Add or modify the server configuration
    host: true, // Optional: This makes the server accessible on your local network
    allowedHosts: [
      'tender-wolves-turn.loca.lt',
      'cool-results-bathe.loca.lt'
       // Your specific ngrok URL
      // You can add more allowed hosts here if needed
    ],
    proxy: {
      // This proxies any request starting with /api to your backend server
      '/api': {
        target: 'https://moody-cameras-flow.loca.lt', // The address of your Flask backend
        changeOrigin: true, // Recommended for virtual hosts
        secure: false, // Set to true if your backend is on HTTPS
      },
    },
    // If you have an HMR (Hot Module Replacement) configuration, ensure it's compatible
    // For example, if ngrok uses wss, you might need:
    // hmr: {
    //   protocol: 'wss', // if your ngrok tunnel uses wss for websockets
    // }
  },
})