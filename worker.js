import { plan, palletize } from './packer.js';

const PAL_COLOR = '#b08350';

self.onmessage = e => {
  const { items, container, fleet, opt, fixed } = e.data;
  try {
    if (opt.pallet && !(fixed && fixed.length)) return self.postMessage(planWithPallets(items, fleet || container, opt));
    const r = plan(items, fleet || container, opt, fixed || []);
    // Bỏ tham chiếu vòng / dữ liệu thừa trước khi gửi về
    const containers = r.containers.map(c => ({
      spec: c.spec,
      boxes: c.boxes.map(b => ({ x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, h: b.h, step: b.step, t: b.unit.typeIndex, loadOn: b.loadOn })),
    }));
    const unplaced = {};
    r.unplaced.forEach(u => { unplaced[u.typeIndex] = (unplaced[u.typeIndex] || 0) + 1; });
    self.postMessage({ ok: true, strategy: r.strategy, containers, unplaced, totalUnits: r.totalUnits });
  } catch (err) {
    self.postMessage({ ok: false, error: String(err && err.stack || err) });
  }
};

/** Giai đoạn 1: gom kiện lên pallet · Giai đoạn 2: xếp pallet (coi như 1 khối) + kiện rời vào cont,
 *  rồi bung từng pallet thành tấm pallet + các kiện trên nó để hiển thị / xếp tay / xuất báo cáo như bình thường. */
function planWithPallets(items, fleet, opt) {
  const P = opt.pallet;
  const { pallets, loose } = palletize(items, P, opt);
  const pt = items.length; // chỉ số loại "Pallet" thêm vào cuối danh sách kiện
  const looseN = items.map(() => 0); loose.forEach(u => looseN[u.typeIndex]++);
  const V = [
    ...pallets.map((bx, i) => {
      const top = bx.reduce((m, b) => Math.max(m, b.z + b.h), 0);
      return { name: 'Pallet ' + (i + 1), l: +P.l, w: +P.w, h: +P.h + top, qty: 1, rotate: 'upright',
        weight: +P.weight + bx.reduce((s, b) => s + b.unit.weight, 0),
        stackable: !!P.stack && bx.every(b => b.unit.stackable), maxLoad: 0, floorOnly: !P.stack,
        priority: Math.min(...bx.map(b => b.unit.priority || 1)), _pal: i };
    }),
    ...items.map((it, t) => ({ ...it, qty: looseN[t], _t: t })),
  ];
  const r = plan(V, fleet, opt, []);
  const containers = r.containers.map(c => {
    const out = [];
    for (const b of c.boxes) {
      const u = b.unit;
      if (u._pal == null) { out.push({ x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, h: b.h, t: u._t }); continue; }
      const rot = Math.abs(b.l - +P.l) > 0.5; // pallet bị xoay 90° trong cont
      out.push({ x: b.x, y: b.y, z: b.z, l: b.l, w: b.w, h: +P.h, t: pt, pal: u._pal + 1 });
      for (const q of pallets[u._pal]) {
        const lx = rot ? q.y : q.x, ly = rot ? +P.l - (q.x + q.l) : q.y;
        out.push({ x: b.x + lx, y: b.y + ly, z: b.z + +P.h + q.z, l: rot ? q.w : q.l, w: rot ? q.l : q.w, h: q.h, t: q.unit.typeIndex, pal: u._pal + 1 });
      }
    }
    out.forEach((b, i) => { b.step = i + 1; b.loadOn = 0; });
    return { spec: c.spec, boxes: out };
  });
  const unplaced = {};
  for (const u of r.unplaced) {
    if (u._pal == null) unplaced[u._t] = (unplaced[u._t] || 0) + 1;
    else { unplaced[pt] = (unplaced[pt] || 0) + 1; for (const q of pallets[u._pal]) unplaced[q.unit.typeIndex] = (unplaced[q.unit.typeIndex] || 0) + 1; }
  }
  const palItem = { name: `Pallet ${P.l}×${P.w}`, l: +P.l, w: +P.w, h: +P.h, weight: +P.weight, qty: pallets.length, rotate: 'upright',
    stackable: true, maxLoad: 0, floorOnly: false, priority: 1, color: PAL_COLOR, pallet: true };
  const palInfo = pallets.map((bx, i) => ({ no: i + 1, n: bx.length, h: +P.h + bx.reduce((m, b) => Math.max(m, b.z + b.h), 0),
    kg: +P.weight + bx.reduce((s, b) => s + b.unit.weight, 0), vol: bx.reduce((s, b) => s + b.l * b.w * b.h, 0) }));
  const totalUnits = items.reduce((s, it) => s + (it.qty || 0), 0) + pallets.length;
  return { ok: true, strategy: r.strategy, containers, unplaced, totalUnits, extraItems: pallets.length ? [palItem] : [], palInfo, looseCount: loose.length };
}
