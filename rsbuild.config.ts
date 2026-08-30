import { defineConfig } from '@rsbuild/core';
import { pluginReact } from '@rsbuild/plugin-react';
import { pluginTailwindcss } from '@rsbuild/plugin-tailwindcss';
import { pluginNodePolyfill } from '@rsbuild/plugin-node-polyfill';

// Docs: https://rsbuild.rs/config/
export default defineConfig({
  resolve: {
    alias: {
      '@': './src',
    },
  },
  plugins: [
    pluginReact({
      reactCompiler: true,
    }),
    pluginTailwindcss(),
    pluginNodePolyfill(),
  ]
});
