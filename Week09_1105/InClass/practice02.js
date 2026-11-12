let handPose;
let video;
let hands = [];

// shape
let numPoints = 5;       
let shapePoints = [];    // save points into an array

// drag
let grabbedIndex = -1;   // 当前被捏住的点的下标，-1 表示没捏住任何点
let pinchThreshold = 40; // 拇指尖和食指尖距离小于这个值，算"捏住"
let grabRadius = 40;     // 捏合位置离某个点多近才能抓起它

async function setup() {
  createCanvas(640, 480);

  video = createCapture(VIDEO, { flipped: true });
  video.size(640, 480);
  video.hide(); // 隐藏默认的 <video> 元素，我们自己画到 canvas 上

  // randomly generated the shape point
  for (let i = 0; i < numPoints; i++) {
    shapePoints[i] = createVector(random(width * 0.75), random(height * 0.75));
  }

  handPose = await ml5.handPose({ flipped: true });
  handPose.detectStart(video, gotHands);
}

function draw() {
  image(video, 0, 0, width, height); //????
  updateDrag(); // update the latest 2 fingers' position 
  drawShape();
  drawKeypoints();
}

// update the latest hand data
function gotHands(results) {
  hands = results;
}

// 核心逻辑：捏合 → 抓起最近的点 → 跟着手移动 → 松开放下
function updateDrag() {
  // 画面里没有手：松开
  if (hands.length === 0) {
    grabbedIndex = -1;
    return;
  }

  const hand = hands[0];
  const thumb = hand.keypoints[4]; // 拇指尖
  const index = hand.keypoints[8]; // 食指尖

  // 捏合点 = 拇指尖和食指尖的中点
  const pinchX = (thumb.x + index.x) / 2;
  const pinchY = (thumb.y + index.y) / 2;
  const pinchDist = dist(thumb.x, thumb.y, index.x, index.y);
  const isPinching = pinchDist < pinchThreshold;

  // 画一个小圈表示捏合位置：捏住时红色，没捏时白色
  noFill();
  strokeWeight(2);
  stroke(isPinching ? color(255, 0, 0) : color(255));
  circle(pinchX, pinchY, 20);

  if (!isPinching) {
    // 手指张开：松开
    grabbedIndex = -1;
    return;
  }

  // 刚开始捏：找离捏合点最近、且在 grabRadius 范围内的顶点
  if (grabbedIndex === -1) {
    let closest = grabRadius;
    for (let i = 0; i < shapePoints.length; i++) {
      const d = dist(pinchX, pinchY, shapePoints[i].x, shapePoints[i].y);
      if (d < closest) {
        closest = d;
        grabbedIndex = i;
      }
    }
  }

  // 正在捏着某个点：让它跟着手走
  // lerp 做一点平滑，减少手部识别带来的抖动
  if (grabbedIndex !== -1) {
    const p = shapePoints[grabbedIndex];
    p.x = lerp(p.x, pinchX, 0.5);
    p.y = lerp(p.y, pinchY, 0.5);
  }
}

// 用 shapePoints 画一个闭合多边形，并把每个顶点画成可拖的小圆
function drawShape() {
  // 图形本体
  fill(255, 150, 0, 150);
  stroke(255);
  strokeWeight(2);
  beginShape();
  for (let i = 0; i < shapePoints.length; i++) {
    vertex(shapePoints[i].x, shapePoints[i].y);
  }
  endShape(CLOSE);

  // 顶点小圆：被抓住的那个变大变红
  for (let i = 0; i < shapePoints.length; i++) {
    const p = shapePoints[i];
    noStroke();
    if (i === grabbedIndex) {
      fill(255, 0, 0);
      circle(p.x, p.y, 24);
    } else {
      fill(255);
      circle(p.x, p.y, 14);
    }
  }
}

// 在每只手的 21 个关键点上画绿色圆点
function drawKeypoints() {
  for (let i = 0; i < hands.length; i += 1) {
    const hand = hands[i];

    for (let j = 0; j < hand.keypoints.length; j += 1) {
      const keypoint = hand.keypoints[j];

      fill(0, 255, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 6);
    }
  }
}
