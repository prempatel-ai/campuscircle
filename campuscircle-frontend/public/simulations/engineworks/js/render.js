/* render.js: draws the factory. Everything is canvas 2D, painter's algorithm. */
(function (global) {
  'use strict';

  var Iso = global.Iso, F = global.Factory, Sim = global.Sim, Spec = global.Spec;
  var P = Iso.project;
  var C = F.palette;

  var cam = null, ctx = null, t = 0;
  var labels = [];
  var showLabels = true;

  /* ------------------------------------------------------------------ sky */

  function drawSky(w, h) {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#b8cbd8');
    g.addColorStop(0.55, '#cdd6d2');
    g.addColorStop(1, '#9fae86');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  }

  /* --------------------------------------------------------------- ground */

  function plate(inset, z) {
    var W = F.GW, H = F.GH;
    return [
      P(-inset, -inset, z || 0), P(W + inset, -inset, z || 0),
      P(W + inset, H + inset, z || 0), P(-inset, H + inset, z || 0)
    ];
  }

  var GRASS = ['#7d9a54', '#86a25c', '#74914c', '#8dab63'];

  function drawGround() {
    var W = F.GW, H = F.GH, x, y;

    /* the site: rough grass, then the poured concrete pad the plant sits on */
    ctx.fillStyle = GRASS[0];
    Iso.poly(ctx, plate(9));
    /* The launch straight runs off the west end of the site, so the ground has
       to go with it — a car cannot accelerate into the sky. */
    Iso.poly(ctx, [P(-24, -9, 0), P(-9, -9, 0), P(-9, H + 9, 0), P(-24, H + 9, 0)]);
    for (x = -22; x < W + 8; x += 2.5) {
      for (y = -8; y < H + 8; y += 2.5) {
        var n = Iso.hash2(x, y, 17);
        if (n < 0.5) continue;
        ctx.fillStyle = GRASS[1 + Math.floor(n * 2.99) % 3];
        Iso.poly(ctx, [P(x, y, 0), P(x + 2.5, y, 0), P(x + 2.5, y + 2.5, 0), P(x, y + 2.5, 0)]);
      }
    }

    ctx.fillStyle = '#b6b0a0';                       /* kerb around the pad */
    Iso.poly(ctx, plate(1.0, 0.004));
    ctx.fillStyle = C.concrete;                      /* the slab itself */
    Iso.poly(ctx, plate(0, 0.008));

    /* poured in bays, so the slab has expansion joints rather than being one
       flat colour */
    for (x = 0; x < W; x += 3) {
      for (y = 0; y < H; y += 3) {
        if (Iso.hash2(x, y, 41) < 0.5) continue;
        ctx.fillStyle = C.concrete2;
        Iso.poly(ctx, [P(x, y, 0.009), P(x + 3, y, 0.009), P(x + 3, y + 3, 0.009), P(x, y + 3, 0.009)]);
      }
    }
    ctx.strokeStyle = 'rgba(84,76,62,0.13)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (x = 0; x <= W; x += 3) {
      var a = P(x, 0, 0.01), b = P(x, H, 0.01);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (y = 0; y <= H; y += 3) {
      var c = P(0, y, 0.01), d = P(W, y, 0.01);
      ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();

    drawWalkways();

    ctx.strokeStyle = 'rgba(70,64,52,0.3)';
    ctx.lineWidth = 1.5;
    Iso.polyLine(ctx, plate(0, 0.011), true);
  }

  /* Painted pedestrian aisles. Every plant has them and they are the single
     cheapest thing that makes a floor read as a working floor. */
  var AISLES = [
    [2, 11.0, 50, 11.0],
    [2, 22.4, 50, 22.4],
    [2, 11.0, 2, 22.4],
    [50, 11.0, 50, 22.4]
  ];

  function drawWalkways() {
    for (var i = 0; i < AISLES.length; i++) {
      var a = AISLES[i];
      ctx.fillStyle = 'rgba(228, 206, 120, 0.5)';
      Iso.ribbon(ctx, a[0], a[1], a[2], a[3], 1.5, 0.012);
      ctx.fillStyle = 'rgba(206, 200, 184, 0.85)';
      Iso.ribbon(ctx, a[0], a[1], a[2], a[3], 1.1, 0.014);
    }
  }

  function drawZones(activeId) {
    for (var i = 0; i < F.stations.length; i++) {
      var s = F.stations[i];
      var active = s.id === activeId;
      ctx.fillStyle = Iso.rgba(s.color, active ? 0.15 : 0.06);
      Iso.disc(ctx, s.x, s.y, (s.z || 0) + 0.02, s.r);
      ctx.strokeStyle = Iso.rgba(s.color, active ? 0.8 : 0.3);
      ctx.lineWidth = active ? 2.2 : 1.2;
      ctx.setLineDash(active ? [] : [6, 7]);
      var p = P(s.x, s.y, (s.z || 0) + 0.02);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s.r * Iso.TW * 1.414, s.r * Iso.TH * 1.414, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
      if (active) {
        var pulse = (t * 0.6) % 1;
        ctx.strokeStyle = Iso.rgba(s.color, 0.4 * (1 - pulse));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s.r * Iso.TW * 1.414 * (1 + pulse * 0.35),
                    s.r * Iso.TH * 1.414 * (1 + pulse * 0.35), 0, 0, 6.2832);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------------- belts */

  /* A conveyor: dark deck, yellow side rails, and treads that actually move.
     The moving treads are what sell it — a static ribbon reads as a road. */
  function drawBeltPath(route, opts) {
    var segs = route.segs, i, s;
    var width = opts.width || 2.4;
    var elevated = opts.elevated;

    if (elevated) {
      for (i = 0; i < segs.length; i++) {
        s = segs[i];
        for (var f = 0; f <= 1; f += 0.28) {
          var px = s.a.x + (s.b.x - s.a.x) * f;
          var py = s.a.y + (s.b.y - s.a.y) * f;
          var pz = s.a.z + (s.b.z - s.a.z) * f;
          if (pz < 0.8) continue;
          Iso.box(ctx, { x: px - 0.17, y: py - 0.17, z: 0, w: 0.34, d: 0.34, h: pz - 0.1, color: '#a8a294' });
        }
      }
    }

    /* frame, then deck. Each segment is its own quad, so a turn leaves a notch
       on the outside of the corner; a patch at every waypoint closes it. */
    ctx.fillStyle = opts.frame || '#8d8a80';
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, width, elevated ? (s.a.z + s.b.z) / 2 : 0.02);
    }
    joints(route, width, elevated, 0.02);

    ctx.fillStyle = opts.deck || C.beltDark;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, width - 0.5, elevated ? (s.a.z + s.b.z) / 2 + 0.01 : 0.03);
    }
    joints(route, width - 0.5, elevated, 0.03);

    /* Treads: thin, low-contrast slats. They have to read as belt texture in
       motion, not as painted stripes — anything wide and yellow here turns the
       conveyor into a hazard-marked road. */
    var speed = opts.speed || 1.5;
    var step = 0.42;
    var off = -((t * speed) % step);
    var innerW = width - 0.62;
    var d, p, nx, ny, z, hw;
    ctx.fillStyle = opts.tread || 'rgba(160,168,176,0.5)';
    for (d = off; d < route.total; d += step) {
      if (d < 0) continue;
      p = route.at(d);
      nx = -p.dy; ny = p.dx;
      z = (elevated ? p.z : 0) + 0.04;
      hw = innerW / 2;
      Iso.poly(ctx, [
        P(p.x + nx * hw + p.dx * 0.05, p.y + ny * hw + p.dy * 0.05, z),
        P(p.x - nx * hw + p.dx * 0.05, p.y - ny * hw + p.dy * 0.05, z),
        P(p.x - nx * hw - p.dx * 0.05, p.y - ny * hw - p.dy * 0.05, z),
        P(p.x + nx * hw - p.dx * 0.05, p.y + ny * hw - p.dy * 0.05, z)
      ]);
    }

    /* Direction chevrons, sparse enough to be a signal rather than a texture.
       These are what tell you which way the line runs. */
    var cstep = 4.2;
    var coff = -((t * speed) % cstep);
    ctx.fillStyle = opts.chevron || 'rgba(206,172,72,0.6)';
    for (d = coff; d < route.total; d += cstep) {
      if (d < 0.6) continue;
      p = route.at(d);
      nx = -p.dy; ny = p.dx;
      z = (elevated ? p.z : 0) + 0.045;
      hw = innerW * 0.19;
      Iso.poly(ctx, [
        P(p.x + p.dx * 0.24, p.y + p.dy * 0.24, z),
        P(p.x - p.dx * 0.06 + nx * hw, p.y - p.dy * 0.06 + ny * hw, z),
        P(p.x - p.dx * 0.15, p.y - p.dy * 0.15, z),
        P(p.x - p.dx * 0.06 - nx * hw, p.y - p.dy * 0.06 - ny * hw, z)
      ]);
    }

    /* side rails on top of the frame, so the deck sits in a channel */
    ctx.fillStyle = opts.rail || '#b99a3d';
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      var L = Math.hypot(dx, dy) || 1;
      var rx = -dy / L * (width / 2 - 0.12), ry = dx / L * (width / 2 - 0.12);
      var zz = elevated ? (s.a.z + s.b.z) / 2 + 0.05 : 0.05;
      Iso.ribbon(ctx, s.a.x + rx, s.a.y + ry, s.b.x + rx, s.b.y + ry, 0.22, zz);
      Iso.ribbon(ctx, s.a.x - rx, s.a.y - ry, s.b.x - rx, s.b.y - ry, 0.22, zz);
    }
  }

  function joints(route, width, elevated, lift) {
    var r = width / 2;
    for (var i = 0; i < route.pts.length; i++) {
      var p = route.pts[i];
      var z = (elevated ? (p.z || 0) : 0) + lift;
      Iso.poly(ctx, [
        P(p.x - r, p.y - r, z), P(p.x + r, p.y - r, z),
        P(p.x + r, p.y + r, z), P(p.x - r, p.y + r, z)
      ]);
    }
  }

  /* Goods-in: the main belt starts off the edge of the pad, so it needs an
     apron and a gate or it reads as a belt that simply stops in the grass. */
  function drawApproach() {
    var y = 6, x0 = -7.5, x1 = 0.4;
    ctx.fillStyle = '#b6b0a0';
    Iso.ribbon(ctx, x0 - 0.6, y, 0.2, y, 4.2, 0.004);
    ctx.fillStyle = '#8d8a80';
    Iso.ribbon(ctx, x0, y, x1, y, 2.4, 0.014);
    ctx.fillStyle = C.beltDark;
    Iso.ribbon(ctx, x0, y, x1, y, 1.9, 0.022);

    var step = 0.42, off = -((t * 1.6) % step);
    ctx.fillStyle = 'rgba(160,168,176,0.5)';
    for (var d = off; d < x1 - x0; d += step) {
      if (d < 0) continue;
      var px = x0 + d;
      Iso.poly(ctx, [
        P(px + 0.05, y + 0.64, 0.03), P(px + 0.05, y - 0.64, 0.03),
        P(px - 0.05, y - 0.64, 0.03), P(px - 0.05, y + 0.64, 0.03)
      ]);
    }

    Iso.box(ctx, { x: x0 - 0.15, y: y - 1.7, z: 0, w: 0.3, d: 0.3, h: 2.0, color: '#b0aa9c' });
    Iso.box(ctx, { x: x0 - 0.15, y: y + 1.4, z: 0, w: 0.3, d: 0.3, h: 2.0, color: '#b0aa9c' });
    Iso.box(ctx, { x: x0 - 0.2, y: y - 1.7, z: 2.0, w: 0.4, d: 3.4, h: 0.36, color: '#8e9aa4' });
  }

  /* ---- feeder spurs ------------------------------------------------------ */

  function drawFeeders() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      /* deck */
      ctx.fillStyle = '#8d8a80';
      Iso.ribbon(ctx, f.x, f.y0, f.x, f.y1, 1.1, 0.02);
      ctx.fillStyle = C.beltDark;
      Iso.ribbon(ctx, f.x, f.y0, f.x, f.y1, 0.8, 0.03);

      var step = 0.34, off = -((t * 1.1 + i) % step);
      ctx.fillStyle = 'rgba(160,168,176,0.45)';
      for (var d = off; d < f.len; d += step) {
        if (d < 0) continue;
        var y = f.y0 + d;
        Iso.poly(ctx, [
          P(f.x + 0.3, y + 0.04, 0.04), P(f.x - 0.3, y + 0.04, 0.04),
          P(f.x - 0.3, y - 0.04, 0.04), P(f.x + 0.3, y - 0.04, 0.04)
        ]);
      }
      /* one chevron per spur is enough to show which way it feeds */
      var cy0 = f.y0 + ((t * 1.1 + i * 0.5) % f.len);
      ctx.fillStyle = 'rgba(214,178,64,0.7)';
      Iso.poly(ctx, [
        P(f.x, cy0 + 0.3, 0.05), P(f.x + 0.24, cy0 - 0.08, 0.05),
        P(f.x, cy0 + 0.04, 0.05), P(f.x - 0.24, cy0 - 0.08, 0.05)
      ]);
    }
  }

  function drawFeederItems() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      var spacing = 1.5;
      var phase = (t * 1.1 + i * 0.37) % spacing;
      for (var d = phase; d < f.len - 0.2; d += spacing) {
        var y = f.y0 + d;
        drawFeederItem(f, f.x, y);
      }
    }
  }

  function drawFeederItem(f, x, y) {
    var z = 0.06;
    switch (f.item) {
      case 'ingot':
        Iso.box(ctx, { x: x - 0.26, y: y - 0.16, z: z, w: 0.52, d: 0.32, h: 0.16, color: f.color });
        break;
      case 'core':
        Iso.box(ctx, { x: x - 0.24, y: y - 0.2, z: z, w: 0.48, d: 0.4, h: 0.3, color: f.color });
        break;
      case 'billet':
        Iso.cylinder(ctx, { x: x, y: y, z: z, r: 0.19, h: 0.42, color: f.color });
        break;
      case 'wheel':
        Iso.cylinder(ctx, { x: x, y: y, z: z, r: 0.24, h: 0.14, color: f.color });
        Iso.gear(ctx, x, y, z + 0.15, 0.24, 9, t * 2.2, Iso.shade(f.color, 1.05));
        break;
      case 'valve':
        Iso.cylinder(ctx, { x: x, y: y, z: z, r: 0.07, h: 0.42, color: f.color });
        Iso.cylinder(ctx, { x: x, y: y, z: z + 0.42, r: 0.15, h: 0.07, color: f.color });
        break;
      case 'coil':
        Iso.cylinder(ctx, { x: x, y: y, z: z, r: 0.24, h: 0.26, color: f.color, ring: 0.5 });
        break;
      case 'cell':
        Iso.box(ctx, { x: x - 0.24, y: y - 0.18, z: z, w: 0.48, d: 0.36, h: 0.26, color: f.color });
        break;
      case 'panel':
        Iso.box(ctx, { x: x - 0.3, y: y - 0.22, z: z, w: 0.6, d: 0.44, h: 0.08, color: f.color });
        break;
      case 'drum':
        Iso.cylinder(ctx, { x: x, y: y, z: z, r: 0.22, h: 0.38, color: f.color, ring: 0.4 });
        break;
      default:
        Iso.box(ctx, { x: x - 0.2, y: y - 0.16, z: z, w: 0.4, d: 0.32, h: 0.22, color: f.color });
    }
  }

  /* An inserter: the swinging arm that lifts an item off the spur and puts it
     into the machine. Instantly readable as "this thing feeds that thing". */
  function drawInserter(x, y, ang0, ang1, phase, color) {
    var sw = 0.5 - 0.5 * Math.cos(phase * Math.PI * 2);
    var ang = ang0 + (ang1 - ang0) * sw;
    var reach = 0.85;
    Iso.box(ctx, { x: x - 0.22, y: y - 0.22, z: 0, w: 0.44, d: 0.44, h: 0.26, color: '#7d838a' });
    Iso.cylinder(ctx, { x: x, y: y, z: 0.26, r: 0.13, h: 0.18, color: color });
    var hx = Math.cos(ang), hy = Math.sin(ang);
    Iso.orientedBox(ctx, {
      x: x + hx * reach / 2, y: y + hy * reach / 2, z: 0.44,
      len: reach, wid: 0.1, h: 0.08, hx: hx, hy: hy, color: '#9aa1a8', edge: false
    });
    /* the hand, carrying on the way in and empty on the way back */
    var holding = sw > 0.5;
    Iso.box(ctx, {
      x: x + hx * reach - 0.1, y: y + hy * reach - 0.1, z: 0.4,
      w: 0.2, d: 0.2, h: 0.16, color: holding ? color : '#9aa1a8'
    });
  }

  function drawFeederEnds() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      /* supply rack at the top of the spur */
      Iso.box(ctx, { x: f.x - 0.7, y: f.y0 - 1.0, z: 0, w: 1.4, d: 1.0, h: 0.9, color: '#b3ab99' });
      Iso.box(ctx, { x: f.x - 0.62, y: f.y0 - 0.92, z: 0.9, w: 1.24, d: 0.84, h: 0.12, color: f.color });
      /* inserter at the machine end */
      drawInserter(f.x + 0.95, f.y1 + 0.35, -2.5, -0.7, (t * 0.9 + i * 0.3) % 1, f.color);
    }
  }

  /* ------------------------------------------------------- face-space text */

  /* Text painted onto the +y face (the one facing lower-left).
     (x0, y1, z0) is the top-left of the text block; local +y runs down the
     wall, so the glyphs come out upright rather than mirrored. */
  function faceText(x0, y1, z0, lines, opts) {
    var s = Iso.TZ / Math.hypot(Iso.TW, Iso.TH);
    var o = P(x0, y1, z0);
    var k = 1 / 20, size = opts.size || 14, i;
    ctx.save();
    ctx.transform(Iso.TW * s * k, Iso.TH * s * k, 0, Iso.TZ * k, o.x, o.y);
    ctx.font = size + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.textBaseline = 'top';
    ctx.textAlign = opts.align || 'left';

    if (opts.panel) {
      var w = 0;
      for (i = 0; i < lines.length; i++) w = Math.max(w, ctx.measureText(lines[i]).width);
      var h = lines.length * size * 1.25;
      var pad = size * 0.36;
      ctx.fillStyle = opts.panel;
      ctx.fillRect(-pad, -pad * 0.7, w + pad * 2, h + pad * 1.1);
      if (opts.panelEdge) {
        ctx.strokeStyle = opts.panelEdge;
        ctx.lineWidth = 1.4;
        ctx.strokeRect(-pad, -pad * 0.7, w + pad * 2, h + pad * 1.1);
      }
    }

    ctx.fillStyle = opts.color || '#3a352e';
    for (i = 0; i < lines.length; i++) ctx.fillText(lines[i], 0, i * size * 1.25);
    ctx.restore();
  }

  /* ---------------------------------------------------------- particles   */

  /* Deterministic puffs: position comes from the clock and an index, so no
     particle state has to be kept anywhere. */
  function puffs(x, y, z, n, seed, opts) {
    var rise = opts.rise || 2.4, rate = opts.rate || 0.45;
    for (var i = 0; i < n; i++) {
      var ph = ((t * rate + Iso.hash2(i, seed, 3)) % 1);
      var drift = Iso.hash2(i, seed, 9) - 0.5;
      var r = (opts.r0 || 0.16) + ph * (opts.r1 || 0.5);
      ctx.fillStyle = Iso.rgba(opts.color || '#e8e4da', (opts.alpha || 0.4) * (1 - ph));
      Iso.disc(ctx, x + drift * ph * 1.2, y + drift * ph * 0.8, z + ph * rise, r);
    }
  }

  function sparks(x, y, z, n, seed, color) {
    for (var i = 0; i < n; i++) {
      var ph = ((t * 2.4 + Iso.hash2(i, seed, 11)) % 1);
      var a = Iso.hash2(i, seed, 5) * 6.2832;
      var d = ph * 0.9;
      ctx.fillStyle = Iso.rgba(color, 0.9 * (1 - ph));
      Iso.disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d, z + 0.5 - ph * 0.45, 0.05);
    }
  }

  function busy(id) {
    /* a machine works when the carrier is standing in it */
    return Sim.state.stage === id ? 1 : 0.25;
  }

  /* ------------------------------------------------------------ machines  */

  function drawRack(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 1.1, y: y - 0.7, z: 0, w: 2.2, d: 1.4, h: 0.16, color: '#8b8578' });
    for (var i = 0; i < 3; i++) {
      var lvl = 0.16 + i * 0.52;
      Iso.box(ctx, { x: x - 1.1, y: y - 0.7, z: lvl, w: 2.2, d: 1.4, h: 0.07, color: '#9a9385' });
      for (var j = 0; j < 3; j++) {
        if (Iso.hash2(i, j + (x | 0), 13) < 0.3) continue;
        Iso.cylinder(ctx, {
          x: x - 0.7 + j * 0.7, y: y, z: lvl + 0.07, r: 0.17, h: 0.4,
          color: ['#9fb0bb', '#8b939b', '#a99ec0'][j % 3]
        });
      }
    }
    Iso.box(ctx, { x: x - 1.14, y: y - 0.74, z: 0, w: 0.12, d: 0.12, h: 1.9, color: '#7c7568' });
    Iso.box(ctx, { x: x + 1.02, y: y + 0.62, z: 0, w: 0.12, d: 0.12, h: 1.9, color: '#7c7568' });
  }

  function drawCrane(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.2, y: y - 2.6, z: 0, w: 0.4, d: 0.4, h: 3.6, color: '#9fadb8' });
    Iso.box(ctx, { x: x - 0.2, y: y + 2.2, z: 0, w: 0.4, d: 0.4, h: 3.6, color: '#9fadb8' });
    Iso.box(ctx, { x: x - 0.28, y: y - 2.6, z: 3.6, w: 0.56, d: 5.2, h: 0.36, color: '#8d9ca8' });
    var trav = Math.sin(t * 0.7) * 1.6;
    var bob = 1.9 + Math.sin(t * 1.6) * 0.4;
    Iso.box(ctx, { x: x - 0.07, y: y + trav - 0.07, z: bob, w: 0.14, d: 0.14, h: 3.6 - bob, color: '#8d9ca8' });
    Iso.box(ctx, { x: x - 0.32, y: y + trav - 0.32, z: bob - 0.36, w: 0.64, d: 0.64, h: 0.36, color: C.ochre });
  }

  function drawFurnace(b) {
    var x = b.x, y = b.y, w = busy('cast');
    Iso.box(ctx, { x: x - 1.6, y: y - 1.4, z: 0, w: 3.2, d: 2.8, h: 2.2, color: '#b0a08c' });
    Iso.box(ctx, { x: x - 1.7, y: y - 1.5, z: 2.2, w: 3.4, d: 3.0, h: 0.24, color: '#8e8272' });
    Iso.cylinder(ctx, { x: x + 1.1, y: y - 0.9, z: 2.44, r: 0.32, h: 1.9, color: '#9a9084' });

    /* the mouth, glowing */
    var glow = 0.45 + 0.35 * Math.sin(t * 3.1) + 0.4 * w;
    ctx.fillStyle = Iso.rgba('#e0761f', Math.min(0.95, 0.35 + glow * 0.4));
    var m = P(x - 1.6, y + 1.4, 0.9);
    ctx.beginPath();
    ctx.ellipse(m.x + 22, m.y - 4, 20, 15, 0, 0, 6.2832);
    ctx.fill();

    puffs(x + 1.1, y - 0.9, 4.3, 6, 21, { color: '#cfc9bd', alpha: 0.45, rise: 3.0, rate: 0.35 });
    if (Sim.state.stage === 'cast') {
      /* a wash of light on the floor in front of the door, not a pool of
         paint: anything stronger than this swamps the whole bay */
      ctx.fillStyle = Iso.rgba('#ff9a3c', 0.13);
      Iso.disc(ctx, x - 1.3, y + 1.4, 0.05, 1.1);
      sparks(x - 1.3, y + 1.3, 0.9, 7, 7, '#ffb257');
    }
  }

  function drawLadle(b) {
    var x = b.x, y = b.y;
    var tip = Sim.state.stage === 'cast' ? Math.sin(t * 1.4) * 0.12 : 0;
    Iso.box(ctx, { x: x - 0.32, y: y - 0.32, z: 0, w: 0.64, d: 0.64, h: 1.5, color: '#8f8b80' });
    Iso.cylinder(ctx, { x: x, y: y, z: 1.5 + tip, r: 0.62, h: 0.9, color: '#7f6c58', ring: 0.5 });
    ctx.fillStyle = Iso.rgba('#ffae4d', 0.75 + 0.2 * Math.sin(t * 4));
    Iso.disc(ctx, x, y, 2.4 + tip, 0.44);
    if (Sim.state.stage === 'cast') {
      for (var i = 0; i < 5; i++) {
        var ph = (t * 1.2 + i * 0.2) % 1;
        ctx.fillStyle = Iso.rgba('#ffa236', 0.6 * (1 - ph));
        Iso.disc(ctx, x + 0.6 + ph * 0.7, y + 0.3, 2.3 - ph * 1.5, 0.11);
      }
    }
  }

  function drawSandbin(b) {
    Iso.box(ctx, { x: b.x - 1.0, y: b.y - 0.9, z: 0, w: 2.0, d: 1.8, h: 1.3, color: b.color });
    Iso.box(ctx, { x: b.x - 0.85, y: b.y - 0.75, z: 1.3, w: 1.7, d: 1.5, h: 0.16, color: '#b09a6c' });
    Iso.cylinder(ctx, { x: b.x - 0.6, y: b.y + 0.5, z: 1.46, r: 0.28, h: 0.5, color: '#9a8a66' });
  }

  function drawOven(b) {
    var x = b.x, y = b.y, w = busy('heat');
    Iso.box(ctx, { x: x - 2.6, y: y - 1.1, z: 0, w: 5.2, d: 2.2, h: 1.9, color: '#b6a595' });
    Iso.box(ctx, { x: x - 2.7, y: y - 1.2, z: 1.9, w: 5.4, d: 2.4, h: 0.22, color: '#94867a' });
    /* door on the near face, glowing when there is something in it */
    ctx.fillStyle = Iso.rgba('#d8621f', 0.25 + 0.5 * w + 0.12 * Math.sin(t * 2.4));
    var m = P(x - 1.4, y + 1.1, 0.4);
    ctx.beginPath();
    ctx.rect(m.x, m.y - 26, 46, 26);
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,60,50,0.5)';
    ctx.lineWidth = 1.4;
    ctx.stroke();
    Iso.cylinder(ctx, { x: x + 2.0, y: y - 0.6, z: 2.12, r: 0.26, h: 1.4, color: '#9d9184' });
    puffs(x + 2.0, y - 0.6, 3.5, 4, 33, { color: '#d8d2c6', alpha: 0.35, rise: 2.2, rate: 0.3 });
  }

  function drawQuench(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 1.1, y: y - 1.0, z: 0, w: 2.2, d: 2.0, h: 1.0, color: '#8e9c9c' });
    ctx.fillStyle = Iso.rgba('#4f8f96', 0.85);
    Iso.poly(ctx, [P(x - 0.95, y - 0.85, 1.02), P(x + 0.95, y - 0.85, 1.02),
                   P(x + 0.95, y + 0.85, 1.02), P(x - 0.95, y + 0.85, 1.02)]);
    /* ripples. ellipse() throws on a negative radius rather than clamping, and
       it only takes one bad frame to kill the draw, so the phase is floored. */
    for (var i = 0; i < 3; i++) {
      var ph = Math.max(0, (t * 0.5 + i / 3) % 1);
      ctx.strokeStyle = Iso.rgba('#cfeaec', 0.5 * (1 - ph));
      var p = P(x, y, 1.03);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, ph * 26, ph * 13, 0, 0, 6.2832);
      ctx.stroke();
    }
    puffs(x, y, 1.1, 5, 51, { color: '#e6efef', alpha: 0.5, rise: 1.8, rate: 0.55, r0: 0.2, r1: 0.5 });
  }

  function drawCnc(b) {
    var x = b.x, y = b.y, w = busy('machine');
    /* enclosure with a window, because a five-axis machine is a box you cannot
       see into except through one panel */
    Iso.box(ctx, { x: x - 1.2, y: y - 1.0, z: 0, w: 2.4, d: 2.0, h: 2.0, color: '#aeb6bd' });
    ctx.fillStyle = Iso.rgba('#5f7c8c', 0.5);
    var m = P(x - 0.9, y + 1.0, 1.7);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + 36, m.y + 18);
    ctx.lineTo(m.x + 36, m.y + 18 - 24);
    ctx.lineTo(m.x, m.y - 24);
    ctx.closePath();
    ctx.fill();
    Iso.box(ctx, { x: x - 1.26, y: y - 1.06, z: 2.0, w: 2.52, d: 2.12, h: 0.2, color: '#8f979e' });
    /* spindle head sliding on the gantry */
    var sx = Math.sin(t * 1.7 + x) * 0.5;
    Iso.box(ctx, { x: x - 0.24 + sx, y: y - 0.2, z: 2.2, w: 0.48, d: 0.4, h: 0.5, color: C.steel });
    Iso.cylinder(ctx, { x: x + sx, y: y, z: 2.05, r: 0.1, h: 0.2, color: '#6d757c' });
    /* status beacon */
    ctx.fillStyle = Iso.rgba(w > 0.5 ? '#59a34a' : '#c2a13c', 0.55 + 0.4 * Math.abs(Math.sin(t * 2.5)));
    Iso.disc(ctx, x + 1.0, y - 0.8, 2.7, 0.14);
    if (Sim.state.stage === 'machine') {
      sparks(x + sx, y, 1.6, 7, (x | 0) + 3, '#cfe4ff');
      puffs(x, y, 2.1, 3, (x | 0) + 9, { color: '#dfe7ec', alpha: 0.3, rise: 1.2, rate: 0.7 });
    }
  }

  function drawChipbin(b) {
    Iso.box(ctx, { x: b.x - 0.7, y: b.y - 0.6, z: 0, w: 1.4, d: 1.2, h: 0.9, color: '#7f858b' });
    Iso.box(ctx, { x: b.x - 0.58, y: b.y - 0.48, z: 0.9, w: 1.16, d: 0.96, h: 0.16, color: '#9aa1a8' });
  }

  function drawChamber(b) {
    var x = b.x, y = b.y, w = busy('coat');
    Iso.box(ctx, { x: x - 0.9, y: y - 0.9, z: 0, w: 1.8, d: 1.8, h: 0.5, color: '#8b8592' });
    Iso.cylinder(ctx, { x: x, y: y, z: 0.5, r: 0.78, h: 1.7, color: '#a49bb0', ring: 0.4 });
    Iso.cylinder(ctx, { x: x, y: y, z: 2.2, r: 0.5, h: 0.3, color: '#8d84a0' });
    ctx.fillStyle = Iso.rgba(C.plum, 0.25 + 0.45 * w * (0.6 + 0.4 * Math.sin(t * 3.4 + x)));
    Iso.disc(ctx, x, y, 2.52, 0.7);
    if (Sim.state.stage === 'coat') {
      ctx.fillStyle = Iso.rgba('#c8a8e0', 0.18);
      Iso.disc(ctx, x, y, 0.05, 1.6);
    }
  }

  function drawTank(b) {
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.85, h: 2.6, color: b.color, ring: 0.35 });
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 2.6, r: 0.6, h: 0.22, color: Iso.shade(b.color, 0.9) });
  }

  function drawCmm(b) {
    var x = b.x, y = b.y;
    /* granite table + gantry: the probe sweeps a grid, which is exactly what a
       coordinate measuring machine looks like from across a room */
    Iso.box(ctx, { x: x - 1.5, y: y - 1.2, z: 0, w: 3.0, d: 2.4, h: 0.9, color: '#6f7378' });
    Iso.box(ctx, { x: x - 1.4, y: y - 1.1, z: 0.9, w: 2.8, d: 2.2, h: 0.12, color: '#8e9298' });
    Iso.box(ctx, { x: x - 1.5, y: y - 1.25, z: 1.02, w: 0.2, d: 0.2, h: 1.5, color: '#b9c0c6' });
    Iso.box(ctx, { x: x + 1.3, y: y - 1.25, z: 1.02, w: 0.2, d: 0.2, h: 1.5, color: '#b9c0c6' });
    Iso.box(ctx, { x: x - 1.5, y: y + 1.05, z: 1.02, w: 0.2, d: 0.2, h: 1.5, color: '#b9c0c6' });
    Iso.box(ctx, { x: x + 1.3, y: y + 1.05, z: 1.02, w: 0.2, d: 0.2, h: 1.5, color: '#b9c0c6' });
    var gy = Math.sin(t * 0.8) * 0.9;
    Iso.box(ctx, { x: x - 1.5, y: y + gy - 0.1, z: 2.5, w: 3.0, d: 0.2, h: 0.18, color: '#a7aeb4' });
    var px = Math.sin(t * 1.9) * 1.1;
    Iso.box(ctx, { x: x + px - 0.14, y: y + gy - 0.14, z: 2.2, w: 0.28, d: 0.28, h: 0.34, color: C.teal });
    Iso.cylinder(ctx, { x: x + px, y: y + gy, z: 1.02, r: 0.03, h: 1.2, color: '#5c646a' });
    ctx.fillStyle = Iso.rgba(C.teal, 0.5 + 0.4 * Math.abs(Math.sin(t * 4)));
    Iso.disc(ctx, x + px, y + gy, 1.05, 0.07);
  }

  function drawConsole(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.5, y: y - 0.35, z: 0, w: 1.0, d: 0.7, h: 0.75, color: '#8d939a' });
    Iso.box(ctx, { x: x - 0.46, y: y - 0.05, z: 0.75, w: 0.92, d: 0.1, h: 0.6, color: '#5f666d' });
    ctx.fillStyle = Iso.rgba(b.color, 0.4 + 0.3 * Math.abs(Math.sin(t * 1.7 + x)));
    var p = P(x - 0.4, y + 0.06, 1.3);
    ctx.fillRect(p.x, p.y - 1, 24, 12);
  }

  function drawAssembler(b) {
    var x = b.x, y = b.y;
    /* an assembler that has the unit in it works visibly harder */
    var spin = t * (Sim.state.stage === b.station ? 3.2 : 1.1);
    Iso.box(ctx, { x: x - 1.35, y: y - 1.15, z: 0, w: 2.7, d: 2.3, h: 0.55, color: '#9aa0a6' });
    Iso.cylinder(ctx, { x: x, y: y, z: 0.55, r: 1.05, h: 0.85, color: Iso.mix('#d6d2c8', b.color, 0.25) });
    Iso.cylinder(ctx, { x: x, y: y, z: 1.4, r: 0.85, h: 0.2, color: '#b6bcc2' });
    /* three arms sweeping over the work, plus a gear on the flank */
    for (var i = 0; i < 3; i++) {
      var a = spin + i * 2.0944;
      var hx = Math.cos(a), hy = Math.sin(a);
      Iso.orientedBox(ctx, {
        x: x + hx * 0.42, y: y + hy * 0.42, z: 1.6,
        len: 0.84, wid: 0.13, h: 0.1, hx: hx, hy: hy, color: b.color, edge: false
      });
      Iso.box(ctx, { x: x + hx * 0.84 - 0.08, y: y + hy * 0.84 - 0.08, z: 1.55, w: 0.16, d: 0.16, h: 0.14, color: '#7d838a' });
    }
    Iso.cylinder(ctx, { x: x, y: y, z: 1.6, r: 0.2, h: 0.3, color: '#8b9198' });
    Iso.gear(ctx, x + 1.25, y + 0.75, 0.58, 0.42, 10, -spin * 0.8, Iso.shade(b.color, 0.95));
    ctx.fillStyle = Iso.rgba(b.color, 0.4 + 0.35 * Math.abs(Math.sin(t * 3)));
    Iso.disc(ctx, x - 1.15, y - 0.95, 0.58, 0.12);
  }

  function drawBench(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.9, y: y - 0.6, z: 0, w: 1.8, d: 1.2, h: 0.72, color: '#a5a093' });
    Iso.box(ctx, { x: x - 0.95, y: y - 0.65, z: 0.72, w: 1.9, d: 1.3, h: 0.1, color: Iso.mix('#cfcabb', b.color, 0.3) });
    /* parts laid out on it */
    for (var i = 0; i < 4; i++) {
      var u = -0.6 + i * 0.4;
      Iso.box(ctx, { x: x + u, y: y - 0.2, z: 0.82, w: 0.22, d: 0.34, h: 0.1, color: '#8f959c' });
    }
    Iso.box(ctx, { x: x - 0.95, y: y - 0.65, z: 0.82, w: 0.12, d: 0.12, h: 1.1, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.95, y: y - 0.65, z: 1.9, w: 1.9, d: 0.1, h: 0.1, color: '#8b8578' });
  }

  function drawGasbottle(b) {
    for (var i = 0; i < 3; i++) {
      Iso.cylinder(ctx, { x: b.x + i * 0.42 - 0.42, y: b.y, z: 0, r: 0.19, h: 1.5, color: b.color });
      Iso.cylinder(ctx, { x: b.x + i * 0.42 - 0.42, y: b.y, z: 1.5, r: 0.1, h: 0.2, color: '#7f858b' });
    }
    Iso.box(ctx, { x: b.x - 0.75, y: b.y - 0.3, z: 0.8, w: 1.5, d: 0.08, h: 0.1, color: '#7f858b' });
  }

  function drawBalancer(b) {
    var x = b.x, y = b.y;
    var fast = Sim.state.stage === 'turbo' ? 9 : 3;
    Iso.box(ctx, { x: x - 1.3, y: y - 1.0, z: 0, w: 2.6, d: 2.0, h: 0.8, color: '#9aa0a6' });
    Iso.box(ctx, { x: x - 1.1, y: y - 0.8, z: 0.8, w: 2.2, d: 1.6, h: 0.14, color: '#b0b6bc' });
    /* the turbine itself, up on a spindle, visibly spinning */
    Iso.cylinder(ctx, { x: x - 0.4, y: y, z: 0.94, r: 0.16, h: 0.5, color: '#8b9198' });
    Iso.gear(ctx, x - 0.4, y, 1.44, 0.55, 12, t * fast, b.color);
    Iso.cylinder(ctx, { x: x + 0.7, y: y, z: 0.94, r: 0.14, h: 0.44, color: '#8b9198' });
    Iso.gear(ctx, x + 0.7, y, 1.38, 0.42, 10, -t * fast, '#b8bec4');
    Iso.orientedBox(ctx, { x: x + 0.15, y: y, z: 1.2, len: 1.1, wid: 0.08, h: 0.08, hx: 1, hy: 0, color: '#79808a', edge: false });
    ctx.fillStyle = Iso.rgba(b.color, 0.3 + 0.3 * Math.abs(Math.sin(t * 5)));
    Iso.disc(ctx, x - 0.4, y, 1.46, 0.6);
  }

  function drawCleanroom(b) {
    var x = b.x, y = b.y;
    /* glass box: you can see the racks inside, which is the point of it */
    Iso.box(ctx, { x: x - 1.8, y: y - 1.4, z: 0, w: 3.6, d: 2.8, h: 0.2, color: '#c9cfc6' });
    for (var i = 0; i < 3; i++) {
      Iso.box(ctx, { x: x - 1.35 + i * 1.0, y: y - 0.9, z: 0.2, w: 0.7, d: 1.4, h: 1.0, color: Iso.mix('#cfd6cc', b.color, 0.35) });
      ctx.fillStyle = Iso.rgba(b.color, 0.45 + 0.3 * Math.abs(Math.sin(t * 2 + i)));
      Iso.disc(ctx, x - 1.0 + i * 1.0, y - 0.2, 1.22, 0.15);
    }
    Iso.box(ctx, { x: x - 1.8, y: y - 1.4, z: 0.2, w: 3.6, d: 2.8, h: 1.8, color: '#dfe6e2', alpha: 0.34, edge: 'rgba(80,90,84,0.45)' });
    Iso.box(ctx, { x: x - 1.9, y: y - 1.5, z: 2.0, w: 3.8, d: 3.0, h: 0.22, color: '#b9c2bb' });
    puffs(x, y, 2.3, 3, 71, { color: '#eef2ee', alpha: 0.28, rise: 1.2, rate: 0.4 });
  }

  function drawWinder(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.8, y: y - 0.7, z: 0, w: 1.6, d: 1.4, h: 0.7, color: '#9aa0a6' });
    Iso.cylinder(ctx, { x: x, y: y, z: 0.7, r: 0.45, h: 0.55, color: b.color, ring: 0.5 });
    Iso.gear(ctx, x, y, 1.27, 0.45, 12, t * 4, Iso.shade(b.color, 1.05));
  }

  function drawStand(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.7, y: y - 0.6, z: 0, w: 1.4, d: 1.2, h: 0.2, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.14, y: y - 0.14, z: 0.2, w: 0.28, d: 0.28, h: 1.0, color: '#9aa0a6' });
    var spin = t * 0.5;
    Iso.gear(ctx, x, y, 1.2, 0.5, 8, spin, Iso.shade(b.color, 1.0));
    Iso.cylinder(ctx, { x: x, y: y, z: 1.22, r: 0.16, h: 0.3, color: '#8b9198' });
  }

  function drawTorquebay(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.9, y: y - 0.7, z: 0, w: 1.8, d: 1.4, h: 0.75, color: '#a5a093' });
    Iso.box(ctx, { x: x - 0.95, y: y - 0.75, z: 0.75, w: 1.9, d: 1.5, h: 0.1, color: Iso.mix('#cfcabb', b.color, 0.35) });
    /* balancer arm holding a torque wrench over the bench */
    Iso.box(ctx, { x: x + 0.75, y: y - 0.7, z: 0.85, w: 0.12, d: 0.12, h: 1.5, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.6, y: y - 0.72, z: 2.25, w: 1.5, d: 0.1, h: 0.1, color: '#8b8578' });
    var sw = Math.sin(t * 1.3) * 0.3;
    Iso.cylinder(ctx, { x: x - 0.1 + sw, y: y - 0.1, z: 1.4, r: 0.05, h: 0.8, color: '#6d757c' });
    Iso.box(ctx, { x: x - 0.2 + sw, y: y - 0.2, z: 1.2, w: 0.2, d: 0.2, h: 0.24, color: b.color });
  }

  function drawDyno(b) {
    var x = b.x, y = b.y;
    var hot = Sim.state.stage === 'dyno';
    /* a test cell is a concrete box with one big window and a lot of ducting */
    Iso.box(ctx, { x: x - 3.0, y: y - 1.8, z: 0, w: 6.0, d: 3.6, h: 2.7, color: '#c3bdb0',
                   panels: { cols: 5, rows: 3, seed: 5, color: '#94a7b2', band: 1 } });
    Iso.box(ctx, { x: x - 3.15, y: y - 1.95, z: 2.7, w: 6.3, d: 3.9, h: 0.3, color: '#8f8a7f' });
    /* observation window on the near face, with the flicker of a running engine */
    ctx.fillStyle = hot
      ? Iso.rgba('#ffb15c', 0.35 + 0.4 * Math.abs(Math.sin(t * 17)))
      : 'rgba(96,116,128,0.45)';
    var m = P(x - 1.9, y + 1.8, 2.05);
    ctx.beginPath();
    ctx.moveTo(m.x, m.y);
    ctx.lineTo(m.x + 78, m.y + 39);
    ctx.lineTo(m.x + 78, m.y + 39 - 24);
    ctx.lineTo(m.x, m.y - 24);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = 'rgba(70,64,54,0.55)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    /* extract stack: quiet when idle, hard at work when the engine is running */
    Iso.cylinder(ctx, { x: x + 2.1, y: y - 1.1, z: 3.0, r: 0.42, h: 2.2, color: '#9a938a' });
    puffs(x + 2.1, y - 1.1, 5.2, hot ? 9 : 4, 91, {
      color: hot ? '#ded6c8' : '#e4e0d6', alpha: hot ? 0.55 : 0.3,
      rise: hot ? 4.2 : 2.4, rate: hot ? 0.75 : 0.35, r1: 0.9
    });
    /* intake ducting on the roof */
    for (var i = 0; i < 3; i++) {
      Iso.box(ctx, { x: x - 2.3 + i * 1.6, y: y - 1.6, z: 3.0, w: 0.9, d: 0.6, h: 0.6, color: '#aeb4b8' });
    }
  }

  function drawFan(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.6, y: y - 0.6, z: 0, w: 1.2, d: 1.2, h: 0.35, color: '#8b8578' });
    Iso.cylinder(ctx, { x: x, y: y, z: 0.35, r: 0.8, h: 1.5, color: '#b1b7bb', ring: 0.5 });
    Iso.gear(ctx, x, y, 1.87, 0.72, 6, t * (Sim.state.stage === 'dyno' ? 12 : 4), '#c9ced2');
  }

  function drawGatePost(b) {
    Iso.box(ctx, { x: b.x - 0.24, y: b.y - 0.24, z: 0, w: 0.48, d: 0.48, h: 2.7, color: '#aab4bc' });
  }

  function drawGateBeam(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.34, y: y - 1.75, z: 2.7, w: 0.68, d: 3.5, h: 0.42, color: '#98a3ab' });
    /* the seal light: green once the unit has been through */
    var on = Sim.state.level >= Sim.LEVEL.seal;
    ctx.fillStyle = Iso.rgba(on ? '#4f9a43' : '#b8a03c', 0.5 + 0.4 * Math.abs(Math.sin(t * 2.2)));
    Iso.disc(ctx, x, y - 1.2, 3.16, 0.16);
    Iso.disc(ctx, x, y + 1.2, 3.16, 0.16);
    if (showLabels) {
      faceText(x - 0.3, y + 1.75, 3.0, ['SEAL'], {
        size: 15, color: '#4c545c', panel: '#f4f2ea', panelEdge: 'rgba(76,84,92,0.6)'
      });
    }
  }

  function drawDock(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 2.0, y: y - 1.8, z: 0, w: 4.0, d: 3.6, h: 1.1, color: '#bfb9ab' });
    Iso.box(ctx, { x: x - 2.1, y: y - 1.9, z: 1.1, w: 4.2, d: 3.8, h: 0.2, color: '#9a948a' });
    /* The transporter waiting at the dock, cab pointing west: the line now
       runs down the east end of the pad and a cab facing that way would be
       parked on the belt. */
    Iso.box(ctx, { x: x - 1.6, y: y + 2.0, z: 0.25, w: 3.4, d: 1.5, h: 1.3, color: '#e2ded2' });
    Iso.box(ctx, { x: x - 2.6, y: y + 2.05, z: 0.25, w: 1.0, d: 1.4, h: 1.0, color: C.steel });
    for (var i = 0; i < 3; i++) {
      Iso.cylinder(ctx, { x: x - 1.1 + i * 1.3, y: y + 2.05, z: 0, r: 0.24, h: 0.3, color: '#4c4a46' });
    }
    if (showLabels) {
      faceText(x - 1.5, y + 2.02, 1.4, ['DISPATCH'], {
        size: 13, color: '#35566d', panel: '#f2f6f9', panelEdge: 'rgba(53,86,109,0.5)'
      });
    }
  }

  function drawChassisjig(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 1.5, y: y - 1.1, z: 0, w: 3.0, d: 2.2, h: 0.3, color: '#8b8578' });
    /* a survival cell on a stand, waiting for its engine */
    Iso.orientedBox(ctx, { x: x, y: y, z: 0.3, len: 2.4, wid: 1.2, h: 0.55, hx: 1, hy: 0, color: '#3f3d3a' });
    Iso.orientedBox(ctx, { x: x - 0.8, y: y, z: 0.85, len: 0.9, wid: 0.9, h: 0.3, hx: 1, hy: 0, color: '#4a4744' });
    Iso.box(ctx, { x: x - 1.5, y: y - 1.15, z: 0.3, w: 0.14, d: 0.14, h: 1.0, color: '#9aa0a6' });
    Iso.box(ctx, { x: x + 1.36, y: y + 1.01, z: 0.3, w: 0.14, d: 0.14, h: 1.0, color: '#9aa0a6' });
  }

  function drawStripbench(b) {
    var x = b.x, y = b.y, z = b.z || 0;
    Iso.box(ctx, { x: x - 1.0, y: y - 1.4, z: z, w: 2.0, d: 2.8, h: 0.16, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.85, y: y - 1.25, z: z + 0.16, w: 1.7, d: 2.5, h: 0.6, color: Iso.mix('#cfcabb', b.color, 0.3) });
    /* parts laid out in rows, which is what a strip bench actually is */
    for (var i = 0; i < 3; i++) {
      for (var j = 0; j < 2; j++) {
        Iso.box(ctx, {
          x: x - 0.55 + j * 0.6, y: y - 0.9 + i * 0.75, z: z + 0.76,
          w: 0.34, d: 0.44, h: 0.12, color: ['#8f959c', '#a99ec0', '#c8a75e'][(i + j) % 3]
        });
      }
    }
    Iso.box(ctx, { x: x - 0.9, y: y - 1.3, z: z + 0.76, w: 0.1, d: 0.1, h: 1.2, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.9, y: y - 1.3, z: z + 1.9, w: 0.1, d: 2.6, h: 0.1, color: '#8b8578' });
  }

  /* ---------------------------------------------------------------- props */

  function drawPole(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.11, y: y - 0.11, z: 0, w: 0.22, d: 0.22, h: 3.4, color: '#9a8f7c' });
    Iso.box(ctx, { x: x - 0.5, y: y - 0.07, z: 3.4, w: 1.0, d: 0.14, h: 0.1, color: '#8b8172' });
    Iso.box(ctx, { x: x - 0.07, y: y - 0.5, z: 3.28, w: 0.14, d: 1.0, h: 0.1, color: '#8b8172' });
    if (b.prev) {
      var a = P(x, y, 3.42), c = P(b.prev.x, b.prev.y, 3.42);
      ctx.strokeStyle = 'rgba(72,66,56,0.5)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + c.x) / 2, (a.y + c.y) / 2 + 14, c.x, c.y);
      ctx.stroke();
    }
  }

  function drawPiperun(b) {
    var z = b.z;
    /* pipe on low stands, with product visibly moving through it */
    ctx.fillStyle = '#a7aeb2';
    Iso.ribbon(ctx, b.x0, b.y0, b.x1, b.y1, 0.34, z + 0.16);
    ctx.fillStyle = '#c0c6c9';
    Iso.ribbon(ctx, b.x0, b.y0, b.x1, b.y1, 0.2, z + 0.2);
    var len = Math.hypot(b.x1 - b.x0, b.y1 - b.y0);
    var i;
    for (i = 0; i < len; i += 4) {
      var f = i / len;
      Iso.box(ctx, {
        x: b.x0 + (b.x1 - b.x0) * f - 0.06, y: b.y0 + (b.y1 - b.y0) * f - 0.06,
        z: 0, w: 0.12, d: 0.12, h: z, color: '#9a938a'
      });
    }
    var step = 2.2, off = (t * 1.6) % step;
    ctx.fillStyle = Iso.rgba(C.teal, 0.5);
    for (i = off; i < len; i += step) {
      var g = i / len;
      Iso.disc(ctx, b.x0 + (b.x1 - b.x0) * g, b.y0 + (b.y1 - b.y0) * g, z + 0.22, 0.1);
    }
  }

  function drawLamp(b) {
    Iso.box(ctx, { x: b.x - 0.08, y: b.y - 0.08, z: 0, w: 0.16, d: 0.16, h: 2.8, color: '#9aa0a6' });
    Iso.box(ctx, { x: b.x - 0.24, y: b.y - 0.18, z: 2.8, w: 0.48, d: 0.36, h: 0.14, color: '#7f858b' });
    ctx.fillStyle = 'rgba(255,244,206,0.5)';
    Iso.disc(ctx, b.x, b.y, 2.78, 0.22);
  }

  function drawPallet(b) {
    var s = b.seed;
    Iso.box(ctx, { x: b.x - 0.5, y: b.y - 0.4, z: 0, w: 1.0, d: 0.8, h: 0.12, color: '#a58d63' });
    var n = 1 + Math.floor(Iso.hash2(s, 3, 5) * 3);
    for (var i = 0; i < n; i++) {
      Iso.box(ctx, {
        x: b.x - 0.42, y: b.y - 0.32, z: 0.12 + i * 0.3,
        w: 0.84, d: 0.64, h: 0.28,
        color: ['#b3ab99', '#9fb0bb', '#a58d63', '#8f959c'][(s + i) % 4]
      });
    }
  }

  function drawTree(b) {
    var s = b.s || 1;
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.11 * s, h: 0.55 * s, color: '#7a624a' });
    ctx.fillStyle = '#54783f';
    Iso.disc(ctx, b.x, b.y, 0.55 * s + 0.35 * s, 0.62 * s);
    ctx.fillStyle = '#62884a';
    Iso.disc(ctx, b.x - 0.1 * s, b.y - 0.1 * s, 0.55 * s + 0.6 * s, 0.46 * s);
  }

  /* ------------------------------------------------------------- forklifts */

  /* Ambient traffic on the painted aisles. Position comes straight from the
     clock, so nothing has to be stepped or stored. */
  var AISLE_LOOPS = [
    { pts: [[3, 11], [49, 11], [49, 22.4], [3, 22.4]], speed: 3.2 },
    { pts: [[49, 22.4], [3, 22.4], [3, 11], [49, 11]], speed: 2.6 }
  ];

  function loopAt(loop, d) {
    var pts = loop.pts, i, total = 0, lens = [];
    for (i = 0; i < pts.length; i++) {
      var a = pts[i], b = pts[(i + 1) % pts.length];
      var L = Math.hypot(b[0] - a[0], b[1] - a[1]);
      lens.push(L);
      total += L;
    }
    d = ((d % total) + total) % total;
    for (i = 0; i < pts.length; i++) {
      if (d <= lens[i]) {
        var p = pts[i], q = pts[(i + 1) % pts.length];
        var f = d / lens[i];
        return {
          x: p[0] + (q[0] - p[0]) * f, y: p[1] + (q[1] - p[1]) * f,
          dx: (q[0] - p[0]) / lens[i], dy: (q[1] - p[1]) / lens[i]
        };
      }
      d -= lens[i];
    }
    return { x: pts[0][0], y: pts[0][1], dx: 1, dy: 0 };
  }

  function forklifts() {
    var out = [];
    for (var i = 0; i < AISLE_LOOPS.length; i++) {
      for (var k = 0; k < 2; k++) {
        var p = loopAt(AISLE_LOOPS[i], t * AISLE_LOOPS[i].speed + k * 41 + i * 17);
        out.push({ x: p.x, y: p.y, dx: p.dx, dy: p.dy, tint: i * 2 + k });
      }
    }
    return out;
  }

  function drawForklift(v) {
    var col = ['#c2913c', '#b3382f', '#4a7a9b', '#5f8a52'][v.tint % 4];
    ctx.fillStyle = 'rgba(104,92,74,0.2)';
    Iso.disc(ctx, v.x, v.y, 0.02, 0.42);
    Iso.orientedBox(ctx, { x: v.x, y: v.y, z: 0.08, len: 0.9, wid: 0.6, h: 0.34, hx: v.dx, hy: v.dy, color: col });
    Iso.orientedBox(ctx, { x: v.x - v.dx * 0.16, y: v.y - v.dy * 0.16, z: 0.42, len: 0.44, wid: 0.5, h: 0.3, hx: v.dx, hy: v.dy, color: '#4c4a46' });
    /* mast and forks out front */
    Iso.orientedBox(ctx, { x: v.x + v.dx * 0.46, y: v.y + v.dy * 0.46, z: 0.1, len: 0.1, wid: 0.5, h: 0.9, hx: v.dx, hy: v.dy, color: '#7f858b' });
    Iso.orientedBox(ctx, { x: v.x + v.dx * 0.72, y: v.y + v.dy * 0.72, z: 0.14, len: 0.42, wid: 0.44, h: 0.1, hx: v.dx, hy: v.dy, color: '#9aa0a6' });
  }

  /* ------------------------------------------------------ the unit itself */

  /* Local frame helpers: u runs along the belt, v across it. Everything the
     engine is made of is placed in (u, v) so the whole assembly turns through
     a corner as one object. */
  function fx(f, u, v) { return f.x + f.hx * u - f.hy * v; }
  function fy(f, u, v) { return f.y + f.hy * u + f.hx * v; }

  function ob(f, u, v, z, len, wid, h, color, edge) {
    Iso.orientedBox(ctx, {
      x: fx(f, u, v), y: fy(f, u, v), z: z,
      len: len, wid: wid, h: h, hx: f.hx, hy: f.hy, color: color,
      edge: edge
    });
  }

  function cy(f, u, v, z, r, h, color, ring) {
    Iso.cylinder(ctx, { x: fx(f, u, v), y: fy(f, u, v), z: z, r: r, h: h, color: color, ring: ring });
  }

  /* bank offsets for a 90° V6: three cylinders per side, the banks splayed */
  var BANK_U = [-0.52, 0, 0.52];
  var BANK_V = 0.34;

  function drawUnit(c) {
    var s = Sim.state;
    var f = { x: c.x, y: c.y, hx: c.dx || 1, hy: c.dy || 0 };
    var z = c.z;
    var L = s.level;

    /* shadow + skid: the unit always rides on a pallet */
    ctx.fillStyle = 'rgba(104,92,74,0.26)';
    Iso.disc(ctx, c.x, c.y, z + 0.02, 0.8);
    ob(f, 0, 0, z + 0.06, 2.3, 1.6, 0.14, '#8a8272');
    ob(f, 0, 0, z + 0.2, 2.1, 1.4, 0.04, '#a8a08e');

    var base = z + 0.24;

    if (L === 0) { drawIngots(f, base); return; }
    if (L >= 14) { drawStripped(f, base); return; }
    /* the hook has it, or the car has: either way the pallet is empty */
    if (unitLifted()) { drawCradle(f, base); return; }

    drawEngine(f, base, L);

    /* build tag, stamped at metrology and carried from there on */
    if (L >= 5 && showLabels) {
      labels.push({
        x: c.x, y: c.y, z: z + (L >= 10 ? 2.0 : 1.4), lift: 8,
        text: Sim.state.tag, sub: null, color: '#8c2f27', size: 11, small: true, mono: true
      });
    }
  }

  /* The power unit itself, built up cumulatively to level L. Drawn in the
     frame it is handed, which is the carrier on the belt for most of the run,
     the hoist hook while it is being lowered into the car, and the back of the
     car after that. */
  function drawEngine(f, base, L) {
    var s = Sim.state;

    /* ---- the block ---- */
    var raw = L <= 2;
    var blockColor = L <= 1 ? '#8e9298' : (L === 2 ? '#a89e90' : '#b5bbc1');
    ob(f, 0, 0, base, 1.95, 1.25, 0.5, blockColor);
    /* sump appears with the rotating assembly */
    if (L >= 6) ob(f, 0, 0, base - 0.16, 1.7, 1.1, 0.18, '#9aa0a6');

    /* the two banks, splayed into a V */
    var b, i, u;
    for (b = 0; b < 2; b++) {
      var vv = (b ? 1 : -1) * BANK_V;
      ob(f, 0, vv * 1.35, base + 0.5, 1.8, 0.62, 0.3, Iso.shade(blockColor, 1.03));
      for (i = 0; i < 3; i++) {
        u = BANK_U[i];
        if (raw) {
          /* rough casting: lumps where the bores will be */
          cy(f, u, vv * 1.35, base + 0.8, 0.19, 0.2, Iso.shade(blockColor, 0.98));
        } else {
          /* machined: an actual bore, dark inside, with a coated ring once
             the unit has been through the coating shop */
          cy(f, u, vv * 1.35, base + 0.72, 0.19, 0.1, L >= 4 ? '#3f4348' : '#7c848c');
          if (L >= 6) {
            /* a piston in the bore, bobbing with the firing phase */
            var ph = (s.firePhase + i * 0.333 + b * 0.166) % 1;
            var lift = 0.06 + 0.12 * (0.5 - 0.5 * Math.cos(ph * Math.PI * 2));
            cy(f, u, vv * 1.35, base + 0.62 + lift, 0.155, 0.12, '#c3c8cc');
          }
        }
      }
      /* cam covers, in the red every engine cover seems to end up */
      if (L >= 7) {
        ob(f, 0, vv * 1.55, base + 0.82, 1.75, 0.5, 0.24, b ? '#a03c33' : '#93362e');
        for (i = 0; i < 4; i++) {
          ob(f, -0.66 + i * 0.44, vv * 1.55, base + 1.06, 0.1, 0.42, 0.05, '#7d2f28');
        }
      }
    }

    /* front-end drive: the gear train that runs the cams and the MGU-K */
    if (L >= 6) {
      Iso.gear(ctx, fx(f, 1.0, 0), fy(f, 1.0, 0), base + 0.56, 0.28, 12,
               s.firePhase * 6.2832 * 0.5, '#a5abb1');
    }

    /* ---- turbo ---- */
    if (L >= 8) {
      cy(f, -1.15, 0.15, base + 0.1, 0.32, 0.42, '#b09a5e', 0.5);
      Iso.gear(ctx, fx(f, -1.15, 0.15), fy(f, -1.15, 0.15), base + 0.52, 0.3, 10, t * 14, '#c8a75e');
      ob(f, -0.85, 0.15, base + 0.16, 0.5, 0.24, 0.16, '#8f959c');
      cy(f, -1.15, -0.42, base + 0.14, 0.24, 0.34, '#9aa6ae');
    }

    /* ---- hybrid ---- */
    if (L >= 9) {
      cy(f, 0.72, -0.78, base + 0.06, 0.3, 0.46, '#6f9060', 0.55);   /* MGU-K */
      ob(f, -0.35, -0.85, base + 0.02, 1.1, 0.42, 0.34, '#5f8a52');  /* energy store */
      ob(f, -0.35, -0.85, base + 0.36, 1.0, 0.34, 0.06, '#4c7342');
      /* high-voltage cable, orange the world over */
      var a = P(fx(f, 0.72, -0.78), fy(f, 0.72, -0.78), base + 0.52);
      var bb = P(fx(f, -0.35, -0.85), fy(f, -0.35, -0.85), base + 0.42);
      ctx.strokeStyle = 'rgba(214,124,40,0.9)';
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + bb.x) / 2, (a.y + bb.y) / 2 - 9, bb.x, bb.y);
      ctx.stroke();
    }

    /* ---- plenum, trumpets and exhaust: the unit looks like an engine now */
    if (L >= 10) {
      ob(f, 0, 0, base + 1.0, 1.5, 0.66, 0.3, '#9aa0a6');
      for (i = 0; i < 6; i++) {
        cy(f, -0.55 + (i % 3) * 0.55, (i < 3 ? -1 : 1) * 0.18, base + 1.3, 0.1, 0.16, '#b6bcc2');
      }
      var exColor = L >= 11 ? '#8a6a4e' : '#a3a9ae';     /* heat-stained after the dyno */
      for (b = 0; b < 2; b++) {
        var ev = (b ? 1 : -1) * 0.62;
        ob(f, -0.3, ev, base + 0.55, 1.5, 0.16, 0.14, exColor);
        cy(f, -1.05, ev, base + 0.5, 0.11, 0.24, exColor);
      }
    }

    /* ---- FIA seal ---- */
    if (L >= 12) {
      ob(f, 0.98, 0.5, base + 0.42, 0.16, 0.16, 0.1, '#d8c24a');
      ctx.fillStyle = Iso.rgba('#d8c24a', 0.55 + 0.35 * Math.abs(Math.sin(t * 2.6)));
      Iso.disc(ctx, fx(f, 0.98, 0.5), fy(f, 0.98, 0.5), base + 0.54, 0.12);
    }

    /* ---- installed in the chassis ---- */
    if (L >= 13) {
      ob(f, 1.35, 0, base - 0.06, 0.9, 1.2, 0.5, '#3f3d3a');
      ob(f, -1.5, 0, base - 0.02, 0.7, 0.5, 0.34, '#3f3d3a');
      for (b = 0; b < 2; b++) {
        ob(f, 0.2, (b ? 1 : -1) * 0.72, base + 0.5, 1.9, 0.1, 0.1, '#46443f');
      }
    }

    /* running: exhaust haze and a shimmer over the plenum */
    if (L >= 11 && L < 14) {
      var heat = s.stage === 'dyno' ? 1 : 0.3;
      for (b = 0; b < 2; b++) {
        var hv = (b ? 1 : -1) * 0.62;
        puffs(fx(f, -1.2, hv), fy(f, -1.2, hv), base + 0.6, 3, 100 + b, {
          color: '#d5cec2', alpha: 0.3 * heat, rise: 1.1, rate: 0.9, r0: 0.06, r1: 0.2
        });
      }
      if (s.stage === 'dyno' && s.fireFlash > 0) {
        for (b = 0; b < 2; b++) {
          var fv = (b ? 1 : -1) * 0.62;
          ctx.fillStyle = Iso.rgba('#ff9436', 0.65 * s.fireFlash * Math.abs(Math.sin(t * 21 + b)));
          Iso.disc(ctx, fx(f, -1.3, fv), fy(f, -1.3, fv), base + 0.56, 0.16);
        }
      }
    }
  }

  /* What is left on the belt once the hoist has taken the unit: the cradle it
     sat in, and the four bolts it was sitting on. */
  function drawCradle(f, base) {
    ob(f, 0, 0, base, 1.9, 1.2, 0.1, '#8f959c');
    for (var i = 0; i < 4; i++) {
      ob(f, -0.6 + (i % 2) * 1.2, (i < 2 ? -1 : 1) * 0.42, base + 0.1, 0.12, 0.12, 0.22, '#b6bcc2');
    }
    ctx.fillStyle = 'rgba(70,64,52,0.13)';
    Iso.disc(ctx, fx(f, 0, 0), fy(f, 0, 0), base + 0.11, 0.62);
  }

  function drawIngots(f, base) {
    for (var i = 0; i < 4; i++) {
      var u = -0.45 + (i % 2) * 0.9;
      var v = -0.28 + Math.floor(i / 2) * 0.56;
      ob(f, u, v, base, 0.8, 0.42, 0.18, '#9fb0bb');
      ob(f, u, v, base + 0.18, 0.72, 0.36, 0.16, '#adbcc5');
    }
    ob(f, 0, 0, base + 0.36, 0.5, 0.3, 0.1, '#8b939b');
  }

  function drawStripped(f, base) {
    /* the unit comes back and goes out again as a tray of parts */
    ob(f, 0, 0, base, 2.0, 1.3, 0.2, '#8f959c');
    var colors = ['#b5bbc1', '#a03c33', '#6f9060', '#c8a75e', '#8b939b', '#a99ec0'];
    for (var i = 0; i < 6; i++) {
      var u = -0.62 + (i % 3) * 0.62;
      var v = -0.28 + Math.floor(i / 3) * 0.56;
      ob(f, u, v, base + 0.2, 0.5, 0.4, 0.16, colors[i]);
    }
  }

  /* --------------------------------------------------- the fire-up bay ----
     The end of the line, and the only part of the site that is not a belt:
     an apron off the east end of the pad, a hoist over it, and a strip of
     asphalt running the length of the plant for the car to leave down. */

  var TR = F.track;

  var CAR_RED  = '#b3382f';
  var CAR_DARK = '#2f2d2b';
  var CAR_PALE = '#e6e2d8';
  var TYRE     = '#2b2a29';

  /* Getting the unit out of the carrier and into the car, as one schedule
     read by everything that needs it. Sim only says how far through the lift
     we are; where the hook is, and therefore whether the pallet is empty, is
     decided here so the two can never disagree. */
  var LIFT = { grab: 0.22, up: 0.42, over: 0.66, down: 0.78 };
  var LIFT_Z = { pallet: 0.24, high: 2.7, bay: 0.42 };

  function lerp(a, b, f) { return a + (b - a) * f; }
  function span(v, a, b) { return Math.max(0, Math.min(1, (v - a) / (b - a))); }

  function hoistState() {
    var c = Sim.state.car;
    if (c.phase === 'wait') return { hooked: false, inCar: false, cover: 0, x: TR.parkX, z: LIFT_Z.high };
    if (c.phase !== 'mount') return { hooked: false, inCar: true, cover: 1, x: TR.parkX, z: LIFT_Z.high };

    var m = c.mount, bay = TR.bayX + 1.3;
    var z = m < LIFT.grab ? LIFT_Z.pallet
      : m < LIFT.up   ? lerp(LIFT_Z.pallet, LIFT_Z.high, span(m, LIFT.grab, LIFT.up))
      : m < LIFT.over ? LIFT_Z.high
      : m < LIFT.down ? lerp(LIFT_Z.high, LIFT_Z.bay, span(m, LIFT.over, LIFT.down))
      /* released: the hook comes back up while the cover goes on */
      : lerp(LIFT_Z.bay, LIFT_Z.high, span(m, LIFT.down, 1));
    return {
      hooked: m > LIFT.grab && m < LIFT.down,
      inCar: m >= LIFT.down,
      cover: span(m, LIFT.down, 1),
      x: lerp(TR.parkX, bay, span(m, LIFT.up, LIFT.over)),
      z: z
    };
  }

  /* true while the thing on the belt is somewhere else */
  function unitLifted() {
    var h = hoistState();
    return h.hooked || h.inCar;
  }

  function drawTrack() {
    var y = TR.y, x0 = TR.x0, x1 = TR.x1, w = TR.width, i;

    /* the apron the belt runs onto once it leaves the pad */
    ctx.fillStyle = '#b6b0a0';
    Iso.poly(ctx, [P(40.0, 41.4, 0.004), P(55.2, 41.4, 0.004),
                   P(55.2, 47.4, 0.004), P(40.0, 47.4, 0.004)]);

    /* shoulder, then the strip itself */
    ctx.fillStyle = '#8e8a7e';
    Iso.ribbon(ctx, x0, y, x1, y, w + 1.7, 0.005);
    ctx.fillStyle = '#55585b';
    Iso.ribbon(ctx, x0, y, x1, y, w, 0.006);
    ctx.fillStyle = '#5d6063';
    Iso.ribbon(ctx, x0, y, x1, y, w - 0.55, 0.008);

    /* edge lines */
    ctx.fillStyle = 'rgba(238,236,228,0.6)';
    Iso.ribbon(ctx, x0, y - w / 2 + 0.24, x1, y - w / 2 + 0.24, 0.16, 0.01);
    Iso.ribbon(ctx, x0, y + w / 2 - 0.24, x1, y + w / 2 - 0.24, 0.16, 0.01);

    /* the box the car launches from */
    var gx = TR.bayX;
    ctx.fillStyle = 'rgba(240,238,230,0.8)';
    Iso.ribbon(ctx, gx + 2.9, y - w / 2 + 0.3, gx + 2.9, y + w / 2 - 0.3, 0.18, 0.012);
    Iso.ribbon(ctx, gx - 2.9, y - w / 2 + 0.3, gx - 2.9, y + w / 2 - 0.3, 0.18, 0.012);

    /* ten-metre marks down the straight, which is the only thing that gives
       the run a sense of scale once the car is moving */
    ctx.fillStyle = 'rgba(232,230,222,0.5)';
    for (i = gx - 10; i > x1; i -= 10) {
      Iso.ribbon(ctx, i, y + w / 2 - 0.5, i, y + w / 2 - 1.0, 0.16, 0.012);
    }
  }

  /* The monorail hoist over the bay: two masts standing clear behind the lane,
     a runway beam cantilevered out over it, and a trolley that walks the unit
     across from the carrier to the car. */
  function drawHoist(b) {
    var H = TR.hoist, h = hoistState(), c = Sim.state.car, i;
    var beamY = TR.y, z = H.beamZ;

    for (i = 0; i < 2; i++) {
      var mx = i ? H.x1 : H.x0;
      Iso.box(ctx, { x: mx - 0.17, y: H.mastY - 0.17, z: 0, w: 0.34, d: 0.34, h: z + 0.32, color: '#9fadb8' });
      Iso.box(ctx, { x: mx - 0.13, y: H.mastY, z: z, w: 0.26, d: beamY - H.mastY + 0.2, h: 0.26, color: '#8d9ca8' });
    }
    Iso.box(ctx, { x: H.x0, y: beamY - 0.14, z: z, w: H.x1 - H.x0, d: 0.28, h: 0.3, color: '#8d9ca8' });

    if (!c.present && c.phase !== 'mount') return;

    /* trolley, rope and whatever is hanging off it */
    var tz = z - 0.1;
    Iso.box(ctx, { x: h.x - 0.24, y: beamY - 0.2, z: tz - 0.22, w: 0.48, d: 0.4, h: 0.24, color: C.ochre });
    var top = P(h.x, beamY, tz - 0.22);
    var hook = P(h.x, beamY, h.z + 1.15);
    ctx.strokeStyle = 'rgba(64,60,52,0.75)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.moveTo(top.x, top.y);
    ctx.lineTo(hook.x, hook.y);
    ctx.stroke();

    /* The unit itself while it is in the air. Drawn from the hoist rather than
       from the belt, because from the moment the hook takes it, it is no
       longer where the carrier is. */
    if (h.hooked) {
      var f = { x: h.x, y: beamY, hx: -1, hy: 0 };
      Iso.box(ctx, { x: h.x - 0.5, y: beamY - 0.5, z: h.z + 1.02, w: 1.0, d: 1.0, h: 0.1, color: '#8b939b' });
      drawEngine(f, h.z, 13);
    }
  }

  function drawStartlights(b) {
    var x = b.x, y = b.y, c = Sim.state.car, i;
    Iso.box(ctx, { x: x - 0.11, y: y - 0.11, z: 0, w: 0.22, d: 0.22, h: 2.9, color: '#9aa0a6' });
    Iso.box(ctx, { x: x - 0.13, y: y, z: 2.66, w: 0.26, d: 1.5, h: 0.24, color: '#8b8578' });
    Iso.box(ctx, { x: x - 0.2, y: y + 1.15, z: 2.16, w: 0.4, d: 0.44, h: 0.56, color: '#3a3835' });

    /* red while it is being fired up and warmed through, green when it goes */
    var red = c.phase === 'fire', green = c.phase === 'launch' && c.t < 1.6;
    for (i = 0; i < 3; i++) {
      var lit = red ? (i <= (t * 2) % 3) : green;
      ctx.fillStyle = green
        ? 'rgba(88,190,96,' + (lit ? 0.95 : 0.2) + ')'
        : 'rgba(206,58,44,' + (red && lit ? 0.95 : 0.18) + ')';
      var p = P(x - 0.2, y + 1.32, 2.56 - i * 0.18);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 3.4, 3.4, 0, 0, 6.2832);
      ctx.fill();
    }
  }

  /* The external starter and the trolley of tyre blankets that live in every
     fire-up bay. */
  function drawStartercart(b) {
    var x = b.x, y = b.y;
    Iso.box(ctx, { x: x - 0.55, y: y - 0.4, z: 0.14, w: 1.1, d: 0.8, h: 0.5, color: '#b3ab99' });
    Iso.box(ctx, { x: x - 0.45, y: y - 0.3, z: 0.64, w: 0.9, d: 0.6, h: 0.16, color: b.color });
    Iso.cylinder(ctx, { x: x - 0.35, y: y + 0.42, z: 0, r: 0.14, h: 0.16, color: '#4c4a46' });
    Iso.cylinder(ctx, { x: x + 0.35, y: y + 0.42, z: 0, r: 0.14, h: 0.16, color: '#4c4a46' });
    Iso.box(ctx, { x: x + 0.5, y: y - 0.06, z: 0.64, w: 0.1, d: 0.12, h: 0.7, color: '#8b8578' });
    Iso.cylinder(ctx, { x: x - 0.9, y: y + 0.1, z: 0, r: 0.34, h: 0.5, color: TYRE, ring: 0.5 });
  }

  /* ---- the car ----------------------------------------------------------- */

  /* A quad on the floor in the car's own frame, wound the way prism() expects:
     u runs to the nose, v across, and u0 must be ahead of u1. */
  function slab(f, u0, u1, v0, v1) {
    return [
      { x: fx(f, u0, v0), y: fy(f, u0, v0) },
      { x: fx(f, u0, v1), y: fy(f, u0, v1) },
      { x: fx(f, u1, v1), y: fy(f, u1, v1) },
      { x: fx(f, u1, v0), y: fy(f, u1, v0) }
    ];
  }

  function drawWheel(f, u, v, r, w, spin) {
    var wx = fx(f, u, v), wy = fy(f, u, v);
    Iso.cylinder(ctx, { x: wx, y: wy, z: 0, r: r, h: w, color: TYRE, ring: 0.62 });
    ctx.fillStyle = '#9aa0a6';
    Iso.disc(ctx, wx, wy, w + 0.002, r * 0.46);
    /* once it is turning, the rim reads as motion rather than as a hubcap */
    if (spin > 0.4) Iso.gear(ctx, wx, wy, w + 0.004, r * 0.62, 5, spin, 'rgba(120,126,132,0.85)');
  }

  /* Everything is painted nose-first and far-side-first, because within one
     object the painter's algorithm has to be laid out by hand. */
  function drawCar() {
    var c = Sim.state.car;
    if (!c.present) return;
    var h = hoistState();
    var x = TR.bayX - c.dist, y = TR.y;
    var f = { x: x, y: y, hx: -1, hy: 0 };
    var i, sgn;

    ctx.save();
    if (c.fade < 1) ctx.globalAlpha *= c.fade;

    ctx.fillStyle = 'rgba(88,80,64,0.22)';
    Iso.ribbon(ctx, x - 2.5, y, x + 2.5, y, 1.7, 0.014);

    /* the floor first: it is the lowest thing on the car and everything else
       is bolted to the top of it */
    ob(f, -0.3, 0, 0.05, 4.6, 1.42, 0.09, '#35332f');

    /* front wing, then the nose it hangs off */
    ob(f, 2.5, 0, 0.05, 0.62, 1.85, 0.06, CAR_RED);
    ob(f, 2.26, 0, 0.15, 0.4, 1.72, 0.05, CAR_DARK);
    for (i = 0; i < 2; i++) {
      sgn = i ? -1 : 1;
      ob(f, 2.42, sgn * 0.92, 0.05, 0.78, 0.08, 0.32, CAR_PALE);
    }
    Iso.prism(ctx, slab(f, 2.3, 1.0, 0.17, -0.17), 0.24, 0.3, CAR_RED);
    Iso.prism(ctx, slab(f, 1.0, -0.3, 0.5, -0.5), 0.13, 0.6, CAR_RED);

    drawWheel(f, 1.75, 0.8, 0.34, 0.58, c.dist * 2.4);
    drawWheel(f, 1.75, -0.8, 0.34, 0.58, c.dist * 2.4);

    /* cockpit: opening, driver, halo */
    ob(f, 0.5, 0, 0.73, 0.9, 0.62, 0.04, '#1f1e1d');
    Iso.cylinder(ctx, { x: fx(f, 0.42, 0), y: fy(f, 0.42, 0), z: 0.7, r: 0.17, h: 0.24, color: CAR_PALE });
    ctx.fillStyle = '#2b2a29';
    Iso.disc(ctx, fx(f, 0.42, 0), fy(f, 0.42, 0), 0.95, 0.11);
    var hl = P(fx(f, 0.15, 0.46), fy(f, 0.15, 0.46), 1.06);
    var hr = P(fx(f, 0.15, -0.46), fy(f, 0.15, -0.46), 1.06);
    var hc = P(fx(f, 1.06, 0), fy(f, 1.06, 0), 1.12);
    ctx.strokeStyle = CAR_DARK;
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(hl.x, hl.y);
    ctx.quadraticCurveTo(hc.x, hc.y, hr.x, hr.y);
    ctx.stroke();
    var hb = P(fx(f, 1.12, 0), fy(f, 1.12, 0), 0.72);
    ctx.beginPath();
    ctx.moveTo(hc.x, hc.y);
    ctx.lineTo(hb.x, hb.y);
    ctx.stroke();
    ctx.lineCap = 'butt';

    /* sidepods, far side first */
    for (i = 0; i < 2; i++) {
      sgn = i ? -1 : 1;
      Iso.prism(ctx, slab(f, 0.7, -1.5, sgn * 0.94, sgn * 0.42), 0.14, 0.52, CAR_RED);
      ob(f, 0.66, sgn * 0.68, 0.2, 0.14, 0.44, 0.34, '#26251f');       /* inlet */
    }

    /* airbox over the driver's head, and the engine bay behind it */
    ob(f, -0.06, 0, 0.98, 0.56, 0.44, 0.34, CAR_RED);
    ctx.fillStyle = '#26251f';
    Iso.disc(ctx, fx(f, 0.2, 0), fy(f, 0.2, 0), 1.3, 0.16);

    if (h.inCar && h.cover > 0.5) {
      /* the cover is on: what is underneath is somebody else's problem now */
      Iso.prism(ctx, slab(f, -0.3, -2.1, 0.56, -0.56), 0.6, 0.46, Iso.shade(CAR_RED, 0.96));
    } else {
      ob(f, -1.2, 0, 0.5, 1.9, 1.15, 0.03, '#26251f');                 /* open bay */
      if (h.inCar) drawEngine({ x: fx(f, -1.2, 0), y: fy(f, -1.2, 0), hx: -1, hy: 0 }, LIFT_Z.bay, 12);
    }

    /* diffuser, rear axle, rear wing */
    ob(f, -2.15, 0, 0.1, 0.72, 1.36, 0.3, '#3a3835');
    drawWheel(f, -1.85, 0.8, 0.36, 0.66, c.dist * 2.4);
    drawWheel(f, -1.85, -0.8, 0.36, 0.66, c.dist * 2.4);
    ob(f, -2.24, 0, 0.6, 0.32, 1.1, 0.06, CAR_DARK);                   /* beam wing */
    for (i = 0; i < 2; i++) {
      sgn = i ? -1 : 1;
      ob(f, -2.36, sgn * 0.3, 0.66, 0.16, 0.1, 0.62, '#4a4744');
      ob(f, -2.42, sgn * 0.78, 0.78, 0.8, 0.07, 0.66, CAR_PALE);
    }
    ob(f, -2.4, 0, 1.28, 0.56, 1.5, 0.07, CAR_RED);
    ob(f, -2.6, 0, 1.4, 0.34, 1.45, 0.06, CAR_DARK);

    /* rain light, which is on whenever the thing is running */
    if (h.inCar) {
      ctx.fillStyle = Iso.rgba('#d4342a', 0.5 + 0.45 * Math.abs(Math.sin(t * 5)));
      Iso.disc(ctx, fx(f, -2.7, 0), fy(f, -2.7, 0), 0.78, 0.1);
    }

    drawCarEffects(f, c);
    ctx.restore();

    /* Only once it is running, and hung above the gantry rather than in it:
       during the lift the panel is saying all of this anyway, and a plate at
       roof height would sit exactly where the hoist is. */
    if (showLabels && c.fade > 0.55 && (c.phase === 'fire' || c.phase === 'launch')) {
      labels.push({
        x: x, y: y, z: 4.5, lift: 10,
        text: Spec.group(c.v * 3.6) + ' km/h',
        sub: Sim.state.tag,
        color: '#8c2f27', size: 13, mono: true, bold: true
      });
    }
  }

  /* Exhaust, wheelspin and the streaks that stand in for the noise. */
  function drawCarEffects(f, c) {
    var i, sgn, ex, ey;

    if (c.phase === 'fire') {
      /* first fire: it blows a lot of unburnt everything out of the back */
      for (i = 0; i < 2; i++) {
        sgn = i ? -1 : 1;
        ex = fx(f, -2.62, sgn * 0.22); ey = fy(f, -2.62, sgn * 0.22);
        puffs(ex, ey, 0.55, 4, 210 + i, { color: '#cfc8bc', alpha: 0.5, rise: 1.6, rate: 1.1, r0: 0.08, r1: 0.34 });
        ctx.fillStyle = Iso.rgba('#ff9436', 0.5 * Math.abs(Math.sin(t * 24 + i)));
        Iso.disc(ctx, ex, ey, 0.55, 0.14);
      }
      return;
    }
    if (c.phase !== 'launch') return;

    /* wheelspin off the line, then just heat haze */
    var spin = Math.max(0, 1 - c.v / 14);
    for (i = 0; i < 2; i++) {
      sgn = i ? -1 : 1;
      ex = fx(f, -2.15, sgn * 0.82); ey = fy(f, -2.15, sgn * 0.82);
      puffs(ex, ey, 0.05, 6, 230 + i, {
        color: '#cfc9bd', alpha: 0.2 + 0.55 * spin, rise: 0.7, rate: 1.8, r0: 0.16, r1: 0.7
      });
      ctx.fillStyle = Iso.rgba('#ff9436', 0.35 * Math.abs(Math.sin(t * 26 + i)));
      Iso.disc(ctx, fx(f, -2.62, sgn * 0.22), fy(f, -2.62, sgn * 0.22), 0.55, 0.1);
    }

    if (c.v < 9) return;
    ctx.strokeStyle = 'rgba(250,248,242,' + Math.min(0.5, (c.v - 9) / 70) + ')';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    for (i = 0; i < 6; i++) {
      var v = -0.95 + (i % 3) * 0.95;
      var z = 0.3 + Math.floor(i / 3) * 0.7;
      var len = 1.2 + c.v * 0.11 + Iso.hash2(i, 7, 3) * 1.6;
      var a = P(fx(f, -2.9, v), fy(f, -2.9, v), z);
      var b = P(fx(f, -2.9 - len, v), fy(f, -2.9 - len, v), z);
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
    }
    ctx.stroke();
  }

  /* -------------------------------------------------------------- labels  */

  function drawLabels() {
    /* Screen space, but still dpr-scaled: ax/ay below are CSS pixels (cam.ox
       and cam.scale both come from getBoundingClientRect/innerWidth). An
       identity transform would read them as *device* pixels, so on a 2x phone
       every plate lands at half its true position. */
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.textBaseline = 'middle';
    for (var i = 0; i < labels.length; i++) {
      var L = labels[i];
      var p = P(L.x, L.y, L.z);
      var ax = p.x * cam.scale + cam.ox;
      var ay = p.y * cam.scale + cam.oy;

      /* Plates stay legible rather than shrinking with the factory, so they are
         always somewhat oversized when zoomed out. */
      var size = (L.size || 12) * Math.min(1.15, Math.max(0.92, cam.scale));
      var mainFont = (L.bold ? '600 ' : '') + size + 'px ' + (L.mono
        ? 'ui-monospace, Menlo, Consolas, monospace'
        : L.serif
          ? '"Iowan Old Style", Palatino, "Palatino Linotype", Georgia, serif'
          : 'system-ui, -apple-system, Segoe UI, Roboto, sans-serif');
      var subFont = (size * 0.85) + 'px ui-monospace, Menlo, Consolas, monospace';
      ctx.textAlign = 'center';

      /* Measure the sub-line in the font it is actually drawn in. Measuring it
         in the title's font and scaling by 0.85 under-reads it — monospace is
         wider per character than the serif above it — and the last letters get
         clipped off the end of the plate. */
      var subw = 0;
      if (L.sub) { ctx.font = subFont; subw = ctx.measureText(L.sub).width; }
      ctx.font = mainFont;
      var wpx = ctx.measureText(L.text).width;
      var boxW = Math.max(wpx, subw) + 16;
      var boxH = L.sub ? size * 2.4 : size * 1.75;

      /* Sit the plate on its bottom edge, a constant gap above the anchor,
         which reads identically at every zoom. */
      var lift = L.lift || 0;
      var sx = ax;
      var sy = lift ? ay - lift - boxH / 2 : ay;

      if (lift) {
        ctx.strokeStyle = L.color ? hexA(L.color, 0.65) : 'rgba(110,98,80,0.5)';
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(ax, sy + boxH / 2);
        ctx.lineTo(ax, ay);
        ctx.stroke();
        ctx.fillStyle = L.color ? hexA(L.color, 0.9) : 'rgba(110,98,80,0.7)';
        ctx.beginPath();
        ctx.arc(ax, ay, 2.4, 0, 6.2832);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(96,84,66,0.26)';
      roundRect(sx - boxW / 2 + 1, sy - boxH / 2 + 2.5, boxW, boxH, 5);
      ctx.fill();

      ctx.fillStyle = L.tint ? Iso.mix('#fffdf7', L.tint, 0.14) : '#fffdf7';
      roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
      ctx.fill();
      ctx.strokeStyle = L.tint ? hexA(L.tint, 0.9)
        : (L.color ? hexA(L.color, 0.75) : 'rgba(110,98,80,0.5)');
      ctx.lineWidth = L.tint ? 1.7 : 1.2;
      roundRect(sx - boxW / 2, sy - boxH / 2, boxW, boxH, 5);
      ctx.stroke();

      ctx.fillStyle = L.color || '#3a352e';
      ctx.fillText(L.text, sx, sy + (L.sub ? -size * 0.42 : 0));
      if (L.sub) {
        ctx.font = subFont;
        ctx.fillStyle = 'rgba(88,80,68,0.72)';
        ctx.fillText(L.sub, sx, sy + size * 0.62);
      }
    }
  }

  function hexA(hex, a) {
    if (hex[0] !== '#') return 'rgba(120,108,90,' + a + ')';
    return Iso.rgba(hex, a);
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  /* ---------------------------------------------------------------- draw  */

  var KIND = {
    rack: drawRack, crane: drawCrane, furnace: drawFurnace, ladle: drawLadle,
    sandbin: drawSandbin, oven: drawOven, quench: drawQuench, cnc: drawCnc,
    chipbin: drawChipbin, chamber: drawChamber, tank: drawTank, cmm: drawCmm,
    console: drawConsole, assembler: drawAssembler, bench: drawBench,
    gasbottle: drawGasbottle, balancer: drawBalancer, cleanroom: drawCleanroom,
    winder: drawWinder, stand: drawStand, torquebay: drawTorquebay,
    dyno: drawDyno, fan: drawFan, gatePost: drawGatePost, gateBeam: drawGateBeam,
    dock: drawDock, chassisjig: drawChassisjig, stripbench: drawStripbench,
    hoist: drawHoist, startlights: drawStartlights, startercart: drawStartercart
  };

  var PROP_KIND = {
    pole: drawPole, piperun: drawPiperun, lamp: drawLamp,
    pallet: drawPallet, tree: drawTree
  };

  function key(o) { return o.x + o.y + ((o.w || 0) + (o.d || 0)) * 0.5; }

  function draw(canvas, camera, time, activeStation, hoverStation) {
    ctx = canvas.getContext('2d');
    cam = camera;
    t = time;
    labels.length = 0;

    var w = canvas.width / cam.dpr, h = canvas.height / cam.dpr;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    drawSky(w, h);

    ctx.setTransform(cam.scale * cam.dpr, 0, 0, cam.scale * cam.dpr, cam.ox * cam.dpr, cam.oy * cam.dpr);

    drawGround();
    drawTrack();
    drawZones(activeStation);
    drawApproach();
    drawBeltPath(F.routes.main, { width: 2.4, speed: 1.6 });
    drawFeeders();

    /* ---- one sorted pass over everything with a footprint ---- */
    var items = [];
    var i;

    for (i = 0; i < F.machines.length; i++) {
      var m = F.machines[i];
      if (m.kind === 'stripbench') continue;                 /* rides the overhead line */
      if (m.kind && KIND[m.kind]) items.push({ k: m.sortKey != null ? m.sortKey : m.x + m.y, f: KIND[m.kind], a: m });
      else items.push({ k: key(m), f: null, a: m, box: true });
    }
    for (i = 0; i < F.props.length; i++) {
      var pr = F.props[i];
      var kf = PROP_KIND[pr.kind];
      if (!kf) continue;
      var pk = pr.kind === 'piperun' ? (pr.x0 + pr.y0 + pr.x1 + pr.y1) / 2 : pr.x + pr.y;
      items.push({ k: pk, f: kf, a: pr });
    }
    for (i = 0; i < F.feeders.length; i++) {
      var fd = F.feeders[i];
      items.push({ k: fd.x + fd.y1 + 0.4, f: null, a: fd, feeder: true });
    }
    var lifts = forklifts();
    for (i = 0; i < lifts.length; i++) {
      items.push({ k: lifts[i].x + lifts[i].y, f: drawForklift, a: lifts[i] });
    }

    var onReturn = Sim.carrier.routeName === 'ret';
    var pos = Sim.carrierPosition();
    if (!onReturn) items.push({ k: pos.x + pos.y + 0.3, f: drawUnit, a: pos });

    if (Sim.state.car.present) {
      var cp = Sim.carPoint();
      items.push({ k: cp.x + cp.y, f: drawCar, a: null });
    }

    items.sort(function (p, q) { return p.k - q.k; });
    for (i = 0; i < items.length; i++) {
      var it = items[i];
      if (it.box) {
        var o = it.a;
        Iso.box(ctx, o);
        if (o.roof) {
          Iso.gableRoof(ctx, {
            x: o.x - 0.1, y: o.y - 0.1, z: o.z + o.h,
            w: o.w + 0.2, d: o.d + 0.2, h: o.roofH || 0.5, color: o.roof
          });
        }
      } else if (it.feeder) {
        /* the feeder spur's own furniture sorts with the machine it serves */
        continue;
      } else {
        it.f(it.a);
      }
    }

    /* feeder racks, inserters and the items riding the spurs sit above the
       machines they serve, so they are painted as one late group */
    drawFeederItems();
    drawFeederEnds();

    /* the overhead return line, and whatever is riding it, goes on last: it
       physically passes over the shop */
    drawBeltPath(F.routes.ret, { width: 2.0, speed: 1.3, elevated: true,
                                 frame: '#948e82', deck: '#4a4e53', rail: '#a88f3a' });
    for (i = 0; i < F.machines.length; i++) {
      if (F.machines[i].kind === 'stripbench') drawStripbench(F.machines[i]);
    }
    if (onReturn) drawUnit(pos);

    drawDeliveryBurst();

    /* Station name plates. Zoomed far out (which is where a phone starts),
       every plate at once is an unreadable pile, so show only the live one. */
    if (showLabels) {
      var s = Sim.state;
      var declutter = cam.scale < 0.34;
      for (i = 0; i < F.stations.length; i++) {
        var st = F.stations[i];
        var isActive = st.id === activeStation || st.id === hoverStation;
        if (declutter && !isActive) continue;
        var sub = isActive ? st.tag : null;
        if (st.id === 'fit' && s.runCount) sub = s.runCount + ' delivered';
        else if (st.id === 'assy' && s.parts) sub = Spec.group(s.parts) + ' parts fitted';
        var anchor = plateAnchor(st);
        labels.push({
          x: anchor.x, y: anchor.y, z: anchor.z, lift: isActive ? 18 : 13,
          text: st.name, sub: sub,
          color: isActive ? st.color : '#3d3831',
          tint: st.color,
          size: isActive ? 16.5 : 14, bold: isActive, serif: true
        });
      }
    }

    drawLabels();
  }

  /* Where a station's name plate hangs. A station's *centre* is on the belt,
     but its machinery is set back off the line, so anchoring on the centre
     leaves the plate floating over empty conveyor. These sit over the actual
     machine; drawLabels() then lifts each one a fixed number of screen pixels
     so the gap looks the same at every zoom. */
  var PLATE = {
    alloy:   [5.0,  6.0,  3.8],
    cast:    [14.0, 9.4,  4.6],
    heat:    [23.0, 9.8,  3.2],
    machine: [33.8, 9.4,  3.4],
    coat:    [43.0, 9.2,  3.4],
    metro:   [45.0, 20.2, 3.2],
    crank:   [36.0, 20.4, 2.4],
    valve:   [26.0, 20.4, 2.4],
    turbo:   [16.0, 20.4, 2.2],
    hybrid:  [8.0,  20.9, 2.5],
    assy:    [14.0, 33.2, 3.5],
    dyno:    [26.0, 33.4, 3.3],
    seal:    [36.0, 28.0, 3.4],
    fit:     [46.0, 31.4, 2.6],
    track:   [46.5, 42.6, 4.4],
    rebuild: [1.0,  20.0, 5.6]
  };

  function plateAnchor(s) {
    var p = PLATE[s.id];
    return p ? { x: p[0], y: p[1], z: p[2] } : { x: s.x, y: s.y, z: 3.4 };
  }

  function drawDeliveryBurst() {
    var s = Sim.state;
    if (s.deliverFlash <= 0 || !s.lastDelivered) return;
    var f = 1 - s.deliverFlash;
    var p = P(46, 28, 1.4 + f * 3.0);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.fillStyle = 'rgba(74,122,155,' + (0.3 * s.deliverFlash) + ')';
    ctx.beginPath();
    ctx.arc(p.x, p.y, 8 + f * 56, 0, 6.2832);
    ctx.fill();
    ctx.restore();
    ctx.font = '700 20px ui-monospace, Menlo, Consolas, monospace';
    ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(53,86,109,' + s.deliverFlash + ')';
    ctx.fillText(s.lastDelivered, p.x, p.y);
  }

  global.Renderer = {
    draw: draw,
    setLabels: function (v) { showLabels = v; },
    getLabels: function () { return showLabels; }
  };
})(window);
