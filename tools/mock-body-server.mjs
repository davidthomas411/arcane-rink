// A stand-in for the Fast SAM 3D Body webcam server, for trying the body-tracking
// features without a GPU. It speaks the same protocol (GET /topology, WebSocket
// /stream) and answers every frame with a simple animated figure whose head nods
// up and down every few seconds.
//
//   node tools/mock-body-server.mjs [port]
import http from "node:http";
import { WebSocketServer } from "ws";

const port = Number(process.argv[2] ?? 8098);
const parts = [];
const faces = [];
let count = 0;

/** Add an ellipsoid; returns the index range so it can be moved later. */
function blob(cx, cy, cz, rx, ry, rz, seg = 10) {
  const start = count;
  for (let i = 0; i <= seg; i += 1) {
    const v = (i / seg) * Math.PI;
    for (let j = 0; j <= seg; j += 1) {
      const u = (j / seg) * Math.PI * 2;
      parts.push([cx + Math.sin(v) * Math.cos(u) * rx, cy + Math.cos(v) * ry, cz + Math.sin(v) * Math.sin(u) * rz]);
      count += 1;
    }
  }
  for (let i = 0; i < seg; i += 1) {
    for (let j = 0; j < seg; j += 1) {
      const a = start + i * (seg + 1) + j;
      const b = a + seg + 1;
      faces.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  return [start, count];
}

// Camera coordinates: x right, y DOWN, z away. The figure stands about 3 m away.
const Z = 3;
const head = blob(0, -0.62, Z, 0.11, 0.13, 0.12);
blob(0, -0.2, Z, 0.2, 0.3, 0.13); // torso
blob(0, 0.14, Z, 0.19, 0.12, 0.13); // hips
const armL = blob(-0.3, -0.15, Z - 0.1, 0.06, 0.3, 0.06);
const armR = blob(0.3, -0.15, Z - 0.1, 0.06, 0.3, 0.06);
blob(-0.11, 0.55, Z, 0.08, 0.35, 0.08);
blob(0.11, 0.55, Z, 0.08, 0.35, 0.08);
const base = parts.map((p) => [...p]);

function pose(t) {
  const nod = Math.sin(t * 0.8) > 0.3 ? 1 : 0; // looking down part of the time
  const sway = Math.sin(t * 3) * 0.12;
  const out = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    let [x, y, z] = base[i];
    if (i >= head[0] && i < head[1]) { y += nod * 0.05; z -= nod * 0.06; }
    if (i >= armL[0] && i < armL[1]) x += sway;
    if (i >= armR[0] && i < armR[1]) x += sway;
    out[i * 3] = x + Math.sin(t * 0.5) * 0.05;
    out[i * 3 + 1] = y;
    out[i * 3 + 2] = z;
  }
  // 70 keypoints in a 640x360 picture; only the ones the game reads are meaningful.
  const k2 = Array.from({ length: 70 }, () => [320, 180]);
  const k3 = Array.from({ length: 70 }, () => [0, 0, Z]);
  const set = (i, x, y, z) => { k3[i] = [x, y, z]; k2[i] = [320 + (x / z) * 500, 180 + (y / z) * 500]; };
  set(0, 0, -0.6 + nod * 0.09, Z - 0.12 + nod * 0.02); // nose
  set(3, -0.09, -0.63, Z); set(4, 0.09, -0.63, Z); // ears
  set(5, -0.2, -0.45, Z); set(6, 0.2, -0.45, Z); // shoulders
  set(9, -0.11, 0.15, Z); set(10, 0.11, 0.15, Z); // hips
  set(11, -0.11, 0.5, Z - 0.1); set(12, 0.11, 0.5, Z - 0.1); // knees
  set(13, -0.11, 0.88, Z); set(14, 0.11, 0.88, Z); // ankles
  set(62, -0.22 + sway, 0.0, Z - 0.25); set(41, 0.12 + sway, 0.2, Z - 0.35); // wrists
  return { out, k2, k3 };
}

const server = http.createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/topology") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify({ ready: true, vertex_count: count, faces }));
  } else {
    res.end("mock body server");
  }
});
const wss = new WebSocketServer({ server, path: "/stream" });
wss.on("connection", (ws) => {
  let meta = null;
  ws.on("message", (data, isBinary) => {
    if (!isBinary) { meta = JSON.parse(data.toString()); return; }
    const m = meta ?? {};
    setTimeout(() => {
      const { out, k2, k3 } = pose(Date.now() / 1000);
      ws.send(JSON.stringify({ no_person: false, inference_ms: 85, capture_timestamp_ms: m.capture_timestamp_ms, pred_keypoints_2d: k2, pred_keypoints_3d: k3, pred_cam_t: [0, 0, 0], focal_length: 500 }));
      ws.send(out);
    }, 110);
  });
});
server.listen(port, () => console.log(`Mock body server on http://localhost:${port} (${count} vertices)`));
