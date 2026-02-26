import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: './',
  plugins: [react()],
  resolve: {
    alias: [{ find: /^react-native$/, replacement: 'react-native-web' }],
    extensions: ['.web.js', '.web.jsx', '.js', '.jsx', '.json']
  },
  define: {
    global: 'globalThis'
  }
});
