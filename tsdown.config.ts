import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  deps: {
    alwaysBundle: [
      /^@aws-sdk\//,
      /^@smithy\//,
      'fast-xml-parser',
      'tslib',
    ],
    onlyAllowBundle: false,
    neverBundle: ['zod'],
  },
  target: false,
});
