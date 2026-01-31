/* PROJECT: Vitals
   THEME: Somatic Dashboard / Diagnostic Quadrants
   AESTHETIC: White bg, Black 1px contours
   - Cross divides circle into 4 quadrants
   - Each quadrant: animated icon + number + label
   - Q1 (top-left): barrel with water level
   - Q2 (top-right): metaball morphing to diamond
   - Q3 (bottom-left): worm sine chain
   - Q4 (bottom-right): scattered dots (free ↔ assembled)
*/

var video;
var cx, cy;
var WATCH_R = 200;
var CROSS_LEN = 130; // half-length of cross lines (doesn't reach edge)

// Pulse
var readings = [];
var maxReadings = 20;
var lastBeatTime = 0;
var beatThreshold = 1.5;
var indicatorFill = 0;
var bpm = 0;
var bpmHistory = [];
var lastPulseMs = 0;
var manualPulse = false;

// Camera
var devices = [];
var currentDeviceIndex = 0;

// ── QUADRANT DATA ───────────────────────────────────────────────
// Each quadrant cycles through values on pulse
var quads = [
  { value: 0, targetValue: 72,  label: "HYDRA",  format: "int" },    // barrel
  { value: 0, targetValue: 1.2, label: "COHERE", format: "float" },  // metaball
  { value: 0, targetValue: 88,  label: "RHYTHM", format: "int" },    // worm
  { value: 0, targetValue: 0.7, label: "FIELD",  format: "float" }   // dots
];

var quadLabels = [
  ["HYDRA", "SATUR", "FLUSH", "RESERVOIR"],
  ["COHERE", "TENSIL", "MORPH", "ELASTIC"],
  ["RHYTHM", "TEMPO", "PULSE", "CADENCE"],
  ["FIELD", "SWARM", "SCATTER", "GATHER"]
];

// Q1: barrel water
var waterLevel = 0.5;
var waterTarget = 0.5;

// Q2: metaball → diamond morph
var morphT = 0;       // 0 = blob, 1 = diamond
var morphDir = 1;
var blobNoiseTime = 0;

// Q3: worm
var wormPhase = 0;
var wormSpeed = 0.03;
var wormAmp = 12;
var WORM_SEGMENTS = 8;

// Q4: dots
var dots = [];
var NUM_DOTS = 25;
var dotsMode = 0; // 0 = free wander, 1 = concentrated assembly
var dotsModeTimer = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = round(width / 2);
  cy = round(height / 2);

  // init quad values
  for (var i = 0; i < quads.length; i++) {
    quads[i].value = quads[i].targetValue;
  }
  waterLevel = 0.5;
  waterTarget = 0.5;

  // init dots for Q4
  for (var i = 0; i < NUM_DOTS; i++) {
    dots.push({
      x: random(-30, 30),
      y: random(-30, 30),
      vx: random(-0.5, 0.5),
      vy: random(-0.5, 0.5),
      noiseSeed: random(1000)
    });
  }

  getVideoDevices();
}

function draw() {
  background(255);

  var now = millis();
  var t = now * 0.001;

  // ── SIGNAL ────────────────────────────────────────────────
  var rawSignal = getPulseStrength();
  var boostedSignal = rawSignal * 4;
  var isPulse = manualPulse || (boostedSignal > beatThreshold && now - lastBeatTime > 300);
  manualPulse = false;
  if (isPulse) {
    lastBeatTime = now;
    indicatorFill = 1;
  }

  indicatorFill = max(0, indicatorFill - 0.03);

  // ── UPDATE VALUES ─────────────────────────────────────────
  for (var i = 0; i < quads.length; i++) {
    quads[i].value = lerp(quads[i].value, quads[i].targetValue, 0.05);
  }
  waterLevel = lerp(waterLevel, waterTarget, 0.03);

  // morph metaball ↔ diamond
  morphT += 0.008 * morphDir;
  if (morphT > 1) { morphT = 1; morphDir = -1; }
  if (morphT < 0) { morphT = 0; morphDir = 1; }
  blobNoiseTime += 0.02;

  // worm
  wormPhase += wormSpeed;

  // dots mode
  if (now - dotsModeTimer > 4000) {
    dotsMode = 1 - dotsMode;
    dotsModeTimer = now;
  }

  // ── WATCH CIRCLE ──────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  ellipse(cx, cy, WATCH_R * 2, WATCH_R * 2);

  // clip
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(cx, cy, WATCH_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── CROSS ─────────────────────────────────────────────────
  stroke(0);
  strokeWeight(1);
  // vertical
  line(cx, cy - CROSS_LEN, cx, cy + CROSS_LEN);
  // horizontal
  line(cx - CROSS_LEN, cy, cx + CROSS_LEN, cy);

  // ── QUADRANTS ─────────────────────────────────────────────
  // quadrant centers (offset from cx,cy)
  var qOff = 65; // distance from center to quadrant center
  var qCenters = [
    { x: cx - qOff, y: cy - qOff }, // top-left: barrel
    { x: cx + qOff, y: cy - qOff }, // top-right: metaball
    { x: cx - qOff, y: cy + qOff }, // bottom-left: worm
    { x: cx + qOff, y: cy + qOff }  // bottom-right: dots
  ];

  // draw each quadrant
  drawBarrel(qCenters[0].x, qCenters[0].y, t);
  drawMetaball(qCenters[1].x, qCenters[1].y, t);
  drawWorm(qCenters[2].x, qCenters[2].y, t);
  drawDots(qCenters[3].x, qCenters[3].y, t);

  // draw numbers and labels
  fill(0);
  noStroke();
  textFont('monospace');
  textAlign(CENTER, CENTER);

  for (var i = 0; i < 4; i++) {
    var qx = qCenters[i].x;
    var qy = qCenters[i].y;

    // number
    textSize(14);
    var val = quads[i].value;
    var valStr = quads[i].format === "float" ? nf(val, 1, 1) : str(round(val));
    text(valStr, qx, qy + 4);

    // label
    textSize(8);
    fill(0);
    text(quads[i].label, qx, qy + 18);
    fill(0);
  }

  // ── HEART + BPM ───────────────────────────────────────────
  var heartY = WATCH_R * 0.62;
  drawPixelHeart(cx - 24, cy + heartY, 10);

  fill(0);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(14);
  textFont('monospace');
  var bpmStr = bpm > 0 ? str(bpm) : '--';
  text(bpmStr, cx - 4, cy + heartY);

  drawingContext.restore();

  // ── INDICATOR DOT ─────────────────────────────────────────
  var indX = cx - WATCH_R - 30;
  var indY = cy - WATCH_R - 30;
  stroke(0);
  strokeWeight(1);
  if (indicatorFill > 0.5) {
    fill(0);
  } else {
    noFill();
  }
  ellipse(indX, indY, 18, 18);

  // ── INSTRUCTIONS ──────────────────────────────────────────
  noStroke();
  fill(180);
  textSize(10);
  textFont('monospace');
  textAlign(CENTER, BOTTOM);
  text('SPACE / TAP to pulse', width / 2, height - 16);
}

// ── Q1: BARREL WITH WATER ───────────────────────────────────────

function drawBarrel(bx, by, t) {
  var bw = 30;
  var bh = 28;
  var iconY = by - 22;

  // barrel outline
  noFill();
  stroke(0);
  strokeWeight(1);
  // body
  rect(round(bx - bw / 2), round(iconY - bh / 2), bw, bh);
  // hoops
  line(bx - bw / 2, round(iconY - bh * 0.15), bx + bw / 2, round(iconY - bh * 0.15));
  line(bx - bw / 2, round(iconY + bh * 0.15), bx + bw / 2, round(iconY + bh * 0.15));

  // water fill (from bottom up)
  var fillH = bh * waterLevel;
  var waterTop = iconY + bh / 2 - fillH;

  // water surface wave
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.rect(bx - bw / 2, iconY - bh / 2, bw, bh);
  drawingContext.clip();

  fill(0);
  noStroke();
  beginShape();
  for (var x = -bw / 2; x <= bw / 2; x += 2) {
    var wy = waterTop + sin(x * 0.3 + t * 2) * 1.5;
    vertex(round(bx + x), round(wy));
  }
  vertex(round(bx + bw / 2), round(iconY + bh / 2));
  vertex(round(bx - bw / 2), round(iconY + bh / 2));
  endShape(CLOSE);

  drawingContext.restore();

  // redraw barrel outline on top
  noFill();
  stroke(0);
  strokeWeight(1);
  rect(round(bx - bw / 2), round(iconY - bh / 2), bw, bh);
}

// ── Q2: METABALL ↔ DIAMOND ─────────────────────────────────────

function drawMetaball(mx, my, t) {
  var iconY = my - 22;
  var r = 14;
  var steps = 36;

  noFill();
  stroke(0);
  strokeWeight(1);

  beginShape();
  for (var i = 0; i <= steps; i++) {
    var a = TWO_PI * i / steps;

    // blob shape (perlin noise offset)
    var blobR = r + (noise(blobNoiseTime + cos(a) * 2, sin(a) * 2) - 0.5) * 8;

    // diamond shape
    var diamondR = r / (abs(cos(a)) + abs(sin(a)));

    // morph between them
    var finalR = lerp(blobR, diamondR, morphT);
    var px = mx + cos(a) * finalR;
    var py = iconY + sin(a) * finalR;
    vertex(round(px), round(py));
  }
  endShape(CLOSE);
}

// ── Q3: WORM (sine chain of circles) ────────────────────────────

function drawWorm(wx, wy, t) {
  var iconY = wy - 22;
  var segR = 3;
  var spacing = 5;

  noFill();
  stroke(0);
  strokeWeight(1);

  for (var i = 0; i < WORM_SEGMENTS; i++) {
    var xOff = (i - WORM_SEGMENTS / 2) * spacing;
    var yOff = sin(wormPhase + i * 0.8) * wormAmp;
    var sx = round(wx + xOff);
    var sy = round(iconY + yOff);
    ellipse(sx, sy, segR * 2, segR * 2);
  }
}

// ── Q4: DOTS (free wander ↔ concentrated assembly) ──────────────

function drawDots(dx, dy, t) {
  var iconY = dy - 22;

  // update dot positions
  for (var i = 0; i < dots.length; i++) {
    var d = dots[i];

    if (dotsMode === 0) {
      // free wander — perlin drift
      d.vx += (noise(d.noiseSeed + t * 0.3) - 0.5) * 0.15;
      d.vy += (noise(d.noiseSeed + 100 + t * 0.3) - 0.5) * 0.15;
    } else {
      // assemble toward center
      var tx = 0;
      var ty = 0;
      d.vx += (tx - d.x) * 0.02;
      d.vy += (ty - d.y) * 0.02;
      // add erratic jitter when assembled
      d.vx += (noise(d.noiseSeed + t * 2) - 0.5) * 0.4;
      d.vy += (noise(d.noiseSeed + 200 + t * 2) - 0.5) * 0.4;
    }

    d.vx *= 0.92;
    d.vy *= 0.92;
    d.x += d.vx;
    d.y += d.vy;

    // contain within quadrant area
    var maxR = 28;
    var dd = sqrt(d.x * d.x + d.y * d.y);
    if (dd > maxR) {
      d.x *= maxR / dd;
      d.y *= maxR / dd;
      d.vx *= -0.5;
      d.vy *= -0.5;
    }
  }

  // draw
  fill(0);
  noStroke();
  for (var i = 0; i < dots.length; i++) {
    var d = dots[i];
    var s = 2;
    rect(round(dx + d.x) - 1, round(iconY + d.y) - 1, s, s);
  }
}

// ── PULSE ───────────────────────────────────────────────────────

function registerPulse() {
  var now = millis();

  if (lastPulseMs > 0) {
    var interval = now - lastPulseMs;
    if (interval > 250 && interval < 3000) {
      bpmHistory.push(60000 / interval);
      if (bpmHistory.length > 6) bpmHistory.shift();
      var sum = 0;
      for (var i = 0; i < bpmHistory.length; i++) sum += bpmHistory[i];
      bpm = constrain(round(sum / bpmHistory.length), 55, 130);
    }
  }
  lastPulseMs = now;
  lastBeatTime = now;
  indicatorFill = 1;
  manualPulse = true;

  // cycle quadrant values on pulse
  for (var i = 0; i < 4; i++) {
    var labels = quadLabels[i];
    quads[i].label = labels[floor(random(labels.length))];
  }

  // Q1: new water target
  waterTarget = random(0.15, 0.9);
  quads[0].targetValue = round(waterTarget * 150);

  // Q2: new morph target + reverse direction
  morphDir *= -1;
  quads[1].targetValue = random(0.1, 2.4);

  // Q3: new worm speed/amplitude
  var newSpeed = random(0.02, 0.12);
  var newAmp = map(newSpeed, 0.02, 0.12, 4, 18);
  wormSpeed = newSpeed;
  wormAmp = newAmp;
  quads[2].targetValue = round(map(newSpeed, 0.02, 0.12, 30, 140));

  // Q4: flip dots mode
  dotsMode = 1 - dotsMode;
  dotsModeTimer = now;
  quads[3].targetValue = random(0.1, 2.0);
}

function keyPressed() {
  if (key === ' ') registerPulse();
}

function mousePressed() {
  registerPulse();
}

// ── PIXEL HEART ─────────────────────────────────────────────────

function drawPixelHeart(px, py, s) {
  var grid = [
    [0,1,1,0,1,1,0],
    [1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1],
    [0,1,1,1,1,1,0],
    [0,0,1,1,1,0,0],
    [0,0,0,1,0,0,0]
  ];
  var ps = max(1, floor(s / 5));
  noStroke();
  fill(0);
  for (var row = 0; row < grid.length; row++) {
    for (var col = 0; col < grid[row].length; col++) {
      if (grid[row][col]) {
        rect(px + (col - 3) * ps, py + (row - 3) * ps, ps, ps);
      }
    }
  }
}

// ── CAMERA PULSE DETECTION ──────────────────────────────────────

function getPulseStrength() {
  if (!video || !video.pixels) return 0;
  video.loadPixels();
  var rSum = 0;
  var count = 0;
  var sx = floor(video.width / 2 - 10);
  var sy = floor(video.height / 2 - 10);
  for (var x = sx; x < sx + 20; x++) {
    for (var y = sy; y < sy + 20; y++) {
      var i = (x + y * video.width) * 4;
      if (video.pixels[i]) { rSum += video.pixels[i]; count++; }
    }
  }
  var currentR = count > 0 ? rSum / count : 0;
  var ci = (floor(video.width / 2) + floor(video.height / 2) * video.width) * 4;
  if (video.pixels[ci] < video.pixels[ci + 1] + 10) return 0;
  readings.push(currentR);
  if (readings.length > maxReadings) readings.shift();
  if (readings.length < 5) return 0;
  var avg = 0;
  for (var i = 0; i < readings.length; i++) avg += readings[i];
  avg /= readings.length;
  return max(0, currentR - avg);
}

// ── CAMERA SETUP ────────────────────────────────────────────────

function getVideoDevices() {
  if (navigator.mediaDevices) {
    navigator.mediaDevices.enumerateDevices().then(gotDevices);
  }
}

function gotDevices(deviceInfos) {
  devices = [];
  for (var i = 0; i < deviceInfos.length; i++) {
    if (deviceInfos[i].kind === 'videoinput') devices.push(deviceInfos[i]);
  }
  if (devices.length > 0) {
    var frontIndex = -1;
    for (var i = 0; i < devices.length; i++) {
      if (devices[i].label.toLowerCase().indexOf('front') !== -1) {
        frontIndex = i;
        break;
      }
    }
    if (frontIndex !== -1) currentDeviceIndex = frontIndex;
    startCamera(devices[currentDeviceIndex].deviceId);

    var btn = createButton('Switch Cam');
    btn.position(20, height - 40);
    btn.style('font-family', 'monospace');
    btn.style('font-weight', 'bold');
    btn.style('color', 'black');
    btn.style('background', 'white');
    btn.style('border', '1px solid black');
    btn.mousePressed(function() {
      currentDeviceIndex = (currentDeviceIndex + 1) % devices.length;
      startCamera(devices[currentDeviceIndex].deviceId);
    });
  }
}

function startCamera(id) {
  if (video) video.remove();
  video = createCapture({
    video: { deviceId: { exact: id }, width: 320, height: 240 },
    audio: false
  });
  video.size(320, 240);
  video.elt.setAttribute('playsinline', '');
  video.hide();
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  cx = round(width / 2);
  cy = round(height / 2);
}
