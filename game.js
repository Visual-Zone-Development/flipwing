// Flipwing: steer a tiny starship through an asteroid stream with one thumb, and tap to flip its
// colour so it slips through matching energy gates. Endless; score from distance, gates and dust.
// Screens: title (Play / Ship / Settings), pause (Resume / Restart / Settings / Quit to title),
// settings, game over. Works with a controller, a keyboard, a mouse and touch.
import { input } from './input.js'
import { createMenu } from './menu.js'
import { fitCanvas } from './fit.js'
import { createAudio } from './audio.js'
import { createSave, createSettings } from './save.js'
import { createSettingsScreen } from './settings.js'
import { drawPrompts } from './prompts.js'
import { PALETTE, SKINS, WALL, drawShip, drawGate, drawRock, rockShape, drawDust, drawBackdrop, makeStars, glowStroke, halo, marker, withAlpha } from './art.js'
import { createMusic } from './music.js'

const ID = 'flipwing'
/** The smallest space; with fill the canvas grows to the phone's shape. Difficulty lives in a 720-wide column. */
const W = 720
const H = 1280
const canvas = document.getElementById('game')
const fit = fitCanvas(canvas, { w: W, h: H, fill: true, letterbox: PALETTE.bg, orientation: 'portrait' })
const ctx = fit.ctx
input.attach(canvas, W, H)

/** Every gameplay number. Distances in game px, times in seconds. */
const TUNING = {
  column: 720, // playfield width; wider screens only show more backdrop
  shipFromBottom: 380, // ship height above the safe bottom edge (thumb sits below it)
  shipHalfWidth: 40, // how close the ship gets to the column edge
  hitRadius: 22, // ship hitbox (forgiving: the drawn ship is ~44)
  rockHit: 0.82, // fraction of a rock's radius that kills
  dragGain: 1.3, // ship px per thumb px
  tapTime: 0.22, // a touch shorter than this ...
  tapSlop: 16, // ... that moved less than this is a flip
  stickSpeed: 1150, // ship px/s with a stick or arrows at full tilt
  stickResponse: 16, // how quickly the ship reaches stick speed
  startSpeed: 520, // world scroll px/s
  accel: 4.2, // px/s gained per second
  maxSpeed: 1250,
  pxPerMetre: 40,
  minGapTime: 0.52, // seconds between threats, at the current speed
  graceTime: 0.07, // a flip this soon after reaching a wrong gate still counts
  lateWindow: 0.25, // a flip this close before a gate is a Late flip
  // Score comes only from what you do; distance is its own record.
  gatePoints: 50,
  latePoints: 50, // on top of the gate's points
  starPoints: 10,
  streakLevels: [0, 5, 10, 20, 35], // streak needed for ×1 … ×5 (a gate adds 1, a late-flip gate 2)
  wastedFlipAhead: 400, // a flip with no gate this close above the screen breaks the streak
  shieldStars: 120, // stars in one run to charge the shield (a lot, on purpose)
  shieldGrace: 1.2, // seconds the ship can't be hit after its shield breaks
  // Sliding gates: the line between two colours (or a narrow gap's opening) glides side to side.
  slideAmp: [120, 200], // how far a split gate's divider swings from the middle (px)
  slideGapAmp: [90, 150], // how far a sliding gap's opening swings
  slidePeriod: [2.6, 3.4], // seconds for one full swing there and back
  gapWidth: 190, // a narrow gap's opening when they first appear ...
  gapMin: 130, // ... shrinking to this
  gapShrink: 0.6, // px per second of run time after they appear
  wallEdge: 16, // how far the ship's wings may poke into a wall: less than this is safe
  firstGateAt: 2.6, // seconds into a run
  stages: [
    { at: 0, name: null },
    { at: 30, name: 'Split gates', tip: 'Steer into your colour, or flip' },
    { at: 55, name: 'Narrow gaps', tip: 'Thread the gap in your colour' },
    { at: 80, name: 'Sliding gates', tip: 'Their colours slide side to side' },
    { at: 105, name: 'Drifting rocks', tip: 'They slide sideways' },
    { at: 130, name: 'Three-way gates', tip: 'Find your lane' }
  ],
  deathSlowmo: 0.5,
  deathDelay: 1.1,
  overLock: 0.6 // game over ignores input this long, so a stray tap doesn't restart
}

const settings = createSettings(ID, { vibrate: true }) // flipwing-settings-v1
const audio = createAudio({ settings })
const music = createMusic(audio)
const OLD_UNLOCKS = { classic: 0, toxic: 1500, solar: 4000, reef: 8000, ghost: 15000 }
const save = createSave(ID, 2, { best: 0, bestDist: 0, skin: 'classic', runs: 0, stars: 0, owned: ['classic'] }, (old) => ({
  // v1 scored distance, so its best can't be compared: it resets. Distance, runs and colours earned stay.
  best: 0,
  bestDist: old.bestDist ?? 0,
  runs: old.runs ?? 0,
  skin: old.skin ?? 'classic',
  stars: 0,
  owned: Object.keys(OLD_UNLOCKS).filter((id) => OLD_UNLOCKS[id] <= (old.best ?? 0))
})) // flipwing-save-v2

const state = {
  screen: 'title', // title | playing | paused | settings | gameover
  from: 'title',
  t: 0, // run time
  clock: 0, // real time, for animation
  speed: TUNING.startSpeed,
  scroll: 0,
  dist: 0,
  score: 0,
  mult: 1,
  streak: 0,
  bestMult: 1,
  gates: 0,
  lateFlips: 0,
  starsRun: 0,
  pts: { gates: 0, late: 0, stars: 0 },
  shieldCharge: 0,
  shield: false,
  invuln: 0,
  tallyT: 0,
  panel: null, // 'hangar' while the title shows the Hangar
  hangarMsg: null,
  ship: { x: TUNING.column / 2, vx: 0, which: 0, flipT: 1, bank: 0, lastFlip: -9, beforeFlip: 0 },
  things: [], // rocks, gates, dust
  nextSpawn: 0, // world px until the next pattern
  stage: 0,
  banner: null,
  popups: [],
  dying: 0, // > 0 while the death animation plays
  shake: 0,
  flash: 0,
  newBest: false,
  affordable: null,
  overLock: 0,
  bgScroll: 0
}
const particles = []
const trail = []
const stars = makeStars(170, 1600, 2400, 7)
const touchState = { down: false, t: 0, lastX: 0, moved: 0 }
let god = false

window.__game = {
  state,
  TUNING,
  save,
  settings,
  get titleMenu() {
    return titleMenu
  },
  get pauseMenu() {
    return pauseMenu
  },
  get pauseButton() {
    return pauseButton()
  },
  /** For headless playtests: start a run, flip, and read what's coming. */
  start: () => startRound(),
  flip: () => flip(),
  god: (on = true) => (god = on)
}
const params = new URLSearchParams(location.search)
const debug = params.has('debug')
if (params.has('god')) god = true

// ---------- Layout (fill: the space follows the screen, so everything is placed from fit.w / fit.h)

const ox = () => Math.round((fit.w - TUNING.column) / 2)
const shipY = () => Math.round(fit.h - fit.safe.bottom - TUNING.shipFromBottom)
const textScale = () => settings.data.textScale ?? 1
/** Chakra Petch (bundled, OFL) for every piece of text; system-ui until it has loaded. */
const FACE = '"Chakra Petch", system-ui, sans-serif'
for (const weight of ['600', '700']) {
  try {
    const f = new FontFace('Chakra Petch', `url(./assets/fonts/chakra-petch-${weight}.woff2)`, { weight })
    document.fonts.add(f)
    f.load().catch(() => {})
  } catch {
    // no FontFace: system-ui it is
  }
}
const fontPx = (weight, px) => `${weight >= 700 ? 700 : 600} ${Math.round(px)}px ${FACE}`
const font = (weight, px) => fontPx(weight, px * textScale())
/** Letter spacing where the browser supports it on canvas. */
const track = (px) => {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${px}px`
}
const skin = () => SKINS.find((s) => s.id === save.data.skin) ?? SKINS[0]
const colors = () => skin().colors
const owns = (id) => save.data.owned.includes(id)
const multFor = (streak) => TUNING.streakLevels.filter((n) => streak >= n).length

const MENU_W = 500
const menuOpts = (y) => ({ x: fit.w / 2, y, width: MENU_W, height: 88, gap: 22, wrap: true })
let titleMenu, pauseMenu, overMenu, settingsScreen, hangarMenu
function buildMenus() {
  const keep = (m) => m?.selected?.id
  const sel = { title: keep(titleMenu), pause: keep(pauseMenu), over: keep(overMenu), settings: keep(settingsScreen?.menu), hangar: keep(hangarMenu) }
  const bottom = fit.h - fit.safe.bottom
  titleMenu = createMenu(
    [
      { id: 'play', label: 'Play' },
      { id: 'hangar', label: 'Hangar' },
      { id: 'settings', label: 'Settings' }
    ],
    menuOpts(titleMenuY())
  )
  pauseMenu = createMenu(
    [
      { id: 'resume', label: 'Resume' },
      { id: 'restart', label: 'Restart' },
      { id: 'settings', label: 'Settings' },
      { id: 'title', label: 'Quit to title' }
    ],
    menuOpts(Math.max(fit.h * 0.42, bottom - 620))
  )
  overMenu = createMenu(
    [
      { id: 'again', label: 'Play again' },
      { id: 'title', label: 'Title' }
    ],
    menuOpts(Math.max(fit.h * 0.6, bottom - 420))
  )
  settingsScreen = createSettingsScreen({
    settings,
    audio,
    x: fit.w / 2,
    y: fit.safe.top + 220,
    width: Math.min(580, fit.w - 140),
    extra: [{ id: 'vibrate', label: 'Vibration', type: 'toggle', value: true }]
  })
  hangarMenu = createMenu([...SKINS.map((k) => ({ id: k.id, label: k.name })), { id: 'back', label: 'Back' }], {
    x: fit.w / 2,
    y: fit.safe.top + 250,
    width: Math.min(580, fit.w - 140),
    height: 92,
    gap: 18,
    quitToLibrary: false
  })
  if (sel.hangar) hangarMenu.select(sel.hangar)
  else hangarMenu.select(save.data.skin)
  if (sel.title) titleMenu.select(sel.title)
  if (sel.pause) pauseMenu.select(sel.pause)
  if (sel.over) overMenu.select(sel.over)
  if (sel.settings) settingsScreen.menu.select(sel.settings)
}
buildMenus()
let lastSize = ''
function layout() {
  const key = `${fit.w}x${fit.h}:${fit.safe.top},${fit.safe.bottom}:${textScale()}`
  if (key !== lastSize) {
    lastSize = key
    buildMenus()
  }
}

/** On-screen pause button: top-right, inside the safe area, 64×64. */
const pauseButton = () => ({ x: fit.w - fit.safe.right - 32 - 64, y: fit.safe.top + 28, w: 64, h: 64 })
const inside = (p, r) => p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h

input.onPause(() => {
  if (state.screen === 'playing') pause()
})

// ---------- Flow

function startRound() {
  Object.assign(state, {
    screen: 'playing',
    t: 0,
    speed: TUNING.startSpeed,
    scroll: 0,
    dist: 0,
    score: 0,
    mult: 1,
    streak: 0,
    bestMult: 1,
    gates: 0,
    lateFlips: 0,
    starsRun: 0,
    pts: { gates: 0, late: 0, stars: 0 },
    shieldCharge: 0,
    shield: false,
    invuln: 0,
    things: [],
    nextSpawn: 0,
    stage: 0,
    banner: null,
    popups: [],
    dying: 0,
    shake: 0,
    flash: 0,
    newBest: false,
    affordable: null,
    firstGate: false
  })
  state.ship = { x: TUNING.column / 2, vx: 0, which: 0, flipT: 1, bank: 0, lastFlip: -9, beforeFlip: 0 }
  particles.length = 0
  trail.length = 0
  touchState.down = false
  music.setMode('run')
}
function pause() {
  pauseMenu.select('resume')
  state.screen = 'paused'
  touchState.down = false
  save.save()
}
function openSettings(from) {
  state.from = from
  state.screen = 'settings'
}
function toTitle() {
  state.screen = 'title'
  state.panel = null
  buildMenus()
  music.setMode('title')
}

function endRound() {
  const oldBest = save.data.best
  save.data.runs++
  save.data.bestDist = Math.max(save.data.bestDist, Math.floor(state.dist))
  if (state.score > oldBest) {
    save.data.best = state.score
    state.newBest = oldBest > 0
  }
  // Every star collected is banked, even in a bad run.
  const before = save.data.stars
  save.data.stars += state.starsRun
  // Colours that just became affordable get a mention.
  state.affordable = SKINS.find((k) => !owns(k.id) && k.price > before && k.price <= save.data.stars) ?? null
  save.save()
  state.screen = 'gameover'
  state.overLock = TUNING.overLock
  state.tallyT = 0
  state.tallyTicks = 0
  overMenu.select('again')
  buildMenus()
  music.setMode('title')
}

// ---------- Update

function update(dt) {
  state.clock += dt
  // The white flash fades on every screen (a death's flash used to stay over the results).
  state.flash = Math.max(0, state.flash - dt * 4)
  if (state.screen === 'title') state.bgScroll += 320 * dt
  else if (state.screen === 'playing' && state.dying <= 0) state.bgScroll += state.speed * dt
  layout()
  music.update(state.screen === 'playing' ? state.speed : TUNING.startSpeed, state.screen !== 'paused')
  updateParticles(dt * (state.dying > 0 ? TUNING.deathSlowmo : 1))
  switch (state.screen) {
    case 'title': {
      updateTitleScene(dt)
      if (state.hangarMsg && (state.hangarMsg.t -= dt) <= 0) state.hangarMsg = null
      if (state.panel === 'hangar') return updateHangar(dt)
      const choice = titleMenu.update(input, dt)
      if (choice === 'play') startRound()
      if (choice === 'hangar') {
        state.panel = 'hangar'
        hangarMenu.select(save.data.skin)
      }
      if (choice === 'settings') openSettings('title')
      return
    }
    case 'settings':
      if (settingsScreen.update(input, dt) === 'back') {
        state.screen = state.from
        buildMenus()
      }
      return
    case 'paused': {
      const choice = pauseMenu.update(input, dt)
      if (choice === 'resume' || choice === 'back') state.screen = 'playing'
      if (choice === 'restart') startRound()
      if (choice === 'settings') openSettings('paused')
      if (choice === 'title') toTitle()
      return
    }
    case 'gameover': {
      updateTally(dt)
      state.overLock -= dt
      if (state.overLock > 0) return
      const choice = overMenu.update(input, dt)
      if (choice === 'again') startRound()
      if (choice === 'title' || choice === 'back') toTitle()
      return
    }
  }
  play(dt)
}

function vibrate(ms) {
  if (settings.data.vibrate !== false) navigator.vibrate?.(ms)
}

function flip() {
  const s = state.ship
  s.beforeFlip = s.which
  s.which = 1 - s.which
  s.flipT = 0
  s.lastFlip = state.t
  if (state.screen === 'playing' && state.gates >= 3 && !gateComing()) loseStreak('WASTED FLIP')
  const up = s.which === 1
  audio.tone({ freq: up ? 620 : 880, dur: 0.09, slide: up ? 380 : -380, gain: 0.12 })
  vibrate(8)
  const c = colors()[s.which]
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2
    spark(ox() + s.x, shipY(), Math.cos(a) * 260, Math.sin(a) * 260, c, 0.3)
  }
}

/** Touch and mouse: the ship moves by how far the pointer slides; a short, still touch flips. */
function pointerControl() {
  const p = input.pointer
  const usePointer = input.mode === 'touch' || input.mode === 'mouse'
  if (p.pressed && inside(p, pauseButton())) {
    input.requestMenu()
    return
  }
  if (p.pressed && usePointer) Object.assign(touchState, { down: true, t: state.clock, lastX: p.x, moved: 0 })
  if (!touchState.down) return
  const dx = p.x - touchState.lastX
  touchState.lastX = p.x
  touchState.moved += Math.abs(dx)
  state.ship.x += dx * TUNING.dragGain
  state.ship.dragV = dx * TUNING.dragGain
  if (p.released || !p.down) {
    if (state.clock - touchState.t < TUNING.tapTime && touchState.moved < TUNING.tapSlop) flip()
    touchState.down = false
  }
}
/** A touch that could still turn out to be a flip. */
const tapPending = () => touchState.down && touchState.moved < TUNING.tapSlop && state.clock - touchState.t < TUNING.tapTime

function play(rawDt) {
  if (input.pressed('menu')) return pause()
  // Death: slow motion, then the results.
  if (state.dying > 0) {
    state.dying -= rawDt
    const dt = rawDt * TUNING.deathSlowmo
    for (const th of state.things) th.y += state.speed * 0.25 * dt
    state.shake = Math.max(0, state.shake - rawDt)
    if (state.dying <= 0) endRound()
    return
  }
  const dt = rawDt
  const s = state.ship
  state.t += dt
  state.speed = Math.min(TUNING.maxSpeed, TUNING.startSpeed + TUNING.accel * state.t)

  // Steering.
  s.dragV = 0
  pointerControl()
  if (state.screen !== 'playing') return
  const target = input.x * TUNING.stickSpeed
  s.vx += (target - s.vx) * Math.min(1, dt * TUNING.stickResponse)
  s.x += s.vx * dt
  const lo = TUNING.shipHalfWidth
  const hi = TUNING.column - TUNING.shipHalfWidth
  s.x = Math.max(lo, Math.min(hi, s.x))
  const lean = s.vx / TUNING.stickSpeed + (s.dragV || 0) / (900 * dt + 1e-6) * 0.6
  s.bank += (Math.max(-1, Math.min(1, lean)) - s.bank) * Math.min(1, dt * 12)
  if (['a', 'b', 'x', 'y'].some((b) => input.pressed(b))) flip()
  s.flipT = Math.min(1, s.flipT + dt / 0.14)

  // Scroll the world.
  const move = state.speed * dt
  state.scroll += move
  const metres = move / TUNING.pxPerMetre
  state.dist += metres
  state.nextSpawn -= move
  if (state.nextSpawn <= 0) spawnPattern()

  state.invuln = Math.max(0, state.invuln - dt)

  // Stage changes bring a banner.
  const next = TUNING.stages[state.stage + 1]
  if (next && state.t >= next.at) {
    state.stage++
    state.banner = { text: next.name, tip: next.tip, t: 2.8 }
    audio.tone({ freq: 392, dur: 0.14, type: 'triangle', gain: 0.16 })
    audio.tone({ freq: 587, dur: 0.22, type: 'triangle', gain: 0.16, delay: 0.12 })
  }
  if (state.banner && (state.banner.t -= dt) <= 0) state.banner = null

  const sy = shipY()
  for (const th of state.things) {
    const prevY = th.y
    th.y += move
    if (th.kind === 'rock') {
      th.x += th.vx * dt
      if (th.x < th.r || th.x > TUNING.column - th.r) th.vx *= -1
      th.angle += th.spin * dt
      if (!th.smashed && Math.hypot(th.x - s.x, th.y - sy) < th.r * TUNING.rockHit + TUNING.hitRadius && hit(th)) return
    } else if (th.kind === 'dust') {
      if (!th.taken && Math.abs(th.x - s.x) < 44 && Math.abs(th.y - sy) < 44) collectDust(th)
    } else if (th.kind === 'gate') {
      if (th.slide && !th.passed) slideGate(th, dt)
      if (!th.passed && prevY < sy && th.y >= sy) {
        th.passed = true
        const at = (x) => th.segs.find((g) => x >= g.x0 && x < g.x1) ?? th.segs[0]
        th.seg = at(s.x)
        // Walls stop any colour: the ship's body has to fit through the opening.
        const e = TUNING.hitRadius - TUNING.wallEdge + 12
        if ([at(s.x - e), th.seg, at(s.x + e)].some((g) => g.which === WALL)) {
          if (hit(th)) return
          continue
        }
        th.check = TUNING.graceTime
      }
      if (th.check !== undefined) {
        const ok = th.seg.which === s.which
        if (ok) {
          passGate(th)
          th.check = undefined
        } else if (tapPending()) {
          // A tap in progress may still be a flip: wait for it.
        } else if ((th.check -= dt) <= 0) {
          th.check = undefined
          if (hit(th)) return
        }
      }
    }
  }
  state.things = state.things.filter((th) => th.y < fit.h + 200 && !th.smashed)

  // Trail behind the ship.
  for (const tp of trail) tp.y += move
  trail.unshift({ x: s.x, y: sy + 30, c: colors()[s.which] })
  if (trail.length > 26) trail.length = 26
  for (const pp of state.popups) (pp.t -= dt), (pp.y -= 60 * dt)
  state.popups = state.popups.filter((pp) => pp.t > 0)
  state.shake = Math.max(0, state.shake - dt)
}

function popup(text, x, y, color, size = 40) {
  state.popups.push({ text, x, y, color, size, t: 0.9 })
}

function passGate(g) {
  const s = state.ship
  state.gates++
  const late = state.t - s.lastFlip < TUNING.lateWindow + TUNING.graceTime && s.beforeFlip !== g.seg.which
  const c = colors()[g.seg.which]
  // The streak: +1 per gate, +2 for a late flip. Its level is the multiplier.
  const before = state.mult
  state.streak += late ? 2 : 1
  state.mult = multFor(state.streak)
  state.bestMult = Math.max(state.bestMult, state.mult)
  const gatePts = TUNING.gatePoints * state.mult
  state.pts.gates += gatePts
  let pts = gatePts
  if (late) {
    state.lateFlips++
    const latePts = TUNING.latePoints * state.mult
    state.pts.late += latePts
    pts += latePts
    popup('LATE FLIP!', s.x, shipY() - 130, c, 46)
    ;[0, 0.06, 0.12].forEach((d, i) => audio.tone({ freq: 1046 * (1 + i * 0.25), dur: 0.08, type: 'triangle', gain: 0.1, delay: d }))
    if (!settings.data.reducedShake) state.flash = 0.35
  }
  state.score += pts
  popup(state.mult > 1 ? `+${pts}  ×${state.mult}` : `+${pts}`, s.x, shipY() - 76, state.mult > 1 ? colors()[1] : PALETTE.text, 36)
  const pitch = 1 + (state.mult - 1) * 0.12
  audio.tone({ freq: 523 * pitch, dur: 0.16, type: 'triangle', gain: 0.14 })
  audio.tone({ freq: 784 * pitch, dur: 0.2, type: 'triangle', gain: 0.1, delay: 0.03 })
  if (state.mult > before) {
    // A new multiplier level is an event.
    state.multPop = 1
    popup(`×${state.mult}`, TUNING.column / 2, fit.h * 0.32, colors()[1], 120)
    ;[0, 0.08, 0.16, 0.24].forEach((d, i) => audio.tone({ freq: [523, 659, 784, 1047][i] * pitch, dur: 0.14, type: 'triangle', gain: 0.14, delay: d }))
    vibrate(30)
  }
  // The matched segment shatters.
  const o = ox()
  for (let i = 0; i < 26; i++) {
    const x = g.seg.x0 + Math.random() * (g.seg.x1 - g.seg.x0)
    spark(o + x, g.y, (Math.random() - 0.5) * 300, -100 - Math.random() * 400, c, 0.5)
  }
  ring(o + s.x, shipY(), c)
  g.shattered = g.seg
}

/** Is a gate on its way (or being crossed right now)? A flip without one is wasted. */
function gateComing() {
  const sy = shipY()
  return state.things.some((th) => th.kind === 'gate' && (th.check !== undefined || (!th.passed && th.y < sy && th.y > -TUNING.wastedFlipAhead)))
}

function loseStreak(reason) {
  if (state.streak <= 0) return
  state.streak = 0
  state.mult = 1
  popup(reason, state.ship.x, shipY() - 130, PALETTE.rock, 38)
  audio.tone({ freq: 220, dur: 0.22, type: 'sawtooth', gain: 0.1, slide: -90 })
}

/** Something would end the run: the shield takes it if it's up. Returns true when the run ends. */
function hit(th) {
  if (god || state.invuln > 0) return false
  if (state.shield) {
    breakShield(th)
    return false
  }
  die(th)
  return true
}

function breakShield(th) {
  state.shield = false
  state.shieldCharge = 0
  state.invuln = TUNING.shieldGrace
  if (th.kind === 'rock') th.smashed = true
  const o = ox()
  const sy = shipY()
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 200 + Math.random() * 400
    spark(o + state.ship.x, sy, Math.cos(a) * v, Math.sin(a) * v, i % 2 ? '#FFFFFF' : th.kind === 'rock' ? PALETTE.rock : colors()[state.ship.which], 0.6)
  }
  ring(o + state.ship.x, sy, '#FFFFFF', 1.4)
  state.shake = settings.data.reducedShake ? 0 : 0.35
  audio.noise({ dur: 0.3, gain: 0.25 })
  audio.tone({ freq: 880, dur: 0.3, type: 'square', gain: 0.1, slide: -600 })
  vibrate(60)
  popup('SHIELD BROKEN', state.ship.x, shipY() - 170, '#FFFFFF', 40)
  loseStreak('STREAK LOST')
}

/**
 * A sliding gate moves every inner edge (the divider between colours, or a gap's opening) by the
 * same smooth sideways swing. The segments are moved in place so the one the ship is in stays
 * the same object; it stops moving once the ship has crossed it.
 */
function slideGate(g, dt) {
  const sl = g.slide
  sl.t += dt
  const off = sl.amp * Math.sin(sl.phase + (sl.t * Math.PI * 2) / sl.period)
  const last = g.segs.length - 1
  g.segs.forEach((seg, i) => {
    if (i > 0) seg.x0 = sl.base[i][0] + off
    if (i < last) seg.x1 = sl.base[i][1] + off
  })
}

function collectDust(d) {
  d.taken = true
  const pts = TUNING.starPoints * state.mult
  state.score += pts
  state.pts.stars += pts
  state.starsRun++
  state.dustChain = (state.dustChain || 0) + 1
  audio.tone({ freq: 1200 + (state.dustChain % 8) * 90, dur: 0.05, type: 'sine', gain: 0.07 })
  for (let i = 0; i < 5; i++) spark(ox() + d.x, d.y, (Math.random() - 0.5) * 240, (Math.random() - 0.5) * 240, PALETTE.dust, 0.3)
  // Stars charge the shield (slowly: it takes a lot of them).
  if (!state.shield) {
    state.shieldCharge++
    if (state.shieldCharge >= TUNING.shieldStars) {
      state.shield = true
      popup('SHIELD READY', state.ship.x, shipY() - 150, '#FFFFFF', 44)
      ;[0, 0.1, 0.2].forEach((dl, i) => audio.tone({ freq: [660, 880, 1320][i], dur: 0.2, type: 'triangle', gain: 0.14, delay: dl }))
      vibrate(40)
    }
  }
}

function die(cause) {
  state.dying = TUNING.deathDelay
  touchState.down = false
  const s = state.ship
  const o = ox()
  const sy = shipY()
  const c = colors()[s.which]
  for (let i = 0; i < 70; i++) {
    const a = Math.random() * Math.PI * 2
    const v = 120 + Math.random() * 620
    spark(o + s.x, sy, Math.cos(a) * v, Math.sin(a) * v, i % 3 ? c : PALETTE.rock, 0.7 + Math.random() * 0.6)
  }
  ring(o + s.x, sy, '#FFFFFF')
  ring(o + s.x, sy, c, 1.6)
  state.shake = settings.data.reducedShake ? 0 : 0.6
  if (!settings.data.reducedShake) state.flash = 0.6
  state.deathCause = cause.kind
  audio.noise({ dur: 0.6, gain: 0.32 })
  audio.tone({ freq: 320, dur: 0.7, type: 'sawtooth', gain: 0.16, slide: -260 })
  vibrate(160)
}

// ---------- Spawning: patterns of rocks, gates and dust, spaced by time at the current speed

const rnd = (a, b) => a + Math.random() * (b - a)
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)]
let rockSeed = 1

function rock(x, y, r, vx = 0) {
  return { kind: 'rock', x, y, r, vx, angle: Math.random() * 6, spin: rnd(-1.2, 1.2), shape: rockShape(r, rockSeed++) }
}
function gate(y, segs, extra = {}) {
  return { kind: 'gate', y, segs, ...extra }
}
function dustLine(x, y, n, dx = 0) {
  return Array.from({ length: n }, (_, i) => ({ kind: 'dust', x: Math.max(40, Math.min(TUNING.column - 40, x + dx * i)), y: y - i * 64 }))
}
/** Split the column into n lanes with alternating colours, starting with `first`. */
function lanes(n, first) {
  const w = TUNING.column / n
  return Array.from({ length: n }, (_, i) => ({ x0: i * w, x1: (i + 1) * w, which: (first + i) % 2 }))
}

/**
 * A wall with a narrow opening (or, later, two openings of different colours far apart): the ship
 * has to thread it, in the opening's colour. The opening narrows the longer the run goes.
 */
function gapSegs(first, two, margin = 60) {
  const C = TUNING.column
  const since = Math.max(0, state.t - TUNING.stages[2].at)
  const w = Math.max(TUNING.gapMin, TUNING.gapWidth - since * TUNING.gapShrink)
  const openings = []
  if (two) {
    const a = rnd(margin, C / 2 - w - 40)
    const b = rnd(C / 2 + 40, C - margin - w)
    openings.push({ x0: a, x1: a + w, which: first }, { x0: b, x1: b + w, which: 1 - first })
  } else {
    const a = rnd(margin, C - margin - w)
    openings.push({ x0: a, x1: a + w, which: first })
  }
  const segs = []
  let x = 0
  for (const o of openings) {
    segs.push({ x0: x, x1: o.x0, which: WALL }, o)
    x = o.x1
  }
  segs.push({ x0: x, x1: C, which: WALL })
  return segs
}

function spawnPattern() {
  const C = TUNING.column
  const top = -120
  const v = state.speed
  const gap = Math.max(240, v * TUNING.minGapTime)
  const st = state.stage
  const items = []
  let length = 0
  const s = state.ship

  // The first gate of a run teaches the flip: full width, the other colour.
  if (!state.firstGate && state.t >= TUNING.firstGateAt) {
    state.firstGate = true
    items.push(gate(top, [{ x0: 0, x1: C, which: 1 - s.which }], { teach: true }))
    items.push(...dustLine(C / 2, top + 380, 4))
    length = 200
  } else {
    const options = [['rocks', 3], ['gate', 3], ['dust', 1]]
    if (st >= 1) options.push(['split2', 3])
    if (st >= 2) options.push(['gap', 3])
    if (st >= 3) options.push(['slide', 3])
    if (st >= 5) options.push(['split3', 2])
    if (!state.firstGate) options.splice(1, 1) // only rocks and dust before the teaching gate
    let total = options.reduce((a, [, w]) => a + w, 0)
    let roll = Math.random() * total
    const kind = options.find(([, w]) => (roll -= w) < 0)[0]
    const drift = () => (st >= 4 && Math.random() < 0.45 ? pick([-1, 1]) * rnd(60, 140) : 0)
    const which = () => (Math.random() < 0.5 ? 0 : 1)

    if (kind === 'rocks') {
      const n = 1 + Math.floor(Math.random() * Math.min(3, 1 + st))
      const spacing = Math.max(170, v * 0.38)
      for (let i = 0; i < n; i++) {
        const r = rnd(34, 62)
        items.push(rock(rnd(r, C - r), top - i * spacing, r, drift()))
      }
      length = (n - 1) * spacing
      if (Math.random() < 0.4) items.push(...dustLine(rnd(80, C - 80), top - length - 40, 3, rnd(-40, 40)))
    } else if (kind === 'gate') {
      items.push(gate(top, [{ x0: 0, x1: C, which: which() }]))
      if (Math.random() < 0.5) items.push(...dustLine(rnd(80, C - 80), top + 260, 3))
    } else if (kind === 'dust') {
      const x = rnd(120, C - 120)
      items.push(...dustLine(x, top, 6, pick([-50, 50, 0])))
      length = 320
    } else if (kind === 'split2' || kind === 'split3') {
      const n = kind === 'split2' ? 2 : 3
      const segs = lanes(n, which())
      items.push(gate(top, segs))
      // From drifting rocks on, a rock may guard one lane in front of the gate.
      if (st >= 4 && Math.random() < 0.5) {
        const seg = pick(segs)
        const lead = Math.max(260, v * 0.32)
        items.push(rock((seg.x0 + seg.x1) / 2, top + lead, rnd(30, 40)))
      }
    } else if (kind === 'slide') {
      // Half are a two-lane split whose divider glides, half a narrow gap whose opening glides.
      const isGap = Math.random() < 0.5
      const amp = rnd(...(isGap ? TUNING.slideGapAmp : TUNING.slideAmp))
      const segs = isGap ? gapSegs(which(), false, 60 + amp) : lanes(2, which())
      const slide = { amp, period: rnd(...TUNING.slidePeriod), phase: rnd(0, Math.PI * 2), t: 0, base: segs.map((g) => [g.x0, g.x1]) }
      const g = gate(top, segs, { slide })
      slideGate(g, 0)
      items.push(g)
    } else if (kind === 'gap') {
      items.push(gate(top, gapSegs(which(), st >= 3 && Math.random() < 0.5)))
    }
  }
  state.things.push(...items)
  state.nextSpawn = length + gap * rnd(1, 1.35)
}

// ---------- Particles (capped; skipped shake/flash honour reduced shake)

const MAX_PARTICLES = 320
function spark(x, y, vx, vy, color, life) {
  if (particles.length >= MAX_PARTICLES) particles.shift()
  particles.push({ kind: 'spark', x, y, vx, vy, color, life, max: life })
}
function ring(x, y, color, scale = 1) {
  particles.push({ kind: 'ring', x, y, color, life: 0.4 * scale, max: 0.4 * scale, scale })
}
function updateParticles(dt) {
  const fall = state.screen === 'playing' && state.dying <= 0 ? state.speed * dt * 0.6 : 0
  for (const p of particles) {
    p.life -= dt
    if (p.kind === 'spark') {
      p.x += p.vx * dt
      p.y += p.vy * dt + fall
      p.vx *= 1 - dt * 2
      p.vy *= 1 - dt * 2
    }
  }
  for (let i = particles.length - 1; i >= 0; i--) if (particles[i].life <= 0) particles.splice(i, 1)
}
function drawParticles() {
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (const p of particles) {
    const a = Math.max(0, p.life / p.max)
    if (p.kind === 'spark') {
      ctx.strokeStyle = withAlpha(p.color, a)
      ctx.lineWidth = 3.5
      ctx.beginPath()
      ctx.moveTo(p.x, p.y)
      ctx.lineTo(p.x - p.vx * 0.04, p.y - p.vy * 0.04)
      ctx.stroke()
    } else {
      ctx.strokeStyle = withAlpha(p.color, a * 0.8)
      ctx.lineWidth = 6 * a + 1
      ctx.beginPath()
      ctx.arc(p.x, p.y, (1 - a) * 160 * p.scale + 20, 0, Math.PI * 2)
      ctx.stroke()
    }
  }
  ctx.restore()
}

// ---------- Title scene: the ship bursts through a split gate, flipping as it crosses

const title = { gateY: -200, which: 0, flipT: 1, rocks: [] }
function updateTitleScene(dt) {
  const sy = titleShipY()
  const prev = title.gateY
  title.gateY += 420 * dt
  if (prev < sy && title.gateY >= sy) {
    title.which = 1 - title.which
    title.flipT = 0
    const c = colors()[title.which]
    for (let i = 0; i < 24; i++) spark(fit.w / 2 + rnd(-110, 110), sy, rnd(-200, 200), rnd(-420, -60), c, 0.6)
    ring(fit.w / 2, sy, c)
  }
  if (title.gateY > sceneBottom() + 160) title.gateY = sceneTop() - 160
  title.flipT = Math.min(1, title.flipT + dt / 0.14)
}
/** The title screen in three bands: the logo, the scene (ship, gate, rocks, controls) and the menu. */
function titleMenuY() {
  return Math.round(Math.max(fit.h * 0.6, fit.h - fit.safe.bottom - 470))
}
function sceneTop() {
  return fit.safe.top + 360
}
function sceneBottom() {
  return titleMenuY() - 60
}
function titleShipY() {
  return Math.round(sceneTop() + (sceneBottom() - sceneTop()) * 0.38)
}

// ---------- Hangar: spend banked stars on ship colours

function updateHangar(dt) {
  const choice = hangarMenu.update(input, dt)
  if (choice === 'back') {
    state.panel = null
    return
  }
  const k = SKINS.find((q) => q.id === choice)
  if (!k) return
  if (owns(k.id)) {
    save.data.skin = k.id
    audio.tone({ freq: 700, dur: 0.08, gain: 0.12 })
  } else if (save.data.stars >= k.price) {
    save.data.stars -= k.price
    save.data.owned.push(k.id)
    save.data.skin = k.id
    state.hangarMsg = { text: `${k.name.toUpperCase()} BOUGHT`, color: k.colors[0], t: 2 }
    ;[0, 0.1, 0.2, 0.3].forEach((d, i) => audio.tone({ freq: [523, 659, 784, 1047][i], dur: 0.18, type: 'triangle', gain: 0.16, delay: d }))
    const r = hangarMenu.rect(SKINS.indexOf(k))
    for (let i = 0; i < 30; i++) spark(r.x + 70, r.y + r.h / 2, rnd(-300, 300), rnd(-300, 300), k.colors[i % 2], 0.6)
  } else {
    state.hangarMsg = { text: `★ ${fmt(k.price - save.data.stars)} MORE NEEDED`, color: PALETTE.rock, t: 1.6 }
    audio.tone({ freq: 160, dur: 0.18, type: 'sawtooth', gain: 0.1 })
  }
  save.save()
}

function drawHangar() {
  const w = fit.w
  const safe = fit.safe
  const c = colors()
  neonText('HANGAR', w / 2, safe.top + 120, 72, c[0])
  ctx.font = font(700, 36)
  ctx.fillStyle = '#FFD23C'
  track(3)
  ctx.fillText(`★ ${fmt(save.data.stars)}`, w / 2, safe.top + 190)
  track(0)
  hangarMenu.items.forEach((it, i) => {
    const r = hangarMenu.rect(i)
    const on = hangarMenu.selected === it
    panel(r.x, r.y, r.w, r.h, on)
    const cy = r.y + r.h / 2 + 2
    ctx.textBaseline = 'middle'
    if (it.id === 'back') {
      ctx.font = font(700, on ? 40 : 36)
      track(4)
      ctx.fillStyle = on ? '#FFFFFF' : PALETTE.text
      ctx.textAlign = 'center'
      ctx.fillText('BACK', r.x + r.w / 2, cy)
      track(0)
    } else {
      const k = SKINS.find((q) => q.id === it.id)
      const owned = owns(k.id)
      drawShip(ctx, r.x + 62, cy, { colors: k.colors, which: on ? Math.floor(Math.max(0, state.clock) * 1.2) & 1 : 0, scale: 0.55, t: state.clock })
      ctx.globalAlpha = owned || save.data.stars >= k.price ? 1 : 0.55
      ctx.textAlign = 'left'
      // Name on the left (tight spacing so the longest fits beside its price).
      track(1)
      ctx.font = font(700, 32)
      ctx.fillStyle = on ? '#FFFFFF' : PALETTE.text
      ctx.fillText(k.name.toUpperCase(), r.x + 120, cy)
      track(0)
      ctx.textAlign = 'right'
      ctx.font = font(700, 32)
      if (save.data.skin === k.id) {
        ctx.fillStyle = c[0]
        ctx.fillText('FLYING', r.x + r.w - 30, cy)
      } else if (owned) {
        ctx.fillStyle = PALETTE.dim
        ctx.fillText('OWNED', r.x + r.w - 30, cy)
      } else {
        ctx.fillStyle = save.data.stars >= k.price ? '#FFD23C' : PALETTE.dim
        ctx.fillText(`★ ${fmt(k.price)}`, r.x + r.w - 30, cy)
      }
      ctx.globalAlpha = 1
    }
    if (on) {
      ctx.save()
      ctx.translate(r.x - 40 + Math.sin(state.clock * 5) * 4, r.y + r.h / 2)
      ctx.rotate(Math.PI / 2)
      drawShip(ctx, 0, 0, { colors: c, which: 0, scale: 0.42, t: state.clock, thrust: 0.6 })
      ctx.restore()
    }
  })
  ctx.textAlign = 'center'
  const last = hangarMenu.rect(hangarMenu.items.length - 1)
  const my = last.y + last.h + 60
  if (state.hangarMsg) {
    ctx.globalAlpha = Math.min(1, state.hangarMsg.t * 3)
    ctx.font = font(700, 34)
    ctx.fillStyle = state.hangarMsg.color
    ctx.fillText(state.hangarMsg.text, w / 2, my)
    ctx.globalAlpha = 1
  } else {
    ctx.font = font(600, 32)
    ctx.fillStyle = PALETTE.dim
    ctx.fillText('STARS FROM EVERY RUN ARE BANKED', w / 2, my)
  }
}

// ---------- Results tally: each line counts in, then the score

const TALLY_STEP = 0.35
const TALLY_LINES = 3
const tallyEnd = () => 0.3 + TALLY_LINES * TALLY_STEP + 0.7
function updateTally(dt) {
  const end = tallyEnd()
  if (state.tallyT < end && (input.pressed('a') || input.pointer.pressed)) state.tallyT = end
  state.tallyT = Math.min(end, state.tallyT + dt)
  const shown = Math.min(TALLY_LINES + 1, Math.floor((state.tallyT - 0.3) / TALLY_STEP) + 1)
  while (state.tallyTicks < shown) {
    state.tallyTicks++
    audio.tone({ freq: 600 + state.tallyTicks * 120, dur: 0.06, type: 'square', gain: 0.08 })
  }
}

// ---------- Drawing

function draw() {
  const safe = fit.safe
  const w = fit.w
  const h = fit.h
  ctx.save()
  if (state.shake > 0 && !settings.data.reducedShake) ctx.translate((Math.random() - 0.5) * 22 * state.shake, (Math.random() - 0.5) * 22 * state.shake)
  const moving = state.screen === 'playing' && state.dying <= 0
  drawBackdrop(ctx, w, h, { stars, scroll: state.bgScroll, speed: state.screen === 'title' ? 500 : moving ? state.speed : 0, t: state.clock, tint: colors()[state.ship.which] })
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'

  if (state.screen === 'title') state.panel === 'hangar' ? drawHangar() : drawTitle()
  else if (state.screen === 'settings') {
    ctx.fillStyle = 'rgba(4,6,15,0.55)'
    ctx.fillRect(0, 0, w, h)
    neonText('SETTINGS', w / 2, safe.top + 130, 64, colors()[0])
    drawMenu(settingsScreen.menu, 32)
    if (input.mode !== 'touch') drawPrompts(ctx, input, [['left', 'Change'], ['b', 'Back']], { x: w / 2, y: h - safe.bottom - 48, size: 34 * textScale() })
  } else {
    drawPlay()
    if (state.screen === 'paused') {
      ctx.fillStyle = 'rgba(4,6,15,0.72)'
      ctx.fillRect(0, 0, w, h)
      neonText('PAUSED', w / 2, pauseMenu.rect(0).y - 130, 96, colors()[0])
      drawMenu(pauseMenu)
    } else if (state.screen === 'gameover') drawGameOver()
  }
  drawParticles()
  if (state.flash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${state.flash * 0.25})`
    ctx.fillRect(-30, -30, w + 60, h + 60)
  }
  ctx.restore()
  canvas.style.cursor = state.screen === 'playing' && state.dying <= 0 && input.mode === 'mouse' ? 'none' : 'default'
  if (debug) drawDebug()
}

function neonText(text, x, y, px, color, align = 'center') {
  ctx.save()
  ctx.font = fontPx(700, px)
  ctx.textAlign = align
  ctx.textBaseline = 'middle'
  ctx.lineJoin = 'round'
  ctx.globalCompositeOperation = 'lighter'
  ctx.strokeStyle = color
  for (const [lw, a] of [[18, 0.08], [10, 0.14], [5, 0.3]]) {
    ctx.globalAlpha = a
    ctx.lineWidth = lw
    ctx.strokeText(text, x, y)
  }
  ctx.globalAlpha = 1
  ctx.globalCompositeOperation = 'source-over'
  ctx.fillStyle = '#FFFFFF'
  ctx.fillText(text, x, y)
  ctx.lineWidth = 3
  ctx.strokeText(text, x, y)
  ctx.restore()
}

/** An angled cockpit panel: two corners cut off. */
function chamfer(x, y, w, h, k) {
  const p = new Path2D()
  p.moveTo(x + k, y)
  p.lineTo(x + w, y)
  p.lineTo(x + w, y + h - k)
  p.lineTo(x + w - k, y + h)
  p.lineTo(x, y + h)
  p.lineTo(x, y + k)
  p.closePath()
  return p
}

/** A console panel: dark glass, or lit with a cyan-to-magenta wash when selected; corner brackets. */
function panel(x, y, w, h, on, k = Math.min(22, h / 4)) {
  const c = colors()
  const p = chamfer(x, y, w, h, k)
  if (on) {
    const g = ctx.createLinearGradient(x, 0, x + w, 0)
    g.addColorStop(0, withAlpha(c[0], 0.36))
    g.addColorStop(1, withAlpha(c[1], 0.26))
    ctx.fillStyle = g
    ctx.fill(p)
    glowStroke(ctx, p, c[0], 3)
  } else {
    ctx.fillStyle = 'rgba(14,20,46,0.88)'
    ctx.fill(p)
    ctx.strokeStyle = 'rgba(140,160,220,0.28)'
    ctx.lineWidth = 2
    ctx.stroke(p)
  }
  ctx.strokeStyle = on ? '#FFFFFF' : withAlpha(c[0], 0.5)
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(x + w - 20, y + 9)
  ctx.lineTo(x + w - 9, y + 9)
  ctx.lineTo(x + w - 9, y + 20)
  ctx.moveTo(x + 9, y + h - 20)
  ctx.lineTo(x + 9, y + h - 9)
  ctx.lineTo(x + 20, y + h - 9)
  ctx.stroke()
}

/** Console-panel buttons on top of menu.js (which still does all the input), with a mini ship cursor. */
function drawMenu(menu, size = 38) {
  const c = colors()
  ctx.save()
  ctx.textBaseline = 'middle'
  menu.items.forEach((it, i) => {
    const r = menu.rect(i)
    const on = menu.selected === it
    panel(r.x, r.y, r.w, r.h, on)
    const cy = r.y + r.h / 2 + 2
    ctx.fillStyle = on ? '#FFFFFF' : PALETTE.text
    ctx.font = font(700, on ? size * 1.1 : size)
    track(on ? 5 : 4)
    const label = it.label.toUpperCase()
    if (it.type) {
      // Value rows: label on the left, ‹ value › on the right.
      ctx.textAlign = 'left'
      ctx.fillText(label, r.x + 36, cy)
      track(0)
      ctx.font = font(700, size * 0.9)
      ctx.fillStyle = PALETTE.dim
      ctx.textAlign = 'center'
      const val = menu.display(it).toUpperCase()
      ctx.fillStyle = on ? '#FFFFFF' : PALETTE.text
      ctx.textAlign = 'right'
      ctx.fillText(val, r.x + r.w - 66, cy)
      ctx.fillStyle = PALETTE.dim
      ctx.textAlign = 'center'
      ctx.fillText('›', r.x + r.w - 40, cy)
      ctx.fillText('‹', r.x + r.w - 92 - ctx.measureText(val).width, cy)
    } else if (it.id === 'hangar') {
      ctx.textAlign = 'left'
      ctx.fillText(label, r.x + 36, cy)
      track(0)
      ctx.textAlign = 'right'
      ctx.font = font(700, size * 0.9)
      ctx.fillStyle = '#FFD23C'
      ctx.fillText(`★ ${fmt(save.data.stars)}`, r.x + r.w - 36, cy)
    } else {
      ctx.textAlign = 'center'
      ctx.fillText(label, r.x + r.w / 2, cy)
    }
    track(0)
    if (on) {
      // The cursor: a tiny ship pointing at the selected panel.
      ctx.save()
      ctx.translate(r.x - 40 + Math.sin(state.clock * 5) * 4, r.y + r.h / 2)
      ctx.rotate(Math.PI / 2)
      drawShip(ctx, 0, 0, { colors: c, which: 0, scale: 0.42, t: state.clock, thrust: 0.6 })
      ctx.restore()
    }
  })
  ctx.restore()
}

/** How to play, in the current input's words: [steer, flip]. */
function controlsHint() {
  if (input.mode === 'touch') return ['Slide to steer', `${input.label('a')} to flip`]
  if (input.mode === 'mouse') return ['Drag to steer', `${input.label('a')} to flip`]
  return [`${input.stickLabel()} to steer`, `${input.label('a')} to flip`]
}

/** A HUD tag: an icon and a word in a small angled panel. Returns its width. */
function hudTag(x, y, icon, text, color, measureOnly = false) {
  ctx.font = font(700, 32)
  track(2)
  const w = ctx.measureText(text).width + 88
  if (!measureOnly) {
    const p = chamfer(x, y - 30, w, 60, 14)
    ctx.fillStyle = 'rgba(7,11,26,0.82)'
    ctx.fill(p)
    glowStroke(ctx, p, color, 2, 0.5)
    ctx.textAlign = 'center'
    ctx.fillStyle = color
    ctx.fillText(icon, x + 36, y + 1)
    ctx.textAlign = 'left'
    ctx.fillStyle = PALETTE.text
    ctx.fillText(text, x + 64, y + 2)
    ctx.textAlign = 'center'
  }
  track(0)
  return w
}

/** How to play, as HUD tags in the scene, in the current input's words. */
function drawControlTags(y) {
  const c = colors()
  const steer = input.mode === 'touch' ? 'SLIDE' : input.mode === 'mouse' ? 'DRAG' : input.stickLabel().toUpperCase()
  const tags = [['⇆', steer, c[0]], ['◉', `${input.label('a')} · FLIP`.toUpperCase(), c[1]]]
  if (input.mode !== 'touch' && input.mode !== 'mouse') tags.push(['Ⅱ', `${input.label('menu')} · PAUSE`.toUpperCase(), PALETTE.dim])
  const gap = 20
  const widths = tags.map(([i, t, col]) => hudTag(0, 0, i, t, col, true))
  // One row if it fits the column, otherwise the first two on top and the rest below.
  const fits = (idx) => idx.reduce((a, i) => a + widths[i], 0) + gap * (idx.length - 1) <= Math.min(fit.w, TUNING.column) - 40
  const all = tags.map((_, i) => i)
  const rows = fits(all) ? [all] : fits([0, 1]) ? [[0, 1], [2]] : fits([1, 2]) ? [[0], [1, 2]] : [[0], [1], [2]]
  rows.forEach((row, ri) => {
    if (!row.some((i) => tags[i])) return
    row = row.filter((i) => tags[i])
    const total = row.reduce((a, i) => a + widths[i], 0) + gap * (row.length - 1)
    let x = fit.w / 2 - total / 2
    for (const i of row.filter((i) => tags[i])) {
      hudTag(x, y + ri * 72, ...tags[i])
      x += widths[i] + gap
    }
  })
}

function drawTitle() {
  const w = fit.w
  const safe = fit.safe
  const c = colors()
  const sy = titleShipY()
  const cx = w / 2
  const top = sceneTop()
  const bottom = sceneBottom()
  const tagsY = Math.min(bottom - 110, sy + 230)
  // Rocks drift at the sides of the scene, never over the logo or the menu.
  const rocksAt = [[-262, 0.05, 46, 3], [260, 0.3, 34, 9], [-250, 0.55, 26, 4]]
  for (const [dx, fy, r, seed] of rocksAt) {
    const y = top + (bottom - top) * fy + Math.sin(state.clock * 0.8 + seed) * 10
    drawRock(ctx, cx + dx, Math.max(top + r, Math.min(tagsY - r - 50, y)), r, (title[`r${seed}`] ??= rockShape(r, seed)), state.clock * 0.3 + seed)
  }
  // Trail and gate, faded in and out at the edges of the scene.
  const gy = title.gateY
  const tg = ctx.createLinearGradient(0, sy + 40, 0, sy + 300)
  tg.addColorStop(0, withAlpha(c[title.which], 0.5))
  tg.addColorStop(1, withAlpha(c[title.which], 0))
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.fillStyle = tg
  ctx.beginPath()
  ctx.moveTo(cx - 22, sy + 40)
  ctx.lineTo(cx + 22, sy + 40)
  ctx.lineTo(cx + 4, sy + 300)
  ctx.lineTo(cx - 4, sy + 300)
  ctx.fill()
  ctx.restore()
  const next = gy < sy ? 1 - title.which : title.which
  const mid = 220
  const fade = Math.max(0, Math.min(1, (gy - top + 160) / 160, (bottom + 160 - gy) / 160))
  drawGate(ctx, gy, [{ x0: 0, x1: cx - mid / 2, which: 1 - next }, { x0: cx - mid / 2, x1: cx + mid / 2, which: next }, { x0: cx + mid / 2, x1: w, which: 1 - next }], { colors: c, t: state.clock, thick: 24, alpha: fade })
  drawShip(ctx, cx, sy + Math.sin(state.clock * 2) * 8, { colors: c, which: title.which, flip: title.flipT, scale: 1.8, t: state.clock, thrust: 1.5 })
  drawControlTags(tagsY)

  // Two-tone logo, centred as a whole.
  const ty = safe.top + 170
  const px = Math.min(112, (Math.min(w, 760) - 170) / 4.9)
  ctx.font = fontPx(700, px)
  const fw = ctx.measureText('FLIP').width
  const ww = ctx.measureText('WING').width
  const left = cx - (fw + ww + 10) / 2
  neonText('FLIP', left, ty, px, c[0], 'left')
  neonText('WING', left + fw + 10, ty, px, c[1], 'left')
  if (save.data.best > 0 || save.data.bestDist > 0) {
    ctx.font = font(600, 32)
    ctx.fillStyle = PALETTE.dim
    track(6)
    ctx.fillText(`BEST ${fmt(save.data.best)}  ·  FARTHEST ${fmt(save.data.bestDist)} M`, cx, ty + 92)
    track(0)
  }
  drawMenu(titleMenu)
}

const fmt = (n) => Math.floor(n).toLocaleString('en-US').replace(/,/g, ' ')

function drawPlay() {
  const o = ox()
  const sy = shipY()
  const c = colors()
  const s = state.ship
  const w = fit.w
  // Column edges, faint, so the play area reads on wide screens.
  if (o > 0) {
    ctx.fillStyle = 'rgba(0,0,0,0.25)'
    ctx.fillRect(0, 0, o, fit.h)
    ctx.fillRect(o + TUNING.column, 0, w - o - TUNING.column, fit.h)
  }
  for (const th of state.things) {
    if (th.y < -200 || th.y > fit.h + 120) continue
    if (th.kind === 'rock') drawRock(ctx, o + th.x, th.y, th.r, th.shape, th.angle)
    else if (th.kind === 'dust') {
      if (!th.taken) drawDust(ctx, o + th.x, th.y, state.clock)
    } else if (th.kind === 'gate') {
      const segs = th.segs.map((g, i) => ({ x0: o + g.x0 - (i === 0 ? o : 0), x1: o + g.x1 + (i === th.segs.length - 1 ? w - o - TUNING.column : 0), which: g.which, gone: g === th.shattered }))
      const visible = segs.filter((g) => !g.gone)
      drawGate(ctx, th.y, visible, { colors: c, t: state.clock })
    }
  }
  // Trail.
  ctx.save()
  ctx.globalCompositeOperation = 'lighter'
  ctx.lineCap = 'round'
  for (let i = 1; i < trail.length; i++) {
    const a = trail[i - 1]
    const b = trail[i]
    ctx.strokeStyle = withAlpha(b.c, 0.5 * (1 - i / trail.length))
    ctx.lineWidth = 16 * (1 - i / trail.length) + 2
    ctx.beginPath()
    ctx.moveTo(o + a.x, a.y)
    ctx.lineTo(o + b.x, b.y)
    ctx.stroke()
  }
  ctx.restore()
  if (state.dying <= 0 && state.shield) {
    // The shield: a hexagon bubble around the ship.
    const hex = new Path2D()
    const R = 64 + Math.sin(state.clock * 6) * 3
    for (let i = 0; i < 6; i++) {
      const a = state.clock * 0.8 + (i * Math.PI) / 3
      i ? hex.lineTo(o + s.x + Math.cos(a) * R, sy + Math.sin(a) * R) : hex.moveTo(o + s.x + Math.cos(a) * R, sy + Math.sin(a) * R)
    }
    hex.closePath()
    ctx.fillStyle = 'rgba(255,255,255,0.06)'
    ctx.fill(hex)
    glowStroke(ctx, hex, '#FFFFFF', 3, 0.7)
  }
  if (state.dying <= 0 && !(state.invuln > 0 && Math.floor(state.clock * 16) % 2)) drawShip(ctx, o + s.x, sy, { colors: c, which: s.which, flip: s.flipT, bank: s.bank, t: state.clock, thrust: 1 + (state.speed - TUNING.startSpeed) / 700 })

  for (const pp of state.popups) {
    ctx.globalAlpha = Math.min(1, pp.t * 2)
    ctx.font = font(900, pp.size)
    ctx.fillStyle = pp.color
    ctx.fillText(pp.text, o + pp.x, pp.y)
    ctx.globalAlpha = 1
  }
  if (state.screen === 'playing' && state.dying <= 0) drawHints(o, sy)
  drawHud()
}

/** Teaching by doing: say how to flip while a wrong-coloured gate is coming in the first runs. */
function drawHints(o, sy) {
  const s = state.ship
  const c = colors()
  if (state.t < 3) {
    ctx.font = font(700, 40)
    ctx.fillStyle = withAlpha(PALETTE.text, Math.min(1, (3 - state.t) * 1.5))
    ctx.fillText(controlsHint()[0], fit.w / 2, sy - 200)
  }
  const teaching = state.gates < 3 && save.data.runs < 4
  if (!teaching) {
    if (state.banner) {
      const a = Math.min(1, state.banner.t * 2, (2.8 - state.banner.t) * 4)
      ctx.globalAlpha = a
      ctx.font = font(800, 34)
      ctx.fillStyle = c[1]
      ctx.fillText('NEW', fit.w / 2, fit.h * 0.3 - 56)
      neonText(state.banner.text, fit.w / 2, fit.h * 0.3, 54 * textScale(), c[0])
      ctx.font = font(600, 34)
      ctx.fillStyle = PALETTE.text
      ctx.fillText(state.banner.tip, fit.w / 2, fit.h * 0.3 + 60)
      ctx.globalAlpha = 1
    }
    return
  }
  const g = state.things.find((th) => th.kind === 'gate' && !th.passed && th.y < sy && th.y > -60)
  if (!g) return
  const seg = g.segs.find((q) => s.x >= q.x0 && s.x < q.x1)
  if (!seg || seg.which === s.which || seg.which === WALL) return
  const y = Math.min(sy - 150, g.y + 140)
  ctx.font = font(800, 44)
  ctx.fillStyle = PALETTE.text
  ctx.fillText(`${input.label('a')} to flip`, fit.w / 2, y)
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText('only your colour gets through', fit.w / 2, y + 48)
}

function drawHud() {
  const safe = fit.safe
  const c = colors()
  const x0 = safe.left + 32
  ctx.save()
  ctx.textAlign = 'left'
  ctx.fillStyle = PALETTE.text
  ctx.font = font(700, 58)
  ctx.fillText(fmt(state.score), x0, safe.top + 64)
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText(`${fmt(state.dist)} M`, x0 + 2, safe.top + 116)
  // Stars: the shield charge, or the shield itself.
  const sy = safe.top + 166
  if (state.shield) {
    ctx.fillStyle = '#FFFFFF'
    ctx.font = font(700, 32)
    track(3)
    ctx.fillText('⬡ SHIELD', x0, sy)
    track(0)
  } else {
    ctx.fillStyle = '#FFD23C'
    ctx.font = font(700, 32)
    ctx.fillText(`★ ${state.shieldCharge}/${TUNING.shieldStars}`, x0, sy)
    const bw = 170
    const bx = x0
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.fillRect(bx, sy + 26, bw, 6)
    ctx.fillStyle = '#FFD23C'
    ctx.fillRect(bx, sy + 26, (bw * state.shieldCharge) / TUNING.shieldStars, 6)
  }
  // The multiplier and the streak toward the next level.
  const mx = fit.w / 2
  const my = safe.top + 64
  const lv = TUNING.streakLevels
  const nextAt = lv[state.mult] // undefined at ×5
  const prevAt = lv[state.mult - 1]
  state.multPop = Math.max(0, (state.multPop || 0) - 1 / 30)
  ctx.textAlign = 'center'
  ctx.font = font(700, 52 * (1 + state.multPop * 0.5))
  ctx.fillStyle = state.mult > 1 ? c[1] : PALETTE.dim
  ctx.fillText(`×${state.mult}`, mx, my)
  const bw = 150
  ctx.fillStyle = 'rgba(255,255,255,0.12)'
  ctx.fillRect(mx - bw / 2, my + 38, bw, 8)
  const frac = nextAt === undefined ? 1 : (state.streak - prevAt) / (nextAt - prevAt)
  ctx.fillStyle = state.mult > 1 ? c[1] : c[0]
  ctx.fillRect(mx - bw / 2, my + 38, bw * frac, 8)
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  ctx.fillText(nextAt === undefined ? 'MAX' : `STREAK ${state.streak}`, mx, my + 80)
  ctx.restore()
  if (state.screen === 'playing') {
    const b = pauseButton()
    ctx.fillStyle = 'rgba(255,255,255,0.12)'
    ctx.beginPath()
    ctx.roundRect(b.x, b.y, b.w, b.h, 16)
    ctx.fill()
    ctx.fillStyle = PALETTE.text
    ctx.fillRect(b.x + 21, b.y + 18, 8, 28)
    ctx.fillRect(b.x + 35, b.y + 18, 8, 28)
    if (input.mode !== 'touch' && state.t < 6) drawPrompts(ctx, input, [['a', 'Flip'], ['menu', 'Pause']], { x: fit.w / 2, y: fit.h - safe.bottom - 48, size: 34 * textScale() })
  }
}

function drawGameOver() {
  const w = fit.w
  const cx = w / 2
  const safe = fit.safe
  const c = colors()
  ctx.fillStyle = 'rgba(4,6,15,0.82)'
  ctx.fillRect(0, 0, w, fit.h)
  const top = Math.max(safe.top + 70, overMenu.rect(0).y - 640)
  const t = state.tallyT
  const ease = (x) => 1 - Math.pow(1 - Math.max(0, Math.min(1, x)), 3)
  // The tally: what the score was made of, one line at a time.
  const lines = [
    ['GATES', state.gates, state.pts.gates, c[0]],
    ['LATE FLIPS', state.lateFlips, state.pts.late, c[1]],
    ['STARS', state.starsRun, state.pts.stars, '#FFD23C']
  ]
  const px = cx - 270
  panel(px, top, 540, 196, false)
  lines.forEach(([label, n, pts, col], i) => {
    const k = ease((t - 0.3 - i * TALLY_STEP) / 0.25)
    if (k <= 0) return
    const y = top + 42 + i * 56
    ctx.globalAlpha = k
    ctx.font = font(700, 32)
    track(2)
    ctx.textAlign = 'left'
    ctx.fillStyle = col
    ctx.fillText(label, px + 30, y)
    track(0)
    ctx.fillStyle = PALETTE.text
    ctx.textAlign = 'center'
    ctx.fillText(`${n}`, px + 320, y)
    ctx.textAlign = 'right'
    ctx.fillText(`+${fmt(pts * k)}`, px + 510, y)
    ctx.globalAlpha = 1
  })
  // The score counts up after the lines.
  const k = ease((t - 0.3 - TALLY_LINES * TALLY_STEP) / 0.6)
  ctx.textAlign = 'center'
  ctx.font = font(600, 34)
  ctx.fillStyle = PALETTE.dim
  track(10)
  ctx.fillText('SCORE', cx, top + 250)
  track(0)
  neonText(fmt(state.score * k), cx, top + 330, 112 * textScale(), state.newBest ? c[0] : c[1])
  ctx.font = font(700, 36)
  if (k >= 1 && state.newBest) {
    ctx.fillStyle = c[0]
    ctx.fillText('NEW BEST!', cx, top + 408)
  } else {
    ctx.fillStyle = PALETTE.dim
    ctx.fillText(`BEST ${fmt(save.data.best)}`, cx, top + 408)
  }
  ctx.font = font(600, 32)
  ctx.fillStyle = PALETTE.dim
  track(2)
  ctx.fillText(`${fmt(state.dist)} M · TOP MULTIPLIER ×${state.bestMult}`, cx, top + 458)
  track(0)
  // Stars go to the bank.
  ctx.font = font(700, 34)
  ctx.fillStyle = '#FFD23C'
  ctx.fillText(`★ +${state.starsRun} BANKED · ${fmt(save.data.stars)} TOTAL`, cx, top + 512)
  if (state.affordable && k >= 1) {
    const k2 = state.affordable
    const y = top + 548
    panel(cx - 270, y, 540, 76, true)
    drawShip(ctx, cx - 210, y + 38, { colors: k2.colors, which: Math.floor(Math.max(0, state.clock) * 1.5) & 1, scale: 0.5, t: state.clock })
    ctx.textAlign = 'left'
    ctx.font = font(700, 32)
    ctx.fillStyle = '#FFFFFF'
    ctx.fillText(`${k2.name.toUpperCase()} IN THE HANGAR`, cx - 160, y + 40)
    ctx.textAlign = 'center'
  }
  ctx.globalAlpha = state.overLock > 0 ? 0.4 : 1
  drawMenu(overMenu)
  ctx.globalAlpha = 1
}

/** ?debug: live state in the corner. */
function drawDebug() {
  ctx.save()
  ctx.font = '500 18px monospace'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'top'
  ctx.fillStyle = 'rgba(0,0,0,0.65)'
  ctx.fillRect(8, fit.h - 140, 520, 130)
  ctx.fillStyle = '#9fe'
  const lines = [
    `screen ${state.screen}  mode ${input.mode}  fps ${fps.toFixed(0)}`,
    `space ${fit.w}x${fit.h}  dpr ${fit.dpr}  safe ${fit.safe.top.toFixed(0)}/${fit.safe.bottom.toFixed(0)}`,
    `t ${state.t.toFixed(1)}  speed ${state.speed.toFixed(0)}  stage ${state.stage}`,
    `things ${state.things.length}  particles ${particles.length}  ×${state.mult} streak ${state.streak}  ★${state.shieldCharge}${state.shield ? ' shield' : ''}`,
    `god ${god}  gates ${state.gates}  late ${state.lateFlips}`
  ]
  lines.forEach((l, i) => ctx.fillText(l, 16, fit.h - 132 + i * 24))
  ctx.restore()
}

let last = performance.now()
let fps = 60
function frame(now) {
  const dt = Math.max(0, Math.min(1 / 20, (now - last) / 1000))
  last = now
  fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05
  input.update(dt)
  update(dt)
  draw()
  requestAnimationFrame(frame)
}
requestAnimationFrame(frame)
