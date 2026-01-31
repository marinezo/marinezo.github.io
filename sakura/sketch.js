// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var DAMPING      = 0.97;
var GRAVITY      = 0.03;
var PULSE_FORCE  = 2.0;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;
var TREMBLE_AMP  = 2.5;
var PETAL_DROP_CHANCE = 0.08;
var PETAL_LIFE   = 20000;
var PETAL_FADE   = 6000;
var BLOOM_INTERVAL = 1800;
var MAX_FLOWERS  = 18;

// ── STATE ───────────────────────────────────────────────────────
var flowers = [];
var fallenPetals = [];
var branches = [];            // BranchSegment objects
var loosePetals = [];         // small petals sitting on branches
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
var windEnergy    = 0.1;
var windNoiseTime = 0;

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

// ── FALLEN PETAL ────────────────────────────────────────────────
function createFallenPetal(x, y, size, ang) {
  return {
    x: x, y: y,
    vx: random(-0.6, 0.6),
    vy: random(-1.0, 0.3),
    size: size,
    angle: ang,
    spin: random(-0.005, 0.005),
    noiseSeed: random(1000),
    bornAt: millis(),
    opacity: 1
  };
}

// ── BRANCH SEGMENT (from pasted code) ───────────────────────────
function BranchSegment(startV, endV, thStart, thEnd) {
  this.start = startV;
  this.end = endV;
  this.thStart = thStart;
  this.thEnd = thEnd;
}

BranchSegment.prototype.display = function() {
  fill(255);
  stroke(0);
  strokeWeight(1);

  var dir = p5.Vector.sub(this.end, this.start);
  var perp = createVector(-dir.y, dir.x);
  perp.normalize();

  var p1 = p5.Vector.add(this.start, p5.Vector.mult(perp, this.thStart / 2));
  var p2 = p5.Vector.add(this.start, p5.Vector.mult(perp, -this.thStart / 2));
  var p3 = p5.Vector.add(this.end, p5.Vector.mult(perp, -this.thEnd / 2));
  var p4 = p5.Vector.add(this.end, p5.Vector.mult(perp, this.thEnd / 2));

  beginShape();
  vertex(p1.x, p1.y);
  vertex(p2.x, p2.y);
  vertex(p3.x, p3.y);
  vertex(p4.x, p4.y);
  endShape(CLOSE);
};

// ── LOOSE PETAL (small sakura petal sitting on branch) ───────────
function createLoosePetal(x, y) {
  return {
    x: x, y: y,
    homeX: x, homeY: y,
    size: random(5, 9),
    angle: random(TWO_PI),
    noiseSeed: random(1000),
    alive: true
  };
}

// ── BRANCH GENERATION (recursive, from pasted code) ─────────────
function generateBranch(startV, targetV, thickness, depth) {
  var dir = p5.Vector.sub(targetV, startV);
  var len = dir.mag();

  if (len > 100) {
    dir.setMag(random(60, 100));
    len = dir.mag();
  }

  var endV = p5.Vector.add(startV, dir);

  var branchObj = new BranchSegment(startV, endV, thickness, thickness * 0.8);
  branches.push(branchObj);

  // collect bloom slots (inside circle, on thinner branches)
  if (thickness < 12) {
    var d = dist(endV.x, endV.y, 0, 0);
    if (d < WATCH_R - 15 && random() > 0.5) {
      bloomSlots.push({ x: endV.x, y: endV.y });
    }
  }

  // exit: add loose petals at tips
  if (thickness < 2 || depth > 5) {
    var d = dist(endV.x, endV.y, 0, 0);
    if (d < WATCH_R - 10) {
      loosePetals.push(createLoosePetal(endV.x + random(-6, 6), endV.y + random(-6, 6)));
      if (random() < 0.5) {
        loosePetals.push(createLoosePetal(endV.x + random(-10, 10), endV.y + random(-10, 10)));
      }
    }
    return;
  }

  // recurse
  var numChildren = floor(random(1, 3));
  for (var i = 0; i < numChildren; i++) {
    var angle = dir.heading() + random(-0.5, 0.5);
    var newLen = len * random(0.7, 0.95);
    var newEnd = createVector(
      endV.x + cos(angle) * newLen,
      endV.y + sin(angle) * newLen
    );

    // chance to add loose petal at joint
    if (random() < 0.3) {
      var jd = dist(endV.x, endV.y, 0, 0);
      if (jd < WATCH_R - 10) {
        loosePetals.push(createLoosePetal(endV.x + random(-8, 8), endV.y + random(-8, 8)));
      }
    }

    generateBranch(endV, newEnd, thickness * 0.7, depth + 1);
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
  pulseTime   = now;
  indicatorFill = 1;
  windEnergy = 1.0;

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

  // drop loose petals
  for (var i = 0; i < loosePetals.length; i++) {
    var lp = loosePetals[i];
    if (lp.alive && random() < 0.12) {
      lp.alive = false;
      fallenPetals.push(createFallenPetal(lp.x, lp.y, lp.size, lp.angle));
    }
  }

  // gentle wind swirl on fallen petals
  for (var i = 0; i < fallenPetals.length; i++) {
    var fp = fallenPetals[i];
    // swirl: circular push + random scatter
    var ang = atan2(fp.y, fp.x) + HALF_PI; // perpendicular = swirl direction
    fp.vx += cos(ang) * random(0.4, 1.2) + random(-0.3, 0.3);
    fp.vy += sin(ang) * random(0.4, 1.2) + random(-0.3, -0.05);
    fp.spin += random(-0.004, 0.004);
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
  cx = round(width / 2);
  cy = round(height / 2);

  // Branch 1: from bottom-left outside circle, sweeping up-right
  generateBranch(
    createVector(-WATCH_R * 1.2, WATCH_R * 0.7),
    createVector(WATCH_R * 0.3, -WATCH_R * 0.5),
    22,
    0
  );

  // Branch 2: from right side, sweeping left
  generateBranch(
    createVector(WATCH_R * 1.1, -WATCH_R * 0.3),
    createVector(-50, -100),
    20,
    0
  );

  // Branch 3: from top-left, hanging down
  generateBranch(
    createVector(-WATCH_R * 0.8, -WATCH_R * 1.0),
    createVector(20, 50),
    18,
    0
  );

  // shuffle bloom slots
  for (var i = bloomSlots.length - 1; i > 0; i--) {
    var j = floor(random(i + 1));
    var tmp = bloomSlots[i];
    bloomSlots[i] = bloomSlots[j];
    bloomSlots[j] = tmp;
  }

  // place initial flowers
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

  // wind energy decay (from pasted code)
  windEnergy = lerp(windEnergy, 0.1, 0.05);
  windNoiseTime += 0.01 + (windEnergy * 0.1);

  // ── BLOOM NEW FLOWERS ─────────────────────────────────────
  var aliveCount = 0;
  for (var i = 0; i < flowers.length; i++) {
    if (flowers[i].alive) aliveCount++;
  }
  if (now - lastBloomTime > BLOOM_INTERVAL && aliveCount < MAX_FLOWERS && bloomSlots.length > 0) {
    var si = floor(random(bloomSlots.length));
    var sl = bloomSlots[si];
    var fl = createFlower(sl.x + random(-20, 20), sl.y + random(-20, 20), random(7, 13));
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

    // gentle swirl during pulse envelope
    if (pulseEnvelope > 0.01) {
      var swirlAng = atan2(fp.y, fp.x) + HALF_PI;
      fp.vx += cos(swirlAng) * 0.08 * pulseEnvelope;
      fp.vy += sin(swirlAng) * 0.08 * pulseEnvelope;
      fp.vx += (noise(fp.noiseSeed + t * 3) - 0.5) * 0.2 * pulseEnvelope;
      fp.spin += (noise(fp.noiseSeed + 200 + t * 4) - 0.5) * 0.003 * pulseEnvelope;
    }

    // contain inside circle
    var dd = sqrt(fp.x * fp.x + fp.y * fp.y);
    var maxD = WATCH_R - fp.size - 2;
    if (dd > maxD && dd > 0.1) {
      var nx = fp.x / dd;
      var ny = fp.y / dd;
      var over = dd - maxD;
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
    branches[i].display();
  }

  // ── LOOSE PETALS (small, sitting on branches) ──────────────
  for (var i = 0; i < loosePetals.length; i++) {
    var lp = loosePetals[i];
    if (!lp.alive) continue;

    if (pulseEnvelope > 0.01) {
      var tx = (noise(lp.noiseSeed + t * 2) - 0.5) * TREMBLE_AMP * .5 * pulseEnvelope;
      var ty = (noise(lp.noiseSeed + 10 + t * 20) - 0.5) * TREMBLE_AMP * .5 * pulseEnvelope;
      var rot = (noise(lp.noiseSeed + 888 + t * 25) - 0.5) * .8 * pulseEnvelope;
      drawPetal(lp.homeX + tx, lp.homeY + ty, lp.size, lp.angle + rot);
    } else {
      drawPetal(lp.homeX, lp.homeY, lp.size, lp.angle);
    }
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

// ── DRAW FLOWER (only alive petals) ─────────────────────────────
function drawFlower(fl, t, scale) {
  var s = fl.size * scale;
  var px = fl.x;
  var py = fl.y;
  var a = fl.angle;

  fill(255);
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
  var a = fp.angle + sin(t * 2 + fp.noiseSeed) * 0.1;

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
  var len = size * 1.8;
  var w   = size * 1;

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

  fill(255);
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
  cx = round(width / 2);
  cy = round(height / 2);
}
