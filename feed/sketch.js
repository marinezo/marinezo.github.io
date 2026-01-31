/* PROJECT: Somatic_Secrets_Feed
   - One message centered in circle at a time
   - New message pushes old one up and out (ease in-out)
   - "..." appears briefly before real message
   - Bowed pill speech bubble (1px stroke, white fill)
   - Pixel heart + BPM at bottom
   - Mouse press / SPACE triggers pulse
   - Camera pulse detection
*/

var video;
var cx, cy;
var WATCH_R = 200;

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
  cx = round(width / 2);
  cy = round(height / 2);

  currentMsg = makeMsg("SYSTEM READY");
  currentMsg.startTime = -TRANSITION_MS; // already settled
  currentMsg.y = cy;
  currentMsg.msgType = "positive";

  stateTimer = millis();
  getVideoDevices();
}

function makeMsg(txt, msgType) {
  return {
    text: txt,
    y: cy + WATCH_R + CARD_H,
    startY: cy + WATCH_R + CARD_H,
    targetY: cy,
    startTime: millis(),
    msgType: msgType || "none"
  };
}

function pushNewMessage(txt) {
  if (currentMsg) {
    outgoingMsg = currentMsg;
    outgoingMsg.startY = outgoingMsg.y;
    outgoingMsg.targetY = cy - WATCH_R - CARD_H;
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
      outgoingMsg.targetY = cy - WATCH_R - CARD_H;
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
  ellipse(cx, cy, WATCH_R * 2, WATCH_R * 2);

  // ── CLIP ──────────────────────────────────────────────────
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(cx, cy, WATCH_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── WAVE BALL ──────────────────────────────────────────
  var ballY = drawWaveBall(now);

  // ── MESSAGE TEXT (plain, below ball) ───────────────────
  var textBaseY = ballY + WAVE_CIRCLE_R + 20;
  var textSlide = 30; // how far text slides in/out

  noStroke();
  textFont('monospace');
  textSize(14);
  textAlign(CENTER, TOP);

  // outgoing message: slides up + fades out
  if (outgoingMsg) {
    var elapsed = now - outgoingMsg.startTime;
    if (elapsed > TRANSITION_MS) {
      outgoingMsg = null;
    } else {
      var t_out = easeInOut(elapsed / TRANSITION_MS);
      var outY = textBaseY - t_out * textSlide;
      var outAlpha = 1 - t_out;
      if (outAlpha > 0.01) {
        drawingContext.globalAlpha = outAlpha;
        fill(0);
        drawMsgText(outgoingMsg.text, cx, outY);
        drawingContext.globalAlpha = 1;
      }
    }
  }

  // current message: slides up from below + fades in
  if (currentMsg) {
    var elapsed = now - currentMsg.startTime;
    var t_in = easeInOut(min(1, elapsed / TRANSITION_MS));
    var inY = textBaseY + textSlide * (1 - t_in);
    var inAlpha = t_in;
    drawingContext.globalAlpha = inAlpha;
    fill(0);
    drawMsgText(currentMsg.text, cx, inY);
    drawingContext.globalAlpha = 1;
  }

  // ── HEART + BPM ───────────────────────────────────────────
  var heartY = WATCH_R * 0.62;
  drawPixelHeart(cx - 24, cy + heartY, 10);

  fill(0);
  noStroke();
  textAlign(LEFT, CENTER);
  textSize(14);
  textFont('monospace');
  var bpmStr = bpm > 0 ? str(bpm) : '--';
  text(bpmStr, cx - 4, cy + heartY);

  drawingContext.restore();

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
  text('SPACE / TAP to pulse', width / 2, height - 16);
}

// ── WAVE BALL ───────────────────────────────────────────────────

var WAVE_CIRCLE_R = 70; // radius of the wave ball

function drawWaveBall(now) {
  var t = now * 0.001;

  // morph toward current type
  waveMorph = min(1, waveMorph + 0.015);

  // position: centered, breathing float
  var wcx = cx;
  var breathe = sin(t * 0.8) * 6;
  var wcy = cy - 20 + breathe;

  // ── black filled sphere ──────────────────────────────────
  fill(0);
  stroke(0);
  strokeWeight(1);
  ellipse(wcx, wcy, WAVE_CIRCLE_R * 2, WAVE_CIRCLE_R * 2);

  // clip to ball
  drawingContext.save();
  drawingContext.beginPath();
  drawingContext.arc(wcx, wcy, WAVE_CIRCLE_R - 1, 0, TWO_PI);
  drawingContext.clip();

  // ── wave line (white on black) ───────────────────────────
  noFill();
  stroke(255);
  strokeWeight(1);

  beginShape();
  for (var x = -WAVE_CIRCLE_R; x <= WAVE_CIRCLE_R; x += 2) {
    var yPrev = getWaveY(prevMsgType, x, 0, t, 0);
    var yCurr = getWaveY(currentMsgType, x, 0, t, 0);
    var wy = yPrev + (yCurr - yPrev) * waveMorph;
    vertex(wcx + x, wcy + wy);
  }
  endShape();

  drawingContext.restore();

  // return current y for text positioning
  return wcy;
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

// ── MESSAGE TEXT HELPER ─────────────────────────────────────────

function drawMsgText(txt, tx, ty) {
  if (txt === "...") {
    var dotS = 4;
    var spacing = 14;
    noStroke();
    for (var d = -1; d <= 1; d++) {
      rect(tx + d * spacing - dotS / 2, ty, dotS, dotS);
    }
  } else {
    text(txt, tx, ty);
  }
}

// ── BOWED PILL SPEECH BUBBLE (unused, kept for reference) ───────

var bowWobbleT = 0;

function drawBowedPill(cx, cy, w, h, bow, offY) {
  // Pill = left semicircle + top line + right semicircle + bottom line
  // Then bow the whole thing: each point shifts up by bow * (1 - (x/halfW)^2)
  // so center bows most, ends stay put.
  var halfW = w / 2;
  var r = h / 2; // semicircle radius
  var straight = halfW - r; // length of straight top/bottom edges

  var pts = [];
  var capSteps = 20;
  var lineSteps = 10;

  // right semicircle (top to bottom, -PI/2 to PI/2)
  for (var i = 0; i <= capSteps; i++) {
    var a = -HALF_PI + (i / capSteps) * PI;
    pts.push({ x: straight + cos(a) * r, y: sin(a) * r });
  }
  // bottom edge (right to left)
  for (var i = 1; i <= lineSteps; i++) {
    var s = i / lineSteps;
    pts.push({ x: straight - s * straight * 2, y: r });
  }
  // left semicircle (bottom to top, PI/2 to 3PI/2)
  for (var i = 0; i <= capSteps; i++) {
    var a = HALF_PI + (i / capSteps) * PI;
    pts.push({ x: -straight + cos(a) * r, y: sin(a) * r });
  }
  // top edge (left to right)
  for (var i = 1; i < lineSteps; i++) {
    var s = i / lineSteps;
    pts.push({ x: -straight + s * straight * 2, y: -r });
  }

  // apply bow: shift y based on x position
  for (var i = 0; i < pts.length; i++) {
    var nx = pts[i].x / halfW; // -1..1
    pts[i].y += bow * (1 - nx * nx);
  }

  beginShape();
  for (var i = 0; i < pts.length; i++) {
    vertex(round(cx + pts[i].x), round(cy + pts[i].y + (offY || 0)));
  }
  endShape(CLOSE);
}

function drawBubble(bx, by, txt) {
  var baseW = WATCH_R * 1.2;
  var h = CARD_H;

  // narrow bubble when near circle edge
  var dy = min(abs(by - cy), WATCH_R - 1);
  var chord = sqrt(WATCH_R * WATCH_R - dy * dy) * 2;
  var ratio = chord / (WATCH_R * 2);
  var narrowFactor = lerp(1, ratio, 0.25);
  var w = max(80, baseW * narrowFactor);

  // gentle random wobble on the bow amount
  bowWobbleT += 0.005;
  var bow = 12 + (noise(bowWobbleT) * 2 - 1) * 5;

  // main pill — 1px stroke, white fill, no shadow
  fill(255);
  stroke(0);
  strokeWeight(1);
  drawBowedPill(bx, by, w, h, bow, 0);

  // ── text ──────────────────────────────────────────────────
  fill(0);
  noStroke();
  textFont('monospace');
  textAlign(CENTER, CENTER);

  var textY = by + bow * 0.5;
  if (txt === "...") {
    var dotS = 5;
    var spacing = 16;
    for (var d = -1; d <= 1; d++) {
      rect(bx + d * spacing - dotS / 2, textY - dotS / 2, dotS, dotS);
    }
  } else {
    textSize(14);
    text(txt, bx, textY);
  }
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
      bpm = constrain(round(sum / bpmHistory.length), 55, 130);
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
    btn.style('font-family', 'monospace');
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
  cx = round(width / 2);
  cy = round(height / 2);
}
