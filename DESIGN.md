# Flipwing: design brief

> Slide your thumb to weave a tiny starship through an asteroid stream, and tap to flip its colour so it slips through matching energy gates. How far can you get?

*Status: shipped · Version: 1.4.0*

## Kickoff
Answers from the kickoff interview ([kickoff.md](../../docs/game-design/kickoff.md)). Mark anything you decided yourself as *(assumed)*.

| Topic | Answer |
|---|---|
| Concept / genre | Endless vertical dodger (replaces Pulse Rocket). Steer left/right to avoid rocks; second mechanic: **colour switch gates**. Tap flips the ship cyan ⇄ magenta, gates only let the matching colour through |
| 2D or 3D | 2D canvas |
| Art style | Neon vector: glowing outlines on deep space, cyan/magenta ship and gates, orange rocks |
| Players | Solo |
| Devices | Phone portrait 720×1280 (`fill: true`), one hand. Earns Phone, Handheld & controller, Desktop (keyboard + mouse) |
| Feel | Tense, one-more-try |
| Camera / view | Fixed top-down, world scrolls down past the ship *(assumed)* |
| Session and structure | Endless runs of 1–4 minutes, score from distance, gates and stardust |
| Like which game? | *(assumed)* Color Switch, Race the Sun / endless dodgers, Pulse Rocket (what it replaces) |
| Audience and difficulty | Anyone can pick it up; the speed ramp makes it a challenge *(assumed)* |
| Assets | None, everything drawn in code *(assumed)* |
| Sound and music | Synthwave loop whose tempo follows the run's speed; zappy flip and gate sounds |
| Progression | Best score and farthest distance; stars from every run are banked and spent on ship colours in the Hangar |

## Fun targets
- **Primary:** Challenge. Speed climbs, gates arrive faster and mix with rocks; each death is your own mistake, and a better run is one tap away.
- **Secondary:** Sensation. Neon trails, a speed-streak starfield, a pop and flash on each gate, a chunky explosion on death, music that speeds up with you.

## Core loop
- **Moment-to-moment (seconds):** slide to dodge a rock → read the next gate's colour → flip (or steer into the matching half) → gate bursts, points (+50 × multiplier), the streak grows; grab stars for the shield
- **Round (minutes):** survive as the speed rises and something new appears every ~25 s; build a streak (gates, late flips count double) for ×2…×5; 120 stars in one run charge a one-hit shield; die → a tally of what the score was made of, retry in one press
- **Meta (across sessions):** beat your best score and farthest distance; bank stars and buy ship colours in the Hangar (★ 300 / 750 / 1 500 / 3 000)

## The 8 formal elements
| Element | This game |
|---|---|
| Players | One |
| Objectives | Score as high as possible (score only comes from gates, late flips and stars); distance is a separate record |
| Procedures | Slide (or stick / arrows) to move sideways; tap (or A / Space) to flip colour |
| Rules | Touching a rock ends the run. Crossing a gate segment of the other colour ends the run. A gate gives 50 × multiplier; a flip in the last 0.25 s before it (plus a 0.07 s grace after reaching it) is a **Late flip**: +50 × multiplier more. The **streak** grows by 1 per gate, 2 per late-flip gate; streaks of 5 / 10 / 20 / 35 give ×2 / ×3 / ×4 / ×5. A flip with no gate coming (a **wasted flip**, from the 4th gate on) or a broken shield resets the streak. A star gives 10 × multiplier. **120 stars in one run** charge a **shield** that takes one hit (rock, wrong colour or wall), then 1.2 s of grace and the charge starts again |
| Resources | The ship's colour (two states), the streak, the shield charge, position; banked stars between runs |
| Conflict | Rocks and gates, speeding up; gates and rocks combine so the safe lane and the right colour must both be chosen. Narrow gaps are walls (orange, hazard stripes) with one or two small openings: no colour passes the wall, so you thread the opening and match its colour |
| Boundaries | A 720-wide column; the ship can't leave it |
| Outcome | Score (with a tally: gates, late flips, stars) and distance; best and farthest kept; stars banked |

## Controls
| Input | Action |
|---|---|
| Left stick / d-pad (`x`) | Move left / right |
| `a` | Flip colour |
| `b` / `x` / `y` | Flip colour too (any face button works) |
| `menu` (Start / Esc / on-screen button) | Pause |

- **Inputs:** gamepad, keyboard, mouse, touch, all playable.
- **Touch scheme:** one thumb anywhere on the screen. The ship moves by how far the thumb slides (relative, 1.3× gain), so the thumb never covers it; a short touch (< 0.22 s, < 14 px of movement) is a flip. Mouse works the same: drag to steer, click to flip. No on-screen stick.
- **Players:** 1

## Inspirations
| Game | Borrow | Change / avoid |
|---|---|---|
| Color Switch | Match-your-colour gates as the core test | Avoid its tap-to-jump physics; ours is free steering, and colour is one of two choices per gate |
| Endless dodgers (Race the Sun, Pulse Rocket) | Speed ramp, distance score, instant retry | Not flappy movement; steering is direct and precise |
| Twist | Gates split into colour lanes, so every gate can be solved by steering *or* flipping, and rocks make you pick which | |

## Art direction
- **Style:** Neon vector
- **Palette:** `#070B1A` background, `#3CF2FF` cyan, `#FF4FD8` magenta, `#FFB13C` danger (rocks), `#EEF4FF` text
- **Shape coding:** colour A is also marked by circles (ship core, gate dots), colour B by triangles, so colour isn't the only cue
- **Font:** Chakra Petch 600/700 (bundled in `assets/fonts/`, OFL) for all in-game text and the cover
- **Menus (flight console):** angled cockpit panels with corner brackets; the selected one lit with a cyan-to-magenta wash and pointed at by a mini ship cursor; uppercase, letter-spaced labels. The title is three bands: logo and best, a scene (ship, gate, asteroids, controls as HUD tags) and the menu; asteroids stay inside the scene band, never over the menu
- **Rendering:** 2D canvas, additive glow drawn with layered strokes (no `shadowBlur`)
- **Assets:** procedural
- **Cover idea:** the ship mid-flip, half cyan half magenta, bursting through a split gate, title big at the top
- **Hero idea:** ship streaking up-right through gates and rocks on the right half; calm starfield bottom-left

## Audio
- **SFX:** flip (rising/falling zap by colour), gate pass (bright chord, higher with multiplier), late flip (sparkle), stardust (tick), death (noise + falling tone)
- **Music:** synthwave bass + arpeggio sequenced with `audio.tone` on the music bus, tempo 110 → 150 BPM with speed

## Scope
**v1 must-haves**
- Steering + flipping on every input; rocks, full gates, split gates (2 and 3 lanes), narrow gaps, drifting rocks, sliding gates, ramp
- Score from actions only, streak multiplier, star-charged shield, distance record; best saved; stars banked
- Title with the Hangar (buy and pick colours with banked stars), pause, settings (+ vibration toggle), game over with a counting tally and one-press retry
- Music + SFX, juice, reduced shake

**Stretch**
- Daily seeded run, achievements, shield power-up

## Definition of done
**Play**
- [ ] First gate teaches the flip by doing (`${input.label('a')} to flip` hint while the wrong colour approaches)
- [ ] Something new every ~25 s: split gates (30 s), narrow gaps (55 s, the opening shrinks from 190 to 130 px as the run goes on), sliding gates (80 s), drifting rocks (105 s), 3-lane gates (130 s). No double gates (cut in 1.1.0)
- [ ] Sliding gates read by motion alone, with nothing extra drawn: a two-lane split whose divider glides 120–200 px either side of the middle, or a narrow gap whose opening glides 90–150 px, one full swing every 2.6–3.4 s. Colours never change, so what you see is what you cross; every lane stays at least 160 px wide, and the gate stops moving once crossed
- [ ] Fair: spacing between threats never under the reaction time at the current speed; nothing spawns inside the thumb area unseen
- [ ] Retry in one press; best score and farthest distance; stars banked and spent in the Hangar; the results tally shows what the score was made of

**Feel**
- [ ] Ship banks with movement, trail in its colour, flip burst, gate shatter particles, death explosion with brief slow-mo, shake skipped with reduced shake; vibration on death (toggle)

**Audio**
- [x] SFX and music through `audio.js`, following the Settings sliders; unlocks on first input

**Screens and flow**
- [x] Title, pause (Resume / Restart / Settings / Quit to title), game over with one-press retry
- [x] Auto-pause via `input.onPause`; no forbidden bindings
- [x] Every menu on `menu.js`; Settings from title and pause
- [x] Saves via `save.js` under `flipwing-save-v2` (v1 saves migrate), saved on pause and `onPause`
- [x] Cursor hidden only during gameplay; `state.screen` + `window.__game` exposed

**Accessibility**
- [ ] Colour + shape coding, no mashing, reduced shake honoured, text ≥ 32 px scaled by `textScale`, prompts from `input.label`

**Scaling and inputs**
- [x] `fitCanvas` with `fill`, difficulty inside 720 wide; manifest `tags`, `inputs`, `phone.orientation`; phone pass green

**Under the hood**
- [x] `TUNING`, clamped `dt`, `?debug` overlay, runtime files unedited, `npm run check` green (2026-11-11, every pass including the phone pass)
- [ ] 60 fps measured on a Deck and a mid-range phone

## Open questions / assumptions
- Reference games, audience, assets and camera were chosen by me (marked *assumed*).
- The check warns that a phone game usually imports `touch.js`; Flipwing doesn't on purpose: one thumb slides anywhere (relative steering) and taps to flip, so an on-screen stick would only get in the way.
- Home screen picked from mockups: variant A, "Gate burst" (the ship flips colour as it bursts through a split gate, two-tone title).
- Balance from a headless bot (3 × 3 min): it survived 80–180 s and died only to rocks, never to an unfair gate. Its scores (13–29k by 80–145 s) led to the 0.25 s late window and the old unlock thresholds (replaced by Hangar prices in 1.3.0).
- Stars on offer (god-mode run): ~100 by 30 s, ~154 by 60 s, ~187 by 90 s. So the shield costs 120 (a strong run past about 90 s), and Hangar prices assume 60–100 banked per run (about 3 / 8 / 17 / 33 runs).

## Changelog
- 1.0.0: First version.
- 1.4.0: Swapping gates removed (the ghost gate, dashed swap line and flicker were confusing and disorienting). In their place from 80 s: **sliding gates**, where a split gate's colour divider or a narrow gap's opening glides side to side, so you track your lane or flip instead of guessing when it changes.
- 1.3.0: New scoring. Score comes only from gates (50), late flips (+50) and stars (10), all times the multiplier; distance is its own record. The multiplier is a streak (×2 at 5, ×3 at 10, ×4 at 20, ×5 at 35; late flips count double), shown with a bar in the HUD and reset by a wasted flip or a broken shield. 120 stars in one run charge a one-hit shield. Stars are banked and spend in the new Hangar on ship colours (★ 300 / 750 / 1 500 / 3 000). Game over counts up a tally (gates, late flips, stars) before the score. Saves move to v2: best score resets (old scores counted distance), farthest distance and colours already earned are kept.
- 1.2.1: Fixed a white haze left over the game over and menus after a crash.
- 1.2.0: New menu look (flight console panels, ship cursor, Chakra Petch), controls shown as HUD tags in the title scene instead of text at the bottom, asteroids kept clear of the menu.
- 1.1.0: Swapping gates warn clearly (⇄ chips in the colour they become with a countdown ring, a ghost of the next colours, a two-colour dashed swap line, a flicker before the swap) and swap closer to the ship. New narrow-gap gates: an orange wall with one or two small openings to thread. Double gates removed.
