const isProd = process.env.NODE_ENV === 'production';
const repoName = 'agreement-visualizations';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isProd ? `/${repoName}` : '',
  assetPrefix: isProd ? `/${repoName}/` : '',
};

export default nextConfig;
