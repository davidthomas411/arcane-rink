import { escapeHtml } from "../../realm/util";
import { AvatarView } from "./AvatarView";
import type { BodyTracker } from "./BodyTracker";

export type BodySettings = { address: string; deviceId: string | null };

/** Connect the player-facing camera to the body-tracking server and check the avatar. */
export class BodySetupScreen {
  private readonly el: HTMLDivElement;
  private readonly avatar: AvatarView;
  private raf = 0;
  private last = 0;
  private closed = false;

  constructor(
    root: HTMLElement,
    private readonly tracker: BodyTracker,
    private readonly settings: BodySettings,
    private readonly onDone: (settings: BodySettings) => void
  ) {
    this.el = document.createElement("div");
    this.el.className = "screen body-setup";
    this.el.innerHTML = `
      <header class="screen-head">
        <div><h1>Body tracking</h1><p class="lede">Optional. Puts the player on screen as a 3D figure and rewards keeping the head up.</p></div>
        <button class="btn btn-primary" data-act="done" type="button">Done</button>
      </header>
      <div class="calib-grid">
        <section class="panel">
          <h2>Connect</h2>
          <label>Body-tracking server address <input data-ref="address" value="${escapeHtml(settings.address)}" spellcheck="false" /></label>
          <label>Camera facing the player <select data-ref="devices"><option value="">Default camera</option></select></label>
          <div class="row">
            <button class="btn btn-primary" data-act="connect" type="button">Connect</button>
            <button class="btn" data-act="disconnect" type="button">Disconnect</button>
            <button class="btn" data-act="headsup" type="button">I'm looking at the TV now</button>
          </div>
          <p class="readout" data-ref="status">Not connected.</p>
          <ul class="tips">
            <li>This is the server from the <b>3d-mesh-demo-webcam</b> repo, running on the GPU machine. Start it there, forward its port, and enter the address you open its page at.</li>
            <li>It needs its <b>own camera pointed at the player</b>, for example on top of the TV. The overhead puck camera cannot see a body.</li>
            <li>Stand so the camera sees you head to toe, look at the TV, and press “I'm looking at the TV now”. That pose becomes “head up”.</li>
            <li>Poses arrive a few times a second, slightly behind. That is enough for the avatar and for posture, not for steering fast play, which is why the match is turn-based.</li>
          </ul>
        </section>
        <section class="panel">
          <h2>You, in the game</h2>
          <canvas class="avatar-preview" data-ref="avatar"></canvas>
          <dl class="facts">
            <dt>Poses per second</dt><dd data-ref="fps">–</dd>
            <dt>Delay</dt><dd data-ref="latency">–</dd>
            <dt>Head</dt><dd data-ref="head">–</dd>
            <dt>Knee bend</dt><dd data-ref="knee">–</dd>
          </dl>
        </section>
      </div>`;
    root.replaceChildren(this.el);
    const ref = <T extends HTMLElement>(name: string): T => this.el.querySelector<T>(`[data-ref="${name}"]`)!;
    this.avatar = new AvatarView(ref<HTMLCanvasElement>("avatar"), tracker, "#8c1f2b");
    this.avatar.resize();

    this.el.addEventListener("click", (event) => {
      const act = (event.target as HTMLElement).closest<HTMLElement>("[data-act]")?.dataset.act;
      if (act === "connect") void this.connect();
      else if (act === "disconnect") this.tracker.stop();
      else if (act === "headsup") this.tracker.calibrateHeadsUp();
      else if (act === "done") this.close();
    });
    ref<HTMLSelectElement>("devices").addEventListener("change", (event) => {
      this.settings.deviceId = (event.target as HTMLSelectElement).value || null;
    });
    void this.listDevices();
    this.raf = requestAnimationFrame(this.frame);
  }

  private async connect(): Promise<void> {
    this.settings.address = this.el.querySelector<HTMLInputElement>('[data-ref="address"]')!.value.trim();
    try {
      await this.tracker.start(this.settings.address, this.settings.deviceId);
      this.settings.deviceId = this.tracker.activeDeviceId ?? this.settings.deviceId;
      await this.listDevices();
    } catch {
      // The status line shows what went wrong.
    }
  }

  private async listDevices(): Promise<void> {
    try {
      const devices = (await navigator.mediaDevices.enumerateDevices()).filter((d) => d.kind === "videoinput");
      const select = this.el.querySelector<HTMLSelectElement>('[data-ref="devices"]')!;
      select.innerHTML =
        `<option value="">Default camera</option>` +
        devices.map((d, i) => `<option value="${escapeHtml(d.deviceId)}"${d.deviceId === this.settings.deviceId ? " selected" : ""}>${escapeHtml(d.label || `Camera ${i + 1}`)}</option>`).join("");
    } catch {
      // Listing is optional.
    }
  }

  private readonly frame = (ms: number): void => {
    if (this.closed) return;
    const dt = this.last === 0 ? 1 / 60 : Math.min(0.05, (ms - this.last) / 1000);
    this.last = ms;
    this.avatar.render(dt);
    const t = this.tracker;
    const set = (name: string, value: string): void => {
      this.el.querySelector<HTMLElement>(`[data-ref="${name}"]`)!.textContent = value;
    };
    const status = this.el.querySelector<HTMLElement>('[data-ref="status"]')!;
    status.textContent =
      t.status === "live"
        ? "Connected — tracking the player."
        : t.status === "no-person"
          ? "Connected, but no one is in view of the camera."
          : t.status === "connecting"
            ? "Connecting…"
            : t.status === "error"
              ? `Could not connect: ${t.error}`
              : "Not connected.";
    status.classList.toggle("is-good", t.status === "live");
    set("fps", t.status === "live" ? t.fps.toFixed(1) : "–");
    set("latency", t.latest ? `${Math.round(t.latest.latencyMs)} ms` : "–");
    set("head", t.status === "live" ? (t.headsUp > 0.5 ? "Up" : "Down — looking at the floor") : "–");
    set("knee", t.status === "live" ? `${Math.round(t.kneeBend * 100)}%` : "–");
    this.raf = requestAnimationFrame(this.frame);
  };

  private close(): void {
    this.closed = true;
    cancelAnimationFrame(this.raf);
    this.avatar.dispose();
    this.onDone(this.settings);
  }
}
