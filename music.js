// Flipwing's synthwave loop, sequenced with audio.tone() on the music bus so it follows the
// Music slider. Tempo climbs with the run's speed; the title plays a calmer version.

const ROOTS = [110, 87.31, 130.81, 98] // A2, F2, C3, G2: Am – F – C – G
const CHORDS = [
  [0, 3, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 12],
  [0, 4, 7, 11]
]
const semis = (f, n) => f * Math.pow(2, n / 12)

export function createMusic(audio) {
  let mode = 'title'
  let next = 0
  let step = 0
  return {
    setMode(m) {
      mode = m
    },
    /** Call each frame. speed: the world's scroll speed; running: false while paused. */
    update(speed, running) {
      const ctx = audio.ctx
      if (!ctx || ctx.state !== 'running' || !running) {
        next = 0
        return
      }
      const now = ctx.currentTime
      if (next < now) next = now + 0.05
      const bpm = mode === 'run' ? Math.min(152, 112 + (speed - 520) * 0.055) : 96
      const sixteenth = 60 / bpm / 4
      while (next < now + 0.2) {
        const delay = next - now
        const bar = Math.floor(step / 16) % 4
        const s16 = step % 16
        const root = ROOTS[bar]
        const chord = CHORDS[bar]
        // Bass: driving eighths, octave bounce.
        if (s16 % 2 === 0) audio.tone({ freq: s16 % 4 === 2 ? root * 2 : root, dur: sixteenth * 1.6, type: 'sawtooth', bus: 'music', gain: mode === 'run' ? 0.07 : 0.045, delay })
        // Arpeggio up two octaves.
        const arpGain = mode === 'run' ? 0.03 : 0.026
        audio.tone({ freq: semis(root * 4, chord[s16 % 4] + (s16 >= 8 ? 12 : 0)), dur: sixteenth * 0.9, type: 'square', bus: 'music', gain: arpGain, delay })
        if (mode === 'run') {
          if (s16 % 4 === 0) audio.tone({ freq: 140, dur: 0.12, type: 'sine', bus: 'music', gain: 0.22, slide: -100, delay })
          if (s16 % 4 === 2) audio.noise({ dur: 0.03, bus: 'music', gain: 0.035, delay })
          if (s16 === 4 || s16 === 12) audio.noise({ dur: 0.12, bus: 'music', gain: 0.06, delay })
        }
        next += sixteenth
        step++
      }
    }
  }
}
