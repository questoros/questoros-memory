import { config } from 'dotenv';
import path from 'path';
import { startMcpServer } from './server.js';

async function main() {
  // Load .env from CWD (expected to be repo root when run via pnpm)
  config({ path: path.resolve(process.cwd(), '.env') });

  const apiKey = process.env.QUESTOROS_MEMORY_API_KEY;
  if (!apiKey) {
    console.error('ERROR: QUESTOROS_MEMORY_API_KEY is not set.');
    console.error(
      'Run the bootstrap script first: pnpm --filter @questoros-memory/database auth:bootstrap-local -- --write-env',
    );
    process.exit(1);
  }

  // Operational logs go to stderr
  console.error('Starting QuestorOS Memory MCP server v0.3.0...');
  console.error('MCP transport: stdio (stdout)');

  await startMcpServer(apiKey);
}

main().catch((err) => {
  console.error('Fatal error:', err instanceof Error ? err.message : err);
  process.exit(1);
});
