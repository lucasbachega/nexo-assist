import path from 'node:path';
import { existsSync } from 'node:fs';
import type { NextConfig } from 'next';

// Um único .env na raiz do monorepo serve ao app e ao serviço de chamados.
const rootEnv = path.resolve(import.meta.dirname, '../../.env');
if (existsSync(rootEnv)) process.loadEnvFile(rootEnv);

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pacotes do monorepo são TypeScript puro, compilados pelo Next.
  transpilePackages: ['@nexo/shared', '@nexo/agent', '@nexo/tickets'],
  // Dependências de servidor que não devem ser empacotadas.
  serverExternalPackages: ['better-sqlite3', '@mastra/core'],
  turbopack: { root: path.resolve(import.meta.dirname, '../..') },
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
    ];
  },
};

export default nextConfig;
