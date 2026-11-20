import { plan } from './packer.js';

self.onmessage = e => {
  const { items, container, fleet, opt, fixed } = e.data;
  try {
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
