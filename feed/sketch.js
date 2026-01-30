/* PROJECT: Somatic_Secrets_Feed
   - One message centered in circle at a time
   - New message pushes old one up and out (ease in-out)
   - "..." appears briefly before real message
   - 90s game speech bubble style
   - Pixel heart + BPM at bottom
   - Mouse press / SPACE triggers pulse
   - Camera pulse detection
*/

var video;
var center;
var containerRadius;

// Messages
var currentMsg = null;
var outgoingMsg = null;
var stateTimer = 0;
var minDuration = 10000;

var CARD_H = 120;
var CORNER_R = 40;
var TRANSITION_MS = 1500; // duration of slide animation

var thoughts = {
  positive: ["ENERGY OPTIMAL", "SYNC COMPLETE", "VIBES DETECTED", "CALM STATE", "RHYTHM GOOD"],
  authoritative: ["TAKE A BREATH", "DRINK WATER", "CORRECT POSTURE", "SLEEP NEEDED", "FOCUS NOW"],
  suspicious: ["PULSE ERRATIC", "WHY NERVOUS?", "HIDING SECRETS", "GUILT FOUND", "WHO IS THAT?"]
};

// Pulse
var readings = [];
var maxReadings = 20;
var lastBeatTime = 0;
var beatThreshold = 1.4;
var indicatorFill = 0;
var bpm = 0;
var bpmHistory = [];
var lastPulseMs = 0;

// Camera
var devices = [];
var currentDeviceIndex = 0;

// Background FX
var currentMsgType = "positive"; // positive, authoritative, suspicious
var calmDots = [];               // floating dots for calm bg
var authLineSpread = 0;          // 0-1, how far lines have spread
var authLineTarget = 0;
var NUM_CALM_DOTS = 40;
var NUM_AUTH_LINES = 12;

// ── EASING ──────────────────────────────────────────────────────
// ease in-out cubic
function easeInOut(t) {
  if (t < 0) return 0;
  if (t > 1) return 1;
  if (t < 0.5) return 4 * t * t * t;
  return 1 - pow(-2 * t + 2, 3) / 2;
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noSmooth();

  center = createVector(width / 2, height / 2);
  containerRadius = min(width, height) * 0.40;

  currentMsg = makeMsg("SYSTEM READY");
  currentMsg.startTime = -TRANSITION_MS; // already settled
  currentMsg.y = center.y;
  currentMsg.msgType = "positive";

  // init calm dots
  for (var i = 0; i < NUM_CALM_DOTS; i++) {
    calmDots.push({
      x: random(-containerRadius, containerRadius),
      y: random(-containerRadius, containerRadius),
      vx: random(-0.3, 0.3),
      vy: random(-0.3, 0.3),
      seed: random(1000)
    });
  }

  stateTimer = millis();
  getVideoDevices();
}

function makeMsg(txt, msgType) {
  return {
    text: txt,
    y: center.y + containerRadius + CARD_H,
    startY: center.y + containerRadius + CARD_H,
    targetY: center.y,
    startTime: millis(),
    msgType: msgType || "none"
  };
}

function pushNewMessage(txt) {
  if (currentMsg) {
    outgoingMsg = currentMsg;
    outgoingMsg.startY = outgoingMsg.y;
    outgoingMsg.targetY = center.y - containerRadius - CARD_H;
    outgoingMsg.startTime = millis();
  }

  currentMsg = makeMsg(txt);
}

function triggerNewMessageSequence() {
  pushNewMessage("...");

  setTimeout(function() {
    var types = ["positive", "authoritative", "suspicious"];
    var chosenType = types[floor(random(types.length))];
    var pool = thoughts[chosenType];
    var txt = pool[floor(random(pool.length))];
    currentMsgType = chosenType;
    var msg = makeMsg(txt, chosenType);
    // do the push manually so we can pass type
    if (currentMsg) {
      outgoingMsg = currentMsg;
      outgoingMsg.startY = outgoingMsg.y;
      outgoingMsg.targetY = center.y - containerRadius - CARD_H;
      outgoingMsg.startTime = millis();
    }
    currentMsg = msg;

    // trigger authoritative line burst
    if (chosenType === "authoritative") {
      authLineTarget = 1;
    }
   }, 2000);
}

function animateY(msg, now) {
  var elapsed = now - msg.startTime;
  var t = easeInOut(elapsed / TRANSITION_MS);
  msg.y = msg.startY + (msg.targetY - msg.startY) * t;
}

function draw() {
  background(255);

  var now = millis();

  // ── SIGNAL ────────────────────────────────────────────────
  var rawSignal = getPulseStrength();
  var boostedSignal = rawSignal * 4;
  var isPulse = (boostedSignal > beatThreshold && now - lastBeatTime > 300);
  if (isPulse) {
    lastBeatTime = now;
    indicatorFill = 1;
  }

  // ── FEED LOGIC ────────────────────────────────────────────
  var timeSinceLast = now - stateTimer;
  if (timeSinceLast > minDuration && isPulse) {
    triggerNewMessageSequence();
    stateTimer = now;
  }

  indicatorFill = max(0, indicatorFill - 0.03);

  // ── INTERFACE CIRCLE ──────────────────────────────────────
  noFill();
  stroke(0);
  strokeWeight(1);
  ellipse(center.x, center.y, containerRadius * 2, containerRadius * 2);

  // ── CLIP ──────────────────────────────────────────────────
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(center.x, center.y, containerRadius - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── BACKGROUND FX ───────────────────────────────────────
  drawBackgroundFX(now);

  // ── OUTGOING MESSAGE ──────────────────────────────────────
  if (outgoingMsg) {
    animateY(outgoingMsg, now);
    var elapsed = now - outgoingMsg.startTime;
    if (elapsed > TRANSITION_MS + 1000) {
      outgoingMsg = null;
    } else {
      var fadeZone = containerRadius * 1;
      var distFromCenter = abs(outgoingMsg.y - center.y);
      var alpha = 1;
      if (distFromCenter > fadeZone) {
        alpha = max(0, 1 - (distFromCenter - fadeZone) / (containerRadius - fadeZone));
      }
      if (alpha > 0.01) {
        drawingContext.globalAlpha = alpha;
        drawBubble(center.x, outgoingMsg.y, outgoingMsg.text);
        drawingContext.globalAlpha = 1;
      }
    }
  }

  // ── CURRENT MESSAGE ───────────────────────────────────────
  if (currentMsg) {
    animateY(currentMsg, now);
    drawBubble(center.x, currentMsg.y, currentMsg.text);
  }

  // ── HEART + BPM ───────────────────────────────────────────
  var heartY = containerRadius * 0.65;
  drawPixelHeart(center.x - 24, center.y + heartY, 10);

  fill(0);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(14);
  textFont('Courier New');
  var bpmStr = bpm > 0 ? str(bpm) : '--';
  text(bpmStr, center.x - 4, center.y + heartY);

  drawingContext.restore();

  // ── INDICATOR DOT ─────────────────────────────────────────
  var indX = center.x - containerRadius - 30;
  var indY = center.y - containerRadius - 30;
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
  fill(0);
  textSize(10);
  textFont('Courier New');
  textAlign(CENTER, BOTTOM);
  text('SPACE / TAP to pulse', width / 2, height - 16);
}

// ── BACKGROUND FX ───────────────────────────────────────────────

function drawBackgroundFX(now) {
  var t = now * 0.001;

  if (currentMsgType === "positive") {
    drawCalmDots(t);
  } else if (currentMsgType === "authoritative") {
    drawAuthLines(t);
  } else if (currentMsgType === "suspicious") {
    drawSuspiciousWaves(t);
  }

  // decay auth lines
  if (currentMsgType === "authoritative") {
    authLineSpread = lerp(authLineSpread, authLineTarget, 0.15); // fast attack
  } else {
    authLineSpread = lerp(authLineSpread, 0, 0.02); // slow decay
    authLineTarget = 0;
  }
}

// ── CALM: floating 2px dots drifting randomly ───────────────────
function drawCalmDots(t) {
  noStroke();
  fill(0);

  for (var i = 0; i < calmDots.length; i++) {
    var d = calmDots[i];

    // gentle perlin drift
    d.vx += (noise(d.seed + t * 0.3) - 0.5) * 0.02;
    d.vy += (noise(d.seed + 500 + t * 0.3) - 0.5) * 0.02;
    d.vx *= 0.98;
    d.vy *= 0.98;
    d.x += d.vx;
    d.y += d.vy;

    // keep inside circle
    var dd = sqrt(d.x * d.x + d.y * d.y);
    if (dd > containerRadius - 5) {
      d.x *= 0.95;
      d.y *= 0.95;
      d.vx *= -0.5;
      d.vy *= -0.5;
    }

    rect(center.x + round(d.x), center.y + round(d.y), 2, 2);
  }
}

// ── AUTHORITATIVE: vertical lines spread from center ────────────
function drawAuthLines(t) {
  if (authLineSpread < 0.01) return;

  stroke(0);
  strokeWeight(1);

  var maxSpread = containerRadius * 0.9;
  var spread = authLineSpread * maxSpread;

  for (var i = 0; i < NUM_AUTH_LINES; i++) {
    // lines evenly distributed, spreading from center
    var frac = (i / (NUM_AUTH_LINES - 1)) * 2 - 1; // -1 to 1
    var lx = center.x + frac * spread;

    // vertical line clipped by circle
    var dx = abs(frac * spread);
    if (dx < containerRadius) {
      var halfH = sqrt(containerRadius * containerRadius - dx * dx);
      line(lx, center.y - halfH, lx, center.y + halfH);
    }
  }
}

// ── SUSPICIOUS: perlin noise waves ──────────────────────────────
function drawSuspiciousWaves(t) {
  noFill();
  stroke(0);
  strokeWeight(1);

  var numWaves = 5;
  var waveSpacing = containerRadius * 2 / (numWaves + 1);

  for (var w = 0; w < numWaves; w++) {
    var baseY = center.y - containerRadius + (w + 1) * waveSpacing;

    beginShape();
    for (var x = -containerRadius; x <= containerRadius; x += 3) {
      var dx = x;
      var maxY = sqrt(max(0, containerRadius * containerRadius - dx * dx));
      var wy = baseY + noise(x * 0.02 + w * 10 + t * 0.8) * 40 - 20;

      // only draw if inside circle
      if (abs(wy - center.y) < maxY) {
        vertex(center.x + x, wy);
      }
    }
    endShape();
  }
}

// ── 90s GAME SPEECH BUBBLE ──────────────────────────────────────

function drawBubble(cx, cy, txt) {
  var baseW = containerRadius * 1.4;
  var dy = min(abs(cy - center.y), containerRadius - 1);
  var chord = sqrt(containerRadius * containerRadius - dy * dy) * 2;
  var ratio = chord / (containerRadius * 2);
  var narrowFactor = lerp(1, ratio, 0.25);
  var w = max(80, baseW * narrowFactor);
  var h = CARD_H;
  var r = min(CORNER_R, h / 2);

  // ── outer bubble shape (double border 90s style) ──────────
  // shadow / outer border
  fill(0);
  noStroke();
  rectMode(CENTER);
  rect(cx + 0, cy + 8, w, h, r);

  // main bubble
  fill(255);
  stroke(0);
  strokeWeight(1);
  rect(cx, cy, w, h, r);
  rectMode(CORNER);

  // ── text ──────────────────────────────────────────────────
  fill(0);
  noStroke();
  textFont('Courier New');
  textAlign(CENTER, CENTER);
  textStyle();

  if (txt === "...") {
    // pixel dots
    var dotS = 5;
    var spacing = 16;
    for (var d = -1; d <= 1; d++) {
      rect(cx + d * spacing - dotS / 2, cy - dotS / 2, dotS, dotS);
    }
  } else {
    textSize(20);
    text(txt, cx, cy - 1);
  }
  textStyle(NORMAL);
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

// ── INPUT ───────────────────────────────────────────────────────

function registerPulse() {
  var now = millis();

  // BPM calculation
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

  lastBeatTime = now;
  indicatorFill = 1;

  var timeSinceLast = now - stateTimer;
  if (timeSinceLast > minDuration) {
    triggerNewMessageSequence();
    stateTimer = now;
  }
}

function keyPressed() {
  if (key === ' ') registerPulse();
}

function mousePressed() {
  registerPulse();
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
    btn.style('font-family', 'Courier New');
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
  center = createVector(width / 2, height / 2);
  containerRadius = min(width, height) * 0.40;
}
