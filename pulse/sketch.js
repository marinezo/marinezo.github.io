// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var LEAF_COUNT   = 24;
var DAMPING      = 0.97;
var GRAVITY      = 0.04;      // gentle fall
var PULSE_FORCE  = 3;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;

// ── STATE ───────────────────────────────────────────────────────
var leaves = [];
var branches = [];
var pulseEnvelope = 0;
var pulseTime     = -9999;
var lastPulseMs   = 0;
var bpm           = 0;
var bpmHistory    = [];
var indicatorFill = 0;
var cx, cy;
var dragging      = null;     // index of leaf being dragged

// ── SAKURA LEAF CLASS ───────────────────────────────────────────
function createLeaf(x, y, size, ang) {
  return {
    x: x,
    y: y,
    vx: 0,
    vy: 0,
    size: size,
    angle: ang,             // rotation of the petal
    spin: random(-0.005, 0.005), // slow idle spin
    noiseSeed: random(1000),
    attached: true          // still on branch initially
  };
}

// ── BRANCH STRUCTURE ────────────────────────────────────────────
// A branch is a series of points forming a curved line
function buildBranch(x0, y0, ang, len, depth, maxDepth) {
  if (depth > maxDepth) return;
  var pts = [];
  var segments = floor(len / 6);
  var px = x0;
  var py = y0;
  for (var i = 0; i <= segments; i++) {
    pts.push({ x: px, y: py });
    px += cos(ang) * 6;
    py += sin(ang) * 6;
    ang += random(-0.15, 0.15); // slight organic curve
  }
  branches.push(pts);

  // end of branch: place a leaf
  if (depth >= maxDepth - 1) {
    leaves.push(createLeaf(px, py, random(6, 12), ang + random(-0.5, 0.5)));
  }

  // sub-branches
  if (depth < maxDepth) {
    var branchAt = floor(segments * random(0.4, 0.7));
    var bp = pts[min(branchAt, pts.length - 1)];
    var forkAng = ang + random(0.3, 0.8) * (random() > 0.5 ? 1 : -1);
    buildBranch(bp.x, bp.y, forkAng, len * random(0.5, 0.75), depth + 1, maxDepth);

    // sometimes a second fork
    if (random() > 0.4) {
      var branchAt2 = floor(segments * random(0.5, 0.85));
      var bp2 = pts[min(branchAt2, pts.length - 1)];
      var forkAng2 = ang + random(0.3, 0.7) * (random() > 0.5 ? 1 : -1);
      buildBranch(bp2.x, bp2.y, forkAng2, len * random(0.4, 0.65), depth + 1, maxDepth);
    }
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
      for (var i = 0; i < bpmHistory.length; i++) {
        sum += bpmHistory[i];
      }
      bpm = round(sum / bpmHistory.length);
    }
  }
  lastPulseMs = now;
  pulseTime   = now;
  indicatorFill = 1;

  // shake leaves: detach some, give all a gentle push
  for (var i = 0; i < leaves.length; i++) {
    var lf = leaves[i];
    if (lf.attached && random() > 0.6) {
      lf.attached = false;
    }
    if (!lf.attached) {
      lf.vx += random(-1.2, 1.2);
      lf.vy += random(-PULSE_FORCE, -PULSE_FORCE * 0.2);
    }
  }
}

function keyPressed() {
  if (key === ' ') {
    registerPulse();
  }
}

function mousePressed() {
  // check if clicking a leaf (for dragging)
  var mx = mouseX - cx;
  var my = mouseY - cy;
  for (var i = leaves.length - 1; i >= 0; i--) {
    var lf = leaves[i];
    var dx = mx - lf.x;
    var dy = my - lf.y;
    if (sqrt(dx * dx + dy * dy) < lf.size + 4) {
      dragging = i;
      lf.attached = false;
      return;
    }
  }
  // no leaf hit — register pulse
  registerPulse();
}

function mouseDragged() {
  if (dragging !== null) {
    var lf = leaves[dragging];
    lf.x = mouseX - cx;
    lf.y = mouseY - cy;
    lf.vx = 0;
    lf.vy = 0;
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

  // build branch tree starting from lower-left, growing up-right
  buildBranch(-WATCH_R * 0.6, WATCH_R * 0.3, -PI / 4 + random(-0.2, 0.2), WATCH_R * 0.8, 0, 4);

  // add extra leaves along branches
  for (var i = 0; i < branches.length; i++) {
    var br = branches[i];
    for (var j = 0; j < br.length; j++) {
      if (random() > 0.82) {
        leaves.push(createLeaf(
          br[j].x + random(-4, 4),
          br[j].y + random(-4, 4),
          random(5, 10),
          random(TWO_PI)
        ));
      }
    }
  }
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

  // ── LEAF PHYSICS ──────────────────────────────────────────
  for (var i = 0; i < leaves.length; i++) {
    if (i === dragging) continue;
    var lf = leaves[i];
    if (lf.attached) continue;

    // gravity
    lf.vy += GRAVITY;

    // sideways drift (fluttering)
    lf.vx += (noise(lf.noiseSeed + t * 0.5) - 0.5) * 0.08;

    // contain inside watch circle
    var dist = sqrt(lf.x * lf.x + lf.y * lf.y);
    var maxD = WATCH_R - lf.size - 2;
    if (dist > maxD && dist > 0.1) {
      var nx = lf.x / dist;
      var ny = lf.y / dist;
      var over = dist - maxD;
      lf.vx -= nx * over * 0.05;
      lf.vy -= ny * over * 0.05;
      lf.vx *= 0.9;
      lf.vy *= 0.9;
    }

    // leaf-leaf soft contact
    for (var j = i + 1; j < leaves.length; j++) {
      if (j === dragging) continue;
      var o = leaves[j];
      if (o.attached) continue;
      var dx = lf.x - o.x;
      var dy = lf.y - o.y;
      var dd = sqrt(dx * dx + dy * dy);
      var minD = lf.size + o.size;
      if (dd < minD && dd > 0.1) {
        var overlap = minD - dd;
        var ux = dx / dd;
        var uy = dy / dd;
        var f = overlap * 0.08;
        lf.vx += ux * f;
        lf.vy += uy * f;
        o.vx  -= ux * f;
        o.vy  -= uy * f;
      }
    }

    lf.vx *= DAMPING;
    lf.vy *= DAMPING;
    lf.x  += lf.vx;
    lf.y  += lf.vy;
    lf.angle += lf.spin;
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
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < branches.length; i++) {
    var br = branches[i];
    beginShape();
    // first point repeated for curveVertex
    curveVertex(br[0].x, br[0].y);
    for (var j = 0; j < br.length; j++) {
      curveVertex(br[j].x, br[j].y);
    }
    curveVertex(br[br.length - 1].x, br[br.length - 1].y);
    endShape();
  }

  // ── LEAVES ────────────────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  for (var i = 0; i < leaves.length; i++) {
    drawSakuraLeaf(leaves[i], t);
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
  text('SPACE / TAP to pulse  |  drag leaves', width / 2, height - 16);
}

// ── SAKURA LEAF (5-petal contour) ───────────────────────────────
function drawSakuraLeaf(lf, t) {
  var s = lf.size;
  var px = lf.x;
  var py = lf.y;
  var a = lf.angle;

  // slight wobble when falling
  if (!lf.attached) {
    a += sin(t * 2 + lf.noiseSeed) * 0.15;
  }

  noFill();
  stroke(0);
  strokeWeight(1);

  // draw 5 petals arranged in a circle
  for (var p = 0; p < 5; p++) {
    var petalAng = a + TWO_PI * p / 5;
    var cx2 = px + cos(petalAng) * s * 0.35;
    var cy2 = py + sin(petalAng) * s * 0.35;
    drawPetal(cx2, cy2, s, petalAng);
  }

  // small centre dot
  noStroke();
  fill(0);
  var dotS = max(1, floor(s * 0.15));
  rect(round(px) - floor(dotS/2), round(py) - floor(dotS/2), dotS, dotS);
}

// ── SINGLE PETAL (teardrop contour via bezier) ──────────────────
function drawPetal(px, py, size, ang) {
  var len = size * 0.55;    // petal length from centre
  var w   = size * 0.28;    // petal width

  // tip of petal
  var tipX = px + cos(ang) * len;
  var tipY = py + sin(ang) * len;

  // perpendicular for width
  var perpX = cos(ang + HALF_PI);
  var perpY = sin(ang + HALF_PI);

  // side control points
  var midFrac = 0.45;
  var midX = px + cos(ang) * len * midFrac;
  var midY = py + sin(ang) * len * midFrac;

  var c1x = midX + perpX * w;
  var c1y = midY + perpY * w;
  var c2x = midX - perpX * w;
  var c2y = midY - perpY * w;

  // notch at tip (sakura characteristic)
  var notchDepth = len * 0.15;
  var notchX = tipX - cos(ang) * notchDepth;
  var notchY = tipY - sin(ang) * notchDepth;

  noFill();
  stroke(0);
  strokeWeight(1);

  // left side
  beginShape();
  vertex(round(px), round(py));
  quadraticVertex(round(c1x), round(c1y), round(tipX + perpX * 1.5), round(tipY + perpY * 1.5));
  endShape();

  // notch
  beginShape();
  vertex(round(tipX + perpX * 1.5), round(tipY + perpY * 1.5));
  vertex(round(notchX), round(notchY));
  vertex(round(tipX - perpX * 1.5), round(tipY - perpY * 1.5));
  endShape();

  // right side
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
