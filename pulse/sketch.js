// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var DAMPING      = 0.97;
var GRAVITY      = 0.03;
var PULSE_FORCE  = 2.0;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;
var TREMBLE_AMP  = 2.5;
var LEAF_TREMBLE = 2.2;
var LEAF_WIGGLE_SPEED = 5;
var PETAL_DROP_CHANCE = 0.08;
var PETAL_LIFE   = 6000;
var PETAL_FADE   = 2000;
var BLOOM_INTERVAL = 1800;     // faster blooming
var MAX_FLOWERS  = 18;         // more flowers

// ── STATE ───────────────────────────────────────────────────────
var flowers = [];
var fallenPetals = [];
var branches = [];
var branchLeaves = [];         // leaves attached to branches
var pulseEnvelope = 0;
var pulseTime     = -9999;
var lastPulseMs   = 0;
var bpm           = 0;
var bpmHistory    = [];
var indicatorFill = 0;
var cx, cy;
var dragging      = null;
var lastBloomTime = 0;
var bloomSlots = [];

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
    budStart: 0,
    budDuration: random(800, 1500),
    alive: true
  };
}

// ── BRANCH LEAF ─────────────────────────────────────────────────
function createBranchLeaf(x, y, size, ang) {
  return {
    x: x, y: y,
    homeX: x, homeY: y,
    size: size,
    angle: ang,
    noiseSeed: random(1000)
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
  var curveAmt = (depth === 0) ? 0.12 : 0.22;

  for (var i = 0; i <= segments; i++) {
    pts.push({ x: px, y: py });
    px += cos(ang) * 4;
    py += sin(ang) * 4;
    ang += random(-curveAmt, curveAmt);
  }

  branches.push({ pts: pts, depth: depth, thickness: thickness });

  // collect bloom slots on thinner branches (inside circle)
  if (depth >= 1) {
    for (var i = 0; i < pts.length; i++) {
      var d = sqrt(pts[i].x * pts[i].x + pts[i].y * pts[i].y);
      if (d < WATCH_R - 15 && random() > 0.6) {
        bloomSlots.push({ x: pts[i].x, y: pts[i].y });
      }
    }
  }

  // place leaves along branches (depth >= 1)
  if (depth >= 1) {
    for (var i = 0; i < pts.length; i++) {
      var d = sqrt(pts[i].x * pts[i].x + pts[i].y * pts[i].y);
      if (d < WATCH_R - 10 && random() > 0.75) {
        var leafAng = ang + random(-1.2, 1.2);
        branchLeaves.push(createBranchLeaf(
          pts[i].x + random(-3, 3),
          pts[i].y + random(-3, 3),
          random(12, 22),
          leafAng
        ));
      }
    }
  }

  // fork sub-branches
  var forkCount = (depth < 2) ? floor(random(3, 5)) : floor(random(1, 3));
  for (var f = 0; f < forkCount; f++) {
    var frac = random(0.25, 0.85);
    var idx = min(floor(segments * frac), pts.length - 1);
    var bp = pts[idx];
    var spread = random(0.35, 1.1) * (random() > 0.5 ? 1 : -1);
    var forkAng = ang + spread;
    var forkLen = len * random(0.4, 0.65);
    var forkThick = thickness * random(0.45, 0.65);
    buildBranch(bp.x, bp.y, forkAng, forkLen, depth + 1, maxDepth, max(2, forkThick));
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
        var petalAng = fl.angle + pt.localAng;
        var px = fl.x + cos(petalAng) * fl.size * 0.35;
        var py = fl.y + sin(petalAng) * fl.size * 0.35;
        fallenPetals.push(createFallenPetal(px, py, fl.size * 0.7, petalAng));
      }
    }
    var anyAlive = false;
    for (var p = 0; p < fl.petals.length; p++) {
      if (fl.petals[p].alive) { anyAlive = true; break; }
    }
    if (!anyAlive) fl.alive = false;
  }

  // gentle wind nudge on fallen petals — mostly sideways, tiny upward
  for (var i = 0; i < fallenPetals.length; i++) {
    var fp = fallenPetals[i];
    fp.vx += random(-0.5, 0.5);           // light sideways drift
    if (fp.y > WATCH_R * 0.5) {
      fp.vy += random(-0.3, -0.05);       // tiny upward nudge if settled
    } else {
      fp.vy += random(-0.1, 0.05);        // barely perceptible
    }
    fp.spin += random(-0.005, 0.005);
  }
}

function keyPressed() {
  if (key === ' ') registerPulse();
}

function mousePressed() {
  var mx = mouseX - cx;
  var my = mouseY - cy;
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

  // main trunk — much thicker
  buildBranch(
    -WATCH_R * 1.3, WATCH_R * 0.8,
    -PI / 6 + random(-0.1, 0.1),
    WATCH_R * 2.2,
    0, 5, 36
  );

  // second branch
  buildBranch(
    WATCH_R * 1.2, WATCH_R * 0.7,
    -PI * 0.75 + random(-0.1, 0.1),
    WATCH_R * 1.6,
    0, 5, 28
  );

  // third from top-left
  buildBranch(
    -WATCH_R * 0.9, -WATCH_R * 1.1,
    PI / 5 + random(-0.1, 0.1),
    WATCH_R * 1.4,
    0, 4, 22
  );

  // shuffle bloom slots
  for (var i = bloomSlots.length - 1; i > 0; i--) {
    var j = floor(random(i + 1));
    var tmp = bloomSlots[i];
    bloomSlots[i] = bloomSlots[j];
    bloomSlots[j] = tmp;
  }

  // place initial flowers — more
  var initialCount = min(12, bloomSlots.length);
  for (var i = 0; i < initialCount; i++) {
    var sl = bloomSlots[i];
    var fl = createFlower(sl.x, sl.y, random(8, 14));
    fl.budding = false;
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

    // gentle sideways breeze during pulse envelope
    if (pulseEnvelope > 0.01) {
      fp.vx += (noise(fp.noiseSeed + t * 3) - 0.5) * 0.15 * pulseEnvelope;
    }

    // contain inside circle
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

  // ── LEAF WIGGLE ────────────────────────────────────────────
  for (var i = 0; i < branchLeaves.length; i++) {
    var lf = branchLeaves[i];
    if (pulseEnvelope > 0.01) {
      var tx = (noise(lf.noiseSeed + t * LEAF_WIGGLE_SPEED) - 0.5) * LEAF_TREMBLE * pulseEnvelope;
      var ty = (noise(lf.noiseSeed + 300 + t * LEAF_WIGGLE_SPEED) - 0.5) * LEAF_TREMBLE * pulseEnvelope;
      lf.x = lf.homeX + tx;
      lf.y = lf.homeY + ty;
      // angle wiggle
      lf.wiggleAng = (noise(lf.noiseSeed + 600 + t * LEAF_WIGGLE_SPEED) - 0.5) * 0.3 * pulseEnvelope;
    } else {
      lf.x = lf.homeX;
      lf.y = lf.homeY;
      lf.wiggleAng = 0;
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

  // ── LEAVES ────────────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < branchLeaves.length; i++) {
    drawLeaf(branchLeaves[i]);
  }

  // ── FLOWERS ───────────────────────────────────────────────
  for (var i = 0; i < flowers.length; i++) {
    var fl = flowers[i];
    if (!fl.alive) continue;
    var scale = 1;
    if (fl.budding) {
      var progress = min(1, (now - fl.budStart) / fl.budDuration);
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

// ── DRAW SAKURA LEAF (wide palmate, white fill, black contour) ──
function drawLeaf(lf) {
  var s = lf.size;
  var px = lf.x;
  var py = lf.y;
  var a = lf.angle + (lf.wiggleAng || 0);

  // sakura leaves have 5 pointed lobes radiating from a stem
  var stemLen = s * 0.4;
  var stemX = px - cos(a) * stemLen;
  var stemY = py - sin(a) * stemLen;

  var perpX = cos(a + HALF_PI);
  var perpY = sin(a + HALF_PI);

  // draw stem
  stroke(0);
  strokeWeight(1);
  beginShape();
  vertex(round(stemX), round(stemY));
  vertex(round(px), round(py));
  endShape();

  // 5 lobes — spread wide
  var lobeAngles = [-0.7, -0.3, 0, 0.3, 0.7];
  var lobeLens   = [0.7,  0.9, 1.0, 0.9, 0.7];

  for (var i = 0; i < 5; i++) {
    var lobeAng = a + lobeAngles[i];
    var lobeLen = s * 0.55 * lobeLens[i];
    var lobeW = s * 0.22;

    var tipLX = px + cos(lobeAng) * lobeLen;
    var tipLY = py + sin(lobeAng) * lobeLen;

    var lPerpX = cos(lobeAng + HALF_PI);
    var lPerpY = sin(lobeAng + HALF_PI);

    var midFrac = 0.45;
    var midX = px + cos(lobeAng) * lobeLen * midFrac;
    var midY = py + sin(lobeAng) * lobeLen * midFrac;

    var c1x = midX + lPerpX * lobeW;
    var c1y = midY + lPerpY * lobeW;
    var c2x = midX - lPerpX * lobeW;
    var c2y = midY - lPerpY * lobeW;

    // serrated tip
    var notchD = lobeLen * 0.12;
    var notchX = tipLX - cos(lobeAng) * notchD;
    var notchY = tipLY - sin(lobeAng) * notchD;

    fill(255);
    stroke(0);
    strokeWeight(1);

    // draw as closed shape
    beginShape();
    vertex(round(px), round(py));
    quadraticVertex(round(c1x), round(c1y), round(tipLX + lPerpX * 1), round(tipLY + lPerpY * 1));
    vertex(round(notchX), round(notchY));
    vertex(round(tipLX - lPerpX * 1), round(tipLY - lPerpY * 1));
    quadraticVertex(round(c2x), round(c2y), round(px), round(py));
    endShape(CLOSE);
  }

  // central vein lines for each lobe
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < 5; i++) {
    var lobeAng = a + lobeAngles[i];
    var lobeLen = s * 0.45 * lobeLens[i];
    beginShape();
    vertex(round(px), round(py));
    vertex(round(px + cos(lobeAng) * lobeLen), round(py + sin(lobeAng) * lobeLen));
    endShape();
  }
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
