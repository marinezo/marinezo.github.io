/* PROJECT: Pebbles
   THEME: Sensory Transducer / Somatic Calibrator
   AESTHETIC: White bg, Black 1px contours
   - Simple circle pebbles with gravity physics
   - Pulse launches them upward, they settle back down
   - Completely still when no input
*/

var video;
var pebbles = [];
var cx, cy;
var WATCH_R = 200;
var NUM_PEBBLES = 55;

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

function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = round(width / 2);
  cy = round(height / 2);

  // create pebbles — start them packed at bottom
  for (var i = 0; i < NUM_PEBBLES; i++) {
    var r = random(6, 20);
    var ang = random(-PI * 0.8, -PI * 0.2); // spread across bottom half
    var dist_from_center = WATCH_R - r - random(0, WATCH_R * 0.8);
    pebbles.push({
      x: cx + cos(ang) * dist_from_center,
      y: cy - sin(ang) * dist_from_center,
      vx: 0,
      vy: 0,
      r: r
    });
  }

  // let them settle for a few frames
  for (var s = 0; s < 200; s++) {
    physicsTick(false);
  }

  getVideoDevices();
}

function physicsTick(isPulse) {
  var GRAVITY = 0.15;
  var DAMPING = 0.85;
  var STOP_THRESHOLD = 0.1;

  // apply pulse force
  if (isPulse) {
    for (var i = 0; i < pebbles.length; i++) {
      var p = pebbles[i];
      p.vx += random(-3, 3);
      p.vy += random(-12, -6);
    }
  }

  // update positions
  for (var i = 0; i < pebbles.length; i++) {
    var p = pebbles[i];

    p.vy += GRAVITY;
    p.x += p.vx;
    p.y += p.vy;
    p.vx *= DAMPING;
    p.vy *= DAMPING;

    // stop when very slow (prevents trembling)
    if (abs(p.vx) < STOP_THRESHOLD && abs(p.vy) < STOP_THRESHOLD) {
      p.vx = 0;
      p.vy = 0;
    }
  }

  // pebble-to-pebble collisions
  for (var i = 0; i < pebbles.length; i++) {
    for (var j = i + 1; j < pebbles.length; j++) {
      var a = pebbles[i];
      var b = pebbles[j];
      var dx = b.x - a.x;
      var dy = b.y - a.y;
      var d = sqrt(dx * dx + dy * dy);
      var minD = a.r + b.r;
      if (d < minD && d > 0.01) {
        var nx = dx / d;
        var ny = dy / d;
        var overlap = (minD - d) * 0.5;
        a.x -= nx * overlap;
        a.y -= ny * overlap;
        b.x += nx * overlap;
        b.y += ny * overlap;

        // exchange velocity along collision normal
        var relVx = a.vx - b.vx;
        var relVy = a.vy - b.vy;
        var dot = relVx * nx + relVy * ny;
        if (dot > 0) {
          a.vx -= nx * dot * 0.5;
          a.vy -= ny * dot * 0.5;
          b.vx += nx * dot * 0.5;
          b.vy += ny * dot * 0.5;
        }
      }
    }
  }

  // boundary: keep inside circle
  for (var i = 0; i < pebbles.length; i++) {
    var p = pebbles[i];
    var dx = p.x - cx;
    var dy = p.y - cy;
    var d = sqrt(dx * dx + dy * dy);
    var maxD = WATCH_R - p.r - 1;
    if (d > maxD && d > 0.01) {
      var nx = dx / d;
      var ny = dy / d;
      p.x = cx + nx * maxD;
      p.y = cy + ny * maxD;

      // reflect velocity
      var dot = p.vx * nx + p.vy * ny;
      if (dot > 0) {
        p.vx -= 2 * dot * nx * 0.4;
        p.vy -= 2 * dot * ny * 0.4;
      }
    }
  }
}

function draw() {
  background(255);

  var now = millis();

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

  // ── PHYSICS ───────────────────────────────────────────────
  physicsTick(isPulse);

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

  // ── DRAW PEBBLES ──────────────────────────────────────────
  fill(255);
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < pebbles.length; i++) {
    var p = pebbles[i];
    ellipse(round(p.x), round(p.y), round(p.r * 2), round(p.r * 2));
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
  cx = width / 2;
  cy = height / 2;
}
