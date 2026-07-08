import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

// In dev the backend (server/) is proxied so the site runs same-origin;
// for production set VITE_BACKEND_URL at build time or put the site behind
// the same reverse proxy as the backend.
export default defineConfig({
    plugins: [vue()],
    server: {
        proxy: {
            '/api': 'http://localhost:3311',
            '/charts': 'http://localhost:3311',
        },
    },
});
