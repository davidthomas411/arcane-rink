import * as THREE from "three";
import type { BodyTracker } from "../league/body/BodyTracker";
import { GuidedPuck, type MatchResult } from "../league/MatchScreen";
import { playCue, startMusic, stopMusic } from "../realm/audio";
import { CLASSES, TIERS } from "../realm/game/classes";
import type { Hero } from "../realm/game/save";
import type { Calibration } from "../realm/input/calibration";
import { GestureDetector } from "../realm/input/Gestures";
import type { PuckSource } from "../realm/input/PuckSource";
import { ArenaRenderer } from "../realm/render/ArenaRenderer";
import { clamp, makeRng } from "../realm/util";
import { RINK, RushSim } from "./RushSim";

const asset = (name: string): string => new URL(`../realm/assets/${name}`, import.meta.url).href;
const HERO_FACES: Record<string, string> = { a: "hero-a.png", k: "hero-k.png" };

type Skater3D = { group: THREE.Group; body: THREE.Group; stick: THREE.Mesh; blade: THREE.Mesh; legs: THREE.Mesh[] };

function mat(color: number, rough = 0.6, metal = 0.1): THREE.MeshStandardMaterial {
  return new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
}

/** A simple hockey player built from primitives; the stick is posed every frame to reach the puck. */
function makeSkater(jersey: number, trim: number): Skater3D {
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  const legs: THREE.Mesh[] = [];
  for (const side of [-1, 1]) {
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.55, 4, 10), mat(0x17181c));
    leg.position.set(side * 0.16, 0.45, 0);
    leg.castShadow = true;
    body.add(leg);
    legs.push(leg);
    const skate = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.1, 0.34), mat(0x0b0b0d, 0.4));
    skate.position.set(side * 0.16, 0.06, -0.05);
    body.add(skate);
  }
  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.27, 0.42, 6, 14), mat(jersey, 0.75));
  torso.position.set(0, 1.12, 0);
  torso.rotation.x = 0.28;
  torso.castShadow = true;
  body.add(torso);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.285, 0.285, 0.12, 16), mat(trim, 0.7));
  band.position.set(0, 0.98, 0.03);
  band.rotation.x = 0.28;
  body.add(band);
  const shoulders = new THREE.Mesh(new THREE.CapsuleGeometry(0.15, 0.42, 4, 10), mat(jersey, 0.75));
  shoulders.rotation.z = Math.PI / 2;
  shoulders.position.set(0, 1.42, -0.08);
  shoulders.castShadow = true;
  body.add(shoulders);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 16, 12), mat(0xd9a57e, 0.8));
  head.position.set(0, 1.68, -0.14);
  body.add(head);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.175, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.62), mat(trim, 0.35, 0.3));
  helmet.position.set(0, 1.7, -0.13);
  helmet.castShadow = true;
  body.add(helmet);
  for (const side of [-1, 1]) {
    const arm = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.45, 4, 8), mat(jersey, 0.75));
    arm.position.set(side * 0.3, 1.18, -0.25);
    arm.rotation.set(-0.9, 0, side * 0.35);
    arm.castShadow = true;
    body.add(arm);
  }
  const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1, 8), mat(0x9a6b3c, 0.6));
  stick.castShadow = true;
  group.add(stick);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.07, 0.05), mat(0x1a1a1a, 0.5));
  group.add(blade);
  return { group, body, stick, blade, legs };
}

function rinkMarkings(): THREE.CanvasTexture {
  const ppm = 34;
  const c = document.createElement("canvas");
  c.width = RINK.halfW * 2 * ppm;
  c.height = RINK.halfL * 2 * ppm;
  const g = c.getContext("2d")!;
  const X = (x: number): number => (x + RINK.halfW) * ppm;
  const Z = (z: number): number => (z + RINK.halfL) * ppm;
  const line = (z: number, color: string, w: number): void => {
    g.strokeStyle = color;
    g.lineWidth = w;
    g.beginPath();
    g.moveTo(0, Z(z));
    g.lineTo(c.width, Z(z));
    g.stroke();
  };
  line(0, "rgba(200,45,40,0.85)", 12);
  line(-RINK.blueLine, "rgba(50,100,220,0.85)", 12);
  line(RINK.blueLine, "rgba(50,100,220,0.85)", 12);
  line(-RINK.goalLine, "rgba(200,45,40,0.85)", 5);
  line(RINK.goalLine, "rgba(200,45,40,0.85)", 5);
  g.lineWidth = 5;
  g.strokeStyle = "rgba(60,120,230,0.8)";
  g.beginPath();
  g.arc(X(0), Z(0), 4.5 * ppm, 0, Math.PI * 2);
  g.stroke();
  g.strokeStyle = "rgba(200,45,40,0.75)";
  for (const z of [-20, 20]) {
    for (const x of [-6.7, 6.7]) {
      g.beginPath();
      g.arc(X(x), Z(z), 4.5 * ppm, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = "rgba(200,45,40,0.75)";
      g.beginPath();
      g.arc(X(x), Z(z), 0.3 * ppm, 0, Math.PI * 2);
      g.fill();
    }
  }
  // Rune ring at centre, creases at both ends.
  g.fillStyle = "rgba(140,200,255,0.55)";
  g.font = `600 ${ppm * 0.7}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊᛏᛒ";
  for (let i = 0; i < runes.length; i += 1) {
    const a = (i / runes.length) * Math.PI * 2;
    g.save();
    g.translate(X(Math.cos(a) * 3.6), Z(Math.sin(a) * 3.6));
    g.rotate(a + Math.PI / 2);
    g.fillText(runes[i]!, 0, 0);
    g.restore();
  }
  for (const side of [-1, 1]) {
    g.fillStyle = "rgba(70,130,230,0.35)";
    g.beginPath();
    g.arc(X(0), Z(side * RINK.goalLine), 1.8 * ppm, side < 0 ? 0 : Math.PI, side < 0 ? Math.PI : Math.PI * 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * Real-time hockey from behind the player's skater on a full-size rink.
 * The skater is the player: a tracked body mesh when the body server is
 * connected, a built-in figure otherwise. Either way the stick follows the real puck.
 */
export class RushScreen {
  private readonly el: HTMLDivElement;
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(50, 16 / 9, 0.1, 220);
  private readonly sim: RushSim;
  private readonly source: PuckSource;
  private readonly guided: GuidedPuck | null;
  private readonly gestures: GestureDetector;
  private readonly floor: ArenaRenderer;
  private readonly me: Skater3D;
  private readonly wings: Skater3D[];
  private readonly wingRings: THREE.Mesh[] = [];
  private readonly goblins: { card: THREE.Mesh; mark: THREE.Mesh }[] = [];
  private readonly goalie: THREE.Mesh;
  private readonly puck: THREE.Mesh;
  private readonly key: THREE.DirectionalLight;
  private readonly goalLight: THREE.PointLight;
  private bodyMesh: THREE.Mesh | null = null;
  private bodyFrom: Float32Array | null = null;
  private bodyTo: Float32Array | null = null;
  private bodyBlend = 1;
  private bodySeen = -1;
  private readonly refs: Record<string, HTMLElement> = {};
  private readonly camPos = new THREE.Vector3(0, 6, 24);
  private readonly camLook = new THREE.Vector3(0, 1, 6);
  private raf = 0;
  private lastMs = 0;
  private seconds = 0;
  private shake = 0;
  private ended = false;
  private upSeconds = 0;
  private upTotal = 0;

  private readonly onKey = (event: KeyboardEvent): void => {
    if (event.key === "Escape") this.finish(false);
  };
  private readonly onResize = (): void => this.layout();

  constructor(
    root: HTMLElement,
    private readonly opts: {
      hero: Hero;
      cal: Calibration;
      demo: boolean;
      body: BodyTracker | null;
      makeSource: (toArena: (cx: number, cy: number) => { x: number; y: number }) => PuckSource;
      onEnd: (result: MatchResult) => void;
    }
  ) {
    const { hero, cal } = opts;
    const cls = CLASSES[hero.classId];
    const face = HERO_FACES[hero.portrait];
    this.el = document.createElement("div");
    this.el.className = "match rush";
    this.el.innerHTML = `
      <canvas class="match-board"></canvas>
      <div class="match-top"><div class="score-plate">
        <div class="team team-home"><small>HOME</small><b>${hero.name.replace(/[<>&]/g, "")}'s Puckbound</b></div>
        <div class="score" data-ref="homeScore">0</div>
        <div class="clock"><small data-ref="period"></small><b data-ref="clock"></b></div>
        <div class="score" data-ref="awayScore">0</div>
        <div class="team team-away"><small>AWAY</small><b>Cryptfang Goblins</b></div>
      </div></div>
      <div class="match-prompt"><div data-ref="prompt"></div><small data-ref="promptSub"></small></div>
      <div class="match-banner" data-ref="banner" hidden><div data-ref="bannerText"></div><small data-ref="bannerSub"></small></div>
      <div class="rush-floor"><canvas class="rush-floor-canvas"></canvas><small>Your floor</small></div>
      <canvas class="rush-map" width="130" height="300"></canvas>
      <div class="match-bottom">
        <div class="frame hero-frame"><div class="portrait" style="border-color:${cls.color}">${face ? `<img src="${asset(face)}" alt="" />` : `<span>${cls.glyph}</span>`}</div>
          <div class="frame-body"><div class="frame-name"><span>${hero.name.replace(/[<>&]/g, "")} #${hero.jersey.replace(/[<>&]/g, "")}</span></div>
          <div class="frame-note" data-ref="note"></div></div></div>
        <div class="moves">
          <span><b>Puck forward</b> skate faster</span>
          <span><b>Puck left / right</b> steer</span>
          <span><b>Move it from the red ring</b> deke</span>
          <span><b>Side crystals</b> pass</span>
          <span><b>Far crystals</b> shoot</span>
        </div>
        <div class="play-side"><div class="tracker-chip" data-ref="tracker"></div>
          <button class="btn btn-small" data-ref="quit" type="button">Leave (Esc)</button></div>
      </div>`;
    root.replaceChildren(this.el);
    this.el.querySelectorAll<HTMLElement>("[data-ref]").forEach((node) => {
      this.refs[node.dataset.ref!] = node;
    });
    this.refs.quit!.addEventListener("click", () => this.finish(false));

    const tier = TIERS[hero.tier];
    this.sim = new RushSim({ w: cal.arenaW, d: cal.arenaD, rebounders: cal.rebounders }, tier, makeRng((Date.now() ^ 0x7f4a7c15) >>> 0));
    this.gestures = new GestureDetector(cal.rebounders, { passMinSpeed: tier.passMinSpeed });
    this.guided = opts.demo ? new GuidedPuck(cal.arenaW, cal.arenaD) : null;
    // The mouse stands in for the puck: the window is the floor.
    this.source = this.guided ?? opts.makeSource((cx, cy) => ({ x: (cx / window.innerWidth) * cal.arenaW, y: (cy / window.innerHeight) * cal.arenaD }));
    this.floor = new ArenaRenderer(this.el.querySelector<HTMLCanvasElement>(".rush-floor-canvas")!, cal.arenaW, cal.arenaD);
    this.floor.heroColor = cls.color;

    this.renderer = new THREE.WebGLRenderer({ canvas: this.el.querySelector<HTMLCanvasElement>(".match-board")!, antialias: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const loader = new THREE.TextureLoader();
    const hall = loader.load(asset("hall.jpg"));
    hall.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = hall;
    this.scene.backgroundIntensity = 0.55;
    this.scene.fog = new THREE.Fog(0x0b0f18, 30, 85);

    const iceTex = loader.load(asset("ice.jpg"));
    iceTex.colorSpace = THREE.SRGBColorSpace;
    iceTex.wrapS = THREE.RepeatWrapping;
    iceTex.wrapT = THREE.RepeatWrapping;
    iceTex.repeat.set(5, 11);
    const ice = new THREE.Mesh(new THREE.PlaneGeometry(RINK.halfW * 2, RINK.halfL * 2), new THREE.MeshStandardMaterial({ map: iceTex, color: 0xa9cfee, roughness: 0.2, metalness: 0.12 }));
    ice.rotation.x = -Math.PI / 2;
    ice.receiveShadow = true;
    this.scene.add(ice);
    const lines = new THREE.Mesh(new THREE.PlaneGeometry(RINK.halfW * 2, RINK.halfL * 2), new THREE.MeshBasicMaterial({ map: rinkMarkings(), transparent: true, depthWrite: false }));
    lines.rotation.x = -Math.PI / 2;
    lines.position.y = 0.01;
    this.scene.add(lines);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 220), mat(0x101218, 0.95));
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -0.03;
    this.scene.add(ground);

    // Boards with a gold cap and glass, plus stone piers down each side for a sense of speed.
    const wood = mat(0x4a3120, 0.7);
    const gold = mat(0xc9a23a, 0.35, 0.7);
    const glass = new THREE.MeshStandardMaterial({ color: 0x9fd0ff, transparent: true, opacity: 0.1, roughness: 0.1 });
    const wall = (w: number, d: number, x: number, z: number): void => {
      const b = new THREE.Mesh(new THREE.BoxGeometry(w, 1.1, d), wood);
      b.position.set(x, 0.55, z);
      b.receiveShadow = true;
      this.scene.add(b);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.06, 0.08, d + 0.06), gold);
      cap.position.set(x, 1.14, z);
      this.scene.add(cap);
      const pane = new THREE.Mesh(new THREE.BoxGeometry(w, 1.4, d * 0.2), glass);
      pane.position.set(x, 1.9, z);
      this.scene.add(pane);
    };
    wall(RINK.halfW * 2 + 0.6, 0.3, 0, -RINK.halfL - 0.15);
    wall(RINK.halfW * 2 + 0.6, 0.3, 0, RINK.halfL + 0.15);
    wall(0.3, RINK.halfL * 2, -RINK.halfW - 0.15, 0);
    wall(0.3, RINK.halfL * 2, RINK.halfW + 0.15, 0);
    const flame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (let z = -RINK.halfL; z <= RINK.halfL; z += 10) {
      for (const side of [-1, 1]) {
        const pier = new THREE.Mesh(new THREE.BoxGeometry(0.9, 7, 0.9), mat(0x2a2c33, 0.9));
        pier.position.set(side * (RINK.halfW + 1.4), 3.5, z);
        this.scene.add(pier);
        const fire = new THREE.Mesh(new THREE.SphereGeometry(0.22, 10, 10), flame);
        fire.position.set(side * (RINK.halfW + 0.85), 3.2, z);
        this.scene.add(fire);
        if (Math.abs(z) % 20 === 10) {
          const torch = new THREE.PointLight(0xff9a3c, 40, 22, 1.7);
          torch.position.set(side * (RINK.halfW + 0.4), 3.4, z);
          this.scene.add(torch);
        }
      }
    }

    // Nets.
    const red = mat(0xc0392b, 0.4, 0.3);
    const mesh = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.18, side: THREE.DoubleSide });
    for (const side of [-1, 1]) {
      const gz = side * RINK.goalLine;
      for (const x of [-RINK.netHalf, RINK.netHalf]) {
        const post = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 1.22, 8), red);
        post.position.set(x, 0.61, gz);
        this.scene.add(post);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, RINK.netHalf * 2, 8), red);
      bar.rotation.z = Math.PI / 2;
      bar.position.set(0, 1.22, gz);
      this.scene.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(RINK.netHalf * 2, 1.22), mesh);
      back.position.set(0, 0.61, gz + side * 1.0);
      this.scene.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(RINK.netHalf * 2, 1.0), mesh);
      top.rotation.x = -Math.PI / 2;
      top.position.set(0, 1.22, gz + side * 0.5);
      this.scene.add(top);
    }
    this.goalLight = new THREE.PointLight(0xff3b2f, 0, 30, 1.5);
    this.goalLight.position.set(0, 3, -RINK.goalLine - 1);
    this.scene.add(this.goalLight);

    this.scene.add(new THREE.HemisphereLight(0xc4dcff, 0x1a1410, 1.0));
    this.key = new THREE.DirectionalLight(0xfff1dc, 2.2);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(2048, 2048);
    this.key.shadow.camera.left = -16;
    this.key.shadow.camera.right = 16;
    this.key.shadow.camera.top = 16;
    this.key.shadow.camera.bottom = -16;
    this.key.shadow.camera.far = 60;
    this.key.shadow.bias = -0.0006;
    this.scene.add(this.key, this.key.target);

    // Skaters.
    const jersey = new THREE.Color(cls.color).getHex();
    this.me = makeSkater(jersey, 0xd4af37);
    this.scene.add(this.me.group);
    this.wings = [makeSkater(0xe9e4d6, 0x7a1c1c), makeSkater(0xe9e4d6, 0x7a1c1c)];
    for (const w of this.wings) {
      this.scene.add(w.group);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.7, 0.92, 40), new THREE.MeshBasicMaterial({ color: 0x58d68d, transparent: true, opacity: 0.8, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.03;
      this.scene.add(ring);
      this.wingRings.push(ring);
    }

    // Goblins are standees of the original painting, facing the camera as defenders do.
    const goblinTex = loader.load(asset("goblin.png"));
    goblinTex.colorSpace = THREE.SRGBColorSpace;
    const tints = [0xffffff, 0xffb0a0, 0xc8b0ff];
    const card = (h: number, tint: number): THREE.Mesh => {
      const m = new THREE.Mesh(new THREE.PlaneGeometry(h * 1.02, h), new THREE.MeshStandardMaterial({ map: goblinTex, color: tint, transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85 }));
      m.castShadow = true;
      m.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: goblinTex, alphaTest: 0.35 });
      this.scene.add(m);
      return m;
    };
    for (let i = 0; i < 3; i += 1) {
      const mark = new THREE.Mesh(new THREE.RingGeometry(0.42, 0.6, 36), new THREE.MeshBasicMaterial({ color: 0xff4a36, transparent: true, opacity: 0.95, depthWrite: false }));
      mark.rotation.x = -Math.PI / 2;
      mark.visible = false;
      this.scene.add(mark);
      this.goblins.push({ card: card(2.1, tints[i]!), mark });
    }
    this.goalie = card(1.9, 0xa8ffb0);

    this.puck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 0.05, 20), new THREE.MeshStandardMaterial({ color: 0x1fae8c, emissive: 0x18c9a0, emissiveIntensity: 1.6, roughness: 0.4 }));
    this.puck.castShadow = true;
    this.scene.add(this.puck);

    window.addEventListener("keydown", this.onKey);
    window.addEventListener("resize", this.onResize);
    this.layout();
    startMusic();
    this.raf = requestAnimationFrame(this.frame);
    if (import.meta.env.DEV) (window as unknown as { __rush?: RushScreen }).__rush = this;
  }

  private layout(): void {
    const canvas = this.renderer.domElement;
    const rect = canvas.getBoundingClientRect();
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(Math.max(2, rect.width), Math.max(2, rect.height), false);
    this.camera.aspect = Math.max(2, rect.width) / Math.max(2, rect.height);
    this.camera.updateProjectionMatrix();
    this.floor.layout({ top: 10, bottom: 10, left: 10, right: 10 });
  }

  private poseSkater(s: Skater3D, x: number, z: number, vx: number, speed: number, time: number, puckX: number | null, puckZ: number): void {
    s.group.position.set(x, 0, z);
    s.body.rotation.z = clamp(-vx * 0.05, -0.3, 0.3);
    s.body.rotation.x = -clamp(speed * 0.02, 0, 0.16);
    const stride = Math.sin(time * (3 + speed)) * clamp(speed / 6, 0.15, 1);
    s.legs[0]!.position.z = stride * 0.22;
    s.legs[1]!.position.z = -stride * 0.22;
    // Stick: from the hands to the puck (or resting on the ice ahead).
    const hands = new THREE.Vector3(0.1, 1.02, -0.38);
    const tip = puckX === null ? new THREE.Vector3(0.45, 0.04, -0.95) : new THREE.Vector3(puckX - x, 0.04, puckZ - z);
    const dir = tip.clone().sub(hands);
    const len = dir.length();
    s.stick.position.copy(hands).addScaledVector(dir, 0.5);
    s.stick.scale.set(1, len, 1);
    s.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
    s.blade.position.copy(tip);
    s.blade.rotation.y = Math.atan2(tip.x, -tip.z) * 0.5;
  }

  /** Stand the tracked body mesh on the ice where the player's skater is, seen from behind. */
  private updateBody(dt: number): void {
    const body = this.opts.body;
    const live = !!body && body.status === "live" && !!body.faces && body.vertexCount > 0;
    if (live && !this.bodyMesh) {
      const geo = new THREE.BufferGeometry();
      geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(body!.vertexCount * 3), 3));
      geo.setIndex(new THREE.BufferAttribute(body!.faces!, 1));
      this.bodyMesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: new THREE.Color(CLASSES[this.opts.hero.classId].color), roughness: 0.45, metalness: 0.4, side: THREE.DoubleSide }));
      this.bodyMesh.castShadow = true;
      this.bodyMesh.frustumCulled = false;
      this.scene.add(this.bodyMesh);
    }
    const mesh = this.bodyMesh;
    this.me.body.visible = !(live && mesh);
    if (!mesh) return;
    mesh.visible = live;
    if (!live) return;
    const frame = body!.latest;
    if (frame && body!.frameId !== this.bodySeen && frame.vertices.length === body!.vertexCount * 3) {
      this.bodySeen = body!.frameId;
      const src = frame.vertices;
      const n = src.length / 3;
      let cx = 0;
      let cz = 0;
      let low = -Infinity;
      for (let i = 0; i < n; i += 1) {
        cx += src[i * 3]!;
        cz += src[i * 3 + 2]!;
        low = Math.max(low, src[i * 3 + 1]!);
      }
      cx /= n;
      cz /= n;
      // The body camera faces the player from the TV, which is "up ice": nearer the camera is further up ice.
      const next = new Float32Array(src.length);
      for (let i = 0; i < n; i += 1) {
        next[i * 3] = -(src[i * 3]! - cx);
        next[i * 3 + 1] = low - src[i * 3 + 1]!;
        next[i * 3 + 2] = src[i * 3 + 2]! - cz;
      }
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      this.bodyFrom = this.bodyTo ? Float32Array.from(pos.array as Float32Array) : next;
      this.bodyTo = next;
      this.bodyBlend = 0;
    }
    if (this.bodyFrom && this.bodyTo) {
      this.bodyBlend = Math.min(1, this.bodyBlend + dt * Math.max(4, body!.fps));
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      for (let i = 0; i < arr.length; i += 1) arr[i] = this.bodyFrom[i]! + (this.bodyTo[i]! - this.bodyFrom[i]!) * this.bodyBlend;
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
    }
    mesh.position.set(this.sim.me.x, 0, this.sim.me.z);
    this.upTotal += dt;
    if (body!.headsUp > 0.5) this.upSeconds += dt;
  }

  private readonly frame = (ms: number): void => {
    if (this.ended) return;
    const dt = this.lastMs === 0 ? 1 / 60 : clamp((ms - this.lastMs) / 1000, 1 / 240, 0.05);
    this.lastMs = ms;
    const time = ms / 1000;
    this.seconds += dt;
    const sim = this.sim;

    if (this.guided) this.guided.goal = sim.demoAim(this.guided.sample, this.gestures.passing, time);
    this.source.update(dt);
    const puck = this.source.sample;
    this.gestures.update(dt, puck);
    const before = sim.phase;
    sim.update(dt, puck, this.gestures);
    for (const cue of sim.sfx) playCue(cue);
    if (sim.phase === "goal" && before !== "goal") this.shake = 0.8;
    if (sim.phase === "battle" && before !== "battle") this.shake = 0.5;

    // Skaters.
    const speed = Math.hypot(sim.me.vx, sim.me.vz);
    const mine = sim.holder === "me" || sim.phase === "battle";
    this.poseSkater(this.me, sim.me.x, sim.me.z, sim.me.vx, speed, time, mine ? sim.me.x + sim.lx : null, sim.me.z + sim.lz);
    this.updateBody(dt);
    sim.wings.forEach((w, i) => {
      const has = sim.holder === (i === 0 ? "wing0" : "wing1");
      this.poseSkater(this.wings[i]!, w.x, w.z, 0, speed, time + i, has ? sim.puck.x : null, sim.puck.z);
      const ring = this.wingRings[i]!;
      ring.position.set(w.x, 0.03, w.z);
      (ring.material as THREE.MeshBasicMaterial).color.setHex(w.open ? 0x58d68d : 0x8a4a3a);
      (ring.material as THREE.MeshBasicMaterial).opacity = w.open && sim.holder === "me" ? 0.55 + 0.35 * Math.sin(time * 6) : 0.25;
    });
    sim.goblins.forEach((g, i) => {
      const view = this.goblins[i];
      if (!view) return;
      const beaten = g.state === "beaten";
      const lunge = g.state === "poke" ? Math.sin(clamp(g.t / 0.75, 0, 1) * Math.PI) * 0.5 : 0;
      view.card.position.set(g.x, 1.05, g.z + lunge);
      view.card.rotation.set(beaten ? -1.2 : 0, 0, beaten ? 0.5 : 0);
      view.card.position.y = beaten ? 0.45 : 1.05;
      view.mark.visible = g.state === "poke";
      if (g.state === "poke") {
        // The red ring is where the poke-check will land: get the puck out of it.
        const k = 1.6 - clamp(g.t / 0.75, 0, 1) * 0.6;
        view.mark.position.set(sim.me.x + g.markX, 0.04, sim.me.z + g.markZ);
        view.mark.scale.set(k, k, 1);
      }
    });
    this.goalie.position.set(sim.goalie.x, 0.95, -RINK.goalLine + 0.5);
    this.goalLight.intensity = sim.phase === "goal" ? (Math.floor(time * 6) % 2 === 0 ? 220 : 30) : 0;

    const battle = sim.phase === "battle";
    this.puck.position.set(battle ? sim.me.x + sim.lx : sim.puck.x, 0.05, battle ? sim.me.z + sim.lz : sim.puck.z);

    // Camera rides behind and above the skater, looking up ice.
    const wantPos = new THREE.Vector3(sim.me.x * 0.7, 5.6, sim.me.z + 9.2);
    const wantLook = new THREE.Vector3(sim.me.x * 0.85, 0.9, sim.me.z - 7.5);
    const k = 1 - Math.exp(-5 * dt);
    this.camPos.lerp(wantPos, k);
    this.camLook.lerp(wantLook, k);
    this.shake = Math.max(0, this.shake - dt * 1.5);
    this.camera.position.copy(this.camPos).add(new THREE.Vector3((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake, 0));
    this.camera.lookAt(this.camLook);
    this.key.position.set(sim.me.x - 6, 18, sim.me.z + 8);
    this.key.target.position.set(sim.me.x, 0, sim.me.z - 4);
    this.renderer.render(this.scene, this.camera);

    this.floor.draw({
      time,
      puck,
      rebounders: this.opts.cal.rebounders,
      encounter: null,
      ready: null,
      banner: null,
      charged: sim.holder === "me" && (sim.inZone || sim.wings.some((w) => w.open))
    });
    this.drawMap();
    this.renderHud(puck.visible);
    if (sim.phase === "over" && sim.phaseT > 4) {
      this.finish(true);
      return;
    }
    this.raf = requestAnimationFrame(this.frame);
  };

  private drawMap(): void {
    const c = this.el.querySelector<HTMLCanvasElement>(".rush-map")!;
    const g = c.getContext("2d")!;
    const sim = this.sim;
    const X = (x: number): number => ((x + RINK.halfW) / (RINK.halfW * 2)) * c.width;
    const Z = (z: number): number => ((z + RINK.halfL) / (RINK.halfL * 2)) * c.height;
    g.clearRect(0, 0, c.width, c.height);
    g.fillStyle = "rgba(20,34,50,0.85)";
    g.beginPath();
    g.roundRect(0, 0, c.width, c.height, 18);
    g.fill();
    g.strokeStyle = "rgba(212,175,55,0.7)";
    g.lineWidth = 2;
    g.stroke();
    for (const [z, color] of [[0, "#c8413a"], [-RINK.blueLine, "#3c78dc"], [RINK.blueLine, "#3c78dc"], [-RINK.goalLine, "#c8413a"], [RINK.goalLine, "#c8413a"]] as const) {
      g.strokeStyle = color;
      g.lineWidth = z === 0 ? 3 : 2;
      g.beginPath();
      g.moveTo(4, Z(z));
      g.lineTo(c.width - 4, Z(z));
      g.stroke();
    }
    const dot = (x: number, z: number, r: number, color: string): void => {
      g.fillStyle = color;
      g.beginPath();
      g.arc(X(x), Z(z), r, 0, Math.PI * 2);
      g.fill();
    };
    for (const gob of sim.goblins) dot(gob.x, gob.z, 5, gob.state === "beaten" ? "#55604a" : "#7fb069");
    dot(sim.goalie.x, -RINK.goalLine, 5, "#7fb069");
    for (const w of sim.wings) dot(w.x, w.z, 5, "#e9e4d6");
    dot(sim.me.x, sim.me.z, 7, "#ffd75a");
    dot(sim.puck.x, sim.puck.z, 3, "#2be0b4");
  }

  private renderHud(visible: boolean): void {
    const sim = this.sim;
    const r = this.refs;
    r.homeScore!.textContent = `${sim.score[0]}`;
    r.awayScore!.textContent = `${sim.score[1]}`;
    r.period!.textContent = `PERIOD ${sim.period} OF 2`;
    const s = Math.max(0, Math.ceil(sim.clock));
    r.clock!.textContent = `${Math.floor(s / 60)}:${`${s % 60}`.padStart(2, "0")}`;

    let prompt = "";
    let sub = "";
    if (sim.phase === "battle") {
      prompt = `PUCK BATTLE — ${Math.max(0, sim.battleLeft)} quick dribbles!`;
      sub = `${Math.max(0, sim.battleTime).toFixed(1)} s before they break away`;
    } else if (sim.phase === "play") {
      const poke = sim.goblins.some((g) => g.state === "poke");
      if (poke) {
        prompt = "DEKE! Get the puck out of the red ring";
      } else if (sim.holder !== "me") {
        prompt = "Catch the return clean for a give-and-go";
      } else if (sim.inZone) {
        prompt = "SHOOT — rip it off the far crystals";
        sub = "Hit the end of the crystals on the side the goalie has left open";
      } else {
        prompt = "Carry it up ice";
        sub = sim.wings.some((w) => w.open) ? "Winger open (green ring) — pass off the side crystals" : "Push the puck forward to skate faster";
      }
    }
    r.prompt!.textContent = prompt;
    r.promptSub!.textContent = sub;
    r.banner!.hidden = !sim.banner;
    if (sim.banner) {
      r.bannerText!.textContent = sim.banner.text;
      r.bannerSub!.textContent = sim.banner.sub;
    }
    r.note!.textContent = `Dekes ${sim.dekes} · Passes ${sim.passes} · Shots ${sim.shots}`;
    const body = this.opts.body;
    r.tracker!.textContent = `${this.source.label} · ${visible ? "tracking" : "searching…"} · ${body && body.status === "live" ? `body ${body.fps.toFixed(0)} fps` : "built-in skater"}`;
    r.tracker!.classList.toggle("is-lost", !visible);
  }

  private finish(completed: boolean): void {
    if (this.ended) return;
    this.ended = true;
    cancelAnimationFrame(this.raf);
    stopMusic();
    window.removeEventListener("keydown", this.onKey);
    window.removeEventListener("resize", this.onResize);
    this.source.destroy();
    this.renderer.dispose();
    const sim = this.sim;
    this.opts.onEnd({
      score: [sim.score[0], sim.score[1]],
      completed,
      heroes: [{ hero: this.opts.hero, practice: this.gestures.stats, checks: sim.dekes + sim.passes + sim.shots, made: sim.dekes + sim.passes + sim.score[0] }],
      headsUp: this.upTotal > 1 ? this.upSeconds / this.upTotal : null,
      seconds: this.seconds
    });
  }
}
