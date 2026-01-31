/* PROJECT: Pebbles
   THEME: Sensory Transducer / Somatic Calibrator
   AESTHETIC: White bg, Black 1px contours
*/

var video;
var bubbles = [];
var cx, cy;
var WATCH_R = 200;

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
  pixelDensity(1);
  noSmooth();

  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < 65; i++) {
    bubbles.push(new BlobBubble());
  }

  getVideoDevices();
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

  // ── BUBBLE PHYSICS ────────────────────────────────────────
  var pulseForce = createVector(0, 0);
  if (isPulse) {
    pulseForce = createVector(random(-4, 4), random(-10, -18));
  }
  var gravity = createVector(0, 0.25);

  for (var i = 0; i < bubbles.length; i++) {
    var b = bubbles[i];
    b.applyForce(gravity);
    b.applyForce(pulseForce);
    b.update();
    b.collideWithOthers(bubbles);
    b.checkBoundary();
    b.display();
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

// ── BUBBLE CLASS ────────────────────────────────────────────────

function BlobBubble() {
  var ang = random(PI / 4, 3 * PI / 4);
  var r = random(WATCH_R * 0.5, WATCH_R * 0.8);
  this.pos = createVector(cx + cos(ang) * r, cy + sin(ang) * r);
  this.vel = createVector(0, 0);
  this.acc = createVector(0, 0);
  this.radius = random(5, 24);
  this.drag = 0.90;
  this.noiseOffset = random(1000);
  this.noiseStep = random(0.005, 0.02);
}

BlobBubble.prototype.applyForce = function(f) {
  this.acc.add(f);
};

BlobBubble.prototype.update = function() {
  this.vel.add(this.acc);
  this.vel.mult(this.drag);
  this.pos.add(this.vel);
  this.acc.mult(0);
  this.noiseOffset += this.noiseStep;
};

BlobBubble.prototype.collideWithOthers = function(others) {
  for (var i = 0; i < others.length; i++) {
    var other = others[i];
    if (other !== this) {
      var d = dist(this.pos.x, this.pos.y, other.pos.x, other.pos.y);
      var minDist = this.radius + other.radius;
      if (d < minDist) {
        var push = p5.Vector.sub(this.pos, other.pos).normalize();
        var force = (minDist - d) * 0.25;
        this.acc.add(push.mult(force));
        this.vel.mult(0.95);
      }
    }
  }
};

BlobBubble.prototype.checkBoundary = function() {
  var d = dist(this.pos.x, this.pos.y, cx, cy);
  var maxDist = WATCH_R - this.radius;
  if (d > maxDist) {
    var normal = p5.Vector.sub(createVector(cx, cy), this.pos).normalize();
    var overlap = d - maxDist;
    this.pos.add(p5.Vector.mult(normal, overlap));
    var bounce = this.vel.copy().reflect(normal);
    this.vel = bounce.mult(0.3);
  }
};

BlobBubble.prototype.display = function() {
  // Draw using raw canvas for crisp 1px strokes (no anti-alias)
  var ctx = drawingContext;
  ctx.imageSmoothingEnabled = false;

  // build points
  var pts = [];
  var steps = floor(map(this.radius, 5, 24, 8, 16));
  for (var i = 0; i < steps; i++) {
    var angle = (i / steps) * TWO_PI;
    var wobbleRange = map(this.radius, 5, 24, 1, 4);
    var rOff = map(noise(cos(angle) + 1, sin(angle) + 1, this.noiseOffset), 0, 1, -wobbleRange, wobbleRange);
    var r = this.radius + rOff;
    pts.push({
      x: round(this.pos.x + r * cos(angle)) + 0.5,
      y: round(this.pos.y + r * sin(angle)) + 0.5
    });
  }

  // fill white
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (var i = 1; i < pts.length; i++) {
    ctx.lineTo(pts[i].x, pts[i].y);
  }
  ctx.closePath();
  ctx.fillStyle = '#ffffff';
  ctx.fill();

  // stroke black 1px
  ctx.strokeStyle = '#000000';
  ctx.lineWidth = 1;
  ctx.stroke();
};

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
