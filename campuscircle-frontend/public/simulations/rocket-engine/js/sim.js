/* sim.js: the state machine that walks one engine down the line and then
 * launches it.
 *
 * A "run" is one complete build: goods-in to stage integration, out along the
 * transporter road to the pad, and then the launch sequence — which is its own
 * small state machine, because unlike every station before it, the last stop
 * is not a stop.
 */
(function (global) {
  'use strict';

  var F = global.Factory;
  var Spec = global.Spec;

  var BASE_SPEED = 5.4;      // grid units / second at 1x

  /* Which stations the viewer has already had explained to them. This
     deliberately survives a reset, because nobody wants to re-read the tour. */
  var tour = { seen: Object.create(null), done: false };

  /* What the thing on the belt looks like after each station. The renderer
     draws cumulatively, so this is also the order the engine grows in. */
  var LEVEL = {
    stock: 0, print: 1, machine: 2, channel: 3, braze: 4, nozzle: 5,
    inject: 6, pump: 7, valve: 8, avionics: 9, assy: 10, ndt: 11,
    hotfire: 12, integrate: 13, launch: 13
  };

  /* ---- launch sequence ---------------------------------------------------- */

  /* Durations in seconds at 1x. The countdown is deliberately long enough to
     read the pad copy while it runs, since the launch replaces the reading
     stop rather than following it. */
  var SEQ = [
    { id: 'mate',    secs: 5.0 },
    { id: 'arm',     secs: 9.0 },
    { id: 'ignite',  secs: 1.8 },
    { id: 'liftoff', secs: 13.0 },
    { id: 'space',   secs: 7.0 }
  ];

  /* Ascent runs faster than real time or the rocket would still be in the
     troposphere when the animation ends. */
  var FLIGHT_SCALE = 9;
  var R_EARTH = 6371000;

  var state = {
    running: false,
    paused: true,
    finished: false,
    stage: null,              // station id currently being worked
    stageT: 0,
    phase: 'idle',
    level: 0,                 // how far the engine has been built up
    tag: 'RS-9 / SN-014',

    speed: 1,
    chamberBar: 300,
    mixtureRatio: 3.6,
    expansion: 40,
    throttle: 1,
    unitsTarget: 1,
    stepMode: false,

    parts: 0,
    materials: {},            // id -> units fitted so far
    log: [],                  // [{id, name}] stations completed this run
    delivered: [],            // [{tag, n}]
    runCount: 0,

    stationIndex: 0,
    stationTotal: F.order.length,

    fastForward: false,
    tourDone: false,
    reading: false,
    dwellLeft: 0,
    dwellTotal: 0,

    /* transient effects the renderer reads */
    workFlash: 0,             // machine is cutting / printing / firing
    fireFlash: 0,             // hot-fire ignition
    spin: 0,                  // turbopump shaft phase, advances once fitted

    /* the launch, and the rocket standing on the pad */
    launch: {
      active: false,
      step: null,
      t: 0,                   // seconds into the current step
      seqIndex: 0,
      countdown: 10,
      alt: 0,                 // metres, integrated
      vel: 0,                 // m/s, integrated
      mass: 0,                // kg, depleting
      flightT: 0,             // seconds of flight time
      zVis: 0,                // grid units of visual height
      space: 0,               // 0 = sky, 1 = black and stars
      plume: 0,               // 0..1 engine plume strength
      padSmoke: 0,            // 0..1 cloud on the pad
      vent: 0,                // cryogenic boil-off from the vehicle
      gantry: 1,              // 1 = strongback against the rocket, 0 = retracted
      engineIn: 0,            // 0..1 the engine sliding into the octaweb
      maxQ: false
    },
    rocketReady: false        // a vehicle is standing on the pad
  };

  var carrier = {
    routeName: 'main',
    dist: 0,
    dwell: 0,
    stopIdx: 0
  };

  var listeners = [];
  function emit(name, payload) {
    for (var i = 0; i < listeners.length; i++) listeners[i](name, payload);
  }

  /* ---- lifecycle --------------------------------------------------------- */

  function start(tag) {
    state.tag = (tag || 'SN-014').trim() || 'SN-014';
    reset();
    state.running = true;
    state.paused = false;
    emit('reset');
  }

  function resetLaunch() {
    var L = state.launch;
    L.active = false;
    L.step = null;
    L.t = 0;
    L.seqIndex = 0;
    L.countdown = 10;
    L.alt = 0;
    L.vel = 0;
    L.flightT = 0;
    L.zVis = 0;
    L.space = 0;
    L.plume = 0;
    L.padSmoke = 0;
    L.vent = 0;
    L.gantry = 1;
    L.engineIn = 0;
    L.maxQ = false;
    L.mass = Spec.ENG.vehicleWetKg;
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
    state.rocketReady = true;
    resetLaunch();
    carrier.routeName = 'main';
    carrier.dist = 0;
    carrier.dwell = 0;
    carrier.stopIdx = 0;
  }

  /* A launched vehicle is gone; the line starts the next engine at goods-in
     with an empty pallet and a fresh rocket is rolled out to the pad. */
  function beginNextUnit() {
    state.level = 0;
    state.parts = 0;
    state.materials = {};
    state.log = [];
    state.stationIndex = 0;
    state.rocketReady = true;
    resetLaunch();
    carrier.routeName = 'main';
    carrier.dist = 0;
    carrier.stopIdx = 0;
    carrier.dwell = 0.4;
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
    hotfire: function () {
      work('hotfire');
      state.fireFlash = 1;
    },

    integrate: function () {
      work('integrate');
      state.runCount++;
      state.delivered.push({ tag: state.tag, n: state.runCount });
    },

    launch: function () {
      work('launch');
      state.phase = 'launch';
      state.launch.active = true;
      state.launch.step = SEQ[0].id;
      state.launch.seqIndex = 0;
      state.launch.t = 0;
      state.launch.mass = Spec.ENG.vehicleWetKg;
      /* one complete pass has now visited every station, so the tour is over */
      tour.done = true;
      state.tourDone = true;
    }
  };

  F.order.forEach(function (id) {
    if (!OPS[id]) OPS[id] = function () { work(id); };
  });

  /* ---- the launch --------------------------------------------------------- */

  function sheet(altKm) {
    return Spec.compute({
      chamberBar: state.chamberBar,
      mixtureRatio: state.mixtureRatio,
      expansion: state.expansion,
      throttle: state.throttle,
      altKm: altKm || 0
    });
  }

  /* Visual height is not altitude: 40 km of climb would put the rocket four
     hundred screens up. A log curve keeps early motion legible — the part you
     actually watch — while still letting it leave. */
  function visualZ(alt) {
    return 34 * Math.log(1 + alt / 700);
  }

  function updateLaunch(dt) {
    var L = state.launch;
    var step = SEQ[L.seqIndex];
    L.t += dt;

    switch (L.step) {
      case 'mate':
        /* the engine is lifted off the transporter and into the octaweb */
        L.engineIn = Math.min(1, L.t / (step.secs * 0.72));
        L.vent = Math.min(1, L.t / step.secs) * 0.3;
        break;

      case 'arm':
        L.engineIn = 1;
        /* strongback swings clear over the first half of the hold */
        L.gantry = Math.max(0, 1 - L.t / (step.secs * 0.45));
        L.vent = 0.35 + 0.65 * Math.min(1, L.t / step.secs);
        L.countdown = Math.max(0, Math.ceil(step.secs - L.t));
        break;

      case 'ignite':
        L.gantry = 0;
        L.countdown = 0;
        L.plume = Math.min(1, L.t / step.secs);
        L.padSmoke = Math.min(1, L.t / (step.secs * 0.5));
        L.vent = Math.max(0, 1 - L.t / step.secs);
        break;

      case 'liftoff':
        L.plume = 1;
        L.padSmoke = 1;
        flyRocket(dt);
        break;

      case 'space':
        /* stage still burning, but well out of the atmosphere by now */
        L.plume = 0.55;
        L.padSmoke = Math.max(0, L.padSmoke - dt * 0.25);
        flyRocket(dt);
        L.space = 1;
        break;
    }

    if (L.t >= step.secs) {
      L.seqIndex++;
      L.t = 0;
      if (L.seqIndex >= SEQ.length) finishLaunch();
      else {
        L.step = SEQ[L.seqIndex].id;
        emit('launch', L.step);
      }
    }
  }

  /* Actual integration of the ascent: thrust from nine engines at the current
     ambient pressure, mass falling as propellant burns, gravity falling off
     with altitude. The numbers on the HUD are this, not a script. */
  function flyRocket(dt) {
    var L = state.launch;
    var fdt = dt * FLIGHT_SCALE;
    var n = Spec.ENG.engineCount;

    var c = sheet(L.alt / 1000);
    var thrust = c.thrustKN * 1000 * n;
    var mdot = c.mdot * n;

    var burned = mdot * fdt;
    var propLeft = L.mass - Spec.ENG.vehicleDryKg;
    if (burned > propLeft) burned = Math.max(0, propLeft);
    L.mass -= burned;

    var g = Spec.G0 * Math.pow(R_EARTH / (R_EARTH + L.alt), 2);
    /* Gravity turn, crudely: the vehicle pitches over as it climbs, so less
       and less of the thrust fights gravity. Enough to keep the velocity
       readout honest without integrating a real trajectory. */
    var pitch = Math.min(1, L.alt / 42000);
    var a = thrust / L.mass - g * (1 - pitch * 0.55);

    L.vel += a * fdt;
    L.alt += L.vel * fdt;
    L.flightT += fdt;
    L.zVis = visualZ(L.alt);

    /* The sky is essentially black by 45 km; the curve front-loads the change
       so it starts going dark while the rocket is still worth watching. */
    L.space = Math.min(1, Math.pow(L.alt / 45000, 0.6));
    if (!L.maxQ && L.alt > 11000) L.maxQ = true;
  }

  function finishLaunch() {
    /* Clear the whole launch state, not just the active flag. The renderer
       skips the floor entirely once `space` and `zVis` are high — leaving them
       set would end the run on a black screen with no factory under it. */
    resetLaunch();
    state.rocketReady = false;      /* the vehicle is away; the pad stands empty */
    emit('launch', 'done');

    if (state.runCount >= state.unitsTarget) {
      state.finished = true;
      state.paused = true;
      state.stage = 'done';
      state.phase = 'idle';
      emit('stage', 'done');
      return;
    }
    beginNextUnit();
  }

  /* ---- update ------------------------------------------------------------ */

  /* Once every station has been explained there is nothing left to read, so
     the remaining engines run at a watchable pace rather than a readable one. */
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

  function update(dt) {
    state.stageT += dt;
    state.workFlash = Math.max(0, state.workFlash - dt * 0.5);
    state.fireFlash = Math.max(0, state.fireFlash - dt * 0.35);

    /* the turbopump turns from the moment it is fitted; slowed by ~1500x or it
       is a grey blur */
    if (state.level >= LEVEL.pump && !state.finished) {
      state.spin += dt * 2.4;
    }

    if (!state.running || state.paused || state.finished) return;

    var sdt = dt * state.speed;

    /* The launch owns the clock once it starts: the carrier has arrived and
       there is nothing left to move along the line. */
    if (state.launch.active) {
      updateLaunch(sdt);
      return;
    }

    if (carrier.dwell > 0) {
      /* A stop is measured in reading seconds, so only the speed slider scales
         it; the travel boosts must not cut a first read short. */
      carrier.dwell -= sdt;
      state.dwellLeft = Math.max(0, carrier.dwell);
      if (carrier.dwell <= 0) { state.reading = false; state.dwellTotal = 0; }
      return;
    }

    var route = F.routes[carrier.routeName];
    carrier.dist += BASE_SPEED * sdt * travelBoost();

    var stops = F.stops[carrier.routeName];
    if (carrier.stopIdx < stops.length) {
      var st = stops[carrier.stopIdx];
      if (carrier.dist >= st.dist) {
        carrier.dist = st.dist;
        carrier.stopIdx++;
        var firstTime = !tour.seen[st.id];
        fire(st);
        tour.seen[st.id] = true;
        /* The pad is not a stop — the launch sequence takes over instead. */
        if (st.id !== 'launch') {
          carrier.dwell = firstTime ? (st.read || 12) : st.dwell / dwellBoost();
          state.reading = firstTime;
          state.dwellTotal = carrier.dwell;
          state.dwellLeft = carrier.dwell;
          if (state.stepMode) { state.paused = true; state.stepMode = false; }
        }
        return;
      }
    }

    if (carrier.dist >= route.total) carrier.dist = route.total;
  }

  /* ---- queries used by the renderer and the camera ----------------------- */

  /* The belt is a polyline with hard corners, so reading it directly makes the
     carrier snap to a new heading the instant it crosses a waypoint. Averaging
     a sample either side rounds the turn and swings the heading through it. */
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
    return smoothAt(F.routes[carrier.routeName], carrier.dist, 0.8);
  }

  /* Where the camera should be looking. Everywhere except the pad that is the
     carrier; once the rocket is climbing it is the rocket, or the ascent
     leaves the camera staring at an empty launch mount. */
  function cameraTarget() {
    var L = state.launch;
    if (L.active && (L.step === 'liftoff' || L.step === 'space')) {
      return { x: F.PAD.x, y: F.PAD.y, z: L.zVis + 12, lead: 0 };
    }
    if (L.active) {
      return { x: F.PAD.x, y: F.PAD.y, z: 9, lead: 0 };
    }
    var p = carrierPosition();
    return { x: p.x, y: p.y, z: p.z, dx: p.dx, dy: p.dy, lead: 2.5 };
  }

  /* 0 while the rocket is on the pad, rising to 1 at the top of the climb.
     The camera pulls back on this so the vehicle stays in shot. */
  function launchProgress() {
    var L = state.launch;
    if (!L.active) return 0;
    if (L.step === 'liftoff' || L.step === 'space') {
      return Math.min(1, L.zVis / 105);
    }
    return 0;
  }

  global.Sim = {
    state: state,
    carrier: carrier,
    LEVEL: LEVEL,
    SEQ: SEQ,
    start: start,
    reset: function () { reset(); emit('reset'); },
    /* forget which stations have been explained, so the slow tour replays */
    replayTour: function () { tour.seen = Object.create(null); tour.done = false; },
    update: update,
    carrierPosition: carrierPosition,
    cameraTarget: cameraTarget,
    launchProgress: launchProgress,
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
