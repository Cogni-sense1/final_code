import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: { port: Number(process.env.PORT) || 5173, host: true },
  // amazon-cognito-identity-js expects Node's `global`.
  define: { global: 'globalThis' },
  // The shared package is consumed as TypeScript source.
  optimizeDeps: { exclude: ['@neurovoice/shared'] },
  build: { target: 'es2022', sourcemap: true },
});
