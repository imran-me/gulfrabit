# mascot — the GulfRabit rabbit

A low-poly, rigged, three.js rabbit that hops along the foot of the shop.
It matches the logo on purpose: faceted plates of colour running cyan at the
edges to lime through the middle, tall ears with a lighter inner face, an
ice-white ruff. The mark's tagline is *Shop Smart. Hop Fast*.

```
mascot.js     the gate, the scene, the lights, the loop
rabbit.js     the character — bones, skin weights, geometry, colour
brain.js      what it does and when — states, poses, reactions
mascot.css    the strip it lives in
vendor/       three.module.js, r169, unmodified
```

## The gate is the important part

three.js is **264KB gzipped**. On a shop whose customers are on cheap Android
phones and metered data, that is not free. So the module refuses to load at
all unless every one of these is true:

| Check | Why |
|---|---|
| not `prefers-reduced-motion` | an accessibility instruction, not a preference |
| not `Save-Data`, not 2g | the visitor is paying by the megabyte |
| ≥ 4 cores, ≥ 4GB memory | it will stutter below that, and a stuttering mascot is worse than none |
| viewport ≥ 480px | the strip would eat a phone screen |
| WebGL available | obviously |
| page is not in the funnel | see below |
| after `load` + an idle callback | it competes with nothing |

It also stops rendering entirely on a hidden tab and when the strip is
scrolled out of view.

**Never in the funnel.** Cart, checkout, express and the confirmation page are
excluded in `NO_MASCOT` in `tools/assemble.py` *and* re-checked by
`OFF_LIMITS` in `mascot.js`. Both would have to be changed to put a rabbit
next to a Place Order button. Whatever the mascot is worth on a category
page, it is worth less than one abandoned basket.

## The rig is real

Twenty-one bones in a hierarchy, a `Skeleton`, and a `SkinnedMesh` whose
vertices are weighted to their two nearest bones — computed at build time from
bone distance, which is the job a modelling tool would normally do. That is
what lets an ear curl along its length and a back arch mid-jump.

There is no `.glb`. A binary model would be a file nobody in this project can
open, review or diff; everything here is primitives and arithmetic, so
changing the length of an ear is a number in `rabbit.js`.

## The behaviour is poses, not clips

Every animation is a function of one number: how far through the state we are.
No `AnimationClip`, no keyframes. Any state can interrupt any other without a
transition being authored for that pair, a hop can land where the rabbit is
actually going, and the head can turn to where the pointer really is — none of
which a recorded clip can do.

States: `idle` `hop` `dash` `alert` `wash` `thump` `sleep`.
`NEXT` in `brain.js` decides what may follow what, because the *sequence* is
most of the character — a rabbit that hops twice and then washes its face
reads as an animal; one that cycles uniformly reads as a screensaver.

It wakes on pointer, scroll or key, runs when the page is scrolled fast,
thumps when tapped, and falls asleep after 22 seconds of nothing.

## It never takes a click

`pointer-events: none` on the whole strip, at `z-index: 5` — over the page
background, under every piece of chrome the site has. Tapping the rabbit is
handled by testing the pointer position against where it is, precisely so the
canvas can stay inert. A mascot that eats a click meant for a product card is
a bug, not a toy.

## Removing it

Delete `modules/mascot/` and the `NO_MASCOT` block plus the two-line injection
in `tools/assemble.py`. Nothing else in the project imports from here, and no
page carries a `<link>` to its stylesheet — the module loads its own CSS if
and when it decides to run.
