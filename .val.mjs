import fs from 'node:fs'; import pg from 'pg';
const c=new pg.Client({connectionString:'postgresql://postgres:postgres@127.0.0.1:54322/postgres'}); await c.connect();
c.on('notice',n=>console.log('NOTICE:',n.message));
await c.query('begin'); let ok=true;
for (const f of process.argv.slice(2)){ try{ await c.query(fs.readFileSync(f,'utf8')); console.log('OK',f.split('/').pop()); }catch(e){ ok=false; console.log('FAIL',f.split('/').pop(),e.message);} }
await c.query('rollback'); console.log(ok?'VALID (rolled back)':'INVALID'); await c.end();
