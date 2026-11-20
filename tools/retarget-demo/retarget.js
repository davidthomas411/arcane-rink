// Pose -> avatar retargeting demo.
// Input: MediaPipe world landmarks (metres, hips-centred, x right, y down, z away from camera),
// the stick heel and puck positions in image pixels, and estimated camera geometry.
// Output: a jointed hockey skater, in the game's colours, that moves like the player.
import * as THREE from './vendor/three.module.js';
const D = await (await fetch('data.json')).json();
const P = D.params;
const N = D.t.length;

// ---- coordinates -------------------------------------------------------------------------
// Scene: x right, y up, camera looks down -z (so "away from the camera" is negative z).
const floorFromPixel = (x, y) => {
  const Z = (P.f * P.camH) / Math.max(1, y - P.yh);        // distance from camera, metres
  return new THREE.Vector3(((x - P.cx) * Z) / P.f, 0, -Z);
};
const V = (a) => new THREE.Vector3(a[0], a[1], a[2]);
const up = new THREE.Vector3(0, 1, 0);

// ---- renderer / scene ----------------------------------------------------------------------
const canvas = document.getElementById('c');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, preserveDrawingBuffer: true });
renderer.setPixelRatio(1); renderer.setSize(1920, 540, false);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.15;
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
const scene = new THREE.Scene();
const tl = new THREE.TextureLoader();
const load = (u) => new Promise((r) => tl.load(u, r));
const hall = await load('assets/hall.jpg'); hall.colorSpace = THREE.SRGBColorSpace;
scene.background = hall; scene.backgroundIntensity = 0.55; scene.fog = new THREE.Fog(0x0b0d12, 8, 22);
const iceTex = await load('assets/ice.jpg'); iceTex.colorSpace = THREE.SRGBColorSpace;
iceTex.wrapS = iceTex.wrapT = THREE.RepeatWrapping; iceTex.repeat.set(15, 15);
const ice = new THREE.Mesh(new THREE.PlaneGeometry(90, 90), new THREE.MeshStandardMaterial({ map: iceTex, color: 0xa9cfee, roughness: 0.22, metalness: 0.12 }));
ice.rotation.x = -Math.PI / 2; ice.position.set(0, 0, -6); ice.receiveShadow = true; scene.add(ice);
scene.add(new THREE.HemisphereLight(0xc4dcff, 0x1a1410, 1.0));
const key = new THREE.DirectionalLight(0xfff1dc, 2.4); key.position.set(-2.5, 6, 1.5); key.target.position.set(0, 0, -3.4);
key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -5, right: 5, top: 5, bottom: -5, far: 20 }); key.shadow.bias = -0.0006;
scene.add(key, key.target);
for (const [x, z] of [[-3.4, -2.2], [3.6, -2.2]]) { const l = new THREE.PointLight(0xff9a3c, 3.2, 12, 1.8); l.position.set(x, 2.6, z); scene.add(l); }

// The cabinet the puck rebounded off becomes a game rebounder (boards with a gold cap), same place.
const cabZ = (P.f * P.camH) / (785 - P.yh);
const wood = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.7 });
const gold = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.35, metalness: 0.7 });
const reb = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.5, 0.3), wood); reb.position.set(0.12, 0.25, -(cabZ + 0.2)); reb.castShadow = reb.receiveShadow = true; scene.add(reb);
const rebCap = new THREE.Mesh(new THREE.BoxGeometry(1.96, 0.06, 0.36), gold); rebCap.position.set(0.12, 0.53, -(cabZ + 0.2)); scene.add(rebCap);
for (let i = 0; i < 7; i++) {   // crystals on top, like the game's rebounder
  const h = 0.22 + ((i * 37) % 5) * 0.03;
  const c = new THREE.Mesh(new THREE.ConeGeometry(0.07, h, 5), new THREE.MeshStandardMaterial({ color: 0x6fb6ea, emissive: 0x1c4f7a, roughness: 0.25 }));
  c.position.set(-0.7 + i * 0.27, 0.56 + h / 2, -(cabZ + 0.2)); c.castShadow = true; scene.add(c);
}

// ---- the avatar ------------------------------------------------------------------------------
const COLOR = { jersey: 0xc8553d, trim: 0xd4af37, pants: 0x17181c, skin: 0xd9a57e, glove: 0x1a1a1d, skate: 0x0b0b0d, stick: 0x9a6b3c };
const M = (c, r = 0.65, m = 0.08) => new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
const shadowed = (o) => { o.castShadow = true; return o; };
const limbs = {};
const cyl = (name, r, color) => { const m = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.88, 1, 14), M(color))); scene.add(m); limbs[name] = m; return m; };
const ball = (name, r, color) => { const m = shadowed(new THREE.Mesh(new THREE.SphereGeometry(r, 16, 12), M(color))); scene.add(m); limbs[name] = m; return m; };
cyl('thighL', 0.085, COLOR.pants); cyl('thighR', 0.085, COLOR.pants); cyl('shinL', 0.065, COLOR.pants); cyl('shinR', 0.065, COLOR.pants);
cyl('upperL', 0.065, COLOR.jersey); cyl('upperR', 0.065, COLOR.jersey); cyl('foreL', 0.052, COLOR.jersey); cyl('foreR', 0.052, COLOR.jersey);
cyl('torso', 0.15, COLOR.jersey); cyl('hips', 0.11, COLOR.pants); cyl('shoulders', 0.085, COLOR.jersey); cyl('neck', 0.05, COLOR.skin); cyl('band', 0.158, COLOR.trim);
for (const n of ['kneeL', 'kneeR']) ball(n, 0.075, COLOR.pants);
for (const n of ['elbowL', 'elbowR', 'shL', 'shR']) ball(n, 0.075, COLOR.jersey);
for (const n of ['gloveL', 'gloveR']) ball(n, 0.07, COLOR.glove);
ball('hipL', 0.09, COLOR.pants); ball('hipR', 0.09, COLOR.pants);
const skate = (name) => { const m = shadowed(new THREE.Mesh(new THREE.BoxGeometry(1, 0.1, 0.09), M(COLOR.skate, 0.4))); scene.add(m); limbs[name] = m; };
skate('skateL'); skate('skateR');
const head = new THREE.Group(); scene.add(head);
head.add(shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.105, 18, 14), M(COLOR.skin, 0.8))));
const helmet = shadowed(new THREE.Mesh(new THREE.SphereGeometry(0.128, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.58), M(COLOR.trim, 0.35, 0.3))); helmet.position.y = 0.012; head.add(helmet);
const visor = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.07, 0.15), new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.45, roughness: 0.1 })); visor.position.set(0.1, -0.005, 0); head.add(visor);
const stick = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.012, 1, 8), M(COLOR.stick, 0.6))); scene.add(stick);
const blade = shadowed(new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.075, 0.035), M(0x1a1a1a, 0.5))); scene.add(blade);
const puck = shadowed(new THREE.Mesh(new THREE.CylinderGeometry(0.0375, 0.0375, 0.025, 20), new THREE.MeshStandardMaterial({ color: 0x1fae8c, emissive: 0x18c9a0, emissiveIntensity: 1.4, roughness: 0.4 }))); scene.add(puck);
const puckRing = new THREE.Mesh(new THREE.RingGeometry(0.085, 0.11, 28), new THREE.MeshBasicMaterial({ color: 0xff5a4a, transparent: true, opacity: 0.9, depthWrite: false })); puckRing.rotation.x = -Math.PI / 2; scene.add(puckRing);

const trailGeo = new THREE.BufferGeometry(); trailGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(31 * 3), 3));
const trail = new THREE.Line(trailGeo, new THREE.LineBasicMaterial({ color: 0x40e0ff })); trail.frustumCulled = false; scene.add(trail);
const seg = (m, a, b) => { const d = b.clone().sub(a); const L = d.length() || 1e-6; m.position.copy(a).addScaledVector(d, 0.5); m.scale.set(1, L, 1); m.quaternion.setFromUnitVectors(up, d.divideScalar(L)); };
const at = (m, p) => m.position.copy(p);
// Which hand is the top hand on the stick: the one that is higher on average (so it never flips frame to frame).
const handHeight = (k) => D.world.reduce((s, w) => s - w[k][1], 0) / N;
const TOP = handHeight(15) > handHeight(16) ? 15 : 16, BOT = TOP === 15 ? 16 : 15;
// Facing direction of the player (for the blade), averaged over the clip.
let fwd = new THREE.Vector3();
for (const w of D.world) { const r = V(w[12]).sub(V(w[11])); r.y = 0; r.z *= -1; fwd.add(new THREE.Vector3().crossVectors(up, r.normalize())); }
fwd.normalize();

function setFrame(i) {
  const w = D.world[i], px = D.px[i];
  // Root: lateral position from the image, fixed depth and height (the player is planted).
  const hipPx = (px[23][0] + px[24][0]) / 2;
  const root = new THREE.Vector3((hipPx - P.cx) / P.sp, P.H0, -P.Zg);
  const J = (k) => new THREE.Vector3(root.x + w[k][0], root.y - w[k][1], root.z - w[k][2]);
  const j = {}; for (const k of [0, 7, 8, 11, 12, 13, 14, 15, 16, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32]) j[k] = J(k);
  const hipMid = j[23].clone().add(j[24]).multiplyScalar(0.5), shMid = j[11].clone().add(j[12]).multiplyScalar(0.5);
  const earMid = j[7].clone().add(j[8]).multiplyScalar(0.5);
  seg(limbs.thighL, j[23], j[25]); seg(limbs.thighR, j[24], j[26]); seg(limbs.shinL, j[25], j[27]); seg(limbs.shinR, j[26], j[28]);
  seg(limbs.upperL, j[11], j[13]); seg(limbs.upperR, j[12], j[14]); seg(limbs.foreL, j[13], j[15]); seg(limbs.foreR, j[14], j[16]);
  seg(limbs.torso, hipMid, shMid); seg(limbs.hips, j[23], j[24]); seg(limbs.shoulders, j[11], j[12]);
  seg(limbs.band, hipMid.clone().lerp(shMid, 0.1), hipMid.clone().lerp(shMid, 0.22));
  seg(limbs.neck, shMid, earMid.clone().lerp(shMid, 0.25));
  at(limbs.kneeL, j[25]); at(limbs.kneeR, j[26]); at(limbs.elbowL, j[13]); at(limbs.elbowR, j[14]);
  at(limbs.shL, j[11]); at(limbs.shR, j[12]); at(limbs.gloveL, j[15]); at(limbs.gloveR, j[16]); at(limbs.hipL, j[23]); at(limbs.hipR, j[24]);
  for (const [name, heel, toe] of [['skateL', 29, 31], ['skateR', 30, 32]]) {
    const a = J(heel), b = J(toe), m = limbs[name]; const d = b.clone().sub(a); const L = Math.max(0.12, d.length());
    m.position.copy(a).addScaledVector(d, 0.5); m.position.y = Math.max(m.position.y, 0.05); m.scale.set(L + 0.05, 1, 1);
    m.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), d.lengthSq() > 1e-6 ? d.normalize() : new THREE.Vector3(1, 0, 0));
  }
  // Head: orientation from nose and ears.
  const f = j[0].clone().sub(earMid).normalize(); const l = j[7].clone().sub(j[8]).normalize();
  const hu = new THREE.Vector3().crossVectors(f, l).normalize(); const hr = new THREE.Vector3().crossVectors(f, hu).normalize();
  head.position.copy(earMid).addScaledVector(hu, 0.03).addScaledVector(f, 0.01);
  head.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(f, hu, hr));
  // Stick: from the detected blade (heel and toe, from the image) up through the top hand, plus a little butt end.
  const heel = floorFromPixel(D.heel[i][0], D.heel[i][1]); heel.y = 0.035;
  const toe = floorFromPixel(D.toe[i][0], D.toe[i][1]); toe.y = 0.035;
  const hTop = j[TOP]; const d = hTop.clone().sub(heel).normalize();
  seg(stick, heel, hTop.clone().addScaledVector(d, 0.25));
  const bd = toe.clone().sub(heel); const bl = Math.max(0.12, bd.length());
  blade.scale.set(bl / 0.32, 1, 1); blade.position.copy(heel).addScaledVector(bd, 0.5); blade.position.y = 0.04;
  blade.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), bd.setY(0).normalize());
  // Puck
  const pk = floorFromPixel(D.puck[i][0], D.puck[i][1]); pk.y = 0.0125;
  puck.position.copy(pk); puckRing.position.set(pk.x, 0.01, pk.z); puckRing.visible = !D.hidden[i];
  puck.visible = true;
  const tp = trailGeo.getAttribute('position'); let n = 0;
  for (let k = Math.max(0, i - 30); k <= i; k++) { const q = floorFromPixel(D.puck[k][0], D.puck[k][1]); tp.setXYZ(n++, q.x, 0.02, q.z); }
  trailGeo.setDrawRange(0, n); tp.needsUpdate = true;
  return { root, hipMid };
}

// ---- cameras -------------------------------------------------------------------------------
const vfov = (2 * Math.atan(540 / P.f) * 180) / Math.PI;
const camA = new THREE.PerspectiveCamera(vfov, 16 / 9, 0.05, 80);        // same view as the phone
camA.position.set(0, P.camH, 0); camA.lookAt(0, P.camH, -10);
const camB = new THREE.PerspectiveCamera(42, 16 / 9, 0.05, 80);          // elevated view from the other side
camB.position.set(3.7, 2.1, -0.9); camB.lookAt(0.1, 0.7, -3.5);
window.renderFrame = (i) => {
  setFrame(i);
  renderer.setScissorTest(true);
  renderer.setViewport(0, 0, 960, 540); renderer.setScissor(0, 0, 960, 540); renderer.render(scene, camA);
  renderer.setViewport(960, 0, 960, 540); renderer.setScissor(960, 0, 960, 540); renderer.render(scene, camB);
};
window.frameCount = N; window.ready = true;
