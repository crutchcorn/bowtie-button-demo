# Bowtie button

A button whose background is a repeating bowtie pattern. On hover the pattern fades in as a field of
dots; on press the dots morph into rotating bowties while the whole layer scales up and fades back.

## How the animation is wired together

Two things animate at once, from two different places:

- **CSS** (`styles.css`) transitions `.bowties` from `transform: none` to `transform: scale(4, 2)`
  and `opacity: 1` to `opacity: 0.24` over 300ms with `ease-in-out`.
- **JS** (`script.js`) swaps `background-image` between `assets/frame0.svg` … `assets/frame9.svg` on
  every animation frame, using `Math.floor(progress * 9)` over the same 300ms — so frame `n` is the
  intended state at **linear** time `t = n / 9`.

The SVGs are a tile: each is a 48×48 viewBox drawn at `background-size: 8px`, repeated across the
layer. Everything below is expressed in the SVG's 48-unit user space, where the motif is centred on
`(24, 24)`.

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

The CSS scale is deliberately non-uniform: `scale(4, 2)` instead of `scale(4)`. Because the pattern
is a *background image*, the tile pitch and the artwork size are locked together, so squashing the
vertical scale is the only way to pack the rows closer than the tile allows. The cost is that the
bowties get squashed with it — 4× wide but only 2× tall.

To cancel that, each frame pre-stretches its artwork vertically by the same amount the CSS is about
to squash it. Applied **outside** the rotation, the two scales compose into a uniform one:

$$\text{scale}(4, 2) \cdot \text{scale}(1, 2) = \text{scale}(4, 4)$$

The correction can't be a constant, though: the CSS scale ramps up over the transition, and at rest
(hover, frame 0) there is no scale at all — a constant pre-stretch would show up as visibly oval
dots. So `F` tracks the distortion frame by frame.

At eased progress `e`, the CSS transform is `scale(1 + 3e, 1 + e)`, so the aspect error to undo is:

$$F = \frac{1 + 3e}{1 + e}$$

`e` is `cubic-bezier(0.42, 0, 0.58, 1)` — the `ease-in-out` used by the CSS transition — evaluated at
that frame's linear time `t = n / 9`:

| frame | 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `e` | 0 | 0.0244 | 0.1014 | 0.2318 | 0.4050 | 0.5950 | 0.7682 | 0.8986 | 0.9756 | 1 |
| `F` | 1 | 1.0477 | 1.1842 | 1.3764 | 1.5765 | 1.7461 | 1.8689 | 1.9466 | 1.9876 | 2 |

Consequences worth knowing:

- **The SVGs only look correct inside the button.** Opened on their own, the dot is a circle at
  frame 0 and a 2:1 ellipse by frame 9. That is the point — the CSS squash makes it round again.
- **Anything past ±24 units from centre is clipped** by the tile's viewBox, and `F` doubles how far
  the artwork reaches vertically. The tallest frame currently reaches 23.7 units, so there is very
  little headroom.
- **`F` and the CSS scale are coupled.** Changing `scale(4, 2)` means recomputing every `F`.

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

## Regenerating the frames

There is no build step — the frames are checked-in SVGs. If you change any of the following, the
derived values need recomputing by hand:

| Change | Recompute |
| --- | --- |
| the CSS `scale(4, 2)` | every `F` |
| the CSS transition timing function or duration | every `F` |
| the number of frames | every `F` (the `t = n / 9` mapping) and every `B` |
| the rotation keyframes | every `B` |
| the bow path or its final `1.25` | every `B`, and re-check the ±24 unit clipping budget |
