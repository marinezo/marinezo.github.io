// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var BLOB_COUNT   = 14;
var BLOB_MIN_R   = 12;
var BLOB_MAX_R   = 28;
var DAMPING      = 0.92;
var REPULSION    = 1.8;
var CONTAIN_K    = 0.06;
var PULSE_FORCE  = 6;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;

// ── STATE ───────────────────────────────────────────────────────
var blobs = [];
var pulseEnvelope = 0;
var pulseTime     = -9999;
var lastPulseMs   = 0;
var bpm           = 0;
var bpmHistory    = [];
var indicatorFill = 0;
var cx, cy;

// ── SIMULATED PULSE (press SPACE or tap) ────────────────────────
function registerPulse() {
  var now = millis();
  if (lastPulseMs > 0) {
    var interval = now - lastPulseMs;
    if (interval > 250 && interval < 3000) {
      bpmHistory.push(60000 / interval);
      if (bpmHistory.length > 6) bpmHistory.shift();
      var sum = 0;
      for (var i = 0; i < bpmHistory.length; i++) {
        sum += bpmHistory[i];
      }
      bpm = round(sum / bpmHistory.length);
    }
  }
  lastPulseMs = now;
  pulseTime   = now;
  indicatorFill = 1;

  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    var ang = atan2(b.y, b.x) + random(-0.4, 0.4);
    var mag = PULSE_FORCE * random(0.6, 1);
    b.vx += cos(ang) * mag;
    b.vy += sin(ang) * mag;
  }
}

function keyPressed() {
  if (key === ' ') {
    registerPulse();
  }
}

function mousePressed() {
  registerPulse();
}

// ── SETUP ───────────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  for (var i = 0; i < BLOB_COUNT; i++) {
    var r = random(BLOB_MIN_R, BLOB_MAX_R);
    var a = random(TWO_PI);
    var d = random(0, WATCH_R - r - 20);
    blobs.push({
      x: cos(a) * d,
      y: sin(a) * d,
      vx: random(-0.3, 0.3),
      vy: random(-0.3, 0.3),
      r: r
    });
  }
}

// ── DRAW ────────────────────────────────────────────────────────
function draw() {
  background(255);

  var now = millis();

  // envelope (attack / decay)
  var elapsed = now - pulseTime;
  if (elapsed < ATTACK_MS) {
    pulseEnvelope = elapsed / ATTACK_MS;
  } else {
    pulseEnvelope = max(0, 1 - (elapsed - ATTACK_MS) / DECAY_MS);
  }

  // indicator decay
  indicatorFill = max(0, indicatorFill - 0.03);

  // ── PHYSICS ─────────────────────────────────────────────────
  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];

    // contain inside circle
    var dist = sqrt(b.x * b.x + b.y * b.y);
    var maxD = WATCH_R - b.r - 4;
    if (dist > maxD) {
      var nx = b.x / dist;
      var ny = b.y / dist;
      var over = dist - maxD;
      b.vx -= nx * over * CONTAIN_K;
      b.vy -= ny * over * CONTAIN_K;
    }

    // blob-blob repulsion
    for (var j = 0; j < blobs.length; j++) {
      if (j === i) continue;
      var o = blobs[j];
      var dx = b.x - o.x;
      var dy = b.y - o.y;
      var dd = sqrt(dx * dx + dy * dy);
      var minD = b.r + o.r + 2;
      if (dd < minD && dd > 0.1) {
        var f = (minD - dd) / dd * REPULSION;
        b.vx += dx * f * 0.5;
        b.vy += dy * f * 0.5;
      }
    }

    // gentle gravity toward centre
    b.vx -= b.x * 0.002;
    b.vy -= b.y * 0.002;

    // integrate
    b.vx *= DAMPING;
    b.vy *= DAMPING;
    b.x  += b.vx;
    b.y  += b.vy;
  }

  push();
  translate(cx, cy);

  // ── WATCH CIRCLE ────────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  ellipse(0, 0, WATCH_R * 2, WATCH_R * 2);

  // clip inside circle
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(0, 0, WATCH_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── BLOBS ───────────────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < blobs.length; i++) {
    drawPixelCircle(blobs[i].x, blobs[i].y, blobs[i].r);
  }

  // ── HEART + BPM (bottom of circle) ─────────────────────────
  var heartY = WATCH_R * 0.62;
  drawPixelHeart(-24, heartY, 10);

  fill(0);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(14);
  textFont('monospace');
  var bpmStr = bpm > 0 ? str(bpm) : '--';
  text(bpmStr, -4, heartY);

  drawingContext.restore();
  pop();

  // ── INDICATOR DOT (top-left, outside circle) ────────────────
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

  // ── INSTRUCTIONS ────────────────────────────────────────────
  noStroke();
  fill(180);
  textSize(10);
  textFont('monospace');
  textAlign(CENTER, BOTTOM);
  text('SPACE / TAP to pulse', width / 2, height - 16);
}

// ── PIXEL-STYLE CIRCLE (aliased, chunky) ────────────────────────
function drawPixelCircle(px, py, r) {
  var step = max(2, floor(r / 6));
  noFill();
  stroke(0);
  strokeWeight(1);
  beginShape();
  for (var a = 0; a < TWO_PI; a += step / r) {
    var sx = round(px + cos(a) * r);
    var sy = round(py + sin(a) * r);
    vertex(sx, sy);
  }
  endShape(CLOSE);
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

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;
}
