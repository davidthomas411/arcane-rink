import * as THREE from "three";
import { COLS, ROWS, ROLE_LABEL, type Cell, type Match, type Skater, type Team } from "./rules";

const asset = (name: string): string => new URL(`../realm/assets/${name}`, import.meta.url).href;

export type Highlight = { x: number; y: number; kind: "move" | "deke" | "pass" | "hit" | "shoot" | "pick" };

const HIGHLIGHT_COLOR: Record<Highlight["kind"], number> = {
  move: 0x58d68d,
  deke: 0xf5b041,
  pass: 0x5dade2,
  hit: 0xe74c3c,
  shoot: 0xffd75a,
  pick: 0xf4f6f7
};

/** Art for each piece. Away skaters are tints of the one goblin painting. */
const ART: Record<Team, Record<Skater["role"], { file: string; filter: string }>> = {
  0: {
    playmaker: { file: "hero-k.png", filter: "" },
    sniper: { file: "hero-a.png", filter: "" },
    enforcer: { file: "hero-a.png", filter: "saturate(1.2) brightness(0.92)" },
    defender: { file: "hero-k.png", filter: "saturate(1.2) brightness(0.92)" }
  },
  1: {
    playmaker: { file: "goblin.png", filter: "hue-rotate(200deg) saturate(1.2)" },
    sniper: { file: "goblin.png", filter: "" },
    enforcer: { file: "goblin.png", filter: "hue-rotate(-75deg) saturate(1.5)" },
    defender: { file: "goblin.png", filter: "hue-rotate(110deg) saturate(0.8)" }
  }
};

const TEAM_COLOR: Record<Team, number> = { 0: 0x8c1f2b, 1: 0x3f6b2a };

type Piece = {
  skater: Skater;
  group: THREE.Group;
  card: THREE.Mesh;
  ring: THREE.Mesh;
  label: THREE.Sprite;
  pos: THREE.Vector3;
  tilt: number;
};

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function labelTexture(text: string, sub: string, color: string): THREE.CanvasTexture {
  const c = document.createElement("canvas");
  c.width = 256;
  c.height = 96;
  const g = c.getContext("2d")!;
  g.fillStyle = "rgba(12,13,15,0.82)";
  g.beginPath();
  g.roundRect(4, 4, 248, 88, 14);
  g.fill();
  g.strokeStyle = color;
  g.lineWidth = 5;
  g.stroke();
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.fillStyle = "#f3e9cf";
  g.font = '700 40px "Cinzel", Georgia, serif';
  g.fillText(text, 128, 38);
  g.fillStyle = "#b7aa90";
  g.font = '600 22px "Cinzel", Georgia, serif';
  g.fillText(sub, 128, 72);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** The rink markings and square grid, painted once onto a transparent sheet over the ice. */
function markingsTexture(): THREE.CanvasTexture {
  const px = 96;
  const c = document.createElement("canvas");
  c.width = (COLS + 2) * px;
  c.height = ROWS * px;
  const g = c.getContext("2d")!;
  const ox = px;
  g.strokeStyle = "rgba(210,235,255,0.2)";
  g.lineWidth = 2;
  for (let x = 0; x <= COLS; x += 1) {
    g.beginPath();
    g.moveTo(ox + x * px, 0);
    g.lineTo(ox + x * px, ROWS * px);
    g.stroke();
  }
  for (let y = 0; y <= ROWS; y += 1) {
    g.beginPath();
    g.moveTo(ox, y * px);
    g.lineTo(ox + COLS * px, y * px);
    g.stroke();
  }
  const cx = ox + (COLS / 2) * px;
  const cy = (ROWS / 2) * px;
  g.lineWidth = 10;
  g.strokeStyle = "rgba(200,50,45,0.75)";
  g.beginPath();
  g.moveTo(cx, 0);
  g.lineTo(cx, ROWS * px);
  g.stroke();
  g.strokeStyle = "rgba(60,110,220,0.7)";
  for (const bx of [3.5, COLS - 3.5]) {
    g.beginPath();
    g.moveTo(ox + bx * px, 0);
    g.lineTo(ox + bx * px, ROWS * px);
    g.stroke();
  }
  g.lineWidth = 6;
  g.strokeStyle = "rgba(120,200,255,0.75)";
  g.beginPath();
  g.arc(cx, cy, px * 1.15, 0, Math.PI * 2);
  g.stroke();
  g.fillStyle = "rgba(120,200,255,0.5)";
  g.font = `600 ${px * 0.2}px Georgia, serif`;
  g.textAlign = "center";
  g.textBaseline = "middle";
  const runes = "ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛇᛈᛉᛊ";
  for (let i = 0; i < runes.length; i += 1) {
    const a = (i / runes.length) * Math.PI * 2;
    g.save();
    g.translate(cx + Math.cos(a) * px * 0.95, cy + Math.sin(a) * px * 0.95);
    g.rotate(a + Math.PI / 2);
    g.fillText(runes[i]!, 0, 0);
    g.restore();
  }
  // Goal lines and creases.
  for (const side of [0, 1]) {
    const gx = side === 0 ? ox : ox + COLS * px;
    g.strokeStyle = "rgba(200,50,45,0.8)";
    g.lineWidth = 6;
    g.beginPath();
    g.moveTo(gx, 0);
    g.lineTo(gx, ROWS * px);
    g.stroke();
    g.fillStyle = "rgba(70,130,230,0.28)";
    g.beginPath();
    g.arc(gx, cy, px * 1.4, side === 0 ? -Math.PI / 2 : Math.PI / 2, side === 0 ? Math.PI / 2 : (Math.PI * 3) / 2);
    g.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/**
 * The match in 3D: a torch-lit rink with standee miniatures. Board square (x, y)
 * sits at world (x + 0.5, 0, y + 0.5); the camera looks from the near boards so
 * "up the screen" is "away from the player", matching the real floor.
 */
export class Board3D {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(38, 16 / 9, 0.1, 200);
  private readonly pieces = new Map<number, Piece>();
  private readonly tiles: THREE.Mesh[] = [];
  private readonly cursor: THREE.Mesh;
  private readonly cursorFill: THREE.Mesh;
  private readonly puck: THREE.Mesh;
  private readonly puckPos = new THREE.Vector3(COLS / 2, 0.06, ROWS / 2);
  private puckFlight: { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; resolve: () => void } | null = null;
  private readonly goalLights: THREE.PointLight[] = [];
  private readonly raycaster = new THREE.Raycaster();
  private readonly ice = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private shake = 0;
  private focus: THREE.Vector3 | null = null;
  private readonly lookAt = new THREE.Vector3(COLS / 2, 0, ROWS / 2 - 0.2);
  private match: Match | null = null;
  private selected = -1;

  constructor(readonly canvas: HTMLCanvasElement) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const loader = new THREE.TextureLoader();
    const hall = loader.load(asset("hall.jpg"));
    hall.colorSpace = THREE.SRGBColorSpace;
    this.scene.background = hall;
    this.scene.backgroundIntensity = 0.5;
    this.scene.fog = new THREE.Fog(0x0b0d12, 18, 46);

    // Ice sheet, extended a square past each goal line for the nets.
    const iceTex = loader.load(asset("ice.jpg"));
    iceTex.colorSpace = THREE.SRGBColorSpace;
    iceTex.wrapS = THREE.RepeatWrapping;
    iceTex.wrapT = THREE.RepeatWrapping;
    iceTex.repeat.set(4, 2.2);
    const sheet = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS + 2, ROWS),
      new THREE.MeshStandardMaterial({ map: iceTex, color: 0x9cc6e8, roughness: 0.22, metalness: 0.15 })
    );
    sheet.rotation.x = -Math.PI / 2;
    sheet.position.set(COLS / 2, 0, ROWS / 2);
    sheet.receiveShadow = true;
    this.scene.add(sheet);

    const lines = new THREE.Mesh(
      new THREE.PlaneGeometry(COLS + 2, ROWS),
      new THREE.MeshBasicMaterial({ map: markingsTexture(), transparent: true, depthWrite: false })
    );
    lines.rotation.x = -Math.PI / 2;
    lines.position.set(COLS / 2, 0.005, ROWS / 2);
    this.scene.add(lines);

    // Dark stone floor of the hall around the rink.
    const hallFloor = new THREE.Mesh(new THREE.PlaneGeometry(80, 60), new THREE.MeshStandardMaterial({ color: 0x14161b, roughness: 0.9 }));
    hallFloor.rotation.x = -Math.PI / 2;
    hallFloor.position.set(COLS / 2, -0.02, ROWS / 2);
    hallFloor.receiveShadow = true;
    this.scene.add(hallFloor);

    this.buildBoards();
    this.buildGoals();
    this.buildLights();

    // Square highlights.
    const tileGeo = new THREE.PlaneGeometry(0.9, 0.9);
    for (let i = 0; i < (COLS + 2) * ROWS; i += 1) {
      const tile = new THREE.Mesh(tileGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      tile.rotation.x = -Math.PI / 2;
      tile.visible = false;
      this.scene.add(tile);
      this.tiles.push(tile);
    }
    this.cursor = new THREE.Mesh(new THREE.RingGeometry(0.4, 0.48, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95, depthWrite: false }));
    this.cursor.rotation.x = -Math.PI / 2;
    this.cursor.visible = false;
    this.scene.add(this.cursor);
    this.cursorFill = new THREE.Mesh(new THREE.CircleGeometry(0.4, 40), new THREE.MeshBasicMaterial({ color: 0xffe08a, transparent: true, opacity: 0.55, depthWrite: false }));
    this.cursorFill.rotation.x = -Math.PI / 2;
    this.cursorFill.visible = false;
    this.scene.add(this.cursorFill);

    this.puck = new THREE.Mesh(
      new THREE.CylinderGeometry(0.13, 0.13, 0.07, 24),
      new THREE.MeshStandardMaterial({ color: 0x1fae8c, emissive: 0x0e7a60, emissiveIntensity: 0.9, roughness: 0.4 })
    );
    this.puck.castShadow = true;
    this.scene.add(this.puck);

    this.camera.position.set(COLS / 2, 9.4, ROWS / 2 + 8.6);
    this.camera.lookAt(this.lookAt);
    this.resize();
  }

  private buildBoards(): void {
    const wood = new THREE.MeshStandardMaterial({ color: 0x4a3120, roughness: 0.7 });
    const trim = new THREE.MeshStandardMaterial({ color: 0xc9a23a, roughness: 0.35, metalness: 0.7 });
    const add = (w: number, d: number, x: number, z: number): void => {
      const wall = new THREE.Mesh(new THREE.BoxGeometry(w, 0.42, d), wood);
      wall.position.set(x, 0.21, z);
      wall.castShadow = true;
      wall.receiveShadow = true;
      this.scene.add(wall);
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w + 0.04, 0.05, d + 0.04), trim);
      cap.position.set(x, 0.44, z);
      this.scene.add(cap);
    };
    const len = COLS + 2.4;
    add(len, 0.2, COLS / 2, -0.1);
    add(len, 0.2, COLS / 2, ROWS + 0.1);
    add(0.2, ROWS + 0.4, -1.1, ROWS / 2);
    add(0.2, ROWS + 0.4, COLS + 1.1, ROWS / 2);
  }

  private buildGoals(): void {
    const post = new THREE.MeshStandardMaterial({ color: 0xc0392b, roughness: 0.4, metalness: 0.3 });
    const net = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.16, side: THREE.DoubleSide });
    for (const side of [0, 1] as const) {
      const gx = side === 0 ? -0.05 : COLS + 0.05;
      const dir = side === 0 ? -1 : 1;
      const z0 = ROWS / 2 - 1.1;
      const z1 = ROWS / 2 + 1.1;
      for (const z of [z0, z1]) {
        const p = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 10), post);
        p.position.set(gx, 0.45, z);
        p.castShadow = true;
        this.scene.add(p);
      }
      const bar = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 2.2, 10), post);
      bar.rotation.x = Math.PI / 2;
      bar.position.set(gx, 0.9, ROWS / 2);
      this.scene.add(bar);
      const back = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 0.9), net);
      back.rotation.y = Math.PI / 2;
      back.position.set(gx + dir * 0.7, 0.45, ROWS / 2);
      this.scene.add(back);
      const top = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 2.2), net);
      top.rotation.x = -Math.PI / 2;
      top.position.set(gx + dir * 0.35, 0.9, ROWS / 2);
      this.scene.add(top);
      const light = new THREE.PointLight(0xff3b2f, 0, 9, 1.6);
      light.position.set(gx + dir * 0.4, 1.6, ROWS / 2);
      this.scene.add(light);
      this.goalLights.push(light);
    }
  }

  private buildLights(): void {
    this.scene.add(new THREE.HemisphereLight(0xbdd7ff, 0x1a1410, 0.9));
    const key = new THREE.DirectionalLight(0xfff1dc, 2.1);
    key.position.set(COLS / 2 - 3, 12, ROWS / 2 + 6);
    key.target.position.set(COLS / 2, 0, ROWS / 2);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    key.shadow.camera.left = -9;
    key.shadow.camera.right = 9;
    key.shadow.camera.top = 7;
    key.shadow.camera.bottom = -7;
    key.shadow.camera.far = 40;
    key.shadow.bias = -0.0006;
    this.scene.add(key, key.target);
    // Torches on the corner posts.
    const flame = new THREE.MeshBasicMaterial({ color: 0xffb347 });
    for (const [x, z] of [[-1.1, -0.1], [COLS + 1.1, -0.1], [-1.1, ROWS + 0.1], [COLS + 1.1, ROWS + 0.1]] as const) {
      const torch = new THREE.PointLight(0xff9a3c, 14, 11, 1.8);
      torch.position.set(x, 1.5, z);
      this.scene.add(torch);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.3, 8), new THREE.MeshStandardMaterial({ color: 0x2a2c2f, roughness: 0.6 }));
      pole.position.set(x, 0.65, z);
      this.scene.add(pole);
      const fire = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), flame);
      fire.position.set(x, 1.38, z);
      this.scene.add(fire);
    }
  }

  // ----------------------------------------------------------------- pieces

  private cardTexture(file: string, filter: string, onReady: (tex: THREE.Texture, aspect: number) => void): void {
    const img = new Image();
    img.onload = () => {
      const c = document.createElement("canvas");
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      const g = c.getContext("2d")!;
      if (filter) g.filter = filter;
      g.drawImage(img, 0, 0);
      const tex = new THREE.CanvasTexture(c);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      onReady(tex, img.naturalWidth / img.naturalHeight);
    };
    img.src = asset(file);
  }

  /**
   * @param homeArt painted portrait file for home skaters, in line-up order; lets each
   *   kid's hero use their own portrait whatever role they play.
   */
  setMatch(match: Match, homeArt: readonly (string | null)[] = []): void {
    this.match = match;
    for (const piece of this.pieces.values()) this.scene.remove(piece.group);
    this.pieces.clear();
    for (const s of match.skaters) {
      const group = new THREE.Group();
      const teamColor = TEAM_COLOR[s.team];
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.43, 0.09, 32), new THREE.MeshStandardMaterial({ color: teamColor, roughness: 0.45, metalness: 0.35 }));
      base.position.y = 0.045;
      base.castShadow = true;
      base.receiveShadow = true;
      group.add(base);
      const rim = new THREE.Mesh(new THREE.TorusGeometry(0.41, 0.025, 8, 40), new THREE.MeshStandardMaterial({ color: 0xd4af37, roughness: 0.3, metalness: 0.8 }));
      rim.rotation.x = Math.PI / 2;
      rim.position.y = 0.09;
      group.add(rim);
      const ring = new THREE.Mesh(new THREE.RingGeometry(0.46, 0.58, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0, depthWrite: false }));
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = 0.012;
      group.add(ring);

      const height = s.role === "enforcer" ? 1.5 : 1.35;
      const card = new THREE.Mesh(
        new THREE.PlaneGeometry(1, 1),
        new THREE.MeshStandardMaterial({ transparent: true, alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.85 })
      );
      card.castShadow = true;
      card.visible = false;
      group.add(card);
      const own = s.team === 0 ? homeArt[match.skaters.filter((p) => p.team === 0).indexOf(s)] : null;
      const art = own ? { file: own, filter: "" } : ART[s.team][s.role];
      this.cardTexture(art.file, art.filter, (tex, aspect) => {
        const mat = card.material as THREE.MeshStandardMaterial;
        mat.map = tex;
        mat.needsUpdate = true;
        card.scale.set(height * aspect, height, 1);
        card.position.y = 0.09 + height / 2;
        card.customDepthMaterial = new THREE.MeshDepthMaterial({ depthPacking: THREE.RGBADepthPacking, map: tex, alphaTest: 0.35 });
        card.visible = true;
      });

      const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: labelTexture(s.name, ROLE_LABEL[s.role], s.team === 0 ? "#d4af37" : "#7fb069"), depthTest: false, transparent: true }));
      label.scale.set(0.95, 0.36, 1);
      label.position.y = height + 0.36;
      label.renderOrder = 5;
      group.add(label);

      const pos = new THREE.Vector3(s.x + 0.5, 0, s.y + 0.5);
      group.position.copy(pos);
      this.scene.add(group);
      this.pieces.set(s.id, { skater: s, group, card, ring, label, pos, tilt: 0 });
    }
  }

  /** Snap targets to the rules state (pieces glide there). */
  sync(): void {
    for (const piece of this.pieces.values()) piece.pos.set(piece.skater.x + 0.5, 0, piece.skater.y + 0.5);
  }

  setSelection(id: number): void {
    this.selected = id;
  }

  setHighlights(list: readonly Highlight[], cursor: { x: number; y: number; progress: number } | null): void {
    for (const tile of this.tiles) tile.visible = false;
    list.forEach((h, i) => {
      const tile = this.tiles[i];
      if (!tile) return;
      const mat = tile.material as THREE.MeshBasicMaterial;
      mat.color.setHex(HIGHLIGHT_COLOR[h.kind]);
      mat.opacity = h.kind === "move" ? 0.3 : 0.5;
      if (h.kind === "shoot") tile.scale.set(1, 2.4, 1);
      else tile.scale.set(1, 1, 1);
      tile.position.set(h.x + 0.5, 0.012, h.y + 0.5);
      tile.visible = true;
    });
    this.cursor.visible = cursor !== null;
    this.cursorFill.visible = cursor !== null && cursor.progress > 0.02;
    if (cursor) {
      this.cursor.position.set(cursor.x + 0.5, 0.03, cursor.y + 0.5);
      this.cursorFill.position.set(cursor.x + 0.5, 0.025, cursor.y + 0.5);
      const p = Math.max(0.05, Math.min(1, cursor.progress));
      this.cursorFill.scale.set(p, p, 1);
    }
  }

  // ------------------------------------------------------------- animations

  async playMove(id: number, path: Cell[]): Promise<void> {
    const piece = this.pieces.get(id);
    if (!piece) return;
    for (const cell of path) {
      piece.pos.set(cell.x + 0.5, 0, cell.y + 0.5);
      await wait(130);
    }
    await wait(120);
  }

  async playKnockdown(id: number): Promise<void> {
    this.shake = 0.35;
    await wait(450);
    void id;
  }

  private fly(to: THREE.Vector3, dur: number): Promise<void> {
    return new Promise((resolve) => {
      this.puckFlight = { from: this.puckPos.clone(), to, t: 0, dur, resolve };
    });
  }

  async playPass(to: Cell): Promise<void> {
    await this.fly(new THREE.Vector3(to.x + 0.5, 0.06, to.y + 0.5), 0.45);
  }

  async playShot(team: Team, goal: boolean): Promise<void> {
    const gx = team === 0 ? COLS + 0.45 : -0.45;
    const z = ROWS / 2 + (goal ? (Math.random() - 0.5) * 1.4 : (Math.random() < 0.5 ? -1 : 1) * 1.6);
    this.focus = new THREE.Vector3(team === 0 ? COLS - 1.5 : 1.5, 0, ROWS / 2);
    await this.fly(new THREE.Vector3(goal ? gx : gx - (team === 0 ? 0.7 : -0.7), 0.06, z), 0.32);
    if (goal) {
      const light = this.goalLights[team === 0 ? 1 : 0]!;
      this.shake = 0.6;
      for (let i = 0; i < 6; i += 1) {
        light.intensity = i % 2 === 0 ? 60 : 8;
        await wait(170);
      }
      light.intensity = 0;
    } else {
      await wait(450);
    }
    this.focus = null;
  }

  // ------------------------------------------------------------------ frame

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(2, rect.width);
    const h = Math.max(2, rect.height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    // Pull back on narrow screens so the whole rink stays in view.
    const fit = Math.max(1, 1.78 / this.camera.aspect);
    this.camera.position.set(COLS / 2, 9.4 * fit, ROWS / 2 + 8.6 * fit);
    this.camera.updateProjectionMatrix();
  }

  /** Where on the board a screen point lands, in fractional squares (x may run -1..COLS+1 for the nets). */
  pick(clientX: number, clientY: number): { x: number; y: number } | null {
    const rect = this.canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(((clientX - rect.left) / rect.width) * 2 - 1, -((clientY - rect.top) / rect.height) * 2 + 1);
    this.raycaster.setFromCamera(ndc, this.camera);
    const hit = new THREE.Vector3();
    if (!this.raycaster.ray.intersectPlane(this.ice, hit)) return null;
    return { x: hit.x, y: hit.z };
  }

  render(time: number, dt: number): void {
    const match = this.match;
    const camYaw = Math.atan2(this.camera.position.x - COLS / 2, this.camera.position.z - ROWS / 2);
    for (const piece of this.pieces.values()) {
      const s = piece.skater;
      piece.group.position.lerp(piece.pos, 1 - Math.exp(-14 * dt));
      // Standees face the camera; a flattened skater tips over backwards.
      const wantTilt = s.down ? -1.5 : 0;
      piece.tilt += (wantTilt - piece.tilt) * (1 - Math.exp(-10 * dt));
      piece.card.rotation.set(piece.tilt, camYaw, 0, "YXZ");
      // Laid out flat on the ice behind its base.
      const flat = Math.min(1, Math.abs(piece.tilt) / 1.35);
      piece.card.position.z = -0.55 * flat;
      piece.card.position.y = (0.09 + piece.card.scale.y / 2) * (1 - flat) + 0.14 * flat;
      const mat = piece.card.material as THREE.MeshStandardMaterial;
      const canAct = match ? match.canActivate(s) : false;
      mat.color.setScalar(s.down ? 0.45 : s.groggy || (match && s.team === match.team && !canAct) ? 0.62 : 1);
      const ringMat = piece.ring.material as THREE.MeshBasicMaterial;
      const isSelected = s.id === this.selected;
      ringMat.color.setHex(isSelected ? 0xffe08a : 0xffffff);
      ringMat.opacity = isSelected ? 0.95 : canAct ? 0.35 + 0.2 * Math.sin(time * 4 + s.id) : 0;
      piece.label.visible = !s.down;
    }

    // Puck: in flight, on a stick, or lying loose.
    if (this.puckFlight) {
      const f = this.puckFlight;
      f.t += dt;
      const k = Math.min(1, f.t / f.dur);
      this.puckPos.lerpVectors(f.from, f.to, k);
      this.puckPos.y = 0.06 + Math.sin(k * Math.PI) * 0.25;
      if (k >= 1) {
        this.puckFlight = null;
        f.resolve();
      }
    } else if (match) {
      const carrier = match.carrier;
      const target = new THREE.Vector3();
      if (carrier) {
        const piece = this.pieces.get(carrier.id);
        const dir = carrier.team === 0 ? 1 : -1;
        if (piece) target.set(piece.group.position.x + dir * 0.34, 0.14, piece.group.position.z + 0.3);
      } else {
        target.set(match.puck.x + 0.5, 0.05, match.puck.y + 0.5);
      }
      this.puckPos.lerp(target, 1 - Math.exp(-18 * dt));
    }
    this.puck.position.copy(this.puckPos);

    const want = this.focus ?? new THREE.Vector3(COLS / 2, 0, ROWS / 2 - 0.2);
    this.lookAt.lerp(want, 1 - Math.exp(-3 * dt));
    this.shake = Math.max(0, this.shake - dt * 1.4);
    const look = this.lookAt.clone();
    look.x += Math.sin(time * 0.25) * 0.08 + (Math.random() - 0.5) * this.shake * 0.4;
    look.y += (Math.random() - 0.5) * this.shake * 0.4;
    this.camera.lookAt(look);
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
