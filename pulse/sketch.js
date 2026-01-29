// ── CONFIG ──────────────────────────────────────────────────────
var WATCH_R      = 200;
var DAMPING      = 0.97;
var GRAVITY      = 0.035;
var PULSE_FORCE  = 2.5;
var ATTACK_MS    = 300;
var DECAY_MS     = 1200;
var TREMBLE_AMP  = 3.0;       // how much attached petals shake on pulse
var FALL_CHANCE  = 0.12;      // chance a petal detaches per pulse

// ── STATE ───────────────────────────────────────────────────────
var leaves = [];
var branches = [];            // each: { pts:[], depth:int, thickness:num }
var pulseEnvelope = 0;
var pulseTime     = -9999;
var lastPulseMs   = 0;
var bpm           = 0;
var bpmHistory    = [];
var indicatorFill = 0;
var cx, cy;
var dragging      = null;

// ── SAKURA LEAF ─────────────────────────────────────────────────
function createLeaf(x, y, size, ang) {
  return {
    x: x, y: y,
    homeX: x, homeY: y,       // rest position for tremble
    vx: 0, vy: 0,
    size: size,
    angle: ang,
    spin: random(-0.005, 0.005),
    noiseSeed: random(1000),
    attached: true
  };
}

// ── BRANCH BUILDER ──────────────────────────────────────────────
// builds thick, layered branches that spread across the circle
function buildBranch(x0, y0, ang, len, depth, maxDepth, thickness) {
  if (depth > maxDepth || len < 8) return;

  var pts = [];
  var segments = max(3, floor(len / 5));
  var px = x0;
  var py = y0;
  var curveAmt = (depth === 0) ? 0.06 : 0.12;

  for (var i = 0; i <= segments; i++) {
    pts.push({ x: px, y: py });
    px += cos(ang) * 5;
    py += sin(ang) * 5;
    ang += random(-curveAmt, curveAmt);
  }

  branches.push({ pts: pts, depth: depth, thickness: thickness });

  // place leaves at tips and along thinner branches
  if (depth >= maxDepth - 2) {
    leaves.push(createLeaf(px, py, random(7, 13), ang + random(-0.5, 0.5)));
  }

  // fork sub-branches
  var forkCount = (depth < 2) ? floor(random(2, 4)) : floor(random(1, 3));
  for (var f = 0; f < forkCount; f++) {
    var frac = random(0.3, 0.9);
    var idx = min(floor(segments * frac), pts.length - 1);
    var bp = pts[idx];
    var spread = random(0.3, 1.0) * (random() > 0.5 ? 1 : -1);
    var forkAng = ang + spread;
    var forkLen = len * random(0.45, 0.7);
    var forkThick = thickness * random(0.5, 0.7);
    buildBranch(bp.x, bp.y, forkAng, forkLen, depth + 1, maxDepth, max(1, forkThick));
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

  // wind effect: some fall, others just tremble (handled in draw via envelope)
  for (var i = 0; i < leaves.length; i++) {
    var lf = leaves[i];
    if (lf.attached && random() < FALL_CHANCE) {
      lf.attached = false;
      // gentle wind push
      lf.vx += random(-1.0, 1.0);
      lf.vy += random(-1.5, 0.5);
    }
    if (!lf.attached) {
      // wind gust on already-falling petals
      lf.vx += random(-0.8, 0.8);
      lf.vy += random(-PULSE_FORCE * 0.5, 0.3);
    }
  }
}

function keyPressed() {
  if (key === ' ') registerPulse();
}

function mousePressed() {
  var mx = mouseX - cx;
  var my = mouseY - cy;
  for (var i = leaves.length - 1; i >= 0; i--) {
    var lf = leaves[i];
    var dx = mx - lf.x;
    var dy = my - lf.y;
    if (sqrt(dx * dx + dy * dy) < lf.size + 6) {
      dragging = i;
      lf.attached = false;
      return;
    }
  }
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

  // main trunk: starts from bottom-left, sweeps across
  buildBranch(
    -WATCH_R * 0.85, WATCH_R * 0.55,
    -PI / 5 + random(-0.1, 0.1),
    WATCH_R * 1.6,
    0, 5, 7
  );

  // second layer: from bottom-right, crossing over
  buildBranch(
    WATCH_R * 0.7, WATCH_R * 0.6,
    -PI * 0.7 + random(-0.1, 0.1),
    WATCH_R * 1.1,
    0, 4, 5
  );

  // third layer: from top, arching down
  buildBranch(
    -WATCH_R * 0.3, -WATCH_R * 0.75,
    PI / 6 + random(-0.15, 0.15),
    WATCH_R * 0.9,
    0, 4, 4
  );

  // scatter extra leaves along branches
  for (var i = 0; i < branches.length; i++) {
    var br = branches[i];
    if (br.depth < 2) continue; // only on thinner branches
    for (var j = 0; j < br.pts.length; j++) {
      if (random() > 0.78) {
        leaves.push(createLeaf(
          br.pts[j].x + random(-6, 6),
          br.pts[j].y + random(-6, 6),
          random(5, 11),
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

    if (lf.attached) {
      // tremble in place when pulse active
      if (pulseEnvelope > 0.01) {
        var tremX = (noise(lf.noiseSeed + t * 8) - 0.5) * TREMBLE_AMP * pulseEnvelope;
        var tremY = (noise(lf.noiseSeed + 500 + t * 8) - 0.5) * TREMBLE_AMP * pulseEnvelope;
        lf.x = lf.homeX + tremX;
        lf.y = lf.homeY + tremY;
      } else {
        lf.x = lf.homeX;
        lf.y = lf.homeY;
      }
      continue;
    }

    // gravity
    lf.vy += GRAVITY;

    // fluttering sideways drift
    lf.vx += (noise(lf.noiseSeed + t * 0.5) - 0.5) * 0.06;

    // wind during pulse
    if (pulseEnvelope > 0.01) {
      lf.vx += (noise(lf.noiseSeed + t * 3) - 0.5) * 0.3 * pulseEnvelope;
    }

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
        var f = overlap * 0.06;
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

  // ── BRANCHES (thick, white fill, black contour) ───────────
  for (var i = 0; i < branches.length; i++) {
    var br = branches[i];
    drawThickBranch(br.pts, br.thickness);
  }

  // ── LEAVES ────────────────────────────────────────────────
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
  text('SPACE / TAP to pulse  |  drag petals', width / 2, height - 16);
}

// ── THICK BRANCH (white fill, black contour) ────────────────────
// draws an outlined ribbon along the branch path
function drawThickBranch(pts, thickness) {
  if (pts.length < 2) return;

  // build left and right edges by offsetting perpendicular to direction
  var left = [];
  var right = [];
  for (var i = 0; i < pts.length; i++) {
    // taper: thicker at start, thinner at tip
    var taper = 1 - (i / (pts.length - 1)) * 0.7;
    var w = thickness * taper * 0.5;

    // direction
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
    // perpendicular
    var nx = -dy / mag;
    var ny = dx / mag;

    left.push({ x: pts[i].x + nx * w, y: pts[i].y + ny * w });
    right.push({ x: pts[i].x - nx * w, y: pts[i].y - ny * w });
  }

  // draw as a closed shape: left edge forward, right edge backward
  fill(255);
  stroke(0);
  strokeWeight(1);
  beginShape();
  // left edge
  for (var i = 0; i < left.length; i++) {
    vertex(round(left[i].x), round(left[i].y));
  }
  // right edge reversed
  for (var i = right.length - 1; i >= 0; i--) {
    vertex(round(right[i].x), round(right[i].y));
  }
  endShape(CLOSE);
}

// ── SAKURA LEAF (5-petal contour) ───────────────────────────────
function drawSakuraLeaf(lf, t) {
  var s = lf.size;
  var px = lf.x;
  var py = lf.y;
  var a = lf.angle;

  // wobble when falling
  if (!lf.attached) {
    a += sin(t * 2 + lf.noiseSeed) * 0.2;
  }

  noFill();
  stroke(0);
  strokeWeight(1);

  for (var p = 0; p < 5; p++) {
    var petalAng = a + TWO_PI * p / 5;
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
