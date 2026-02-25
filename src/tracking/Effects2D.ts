type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  size: number;
  hue: number;
};

type Shockwave = {
  x: number;
  y: number;
  life: number;
  maxLife: number;
  radius: number;
  maxRadius: number;
  hue: number;
  width: number;
};

type FloatingText = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  text: string;
  hue: number;
  size: number;
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export class Effects2D {
  private particles: Particle[] = [];
  private shockwaves: Shockwave[] = [];
  private floatingTexts: FloatingText[] = [];
  private shakeTrauma = 0;

  update(dt: number): void {
    this.shakeTrauma = Math.max(0, this.shakeTrauma - dt * 2.4);

    for (let i = this.particles.length - 1; i >= 0; i -= 1) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.particles.splice(i, 1);
        continue;
      }

      p.vy += 220 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.985;
      p.vy *= 0.985;
    }

    for (let i = this.shockwaves.length - 1; i >= 0; i -= 1) {
      const wave = this.shockwaves[i];
      wave.life -= dt;
      if (wave.life <= 0) {
        this.shockwaves.splice(i, 1);
        continue;
      }

      const progress = 1 - wave.life / wave.maxLife;
      wave.radius = wave.maxRadius * (0.2 + progress * 0.8);
    }

    for (let i = this.floatingTexts.length - 1; i >= 0; i -= 1) {
      const text = this.floatingTexts[i];
      text.life -= dt;
      if (text.life <= 0) {
        this.floatingTexts.splice(i, 1);
        continue;
      }

      text.x += text.vx * dt;
      text.y += text.vy * dt;
      text.vx *= 0.97;
      text.vy *= 0.96;
    }
  }

  triggerShake(amount: number): void {
    this.shakeTrauma = clamp(this.shakeTrauma + amount, 0, 1.5);
  }

  getShakeOffset(timeSec: number): { x: number; y: number } {
    if (this.shakeTrauma <= 0.0001) {
      return { x: 0, y: 0 };
    }

    const power = this.shakeTrauma * this.shakeTrauma;
    const magnitude = 12 * power;
    const x = (Math.sin(timeSec * 71.3) * 0.65 + Math.cos(timeSec * 113.7) * 0.35) * magnitude;
    const y = (Math.cos(timeSec * 89.1) * 0.6 + Math.sin(timeSec * 127.1) * 0.4) * magnitude;
    return { x, y };
  }

  spawnHitBurst(x: number, y: number, hue: number, power = 1): void {
    const p = clamp(power, 0.8, 3);
    const count = Math.round(18 + p * 8);
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + Math.random() * 0.18;
      const speed = (70 + Math.random() * 210) * (0.9 + p * 0.22);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 20,
        life: 0.22 + Math.random() * 0.24,
        maxLife: 0.22 + Math.random() * 0.24,
        size: (2 + Math.random() * 3.5) * (0.92 + p * 0.16),
        hue: hue + (Math.random() * 30 - 15)
      });
    }

    const emberCount = Math.round(5 + p * 3);
    for (let i = 0; i < emberCount; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = (28 + Math.random() * 60) * (0.9 + p * 0.18);
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life: 0.14 + Math.random() * 0.14,
        maxLife: 0.14 + Math.random() * 0.14,
        size: (5 + Math.random() * 5) * (0.9 + p * 0.14),
        hue: hue + (Math.random() * 18 - 9)
      });
    }

    this.spawnShockwave(x, y, hue, p);
  }

  spawnShockwave(x: number, y: number, hue: number, power = 1): void {
    const p = clamp(power, 0.8, 3);
    this.shockwaves.push({
      x,
      y,
      life: 0.26,
      maxLife: 0.26,
      radius: 4,
      maxRadius: 52 * (0.9 + p * 0.22),
      hue,
      width: 3.2 * (0.94 + p * 0.12)
    });
    this.shockwaves.push({
      x,
      y,
      life: 0.34,
      maxLife: 0.34,
      radius: 6,
      maxRadius: 74 * (0.9 + p * 0.2),
      hue,
      width: 1.5 * (0.94 + p * 0.1)
    });
  }

  spawnFloatingText(x: number, y: number, text: string, hue: number): void {
    this.floatingTexts.push({
      x,
      y,
      vx: (Math.random() - 0.5) * 36,
      vy: -56 - Math.random() * 28,
      life: 0.62,
      maxLife: 0.62,
      text,
      hue,
      size: text === "PERFECT" ? 22 : 18
    });
  }

  render(ctx: CanvasRenderingContext2D): void {
    for (const wave of this.shockwaves) {
      const t = 1 - wave.life / wave.maxLife;
      const alpha = (1 - t) * 0.7;

      ctx.save();
      ctx.strokeStyle = `hsla(${wave.hue.toFixed(1)} 100% 72% / ${alpha.toFixed(3)})`;
      ctx.lineWidth = wave.width * (1 - t * 0.35);
      ctx.shadowColor = `hsla(${wave.hue.toFixed(1)} 100% 68% / ${(alpha * 0.7).toFixed(3)})`;
      ctx.shadowBlur = 16;
      ctx.beginPath();
      ctx.arc(wave.x, wave.y, wave.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    for (const p of this.particles) {
      const t = 1 - p.life / p.maxLife;
      const alpha = Math.max(0, 1 - t);
      ctx.save();
      ctx.fillStyle = `hsla(${p.hue.toFixed(1)} 100% 70% / ${(alpha * 0.9).toFixed(3)})`;
      ctx.shadowColor = `hsla(${p.hue.toFixed(1)} 100% 68% / ${(alpha * 0.7).toFixed(3)})`;
      ctx.shadowBlur = 10;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size * (1 - t * 0.35), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    for (const text of this.floatingTexts) {
      const t = 1 - text.life / text.maxLife;
      const alpha = Math.max(0, 1 - t);
      const lift = t * 4;
      const scale = 0.92 + (1 - t) * 0.12;

      ctx.save();
      ctx.translate(text.x, text.y - lift);
      ctx.scale(scale, scale);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.font = `800 ${text.size}px "Trebuchet MS", "Avenir Next Condensed", sans-serif`;
      ctx.lineJoin = "round";
      ctx.strokeStyle = `rgba(10, 14, 20, ${(alpha * 0.85).toFixed(3)})`;
      ctx.lineWidth = 4;
      ctx.shadowColor = `hsla(${text.hue.toFixed(1)} 100% 70% / ${(alpha * 0.55).toFixed(3)})`;
      ctx.shadowBlur = 18;
      ctx.strokeText(text.text, 0, 0);
      ctx.fillStyle = `hsla(${text.hue.toFixed(1)} 100% 85% / ${(alpha * 0.95).toFixed(3)})`;
      ctx.fillText(text.text, 0, 0);
      ctx.restore();
    }
  }
}
