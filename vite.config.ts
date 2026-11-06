import { defineConfig } from 'vite';

// 用相對路徑，放在 GitHub Pages 的子資料夾也找得到檔案。
export default defineConfig({
  base: './',
  build: { target: 'esnext' },
});
