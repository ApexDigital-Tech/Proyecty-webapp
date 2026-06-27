import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
        'dayjs/plugin/isBetween': path.resolve(__dirname, 'src/dummy.js'),
        'dayjs/plugin/isSameOrAfter': path.resolve(__dirname, 'src/dummy.js'),
        'dayjs/plugin/isSameOrBefore': path.resolve(__dirname, 'src/dummy.js'),
        'dayjs/plugin/isLeapYear': path.resolve(__dirname, 'src/dummy.js'),
        '@popperjs/core/lib/modifiers/preventOverflow': path.resolve(__dirname, 'src/dummy.js')
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
