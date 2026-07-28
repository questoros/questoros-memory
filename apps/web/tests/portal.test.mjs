import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const currentDirectory = path.dirname(fileURLToPath(import.meta.url));
const packageDirectory = path.resolve(currentDirectory, '..');

async function read(relativePath) {
  return readFile(path.join(packageDirectory, relativePath), 'utf8');
}

test('portal exposes the four simple MemoryOS product areas', async () => {
  const source = await read('src/index.ts');
  for (const requiredView of ["'overview'", "'ask'", "'knowledge'", "'review'"]) {
    assert.match(source, new RegExp(requiredView.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.match(source, /Overview/);
  assert.match(source, /Ask MemoryOS/);
  assert.match(source, /Knowledge/);
  assert.match(source, /Review by exception/);
});

test('workspace key is session-only and never embedded in generated config', async () => {
  const source = await read('src/index.ts');
  const buildScript = await read('scripts/copy-static.mjs');
  assert.match(source, /sessionStorage\.setItem\('memoryos\.apiKey'/);
  assert.doesNotMatch(source, /localStorage\.setItem\('memoryos\.apiKey'/);
  assert.doesNotMatch(buildScript, /API_KEY|BEARER|TOKEN|SECRET/);
});

test('public status page and source-linked evidence are present', async () => {
  const source = await read('src/index.ts');
  assert.match(source, /Live public health/);
  assert.match(source, /Supporting sources/);
  assert.match(source, /Open folder/);
  assert.match(source, /Immutable revisions/);
});

test('portal HTML contains no credential or private endpoint', async () => {
  const html = await read('public/index.html');
  assert.doesNotMatch(html, /qmem_live_/);
  assert.doesNotMatch(html, /postgresql:\/\//i);
  assert.doesNotMatch(html, /execute-api\./i);
});
