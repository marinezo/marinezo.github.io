// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var DAMPING      = 0.97;
var GRAVITY      = 0.03;
var PULSE_FORCE  = 2.0;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;
var TREMBLE_AMP  = 2.5;
var PETAL_DROP_CHANCE = 0.08;  // per petal per pulse
var PETAL_LIFE   = 6000;       // ms before fallen petal fades out
var PETAL_FADE   = 2000;       // ms to fade after life expires
var BLOOM_INTERVAL = 2500;     // ms between new buds appearing
var MAX_FLOWERS  = 10;         // max flowers alive at once

// ── STATE ───────────────────────────────────────────────────────
var flowers = [];              // each has petals[]
var fallenPetals = [];         // detached individual petals
var branches = [];
var pulseEnvelope = 0;
var pulseTime     = -9999;
var lastPulseMs   = 0;
var bpm           = 0;
var bpmHistory    = [];
var indicatorFill = 0;
var cx, cy;
var dragging      = null;      // { type:'petal', flowerIdx, petalIdx } or { type:'fallen', idx }
var lastBloomTime = 0;
var bloomSlots = [];           // positions along branches where flowers can appear

// ── PETAL IN A FLOWER ───────────────────────────────────────────
function createFlowerPetal(ang) {
  return {
    localAng: ang,
    alive: true,
    noiseSeed: random(1000)
  };
}

// ── FLOWER ──────────────────────────────────────────────────────
function createFlower(x, y, size) {
  var petals = [];
  for (var p = 0; p < 5; p++) {
    petals.push(createFlowerPetal(TWO_PI * p / 5));
  }
  return {
    x: x, y: y,
    homeX: x, homeY: y,
    size: size,
    angle: random(TWO_PI),
    petals: petals,
    noiseSeed: random(1000),
    budding: true,
    budStart: 0,              // set when placed
    budDuration: random(800, 1500),
    alive: true
  };
}

// ── FALLEN PETAL ────────────────────────────────────────────────
function createFallenPetal(x, y, size, ang) {
  return {
    x: x, y: y,
    vx: random(-0.6, 0.6),
    vy: random(-1.0, 0.3),
    size: size,
    angle: ang,
    spin: random(-0.02, 0.02),
    noiseSeed: random(1000),
    bornAt: millis(),
    opacity: 1
  };
}

// ── BRANCH BUILDER ──────────────────────────────────────────────
function buildBranch(x0, y0, ang, len, depth, maxDepth, thickness) {
  if (depth > maxDepth || len < 10) return;

  var pts = [];
  var segments = max(4, floor(len / 4));
  var px = x0;
  var py = y0;
  // more curvature
  var curveAmt = (depth === 0) ? 0.10 : 0.18;

  for (var i = 0; i <= segments; i++) {
    pts.push({ x: px, y: py });
    px += cos(ang) * 4;
    py += sin(ang) * 4;
    ang += random(-curveAmt, curveAmt);
  }

  branches.push({ pts: pts, depth: depth, thickness: thickness });

  // collect bloom slots on thinner branches (inside circle)
  if (depth >= 2) {
    for (var i = 0; i < pts.length; i++) {
      var d = sqrt(pts[i].x * pts[i].x + pts[i].y * pts[i].y);
      if (d < WATCH_R - 15 && random() > 0.7) {
        bloomSlots.push({ x: pts[i].x, y: pts[i].y });
      }
    }
  }

  // fork sub-branches
  var forkCount = (depth < 2) ? floor(random(2, 5)) : floor(random(1, 3));
  for (var f = 0; f < forkCount; f++) {
    var frac = random(0.25, 0.85);
    var idx = min(floor(segments * frac), pts.length - 1);
    var bp = pts[idx];
    var spread = random(0.35, 1.1) * (random() > 0.5 ? 1 : -1);
    var forkAng = ang + spread;
    var forkLen = len * random(0.4, 0.65);
    var forkThick = thickness * random(0.45, 0.65);
    buildBranch(bp.x, bp.y, forkAng, forkLen, depth + 1, maxDepth, max(1.5, forkThick));
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
      bpm = round(sum / bpmHistory.length);
    }
  }
  lastPulseMs = now;
  pulseTime   = now;
  indicatorFill = 1;

  // drop individual petals from flowers
  for (var i = 0; i < flowers.length; i++) {
    var fl = flowers[i];
    if (!fl.alive || fl.budding) continue;
    for (var p = 0; p < fl.petals.length; p++) {
      var pt = fl.petals[p];
      if (pt.alive && random() < PETAL_DROP_CHANCE) {
        pt.alive = false;
        // spawn fallen petal at its position
        var petalAng = fl.angle + pt.localAng;
        var px = fl.x + cos(petalAng) * fl.size * 0.35;
        var py = fl.y + sin(petalAng) * fl.size * 0.35;
        fallenPetals.push(createFallenPetal(px, py, fl.size * 0.7, petalAng));
      }
    }
    // check if flower is empty
    var anyAlive = false;
    for (var p = 0; p < fl.petals.length; p++) {
      if (fl.petals[p].alive) { anyAlive = true; break; }
    }
    if (!anyAlive) fl.alive = false;
  }

  // wind gust on already-fallen petals
  for (var i = 0; i < fallenPetals.length; i++) {
    var fp = fallenPetals[i];
    fp.vx += random(-0.6, 0.6);
    fp.vy += random(-PULSE_FORCE * 0.4, 0.2);
  }
}

function keyPressed() {
  if (key === ' ') registerPulse();
}

function mousePressed() {
  var mx = mouseX - cx;
  var my = mouseY - cy;
  // check fallen petals
  for (var i = fallenPetals.length - 1; i >= 0; i--) {
    var fp = fallenPetals[i];
    var dx = mx - fp.x;
    var dy = my - fp.y;
    if (sqrt(dx * dx + dy * dy) < fp.size + 5) {
      dragging = { type: 'fallen', idx: i };
      return;
    }
  }
  registerPulse();
}

function mouseDragged() {
  if (dragging !== null) {
    if (dragging.type === 'fallen') {
      var fp = fallenPetals[dragging.idx];
      fp.x = mouseX - cx;
      fp.y = mouseY - cy;
      fp.vx = 0;
      fp.vy = 0;
    }
  }
}

function mouseReleased() {
  dragging = null;
}

// ── SETUP ───────────────────────────────────────────────────────
function setup() {
  createCanvas(windowWidth, windowHeight);
  cx = width / 2;
  cy = height / 2;

  // main trunk: starts well outside circle, sweeps across
  buildBranch(
    -WATCH_R * 1.3, WATCH_R * 0.8,
    -PI / 6 + random(-0.1, 0.1),
    WATCH_R * 2.2,
    0, 5, 12
  );

  // second branch from outside right
  buildBranch(
    WATCH_R * 1.2, WATCH_R * 0.7,
    -PI * 0.75 + random(-0.1, 0.1),
    WATCH_R * 1.6,
    0, 5, 9
  );

  // third from outside top-left
  buildBranch(
    -WATCH_R * 0.9, -WATCH_R * 1.1,
    PI / 5 + random(-0.1, 0.1),
    WATCH_R * 1.4,
    0, 4, 7
  );

  // shuffle bloom slots
  for (var i = bloomSlots.length - 1; i > 0; i--) {
    var j = floor(random(i + 1));
    var tmp = bloomSlots[i];
    bloomSlots[i] = bloomSlots[j];
    bloomSlots[j] = tmp;
  }

  // place initial flowers (fewer)
  var initialCount = min(6, bloomSlots.length);
  for (var i = 0; i < initialCount; i++) {
    var sl = bloomSlots[i];
    var fl = createFlower(sl.x, sl.y, random(8, 14));
    fl.budding = false; // start fully bloomed
    flowers.push(fl);
  }

  lastBloomTime = millis();
}

// ── DRAW ────────────────────────────────────────────────────────
function draw() {
  background(255);

  var now = millis();
  var t = now * 0.001;

  // envelope
  var elapsed = now - pulseTime;
  if (elapsed < ATTACK_MS) {
    pulseEnvelope = elapsed / ATTACK_MS;
  } else {
    pulseEnvelope = max(0, 1 - (elapsed - ATTACK_MS) / DECAY_MS);
  }

  indicatorFill = max(0, indicatorFill - 0.03);

  // ── BLOOM NEW FLOWERS ─────────────────────────────────────
  var aliveCount = 0;
  for (var i = 0; i < flowers.length; i++) {
    if (flowers[i].alive) aliveCount++;
  }
  if (now - lastBloomTime > BLOOM_INTERVAL && aliveCount < MAX_FLOWERS && bloomSlots.length > 0) {
    // pick a random slot
    var si = floor(random(bloomSlots.length));
    var sl = bloomSlots[si];
    var fl = createFlower(sl.x + random(-4, 4), sl.y + random(-4, 4), random(7, 13));
    fl.budStart = now;
    flowers.push(fl);
    lastBloomTime = now;
  }

  // ── FALLEN PETAL PHYSICS ──────────────────────────────────
  for (var i = fallenPetals.length - 1; i >= 0; i--) {
    var fp = fallenPetals[i];

    // age and fade
    var age = now - fp.bornAt;
    if (age > PETAL_LIFE + PETAL_FADE) {
      fallenPetals.splice(i, 1);
      if (dragging !== null && dragging.type === 'fallen') {
        if (dragging.idx === i) dragging = null;
        else if (dragging.idx > i) dragging.idx--;
      }
      continue;
    }
    if (age > PETAL_LIFE) {
      fp.opacity = 1 - (age - PETAL_LIFE) / PETAL_FADE;
    }

    if (dragging !== null && dragging.type === 'fallen' && dragging.idx === i) continue;

    fp.vy += GRAVITY;
    fp.vx += (noise(fp.noiseSeed + t * 0.5) - 0.5) * 0.05;

    if (pulseEnvelope > 0.01) {
      fp.vx += (noise(fp.noiseSeed + t * 3) - 0.5) * 0.25 * pulseEnvelope;
    }

    // contain
    var dist = sqrt(fp.x * fp.x + fp.y * fp.y);
    var maxD = WATCH_R - fp.size - 2;
    if (dist > maxD && dist > 0.1) {
      var nx = fp.x / dist;
      var ny = fp.y / dist;
      var over = dist - maxD;
      fp.vx -= nx * over * 0.05;
      fp.vy -= ny * over * 0.05;
      fp.vx *= 0.9;
      fp.vy *= 0.9;
    }

    fp.vx *= DAMPING;
    fp.vy *= DAMPING;
    fp.x += fp.vx;
    fp.y += fp.vy;
    fp.angle += fp.spin;
  }

  // ── FLOWER TREMBLE ────────────────────────────────────────
  for (var i = 0; i < flowers.length; i++) {
    var fl = flowers[i];
    if (!fl.alive) continue;
    if (fl.budding) {
      if (now - fl.budStart > fl.budDuration) {
        fl.budding = false;
      }
    }
    if (pulseEnvelope > 0.01) {
      var tremX = (noise(fl.noiseSeed + t * 8) - 0.5) * TREMBLE_AMP * pulseEnvelope;
      var tremY = (noise(fl.noiseSeed + 500 + t * 8) - 0.5) * TREMBLE_AMP * pulseEnvelope;
      fl.x = fl.homeX + tremX;
      fl.y = fl.homeY + tremY;
    } else {
      fl.x = fl.homeX;
      fl.y = fl.homeY;
    }
  }

  translate(cx, cy);

  // ── WATCH CIRCLE ──────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  ellipse(0, 0, WATCH_R * 2, WATCH_R * 2);

  // clip
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(0, 0, WATCH_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── BRANCHES ──────────────────────────────────────────────
  for (var i = 0; i < branches.length; i++) {
    var br = branches[i];
    drawThickBranch(br.pts, br.thickness);
  }

  // ── FLOWERS ───────────────────────────────────────────────
  for (var i = 0; i < flowers.length; i++) {
    var fl = flowers[i];
    if (!fl.alive) continue;
    var scale = 1;
    if (fl.budding) {
      var progress = min(1, (now - fl.budStart) / fl.budDuration);
      // ease out
      scale = progress * progress * (3 - 2 * progress);
    }
    drawFlower(fl, t, scale);
  }

  // ── FALLEN PETALS ─────────────────────────────────────────
  for (var i = 0; i < fallenPetals.length; i++) {
    drawFallenPetal(fallenPetals[i], t);
  }

  // ── HEART + BPM ───────────────────────────────────────────
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

  translate(-cx, -cy);

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
  text('SPACE / TAP to pulse  |  drag petals', width / 2, height - 16);
}

// ── THICK BRANCH (white fill, black contour) ────────────────────
function drawThickBranch(pts, thickness) {
  if (pts.length < 2) return;

  var left = [];
  var right = [];
  for (var i = 0; i < pts.length; i++) {
    var taper = 1 - (i / (pts.length - 1)) * 0.65;
    var w = thickness * taper * 0.5;

    var dx, dy;
    if (i < pts.length - 1) {
      dx = pts[i + 1].x - pts[i].x;
      dy = pts[i + 1].y - pts[i].y;
    } else {
      dx = pts[i].x - pts[i - 1].x;
      dy = pts[i].y - pts[i - 1].y;
    }
    var mag = sqrt(dx * dx + dy * dy);
    if (mag < 0.1) mag = 0.1;
    var nx = -dy / mag;
    var ny = dx / mag;

    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }

  fill(255);
  stroke(0);
  strokeWeight(1);
  beginShape();
  for (var i = 0; i < left.length; i++) {
    vertex(round(left[i].x), round(left[i].y));
  }
  for (var i = right.length - 1; i >= 0; i--) {
    vertex(round(right[i].x), round(right[i].y));
  }
  endShape(CLOSE);
}

// ── DRAW FLOWER (only alive petals) ─────────────────────────────
function drawFlower(fl, t, scale) {
  var s = fl.size * scale;
  var px = fl.x;
  var py = fl.y;
  var a = fl.angle;

  noFill();
  stroke(0);
  strokeWeight(1);

  for (var p = 0; p < fl.petals.length; p++) {
    if (!fl.petals[p].alive) continue;
    var petalAng = a + fl.petals[p].localAng;
    var pcx = px + cos(petalAng) * s * 0.35;
    var pcy = py + sin(petalAng) * s * 0.35;
    drawPetal(pcx, pcy, s, petalAng);
  }

  // centre dot
  noStroke();
  fill(0);
  var dotS = max(1, floor(s * 0.15));
  rect(round(px) - floor(dotS / 2), round(py) - floor(dotS / 2), dotS, dotS);
}

// ── DRAW FALLEN PETAL (single, with opacity) ────────────────────
function drawFallenPetal(fp, t) {
  var a = fp.angle + sin(t * 2 + fp.noiseSeed) * 0.25;

  if (fp.opacity < 1) {
    // use alpha via drawingContext
    drawingContext.globalAlpha = max(0, fp.opacity);
  }

  noFill();
  stroke(0);
  strokeWeight(1);
  drawPetal(fp.x, fp.y, fp.size, a);

  if (fp.opacity < 1) {
    drawingContext.globalAlpha = 1;
  }
}

// ── SINGLE PETAL ────────────────────────────────────────────────
function drawPetal(px, py, size, ang) {
  var len = size * 0.55;
  var w   = size * 0.28;

  var tipX = px + cos(ang) * len;
  var tipY = py + sin(ang) * len;

  var perpX = cos(ang + HALF_PI);
  var perpY = sin(ang + HALF_PI);

  var midFrac = 0.45;
  var midX = px + cos(ang) * len * midFrac;
  var midY = py + sin(ang) * len * midFrac;

  var c1x = midX + perpX * w;
  var c1y = midY + perpY * w;
  var c2x = midX - perpX * w;
  var c2y = midY - perpY * w;

  var notchDepth = len * 0.15;
  var notchX = tipX - cos(ang) * notchDepth;
  var notchY = tipY - sin(ang) * notchDepth;

  noFill();
  stroke(0);
  strokeWeight(1);

  beginShape();
  vertex(round(px), round(py));
  quadraticVertex(round(c1x), round(c1y), round(tipX + perpX * 1.5), round(tipY + perpY * 1.5));
  endShape();

  beginShape();
  vertex(round(tipX + perpX * 1.5), round(tipY + perpY * 1.5));
  vertex(round(notchX), round(notchY));
  vertex(round(tipX - perpX * 1.5), round(tipY - perpY * 1.5));
  endShape();

  beginShape();
  vertex(round(tipX - perpX * 1.5), round(tipY - perpY * 1.5));
  quadraticVertex(round(c2x), round(c2y), round(px), round(py));
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
