import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { resolve, extname, sep } from 'node:path';
const root = resolve(process.env.SERVE_DIST ? 'dist' : '.'); const port = Number(process.env.PORT || 5173);
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml', '.json':'application/json' };
http.createServer(async (req,res) => {
  try {
    const path = decodeURIComponent(new URL(req.url,'http://local').pathname);
    if (path.startsWith('/api/')) { res.writeHead(503, { 'Content-Type':'application/json' }); res.end(JSON.stringify({ error: 'Use Vercel dev for serverless AI. Local rules mode remains available.' })); return; }
    if (/\.(env|sql|md)$/.test(path) || path.includes('/.') || ['supabase','tests','scripts','docs','node_modules'].some(p=>path.startsWith(`/${p}/`))) { res.writeHead(404); res.end(); return; }
    let filename = resolve(root, '.' + (path === '/' ? '/index.html' : path));
    if (!filename.startsWith(root + sep)) { res.writeHead(403); res.end(); return; }
    if (!process.env.SERVE_DIST && ['/config.js','/favicon.svg'].includes(path)) filename = resolve(root,'public',path.slice(1));
    try { if (!(await stat(filename)).isFile()) throw new Error('Not a file'); } catch { if (!extname(path)) filename = resolve(root,'index.html'); else { res.writeHead(404);res.end();return; } }
    res.writeHead(200, { 'Content-Type':mime[extname(filename)] || 'application/octet-stream', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff' }); res.end(await readFile(filename));
  } catch { res.writeHead(500); res.end('Server error'); }
}).listen(port,'127.0.0.1',()=>console.log(`Smart Inventory listening on http://127.0.0.1:${port}`));
