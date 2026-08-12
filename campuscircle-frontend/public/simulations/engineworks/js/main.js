/* main.js: canvas, camera, input, and the frame loop. */
(function (global) {
  'use strict';

  var Iso = global.Iso, F = global.Factory, Sim = global.Sim,
      Renderer = global.Renderer, UI = global.UI;

  var canvas = document.getElementById('stage');
  var tooltip = document.getElementById('tooltip');

  var cam = { x: 180, y: 560, scale: 0.8, ox: 0, oy: 0, dpr: 1 };
  var follow = true;
  var hoverStation = null;
  var pointer = { down: false, x: 0, y: 0, moved: 0 };
  var pinch = null;
  var viewW = 0, viewH = 0;

  F.build();
  UI.init();

  /* ------------------------------------------------------------------ view */

  /* Chrome furniture measured from the DOM, so the camera can aim at the part
     of the screen the factory is actually visible in rather than the whole
     window. */
  var layout = { top: 58, dock: 120, sheet: 0, panel: 0 };
  var elDock = document.getElementById('dock');
  var elPanel = document.getElementById('inspector');
  var elHud = document.getElementById('hud');
  var elTopbar = document.querySelector('.topbar');

  function measureLayout() {
    var mobile = viewW <= 900;

    /* push the HUD clear of the topbar, whose height depends on whether the
       subtitle wraps */
    if (elTopbar) {
      setVar('--hud-top', Math.round(elTopbar.getBoundingClientRect().height - 6) + 'px');
    }

    var hud = elHud ? elHud.getBoundingClientRect() : null;
    layout.top = hud ? Math.max(58, hud.bottom + 8) : 58;
    layout.dock = elDock ? elDock.getBoundingClientRect().height + 12 : 120;

    var panelHidden = !elPanel || elPanel.classList.contains('hidden');
    if (mobile) {
      layout.panel = 0;
      layout.sheet = panelHidden ? 0 : (elPanel.getBoundingClientRect().height || 0);
      /* the sheet is positioned above the dock, so tell CSS how tall that is */
      setVar('--dock-h', Math.round(layout.dock - 12) + 'px');
    } else {
      layout.sheet = 0;
      layout.panel = panelHidden ? 0 : (elPanel.getBoundingClientRect().width + 28);
    }
  }

  var lastVars = {};
  function setVar(name, value) {
    if (lastVars[name] === value) return;      // avoid a ResizeObserver loop
    lastVars[name] = value;
    document.documentElement.style.setProperty(name, value);
  }

  /* The rectangle of screen not covered by panels, where the factory should sit. */
  function availableRect() {
    var w = Math.max(200, viewW - layout.panel);
    var y = layout.top;
    var h = Math.max(160, viewH - layout.top - layout.dock - layout.sheet);
    return { x: 0, y: y, w: w, h: h };
  }

  function focusPoint() {
    var r = availableRect();
    return { x: r.x + r.w / 2, y: r.y + r.h / 2 };
  }

  function resize() {
    var dpr = Math.min(2, global.devicePixelRatio || 1);
    viewW = global.innerWidth;
    viewH = global.innerHeight;
    canvas.width = Math.round(viewW * dpr);
    canvas.height = Math.round(viewH * dpr);
    canvas.style.width = viewW + 'px';
    canvas.style.height = viewH + 'px';
    cam.dpr = dpr;
  }

  function syncOffsets() {
    var f = focusPoint();
    cam.ox = f.x - cam.x * cam.scale;
    cam.oy = f.y - cam.y * cam.scale;
  }

  function screenToWorld(sx, sy) {
    var px = (sx - cam.ox) / cam.scale;
    var py = (sy - cam.oy) / cam.scale;
    return Iso.unproject(px, py);
  }

  /* The default view rides with the carrier rather than showing the whole
     plant, because the tour is about what the carrier is having done to it.
     Zooming out to the full factory is one click (or a double-click). */
  function defaultScale() { return viewW <= 900 ? 0.85 : 1.15; }

  function fitFactory() {
    var w = (F.GW + F.GH) * Iso.TW;
    var h = (F.GW + F.GH) * Iso.TH + 160;
    var r = availableRect();
    cam.scale = clamp(Math.min((r.w - 32) / w, (r.h - 32) / h), 0.12, 1.4);
    var c = Iso.project(F.GW / 2, F.GH / 2, 0);
    cam.x = c.x; cam.y = c.y;
  }

  /* Aim slightly along the direction of travel, so you see what the carrier is
     heading into rather than what it has left. Small enough that a stopped
     carrier still sits essentially centred on its station. */
  var LOOKAHEAD = 2.5;

  function carrierTarget() {
    /* the carrier, except while the car is going down the straight */
    var p = Sim.viewTarget();
    return Iso.project(
      p.x + (p.dx || 0) * LOOKAHEAD,
      p.y + (p.dy || 0) * LOOKAHEAD,
      p.z
    );
  }

  function centreOnCarrier() {
    var p = carrierTarget();
    cam.x = p.x; cam.y = p.y;
  }

  /* zoom about the middle of the visible band, so the subject stays put */
  function zoomStep(factor) {
    var r = availableRect();
    zoomAt(r.x + r.w / 2, r.y + r.h / 2, factor);
  }

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /* --------------------------------------------------------------- picking */

  function pick(sx, sy) {
    var w = screenToWorld(sx, sy);
    var best = null, bestD = 1e9;
    for (var i = 0; i < F.stations.length; i++) {
      var s = F.stations[i];
      var dist = Math.hypot(w.x - s.x, w.y - s.y);
      if (dist < s.r && dist < bestD) { bestD = dist; best = s; }
    }
    return best;
  }

  /* ----------------------------------------------------------------- input */

  canvas.addEventListener('pointerdown', function (e) {
    canvas.setPointerCapture(e.pointerId);
    /* a fly-to still in flight would fight the drag and win */
    UI.clearFlyTo();
    pointer.down = true;
    pointer.x = e.clientX;
    pointer.y = e.clientY;
    pointer.moved = 0;
    canvas.classList.add('dragging');
  });

  canvas.addEventListener('pointermove', function (e) {
    if (pointer.down) {
      var dx = e.clientX - pointer.x, dy = e.clientY - pointer.y;
      pointer.moved += Math.abs(dx) + Math.abs(dy);
      cam.x -= dx / cam.scale;
      cam.y -= dy / cam.scale;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
      if (pointer.moved > 6) setFollow(false);
      hideTooltip();
      return;
    }
    var s = pick(e.clientX, e.clientY);
    hoverStation = s ? s.id : null;
    if (s) showTooltip(e.clientX, e.clientY, s);
    else hideTooltip();
    canvas.style.cursor = s ? 'pointer' : 'grab';
  });

  function endPointer(e) {
    if (!pointer.down) return;
    pointer.down = false;
    canvas.classList.remove('dragging');
    if (pointer.moved < 6) {
      var s = pick(e.clientX, e.clientY);
      if (s) UI.showStation(s, true);
      else UI.unpin();
    }
  }
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', function () {
    pointer.down = false;
    canvas.classList.remove('dragging');
  });
  canvas.addEventListener('pointerleave', hideTooltip);

  canvas.addEventListener('wheel', function (e) {
    e.preventDefault();
    UI.clearFlyTo();
    zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0016));
  }, { passive: false });

  canvas.addEventListener('dblclick', function () { UI.clearFlyTo(); fitFactory(); setFollow(false); });

  function zoomAt(mx, my, factor) {
    var px = (mx - cam.ox) / cam.scale, py = (my - cam.oy) / cam.scale;
    /* the low end has to reach far enough for the whole plant to fit a phone */
    cam.scale = clamp(cam.scale * factor, 0.12, 2.4);
    var f = focusPoint();
    cam.x = px + (f.x - mx) / cam.scale;
    cam.y = py + (f.y - my) / cam.scale;
  }

  /* touch pinch */
  canvas.addEventListener('touchstart', function (e) {
    if (e.touches.length === 2) {
      pinch = {
        d: touchDist(e.touches),
        x: (e.touches[0].clientX + e.touches[1].clientX) / 2,
        y: (e.touches[0].clientY + e.touches[1].clientY) / 2
      };
    }
  }, { passive: true });
  canvas.addEventListener('touchmove', function (e) {
    if (e.touches.length === 2 && pinch) {
      var d = touchDist(e.touches);
      zoomAt(pinch.x, pinch.y, d / pinch.d);
      pinch.d = d;
      setFollow(false);
    }
  }, { passive: true });
  canvas.addEventListener('touchend', function () { pinch = null; }, { passive: true });

  function touchDist(t) {
    return Math.hypot(t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
  }

  function showTooltip(x, y, s) {
    tooltip.hidden = false;
    tooltip.innerHTML = '<b>' + s.name + '</b>' + s.short;
    var r = tooltip.getBoundingClientRect();
    tooltip.style.left = Math.min(x + 14, viewW - r.width - 12) + 'px';
    tooltip.style.top = Math.min(y + 14, viewH - r.height - 12) + 'px';
  }
  function hideTooltip() { tooltip.hidden = true; }

  document.getElementById('zoom-in').addEventListener('click', function () { UI.clearFlyTo(); zoomStep(1.35); });
  document.getElementById('zoom-out').addEventListener('click', function () { UI.clearFlyTo(); zoomStep(1 / 1.35); });
  document.getElementById('zoom-fit').addEventListener('click', function () {
    /* following, or a fly-to still in flight, would immediately re-centre and
       undo the fit */
    UI.clearFlyTo();
    setFollow(false);
    fitFactory();
  });

  var followBox = document.getElementById('follow');
  followBox.addEventListener('change', function () { follow = followBox.checked; });
  function setFollow(v) { follow = v; followBox.checked = v; }

  document.addEventListener('keydown', function (e) {
    if (e.target.tagName === 'INPUT') return;
    switch (e.key.toLowerCase()) {
      case ' ': e.preventDefault(); Sim.toggle(); UI.paint(true); break;
      case 's': Sim.step(); break;
      case 'r': UI.resetAll(); break;
      case 'f': setFollow(!follow); break;
      case 'l':
        var lb = document.getElementById('labels');
        lb.checked = !lb.checked;
        Renderer.setLabels(lb.checked);
        break;
      case 'escape': document.getElementById('about').hidden = true; break;
    }
  });

  global.addEventListener('resize', function () { resize(); measureLayout(); });
  /* keep whatever zoom the viewer chose across a rotation; re-fitting here
     would silently throw away their framing */
  global.addEventListener('orientationchange', function () {
    resize(); measureLayout(); syncOffsets();
  });

  /* The sheet and the dock change height as they open, wrap or gain a HUD note,
     so re-measure whenever they actually resize instead of polling every frame. */
  if (global.ResizeObserver) {
    var ro = new global.ResizeObserver(function () { measureLayout(); });
    [elDock, elPanel, elHud, elTopbar].forEach(function (n) { if (n) ro.observe(n); });
  }

  /* ------------------------------------------------------------------ loop */

  var last = performance.now();
  var clock = 0;

  function frame(now) {
    /* Schedule the next frame first. If anything below throws, the loop keeps
       running instead of the whole floor freezing on one panel error. */
    requestAnimationFrame(frame);

    /* Clamped at both ends. The first frame's rAF timestamp can land slightly
       before the performance.now() captured at boot, and a negative dt runs the
       clock backwards — which then feeds negative phases into everything the
       renderer derives from it. */
    var dt = Math.max(0, Math.min(0.05, (now - last) / 1000));
    last = now;
    clock += dt;

    Sim.update(dt);

    var target = UI.flyTarget();
    if (target) {
      var p = Iso.project(target.x, target.y, 0);
      cam.x += (p.x - cam.x) * 0.5;
      cam.y += (p.y - cam.y) * 0.5;
      cam.scale += (1.15 - cam.scale) * 0.5;
      setFollow(false);
      /* let go once it is close enough that another step would not move it a
         visible pixel, or the camera can never be dragged again */
      if (Math.abs(p.x - cam.x) < 0.6 && Math.abs(p.y - cam.y) < 0.6) UI.clearFlyTo();
    } else if (follow) {
      var lp = carrierTarget();
      /* ~0.3s time constant: reads as a camera easing along rather than a rigid
         lock to the carrier */
      var k = 1 - Math.pow(0.05, dt);
      cam.x += (lp.x - cam.x) * k;
      cam.y += (lp.y - cam.y) * k;
    }

    syncOffsets();
    Renderer.draw(canvas, cam, clock, UI.activeStation(), hoverStation);
    UI.paint(false);
  }

  /* ------------------------------------------------------------------ boot */

  resize();
  measureLayout();
  UI.run();                    /* puts a carrier on the line, so it can be framed */
  cam.scale = defaultScale();
  centreOnCarrier();
  syncOffsets();
  requestAnimationFrame(frame);
})(window);
