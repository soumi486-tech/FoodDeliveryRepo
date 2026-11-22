// Postgres access via Neon's serverless driver. Pool speaks the node-postgres
// API over WebSockets and supports interactive transactions.
import { trace, SpanStatusCode } from '@opentelemetry/api';
import { Pool } from '@neondatabase/serverless';
import { schema } from './schema.js';
import { seed } from './seed.js';

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set. Copy .env.example to .env and add your Neon connection string.');
  process.exit(1);
}

export const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Creates tables if missing, then lets seed.js fill an empty database.
export async function migrate() {
  await pool.query(schema);
  await seed(pool, withTransaction);
}

async function runTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// Observability: every transaction is a span. Neon's driver (and most non-pg drivers) is not auto-instrumented.
export function withTransaction(fn) {
  return trace.getTracer('db').startActiveSpan('db.transaction', async (span) => {
    try {
      return await runTransaction(fn);
    } catch (err) {
      span.recordException(err);
      span.setStatus({ code: SpanStatusCode.ERROR, message: err.message });
      throw err;
    } finally {
      span.end();
    }
  });
}
