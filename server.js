// Máy chủ tĩnh cho Load Planner — http://localhost:3200
// /fonts/arial*.ttf: phông Arial của Windows để nhúng vào file PDF xuất ra.
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const PORT = process.env.PORT || 3200;
const ROOT = __dirname;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.ttf': 'font/ttf', '.ico': 'image/x-icon' };
const PRIVATE = new Set(['.env', 'package.json', 'package-lock.json', 'server.js']);

http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  // Phông Arial của Windows để nhúng vào PDF (chữ thật, tiếng Việt, sửa được bằng PDF Editor)
  const fm = p.match(/^\/fonts\/(arial|arialbd|ariali|arialbi)\.ttf$/i);
  if (fm) {
    return fs.readFile(path.join(process.env.WINDIR || 'C:\\Windows', 'Fonts', fm[1].toLowerCase() + '.ttf'), (err, data) => {
      if (err) { res.writeHead(404); return res.end(); }
      res.writeHead(200, { 'Content-Type': 'font/ttf', 'Cache-Control': 'max-age=86400' }); res.end(data);
    });
  }
  const file = path.join(ROOT, p);
  if (!file.startsWith(ROOT) || PRIVATE.has(path.basename(file)) || /\.(cmd|bat|vbs|log)$/i.test(file)
    || file.includes(`${path.sep}node_modules${path.sep}`) || file.includes(`${path.sep}logs${path.sep}`)) { res.writeHead(403); return res.end(); }
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) { res.writeHead(404); return res.end('Not found'); }
    // vendor/ = thư viện cố định phiên bản → cho trình duyệt giữ 30 ngày; file khác: hỏi lại bằng ETag (không tải lại nếu chưa đổi)
    const etag = `"${st.size.toString(36)}-${Math.floor(st.mtimeMs).toString(36)}"`;
    const type = TYPES[path.extname(file).toLowerCase()] || 'application/octet-stream';
    const head = { 'Content-Type': type, ETag: etag, 'Cache-Control': p.startsWith('/vendor/') ? 'public, max-age=2592000' : 'no-cache' };
    if (req.headers['if-none-match'] === etag) { res.writeHead(304, head); return res.end(); }
    fs.readFile(file, (err2, data) => {
      if (err2) { res.writeHead(404); return res.end('Not found'); }
      // nén gzip file chữ (html/js/css/json) → máy trong mạng LAN mở nhanh hơn
      if (/text|javascript|json|svg/.test(type) && /gzip/.test(req.headers['accept-encoding'] || '') && data.length > 1024) {
        return zlib.gzip(data, (e3, gz) => {
          if (e3) { res.writeHead(200, head); return res.end(data); }
          res.writeHead(200, { ...head, 'Content-Encoding': 'gzip', Vary: 'Accept-Encoding' }); res.end(gz);
        });
      }
      res.writeHead(200, head); res.end(data);
    });
  });
}).listen(PORT, () => console.log(`Load Planner: http://localhost:${PORT}`));
