import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { config } from 'dotenv';
import { createRemoteMcpRequestHandler } from './remote.js';

function resolveEnvPath(): string {
  const cwdEnv = path.resolve(process.cwd(), '.env');
  const monorepoRootEnv = path.resolve(process.cwd(), '../../.env');
  if (existsSync(cwdEnv)) return cwdEnv;
  if (existsSync(monorepoRootEnv)) return monorepoRootEnv;
  return cwdEnv;
}

function parsePort(value: string | undefined): number {
  const port = Number(value ?? '3100');
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('REMOTE_MCP_PORT must be an integer from 1 to 65535.');
  }
  return port;
}

function allowedOrigins(value: string | undefined): string[] {
  return (value ?? '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

async function main(): Promise<void> {
  config({ path: resolveEnvPath() });

  if (process.env.REMOTE_MCP_ENABLED !== 'true') {
    throw new Error(
      'Remote MCP is disabled. Set REMOTE_MCP_ENABLED=true only for an approved local or staging test.',
    );
  }

  const host = process.env.REMOTE_MCP_HOST?.trim() || '127.0.0.1';
  const isLoopback = host === '127.0.0.1' || host === '::1' || host === 'localhost';
  if (!isLoopback && process.env.REMOTE_MCP_ALLOW_PUBLIC_BIND !== 'true') {
    throw new Error(
      'Non-loopback binding is blocked. Set REMOTE_MCP_ALLOW_PUBLIC_BIND=true only behind an approved HTTPS gateway or reverse proxy.',
    );
  }

  const port = parsePort(process.env.REMOTE_MCP_PORT);
  const handler = createRemoteMcpRequestHandler({
    allowedOrigins: allowedOrigins(process.env.REMOTE_MCP_ALLOWED_ORIGINS),
    onDiagnostic: (diagnostic) => {
      console.error(JSON.stringify(diagnostic));
    },
  });

  const server = createServer((request, response) => {
    void handler(request, response).catch(() => {
      if (!response.headersSent) {
        response.statusCode = 500;
        response.setHeader('content-type', 'application/json; charset=utf-8');
        response.end(
          JSON.stringify({
            jsonrpc: '2.0',
            error: { code: -32603, message: 'MCP request failed.' },
            id: null,
          }),
        );
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, host, () => resolve());
  });

  console.error(`QuestorOS Memory remote MCP listening on http://${host}:${port}/mcp`);
  console.error('Use this HTTP listener only for local development or behind approved HTTPS termination.');

  const shutdown = () => {
    server.close(() => process.exit(0));
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}

main().catch((error) => {
  console.error('Fatal error:', error instanceof Error ? error.message : 'Unknown error.');
  process.exit(1);
});
