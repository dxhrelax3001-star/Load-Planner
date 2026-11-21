// Xuất PDF kế hoạch xếp hàng: tổng hợp, hình 3D, trình tự, hình cắt lớp theo chiều cao / chiều dài.
// Trang được dựng bằng HTML rồi chuyển sang PDF dạng VECTOR: chữ là chữ thật (phông Arial nhúng, tiếng Việt),
// khung / đường kẻ / nền là hình vẽ, chỉ ảnh 3D & hình cắt lớp là ảnh → mở bằng PDF Editor sửa được chữ, bảng.

const JSPDF = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
const PAGE_W = 1123, PAGE_H = 794; // A4 ngang @96dpi

/* ================= HTML → PDF vector ================= */
const FONT_FILES = { normal: 'arial', bold: 'arialbd', italic: 'ariali', bolditalic: 'arialbi' };
const ARIMO = { normal: 'arimo-400', bold: 'arimo-700', italic: 'arimo-400i', bolditalic: 'arimo-700i' };
let fontData = null; // cache base64 các phông giữa các lần xuất
async function loadFonts() {
  if (fontData) return fontData;
  const b64 = buf => { const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode.apply(null, u.subarray(i, i + 0x8000)); return btoa(s); };
  const out = {};
  await Promise.all(Object.entries(FONT_FILES).map(async ([st, f]) => {
    // Arial của Windows (qua server.js ở máy); trang web tĩnh (GitHub Pages) không có → dùng Arimo đi kèm (cùng kích thước chữ với Arial)
    let r = await fetch(`fonts/${f}.ttf`).catch(() => null);
    if (!r || !r.ok) r = await fetch(`fonts/${ARIMO[st]}.ttf`);
    if (!r.ok) throw new Error('Không tải được phông chữ ' + f + '.ttf');
    out[st] = b64(await r.arrayBuffer());
  }));
  return (fontData = out);
}
function addFonts(pdf, fonts) {
  for (const [st, f] of Object.entries(FONT_FILES)) { pdf.addFileToVFS(f + '.ttf', fonts[st]); pdf.addFont(f + '.ttf', 'Arial', st); }
}
const parseColor = s => {
  const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null;
  const [r, g, b, a = 1] = m[1].split(/[ ,/]+/).filter(Boolean).map(Number);
  if (a === 0) return null;
  // trộn với nền trắng nếu trong suốt một phần
  return [r, g, b].map(v => Math.round(v * a + 255 * (1 - a)));
};
const imgFormat = src => /^data:image\/png/i.test(src) ? 'PNG' : 'JPEG';

/** Vẽ phần tử el (1 trang HTML đã gắn vào DOM) lên trang hiện tại của pdf, kích thước wMm × hMm */
function domToPdf(pdf, el, wMm, hMm) {
  const base = el.getBoundingClientRect(), k = wMm / base.width;
  const X = v => (v - base.left) * k, Y = v => (v - base.top) * k;
  const PT = 72 / 25.4;

  const drawBox = (node, cs) => {
    const r = node.getBoundingClientRect();
    if (r.width < 0.5 || r.height < 0.5) return;
    const x = X(r.left), y = Y(r.top), w = r.width * k, h = r.height * k;
    // nền trắng không vẽ (trang PDF vốn trắng) — tránh 1 hình chữ nhật trắng phủ cả trang
    // khiến PDF Editor coi là lớp phủ / đối tượng to che hết nội dung
    let bg = parseColor(cs.backgroundColor);
    if (bg && bg.every(v => v >= 254)) bg = null;
    if (node === el) bg = null;
    const bw = ['Top', 'Right', 'Bottom', 'Left'].map(s => cs[`border${s}Style`] === 'none' || cs[`border${s}Style`] === 'hidden' ? 0 : parseFloat(cs[`border${s}Width`]) || 0);
    const bc = ['Top', 'Right', 'Bottom', 'Left'].map(s => parseColor(cs[`border${s}Color`]));
    const rad = parseFloat(cs.borderTopLeftRadius) || 0;
    const sameB = bw.every(v => v === bw[0]) && bc.every(c => (c || []).join() === (bc[0] || []).join());
    if (rad > 0.5 && (sameB || !bw.some(v => v))) {
      const rr = Math.min(rad * k, w / 2, h / 2);
      if (bg) pdf.setFillColor(...bg);
      const hasB = bw[0] > 0 && bc[0];
      if (hasB) { pdf.setDrawColor(...bc[0]); pdf.setLineWidth(bw[0] * k); }
      const mode = bg && hasB ? 'FD' : bg ? 'F' : hasB ? 'S' : null;
      if (mode) pdf.roundedRect(x + (hasB ? bw[0] * k / 2 : 0), y + (hasB ? bw[0] * k / 2 : 0), w - (hasB ? bw[0] * k : 0), h - (hasB ? bw[0] * k : 0), rr, rr, mode);
      return;
    }
    if (bg) { pdf.setFillColor(...bg); pdf.rect(x, y, w, h, 'F'); }
    const sides = [[x, y, w, bw[0] * k], [x + w - bw[1] * k, y, bw[1] * k, h], [x, y + h - bw[2] * k, w, bw[2] * k], [x, y, bw[3] * k, h]];
    sides.forEach((s, i) => { if (bw[i] > 0 && bc[i]) { pdf.setFillColor(...bc[i]); pdf.rect(...s, 'F'); } });
  };

  const drawImage = (node) => {
    const r = node.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return;
    let src, nw, nh;
    if (node.tagName === 'CANVAS') { src = node.toDataURL('image/png'); nw = node.width; nh = node.height; }
    else { src = node.currentSrc || node.src; nw = node.naturalWidth; nh = node.naturalHeight; if (!src || !nw) return; }
    let x = r.left, y = r.top, w = r.width, h = r.height;
    const ics = getComputedStyle(node);
    if (ics.objectFit === 'contain' && nw && nh) {
      const s = Math.min(w / nw, h / nh); const dw = nw * s, dh = nh * s;
      // object-position (computed dạng "0% 50%"): căn trái / giữa / phải
      const pos = ics.objectPosition.split(' ').map(v => v.endsWith('%') ? parseFloat(v) / 100 : null);
      const px = pos[0] ?? 0.5, py = pos[1] ?? 0.5;
      x += (w - dw) * px; y += (h - dh) * py; w = dw; h = dh;
    }
    try { pdf.addImage(src, node.tagName === 'CANVAS' ? 'PNG' : imgFormat(src), X(x), Y(y), w * k, h * k, undefined, 'FAST'); } catch (e) { console.warn('addImage', e); }
  };

  const drawText = (tn) => {
    const s = tn.data; if (!s.trim()) return;
    const cs = getComputedStyle(tn.parentElement);
    if (cs.visibility === 'hidden') return;
    const col = parseColor(cs.color) || [0, 0, 0];
    const fs = parseFloat(cs.fontSize);
    const bold = (parseInt(cs.fontWeight) || 400) >= 600, ital = cs.fontStyle === 'italic' || cs.fontStyle === 'oblique';
    const range = document.createRange();
    // gom từng ký tự theo dòng hiển thị
    const lines = []; let cur = null;
    for (let i = 0; i < s.length; i++) {
      range.setStart(tn, i); range.setEnd(tn, i + 1);
      const rc = range.getClientRects()[0];
      if (!rc || (rc.width === 0 && /\s/.test(s[i]))) { if (cur && /\s/.test(s[i])) cur.t += ' '; continue; }
      if (!cur || Math.abs(rc.top - cur.top) > fs * 0.5) { cur = { top: rc.top, h: rc.height, left: rc.left, t: '' }; lines.push(cur); }
      cur.t += s[i];
    }
    range.detach?.();
    pdf.setFont('Arial', bold && ital ? 'bolditalic' : bold ? 'bold' : ital ? 'italic' : 'normal');
    pdf.setFontSize(fs * k * PT);
    pdf.setTextColor(...col);
    for (const ln of lines) {
      const t = ln.t.replace(/[\s ]+/g, ' ').replace(/\s+$/, '');
      if (!t) continue;
      const baseY = ln.top + (ln.h - 1.117 * fs) / 2 + 0.905 * fs;
      pdf.text(t, X(ln.left), Y(baseY));
    }
  };

  const walk = node => {
    const cs = getComputedStyle(node);
    if (cs.display === 'none' || cs.visibility === 'hidden') return;
    if (node.tagName === 'IMG' || node.tagName === 'CANVAS') return drawImage(node);
    if (node.tagName === 'STYLE' || node.tagName === 'SCRIPT') return;
    drawBox(node, cs);
    for (const ch of node.childNodes) {
      if (ch.nodeType === 3) drawText(ch);
      else if (ch.nodeType === 1) walk(ch);
    }
  };
  walk(el);
}

/** Biểu tượng logo Load Planner (vẽ bằng canvas, dùng làm ảnh nhỏ trong báo cáo) */
function logoDataUrl() {
  const c = document.createElement('canvas'); c.width = c.height = 88;
  const g = c.getContext('2d');
  g.beginPath(); g.roundRect ? g.roundRect(0, 0, 88, 88, 18) : g.rect(0, 0, 88, 88); g.clip();
  g.fillStyle = '#1f6feb'; g.beginPath(); g.moveTo(0, 0); g.lineTo(88, 0); g.lineTo(0, 88); g.fill();
  g.fillStyle = '#1a9b55'; g.beginPath(); g.moveTo(88, 0); g.lineTo(88, 88); g.lineTo(0, 88); g.fill();
  g.strokeStyle = '#fff'; g.lineWidth = 8; g.strokeRect(22, 22, 44, 44);
  return c.toDataURL('image/png');
}

function loadScript(src) {
  return new Promise((res, rej) => {
    if (document.querySelector(`script[src="${src}"]`)) return res();
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error('Không tải được thư viện PDF (cần Internet): ' + src));
    document.head.appendChild(s);
  });
}

/* ================= Hình cắt lớp ================= */

/** Mặt cắt nằm ngang tại độ cao zc — nhìn từ trên xuống. Trục X: vách trong (trái) → cửa (phải) */
export function drawLevel(boxes, C, zc, colorOf, maxW = 1060) {
  const pad = 30, s = (maxW - 2 * pad) / C.l;
  const W = maxW, H = Math.round(C.w * s + 2 * pad + 6);
  const { cv, g } = mkCanvas(W, H);
  const X = x => pad + x * s, Y = y => pad + y * s;
  g.fillStyle = '#f4ecdc'; g.fillRect(X(0), Y(0), C.l * s, C.w * s);
  grid(g, X, Y, C.l, C.w, s, 'x');
  let cut = 0;
  for (const b of boxes) if (b.z + b.h <= zc) rect(g, X(b.x), Y(b.y), b.l * s, b.w * s, '#dde1e7', '#b3bac5');
  for (const b of boxes) if (b.z <= zc && b.z + b.h > zc) { cut++; rect(g, X(b.x), Y(b.y), b.l * s, b.w * s, colorOf(b.t), '#1d2733', b.step); }
  g.strokeStyle = '#14243a'; g.lineWidth = 2; g.strokeRect(X(0), Y(0), C.l * s, C.w * s);
  label(g, 'VÁCH TRONG', 4, H / 2, -Math.PI / 2);
  label(g, 'CỬA', W - 6, H / 2, -Math.PI / 2, '#d64545');
  return { url: cv.toDataURL('image/png'), w: W, h: H, cut };
}

/** Mặt cắt đứng tại vị trí xc theo chiều dài — nhìn từ cửa vào trong */
export function drawSection(boxes, C, xc, colorOf, maxW = 250) {
  const pad = 22, s = (maxW - 2 * pad) / C.w;
  const W = maxW, H = Math.round(C.h * s + 2 * pad);
  const { cv, g } = mkCanvas(W, H);
  // nhìn từ cửa: phía y = 0 nằm bên phải
  const X = y => pad + (C.w - y) * s, Y = z => pad + (C.h - z) * s;
  g.fillStyle = '#f7f9fc'; g.fillRect(pad, pad, C.w * s, C.h * s);
  let cut = 0;
  for (const b of boxes) if (b.x + b.l <= xc) rect(g, X(b.y + b.w), Y(b.z + b.h), b.w * s, b.h * s, '#dde1e7', '#b3bac5');
  for (const b of boxes) if (b.x <= xc && b.x + b.l > xc) { cut++; rect(g, X(b.y + b.w), Y(b.z + b.h), b.w * s, b.h * s, colorOf(b.t), '#1d2733', b.step); }
  g.fillStyle = '#b9a58a'; g.fillRect(pad, Y(0), C.w * s, 3);
  g.strokeStyle = '#14243a'; g.lineWidth = 2; g.strokeRect(pad, pad, C.w * s, C.h * s);
  return { url: cv.toDataURL('image/png'), w: W, h: H, cut };
}

function mkCanvas(W, H) {
  const cv = document.createElement('canvas'); cv.width = W * 2; cv.height = H * 2;
  const g = cv.getContext('2d'); g.scale(2, 2); g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
  g.font = '10px Segoe UI, Arial'; g.textAlign = 'center'; g.textBaseline = 'middle';
  return { cv, g };
}
function rect(g, x, y, w, h, fill, stroke, num) {
  g.fillStyle = fill; g.fillRect(x, y, w, h);
  g.strokeStyle = stroke; g.lineWidth = 0.8; g.strokeRect(x + 0.4, y + 0.4, w - 0.8, h - 0.8);
  if (num && w > 16 && h > 11) {
    g.fillStyle = contrast(fill); g.font = `${Math.min(11, Math.max(7, Math.min(w / 3, h / 1.6)))}px Segoe UI, Arial`;
    g.fillText(String(num), x + w / 2, y + h / 2);
  }
}
function grid(g, X, Y, L, Wd, s, axis) {
  g.strokeStyle = 'rgba(0,0,0,.08)'; g.lineWidth = 1; g.fillStyle = '#6b7686'; g.font = '9px Segoe UI, Arial';
  for (let x = 1000; x < L; x += 1000) {
    g.beginPath(); g.moveTo(X(x), Y(0)); g.lineTo(X(x), Y(Wd)); g.stroke();
    g.fillText(`${x / 1000} m`, X(x), Y(0) - 9);
  }
}
function label(g, text, x, y, rot, color = '#14243a') {
  g.save(); g.translate(x + 6, y); g.rotate(rot); g.fillStyle = color; g.font = 'bold 10px Segoe UI, Arial'; g.fillText(text, 0, 0); g.restore();
}
function contrast(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || ''); if (!m) return '#000';
  const n = parseInt(m[1], 16), r = n >> 16, gg = (n >> 8) & 255, b = n & 255;
  return (r * 299 + gg * 587 + b * 114) / 1000 > 140 ? '#111' : '#fff';
}

/** n mặt cắt chia đều trên đoạn [0, span] — cắt ở giữa mỗi dải */
const uniform = (span, n) => Array.from({ length: n }, (_, i) => { const v = Math.round(span * (i + 0.5) / n); return { at: v, show: v }; });
/** Các độ cao cắt. mode: 'each' = đáy từng tầng kiện · số = chia đều n lớp · 'auto' = từng tầng nếu ≤ 10, không thì 8 lớp đều */
function levelPlanes(boxes, C, mode = 'auto') {
  const zs = [...new Set(boxes.map(b => Math.round(b.z)))].sort((a, b) => a - b).map(z => ({ at: z + 1, show: z }));
  const top = Math.max(...boxes.map(b => b.z + b.h));
  if (mode === 'each') return zs;
  if (mode !== 'auto') return uniform(top, +mode);
  return zs.length <= 10 ? zs : uniform(top, 8);
}
/** Các vị trí cắt theo chiều dài. mode: 'each' = đầu từng vách kiện trên sàn · số = chia đều · 'auto' = từng vách nếu ≤ 16, không thì 12 lớp đều */
function lengthPlanes(boxes, mode = 'auto') {
  const xs = [...new Set(boxes.filter(b => b.z < 1).map(b => Math.round(b.x)))].sort((a, b) => a - b).map(x => ({ at: x + 1, show: x }));
  const used = Math.max(...boxes.map(b => b.x + b.l));
  if (mode === 'each' && xs.length) return xs;
  if (mode !== 'auto' && mode !== 'each') return uniform(used, +mode);
  return xs.length && xs.length <= 16 ? xs : uniform(used, 12);
}

/** Bỏ các mặt cắt rỗng hoặc trùng y hệt tập kiện với mặt cắt liền trước */
function dedupe(planes, cutOf) {
  let prev = '';
  return planes.filter(p => {
    const set = cutOf(p.at); if (!set.length) return false;
    const key = set.map(b => b.step).sort((a, b) => a - b).join(',');
    if (key === prev) return false;
    prev = key; return true;
  });
}

/* ================= Dựng trang ================= */
const CSS = `
.pg{width:${PAGE_W}px;height:${PAGE_H}px;background:#fff;color:#1d2733;font:12px/1.35 Arial,sans-serif;padding:26px 32px 22px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}
.pg .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:2px solid #14243a;padding-bottom:5px;margin-bottom:10px}
.pg .hd b{font-size:15px}.pg .hd span{color:#6b7686;font-size:11px}
.pg .ft{margin-top:auto;display:flex;justify-content:space-between;color:#8a94a3;font-size:10px;padding-top:6px;border-top:1px solid #dde2ea}
.pg h2{font-size:16px;margin:0 0 6px}.pg h3{font-size:13px;margin:8px 0 4px}
.pg table{width:100%;border-collapse:collapse;font-size:11px}
.pg th,.pg td{border:1px solid #c5ccd6;padding:3px 6px;text-align:left}
.pg th{background:#eef1f5;font-weight:600}.pg td.r{text-align:right}
.pg .sw{display:inline-block;width:10px;height:10px;border:1px solid #777;vertical-align:-1px;margin-right:5px}
.pg .kpi{display:flex;gap:10px;margin:4px 0 8px}.pg .kpi div{flex:1;border:1px solid #dde2ea;border-radius:6px;padding:5px 8px}
.pg .kpi small{display:block;color:#6b7686;font-size:10px}.pg .kpi b{font-size:15px}
.pg .imgs{display:grid;grid-template-columns:1fr;grid-template-rows:minmax(0,1.7fr) minmax(0,1fr) minmax(0,1fr);gap:6px;flex:1;min-height:0}
.pg .imgs div{position:relative;min-height:0;border:1px solid #dde2ea;border-radius:6px;background:#f7f9fc;overflow:hidden}
.pg .imgs img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain}
.pg .imgs span{position:absolute;left:8px;top:5px;font-size:10.5px;font-weight:600;color:#14243a;background:rgba(255,255,255,.85);padding:1px 6px;border-radius:4px}
.pg .lv{margin-bottom:6px}.pg .lv .t{font-weight:600;font-size:11px;margin-bottom:2px}.pg .lv img{display:block}
.pg .secs{display:grid;grid-template-columns:repeat(4,1fr);gap:8px 10px}
.pg .secs .t{font-weight:600;font-size:11px;text-align:center}.pg .secs img{display:block;margin:0 auto}
.pg .lg{display:flex;flex-wrap:wrap;gap:4px 14px;font-size:10.5px;margin-bottom:6px}
.pg .note{color:#6b7686;font-size:10.5px;margin-bottom:6px}
.pg .warn{color:#d64545;font-weight:600}
`;

/* ================= Mẫu chuẩn (A4 dọc) — theo bố cục file báo cáo mẫu ================= */
const SP_W = 794, SP_H = 1123; // A4 dọc @96dpi
const STD_CSS = `
.sp{width:${SP_W}px;height:${SP_H}px;background:#fff;color:#111;font:11px/1.3 Arial,sans-serif;padding:30px 46px 26px;box-sizing:border-box;display:flex;flex-direction:column;overflow:hidden}
.sp .cr{font-style:italic;font-size:10px;margin-bottom:10px}
.sp .top{display:flex;gap:14px;align-items:stretch;margin-bottom:8px}
.sp .rbox{flex:1.35;border:1.5px solid #111;padding:6px 8px;font-weight:700;font-size:12px;line-height:1.5}
.sp .rbox .dt{border-top:1.5px solid #111;margin:4px -8px -6px;padding:3px 8px;display:flex;gap:40px}
.sp .logo{flex:1;display:flex;align-items:center;justify-content:center;gap:9px;border-top:1px solid #777;border-bottom:1px solid #777;margin:8px 0;font-size:22px;color:#1d2733}
.sp .logo img{width:22px;height:22px;display:block}
.sp .logo b{font-weight:700}
.sp .cn{display:inline-block;font-style:italic;color:#555;font-size:13px;background:#f2f2f2;padding:3px 10px;margin-bottom:2px}
.sp table{width:100%;border-collapse:collapse}
.sp .kv th{font-weight:700;text-align:left;padding:4px 2px;border-top:1px solid #111;border-bottom:1px solid #111;font-size:10.5px}
.sp .kv td{font-weight:700;padding:4px 2px;border-bottom:1px solid #111;font-size:10.5px}
.sp .dim{margin-top:8px;border:1px solid #111}
.sp .dim th,.sp .dim td{border:1px solid #111;padding:4px 6px;font-weight:700;text-align:center;font-size:10.5px}
.sp .dim td:first-child,.sp .dim th:first-child{text-align:left}
.sp h4{font-size:12px;margin:26px 0 8px}
.sp .pl th{font-weight:700;border-top:1px solid #111;border-bottom:1px solid #111;padding:4px 6px;font-size:10.5px;text-align:center}
.sp .pl td{border:1px solid #111;padding:4px 6px;text-align:right;font-size:11px}
.sp .pl td.c{text-align:left}.sp .pl td.n{text-align:center;width:22px}
.sp .pl .u td{border:none;border-bottom:1px solid #111;text-align:center;font-weight:700;font-size:10px}
.sp .sw{display:inline-block;width:9px;height:15px;vertical-align:middle;margin:-2px 10px 0 -2px;border:1px solid #555}
.sp .blks{border:1px solid #111;margin-top:22px}
.sp .blk{position:relative;height:228px;border-top:1px solid #111;padding:6px 8px;box-sizing:border-box}
.sp .blk:first-child{border-top:none}
.sp .bt{font-size:19px;font-weight:700;margin-top:6px}.sp .bt small{font-size:12px;font-weight:700;margin-right:4px}
.sp .bn{font-size:15px;font-weight:700;margin:4px 0 2px}
.sp .bi{font-size:11.5px;line-height:1.55}
.sp .br{position:absolute;right:8px;top:6px;text-align:right;font-size:10px}
.sp .bv{position:absolute;top:44px;width:270px;height:170px}
.sp .bv.r{left:112px}.sp .bv.l{right:8px}
.sp .bv span{position:absolute;top:-2px;font-style:italic;font-size:9px;color:#333}
.sp .bv.r span{left:0}.sp .bv.l span{right:0}
.sp .bv img{position:absolute;inset:10px 0 0 0;width:100%;height:calc(100% - 10px);object-fit:contain}
.sp .bv.r img{object-position:left center}.sp .bv.l img{object-position:right center}
.sp .ft{margin-top:auto;display:flex;justify-content:space-between;font-style:italic;font-size:10px;padding:0 6px}
`;
const fmt2 = (n, d = 2) => Number(n).toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d });

async function exportStdPdf(ctx, opts, progress) {
  const { result: R, project, esc, colorOf, contStats } = ctx;
  const C = R.container;
  const now = new Date();
  const created = 'Created on ' + now.toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  const dateStr = now.toLocaleDateString('vi-VN');
  const source = project.name || C.name;
  const pages = [];
  const totalQty = R.items.reduce((s, it) => s + (it.qty || 0), 0);

  for (const i of opts.containers) {
    const c = R.containers[i], s = contStats(c), C = ctx.specOf(c);
    const cntVol = C.l * C.w * C.h / 1e9, loadVol = s.vol;
    const ext = c.boxes.length ? { l: Math.max(...c.boxes.map(b => b.x + b.l)), w: Math.max(...c.boxes.map(b => b.y + b.w)), h: Math.max(...c.boxes.map(b => b.z + b.h)) } : { l: 0, w: 0, h: 0 };
    const types = [...new Set(c.boxes.map(b => b.t))];
    const head = `<div class="cr">${created}</div>
      <div class="top"><div class="rbox">Project: <span style="font-weight:400">${esc(project.name || '')}</span><br>Report: <span style="font-weight:400">${esc(opts.report || '')}</span><br>Ref: <span style="font-weight:400">${esc(opts.ref || '')}</span>
        <div class="dt"><span>Date:</span><span>${dateStr}</span></div></div>
        <div class="logo"><img src="${logoDataUrl()}"><span>Load<b>Planner</b></span></div></div>
      <div class="cn">container: ${esc(C.name)} #${i + 1}</div>`;
    const summary = `${head}
      <table class="kv"><tr><th>cnt volume</th><th>load volume</th><th>lost volume</th><th>vol eff.</th><th>load/total %</th><th>load qty</th><th>wgh eff.</th><th>load weight</th></tr>
      <tr><td>${fmt2(cntVol)} m³</td><td>${fmt2(loadVol)} m³</td><td>${fmt2(cntVol - loadVol)} m³</td><td>${fmt2(loadVol / cntVol * 100)}%</td>
      <td>${fmt2(totalQty ? s.n / totalQty * 100 : 0)}%</td><td>${s.n} / ${totalQty}</td><td>${C.kg ? fmt2(s.kg / C.kg * 100) + '%' : 'N/A'}</td><td>${fmt2(s.kg)} kg</td></tr></table>
      <table class="dim"><tr><th></th><th>length</th><th>width</th><th>height</th></tr>
      <tr><td>Container dimensions</td><td>${C.l} mm</td><td>${C.w} mm</td><td>${C.h} mm</td></tr>
      <tr><td>Used extensions for load</td><td>${Math.round(ext.l)} mm</td><td>${Math.round(ext.w)} mm</td><td>${Math.round(ext.h)} mm</td></tr></table>
      <h4>Packing list</h4>
      <table class="pl"><tr><th>#</th><th>code</th><th>length</th><th>width</th><th>height</th><th>qty/tot</th></tr>
      ${types.map((t, k) => { const it = R.items[t]; return `<tr><td class="n">${k + 1}</td><td class="c"><span class="sw" style="background:${colorOf(t)}"></span>${esc(it.name)}</td><td>${it.l}</td><td>${it.w}</td><td>${it.h}</td><td>${c.boxes.filter(b => b.t === t).length}/${it.qty}</td></tr>`; }).join('')}
      <tr class="u"><td></td><td></td><td>(mm)</td><td>(mm)</td><td>(mm)</td><td></td></tr></table>`;

    // Bước xếp = nhóm theo loại kiện + hướng đặt, theo thứ tự xuất hiện trong trình tự xếp
    const groups = [], idx = new Map();
    for (const b of c.boxes) {
      const k = `${b.t}|${b.l}|${b.w}|${b.h}`;
      if (!idx.has(k)) { idx.set(k, groups.length); groups.push({ t: b.t, l: b.l, w: b.w, h: b.h, boxes: [] }); }
      groups[idx.get(k)].boxes.push(b);
    }
    const blocks = [];
    const before = new Set();
    for (let g = 0; g < groups.length; g++) {
      progress(`Đang vẽ bước xếp ${g + 1}/${groups.length} — container #${i + 1}…`);
      const G = groups[g], it = R.items[G.t];
      const v = ctx.stepViews(i, new Set(G.boxes), before);
      const lying = G.h !== it.h ? 'lật nghiêng' : 'đáy chuẩn';
      const zs = [...new Set(G.boxes.map(b => Math.round(b.z)))].sort((a, b) => a - b);
      blocks.push(`<div class="blk">
        <div class="bt"><small>[${g + 1}]</small>${esc(it.name)}</div>
        <div class="bn">${G.boxes.length}</div>
        <div class="bi">vol. ${fmt2(G.boxes.length * G.l * G.w * G.h / 1e9)} m³<br>wg ${fmt2(G.boxes.length * it.weight)} kg<br>L ${G.l}<br>W ${G.w}<br>H ${G.h}<br>&nbsp;&nbsp;&nbsp;(mm)</div>
        <div class="br">[wg ${fmt2(it.weight)} kg]<br>${lying} · tầng Z ${zs.length > 3 ? zs[0] + '…' + zs[zs.length - 1] : zs.join(', ')} mm</div>
        <div class="bv r"><span>view from front-right</span><img src="${v.right}"></div>
        <div class="bv l"><span>view from front-left</span><img src="${v.left}"></div></div>`);
      G.boxes.forEach(b => before.add(b));
      await new Promise(r => setTimeout(r, 0));
    }
    // Phân trang: trang đầu có phần tổng hợp, các trang sau chỉ có khối bước xếp
    const firstCap = Math.max(1, Math.floor((SP_H - 60 - 30 - (430 + types.length * 24)) / 228));
    const nextCap = Math.floor((SP_H - 60 - 30 - 60) / 228);
    let k = 0;
    pages.push(summary + (blocks.length ? `<div class="blks">${blocks.slice(0, firstCap).join('')}</div>` : ''));
    k = firstCap;
    while (k < blocks.length) {
      pages.push(`<div class="cr">${created}</div><div class="cn">container: ${esc(C.name)} #${i + 1} (tiếp)</div><div class="blks">${blocks.slice(k, k + nextCap).join('')}</div>`);
      k += nextCap;
    }
  }

  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4', compress: true });
  addFonts(pdf, await loadFonts());
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1';
  host.innerHTML = `<style>${STD_CSS}</style>`;
  document.body.appendChild(host);
  try {
    for (let p = 0; p < pages.length; p++) {
      progress(`Đang tạo trang ${p + 1}/${pages.length}…`);
      const el = document.createElement('div');
      el.className = 'sp';
      el.innerHTML = `${pages[p]}<div class="ft"><span>PAGE ${p + 1} - Load Planner</span><span>Source: ${esc(source)}</span></div>`;
      host.appendChild(el);
      await Promise.all([...el.querySelectorAll('img')].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
      if (p) pdf.addPage('a4', 'portrait');
      domToPdf(pdf, el, 210, 297);
      el.remove();
      await new Promise(r => setTimeout(r, 0));
    }
  } finally { host.remove(); }
  const name = (opts.report || project.name || 'Bao-cao-xep-hang').replace(/[\\/:*?"<>|]/g, '_');
  pdf.save(`${name}_${now.toISOString().slice(0, 10)}.pdf`);
  return pages.length;
}

/** Xuất PDF. ctx do app.js cung cấp */
export async function exportPdf(ctx, opts, progress) {
  progress('Đang tải thư viện PDF…');
  await loadScript(JSPDF);
  if (opts.template === 'std') return exportStdPdf(ctx, opts, progress);
  const { result: R, project, contStats, colorOf, esc, fmt } = ctx;
  const C = R.container;
  const date = new Date().toLocaleDateString('vi-VN');
  const title = `KẾ HOẠCH XẾP HÀNG${project.name ? ' — ' + esc(project.name) : ''}`;
  const pages = []; // mỗi phần tử: html nội dung trang
  const list = opts.containers;

  // ----- Trang tổng hợp -----
  const types = R.items.map((it, t) => ({ it, t })).filter(o => o.it.qty);
  const many = R.containers.length > 10;
  let html = `<h2>Tổng hợp</h2>
    <div class="kpi">
      <div><small>Phương tiện</small><b>${esc(ctx.mixText())}</b></div>
      <div><small>Số container</small><b>${R.containers.length}</b></div>
      <div><small>Số kiện đã xếp</small><b>${fmt(R.containers.reduce((s, c) => s + c.boxes.length, 0))}</b> / ${fmt(R.totalUnits)}</div>
      <div><small>Tổng thể tích / trọng lượng</small><b>${fmt(R.containers.reduce((s, c) => s + contStats(c).vol, 0), 2)} m³</b> · ${fmt(R.containers.reduce((s, c) => s + contStats(c).kg, 0))} kg</div>
    </div>
    <h3>Theo container</h3>
    <table><tr><th>Container</th><th>Loại</th><th>Số kiện</th><th>Thể tích (m³)</th><th>% thể tích</th><th>Trọng lượng (kg)</th><th>% tải</th><th>Chiều dài dùng (mm)</th><th>Trọng tâm (dài / rộng)</th></tr>
    ${R.containers.map((c, i) => { const s = contStats(c), C = ctx.specOf(c); return `<tr><td>#${i + 1}</td><td>${esc(C.name)}</td><td class="r">${fmt(s.n)}</td><td class="r">${fmt(s.vol, 2)}</td><td class="r">${fmt(s.volPct, 1)}%</td><td class="r">${fmt(s.kg)}</td><td class="r">${fmt(s.kgPct, 1)}%</td><td class="r">${fmt(s.len)}</td><td class="r">${s.cog ? fmt(s.cog.x / C.l * 100) + '% / ' + fmt(s.cog.y / C.w * 100) + '%' : ''}</td></tr>`; }).join('')}</table>
    <h3>Theo loại kiện</h3>
    <table><tr><th>Loại kiện</th><th>Kích thước (mm)</th><th>Kg/kiện</th><th>Tổng SL</th>${many ? '<th>Đã xếp</th>' : R.containers.map((_, i) => `<th>#${i + 1}</th>`).join('')}<th>Chưa xếp</th></tr>
    ${types.map(({ it, t }) => `<tr><td><span class="sw" style="background:${colorOf(t)}"></span>${esc(it.name)}</td><td>${it.l}×${it.w}×${it.h}</td><td class="r">${it.weight}</td><td class="r">${it.qty}</td>${many
      ? `<td class="r">${R.containers.reduce((s, c) => s + c.boxes.filter(b => b.t === t).length, 0)}</td>`
      : R.containers.map(c => `<td class="r">${c.boxes.filter(b => b.t === t).length || ''}</td>`).join('')}<td class="r">${R.unplaced[t] || ''}</td></tr>`).join('')}</table>`;
  pages.push(html);

  const legendOf = c => { const ts = [...new Set(c.boxes.map(b => b.t))]; return `<div class="lg">${ts.map(t => `<span><span class="sw" style="background:${colorOf(t)}"></span>${esc(R.items[t].name)}</span>`).join('')}<span><span class="sw" style="background:#dde1e7"></span>đã xếp phía dưới / phía trong</span></div>`; };

  for (const i of list) {
    const c = R.containers[i], s = contStats(c), C = ctx.specOf(c);
    const head = `<h2>Container #${i + 1} — ${esc(C.name)} (${C.l}×${C.w}×${C.h} mm)</h2>`;
    // ----- Trang tổng quan 3D -----
    if (opts.overview) {
      progress(`Đang chụp hình 3D container #${i + 1}…`);
      const v = ctx.views(i);
      const bad = c.boxes.filter(b => b.bad).length;
      pages.push(`${head}
        <div class="kpi"><div><small>Số kiện</small><b>${fmt(s.n)}</b></div><div><small>Thể tích</small><b>${fmt(s.vol, 2)} m³</b> · ${fmt(s.volPct, 1)}%</div>
        <div><small>Trọng lượng</small><b>${fmt(s.kg)} kg</b>${C.kg ? ' · ' + fmt(s.kgPct, 1) + '%' : ''}</div><div><small>Chiều dài dùng</small><b>${fmt(s.len)} mm</b></div>
        <div><small>Trọng tâm (dài / rộng)</small><b>${s.cog ? fmt(s.cog.x / C.l * 100) + '% / ' + fmt(s.cog.y / C.w * 100) + '%' : '-'}</b></div></div>
        ${bad ? `<div class="warn">⚠ Có ${bad} kiện đặt tạm sai vị trí.</div>` : ''}
        ${legendOf(c).replace(/<span><span class="sw" style="background:#dde1e7"><\/span>[^<]*<\/span>/, '')}
        <div class="imgs"><div><img src="${v.iso}"><span>Phối cảnh 3D</span></div><div><img src="${v.top}"><span>Nhìn từ trên xuống (cửa bên phải)</span></div><div><img src="${v.side}"><span>Nhìn từ cạnh bên</span></div></div>`);
    }
    // ----- Trình tự xếp -----
    if (opts.steps && c.boxes.length) {
      const groups = [];
      for (const b of c.boxes) {
        const g = groups[groups.length - 1], dim = `${b.l}×${b.w}×${b.h}`;
        if (g && g.t === b.t && g.dim === dim && Math.abs(g.z - b.z) < 1) { g.to = b.step; g.n++; }
        else groups.push({ t: b.t, from: b.step, to: b.step, n: 1, dim, x: b.x, y: b.y, z: b.z });
      }
      const PER = 28;
      for (let k = 0; k < groups.length; k += PER) {
        pages.push(`${head}<h3>Trình tự xếp${groups.length > PER ? ` (${Math.floor(k / PER) + 1}/${Math.ceil(groups.length / PER)})` : ''}</h3>
          <div class="note">X tính từ vách trong ra cửa, Y từ vách trái, Z từ sàn (toạ độ của kiện đầu tiên trong dòng). Các bước liên tiếp cùng loại, cùng hướng, cùng tầng được gộp 1 dòng.</div>
          <table><tr><th>Bước</th><th>Kiện</th><th>SL</th><th>Hướng đặt D×R×C (mm)</th><th>X (mm)</th><th>Y (mm)</th><th>Z (mm)</th></tr>
          ${groups.slice(k, k + PER).map(g => `<tr><td>${g.from}${g.to > g.from ? '–' + g.to : ''}</td><td><span class="sw" style="background:${colorOf(g.t)}"></span>${esc(R.items[g.t].name)}</td><td class="r">${g.n}</td><td>${g.dim}</td><td class="r">${fmt(g.x)}</td><td class="r">${fmt(g.y)}</td><td class="r">${fmt(g.z)}</td></tr>`).join('')}</table>`);
      }
    }
    // ----- Cắt lớp theo chiều cao -----
    if (opts.levels && c.boxes.length) {
      progress(`Đang vẽ cắt lớp theo chiều cao — container #${i + 1}…`);
      const imgs = dedupe(levelPlanes(c.boxes, C, opts.levelMode), z => c.boxes.filter(b => b.z <= z && b.z + b.h > z))
        .map(p => ({ z: p.show, ...drawLevel(c.boxes, C, p.at, colorOf) }));
      const avail = PAGE_H - 48 - 40 - 70; // trừ đầu trang, chân trang, tiêu đề
      const chunks = [];
      let chunk = [], used = 0;
      imgs.forEach((o, k) => {
        const h = o.h + 20;
        if (used + h > avail && chunk.length) { chunks.push(chunk); chunk = []; used = 0; }
        chunk.push(`<div class="lv"><div class="t">Lớp ${k + 1}: mặt cắt tại Z = ${fmt(o.z)} mm — ${o.cut} kiện</div><img src="${o.url}" width="${o.w}" height="${o.h}"></div>`);
        used += h;
      });
      if (chunk.length) chunks.push(chunk);
      chunks.forEach((ch, k) => pages.push(`${head}<h3>Cắt lớp theo chiều cao — nhìn từ trên xuống${chunks.length > 1 ? ` (phần ${k + 1}/${chunks.length})` : ''}</h3>${legendOf(c)}${ch.join('')}`));
    }
    // ----- Cắt lớp theo chiều dài -----
    if (opts.sections && c.boxes.length) {
      progress(`Đang vẽ cắt lớp theo chiều dài — container #${i + 1}…`);
      const maxH = 255; // để 2 hàng vừa 1 trang
      const wFit = Math.min(250, Math.floor((maxH - 44) * C.w / C.h) + 44);
      const imgs = dedupe(lengthPlanes(c.boxes, opts.secMode), x => c.boxes.filter(b => b.x <= x && b.x + b.l > x))
        .map(p => ({ x: p.show, ...drawSection(c.boxes, C, p.at, colorOf, wFit) }));
      const PER = 8;
      for (let k = 0; k < imgs.length; k += PER) {
        pages.push(`${head}<h3>Cắt lớp theo chiều dài — nhìn từ cửa vào${imgs.length > PER ? ` (phần ${Math.floor(k / PER) + 1}/${Math.ceil(imgs.length / PER)})` : ''}</h3>${legendOf(c)}
          <div class="secs">${imgs.slice(k, k + PER).map((o, j) => `<div><div class="t">Lớp ${k + j + 1}: X = ${fmt(o.x)} mm · ${o.cut} kiện</div><img src="${o.url}" width="${o.w}" height="${o.h}"></div>`).join('')}</div>`);
      }
    }
  }

  // ----- Chụp từng trang → PDF -----
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4', compress: true });
  addFonts(pdf, await loadFonts());
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-20000px;top:0;z-index:-1';
  host.innerHTML = `<style>${CSS}</style>`;
  document.body.appendChild(host);
  try {
    for (let p = 0; p < pages.length; p++) {
      progress(`Đang tạo trang ${p + 1}/${pages.length}…`);
      const el = document.createElement('div');
      el.className = 'pg';
      el.innerHTML = `<div class="hd"><b>${title}</b><span>${esc(ctx.mixText())} · ngày lập ${date}</span></div>${pages[p]}
        <div class="ft"><span>Load Planner</span><span>Trang ${p + 1}/${pages.length}</span></div>`;
      host.appendChild(el);
      await Promise.all([...el.querySelectorAll('img')].map(img => img.complete ? 0 : new Promise(r => { img.onload = img.onerror = r; })));
      if (p) pdf.addPage('a4', 'landscape');
      domToPdf(pdf, el, 297, 210);
      el.remove();
      await new Promise(r => setTimeout(r, 0)); // nhường giao diện cập nhật tiến độ
    }
  } finally { host.remove(); }
  const name = (project.name || 'Ke-hoach-xep-hang').replace(/[\\/:*?"<>|]/g, '_');
  pdf.save(`${name}_${new Date().toISOString().slice(0, 10)}.pdf`);
  return pages.length;
}
