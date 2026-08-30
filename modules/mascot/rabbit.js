/**
 * rabbit.js — the character, built in code rather than loaded as a model.
 *
 * WHY THERE IS NO .GLB HERE
 * -------------------------
 * A modelled asset would mean a binary in the repo that nobody in this project
 * can open, edit or review, plus a loader, plus a second art pipeline living
 * outside the module folder. Everything below is primitives, a skeleton and
 * arithmetic — so the rabbit is a diff like any other file, and changing the
 * length of an ear is a number, not a round trip through Blender.
 *
 * IT MATCHES THE LOGO ON PURPOSE
 * ------------------------------
 * The GulfRabit mark is a FACETED, low-polygon rabbit: flat plates of colour
 * running cyan at the edges to lime through the middle, tall upright ears with
 * a lighter inner face, and an ice-white ruff at the neck. So this is built
 * low-poly and flat-shaded rather than smooth and cartoonish. A soft, rounded
 * mascot next to that mark would read as a different animal from a different
 * company.
 *
 * THE RIG IS REAL
 * ---------------
 * Bones in a hierarchy, a Skeleton, and a SkinnedMesh whose vertices are
 * weighted to the two nearest bones — not a stack of boxes parented to empties.
 * That is what lets an ear bend along its length and a back arch when the
 * rabbit crouches to jump. The weights are computed here at build time from
 * bone distance, which is the one part a modelling tool would normally do.
 */

/* The mark's own palette, sampled from logo.jpeg rather than guessed. These
   deliberately do NOT come from the CSS custom properties: the brand tokens
   are tuned for text contrast on a white page, and a colour that is correct as
   ink is usually too dark once a light is shining on it. */
const CYAN = [0.10, 0.62, 0.85];   // #1A9ED9 — the ears and the outer plates
const LIME = [0.56, 0.80, 0.25];   // #8FCC40 — the middle of the face and back
const ICE  = [0.88, 0.96, 0.99];   // #E1F5FC — the ruff, the belly, the tail
const NAVY = [0.04, 0.12, 0.17];   // #0A1F2B — eyes

/**
 * Every bone, in bind pose, in world space.
 *
 * Order matters twice over: `parent` is an index into this same list so a
 * parent must precede its child, and the index of each entry becomes the
 * skinIndex written into the geometry.
 *
 * The proportions are a rabbit's, not a person's — the hind legs are the
 * biggest thing on the animal, the spine is short and arched, and the ears are
 * nearly as tall as the body. Getting that wrong is what makes a 3D rabbit
 * read as a mouse.
 */
const SKELETON = [
  { name: 'root',   parent: null, pos: [0, 0, 0] },
  { name: 'hips',   parent: 0,  pos: [0, 0.56, -0.10] },
  { name: 'spine',  parent: 1,  pos: [0, 0.76, -0.01] },
  { name: 'chest',  parent: 2,  pos: [0, 0.95, 0.10] },
  { name: 'neck',   parent: 3,  pos: [0, 1.10, 0.17] },
  { name: 'head',   parent: 4,  pos: [0, 1.28, 0.21] },

  // Two bones per ear, so an ear can curl rather than only tilt. The tip bone
  // is what droops when the rabbit sleeps and flicks when it listens.
  { name: 'earL',    parent: 5, pos: [-0.15, 1.48, 0.13] },
  { name: 'earLTip', parent: 6, pos: [-0.22, 2.05, 0.02] },
  { name: 'earR',    parent: 5, pos: [0.15, 1.48, 0.13] },
  { name: 'earRTip', parent: 8, pos: [0.22, 2.05, 0.02] },

  // Hind legs: thigh, shin, foot. The long foot is the rabbit's spring and the
  // thing that has to flatten on landing.
  { name: 'thighL', parent: 1, pos: [-0.26, 0.50, -0.14] },
  { name: 'shinL',  parent: 10, pos: [-0.28, 0.26, -0.04] },
  { name: 'footL',  parent: 11, pos: [-0.28, 0.07, 0.14] },
  { name: 'thighR', parent: 1, pos: [0.26, 0.50, -0.14] },
  { name: 'shinR',  parent: 13, pos: [0.28, 0.26, -0.04] },
  { name: 'footR',  parent: 14, pos: [0.28, 0.07, 0.14] },

  // Front paws. Small, and mostly they tuck.
  { name: 'armL', parent: 3, pos: [-0.20, 0.86, 0.20] },
  { name: 'pawL', parent: 16, pos: [-0.22, 0.58, 0.26] },
  { name: 'armR', parent: 3, pos: [0.20, 0.86, 0.20] },
  { name: 'pawR', parent: 18, pos: [0.22, 0.58, 0.26] },

  { name: 'tail', parent: 1, pos: [0, 0.70, -0.36] },
];

/**
 * Build the rabbit.
 *
 * @param {object} THREE  the module namespace, passed in rather than imported
 *   so this file has no opinion about where three.js came from and can be
 *   unit-read without resolving a 1.3MB dependency.
 * @returns {{group:object, bones:object, mesh:object, eyes:object[]}}
 */
export function createRabbit(THREE) {
  const group = new THREE.Group();

  /* ---- Bones ---------------------------------------------------------- */

  const bones = [];
  const byName = {};

  SKELETON.forEach((spec, i) => {
    const bone = new THREE.Bone();
    bone.name = spec.name;

    // Three.js bone positions are LOCAL to the parent, but the table above is
    // written in world space because that is the only way a human can read a
    // skeleton and picture it. Subtracting the parent here is the one line
    // that reconciles the two.
    const parent = spec.parent === null ? null : SKELETON[spec.parent];
    bone.position.set(
      spec.pos[0] - (parent ? parent.pos[0] : 0),
      spec.pos[1] - (parent ? parent.pos[1] : 0),
      spec.pos[2] - (parent ? parent.pos[2] : 0),
    );

    if (parent) bones[spec.parent].add(bone);
    bones.push(bone);
    byName[spec.name] = bone;
  });

  /* ---- Skin ----------------------------------------------------------- */

  const parts = bodyParts(THREE);
  const geometry = weld(THREE, parts);
  skinToNearestBones(THREE, geometry, SKELETON);

  const material = new THREE.MeshStandardMaterial({
    vertexColors: true,
    // The whole look. Flat shading gives every triangle one normal, so the
    // sphere primitives underneath read as cut plates of colour exactly like
    // the plates in the logo mark.
    flatShading: true,
    roughness: 0.62,
    metalness: 0.04,
  });

  const mesh = new THREE.SkinnedMesh(geometry, material);
  mesh.castShadow = true;

  // The root bone has to be a descendant of the mesh for the skeleton to be
  // found during traversal; bind() then computes the inverse bind matrices
  // from wherever the bones currently are, which is why nothing may be posed
  // before this line.
  mesh.add(bones[0]);
  mesh.bind(new THREE.Skeleton(bones));
  group.add(mesh);

  /* ---- Eyes ----------------------------------------------------------- */

  /* Not skinned, and not part of the mesh above. An eye is a hard sphere that
     must never deform, and weighting it to the head bone would let a blink or
     a stretch smear it. Parented to the head bone instead, so it follows
     exactly and stays perfectly round. */
  const eyeGeo = new THREE.IcosahedronGeometry(0.062, 1);
  const eyeMat = new THREE.MeshStandardMaterial({
    color: new THREE.Color(...NAVY), roughness: 0.25, flatShading: true,
  });

  const eyes = [-1, 1].map((side) => {
    const eye = new THREE.Mesh(eyeGeo, eyeMat);
    eye.position.set(side * 0.155, 0.045, 0.235);
    byName.head.add(eye);
    return eye;
  });

  // A single specular chip on each eye, facing forward. Cheaper and more
  // controllable than a real highlight, and it is what makes the animal look
  // awake rather than taxidermied.
  const glintMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  eyes.forEach((eye) => {
    const glint = new THREE.Mesh(new THREE.IcosahedronGeometry(0.022, 0), glintMat);
    glint.position.set(0.018, 0.022, 0.05);
    eye.add(glint);
  });

  return { group, bones, byName, mesh, eyes };
}

/* ------------------------------------------------------------------ *
 * Geometry
 * ------------------------------------------------------------------ */

/**
 * Every lump the rabbit is made of, in bind pose.
 *
 * Each part is a low-detail icosahedron scaled into shape. Icosahedra rather
 * than UV spheres because their triangles are near-equilateral and evenly
 * sized, so the flat-shaded facets read as deliberate plates instead of the
 * long thin slivers a sphere leaves at its poles.
 *
 * `tint` is a colour or a function of local position, and it is where the
 * logo's cyan-to-lime blend actually happens.
 */
function bodyParts(THREE) {
  const P = [];

  const add = (geo, [x, y, z], [sx, sy, sz], tint) => {
    geo.scale(sx, sy, sz);
    geo.translate(x, y, z);
    P.push({ geo, tint });
  };

  // Body. Longer than it is wide, tipped so the haunches sit low and the chest
  // rides up — a rabbit at rest is a wedge, not a ball.
  add(new THREE.IcosahedronGeometry(1, 2), [0, 0.74, -0.02], [0.40, 0.40, 0.50], gradient);

  // Chest ruff. The white collar in the mark, and the thing that ties the head
  // to the body instead of leaving it floating.
  add(new THREE.IcosahedronGeometry(1, 1), [0, 1.00, 0.14], [0.30, 0.26, 0.28], ICE);

  // Head, muzzle, cheeks.
  add(new THREE.IcosahedronGeometry(1, 2), [0, 1.30, 0.22], [0.29, 0.28, 0.30], gradient);
  add(new THREE.IcosahedronGeometry(1, 1), [0, 1.22, 0.44], [0.15, 0.13, 0.14], ICE);
  add(new THREE.IcosahedronGeometry(1, 0), [0, 1.25, 0.55], [0.05, 0.04, 0.04], [0.95, 0.55, 0.62]);

  // Ears. Two segments each so the skin has something to bend around, flat in
  // Z so they are blades rather than sausages, with a lighter inner face.
  [-1, 1].forEach((side) => {
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.16, 1.62, 0.10], [0.09, 0.20, 0.05], CYAN);
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.21, 1.94, 0.05], [0.08, 0.20, 0.045], CYAN);
    // The inner face, sitting a hair proud of the blade so it always wins the
    // depth test rather than z-fighting with it.
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.185, 1.78, 0.10], [0.045, 0.30, 0.028], LIME);
  });

  // Haunches — the biggest single volume on a rabbit, and the read that makes
  // it a rabbit at a glance.
  [-1, 1].forEach((side) => {
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.27, 0.52, -0.10], [0.19, 0.22, 0.26], gradient);
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.28, 0.22, -0.02], [0.11, 0.13, 0.14], gradient);
    // The long back foot, flat on the floor.
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.28, 0.07, 0.16], [0.10, 0.06, 0.22], ICE);
  });

  // Front paws, tucked under the chest.
  [-1, 1].forEach((side) => {
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.21, 0.80, 0.20], [0.08, 0.14, 0.09], gradient);
    add(new THREE.IcosahedronGeometry(1, 1), [side * 0.22, 0.58, 0.26], [0.075, 0.07, 0.10], ICE);
  });

  // Tail.
  add(new THREE.IcosahedronGeometry(1, 1), [0, 0.70, -0.40], [0.13, 0.13, 0.11], ICE);

  return P;
}

/**
 * The logo's blend, as a function of where a vertex is.
 *
 * Lime through the centre line and along the top, cyan at the flanks and
 * underneath — which is how the mark is painted, and why the rabbit reads as
 * the same creature from any angle rather than only in silhouette.
 *
 * Flat shading then quantises this across each facet, so what would be a
 * smooth ramp on a smooth mesh becomes the stepped plates of the logo.
 */
function gradient(x, y) {
  // 0 at the flanks, 1 on the centre line.
  const centre = 1 - Math.min(1, Math.abs(x) / 0.42);
  // 0 low on the body, 1 over the back and head.
  const height = clamp01((y - 0.35) / 1.05);

  const t = clamp01(centre * 0.55 + height * 0.62);

  return [
    CYAN[0] + (LIME[0] - CYAN[0]) * t,
    CYAN[1] + (LIME[1] - CYAN[1]) * t,
    CYAN[2] + (LIME[2] - CYAN[2]) * t,
  ];
}

const clamp01 = (n) => Math.max(0, Math.min(1, n));

/**
 * Concatenate the parts into one geometry, colouring as we go.
 *
 * Hand-rolled rather than BufferGeometryUtils.mergeGeometries, which lives in
 * three's examples/ and is therefore not in the module build this vendors.
 * Everything is converted to non-indexed first, which makes the merge a plain
 * array append and gives each triangle its own vertices — required anyway for
 * the per-facet colouring that flat shading implies.
 */
function weld(THREE, parts) {
  const positions = [];
  const colors = [];

  for (const { geo, tint } of parts) {
    const src = geo.index ? geo.toNonIndexed() : geo;
    const pos = src.getAttribute('position');

    for (let i = 0; i < pos.count; i += 1) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);

      positions.push(x, y, z);

      const c = typeof tint === 'function' ? tint(x, y, z) : tint;
      colors.push(c[0], c[1], c[2]);
    }

    // The source geometries are scratch — released here rather than left for
    // the collector, because on a low-end phone this runs while the page is
    // still settling and every megabyte of GPU memory is contended.
    src.dispose();
    if (src !== geo) geo.dispose();
  }

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.computeVertexNormals();

  return geometry;
}

/**
 * Weight every vertex to the two bones nearest it.
 *
 * This is the job a modelling tool would normally do by hand, and doing it by
 * distance is a real simplification — a proper weight paint knows that the
 * left ear should not be influenced by the right one however close they pass.
 * It holds here because the parts are compact and well separated, and because
 * `BIAS` below sharpens the falloff enough that the second bone only matters
 * near a joint, which is exactly where a bend needs to be smooth.
 *
 * Two influences, not four: a stylised character with short limbs has nothing
 * to spend the other two on, and every influence is per-vertex work on a GPU
 * that may be in a very cheap phone.
 */
function skinToNearestBones(THREE, geometry, skeleton) {
  const BIAS = 4;                        // how sharply influence falls off
  const pos = geometry.getAttribute('position');

  const indices = new Uint16Array(pos.count * 4);
  const weights = new Float32Array(pos.count * 4);

  for (let v = 0; v < pos.count; v += 1) {
    const x = pos.getX(v);
    const y = pos.getY(v);
    const z = pos.getZ(v);

    let best = -1, bestD = Infinity;
    let second = -1, secondD = Infinity;

    for (let b = 0; b < skeleton.length; b += 1) {
      // The root sits on the floor between the feet and is nearest to nothing
      // in particular; letting it win would drag whole limbs with the body.
      if (skeleton[b].name === 'root') continue;

      const [bx, by, bz] = skeleton[b].pos;
      const d = (x - bx) ** 2 + (y - by) ** 2 + (z - bz) ** 2;

      if (d < bestD) {
        second = best; secondD = bestD;
        best = b; bestD = d;
      } else if (d < secondD) {
        second = b; secondD = d;
      }
    }

    // Inverse distance, sharpened. The epsilon is not cosmetic: a vertex
    // sitting exactly on a bone is common here, since the parts are built
    // around the same coordinates the bones are, and it would divide by zero.
    const w1 = 1 / (bestD ** (BIAS / 2) + 1e-6);
    const w2 = 1 / (secondD ** (BIAS / 2) + 1e-6);
    const sum = w1 + w2;

    indices[v * 4] = best;
    indices[v * 4 + 1] = second;
    weights[v * 4] = w1 / sum;
    weights[v * 4 + 1] = w2 / sum;
  }

  geometry.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(indices, 4));
  geometry.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weights, 4));
}
