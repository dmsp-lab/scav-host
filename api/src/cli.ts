// Usage: node dist/cli.js migrate | seed [--overwrite]
import { migrate } from './migrate.js';
import { seed } from './seed.js';
import { pool } from './db.js';

const [cmd, ...args] = process.argv.slice(2);
try {
  if (cmd === 'migrate') await migrate();
  else if (cmd === 'seed') { await migrate(); await seed({ overwrite: args.includes('--overwrite') }); }
  else { console.error('Usage: cli.js migrate | seed [--overwrite]'); process.exitCode = 1; }
} catch (err) {
  console.error(err);
  process.exitCode = 1;
} finally {
  await pool.end();
}
