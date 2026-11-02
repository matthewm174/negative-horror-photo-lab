# Quick Start Guide

This guide is about doing, not theory.

> **The one idea to remember:** you're standing in a darkroom.
> **Load a picture → choose a process → expose → develop → fix → save.**
>
> **You don't have to remember any of that.** The highlighted box under the plate always says
> **NEXT: …**, and the button it names pulses. Just keep doing what it says.

---

## The screen at a glance

The sections are numbered in the order you use them. Read the left column top to bottom, then the
right column top to bottom.

```
┌───────────────────────────┬────────────────────────────────┬───────────────────────────┐
│ LEFT: set up              │ MIDDLE: the plate              │ RIGHT: process & finish   │
│                           │                                │                           │
│ 1 · Load your picture  ◀──┼── start here                   │ 6 · Expose                │
│ 2 · Choose a process      │  tools (hand, brushes)         │ 7 · Develop & fix         │
│ 3 · Lamp          (opt.)  │  ┌──────────────────────────┐  │ 8 · Tone, age & save      │
│ 4 · Aperture/lens (opt.)  │  │        THE PLATE         │  │ 9 · Video reel    (opt.)  │
│ 5 · Flaws & grain (opt.)  │  └──────────────────────────┘  │                           │
│                           │  ┌──────────────────────────┐  │ Darkroom log              │
│                           │  │ NEXT: what to press now  │  │ (says what just happened) │
│                           │  └──────────────────────────┘  │                           │
│                           │  [the buttons you press]       │                           │
└───────────────────────────┴────────────────────────────────┴───────────────────────────┘
```

* **(opt.)** sections are optional and start folded shut. Ignore them on your first plate.
* The **buttons under the plate** do the actual work: expose, develop, fix, save, start over.
  A greyed-out button means that step doesn't apply yet.

### Comparing with your original photo
Above the plate there's a **View** menu and an **Original ⇄ Plate** button:

| View | What you see |
|---|---|
| **plate** | The plate itself (the normal view). |
| **original photo (placement)** | Your untouched photo, exactly where it lands on the plate (moved, scaled, rotated, flipped), with dust, veils and cards shown faintly on top. Use it to place things. |
| **split — original \| plate** | Original on the left, plate on the right. Drag the **wipe** slider to move the dividing line. |
| **projection (focusing)** | The light falling on the plate, including blur. Useful for painted cards and focus. |

* **Original ⇄ Plate** flips between the two with one click.
* **Hold the O key** to peek at the original, and let go to come back.
* **Save PNG always saves the plate**, whatever view is showing.

---

## Your first photo

### 1 — Load your picture *(section 1)*
1. **My picture is a**: choose **Normal photo (positive)** for anything from a phone or camera.
   Choose **Scanned film negative** only if you scanned real film. *Set this before you load.*
2. **Load picture**: pick your image.

The demo picture disappears, and the plate takes the shape of your photo.
*(To practise first, skip this step and use the demo.)*

### 2 — Choose a process *(section 2)*
**Process**: if you're unsure, use **Silver gelatin dry plate**. It's the most predictable.
Changing the process sets sensible defaults for everything else.

### 3 — Expose *(button under the plate)*
Press **Uncap lens (expose)**. A timer runs.

* *Optional:* while it runs, hold the mouse on part of the plate. With the **Hand (dodge)** tool that
  area gets less light.
* When the timer ends, the plate looks blank. **That's normal.** The image is invisible until it's
  developed.

*In a hurry? **Instant exposure** does the same thing with no timer.*

### 4 — Develop *(button under the plate)*
Press **Into the tray**. (For a daguerreotype it says **Over the mercury**; for heliography,
**Into the solvent**.) Watch the image appear, then press **Pull** when you like it.

*In a hurry? **Instant develop**.*

### 5 — Fix *(button under the plate)*
Press **Fix & wash**. This locks the image in.

### 6 — Finish *(section 8, optional)*
* **Toner** → **Sepia** for the brown old-photo look.
* **Years** → slide it up to age the plate.

These sliders change the finished plate live.

### 7 — Save *(button under the plate)*
Press **Save PNG**.

### Start again
Press **Fresh plate** (under the plate). Your picture and settings stay; only the plate is new.
One plate can only be developed once, just like the real thing.

---

## "It came out wrong" — fixing exposure

**Easiest: make a test strip.**

1. **Fresh plate**.
2. Section **6 · Expose** → **Test strip**.
3. **Instant develop**. You'll see 6 vertical bands, each with twice the light of the one to its left.
4. Find the band you like best, then change **Exposure time** (section 6):

| Best band (from the left) | 1 | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|
| Change Exposure time to | ÷ 8 | ÷ 4 | ÷ 2 | keep it | × 2 | × 4 |

5. **Fresh plate**, then expose and develop for real.

**Rules of thumb**

* **Most processes:** **too dark → shorter exposure**, **too pale → longer exposure**.
* **Daguerreotype, heliography and camera obscura are the opposite:** **too dark → longer exposure**.
* **Flat and grey?** Raise **Contrast grade** (section 2), or develop longer.
* **Harsh and blocky?** Lower **Contrast grade**, or press **Pull** earlier.

---

## The special processes

| Process | What's different |
|---|---|
| **Salted paper** | No developer. The picture appears *while you expose*. Then **Fix & wash**. |
| **Camera obscura** | No chemistry at all. Expose, then **Save PNG**. The image is upside down on purpose (section 4 → untick **Invert image** to change that). |
| **Daguerreotype** | A mirror. In section 8, **Surroundings** low = positive, high = it flips to a negative. |
| **Heliography** | An 8-hour exposure that runs in about 8 real seconds. Washing too long erodes the image, so pull early. |
| **Calotype** | Meant to give a *paper negative*. See "Two-step prints" below. |

---

## Getting the look you want

Most layer tricks are in section 1 → click a layer in the list → open
**Adjust selected layer (move, blur, ghost, shake)**.

| I want… | Do this |
|---|---|
| **To see where things will land / what changed** | **View: split** (drag **wipe**), or hold **O** to peek at the original. Move things under **Adjust selected layer** while watching **View: original photo (placement)**. |
| **A ghost / spirit figure** | Header → **Starting recipe: Spirit photograph** → **Set up bench**, then follow NEXT. Or load a *second* picture and, under **Adjust selected layer**, set **Enters at** to about 0.6. |
| **A blurred, moving sitter** | Adjust selected layer → **Tremble** (shaking) or **Drift X / Drift Y** (smear in one direction). |
| **Dreamy soft focus** | Section 4: lower the **f-number**, and set the layer's **Distance (mm)** away from **Focus at (mm)**. Or raise **Lens softness**. |
| **Sharp centre, smeared corners** | Section 4 → **Field curvature**. |
| **Dark corners** | Section 4 → **Vignetting**. |
| **Uneven, wrong lighting** | Section 3 → move **Lamp X / Lamp Y** off centre. A lower **Lamp height** is harsher. |
| **Flickering light** | Section 3 → **Flicker**. |
| **Dust, hairs, scratches** | Section 1 → **Add an object** → *Dusty glass* or *Scratched film base* → **Add**. Its **Distance (mm)** sets the blur. |
| **An oval old-portrait frame** | Section 1 → **Add an object** → *Oval mat card*. |
| **Draw your own shadows** | Section 1 → **Add an object** → *Paintable card*. Then use the **Paint card** tool on the plate (Shift-drag erases). To see what you drew, switch the view at the top to **View: projection (focusing)**. |
| **More grain** | Section 5 → **Graininess**, **Grain size**. |
| **Hand-poured plate flaws** | Process **Wet collodion**, or section 5 → **Pour pooling**, **Comets**, **Oyster shell**, **Thumb corner**. |
| **Streaks flowing down from dark shapes** | Section 7 → **Agitation: Still bath**, raise **Bromide drag**. |
| **Blotchy chemistry** | Section 7 → **Uneven chemistry**, **Uneven pour**. |
| **Half-negative, glowing outlines** | While developing, press **Flash light** about a third of the way through. Or use the recipe **Sabattier nightmare**. |
| **White blobs** | **Fixer brush** tool: paint on the plate *before* exposing. |
| **Dark painted marks** | **Developer brush** or **Warm thumb** while it's in the tray. |
| **A burst of light from an edge** | Section 6 → **Light leak** (before developing). |
| **Old, damaged, haunted** | Section 8 → **Years**. Short **Fix time** or **Wash time** (section 7) stains it more. |
| **Cracked glass** | Section 8 → **Drop the plate**. |
| **Brown / purple / cool tones** | Section 8 → **Toner**. |

### Recipes = setup shortcuts only
Header → **Starting recipe** → pick one → **Set up bench**. Recipes only *arrange the bench*. You still
follow the NEXT steps. Each recipe writes a hint in the Darkroom log.

### Two-step prints (calotype → salt print, or re-photographing anything)
1. Make a plate and **Fix & wash** it.
2. Section 8 → **Use plate as layer**.
3. Section 1: untick (☐) or remove (✕) your original picture, so only the new plate is in the light path.
4. Section 2: change the **Process** (for example to **Salted paper**), then follow NEXT again.

---

## Video

Video uses **everything you set up for photos** (sections 1–8). Each frame is exposed and developed
automatically using **Exposure time** (section 6) and the **Recommended** time (section 7).

### 1 — Open section 9 · Video reel
It's at the bottom of the right column and starts folded shut. Click its title.

### 2 — Optional shortcut
Header → **Starting recipe: Begotten-style reel** → **Set up bench**. This gives harsh, grainy,
scratched, flickering, re-photographed film.

### 3 — Load the video
**Video file** → pick a clip. Its first frame becomes a picture called **Reel** in section 1.

### 4 — Get the look on a still first (important)
Follow the normal photo steps on that first frame (**Instant exposure** → **Instant develop**), then
look at it. Adjust, press **Fresh plate**, and try again until you like it.
**Every frame will look roughly like this still.**

### 5 — Choose what to render (section 9)
* **Start (s)** / **Duration (s)**: **start short (2–5 s)**. Every frame is fully simulated.
* **Frame rate**: 18 for an old-film jerk, 24 for smoother motion.
* **Width (px)**: 320–480 while testing (smaller is faster).

### 6 — Add film damage (section 9, optional)
| Slider | What it does |
|---|---|
| **Generations** | Re-photographs each frame from its own print. 2–3 gives a degraded, harsh look. |
| **Step print** | Repeats frames, giving stuttering motion. |
| **Gate weave** | The picture wobbles. |
| **Flicker** | Brightness pulses. |
| **Scratches** / **Dust** | Lines and specks that come and go. |
| **Frame slip** | The frame rolls and shows the black frame line. |
| **Bath exhaustion** | The developer weakens along the reel, so later frames come out lighter. |

### 7 — Render and download
1. **Develop reel**. Watch the progress bar and preview. **Cancel** stops it.
2. **Project** plays it back.
3. **Project & record** plays it again while recording, then shows a
   **Download reel (.webm)** link. Recording runs in real time.

Doesn't look right? Fix the still (step 4) and press **Develop reel** again.

---

## When something doesn't work

| Problem | Fix |
|---|---|
| Not sure what to do | Read the **NEXT** box under the plate. |
| Button greyed out | That step doesn't apply yet (or to this process). Follow NEXT. |
| Plate blank after exposing | Normal. Develop it. |
| "Already developed" in the log | Press **Fresh plate**. |
| Dodging did nothing | The **Hand** tool only works while the timer runs (**Uncap lens**, not Instant). |
| Pure black or pure white | Exposure is far off. Make a **Test strip**. |
| Upside down | Section 4 → untick **Invert image**. |
| Two pictures on top of each other | Section 1: untick (☐) or remove (✕) the one you don't want. |
| Slow | Section 2 → **Plate size: Quarter**. For video, lower **Width (px)**. |
