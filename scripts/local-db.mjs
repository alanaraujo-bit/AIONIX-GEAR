// Starts a local PostgreSQL server for development and automated tests.
// Data lives in .local-pg/ (gitignored). Usage: node scripts/local-db.mjs
import EmbeddedPostgres from "embedded-postgres";
import { existsSync } from "node:fs";

const dir = new URL("../.local-pg", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const pg = new EmbeddedPostgres({
  databaseDir: dir,
  user: "postgres",
  password: "postgres",
  port: 54329,
  persistent: true,
  initdbFlags: ["--encoding=UTF8", "--locale=C", "--lc-messages=C"],
});

if (!existsSync(dir)) await pg.initialise();
await pg.start();
const client = pg.getPgClient();
await client.connect();
// Windows initdb defaults to WIN1252; recreate template1 as UTF-8 so every new
// database (including Prisma's shadow database) is UTF-8.
{
  const { rows } = await client.query("SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = 'template1'");
  if (rows[0].enc !== "UTF8") {
    await client.query("UPDATE pg_database SET datistemplate = false WHERE datname = 'template1'");
    await client.query("DROP DATABASE template1");
    await client.query("CREATE DATABASE template1 WITH TEMPLATE template0 ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C'");
    await client.query("UPDATE pg_database SET datistemplate = true WHERE datname = 'template1'");
  }
}
for (const name of ["aionix_gear", "aionix_gear_test"]) {
  const { rows } = await client.query("SELECT pg_encoding_to_char(encoding) AS enc FROM pg_database WHERE datname = $1", [name]);
  if (rows[0] && rows[0].enc !== "UTF8") await client.query(`DROP DATABASE "${name}"`);
  if (!rows[0] || rows[0].enc !== "UTF8") {
    await client.query(`CREATE DATABASE "${name}" ENCODING 'UTF8' LC_COLLATE 'C' LC_CTYPE 'C' TEMPLATE template0`);
  }
}
await client.end();
console.log("Local Postgres ready on port 54329 (databases: aionix_gear, aionix_gear_test)");
const stop = async () => { await pg.stop(); process.exit(0); };
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
