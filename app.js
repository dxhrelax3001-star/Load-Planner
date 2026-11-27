import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { orientations, canPlace, computeLoads, cornerBlocks } from './packer.js';
import { exportPdf } from './pdf.js';

/* ================== Dữ liệu ================== */
const PRESETS = [
  // Tải trọng hàng tối đa (max payload) theo Maersk: https://www.maersk.com/support/faqs/cargo-weight-limit (tra 16/11/2026)
  { id: '20gp', name: 'Cont 20DC', l: 5800, w: 2340, h: 2380, kg: 28300 },
  { id: '40gp', name: 'Cont 40DC', l: 11950, w: 2340, h: 2380, kg: 28870 },
  { id: '40hc', name: 'Cont 40HC', l: 11950, w: 2340, h: 2680, kg: 28690 },
  { id: '45hc', name: 'Cont 45HC', l: 13530, w: 2340, h: 2680, kg: 27650 },
  { id: '20rf', name: "Container lạnh 20' RF", l: 5444, w: 2294, h: 2276, kg: 27770 },
  { id: '40rf', name: "Container lạnh 40' HC RF", l: 11583, w: 2294, h: 2550, kg: 29670 },
  { id: 'tr25', name: 'Xe tải 2.5 tấn (thùng 4.3m)', l: 4300, w: 1950, h: 1900, kg: 2500 },
  { id: 'tr5', name: 'Xe tải 5 tấn (thùng 6.2m)', l: 6200, w: 2300, h: 2300, kg: 5000 },
  { id: 'tr8', name: 'Xe tải 8 tấn (thùng 8.2m)', l: 8200, w: 2350, h: 2400, kg: 8000 },
  { id: 'semi', name: 'Sơ mi rơ moóc 13.6m', l: 13600, w: 2450, h: 2600, kg: 25000 },
  { id: 'eur', name: 'Pallet EUR 1200×800 (cao xếp 1500)', l: 1200, w: 800, h: 1500, kg: 1000 },
  { id: 'us', name: 'Pallet 1219×1016 (cao xếp 1500)', l: 1219, w: 1016, h: 1500, kg: 1000 },
  { id: 'custom', name: 'Tuỳ chỉnh…' },
];
/** Các bảng màu tự gán cho loại kiện (kiện thứ i lấy màu thứ i) */
const PALETTES = {
  classic: { name: 'Cổ điển', c: ['#4e79a7', '#f28e2b', '#e15759', '#76b7b2', '#59a14f', '#edc948', '#b07aa1', '#ff9da7', '#9c755f', '#bab0ac',
    '#1f77b4', '#2ca02c', '#d62728', '#9467bd', '#8c564b', '#e377c2', '#17becf', '#bcbd22', '#7f7f7f', '#aec7e8'] },
  bright: { name: 'Tươi – tương phản cao', c: ['#e6194b', '#3cb44b', '#ffe119', '#4363d8', '#f58231', '#911eb4', '#42d4f4', '#f032e6', '#bfef45', '#fabed4',
    '#469990', '#dcbeff', '#9a6324', '#fffac8', '#800000', '#aaffc3', '#808000', '#ffd8b1', '#000075', '#a9a9a9'] },
  pastel: { name: 'Pastel nhẹ', c: ['#a6cee3', '#fdbf6f', '#fb9a99', '#b2df8a', '#cab2d6', '#ffff99', '#8dd3c7', '#bebada', '#fccde5', '#d9d9d9',
    '#ccebc5', '#ffed6f', '#80b1d3', '#fdb462', '#b3de69', '#bc80bd', '#fbb4ae', '#decbe4', '#fed9a6', '#e5d8bd'] },
  wood: { name: 'Tông gỗ', c: ['#8d6e63', '#d7a86e', '#6d4c41', '#e0c097', '#a0522d', '#c19a6b', '#5d4037', '#deb887', '#b5651d', '#bcaaa4',
    '#795548', '#f4a460', '#9e7b53', '#d2b48c', '#704214', '#cd853f', '#a1887f', '#e9c9a0', '#8b5a2b', '#c8a27a'] },
  dark: { name: 'Đậm', c: ['#1b4f72', '#922b21', '#196f3d', '#9a7d0a', '#5b2c6f', '#0e6251', '#a04000', '#2e4053', '#78281f', '#145a32',
    '#6e2c00', '#1a5276', '#512e5f', '#0b5345', '#7e5109', '#4d5656', '#641e16', '#186a3b', '#154360', '#424949'] },
  blue: { name: 'Xanh dương – xám', c: ['#08519c', '#3182bd', '#6baed6', '#9ecae1', '#2c7fb8', '#41b6c4', '#7fcdbb', '#253494', '#525252', '#969696',
    '#1d91c0', '#225ea8', '#c6dbef', '#4292c6', '#737373', '#0868ac', '#43a2ca', '#a8ddb5', '#084081', '#bdbdbd'] },
};
let COLORS = PALETTES.classic.c;
const ROT_LABEL = { all: 'Tự do', upright: 'Đứng', none: 'Cố định', no_end: 'Đứng / nằm nghiêng', side: 'Chỉ nằm nghiêng', end: 'Chỉ dựng đứng', along: 'Dài dọc theo cont' };
const ROT_DESC = {
  all: 'Xoay tự do — 6 hướng, mặt nào làm đáy cũng được',
  upright: 'Giữ mặt trên hướng lên (This side up), chỉ xoay ngang 90° — 2 hướng',
  none: 'Không xoay — đặt đúng Dài theo chiều dài cont, Cao hướng lên',
  no_end: 'Đứng hoặc lật nằm nghiêng, KHÔNG dựng đứng đầu kiện (cạnh Dài không được hướng lên) — 4 hướng',
  side: 'Chỉ đặt nằm nghiêng: cạnh Rộng hướng lên — 2 hướng',
  end: 'Chỉ dựng đứng: cạnh Dài hướng lên — 2 hướng',
  along: 'Cạnh Dài luôn song song chiều dài cont, được lật nghiêng — 2 hướng',
};
/** Đọc kiểu xoay từ chữ (đã bỏ dấu, chữ thường) — dùng cho nhập Excel và trợ lý */
function parseRot(s, def = 'upright') {
  s = String(s || '').trim();
  if (!s) return def;
  if (ROT_LABEL[s]) return s;
  if (/co dinh|khong xoay|^none$/.test(s)) return 'none';
  if (/(dung|^up).*(nam|nghieng|side)|khong dung dung|khong dung dau/.test(s)) return 'no_end';
  if (/chi nam|nam nghieng|^nam$|lat nghieng|^side$/.test(s)) return 'side';
  if (/dung dung|dung dau|chi dung dung|^end$/.test(s)) return 'end';
  if (/doc theo|doc cont|^along$/.test(s)) return 'along';
  if (/tu do|^all$|6 huong/.test(s)) return 'all';
  if (/dung|upright|mat tren|this side up/.test(s)) return 'upright';
  return 'all';
}
const STORE = 'loadplanner.project.v1';

const sample = () => ({
  name: 'Dự án mẫu',
  container: { preset: '40hc', l: 11950, w: 2340, h: 2680, kg: 28690 },
  opt: { support: 75, strategy: 'auto', maxC: 50 },
  items: [
    { name: 'Tủ áo 2 cánh (thùng 1/2)', l: 1850, w: 620, h: 320, weight: 48, qty: 40, rotate: 'all', stackable: true, maxLoad: 0, floorOnly: false, priority: 1, color: COLORS[0] },
    { name: 'Bàn ăn mặt gỗ', l: 1650, w: 950, h: 180, weight: 36, qty: 30, rotate: 'upright', stackable: true, maxLoad: 0, floorOnly: false, priority: 1, color: COLORS[1] },
    { name: 'Ghế ăn (2 cái/thùng)', l: 980, w: 560, h: 620, weight: 14, qty: 90, rotate: 'upright', stackable: true, maxLoad: 120, floorOnly: false, priority: 1, color: COLORS[2] },
    { name: 'Kệ TV', l: 1600, w: 450, h: 520, weight: 32, qty: 25, rotate: 'upright', stackable: true, maxLoad: 0, floorOnly: false, priority: 2, color: COLORS[3] },
    { name: 'Gương soi (dễ vỡ)', l: 900, w: 120, h: 1500, weight: 18, qty: 20, rotate: 'none', stackable: false, maxLoad: 0, floorOnly: false, priority: 2, color: COLORS[4] },
  ],
});

let project = load() || sample();
COLORS = (PALETTES[project.palette] || PALETTES.classic).c;
let result = null;      // kết quả tính toán
let current = 0;        // container đang xem
let manualDirty = false; // đã chỉnh tay sau lần tính gần nhất
const manual = { on: false, pick: null, sel: -1, undo: [], redo: [], multi: new Set(), clip: null, gpick: null };
// manual.sel = chỉ số 1 kiện đang chọn; gán giá trị mới sẽ đặt lại vùng chọn nhiều (manual.multi) = đúng kiện đó
{
  let _sel = -1;
  Object.defineProperty(manual, 'sel', {
    get: () => _sel,
    set: v => { _sel = v; manual.multi = new Set(); const b = v >= 0 ? result?.containers[current]?.boxes[v] : null; if (b) manual.multi.add(b); },
  });
  manual.setMulti = set => { manual.multi = set; const c = result?.containers[current]; _sel = set.size === 1 && c ? c.boxes.indexOf([...set][0]) : -1; };
}

/* ================== Tiện ích ================== */
const $ = s => document.querySelector(s);
const fmt = (n, d = 0) => Number(n).toLocaleString('vi-VN', { maximumFractionDigits: d, minimumFractionDigits: d });
function toast(msg, ms = 2500) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => t.hidden = true, ms); }
function save() { try { localStorage.setItem(STORE, JSON.stringify(project)); } catch {} }
function load() { try { return JSON.parse(localStorage.getItem(STORE)); } catch { return null; } }
function download(name, blob) { const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000); }
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ================== Container ================== */
/** Danh sách loại cont + số lượng (project.fleet). project.container luôn = dòng 1 (để tương thích các phần cũ) */
function ensureFleet() {
  if (!Array.isArray(project.fleet) || !project.fleet.length) project.fleet = [{ ...project.container, qty: null }];
  for (const r of project.fleet) {
    const pre = PRESETS.find(p => p.id === r.preset);
    if (pre && pre.l) Object.assign(r, { l: pre.l, w: pre.w, h: pre.h, kg: pre.kg }); // đồng bộ số đo mới nhất
  }
  project.container = project.fleet[0];
}
const specName = r => (PRESETS.find(p => p.id === r.preset && p.l)?.name) || `Tuỳ chỉnh ${r.l}×${r.w}×${r.h}`;
const specOfRow = (r, k) => ({ id: `${k}:${r.preset}`, preset: r.preset, name: specName(r), l: +r.l, w: +r.w, h: +r.h, kg: +r.kg || 0, maxWeight: +r.kg || Infinity });
function renderFleet() {
  ensureFleet();
  const opts = PRESETS.map(p => `<option value="${p.id}">${p.name}</option>`).join('');
  $('#fleet tbody').innerHTML = project.fleet.map((r, k) => `
    <tr data-k="${k}">
      <td class="c">${k + 1}</td>
      <td><select data-f="preset">${opts}</select></td>
      <td><input type="number" data-f="l" value="${r.l}"></td>
      <td><input type="number" data-f="w" value="${r.w}"></td>
      <td><input type="number" data-f="h" value="${r.h}"></td>
      <td><input type="number" data-f="kg" value="${r.kg}"></td>
      <td><input type="number" class="qty" data-f="qty" min="1" value="${r.qty || ''}" placeholder="tự động"></td>
      <td>${project.fleet.length > 1 ? '<button class="del" title="Bỏ loại cont này">✕</button>' : ''}</td>
    </tr>`).join('');
  $('#fleet tbody').querySelectorAll('tr').forEach((tr, k) => { tr.querySelector('select').value = project.fleet[k].preset; });
  $('#fleetSum').textContent = '· ' + project.fleet.map(r => `${r.qty > 0 ? r.qty : '∞'} × ${specName(r).replace('Cont ', '')}`).join(' + ');
  updateItemSum?.();
}
$('#fleet tbody').addEventListener('change', e => {
  const tr = e.target.closest('tr'); if (!tr) return;
  const r = project.fleet[+tr.dataset.k], f = e.target.dataset.f;
  if (f === 'preset') { const p = PRESETS.find(x => x.id === e.target.value); r.preset = p.id; if (p.l) Object.assign(r, { l: p.l, w: p.w, h: p.h, kg: p.kg }); }
  else if (f === 'qty') r.qty = +e.target.value > 0 ? Math.round(+e.target.value) : null;
  else { r[f] = +e.target.value; if (f !== 'kg') r.preset = 'custom'; }
  save(); renderFleet(); markStale('cont');
});
$('#fleet tbody').addEventListener('click', e => {
  if (!e.target.classList.contains('del')) return;
  project.fleet.splice(+e.target.closest('tr').dataset.k, 1); save(); renderFleet(); markStale('cont');
});
$('#btnAddFleet').onclick = () => {
  const p = PRESETS.find(x => x.id === '20gp');
  project.fleet.push({ preset: p.id, l: p.l, w: p.w, h: p.h, kg: p.kg, qty: 1 });
  save(); renderFleet(); markStale('cont');
};
function initContainer() {
  renderFleet();
  const o = project.opt;
  $('#oSupport').value = o.support; $('#oStrategy').value = o.strategy; $('#oMaxC').value = o.maxC;
  $('#oSupport').oninput = e => { o.support = +e.target.value; save(); markStale('tuỳ chọn'); };
  $('#oStrategy').onchange = e => { o.strategy = e.target.value; save(); markStale('tuỳ chọn'); };
  $('#oMaxC').oninput = e => { o.maxC = +e.target.value; save(); markStale('tuỳ chọn'); };
  // Pallet: gom kiện lên pallet rồi xếp pallet vào cont
  o.pallet = { on: false, l: 1200, w: 1000, h: 150, weight: 25, maxH: 1800, kg: 1000, stack: false, ...(o.pallet || {}) };
  const P = o.pallet, PF = { pL: 'l', pW: 'w', pH: 'h', pKgSelf: 'weight', pMaxH: 'maxH', pKg: 'kg' };
  const palState = () => { $('#palState').textContent = P.on ? `· BẬT ${P.l}×${P.w}, cao ≤ ${P.maxH}` : '· tắt'; $('#palBox').classList.toggle('on', !!P.on); };
  $('#pOn').checked = !!P.on; $('#pStack').checked = !!P.stack;
  for (const [id, k] of Object.entries(PF)) { $('#' + id).value = P[k] || ''; $('#' + id).oninput = e => { P[k] = +e.target.value || 0; save(); palState(); if (P.on) markStale('pallet'); }; }
  $('#pOn').onchange = e => { P.on = e.target.checked; save(); palState(); markStale('pallet'); };
  $('#pStack').onchange = e => { P.stack = e.target.checked; save(); if (P.on) markStale('pallet'); };
  palState();
  // Tên dự án (ô trên thanh trên cùng)
  $('#projName').value = project.name || '';
  $('#projName').oninput = e => { project.name = e.target.value; save(); document.title = (project.name ? project.name + ' – ' : '') + 'Load Planner'; };
  document.title = (project.name ? project.name + ' – ' : '') + 'Load Planner';
}

/* ================== Bảng kiện hàng ================== */
function renderItems() {
  const tb = $('#items tbody');
  tb.innerHTML = project.items.map((it, i) => `
    <tr data-i="${i}">
      <td><input type="color" data-k="color" value="${it.color}"></td>
      <td><input class="name" data-k="name" value="${esc(it.name)}"></td>
      <td><input type="number" class="dim" data-k="l" value="${it.l}" min="1"></td>
      <td><input type="number" class="dim" data-k="w" value="${it.w}" min="1"></td>
      <td><input type="number" class="dim" data-k="h" value="${it.h}" min="1"></td>
      <td><input type="number" class="qty" data-k="qty" value="${it.qty}" min="0"></td>
      <td><input type="number" data-k="weight" value="${it.weight}" min="0" step="0.1"></td>
      <td><select data-k="rotate" title="${ROT_DESC[it.rotate] || ''}">${Object.entries(ROT_LABEL).map(([v, t]) => `<option value="${v}" title="${ROT_DESC[v]}" ${it.rotate === v ? 'selected' : ''}>${t}</option>`).join('')}</select></td>
      <td class="c"><input type="checkbox" data-k="stackable" ${it.stackable ? 'checked' : ''}></td>
      <td><input type="number" class="ml" data-k="maxLoad" value="${it.maxLoad || ''}" min="0" placeholder="∞"></td>
      <td class="c"><input type="checkbox" data-k="floorOnly" ${it.floorOnly ? 'checked' : ''}></td>
      <td><input type="number" class="pr" data-k="priority" value="${it.priority}" min="1"></td>
      <td><button class="del" title="Xoá">✕</button></td>
    </tr>`).join('');
  updateItemSum();
}
function updateItemSum() {
  const n = project.items.reduce((s, it) => s + (+it.qty || 0), 0);
  const v = project.items.reduce((s, it) => s + (+it.qty || 0) * it.l * it.w * it.h / 1e9, 0);
  const kg = project.items.reduce((s, it) => s + (+it.qty || 0) * (+it.weight || 0), 0);
  $('#itemSum').textContent = `· ${project.items.length} loại · ${fmt(n)} kiện · ${fmt(v, 2)} m³ · ${fmt(kg)} kg`;
  document.querySelectorAll('#items tbody tr').forEach(tr => {
    const it = project.items[+tr.dataset.i];
    if (!it) return;
    const fits = (project.fleet || [project.container]).some(C => fitsAny(it, C));
    tr.classList.toggle('bad', !fits);
    tr.title = fits ? '' : 'Kiện này không vừa container với các hướng xoay cho phép';
  });
}
function fitsAny(it, C) {
  const o = orientations({ l: +it.l, w: +it.w, h: +it.h, rotate: it.rotate });
  return o.some(([l, w, h]) => l <= C.l && w <= C.w && h <= C.h);
}
$('#items tbody').addEventListener('input', e => {
  const el = e.target, tr = el.closest('tr'); if (!tr || !el.dataset.k) return;
  const it = project.items[+tr.dataset.i], k = el.dataset.k;
  if (el.type === 'checkbox') it[k] = el.checked;
  else if (el.type === 'number') it[k] = el.value === '' ? 0 : +el.value;
  else it[k] = el.value;
  save(); updateItemSum();
  if (k === 'color' && result) { buildScene(); renderLegend(); }
  else if (k !== 'color') markStale('kiện');
});
$('#items tbody').addEventListener('click', e => {
  if (!e.target.classList.contains('del')) return;
  const i = +e.target.closest('tr').dataset.i;
  project.items.splice(i, 1); save(); renderItems(); markStale('kiện');
});
/* ---- Bảng màu kiện ---- */
function syncPalette() {
  COLORS = (PALETTES[project.palette] || PALETTES.classic).c;
  const sel = $('#palette');
  if (!sel.options.length) sel.innerHTML = Object.entries(PALETTES).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
  sel.value = PALETTES[project.palette] ? project.palette : 'classic';
  $('#palPrev').innerHTML = COLORS.slice(0, 8).map(c => `<i style="background:${c}"></i>`).join('');
}
$('#palette').onchange = e => {
  project.palette = e.target.value;
  syncPalette();
  project.items.forEach((it, i) => { it.color = COLORS[i % COLORS.length]; });
  if (result) result.items.forEach((it, i) => { if (!it.pallet) it.color = COLORS[i % COLORS.length]; });
  save(); renderItems();
  if (result) { buildScene(); renderLegend(); if (manual.on) renderManual(); savePlan(); }
  toast(`🎨 Đã đổi bảng màu: ${PALETTES[project.palette].name}`);
};
syncPalette();

$('#btnAdd').onclick = () => {
  const i = project.items.length;
  project.items.push({ name: `Kiện ${i + 1}`, l: 1000, w: 600, h: 500, weight: 20, qty: 10, rotate: 'all', stackable: true, maxLoad: 0, floorOnly: false, priority: 1, color: COLORS[i % COLORS.length] });
  save(); renderItems(); markStale('kiện');
  const inp = document.querySelector(`#items tr[data-i="${i}"] .name`); inp?.focus(); inp?.select();
};

/* ---------- Nhập dữ liệu dạng bảng (Excel / dán) ---------- */
const HEAD = {
  name: ['ten', 'tên', 'name', 'ma', 'mã', 'item', 'san pham', 'sản phẩm', 'mo ta', 'mô tả', 'description',
    'ma hang', 'ma sp', 'ma kien', 'ma thung', 'ten hang', 'ten kien', 'ten sp', 'mat hang', 'hang hoa', 'code', 'model', 'item code', 'product'],
  l: ['dai', 'dài', 'length', 'l', 'd'], w: ['rong', 'rộng', 'width', 'w', 'r'], h: ['cao', 'height', 'h', 'c'],
  weight: ['kg', 'weight', 'trong luong', 'trọng lượng', 'khoi luong', 'khối lượng', 'nang', 'gw'],
  qty: ['sl', 'so luong', 'số lượng', 'qty', 'quantity', 'sl thung', 'ctns', 'cartons'],
  rotate: ['xoay', 'rotate', 'rotation'], stackable: ['chong', 'chồng', 'xep chong', 'xếp chồng', 'stack', 'stackable'],
  maxLoad: ['chiu tai', 'chịu tải', 'max load', 'maxload', 'tai tren', 'tải trên'],
  floorOnly: ['san', 'sàn', 'chi san', 'chỉ sàn', 'floor', 'floor only'],
  priority: ['uu tien', 'ưu tiên', 'priority', 'thu tu', 'thứ tự', 'diem giao', 'điểm giao'],
};
const norm = s => String(s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
const truthy = v => { const s = norm(v); return s === 'x' || s === 'co' || s === 'yes' || s === 'y' || s === '1' || s === 'true'; };
/** Đọc số kiểu Excel: "1,080" / "1.080" (phân cách nghìn), "12,5" (thập phân), "930 mm" */
function numCell(v) {
  if (typeof v === 'number') return v;
  let s = String(v ?? '').replace(/[\s ]/g, '').replace(/[^\d.,-]/g, '');
  if (/^-?\d{1,3}([.,]\d{3})+$/.test(s)) s = s.replace(/[.,]/g, '');      // 1,080 · 1.080 · 12.345.678
  else if (/^-?\d+,\d+$/.test(s)) s = s.replace(',', '.');                 // 12,5
  else s = s.replace(/,/g, '');                                            // 1,080.5
  const n = parseFloat(s); return isNaN(n) ? 0 : n;
}
const SIZE_HEAD = ['kich thuoc', 'quy cach', 'size', 'dims', 'dimension', 'dimensions', 'kt', 'lxwxh', 'dxrxc', 'dai x rong x cao'];
/** Ô tiêu đề h (đã chuẩn hoá) có khớp bí danh a không: trùng hẳn, hoặc bắt đầu bằng a (vd "dai mm", "chieu dai") */
function headMatch(h, a) {
  if (!h) return false;
  if (h === a) return true;
  if (a.length <= 2) return false;                     // l, w, h, d, r, c, kg… chỉ khớp đúng
  return h.startsWith(a + ' ') || h === 'chieu ' + a || h.startsWith('chieu ' + a + ' ') || h.endsWith(' ' + a);
}
function rowsToItems(rows) {
  rows = rows.filter(r => r && r.some(c => String(c ?? '').trim() !== ''));
  if (!rows.length) return [];
  // Tìm dòng tiêu đề trong 6 dòng đầu (file có thể có dòng tên bảng phía trên)
  let map = {}, hr = -1, sizeCol = -1;
  for (let i = 0; i < Math.min(6, rows.length) && hr < 0; i++) {
    const head = rows[i].map(norm), m = {};
    for (const [k, alias] of Object.entries(HEAD)) {
      const idx = head.findIndex(h => alias.map(norm).some(a => headMatch(h, a)));
      if (idx >= 0 && !Object.values(m).includes(idx)) m[k] = idx;
    }
    const sc = head.findIndex(h => SIZE_HEAD.some(a => headMatch(h, a)));
    if ((m.l !== undefined && m.w !== undefined && m.h !== undefined) || (sc >= 0 && (m.name !== undefined || m.qty !== undefined))) { map = m; hr = i; sizeCol = sc; }
  }
  let body;
  if (hr >= 0) body = rows.slice(hr + 1);
  else {
    // không có tiêu đề: Tên, Dài, Rộng, Cao, Kg, SL — bỏ các dòng đầu không có số
    map = { name: 0, l: 1, w: 2, h: 3, weight: 4, qty: 5 };
    body = rows;
  }
  const num = numCell;
  const base = project.items.length;
  return body.map((r, j) => {
    const g = k => map[k] === undefined ? undefined : r[map[k]];
    const rot = norm(g('rotate'));
    let l = num(g('l')), w = num(g('w')), h = num(g('h'));
    // cột kích thước gộp "1080x870x930" / "1080*870*930"
    if (sizeCol >= 0 && !(l && w && h)) {
      const p = String(r[sizeCol] ?? '').split(/\s*[x×*X\/]\s*/).map(num).filter(v => v > 0);
      if (p.length >= 3) [l, w, h] = p;
    }
    return {
      name: String(g('name') ?? `Kiện ${base + j + 1}`).replace(/\s*\n\s*/g, ' ').trim() || `Kiện ${base + j + 1}`,
      l, w, h, weight: num(g('weight')), qty: Math.round(num(g('qty')) || 1),
      rotate: rot === 'khong' ? 'none' : parseRot(rot),
      stackable: g('stackable') === undefined ? true : truthy(g('stackable')),
      maxLoad: num(g('maxLoad')), floorOnly: g('floorOnly') === undefined ? false : truthy(g('floorOnly')),
      priority: Math.max(1, Math.round(num(g('priority')) || 1)),
      color: COLORS[(base + j) % COLORS.length],
    };
  }).filter(it => it.l > 0 && it.w > 0 && it.h > 0);
}
/** Hỏi cách nhập: 'replace' | 'append' | null (huỷ) */
function askImportMode(n, src) {
  return new Promise(res => {
    const dlg = $('#impDlg');
    $('#impMsg').innerHTML = `Đọc được <b>${n}</b> loại kiện từ ${esc(src)}.<br>Danh sách hiện có <b>${project.items.length}</b> loại kiện. Chọn cách nhập:`;
    const done = v => { dlg.close(); res(v); };
    $('#impReplace').onclick = () => done('replace');
    $('#impAppend').onclick = () => done('append');
    $('#impCancel').onclick = () => done(null);
    dlg.oncancel = e => { e.preventDefault(); done(null); }; // phím Esc = Huỷ
    dlg.showModal(); $('#impAppend').focus();
  });
}
async function addImported(items, src) {
  if (!items.length) { toast('Không đọc được dòng hợp lệ (cần các cột Dài, Rộng, Cao).'); return false; }
  const mode = project.items.length ? await askImportMode(items.length, src) : 'append';
  if (!mode) { toast('Đã huỷ — không thêm dữ liệu nào.'); return false; }
  if (mode === 'replace') { project.items = items.map((it, i) => ({ ...it, color: COLORS[i % COLORS.length] })); }
  else project.items.push(...items);
  save(); renderItems(); toast(`Đã ${mode === 'replace' ? 'thay bằng' : 'thêm'} ${items.length} loại kiện.`); markStale('kiện');
  return true;
}
$('#btnImport').onclick = () => $('#fileImport').click();
$('#fileImport').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  const wb = XLSX.read(await f.arrayBuffer());
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true });
  addImported(rowsToItems(rows), f.name);
};
/** Tách văn bản copy từ Excel thành bảng (tab giữa các cột; ô có xuống dòng nằm trong ngoặc kép) */
function parseClip(text) {
  text = String(text || '').replace(/\r\n?/g, '\n');
  const rows = []; let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) { if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch; continue; }
    if (ch === '"' && cell === '') { q = true; continue; }
    if (ch === '\t') { row.push(cell); cell = ''; continue; }
    if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = ''; continue; }
    cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  // dán từ trang web / Word có thể không có tab mà là nhiều khoảng trắng hoặc dấu ;
  if (rows.every(r => r.length === 1)) return rows.map(r => r[0].split(/;|\s{2,}/));
  return rows;
}
async function pasteText(text) {
  const items = rowsToItems(parseClip(text));
  if (!items.length) { toast('Không đọc được dòng kiện nào. Bảng cần có cột Dài, Rộng, Cao (hoặc cột Kích thước dạng 1080x870x930).', 6000); return false; }
  return addImported(items, 'bảng dán');
}
// Nút "Dán từ Excel": mở hộp dán — không cần quyền đọc clipboard của trình duyệt
$('#btnPaste').onclick = async () => {
  const dlg = $('#pasteDlg'), ta = $('#pasteTa');
  ta.value = ''; $('#pastePrev').textContent = '';
  dlg.showModal(); ta.focus();
  try { const t = await navigator.clipboard.readText(); if (t && t.includes('\t') && !ta.value) { ta.value = t; pastePreview(); } } catch {}
};
function pastePreview() {
  const items = rowsToItems(parseClip($('#pasteTa').value));
  $('#pastePrev').textContent = $('#pasteTa').value.trim()
    ? (items.length ? `✔ Đọc được ${items.length} loại kiện · ${items.reduce((s, i) => s + i.qty, 0)} kiện — ví dụ: ${items[0].name} ${items[0].l}×${items[0].w}×${items[0].h}` : '⛔ Chưa đọc được dòng nào (cần cột Dài, Rộng, Cao)')
    : '';
}
$('#pasteTa').addEventListener('input', pastePreview);
$('#pasteCancel').onclick = () => $('#pasteDlg').close();
$('#pasteGo').onclick = async () => { if (await pasteText($('#pasteTa').value)) $('#pasteDlg').close(); };
document.addEventListener('paste', e => {
  if (e.target.id === 'pasteTa') return; // hộp dán: để trình duyệt dán bình thường
  if (e.target.closest && e.target.closest('input, select, textarea')) {
    const t = e.clipboardData.getData('text'); if (!t.includes('\t')) return; // dán thường vào ô
    e.preventDefault(); pasteText(t); return;
  }
  if (manual.on) return; // chế độ Xếp tay: Ctrl+V là dán nhóm kiện, không phải nhập bảng
  const t = e.clipboardData.getData('text'); if (t) { e.preventDefault(); pasteText(t); }
});
$('#btnTemplate').onclick = () => {
  const ws = XLSX.utils.aoa_to_sheet([
    ['Tên', 'Dài (mm)', 'Rộng (mm)', 'Cao (mm)', 'SL', 'Kg', 'Xoay (Tự do / Đứng / Cố định / Đứng nằm nghiêng / Chỉ nằm nghiêng / Chỉ dựng đứng / Dọc theo cont)', 'Xếp chồng (x)', 'Chịu tải (kg)', 'Chỉ sàn (x)', 'Ưu tiên'],
    ['Tủ áo 2 cánh', 1850, 620, 320, 40, 48, 'Tự do', 'x', '', '', 1],
    ['Ghế ăn', 980, 560, 620, 90, 14, 'Đứng', 'x', 120, '', 1],
    ['Gương soi', 900, 120, 1500, 20, 18, 'Cố định', '', '', '', 2],
  ]);
  ws['!cols'] = [{ wch: 28 }, ...Array(10).fill({ wch: 13 })];
  const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Danh sach kien');
  XLSX.writeFile(wb, 'Mau-danh-sach-kien.xlsx');
};

/* ---------- Dự án ---------- */
$('#btnNew').onclick = () => {
  if (!confirm('Tạo dự án mới? Danh sách kiện hiện tại sẽ bị xoá (hãy 💾 Lưu trước nếu cần).')) return;
  project = { ...sample(), name: 'Dự án mới', items: [], palette: project.palette };
  save(); initContainer(); renderItems(); clearResult();
};
$('#btnSave').onclick = () => {
  const name = prompt('Tên file dự án:', project.name || 'Du-an-xep-hang'); if (!name) return;
  project.name = name; save(); $('#projName').value = name;
  download(name.replace(/[\\/:*?"<>|]/g, '_') + '.json', new Blob([JSON.stringify(project, null, 2)], { type: 'application/json' }));
};
$('#btnOpen').onclick = () => $('#fileOpen').click();
$('#fileOpen').onchange = async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  try {
    const p = JSON.parse(await f.text());
    if (!Array.isArray(p.items) || !p.container) throw 0;
    project = { ...sample(), ...p }; syncPalette(); initContainer(); renderItems(); clearResult();
    project.plan = p.plan || null; save(); loadPlan(); toast('Đã mở ' + f.name);
  } catch { toast('File dự án không hợp lệ.'); }
};

/* ================== Tính toán ================== */
let worker;
const normItems = () => project.items.map(it => ({ ...it, l: +it.l, w: +it.w, h: +it.h, weight: +it.weight || 0, qty: +it.qty || 0, maxLoad: +it.maxLoad || 0, priority: +it.priority || 1 }));
const contInfo = () => { ensureFleet(); return specOfRow(project.fleet[0], 0); };
const fleetRows = () => { ensureFleet(); return project.fleet.map((r, k) => ({ spec: specOfRow(r, k), qty: r.qty > 0 ? r.qty : null })); };
/** Kích thước / tải của 1 container trong phương án (mỗi container có thể là loại khác nhau) */
function specOf(c) { const s = c?.spec || result?.base; if (s && !s.maxWeight) s.maxWeight = s.kg || Infinity; return s; }
/** Chuẩn hoá phương án: mỗi container có spec riêng; result.container = spec của container đang xem */
function wrapResult(r) {
  const base = r.base || Object.getOwnPropertyDescriptor(r, 'container')?.value || contInfo();
  delete r.container;
  r.base = base;
  if (!base.maxWeight) base.maxWeight = base.kg || Infinity;
  r.containers.forEach(c => { if (!c.spec) c.spec = { ...base }; if (!c.spec.maxWeight) c.spec.maxWeight = c.spec.kg || Infinity; });
  Object.defineProperty(r, 'container', { get() { return specOf(r.containers[Math.min(current, r.containers.length - 1)]) || r.base; }, configurable: true, enumerable: false });
  return r;
}
/** "2 × Cont 40HC + 1 × Cont 20DC" */
function mixText(R = result) {
  const cnt = new Map();
  R.containers.forEach(c => { const n = specOf(c).name; cnt.set(n, (cnt.get(n) || 0) + 1); });
  return [...cnt].map(([n, k]) => `${k} × ${n}`).join(' + ');
}
const shortName = s => String(s.name || '').replace(/^Cont(ainer)?\s*/i, '');
$('#btnRun').onclick = () => {
  if (manualDirty && !confirm('Tính lại từ đầu sẽ bỏ các kiện đã xếp tay. Tiếp tục?')) return;
  runPlan(null);
};
/** Chạy thuật toán. fixed = danh sách kiện giữ nguyên theo từng container (xếp tay) hoặc null */
function runPlan(fixed) {
  const fail = msg => { toast(msg); return Promise.resolve({ ok: false, error: msg }); };
  const fleet = fleetRows();
  if (fleet.some(r => !(r.spec.l > 0 && r.spec.w > 0 && r.spec.h > 0))) return fail('Kích thước container không hợp lệ.');
  const items = fixed ? result.items : normItems();
  const cinfo = fixed ? result.base : fleet[0].spec;
  if (!items.some(it => it.qty > 0)) return fail('Chưa có kiện hàng nào.');
  $('#busy').hidden = false; $('#btnRun').disabled = true;
  worker?.terminate();
  worker = new Worker('worker.js', { type: 'module' });
  const t0 = performance.now();
  let done;
  const promise = new Promise(r => { done = r; });
  worker.onmessage = e => {
    $('#busy').hidden = true; $('#btnRun').disabled = false; worker.terminate(); worker = null;
    if (!e.data.ok) { console.error(e.data.error); toast('Lỗi tính toán: ' + e.data.error.split('\n')[0], 5000); return done({ ok: false, error: e.data.error.split('\n')[0] }); }
    if (fixed) pushUndo();
    else { manual.undo = []; manual.redo = []; manualDirty = false; }
    result = wrapResult({ ...e.data, items: e.data.extraItems?.length ? items.concat(e.data.extraItems) : items, base: cinfo, ms: performance.now() - t0 });
    if (!fixed) current = 0;
    current = Math.min(current, result.containers.length - 1);
    manual.sel = -1; cancelPick(false);
    if (fixed) afterEdit(); else { showResult(); savePlan(); }
    if (!fixed) hideStale();
    done({ ok: true });
  };
  worker.onerror = e => { $('#busy').hidden = true; $('#btnRun').disabled = false; toast('Lỗi: ' + e.message, 5000); done({ ok: false, error: e.message }); };
  worker.postMessage({ items, fleet,
    opt: { minSupport: (project.opt.support || 75) / 100, strategy: project.opt.strategy, maxContainers: project.opt.maxC || 50,
      pallet: !fixed && project.opt.pallet?.on && +project.opt.pallet.l > 0 && +project.opt.pallet.w > 0 ? project.opt.pallet : null },
    fixed: fixed ? result.containers.map(c => ({ spec: specOf(c), boxes: c.boxes.map(b => ({ x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, h: b.h, t: b.t, step: b.step })) })) : [] });
  return promise;
}

function contStats(c) {
  const C = specOf(c), it = result.items;
  let vol = 0, kg = 0, cx = 0, cy = 0, cz = 0, len = 0;
  for (const b of c.boxes) {
    const w = it[b.t].weight; vol += b.l * b.w * b.h; kg += w;
    cx += (b.x + b.l / 2) * w; cy += (b.y + b.w / 2) * w; cz += (b.z + b.h / 2) * w; len = Math.max(len, b.x + b.l);
  }
  return { n: c.boxes.length, vol: vol / 1e9, volPct: vol / (C.l * C.w * C.h) * 100, kg, kgPct: C.kg ? kg / C.kg * 100 : 0,
    cog: kg ? { x: cx / kg, y: cy / kg, z: cz / kg } : null, len };
}

/* ---- Thông báo: dữ liệu kiện / cont đã đổi sau lần tính → phương án đang hiển thị sẽ được cập nhật ---- */
const staleWhat = new Set();
function markStale(what) {
  if (!result) return;
  staleWhat.add(what);
  const el = $('#stale');
  $('#staleMsg').innerHTML = `⚠ Dữ liệu <b>${[...staleWhat].join(' và ')}</b> vừa thay đổi — phương án xếp đang hiển thị là của dữ liệu cũ, bấm <b>Cập nhật</b> để tính lại theo dữ liệu mới.`
    + (manualDirty ? '<br><small>Lưu ý: tính lại sẽ bỏ các kiện đã xếp tay.</small>' : '');
  if (el.hidden) { el.hidden = false; toast(`Dữ liệu ${what} đã thay đổi — phương án xếp sẽ được cập nhật khi bấm Cập nhật.`); }
}
function hideStale() { staleWhat.clear(); $('#stale').hidden = true; }
$('#staleGo').onclick = () => $('#btnRun').click();
$('#staleLater').onclick = () => { $('#stale').hidden = true; };

function clearResult() {
  hideStale();
  if (manual.on) toggleManual(false);
  manual.undo = []; manual.redo = []; manualDirty = false;
  result = null; project.plan = null; save(); $('#empty').hidden = false; $('#stats').hidden = true; $('#stepBar').hidden = true;
  $('#tabs').innerHTML = ''; $('#summary').innerHTML = ''; $('#legend').innerHTML = ''; clearScene();
}

function showResult() {
  $('#empty').hidden = true;
  const R = result;
  $('#tabs').innerHTML = R.containers.map((c, i) => `<span class="tab ${i === current ? 'active' : ''}" data-c="${i}" title="Xem container #${i + 1} — ${esc(specOf(c).name)} ${specOf(c).l}×${specOf(c).w}×${specOf(c).h}">#${i + 1} <b class="tab-t">${esc(shortName(specOf(c)))}</b> · ${c.boxes.length} kiện<i class="tab-x" data-del="${i}" title="Xoá container #${i + 1}">✕</i></span>`).join('')
    + `<span class="tab tab-add" data-add="1" title="Thêm 1 container trống">＋ Cont</span>`
    + (R.containers.some(c => !c.boxes.length) && R.containers.length > 1 ? `<span class="tab tab-clear" data-empty="1" title="Xoá các container không có kiện nào">🧹 Xoá cont trống</span>` : '')
    + `<span class="tab tab-clear" data-clearall="1" title="Xoá tất cả container và kiện đã xếp (hoàn tác được bằng Ctrl+Z)">🗑 Xoá tất cả</span>`;
  $('#tabs').onclick = e => {
    const del = e.target.closest('[data-del]');
    if (del) return deleteContainer(+del.dataset.del);
    if (e.target.closest('[data-add]')) return showAddMenu(e.target.closest('[data-add]'));
    if (e.target.closest('[data-clearall]')) return deleteAllContainers();
    if (e.target.closest('[data-empty]')) return deleteEmptyContainers();
    const b = e.target.closest('[data-c]'); if (!b) return;
    current = +b.dataset.c; manual.sel = -1; cancelPick(true, true);
    if (manual.gpick) manual.gpick.cache = null; // đang dán: cho phép dán sang container khác
    showResult();
  };
  // Tổng hợp
  const placed = R.containers.reduce((s, c) => s + c.boxes.length, 0);
  const unpl = Object.entries(R.unplaced);
  const totalVol = R.containers.reduce((s, c) => s + contStats(c).vol, 0);
  $('#summary').innerHTML = `
    <div><span class="big">${R.containers.length}</span> container: ${esc(mixText(R))}</div>
    <div>Đã xếp <b>${fmt(placed)}</b> / ${fmt(R.totalUnits)} kiện · ${fmt(totalVol, 2)} m³ · ${fmt(R.ms / 1000, 1)} s · chiến lược: ${esc(R.strategy || '-')}</div>
    ${unpl.length ? `<div class="alert">⚠ Chưa xếp được ${fmt(unpl.reduce((s, [, n]) => s + n, 0))} kiện:<br>${unpl.map(([t, n]) => `• ${esc(R.items[t].name)}: ${n}`).join('<br>')}<br><small>Do kiện quá khổ, vượt tải trọng, hoặc đã đạt số container tối đa.</small></div>` : '<div class="good">✔ Đã xếp hết toàn bộ kiện hàng.</div>'}`;
  $('#summary').insertAdjacentHTML('beforeend', tipsHtml());
  renderLegend();
  buildScene();
  if (manual.on) renderManual();
}

/* ================== Gợi ý & cảnh báo sau khi xếp ================== */
/** Phân tích phương án: trọng tâm, kiện nặng đè kiện nhẹ, chỗ trống còn lại, cont cuối ít hàng, kiện chưa xếp… */
function analyzePlan(R = result) {
  const tips = [], items = R.items, W = t => +items[t]?.weight || 0;
  const add = (lvl, html, c = null) => tips.push({ lvl, html, c });
  const name = t => `"${esc(items[t]?.name)}"`;
  // Pallet
  if (R.palInfo?.length) {
    const hs = R.palInfo.map(p => p.h), ks = R.palInfo.map(p => p.kg);
    add('info', `🧱 Đã gom thành <b>${R.palInfo.length} pallet</b> · cao ${fmt(Math.min(...hs))}–${fmt(Math.max(...hs))} mm · nặng ${fmt(Math.min(...ks))}–${fmt(Math.max(...ks))} kg`
      + (R.looseCount ? ` · <b>${R.looseCount}</b> kiện không vừa pallet được xếp rời` : ''));
    const P = project.opt.pallet || {}, low = R.palInfo.filter(p => p.h - P.h < (P.maxH - P.h) * 0.5);
    if (low.length && R.palInfo.length > 1) add('tip', `${low.length} pallet cao chưa tới nửa mức cho phép (vd pallet #${low[0].no} cao ${fmt(low[0].h)} mm) — có thể tăng <b>Cao tối đa cả pallet</b> hoặc bật <b>Cho chồng pallet</b> để đỡ tốn chỗ.`);
  }
  R.containers.forEach((c, i) => {
    if (!c.boxes.length) return;
    const C = specOf(c), st = contStats(c), tag = `Cont #${i + 1}`;
    // 1. Trọng tâm
    if (st.cog) {
      const px = st.cog.x / C.l * 100, py = st.cog.y / C.w * 100;
      if (Math.abs(px - 50) > 15) add('warn', `${tag}: trọng tâm lệch về <b>${px < 50 ? 'phía vách trong' : 'phía cửa'}</b> (${fmt(px)}% chiều dài) — nên dàn kiện nặng về giữa cont để xe không bị lệch trục.`, i);
      if (Math.abs(py - 50) > 10) add('warn', `${tag}: trọng tâm lệch sang <b>${py < 50 ? 'bên trái' : 'bên phải'}</b> (${fmt(py)}% chiều rộng) — đổi chỗ bớt kiện nặng sang bên kia.`, i);
    }
    // 2. Tải trọng sát giới hạn
    if (st.kgPct > 95) add('warn', `${tag}: đã dùng ${fmt(st.kgPct, 1)}% tải trọng — sát mức tối đa, kiểm tra lại cân nặng thực tế.`, i);
    // 3. Kiện nặng nằm trên kiện nhẹ
    const pairs = [];
    for (const b of c.boxes) {
      if (b.z < 1 || items[b.t]?.pallet) continue;
      for (const o of c.boxes) {
        if (o === b || items[o.t]?.pallet || Math.abs(o.z + o.h - b.z) > 1 || !overlapXY(o, b)) continue;
        if (W(b.t) > W(o.t) * 1.5 && W(b.t) - W(o.t) >= 5) { pairs.push([b.t, o.t]); break; }
      }
    }
    if (pairs.length) {
      const [a, o] = pairs[0];
      add('warn', `${tag}: <b>${pairs.length}</b> kiện nặng nằm trên kiện nhẹ hơn (vd ${name(a)} ${fmt(W(a), 1)} kg trên ${name(o)} ${fmt(W(o), 1)} kg) — nên chọn chiến lược <b>Nặng trước</b>, hoặc nhập <b>Chịu tải</b> cho kiện nhẹ để không bị đè.`, i);
    }
    // 4. Kiện cấm chồng đặt sàn → phía trên bỏ trống
    const waste = c.boxes.filter(b => b.z < 1 && items[b.t] && !items[b.t].stackable && !items[b.t].pallet && C.h - b.h > 600);
    if (waste.length >= 3) {
      const v = waste.reduce((s, b) => s + b.l * b.w * (C.h - b.h), 0) / 1e9;
      add('tip', `${tag}: ${waste.length} kiện <b>không cho xếp chồng</b> đặt trên sàn, phía trên bỏ trống ~${fmt(v, 1)} m³ — nếu được, cho xếp chồng có giới hạn (cột <b>Chịu tải</b>) để tiết kiệm chỗ.`, i);
    }
    // 4b. Pallet không chồng → phía trên pallet bỏ trống
    if (R.palInfo?.length && !project.opt.pallet?.stack) {
      const pb = c.boxes.filter(b => items[b.t]?.pallet && b.z < 1 && b.pal);
      const gaps = pb.map(b => C.h - (R.palInfo[b.pal - 1]?.h || C.h)).filter(g => g > 500);
      if (gaps.length >= 2) {
        const v = pb.reduce((s, b) => s + b.l * b.w * Math.max(0, C.h - (R.palInfo[b.pal - 1]?.h || C.h)), 0) / 1e9;
        add('tip', `${tag}: phía trên ${gaps.length} pallet còn trống ${fmt(Math.min(...gaps))}–${fmt(Math.max(...gaps))} mm (~${fmt(v, 1)} m³) — bật <b>Cho chồng pallet</b>, hoặc tăng <b>Cao tối đa cả pallet</b> lên gần ${fmt(C.h - 50)} mm.`, i);
      }
    }
    // 5. Chỗ trống cuối cont → có thể thêm bao nhiêu kiện
    const freeL = C.l - st.len;
    if (freeL >= 300 && st.volPct < 92) {
      const kgLeft = (C.maxWeight || Infinity) - st.kg;
      const vOf = t => items[t].l * items[t].w * items[t].h;
      const fit = items.map((it, t) => {
        if (it.pallet || !it.qty) return { t, n: 0 };
        let n = 0;
        for (const [l, w, h] of orientations(it)) n = Math.max(n, Math.floor(freeL / l) * Math.floor(C.w / w) * Math.floor(C.h / h));
        if (it.weight > 0) n = Math.min(n, Math.floor(kgLeft / it.weight));
        return { t, n };
      }).filter(f => f.n > 0).sort((a, b) => b.n * vOf(b.t) - a.n * vOf(a.t));
      add('tip', `${tag}: còn trống <b>${fmt(freeL)} mm</b> cuối cont (~${fmt(freeL * C.w * C.h / 1e9, 1)} m³)`
        + (fit.length ? ` — có thể thêm khoảng ${fit.slice(0, 2).map(f => `<b>${fmt(f.n)}</b> kiện ${name(f.t)}`).join(' hoặc ')}.` : '.'), i);
    }
  });
  // 6. Cont cuối ít hàng → đổi loại nhỏ hơn
  const n = R.containers.length, last = R.containers[n - 1];
  if (n > 1 && last?.boxes.length) {
    const st = contStats(last), C = specOf(last);
    if (st.volPct < 50) {
      const types = [...new Set(last.boxes.map(b => b.t))];
      const kind = id => /rf$/.test(id || '') ? 'lanh' : /^(20|40|45)/.test(id || '') ? 'cont' :/^(tr|semi)/.test(id || '') ? 'xe' : 'khac';
      const smaller = PRESETS.filter(p => p.l && kind(p.id) !== 'khac' && kind(p.id) === kind(C.preset) && p.l * p.w * p.h < C.l * C.w * C.h
        && p.l * p.w * p.h * 0.85 >= st.vol * 1e9 && p.kg >= st.kg && types.every(t => fitsAny(items[t], p)))
        .sort((a, b) => a.l * a.w * a.h - b.l * b.w * b.h)[0];
      add('tip', `Cont cuối (#${n}) chỉ đầy <b>${fmt(st.volPct, 0)}%</b> thể tích`
        + (smaller ? ` — thử thêm dòng <b>${esc(smaller.name)}</b> số lượng 1 ở cuối bảng cont, và đặt số lượng dòng trên = ${n - 1}.` : ' — cân nhắc bớt hàng hoặc gửi phần này lô sau.'), n - 1);
    }
  }
  // 7. Kiện chưa xếp được → lý do
  const fl = project.fleet || [project.container];
  for (const [t, k] of Object.entries(R.unplaced || {})) {
    const it = items[t]; if (!it || it.pallet) continue;
    let why;
    if (!fl.some(C => fitsAny(it, C))) why = 'quá khổ so với cont với các hướng xoay cho phép — thử nới cột <b>Xoay</b>';
    else if (fl.every(C => +C.kg && it.weight > +C.kg)) why = 'nặng hơn tải trọng cont';
    else if (R.containers.length >= (project.opt.maxC || 50)) why = `đã đạt <b>Số container tối đa</b> (${project.opt.maxC || 50}) — tăng giới hạn này`;
    else if (fl.every(r => r.qty > 0)) why = 'đã hết số lượng cont khai báo — để trống ô <b>Số lượng</b> của 1 dòng cont để tự thêm cont';
    else why = 'vướng ràng buộc xếp chồng / chỉ đặt sàn / ưu tiên';
    add('warn', `${fmt(k)} kiện ${name(t)} chưa xếp: ${why}.`);
  }
  if (!tips.some(x => x.lvl === 'warn')) add('ok', '✔ Không thấy vấn đề lớn: trọng tâm cân, không có kiện nặng đè kiện nhẹ.');
  return tips;
}
function tipsHtml() {
  if (!result) return '';
  const tips = analyzePlan(), nw = tips.filter(t => t.lvl === 'warn').length, nt = tips.filter(t => t.lvl === 'tip').length;
  const ic = { warn: '⚠', tip: '💡', info: '', ok: '' };
  return `<details class="tips" ${nw || nt ? 'open' : ''}><summary>💡 Gợi ý & cảnh báo <small>${nw ? `${nw} cảnh báo` : ''}${nw && nt ? ' · ' : ''}${nt ? `${nt} mẹo` : ''}</small></summary>`
    + tips.map(t => `<div class="tip ${t.lvl}" ${t.c != null ? `data-goc="${t.c}" title="Bấm để xem container #${t.c + 1}"` : ''}>${ic[t.lvl] ? ic[t.lvl] + ' ' : ''}${t.html}</div>`).join('') + '</details>';
}
$('#summary').addEventListener('click', e => {
  const d = e.target.closest('[data-goc]'); if (!d || !result) return;
  const i = +d.dataset.goc; if (i === current || !result.containers[i]) return;
  current = i; manual.sel = -1; cancelPick(true, true); showResult();
});

function renderLegend() {
  if (!result) return;
  const c = result.containers[current]; if (!c) return;
  const cnt = {}; c.boxes.forEach(b => cnt[b.t] = (cnt[b.t] || 0) + 1);
  $('#legend').innerHTML = `<b>Container #${current + 1}</b>` + Object.entries(cnt).map(([t, n]) =>
    `<div><i style="background:${project.items[t]?.color || result.items[t].color}"></i>${esc(result.items[t].name)}<span class="n">${n} kiện</span></div>`).join('');
}

/* ================== 3D ================== */
const viewer = $('#viewer');
const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
viewer.prepend(renderer.domElement);
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(40, 1, 0.05, 500);
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
scene.add(new THREE.HemisphereLight(0xffffff, 0x8899aa, 1.6));
const sun = new THREE.DirectionalLight(0xffffff, 1.4); sun.position.set(-5, 10, 7); scene.add(sun);
let group = null, boxMeshes = [], labels = [];
const unitBox = new THREE.BoxGeometry(1, 1, 1);
const unitEdges = new THREE.EdgesGeometry(unitBox);
const edgeMat = new THREE.LineBasicMaterial({ color: 0x1d2733, transparent: true, opacity: 0.55 });

function resize() {
  const r = viewer.getBoundingClientRect();
  renderer.setSize(r.width, r.height, false);
  renderer.domElement.style.width = r.width + 'px'; renderer.domElement.style.height = r.height + 'px';
  camera.aspect = r.width / Math.max(1, r.height); camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(viewer);

/* ---- Thanh kéo chia 2 phần (nhập liệu | 3D), nhớ độ rộng trong trình duyệt ---- */
(() => {
  const sp = $('#splitter'), lay = document.querySelector('.layout'), KEY = 'loadplanner.split';
  const MIN_L = 340, MIN_R = 420;
  const apply = w => {
    const r = lay.getBoundingClientRect(), max = r.width - 20 - 10 - MIN_R;
    w = Math.round(Math.max(MIN_L, Math.min(max, w)));
    lay.style.setProperty('--left', w + 'px');
    return w;
  };
  try { const w = +localStorage.getItem(KEY); if (w > 0) apply(w); } catch {}
  let drag = null;
  sp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); sp.setPointerCapture(e.pointerId);
    drag = { x: e.clientX, w: lay.querySelector('.panel.left').getBoundingClientRect().width };
    sp.classList.add('drag'); document.body.classList.add('splitting');
  });
  sp.addEventListener('pointermove', e => { if (drag) apply(drag.w + e.clientX - drag.x); });
  const end = () => {
    if (!drag) return; drag = null;
    sp.classList.remove('drag'); document.body.classList.remove('splitting');
    try { localStorage.setItem(KEY, parseInt(lay.style.getPropertyValue('--left')) || ''); } catch {}
  };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => { lay.style.removeProperty('--left'); try { localStorage.removeItem(KEY); } catch {} toast('Đã đưa độ rộng 2 phần về mặc định.'); });
  // cửa sổ thu nhỏ: giữ phần 3D không bị ép quá hẹp
  window.addEventListener('resize', () => { const v = parseInt(lay.style.getPropertyValue('--left')); if (v) apply(v); });
})();
/* ---- Thanh kéo ngang: khung 3D ↕ phần kết quả bên dưới, nhớ chiều cao ---- */
(() => {
  const sp = $('#hsplit'), bot = document.querySelector('.bottom'), KEY = 'loadplanner.hsplit';
  const MIN_B = 40, MIN_V = 300;
  const apply = h => {
    const sec = bot.parentElement.getBoundingClientRect(), max = Math.max(MIN_B, sec.height - MIN_V - 140);
    h = Math.round(Math.max(MIN_B, Math.min(max, h)));
    bot.style.setProperty('--bottom', h + 'px'); bot.classList.add('sized');
    return h;
  };
  try { const h = +localStorage.getItem(KEY); if (h > 0) apply(h); } catch {}
  let drag = null;
  sp.addEventListener('pointerdown', e => {
    if (e.button !== 0) return;
    e.preventDefault(); sp.setPointerCapture(e.pointerId);
    drag = { y: e.clientY, h: bot.getBoundingClientRect().height };
    sp.classList.add('drag'); document.body.classList.add('hsplitting');
  });
  sp.addEventListener('pointermove', e => { if (drag) apply(drag.h - (e.clientY - drag.y)); });
  const end = () => {
    if (!drag) return; drag = null;
    sp.classList.remove('drag'); document.body.classList.remove('hsplitting');
    try { localStorage.setItem(KEY, parseInt(bot.style.getPropertyValue('--bottom')) || ''); } catch {}
  };
  sp.addEventListener('pointerup', end); sp.addEventListener('pointercancel', end);
  sp.addEventListener('dblclick', () => { bot.classList.remove('sized'); bot.style.removeProperty('--bottom'); try { localStorage.removeItem(KEY); } catch {} toast('Đã đưa cỡ khung 3D về mặc định.'); });
  window.addEventListener('resize', () => { const v = parseInt(bot.style.getPropertyValue('--bottom')); if (v) apply(v); });
})();
(function loop() { requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera); })();

function clearScene() {
  if (group) { scene.remove(group); group.traverse(o => { if (o.material && o.material !== edgeMat) o.material.dispose?.(); }); }
  labels.forEach(l => l.remove()); labels = [];
  group = null; boxMeshes = [];
}

function textSprite(text, size = 0.35, color = '#d64545') {
  const cv = document.createElement('canvas'); cv.width = 256; cv.height = 64;
  const g = cv.getContext('2d'); g.font = 'bold 40px Segoe UI'; g.fillStyle = color; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(text, 128, 32);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(cv), depthTest: false }));
  s.scale.set(size * 4, size, 1); return s;
}

// Toạ độ: x(dài) → X, z(cao) → Y, y(rộng) → Z (đơn vị m)
function buildScene() {
  clearScene();
  const R = result; const c = R.containers[current]; if (!c) return;
  const C = R.container, L = C.l / 1000, W = C.w / 1000, H = C.h / 1000;
  group = new THREE.Group(); scene.add(group);
  // Sàn
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(L, W), new THREE.MeshLambertMaterial({ color: 0xb9a58a }));
  floor.rotation.x = -Math.PI / 2; floor.position.set(L / 2, 0, W / 2); group.add(floor);
  // Nền phẳng (không kẻ caro) bao quanh container
  const gs = Math.ceil(Math.max(L, W)) * 2;
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(gs, gs), new THREE.MeshBasicMaterial({ color: 0xd3d9e2 }));
  ground.rotation.x = -Math.PI / 2; ground.position.set(L / 2, -0.004, W / 2); ground.type = 'GridHelper'; group.add(ground);
  // Vỏ container
  const shell = new THREE.Group(); shell.name = 'walls';
  const wallMat = new THREE.MeshLambertMaterial({ color: 0x9fb3cc, transparent: true, opacity: 0.12, side: THREE.DoubleSide, depthWrite: false });
  const back = new THREE.Mesh(new THREE.PlaneGeometry(W, H), wallMat); back.rotation.y = Math.PI / 2; back.position.set(0, H / 2, W / 2);
  const s1 = new THREE.Mesh(new THREE.PlaneGeometry(L, H), wallMat); s1.position.set(L / 2, H / 2, 0);
  shell.add(back, s1);
  const frame = new THREE.LineSegments(new THREE.EdgesGeometry(new THREE.BoxGeometry(L, H, W)), new THREE.LineBasicMaterial({ color: 0x14243a }));
  frame.position.set(L / 2, H / 2, W / 2); shell.add(frame);
  const door = textSprite('CỬA ▶', 0.3, '#14243a'); door.position.set(L + 0.5, H / 2, W / 2); shell.add(door);
  shell.visible = $('#vWalls').checked;
  group.add(shell);
  // Gù container (2 góc trên phía trong) + thanh ngang trên khung cửa
  const cornerMat = new THREE.MeshLambertMaterial({ color: 0x5b6676 });
  for (const g of cornerBlocks(C)) {
    const m = new THREE.Mesh(unitBox, cornerMat);
    m.scale.set(g.l / 1000, g.h / 1000, g.w / 1000);
    m.position.set((g.x + g.l / 2) / 1000, (g.z + g.h / 2) / 1000, (g.y + g.w / 2) / 1000);
    m.add(new THREE.LineSegments(unitEdges, edgeMat));
    m.name = 'corner'; group.add(m);
  }
  // Kiện hàng
  const mats = {};
  for (const b of c.boxes) {
    const col = project.items[b.t]?.color || R.items[b.t].color;
    const m = mats[b.t] ||= new THREE.MeshLambertMaterial({ color: col });
    const mesh = new THREE.Mesh(unitBox, m.clone());
    const pos = new THREE.Vector3((b.x + b.l / 2) / 1000, (b.z + b.h / 2) / 1000, (b.y + b.w / 2) / 1000);
    const g = 0.004; // khe hở hiển thị
    mesh.scale.set(Math.max(0.001, b.l / 1000 - g), Math.max(0.001, b.h / 1000 - g), Math.max(0.001, b.w / 1000 - g));
    mesh.position.copy(pos);
    const e = new THREE.LineSegments(unitEdges, edgeMat); mesh.add(e);
    mesh.userData = b;
    group.add(mesh); boxMeshes.push(mesh);
  }
  // Trọng tâm
  const st = contStats(c);
  if (st.cog) {
    const cog = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 14), new THREE.MeshBasicMaterial({ color: 0xd64545, depthTest: false }));
    cog.renderOrder = 10; cog.position.set(st.cog.x / 1000, st.cog.z / 1000, st.cog.y / 1000); cog.name = 'cog'; group.add(cog);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(st.cog.x / 1000, 0, st.cog.y / 1000), cog.position.clone()]),
      new THREE.LineDashedMaterial({ color: 0xd64545, dashSize: 0.05, gapSize: 0.04, depthTest: false }));
    line.computeLineDistances(); line.renderOrder = 10; line.name = 'cogline'; group.add(line);
  }
  // Thanh bước
  const sl = $('#step'); sl.max = c.boxes.length; sl.value = c.boxes.length;
  $('#stepBar').hidden = !c.boxes.length;
  renderStats(st);
  setStep(c.boxes.length);
  if (!buildScene.keepView) setView('iso');
}

function setView(v) {
  if (!result) return;
  const C = result.container, L = C.l / 1000, W = C.w / 1000, H = C.h / 1000;
  const ctr = new THREE.Vector3(L / 2, H / 2, W / 2), d = Math.max(L, W * 2, H * 2);
  const pos = { iso: [L * 1.15, H + d * 0.55, W + d * 0.75], top: [L / 2, d * 1.4, W / 2 + 0.001], side: [L / 2, H / 2, W + d * 1.1], back: [L + d * 0.9, H / 2, W / 2] }[v];
  camera.position.set(...pos); controls.target.copy(ctr); controls.update();
  document.querySelectorAll('.views [data-view]').forEach(b => b.classList.toggle('active', b.dataset.view === v));
}
document.querySelectorAll('.views [data-view]').forEach(b => b.onclick = () => setView(b.dataset.view));
$('#vWalls').onchange = e => { const w = group?.getObjectByName('walls'); if (w) w.visible = e.target.checked; };
$('#vLabels').onchange = () => setStep(+$('#step').value);

function renderStats(st) {
  const C = result.container;
  const cogX = st.cog ? st.cog.x / C.l * 100 : 0, cogY = st.cog ? st.cog.y / C.w * 100 : 0;
  const cogWarn = st.cog && (Math.abs(cogX - 50) > 15 || Math.abs(cogY - 50) > 10);
  $('#stats').hidden = false;
  $('#stats').innerHTML = `
    <div class="row"><b>Container #${current + 1}</b><span>${fmt(C.l)}×${fmt(C.w)}×${fmt(C.h)}</span></div>
    <div class="row"><span>Số kiện</span><b>${fmt(st.n)}</b></div>
    ${cogWarn ? '<div class="warn">⚠ Trọng tâm lệch nhiều khỏi giữa</div>' : ''}
    ${(() => { const n = result.containers[current].boxes.filter(b => b.bad).length; return n ? `<div class="warn">⚠ ${n} kiện đặt tạm sai vị trí (tô đỏ) — chọn kiện rồi xoay (R) / di chuyển (M)</div>` : ''; })()}`;
}

/* ---------- Trình tự xếp ---------- */
let playT = null;
function setStep(n) {
  const c = result?.containers[current]; if (!c) return;
  n = Math.max(0, Math.min(c.boxes.length, n));
  $('#step').value = n;
  labels.forEach(l => l.remove()); labels = [];
  const showLab = $('#vLabels').checked;
  boxMeshes.forEach(m => {
    const b = m.userData;
    m.visible = b.step <= n;
    m.material.emissive?.setHex(b.step === n && n < c.boxes.length ? 0x553300 : b.bad ? 0xaa0000 : 0x000000);
    if (showLab && m.visible) {
      const s = textSprite(String(b.step), 0.16, '#111'); s.position.set(0, 0.5, 0);
      s.scale.set(0.64 / m.scale.x, 0.16 / m.scale.y, 1); m.add(s); labels.push(s);
    }
  });
  if (manual.on && manual.multi.size) boxMeshes.forEach(m => { if (manual.multi.has(m.userData)) m.material.emissive.setHex(0x2a5fbf); });
  const b = c.boxes[n - 1];
  $('#stepInfo').textContent = n === 0 ? 'Container trống' : `Bước ${n}/${c.boxes.length}: ${result.items[b.t].name} — đặt ${b.l}×${b.w}×${b.h} tại X=${Math.round(b.x)} Y=${Math.round(b.y)} Z=${Math.round(b.z)}`;
}
$('#step').oninput = e => { stopPlay(); setStep(+e.target.value); };
$('#btnFirst').onclick = () => { stopPlay(); setStep(0); };
$('#btnLast').onclick = () => { stopPlay(); setStep(+$('#step').max); };
$('#btnPrev').onclick = () => { stopPlay(); setStep(+$('#step').value - 1); };
$('#btnNext').onclick = () => { stopPlay(); setStep(+$('#step').value + 1); };
function stopPlay() { clearInterval(playT); playT = null; $('#btnPlay').textContent = '▶'; }
$('#btnPlay').onclick = () => {
  if (playT) return stopPlay();
  const max = +$('#step').max;
  if (+$('#step').value >= max) setStep(0);
  $('#btnPlay').textContent = '⏸';
  const delay = Math.max(15, Math.min(250, 8000 / max));
  playT = setInterval(() => { const v = +$('#step').value + 1; setStep(v); if (v >= max) stopPlay(); }, delay);
};

/* ---------- Di chuột xem thông tin kiện ---------- */
const ray = new THREE.Raycaster(), mouse = new THREE.Vector2();
renderer.domElement.addEventListener('pointermove', e => {
  const tip = $('#tip'); if (!result || manual.pick || manual.gpick) return;
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  const hit = ray.intersectObjects(boxMeshes.filter(m => m.visible), false)[0];
  if (!hit) { tip.hidden = true; return; }
  const b = hit.object.userData, it = result.items[b.t];
  tip.innerHTML = `<b>#${b.step} · ${esc(it.name)}</b><br>Hướng đặt: ${b.l}×${b.w}×${b.h} mm · ${it.weight} kg<br>Vị trí: X ${Math.round(b.x)} · Y ${Math.round(b.y)} · Z ${Math.round(b.z)}${b.loadOn ? `<br>Tải đè lên: ${fmt(b.loadOn, 1)} kg` : ''}`;
  tip.hidden = false;
  tip.style.left = Math.min(r.width - tip.offsetWidth - 6, e.clientX - r.left + 14) + 'px';
  tip.style.top = (e.clientY - r.top + 14) + 'px';
});
renderer.domElement.addEventListener('pointerleave', () => $('#tip').hidden = true);

/* ================== Xuất Excel ================== */
$('#btnExport').onclick = () => {
  if (!result) return toast('Hãy bấm ⚡ Tính toán xếp hàng trước.');
  const R = result, wb = XLSX.utils.book_new();
  const sum = [['KẾ HOẠCH XẾP HÀNG', project.name || ''], ['Phương tiện', mixText(R)], [],
    ['Container', 'Loại', 'Kích thước trong (mm)', 'Số kiện', 'Thể tích (m³)', '% thể tích', 'Trọng lượng (kg)', '% tải', 'Chiều dài dùng (mm)', 'Trọng tâm X (%)', 'Trọng tâm Y (%)']];
  R.containers.forEach((c, i) => { const s = contStats(c), S = specOf(c); sum.push([`#${i + 1}`, S.name, `${S.l}×${S.w}×${S.h}`, s.n, +s.vol.toFixed(3), +s.volPct.toFixed(1), +s.kg.toFixed(1), +s.kgPct.toFixed(1), Math.round(s.len), s.cog ? +(s.cog.x / S.l * 100).toFixed(1) : '', s.cog ? +(s.cog.y / S.w * 100).toFixed(1) : '']); });
  sum.push([], ['Loại kiện', 'Kích thước (mm)', 'Kg/kiện', 'Tổng SL', ...R.containers.map((_, i) => `Cont #${i + 1}`), 'Chưa xếp']);
  R.items.forEach((it, t) => { if (!it.qty) return; sum.push([it.name, `${it.l}×${it.w}×${it.h}`, it.weight, it.qty, ...R.containers.map(c => c.boxes.filter(b => b.t === t).length), R.unplaced[t] || 0]); });
  const ws = XLSX.utils.aoa_to_sheet(sum); ws['!cols'] = [{ wch: 30 }, { wch: 18 }, ...Array(10).fill({ wch: 13 })];
  XLSX.utils.book_append_sheet(wb, ws, 'Tong hop');
  R.containers.forEach((c, i) => {
    const rows = [['Bước', 'Kiện', 'Dài đặt', 'Rộng đặt', 'Cao đặt', 'X (từ vách trong)', 'Y (từ vách trái)', 'Z (từ sàn)', 'Kg', 'Tải đè (kg)']];
    c.boxes.forEach(b => rows.push([b.step, R.items[b.t].name, b.l, b.w, b.h, Math.round(b.x), Math.round(b.y), Math.round(b.z), R.items[b.t].weight, +(b.loadOn || 0).toFixed(1)]));
    const s = XLSX.utils.aoa_to_sheet(rows); s['!cols'] = [{ wch: 6 }, { wch: 30 }, ...Array(8).fill({ wch: 12 })];
    XLSX.utils.book_append_sheet(wb, s, `Cont ${i + 1}`);
  });
  XLSX.writeFile(wb, `Ke-hoach-xep-hang_${new Date().toISOString().slice(0, 10)}.xlsx`);
};

/* ================== Báo cáo in / PDF ================== */
function snapshot(view) {
  setView(view); controls.update(); renderer.render(scene, camera);
  return renderer.domElement.toDataURL('image/png');
}
/** Hình 1 bước xếp cho PDF mẫu: kiện của bước đang xét tô màu, kiện xếp trước tô xám, kiện xếp sau ẩn.
 *  curSet / beforeSet là Set các kiện (đối tượng box). Trả về ảnh nhìn từ trước-phải và trước-trái. */
let stepViewCont = -1;
function stepViews(i, curSet, beforeSet) {
  if (stepViewCont !== i || current !== i) {
    current = i; buildScene.keepView = true; buildScene(); buildScene.keepView = false; stepViewCont = i;
    for (const n of ['cog', 'cogline']) { const o = group?.getObjectByName(n); if (o) o.visible = false; }
    group?.children.forEach(o => { if (o.type === 'GridHelper' || o instanceof THREE.GridHelper) o.visible = false; });
    boxMeshes.forEach(m => { m.userData0 = m.material.color.getHex(); });
  }
  boxMeshes.forEach(m => {
    const b = m.userData;
    m.material.emissive.setHex(0);
    if (curSet.has(b)) { m.visible = true; m.material.color.setHex(m.userData0); }
    else if (beforeSet.has(b)) { m.visible = true; m.material.color.setHex(0xd2d4d8); }
    else m.visible = false;
  });
  return { right: snapshotFit({ dir: [0.38, 0.42, 1] }, 700, 360), left: snapshotFit({ dir: [-0.38, 0.42, 1] }, 700, 360) };
}

/** Chụp hình với khung cố định w×h, căn vừa toàn bộ container (dùng cho PDF) */
function snapshotFit(view, w, h) {
  const C = result.container, L = C.l / 1000, W = C.w / 1000, H = C.h / 1000;
  const keepPos = camera.position.clone(), keepTgt = controls.target.clone(), keepAspect = camera.aspect;
  const vr = viewer.getBoundingClientRect();
  renderer.setPixelRatio(1); renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  const vf = THREE.MathUtils.degToRad(camera.fov) / 2, hf = Math.atan(Math.tan(vf) * camera.aspect);
  const fit = (spanH, spanV) => Math.max(spanH / 2 / Math.tan(hf), spanV / 2 / Math.tan(vf)) * 1.08;
  if (view === 'top') { const d = fit(L + 1.2, W); camera.position.set(L / 2, H + d, W / 2 + 0.0001); camera.lookAt(L / 2, H, W / 2); }
  else if (view === 'side') { const d = fit(L + 1.2, H); camera.position.set(L / 2, H / 2, W + d); camera.lookAt(L / 2, H / 2, W / 2); }
  else {
    // phối cảnh: chỉnh khoảng cách để 8 góc container nằm gọn trong khung (lặp vài lần)
    const dir = new THREE.Vector3(...((typeof view === 'object' && view.dir) || [0.55, 0.62, 0.95])).normalize(), ctr = new THREE.Vector3(L / 2, H / 2, W / 2);
    const corners = [];
    for (const x of [0, L]) for (const y of [0, H]) for (const z of [0, W]) corners.push(new THREE.Vector3(x, y, z));
    let d = fit(L, H);
    for (let k = 0; k < 4; k++) {
      camera.position.copy(ctr).addScaledVector(dir, d); camera.lookAt(ctr); camera.updateMatrixWorld();
      const ext = Math.max(...corners.map(c => { const p = c.clone().project(camera); return Math.max(Math.abs(p.x), Math.abs(p.y)); }));
      d *= ext / 0.94;
    }
    camera.position.copy(ctr).addScaledVector(dir, d); camera.lookAt(ctr);
  }
  renderer.render(scene, camera);
  const url = renderer.domElement.toDataURL('image/png');
  // khôi phục khung nhìn trên màn hình
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  camera.position.copy(keepPos); controls.target.copy(keepTgt); camera.aspect = keepAspect; camera.updateProjectionMatrix();
  renderer.setSize(vr.width, vr.height, false); controls.update();
  return url;
}

$('#btnPrint').onclick = async () => {
  if (!result) return toast('Hãy bấm ⚡ Tính toán xếp hàng trước.');
  cancelPick(); manual.sel = -1;
  const R = result, keep = current, walls = $('#vWalls').checked, labs = $('#vLabels').checked;
  $('#vWalls').checked = true; $('#vLabels').checked = false;
  let html = `<h1>KẾ HOẠCH XẾP HÀNG — ${esc(project.name || '')}</h1>
    <div>Ngày lập: ${new Date().toLocaleDateString('vi-VN')} · Phương tiện: <b>${esc(mixText(R))}</b></div>
    <h2>Tổng hợp</h2><table><tr><th>Loại kiện</th><th>Kích thước (mm)</th><th>Kg/kiện</th><th>Tổng SL</th>${R.containers.map((_, i) => `<th>Cont #${i + 1}</th>`).join('')}<th>Chưa xếp</th></tr>
    ${R.items.map((it, t) => it.qty ? `<tr><td><span class="sw" style="background:${project.items[t]?.color || it.color}"></span>${esc(it.name)}</td><td>${it.l}×${it.w}×${it.h}</td><td class="r">${it.weight}</td><td class="r">${it.qty}</td>${R.containers.map(c => `<td class="r">${c.boxes.filter(b => b.t === t).length || ''}</td>`).join('')}<td class="r">${R.unplaced[t] || ''}</td></tr>` : '').join('')}</table>`;
  buildScene.keepView = true;
  for (let i = 0; i < R.containers.length; i++) {
    current = i; buildScene();
    const s = contStats(R.containers[i]);
    const img1 = snapshot('iso'), img2 = snapshot('top');
    // Gom các bước liên tiếp cùng loại thành 1 dòng
    const groups = [];
    for (const b of R.containers[i].boxes) {
      const g = groups[groups.length - 1];
      if (g && g.t === b.t && g.dim === `${b.l}×${b.w}×${b.h}`) { g.to = b.step; g.n++; } else groups.push({ t: b.t, from: b.step, to: b.step, n: 1, dim: `${b.l}×${b.w}×${b.h}`, x: b.x, z: b.z });
    }
    const S = specOf(R.containers[i]);
    html += `<div class="cont"><h2>Container #${i + 1} (${esc(S.name)} ${S.l}×${S.w}×${S.h}) — ${fmt(s.n)} kiện · ${fmt(s.vol, 2)} m³ (${fmt(s.volPct, 1)}%) · ${fmt(s.kg)} kg${S.kg ? ` (${fmt(s.kgPct, 1)}%)` : ''}${s.cog ? ` · trọng tâm ${fmt(s.cog.x / S.l * 100)}% dài / ${fmt(s.cog.y / S.w * 100)}% rộng` : ''}</h2>
      <div class="imgs"><img src="${img1}"><img src="${img2}"></div>
      <table><tr><th>Bước</th><th>Kiện</th><th>SL</th><th>Hướng đặt D×R×C (mm)</th><th>Bắt đầu tại X (mm)</th><th>Tầng Z (mm)</th></tr>
      ${groups.map(g => `<tr><td>${g.from}${g.to > g.from ? '–' + g.to : ''}</td><td><span class="sw" style="background:${project.items[g.t]?.color || R.items[g.t].color}"></span>${esc(R.items[g.t].name)}</td><td class="r">${g.n}</td><td>${g.dim}</td><td class="r">${Math.round(g.x)}</td><td class="r">${Math.round(g.z)}</td></tr>`).join('')}</table></div>`;
  }
  buildScene.keepView = false;
  $('#report').innerHTML = html;
  $('#vWalls').checked = walls; $('#vLabels').checked = labs;
  current = keep; showResult();
  setTimeout(() => window.print(), 300);
};

/* ================== Xuất PDF ================== */
$('#btnPdf').onclick = () => {
  if (!result) return toast('Hãy bấm ⚡ Tính toán xếp hàng (hoặc xếp tay) trước.');
  $('#pAllN').textContent = `(${result.containers.length} container)`;
  $('#pCurN').textContent = `(#${current + 1})`;
  // ô Report mặc định = tên dự án (cập nhật theo tên dự án nếu người dùng chưa tự sửa)
  const rp = $('#pReport');
  if (!rp.value || rp.value === rp.dataset.auto) { rp.value = project.name || ''; rp.dataset.auto = rp.value; }
  const tpl = () => { const std = document.querySelector('input[name=pTpl]:checked').value === 'std'; $('#pStdOpts').hidden = !std; $('#pDetailOpts').hidden = std; };
  document.querySelectorAll('input[name=pTpl]').forEach(r => { r.onchange = tpl; }); tpl();
  $('#pdfDlg').showModal();
};
$('#pCancel').onclick = () => $('#pdfDlg').close();
$('#pGo').onclick = async e => {
  e.preventDefault();
  $('#pdfDlg').close();
  const opts = {
    overview: $('#pOverview').checked, steps: $('#pSteps').checked, levels: $('#pLevels').checked, sections: $('#pSections').checked,
    levelMode: $('#pLevelMode').value, secMode: $('#pSecMode').value,
    template: document.querySelector('input[name=pTpl]:checked').value, report: $('#pReport').value.trim(), ref: $('#pRef').value.trim(),
    containers: document.querySelector('input[name=pWhich]:checked').value === 'cur' ? [current] : result.containers.map((_, i) => i),
  };
  cancelPick(); manual.sel = -1;
  const keep = current, walls = $('#vWalls').checked, labs = $('#vLabels').checked;
  $('#vWalls').checked = true; $('#vLabels').checked = false;
  const busy = $('#busy'); busy.hidden = false;
  const setMsg = m => { busy.lastChild.textContent = m; };
  try {
    const n = await exportPdf({
      result, project, contStats, colorOf, esc, fmt, specOf, mixText: () => mixText(),
      views: i => { stepViewCont = -1; current = i; buildScene.keepView = true; buildScene(); buildScene.keepView = false; return { iso: snapshotFit('iso', 1700, 600), top: snapshotFit('top', 1700, 340), side: snapshotFit('side', 1700, 340) }; },
      stepViews,
    }, opts, setMsg);
    stepViewCont = -1;
    toast(`Đã xuất PDF ${n} trang.`, 4000);
  } catch (e) { console.error(e); toast('Lỗi xuất PDF: ' + e.message, 6000); }
  finally {
    busy.hidden = true; setMsg('Đang tính toán…'); stepViewCont = -1;
    $('#vWalls').checked = walls; $('#vLabels').checked = labs;
    current = keep; buildScene.keepView = false; showResult();
  }
};

/* ================== XẾP TAY (thủ công) ================== */
const SNAP = 80; // mm — hít vào vách / cạnh kiện khác
const floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const curC = () => result?.containers[current];
const minSup = () => (project.opt.support || 75) / 100;
const colorOf = t => project.items[t]?.color || result.items[t].color;
let ghost = null, lastMove = null, downAt = null;

function remainingByType() {
  const placed = {};
  result.containers.forEach(c => c.boxes.forEach(b => { placed[b.t] = (placed[b.t] || 0) + 1; }));
  return result.items.map((it, t) => (it.qty || 0) - (placed[t] || 0));
}
const withUnits = boxes => computeLoads(boxes.map(b => ({ ...b, unit: result.items[b.t] })));
const overlapXY = (a, b) => a.x < b.x + b.l - 1 && b.x < a.x + a.l - 1 && a.y < b.y + b.w - 1 && b.y < a.y + a.w - 1;
const hasOnTop = (boxes, i) => boxes.some((o, j) => j !== i && Math.abs(o.z - (boxes[i].z + boxes[i].h)) < 1 && overlapXY(o, boxes[i]));

/* ---- Hoàn tác ---- */
const snap = () => JSON.stringify({ containers: result.containers, current });
function pushUndo() { if (!result) return; manual.undo.push(snap()); if (manual.undo.length > 100) manual.undo.shift(); manual.redo = []; }
function restore(s) { const o = JSON.parse(s); result.containers = o.containers; current = Math.min(o.current, o.containers.length - 1); manual.sel = -1; cancelPick(false); afterEdit(); }
function undo() { if (!manual.undo.length) return toast('Không còn thao tác để hoàn tác'); manual.redo.push(snap()); restore(manual.undo.pop()); }
function redo() { if (!manual.redo.length) return; manual.undo.push(snap()); restore(manual.redo.pop()); }

/** Tính lại số bước, tải đè, kiện chưa xếp rồi vẽ lại */
function refresh() {
  const rem = remainingByType();
  result.unplaced = {}; rem.forEach((n, t) => { if (n > 0) result.unplaced[t] = n; });
  result.totalUnits = result.items.reduce((s, it) => s + (it.qty || 0), 0);
  result.containers.forEach(c => {
    const wb = withUnits(c.boxes);
    c.boxes.forEach((b, i) => { b.step = i + 1; b.loadOn = wb[i].loadOn; });
    // Đánh dấu kiện đặt tạm sai vị trí (vượt cont, chồng lấn, thiếu đỡ, quá tải kiện dưới)
    c.boxes.forEach((b, i) => {
      const others = wb.filter((_, j) => j !== i);
      const it = result.items[b.t];
      b.bad = (it?.pallet && b.z > 1 ? canPlace(b, { ...it, weight: 0 }, others, specOf(c), 0) : canPlace(b, { ...it, weight: 0 }, others, specOf(c), minSup())) || null;
    });
  });
  buildScene.keepView = true; showResult(); buildScene.keepView = false;
}
function afterEdit() { manualDirty = true; refresh(); savePlan(); if (!manual.pick && manual.sugCtx) clearSugs(); }
/** Lưu phương án xếp hiện tại vào dự án (trình duyệt + file .json khi bấm Lưu) */
function savePlan() {
  project.plan = result ? { strategy: result.strategy, containers: result.containers.map(c => ({ spec: { ...specOf(c), maxWeight: null }, boxes: c.boxes.map(({ x, y, z, l, w, h, t, step, pal }) => ({ x, y, z, l, w, h, t, step, ...(pal ? { pal } : {}) })) })),
    items: result.items, palInfo: result.palInfo || null, looseCount: result.looseCount ?? null, base: { ...result.base, maxWeight: null }, manualDirty } : null;
  save();
}

function toggleManual(on = !manual.on) {
  if (on && !result) {
    const items = normItems();
    if (!items.some(it => it.qty > 0)) return toast('Hãy nhập danh sách kiện trước.');
    result = wrapResult({ strategy: 'Xếp tay', containers: [{ boxes: [] }], unplaced: {}, totalUnits: 0, items, base: contInfo(), ms: 0 });
    current = 0;
  } else if (on) {
    // lấy số lượng / thuộc tính mới nhất từ bảng kiện (giữ nguyên thứ tự loại)
    const items = normItems();
    const maxT = Math.max(-1, ...result.containers.flatMap(c => c.boxes.map(b => b.t)));
    if (items.length > maxT) result.items = items;
  }
  manual.on = on; manual.sel = -1; cancelPick(false);
  $('#btnManual').classList.toggle('active', on);
  $('#manual').hidden = !on;
  if (result) refresh();
  if (on) toast('Chế độ xếp tay: chọn loại kiện ở khung bên phải rồi click vào cont để đặt.', 4000);
}
$('#btnManual').onclick = () => toggleManual();

function renderManual() {
  if (!manual.on || !result) return;
  const rem = remainingByType();
  $('#mCont').textContent = `Cont #${current + 1}/${result.containers.length}`;
  $('#mList').innerHTML = result.items.map((it, t) => it.qty ? `
    <div class="m-item ${manual.pick && !manual.pick.from && manual.pick.t === t ? 'on' : ''} ${rem[t] <= 0 ? 'zero' : ''}" data-t="${t}" title="Bấm để lấy kiện này đặt vào cont">
      <i style="background:${colorOf(t)}"></i>
      <div class="nm" title="${esc(it.name)}">${esc(it.name)}<small>${it.l}×${it.w}×${it.h} · ${it.weight} kg · ${ROT_LABEL[it.rotate] || ''}</small></div>
      <span class="m-cnt" title="Còn chưa xếp / tổng số lượng"><small>còn</small><b>${rem[t]}</b><small>/ ${it.qty}</small></span>
      <span class="m-pm">
        <button class="small" data-pm="-" title="Bỏ 1 kiện loại này khỏi cont đang xem (Shift: 10 kiện)">－</button>
        <button class="small" data-pm="+" title="Đặt thêm 1 kiện vào chỗ trống tốt nhất của cont đang xem (Shift: 10 kiện)" ${rem[t] <= 0 ? 'disabled' : ''}>＋</button>
      </span>
    </div>` : '').join('');
  const c = curC(), b = c?.boxes[manual.sel], many = selList();
  const clip = manual.clip ? `<div class="m-clip">📋 Đang copy ${manual.clip.boxes.length} kiện — <b>Ctrl+V</b> để dán${manual.gpick ? ' (đang dán: click để đặt, R xoay nhóm, Esc thôi)' : ''}</div>` : '';
  $('#mSel').hidden = !b && many.length < 2 && !clip;
  if (many.length >= 2) {
    const cnt = {}; many.forEach(x => { cnt[x.t] = (cnt[x.t] || 0) + 1; });
    $('#mSel').innerHTML = `<b>Đang chọn ${many.length} kiện</b><br><small>${Object.entries(cnt).map(([t, n]) => `${esc(result.items[t].name)}: ${n}`).join(' · ')}</small>
      <div class="row"><button class="small" data-a="copy" title="Ctrl+C">⧉ Copy</button><button class="small" data-a="cut" title="Ctrl+X — nhấc cả nhóm để đặt chỗ khác">✥ Di chuyển</button><button class="small" data-a="del" title="Delete">✕ Xoá</button><button class="small" data-a="none" title="Esc">Bỏ chọn</button></div>${clip}`;
  } else if (b) $('#mSel').innerHTML = `<b>Đang chọn: #${b.step} ${esc(result.items[b.t].name)}</b><br>${b.l}×${b.w}×${b.h} mm tại X ${Math.round(b.x)} · Y ${Math.round(b.y)} · Z ${Math.round(b.z)}
    <div class="row"><button class="small" data-a="move">✥ Di chuyển (M)</button><button class="small" data-a="rot">⟳ Xoay (R)</button><button class="small" data-a="copy" title="Ctrl+C">⧉ Copy</button><button class="small" data-a="del">✕ Xoá</button></div>${clip}`;
  else $('#mSel').innerHTML = clip;
  $('#mUndo').disabled = !manual.undo.length; $('#mRedo').disabled = !manual.redo.length;
  const nSel = selList().length;
  $('#mSelAll').disabled = !c?.boxes.length;
  $('#mCopy').disabled = $('#mCut').disabled = !nSel;
  $('#mPaste').disabled = !manual.clip;
  $('#mCopy').textContent = nSel ? `⧉ Copy (${nSel})` : '⧉ Copy';
  $('#mPaste').classList.toggle('active', !!manual.gpick);
}
$('#mSelAll').onclick = () => { cancelPick(false); manual.setMulti(new Set(curC()?.boxes || [])); setStep(+$('#step').value); renderManual(); };
$('#mCopy').onclick = () => copySel(false);
$('#mCut').onclick = () => copySel(true);
$('#mPaste').onclick = () => { if (manual.gpick) { const fc = manual.gpick.fromCut; cancelPaste(); if (fc) { manual.clip = null; undo(); } renderManual(); } else startPaste(false); };
$('#mList').onclick = async e => {
  const el = e.target.closest('.m-item'); if (!el) return;
  const t = +el.dataset.t;
  const pm = e.target.closest('button[data-pm]');
  if (pm) {
    const n = e.shiftKey ? 10 : 1, name = result.items[t].name;
    try {
      if (pm.dataset.pm === '+') {
        const r = await runChatTool('dat_kien', { loai: t + 1, container: current + 1, so_luong: n });
        toast(r.da_dat ? `＋ Đã đặt ${r.da_dat} kiện ${name} vào cont #${current + 1}${r.ly_do_dung ? ' — ' + r.ly_do_dung : ''}` : `⚠ ${r.ly_do_dung}`);
      } else {
        if (!curC()?.boxes.some(b => b.t === t)) return toast(`Cont #${current + 1} không có kiện ${name}.`);
        const r = await runChatTool('bo_kien', { container: current + 1, loai: t + 1, so_luong: n });
        toast(r.da_bo ? `－ Đã bỏ ${r.da_bo} kiện ${name} khỏi cont #${current + 1}` : '⚠ Các kiện loại này đang bị kiện khác đè lên, chưa bỏ được.');
      }
    } catch (err) { toast('⚠ ' + err.message); }
    return;
  }
  if (manual.pick && !manual.pick.from && manual.pick.t === t) return; // đang cầm sẵn loại này — giữ nguyên (Esc để huỷ)
  if (remainingByType()[t] <= 0) return toast('Loại kiện này đã xếp hết.');
  startPick(t);
};
$('#mSel').onclick = e => {
  const a = e.target.dataset.a;
  if (a === 'move') moveSel(); else if (a === 'rot') rotateAction(); else if (a === 'del') deleteSel();
  else if (a === 'copy') copySel(false); else if (a === 'cut') copySel(true);
  else if (a === 'none') { manual.sel = -1; setStep(+$('#step').value); renderManual(); }
};
$('#mUndo').onclick = undo;
$('#mRedo').onclick = redo;
/** Thêm 1 container trống. spec bỏ trống = cùng loại với container đang xem */
function addContainer(spec) {
  if (!result) return;
  spec = { ...(spec || specOf(curC()) || result.base) };
  pushUndo(); result.containers.push({ boxes: [], spec }); current = result.containers.length - 1; manual.sel = -1; cancelPick(false); afterEdit();
  toast(`Đã thêm container #${current + 1}: ${spec.name} (trống).`);
}
/** Menu chọn loại cont khi bấm "＋ Cont" */
function showAddMenu(anchor) {
  document.querySelector('.add-menu')?.remove();
  const specs = []; const seen = new Set();
  for (const r of fleetRows()) { const k = `${r.spec.l}x${r.spec.w}x${r.spec.h}`; if (!seen.has(k)) { seen.add(k); specs.push(r.spec); } }
  for (const [k, p] of PRESETS.entries()) if (p.l && !seen.has(`${p.l}x${p.w}x${p.h}`)) specs.push(specOfRow({ preset: p.id, l: p.l, w: p.w, h: p.h, kg: p.kg }, 'p' + k));
  const m = document.createElement('div'); m.className = 'add-menu';
  m.innerHTML = '<div class="am-h">Thêm container loại:</div>' + specs.map((s, i) => `<button data-i="${i}">${esc(s.name)} <small>${s.l}×${s.w}×${s.h}</small></button>`).join('');
  document.body.appendChild(m);
  const r = anchor.getBoundingClientRect();
  m.style.left = Math.min(innerWidth - m.offsetWidth - 8, r.left) + 'px'; m.style.top = r.bottom + 4 + 'px';
  m.onclick = e => { const b = e.target.closest('button'); if (!b) return; m.remove(); addContainer(specs[+b.dataset.i]); };
  setTimeout(() => document.addEventListener('pointerdown', function off(e) { if (!m.contains(e.target)) { m.remove(); document.removeEventListener('pointerdown', off); } }), 0);
}
function deleteContainer(i) {
  const c = result?.containers[i]; if (!c) return;
  if (c.boxes.length && !confirm(`Xoá container #${i + 1} cùng ${c.boxes.length} kiện bên trong?\n(Các kiện này sẽ trở về danh sách "chưa xếp". Có thể hoàn tác bằng Ctrl+Z.)`)) return;
  pushUndo(); result.containers.splice(i, 1);
  if (!result.containers.length) result.containers.push({ boxes: [], spec: { ...c.spec } });
  if (current > i || current >= result.containers.length) current = Math.max(0, current - 1);
  manual.sel = -1; cancelPick(false); afterEdit();
  toast(`Đã xoá container #${i + 1}.`);
}
/** Xoá tất cả container: còn lại 1 container trống (loại dòng 1 trong danh sách) để xếp lại */
function deleteAllContainers() {
  if (!result) return;
  const n = result.containers.length, k = result.containers.reduce((s, c) => s + c.boxes.length, 0);
  if (!confirm(`Xoá tất cả ${n} container cùng ${k} kiện đã xếp?\nCác kiện trở về danh sách "chưa xếp". Có thể hoàn tác bằng Ctrl+Z.`)) return;
  pushUndo();
  result.containers = [{ boxes: [], spec: { ...contInfo() } }];
  current = 0; manual.sel = -1; cancelPick(false); afterEdit();
  toast(`Đã xoá ${n} container. Bấm ⚡ Tính toán hoặc Xếp tay để xếp lại.`, 4000);
}
function deleteEmptyContainers() {
  if (!result) return;
  const keep = result.containers.filter(c => c.boxes.length);
  const n = result.containers.length - keep.length;
  if (!n) return toast('Không có container trống.');
  pushUndo();
  result.containers = keep.length ? keep : [result.containers[0]];
  current = Math.min(current, result.containers.length - 1); manual.sel = -1; cancelPick(false); afterEdit();
  toast(`Đã xoá ${n} container trống.`);
}
$('#mAddC').onclick = e => showAddMenu(e.currentTarget);
$('#mDelC').onclick = () => deleteContainer(current);
$('#mClear').onclick = () => {
  const c = curC(); if (!c?.boxes.length) return;
  if (!confirm(`Bỏ hết ${c.boxes.length} kiện trong container #${current + 1}?`)) return;
  pushUndo(); c.boxes = []; manual.sel = -1; cancelPick(false); afterEdit();
};
$('#mSeq').onclick = () => {
  const c = curC(); if (!c?.boxes.length) return;
  pushUndo(); c.boxes = resequence(c.boxes); manual.sel = -1; afterEdit(); toast('Đã sắp lại trình tự: từ trong ra cửa, từ dưới lên.');
};
$('#mAuto').onclick = () => {
  if (!remainingByType().some(n => n > 0)) return toast('Đã xếp hết kiện, không còn gì để tự xếp.');
  cancelPick(); runPlan(true);
};

/** Trình tự xếp hợp lý: kiện chỉ được xếp sau các kiện đỡ nó; ưu tiên trong cùng (X nhỏ), thấp, bên trái */
function resequence(boxes) {
  const sup = boxes.map(b => boxes.filter(o => o !== b && Math.abs(o.z + o.h - b.z) < 1 && overlapXY(o, b)));
  const done = new Set(), out = [];
  while (out.length < boxes.length) {
    let best = -1;
    boxes.forEach((b, i) => {
      if (done.has(b) || !sup[i].every(s => done.has(s))) return;
      const k = boxes[best];
      if (best < 0 || b.x - k.x < -1 || (Math.abs(b.x - k.x) <= 1 && (b.z - k.z < -1 || (Math.abs(b.z - k.z) <= 1 && b.y < k.y)))) best = i;
    });
    if (best < 0) { boxes.forEach(b => { if (!done.has(b)) { done.add(b); out.push(b); } }); break; }
    done.add(boxes[best]); out.push(boxes[best]);
  }
  return out;
}

/* ---- Cầm kiện (bóng mờ) ---- */
function startPick(t, from = null, oiInit = 0) {
  cancelPick(false); cancelPaste();
  const it = result.items[t], oris = orientations(it);
  let oi = Math.min(oiInit, oris.length - 1);
  if (from) { const b = curC().boxes[from.idx]; oi = Math.max(0, oris.findIndex(o => o[0] === b.l && o[1] === b.w && o[2] === b.h)); }
  manual.pick = { t, oris, oi, from, pos: null, reason: 'Rê chuột vào container' };
  const mat = new THREE.MeshLambertMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.55, depthWrite: false });
  ghost = new THREE.Mesh(unitBox, mat);
  ghost.add(new THREE.LineSegments(unitEdges, new THREE.LineBasicMaterial({ color: 0x111111 })));
  ghost.visible = false; ghost.renderOrder = 5; scene.add(ghost);
  if (from && boxMeshes[from.idx]) boxMeshes[from.idx].visible = false;
  renderer.domElement.style.cursor = 'crosshair';
  $('#mLock').checked = false;
  renderManual();
  syncPosPanel();
  showSugs();
  if (lastMove) updateGhost(lastMove);
}
function cancelPick(rerender = true, keepPaste = false) {
  const p = manual.pick;
  manual.pick = null;
  if (!keepPaste) cancelPaste();
  if (ghost) { scene.remove(ghost); ghost.material.dispose(); ghost = null; }
  renderer.domElement.style.cursor = '';
  $('#tip').hidden = true;
  if (p?.from && boxMeshes[p.from.idx]) boxMeshes[p.from.idx].visible = true;
  if (p) clearSugs();
  if (manual.gpick) updateAnchors(); else clearAnchors();
  syncPosPanel();
  if (rerender) renderManual();
}
function setRay(e) {
  const r = renderer.domElement.getBoundingClientRect();
  mouse.set((e.clientX - r.left) / r.width * 2 - 1, -(e.clientY - r.top) / r.height * 2 + 1);
  ray.setFromCamera(mouse, camera);
  return r;
}
function snap1(v, size, lines) {
  let best = v, bd = SNAP;
  for (const ln of lines) {
    const d1 = Math.abs(v - ln); if (d1 < bd) { bd = d1; best = ln; }
    const d2 = Math.abs(v + size - ln); if (d2 < bd) { bd = d2; best = ln - size; }
  }
  return best;
}
function updateGhost(e) {
  const p = manual.pick; if (!p || !ghost) return;
  if ($('#mLock').checked) return; // vị trí đang khoá — không chạy theo chuột
  const C = result.container, c = curC();
  const [l, w, h] = p.oris[p.oi];
  const r = setRay(e);
  const meshes = boxMeshes.filter((m, i) => m.visible && !(p.from && i === p.from.idx));
  const hit = ray.intersectObjects(meshes, false)[0];
  let px, py;
  if (hit) {
    const n = hit.face.normal;
    if (n.y > 0.5) { px = hit.point.x * 1000; py = hit.point.z * 1000; }
    else { px = hit.point.x * 1000 + n.x * l / 2; py = hit.point.z * 1000 + n.z * w / 2; }
  } else {
    const v = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, v)) { ghost.visible = false; return; }
    px = v.x * 1000; py = v.z * 1000;
  }
  const others = othersOf(p);
  const x = snap1(px - l / 2, l, [0, C.l, ...others.flatMap(b => [b.x, b.x + b.l])]);
  const y = snap1(py - w / 2, w, [0, C.w, ...others.flatMap(b => [b.y, b.y + b.w])]);
  setGhostAt(x, y);
  const it = result.items[p.t], tip = $('#tip');
  tip.innerHTML = `<b>${esc(it.name)}</b> · ${l}×${w}×${h}<br>X ${Math.round(p.pos.x)} · Y ${Math.round(p.pos.y)} · Z ${Math.round(p.pos.z)}<br>${p.reason ? '⛔ ' + esc(p.reason) + '<br><small>Vẫn click được để đặt tạm, rồi xoay (R) cho vừa</small>' : '✔ Click để đặt · R để xoay'}`;
  tip.hidden = false;
  tip.style.left = Math.min(r.width - tip.offsetWidth - 6, e.clientX - r.left + 16) + 'px';
  tip.style.top = (e.clientY - r.top + 16) + 'px';
}
const othersOf = p => curC().boxes.filter((_, i) => !(p.from && i === p.from.idx));

/** Kiểm tra 1 vị trí (x, y) cho kiện đang cầm, z tự rơi xuống mặt đỡ cao nhất */
function evalAt(p, x, y, others, othersU, oi = p.oi) {
  const C = result.container, [l, w, h] = p.oris[oi];
  x = Math.max(0, Math.min(C.l - l, Math.round(x))); y = Math.max(0, Math.min(C.w - w, Math.round(y)));
  const cand = { x, y, l, w, h, z: 0 };
  for (const b of others) if (overlapXY(cand, b)) cand.z = Math.max(cand.z, b.z + b.h);
  const it = result.items[p.t];
  let reason = canPlace(cand, it, othersU, C, minSup());
  const kg = others.reduce((s, b) => s + result.items[b.t].weight, 0);
  if (!reason && C.kg && kg + it.weight > C.kg) reason = 'Vượt tải trọng container';
  if (!reason && !p.from && remainingByType()[p.t] <= 0) reason = 'Loại kiện này đã xếp hết';
  return { cand, reason };
}

/** Đặt khối mờ tại (x, y) và cập nhật khung Vị trí đặt */
function setGhostAt(x, y) {
  const p = manual.pick; if (!p || !ghost) return;
  const others = othersOf(p);
  const { cand, reason } = evalAt(p, x, y, others, withUnits(others));
  p.pos = cand; p.reason = reason;
  ghost.visible = true;
  ghost.scale.set(cand.l / 1000, cand.h / 1000, cand.w / 1000);
  ghost.position.set((cand.x + cand.l / 2) / 1000, (cand.z + cand.h / 2) / 1000, (cand.y + cand.w / 2) / 1000);
  ghost.material.color.setHex(reason ? 0xff4d4d : 0x3ddc84);
  syncPosPanel();
}

/** Khung "Vị trí đặt" */
function syncPosPanel() {
  const p = manual.pick;
  $('#mPos').hidden = !p;
  if (!p) return;
  $('#mPosName').textContent = result.items[p.t].name + (p.from ? ' (đang di chuyển)' : '');
  const sel = $('#mOri');
  const opts = p.oris.map((o, i) => `<option value="${i}">${o[0]} × ${o[1]} × ${o[2]}${o[2] === result.items[p.t].h ? '' : ' (lật nghiêng)'}</option>`).join('');
  if (sel.dataset.k !== opts) { sel.innerHTML = opts; sel.dataset.k = opts; }
  sel.value = p.oi;
  const pos = p.pos;
  if (document.activeElement !== $('#mX')) $('#mX').value = pos ? pos.x : '';
  if (document.activeElement !== $('#mY')) $('#mY').value = pos ? pos.y : '';
  $('#mZ').value = pos ? pos.z : '';
  const msg = $('#mPosMsg');
  msg.className = 'm-pos-msg ' + (!pos ? '' : p.reason ? 'bad' : 'ok');
  msg.textContent = !pos ? 'Rê chuột vào cont, nhập X/Y hoặc bấm 📍 Gợi ý vị trí' : p.reason ? '⛔ ' + p.reason + ' — vẫn đặt tạm được rồi xoay (R) cho vừa' : '✔ Đặt được — click vào cont hoặc bấm Đặt';
  $('#mPlace').disabled = !pos || p.reason === 'Loại kiện này đã xếp hết';
  $('#mPlace').textContent = p.reason ? '⚠ Đặt tạm (Enter)' : '✔ Đặt (Enter)';
}
function posFromInputs() {
  const p = manual.pick; if (!p) return;
  $('#mLock').checked = true;
  setGhostAt(+$('#mX').value || 0, +$('#mY').value || 0);
}
$('#mX').addEventListener('input', posFromInputs);
$('#mY').addEventListener('input', posFromInputs);
$('#mOri').onchange = e => { const p = manual.pick; if (!p) return; p.oi = +e.target.value; if (p.pos) setGhostAt(p.pos.x, p.pos.y); else syncPosPanel(); showSugs(); };
$('#mLock').onchange = () => { if (!$('#mLock').checked && lastMove) updateGhost(lastMove); };
function nudge(dir) {
  const p = manual.pick; if (!p) return;
  const [l, w] = p.oris[p.oi];
  const s = $('#mStep').value, ax = dir[0], sg = dir[1] === '+' ? 1 : -1;
  const step = s === 'k' ? (ax === 'x' ? l : w) : +s;
  const pos = p.pos || { x: 0, y: 0 };
  $('#mLock').checked = true;
  setGhostAt(pos.x + (ax === 'x' ? sg * step : 0), pos.y + (ax === 'y' ? sg * step : 0));
}
document.querySelector('.m-nudge').addEventListener('click', e => { const n = e.target.dataset.n; if (n) nudge(n); });
$('#mPlace').onclick = () => placeGhost(null);
$('#mSuggest').onclick = () => suggestPos();

/* ---- Gợi ý kiện tiếp theo (khung cam đánh số): ĐÃ BỎ theo yêu cầu — chỉ còn ký hiệu ＋ trên kiện ---- */
const sugGroup = new THREE.Group(); scene.add(sugGroup);
manual.sugs = []; manual.sugCtx = null;
function clearSugs() { sugGroup.clear(); manual.sugs = []; manual.sugCtx = null; }
/** Cập nhật ký hiệu ＋ cho kiện đang cầm (tên giữ nguyên vì được gọi ở nhiều chỗ) */
function showSugs() { clearSugs(); updateAnchors(); }
function ctxOfSel() { return null; }
function placeAtSug() {}

/* ---- Ký hiệu ＋ trên từng kiện: bấm để đặt kiện đang cầm ngay sát mặt đó ---- */
const anchorGroup = new THREE.Group(); scene.add(anchorGroup);
const ANC_FACES = { top: 'trên', px: 'phía cửa', py: 'bên phải', ny: 'bên trái' };
function anchorTex(bg) {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d');
  g.beginPath(); g.arc(32, 32, 28, 0, Math.PI * 2); g.fillStyle = bg; g.fill();
  g.lineWidth = 4; g.strokeStyle = '#fff'; g.stroke();
  g.fillStyle = '#fff'; g.fillRect(18, 28, 28, 8); g.fillRect(28, 18, 8, 28);
  return new THREE.CanvasTexture(c);
}
const ancMat = new THREE.SpriteMaterial({ map: anchorTex('#1e88e5'), depthWrite: false });
const ancMatHot = new THREE.SpriteMaterial({ map: anchorTex('#ff6d00'), depthWrite: false });
let ancHot = null;
function clearAnchors() { anchorGroup.clear(); ancHot = null; }
/** Tạo ký hiệu ＋ ở các mặt còn trống (đặt được) của mỗi kiện, theo hướng kiện đang cầm */
function updateAnchors() {
  clearAnchors();
  const p = manual.pick, g = manual.gpick, c = curC();
  if ((!p && !g) || !manual.on || !c || !$('#mAncOn').checked) return;
  let w, test;
  if (g) {
    // đang dán nhóm kiện: thử đặt góc trong-trái-dưới của cả nhóm tại vị trí đó
    w = groupExt(g.rel).W; g.cache = null;
    test = (x, y) => { const r = evalGroup(x, y); return { cand: { x: r.X, y: r.Y, z: r.Z }, reason: r.reason }; };
  } else {
    if (!p.from && remainingByType()[p.t] <= 0) return;
    w = p.oris[p.oi][1];
    const others = othersOf(p), othersU = withUnits(others);
    test = (x, y) => evalAt(p, x, y, others, othersU);
  }
  const seen = new Set();
  const S = 0.2, off = 0.07;
  c.boxes.forEach((b, i) => {
    if (p?.from && i === p.from.idx) return;
    const tries = [
      ['top', b.x, b.y, b.z + b.h, [b.x + b.l / 2, b.z + b.h, b.y + b.w / 2], [0, off, 0]],
      ['px', b.x + b.l, b.y, b.z, [b.x + b.l, b.z + b.h / 2, b.y + b.w / 2], [off, 0, 0]],
      ['py', b.x, b.y + b.w, b.z, [b.x + b.l / 2, b.z + b.h / 2, b.y + b.w], [0, 0, off]],
      ['ny', b.x, b.y - w, b.z, [b.x + b.l / 2, b.z + b.h / 2, b.y], [0, 0, -off]],
    ];
    for (const [face, x, y, z, at, d] of tries) {
      const { cand, reason } = test(x, y);
      if (reason || cand.x !== Math.round(x) || cand.y !== Math.round(y) || Math.abs(cand.z - z) > 1) continue;
      const k = `${cand.x}|${cand.y}|${cand.z}`; if (seen.has(k)) continue; seen.add(k);
      const s = new THREE.Sprite(ancMat);
      s.scale.set(S, S, 1); s.renderOrder = 12;
      s.position.set(at[0] / 1000 + d[0], at[1] / 1000 + d[1], at[2] / 1000 + d[2]);
      s.userData.anc = { x: cand.x, y: cand.y, z: cand.z, face, box: i };
      anchorGroup.add(s);
    }
  });
}
function anchorHit(e) {
  if (!anchorGroup.children.length) return null;
  setRay(e);
  return ray.intersectObjects(anchorGroup.children, false)[0]?.object || null;
}
function setAncHot(s) {
  if (ancHot === s) return;
  if (ancHot) { ancHot.material = ancMat; ancHot.scale.set(0.2, 0.2, 1); }
  ancHot = s;
  if (s) { s.material = ancMatHot; s.scale.set(0.28, 0.28, 1); }
}
/** Rê chuột lên ký hiệu ＋ → khối mờ nhảy tới vị trí đó. Trả về true nếu đang trỏ vào ký hiệu */
function hoverAnchor(e) {
  const s = anchorHit(e); setAncHot(s);
  if (!s) return false;
  const p = manual.pick, g = manual.gpick, a = s.userData.anc;
  if (g) {
    const res = setGroupAt(a.x, a.y), { L, W } = groupExt(g.rel), r = renderer.domElement.getBoundingClientRect(), tip = $('#tip');
    tip.innerHTML = `<b>Dán ${g.rel.length} kiện</b> · khối ${Math.round(L)}×${Math.round(W)} mm<br>＋ Đặt ${ANC_FACES[a.face]} kiện #${a.box + 1}<br>X ${res.X} · Y ${res.Y} · Z ${res.Z}<br>✔ Click để dán · R xoay nhóm`;
    tip.hidden = false;
    tip.style.left = Math.min(r.width - tip.offsetWidth - 6, e.clientX - r.left + 16) + 'px';
    tip.style.top = (e.clientY - r.top + 16) + 'px';
    return true;
  }
  const lock = $('#mLock').checked; $('#mLock').checked = true; setGhostAt(a.x, a.y); $('#mLock').checked = lock;
  const it = result.items[p.t], [l, w, h] = p.oris[p.oi], r = renderer.domElement.getBoundingClientRect(), tip = $('#tip');
  tip.innerHTML = `<b>${esc(it.name)}</b> · ${l}×${w}×${h}<br>＋ Đặt ${ANC_FACES[a.face]} kiện #${a.box + 1}<br>X ${a.x} · Y ${a.y} · Z ${a.z}<br>✔ Click để đặt · R để xoay`;
  tip.hidden = false;
  tip.style.left = Math.min(r.width - tip.offsetWidth - 6, e.clientX - r.left + 16) + 'px';
  tip.style.top = (e.clientY - r.top + 16) + 'px';
  return true;
}
function placeAtAnchor(s) {
  const a = s.userData.anc;
  if (manual.gpick) { setGroupAt(a.x, a.y); return placeGroup(null); }
  const lock = $('#mLock').checked; $('#mLock').checked = true; setGhostAt(a.x, a.y); $('#mLock').checked = lock;
  placeGhost(null);
}
$('#mAncOn').onchange = () => updateAnchors();

/** Gợi ý vị trí: thử các góc cạnh kiện đã xếp, chọn chỗ hợp lệ sâu nhất (X nhỏ), thấp nhất, sát trái */
function suggestPos() {
  const p = manual.pick; if (!p) return toast('Hãy chọn 1 loại kiện trước.');
  const others = othersOf(p), othersU = withUnits(others);
  const pts = [[0, 0]];
  for (const b of others) pts.push([b.x + b.l, b.y], [b.x, b.y + b.w], [b.x, b.y], [b.x + b.l, 0], [0, b.y + b.w], [b.x + b.l, b.y + b.w]);
  let best = null;
  const seen = new Set();
  // thử hướng đang chọn trước; nếu không có chỗ thì thử các hướng khác
  const order = [p.oi, ...p.oris.map((_, i) => i).filter(i => i !== p.oi)];
  for (const oi of order) {
    const [l, w] = p.oris[oi];
    for (const [x, y] of pts) {
      const k = `${oi}|${Math.round(x)}|${Math.round(y)}`; if (seen.has(k)) continue; seen.add(k);
      const { cand, reason } = evalAt(p, x, y, others, othersU, oi);
      if (reason) continue;
      const score = (cand.x + l) * 1e6 + cand.z * 1e3 + cand.y + (cand.y + w) * 1e-3;
      if (!best || score < best.score) best = { score, cand, oi };
    }
    if (best) break;
  }
  if (!best) return toast('Không còn chỗ trống hợp lệ cho kiện này trong cont đang xem.');
  if (best.oi !== p.oi) { p.oi = best.oi; toast('Đã đổi hướng đặt để vừa chỗ trống.'); }
  $('#mLock').checked = true;
  setGhostAt(best.cand.x, best.cand.y);
}

function placeGhost(e) {
  const p = manual.pick; if (!p?.pos) return;
  if (p.reason === 'Loại kiện này đã xếp hết') return toast('⛔ ' + p.reason);
  pushUndo();
  const c = curC();
  const nb = { ...p.pos, t: p.t, step: 0, loadOn: 0 };
  if (p.from) { c.boxes[p.from.idx] = nb; manual.sel = p.from.idx; cancelPick(false); afterEdit(); if (p.reason) warnForced(p.reason); return; }
  c.boxes.push(nb);
  if (p.reason) {
    // Đặt tạm ở vị trí chưa hợp lệ → thôi cầm, chọn sẵn kiện vừa đặt để người dùng xoay (R) / di chuyển (M) cho vừa
    manual.sel = c.boxes.length - 1; cancelPick(false); afterEdit(); warnForced(p.reason); return;
  }
  afterEdit();
  if (remainingByType()[p.t] <= 0) { cancelPick(); toast('Đã xếp hết loại kiện này.'); return; }
  showSugs();                                     // gợi ý chỗ cho kiện tiếp theo
  if ($('#mLock').checked) suggestPos();          // đang khoá vị trí: tự nhảy sang chỗ trống kế tiếp
  else if (e) updateGhost(e);
  else syncPosPanel();
}
function warnForced(reason) {
  toast(`⚠ Đã đặt tạm (${reason}). Kiện đang được chọn — bấm R để xoay cho vừa, M để di chuyển.`, 5000);
}
function selectAt(e) {
  setRay(e);
  // click vào khung gợi ý (từ kiện vừa xoay) = đặt kiện mới tại đó
  const sh = ray.intersectObjects(sugGroup.children.filter(o => o.isMesh), false)[0];
  if (sh) return placeAtSug(sh.object.userData.sug);
  const hit = ray.intersectObjects(boxMeshes.filter(m => m.visible), false)[0];
  if (e.ctrlKey || e.metaKey || e.shiftKey) {
    // Ctrl/Shift+click: thêm / bớt kiện vào vùng chọn nhiều
    const set = new Set(selList());
    if (hit) { const b = hit.object.userData; set.has(b) ? set.delete(b) : set.add(b); }
    manual.setMulti(set);
  } else manual.sel = hit ? boxMeshes.indexOf(hit.object) : -1;
  if (manual.sugCtx) clearSugs();
  setStep(+$('#step').value); renderManual();
}
function moveSel() {
  const c = curC();
  if (selList().length >= 2) return copySel(true);
  if (manual.sel < 0 || !c) return toast('Hãy click chọn 1 kiện trước.');
  if (hasOnTop(c.boxes, manual.sel)) return toast('Hãy dời các kiện đang nằm trên kiện này trước.');
  startPick(c.boxes[manual.sel].t, { idx: manual.sel, cont: current });
}
function deleteSel() {
  const c = curC();
  const many = selList();
  if (many.length >= 2) {
    if (many.some(b => c.boxes.some(o => !manual.multi.has(o) && isOnTop(o, b)))) return toast('Có kiện ngoài vùng chọn đang đè lên — hãy chọn thêm cả các kiện đó hoặc dời chúng trước.');
    pushUndo(); c.boxes = c.boxes.filter(b => !manual.multi.has(b)); manual.sel = -1; afterEdit();
    return toast(`Đã xoá ${many.length} kiện.`);
  }
  if (manual.sel < 0 || !c) return;
  if (hasOnTop(c.boxes, manual.sel)) return toast('Hãy bỏ các kiện đang nằm trên kiện này trước.');
  pushUndo(); c.boxes.splice(manual.sel, 1); manual.sel = -1; afterEdit();
}
function rotateAction() {
  const p = manual.pick;
  if (p) {
    p.oi = (p.oi + 1) % p.oris.length;
    if (p.oris.length === 1) toast('Kiện này không cho phép xoay.');
    if ($('#mLock').checked && p.pos) setGhostAt(p.pos.x, p.pos.y);
    else if (lastMove) updateGhost(lastMove);
    syncPosPanel();
    showSugs();
    return;
  }
  const c = curC(); if (manual.sel < 0 || !c) return;
  const b = c.boxes[manual.sel], it = result.items[b.t];
  if (hasOnTop(c.boxes, manual.sel)) return toast('Không xoay được: đang có kiện nằm trên.');
  const oris = orientations(it);
  if (oris.length === 1) return toast('Kiện này không cho phép xoay.');
  const others = withUnits(c.boxes.filter((_, i) => i !== manual.sel));
  const k0 = oris.findIndex(o => o[0] === b.l && o[1] === b.w && o[2] === b.h);
  const C = result.container;
  // Vị trí sau xoay: giữ nguyên chỗ; nếu không được thì kéo vào trong cont và hạ xuống mặt đỡ
  const placements = (l, w, h) => {
    const x = Math.max(0, Math.min(C.l - l, b.x)), y = Math.max(0, Math.min(C.w - w, b.y));
    const drop = { x, y, l, w, h, z: 0 };
    for (const o of others) if (overlapXY(drop, o)) drop.z = Math.max(drop.z, o.z + o.h);
    return [{ x: b.x, y: b.y, z: b.z, l, w, h }, drop];
  };
  let why = '';
  for (let s = 1; s < oris.length; s++) {
    const [l, w, h] = oris[((k0 < 0 ? 0 : k0) + s) % oris.length];
    for (const cand of placements(l, w, h)) {
      const r = canPlace(cand, it, others, C, minSup());
      if (!r) {
        const moved = cand.x !== b.x || cand.y !== b.y || cand.z !== b.z;
        pushUndo(); Object.assign(b, cand); afterEdit();
        if (moved) toast('Đã xoay và đưa kiện vào vị trí vừa.');
        showSugs(ctxOfSel()); return;
      }
      why = why || r;
    }
  }
  if (b.bad) {
    // Kiện đang đặt tạm: vẫn xoay sang hướng kế tiếp để người dùng thử tiếp
    const [l, w, h] = oris[((k0 < 0 ? 0 : k0) + 1) % oris.length];
    pushUndo(); Object.assign(b, placements(l, w, h)[1]); afterEdit();
    return toast('Hướng nào cũng chưa vừa chỗ này — hãy di chuyển (M) sang chỗ trống.', 4000);
  }
  toast('Không xoay được tại chỗ: ' + why);
}

/* ---- Chọn nhiều · Copy / Cắt / Dán nhóm kiện ---- */
const selList = () => { const c = curC(); return c ? c.boxes.filter(b => manual.multi.has(b)) : []; };
const isOnTop = (o, b) => o !== b && Math.abs(o.z - (b.z + b.h)) < 1 && overlapXY(o, b);
const groupExt = rel => ({ L: Math.max(...rel.map(r => r.rx + r.l)), W: Math.max(...rel.map(r => r.ry + r.w)), H: Math.max(...rel.map(r => r.rz + r.h)) });
let gGhost = null;
const gMatOk = new THREE.MeshLambertMaterial({ color: 0x3ddc84, transparent: true, opacity: 0.5, depthWrite: false });
const gMatBad = new THREE.MeshLambertMaterial({ color: 0xff4d4d, transparent: true, opacity: 0.5, depthWrite: false });

function copySel(cut) {
  const sel = selList(), c = curC();
  if (!sel.length) return toast('Hãy chọn kiện trước: click, Ctrl+click từng kiện hoặc giữ Shift rồi kéo chuột quét vùng.');
  const mx = Math.min(...sel.map(b => b.x)), my = Math.min(...sel.map(b => b.y)), mz = Math.min(...sel.map(b => b.z));
  manual.clip = { boxes: sel.map(b => ({ rx: b.x - mx, ry: b.y - my, rz: b.z - mz, l: b.l, w: b.w, h: b.h, t: b.t })) };
  if (!cut) { renderManual(); return toast(`⧉ Đã copy ${sel.length} kiện — bấm Ctrl+V rồi click vào chỗ muốn đặt.`); }
  if (sel.some(b => c.boxes.some(o => !manual.multi.has(o) && isOnTop(o, b)))) { manual.clip = null; return toast('Không nhấc được: có kiện ngoài vùng chọn đang đè lên.'); }
  pushUndo();
  c.boxes = c.boxes.filter(b => !manual.multi.has(b));
  manual.sel = -1; afterEdit();
  startPaste(true);
  toast(`✥ Đã nhấc ${sel.length} kiện — rê chuột tới chỗ mới rồi click để đặt (Esc / Ctrl+Z để trả lại).`, 4000);
}

function buildGroupGhost() {
  if (gGhost) scene.remove(gGhost);
  gGhost = new THREE.Group(); gGhost.renderOrder = 5;
  for (const r of manual.gpick.rel) {
    const m = new THREE.Mesh(unitBox, gMatOk);
    m.scale.set(r.l / 1000, r.h / 1000, r.w / 1000);
    m.position.set((r.rx + r.l / 2) / 1000, (r.rz + r.h / 2) / 1000, (r.ry + r.w / 2) / 1000);
    m.add(new THREE.LineSegments(unitEdges, edgeMat));
    gGhost.add(m);
  }
  gGhost.visible = false; scene.add(gGhost);
}
function startPaste(fromCut = false) {
  if (!manual.clip) return toast('Chưa copy kiện nào (chọn kiện rồi bấm Ctrl+C).');
  if (!ensureResult()) return;
  cancelPick(false);
  manual.gpick = { rel: manual.clip.boxes.map(r => ({ ...r })), pos: null, reason: 'Rê chuột vào container', fromCut, cache: null };
  buildGroupGhost();
  renderer.domElement.style.cursor = 'crosshair';
  renderManual();
  updateAnchors();
  if (lastMove) updateGroupGhost(lastMove);
}
function cancelPaste() {
  if (!manual.gpick) return;
  manual.gpick = null;
  clearAnchors();
  if (gGhost) { scene.remove(gGhost); gGhost = null; }
  renderer.domElement.style.cursor = ''; $('#tip').hidden = true;
}
/** Xoay cả nhóm 90° quanh trục đứng (mỗi kiện phải cho phép đổi dài ↔ rộng) */
function rotateGroup() {
  const g = manual.gpick; if (!g) return;
  const bad = g.rel.find(r => !orientations(result.items[r.t]).some(o => o[0] === r.w && o[1] === r.l && o[2] === r.h));
  if (bad) return toast(`Không xoay nhóm được: "${result.items[bad.t].name}" không cho phép xoay.`);
  const { L } = groupExt(g.rel);
  g.rel = g.rel.map(r => ({ ...r, rx: r.ry, ry: L - (r.rx + r.l), l: r.w, w: r.l }));
  buildGroupGhost();
  updateAnchors();
  if (lastMove) updateGroupGhost(lastMove);
}
/** Kiểm tra đặt nhóm với góc trong-trái-dưới tại (X, Y); Z tự rơi xuống mặt đỡ */
function evalGroup(X, Y) {
  const g = manual.gpick, C = result.container, c = curC();
  if (!g.cache) g.cache = { others: c.boxes, othersU: withUnits(c.boxes) };
  const { others, othersU } = g.cache, { L, W } = groupExt(g.rel);
  X = Math.round(Math.max(0, Math.min(C.l - L, X))); Y = Math.round(Math.max(0, Math.min(C.w - W, Y)));
  let Z = 0;
  for (const r of g.rel) if (r.rz < 1) {
    const fp = { x: X + r.rx, y: Y + r.ry, l: r.l, w: r.w };
    for (const o of others) if (overlapXY(fp, o)) Z = Math.max(Z, o.z + o.h);
  }
  const cands = [...g.rel].sort((a, b) => a.rz - b.rz).map(r => ({ x: X + r.rx, y: Y + r.ry, z: Z + r.rz, l: r.l, w: r.w, h: r.h, t: r.t }));
  let reason = null;
  const need = {}; cands.forEach(b => { need[b.t] = (need[b.t] || 0) + 1; });
  const rem = remainingByType();
  for (const [t, n] of Object.entries(need)) if (n > rem[t]) { reason = `Không đủ kiện "${result.items[t].name}": cần ${n}, còn ${Math.max(0, rem[t])} (tăng số lượng trong bảng kiện nếu cần)`; break; }
  if (!reason) {
    const kg = others.reduce((s, b) => s + result.items[b.t].weight, 0) + cands.reduce((s, b) => s + result.items[b.t].weight, 0);
    if (C.kg && kg > C.kg) reason = 'Vượt tải trọng container';
  }
  if (!reason) {
    const placed = [];
    for (let i = 0; i < cands.length; i++) {
      const it = result.items[cands[i].t];
      const r = canPlace(cands[i], it, othersU.concat(placed), C, minSup());
      if (r) { reason = cands.length > 1 ? `${r} (kiện ${i + 1}/${cands.length})` : r; break; }
      placed.push({ ...cands[i], unit: it, loadOn: 0 });
    }
  }
  return { X, Y, Z, cands, reason };
}
/** Đặt khối mờ của nhóm tại (X, Y) */
function setGroupAt(X, Y) {
  const g = manual.gpick;
  const res = evalGroup(X, Y);
  g.pos = res; g.reason = res.reason;
  gGhost.visible = true;
  gGhost.position.set(res.X / 1000, res.Z / 1000, res.Y / 1000);
  gGhost.children.forEach(m => { m.material = res.reason ? gMatBad : gMatOk; });
  return res;
}
function updateGroupGhost(e) {
  const g = manual.gpick; if (!g || !gGhost) return;
  const C = result.container, { L, W } = groupExt(g.rel);
  const r = setRay(e);
  const hit = ray.intersectObjects(boxMeshes.filter(m => m.visible), false)[0];
  let px, py;
  if (hit) {
    const n = hit.face.normal;
    px = hit.point.x * 1000 + (n.y > 0.5 ? 0 : n.x * L / 2); py = hit.point.z * 1000 + (n.y > 0.5 ? 0 : n.z * W / 2);
  } else {
    const v = new THREE.Vector3();
    if (!ray.ray.intersectPlane(floorPlane, v)) { gGhost.visible = false; return; }
    px = v.x * 1000; py = v.z * 1000;
  }
  const others = curC().boxes;
  const X = snap1(px - L / 2, L, [0, C.l, ...others.flatMap(b => [b.x, b.x + b.l])]);
  const Y = snap1(py - W / 2, W, [0, C.w, ...others.flatMap(b => [b.y, b.y + b.w])]);
  const res = setGroupAt(X, Y);
  const tip = $('#tip');
  tip.innerHTML = `<b>Dán ${g.rel.length} kiện</b> · khối ${Math.round(L)}×${Math.round(W)} mm<br>X ${res.X} · Y ${res.Y} · Z ${res.Z}<br>${res.reason ? '⛔ ' + esc(res.reason) : '✔ Click để đặt · R xoay nhóm · Esc thôi'}`;
  tip.hidden = false;
  tip.style.left = Math.min(r.width - tip.offsetWidth - 6, e.clientX - r.left + 16) + 'px';
  tip.style.top = (e.clientY - r.top + 16) + 'px';
}
function placeGroup(e) {
  const g = manual.gpick; if (!g?.pos) return;
  if (g.reason) return toast('⛔ ' + g.reason);
  pushUndo();
  const c = curC();
  const added = g.pos.cands.map(b => ({ ...b, step: 0, loadOn: 0 }));
  c.boxes.push(...added);
  g.cache = null;
  afterEdit();
  manual.setMulti(new Set(added)); setStep(+$('#step').value);
  toast(`✔ Đã đặt ${added.length} kiện.${g.fromCut ? '' : ' Click tiếp để dán thêm, Esc để thôi.'}`);
  if (g.fromCut) { cancelPaste(); manual.clip = null; }
  else { updateAnchors(); if (e) updateGroupGhost(e); }
  renderManual();
}

/* ---- Quét chọn: giữ Shift + kéo chuột ---- */
let marquee = null;
viewer.addEventListener('pointerdown', e => {
  if (!manual.on || !e.shiftKey || e.button !== 0 || manual.pick || manual.gpick || e.target !== renderer.domElement) return;
  controls.enabled = false; // không xoay / kéo góc nhìn trong lúc quét
  const r = viewer.getBoundingClientRect();
  marquee = { x0: e.clientX, y0: e.clientY, el: document.createElement('div') };
  marquee.el.className = 'marquee'; viewer.appendChild(marquee.el);
  Object.assign(marquee.el.style, { left: e.clientX - r.left + 'px', top: e.clientY - r.top + 'px', width: '0px', height: '0px' });
}, true);
window.addEventListener('pointermove', e => {
  if (!marquee) return;
  const r = viewer.getBoundingClientRect();
  const x = Math.min(e.clientX, marquee.x0), y = Math.min(e.clientY, marquee.y0);
  Object.assign(marquee.el.style, { left: x - r.left + 'px', top: y - r.top + 'px', width: Math.abs(e.clientX - marquee.x0) + 'px', height: Math.abs(e.clientY - marquee.y0) + 'px' });
});
window.addEventListener('pointerup', e => {
  if (!marquee) return;
  const x1 = Math.min(e.clientX, marquee.x0), x2 = Math.max(e.clientX, marquee.x0), y1 = Math.min(e.clientY, marquee.y0), y2 = Math.max(e.clientY, marquee.y0);
  marquee.el.remove(); marquee = null;
  controls.enabled = true;
  downAt = null; // không coi là click
  if (x2 - x1 < 4 && y2 - y1 < 4) return;
  const rc = renderer.domElement.getBoundingClientRect(), v = new THREE.Vector3();
  const set = new Set(selList());
  for (const m of boxMeshes) {
    if (!m.visible) continue;
    v.copy(m.position).project(camera);
    const sx = rc.left + (v.x + 1) / 2 * rc.width, sy = rc.top + (1 - v.y) / 2 * rc.height;
    if (sx >= x1 && sx <= x2 && sy >= y1 && sy <= y2 && v.z < 1) set.add(m.userData);
  }
  manual.setMulti(set);
  setStep(+$('#step').value); renderManual();
  if (set.size) toast(`Đã chọn ${set.size} kiện — Ctrl+C copy, Ctrl+X di chuyển, Delete xoá.`);
});

const cv = renderer.domElement;
cv.addEventListener('pointermove', e => { lastMove = e; if (!manual.on) return; if (manual.gpick) { if (!hoverAnchor(e)) updateGroupGhost(e); } else if (manual.pick && !hoverAnchor(e)) updateGhost(e); });
cv.addEventListener('pointerdown', e => { downAt = { x: e.clientX, y: e.clientY, b: e.button }; });
cv.addEventListener('pointerup', e => {
  if (!manual.on || !downAt || downAt.b !== 0) return;
  const moved = Math.hypot(e.clientX - downAt.x, e.clientY - downAt.y) > 5; downAt = null;
  if (moved) return; // kéo chuột = xoay góc nhìn
  const as = (manual.gpick || manual.pick) && anchorHit(e);
  if (as) return placeAtAnchor(as);
  if (manual.gpick) return placeGroup(e);
  if (manual.pick) {
    setRay(e);
    const sh = ray.intersectObjects(sugGroup.children.filter(o => o.isMesh), false)[0];
    if (sh) placeAtSug(sh.object.userData.sug); else placeGhost(e);
  } else selectAt(e);
});
cv.addEventListener('pointerleave', () => { setAncHot(null); if (ghost) ghost.visible = false; if (gGhost) gGhost.visible = false; });
document.addEventListener('keydown', e => {
  // Hoàn tác / làm lại dùng được cả khi không bật Xếp tay (vd sau khi xoá container)
  if ((e.ctrlKey || e.metaKey) && result && !e.target.closest?.('input, select, textarea')) {
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'y') { e.preventDefault(); k === 'z' ? undo() : redo(); return; }
  }
  if (!manual.on) return;
  if (manual.pick && e.key === 'Enter' && (e.target.id === 'mX' || e.target.id === 'mY')) { e.preventDefault(); posFromInputs(); placeGhost(null); return; }
  if (e.target.closest?.('input, select, textarea')) return;
  const k = e.key.toLowerCase(), mod = e.ctrlKey || e.metaKey;
  if (manual.pick && !mod) {
    const arrows = { arrowleft: 'x-', arrowright: 'x+', arrowup: 'y-', arrowdown: 'y+' };
    if (arrows[k]) { e.preventDefault(); nudge(arrows[k]); return; }
    if (k === 'enter') { e.preventDefault(); placeGhost(null); return; }
    if (k === 'g') { suggestPos(); return; }
  }
  if (mod && k === 'c') { e.preventDefault(); copySel(false); return; }
  if (mod && k === 'x') { e.preventDefault(); copySel(true); return; }
  if (mod && k === 'v') { e.preventDefault(); startPaste(false); return; }
  if (mod && k === 'a') { e.preventDefault(); cancelPick(false); manual.setMulti(new Set(curC()?.boxes || [])); setStep(+$('#step').value); renderManual(); return; }
  if (manual.gpick && !mod) {
    if (k === 'r') { rotateGroup(); return; }
    if (k === 'enter') { e.preventDefault(); placeGroup(lastMove); return; }
    if (k === 'escape') {
      const fromCut = manual.gpick.fromCut; cancelPaste();
      if (fromCut) { manual.clip = null; undo(); toast('Đã trả các kiện về chỗ cũ.'); }
      renderManual(); return;
    }
  }
  if (mod && k === 'z') { e.preventDefault(); undo(); }
  else if (mod && k === 'y') { e.preventDefault(); redo(); }
  else if (mod) return;
  else if (k === 'r') { if (selList().length >= 2) toast('Để xoay cả nhóm: Ctrl+X (nhấc nhóm) rồi bấm R.'); else rotateAction(); }
  else if (k === 'm') moveSel();
  else if (k === 'delete' || k === 'backspace') { e.preventDefault(); deleteSel(); }
  else if (k === 'escape') { if (manual.pick) cancelPick(); else { manual.sel = -1; setStep(+$('#step').value); renderManual(); } }
});

/* ================== THAO TÁC DÙNG CHUNG (nút ＋/－ khung Xếp tay, ...) ================== */
// runChatTool(name, args): các thao tác trên phương án đang mở (đặt / bỏ kiện, sửa loại kiện, ...)

function ensureResult() {
  if (result) return true;
  const items = normItems();
  if (!items.some(it => it.qty > 0)) return false;
  result = wrapResult({ strategy: 'Xếp tay', containers: [{ boxes: [] }], unplaced: {}, totalUnits: 0, items, base: contInfo(), ms: 0 });
  current = 0; refresh();
  return true;
}
/** Đồng bộ danh sách kiện từ bảng nhập vào phương án đang có (giữ thứ tự loại) */
function syncItemsToResult() {
  if (!result) return;
  const items = normItems();
  if (items.length >= result.items.length) { result.items = items; refresh(); }
}
const pct = (a, b) => b ? Math.round(a / b * 1000) / 10 : 0;
const itemOut = (it, t, rem) => ({ loai: t + 1, ten: it.name, kich_thuoc: `${it.l}x${it.w}x${it.h}`, kg: it.weight, so_luong: it.qty, ...(rem ? { da_xep: it.qty - rem[t], con_lai: rem[t] } : {}), xoay: it.rotate, xep_chong: it.stackable, chiu_tai: it.maxLoad || 0, chi_san: !!it.floorOnly, uu_tien: it.priority });
function needCont(n) {
  if (!result) throw new Error('Chưa có phương án xếp — hãy tự xếp trước.');
  if (!Number.isInteger(n) || n < 1 || n > result.containers.length) throw new Error(`Container ${n} không tồn tại (hiện có ${result.containers.length}).`);
  return n - 1;
}
function needItem(n, list) {
  if (!Number.isInteger(n) || n < 1 || n > list.length) throw new Error(`Loại kiện ${n} không tồn tại (có ${list.length} loại).`);
  return n - 1;
}
function applyItemFields(it, a) {
  const map = { ten: 'name', dai: 'l', rong: 'w', cao: 'h', kg: 'weight', so_luong: 'qty', xoay: 'rotate', xep_chong: 'stackable', chiu_tai: 'maxLoad', chi_san: 'floorOnly', uu_tien: 'priority' };
  for (const [k, f] of Object.entries(map)) if (a[k] !== undefined && a[k] !== null) it[f] = a[k];
  for (const f of ['l', 'w', 'h']) if (!(it[f] > 0)) throw new Error('Kích thước phải lớn hơn 0.');
  if (!ROT_LABEL[it.rotate]) it.rotate = parseRot(simp(it.rotate));
}
/** Tìm chỗ trống hợp lệ tốt nhất cho 1 kiện (sâu nhất, thấp nhất, sát trái) trong container đang xem */
function bestSpot(ctx, onlyOri) {
  const C = result.container, others = othersOf(ctx), othersU = withUnits(others);
  let best = null;
  ctx.oris.forEach((o, oi) => {
    if (onlyOri && o.join('x') !== onlyOri) return;
    const [l, w] = o;
    const pts = [[0, 0], [0, C.w - w]];
    for (const b of others) pts.push([b.x + b.l, b.y], [b.x, b.y + b.w], [b.x, b.y], [b.x + b.l, 0], [0, b.y + b.w], [b.x + b.l, C.w - w], [b.x, b.y + b.w - w]);
    const seen = new Set();
    for (const [x, y] of pts) {
      const k = `${Math.round(x)}|${Math.round(y)}`; if (seen.has(k)) continue; seen.add(k);
      const { cand, reason } = evalAt({ ...ctx, oi }, x, y, others, othersU, oi);
      if (reason) continue;
      const score = (cand.x + cand.l) * 1e6 + cand.z * 1e3 + cand.y;
      if (!best || score < best.score) best = { score, cand };
    }
  });
  return best?.cand || null;
}

async function runChatTool(name, a = {}) {
  switch (name) {
    case 'xem_tong_quan': {
      ensureFleet();
      const out = {
        phuong_tien_dang_chon: { ten: project.fleet.map(r => `${r.qty > 0 ? r.qty : 'tự động'} × ${specName(r)}`).join(' + '), danh_sach: project.fleet.map(r => ({ loai: specName(r), kich_thuoc: `${r.l}x${r.w}x${r.h}`, tai_trong_kg: r.kg, so_luong: r.qty || 'tự động' })) },
        loai_kien: [], container: [], container_dang_xem: result ? current + 1 : null,
        che_do_xep_tay: manual.on, da_chinh_tay: manualDirty,
      };
      const rem = result ? remainingByType() : null;
      const items = result ? result.items : normItems();
      out.loai_kien = items.map((it, t) => itemOut(it, t, rem));
      if (result) {
        out.phuong_an = { phuong_tien: mixText() };
        out.container = result.containers.map((c, i) => {
          const s = contStats(c), R = specOf(c);
          return { container: i + 1, loai: R.name, kich_thuoc: `${R.l}x${R.w}x${R.h}`, so_kien: s.n, the_tich_m3: Math.round(s.vol * 100) / 100, pct_the_tich: Math.round(s.volPct * 10) / 10, kg: Math.round(s.kg), pct_tai: Math.round(s.kgPct * 10) / 10,
            chieu_dai_da_dung_mm: Math.round(s.len), trong_tam_pct: s.cog ? { doc_dai: pct(s.cog.x, R.l), ngang: pct(s.cog.y, R.w) } : null, kien_dat_sai: c.boxes.filter(b => b.bad).length };
        });
        out.tong_chua_xep = rem.reduce((s, n) => s + Math.max(0, n), 0);
        if (normItems().length !== result.items.length) out.ghi_chu = 'Bảng kiện vừa thay đổi so với phương án đang xếp — nên tự xếp lại.';
      } else out.ghi_chu = 'Chưa có phương án xếp.';
      return out;
    }
    case 'xem_container': {
      const i = needCont(a.container), c = result.containers[i], R = specOf(c), s = contStats(c);
      const types = {}; c.boxes.forEach(b => { types[b.t] = (types[b.t] || 0) + 1; });
      const levels = {}; c.boxes.forEach(b => { const z = Math.round(b.z); levels[z] = (levels[z] || 0) + 1; });
      return {
        container: i + 1, loai: R.name, so_kien: s.n, pct_the_tich: Math.round(s.volPct * 10) / 10, kg: Math.round(s.kg), pct_tai: Math.round(s.kgPct * 10) / 10,
        theo_loai: Object.entries(types).map(([t, n]) => ({ loai: +t + 1, ten: result.items[t].name, so_kien: n })),
        tang_theo_do_cao_z_mm: Object.entries(levels).sort((x, y) => x[0] - y[0]).map(([z, n]) => ({ z: +z, so_kien_bat_dau_o_do_cao_nay: n })),
        chieu_dai_con_trong_phia_cua_mm: Math.max(0, Math.round(R.l - s.len)),
        kien_dat_sai: c.boxes.filter(b => b.bad).slice(0, 20).map(b => ({ buoc: b.step, ten: result.items[b.t].name, ly_do: b.bad })),
      };
    }
    case 'them_loai_kien': {
      const i = project.items.length;
      const it = { name: '', l: 0, w: 0, h: 0, weight: 0, qty: 0, rotate: 'upright', stackable: true, maxLoad: 0, floorOnly: false, priority: 1, color: COLORS[i % COLORS.length] };
      applyItemFields(it, a);
      project.items.push(it); save(); renderItems(); syncItemsToResult();
      return { ok: true, loai: i + 1, ghi_chu: result ? 'Đã thêm vào danh sách; dùng tu_dong_xep (giữ xếp tay) hoặc dat_kien để xếp loại này.' : 'Đã thêm.' };
    }
    case 'sua_loai_kien': {
      const t = needItem(a.loai, project.items);
      const it = project.items[t];
      const dimChanged = ['dai', 'rong', 'cao'].some(k => a[k] !== undefined);
      applyItemFields(it, a);
      save(); renderItems(); syncItemsToResult();
      return { ok: true, loai: itemOut(it, t), ghi_chu: dimChanged && result ? 'Kích thước đổi — các kiện đã xếp vẫn giữ kích thước cũ cho tới khi tự xếp lại từ đầu.' : undefined };
    }
    case 'doi_phuong_tien': {
      const p = PRESETS.find(x => x.id === a.ma);
      if (!p) throw new Error('Mã phương tiện không hợp lệ.');
      let c;
      if (p.l) c = { preset: p.id, l: p.l, w: p.w, h: p.h, kg: p.kg, qty: null };
      else {
        if (!(a.dai > 0 && a.rong > 0 && a.cao > 0)) throw new Error('custom cần dai, rong, cao > 0.');
        c = { preset: 'custom', l: a.dai, w: a.rong, h: a.cao, kg: a.tai_trong || 0, qty: null };
      }
      project.fleet = [c]; project.container = c; // đổi sang 1 loại, số lượng tự động
      save(); initContainer();
      return { ok: true, phuong_tien: p.l ? p.name : 'Tuỳ chỉnh', kich_thuoc: `${c.l}x${c.w}x${c.h}`, tai_trong_kg: c.kg, ghi_chu: result ? 'Phương án đang xếp vẫn dùng phương tiện cũ; cần tu_dong_xep với giu_xep_tay=false để xếp lại.' : undefined };
    }
    case 'tu_dong_xep': {
      const keep = !!a.giu_xep_tay && !!result;
      if (keep) syncItemsToResult();
      const r = await runPlan(keep ? true : null);
      if (!r.ok) throw new Error(r.error || 'Không chạy được thuật toán.');
      const out = await runChatTool('xem_tong_quan');
      return { ok: true, so_container: result.containers.length, container: out.container, tong_chua_xep: out.tong_chua_xep };
    }
    case 'dat_kien': {
      if (!ensureResult()) throw new Error('Chưa có kiện hàng nào.');
      syncItemsToResult();
      const ci = needCont(a.container), t = needItem(a.loai, result.items);
      const n = Math.min(500, Math.max(1, a.so_luong | 0));
      const oris = orientations(result.items[t]);
      const only = a.huong ? String(a.huong).toLowerCase().replace(/[×\s]/g, 'x').replace(/x+/g, 'x') : null;
      if (only && !oris.some(o => o.join('x') === only)) throw new Error(`Hướng ${a.huong} không được phép. Các hướng cho phép: ${oris.map(o => o.join('x')).join(', ')}`);
      cancelPick(false); manual.sel = -1;
      current = ci;
      pushUndo();
      let placed = 0;
      for (; placed < n; placed++) {
        if (remainingByType()[t] <= 0) break;
        const spot = bestSpot({ t, oris, oi: 0, from: null }, only);
        if (!spot) break;
        result.containers[ci].boxes.push({ ...spot, t, step: 0, loadOn: 0 });
      }
      if (!placed) manual.undo.pop();
      afterEdit();
      return { ok: true, da_dat: placed, yeu_cau: n, con_lai_loai_nay: remainingByType()[t],
        ly_do_dung: placed < n ? (remainingByType()[t] <= 0 ? 'Đã hết kiện loại này' : 'Container không còn chỗ trống hợp lệ cho kiện này') : undefined };
    }
    case 'bo_kien': {
      const ci = needCont(a.container), c = result.containers[ci];
      const t = a.loai ? needItem(a.loai, result.items) : null;
      const max = a.so_luong ? a.so_luong : Infinity;
      cancelPick(false); manual.sel = -1;
      pushUndo();
      let removed = 0;
      while (removed < max) {
        let idx = -1;
        for (let i = c.boxes.length - 1; i >= 0; i--) {
          const b = c.boxes[i];
          if (t !== null && b.t !== t) continue;
          if (a.chi_kien_loi && !b.bad) continue;
          if (hasOnTop(c.boxes, i)) continue;
          idx = i; break;
        }
        if (idx < 0) break;
        c.boxes.splice(idx, 1); removed++;
      }
      if (!removed) manual.undo.pop();
      current = ci; afterEdit();
      return { ok: true, da_bo: removed, ghi_chu: removed < max && max !== Infinity ? 'Không bỏ thêm được: các kiện còn lại đang bị kiện khác đè lên hoặc không khớp điều kiện.' : undefined };
    }
    case 'chuyen_container': {
      const i = needCont(a.container);
      current = i; manual.sel = -1; cancelPick(false); showResult();
      return { ok: true, dang_xem: i + 1 };
    }
    case 'mo_xuat_pdf': {
      if (!result) throw new Error('Chưa có phương án xếp để xuất.');
      $('#btnPdf').click();
      return { ok: true, ghi_chu: 'Đã mở hộp thoại xuất PDF.' };
    }
    default: throw new Error('Công cụ không tồn tại: ' + name);
  }
}

/* Bỏ dấu tiếng Việt, chữ thường (dùng khi đọc kiểu xoay từ chữ) */
const simp = s => String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/g, 'd').replace(/[×*]/g, 'x').replace(/\s+/g, ' ').trim();

// Hỗ trợ dò lỗi trong console trình duyệt
window.__lp = { runChatTool, get manual() { return manual; }, get result() { return result; }, get boxMeshes() { return boxMeshes; }, camera, ray, mouse };

/* ================== Khởi động ================== */
initContainer();
renderItems();
resize();
loadPlan();
/** Khôi phục phương án xếp đã lưu trong dự án */
function loadPlan() {
  const p = project.plan;
  if (!p?.containers?.length || !p.items) return;
  result = wrapResult({ ...p, base: p.base || p.container, container: undefined, unplaced: {}, totalUnits: 0, ms: 0 });
  manualDirty = !!p.manualDirty; current = 0;
  refresh();
}
