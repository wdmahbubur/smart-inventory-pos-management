import { readdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
async function walk(path) { const entries = await readdir(path, { withFileTypes: true }); let files = []; for (const e of entries) { if (e.isDirectory()) files.push(...await walk(`${path}/${e.name}`)); else if (/\.(m?js)$/.test(e.name)) files.push(`${path}/${e.name}`); } return files; }
const files = (await Promise.all(['src','api','scripts','tests'].map(walk))).flat();
for (const file of files) { const r = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' }); if (r.status) { console.error(r.stderr); process.exit(1); } }
console.log(`Syntax checked ${files.length} JavaScript modules.`);
