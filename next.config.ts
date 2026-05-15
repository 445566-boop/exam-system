import type { NextConfig } from 'next';
import path from 'path';

const nextConfig: NextConfig = {
  // outputFileTracingRoot: path.resolve(__dirname, '../../'),
  /* config options here */
  allowedDevOrigins: ['*.dev.coze.site'],
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'lf-coze-web-cdn.coze.cn',
        pathname: '/**',
      },
    ],
  },
  // 解决 coze-coding-dev-sdk 的依赖问题
  serverExternalPackages: ['coze-coding-dev-sdk', '@langchain/openai', '@langchain/core'],
  // 关闭开发指示器
  devIndicators: false,
};

export default nextConfig;
