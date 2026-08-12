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

  /* Illustrative firing order for a 90° V6. Real orders are a design choice
     teams do not publish; what matters here is that it is not 1-2-3-4-5-6. */
  var FIRING_ORDER = [1, 4, 2, 5, 3, 6];

  var STAGE_LABEL = {
    alloy: 'goods in', cast: 'casting', heat: 'heat treat', machine: 'machining',
    coat: 'coating', metro: 'metrology', crank: 'sub-assembly', valve: 'sub-assembly',
    turbo: 'sub-assembly', hybrid: 'sub-assembly', assy: 'build', dyno: 'test',
    seal: 'homologation', fit: 'installation', track: 'fire-up', rebuild: 'service',
    done: 'done'
  };

  /* ------------------------------------------------------------------ init */

  function init() {
    [
      'stage-chip', 'stage-tag', 'stage-name', 'stage-short', 'stage-body',
      'fire', 'fire-label', 'sheet', 'sheet-hint', 'bom-list', 'log', 'log-count',
      'output', 'station-chips', 'hud-phase', 'hud-station', 'hud-parts',
      'hud-built', 'hud-note', 'inspector', 'tag', 'btn-run', 'btn-play',
      'play-glyph', 'btn-step', 'btn-reset', 'speed', 'rpm', 'deploy', 'units',
      'v-speed', 'v-rpm', 'v-deploy', 'v-units', 'follow', 'labels', 'btn-about',
      'about', 'about-close', 'btn-panel', 'tooltip', 'dwell', 'dwell-bar',
      'dwell-hint', 'sheet-handle', 'btn-tune', 'dock', 'dock-tune'
    ].forEach(function (id) { el[id] = $(id); });

    buildCylinders();
    buildChips();
    wire();
    applyResponsiveLabels();

    Sim.on(function (name, payload) {
      if (name === 'stage') onStage(payload);
      if (name === 'reset') { pinnedStation = null; paint(true); }
    });
  }

  function buildCylinders() {
    var frag = document.createDocumentFragment();
    for (var i = 0; i < Spec.REG.cylinders; i++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.innerHTML = '<i></i><b>' + (i + 1) + '</b>';
      frag.appendChild(cell);
    }
    el.fire.appendChild(frag);
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
    bindRange('rpm', 'v-rpm', function (v) {
      Sim.state.rpm = v | 0;
      return Spec.group(v) + ' rpm';
    });
    bindRange('deploy', 'v-deploy', function (v) { Sim.state.deploy = v; return (v | 0) + ' kW'; });
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

    /* mobile: the sliders live behind the ⚙ button */
    el['btn-tune'].addEventListener('click', function () {
      var open = el.dock.classList.toggle('tune-open');
      el['btn-tune'].setAttribute('aria-expanded', String(open));
      el['btn-tune'].title = open ? 'Hide settings' : 'Show settings';
    });
  }

  function isMobile() { return window.matchMedia('(max-width: 900px)').matches; }

  /* The topbar cannot fit "About & accuracy" + "Hide panel" on a phone, but
     both actions still need to be reachable — landscape especially, where
     dismissing the sheet is the only way to get a usable canvas. */
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
    Sim.start(el.tag.value || 'PU-04');
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

  function writeStageCard(s, stage) {
    el['stage-chip'].textContent = STAGE_LABEL[stage] || s.phase;
    el['stage-chip'].style.color = s.color;
    el['stage-chip'].style.background = hexA(s.color, 0.13);
    el['stage-chip'].style.borderColor = hexA(s.color, 0.3);
    el['stage-tag'].textContent = s.tag;
    el['stage-name'].textContent = s.name;
    el['stage-short'].textContent = s.short;
    el['stage-body'].textContent = s.body;
  }

  function writeDone() {
    var n = Sim.state.runCount;
    el['stage-chip'].textContent = 'done';
    el['stage-tag'].textContent = n + (n === 1 ? ' unit' : ' units') + ' delivered';
    el['stage-name'].textContent = 'Line stopped';
    el['stage-short'].textContent = 'The factory ran ' + n + ' complete times, once per power unit.';
    el['stage-body'].textContent = 'Change the build tag, the engine speed or the hybrid deployment and press Build to send another unit down the line.';
  }

  function showStation(s, pin) {
    pinnedStation = pin ? s.id : null;
    writeStageCard(s, Sim.state.stage);
    if (pin) {
      el['stage-chip'].textContent = 'pinned';
      el['stage-tag'].textContent = s.tag + ' · tap empty floor to resume';
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

    paintCylinders(s);
    paintSheet(s);
    paintBom(s);
    paintLog(s);
    paintOutput(s);
    updateChips();
  }

  function hudNote(s) {
    if (s.finished) return '';
    /* the finale says more about itself than the reading note would */
    if (s.stage === 'track' && s.car.phase !== 'wait') return launchNote(s.car);
    if (s.reading) return '⏸ holding here so you can read the panel';
    if (s.tourDone) return '⏩ every station explained, running the rest at speed (drag Speed down to slow it)';
    if (s.stage === 'rebuild' || Sim.carrier.routeName === 'ret') {
      return 'The overhead line brings used units home to be stripped and rebuilt.';
    }
    if (!s.running) return '';
    return 'One carrier, one power unit. Everything else on the floor is feeding it.';
  }

  function launchNote(car) {
    if (car.phase === 'mount') return 'The unit is being craned into the car it was built for.';
    if (car.phase === 'fire') return 'Fire-up: oil and water pressure first, then it is asked for something.';
    if (car.phase === 'launch') {
      return '⏩ away — ' + Spec.group(car.v * 3.6) + ' km/h, and tyre-limited, not power-limited';
    }
    return 'Gone. The unit comes home on the overhead line to be stripped and rebuilt.';
  }

  function paintCylinders(s) {
    var cells = el.fire.children;
    var running = s.level >= Sim.LEVEL.dyno && !s.finished;
    el['fire-label'].textContent = running
      ? Spec.group(Spec.compute(s.rpm, s.deploy).firingHz) + ' events/s'
      : 'not running';

    var pos = (s.firePhase * 6) % 6;
    for (var i = 0; i < cells.length; i++) {
      var bar = cells[i].firstChild;
      if (!running) { bar.style.height = '0'; continue; }
      var seq = FIRING_ORDER.indexOf(i + 1);
      var dd = Math.abs(pos - seq);
      dd = Math.min(dd, 6 - dd);                       /* the cycle wraps */
      var v = Math.max(0, 1 - dd / 1.1);
      bar.style.height = (v * 100).toFixed(0) + '%';
    }
  }

  function paintSheet(s) {
    var c = Spec.compute(s.rpm, s.deploy);
    var R = Spec.REG;
    el['sheet-hint'].textContent = c.atCeiling ? 'at the fuel-flow ceiling' : 'below the fuel-flow ceiling';

    var rows = [
      ['Layout', 'V' + R.cylinders + ' ' + R.vAngle + '°, 1 turbo', false],
      ['Bore × stroke', R.boreMM.toFixed(1) + ' × ' + R.strokeMM.toFixed(1) + ' mm', false],
      ['Swept volume', c.displacementCC.toFixed(0) + ' cc', true],
      ['Engine speed', Spec.group(c.rpm) + ' rpm', false],
      ['Mean piston speed', c.meanPistonSpeed.toFixed(1) + ' m/s', true],
      ['Peak piston load', Spec.group(c.peakAccelG) + ' g', true],
      ['Combustion events', Spec.group(c.firingHz) + ' /s', true],
      ['Fuel energy flow', Spec.group(c.fuelMJh) + ' MJ/h', true],
      ['ICE (modelled)', Math.round(c.iceKW) + ' kW', true],
      ['MGU-K deploy', Math.round(c.mguKW) + ' kW', false],
      ['Thermal efficiency', (c.thermalEff * 100).toFixed(0) + '%', false],
      ['Car, 0–200 km/h', sprintTime(c.totalKW), true]
    ];

    var html = rows.map(function (r) {
      return '<div class="row' + (r[2] ? ' calc' : '') + '"><span>' + r[0] + '</span><b>' + r[1] + '</b></div>';
    }).join('');
    html += '<div class="row big calc"><span>Combined</span><b>' +
      Math.round(c.totalKW) + ' kW · ' + Spec.group(c.totalHP) + ' hp</b></div>';

    el.sheet.innerHTML = html;
  }

  /* The launch at the end of the line, integrated rather than looked up.
     It barely moves with deployment, which is the honest answer: off the line
     the tyres decide, and the MGU-K only earns its keep further up the road. */
  function sprintTime(kw) {
    var s = Spec.timeToSpeed(200, kw);
    return s == null ? 'never gets there' : s.toFixed(1) + ' s';
  }

  function paintBom(s) {
    var ids = Object.keys(s.materials);
    if (!ids.length) {
      el['bom-list'].innerHTML = '<p class="fine">Fills as the unit is built up. Machining is the one station that takes material away.</p>';
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
      var cls = 'tok done' + (i === s.log.length - 1 ? ' focus' : '');
      return '<span class="' + cls + '">' + escapeHtml(entry.name) + '</span>';
    }).join('') || '<span class="fine">nothing yet</span>';
  }

  function paintOutput(s) {
    if (!s.delivered.length) {
      el.output.innerHTML = '<span class="fine">nothing delivered yet</span><span class="caret">|</span>';
      return;
    }
    el.output.innerHTML = s.delivered.map(function (d) {
      return '<span class="unit"><span class="no">#' + d.n + '</span> ' + escapeHtml(d.tag) + ' — sealed &amp; dispatched</span>';
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
