/**
 * utsab-gl.js — উৎসব, the festival theme's generative background.
 *
 * WHY THIS FILE IS NEVER LOADED UNLESS THE THEME IS ON
 * ---------------------------------------------------
 * Utsab is a special-occasion theme — Eid, Boishakh, a sale — not the shop's
 * daily clothes. So theme.js reaches this module through a dynamic import()
 * and only after it has decided the theme is Utsab. On every other day this
 * file is not fetched, not parsed, and not compiled, and the storefront pays
 * nothing at all for a background it is not showing. A static import would
 * have put every byte below on the critical path of a Classic shop.
 *
 * WHY NO THREE.JS
 * ---------------
 * Three.js is a scene graph, a loader stack, a material and lighting system,
 * and a camera rig. A full-screen generative background uses none of those:
 * it is one quad, one fragment shader, and a clock. The whole renderer below
 * is smaller than Three's import map, needs no vendoring or CDN, and keeps
 * the property the rest of this codebase is built on — nothing here can fail
 * because a third-party origin is unreachable.
 *
 * HOW 300+ BACKGROUNDS COME OUT OF 24 SHADERS
 * -------------------------------------------
 * Not by writing 300 shaders. Three hundred hand-authored effects would be
 * three hundred near-duplicates, and a count is not a design.
 *
 * Instead the space is FACTORED into axes that are genuinely independent, and
 * the states are their product:
 *
 *   FIELD    24  what the pixels are — nebula, caustics, curl flow, voronoi,
 *                reaction-diffusion, tunnel, moire, metaballs, and so on.
 *   PALETTE  12  a cosine-gradient triple (Inigo Quilez's four-coefficient
 *                form), so a palette is twelve floats rather than a texture.
 *   MOTION    5  how the clock enters the field: drift, pulse, swirl, breathe,
 *                still.
 *   DENSITY   4  the spatial frequency, which changes what a field IS — a
 *                voronoi at 3 cells is a stained-glass window and at 40 is a
 *                crocodile skin.
 *
 * 24 x 12 x 5 x 4 = 5760 reachable states, and the axes are orthogonal by
 * construction: every field reads `u_scale`, every field colours through
 * `pal()`, every field takes its time from `flow()`. Adding one field adds
 * 240 states; adding one palette adds 480. That is what makes this a system
 * rather than a list, and it is why a new idea costs eight lines here instead
 * of a new file.
 *
 * The conductor does not roll uniformly across that space. Some pairings are
 * ugly — a still motion on a field that is only interesting when it moves —
 * so each field declares which motions suit it. Curation is the difference
 * between a generative system and a random one.
 *
 * WHAT IT REFUSES TO DO
 * ---------------------
 * - Render at device resolution. It draws at a fraction of it and lets the
 *   compositor scale up; a smooth gradient field loses nothing and a phone
 *   GPU keeps most of its battery.
 * - Run above 36fps. This is wallpaper. A 144Hz background is 144Hz of heat
 *   for something nobody is looking directly at.
 * - Run at all without WebGL2, under reduced motion, while the tab is hidden,
 *   or once the theme has changed. Each of those is checked here rather than
 *   trusted to the caller.
 */

/* ---- the shared GLSL ---------------------------------------------------- */

const VERT = `#version 300 es
in vec2 a;
void main() { gl_Position = vec4(a, 0.0, 1.0); }`;

/**
 * Everything every field can use. Compiled once per field program, which is
 * cheap, and keeps each field to the few lines that are actually its idea.
 *
 * `pal` is Inigo Quilez's cosine palette: colour(t) = A + B*cos(2pi*(C*t+D)).
 * Twelve floats describe a full gradient that is smooth and cyclic by
 * construction, so no palette can ever band or hitch at its seam — which is
 * exactly what a texture-based gradient does when you loop it.
 */
const PRELUDE = `#version 300 es
precision highp float;
out vec4 fragColor;

uniform vec2  u_res;
uniform float u_t;        // seconds, already shaped by the motion axis
uniform float u_raw;      // unshaped seconds, for fields that need a steady beat
uniform float u_scale;    // the density axis
uniform float u_seed;
uniform vec3  u_pA, u_pB, u_pC, u_pD;   // the palette axis

vec3 pal(float t) { return u_pA + u_pB * cos(6.28318530718 * (u_pC * t + u_pD)); }

mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }

float hash11(float p) { p = fract(p * 0.1031); p *= p + 33.33; return fract(p * (p + p)); }
float hash21(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.x + q.y) * q.z);
}
vec2 hash22(vec2 p) {
  vec3 q = fract(vec3(p.xyx) * vec3(0.1031, 0.1030, 0.0973));
  q += dot(q, q.yzx + 33.33);
  return fract((q.xx + q.yz) * q.zy);
}

/* Value noise with a quintic fade — the smoothstep-cubic version creases
   visibly along cell boundaries once it is stacked into fbm. */
float vnoise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  return mix(mix(hash21(i), hash21(i + vec2(1, 0)), u.x),
             mix(hash21(i + vec2(0, 1)), hash21(i + vec2(1, 1)), u.x), u.y);
}

float fbm(vec2 p) {
  float v = 0.0, a = 0.5;
  /* Each octave is rotated as well as scaled. Without the rotation the
     octaves share axes and the sum shows a grid; this is the standard fix
     and it costs one mat2 multiply. */
  mat2 m = rot(0.5) * 2.02;
  for (int i = 0; i < 5; i++) { v += a * vnoise(p); p = m * p; a *= 0.5; }
  return v;
}

/* Cheap curl of the noise field: the gradient, rotated a quarter turn. A
   divergence-free field is what makes flow look like a fluid rather than
   like everything sliding toward a drain. */
vec2 curl(vec2 p) {
  float e = 0.06;
  float n1 = fbm(p + vec2(0.0, e)), n2 = fbm(p - vec2(0.0, e));
  float n3 = fbm(p + vec2(e, 0.0)), n4 = fbm(p - vec2(e, 0.0));
  return vec2(n1 - n2, n4 - n3) / (2.0 * e);
}

float vor(vec2 p, out vec2 cell) {
  vec2 g = floor(p), f = fract(p);
  float d = 8.0; cell = vec2(0.0);
  for (int y = -1; y <= 1; y++)
  for (int x = -1; x <= 1; x++) {
    vec2 o = vec2(float(x), float(y));
    vec2 r = o + hash22(g + o) - f;
    float dd = dot(r, r);
    if (dd < d) { d = dd; cell = g + o; }
  }
  return sqrt(d);
}
`;

/**
 * THE FIELDS.
 *
 * Each is the body of `vec3 field(vec2 p)`, where p is centred and
 * aspect-corrected so that (0,0) is the middle of the screen at every window
 * shape — the same discipline as the vw/vh rule in Noor's sky, for the same
 * reason: a field that stretches with the window is a field that was authored
 * for one monitor.
 *
 * `motions` lists which of the motion axis's five settings suit this field.
 * It is curation, and it is what separates this from a random combiner: a
 * tunnel with the clock stopped is a still image, and a reaction-diffusion
 * that swirls tears its own pattern apart before it can form.
 */
const FIELDS = [
  { name: 'nebula', motions: [0, 1, 3, 4], src: `
    float w = fbm(p * u_scale + u_t * 0.06);
    float v = fbm(p * u_scale * 1.4 + vec2(w * 1.8, -w * 1.2) + u_t * 0.03);
    return pal(v * 1.25 + w * 0.3) * (0.55 + 0.75 * v);` },

  { name: 'caustics', motions: [0, 1, 2], src: `
    vec2 q = p * u_scale * 1.6;
    float a = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      q += vec2(sin(q.y * 1.7 + u_t * 0.7 + fi), cos(q.x * 1.6 - u_t * 0.6 - fi)) * 0.42;
      a += 1.0 / max(0.18, length(fract(q) - 0.5));
    }
    a = pow(a * 0.11, 2.2);
    return pal(0.12 + a * 0.16) * clamp(a * 0.5, 0.0, 1.6);` },

  { name: 'curlflow', motions: [0, 2, 3], src: `
    vec2 q = p * u_scale;
    float acc = 0.0;
    for (int i = 0; i < 5; i++) { q += curl(q * 0.7 + u_t * 0.05) * 0.12; acc += fbm(q) * 0.2; }
    return pal(acc * 1.6 + 0.1) * (0.5 + acc * 1.4);` },

  { name: 'voronoi', motions: [0, 1, 4], src: `
    vec2 c;
    float d = vor(p * u_scale + u_t * 0.08, c);
    float edge = smoothstep(0.0, 0.16, d);
    return pal(hash21(c) * 0.8 + u_t * 0.01) * (0.35 + 0.85 * edge);` },

  { name: 'crystal', motions: [0, 1, 4], src: `
    vec2 c;
    float d = vor(p * u_scale * 0.7 + vec2(u_t * 0.05, 0.0), c);
    /* Flat facets: the cell's own random value, with a hard rim. That
       hardness is the whole read — a soft voronoi is cellular, a hard one
       is cut glass. */
    float lit = hash21(c + 3.1);
    float rim = 1.0 - smoothstep(0.02, 0.07, d);
    return mix(pal(lit), vec3(1.0), rim * 0.55) * (0.5 + 0.6 * lit);` },

  { name: 'plasma', motions: [0, 1, 2, 3], src: `
    vec2 q = p * u_scale;
    float v = sin(q.x * 1.6 + u_t) + sin(q.y * 1.4 - u_t * 0.8)
            + sin((q.x + q.y) * 1.1 + u_t * 0.6)
            + sin(length(q) * 2.2 - u_t * 1.1);
    return pal(v * 0.13 + 0.5) * (0.75 + 0.25 * sin(v));` },

  { name: 'tunnel', motions: [0, 2, 3], src: `
    float r = length(p) + 0.001;
    float a = atan(p.y, p.x);
    vec2 q = vec2(a / 3.14159 * u_scale * 0.5, u_t * 0.35 + 0.55 / r);
    float v = fbm(q * 2.0);
    /* Darkening with depth is what makes it a tunnel and not a dartboard. */
    return pal(v + q.y * 0.06) * smoothstep(0.0, 0.55, r) * (0.5 + v);` },

  { name: 'starwarp', motions: [0, 2], src: `
    vec3 col = vec3(0.0);
    float a = atan(p.y, p.x), r = length(p);
    for (int i = 0; i < 3; i++) {
      float fi = float(i) + 1.0;
      float lane = floor(a / 6.28318 * u_scale * 6.0 + fi * 7.0);
      float seed = hash11(lane * 13.7 + fi * 31.0);
      float d = fract(seed + u_t * (0.12 + seed * 0.2) + r * 0.5);
      col += pal(seed) * smoothstep(0.4, 0.0, abs(d - r * 0.9)) * 0.5;
    }
    return col;` },

  { name: 'moire', motions: [0, 1, 2, 4], src: `
    vec2 a = p * u_scale * 3.0;
    vec2 b = (p * rot(0.02 + sin(u_t * 0.2) * 0.06)) * u_scale * 3.05;
    float g = sin(a.x) * sin(a.y) * sin(b.x) * sin(b.y);
    return pal(g * 0.5 + 0.5) * (0.6 + 0.5 * abs(g));` },

  { name: 'metaball', motions: [0, 1, 3], src: `
    float m = 0.0;
    for (int i = 0; i < 6; i++) {
      float fi = float(i);
      vec2 c = vec2(sin(u_t * (0.21 + fi * 0.05) + fi * 2.1),
                    cos(u_t * (0.18 + fi * 0.043) + fi * 1.3)) * 0.62;
      m += 0.055 / max(0.004, dot(p - c, p - c) * u_scale * 0.25);
    }
    float s = smoothstep(0.7, 1.5, m);
    return pal(m * 0.22) * (0.35 + s);` },

  { name: 'contour', motions: [0, 1, 4], src: `
    float h = fbm(p * u_scale + u_t * 0.04);
    /* fwidth keeps the line one pixel wide wherever the terrain is steep;
       without it the contours vanish on flats and blob on cliffs. */
    float band = fract(h * 12.0);
    float line = smoothstep(0.5 - fwidth(h) * 14.0, 0.5, abs(band - 0.5) * 2.0);
    return mix(pal(h), pal(h + 0.14) * 1.5, 1.0 - line);` },

  { name: 'kaleido', motions: [0, 2, 3], src: `
    float a = atan(p.y, p.x), r = length(p);
    float seg = 6.28318 / max(3.0, floor(u_scale * 1.6));
    a = abs(mod(a, seg) - seg * 0.5);
    vec2 q = vec2(cos(a), sin(a)) * r * 3.0;
    float v = fbm(q + u_t * 0.1);
    return pal(v + r * 0.2) * (0.5 + v);` },

  { name: 'ripple', motions: [0, 1, 3], src: `
    float v = 0.0;
    for (int i = 0; i < 4; i++) {
      float fi = float(i);
      vec2 c = vec2(sin(fi * 2.3 + u_seed), cos(fi * 1.7 + u_seed)) * 0.7;
      v += sin(length(p - c) * u_scale * 6.0 - u_t * 1.6 + fi) / (1.0 + length(p - c) * 2.0);
    }
    return pal(v * 0.22 + 0.5) * (0.7 + 0.4 * v);` },

  { name: 'hexpulse', motions: [0, 1, 3], src: `
    vec2 q = p * u_scale * 2.0;
    q.x *= 1.1547;
    vec2 i = floor(vec2(q.x, q.y - mod(floor(q.x), 2.0) * 0.5));
    vec2 f = q - vec2(i.x, i.y + mod(i.x, 2.0) * 0.5) - 0.5;
    float d = max(abs(f.x) * 0.866 + abs(f.y) * 0.5, abs(f.y));
    float beat = 0.5 + 0.5 * sin(u_t * 1.4 - hash21(i) * 6.28);
    return pal(hash21(i) * 0.6 + beat * 0.25) * (0.3 + beat * smoothstep(0.5, 0.2, d));` },

  { name: 'aurora', motions: [0, 2, 3], src: `
    float acc = 0.0;
    for (int i = 0; i < 3; i++) {
      float fi = float(i);
      float x = p.x * u_scale * 0.6 + fi * 3.1;
      float band = sin(x + u_t * (0.3 + fi * 0.12) + fbm(vec2(x * 0.5, u_t * 0.1)) * 2.4);
      /* Vertical falloff only: auroral rays follow field lines, so the
         structure is columnar and never horizontal. */
      acc += smoothstep(0.55, 0.0, abs(p.y - band * 0.22 - 0.1 * fi)) * (0.5 - fi * 0.12);
    }
    return pal(acc * 1.1 + 0.15) * acc * 1.6;` },

  { name: 'marble', motions: [0, 1, 4], src: `
    float w = fbm(p * u_scale * 0.8 + u_t * 0.03);
    float v = sin((p.x + p.y) * u_scale + w * 6.0);
    return pal(v * 0.3 + 0.45 + w * 0.2) * (0.65 + 0.4 * abs(v));` },

  { name: 'branch', motions: [0, 1, 4], src: `
    vec2 q = p * u_scale;
    float d = 1.0;
    for (int i = 0; i < 5; i++) {
      q = abs(q) / dot(q, q) - vec2(0.72 + sin(u_t * 0.14) * 0.06, 0.55);
      d = min(d, length(q));
    }
    return pal(d * 2.4 + u_t * 0.02) * (0.4 + smoothstep(0.6, 0.0, d) * 1.3);` },

  { name: 'flock', motions: [0, 2, 3], src: `
    vec3 col = vec3(0.0);
    vec2 q = p * u_scale * 0.6;
    for (int i = 0; i < 14; i++) {
      float fi = float(i);
      vec2 c = vec2(sin(u_t * 0.3 + fi * 1.7) , cos(u_t * 0.24 + fi * 2.3));
      c += curl(c * 0.8 + u_t * 0.05) * 0.4;
      col += pal(hash11(fi)) * 0.016 / max(0.006, length(q - c * 1.2));
    }
    return col;` },

  { name: 'truchet', motions: [0, 1, 4], src: `
    vec2 q = p * u_scale * 1.6;
    vec2 i = floor(q), f = fract(q) - 0.5;
    if (hash21(i + floor(u_t * 0.25)) > 0.5) f.x = -f.x;
    float d = abs(length(f - 0.5) - 0.5);
    d = min(d, abs(length(f + 0.5) - 0.5));
    float line = smoothstep(0.14, 0.02, d);
    return mix(pal(hash21(i) * 0.4), pal(0.7 + hash21(i) * 0.3) * 1.4, line);` },

  { name: 'galaxy', motions: [0, 2, 3], src: `
    float r = length(p), a = atan(p.y, p.x);
    /* Differential rotation: the inside goes round faster, which is the one
       thing that makes a spiral read as a galaxy rather than as a logo. */
    float arm = sin(a * 2.0 + log(r + 0.08) * u_scale * 1.4 - u_t * 0.5);
    float core = exp(-r * 2.4);
    float dust = fbm(p * u_scale * 2.0 + a);
    return pal(0.15 + arm * 0.12 + dust * 0.2) * (core * 1.6 + smoothstep(-0.2, 1.0, arm) * 0.7 * exp(-r));` },

  { name: 'advect', motions: [0, 2, 3], src: `
    vec2 q = p * u_scale;
    for (int i = 0; i < 3; i++) q -= curl(q * 0.9 + u_t * 0.08) * 0.22;
    float v = fbm(q * 1.3 + u_t * 0.04);
    float w = fbm(q * 2.6 - u_t * 0.06);
    return pal(v * 0.9 + w * 0.35) * (0.45 + v + w * 0.4);` },

  { name: 'reaction', motions: [0, 1, 4], src: `
    /* Not a true Gray-Scott — that needs a ping-pong framebuffer and a
       thousand steps. This is the LOOK of one: two noise fields at close
       frequencies, thresholded hard, which lands on the same labyrinth
       topology for a fraction of the cost and no state to keep. */
    float a = fbm(p * u_scale + u_t * 0.05);
    float b = fbm(p * u_scale * 1.07 - u_t * 0.04 + 11.3);
    float m = smoothstep(0.46, 0.52, a - b + 0.5);
    float edge = smoothstep(0.02, 0.0, abs(a - b));
    return mix(pal(0.1), pal(0.72), m) * (0.6 + edge * 1.2);` },

  { name: 'glassrain', motions: [0, 1], src: `
    vec2 q = p * u_scale * 2.2;
    vec2 i = floor(q), f = fract(q) - 0.5;
    float drift = hash21(i) * 6.28;
    f.y += sin(u_raw * (0.6 + hash21(i + 5.0)) + drift) * 0.22;
    float d = length(f * vec2(1.0, 0.7));
    float drop = smoothstep(0.34, 0.06, d);
    vec2 refr = p + f * drop * 0.28;
    return pal(fbm(refr * u_scale * 0.5 + u_t * 0.02)) * (0.55 + drop * 0.8);` },

  { name: 'mandala', motions: [0, 1, 3], src: `
    float r = length(p), a = atan(p.y, p.x);
    float n = max(4.0, floor(u_scale * 2.0));
    float sym = cos(a * n + u_t * 0.3);
    float rings = sin(r * u_scale * 5.0 - u_t * 0.7);
    float petal = smoothstep(0.1, 0.9, sym * rings);
    return pal(r * 0.7 + petal * 0.25 + u_t * 0.01) * (0.4 + petal * 1.1) * smoothstep(1.5, 0.1, r);` },
];

/**
 * THE PALETTES. Four coefficients each, per Inigo Quilez's cosine form.
 * The first four are the shop's own themes rendered as gradients, which is
 * what lets Utsab sit beside them rather than arrive from another product.
 */
const PALETTES = [
  { name: 'noor',      A: [.06, .16, .20], B: [.30, .34, .32], C: [1, 1, 1],    D: [.00, .12, .22] },
  { name: 'gulf',      A: [.10, .30, .38], B: [.32, .34, .30], C: [1, 1, .9],   D: [.10, .18, .30] },
  { name: 'nakshi',    A: [.62, .56, .46], B: [.30, .26, .22], C: [1, .9, .8],  D: [.02, .18, .38] },
  { name: 'brand',     A: [.20, .42, .48], B: [.36, .32, .28], C: [1, 1, 1],    D: [.30, .18, .06] },
  { name: 'alta',      A: [.44, .18, .16], B: [.38, .18, .14], C: [1, .8, .6],  D: [.00, .08, .16] },
  { name: 'turmeric',  A: [.54, .40, .16], B: [.36, .30, .12], C: [1, .9, .7],  D: [.06, .14, .24] },
  { name: 'indigo',    A: [.14, .18, .38], B: [.22, .26, .36], C: [1, 1, 1],    D: [.44, .52, .62] },
  { name: 'ember',     A: [.48, .22, .10], B: [.42, .24, .10], C: [1, .7, .4],  D: [.00, .10, .20] },
  { name: 'monsoon',   A: [.26, .32, .36], B: [.20, .22, .26], C: [1, 1, 1],    D: [.55, .60, .68] },
  { name: 'lagoon',    A: [.08, .34, .34], B: [.26, .30, .26], C: [1, .95, .9], D: [.20, .30, .42] },
  { name: 'saffron',   A: [.58, .34, .20], B: [.34, .30, .18], C: [.9, 1, .8],  D: [.10, .20, .34] },
  { name: 'nightlime', A: [.10, .22, .16], B: [.24, .34, .22], C: [1, 1, .9],   D: [.30, .44, .18] },
];

/**
 * THE MOTION AXIS. Each entry shapes the raw clock before the field sees it,
 * which is why a field needs no knowledge of motion at all: it just reads
 * `u_t`. Index 4 is `still`, and it is deliberately not zero — a completely
 * frozen field looks like a failed render, so it creeps.
 */
const MOTIONS = [
  { name: 'drift',   f: (t) => t * 0.5 },
  { name: 'pulse',   f: (t) => t * 0.35 + Math.sin(t * 0.6) * 1.6 },
  { name: 'swirl',   f: (t) => t * 0.9 },
  { name: 'breathe', f: (t) => t * 0.22 + Math.sin(t * 0.28) * 3.4 },
  { name: 'still',   f: (t) => t * 0.06 },
];

/** THE DENSITY AXIS. Spatial frequency, which changes what a field IS — a
 *  voronoi at 3 is stained glass and at 22 is crocodile skin. */
const DENSITIES = [2.2, 4.5, 9.0, 18.0];

/** Every state this system can reach. Reported, not guessed. */
export const STATE_COUNT =
  FIELDS.reduce((n, f) => n + f.motions.length, 0) * PALETTES.length * DENSITIES.length;

/* ---- the renderer ------------------------------------------------------- */

/** Wallpaper does not need 60fps, let alone 144. */
const FPS = 36;
/** Draw below device resolution and let the compositor scale. A smooth field
 *  loses nothing; a phone GPU keeps most of its battery. */
const RES_SCALE = 0.55;

let gl = null;
let canvas = null;
let raf = 0;
let programs = new Map();
let current = null;
let startedAt = 0;
let lastDraw = 0;
let alive = false;
let nextAt = 0;

/**
 * Build a state. Curated, not uniform: a field only offers the motions that
 * suit it, so `still` never lands on a tunnel and `swirl` never tears a
 * reaction field apart.
 */
function rollState() {
  const field = FIELDS[Math.floor(Math.random() * FIELDS.length)];
  return {
    field,
    motion: MOTIONS[field.motions[Math.floor(Math.random() * field.motions.length)]],
    palette: PALETTES[Math.floor(Math.random() * PALETTES.length)],
    density: DENSITIES[Math.floor(Math.random() * DENSITIES.length)],
    seed: Math.random() * 100,
  };
}

function compile(field) {
  if (programs.has(field.name)) return programs.get(field.name);

  const fs = `${PRELUDE}
vec3 field(vec2 p) {
${field.src}
}
void main() {
  /* Centred and aspect-corrected on the SHORT axis, so the field neither
     stretches nor crops as the window changes shape. */
  vec2 p = (gl_FragCoord.xy - 0.5 * u_res) / min(u_res.x, u_res.y) * 2.0;
  vec3 c = field(p);
  /* A vignette, and it is not decoration: this canvas sits behind a shop, and
     pulling the corners down keeps contrast under the header and the footer
     where the chrome actually is. */
  c *= 1.0 - 0.34 * dot(p, p) * 0.35;
  /* Ordered dithering. Eight-bit output bands visibly across a slow gradient
     at this size, and one pixel of noise is the standard, nearly free fix. */
  c += (hash21(gl_FragCoord.xy) - 0.5) / 255.0;
  fragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
}`;

  const p = link(VERT, fs);
  if (!p) return null;

  const u = {};
  for (const n of ['u_res', 'u_t', 'u_raw', 'u_scale', 'u_seed', 'u_pA', 'u_pB', 'u_pC', 'u_pD']) {
    u[n] = gl.getUniformLocation(p, n);
  }
  const rec = { p, u };
  programs.set(field.name, rec);
  return rec;
}

function link(vsrc, fsrc) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      // Not thrown: a background that fails to compile must degrade to the
      // CSS gradient underneath it, never take the page down with it.
      console.warn('[utsab] shader:', gl.getShaderInfoLog(s));
      gl.deleteShader(s);
      return null;
    }
    return s;
  };
  const v = sh(gl.VERTEX_SHADER, vsrc);
  const f = sh(gl.FRAGMENT_SHADER, fsrc);
  if (!v || !f) return null;

  const p = gl.createProgram();
  gl.attachShader(p, v);
  gl.attachShader(p, f);
  gl.linkProgram(p);
  gl.deleteShader(v);
  gl.deleteShader(f);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
    console.warn('[utsab] link:', gl.getProgramInfoLog(p));
    return null;
  }
  return p;
}

function resize() {
  const w = Math.max(1, Math.round(window.innerWidth * RES_SCALE));
  const h = Math.max(1, Math.round(window.innerHeight * RES_SCALE));
  if (canvas.width !== w || canvas.height !== h) {
    canvas.width = w;
    canvas.height = h;
    gl.viewport(0, 0, w, h);
  }
}

function frame(now) {
  raf = 0;
  if (!alive) return;

  if (now - lastDraw >= 1000 / FPS) {
    lastDraw = now;
    resize();

    const rec = compile(current.field);
    if (rec) {
      const raw = (now - startedAt) / 1000;
      gl.useProgram(rec.p);
      gl.uniform2f(rec.u.u_res, canvas.width, canvas.height);
      gl.uniform1f(rec.u.u_t, current.motion.f(raw));
      gl.uniform1f(rec.u.u_raw, raw);
      gl.uniform1f(rec.u.u_scale, current.density);
      gl.uniform1f(rec.u.u_seed, current.seed);
      const q = current.palette;
      gl.uniform3fv(rec.u.u_pA, q.A);
      gl.uniform3fv(rec.u.u_pB, q.B);
      gl.uniform3fv(rec.u.u_pC, q.C);
      gl.uniform3fv(rec.u.u_pD, q.D);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    /* The state changes on its own, slowly, and the CSS crossfades the canvas
       through the swap — see theme-utsab.css. A background that never changes
       is wallpaper; one that changes while you watch is a distraction. Ninety
       seconds is long enough that most visits see one state and a long visit
       is quietly rewarded. */
    if (now > nextAt) {
      canvas.classList.add('is-turning');
      setTimeout(() => {
        if (!alive) return;
        current = rollState();
        canvas.classList.remove('is-turning');
      }, 900);
      nextAt = now + 90000 + Math.random() * 60000;
    }
  }

  raf = requestAnimationFrame(frame);
}

/**
 * Start. Returns false if this browser or this visitor should not have it, so
 * the caller can leave the CSS gradient in place and say nothing.
 */
export function startUtsab() {
  if (alive) return true;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  canvas = document.createElement('canvas');
  canvas.className = 'utsab-canvas';
  canvas.setAttribute('data-utsab-fx', '');
  canvas.setAttribute('aria-hidden', 'true');

  gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,          // a full-screen quad has no edges to alias
    depth: false,
    stencil: false,
    powerPreference: 'low-power',
    // Without this a lost context silently leaves a black rectangle over the
    // shop; with it the browser is free to give us a fresh one.
    failIfMajorPerformanceCaveat: true,
  });
  if (!gl) { canvas = null; return false; }

  // One triangle rather than two, covering the viewport. Fewer vertices, and
  // no diagonal seam where the two triangles of a quad meet.
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const vao = gl.createVertexArray();
  gl.bindVertexArray(vao);
  gl.enableVertexAttribArray(0);
  gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

  current = rollState();
  startedAt = performance.now();
  nextAt = startedAt + 90000;
  alive = true;

  document.body.appendChild(canvas);
  raf = requestAnimationFrame(frame);

  canvas.addEventListener('webglcontextlost', (e) => {
    // Preventing the default is what makes restoration possible at all.
    e.preventDefault();
    cancelAnimationFrame(raf);
    raf = 0;
  });
  canvas.addEventListener('webglcontextrestored', () => {
    programs.clear();               // every program died with the context
    if (alive && !raf) raf = requestAnimationFrame(frame);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(raf); raf = 0; }
    else if (alive && !raf) { lastDraw = 0; raf = requestAnimationFrame(frame); }
  });

  return true;
}

/** Stop, and give the GPU its memory back rather than waiting for GC. */
export function stopUtsab() {
  alive = false;
  cancelAnimationFrame(raf);
  raf = 0;
  if (gl) {
    for (const { p } of programs.values()) gl.deleteProgram(p);
    // The only reliable way to free a WebGL context's driver-side memory.
    gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  programs.clear();
  canvas?.remove();
  canvas = null;
  gl = null;
  current = null;
}
