const isGitHubPagesBuild = process.env.GITHUB_ACTIONS === 'true';
const repoName = 'agreement-visualizations';

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  images: { unoptimized: true },
  trailingSlash: true,
  basePath: isGitHubPagesBuild ? `/${repoName}` : '',
  assetPrefix: isGitHubPagesBuild ? `/${repoName}/` : '',
};

export default nextConfig;
