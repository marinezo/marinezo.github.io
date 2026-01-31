/* PROJECT: Vitals
   THEME: Somatic Dashboard / Diagnostic Quadrants
   AESTHETIC: White bg, Black 1px contours
   - Cross divides circle into 4 quadrants
   - Each quadrant: animated icon (centered) + big number + small label (bottom)
   - Q1 (top-left): 3D barrel with water level
   - Q2 (top-right): squishy metaball morphing to diamond
   - Q3 (bottom-left): worm sine chain (tight circles)
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
var quads = [
  { value: 72,  targetValue: 72,  label: "HYDRA",  format: "int" },
  { value: 1.2, targetValue: 1.2, label: "COHERE", format: "float" },
  { value: 88,  targetValue: 88,  label: "RHYTHM", format: "int" },
  { value: 0.7, targetValue: 0.7, label: "FIELD",  format: "float" }
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
var morphT = 0;
var morphDir = 1;
var blobNoiseTime = 0;
var squishT = 0; // squishy wobble time

// Q3: worm
var wormPhase = 0;
var wormSpeed = 0.05;
var wormAmp = 14;
var WORM_SEGMENTS = 10;

// Q4: dots
var dots = [];
var NUM_DOTS = 30;
var dotsMode = 0;
var dotsModeTimer = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = round(width / 2);
  cy = round(height / 2);

  waterLevel = 0.5;
  waterTarget = 0.5;

  // init dots for Q4
  for (var i = 0; i < NUM_DOTS; i++) {
    dots.push({
      x: random(-35, 35),
      y: random(-35, 35),
      vx: random(-1, 1),
      vy: random(-1, 1),
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
  blobNoiseTime += 0.03;
  squishT += 0.06;

  // worm
  wormPhase += wormSpeed;

  // dots mode auto-switch
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
  line(cx, cy - CROSS_LEN, cx, cy + CROSS_LEN);
  line(cx - CROSS_LEN, cy, cx + CROSS_LEN, cy);

  // ── QUADRANTS ─────────────────────────────────────────────
  var qOff = 65;
  var qCenters = [
    { x: cx - qOff, y: cy - qOff },
    { x: cx + qOff, y: cy - qOff },
    { x: cx - qOff, y: cy + qOff },
    { x: cx + qOff, y: cy + qOff }
  ];

  // draw icons (centered in quadrant)
  drawBarrel(qCenters[0].x, qCenters[0].y - 10, t);
  drawMetaball(qCenters[1].x, qCenters[1].y - 10, t);
  drawWorm(qCenters[2].x, qCenters[2].y - 10, t);
  drawDots(qCenters[3].x, qCenters[3].y - 10, t);

  // draw numbers (big) and labels (small) at bottom of quadrant
  fill(0);
  noStroke();
  textFont('monospace');

  for (var i = 0; i < 4; i++) {
    var qx = qCenters[i].x;
    var qy = qCenters[i].y;

    // big number
    textAlign(CENTER, CENTER);
    textSize(22);
    var val = quads[i].value;
    var valStr = quads[i].format === "float" ? nf(val, 1, 1) : str(round(val));
    text(valStr, qx, qy + 26);

    // small label
    textSize(7);
    text(quads[i].label, qx, qy + 42);
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

// ── Q1: 3D BARREL WITH WATER ────────────────────────────────────

function drawBarrel(bx, by, t) {
  var bw = 40;
  var bh = 36;
  var rimH = 8; // ellipse rim height for 3D effect

  // barrel body (two vertical lines)
  noFill();
  stroke(0);
  strokeWeight(1);
  line(round(bx - bw / 2), round(by - bh / 2 + rimH / 2),
       round(bx - bw / 2), round(by + bh / 2 - rimH / 2));
  line(round(bx + bw / 2), round(by - bh / 2 + rimH / 2),
       round(bx + bw / 2), round(by + bh / 2 - rimH / 2));

  // top rim (ellipse)
  noFill();
  stroke(0);
  ellipse(bx, round(by - bh / 2 + rimH / 2), bw, rimH);

  // bottom rim (front half only — back is hidden)
  arc(bx, round(by + bh / 2 - rimH / 2), bw, rimH, 0, PI);

  // middle hoop
  noFill();
  stroke(0);
  arc(bx, by, bw + 2, rimH, 0, PI);

  // water fill clipped to barrel body
  drawingContext.save();
  drawingContext.beginPath();
  // clip rectangle between barrel sides
  drawingContext.rect(bx - bw / 2, by - bh / 2 + rimH / 2, bw, bh - rimH);
  drawingContext.clip();

  var fillH = (bh - rimH) * waterLevel;
  var waterTop = by + bh / 2 - rimH / 2 - fillH;

  fill(0);
  noStroke();
  beginShape();
  for (var x = -bw / 2; x <= bw / 2; x += 2) {
    var wy = waterTop + sin(x * 0.25 + t * 2.5) * 2;
    vertex(round(bx + x), round(wy));
  }
  vertex(round(bx + bw / 2), round(by + bh / 2));
  vertex(round(bx - bw / 2), round(by + bh / 2));
  endShape(CLOSE);

  drawingContext.restore();

  // redraw sides on top of water
  stroke(0);
  strokeWeight(1);
  noFill();
  line(round(bx - bw / 2), round(by - bh / 2 + rimH / 2),
       round(bx - bw / 2), round(by + bh / 2 - rimH / 2));
  line(round(bx + bw / 2), round(by - bh / 2 + rimH / 2),
       round(bx + bw / 2), round(by + bh / 2 - rimH / 2));
  // water surface ellipse hint
  noFill();
  stroke(0);
  var waterSurfY = waterTop;
  if (waterLevel > 0.05) {
    arc(bx, round(waterSurfY), bw, rimH * 0.6, 0, PI);
  }
}

// ── Q2: SQUISHY METABALL ↔ DIAMOND ─────────────────────────────

function drawMetaball(mx, my, t) {
  var r = 22;
  var steps = 48;

  // squish: continuous wobble even at rest
  var sx = 1 + sin(squishT) * 0.08;
  var sy = 1 + sin(squishT + PI) * 0.08;

  noFill();
  stroke(0);
  strokeWeight(1);

  beginShape();
  for (var i = 0; i <= steps; i++) {
    var a = TWO_PI * i / steps;

    // blob shape (perlin noise offset — continuously changing)
    var blobR = r + (noise(blobNoiseTime + cos(a) * 2, sin(a) * 2) - 0.5) * 12;

    // diamond shape
    var diamondR = r * 0.85 / (abs(cos(a)) + abs(sin(a)));

    // morph between them
    var finalR = lerp(blobR, diamondR, morphT);

    // apply squish
    var px = mx + cos(a) * finalR * sx;
    var py = my + sin(a) * finalR * sy;
    vertex(round(px), round(py));
  }
  endShape(CLOSE);
}

// ── Q3: WORM (tight sine chain of circles) ──────────────────────

function drawWorm(wx, wy, t) {
  var segR = 4;
  var spacing = segR * 1.4; // really close together — overlapping

  noFill();
  stroke(0);
  strokeWeight(1);

  for (var i = 0; i < WORM_SEGMENTS; i++) {
    var xOff = (i - WORM_SEGMENTS / 2) * spacing;
    var yOff = sin(wormPhase + i * 0.7) * wormAmp;
    var sx = round(wx + xOff);
    var sy = round(wy + yOff);
    ellipse(sx, sy, segR * 2, segR * 2);
  }
}

// ── Q4: DOTS (free wander ↔ concentrated assembly) ──────────────

function drawDots(dx, dy, t) {
  // update dot positions
  for (var i = 0; i < dots.length; i++) {
    var d = dots[i];

    if (dotsMode === 0) {
      // free wander — faster perlin drift, expansive
      d.vx += (noise(d.noiseSeed + t * 0.8) - 0.5) * 0.4;
      d.vy += (noise(d.noiseSeed + 100 + t * 0.8) - 0.5) * 0.4;
    } else {
      // assemble toward center — stronger pull, tighter group
      d.vx += (0 - d.x) * 0.06;
      d.vy += (0 - d.y) * 0.06;
      // erratic jitter
      d.vx += (noise(d.noiseSeed + t * 3) - 0.5) * 0.8;
      d.vy += (noise(d.noiseSeed + 200 + t * 3) - 0.5) * 0.8;
    }

    d.vx *= 0.88;
    d.vy *= 0.88;
    d.x += d.vx;
    d.y += d.vy;

    // contain within quadrant area
    var maxR = 40;
    var dd = sqrt(d.x * d.x + d.y * d.y);
    if (dd > maxR) {
      d.x *= maxR / dd;
      d.y *= maxR / dd;
      d.vx *= -0.5;
      d.vy *= -0.5;
    }
  }

  // draw as filled circles
  fill(0);
  noStroke();
  for (var i = 0; i < dots.length; i++) {
    var d = dots[i];
    ellipse(round(dx + d.x), round(dy + d.y), 4, 4);
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

  // Q2: reverse morph direction + trigger squish
  morphDir *= -1;
  squishT += 2; // kick the squish
  quads[1].targetValue = random(0.1, 2.4);

  // Q3: new worm speed/amplitude
  var newSpeed = random(0.02, 0.12);
  var newAmp = map(newSpeed, 0.02, 0.12, 4, 22);
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
