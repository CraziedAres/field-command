import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  worker: { format: 'es' }, // the computer player runs in a module worker
  server: {
    host: true, // reachable from a phone on the same network
    proxy: { '/api': { target: 'http://localhost:8787', ws: true } }, // `npm run dev:server`
  },
});
