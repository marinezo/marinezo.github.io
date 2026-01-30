/* PROJECT: Somatic_Secrets_Feed
   - One message centered in circle at a time
   - New message pushes old one up and out
   - "..." appears briefly before real message
   - Rounded rectangle, no tail
   - Mouse press / SPACE triggers pulse
   - Camera pulse detection
*/

var video;
var center;
var containerRadius;

// Messages
var currentMsg = null;   // the visible message
var outgoingMsg = null;  // the one being pushed out
var pendingText = null;  // scheduled real text after "..."
var stateTimer = 0;
var minDuration = 3000;

var CARD_H = 70;
var CORNER_R = 22;

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

  currentMsg = makeMsg("SYSTEM READY");
  currentMsg.y = center.y;

  stateTimer = millis();
  getVideoDevices();
}

function makeMsg(txt) {
  return {
    text: txt,
    y: center.y + containerRadius + CARD_H, // starts below
    targetY: center.y,
    speed: 0.08
  };
}

function pushNewMessage(txt) {
  // current becomes outgoing (push up)
  if (currentMsg) {
    outgoingMsg = currentMsg;
    outgoingMsg.targetY = center.y - containerRadius - CARD_H; // exit top
    outgoingMsg.speed = 0.08;
  }

  // new one enters from bottom
  currentMsg = makeMsg(txt);
}

function triggerNewMessageSequence() {
  // first show "..."
  pushNewMessage("...");

  // then after delay, push real message
  setTimeout(function() {
    var types = ["positive", "authoritative", "suspicious"];
    var chosenType = types[floor(random(types.length))];
    var pool = thoughts[chosenType];
    var txt = pool[floor(random(pool.length))];
    pushNewMessage(txt);
  }, 1200);
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

  // ── ANIMATE + DRAW MESSAGES ───────────────────────────────

  // outgoing (sliding up and out)
  if (outgoingMsg) {
    outgoingMsg.y = lerp(outgoingMsg.y, outgoingMsg.targetY, outgoingMsg.speed);
    var distOut = abs(outgoingMsg.y - outgoingMsg.targetY);
    if (distOut < 2) {
      outgoingMsg = null; // gone
    } else {
      // fade as it exits
      var fadeZone = containerRadius * 0.6;
      var distFromCenter = abs(outgoingMsg.y - center.y);
      var alpha = 1;
      if (distFromCenter > fadeZone) {
        alpha = max(0, 1 - (distFromCenter - fadeZone) / (containerRadius - fadeZone));
      }
      if (alpha > 0.01) {
        drawingContext.globalAlpha = alpha;
        drawRoundedCard(center.x, outgoingMsg.y, outgoingMsg.text);
        drawingContext.globalAlpha = 1;
      }
    }
  }

  // current (sliding to center)
  if (currentMsg) {
    currentMsg.y = lerp(currentMsg.y, currentMsg.targetY, currentMsg.speed);
    drawRoundedCard(center.x, currentMsg.y, currentMsg.text);
  }

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

// ── ROUNDED CARD ────────────────────────────────────────────────

function drawRoundedCard(cx, cy, txt) {
  // width based on chord at this y
  var dy = abs(cy - center.y);
  var maxHalfW = containerRadius * 0.8;
  if (dy < containerRadius) {
    var chord = sqrt(containerRadius * containerRadius - dy * dy);
    maxHalfW = min(maxHalfW, chord - 15);
  }
  var w = max(80, maxHalfW * 2);
  var h = CARD_H;
  var r = min(CORNER_R, h / 2, w / 4);

  fill(255);
  stroke(0);
  strokeWeight(1);
  rectMode(CENTER);
  rect(cx, cy, w, h, r);
  rectMode(CORNER);

  // text
  fill(0);
  noStroke();
  textFont('Courier New');
  textAlign(CENTER, CENTER);

  if (txt === "...") {
    // pixel dots
    var dotS = 4;
    var spacing = 12;
    for (var d = -1; d <= 1; d++) {
      rect(cx + d * spacing - dotS / 2, cy - dotS / 2, dotS, dotS);
    }
  } else {
    textSize(15);
    textStyle(BOLD);
    text(txt, cx, cy - 1);
    textStyle(NORMAL);
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
