/**
 * Database health report for the local production copy (or any Postgres you point it at): table
 * sizes, the slowest queries (needs pg_stat_statements) and indexes that are or aren't used.
 * Run it after seeding and after a load test, before migrating to the cloud.
 *
 *   pnpm db:report                       # uses DIRECT_DATABASE_URL, else DATABASE_URL
 *   pnpm db:report --reset               # clear query statistics first (then run the load test)
 *
 * From your machine against the Docker copy: DATABASE_URL=postgresql://clocktime:clocktime-local@localhost:5433/clocktime pnpm db:report
 */
import "dotenv/config";
import pg from "pg";

const url = process.env.DIRECT_DATABASE_URL || process.env.DATABASE_URL;
if (!url) throw new Error("Set DATABASE_URL (or DIRECT_DATABASE_URL).");
const client = new pg.Client({ connectionString: url });
await client.connect();

const table = (title: string, rows: Record<string, unknown>[]) => {
  console.log(`\n${title}`);
  if (rows.length) console.table(rows);
  else console.log("  (none)");
};

const hasStatements =
  (await client.query("select 1 from pg_extension where extname = 'pg_stat_statements'")).rowCount === 1;
if (process.argv.includes("--reset")) {
  try {
    if (hasStatements) await client.query("select pg_stat_statements_reset()");
    await client.query("select pg_stat_reset()");
  } catch (err) {
    console.error(
      `Couldn't reset statistics (${(err as Error).message}). Connect as a superuser, or run as one:\n` +
        `  GRANT EXECUTE ON FUNCTION pg_stat_statements_reset TO <app user>; GRANT pg_read_all_stats TO <app user>;`,
    );
    process.exit(1);
  }
  console.log("Query and table statistics cleared. Run the load test, then `pnpm db:report` again.");
  await client.end();
  process.exit(0);
}

const db = await client.query(
  "select current_database() as database, pg_size_pretty(pg_database_size(current_database())) as size, version() as version",
);
console.log(`${db.rows[0].database}: ${db.rows[0].size} · ${String(db.rows[0].version).split(",")[0]}`);

table(
  "Largest tables",
  (
    await client.query(`
      select relname as table, n_live_tup as rows,
             pg_size_pretty(pg_total_relation_size(relid)) as total,
             pg_size_pretty(pg_indexes_size(relid)) as indexes,
             seq_scan, idx_scan
      from pg_stat_user_tables order by pg_total_relation_size(relid) desc limit 15`)
  ).rows,
);

table(
  "Tables read mostly by full scans (candidates for an index, if they're large)",
  (
    await client.query(`
      select relname as table, n_live_tup as rows, seq_scan, seq_tup_read, coalesce(idx_scan, 0) as idx_scan
      from pg_stat_user_tables
      where n_live_tup > 10000 and seq_scan > coalesce(idx_scan, 0) and seq_tup_read > 1000000
      order by seq_tup_read desc limit 10`)
  ).rows,
);

if (hasStatements) {
  table(
    "Slowest queries by total time (pg_stat_statements)",
    (
      await client.query(`
        select calls, round(total_exec_time::numeric) as total_ms, round(mean_exec_time::numeric, 2) as mean_ms,
               round(max_exec_time::numeric) as max_ms, rows,
               left(regexp_replace(query, '\\s+', ' ', 'g'), 110) as query
        from pg_stat_statements
        where dbid = (select oid from pg_database where datname = current_database())
        order by total_exec_time desc limit 15`)
    ).rows,
  );
} else {
  console.log("\n(pg_stat_statements isn't enabled here: the Docker copy turns it on automatically.)");
}

table(
  "Unused indexes on large tables (each costs write time; keep unique ones)",
  (
    await client.query(`
      select s.relname as table, s.indexrelname as index, pg_size_pretty(pg_relation_size(s.indexrelid)) as size,
             i.indisunique as unique
      from pg_stat_user_indexes s join pg_index i on i.indexrelid = s.indexrelid
      where s.idx_scan = 0 and pg_relation_size(s.indexrelid) > 1024 * 1024
      order by pg_relation_size(s.indexrelid) desc limit 15`)
  ).rows,
);

const conns = await client.query(
  "select count(*)::int as connections, (select setting from pg_settings where name = 'max_connections') as max from pg_stat_activity",
);
console.log(`\nConnections now: ${conns.rows[0].connections} of ${conns.rows[0].max}`);
await client.end();
