/* PROJECT: Somatic_Secrets_Feed
   THEME: Somatic Calibrator
   - Pixel watch vertical feed inside circle
   - 90s sprite-style speech bubbles (pixel corners)
   - Mouse press / SPACE triggers pulse
   - Camera pulse detection also works
   - "..." spacers between messages
   - Black 1px stroke, white fill, monospace
*/

var video;
var center;
var containerRadius;

// Feed
var messageFeed = [];
var stateTimer = 0;
var minDuration = 4000;

// Layout
var CARD_H = 80;
var GAP = 12;
var PIXEL = 4; // pixel grid unit for corners

// Messages
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

// Camera
var devices = [];
var currentDeviceIndex = 0;

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);
  noSmooth();

  center = createVector(width / 2, height / 2);
  containerRadius = min(width, height) * 0.40;

  addMessageToFeed("SYSTEM READY");
  addMessageToFeed("...");

  stateTimer = millis();
  getVideoDevices();
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

  // ── CLIP + DRAW FEED ──────────────────────────────────────
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(center.x, center.y, containerRadius - 1, 0, TWO_PI);
  drawingContext.clip();

  updateAndDrawFeed();

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
  fill(180);
  textSize(10);
  textFont('Courier New');
  textAlign(CENTER, BOTTOM);
  text('SPACE / TAP to pulse', width / 2, height - 16);
}

// ── FEED ────────────────────────────────────────────────────────

function addMessageToFeed(txt) {
  var msg = {
    text: txt,
    y: center.y + containerRadius + CARD_H,
    targetY: 0,
    tailSide: random() > 0.5 ? 1 : -1,
    tailPos: random(0.25, 0.75) // where along bottom the tail sits
  };

  messageFeed.push(msg);
  recalcTargets();

  if (messageFeed.length > 8) {
    messageFeed.shift();
    recalcTargets();
  }
}

function recalcTargets() {
  var heroIndex = messageFeed.length - 1;
  var startY = center.y + 40;

  for (var i = messageFeed.length - 1; i >= 0; i--) {
    var offset = (heroIndex - i) * (CARD_H + GAP);
    messageFeed[i].targetY = startY - offset;
  }
}

function triggerNewMessageSequence() {
  addMessageToFeed("...");

  setTimeout(function() {
    var types = ["positive", "authoritative", "suspicious"];
    var chosenType = types[floor(random(types.length))];
    var pool = thoughts[chosenType];
    var txt = pool[floor(random(pool.length))];
    addMessageToFeed(txt);
  }, 1500);
}

function updateAndDrawFeed() {
  for (var i = 0; i < messageFeed.length; i++) {
    var m = messageFeed[i];

    // lerp position
    m.y = lerp(m.y, m.targetY, 0.1);

    // width fills most of circle at this y level
    var dy = abs(m.y - center.y);
    var maxHalfW = containerRadius * 0.85;
    if (dy < containerRadius) {
      var chord = sqrt(containerRadius * containerRadius - dy * dy);
      maxHalfW = min(maxHalfW, chord - 10);
    }
    var w = maxHalfW * 2;
    if (w < 60) continue; // too narrow, skip

    drawPixelBubble(center.x, m.y, w, CARD_H, m.tailSide, m.tailPos, m.text);
  }
}

// ── PIXEL SPEECH BUBBLE ─────────────────────────────────────────
// 90s sprite style: stepped pixel corners, flat edges, small triangle tail

function drawPixelBubble(cx, cy, w, h, tailSide, tailPos, txt) {
  var hw = floor(w / 2);
  var hh = floor(h / 2);
  var p = PIXEL; // pixel step size

  // ── BODY: pixel-cornered rectangle ────────────────────────
  // cut corners by p×p steps (2 steps = 8px chamfer)
  fill(255);
  stroke(0);
  strokeWeight(1);

  beginShape();
  // top edge (left to right), with stepped top-left and top-right corners
  vertex(cx - hw + p * 2, cy - hh);
  vertex(cx + hw - p * 2, cy - hh);
  // top-right corner steps
  vertex(cx + hw - p * 2, cy - hh);
  vertex(cx + hw - p,     cy - hh + p);
  vertex(cx + hw,         cy - hh + p * 2);
  // right edge
  vertex(cx + hw,         cy + hh - p * 2);
  // bottom-right corner steps
  vertex(cx + hw - p,     cy + hh - p);
  vertex(cx + hw - p * 2, cy + hh);
  // bottom edge (right to left)
  vertex(cx - hw + p * 2, cy + hh);
  // bottom-left corner steps
  vertex(cx - hw + p,     cy + hh - p);
  vertex(cx - hw,         cy + hh - p * 2);
  // left edge
  vertex(cx - hw,         cy - hh + p * 2);
  // top-left corner steps
  vertex(cx - hw + p,     cy - hh + p);
  vertex(cx - hw + p * 2, cy - hh);
  endShape(CLOSE);

  // ── TAIL: small pixel triangle ────────────────────────────
  var tailW = p * 3;
  var tailH = p * 3;
  var tailX = cx + (hw * 0.4) * tailSide;

  fill(255);
  stroke(0);
  strokeWeight(1);

  // draw tail as stepped pixels (3 rows)
  // cover the border where tail meets body
  noStroke();
  fill(255);
  rect(tailX - tailW / 2 + 1, cy + hh - 1, tailW - 2, 2);

  stroke(0);
  strokeWeight(1);
  // left edge of tail
  line(tailX - tailW / 2, cy + hh, tailX, cy + hh + tailH);
  // right edge of tail
  line(tailX + tailW / 2, cy + hh, tailX, cy + hh + tailH);

  // ── TEXT ───────────────────────────────────────────────────
  fill(0);
  noStroke();
  textFont('Courier New');
  textAlign(CENTER, CENTER);

  if (txt === "...") {
    // draw dots as pixel blocks
    var dotS = p;
    var dotY = cy - 1;
    var spacing = p * 3;
    for (var d = -1; d <= 1; d++) {
      rect(cx + d * spacing - dotS / 2, dotY - dotS / 2, dotS, dotS);
    }
  } else {
    textSize(14);
    textLeading(18);
    text(txt, cx, cy - 2);
  }
}

// ── INPUT ───────────────────────────────────────────────────────

function registerPulse() {
  lastBeatTime = millis();
  indicatorFill = 1;

  var timeSinceLast = millis() - stateTimer;
  if (timeSinceLast > minDuration) {
    triggerNewMessageSequence();
    stateTimer = millis();
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
