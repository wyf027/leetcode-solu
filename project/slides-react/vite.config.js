import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    server: {
      host: '0.0.0.0',
      port: 5188,
      strictPort: true,
      proxy: env.API_PROXY_TARGET
        ? {
            '/api': { target: env.API_PROXY_TARGET, changeOrigin: true, cookieDomainRewrite: '' },
          }
        : undefined,
    },
    build: { sourcemap: true },
  };
});
