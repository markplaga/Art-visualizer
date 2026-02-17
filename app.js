const state = {
  points: [],
  closed: false,
  nested: [],
  undo: [],
  redo: []
};

const tab2dBtn = document.getElementById("tab2dBtn");
const tab3dBtn = document.getElementById("tab3dBtn");
const tab2d = document.getElementById("tab2d");
const tab3d = document.getElementById("tab3d");
const curveCanvas = document.getElementById("curveCanvas");
const ribCanvas = document.getElementById("ribCanvas");
const cctx = curveCanvas.getContext("2d");
const rctx = ribCanvas.getContext("2d");
const status = document.getElementById("status");

const controls = {
  initialScale: document.getElementById("initialScale"),
  finalScale: document.getElementById("finalScale"),
  minLast: document.getElementById("minLast"),
  interpolation: document.getElementById("interpolation"),
  startColor: document.getElementById("startColor"),
  endColor: document.getElementById("endColor"),
  thickness: document.getElementById("thickness"),
  pivotT: document.getElementById("pivotT"),
  rotation: document.getElementById("rotation"),
  sideColor: document.getElementById("sideColor")
};

function snapshot() {
  state.undo.push(JSON.stringify({ points: state.points, closed: state.closed }));
  if (state.undo.length > 50) state.undo.shift();
  state.redo.length = 0;
}
function restore(serialized) {
  const v = JSON.parse(serialized);
  state.points = v.points;
  state.closed = v.closed;
}

document.getElementById("undoBtn").onclick = () => {
  if (!state.undo.length) return;
  state.redo.push(JSON.stringify({ points: state.points, closed: state.closed }));
  restore(state.undo.pop());
  renderAll();
};
document.getElementById("redoBtn").onclick = () => {
  if (!state.redo.length) return;
  state.undo.push(JSON.stringify({ points: state.points, closed: state.closed }));
  restore(state.redo.pop());
  renderAll();
};

tab2dBtn.onclick = () => switchTab(true);
tab3dBtn.onclick = () => switchTab(false);
function switchTab(twoD) {
  tab2dBtn.classList.toggle("active", twoD);
  tab3dBtn.classList.toggle("active", !twoD);
  tab2d.classList.toggle("active", twoD);
  tab3d.classList.toggle("active", !twoD);
  if (!twoD) render3D();
}

for (const id of ["initialScale", "finalScale", "minLast", "pivotT", "rotation", "thickness"]) {
  controls[id].oninput = () => {
    document.getElementById(`${id}Val`).textContent = controls[id].value;
    generateNested();
    renderAll();
  };
}
for (const id of ["interpolation", "startColor", "endColor", "sideColor"]) {
  controls[id].oninput = () => {
    generateNested();
    renderAll();
  };
}

let dragging = -1;
curveCanvas.addEventListener("pointerdown", (e) => {
  const p = pointer(e, curveCanvas);
  const idx = nearestPointIndex(p);
  if (idx >= 0 && dist(p, state.points[idx]) < 16) {
    snapshot();
    dragging = idx;
    return;
  }
  if (state.closed) return;
  snapshot();
  if (state.points.length >= 3 && dist(p, state.points[0]) <= 18) {
    state.closed = true;
    status.textContent = "Curve auto-closed.";
  } else {
    state.points.push(p);
    status.textContent = `Added point ${state.points.length}.`;
  }
  generateNested();
  renderAll();
});
curveCanvas.addEventListener("pointermove", (e) => {
  if (dragging < 0) return;
  state.points[dragging] = pointer(e, curveCanvas);
  generateNested();
  renderAll();
});
window.addEventListener("pointerup", () => dragging = -1);

function pointer(e, canvas) {
  const r = canvas.getBoundingClientRect();
  return { x: ((e.clientX - r.left) / r.width) * canvas.width, y: ((e.clientY - r.top) / r.height) * canvas.height };
}
function nearestPointIndex(p) {
  let best = -1, d = Infinity;
  state.points.forEach((pt, i) => {
    const v = dist(pt, p);
    if (v < d) { d = v; best = i; }
  });
  return best;
}
function dist(a, b) { return Math.hypot(a.x - b.x, a.y - b.y); }

function interp(t) {
  const mode = controls.interpolation.value;
  if (mode === "linear") return t;
  if (mode === "cubic_spline") return t * t * t;
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function generateNested() {
  state.nested = [];
  if (!state.closed || state.points.length < 3) return;

  const init = Number(controls.initialScale.value) / 100;
  const final = Number(controls.finalScale.value) / 100;
  const minLast = Number(controls.minLast.value) / 100;
  const maxCount = 200;

  const centroid = state.points.reduce((a, p) => ({ x: a.x + p.x / state.points.length, y: a.y + p.y / state.points.length }), { x: 0, y: 0 });
  let current = state.points.map(p => ({ ...p }));
  let cumulative = 1;

  for (let i = 0; i < maxCount; i++) {
    const t = i / Math.max(1, maxCount - 1);
    const k = init + (final - init) * interp(t);
    cumulative *= k;
    if (cumulative <= minLast) break;
    current = current.map(p => ({ x: centroid.x + (p.x - centroid.x) * k, y: centroid.y + (p.y - centroid.y) * k }));
    state.nested.push(current.map(p => ({ ...p })));
  }
  status.textContent = `Generated ${state.nested.length} nested curves.`;
}

function hexToRgb(hex) {
  const v = parseInt(hex.slice(1), 16);
  return { r: (v >> 16) & 255, g: (v >> 8) & 255, b: v & 255 };
}
function mixColor(a, b, t) {
  const x = (u, v) => Math.round(u + (v - u) * t);
  return `rgba(${x(a.r,b.r)},${x(a.g,b.g)},${x(a.b,b.b)},1)`;
}

function drawClosedPath(ctx, pts) {
  if (!pts.length) return;
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
}

function render2D() {
  cctx.clearRect(0, 0, curveCanvas.width, curveCanvas.height);
  cctx.fillStyle = "#fafafa";
  cctx.fillRect(0, 0, curveCanvas.width, curveCanvas.height);

  const a = hexToRgb(controls.startColor.value);
  const b = hexToRgb(controls.endColor.value);

  if (state.closed) {
    drawClosedPath(cctx, state.points);
    cctx.strokeStyle = "#222";
    cctx.lineWidth = 2;
    cctx.stroke();
  }

  state.nested.forEach((curve, i) => {
    const t = i / Math.max(1, state.nested.length - 1);
    drawClosedPath(cctx, curve);
    cctx.fillStyle = mixColor(a, b, t);
    cctx.globalAlpha = 0.2;
    cctx.fill();
    cctx.globalAlpha = 1;
    cctx.strokeStyle = mixColor(a, b, t);
    cctx.stroke();
  });

  cctx.fillStyle = "#c21616";
  state.points.forEach((p, i) => {
    cctx.beginPath();
    cctx.arc(p.x, p.y, i === 0 ? 6 : 4, 0, Math.PI * 2);
    cctx.fill();
  });
}

function render3D() {
  rctx.clearRect(0, 0, ribCanvas.width, ribCanvas.height);
  rctx.fillStyle = "#f8f8ff";
  rctx.fillRect(0, 0, ribCanvas.width, ribCanvas.height);

  const thickness = Number(controls.thickness.value) * 20;
  const rot = Number(controls.rotation.value) * Math.PI / 180;
  const pivotT = Number(controls.pivotT.value);
  const side = hexToRgb(controls.sideColor.value);

  const curves = [state.points, ...state.nested].filter(c => c.length >= 3);
  const ribs = [];
  for (let i = 0; i < curves.length - 1; i++) ribs.push({ outer: curves[i], inner: curves[i + 1], z: i * thickness });

  ribs.forEach((rib, i) => {
    const t = i / Math.max(1, ribs.length - 1);
    const topColor = mixColor(hexToRgb(controls.startColor.value), hexToRgb(controls.endColor.value), t);
    const pivot = rib.outer[Math.floor((rib.outer.length - 1) * pivotT)] || { x: ribCanvas.width / 2, y: ribCanvas.height / 2 };

    const drawProjected = (pts, offsetZ, fillStyle) => {
      rctx.beginPath();
      pts.forEach((p, idx) => {
        const x = p.x - pivot.x;
        const y = p.y - pivot.y;
        const rx = x * Math.cos(rot) - y * Math.sin(rot);
        const ry = x * Math.sin(rot) + y * Math.cos(rot);
        const sx = pivot.x + rx + offsetZ * 0.45;
        const sy = pivot.y + ry - offsetZ * 0.35;
        if (idx === 0) rctx.moveTo(sx, sy); else rctx.lineTo(sx, sy);
      });
      rctx.closePath();
      rctx.fillStyle = fillStyle;
      rctx.fill();
      rctx.strokeStyle = "#2226";
      rctx.stroke();
    };

    drawProjected(rib.outer, rib.z + thickness, topColor);
    drawProjected(rib.inner, rib.z + thickness, "#ffffff");

    rctx.globalAlpha = 0.45;
    drawProjected(rib.outer, rib.z, `rgba(${side.r},${side.g},${side.b},1)`);
    drawProjected(rib.inner, rib.z, "rgba(255,255,255,1)");
    rctx.globalAlpha = 1;
  });
}

function renderAll() {
  render2D();
  render3D();
}

document.getElementById("exportBtn").onclick = () => {
  const curves = [state.points, ...state.nested].filter(c => c.length >= 3);
  if (!curves.length) {
    status.textContent = "Nothing to export.";
    return;
  }
  const a = hexToRgb(controls.startColor.value);
  const b = hexToRgb(controls.endColor.value);
  const pathFor = (curve) => `M ${curve.map(p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" L ")} Z`;

  const svg = `<?xml version="1.0" encoding="UTF-8"?>\n<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${curveCanvas.width} ${curveCanvas.height}">\n${curves.map((c,i)=>{
    const t=i/Math.max(1,curves.length-1);
    const color=mixColor(a,b,t);
    return `<path d="${pathFor(c)}" fill="${color}" fill-opacity="0.2" stroke="${color}" stroke-width="2" />`;
  }).join("\n")}\n</svg>`;

  const blob = new Blob([svg], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const aLink = document.createElement("a");
  aLink.href = url;
  aLink.download = "nested-shape-art.svg";
  aLink.click();
  URL.revokeObjectURL(url);
  status.textContent = "SVG exported.";
};

generateNested();
renderAll();
