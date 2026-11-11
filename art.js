// Flipwing's drawing code: ship, gates, rocks, stardust and the space backdrop.
// Shared by game.js and the art pages (art/cover.html, art/hero.html), so the library art
// always matches the game. Glow is layered strokes with 'lighter' blending (no shadowBlur).

export const PALETTE = {
  bg: '#070B1A',
  bg2: '#120C2E',
  rock: '#FFB13C',
  rockFill: '#2A1608',
  text: '#EEF4FF',
  dim: '#8D97B8',
  dust: '#FFF6C8'
}

/** Ship colour pairs: [colour A (circle), colour B (triangle)]. Bought in the Hangar with banked stars. */
export const SKINS = [
  { id: 'classic', name: 'Cyan / Magenta', colors: ['#3CF2FF', '#FF4FD8'], price: 0 },
  { id: 'toxic', name: 'Lime / Violet', colors: ['#B6FF3C', '#9B5CFF'], price: 300 },
  { id: 'solar', name: 'Gold / Azure', colors: ['#FFD23C', '#3C8DFF'], price: 750 },
  { id: 'reef', name: 'Mint / Coral', colors: ['#3CFFB0', '#FF6B5C'], price: 1500 },
  { id: 'ghost', name: 'White / Crimson', colors: ['#F4F7FF', '#FF2E4D'], price: 3000 }
]

/** Stroke a path several times, wide and faint to thin and bright: a cheap neon glow. */
export function glowStroke(ctx, path, color, width = 4, glow = 1) {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color
  ctx.lineJoin = 'round'
  ctx.lineCap = 'round'
  if (glow > 0) {
    for (const [w, a] of [[width * 5, 0.07], [width * 3, 0.12], [width * 1.8, 0.22]]) {
      ctx.globalAlpha = a * glow
      ctx.lineWidth = w
      ctx.stroke(path)
    }
  }
  ctx.globalAlpha = 1
  ctx.lineWidth = width
  ctx.stroke(path)
  ctx.restore()
}

/** A soft radial halo. */
export function halo(ctx, x, y, r, color, alpha = 0.35) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r)
  g.addColorStop(0, withAlpha(color, alpha))
  g.addColorStop(1, withAlpha(color, 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = g
  ctx.fillRect(x - r, y - r, r * 2, r * 2)
  ctx.restore()
}

export function withAlpha(hex, a) {
  const n = parseInt(hex.slice(1), 16)
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`
}

/** Mix two hex colours, t = 0..1. */
export function mix(a, b, t) {
  const p = parseInt(a.slice(1), 16)
  const q = parseInt(b.slice(1), 16)
  const ch = (s) => Math.round(((p >> s) & 255) * (1 - t) + ((q >> s) & 255) * t)
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`
}

/** The colour-state marker: a circle for colour A, a triangle for colour B. */
export function marker(ctx, x, y, r, which, color, fill = true) {
  const p = new Path2D()
  if (which === 0) p.arc(x, y, r, 0, Math.PI * 2)
  else {
    p.moveTo(x, y - r * 1.15)
    p.lineTo(x + r * 1.05, y + r * 0.7)
    p.lineTo(x - r * 1.05, y + r * 0.7)
    p.closePath()
  }
  if (fill) {
    ctx.fillStyle = color
    ctx.fill(p)
  } else glowStroke(ctx, p, color, 3, 0.6)
}

/**
 * The ship, pointing up, centred on x,y. which: 0 | 1 (colour A / B). flip: 0..1 progress of a
 * flip animation (the ship squashes sideways and shows both colours). bank: -1..1 lean.
 */
export function drawShip(ctx, x, y, { colors, which = 0, flip = 1, bank = 0, scale = 1, t = 0, thrust = 1 } = {}) {
  const col = colors[which]
  const prev = colors[1 - which]
  const c = flip < 1 ? mix(prev, col, flip) : col
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(scale, scale)
  // Flip squash: narrows at mid-flip, like the wing turning over.
  const sx = flip < 1 ? 0.35 + 0.65 * Math.abs(Math.cos(flip * Math.PI)) : 1
  ctx.rotate(bank * 0.22)
  ctx.scale(sx * (1 - Math.abs(bank) * 0.12), 1)

  halo(ctx, 0, 6, 90, c, 0.22)
  // Engine flame.
  const fl = 26 + 10 * thrust + Math.sin(t * 40) * 5
  const flame = new Path2D()
  flame.moveTo(-10, 30)
  flame.quadraticCurveTo(0, 30 + fl * 1.3, 10, 30)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = withAlpha(c, 0.55)
  ctx.fill(flame)
  ctx.fillStyle = 'rgba(255,255,255,0.8)'
  ctx.beginPath()
  ctx.ellipse(0, 36, 5, 9 + thrust * 3, 0, 0, Math.PI * 2)
  ctx.fill()
  ctx.restore()

  // Hull: a swept dart with wide wings.
  const hull = new Path2D()
  hull.moveTo(0, -46)
  hull.lineTo(12, -14)
  hull.lineTo(44, 18)
  hull.lineTo(40, 30)
  hull.lineTo(12, 22)
  hull.lineTo(0, 32)
  hull.lineTo(-12, 22)
  hull.lineTo(-40, 30)
  hull.lineTo(-44, 18)
  hull.lineTo(-12, -14)
  hull.closePath()
  ctx.fillStyle = withAlpha(c, 0.18)
  ctx.fill(hull)
  glowStroke(ctx, hull, c, 4)
  // Wing stripes.
  const stripes = new Path2D()
  stripes.moveTo(-30, 18)
  stripes.lineTo(-14, 4)
  stripes.moveTo(30, 18)
  stripes.lineTo(14, 4)
  glowStroke(ctx, stripes, c, 2.5, 0.5)
  // Core: circle for colour A, triangle for colour B.
  ctx.globalCompositeOperation = 'lighter'
  marker(ctx, 0, 2, 8, flip < 0.5 ? 1 - which : which, '#FFFFFF')
  ctx.restore()
}

/**
 * A gate across the playfield at y. segs: [{ x0, x1, which }] in screen x. colors: the skin.
 * swap: 0..1, a swapping gate's flash as it changes. t: time for shimmer.
 */
export function drawGate(ctx, y, segs, { colors, t = 0, thick = 22, alpha = 1, warn = 0 } = {}) {
  ctx.save()
  ctx.globalAlpha = alpha
  for (const s of segs) {
    const x0 = s.x0 + 4
    const x1 = s.x1 - 4
    if (s.which === WALL) {
      drawWall(ctx, x0, x1, y, thick, t)
      continue
    }
    const c = s.color ?? colors[s.which]
    // Energy field band.
    const g = ctx.createLinearGradient(0, y - thick * 2.2, 0, y + thick * 2.2)
    g.addColorStop(0, withAlpha(c, 0))
    g.addColorStop(0.5, withAlpha(c, 0.32 + 0.08 * Math.sin(t * 8 + s.x0)))
    g.addColorStop(1, withAlpha(c, 0))
    ctx.save()
    ctx.globalCompositeOperation = 'lighter'
    ctx.fillStyle = g
    ctx.fillRect(x0, y - thick * 2.2, x1 - x0, thick * 4.4)
    ctx.restore()
    // Rails.
    const rail = new Path2D()
    rail.moveTo(x0, y - thick / 2)
    rail.lineTo(x1, y - thick / 2)
    rail.moveTo(x0, y + thick / 2)
    rail.lineTo(x1, y + thick / 2)
    glowStroke(ctx, rail, c, 3)
    // End posts.
    const posts = new Path2D()
    posts.moveTo(x0, y - thick)
    posts.lineTo(x0, y + thick)
    posts.moveTo(x1, y - thick)
    posts.lineTo(x1, y + thick)
    glowStroke(ctx, posts, c, 5, 0.8)
    // Shape markers along the band, drifting.
    const step = 46
    const off = (t * 60) % step
    ctx.save()
    ctx.beginPath()
    ctx.rect(x0 + 8, y - thick, x1 - x0 - 16, thick * 2)
    ctx.clip()
    for (let x = x0 - step + off; x < x1 + step; x += step) marker(ctx, x, y, 6, s.which, withAlpha(c, 0.95))
    ctx.restore()
  }
  if (warn > 0) {
    ctx.globalAlpha = warn
    ctx.fillStyle = '#FFFFFF'
    ctx.globalCompositeOperation = 'lighter'
    for (const s of segs) ctx.fillRect(s.x0, y - 3, s.x1 - s.x0, 6)
  }
  ctx.restore()
}

/** A gate segment no colour can pass: a solid barrier in the rocks' orange, marked with crosses. */
export const WALL = 2
function drawWall(ctx, x0, x1, y, thick, t) {
  const h = thick * 1.6
  ctx.save()
  ctx.fillStyle = PALETTE.rockFill
  ctx.fillRect(x0, y - h / 2, x1 - x0, h)
  // Hazard stripes.
  ctx.beginPath()
  ctx.rect(x0, y - h / 2, x1 - x0, h)
  ctx.clip()
  ctx.strokeStyle = withAlpha(PALETTE.rock, 0.35)
  ctx.lineWidth = 8
  const off = (t * 40) % 28
  for (let x = x0 - h + off; x < x1 + h; x += 28) {
    ctx.beginPath()
    ctx.moveTo(x, y + h / 2)
    ctx.lineTo(x + h, y - h / 2)
    ctx.stroke()
  }
  ctx.restore()
  const edge = new Path2D()
  edge.rect(x0, y - h / 2, x1 - x0, h)
  glowStroke(ctx, edge, PALETTE.rock, 3, 0.9)
}

/** A rough polygon for an asteroid, made once per rock from a seed. */
export function rockShape(r, seed) {
  let s = seed * 9301 + 49297
  const rnd = () => ((s = (s * 9301 + 49297) % 233280) / 233280)
  const n = 9 + Math.floor(rnd() * 4)
  const pts = []
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2
    const rr = r * (0.78 + rnd() * 0.3)
    pts.push([Math.cos(a) * rr, Math.sin(a) * rr])
  }
  const craters = []
  for (let i = 0; i < 2 + Math.floor(rnd() * 2); i++) craters.push([(rnd() - 0.5) * r, (rnd() - 0.5) * r, r * (0.12 + rnd() * 0.12)])
  return { pts, craters }
}

export function drawRock(ctx, x, y, r, shape, angle = 0) {
  ctx.save()
  ctx.translate(x, y)
  ctx.rotate(angle)
  const p = new Path2D()
  shape.pts.forEach(([px, py], i) => (i ? p.lineTo(px, py) : p.moveTo(px, py)))
  p.closePath()
  ctx.fillStyle = PALETTE.rockFill
  ctx.fill(p)
  glowStroke(ctx, p, PALETTE.rock, 3.5, 0.9)
  const cr = new Path2D()
  for (const [cx, cy, rr] of shape.craters) {
    cr.moveTo(cx + rr, cy)
    cr.arc(cx, cy, rr, 0, Math.PI * 2)
  }
  glowStroke(ctx, cr, PALETTE.rock, 1.5, 0.3)
  ctx.restore()
}

export function drawDust(ctx, x, y, t) {
  const r = 7 + Math.sin(t * 10 + x) * 1.5
  halo(ctx, x, y, 26, PALETTE.dust, 0.35)
  const p = new Path2D()
  p.moveTo(x, y - r * 1.6)
  p.lineTo(x + r * 0.45, y - r * 0.45)
  p.lineTo(x + r * 1.6, y)
  p.lineTo(x + r * 0.45, y + r * 0.45)
  p.lineTo(x, y + r * 1.6)
  p.lineTo(x - r * 0.45, y + r * 0.45)
  p.lineTo(x - r * 1.6, y)
  p.lineTo(x - r * 0.45, y - r * 0.45)
  p.closePath()
  ctx.fillStyle = PALETTE.dust
  ctx.fill(p)
}

/** A starfield in three depths. stars: from makeStars(). scroll: world distance travelled. */
export function makeStars(n, w, h, seed = 1) {
  let s = seed
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647)
  return Array.from({ length: n }, () => ({ x: rnd() * w, y: rnd() * h, z: 0.2 + rnd() * 0.8, tw: rnd() * 6 }))
}

export function drawBackdrop(ctx, w, h, { stars, scroll = 0, speed = 0, t = 0, tint = '#3CF2FF' } = {}) {
  const g = ctx.createLinearGradient(0, 0, 0, h)
  g.addColorStop(0, PALETTE.bg2)
  g.addColorStop(0.55, PALETTE.bg)
  g.addColorStop(1, '#04060F')
  ctx.fillStyle = g
  ctx.fillRect(0, 0, w, h)
  // Distant nebula glow.
  halo(ctx, w * 0.2, h * 0.25, w * 0.7, '#5A2BFF', 0.12)
  halo(ctx, w * 0.85, h * 0.6, w * 0.6, tint, 0.06)
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  const streak = Math.min(1, speed / 1200)
  for (const st of stars) {
    const y = (((st.y + scroll * st.z * 0.5) % h) + h) % h
    const len = 2 + streak * 46 * st.z * st.z
    const a = (0.35 + 0.5 * st.z) * (0.7 + 0.3 * Math.sin(t * 2 + st.tw))
    ctx.strokeStyle = `rgba(200,220,255,${a})`
    ctx.lineWidth = 1 + st.z * 1.8
    ctx.beginPath()
    ctx.moveTo(st.x, y)
    ctx.lineTo(st.x, y - len)
    ctx.stroke()
  }
  ctx.restore()
}
