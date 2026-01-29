// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var BLOB_COUNT   = 14;
var BLOB_MIN_R   = 14;
var BLOB_MAX_R   = 30;
var DAMPING      = 0.97;      // high damping = thick fluid resistance
var REPULSION    = 0.15;      // gentle, realistic nudge
var CONTAIN_K    = 0.04;
var GRAVITY      = 0.08;      // snow-globe downward drift
var PULSE_FORCE  = 4;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;
var WOBBLE_NODES = 8;         // perimeter deformation points per blob
var WOBBLE_AMP   = 0.12;      // how blobby (fraction of radius)

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

  // gentle upward lift like shaking the snow globe
  for (var i = 0; i < blobs.length; i++) {
    var b = blobs[i];
    b.vx += random(-1.5, 1.5);
    b.vy += random(-PULSE_FORCE, -PULSE_FORCE * 0.3);
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
    // each blob has wobble offsets for organic shape
    var offsets = [];
    for (var n = 0; n < WOBBLE_NODES; n++) {
      offsets.push(random(1000));  // noise seed per node
    }
    blobs.push({
      x: cos(a) * d,
      y: sin(a) * d,
      vx: 0,
      vy: 0,
      r: r,
      offsets: offsets
    });
  }
}

// ── DRAW ────────────────────────────────────────────────────────
function draw() {
  background(255);

  var now = millis();
  var t = now * 0.001; // time in seconds for wobble

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

    // gravity — snow-globe settling
    b.vy += GRAVITY;

    // slight horizontal drift (like floating in water)
    b.vx += (noise(i * 100 + t * 0.3) - 0.5) * 0.04;

    // contain inside circle (slide along bowl)
    var dist = sqrt(b.x * b.x + b.y * b.y);
    var maxD = WATCH_R - b.r - 4;
    if (dist > maxD && dist > 0.1) {
      var nx = b.x / dist;
      var ny = b.y / dist;
      var over = dist - maxD;
      // push back in
      b.vx -= nx * over * CONTAIN_K;
      b.vy -= ny * over * CONTAIN_K;
      // friction along the wall
      b.vx *= 0.95;
      b.vy *= 0.95;
    }

    // blob-blob: soft realistic contact
    for (var j = i + 1; j < blobs.length; j++) {
      var o = blobs[j];
      var dx = b.x - o.x;
      var dy = b.y - o.y;
      var dd = sqrt(dx * dx + dy * dy);
      var minD = b.r + o.r;
      if (dd < minD && dd > 0.1) {
        // proportional to overlap, shared by mass (radius)
        var overlap = minD - dd;
        var ux = dx / dd;
        var uy = dy / dd;
        var totalR = b.r + o.r;
        var ratioB = o.r / totalR; // lighter blob gets pushed more
        var ratioO = b.r / totalR;
        var push = overlap * REPULSION;
        b.vx += ux * push * ratioB;
        b.vy += uy * push * ratioB;
        o.vx -= ux * push * ratioO;
        o.vy -= uy * push * ratioO;
      }
    }

    // integrate with heavy damping (viscous fluid)
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

  // ── BLOBS (blobby organic shapes) ─────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < blobs.length; i++) {
    drawBlob(blobs[i], t);
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

// ── BLOBBY SHAPE (perlin-deformed circle) ───────────────────────
function drawBlob(b, t) {
  var pts = 36; // smooth-ish perimeter
  noFill();
  stroke(0);
  strokeWeight(1);
  beginShape();
  for (var k = 0; k < pts; k++) {
    var ang = TWO_PI * k / pts;
    // blend several noise octaves per node for organic wobble
    var nIdx = floor(k / (pts / WOBBLE_NODES));
    var nVal = noise(b.offsets[nIdx % WOBBLE_NODES] + t * 0.8, ang * 0.5);
    var deform = 1 + (nVal - 0.5) * WOBBLE_AMP * 2;
    var rr = b.r * deform;
    // pixel-snap for chunky aesthetic
    var sx = round(b.x + cos(ang) * rr);
    var sy = round(b.y + sin(ang) * rr);
    curveVertex(sx, sy);
  }
  // close smoothly: repeat first 3 control points
  for (var k = 0; k < 3; k++) {
    var ang = TWO_PI * k / pts;
    var nIdx = floor(k / (pts / WOBBLE_NODES));
    var nVal = noise(b.offsets[nIdx % WOBBLE_NODES] + t * 0.8, ang * 0.5);
    var deform = 1 + (nVal - 0.5) * WOBBLE_AMP * 2;
    var rr = b.r * deform;
    var sx = round(b.x + cos(ang) * rr);
    var sy = round(b.y + sin(ang) * rr);
    curveVertex(sx, sy);
  }
  endShape();
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
