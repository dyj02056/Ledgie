import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 모든 화면이 로그인 사용자별 데이터라 캐시 컴포넌트를 쓰지 않는다
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
