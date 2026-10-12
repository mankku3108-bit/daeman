import http from 'node:http';
import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
const root = path.dirname(fileURLToPath(import.meta.url));
const routes = new Map([
  ['/', 'app/index.html'], ['/app/app.mjs', 'app/app.mjs'],
  ['/app/core.mjs', 'app/core.mjs'], ['/app/storage.mjs', 'app/storage.mjs'],
  ['/app/style.css', 'app/style.css'], ['/favicon.svg', 'app/favicon.svg'],
  ['/data/initial.json', 'data/매장운영데이터.json']
]);
const types = {'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.svg':'image/svg+xml'};
const server = http.createServer(async (req, res) => {
  if (!['127.0.0.1:4173', 'localhost:4173'].includes(req.headers.host)) {
    res.writeHead(403); return res.end('Forbidden');
  }
  if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405); return res.end('Method not allowed');}
  let url;
  try {url = new URL(req.url, 'http://127.0.0.1:4173');} catch {res.writeHead(400);return res.end('Bad URL');}
  const file = routes.get(url.pathname);
  if (!file) {res.writeHead(404); return res.end('Not found');}
  try {
    const bytes = await readFile(path.join(root,file));
    res.writeHead(200, {'Content-Type':types[path.extname(file)],'Cache-Control':'no-store',
      'X-Content-Type-Options':'nosniff','Referrer-Policy':'no-referrer',
      'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'"});
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch {res.writeHead(500);res.end('File unavailable');}
});
server.on('error', error => {console.error(error.code === 'EADDRINUSE' ? '4173 포트가 사용 중입니다. 주소를 바꾸지 말고 기존 실행 상태를 확인하세요.' : error.message);process.exitCode=1;});
server.listen(4173, '127.0.0.1',()=>console.log('프렙 카페: http://127.0.0.1:4173'));
