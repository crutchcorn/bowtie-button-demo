# Bowtie button

A button whose background is a repeating bowtie pattern. On hover the pattern fades in as a field of
dots; on press the dots morph into rotating bowties while the whole layer scales up and fades back.

## How the animation is wired together

The press animation is driven entirely from `script.js`, by one progress value and one
`requestAnimationFrame` loop:

- A paused Web Animations API effect interpolates `transform` from `scale(1, 1)` to `scale(4, 2)`
  and `opacity` from `1` to `0.24` over 300ms with `ease-in-out`. The loop seeks its `currentTime`
  explicitly instead of calling `play()` or changing `playbackRate`.
- That same loop swaps `background-image` between `bowtie-frames.svg#frame0` … `#frame9` from the
  exact same progress value: `Math.floor(progress * 9)`. So frame `n` is the intended state at
  **linear** time `t = n / 9`, while the scale and fade are eased.

There is no autonomously playing animation or second release loop. Pressing changes the progress
target to `1`, releasing changes it to `0`, and a reversal first accounts for elapsed time in the old
direction before changing course. Rapid presses therefore remain continuous, and stale callbacks
cannot keep swapping SVGs after the scale and fade have unwound.

Pointer IDs and activation keys are tracked separately, so one input source cannot release another.
Pointer cancellation, lost capture, window blur, and a hidden document all release their active
inputs instead of leaving the button stuck down.

Hover is still CSS: an outer `.bowtie-visibility` layer fades `opacity` 0 → 1, while the inner
`.bowties` layer owns the press scale, fade, and SVG frame. Keeping hover and press opacity on
separate elements prevents an outside release from exposing a stale CSS transition. The paused press
effect is `cancel()`ed only once it has unwound back to the start.

`bowtie-frames.svg` is a horizontal sprite with ten named `<view>` fragments. Each fragment selects
a 48×48 tile, drawn at `background-size: 8px 8px` and repeated across the layer. The three paths are
stored once in `<defs>` and reused by every frame. The stylesheet's `#frame0` reference loads the
whole sprite, so separate hidden preload images are unnecessary. Everything below is expressed in a
frame's 48-unit user space, where the motif is centred on `(24, 24)`.

Each frame contains three nested transforms:

```svg
<g id="squish_correction" transform="translate(24 24) scale(1 F) translate(-24 -24)">
  <g id="rotation"        transform="rotate(θ 24 24) translate(24 24) scale(B B) translate(-24 -24)">
    <!-- bow + shadow -->
  </g>
  <g id="dot_scale"       transform="translate(24 24) scale(D D) translate(-24 -24)">
    <!-- dot -->
  </g>
</g>
```

`θ` (rotation) and `D` (dot scale) are the original authored keyframe values. `F` and `B` are
derived — the rest of this document explains how and why.

## `squish_correction` — the `F` factor

The press scale is deliberately non-uniform: `scale(4, 2)` instead of `scale(4)`. Because the pattern
is a *background image*, the tile pitch and the artwork size are locked together, so squashing the
vertical scale is the only way to pack the rows closer than the tile allows. The cost is that the
bowties get squashed with it — 4× wide but only 2× tall.

To cancel that, each frame pre-stretches its artwork vertically by the same amount the CSS is about
to squash it. Applied **outside** the rotation, the two scales compose into a uniform one:

$$\text{scale}(4, 2) \cdot \text{scale}(1, 2) = \text{scale}(4, 4)$$

The correction can't be a constant, though: the scale ramps up over the press, and at rest
(hover, frame 0) there is no scale at all — a constant pre-stretch would show up as visibly oval
dots. So `F` tracks the distortion frame by frame.

At eased progress `e`, the animation's transform is `scale(1 + 3e, 1 + e)`, so the aspect error to
undo is:

$$F = \frac{1 + 3e}{1 + e}$$

`e` is `cubic-bezier(0.42, 0, 0.58, 1)` — the `ease-in-out` the animation is created with — evaluated
at that frame's linear time `t = n / 9`:

| frame | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `e` | 0 | 0.0244 | 0.1014 | 0.2318 | 0.4050 | 0.5950 | 0.7682 | 0.8986 | 0.9756 | 1 |
| `F` | 1 | 1.0477 | 1.1842 | 1.3764 | 1.5765 | 1.7461 | 1.8689 | 1.9466 | 1.9876 | 2 |

Consequences worth knowing:

- **The sprite frames only look correct inside the button.** Opened on their own, the dot is a
  circle at frame 0 and a 2:1 ellipse by frame 9. That is the point — the CSS squash makes it round
  again.
- **Anything past ±24 units from centre is clipped** by the tile's viewBox, and `F` doubles how far
  the artwork reaches vertically. The tallest frame currently reaches 23.7 units, so there is very
  little headroom.
- **`F` and the press scale are coupled.** Changing `scale(4, 2)` means recomputing every `F`.

## `rotation` — the `B` factor

`B` is the bow's own scale, ramping from `0.4167` to `1.25`.

The bow is a fixed shape that fades in while the dot shrinks from `4` to `1.25`. Originally the bow
was drawn at its final `1.25` the whole time, which meant its tips (12 units from centre at scale 1,
so 15 units at 1.25) escaped the dot as soon as the dot's radius dropped below 15 — from frame 2
onward. With the bow still semi-transparent and the dot still large and round, the result read as a
circle with two detached flaps rather than one shape morphing.

Ramping `B` makes the bowtie grow out from under the shrinking dot instead. It starts at
`5 / 12 = 0.4167`, which gives the bow a half-length of 5 units — the radius of the final knot, and
small enough to sit entirely inside the dot — and interpolates to `1.25` on the same normalised
curve as the rotation, `r = θ / -165°`:

$$B = 0.4167 + 0.8333\,r$$

| frame | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `r` | 0 | 0.0328 | 0.1752 | 0.4573 | 0.6952 | 0.8371 | 0.9208 | 0.9688 | 0.9930 | 1 |
| `B` | 0.4167 | 0.444 | 0.5627 | 0.7977 | 0.9961 | 1.1143 | 1.184 | 1.224 | 1.2442 | 1.25 |

The bow stays fully inscribed in the dot through frame 2, first peeks past its edge at frame 3, and
is clearly emerged by frame 4 — so its lobes are always attached to the dot. Frame 9 is unchanged.

Because the bow is smaller through the middle frames, this also buys back the vertical headroom that
`F` was eating: the near-vertical rotations around frames 4–6 no longer clip against the tile edge.

## Tests

Run `npm test` for the deterministic Vitest suite, or `npm run test:watch` while developing. The
tests use a controlled clock and animation-frame queue to cover rapid reversals, dense press bursts,
overlapping pointer and keyboard input, cancellation paths, the frame/time synchronization invariant,
the sprite's fragment mapping and gzip budget, and the exact scale/fade keyframes. They require Node
`^20.19`, `^22.12`, or `>=24`.

The behavioral tests execute the exact production `script.js` as a black box in a fresh JSDOM
window. The shipped runtime therefore needs no exports, dependency-injection options, teardown API,
or second JavaScript module for testability.

## Regenerating the sprite

There is no build step — the sprite is a checked-in SVG. If you change any of the following, the
derived values need recomputing by hand, then updating the corresponding frame group in
`bowtie-frames.svg`:

| Change | Recompute |
| --- | --- |
| the `scale(4, 2)` keyframe | every `F` |
| the animation's easing or duration | every `F` |
| the number of frames | every `F` (the `t = n / 9` mapping) and every `B` |
| the rotation keyframes | every `B` |
| the bow path or its final `1.25` | every `B`, and re-check the ±24 unit clipping budget |
