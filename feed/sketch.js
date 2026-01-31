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
var prevMsgType = "positive";
var waveMorph = 1;              // 0 = showing prevType, 1 = showing currentType
var NUM_WAVES = 6;
var WAVE_STEP = 3; // pixel step for drawing waves

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
    if (chosenType !== currentMsgType) {
      prevMsgType = currentMsgType;
      waveMorph = 0; // start morphing
    }
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

var WAVE_CIRCLE_R = 52; // radius of the small wave circle

function drawBackgroundFX(now) {
  var t = now * 0.001;

  // morph toward current type
  waveMorph = min(1, waveMorph + 0.015);

  // position: above the current message bubble
  var wcx = center.x;
  var wcy = center.y - CARD_H * 0.5 - WAVE_CIRCLE_R * 0.45;

  // border circle
  noFill();
  stroke(0);
  strokeWeight(1);
  ellipse(wcx, wcy, WAVE_CIRCLE_R * 2, WAVE_CIRCLE_R * 2);

  // clip to wave circle
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(wcx, wcy, WAVE_CIRCLE_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // single wave line inside the small circle
  noFill();
  stroke(0);
  strokeWeight(1);

  beginShape();
  for (var x = -WAVE_CIRCLE_R; x <= WAVE_CIRCLE_R; x += 2) {
    var yPrev = getWaveY(prevMsgType, x, 0, t, wcy);
    var yCurr = getWaveY(currentMsgType, x, 0, t, wcy);
    var wy = yPrev + (yCurr - yPrev) * waveMorph;
    vertex(wcx + x, wy);
  }
  endShape();

  drawingContext.restore();
}

// returns the wave y-offset for a given type at position x
function getWaveY(msgType, x, w, t, baseY) {
  if (msgType === "positive") {
    // sine - gentle
    return baseY + sin(x * 0.08 + t * 0.8 + w * 1.2) * 10;
  } else if (msgType === "authoritative") {
    // sawtooth - sharp
    var period = 30;
    var phase = t * 40 + w * period * 0.3;
    var pos = ((x + phase) % period + period) % period;
    var saw = (pos / period) * 2 - 1;
    return baseY + saw * 15;
  } else {
    // perlin - erratic
    var n1 = noise(x * 0.03 + w * 10 + t * 0.6) * 2 - 1;
    var n2 = noise(x * 0.08 + w * 5 + t * 1.2) * 2 - 1;
    return baseY + (n1 * 20 + n2 * 8);
  }
}

// ── BANANA / C-SHAPE SPEECH BUBBLE ─────────────────────────────

function drawBananaShape(cx, cy, w, h, alcoveR, alcoveGap, shadowOff) {
  // A mild C / banana shape: wide rounded body with a concave alcove
  // at the top center where the wave circle sits.
  // Built from curveVertex points tracing the outline.

  var halfW = w / 2;
  var halfH = h / 2;
  var curveAmount = 0.12; // how curved the banana is (0 = flat, higher = more C)

  // alcove cutout params
  var alcoveW = alcoveR + alcoveGap; // half-width of the concave dip
  var alcoveD = alcoveR * 0.55; // how deep the alcove dips into the body

  var steps = 60;
  var pts = [];

  for (var i = 0; i <= steps; i++) {
    var t = i / steps; // 0..1 around the perimeter

    var px, py;

    if (t <= 0.25) {
      // right side, bottom to top
      var s = t / 0.25; // 0..1
      px = halfW;
      py = halfH - s * h;
      // mild inward curve (banana)
      px -= sin(s * PI) * halfW * curveAmount;
    } else if (t <= 0.5) {
      // top edge, right to left
      var s = (t - 0.25) / 0.25; // 0..1, right to left
      px = halfW - s * w;
      py = -halfH;
      // alcove dip in the center
      var distFromCenter = abs(px) / alcoveW;
      if (distFromCenter < 1) {
        var alcoveCurve = cos(distFromCenter * PI * 0.5);
        py -= alcoveD * alcoveCurve * alcoveCurve;
      }
    } else if (t <= 0.75) {
      // left side, top to bottom
      var s = (t - 0.5) / 0.25; // 0..1
      px = -halfW;
      py = -halfH + s * h;
      // mild inward curve (banana)
      px += sin(s * PI) * halfW * curveAmount;
    } else {
      // bottom edge, left to right
      var s = (t - 0.75) / 0.25; // 0..1
      px = -halfW + s * w;
      py = halfH;
      // mild convex bottom to match banana
      py += sin(s * PI) * halfH * curveAmount * 0.3;
    }

    pts.push({ x: cx + px, y: cy + py + (shadowOff || 0) });
  }

  beginShape();
  // prepend last few for smooth close
  for (var j = pts.length - 3; j < pts.length; j++) {
    curveVertex(pts[j].x, pts[j].y);
  }
  for (var i = 0; i < pts.length; i++) {
    curveVertex(pts[i].x, pts[i].y);
  }
  // append first few for smooth close
  for (var j = 0; j < 3; j++) {
    curveVertex(pts[j].x, pts[j].y);
  }
  endShape(CLOSE);
}

function drawBubble(cx, cy, txt) {
  var baseW = containerRadius * 1.2;
  var h = CARD_H;

  // narrow slightly when near circle edge
  var dy = min(abs(cy - center.y), containerRadius - 1);
  var chord = sqrt(containerRadius * containerRadius - dy * dy) * 2;
  var ratio = chord / (containerRadius * 2);
  var narrowFactor = lerp(1, ratio, 0.25);
  var w = max(80, baseW * narrowFactor);

  var alcoveR = WAVE_CIRCLE_R;
  var alcoveGap = 8;

  // shadow
  fill(0);
  noStroke();
  drawBananaShape(cx, cy, w, h, alcoveR, alcoveGap, 6);

  // main shape
  fill(255);
  stroke(0);
  strokeWeight(1);
  drawBananaShape(cx, cy, w, h, alcoveR, alcoveGap, 0);

  // ── text ──────────────────────────────────────────────────
  fill(0);
  noStroke();
  textFont('Courier New');
  textAlign(CENTER, CENTER);
  textStyle();

  if (txt === "...") {
    var dotS = 5;
    var spacing = 16;
    for (var d = -1; d <= 1; d++) {
      rect(cx + d * spacing - dotS / 2, cy - dotS / 2, dotS, dotS);
    }
  } else {
    textSize(20);
    text(txt, cx, cy + 5);
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
