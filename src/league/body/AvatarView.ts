import * as THREE from "three";
import { BODY_KEYPOINTS, type BodyTracker } from "./BodyTracker";

/**
 * Shows the tracked player as a 3D figure: the body mesh from the tracker,
 * given armour-like shading in the team colour, standing on a patch of ice.
 * Poses arrive a few times a second, so the view blends between them.
 */
export class AvatarView {
  private readonly renderer: THREE.WebGLRenderer;
  private readonly scene = new THREE.Scene();
  private readonly camera = new THREE.PerspectiveCamera(32, 1, 0.1, 50);
  private mesh: THREE.Mesh | null = null;
  private readonly stick: THREE.Mesh;
  private from: Float32Array | null = null;
  private to: Float32Array | null = null;
  private blend = 1;
  private seenFrame = -1;
  private interval = 0.14;
  private readonly material: THREE.MeshStandardMaterial;

  constructor(readonly canvas: HTMLCanvasElement, private readonly tracker: BodyTracker, color: string) {
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.scene.add(new THREE.HemisphereLight(0xcfe2ff, 0x20140c, 1.1));
    const key = new THREE.DirectionalLight(0xfff0d8, 2.4);
    key.position.set(1.5, 3, 2.5);
    this.scene.add(key);
    const rim = new THREE.DirectionalLight(0x6fb6ff, 1.6);
    rim.position.set(-2, 2, -2.5);
    this.scene.add(rim);
    const ice = new THREE.Mesh(new THREE.CircleGeometry(1.1, 48), new THREE.MeshStandardMaterial({ color: 0x7fb4dc, roughness: 0.25, metalness: 0.2, transparent: true, opacity: 0.85 }));
    ice.rotation.x = -Math.PI / 2;
    this.scene.add(ice);
    this.material = new THREE.MeshStandardMaterial({ color: new THREE.Color(color), roughness: 0.42, metalness: 0.45 });
    this.stick = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 1, 8), new THREE.MeshStandardMaterial({ color: 0x8a6238, roughness: 0.6 }));
    this.stick.visible = false;
    this.scene.add(this.stick);
    this.camera.position.set(0, 1.25, 4.4);
    this.camera.lookAt(0, 0.95, 0);
  }

  setColor(color: string): void {
    this.material.color.set(color);
  }

  private ensureMesh(): THREE.Mesh | null {
    if (this.mesh) return this.mesh;
    const faces = this.tracker.faces;
    if (!faces || this.tracker.vertexCount === 0) return null;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(new Float32Array(this.tracker.vertexCount * 3), 3));
    geo.setIndex(new THREE.BufferAttribute(faces, 1));
    this.mesh = new THREE.Mesh(geo, this.material);
    this.mesh.frustumCulled = false;
    this.scene.add(this.mesh);
    return this.mesh;
  }

  /**
   * Camera coordinates (y down, z away) -> a figure standing at the origin, shown
   * as a mirror image so moving left moves the figure to the viewer's left.
   */
  private stand(src: Float32Array): Float32Array {
    const out = new Float32Array(src.length);
    let cx = 0;
    let cz = 0;
    let low = -Infinity;
    const n = src.length / 3;
    for (let i = 0; i < n; i += 1) {
      cx += src[i * 3]!;
      cz += src[i * 3 + 2]!;
      if (src[i * 3 + 1]! > low) low = src[i * 3 + 1]!;
    }
    cx /= n;
    cz /= n;
    for (let i = 0; i < n; i += 1) {
      out[i * 3] = -(src[i * 3]! - cx);
      out[i * 3 + 1] = low - src[i * 3 + 1]!;
      out[i * 3 + 2] = -(src[i * 3 + 2]! - cz);
    }
    return out;
  }

  resize(): void {
    const rect = this.canvas.getBoundingClientRect();
    const w = Math.max(2, rect.width);
    const h = Math.max(2, rect.height);
    this.renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  render(dt: number): void {
    const mesh = this.ensureMesh();
    const frame = this.tracker.latest;
    if (mesh && frame && this.tracker.frameId !== this.seenFrame && frame.vertices.length === this.tracker.vertexCount * 3) {
      this.seenFrame = this.tracker.frameId;
      const next = this.stand(frame.vertices);
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      this.from = this.to ? Float32Array.from(pos.array as Float32Array) : next;
      this.to = next;
      this.blend = 0;
      this.interval = Math.min(0.3, Math.max(0.06, 1 / Math.max(3, this.tracker.fps || 7)));

      // A stick through both hands, if the server sends 3D joints.
      const k3 = frame.keypoints3d;
      const a = k3?.[BODY_KEYPOINTS.wristL];
      const b = k3?.[BODY_KEYPOINTS.wristR];
      this.stick.visible = false;
      if (a && b) {
        const n = frame.vertices.length / 3;
        let cx = 0;
        let cz = 0;
        let low = -Infinity;
        for (let i = 0; i < n; i += 1) {
          cx += frame.vertices[i * 3]!;
          cz += frame.vertices[i * 3 + 2]!;
          low = Math.max(low, frame.vertices[i * 3 + 1]!);
        }
        cx /= n;
        cz /= n;
        const pa = new THREE.Vector3(-(a[0]! - cx), low - a[1]!, -(a[2]! - cz));
        const pb = new THREE.Vector3(-(b[0]! - cx), low - b[1]!, -(b[2]! - cz));
        const top = pa.y > pb.y ? pa : pb;
        const bottom = pa.y > pb.y ? pb : pa;
        const dir = bottom.clone().sub(top);
        if (dir.length() > 0.05 && dir.y < -0.02) {
          dir.normalize();
          // Run the shaft from above the top hand down to the ice.
          const start = top.clone().addScaledVector(dir, -0.15);
          const reach = Math.min(1.9, start.y / Math.max(0.05, -dir.y));
          const end = start.clone().addScaledVector(dir, reach);
          this.stick.position.copy(start).add(end).multiplyScalar(0.5);
          this.stick.scale.set(1, reach, 1);
          this.stick.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
          this.stick.visible = true;
        }
      }
    }
    if (mesh && this.from && this.to) {
      this.blend = Math.min(1, this.blend + dt / this.interval);
      const pos = mesh.geometry.getAttribute("position") as THREE.BufferAttribute;
      const arr = pos.array as Float32Array;
      const k = this.blend;
      for (let i = 0; i < arr.length; i += 1) arr[i] = this.from[i]! + (this.to[i]! - this.from[i]!) * k;
      pos.needsUpdate = true;
      mesh.geometry.computeVertexNormals();
      mesh.visible = this.tracker.status === "live";
    }
    this.renderer.render(this.scene, this.camera);
  }

  dispose(): void {
    this.renderer.dispose();
  }
}
