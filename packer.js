// Thuật toán xếp hàng 3D (Extreme Points + nhiều chiến lược sắp xếp)
// Hệ toạ độ: x = chiều dài container (từ vách trong ra cửa), y = chiều rộng, z = chiều cao. Đơn vị mm, kg.

const EPS = 0.5;

/** Gù container: 2 khối 110×110×110 ở 2 góc trên, sát vách trong (x = 0) — kiện không được chiếm chỗ này */
export const CORNER = 110;
export function cornerBlocks(C) {
  const s = CORNER, z = C.h - s;
  return [{ x: 0, y: 0, z, l: s, w: s, h: s }, { x: 0, y: C.w - s, z, l: s, w: s, h: s }];
}

/** Các hướng đặt cho phép của một kiện */
export function orientations(item) {
  const { l, w, h } = item;
  // Hướng đặt [dài theo X, rộng theo Y, cao theo Z]. Mặt đáy: Cao-lên = đáy D×R; Rộng-lên = nằm nghiêng; Dài-lên = dựng đứng
  const UP_H = [[l, w, h], [w, l, h]], UP_W = [[l, h, w], [h, l, w]], UP_L = [[w, h, l], [h, w, l]];
  const MODES = {
    none: [[l, w, h]],
    upright: UP_H,
    no_end: [...UP_H, ...UP_W],
    side: UP_W,
    end: UP_L,
    along: [[l, w, h], [l, h, w]],
    all: [...UP_H, ...UP_W, ...UP_L],
  };
  const list = MODES[item.rotate] || MODES.all;
  const seen = new Set();
  return list.filter(o => { const k = o.join('x'); if (seen.has(k)) return false; seen.add(k); return true; });
}

function overlap1(a0, a1, b0, b1) { return a0 < b1 - EPS && b0 < a1 - EPS; }

function collides(b, boxes) {
  for (let i = 0; i < boxes.length; i++) {
    const o = boxes[i];
    if (overlap1(b.x, b.x + b.l, o.x, o.x + o.l) &&
        overlap1(b.y, b.y + b.w, o.y, o.y + o.w) &&
        overlap1(b.z, b.z + b.h, o.z, o.z + o.h)) return true;
  }
  return false;
}

/** Kiểm tra đỡ bên dưới: trả về danh sách {box, area} hoặc null nếu không đủ đỡ */
function supportOf(b, boxes, minSupport, unit) {
  if (b.z < EPS) return [];
  if (unit.floorOnly) return null;
  const base = b.l * b.w;
  let area = 0;
  const sup = [];
  for (const o of boxes) {
    if (Math.abs(o.z + o.h - b.z) > EPS) continue;
    const dx = Math.min(b.x + b.l, o.x + o.l) - Math.max(b.x, o.x);
    const dy = Math.min(b.y + b.w, o.y + o.w) - Math.max(b.y, o.y);
    if (dx <= EPS || dy <= EPS) continue;
    if (!o.unit.stackable) return null; // không được đè lên kiện cấm xếp chồng
    const a = dx * dy;
    area += a;
    sup.push({ box: o, area: a });
  }
  if (area / base < minSupport) return null;
  // Kiểm tra tải trọng cho phép trên từng kiện đỡ
  for (const s of sup) {
    const share = unit.weight * s.area / area;
    const max = s.box.unit.maxLoad;
    if (max > 0 && s.box.loadOn + share > max + 1e-6) return null;
  }
  return sup.map(s => ({ ...s, share: unit.weight * s.area / area }));
}

/** Chiếu điểm theo chiều âm của trục cho tới khi chạm vật cản/vách */
function project(p, axis, boxes) {
  const q = { ...p };
  let best = 0;
  for (const o of boxes) {
    if (axis === 'x') {
      if (o.x + o.l <= p.x + EPS && p.y >= o.y - EPS && p.y < o.y + o.w - EPS && p.z >= o.z - EPS && p.z < o.z + o.h - EPS)
        best = Math.max(best, o.x + o.l);
    } else if (axis === 'y') {
      if (o.y + o.w <= p.y + EPS && p.x >= o.x - EPS && p.x < o.x + o.l - EPS && p.z >= o.z - EPS && p.z < o.z + o.h - EPS)
        best = Math.max(best, o.y + o.w);
    } else {
      if (o.z + o.h <= p.z + EPS && p.x >= o.x - EPS && p.x < o.x + o.l - EPS && p.y >= o.y - EPS && p.y < o.y + o.w - EPS)
        best = Math.max(best, o.z + o.h);
    }
  }
  q[axis] = best;
  return q;
}

/** Xếp danh sách kiện (units) vào 1 container. Trả về {boxes, left} */
function packOne(units, C, opt, initial = []) {
  const boxes = initial.map(b => ({ ...b }));
  const nBlocks = opt.corners ? 2 : 0;
  if (nBlocks) for (const g of cornerBlocks(C)) boxes.push({ ...g, corner: true, unit: { weight: 0, stackable: false, maxLoad: 0 }, loadOn: 0 });
  computeLoads(boxes);
  let eps = [{ x: 0, y: 0, z: 0 }];
  let weight = boxes.reduce((s, b) => s + b.unit.weight, 0);
  for (let i = 0; i < boxes.length; i++) eps = updateEPs(eps, boxes[i], boxes.slice(0, i + 1), C);
  eps = eps.filter(p => !boxes.some(o =>
    p.x >= o.x - EPS && p.x < o.x + o.l - EPS && p.y >= o.y - EPS && p.y < o.y + o.w - EPS && p.z >= o.z - EPS && p.z < o.z + o.h - EPS));
  const left = [];
  const usableL = C.l, usableW = C.w, usableH = C.h;

  for (const u of units) {
    if (weight + u.weight > C.maxWeight + 1e-6) { left.push(u); continue; }
    let best = null;
    const oris = orientations(u);
    for (const p of eps) {
      for (const [l, w, h] of oris) {
        if (p.x + l > usableL + EPS || p.y + w > usableW + EPS || p.z + h > usableH + EPS) continue;
        // Điểm số: ưu tiên lấp sâu vào trong (x nhỏ), thấp, sát vách trái
        const score = (p.x + l) * 1e6 + p.z * 1e3 + p.y;
        if (best && score >= best.score) continue;
        const b = { x: p.x, y: p.y, z: p.z, l, w, h };
        if (collides(b, boxes)) continue;
        const sup = supportOf(b, boxes, opt.minSupport, u);
        if (!sup) continue;
        best = { score, b, sup };
      }
    }
    if (!best) { left.push(u); continue; }
    const b = Object.assign(best.b, { unit: u, loadOn: 0, step: boxes.length + 1 - nBlocks });
    for (const s of best.sup) s.box.loadOn += s.share;
    boxes.push(b);
    weight += u.weight;
    eps = updateEPs(eps, b, boxes, C);
  }
  return { boxes: nBlocks ? boxes.filter(b => !b.corner) : boxes, left, weight };
}

/** Sinh điểm cực mới sau khi đặt kiện b */
function updateEPs(eps, b, boxes, C) {
    const usableL = C.l, usableW = C.w, usableH = C.h;
    const cand = [
      { x: b.x + b.l, y: b.y, z: b.z },
      { x: b.x, y: b.y + b.w, z: b.z },
      { x: b.x, y: b.y, z: b.z + b.h },
    ];
    const add = [];
    for (const c of cand) {
      add.push(c);
      for (const ax of ['x', 'y', 'z']) {
        if (c[ax] > EPS) add.push(project(c, ax, boxes));
      }
    }
    // Loại điểm nằm trong kiện đã xếp và trùng lặp
    const key = p => `${Math.round(p.x)}|${Math.round(p.y)}|${Math.round(p.z)}`;
    const map = new Map(eps.map(p => [key(p), p]));
    for (const p of add) {
      if (p.x >= usableL - EPS || p.y >= usableW - EPS || p.z >= usableH - EPS) continue;
      map.set(key(p), p);
    }
    const out = [...map.values()].filter(p => !boxes.some(o =>
      p.x >= o.x - EPS && p.x < o.x + o.l - EPS &&
      p.y >= o.y - EPS && p.y < o.y + o.w - EPS &&
      p.z >= o.z - EPS && p.z < o.z + o.h - EPS));
    out.sort((a, b2) => a.x - b2.x || a.z - b2.z || a.y - b2.y);
    return out;
}

/** Tính lại tải đè lên từng kiện (chỉ tính tải trực tiếp từ kiện nằm ngay trên) */
export function computeLoads(boxes) {
  boxes.forEach(b => { b.loadOn = 0; });
  for (const b of boxes) {
    if (b.z < EPS) continue;
    const sup = [];
    let area = 0;
    for (const o of boxes) {
      if (o === b || Math.abs(o.z + o.h - b.z) > EPS) continue;
      const dx = Math.min(b.x + b.l, o.x + o.l) - Math.max(b.x, o.x);
      const dy = Math.min(b.y + b.w, o.y + o.w) - Math.max(b.y, o.y);
      if (dx > EPS && dy > EPS) { sup.push([o, dx * dy]); area += dx * dy; }
    }
    for (const [o, a] of sup) o.loadOn += b.unit.weight * a / area;
  }
  return boxes;
}

/** Kiểm tra một vị trí đặt kiện (dùng cho xếp tay). Trả về null nếu hợp lệ, hoặc lý do không hợp lệ */
export function canPlace(b, unit, boxes, C, minSupport) {
  if (b.x < -EPS || b.y < -EPS || b.z < -EPS || b.x + b.l > C.l + EPS || b.y + b.w > C.w + EPS || b.z + b.h > C.h + EPS)
    return 'Vượt ra ngoài container';
  if (collides(b, cornerBlocks(C))) return 'Vướng gù container (góc trên phía trong)';
  if (collides(b, boxes)) return 'Chồng lấn kiện khác';
  if (b.z > EPS && unit.floorOnly) return 'Kiện này chỉ được đặt trên sàn';
  if (!supportOf(b, boxes, minSupport, unit)) return 'Không đủ đỡ bên dưới, hoặc kiện dưới không cho xếp chồng / quá tải';
  return null;
}

const STRATEGIES = {
  volume: (a, b) => b.l * b.w * b.h - a.l * a.w * a.h,
  base: (a, b) => b.l * b.w - a.l * a.w || b.h - a.h,
  height: (a, b) => b.h - a.h || b.l * b.w - a.l * a.w,
  longest: (a, b) => Math.max(b.l, b.w, b.h) - Math.max(a.l, a.w, a.h),
  weight: (a, b) => b.weight - a.weight,
};

function expand(items) {
  const units = [];
  items.forEach((it, idx) => {
    const q = Math.max(0, Math.floor(it.qty || 0));
    for (let i = 0; i < q; i++) units.push({ ...it, typeIndex: idx, seq: i + 1 });
  });
  return units;
}

function sortUnits(units, cmp) {
  return [...units].sort((a, b) =>
    (a.priority || 1) - (b.priority || 1) ||        // ưu tiên nhỏ xếp trước (vào sâu bên trong)
    (b.floorOnly ? 1 : 0) - (a.floorOnly ? 1 : 0) || // kiện chỉ đặt sàn xếp trước
    (b.stackable ? 1 : 0) - (a.stackable ? 1 : 0) ||   // kiện không chịu chồng xếp sau (nằm trên cùng)
    cmp(a, b) || a.typeIndex - b.typeIndex);
}

/**
 * Xếp toàn bộ hàng vào các container.
 * fleet: 1 container (dùng bao nhiêu cũng được) hoặc danh sách [{ spec, qty }] — xếp lần lượt theo thứ tự,
 *        qty = null/0 nghĩa là không giới hạn số lượng loại đó.
 * fixed: các container đang có (xếp tay) [{ spec, boxes }] hoặc [boxes] — giữ nguyên kiện, xếp thêm vào trước.
 */
export function plan(items, fleet, opt = {}, fixed = []) {
  const o = { minSupport: 0.75, maxContainers: 50, strategy: 'auto', corners: true, ...opt };
  const rows = Array.isArray(fleet) ? fleet : [{ spec: fleet, qty: null }];
  const usedQty = rows.map(() => 0);
  const nextSpec = () => {
    for (let k = 0; k < rows.length; k++) if (!(rows[k].qty > 0) || usedQty[k] < rows[k].qty) { usedQty[k]++; return rows[k].spec; }
    return null;
  };
  // Kiện đã xếp tay (giữ nguyên vị trí) — trừ khỏi danh sách cần xếp; container đang có tính vào số lượng của loại tương ứng
  const placed = {};
  const fixedConts = fixed.map(f => {
    const list = Array.isArray(f) ? f : f.boxes;
    let spec = Array.isArray(f) ? null : f.spec;
    if (spec) { const k = rows.findIndex((r, i) => r.spec.id === spec.id && (!(r.qty > 0) || usedQty[i] < r.qty)); if (k >= 0) usedQty[k]++; }
    else spec = nextSpec() || rows[0].spec;
    return { spec, boxes: list.map(b => {
      placed[b.t] = (placed[b.t] || 0) + 1;
      return { x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, h: b.h, step: b.step, unit: { ...items[b.t], typeIndex: b.t }, loadOn: 0 };
    }) };
  });
  const all = expand(items).filter(u => !(placed[u.typeIndex] > 0 && placed[u.typeIndex]--));
  const names = o.strategy === 'auto' ? Object.keys(STRATEGIES) : [o.strategy];
  const volOf = r => r.boxes.reduce((t, b) => t + b.l * b.w * b.h, 0);
  const maxC = Math.max(o.maxContainers, fixedConts.length);
  // Mỗi container: thử mọi chiến lược trên phần hàng còn lại, chọn phương án xếp được nhiều thể tích nhất
  let remaining = all;
  const containers = [];
  const used = [];
  let emptyStreak = 0;
  for (let idx = 0; (remaining.length || idx < fixedConts.length) && containers.length < maxC; idx++) {
    const fx = fixedConts[idx];
    const spec = fx ? fx.spec : nextSpec();
    if (!spec) break; // hết số lượng cont cho phép
    const init = fx ? fx.boxes : [];
    if (!remaining.length) { containers.push({ boxes: init, left: [], spec }); continue; }
    let best = null, bestName = null;
    for (const name of names) {
      const r = packOne(sortUnits(remaining, STRATEGIES[name]), spec, o, init);
      if (!best || volOf(r) > volOf(best)) { best = r; bestName = name; }
    }
    best.spec = spec;
    if (!best.boxes.length) {
      // loại cont này không chứa được kiện nào còn lại — thử loại kế tiếp (tối đa vài lần để tránh lặp vô hạn)
      if (++emptyStreak > rows.length + 1) break;
      continue;
    }
    emptyStreak = 0;
    containers.push(best);
    if (best.boxes.length > init.length) used.push(bestName);
    remaining = best.left;
  }
  return { strategy: [...new Set(used)].join(', '), containers, unplaced: remaining, container: rows[0].spec, totalUnits: expand(items).length };
}

/**
 * Gom kiện lên pallet (giai đoạn 1 của "xếp pallet rồi vào cont").
 * P = { l, w, h (dày pallet), weight (kg pallet), maxH (cao tối đa cả pallet), kg (tải tối đa trên pallet) }
 * Trả về { pallets: [boxes đã xếp trên từng pallet (toạ độ trên mặt pallet)], loose: [kiện không vừa pallet → xếp rời] }
 */
export function palletize(items, P, opt = {}) {
  const o = { minSupport: 0.75, ...opt };
  const spec = { l: +P.l, w: +P.w, h: Math.max(1, +P.maxH - +P.h), maxWeight: +P.kg > 0 ? +P.kg : Infinity };
  const fits = u => u.weight <= spec.maxWeight && orientations(u).some(([l, w, h]) => l <= spec.l + EPS && w <= spec.w + EPS && h <= spec.h + EPS);
  const loose = [];
  let rem = expand(items).filter(u => fits(u) || (loose.push(u), false));
  const volOf = r => r.boxes.reduce((t, b) => t + b.l * b.w * b.h, 0);
  const pallets = [];
  while (rem.length && pallets.length < 2000) {
    let best = null;
    for (const name of Object.keys(STRATEGIES)) {
      const r = packOne(sortUnits(rem, STRATEGIES[name]), spec, o, []);
      if (!best || volOf(r) > volOf(best)) best = r;
    }
    if (!best.boxes.length) { loose.push(...rem); break; }
    pallets.push(best.boxes);
    rem = best.left;
  }
  return { pallets, loose };
}

/** Thống kê cho 1 container */
export function stats(c, C) {
  const vol = c.boxes.reduce((t, b) => t + b.l * b.w * b.h, 0);
  const weight = c.boxes.reduce((t, b) => t + b.unit.weight, 0);
  let cx = 0, cy = 0, cz = 0;
  for (const b of c.boxes) {
    cx += (b.x + b.l / 2) * b.unit.weight;
    cy += (b.y + b.w / 2) * b.unit.weight;
    cz += (b.z + b.h / 2) * b.unit.weight;
  }
  const len = c.boxes.reduce((m, b) => Math.max(m, b.x + b.l), 0);
  return {
    count: c.boxes.length,
    volume: vol / 1e9,
    volPct: vol / (C.l * C.w * C.h) * 100,
    weight,
    wPct: C.maxWeight ? weight / C.maxWeight * 100 : 0,
    cog: weight ? { x: cx / weight, y: cy / weight, z: cz / weight } : null,
    usedLength: len,
  };
}
