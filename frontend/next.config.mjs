/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'standalone',
  webpack: (config) => {
    // pdfjs-dist は Node 実行時の描画用に 'canvas' を任意依存として参照する。
    // 名簿PDFの分割はブラウザでしか動かさないため、バンドルから外す。
    // これが無いとクリーンな環境のビルドが Module not found: 'canvas' で失敗する。
    config.resolve.alias = { ...config.resolve.alias, canvas: false };
    return config;
  },
};

export default nextConfig;
