let handPose;
let video;
let hands = [];
// let numPoints;

async function setup() {
  createCanvas(640, 480);
  video = createCapture(VIDEO, { flipped: true }); // Open Camera
  video.size(640, 480);
  video.hide(); // 隐藏默认的 <video> 元素，我们自己画到 canvas 上

  // 加载 handPose 模型，flipped 要和摄像头保持一致，关键点才不会左右反
  handPose = await ml5.handPose({ flipped: true });

  // 持续检测摄像头里的手，每次有结果就调用 gotHands
  handPose.detectStart(video, gotHands);

}



function draw() {
  // 每一帧都先画摄像头画面
  image(video, 0, 0, width, height);
  drawKeypoints();// 再把检测到的关键点画上去
}

// 检测结果回调：保存最新的手部数据
function gotHands(results) {
  hands = results;
}

// 在每只手的 21 个关键点上画绿色圆点
function drawKeypoints() {
  for (let i = 0; i < hands.length; i += 1) {
    const hand = hands[i];

    for (let j = 0; j < hand.keypoints.length; j += 1) {
      const keypoint = hand.keypoints[j];

      fill(0, 255, 0);
      noStroke();
      circle(keypoint.x, keypoint.y, 10);
    }
  }
}
