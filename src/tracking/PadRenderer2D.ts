export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type Point = {
  x: number;
  y: number;
};

function roundedRectPath(
  ctx: CanvasRenderingContext2D,
  rect: Rect,
  radius: number
): void {
  const r = Math.min(radius, rect.width * 0.5, rect.height * 0.5);
  ctx.beginPath();
  ctx.moveTo(rect.x + r, rect.y);
  ctx.lineTo(rect.x + rect.width - r, rect.y);
  ctx.quadraticCurveTo(rect.x + rect.width, rect.y, rect.x + rect.width, rect.y + r);
  ctx.lineTo(rect.x + rect.width, rect.y + rect.height - r);
  ctx.quadraticCurveTo(
    rect.x + rect.width,
    rect.y + rect.height,
    rect.x + rect.width - r,
    rect.y + rect.height
  );
  ctx.lineTo(rect.x + r, rect.y + rect.height);
  ctx.quadraticCurveTo(rect.x, rect.y + rect.height, rect.x, rect.y + rect.height - r);
  ctx.lineTo(rect.x, rect.y + r);
  ctx.quadraticCurveTo(rect.x, rect.y, rect.x + r, rect.y);
  ctx.closePath();
}

export function computePadBounds(viewWidth: number, viewHeight: number): Rect {
  const margin = Math.max(20, Math.min(viewWidth, viewHeight) * 0.05);
  const aspect = 1.75;
  const maxWidth = Math.max(100, viewWidth - margin * 2);
  const maxHeight = Math.max(100, viewHeight - margin * 2);

  let width = maxWidth;
  let height = width / aspect;

  if (height > maxHeight) {
    height = maxHeight;
    width = height * aspect;
  }

  return {
    x: (viewWidth - width) * 0.5,
    y: (viewHeight - height) * 0.5,
    width,
    height
  };
}

export function padToPixel(rect: Rect, point: Point): Point {
  return {
    x: rect.x + point.x * rect.width,
    y: rect.y + point.y * rect.height
  };
}

function drawCornerBracket(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  dirX: number,
  dirY: number,
  size: number,
  pulse: number
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = `rgba(207, 195, 168, ${0.18 + pulse * 0.1})`;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(0, dirY * size * 0.75);
  ctx.lineTo(0, 0);
  ctx.lineTo(dirX * size * 0.75, 0);
  ctx.stroke();

  ctx.shadowColor = `rgba(212, 175, 55, ${0.14 + pulse * 0.08})`;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = `rgba(212, 175, 55, ${0.16 + pulse * 0.1})`;
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(dirX * size * 0.18, 0);
  ctx.lineTo(dirX * size * 0.52, 0);
  ctx.moveTo(0, dirY * size * 0.18);
  ctx.lineTo(0, dirY * size * 0.52);
  ctx.stroke();

  ctx.fillStyle = `rgba(255, 223, 152, ${0.18 + pulse * 0.16})`;
  ctx.beginPath();
  ctx.arc(dirX * size * 0.1, dirY * size * 0.1, 2.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawTravelingEdgePulse(
  ctx: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  progress: number,
  span: number
): void {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const length = Math.hypot(dx, dy);
  if (length <= 0) {
    return;
  }

  const ux = dx / length;
  const uy = dy / length;
  const px = -uy;
  const py = ux;
  const center = progress * length;
  const start = Math.max(0, center - span * 0.5);
  const end = Math.min(length, center + span * 0.5);
  if (end <= start) {
    return;
  }

  const sx = x0 + ux * start;
  const sy = y0 + uy * start;
  const ex = x0 + ux * end;
  const ey = y0 + uy * end;
  const gradient = ctx.createLinearGradient(sx, sy, ex, ey);
  gradient.addColorStop(0, "rgba(111, 143, 175, 0)");
  gradient.addColorStop(0.18, "rgba(111, 143, 175, 0.05)");
  gradient.addColorStop(0.5, "rgba(255, 220, 157, 0.28)");
  gradient.addColorStop(0.82, "rgba(111, 143, 175, 0.05)");
  gradient.addColorStop(1, "rgba(111, 143, 175, 0)");

  ctx.save();
  ctx.strokeStyle = gradient;
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.shadowColor = "rgba(212, 175, 55, 0.1)";
  ctx.shadowBlur = 10;
  ctx.beginPath();
  ctx.moveTo(sx, sy);
  ctx.lineTo(ex, ey);
  ctx.stroke();

  ctx.strokeStyle = "rgba(207, 195, 168, 0.06)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx + px * 1.2, sy + py * 1.2);
  ctx.lineTo(ex + px * 1.2, ey + py * 1.2);
  ctx.stroke();
  ctx.restore();
}

export function drawPad(ctx: CanvasRenderingContext2D, rect: Rect, timeSec: number): void {
  const radius = Math.min(rect.width, rect.height) * 0.035;
  const pulse = 0.5 + 0.5 * Math.sin(timeSec * 1.35);
  const minDim = Math.min(rect.width, rect.height);

  const fill = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y + rect.height);
  fill.addColorStop(0, "rgba(19, 17, 15, 0.96)");
  fill.addColorStop(0.42, "rgba(29, 23, 18, 0.95)");
  fill.addColorStop(1, "rgba(24, 18, 16, 0.93)");

  const innerGlow = ctx.createRadialGradient(
    rect.x + rect.width * 0.52,
    rect.y + rect.height * 0.5,
    minDim * 0.05,
    rect.x + rect.width * 0.52,
    rect.y + rect.height * 0.5,
    minDim * 0.72
  );
  innerGlow.addColorStop(0, `rgba(212, 175, 55, ${0.035 + pulse * 0.02})`);
  innerGlow.addColorStop(0.55, "rgba(212, 175, 55, 0.015)");
  innerGlow.addColorStop(1, "rgba(212, 175, 55, 0)");

  ctx.save();
  roundedRectPath(ctx, rect, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.fillStyle = innerGlow;
  ctx.fill();

  const borderGlow = ctx.createLinearGradient(rect.x, rect.y, rect.x + rect.width, rect.y);
  borderGlow.addColorStop(0, `rgba(111, 143, 175, ${0.16 + pulse * 0.08})`);
  borderGlow.addColorStop(0.5, `rgba(212, 175, 55, ${0.18 + pulse * 0.1})`);
  borderGlow.addColorStop(1, `rgba(177, 58, 26, ${0.14 + pulse * 0.08})`);

  ctx.strokeStyle = "rgba(255,255,255,0.04)";
  ctx.lineWidth = 1;
  roundedRectPath(ctx, rect, radius);
  ctx.stroke();

  ctx.save();
  ctx.strokeStyle = borderGlow;
  ctx.lineWidth = 3;
  ctx.shadowColor = `rgba(212, 175, 55, ${0.08 + pulse * 0.06})`;
  ctx.shadowBlur = 14;
  roundedRectPath(ctx, rect, radius);
  ctx.stroke();
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 255, 255, 0.03)";
  ctx.lineWidth = 1;
  roundedRectPath(
    ctx,
    {
      x: rect.x + 6,
      y: rect.y + 6,
      width: rect.width - 12,
      height: rect.height - 12
    },
    Math.max(4, radius - 4)
  );
  ctx.stroke();

  ctx.clip();

  // Low-opacity arcane tracery grid
  ctx.strokeStyle = "rgba(207, 195, 168, 0.04)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 10; i += 1) {
    const x = rect.x + (rect.width * i) / 10;
    ctx.beginPath();
    ctx.moveTo(x, rect.y);
    ctx.lineTo(x, rect.y + rect.height);
    ctx.stroke();
  }

  for (let i = 1; i < 6; i += 1) {
    const y = rect.y + (rect.height * i) / 6;
    ctx.beginPath();
    ctx.moveTo(rect.x, y);
    ctx.lineTo(rect.x + rect.width, y);
    ctx.stroke();
  }

  const shimmerCount = 18;
  for (let i = 0; i < shimmerCount; i += 1) {
    const t = timeSec * 0.13 + i * 0.21;
    const x = rect.x + (((Math.sin(t * 4.1) * 0.5 + 0.5) + i * 0.13) % 1) * rect.width;
    const y = rect.y + (((Math.cos(t * 3.2) * 0.5 + 0.5) + i * 0.17) % 1) * rect.height;
    const r = 1 + (i % 3);
    ctx.fillStyle = `rgba(255,255,255,${0.03 + ((i + pulse) % 3) * 0.015})`;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  // Faint rune circle outline inside the pad plane
  const circleR = minDim * 0.29;
  const centerX = rect.x + rect.width * 0.5;
  const centerY = rect.y + rect.height * 0.5;
  ctx.save();
  ctx.translate(centerX, centerY);
  ctx.rotate(timeSec * 0.06);
  ctx.strokeStyle = `rgba(184, 171, 144, ${0.05 + pulse * 0.02})`;
  ctx.lineWidth = 1.1;
  ctx.beginPath();
  ctx.arc(0, 0, circleR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(255, 203, 149, ${0.07 + pulse * 0.03})`;
  ctx.beginPath();
  ctx.arc(0, 0, circleR * 0.68, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < 16; i += 1) {
    ctx.save();
    ctx.rotate((Math.PI * 2 * i) / 16);
    ctx.beginPath();
    ctx.moveTo(circleR * 0.88, 0);
    ctx.lineTo(circleR * 1.03, 0);
    ctx.stroke();
    ctx.restore();
  }
  ctx.restore();

  ctx.strokeStyle = "rgba(255, 201, 143, 0.12)";
  ctx.lineWidth = 1.25;
  const runeR = minDim * 0.09;
  const corners: Point[] = [
    { x: rect.x + runeR * 0.95, y: rect.y + runeR * 0.95 },
    { x: rect.x + rect.width - runeR * 0.95, y: rect.y + runeR * 0.95 },
    { x: rect.x + runeR * 0.95, y: rect.y + rect.height - runeR * 0.95 },
    { x: rect.x + rect.width - runeR * 0.95, y: rect.y + rect.height - runeR * 0.95 }
  ];
  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(c.x, c.y, runeR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(c.x - runeR * 0.6, c.y);
    ctx.lineTo(c.x + runeR * 0.6, c.y);
    ctx.moveTo(c.x, c.y - runeR * 0.6);
    ctx.lineTo(c.x, c.y + runeR * 0.6);
    ctx.stroke();
  }

  const centerGlow = ctx.createRadialGradient(
    centerX,
    centerY,
    0,
    centerX,
    centerY,
    rect.width * 0.6
  );
  centerGlow.addColorStop(0, `rgba(212, 175, 55, ${0.02 + pulse * 0.01})`);
  centerGlow.addColorStop(1, "rgba(212, 175, 55, 0)");
  ctx.fillStyle = centerGlow;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  ctx.restore();

  // Arcane arena frame corners and animated edge energy pulses (outside clip)
  const cornerSize = minDim * 0.085;
  drawCornerBracket(ctx, rect.x + 10, rect.y + 10, 1, 1, cornerSize, pulse);
  drawCornerBracket(ctx, rect.x + rect.width - 10, rect.y + 10, -1, 1, cornerSize, pulse);
  drawCornerBracket(ctx, rect.x + 10, rect.y + rect.height - 10, 1, -1, cornerSize, pulse);
  drawCornerBracket(ctx, rect.x + rect.width - 10, rect.y + rect.height - 10, -1, -1, cornerSize, pulse);

  const edgeInset = 10;
  const topY = rect.y + edgeInset;
  const bottomY = rect.y + rect.height - edgeInset;
  const leftX = rect.x + edgeInset;
  const rightX = rect.x + rect.width - edgeInset;
  const hSpan = rect.width * 0.24;
  const vSpan = rect.height * 0.38;
  const phaseA = (timeSec * 0.16) % 1;
  const phaseB = (timeSec * 0.13 + 0.42) % 1;

  drawTravelingEdgePulse(ctx, rect.x + cornerSize * 0.55, topY, rect.x + rect.width - cornerSize * 0.55, topY, phaseA, hSpan);
  drawTravelingEdgePulse(
    ctx,
    rect.x + cornerSize * 0.55,
    bottomY,
    rect.x + rect.width - cornerSize * 0.55,
    bottomY,
    1 - phaseB,
    hSpan
  );
  drawTravelingEdgePulse(
    ctx,
    leftX,
    rect.y + cornerSize * 0.55,
    leftX,
    rect.y + rect.height - cornerSize * 0.55,
    phaseB,
    vSpan
  );
  drawTravelingEdgePulse(
    ctx,
    rightX,
    rect.y + cornerSize * 0.55,
    rightX,
    rect.y + rect.height - cornerSize * 0.55,
    1 - phaseA,
    vSpan
  );
}
