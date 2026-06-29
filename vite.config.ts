import { defineConfig } from 'vite';

const BACKEND_URL = process.env.VITE_API_URL || 'http://localhost:8000';

export default defineConfig({
  server: {
    port: 5173,
    proxy: {
      '/create_room': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/join_room': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/room_state': {
        target: BACKEND_URL,
        changeOrigin: true,
      },
      '/socket.io': {
        target: BACKEND_URL,
        changeOrigin: true,
        ws: true,
      },
    },
  },
});