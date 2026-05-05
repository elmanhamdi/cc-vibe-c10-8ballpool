# Vertical 8-Ball — Build & Feature Notes

Portrait (9:16) browser **8-ball pool**: **Three.js** + **Vite 6** + **TypeScript**. **Career ladder**: each match is against a different **brainrot** character (eight steps total). HTML HUD with container-query layout over the canvas, custom **2D physics** (sub-stepped collisions, English/spin), and profile data in **localStorage**. Core logic lives in a platform-agnostic **`GameEngine`**; browser adapters drive Three, DOM, and audio.

We leaned into **brainrots** because exaggerated meme-style opponents are a familiar hook in current casual games; the roster here is **placeholder** and can be **swapped for new characters quickly** if the direction is not a fit.

---

## Core gameplay

- **Main menu → match → turns**: player and AI alternate; phases include rack, aim, ball simulation, turn resolution, and match end with rematch / next brainrot / shop.
- **Drag-to-aim** on the table (angle only). **Power**: right-edge HUD **slider** — drag **down** to pull the cue back, **release** to shoot (drag back to the top and release to cancel a weak shot). **Spin pad** on the HUD sets **English** on the cue ball.
- **Shot clocks**: player **16s**, AI **22s** “think” time; timeout is a foul. After a **scratch**, **ball-in-hand** in the kitchen — **drag** the cue ball to place it.
- **8-ball rules**: open table until groups are assigned from the first legal solid/stripe pot; standard fouls (scratch, wrong ball, no hit, no rail after contact, eight early, illegal break, timeout). Win by clearing your group then pocketing the 8 legally; several instant-loss cases on the 8. **No called pocket** on the 8.
- **Ball simulation**: rolling, cushions, pockets, ball–ball restitution and friction; optional **physics debug** via URL or dev toggles.

---

## Brainrots & AI

- **Eight brainrots** in a fixed ladder order; each has a **skill tier** (apprentice → master), **personality** (toxic / calm / funny / silent) for dialogue tone, a **signature cue**, and its own **reactions** to how you play (HUD beats, portraits, lines) plus **character-specific sounds** (taunts, VO, and other SFX where wired).
- **Difficulty** scales by tier: aim noise, power jitter, mistake rate, and how often the AI uses spin.
- **Weighted dialogue** during play (misses, fouls, good AI shots, pressure under five seconds on the clock, nice pots, silent beats). Some brainrots have a **stronger reaction pack** (e.g. mid-match portrait beat + extra voice lines).
- AI chooses a **best legal pot** or a small **random nudge** — no deep positional planning.

---

## Meta & economy

- **Coins** (persisted): starting balance, **+50 per win**, shop purchases. **Wins / losses / streaks** tracked.
- **Ranks** from total wins: **Bronze → Silver → Gold → Platinum → Diamond** (thresholds at 0 / 5 / 12 / 22 / 35 wins). Shown in HUD as “level” style progress.
- **Next match** flow previews the **next brainrot** on the ladder, with phone ring SFX; **stats / rank / shop** modals from HUD actions.

---

## Cue shop & cosmetics

- **Six cues** (Classic through Legend) with different **prices** and **power / aim / spin** multipliers; **buy** and **equip** persist on the profile.
- **3D cue stick** in-scene updates materials per equipped cue (shaft, tip, wrap, butt accents); **neon / carbon / legend** cues get emissive styling. The visible stick matches **who is shooting** (player cue vs brainrot cue).

---

## Audio

- **BGM**: rotating in-match tracks plus a between-games loop; playback tuned for mood; **first pointer-down** resumes audio for autoplay policy.
- **SFX**: cue hit, ball and pocket interactions (velocity-gated), turn bell, win applause, next-match phone loop, and **per-brainrot voice lines** where assets exist. **Format fallback** tries ogg, then mp3, then wav.
- **Mute** toggle in the HUD.

---

## Camera & presentation

- Mostly **top-down** play camera for the player; **AI shots** sometimes use a **tilted / cinematic** preset (~30% chance). **Opening break** uses a slightly raised framing.
- **Three.js** table mesh and balls with rolling quads; **ACES** tone mapping and soft shadows; HUD band avoids a gap under the UI via resize sync.

---

## Prototype limitations

- **Phone and in-app browsers**: audio can **misbehave or cut out** (autoplay rules, tab focus, mixing Web Audio and HTMLAudio). Treat mobile audio as **unverified** until tested on target devices.
- **Rules**: the prototype may still have **minor or edge-case rule mistakes** in the 8-ball engine; flag odd outcomes for a later pass.

---

## Build & deploy

- **`npm run dev`**, **`npm run build`** (`dist/`), **`npm run build:docs`** (`docs/` for GitHub Pages), **`npm run preview`**. Set **`VITE_GH_PAGES_BASE`** if the repo path is not the default assumed base URL.

---

*This file is a living summary for releases and onboarding; update it when major gameplay, brainrot roster, audio pipeline, or pipeline behavior changes.*
