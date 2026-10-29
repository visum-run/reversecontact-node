import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['esm', 'cjs'],
  target: 'node22',
  platform: 'neutral',
  deps: { onlyBundle: [] },
  outputOptions: { exports: 'named' },
  dts: true,
  sourcemap: true
})
