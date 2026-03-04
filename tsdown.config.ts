import { defineConfig } from 'tsdown';

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  clean: true,
  deps: {
    neverBundle: [
    '@aws-sdk/client-s3',
    '@aws-sdk/client-ec2',
    '@aws-sdk/client-dynamodb',
    '@aws-sdk/lib-dynamodb',
    '@aws-sdk/credential-providers',
    'zod'
  ],
  },
  target: false,
});
