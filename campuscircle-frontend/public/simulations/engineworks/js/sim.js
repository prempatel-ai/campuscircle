/* sim.js: the state machine that walks one power unit down the line.
 *
 * A "run" is one complete build: goods-in to delivery, then the return belt
 * home for strip and rebuild, then the line starts the next unit.
 */
(function (global) {
  'use strict';

  var F = global.Factory;
  var Spec = global.Spec;
  var TR = F.track;

  var BASE_SPEED = 5.4;      // grid units / second at 1x

  /* Which stations the viewer has already had explained to them. This
     deliberately survives a reset, because nobody wants to re-read the tour. */
  var tour = { seen: Object.create(null), done: false };

  /* What the thing on the belt looks like after each station. The renderer
     draws cumulatively, so this is also the order the engine grows in. */
  var LEVEL = {
    alloy: 0, cast: 1, heat: 2, machine: 3, coat: 4, metro: 5,
    crank: 6, valve: 7, turbo: 8, hybrid: 9, assy: 10, dyno: 11,
    seal: 12, fit: 13, rebuild: 14
  };

  var state = {
    running: false,
    paused: true,
    finished: false,
    stage: null,              // station id currently being worked
    stageT: 0,
    phase: 'idle',
    level: 0,                 // how far the unit has been built up
    tag: 'PU-04',

    speed: 1,
    rpm: 15000,
    deploy: 350,
    unitsTarget: 3,
    stepMode: false,

    parts: 0,
    materials: {},            // id -> units fitted so far
    log: [],                  // [{id, name}] stations completed this run
    delivered: [],            // [{tag, n}]
    runCount: 0,

    stationIndex: 0,          // 0..15, for the HUD
    stationTotal: F.order.length,

    fastForward: false,
    tourDone: false,
    reading: false,
    dwellLeft: 0,
    dwellTotal: 0,

    /* transient effects the renderer reads */
    workFlash: 0,             // machine is cutting / pouring / firing
    fireFlash: 0,             // dyno ignition
    deliverFlash: 0,
    lastDelivered: null,
    firePhase: 0              // advances with rpm; drives the cylinder strip
  };

  var carrier = {
    routeName: 'main',
    dist: 0,
    dwell: 0,
    stopIdx: 0
  };

  /* ---- the car in the fire-up bay ---------------------------------------- */

  /* The finale is a small state machine of its own, because it is the one
     thing on the site that is not a carrier moving along a belt. `dist` is
     metres down the straight and `v` metres per second, integrated from the
     power on the build sheet rather than keyframed — dial the deployment down
     and the run really is slower, though not by as much as you would think.
     `cam` is how much of the camera the car has taken over, which is what
     stops the view snapping back to the shop the moment it leaves.
     Where the hook is at a given `mount` — and so whether the carrier still
     has anything on it — is the renderer's business, not this file's. */
  var car = {
    present: false,          // a chassis is standing in the bay
    phase: 'wait',           // wait | mount | fire | launch | gone
    t: 0,                    // seconds in this phase
    mount: 0,                // 0..1 through lowering the unit in
    dist: 0, v: 0, fade: 1, cam: 0
  };
  state.car = car;

  function resetCar(present) {
    car.present = !!present;
    car.phase = 'wait';
    car.t = 0;
    car.mount = 0;
    car.dist = 0;
    car.v = 0;
    car.fade = 1;
    car.cam = 0;
  }

  function carPoint() {
    return { x: TR.bayX - car.dist, y: TR.y, z: 0, dx: -1, dy: 0 };
  }

  function updateCar(dt) {
    if (car.phase === 'wait') return;
    var d = dt * state.speed;          /* the same clock the dwell runs on */
    car.t += d;

    if (car.phase === 'mount') {
      car.mount = Math.min(1, car.t / TR.mount);
      if (car.t >= TR.mount) { car.phase = 'fire'; car.t = 0; }
      return;
    }

    if (car.phase === 'fire') {
      car.cam = Math.min(1, car.cam + d / 1.2);
      if (car.t >= TR.fire) { car.phase = 'launch'; car.t = 0; }
      return;
    }

    if (car.phase === 'launch') {
      var kw = Spec.compute(state.rpm, state.deploy).totalKW;
      car.v = Math.max(0, car.v + Spec.launchAccel(car.v, kw) * d);
      car.dist += car.v * d;
      car.cam = Math.min(1, car.cam + d / 0.7);
      var x = TR.bayX - car.dist;
      car.fade = x >= TR.fadeFrom ? 1
        : Math.max(0, (x - TR.fadeTo) / (TR.fadeFrom - TR.fadeTo));
      if (car.fade <= 0 || car.t > TR.launchMax) {
        car.phase = 'gone';
        car.present = false;
        car.t = 0;
      }
      return;
    }

    /* gone: hand the camera back to the shop over a couple of seconds */
    car.cam = Math.max(0, car.cam - d / TR.settle);
  }

  var listeners = [];
  function emit(name, payload) {
    for (var i = 0; i < listeners.length; i++) listeners[i](name, payload);
  }

  /* ---- lifecycle --------------------------------------------------------- */

  function start(tag) {
    state.tag = (tag || 'PU-04').trim() || 'PU-04';
    reset();
    state.running = true;
    state.paused = false;
    emit('reset');
  }

  function reset() {
    state.stage = null;
    state.phase = 'idle';
    state.level = 0;
    state.parts = 0;
    state.materials = {};
    state.log = [];
    state.delivered = [];
    state.runCount = 0;
    state.stationIndex = 0;
    state.finished = false;
    state.fastForward = false;
    state.tourDone = tour.done;
    state.reading = false;
    state.dwellLeft = 0;
    state.dwellTotal = 0;
    state.workFlash = 0;
    state.fireFlash = 0;
    state.deliverFlash = 0;
    state.lastDelivered = null;
    carrier.routeName = 'main';
    carrier.dist = 0;
    carrier.dwell = 0;
    carrier.stopIdx = 0;
    resetCar(true);
  }

  /* A finished unit goes out of the door; the line starts the next one at
     goods-in with an empty pallet. */
  function beginNextUnit() {
    state.level = 0;
    state.parts = 0;
    state.materials = {};
    state.log = [];
    state.stationIndex = 0;
    carrier.routeName = 'main';
    carrier.dist = 0;
    carrier.stopIdx = 0;
    carrier.dwell = 0.4;
    /* A fresh chassis is wheeled into the bay now rather than when the last
       one left, so it does not appear one frame later under a camera that is
       still pointed at the empty bay. */
    resetCar(true);
  }

  /* ---- per-station work -------------------------------------------------- */

  function applyAdds(id) {
    var add = Spec.STATION_ADDS[id];
    if (!add) return;
    state.parts += add.parts;
    Object.keys(add.mat).forEach(function (k) {
      state.materials[k] = (state.materials[k] || 0) + add.mat[k];
      if (state.materials[k] <= 0) delete state.materials[k];
    });
  }

  function work(id) {
    var st = F.stationById[id];
    state.level = LEVEL[id] != null ? LEVEL[id] : state.level;
    state.phase = st ? st.phase : state.phase;
    state.workFlash = 1;
    applyAdds(id);
    state.log.push({ id: id, name: st ? st.name : id });
    state.stationIndex = F.order.indexOf(id) + 1;
  }

  var OPS = {
    alloy: function () { work('alloy'); },
    cast: function () { work('cast'); },
    heat: function () { work('heat'); },
    machine: function () { work('machine'); },
    coat: function () { work('coat'); },
    metro: function () { work('metro'); },
    crank: function () { work('crank'); },
    valve: function () { work('valve'); },
    turbo: function () { work('turbo'); },
    hybrid: function () { work('hybrid'); },
    assy: function () { work('assy'); },

    dyno: function () {
      work('dyno');
      state.fireFlash = 1;
    },

    seal: function () { work('seal'); },

    fit: function () {
      work('fit');
      state.runCount++;
      state.delivered.push({ tag: state.tag, n: state.runCount });
      state.lastDelivered = state.tag + ' #' + state.runCount;
      state.deliverFlash = 1;
    },

    /* the end of the line: the unit goes into a car and the car goes */
    track: function () {
      work('track');
      if (car.present) { car.phase = 'mount'; car.t = 0; }
      /* the main line has now been walked end to end, so the tour is over */
      tour.done = true;
      state.tourDone = true;
    },

    rebuild: function () { work('rebuild'); }
  };

  /* ---- update ------------------------------------------------------------ */

  function routeOf(name) { return F.routes[name]; }

  /* Once every station has been explained there is nothing left to read, so
     the remaining units run at a watchable pace instead of a readable one. */
  function travelBoost() {
    return (state.fastForward ? 2.6 : 1) * (state.tourDone ? 2.6 : 1);
  }
  function dwellBoost() {
    /* stops stay generous even after the tour, because the numbers on them change */
    return (state.fastForward ? 2.6 : 1) * (state.tourDone ? 1.4 : 1);
  }

  function fire(st) {
    state.stage = st.id;
    state.stageT = 0;
    var op = OPS[st.id];
    if (op) op();
    emit('stage', st.id);
  }

  function advanceRoute() {
    if (carrier.routeName === 'main') {
      carrier.routeName = 'ret';
      carrier.dist = 0;
      carrier.stopIdx = 0;
      /* the return belt picks the unit up beside the fire-up bay. Whatever
         state the finale was left in — skipped with S, or played out — the bay
         is empty from here until the next unit starts. */
      resetCar(false);
      state.fastForward = false;
    } else {
      if (state.runCount >= state.unitsTarget) {
        state.finished = true;
        state.paused = true;
        state.stage = 'done';
        emit('stage', 'done');
        return;
      }
      beginNextUnit();
    }
  }

  function update(dt) {
    state.stageT += dt;
    state.workFlash = Math.max(0, state.workFlash - dt * 0.5);
    state.fireFlash = Math.max(0, state.fireFlash - dt * 0.35);
    state.deliverFlash = Math.max(0, state.deliverFlash - dt * 0.8);

    /* The cylinder strip runs whenever the unit is capable of running, which
       from the dyno onwards it is. Slowed by ~500x or it is a blur. */
    if (state.level >= LEVEL.dyno && !state.finished) {
      state.firePhase += dt * (state.rpm / 120) / 500 * 6;
    }

    if (!state.running || state.paused || state.finished) return;

    /* before the dwell check, or the whole finale would be frozen by the very
       stop it is meant to fill */
    updateCar(dt);

    var sdt = dt * state.speed * travelBoost();

    if (carrier.dwell > 0) {
      /* A stop is measured in reading seconds, so only the speed slider scales
         it; the travel boosts must not cut a first read short. */
      carrier.dwell -= dt * state.speed;
      state.dwellLeft = Math.max(0, carrier.dwell);
      if (carrier.dwell <= 0) { state.reading = false; state.dwellTotal = 0; }
      return;
    }

    var route = routeOf(carrier.routeName);
    carrier.dist += BASE_SPEED * sdt;

    var stops = F.stops[carrier.routeName];
    if (carrier.stopIdx < stops.length) {
      var st = stops[carrier.stopIdx];
      if (carrier.dist >= st.dist) {
        carrier.dist = st.dist;
        carrier.stopIdx++;
        var firstTime = !tour.seen[st.id];
        fire(st);
        tour.seen[st.id] = true;
        /* Long stop while there is something new to read; a brief one after.
           A station with something to play out holds for at least that long
           either way. */
        carrier.dwell = firstTime ? (st.read || 12) : st.dwell / dwellBoost();
        if (st.hold) carrier.dwell = Math.max(carrier.dwell, st.hold);
        state.reading = firstTime;
        state.dwellTotal = carrier.dwell;
        state.dwellLeft = carrier.dwell;
        if (state.stepMode) { state.paused = true; state.stepMode = false; }
        return;
      }
    }

    if (carrier.dist >= route.total) advanceRoute();
  }

  /* ---- queries used by the renderer -------------------------------------- */

  /* The belts are polylines with hard corners, so reading one directly makes
     the carrier snap to a new heading the instant it crosses a waypoint.
     Averaging a sample either side rounds the turn and swings the heading
     through it. */
  function smoothAt(route, d, look) {
    var a = route.at(Math.max(0, d - look));
    var m = route.at(d);
    var b = route.at(Math.min(route.total, d + look));
    var hx = b.x - a.x, hy = b.y - a.y;
    var len = Math.hypot(hx, hy) || 1;
    return {
      x: (a.x + 2 * m.x + b.x) / 4,
      y: (a.y + 2 * m.y + b.y) / 4,
      z: (a.z + 2 * m.z + b.z) / 4,
      dx: hx / len, dy: hy / len
    };
  }

  function carrierPosition() {
    return smoothAt(routeOf(carrier.routeName), carrier.dist, 0.8);
  }

  /* What the camera should be looking at, which is the carrier every second of
     the run except the few when there is a car accelerating away from it.
     Blended rather than switched, so the hand-over and the long sweep back to
     the shop are both one continuous move. */
  function viewTarget() {
    var c = carrierPosition();
    if (car.cam <= 0) return c;
    var w = car.cam * car.cam * (3 - 2 * car.cam);       /* smoothstep */
    var p = carPoint();
    return {
      x: c.x + (p.x - c.x) * w,
      y: c.y + (p.y - c.y) * w,
      z: c.z * (1 - w),
      dx: c.dx + (p.dx - c.dx) * w,
      dy: c.dy + (p.dy - c.dy) * w
    };
  }

  /* Live build sheet, recomputed from the sliders every time it is asked for. */
  function sheet() {
    return Spec.compute(state.rpm, state.deploy);
  }

  global.Sim = {
    state: state,
    carrier: carrier,
    car: car,
    carPoint: carPoint,
    LEVEL: LEVEL,
    start: start,
    reset: function () { reset(); emit('reset'); },
    /* forget which stations have been explained, so the slow tour replays */
    replayTour: function () { tour.seen = Object.create(null); tour.done = false; },
    update: update,
    carrierPosition: carrierPosition,
    viewTarget: viewTarget,
    sheet: sheet,
    on: function (fn) { listeners.push(fn); },
    play: function () { if (!state.finished) { state.paused = false; state.running = true; } },
    pause: function () { state.paused = true; },
    toggle: function () { if (state.paused) this.play(); else this.pause(); },
    step: function () {
      if (state.finished) return;
      state.running = true;
      state.stepMode = true;
      state.paused = false;
      if (carrier.dwell > 0) carrier.dwell = 0;
    }
  };
})(window);
