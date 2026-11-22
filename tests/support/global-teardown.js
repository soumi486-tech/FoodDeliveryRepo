// Deletes every throwaway user created by the suite (email fdtest_*@example.test) and their data.
// Skipped when testing a deployed BASE_URL without a DATABASE_URL.
import pg from 'pg';

export default async function globalTeardown() {
  try { process.loadEnvFile('.env.test'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  if (!process.env.DATABASE_URL) return;
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const users = await client.query(`SELECT id FROM "user" WHERE email LIKE 'fdtest\\_%@example.test'`);
    const ids = users.rows.map((r) => r.id);
    if (ids.length) {
      await client.query('DELETE FROM orders WHERE customer_id = ANY($1)', [ids]); // cascades to items/events
      await client.query('DELETE FROM session WHERE "userId" = ANY($1)', [ids]);
      await client.query('DELETE FROM account WHERE "userId" = ANY($1)', [ids]);
      await client.query('DELETE FROM "user" WHERE id = ANY($1)', [ids]);
    }
    console.log(`[teardown] removed ${ids.length} test user(s)`);
  } finally {
    await client.end();
  }
}
