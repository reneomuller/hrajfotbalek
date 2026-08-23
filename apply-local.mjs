import { readFileSync } from "node:fs";
import pg from "pg";
const url = readFileSync(".env.test.local","utf8").match(/^SUPABASE_DB_URL=(.*)$/m)[1].replace(/^"|"$/g,"");
if (!/^(127\.0\.0\.1|localhost)/.test(new URL(url).host)) throw new Error("not local");
const c = new pg.Client({ connectionString: url });
c.on("notice", n => console.log("  NOTICE:", n.message));
await c.connect(); await c.query(readFileSync(process.argv[2],"utf8"));
console.log("APPLIED LOCALLY"); await c.end();
