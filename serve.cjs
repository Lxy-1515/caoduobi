const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const root = __dirname, lan = process.argv.includes('--lan');
const portArg = process.argv.indexOf('--port');
const port = portArg >= 0 ? Number(process.argv[portArg + 1]) : 4328;
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.png': 'image/png', '.ico': 'image/x-icon', '.svg': 'image/svg+xml' };
const server = http.createServer((req, res) => {
  if (req.method !== 'GET' && req.method !== 'HEAD') { res.writeHead(405); return res.end(); }
  let name;
  try { name = decodeURIComponent(new URL(req.url, 'http://localhost').pathname); } catch { res.writeHead(400); return res.end('Bad request'); }
  const file = path.resolve(root, '.' + (name === '/' ? '/index.html' : name));
  const relative = path.relative(root, file);
  if (relative.startsWith('..') || path.isAbsolute(relative) || !['.html', '.js', '.css', '.png', '.ico', '.svg'].includes(path.extname(file))) { res.writeHead(403); return res.end('Forbidden'); }
  fs.stat(file, (error, stat) => {
    if (error || !stat.isFile()) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    if (req.method === 'HEAD') return res.end();
    const stream = fs.createReadStream(file); stream.on('error', () => res.destroy()); stream.pipe(res);
  });
});
server.on('error', error => { console.error(error.code === 'EADDRINUSE' ? `端口 ${port} 已被占用。可用 node serve.cjs --port 4329 换一个端口。` : error.message); process.exitCode = 1; });
server.listen(port, lan ? '0.0.0.0' : '127.0.0.1', () => {
  console.log(`像素躲避已启动：http://127.0.0.1:${port}/`);
  if (lan) for (const infos of Object.values(os.networkInterfaces())) for (const info of infos || []) if (info.family === 'IPv4' && !info.internal) console.log(`同一 Wi-Fi 下的手机可尝试打开：http://${info.address}:${port}/`);
  console.log('保持此窗口开启。按 Ctrl+C 停止服务。');
});
