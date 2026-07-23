/**
 * Verify the vector contract by inserting synthetic data and running a
 * cosine-distance query inside a transaction that is rolled back.
 *
 * Runs only when RUN_DATABASE_INTEGRATION_TESTS=true.
 * Never uses real QuestorOS data.
 * Never prints vector contents or credentials.
 */
import pg from 'pg';

const { Client } = pg;

function makeVector(value: number): number[] {
  return new Array(1024).fill(value);
}

/**
 * Build a 1024-dimensional pgvector literal.
 */
function vecLiteral(values: number[]): string {
  return `[${values.join(',')}]`;
}

async function main(): Promise<void> {
  if (process.env.RUN_DATABASE_INTEGRATION_TESTS !== 'true') {
    console.log('SKIP: RUN_DATABASE_INTEGRATION_TESTS is not set to true.');
    process.exit(0);
  }

  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('ERROR: DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new Client({ connectionString: url });
  await client.connect();

  try {
    await client.query('BEGIN');

    // 1. Insert synthetic tenant
    const tenantRes = await client.query(
      `INSERT INTO tenants (id, slug, name, status)
       VALUES (gen_random_uuid(), 'vector-test-tenant', 'Vector Test Tenant', 'ACTIVE')
       RETURNING id`,
    );
    const tenantId: string = tenantRes.rows[0].id;
    console.log('  ✓ Synthetic tenant created');

    // 2. Insert synthetic workspace
    const wsRes = await client.query(
      `INSERT INTO workspaces (id, tenant_id, slug, name, status)
       VALUES (gen_random_uuid(), $1, 'vector-test-workspace', 'Vector Test Workspace', 'ACTIVE')
       RETURNING id`,
      [tenantId],
    );
    const workspaceId: string = wsRes.rows[0].id;
    console.log('  ✓ Synthetic workspace created');

    // 3. Insert synthetic project
    const projRes = await client.query(
      `INSERT INTO projects (id, tenant_id, workspace_id, slug, name, status)
       VALUES (gen_random_uuid(), $1, $2, 'vector-test-project', 'Vector Test Project', 'ACTIVE')
       RETURNING id`,
      [tenantId, workspaceId],
    );
    const projectId: string = projRes.rows[0].id;
    console.log('  ✓ Synthetic project created');

    // 4. Insert two synthetic memories
    const memARes = await client.query(
      `INSERT INTO memories (
         id, tenant_id, workspace_id, project_id,
         scope_type, scope_id, memory_type, status,
         content, content_hash, importance, confidence
       ) VALUES (
         gen_random_uuid(), $1, $2, $3,
         'PROJECT', $3, 'FACT', 'ACTIVE',
         'Vector test memory A', 'hash-a', 0.5000, 1.0000
       ) RETURNING id`,
      [tenantId, workspaceId, projectId],
    );
    const memoryAId: string = memARes.rows[0].id;

    const memBRes = await client.query(
      `INSERT INTO memories (
         id, tenant_id, workspace_id, project_id,
         scope_type, scope_id, memory_type, status,
         content, content_hash, importance, confidence
       ) VALUES (
         gen_random_uuid(), $1, $2, $3,
         'PROJECT', $3, 'FACT', 'ACTIVE',
         'Vector test memory B', 'hash-b', 0.5000, 1.0000
       ) RETURNING id`,
      [tenantId, workspaceId, projectId],
    );
    const memoryBId: string = memBRes.rows[0].id;
    console.log('  ✓ Two synthetic memories created');

    // 5. Insert two deterministic 1024-d embeddings
    // Memory A gets a target vector, Memory B gets a different one
    const vecA = makeVector(0.1);
    const vecB = makeVector(0.9);

    await client.query(
      `INSERT INTO memory_embeddings (
         id, tenant_id, memory_id,
         scope_type, scope_id,
         embedding_model, embedding_dimensions, embedding
       ) VALUES (
         gen_random_uuid(), $1, $2,
         'PROJECT', $3,
         'amazon.titan-embed-text-v2:0', 1024, $4::vector
       )`,
      [tenantId, memoryAId, projectId, vecLiteral(vecA)],
    );

    await client.query(
      `INSERT INTO memory_embeddings (
         id, tenant_id, memory_id,
         scope_type, scope_id,
         embedding_model, embedding_dimensions, embedding
       ) VALUES (
         gen_random_uuid(), $1, $2,
         'PROJECT', $3,
         'amazon.titan-embed-text-v2:0', 1024, $4::vector
       )`,
      [tenantId, memoryBId, projectId, vecLiteral(vecB)],
    );
    console.log('  ✓ Two synthetic embeddings created');

    // 6. Run cosine-distance query — vecA is closer to itself
    const queryVec = vecLiteral(vecA);
    const searchRes = await client.query(
      `SELECT me.memory_id, me.embedding <=> $1::vector AS distance
       FROM memory_embeddings me
       WHERE me.tenant_id = $2
         AND me.scope_type = 'PROJECT'
         AND me.scope_id = $3
       ORDER BY me.embedding <=> $1::vector
       LIMIT 2`,
      [queryVec, tenantId, projectId],
    );

    if (searchRes.rows.length < 2) {
      throw new Error(`Expected 2 results, got ${searchRes.rows.length}`);
    }

    const nearestId: string = searchRes.rows[0].memory_id;
    const distA: number = parseFloat(searchRes.rows[0].distance);
    const distB: number = parseFloat(searchRes.rows[1].distance);

    if (nearestId !== memoryAId) {
      throw new Error(`Expected nearest memory to be A (${memoryAId}), got ${nearestId}`);
    }

    if (distA >= distB) {
      throw new Error(`Expected distance A < distance B, but got A=${distA} B=${distB}`);
    }

    console.log(`  ✓ Cosine search returns memory A first (dist=${distA.toFixed(6)})`);
    console.log(`  ✓ Memory B is second (dist=${distB.toFixed(6)})`);

    // 7. Roll back
    await client.query('ROLLBACK');
    console.log('  ✓ Transaction rolled back, no synthetic data remains');
    console.log('\nVector contract verification PASSED.');
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err: Error) => {
  console.error(`\nVector contract FAILED: ${err.message}`);
  process.exit(1);
});
