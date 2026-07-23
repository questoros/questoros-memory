/**
 * Bootstrap the questoros_memory target database.
 *
 * 1. Loads DATABASE_URL from the local environment (dotenv / process.env).
 * 2. Parses the URL and validates it.
 * 3. Connects to the cluster via the administrative 'defaultdb' database.
 * 4. Creates 'questoros_memory' if it does not already exist.
 * 5. Closes the connection cleanly.
 *
 * Prints only sanitized status messages. Never prints credentials or the full URL.
 */
import pg from 'pg';
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '..', '..', '.env') });

const { Client } = pg;

function parseDatabaseUrl(url: string): {
  protocol: string;
  username: string;
  password: string;
  host: string;
  port: string;
  database: string;
  params: URLSearchParams;
} {
  try {
    const parsed = new URL(url);
    return {
      protocol: parsed.protocol,
      username: decodeURIComponent(parsed.username),
      password: decodeURIComponent(parsed.password),
      host: parsed.hostname,
      port: parsed.port || '26257',
      database: parsed.pathname.replace(/^\//, ''),
      params: parsed.searchParams,
    };
  } catch {
    throw new Error('DATABASE_URL is not a valid URL');
  }
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const info = parseDatabaseUrl(url);

  if (info.protocol !== 'postgresql:') {
    throw new Error(`Unsupported protocol: ${info.protocol}`);
  }
  if (!info.username || !info.host) {
    throw new Error('DATABASE_URL must include credentials and host');
  }
  if (!info.params.has('sslmode')) {
    throw new Error('DATABASE_URL must include sslmode parameter');
  }

  const targetDb = info.database || 'questoros_memory';
  if (targetDb !== 'questoros_memory') {
    throw new Error(`Expected target database 'questoros_memory' but URL specifies '${targetDb}'`);
  }

  // Build admin URL pointing to defaultdb
  const adminUrl = new URL(url);
  adminUrl.pathname = '/defaultdb';
  const adminConnectionString = adminUrl.toString();

  console.log('Connecting to cluster to bootstrap database...');

  const client = new Client({ connectionString: adminConnectionString });
  try {
    await client.connect();
    await client.query(`CREATE DATABASE IF NOT EXISTS questoros_memory;`);
    console.log("Database 'questoros_memory' is ready.");
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: Error) => {
  console.error(`Bootstrap failed: ${err.message}`, err.stack ? `\n${err.stack}` : '');
  process.exit(1);
});
