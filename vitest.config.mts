import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// 앱 코드의 "@/…" 경로를 테스트에서도 풀 수 있게 한다
export default defineConfig({
  resolve: { alias: { "@": fileURLToPath(new URL(".", import.meta.url)) } },
  test: { fileParallelism: false },
});
