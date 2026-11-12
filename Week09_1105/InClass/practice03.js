
let handPose;
let video;
let hands = [];

// 摄像头原始分辨率（手部关键点就是在这个坐标系里算出来的）
const VW = 640;
const VH = 480;

// 画布尺寸 = 浏览器窗口尺寸（在 setup / windowResized 里更新）
let W;
let H;

// 摄像头画面铺满画布用的缩放和偏移（类似 CSS 的 object-fit: cover）
let camScale = 1;
let camOffsetX = 0;
let camOffsetY = 0;

let typeLayer;
let uiLayer;   // 界面文字层（2D）
let cameraLayer;

// ---------- LYRICS ----------

// 每个 scene = 一句歌词，按语气停顿切成几段短语（words）：
// 拉一次 → 出现下一段；一句唱完再拉一次 → 跳到下一句
// 想改断句，直接改 words 数组就行（lyric 只是备注完整原句）
// 规则：每段最多 5 个单词
const scenes = [
  {
    words: ["SO TIRED OF", "THE TEXTS", "ON MY PHONE", "WON’T YOU", "JUST", "LEAVE ME ALONE?"],
    lyric: "So tired of, the texts, on my phone, won’t you just, leave me alone?"
  },
  // {
  //   words: ["BOY JUST SHUT UP", "MY DAY IS BOOKED", "CUS’ YOU JUST CALL ME", "EVERY MINUTE"],
  //   lyric: "Boy just shut up, my day is booked, cus’ you just call me every minute"
  // },
  {
    words: ["SMALL TALK", "SUCKS", "INSTANTLY", "KILLS MY CRUSH", "IF YOU CAN'T", "MATCH MY MIND", "YOU’RE OUTTA LUCK"],
    lyric: "Small talk, sucks, instantly, kills my crush, if you can't, match my mind boy you’re outta luck"
  }
];

let scene = 0;
let stage = 0;  // 当前 scene 里显示到第几个词

// 弹出动画：换词时设为 1，之后每帧衰减到 0
let popAmount = 0;

// ---------- INTERACTION ----------

let bothWerePinching = false;
let startDistance = 0;
let maxPull = 0;

let stretch = 0;
let targetStretch = 0;

let lastChange = 0;
let flash = 0;

let currentGesture = null;

// ---------- VISUAL SETTINGS ----------

// Increase for stronger fisheye
let fishStrength = 0.86;

// How far hands must pull before next lyric
let pullThreshold = 85;

// Webcam visibility: 0-255
let cameraOpacity = 255;

// 背景上盖的黑色遮罩透明度：越大越暗、歌词越清楚；0 = 配色最鲜艳
let overlayAlpha = 40;

// ---------- PALETTE ----------
// 视觉层级：背景 = 氛围（暗）→ 中间那行字 = 焦点（最亮）→ 手 = 细线 + 一个强调色
const INK = [18, 8, 24];          // 深紫黑：背景暗部
// 手部骨架的霓虹色。想换颜色改这里：
// 电光青 [0, 255, 230]（默认，和粉紫黄背景反差最大）
// 荧光绿 [57, 255, 20]   荧光橙 [255, 110, 0]   电光蓝 [40, 120, 255]   荧光粉 [255, 20, 200]
const NEON = [255, 20, 200];
const JOINT_CORE = 0.6;           // 关节黑芯占关节的比例（0~1）：越大黑芯越大、外面的霓虹圈越细
const ACCENT = NEON;              // 能互动的东西（捏合圈、拉伸线、提示进度条）和骨架用同一种霓虹色

// 背景渐变（从左到右）。pos = 在屏幕上的位置（0 左 → 1 右），color = 亮部显示的颜色
// 想让渐变更宽/更窄：改 pos；想换颜色：改 color；也可以再加一个色标
// 渲染清晰度：Retina 屏是 2。最多用到 2，太高会掉帧
// 觉得卡可以改成 1（会变糊，但更流畅）
const RENDER_DENSITY = Math.min(window.devicePixelRatio || 1, 2);

// 文字层的清晰度。鱼眼会把中间的字放大约 1.3 倍，所以文字层密度越高越锐利：
// 测试里 2 → 字边缘模糊约 1px，3 → 约 0.65px。
// 但 3 意味着每帧要往显卡传更大的图，全屏时可能掉帧，觉得够流畅可以试试改成 3
const TEXT_DENSITY = RENDER_DENSITY;

// ---------- 文字投影 ----------
const SHADOW_OPACITY = 0.6;   // 阴影深浅 0~1
const SHADOW_OFFSET = 0.008;  // 阴影往右下偏移多少（占屏幕高度的比例）
const SHADOW_BLUR = 0.02;     // 阴影模糊程度（占屏幕高度的比例），0 = 硬边阴影

const GRADIENT_STOPS = [
  { pos: 0.0,  color: [45, 8, 120] },    // 深紫
  { pos: 0.4,  color: [255, 75, 230] },  // 洋红粉（原来最左边的颜色）
  { pos: 1.0,  color: [255, 245, 45] }   // 黄
];
const GHOST_ALPHA = 45;           // 中间以外几行字的透明度

// Show 21 landmarks and hand skeleton
let showHandTracking = true;

// ---------- SETUP ----------

async function setup() {
  W = windowWidth;
  H = windowHeight;

  createCanvas(W, H, WEBGL);
  // 按屏幕真实像素密度渲染（Retina = 2），否则只用一半分辨率再拉伸 → 字边缘发糊
  pixelDensity(RENDER_DENSITY);

  setupLayers();

  // 直接向摄像头要 640x480（4:3）的画面。
  // 不指定的话 Mac 摄像头通常给 1280x720（16:9），
  // 再被 video.size(640, 480) 硬挤成 4:3 → 手被压扁，识别变差
  video = createCapture(
    {
      video: { width: { ideal: VW }, height: { ideal: VH } },
      audio: false
    },
    { flipped: true }
  );

  video.size(VW, VH);
  video.hide();

  handPose = await ml5.handPose({
    flipped: true,
    maxHands: 2
  });

  // 等摄像头真正出第一帧再开始识别。
  // 模型比摄像头先准备好时，ml5 第一次识别会报错，整个识别循环直接停掉 → 骨架永远不出现
  await waitForCamera();

  handPose.detectStart(video, gotHands);
}

function waitForCamera() {
  return new Promise((resolve) => {
    if (video.elt.readyState >= 2) {
      resolve();
    } else {
      video.elt.addEventListener("loadeddata", resolve, { once: true });
    }
  });
}

// 看门狗：识别循环如果中途因为报错停掉了（超过 2 秒没有回调），就重启它
let lastDetectTime = 0;

function keepDetecting() {
  if (!handPose || !handPose.model) return;
  if (video.elt.readyState < 2) return;
  if (millis() - lastDetectTime < 2000) return;

  lastDetectTime = millis(); // 避免每帧都重启
  handPose.detecting = false;
  handPose.signalStop = false;
  handPose.detectStart(video, gotHands);
}

// 按当前画布尺寸创建图层，并计算摄像头的缩放和偏移
function setupLayers() {
  if (typeLayer) typeLayer.remove();
  if (uiLayer) uiLayer.remove();
  uiLayer = createGraphics(W, H);
  uiLayer.pixelDensity(RENDER_DENSITY);

  typeLayer = createGraphics(W, H);
  // 文字层会被鱼眼放大，用和屏幕一样的密度才不糊
  typeLayer.pixelDensity(TEXT_DENSITY);
  typeLayer.textAlign(CENTER, CENTER);
  typeLayer.textFont("Arial Black");
  typeLayer.textStyle(BOLD);

  // 摄像头图层保持 640x480，灰度滤镜在小图上算，速度快很多；
  // 画到主画布时再放大到全屏
  if (!cameraLayer) {
    cameraLayer = createGraphics(VW, VH);
    cameraLayer.pixelDensity(1);
  }

  // cover：等比放大到刚好盖满画布，多出来的部分居中裁掉
  camScale = max(W / VW, H / VH);
  camOffsetX = (W - VW * camScale) / 2;
  camOffsetY = (H - VH * camScale) / 2;
}

// 窗口大小变化时，画布和图层跟着变
function windowResized() {
  // 窗口被最小化等情况下尺寸可能是 0，跳过
  if (windowWidth === 0 || windowHeight === 0) return;

  W = windowWidth;
  H = windowHeight;

  // 先重建图层，再 resizeCanvas（resizeCanvas 会立刻重画一帧，要用新图层）
  setupLayers();
  resizeCanvas(W, H);
}

function gotHands(results) {
  lastDetectTime = millis();

  // 关键点原本是 640x480 摄像头坐标，转换成全屏画布坐标，
  // 这样后面所有画手、算捏合的代码都不用改
  const fresh = results.map((hand) => ({
    ...hand,
    keypoints: hand.keypoints.map((k) => ({
      ...k,
      x: k.x * camScale + camOffsetX,
      y: k.y * camScale + camOffsetY
    }))
  }));

  hands = smoothHands(fresh, hands);
}

// ---------- 关键点平滑 ----------
// 0~1：越小越稳但跟手越慢，越大越跟手但越抖
let smoothing = 0.5;

// 把这一帧的每只手和上一帧"同一只手"做混合，减少抖动。
// 两只手的顺序每帧可能互换，所以用手腕位置找最近的那只来配对
function smoothHands(fresh, previous) {
  const used = new Set();

  return fresh.map((hand) => {
    const wrist = hand.keypoints[0];

    // 找上一帧里手腕离得最近、还没被配对的手
    let match = null;
    let best = 150 * camScale; // 超过这个距离就当成是新出现的手
    previous.forEach((prev, idx) => {
      if (used.has(idx)) return;
      const d = dist(wrist.x, wrist.y, prev.keypoints[0].x, prev.keypoints[0].y);
      if (d < best) {
        best = d;
        match = idx;
      }
    });

    if (match === null) return hand; // 新出现的手：直接用
    used.add(match);

    const prevK = previous[match].keypoints;
    return {
      ...hand,
      keypoints: hand.keypoints.map((k, i) => ({
        ...k,
        x: lerp(prevK[i].x, k.x, smoothing),
        y: lerp(prevK[i].y, k.y, smoothing)
      }))
    };
  });
}

// ---------- DRAW ----------

function draw() {
  background(0);

  keepDetecting();

  // 每页的交互：默认双手拉伸；PAGE_GESTURES 里列出的页面用单手手势
  const mode = currentMode();

  if (mode === "pull" && !exitAnim) {
    currentGesture = getTwoHandPinch();
    updateStretch(currentGesture);
  } else {
    // 手势页：关掉捏合/拉伸，让拉伸效果自然回弹
    currentGesture = { active: false, points: [], distance: 0 };
    updateStretch(currentGesture);
    updateGesture(mode);
  }

  // 1. Camera background
  drawCameraBackground();

  // 2. Repeated typography texture
  drawTypography();

  // 3. Fisheye distortion
  drawFisheye();

  // 4. Visible hand tracking
  if (showHandTracking) {
    drawHandTracking();
  }

  // 5. Interface
  drawInterface(currentGesture);

  flash *= 0.85;
  popAmount *= 0.86;
}

// ==================================
// CAMERA BACKGROUND
// ==================================

function drawCameraBackground() {
  cameraLayer.clear();

  cameraLayer.image(video, 0, 0, VW, VH);

  // 把摄像头画面换成粉橙渐变配色（替代原来的 filter(GRAY)）
  applyPinkPalette();

  push();

  translate(-W / 2, -H / 2);

  tint(255, cameraOpacity);

  // 等比放大铺满全屏（cover）
  image(
    cameraLayer,
    camOffsetX,
    camOffsetY,
    VW * camScale,
    VH * camScale
  );

  noTint();

  pop();

  // Dark overlay keeps lyrics readable
  push();

  translate(-W / 2, -H / 2);

  noStroke();
  fill(0, overlayAlpha);
  rect(0, 0, W, H);

  pop();
}

// 逐像素上色：亮的地方显示粉橙渐变，暗的地方压成接近黑色
// 配色来自四宫格代码里的 BOX 4
function applyPinkPalette() {
  cameraLayer.loadPixels();
  const px = cameraLayer.pixels;
  if (px.length === 0) return;

  // 渐变只跟横向位置有关 → 每一列的颜色先算好（640 次），
  // 不用每个像素都算一遍（30 万次）
  const colR = new Array(VW);
  const colG = new Array(VW);
  const colB = new Array(VW);

  for (let x = 0; x < VW; x++) {
    // u = 这一列在屏幕上的横向位置（0 左 → 1 右），
    // 按屏幕算，这样渐变横跨整个全屏而不是被裁剪
    const u = constrain((x * camScale + camOffsetX) / W, 0, 1);
    const c = gradientColor(u);
    colR[x] = c[0];
    colG[x] = c[1];
    colB[x] = c[2];
  }

  for (let y = 0; y < VH; y++) {
    for (let x = 0; x < VW; x++) {
      const i = (x + y * VW) * 4;

      // 摄像头亮度 → 高对比：亮部 = 渐变原色，暗部 ×0.15（接近黑）
      const brightness = (px[i] + px[i + 1] + px[i + 2]) / 3;
      const contrast = brightness > 110 ? 1 : 0.15;

      px[i] = colR[x] * contrast;
      px[i + 1] = colG[x] * contrast;
      px[i + 2] = colB[x] * contrast;
      px[i + 3] = 255;
    }
  }

  cameraLayer.updatePixels();
}

// 按 GRADIENT_STOPS 求位置 u（0~1）处的颜色
function gradientColor(u) {
  for (let s = 0; s < GRADIENT_STOPS.length - 1; s++) {
    const a = GRADIENT_STOPS[s];
    const b = GRADIENT_STOPS[s + 1];

    if (u <= b.pos) {
      const t = (u - a.pos) / (b.pos - a.pos);
      return [
        lerp(a.color[0], b.color[0], t),
        lerp(a.color[1], b.color[1], t),
        lerp(a.color[2], b.color[2], t)
      ];
    }
  }

  return GRADIENT_STOPS[GRADIENT_STOPS.length - 1].color;
}

// ==================================
// TWO-HAND PINCH
// ==================================

function getTwoHandPinch() {
  if (hands.length < 2) {
    return {
      active: false,
      points: [],
      distance: 0
    };
  }

  let points = [];
  let pinching = [];

  for (let i = 0; i < 2; i++) {
    const keypoints = hands[i].keypoints;

    const thumb = keypoints[4];
    const index = keypoints[8];

    // Midpoint of thumb and index
    const x = (thumb.x + index.x) / 2;
    const y = (thumb.y + index.y) / 2;

    // Distance between thumb and index
    const pinchDistance = dist(
      thumb.x,
      thumb.y,
      index.x,
      index.y
    );

    // Scale threshold based on hand size
    const wrist = keypoints[0];
    const middleBase = keypoints[9];

    const handSize = dist(
      wrist.x,
      wrist.y,
      middleBase.x,
      middleBase.y
    );

    // 0.5：拇指和食指距离 < 手掌长度的一半就算捏住
    // （原来 0.42 偏严，手侧着或离镜头远时容易判断不出来）
    const threshold = max(22, handSize * 0.5);

    points.push({
      x,
      y,
      pinching: pinchDistance < threshold
    });

    pinching.push(pinchDistance < threshold);
  }

  // Keep the same left-to-right ordering
  points.sort((a, b) => a.x - b.x);

  const distance = dist(
    points[0].x,
    points[0].y,
    points[1].x,
    points[1].y
  );

  return {
    active: pinching[0] && pinching[1],
    points,
    distance
  };
}

// ==================================
// STRETCH INTERACTION
// ==================================

function updateStretch(g) {
  const now = millis();

  if (g.active) {

    // Both hands just started pinching
    if (!bothWerePinching) {
      startDistance = g.distance;
      maxPull = 0;
    }

    const pulled = max(
      0,
      g.distance - startDistance
    );

    maxPull = max(maxPull, pulled);

    // 除以 camScale：屏幕越大像素越多，换算回摄像头尺度，手感保持一致
    targetStretch = constrain(
      pulled / (160 * camScale),
      0,
      1.6
    );

    bothWerePinching = true;

  } else {

    // Both hands released
    if (bothWerePinching) {

      if (
        maxPull > pullThreshold * camScale &&
        now - lastChange > 600
      ) {
        nextScene();
      }
    }

    bothWerePinching = false;
    targetStretch = 0;
    maxPull = 0;
  }

  // Smooth elastic movement
  stretch = lerp(
    stretch,
    targetStretch,
    g.active ? 0.22 : 0.12
  );
}

// ==================================
// TYPOGRAPHY
// ==================================

function drawTypography() {
  const g = typeLayer;
  const word = scenes[scene].words[stage];

  // IMPORTANT: transparent background
  // Camera remains visible behind the text
  g.clear();

  g.push();

  g.fill(255);
  g.noStroke();
  g.textStyle(BOLD);

  // 原来按 480 高设计：行高 95、字号 112，现在按窗口高度等比放大
  // 5 行（奇数）→ 正中间那一行刚好落在屏幕中心
  const rows = 5;
  const rowHeight = H * 95 / 480;
  const fontSize = H * 112 / 480;

  // 整块文字垂直居中
  const startY = (H - rows * rowHeight) / 2;

  // 鱼眼会把中间放大，所以先算出"放大之后刚好占屏幕 92% 宽"
  // 时，文字本身应该多宽
  const textFrac = fitFraction(fishStrength, 0.92);

  // 弹出：新词先放大，再弹回正常大小
  const popScale = 1 + popAmount * 0.35;

  // 单手手势带来的位移 / 缩放 / 抖动
  const gt = gestureTransform();

  for (let i = 0; i < rows; i++) {

    const y = startY + i * rowHeight;

    g.push();

    // 握拳时每行随机抖一下
    const shakeX = gt.shake ? random(-gt.shake, gt.shake) : 0;
    const shakeY = gt.shake ? random(-gt.shake, gt.shake) : 0;

    // 以屏幕中心为原点缩放（推远/捏小时整块字往中间收）
    const cy = y + rowHeight / 2;
    g.translate(
      W / 2 + gt.dx + shakeX,
      H / 2 + (cy - H / 2) * gt.scale + gt.dy + shakeY
    );

    g.textSize(fontSize);

    // Fit text to canvas width
    const measuredWidth = max(
      g.textWidth(word),
      1
    );

    const fitScale = W * textFrac / measuredWidth;

    // Stretch horizontally
    const stretchScale = 1 + stretch * 0.75;

    // 固定不动：去掉了原来每行左右轻微伸缩的 wave 浮动
    const horizontalScale =
      fitScale *
      stretchScale *
      popScale *
      gt.scale;

    // Vertical compression
    // 长短语（比如 IF YOU CANNOT MATCH MY MIND）横向被压得太狠会很难读：
    // 字宽被压到不足字高的 MIN_ASPECT 时，字高也跟着缩，保持字形比例
    const MIN_ASPECT = 0.55;
    const squeeze = min(1, fitScale / MIN_ASPECT);

    const verticalScale =
      (1 - stretch * 0.15) * popScale * squeeze * gt.scale;

    g.scale(
      horizontalScale,
      verticalScale
    );

    // 中间那行 + 上下各一行 = 实心白；最外面的行是半透明"残影"
    // 想要更多实心行：把 SOLID_RANGE 调大（2 = 5 行全白）
    const SOLID_RANGE = 1;
    const isSolid = abs(i - floor(rows / 2)) <= SOLID_RANGE;
    g.fill(255, isSolid ? 255 : GHOST_ALPHA);

    // 黑色投影 → 字浮在背景上，更立体（只给实心行加，残影行加了会脏）。
    // 注意：canvas 的阴影不受 scale() 影响，单位是真实像素，所以要乘清晰度
    const ctx = g.drawingContext;
    if (isSolid) {
      ctx.shadowColor = `rgba(0, 0, 0, ${SHADOW_OPACITY})`;
      ctx.shadowOffsetX = H * SHADOW_OFFSET * TEXT_DENSITY;
      ctx.shadowOffsetY = H * SHADOW_OFFSET * TEXT_DENSITY;
      ctx.shadowBlur = H * SHADOW_BLUR * TEXT_DENSITY;
    } else {
      ctx.shadowColor = "transparent";
    }

    g.text(word, 0, 0);

    ctx.shadowColor = "transparent";

    g.pop();
  }

  g.pop();
}

// 鱼眼把横向位置 f（0 = 中心，1 = 屏幕边缘）放大成
// f * (1 + s * (1 - f² / 2))。二分查找：文字半宽 f 是多少时，
// 放大后刚好等于 target，这样整词在鱼眼下也不会被切掉
function fitFraction(s, target) {
  let lo = 0;
  let hi = 1;

  for (let i = 0; i < 20; i++) {
    const f = (lo + hi) / 2;
    const warped = f * (1 + s * max(0, 1 - f * f / 2));

    if (warped > target) hi = f;
    else lo = f;
  }

  return lo;
}

// ==================================
// FISHEYE DISTORTION
// ==================================

function drawFisheye() {
  push();

  noStroke();

  textureMode(NORMAL);
  texture(typeLayer);

  const cols = 40;
  const rows = 30;

  const cellW = W / cols;
  const cellH = H / rows;

  beginShape(TRIANGLES);

  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {

      const x1 = -W / 2 + col * cellW;
      const y1 = -H / 2 + row * cellH;

      const x2 = x1 + cellW;
      const y2 = y1 + cellH;

      const u1 = col / cols;
      const v1 = row / rows;

      const u2 = (col + 1) / cols;
      const v2 = (row + 1) / rows;

      const a = warpPoint(x1, y1);
      const b = warpPoint(x2, y1);
      const c = warpPoint(x2, y2);
      const d = warpPoint(x1, y2);

      vertex(a.x, a.y, 0, u1, v1);
      vertex(b.x, b.y, 0, u2, v1);
      vertex(c.x, c.y, 0, u2, v2);

      vertex(a.x, a.y, 0, u1, v1);
      vertex(c.x, c.y, 0, u2, v2);
      vertex(d.x, d.y, 0, u1, v2);
    }
  }

  endShape();

  pop();
}

function warpPoint(x, y) {
  const nx = x / (W / 2);
  const ny = y / (H / 2);

  const r2 = nx * nx + ny * ny;

  // Distortion becomes stronger
  // when both hands pull apart
  const strength =
    fishStrength + stretch * 0.8;

  const falloff = max(
    0,
    1 - r2 / 2
  );

  const factor =
    1 + strength * falloff;

  return {
    x: x * factor,
    y: y * (
      1 + strength * 2.6 * falloff
    )
  };
}

// ==================================
// HAND TRACKING
// ==================================

function drawHandTracking() {
  push();

  translate(-W / 2, -H / 2);

  const connections = [
    // Thumb
    [0, 1], [1, 2], [2, 3], [3, 4],

    // Index
    [0, 5], [5, 6], [6, 7], [7, 8],

    // Middle
    [0, 9], [9, 10], [10, 11], [11, 12],

    // Ring
    [0, 13], [13, 14], [14, 15], [15, 16],

    // Pinky
    [0, 17], [17, 18], [18, 19], [19, 20],

    // Palm
    [5, 9], [9, 13], [13, 17]
  ];

  for (let hand of hands) {
    const k = hand.keypoints;

    // Skeleton：霓虹灯管效果 = 同一条线画三层
    // 最外层宽而淡（光晕）→ 中层 → 最里面细而亮（灯芯，接近白色）
    const glowLayers = [
      { weight: 16, alpha: 35, core: 0 },    // 外光晕
      { weight: 8,  alpha: 90, core: 0 },    // 内光晕
      { weight: 3,  alpha: 255, core: 0.6 }  // 灯芯：往白色混 60%
    ];

    // 先垫一条很淡的深色线，在亮黄色背景上也能把霓虹"托"出来
    stroke(INK[0], INK[1], INK[2], 70);
    strokeWeight(10);
    for (let connection of connections) {
      const a = k[connection[0]];
      const b = k[connection[1]];
      line(a.x, a.y, b.x, b.y);
    }

    for (const layer of glowLayers) {
      stroke(
        lerp(NEON[0], 255, layer.core),
        lerp(NEON[1], 255, layer.core),
        lerp(NEON[2], 255, layer.core),
        layer.alpha
      );
      strokeWeight(layer.weight);

      for (let connection of connections) {
        const a = k[connection[0]];
        const b = k[connection[1]];
        line(a.x, a.y, b.x, b.y);
      }
    }

    // 关节：外面荧光晕影 + 一圈霓虹边 + 中间黑芯
    noStroke();
    for (let i = 0; i < k.length; i++) {
      const point = k[i];
      const tip = i === 4 || i === 8; // 拇指尖、食指尖：捏合用，画大一点
      const r = tip ? 16 : 9;

      fill(NEON[0], NEON[1], NEON[2], 60);   // 外层晕影
      circle(point.x, point.y, r * 2.2);
      fill(NEON[0], NEON[1], NEON[2]);       // 霓虹边
      circle(point.x, point.y, r);
      fill(0);                               // 黑芯（越大霓虹边越细）
      circle(point.x, point.y, r * JOINT_CORE);
    }
  }

  // Pinch position indicators
  if (
    currentGesture &&
    currentGesture.points.length === 2
  ) {
    for (let p of currentGesture.points) {

      // 没捏：淡白虚圈；捏住：强调色粗圈
      noFill();

      if (p.pinching) {
        stroke(ACCENT[0], ACCENT[1], ACCENT[2]);
        strokeWeight(3);
        circle(p.x, p.y, 36);
      } else {
        stroke(255, 90);
        strokeWeight(1.5);
        circle(p.x, p.y, 24);
      }
    }
  }

  pop();
}

// ==================================
// INTERFACE
// ==================================

function drawInterface(g) {
  // WEBGL 画布在 p5 1.x 里不能直接用系统字体写字，
  // 所以界面先画在 2D 图层 uiLayer 上，最后整张贴到主画布
  const u = uiLayer;
  u.clear();
  u.push();

  // Transition flash
  if (flash > 1) {
    u.noStroke();
    u.fill(255, flash);
    u.rect(0, 0, W, H);
  }

  if (showHints) drawHint(u, g);

  // Connecting line between pinches
  if (
    g.active &&
    g.points.length === 2
  ) {
    const a = g.points[0];
    const b = g.points[1];

    u.stroke(ACCENT[0], ACCENT[1], ACCENT[2], 200);
    u.strokeWeight(2);

    u.line(a.x, a.y, b.x, b.y);

    // Distance indicator
    u.noStroke();
    u.fill(ACCENT[0], ACCENT[1], ACCENT[2]);

    u.textFont("Arial");
    u.textStyle(BOLD);
    u.textAlign(CENTER, CENTER);
    u.textSize(11);

    const pulled = max(
      0,
      g.distance - startDistance
    );

    u.text(
      `${floor(pulled)} px`,
      (a.x + b.x) / 2,
      (a.y + b.y) / 2 - 18
    );
  }

  u.pop();

  push();
  translate(-W / 2, -H / 2);
  image(uiLayer, 0, 0, W, H);
  pop();
}

// ==================================
// PER-PAGE GESTURES（部分页面换成单手手势）
// ==================================

// 哪些页面换成别的手势：按屏幕上显示的文字匹配。
// 没列在这里的页面 = 原来的双手捏住拉开。改了歌词记得同步改这里的文字
const PAGE_GESTURES = {
  "THE TEXTS": "push",            // ✋ 把烦人的消息推开
  "SMALL TALK": "push",           // ✋ 把尬聊推开
  "SUCKS": "thumbsDown",          // 👎 竖大拇指朝下 → 字往下沉
  "KILLS MY CRUSH": "fist",       // ✊ 握拳 → 字被捏碎、缩没
  "LEAVE ME ALONE?": "push",      // ✋ 张开手掌往镜头推 → 字被推远
  "YOU’RE OUTTA LUCK": "swipe"    // 👋 快速左右挥手 → 字被扫出屏幕
};

// 每种交互的提示（屏幕底部小胶囊）。想改文案直接改这里
const GESTURE_HINTS = {
  pull:       { icon: "🤏  🤏", text: "PINCH WITH BOTH HANDS · PULL APART" },
  push:       { icon: "✋", text: "OPEN YOUR PALM · PUSH TOWARD THE CAMERA" },
  fist:       { icon: "✊", text: "MAKE A FIST" },
  swipe:      { icon: "👋", text: "SWIPE YOUR HAND LEFT OR RIGHT" },
  thumbsDown: { icon: "👎", text: "THUMBS DOWN · HOLD IT" }
};

let showHints = true; // 按 I 键开关提示

let gestureAmount = 0;    // 0~1：手势完成度（平滑后），驱动文字的实时反馈
let gestureArmed = false; // 进入新页面后要先"放松"一次手才算数，避免带着上一个动作直接跳页
let gestureHold = 0;      // 某个姿势已经保持了多少帧
let exitAnim = null;      // 触发后的退场动画 { mode, t: 0~1, dir }
let pushBaseline = null;  // 推掌：手刚张开时的大小，用来判断手有没有变大（靠近镜头）
let swipeHistory = [];    // 挥手：最近 0.3 秒的手腕横向位置
let swipeDir = 1;         // 挥手方向：1 = 往右，-1 = 往左

function currentMode() {
  return PAGE_GESTURES[scenes[scene].words[stage]] || "pull";
}

function resetGesture() {
  gestureAmount = 0;
  gestureArmed = false;
  gestureHold = 0;
  exitAnim = null;
  pushBaseline = null;
  swipeHistory = [];
}

// 手的大小 + 弯曲程度
// curl = 四个指尖到手腕的平均距离 ÷ 手掌长度：张开约 1.9，握拳约 1.0
function handMetrics(k) {
  const size = max(dist(k[0].x, k[0].y, k[9].x, k[9].y), 1);
  let sum = 0;
  for (const t of [8, 12, 16, 20]) {
    sum += dist(k[t].x, k[t].y, k[0].x, k[0].y);
  }
  return { size, curl: sum / 4 / size };
}

// 画面里最大的那只手（离镜头最近 = 正在做动作的那只）
function mainHand() {
  let best = null;
  let bestSize = 0;
  for (const h of hands) {
    const m = handMetrics(h.keypoints);
    if (m.size > bestSize) {
      bestSize = m.size;
      best = h;
    }
  }
  return best;
}

// 返回这一帧的手势完成度 0~1（还没平滑）
function measureGesture(mode) {
  const hand = mainHand();

  if (!hand) {
    pushBaseline = null;
    swipeHistory = [];
    gestureHold = max(0, gestureHold - 2);
    return mode === "thumbsDown" ? gestureHold / THUMBS_HOLD_FRAMES : 0;
  }

  const k = hand.keypoints;
  const m = handMetrics(k);

  if (mode === "fist") {
    // 手指越弯越接近 1
    return constrain(map(m.curl, 1.7, 1.15, 0, 1), 0, 1);
  }

  if (mode === "push") {
    const open = m.curl > 1.55;
    if (!open) {
      pushBaseline = null;
      return 0;
    }
    // 手张开时记下大小；手往后退就更新成更小的值
    if (pushBaseline === null || m.size < pushBaseline) pushBaseline = m.size;
    // 手变大 40% = 推到位
    return constrain((m.size / pushBaseline - 1) / 0.4, 0, 1);
  }

  if (mode === "swipe") {
    const now = millis();
    swipeHistory.push({ t: now, x: k[0].x });
    swipeHistory = swipeHistory.filter((p) => now - p.t < 300);
    const dx = swipeHistory[swipeHistory.length - 1].x - swipeHistory[0].x;
    if (abs(dx) > 1) swipeDir = dx > 0 ? 1 : -1;
    // 0.3 秒内横向移动超过屏幕宽度的 30% = 挥到位
    return constrain(abs(dx) / (W * 0.3), 0, 1);
  }

  if (mode === "thumbsDown") {
    // 拇指尖明显在拇指根部下方 + 是最低的指尖 + 其余手指弯着
    const thumbDown = k[4].y - k[2].y > m.size * 0.45;
    const lowest = k[4].y > max(k[8].y, k[12].y, k[16].y, k[20].y);
    const curled = m.curl < 1.45;
    const pose = thumbDown && lowest && curled;
    // 保持姿势一小段时间才算（不然手一晃就误触发）
    gestureHold = constrain(gestureHold + (pose ? 1 : -2), 0, THUMBS_HOLD_FRAMES);
    return gestureHold / THUMBS_HOLD_FRAMES;
  }

  return 0;
}

const THUMBS_HOLD_FRAMES = 18; // 👎 要保持约 0.3 秒
const EXIT_FRAMES = 20;        // 退场动画长度（帧）

function updateGesture(mode) {
  // 正在播退场动画：播完就换下一页
  if (exitAnim) {
    exitAnim.t += 1 / EXIT_FRAMES;
    if (exitAnim.t >= 1) nextScene();
    return;
  }

  const raw = measureGesture(mode);

  // 刚进页面：等手先放松（完成度掉到 0.3 以下）才开始算
  if (!gestureArmed && raw < 0.3) gestureArmed = true;

  const target = gestureArmed ? raw : 0;
  gestureAmount = lerp(gestureAmount, target, 0.3);

  const cooledDown = millis() - lastChange > 600;
  if (gestureArmed && cooledDown && raw >= 0.97) {
    exitAnim = { mode, t: 0, dir: swipeDir };
    flash = 80;
  }
}

// 根据当前手势和完成度，算出文字的位移/缩放/抖动
function gestureTransform() {
  const mode = exitAnim ? exitAnim.mode : currentMode();
  const a = exitAnim ? 1 : gestureAmount;
  const e = exitAnim ? exitAnim.t * exitAnim.t : 0; // 退场：先慢后快
  const dir = exitAnim ? exitAnim.dir : swipeDir;

  const out = { scale: 1, dx: 0, dy: 0, shake: 0 };

  if (mode === "fist") {
    // 越握越小、越抖，像被捏住；触发后缩没
    out.scale = (1 - 0.35 * a) * (1 - e);
    out.shake = a * H * 0.012;
  } else if (mode === "push") {
    // 越推越小，像被推远
    out.scale = (1 - 0.45 * a) * (1 - 0.95 * e);
  } else if (mode === "swipe") {
    // 跟着挥手方向偏一点；触发后整行被扫出屏幕
    out.dx = dir * (a * W * 0.08 + e * W * 1.3);
  } else if (mode === "thumbsDown") {
    // 往下沉；触发后掉出屏幕
    out.dy = a * H * 0.12 + e * H * 1.1;
    out.scale = 1 - 0.1 * a;
  }

  out.scale = max(out.scale, 0.001);
  return out;
}

// 底部提示：图标 + 一句话 + 完成度进度条
function drawHint(u, g) {
  const mode = exitAnim ? exitAnim.mode : currentMode();
  const hint = GESTURE_HINTS[mode];
  if (!hint) return;

  // 完成度：拉伸页 = 已拉开的距离 / 需要拉开的距离；手势页 = 手势完成度
  let progress;
  if (exitAnim) {
    progress = 1;
  } else if (mode === "pull") {
    progress = g.active
      ? constrain(max(0, g.distance - startDistance) / (pullThreshold * camScale), 0, 1)
      : 0;
  } else {
    progress = gestureAmount;
  }

  // 换页闪白时淡出
  const alpha = exitAnim ? 255 * (1 - exitAnim.t) : 255;

  // 拉伸页：两手还没捏住时提示"捏住"，捏住后提示"拉开"
  let text = hint.text;
  if (mode === "pull" && g.active) text = "NOW PULL APART → LET GO";

  const s = constrain(H / 900, 0.7, 1.4); // 跟屏幕大小缩放
  const fontSize = 15 * s;
  const iconSize = 24 * s;
  const padX = 22 * s;
  const gap = 12 * s;
  const pillH = 52 * s;

  u.textFont("Arial");
  u.textStyle(BOLD);
  u.textSize(fontSize);
  const textW = u.textWidth(text);
  u.textSize(iconSize);
  const iconW = u.textWidth(hint.icon);

  const pillW = padX * 2 + iconW + gap + textW;
  const x = (W - pillW) / 2;
  const y = H - pillH - 28 * s;

  // 胶囊底
  u.noStroke();
  u.fill(INK[0], INK[1], INK[2], 190 * alpha / 255);
  u.rect(x, y, pillW, pillH, pillH / 2);

  // 图标 + 文案
  u.textAlign(LEFT, CENTER);
  u.fill(255, alpha);
  u.textSize(iconSize);
  u.text(hint.icon, x + padX, y + pillH / 2 + 1);
  u.textSize(fontSize);
  u.text(text, x + padX + iconW + gap, y + pillH / 2 + 1);

  // 进度条（强调色）：做到哪了一眼看到
  const barX = x + pillH / 2;
  const barW = pillW - pillH;
  const barY = y + pillH - 7 * s;
  u.fill(255, 40 * alpha / 255);
  u.rect(barX, barY, barW, 3 * s, 2);
  u.fill(ACCENT[0], ACCENT[1], ACCENT[2], alpha);
  u.rect(barX, barY, barW * progress, 3 * s, 2);
}

// ==================================
// SCENE CONTROL
// ==================================

// 拉伸松手后调用：
// 当前 scene 还有词 → 弹出下一个词；没有了 → 跳到下一个 scene
function nextScene() {
  const words = scenes[scene].words;

  if (stage < words.length - 1) {
    stage++;
    popAmount = 1;    // 弹出动画
    flash = 120;
  } else {
    scene = (scene + 1) % scenes.length;
    stage = 0;
    popAmount = 0.6;
    flash = 190;
  }

  lastChange = millis();

  targetStretch = 0;
  maxPull = 0;

  resetGesture();
}

function keyPressed() {
  // Space: manually next scene
  if (key === " ") {
    nextScene();
    return false;
  }

  // R: restart
  if (key === "r" || key === "R") {
    scene = 0;
    stage = 0;
    resetGesture();

    stretch = 0;
    targetStretch = 0;

    bothWerePinching = false;
    maxPull = 0;

    flash = 190;
  }

  // H: toggle hand skeleton
  // I: toggle gesture hints
  if (key === "i" || key === "I") {
    showHints = !showHints;
  }

  if (key === "h" || key === "H") {
    showHandTracking = !showHandTracking;
  }

  // C: toggle camera visibility
  if (key === "c" || key === "C") {
    cameraOpacity =
      cameraOpacity > 0 ? 0 : 125;
  }
}
