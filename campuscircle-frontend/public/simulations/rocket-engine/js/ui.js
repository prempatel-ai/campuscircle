/* ui.js: DOM panels, controls, narration. */
(function (global) {
  'use strict';

  var Sim = global.Sim, F = global.Factory, Spec = global.Spec;

  var $ = function (id) { return document.getElementById(id); };

  var el = {};
  var activeStation = null;
  var pinnedStation = null;       // set when the user clicks a station
  var lastPaint = 0;
  var flyTo = null;
  var sheetOpen = false;          // mobile bottom sheet

  var STAGE_LABEL = {
    stock: 'goods in', print: 'additive', machine: 'machining', channel: 'chamber',
    braze: 'close-out', nozzle: 'nozzle', inject: 'powerhead', pump: 'powerhead',
    valve: 'powerhead', avionics: 'powerhead', assy: 'build', ndt: 'inspection',
    hotfire: 'hot fire', integrate: 'integration', launch: 'launch', done: 'done'
  };

  var LAUNCH_STEP = {
    mate: 'Engine being mated to the thrust structure',
    arm: 'Terminal count — tanks topping off, strongback retracting',
    ignite: 'Ignition — turbopumps spinning up',
    liftoff: 'Liftoff — nine engines at full thrust',
    space: 'Above the atmosphere, first stage still burning'
  };

  /* ------------------------------------------------------------------ init */

  function init() {
    [
      'stage-chip', 'stage-tag', 'stage-name', 'stage-short', 'stage-body',
      'sheet', 'sheet-hint', 'flight', 'flight-hint', 'sec-flight',
      'bom-list', 'log', 'log-count', 'output', 'station-chips',
      'hud-phase', 'hud-station', 'hud-parts', 'hud-built', 'hud-note',
      'inspector', 'tag', 'btn-run', 'btn-play', 'play-glyph', 'btn-step',
      'btn-reset', 'speed', 'pc', 'mr', 'eps', 'throttle', 'units',
      'v-speed', 'v-pc', 'v-mr', 'v-eps', 'v-throttle', 'v-units',
      'follow', 'labels', 'btn-about', 'about', 'about-close', 'btn-panel',
      'tooltip', 'dwell', 'dwell-bar', 'dwell-hint', 'sheet-handle',
      'btn-tune', 'dock', 'dock-tune'
    ].forEach(function (id) { el[id] = $(id); });

    buildChips();
    wire();
    applyResponsiveLabels();

    Sim.on(function (name, payload) {
      if (name === 'stage') onStage(payload);
      if (name === 'launch') onLaunchStep(payload);
      if (name === 'reset') { pinnedStation = null; paint(true); }
    });
  }

  function buildChips() {
    F.stations.forEach(function (s) {
      var b = document.createElement('button');
      b.textContent = s.name;
      b.dataset.id = s.id;
      b.addEventListener('click', function () {
        showStation(s, true);
        flyTo = { x: s.x, y: s.y };
      });
      el['station-chips'].appendChild(b);
    });
  }

  function wire() {
    el['btn-run'].addEventListener('click', run);
    el.tag.addEventListener('keydown', function (e) { if (e.key === 'Enter') run(); });

    el['btn-play'].addEventListener('click', function () { Sim.toggle(); paint(true); });
    el['btn-step'].addEventListener('click', function () { Sim.step(); });
    /* Build keeps what you've already read; Reset starts the slow tour over. */
    el['btn-reset'].addEventListener('click', function () { Sim.replayTour(); run(); });

    bindRange('speed', 'v-speed', function (v) { Sim.state.speed = v; return v.toFixed(2) + '×'; });
    bindRange('pc', 'v-pc', function (v) { Sim.state.chamberBar = v; return (v | 0) + ' bar'; });
    bindRange('mr', 'v-mr', function (v) { Sim.state.mixtureRatio = v; return v.toFixed(2) + ' O/F'; });
    bindRange('eps', 'v-eps', function (v) { Sim.state.expansion = v; return (v | 0) + ' : 1'; });
    bindRange('throttle', 'v-throttle', function (v) {
      Sim.state.throttle = v;
      return Math.round(v * 100) + '%';
    });
    bindRange('units', 'v-units', function (v) { Sim.state.unitsTarget = v | 0; return (v | 0) + ''; });

    el.labels.addEventListener('change', function () {
      global.Renderer.setLabels(el.labels.checked);
    });

    el['btn-about'].addEventListener('click', function () { el.about.hidden = false; });
    el['about-close'].addEventListener('click', function () { el.about.hidden = true; });
    el.about.addEventListener('click', function (e) { if (e.target === el.about) el.about.hidden = true; });

    el['btn-panel'].addEventListener('click', function () {
      var hidden = el.inspector.classList.toggle('hidden');
      el['btn-panel'].setAttribute('aria-expanded', String(!hidden));
      applyResponsiveLabels();
    });
    window.addEventListener('resize', applyResponsiveLabels);

    /* mobile: the sheet expands to show the full write-up */
    el['sheet-handle'].addEventListener('click', function () { setSheet(!sheetOpen); });

    /* mobile: the sliders live behind the gear button */
    el['btn-tune'].addEventListener('click', function () {
      var open = el.dock.classList.toggle('tune-open');
      el['btn-tune'].setAttribute('aria-expanded', String(open));
      el['btn-tune'].title = open ? 'Hide settings' : 'Show settings';
    });
  }

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  /* The topbar cannot fit both actions on a phone, but both still need to be
     reachable — landscape especially, where dismissing the sheet is the only
     way to get a usable canvas. */
  function applyResponsiveLabels() {
    var hidden = el.inspector.classList.contains('hidden');
    var narrow = isMobile();
    el['btn-panel'].textContent = narrow
      ? (hidden ? 'Panel' : 'Hide')
      : (hidden ? 'Show panel' : 'Hide panel');
    el['btn-about'].textContent = narrow ? 'About' : 'About & accuracy';
    /* name the actual key, but a phone has no Space bar, so point at the
       pause button there instead */
    el['dwell-hint'].innerHTML = narrow
      ? 'reading stop: tap <b>❚❚</b> below to hold it here'
      : 'reading stop: press <kbd>Space</kbd> to hold it here';
  }

  function setSheet(open) {
    sheetOpen = open;
    el.inspector.classList.toggle('open', open);
    el['sheet-handle'].setAttribute('aria-expanded', String(open));
    if (open) el.inspector.scrollTop = 0;
  }

  function bindRange(id, out, fn) {
    var input = el[id];
    var apply = function () { el[out].textContent = fn(parseFloat(input.value)); };
    input.addEventListener('input', apply);
    apply();
  }

  function run() {
    Sim.start(el.tag.value || 'SN-014');
    pinnedStation = null;
    paint(true);
  }

  /* -------------------------------------------------------------- narration */

  function onStage(stage) {
    activeStation = stage === 'done' ? null : stage;
    if (!pinnedStation && activeStation) {
      var s = F.stationById[activeStation];
      if (s) writeStageCard(s, stage);
    }
    if (stage === 'done') writeDone();
    paint(true);
  }

  /* The pad write-up is replaced by the live sequence once the count starts,
     because by then the interesting thing is what is happening, not the text. */
  function onLaunchStep(step) {
    if (pinnedStation || step === 'done') return;
    var s = F.stationById.launch;
    if (!s) return;
    el['stage-tag'].textContent = LAUNCH_STEP[step] || s.tag;
    paint(true);
  }

  function writeStageCard(s, stage) {
    el['stage-chip'].textContent = STAGE_LABEL[stage] || s.phase;
    el['stage-chip'].style.color = s.color;
    el['stage-chip'].style.background = hexA(s.color, 0.14);
    el['stage-chip'].style.borderColor = hexA(s.color, 0.34);
    el['stage-tag'].textContent = s.tag;
    el['stage-name'].textContent = s.name;
    el['stage-short'].textContent = s.short;
    el['stage-body'].textContent = s.body;
  }

  function writeDone() {
    var n = Sim.state.runCount;
    el['stage-chip'].textContent = 'done';
    el['stage-tag'].textContent = n + (n === 1 ? ' vehicle away' : ' vehicles away');
    el['stage-name'].textContent = 'Line stopped';
    el['stage-short'].textContent = 'The factory ran ' + n + ' complete times, once per engine, and each one flew.';
    el['stage-body'].textContent = 'Change the serial number, the chamber pressure, the mixture ratio or the expansion ratio and press Build to send another engine down the line. The data sheet is recomputed from whatever you set, so a different nozzle really is a different engine.';
  }

  function showStation(s, pin) {
    pinnedStation = pin ? s.id : null;
    writeStageCard(s, Sim.state.stage);
    if (pin) {
      el['stage-chip'].textContent = 'pinned';
      el['stage-tag'].textContent = s.tag + ' · tap empty ground to resume';
      /* tapping a station on a phone is a request to read it */
      if (isMobile()) setSheet(true);
    }
    updateChips();
  }

  function updateChips() {
    var kids = el['station-chips'].children;
    for (var i = 0; i < kids.length; i++) {
      var on = kids[i].dataset.id === (pinnedStation || activeStation);
      kids[i].classList.toggle('on', on);
    }
  }

  function hexA(hex, a) {
    var h = hex.replace('#', '');
    var n = parseInt(h, 16);
    return 'rgba(' + ((n >> 16) & 255) + ',' + ((n >> 8) & 255) + ',' + (n & 255) + ',' + a + ')';
  }

  /* ------------------------------------------------------------------ paint */

  function paint(force) {
    var now = performance.now();
    if (!force && now - lastPaint < 90) return;
    lastPaint = now;

    var s = Sim.state;

    el['play-glyph'].textContent = s.paused || s.finished ? '▶' : '❚❚';

    el['hud-phase'].textContent = s.finished ? 'idle' : s.phase;
    el['hud-station'].textContent = s.stationIndex + ' / ' + s.stationTotal;
    el['hud-parts'].textContent = Spec.group(s.parts);
    el['hud-built'].textContent = s.runCount + ' / ' + s.unitsTarget;
    el['hud-note'].textContent = hudNote(s);

    /* reading-stop progress */
    var showing = s.reading && s.dwellTotal > 0 && s.dwellLeft > 0;
    el.dwell.hidden = !showing;
    if (showing) {
      el['dwell-bar'].style.width = (s.dwellLeft / s.dwellTotal * 100).toFixed(1) + '%';
    }

    paintFlight(s);
    paintSheet(s);
    paintBom(s);
    paintLog(s);
    paintOutput(s);
    updateChips();
  }

  function hudNote(s) {
    if (s.finished) return '';
    if (s.launch.active) {
      return LAUNCH_STEP[s.launch.step] || 'On the pad.';
    }
    if (s.reading) return '⏸ holding here so you can read the panel';
    if (s.tourDone) return '⏩ every station explained, running the rest at speed (drag Speed down to slow it)';
    if (!s.running) return '';
    if (Sim.carrier.dist >= F.roadFrom) {
      return 'Out of the hall. The transporter crawls the finished stage to the pad.';
    }
    return 'One carrier, one engine. Everything else on the floor is feeding it.';
  }

  /* The flight section only exists while something is flying. */
  function paintFlight(s) {
    var L = s.launch;
    var flying = L.active && (L.step === 'liftoff' || L.step === 'space');
    el['sec-flight'].hidden = !L.active;
    if (!L.active) return;

    if (!flying) {
      el['flight-hint'].textContent = 'on the pad';
      var c0 = Sim.sheet(0);
      var st0 = Spec.stage(c0);
      el.flight.innerHTML = rows([
        ['Vehicle mass', Spec.group(Spec.ENG.vehicleWetKg / 1000) + ' t', false],
        ['Engines lit', Spec.ENG.engineCount + ' × ' + Math.round(c0.thrustSLkN) + ' kN', false],
        ['Total thrust', st0.thrustMN.toFixed(2) + ' MN', true],
        ['Liftoff T/W', st0.liftoffTW.toFixed(2), true, st0.liftoffTW < 1.05],
        ['Stage burn time', Math.round(st0.burnSeconds) + ' s', true]
      ]) + (st0.liftoffTW < 1.05
        ? '<p class="fine">Below 1.0 the rocket cannot leave the pad — it just sits there burning. Raise the chamber pressure or the throttle.</p>'
        : '');
      return;
    }

    el['flight-hint'].textContent = 'integrated live';
    var c = Sim.sheet(L.alt / 1000);
    var propLeft = Math.max(0, L.mass - Spec.ENG.vehicleDryKg);
    el.flight.innerHTML = rows([
      ['Flight time', 'T+' + Math.round(L.flightT) + ' s', false],
      ['Altitude', (L.alt / 1000).toFixed(1) + ' km', true],
      ['Velocity', Spec.group(L.vel) + ' m/s', true],
      ['Vehicle mass', Spec.group(L.mass / 1000) + ' t', true],
      ['Propellant left', Spec.group(propLeft / 1000) + ' t', true],
      ['Ambient', (101325 * Math.exp(-(L.alt / 1000) / 8.4) / 1000).toFixed(1) + ' kPa', true],
      ['Thrust now', Spec.group(c.thrustKN * Spec.ENG.engineCount) + ' kN', true],
      ['Isp now', Math.round(c.isp) + ' s', true]
    ]) + '<p class="fine">Thrust rises as the vehicle climbs, because the nozzle stops fighting ambient pressure. Nothing here is scripted — it is integrated from thrust and falling mass.</p>';
  }

  function rows(list) {
    return list.map(function (r) {
      var cls = 'row' + (r[2] ? ' calc' : '') + (r[3] ? ' warn' : '');
      return '<div class="' + cls + '"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
  }

  function paintSheet(s) {
    var c = Sim.sheet(0);
    var E = Spec.ENG;
    el['sheet-hint'].textContent = c.separated
      ? 'nozzle too big for sea level'
      : 'computed live';

    var html = rows([
      ['Cycle', E.cycle, false],
      ['Propellants', 'LOX / CH₄', false],
      ['Chamber pressure', Math.round(c.chamberBarActual) + ' bar', false],
      ['Chamber temp (modelled)', Spec.group(c.Tc) + ' K', true],
      ['Throat / exit', Math.round(c.throatMM) + ' / ' + Math.round(c.exitMM) + ' mm', true],
      ['Exit Mach', c.exitMach.toFixed(2), true],
      ['Exit pressure', c.exitPressureBar.toFixed(2) + ' bar', true, c.separated],
      ['Exhaust velocity', Spec.group(c.exhaustVel) + ' m/s', true],
      ['Mass flow', c.mdot.toFixed(0) + ' kg/s', true],
      ['Thrust, sea level', Math.round(c.thrustSLkN) + ' kN', true],
      ['Thrust, vacuum', Math.round(c.thrustVacKN) + ' kN', true],
      ['Isp, SL / vac', Math.round(c.ispSL) + ' / ' + Math.round(c.ispVac) + ' s', true],
      ['Engine T/W', Math.round(c.twRatio) + ' : 1', true]
    ]);

    html += '<div class="row big calc"><span>Nine engines</span><b>' +
      Spec.stage(c).thrustMN.toFixed(2) + ' MN at liftoff</b></div>';

    if (c.separated) {
      html += '<p class="fine">At this area ratio the exit pressure is far below ambient, so at sea level the flow separates from the nozzle wall instead of filling it. Real engines with bells this large are vacuum stages only.</p>';
    }

    el.sheet.innerHTML = html;
  }

  function paintBom(s) {
    var ids = Object.keys(s.materials);
    if (!ids.length) {
      el['bom-list'].innerHTML = '<p class="fine">Fills as the engine is built up. Machining is the one station that takes material away.</p>';
      return;
    }
    var total = 0;
    ids.forEach(function (k) { total += s.materials[k]; });
    if (total <= 0) total = 1;

    /* keep the palette order rather than sorting, so bars do not jump around
       between stations */
    var list = Spec.MATERIALS.filter(function (m) { return s.materials[m.id] > 0; });
    var max = Math.max.apply(null, list.map(function (m) { return s.materials[m.id]; }));

    el['bom-list'].innerHTML = list.map(function (m) {
      var v = s.materials[m.id];
      return '<div class="bar"><span class="lbl">' + m.name + '</span>' +
        '<span class="track"><span class="fill" style="width:' + (v / max * 100).toFixed(1) +
        '%;background:' + m.color + '"></span></span>' +
        '<span class="val">' + (v / total * 100).toFixed(0) + '%</span></div>';
    }).join('') +
    '<p class="fine">Indicative shares, not a real bill of material. ' +
      Spec.group(s.parts) + ' of about ' + Spec.group(Spec.totalParts()) + ' parts fitted.</p>';
  }

  function paintLog(s) {
    el['log-count'].textContent = s.log.length + ' / ' + s.stationTotal + ' stations';
    el.log.innerHTML = s.log.map(function (entry, i) {
      var cls = 'tok' + (i === s.log.length - 1 ? ' focus' : '');
      return '<span class="' + cls + '">' + escapeHtml(entry.name) + '</span>';
    }).join('') || '<span class="fine">nothing yet</span>';
  }

  function paintOutput(s) {
    if (!s.delivered.length) {
      el.output.innerHTML = '<span class="fine">nothing launched yet</span><span class="caret">|</span>';
      return;
    }
    el.output.innerHTML = s.delivered.map(function (d) {
      return '<span class="unit"><span class="no">#' + d.n + '</span> ' + escapeHtml(d.tag) +
             ' — integrated &amp; flown</span>';
    }).join('') + (s.finished ? '' : '<span class="caret">|</span>');
  }

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ---------------------------------------------------------------- exports */

  global.UI = {
    init: init,
    paint: paint,
    run: run,
    resetAll: function () { Sim.replayTour(); run(); },
    showStation: showStation,
    unpin: function () { pinnedStation = null; updateChips(); },
    activeStation: function () { return pinnedStation || activeStation; },
    /* The camera eases toward this over several frames, so it has to stay set
       until it has arrived; consuming it on the first frame would leave the
       chip you clicked parked halfway off the side of the screen. */
    flyTarget: function () { return flyTo; },
    clearFlyTo: function () { flyTo = null; },
    el: el
  };
})(window);
