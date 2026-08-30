import { defineConfig, js, ts } from '@rslint/core';

export default defineConfig([
  js.configs.recommended,
  ts.configs.recommended,
  {
    rules: {
      // customize rules here
      '@typescript-eslint/no-unused-vars': 'error'
    },
  },
]);
