//   ml5.js (version 1.x, loaded in index.html from unpkg.com/ml5@1)
//   Source: https://ml5js.org  ·  https://github.com/ml5js/ml5-next-gen
//   handPose reference. Source: https://docs.ml5js.org/#/reference/handpose
//   The hand model behind handPose is Google MediaPipe Hands.
//   Source: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker

// The webcam = a mirror. Opened in setup(). glamUp() reads it every frame,
// and ml5 watches it to find hands.
let mirror;
// [ML5] The handPose model. It "reads palms": finds hands and 21 points on each.
let palmReader;

// [ML5] The latest hands ml5 found (an array, one item per hand).
// Written by handsSpotted(), read by readPalms() every frame.
let handsUp = [];

// Is the model ready? Before it is, the tip says LOADING.
let palmReaderAwake = false;

// Camera size = canvas size = 640×480.
// ml5 gives hand points in this same 640×480 space, so the camera,
// the hands and the canvas all share the same positions. No converting needed.
const MIRROR_W = 640;
const MIRROR_H = 480;

let rawMe;
let glamMe; // Every pixel recolored.
let portals = [];

// The gradient color for each of the 640 columns, worked out once in setup()
let sunset = [];

// Pixel squares that fly out after a smash:
// { x, y position, vx, vy speed, size, c color, life 1 → 0 }
let glitter = [];

// The frame you are pulling right now, not placed yet:
// { a, b } = the two pinch points. null when not pulling.
let babyPortal = null;

// How many frames (of animation) you have been pulling.
// Too short (≤ 8) doesn't count, so a quick touch won't make a frame.
let stretchTime = 0;

// How many frames since you let go. Hand tracking sometimes misses one frame,
// so you must let go for 4 frames in a row before it counts.
let letGoTimer = 0;

// Smash effects: bigger number = stronger. They shrink a bit every frame.
let earthquake = 0; // screen shake
let paparazzi = 0;  // white flash

// Each hand's "mood" (its state), saved separately for left and right hand.
// Why: ml5 only tells us where the hand is NOW. It doesn't remember the past.
// But to know "still pinching", "how big was the hand last frame",
// or "just made a fist", we need to remember.
const handMood = {};
const HOT_PINK = [255, 20, 200];

// ----- Gesture settings (change these if it feels too easy or too hard) -----
// All distances are divided by "palm size", so the same numbers work
// whether your hand is close to or far from the camera.

// Thumb tip to index tip distance smaller than this → pinching
// (bigger number = easier to pinch)
const PINCH_YES = 0.45;
// Bigger than this → not pinching anymore
const PINCH_NO = 0.65;
// The pinch point must be at least this far from the palm center.
// This tells a pinch apart from a fist
// (pinch: fingertips stick out; fist: fingertips are tucked in).
const FINGERS_OUT = 0.6;
// Finger curl smaller than this = fist
const FIST_MODE = 1.2;
// Finger curl bigger than this = open hand
const HIGH_FIVE = 1.6;
// Frames smaller than this many pixels (width or height) don't count
const TOO_TINY = 40;
// Push power: bigger = the frame moves away faster
const SHOVE_POWER = 4;

// [ML5] Hand bones: which two points to connect with a line.
// The numbers are the 21 handPose (MediaPipe Hands) points:
//   0 wrist
//   1-4 thumb (4 = tip)        5-8 index (8 = tip)
//   9-12 middle (12 = tip)     13-16 ring (16 = tip)
//   17-20 pinky (20 = tip)
// Source: https://docs.ml5js.org/#/reference/handpose
// Source: https://ai.google.dev/edge/mediapipe/solutions/vision/hand_landmarker
const BONES = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];


// ---------------------------------------------------------------------
// 1. Setup: runs once
// ---------------------------------------------------------------------

// Built into p5: runs once at the start.
// "async" lets us use "await" to wait for the ml5 model to load.
async function setup() {
  createCanvas(MIRROR_W, MIRROR_H); // same size as the camera (index.html centers it)

  // Two 640×480 images: raw me and glam me.
  // pixelDensity(1) keeps the pixel array exactly 640×480,
  // even on Retina screens, so the pixel math stays simple.
  rawMe = createGraphics(MIRROR_W, MIRROR_H);
  rawMe.pixelDensity(1);
  glamMe = createImage(MIRROR_W, MIRROR_H);

  // Gradient from left to right: purple → pink (at 40%) → yellow.
  // It only changes from left to right, so work out the 640 column colors once here.
  const PURPLE = color(45, 8, 120);
  const PINK = color(255, 75, 230);
  const YELLOW = color(255, 245, 45);
  for (let x = 0; x < MIRROR_W; x++) {
    const u = x / MIRROR_W; // 0 left → 1 right
    const c = u < 0.4 ? lerpColor(PURPLE, PINK, u / 0.4) : lerpColor(PINK, YELLOW, (u - 0.4) / 0.6);
    sunset[x] = [red(c), green(c), blue(c)];
  }

  // Open the webcam and ask for 640×480 (4:3).
  // Otherwise a Mac usually gives 16:9, which gets squished to 4:3,
  // and squished hands are harder to track.
  // flipped: true = mirror image, like looking in a mirror.
  mirror = createCapture(
    { video: { width: { ideal: MIRROR_W }, height: { ideal: MIRROR_H } }, audio: false },
    { flipped: true }
  );
  mirror.size(MIRROR_W, MIRROR_H);
  mirror.hide(); // hide the default <video> on the page; we draw it ourselves

  // [ML5] Load the handPose model.
  // flipped: true → hand points are mirrored too, so they match the image
  // maxHands: 2   → find up to two hands (drawing a frame needs two)
  // await = wait until the model is loaded
  // Source: https://docs.ml5js.org/#/reference/handpose  (ml5.handPose(options))
  palmReader = await ml5.handPose({ flipped: true, maxHands: 2 });

  // Wait for the first camera frame before tracking.
  // If the model is ready before the camera, ml5's first try fails
  // and tracking stops for good.
  await waitForMirror();

  // [ML5] Start tracking. ml5 keeps watching the mirror,
  // and calls handsSpotted(results) every time it finishes.
  // Source: https://docs.ml5js.org/#/reference/handpose  (detectStart(media, callback))
  palmReader.detectStart(mirror, handsSpotted);
  palmReaderAwake = true;
}

// Returns a Promise that finishes when the camera has a picture.
// setup() uses "await" to wait for it.
// readyState >= 2 means the camera already has at least one frame.
// If not, wait for the browser's "loadeddata" event (first frame arrived).
function waitForMirror() {
  return new Promise((resolve) => {
    if (mirror.elt.readyState >= 2) resolve();
    else mirror.elt.addEventListener("loadeddata", resolve, { once: true });
  });
}


// ---------------------------------------------------------------------
// 2. Talking to ml5
// ---------------------------------------------------------------------

// [ML5] The callback for detectStart: ml5 calls it every time it finishes.
// results is an array, one item per hand, with:
//   keypoints  → 21 points, each with x, y (in the 640×480 space)
//   handedness → "Left" or "Right"
// Source: https://docs.ml5js.org/#/reference/handpose
function handsSpotted(results) {
  handsUp = calmShakyHands(results, handsUp);
}

// Stop the hands from shaking: each point doesn't jump straight to its new
// place, it moves 55% of the way from its old place.
// Only compares the same hand (left with left, right with right).
// fresh = hands from ml5 now, previous = hands we saved last time
function calmShakyHands(fresh, previous) {
  return fresh.map((h) => {
    const p = previous.find((q) => q.handedness === h.handedness);
    if (!p) return h; // this hand is new, nothing to compare with
    const keypoints = h.keypoints.map((k, i) => ({
      x: lerp(p.keypoints[i].x, k.x, 0.55),
      y: lerp(p.keypoints[i].y, k.y, 0.55)
    }));
    return { ...h, keypoints }; // copy everything else, replace only the points
  });
}


// ---------------------------------------------------------------------
// 3. Every frame: draw()
// ---------------------------------------------------------------------

// Built into p5: runs about 60 times per second.
// Order matters: things drawn later sit on top.
function draw() {
  const camOK = glamUp(); // recolor this frame (false if the camera has no picture yet)

  background(0);

  // Everything between push and pop shakes together (smash shake).
  // The skeleton and tip are drawn after pop, so they stay still and readable.
  push();
  if (earthquake > 0.5) translate(random(-earthquake, earthquake), random(-earthquake, earthquake));

  // ① Background: raw me
  if (camOK) image(rawMe, 0, 0);

  // ② Read hands → decide to draw, push, or smash a frame
  const info = readPalms();
  pinchAndStretch(info);
  pushOrPunch(info);

  // ③ Placed frames: update first (move away, fade), then draw
  for (const f of portals) {
    agePortal(f);
    drawPortal(f);
  }
  portals = portals.filter((f) => !f.dead); // remove frames that are gone or smashed

  drawBabyPortal(); // the frame being pulled (dashed preview), on top of placed frames

  // ④ Pixel squares from a smash
  fallGlitter();

  pop();

  // ⑤ Top layer: hand skeleton + tip at the bottom
  drawBones(info);
  drawBossyTip();

  // Smash white flash: a white layer, opacity = paparazzi
  if (paparazzi > 1) {
    noStroke();
    fill(255, paparazzi);
    rect(0, 0, width, height);
  }

  // Effects fade a little every frame, then disappear
  earthquake *= 0.85;
  paparazzi *= 0.8;
}


// ---------------------------------------------------------------------
// 4. Pixel array: give the image a glam look (the assignment's pixel array part)
// ---------------------------------------------------------------------

// Read every pixel of rawMe, recolor it by brightness, and write it into glamMe.
// Bright → gradient color. Dark → almost black. Looks like a colorful silhouette.
function glamUp() {
  if (mirror.elt.readyState < 2) return false; // camera has no picture yet

  // Draw the camera onto rawMe first.
  // We can't read the camera's pixels directly: the "flipped" mirror effect
  // only happens when it's drawn. Drawing it with image() gives mirrored pixels.
  rawMe.image(mirror, 0, 0, MIRROR_W, MIRROR_H);
  rawMe.loadPixels();
  glamMe.loadPixels();

  const src = rawMe.pixels; // read: raw me
  const out = glamMe.pixels; // write: glam me

  for (let y = 0; y < MIRROR_H; y++) {
    for (let x = 0; x < MIRROR_W; x++) {
      // The pixel array is one long list. Each pixel uses 4 spots: R, G, B, A.
      // So pixel (x, y) starts at spot (x + y × width) × 4.
      const i = (x + y * MIRROR_W) * 4;

      // Brightness = average of R, G, B (0 black ~ 255 white)
      const brightness = (src[i] + src[i + 1] + src[i + 2]) / 3;
      // Turn brightness into a multiplier from 0.15 to 1:
      //   brightness ≤ 90 → 0.15 (almost black), ≥ 130 → 1 (full color),
      //   smooth in between
      const k = constrain((brightness - 90) / 40, 0, 1) * 0.85 + 0.15;

      // This column's gradient color × brightness multiplier
      const c = sunset[x];
      out[i] = c[0] * k;
      out[i + 1] = c[1] * k;
      out[i + 2] = c[2] * k;
      out[i + 3] = 255; // fully visible
    }
  }

  glamMe.updatePixels(); // write the numbers back so the image really changes
  return true;
}


// ---------------------------------------------------------------------
// 5. Read hands: turn ml5's raw data into easy-to-use info
// ---------------------------------------------------------------------

// Called once per frame in draw().
// In:  handsUp (ml5 results)
// Out: an array with one "card" h per hand, used by pinchAndStretch,
//      pushOrPunch and drawBones:
//   h.k        21 points (x, y on the canvas)
//   h.size     palm size
//   h.curl     how curled the fingers are
//   h.palm     palm center
//   h.st       this hand's mood (its entry in handMood)
//   h.pinching is it pinching? (true / false)
//   h.pinchPt  middle point between thumb tip and index tip = frame corner
function readPalms() {
  const seen = []; // which hands showed up this frame (to clean up the rest)

  const out = handsUp.map((h) => {
    // [ML5] Use handedness ("Left" / "Right") as the hand's name,
    // so every frame we find the same hand's mood in handMood.
    const id = h.handedness;
    seen.push(id);

    // [ML5] the 21 keypoints. They are already in canvas positions
    // (canvas and camera are both 640×480), so we can use them directly.
    const k = h.keypoints;

    // Palm size = distance from wrist (0) to middle finger base (9).
    // Closer to the camera = bigger number. Pushing uses this.
    // max(…, 1) avoids dividing by 0 later.
    const size = max(dist(k[0].x, k[0].y, k[9].x, k[9].y), 1);

    // Curl = average distance from 4 fingertips (8, 12, 16, 20) to the wrist,
    // divided by palm size. Open hand ≈ 1.9, fist ≈ 1.0.
    let sum = 0;
    for (const t of [8, 12, 16, 20]) sum += dist(k[t].x, k[t].y, k[0].x, k[0].y);
    const curl = sum / 4 / size;

    // Palm center = average of the wrist and the 4 finger bases (0, 5, 9, 13, 17).
    // Used to check if the palm is over a frame.
    const palm = {
      x: (k[0].x + k[5].x + k[9].x + k[13].x + k[17].x) / 5,
      y: (k[0].y + k[5].y + k[9].y + k[13].y + k[17].y) / 5
    };

    // First time we see this hand: give it a mood.
    //   pinching   is it pinching now?
    //   pushFrame  which frame it's pushing (null = none)
    //   lastSize   palm size last frame (to see if the hand is moving closer)
    //   fistArmed  can it smash? (after a smash, open your hand before
    //              smashing again, so one fist can't smash many frames)
    //   fistCount  how many frames in a row it's been a fist
    if (!handMood[id]) {
      handMood[id] = { pinching: false, pushFrame: null, lastSize: size, fistArmed: true, fistCount: 0 };
    }
    const st = handMood[id];

    // [ML5] 4 = thumb tip, 8 = index tip. The middle point is the frame corner.
    const pinchPt = { x: (k[4].x + k[8].x) / 2, y: (k[4].y + k[8].y) / 2 };

    // Is it pinching?
    //   pinchDist = distance between the two tips (÷ palm size) → small = pinch
    //   reach     = distance from pinch point to palm center → too small = fist
    // Not pinching yet → check PINCH_YES. Already pinching → check PINCH_NO.
    const pinchDist = dist(k[4].x, k[4].y, k[8].x, k[8].y) / size;
    const reach = dist(pinchPt.x, pinchPt.y, palm.x, palm.y) / size;
    if (st.pinching) {
      if (pinchDist > PINCH_NO || reach < FINGERS_OUT - 0.15) st.pinching = false;
    } else if (pinchDist < PINCH_YES && reach > FINGERS_OUT) {
      st.pinching = true;
    }

    return { k, size, curl, palm, st, pinching: st.pinching, pinchPt };
  });

  // Hands that didn't show up this frame (e.g. moved out of view):
  // forget their mood, so when they come back they start fresh.
  for (const id in handMood) {
    if (!seen.includes(id)) delete handMood[id];
  }

  return out;
}


// ---------------------------------------------------------------------
// 6. 🤏🤏 Draw a frame with two hands
// ---------------------------------------------------------------------

// Called every frame in draw(). info comes from readPalms().
// Both hands pinching → update babyPortal (dashed preview)
// Let go            → birthPortal() turns it into a real frame
function pinchAndStretch(info) {
  // Keep only pinching hands, sorted left to right.
  // Without sorting, ml5 may swap the hand order between frames
  // and the corners would jump back and forth.
  const p = info.filter((h) => h.pinching).sort((a, b) => a.pinchPt.x - b.pinchPt.x);

  if (p.length >= 2) {
    // The two corners are right on the pinch points
    // (the hands are already smoothed by calmShakyHands, so no extra smoothing)
    babyPortal = { a: p[0].pinchPt, b: p[1].pinchPt };
    stretchTime++;
    letGoTimer = 0;
  } else if (babyPortal) {
    // Not both pinching anymore, but we were pulling → maybe you let go.
    // Only count it after 4 frames in a row (tracking can blink for a frame).
    letGoTimer++;
    if (letGoTimer >= 4) {
      if (stretchTime > 8) birthPortal(babyPortalBox()); // only if you pulled long enough
      babyPortal = null;
      stretchTime = 0;
      letGoTimer = 0;
    }
  }
}

// Turn the two corners a and b into a rectangle { x, y, w, h }.
// min and abs are needed because hands can cross or be one above the other,
// so "a" is not always the top-left corner.
function babyPortalBox() {
  const { a, b } = babyPortal;
  return { x: min(a.x, b.x), y: min(a.y, b.y), w: abs(b.x - a.x), h: abs(b.y - a.y) };
}

// A frame is born: skip it if it's too small, otherwise add it to portals.
// depth / shown start at 0 (not pushed), fade starts at 1 (fully visible).
function birthPortal(r) {
  if (r.w < TOO_TINY || r.h < TOO_TINY) return;
  portals.push({ ...r, depth: 0, shown: 0, fade: 1, hover: 0 });
}


// ---------------------------------------------------------------------
// 7. ✋ Push / ✊ Smash (one hand)
// ---------------------------------------------------------------------

// Called every frame in draw(). Checks each hand on its own.
function pushOrPunch(info) {
  for (const h of info) {
    const st = h.st;

    // How much bigger the palm got since last frame (0.02 = 2% bigger).
    // A hand moving toward the camera gets bigger.
    const grow = h.size / st.lastSize - 1;
    st.lastSize = h.size;

    // Pulling a frame, or this hand is pinching: no push or smash
    // (otherwise you could smash by accident while drawing)
    if (babyPortal || h.pinching) {
      st.pushFrame = null;
      st.fistCount = 0;
      continue; // skip this hand, check the next one
    }

    // Which frame is under the palm (null = none). That frame's border gets thicker.
    const target = portalUnder(h.palm.x, h.palm.y);
    if (target) target.hover = 1;

    // ✊ Smash: a fist for 3 frames in a row (to avoid mistakes)
    // while the palm is over a frame
    if (h.curl < FIST_MODE) {
      st.fistCount++;
      if (st.fistArmed && st.fistCount >= 3 && target) {
        smash(target, h.palm);
        st.fistArmed = false; // "lock" after smashing
      }
    } else {
      st.fistCount = 0;
      if (h.curl > 1.4) st.fistArmed = true; // hand opened a bit → "unlock"
    }

    // ✋ Push: open palm over a frame → lock onto that frame.
    // Every frame the palm gets bigger (moves closer), the frame moves away.
    // Growth under 1% is ignored, so small tracking shakes don't push it.
    // Moving the hand back does nothing, so you can push again and again.
    if (h.curl > HIGH_FIVE) {
      if (!st.pushFrame || st.pushFrame.dead) st.pushFrame = target;
      else if (grow > 0.01) st.pushFrame.depth += grow * SHOVE_POWER;
      if (st.pushFrame) st.pushFrame.hover = 1;
    } else {
      st.pushFrame = null; // hand not open anymore → stop pushing
    }
  }
}


// ---------------------------------------------------------------------
// 8. Frames: position, update, draw
// ---------------------------------------------------------------------

// Work out where a frame is on the canvas right now.
// When pushed away: it gets smaller (s goes down) and slides a bit toward
// the canvas center, so it looks like it's really moving back.
// pushOrPunch, portalUnder, drawPortal and smash all use this.
function whereIsPortal(f) {
  const s = 1 / (1 + f.shown); // shown = 0 → full size; bigger → smaller
  const cx = lerp(f.x + f.w / 2, width / 2, (1 - s) * 0.5);
  const cy = lerp(f.y + f.h / 2, height / 2, (1 - s) * 0.5);
  const w = f.w * s;
  const h = f.h * s;
  return { x: cx - w / 2, y: cy - h / 2, w, h, s };
}

// Find the frame under point (x, y).
// Start from the last one, because newer frames are drawn on top.
// Skip frames that are being deleted or fading out.
function portalUnder(x, y) {
  for (let i = portals.length - 1; i >= 0; i--) {
    const f = portals[i];
    if (f.dead || f.fade < 1) continue;
    const r = whereIsPortal(f);
    if (x > r.x && x < r.x + r.w && y > r.y && y < r.y + r.h) return f;
  }
  return null;
}

// Update one frame every frame
function agePortal(f) {
  // shown slowly catches up with depth, so the frame slides instead of jumping
  f.shown = lerp(f.shown, f.depth, 0.15);
  // The thick border slowly goes back to normal
  // (if a palm stays on it, pushOrPunch sets it to 1 again every frame)
  f.hover *= 0.8;
  // Pushed down to 15% of its size → start fading. Fully gone → mark to delete.
  if (1 / (1 + f.shown) < 0.15) f.fade -= 0.05;
  if (f.fade <= 0) f.dead = true;
}

// Show the part of glam me that sits inside rectangle r.
// image() with 9 numbers = take the r part of glamMe and draw it at the same r
// on the canvas, so it lines up perfectly with the background.
function showGlam(r) {
  image(glamMe, r.x, r.y, r.w, r.h, r.x, r.y, r.w, r.h);
}

// Draw a frame: glam me inside, pink border around
function drawPortal(f) {
  const r = whereIsPortal(f);
  push();
  tint(255, 255 * f.fade); // the picture fades with the frame
  showGlam(r);
  noFill();
  stroke(HOT_PINK[0], HOT_PINK[1], HOT_PINK[2], 255 * f.fade);
  strokeWeight(2 + f.hover * 3); // thicker when a palm is on it
  rect(r.x, r.y, r.w, r.h);
  pop();
}

// Draw the frame being pulled: same as drawPortal,
// but with a dashed border to show it's not placed yet
function drawBabyPortal() {
  if (!babyPortal) return;
  const r = babyPortalBox();
  push();
  showGlam(r);
  noFill();
  stroke(HOT_PINK);
  strokeWeight(2);
  drawingContext.setLineDash([10, 8]); // dashed line: 10 px on, 8 px off (pop turns it off)
  rect(r.x, r.y, r.w, r.h);
  pop();
}


// ---------------------------------------------------------------------
// 9. Smash: the frame bursts into colorful pixel squares
// ---------------------------------------------------------------------

// Called by pushOrPunch(). f = the frame, impact = where the fist (palm) is
function smash(f, impact) {
  const r = whereIsPortal(f);
  for (let n = 0; n < 80; n++) {
    // Pick a random point inside the frame; a square flies out from here
    const x = random(r.x, r.x + r.w);
    const y = random(r.y, r.y + r.h);
    // Square color = glam me's color at this point
    const c = glamMe.get(floor(x), floor(y));
    // Direction = from the fist to this point → it bursts out from the fist
    const angle = atan2(y - impact.y, x - impact.x);
    const speed = random(4, 14);
    glitter.push({ x, y, vx: cos(angle) * speed, vy: sin(angle) * speed - 4, size: random(8, 24), c, life: 1 });
  }
  f.dead = true;   // remove the frame, keep only the squares
  earthquake = 16; // shake the screen
  paparazzi = 110; // white flash
}

// Every frame: move, draw, and remove squares that are out of life
function fallGlitter() {
  noStroke();
  for (const s of glitter) {
    s.x += s.vx;
    s.y += s.vy;
    s.vy += 0.5;      // gravity
    s.life -= 0.015;  // gone in about 1 second
    const d = s.size * s.life; // older = smaller
    fill(s.c[0], s.c[1], s.c[2], 255 * s.life); // older = more see-through
    rect(s.x - d / 2, s.y - d / 2, d, d);
  }
  glitter = glitter.filter((s) => s.life > 0);
}


// ---------------------------------------------------------------------
// 10. Top layer: hand skeleton + tip
// ---------------------------------------------------------------------

// [ML5] Draw the 21 handPose points as a skeleton.
// See BONES at the top for the point numbers.
// Source: https://docs.ml5js.org/#/reference/handpose
function drawBones(info) {
  const ctx = drawingContext;
  push();
  for (const h of info) {
    const k = h.k;

    // Bones in two layers:
    // a thick glowing pink line (shadowBlur), then a thin white line on top
    // → easy to see on both bright and dark backgrounds
    ctx.shadowColor = `rgb(${HOT_PINK[0]},${HOT_PINK[1]},${HOT_PINK[2]})`;
    ctx.shadowBlur = 18;
    stroke(HOT_PINK);
    strokeWeight(7);
    for (const [a, b] of BONES) line(k[a].x, k[a].y, k[b].x, k[b].y);
    ctx.shadowBlur = 0; // turn off glow, or everything after will glow too

    stroke(255);
    strokeWeight(2.5);
    for (const [a, b] of BONES) line(k[a].x, k[a].y, k[b].x, k[b].y);

    // Joints: black center + pink ring.
    // Fingertips are 4, 8, 12, 16, 20 (every 4th point) → draw them bigger.
    stroke(HOT_PINK);
    strokeWeight(3);
    fill(0);
    for (let i = 0; i < k.length; i++) {
      circle(k[i].x, k[i].y, i > 0 && i % 4 === 0 ? 14 : 9);
    }

    // Pinching: a glowing dot between thumb and index
    // → shows "you're pinching" and where the frame corner is
    if (h.pinching) {
      ctx.shadowColor = "white";
      ctx.shadowBlur = 20;
      noStroke();
      fill(255);
      circle(h.pinchPt.x, h.pinchPt.y, 22);
      fill(HOT_PINK);
      circle(h.pinchPt.x, h.pinchPt.y, 12);
      ctx.shadowBlur = 0;
    }
  }
  pop();
}

// The tip pill at the bottom: tells people what to do right now
function drawBossyTip() {
  let msg;
  if (!palmReaderAwake) msg = "LOADING HAND MODEL…";       // ml5 still loading
  else if (babyPortal) msg = "RELEASE TO PLACE THE FRAME"; // pulling a frame
  else msg = "🤏 🤏 DRAW   ·   ✋ PUSH AWAY   ·   ✊ SMASH";   // normal

  push();
  textFont("Helvetica Neue, Helvetica, Arial, sans-serif");
  textSize(14);
  textStyle(BOLD);
  // Pill width follows the text length, with 20 px on each side
  const tw = textWidth(msg) + 40;
  const x = width / 2 - tw / 2;
  const y = height - 56;

  noStroke();
  fill(0, 160);               // see-through black, so white text is readable anywhere
  rect(x, y, tw, 34, 17);     // corner radius 17 = half the height → pill shape
  fill(255);
  textAlign(CENTER, CENTER);
  text(msg, width / 2, y + 17);
  pop();
}


// ---------------------------------------------------------------------
// 11. Keyboard
// ---------------------------------------------------------------------

// Built into p5: runs when a key is pressed. Press C to clear all frames.
function keyPressed() {
  if (key === "c" || key === "C") portals = [];
}
