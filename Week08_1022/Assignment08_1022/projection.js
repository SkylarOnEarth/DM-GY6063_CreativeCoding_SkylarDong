const eras = [
  { year: '1980s', files: ['1980s_01.jpg', '1980s_02.jpg', '1980s_03.jpg'] },
  { year: '1990s', files: ['1990s_01.jpg', '1990s_02.jpg', '1990s_03.jpg'] },
  { year: '2000s',  files: ['2000s_01.jpg', '2000s_02.jpg', '2000s_03.jpg'] },
  { year: '2010s',   files: ['2010s_01.jpg', '2010s_02.jpg', '2010s_03.jpg'] },
  { year: '2020s',  files: ['2020s_01.jpeg', '2020s_02.jpg', '2020s_03.jpg', '2020s_04.jpg'] },
];

// Initially, I used a centered crop for every image. 
// But once the images were mapped onto the spheres, 
// the fisheye distortion made some of the subjects less prominent.
// I added custom crop settings to manually adjust the framing. 
// The x and y values control the crop’s position, while size controls how much of the image is included. 
// This lets me bring the person or text I want to emphasize
//  the front center of the sphere while keeping the curved distortion.
const customCrops = {
  '2020s_02.jpg': [-100, 10, 700],  
  '2020s_03.jpg': [90, 90, 1000],    
  '2020s_04.jpg': [-35, 75, 600],  
};

const BALL_RADIUS = 43;
const STRING_LENGTH = 600;
const PIVOT_Y = 65 - STRING_LENGTH;

// fixed camera: a little above the cradle, looking slightly down
const CAMERA_HEIGHT = 240;
const CAMERA_DISTANCE = 850;
const TILT_TO_CAMERA = Math.atan2(CAMERA_HEIGHT, CAMERA_DISTANCE);  // so the photo faces us

// sphere mesh resolution
const MESH_ROWS = 32;
const MESH_COLS = 48;

const GRAVITY = 4.6;       // really g / L, tuned by eye until the swing felt right
const SWING_ANGLE = 0.24;  // how far (radians) the outer ball is pulled back
const TEMPO = 0.85;        // < 1 = a bit slower than "real", reads better on a big wall

let angle = -SWING_ANGLE;  // angle of whichever balls are currently moving
let velocity = 0;
let movingSide = -1;       // -1 = left balls are swinging, +1 = right balls
let ballsInMotion = 1;     // 1 or 2

let photos = [];           
let spheres = [];          
let chosenPhoto = [0, 0, 0, 0, 0];

let isPlaying = true;
let selectedBall = 0;
let showStrings = true;
let showSelectionCue = true;
let cueFadesAt = 0;        // millis() when the selection highlight is gone

function preload() {
  photos = eras.map(era =>
    era.files.map(file =>
      loadImage('images/' + file)
    )
  );
}

///// Use p5.js's WEBGL mode to render the 3D spheres.
// https://p5js.org/reference/p5/constants/WEBGL/
function setup() {
  createCanvas(windowWidth, windowHeight, WEBGL);
  pixelDensity(Math.min(window.devicePixelRatio, 2));
  textureMode(NORMAL);

  // build every sphere once up front, so switching photos is instant
  spheres = photos.map((group, eraIndex) =>
    group.map((img, photoIndex) => buildPhotoSphere(img, eras[eraIndex].files[photoIndex]))
  );

  window.addEventListener('keydown', handleKey);
  updateStatus();

}

function draw() {
  if (isPlaying) {
    stepPendulum();
  }

  background(0);
  setUpCamera();

  const balls = ballPositions();

  noLights();
  balls.forEach((ball, i) => drawStringOrCue(ball, i));

  noStroke();
  ambientLight(145, 150, 146);
  directionalLight(245, 239, 222, -0.5, 0.7, -0.7);   // warm key light
  pointLight(160, 198, 218, 300, -200, 200);         // cool fill from the right
  balls.forEach((ball, i) => drawBall(ball, i));
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
}

/// I wanted the spheres to feel more three-dimensional, 
// so I explored p5.js’s WEBGL features and its built-in camera controls. 
// I used the camera to establish a slightly elevated viewpoint, 
// then chose orthographic projection to keep the balls 
// visually consistent in size for the projection composition.

function setUpCamera() {
  // scale so the cradle always fits, whatever the projector resolution is
  const zoom = Math.min(width / 850, height / 520);
  const halfW = width / zoom / 2;
  const halfH = height / zoom / 2;
  ortho(-halfW, halfW, -halfH, halfH, 0, 3000);
  camera(0, -CAMERA_HEIGHT, CAMERA_DISTANCE, 0, 0, 0, 0, 1, 0);
}

// x of the point each string hangs from
function pivotX(i) {
  return (i - 2) * BALL_RADIUS * 2;   // ball 2 sits in the middle
}

function ballPositions() {
  return eras.map((era, i) => {
    // only the outer one or two balls on the moving side swing; the rest stay still
    const isSwinging = movingSide < 0 ? i < ballsInMotion : i >= eras.length - ballsInMotion;
    const a = isSwinging ? angle : 0;

    return {
      x: pivotX(i) + STRING_LENGTH * Math.sin(a),
      y: PIVOT_Y + STRING_LENGTH * Math.cos(a),
      angle: a,
    };
  });
}

function drawStringOrCue(ball, i) {
  // cue goes 1 -> 0 over one second after you pick a ball
  const cue = (showSelectionCue && i === selectedBall) ? Math.max(0, (cueFadesAt - millis()) / 1000) : 0;

  if (showStrings) {
    // the selected ball's string briefly glows brighter
    stroke(105 + 150 * cue);
    strokeWeight(1 + cue);
    // string ends at the top of the ball, not its center
    const topX = ball.x - BALL_RADIUS * Math.sin(ball.angle);
    const topY = ball.y - BALL_RADIUS * Math.cos(ball.angle);
    line(pivotX(i), PIVOT_Y, 0, topX, topY, 0);
  } else if (cue > 0) {
    // no strings to light up, so draw a fading ring instead
    push();
    translate(ball.x, ball.y, 0);
    rotateX(TILT_TO_CAMERA);
    noFill();
    stroke(180, 230, 215, 255 * cue);
    strokeWeight(1);
    circle(0, 0, BALL_RADIUS * 2 + 8);
    pop();
  }
}

function drawBall(ball, i) {
  const img = photos[i][chosenPhoto[i]];

  push();
  translate(ball.x, ball.y, 0);
  rotateX(TILT_TO_CAMERA);
  texture(img);
  model(spheres[i][chosenPhoto[i]]);
  pop();
}

// Equal masses: whatever hits one end comes out the other end with the
// same number of balls. So we only ever simulate one pendulum and just
// switch which side it belongs to every time it passes through the middle.

function stepPendulum() {
  const frameStep = (1 / 60) * TEMPO; //Assume the sketch runs at 60 frames per second.
  velocity -= GRAVITY * Math.sin(angle) * frameStep;
  angle += velocity * frameStep;

  const crossedTheMiddle = angle * movingSide < 0;

  if (crossedTheMiddle) {
    movingSide = -movingSide;
    angle = 0;
    velocity = movingSide *
      Math.sqrt(2 * GRAVITY * (1 - Math.cos(SWING_ANGLE)));
  }
} 

// function stepPendulum(dt) {
//   // small fixed steps keep the motion smooth and stable
//   const steps = Math.ceil(dt / 0.002);
//   const h = dt / steps;

//   for (let s = 0; s < steps; s++) {
//     velocity -= GRAVITY * Math.sin(angle) * h;
//     angle += velocity * h;

//     const crossedTheMiddle = angle * movingSide < 0;
//     if (crossedTheMiddle) {
//       movingSide = -movingSide; // collision! hand the motion over to the other side
//       angle = 0; // perfectly elastic: the speed you'd get from falling SWING_ANGLE, no energy lost
//       velocity = movingSide * Math.sqrt(2 * GRAVITY * (1 - Math.cos(SWING_ANGLE)));
//     }
//   }
// }

function release(howMany) {
  ballsInMotion = howMany;
  movingSide = -1;              // always pull back from the left
  angle = movingSide * SWING_ANGLE;
  velocity = 0;
  isPlaying = true;
}


const KEYS_WE_USE = ['arrowleft', 'arrowright', 'arrowup', 'arrowdown', '1', '2', ' ', 'r', 'f', 'l', 'g', 'h'];

function handleKey(event) {
  const key = event.key.toLowerCase();
  if (event.metaKey || event.ctrlKey || event.altKey) return;
  if (!KEYS_WE_USE.includes(key)) return;

  event.preventDefault();       // stop arrows/space from scrolling the page
  if (event.repeat) return;     // holding a key down shouldn't spam it

  switch (key) {
    case 'arrowleft':  selectBall(-1);  break;
    case 'arrowright': selectBall(+1);  break;
    case 'arrowup':    changePhoto(-1); break;
    case 'arrowdown':  changePhoto(+1); break;

    case '1': release(1); break;
    case '2': release(2); break;
    case 'r': release(ballsInMotion); break;
    case ' ': isPlaying = !isPlaying; break;

    case 'l': showStrings = !showStrings; break;
    case 'g':
      showSelectionCue = !showSelectionCue;
      cueFadesAt = 0;
      break;
    case 'h': toggleHelp(); break;
    case 'f': toggleFullscreen(); break;
  }

  updateStatus();
}

function selectBall(step) {
  selectedBall = wrap(selectedBall + step, eras.length);
  flashCue();
}


////
function changePhoto(step) {
  const total = eras[selectedBall].files.length;
  chosenPhoto[selectedBall] = wrap(chosenPhoto[selectedBall] + step, total);
  flashCue();
}

function flashCue() {
  cueFadesAt = millis() + 1000;
}

function toggleHelp() {
  const help = document.getElementById('help');
  help.hidden = !help.hidden;
}


function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen();
  } else {
    document.documentElement.requestFullscreen();
  }
}


function updateStatus() {
  const era = eras[selectedBall];
  const file = era.files[chosenPhoto[selectedBall]];
  const balls = ballsInMotion === 1 ? '1 ball' : ballsInMotion + ' balls';
  const playState = isPlaying ? 'Playing' : 'Paused';
  document.getElementById('state').textContent = `${era.year} · ${file} · ${balls} · ${playState}`;
}

// like % but never negative, so going left from 0 lands on the last one
function wrap(n, total) {
  return (n + total) % total;
}

////Builds a sphere and wraps the photo around its front half.
////The UVs are based on angles, not flat projection, so the picture bends
///like it's seen through a fisheye lens, with the subject right in the middle.

function buildPhotoSphere(img, fileName) {
  const w = img.width;
  const h = img.height;

  // default: the biggest centered square
  const shortSide = Math.min(w, h);
  const [cropX, cropY, cropSize] = customCrops[fileName] || [(w - shortSide) / 2, (h - shortSide) / 2, shortSide];

  const mesh = new p5.Geometry();
  mesh.gid = 'photo-sphere-' + fileName;   // p5 caches the mesh on the GPU by this id

  for (let row = 0; row <= MESH_ROWS; row++) {
    for (let col = 0; col <= MESH_COLS; col++) {
      // walk the sphere top to bottom (lat) and around (lon)
      const lat = row * Math.PI / MESH_ROWS;
      const lon = col * Math.PI * 2 / MESH_COLS;

      const x = Math.sin(lat) * Math.cos(lon);
      const y = -Math.cos(lat);
      const z = Math.sin(lat) * Math.sin(lon);

      mesh.vertices.push(createVector(x * BALL_RADIUS, y * BALL_RADIUS, z * BALL_RADIUS));
      mesh.vertexNormals.push(createVector(x, y, z));

      // abs(z) mirrors the back onto the front, 
      // so there's no ugly seam behind the ball
      const u = 0.5 + Math.atan2(x, Math.abs(z)) / Math.PI;
      const v = 0.5 + Math.asin(constrain(y, -1, 1)) / Math.PI;
      mesh.uvs.push((cropX + u * cropSize) / w, (cropY + v * cropSize) / h);

      // two triangles per grid square
      if (row < MESH_ROWS && col < MESH_COLS) {
        const a = row * (MESH_COLS + 1) + col;
        const below = a + MESH_COLS + 1;
        mesh.faces.push([a, below, a + 1], [a + 1, below, below + 1]);
      }
    }
  }

  return mesh;
}
