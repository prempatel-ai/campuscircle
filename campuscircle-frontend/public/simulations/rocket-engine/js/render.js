/* render.js: draws the plant, the engine, the pad and the launch.
   Canvas 2D throughout, painter's algorithm, one sorted pass per frame. */
(function (global) {
  'use strict';

  var Iso = global.Iso, F = global.Factory, Sim = global.Sim, Spec = global.Spec;
  var P = Iso.project;
  var C = F.palette;
  var PAD = F.PAD;

  var cam = null, ctx = null, t = 0;
  var labels = [];
  var showLabels = true;

  /* ------------------------------------------------------------------ sky */

  /* 90 stars, fixed once, in a square of screen-independent coordinates that
     gets tiled across whatever viewport it lands in. Regenerating them per
     frame would make the sky boil. */
  var STARS = (function () {
    var out = [];
    for (var i = 0; i < 90; i++) {
      out.push({
        x: Iso.hash2(i, 3, 91),
        y: Iso.hash2(i, 7, 17),
        r: 0.5 + Iso.hash2(i, 11, 53) * 1.3,
        tw: Iso.hash2(i, 13, 29) * 6.28
      });
    }
    return out;
  })();

  function drawSky(w, h) {
    var space = Sim.state.launch.space;

    var g = ctx.createLinearGradient(0, 0, 0, h);
    /* Sea level is a dusty industrial dusk; it goes to black as the vehicle
       climbs out of the atmosphere. */
    g.addColorStop(0, Iso.mix('#2b3444', '#000004', space));
    g.addColorStop(0.55, Iso.mix('#3d4453', '#01010a', space));
    g.addColorStop(1, Iso.mix('#4a4436', '#05060f', space));
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    if (space > 0.02) {
      for (var i = 0; i < STARS.length; i++) {
        var s = STARS[i];
        var a = space * (0.35 + 0.45 * Math.abs(Math.sin(t * 0.7 + s.tw)));
        ctx.fillStyle = 'rgba(226,232,244,' + a.toFixed(3) + ')';
        ctx.beginPath();
        ctx.arc(s.x * w, s.y * h * 0.92, s.r, 0, 6.2832);
        ctx.fill();
      }
      /* the thin lit line of atmosphere, seen from above it */
      var limb = ctx.createLinearGradient(0, h * 0.72, 0, h);
      limb.addColorStop(0, 'rgba(60,120,190,0)');
      limb.addColorStop(0.6, 'rgba(70,140,210,' + (0.16 * space).toFixed(3) + ')');
      limb.addColorStop(1, 'rgba(150,200,240,' + (0.30 * space).toFixed(3) + ')');
      ctx.fillStyle = limb;
      ctx.fillRect(0, h * 0.72, w, h * 0.28);
    }
  }

  /* --------------------------------------------------------------- ground */

  function plate(inset, z) {
    var W = F.GW, H = F.GH;
    return [
      P(-inset, -inset, z || 0), P(W + inset, -inset, z || 0),
      P(W + inset, H + inset, z || 0), P(-inset, H + inset, z || 0)
    ];
  }

  var DIRT = ['#453b30', '#4d4237', '#3e352b', '#524738'];

  function drawGround() {
    var W = F.GW, H = F.GH, x, y;

    ctx.fillStyle = DIRT[0];
    Iso.poly(ctx, [P(-14, -14), P(70, -14), P(70, 62), P(-14, 62)]);
    for (x = -14; x < 70; x += 2.5) {
      for (y = -14; y < 62; y += 2.5) {
        var n = Iso.hash2(x, y, 17);
        if (n < 0.52) continue;
        ctx.fillStyle = DIRT[1 + Math.floor(n * 2.99) % 3];
        Iso.poly(ctx, [P(x, y), P(x + 2.5, y), P(x + 2.5, y + 2.5), P(x, y + 2.5)]);
      }
    }

    /* the poured slab the plant stands on */
    ctx.fillStyle = '#4a4842';
    Iso.poly(ctx, plate(1.1, 0.004));
    ctx.fillStyle = C.concrete;
    Iso.poly(ctx, plate(0, 0.008));

    /* poured in bays, so the slab reads as tiled concrete rather than one flat
       colour — this is the single cheapest thing that makes a floor look laid */
    for (x = 0; x < W; x += 2) {
      for (y = 0; y < H; y += 2) {
        if (Iso.hash2(x, y, 41) < 0.5) continue;
        ctx.fillStyle = C.concrete2;
        Iso.poly(ctx, [P(x, y, 0.009), P(x + 2, y, 0.009), P(x + 2, y + 2, 0.009), P(x, y + 2, 0.009)]);
      }
    }
    ctx.strokeStyle = 'rgba(20,18,15,0.22)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (x = 0; x <= W; x += 2) {
      var a = P(x, 0, 0.01), b = P(x, H, 0.01);
      ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y);
    }
    for (y = 0; y <= H; y += 2) {
      var c = P(0, y, 0.01), d = P(W, y, 0.01);
      ctx.moveTo(c.x, c.y); ctx.lineTo(d.x, d.y);
    }
    ctx.stroke();

    drawHazardEdges();
    drawWalkways();
    drawPadGround();
  }

  /* Yellow-and-black banding along the two open edges of the slab. */
  function drawHazardEdges() {
    var W = F.GW, H = F.GH;
    Iso.hazardBand(ctx, 0, -0.55, W, -0.55, 1.1, 0.012, {});
    Iso.hazardBand(ctx, -0.55, 0, -0.55, H, 1.1, 0.012, {});
  }

  /* Painted pedestrian aisles between the production runs. */
  var AISLES = [
    [2, 11.4, 50, 11.4],
    [2, 22.6, 50, 22.6],
    [2, 11.4, 2, 22.6],
    [50, 11.4, 50, 22.6]
  ];

  function drawWalkways() {
    for (var i = 0; i < AISLES.length; i++) {
      var a = AISLES[i];
      ctx.fillStyle = 'rgba(200,162,51,0.32)';
      Iso.ribbon(ctx, a[0], a[1], a[2], a[3], 1.5, 0.012);
      ctx.fillStyle = 'rgba(126,124,116,0.75)';
      Iso.ribbon(ctx, a[0], a[1], a[2], a[3], 1.1, 0.014);
    }
  }

  /* The pad: a big circle of blast-resistant concrete, scorched in the middle,
     ringed with hazard banding. */
  function drawPadGround() {
    var i;
    ctx.fillStyle = '#403e39';
    Iso.disc(ctx, PAD.x, PAD.y, 0.004, PAD.r + 1.1);
    ctx.fillStyle = C.concrete;
    Iso.disc(ctx, PAD.x, PAD.y, 0.008, PAD.r);

    /* concrete laid in wedges */
    for (i = 0; i < 16; i++) {
      if (i % 2) continue;
      var a0 = i / 16 * 6.2832, a1 = (i + 1) / 16 * 6.2832;
      ctx.fillStyle = C.concrete2;
      ctx.beginPath();
      var p0 = P(PAD.x, PAD.y, 0.009);
      ctx.moveTo(p0.x, p0.y);
      for (var k = 0; k <= 6; k++) {
        var aa = a0 + (a1 - a0) * (k / 6);
        var q = P(PAD.x + Math.cos(aa) * PAD.r, PAD.y + Math.sin(aa) * PAD.r, 0.009);
        ctx.lineTo(q.x, q.y);
      }
      ctx.closePath();
      ctx.fill();
    }

    /* scorch around the flame trench, and the trench itself */
    ctx.fillStyle = 'rgba(18,15,12,0.55)';
    Iso.disc(ctx, PAD.x, PAD.y, 0.012, 6.2);
    ctx.fillStyle = 'rgba(12,10,8,0.75)';
    Iso.disc(ctx, PAD.x, PAD.y, 0.013, 4.0);

    /* hazard ring */
    ctx.strokeStyle = 'rgba(200,162,51,0.5)';
    ctx.lineWidth = 2;
    ctx.setLineDash([10, 8]);
    var pc = P(PAD.x, PAD.y, 0.014);
    ctx.beginPath();
    ctx.ellipse(pc.x, pc.y, (PAD.r - 0.6) * Iso.TW * 1.414, (PAD.r - 0.6) * Iso.TH * 1.414, 0, 0, 6.2832);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawZones(activeId) {
    for (var i = 0; i < F.stations.length; i++) {
      var s = F.stations[i];
      if (s.id === 'launch') continue;           /* the pad draws its own ring */
      var active = s.id === activeId;
      ctx.fillStyle = Iso.rgba(s.color, active ? 0.16 : 0.05);
      Iso.disc(ctx, s.x, s.y, 0.02, s.r);
      ctx.strokeStyle = Iso.rgba(s.color, active ? 0.85 : 0.28);
      ctx.lineWidth = active ? 2.2 : 1.2;
      ctx.setLineDash(active ? [] : [6, 7]);
      var p = P(s.x, s.y, 0.02);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, s.r * Iso.TW * 1.414, s.r * Iso.TH * 1.414, 0, 0, 6.2832);
      ctx.stroke();
      ctx.setLineDash([]);
      if (active) {
        var pulse = (t * 0.6) % 1;
        ctx.strokeStyle = Iso.rgba(s.color, 0.45 * (1 - pulse));
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.ellipse(p.x, p.y, s.r * Iso.TW * 1.414 * (1 + pulse * 0.35),
                    s.r * Iso.TH * 1.414 * (1 + pulse * 0.35), 0, 0, 6.2832);
        ctx.stroke();
      }
    }
  }

  /* ---------------------------------------------------------------- belts */

  /* A transport belt: dark deck between yellow rails, with treads and arrows
     that actually move. The moving arrows are what sell it — a static ribbon
     reads as a road, which is exactly what the last leg of this route is. */
  function drawBelt(route, from, to, opts) {
    var i, s, d, p, nx, ny, hw;
    var width = opts.width || 2.4;
    var segs = route.segs;

    function within(sg) {
      return sg.cum + sg.len > from && sg.cum < to;
    }

    ctx.fillStyle = opts.frame || '#55524a';
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (!within(s)) continue;
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, width, 0.02);
    }
    joints(route, width, from, to, 0.02);

    ctx.fillStyle = opts.deck || C.beltDeck;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (!within(s)) continue;
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, width - 0.5, 0.03);
    }
    joints(route, width - 0.5, from, to, 0.03);

    /* treads: thin, low-contrast slats reading as belt texture in motion */
    var speed = opts.speed || 1.6;
    var step = 0.4;
    var innerW = width - 0.62;
    ctx.fillStyle = 'rgba(120,126,132,0.42)';
    for (d = from - ((t * speed) % step); d < to; d += step) {
      if (d < from) continue;
      p = route.at(d);
      nx = -p.dy; ny = p.dx;
      hw = innerW / 2;
      Iso.poly(ctx, [
        P(p.x + nx * hw + p.dx * 0.05, p.y + ny * hw + p.dy * 0.05, 0.04),
        P(p.x - nx * hw + p.dx * 0.05, p.y - ny * hw + p.dy * 0.05, 0.04),
        P(p.x - nx * hw - p.dx * 0.05, p.y - ny * hw - p.dy * 0.05, 0.04),
        P(p.x + nx * hw - p.dx * 0.05, p.y + ny * hw - p.dy * 0.05, 0.04)
      ]);
    }

    /* direction arrows — sparse enough to be a signal, not a texture */
    var cstep = 3.4;
    ctx.fillStyle = 'rgba(224,160,44,0.72)';
    for (d = from - ((t * speed) % cstep); d < to; d += cstep) {
      if (d < from + 0.6) continue;
      p = route.at(d);
      nx = -p.dy; ny = p.dx;
      hw = innerW * 0.22;
      Iso.poly(ctx, [
        P(p.x + p.dx * 0.30, p.y + p.dy * 0.30, 0.045),
        P(p.x - p.dx * 0.06 + nx * hw, p.y - p.dy * 0.06 + ny * hw, 0.045),
        P(p.x - p.dx * 0.16, p.y - p.dy * 0.16, 0.045),
        P(p.x - p.dx * 0.06 - nx * hw, p.y - p.dy * 0.06 - ny * hw, 0.045)
      ]);
    }

    /* yellow side rails, so the deck sits in a channel */
    ctx.fillStyle = C.beltRail;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (!within(s)) continue;
      var dx = s.b.x - s.a.x, dy = s.b.y - s.a.y;
      var L = Math.hypot(dx, dy) || 1;
      var rx = -dy / L * (width / 2 - 0.12), ry = dx / L * (width / 2 - 0.12);
      Iso.ribbon(ctx, s.a.x + rx, s.a.y + ry, s.b.x + rx, s.b.y + ry, 0.22, 0.05);
      Iso.ribbon(ctx, s.a.x - rx, s.a.y - ry, s.b.x - rx, s.b.y - ry, 0.22, 0.05);
    }
  }

  function joints(route, width, from, to, lift) {
    var r = width / 2;
    for (var i = 0; i < route.pts.length; i++) {
      var d = route.cum[i];
      if (d < from || d > to) continue;
      var p = route.pts[i];
      Iso.poly(ctx, [
        P(p.x - r, p.y - r, lift), P(p.x + r, p.y - r, lift),
        P(p.x + r, p.y + r, lift), P(p.x - r, p.y + r, lift)
      ]);
    }
  }

  /* The last leg is not a belt: it is the road the transporter crawls down to
     the pad, and it needs to look like asphalt with a centre line. */
  function drawRoad(route, from) {
    var segs = route.segs, i, s;
    for (i = 0; i < segs.length; i++) {
      s = segs[i];
      if (s.cum + s.len <= from) continue;
      ctx.fillStyle = '#3a3833';
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, 4.6, 0.016);
      ctx.fillStyle = '#454239';
      Iso.ribbon(ctx, s.a.x, s.a.y, s.b.x, s.b.y, 4.2, 0.018);
    }
    ctx.fillStyle = 'rgba(200,162,51,0.4)';
    for (var d = from + 1; d < route.total - 1; d += 2.6) {
      var p = route.at(d);
      Iso.ribbon(ctx, p.x - p.dx * 0.55, p.y - p.dy * 0.55,
                      p.x + p.dx * 0.55, p.y + p.dy * 0.55, 0.16, 0.02);
    }
  }

  function drawApproach() {
    var y = 6;
    ctx.fillStyle = '#454239';
    Iso.ribbon(ctx, -8.5, y, 0.4, y, 4.4, 0.004);
    Iso.hazardBand(ctx, -1.2, y - 2.4, -1.2, y + 2.4, 0.55, 0.03, {});
  }

  /* ---- feeder spurs ------------------------------------------------------ */

  function drawFeeders() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      ctx.fillStyle = '#55524a';
      Iso.ribbon(ctx, f.x, f.y0, f.x, f.y1, 1.0, 0.02);
      ctx.fillStyle = C.beltDeck;
      Iso.ribbon(ctx, f.x, f.y0, f.x, f.y1, 0.72, 0.03);

      var dir = f.y1 > f.y0 ? 1 : -1;
      ctx.fillStyle = 'rgba(224,160,44,0.6)';
      for (var d = 0.4 - ((t * 1.2) % 1.0); d < f.len; d += 1.0) {
        if (d < 0) continue;
        var yy = f.y0 + d * dir;
        Iso.poly(ctx, [
          P(f.x, yy + 0.24 * dir, 0.042),
          P(f.x + 0.18, yy - 0.08 * dir, 0.042),
          P(f.x, yy, 0.042),
          P(f.x - 0.18, yy - 0.08 * dir, 0.042)
        ]);
      }
      ctx.fillStyle = C.beltRail;
      Iso.ribbon(ctx, f.x + 0.44, f.y0, f.x + 0.44, f.y1, 0.14, 0.05);
      Iso.ribbon(ctx, f.x - 0.44, f.y0, f.x - 0.44, f.y1, 0.14, 0.05);
    }
  }

  /* Items riding the spurs, plus the rack they come from and the inserter that
     takes them off at the end. Drawn late so they sit over their machines. */
  function drawFeederItems() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      var phase = (t * 0.55 + i * 0.31) % 1;
      for (var k = 0; k < 3; k++) {
        var p = (phase + k / 3) % 1;
        drawFeederItem(f, f.x, f.y0 + p * f.len);
      }
    }
  }

  function drawFeederItem(f, x, y) {
    var s = 0.19;
    switch (f.item) {
      case 'powder':
        Iso.cylinder(ctx, { x: x, y: y, z: 0.06, r: 0.17, h: 0.3, color: f.color, ring: 0.4 });
        break;
      case 'tube':
        Iso.box(ctx, { x: x - 0.3, y: y - 0.08, z: 0.06, w: 0.6, d: 0.16, h: 0.12, color: f.color });
        break;
      case 'rotor':
        Iso.cylinder(ctx, { x: x, y: y, z: 0.06, r: 0.2, h: 0.1, color: f.color });
        Iso.gear(ctx, x, y, 0.17, 0.2, 9, t * 2, Iso.shade(f.color, 1.15));
        break;
      case 'board':
        Iso.box(ctx, { x: x - 0.24, y: y - 0.16, z: 0.06, w: 0.48, d: 0.32, h: 0.05, color: f.color });
        break;
      case 'element':
        for (var k = 0; k < 4; k++) {
          Iso.cylinder(ctx, {
            x: x - 0.14 + (k % 2) * 0.28, y: y - 0.14 + ((k / 2) | 0) * 0.28,
            z: 0.06, r: 0.07, h: 0.2, color: f.color
          });
        }
        break;
      default:
        Iso.box(ctx, { x: x - s, y: y - s, z: 0.06, w: s * 2, d: s * 2, h: 0.22, color: f.color });
    }
  }

  /* The Factorio inserter: a post, an arm that swings across an arc, and a
     claw on the end that is empty on the way out and full on the way back. */
  function drawInserter(x, y, ang0, ang1, phase, color) {
    var swing = 0.5 - 0.5 * Math.cos(phase * 6.2832);
    var ang = ang0 + (ang1 - ang0) * swing;
    var reach = 0.92;
    var base = P(x, y, 0.34);
    var tip = P(x + Math.cos(ang) * reach, y + Math.sin(ang) * reach, 0.62);

    Iso.box(ctx, { x: x - 0.19, y: y - 0.19, z: 0, w: 0.38, d: 0.38, h: 0.34, color: '#4b4941' });
    ctx.strokeStyle = color || '#d9b64a';
    ctx.lineWidth = 3.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(base.x, base.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    ctx.lineCap = 'butt';

    /* the claw carries something home on the return half of the swing */
    ctx.fillStyle = swing > 0.5 ? '#cf9a3a' : '#6a6558';
    ctx.beginPath();
    ctx.arc(tip.x, tip.y, 3.6, 0, 6.2832);
    ctx.fill();
  }

  function drawFeederEnds() {
    for (var i = 0; i < F.feeders.length; i++) {
      var f = F.feeders[i];
      var dir = f.y1 > f.y0 ? 1 : -1;
      /* supply chest at the head of the spur */
      Iso.box(ctx, {
        x: f.x - 0.42, y: f.y0 - 0.42 * dir - 0.42, z: 0, w: 0.84, d: 0.84, h: 0.62,
        color: '#7a6f56'
      });
      Iso.box(ctx, {
        x: f.x - 0.34, y: f.y0 - 0.42 * dir - 0.34, z: 0.62, w: 0.68, d: 0.68, h: 0.06,
        color: C.amber
      });
      drawInserter(f.x + 0.9, f.y1 + 0.35 * dir, -0.4, 2.2,
                   (t * 0.9 + i * 0.2) % 1, '#d9b64a');
    }
  }

  /* ------------------------------------------------------- face-space text */

  /* Text painted flat onto a machine's front face, so it foreshortens with the
     solid instead of floating over it. */
  function faceText(x0, y1, z0, lines, opts) {
    var o = opts || {};
    var a = P(x0, y1, z0);
    ctx.save();
    ctx.transform(1, Iso.TH / Iso.TW, 0, 1, a.x, a.y);
    ctx.textAlign = 'left';
    ctx.textBaseline = 'top';
    ctx.font = (o.size || 7) + 'px ui-monospace, Menlo, Consolas, monospace';
    ctx.fillStyle = o.color || 'rgba(232,220,196,0.6)';
    for (var i = 0; i < lines.length; i++) {
      ctx.fillText(lines[i], 0, i * (o.size || 7) * 1.25);
    }
    ctx.restore();
  }

  /* ---------------------------------------------------------- particles   */

  /* Deterministic puffs: a ring of blobs whose age is derived from the clock,
     so nothing has to be stored between frames. */
  function puffs(x, y, z, n, seed, opts) {
    var o = opts || {};
    var rate = o.rate || 1.0;
    for (var i = 0; i < n; i++) {
      var life = ((t * rate) + Iso.hash2(i, seed, 5)) % 1;
      var rr = (o.r0 || 0.1) + ((o.r1 || 0.42) - (o.r0 || 0.1)) * life;
      var dx = (Iso.hash2(i, seed, 9) - 0.5) * (o.spread || 0.5) * life;
      var dy = (Iso.hash2(i, seed, 13) - 0.5) * (o.spread || 0.5) * life;
      ctx.fillStyle = Iso.rgba(o.color || '#b9b3a6', (o.alpha == null ? 0.4 : o.alpha) * (1 - life));
      Iso.disc(ctx, x + dx, y + dy, z + life * (o.rise || 1.1), rr);
    }
  }

  function sparks(x, y, z, n, seed, color) {
    for (var i = 0; i < n; i++) {
      var life = ((t * 2.4) + Iso.hash2(i, seed, 3)) % 1;
      var ang = Iso.hash2(i, seed, 7) * 6.2832;
      var rr = life * 0.55;
      ctx.fillStyle = Iso.rgba(color || '#ffb44a', 0.9 * (1 - life));
      Iso.disc(ctx, x + Math.cos(ang) * rr, y + Math.sin(ang) * rr,
               z + life * 0.5 - life * life * 0.55, 0.045);
    }
  }

  /* Is this machine's station the one currently being worked? Drives every
     glow, spark and moving part on the floor. */
  function busy(id) {
    var s = Sim.state;
    return s.stage === id && !s.paused && !s.finished;
  }

  /* ------------------------------------------------------------ machines  */

  /* A generic Factorio-flavoured machine body: dark base plinth, tan casing,
     a darker inset top, and a status lamp that goes green when it is working. */
  function casing(b, w, d, h, color, litId) {
    Iso.box(ctx, { x: b.x - w / 2, y: b.y - d / 2, z: 0, w: w, d: d, h: 0.18, color: '#3c3a34' });
    Iso.box(ctx, { x: b.x - w / 2 + 0.1, y: b.y - d / 2 + 0.1, z: 0.18, w: w - 0.2, d: d - 0.2, h: h,
                   color: color });
    Iso.box(ctx, { x: b.x - w / 2 + 0.28, y: b.y - d / 2 + 0.28, z: 0.18 + h,
                   w: w - 0.56, d: d - 0.56, h: 0.1, color: Iso.shade(color, 0.72) });
    if (litId !== undefined) {
      var on = busy(litId);
      ctx.fillStyle = on
        ? 'rgba(126,220,110,' + (0.7 + 0.3 * Math.sin(t * 8)).toFixed(2) + ')'
        : 'rgba(200,80,60,0.65)';
      Iso.disc(ctx, b.x + w / 2 - 0.34, b.y - d / 2 + 0.34, 0.18 + h + 0.12, 0.13);
    }
  }

  function drawRack(b) {
    Iso.box(ctx, { x: b.x - 1.0, y: b.y - 0.5, z: 0, w: 2.0, d: 1.0, h: 0.14, color: '#4a4740' });
    for (var i = 0; i < 3; i++) {
      Iso.box(ctx, { x: b.x - 0.92 + i * 0.62, y: b.y - 0.4, z: 0.14, w: 0.5, d: 0.8, h: 0.46,
                     color: i % 2 ? '#7a6f56' : '#6b6350' });
      Iso.box(ctx, { x: b.x - 0.86 + i * 0.62, y: b.y - 0.34, z: 0.60, w: 0.38, d: 0.68, h: 0.05,
                     color: C.amber });
    }
    Iso.box(ctx, { x: b.x - 1.0, y: b.y - 0.5, z: 0.66, w: 0.12, d: 1.0, h: 0.9, color: b.color });
    Iso.box(ctx, { x: b.x + 0.88, y: b.y - 0.5, z: 0.66, w: 0.12, d: 1.0, h: 0.9, color: b.color });
    Iso.box(ctx, { x: b.x - 1.0, y: b.y - 0.5, z: 1.5, w: 2.0, d: 1.0, h: 0.1, color: b.color });
  }

  function drawCrane(b) {
    for (var s = -1; s <= 1; s += 2) {
      Iso.box(ctx, { x: b.x - 0.16, y: b.y + s * 2.4 - 0.16, z: 0, w: 0.32, d: 0.32, h: 3.2,
                     color: '#5a5850' });
    }
    Iso.box(ctx, { x: b.x - 0.3, y: b.y - 2.7, z: 3.2, w: 0.6, d: 5.4, h: 0.34, color: b.color });
    /* the hoist slides along the beam */
    var slide = Math.sin(t * 0.5) * 1.9;
    Iso.box(ctx, { x: b.x - 0.38, y: b.y + slide - 0.34, z: 2.9, w: 0.76, d: 0.68, h: 0.34,
                   color: '#4b4941' });
    ctx.strokeStyle = 'rgba(30,28,24,0.8)';
    ctx.lineWidth = 1.4;
    var a = P(b.x, b.y + slide, 2.9), c = P(b.x, b.y + slide, 1.4);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    Iso.box(ctx, { x: b.x - 0.24, y: b.y + slide - 0.24, z: 1.1, w: 0.48, d: 0.48, h: 0.3,
                   color: C.amber });
  }

  function drawSilo(b) {
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.9, h: 2.6, color: b.color, ring: 0.35 });
    Iso.frustum(ctx, { x: b.x, y: b.y, z: 2.6, r0: 0.9, r1: 0.55, h: 0.5, color: Iso.shade(b.color, 0.9) });
    Iso.box(ctx, { x: b.x - 0.25, y: b.y - 0.25, z: 0, w: 0.5, d: 0.5, h: 0.4, color: '#3f3d37' });
    faceText(b.x - 0.5, b.y + 0.9, 1.9, ['POWDER'], { size: 7 });
  }

  function drawPrinter(b) {
    casing(b, 2.4, 2.0, 1.5, b.color, 'print');
    /* build chamber window, with the laser sweeping across it when running */
    var on = busy('print');
    Iso.box(ctx, { x: b.x - 0.7, y: b.y - 0.72, z: 0.9, w: 1.4, d: 0.06, h: 0.62,
                   color: on ? '#5f4d78' : '#39323f' });
    if (on) {
      var sweep = (t * 1.7) % 1;
      ctx.strokeStyle = 'rgba(196,160,255,0.9)';
      ctx.lineWidth = 2;
      var a = P(b.x - 0.6 + sweep * 1.2, b.y - 0.72, 1.5);
      var c = P(b.x - 0.6 + sweep * 1.2, b.y - 0.72, 0.95);
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
      ctx.fillStyle = 'rgba(228,206,255,0.75)';
      Iso.disc(ctx, b.x - 0.6 + sweep * 1.2, b.y - 0.68, 0.96, 0.09);
    }
    /* powder hopper and inert-gas bottle */
    Iso.cylinder(ctx, { x: b.x - 0.85, y: b.y + 0.55, z: 1.68, r: 0.3, h: 0.6, color: '#6d6577' });
    Iso.cylinder(ctx, { x: b.x + 0.95, y: b.y + 0.6, z: 0, r: 0.24, h: 1.1, color: '#5c7a84' });
  }

  function drawCnc(b) {
    casing(b, 2.0, 1.8, 1.4, b.color, 'machine');
    Iso.box(ctx, { x: b.x - 0.62, y: b.y - 0.66, z: 0.85, w: 1.24, d: 0.06, h: 0.56,
                   color: busy('machine') ? '#7f9fb4' : '#33383d' });
    /* spindle head tracks back and forth over the work */
    var sx = Math.sin(t * 1.6 + b.x) * 0.42;
    Iso.box(ctx, { x: b.x + sx - 0.16, y: b.y - 0.3, z: 1.58, w: 0.32, d: 0.6, h: 0.5, color: '#55606a' });
    Iso.cylinder(ctx, { x: b.x + sx, y: b.y, z: 1.32, r: 0.09, h: 0.28, color: '#c8ccd2' });
    if (busy('machine')) {
      sparks(b.x + sx, b.y, 1.3, 5, (b.x * 7) | 0, '#ffd06a');
      puffs(b.x + sx, b.y, 1.4, 3, (b.x * 3) | 0, { color: '#9fb0bb', alpha: 0.22, rise: 0.7, r1: 0.24 });
    }
  }

  function drawChipbin(b) {
    Iso.box(ctx, { x: b.x - 0.6, y: b.y - 0.5, z: 0, w: 1.2, d: 1.0, h: 0.8, color: b.color });
    Iso.box(ctx, { x: b.x - 0.5, y: b.y - 0.4, z: 0.8, w: 1.0, d: 0.8, h: 0.12, color: '#6b5f4a' });
  }

  function drawMill(b) {
    casing(b, 2.2, 1.8, 1.3, b.color, 'channel');
    /* a liner turning in the fixture while the cutter tracks down it */
    Iso.cylinder(ctx, { x: b.x - 0.3, y: b.y - 0.1, z: 1.48, r: 0.34, h: 0.7, color: '#c2703c', ring: 0.5 });
    Iso.gear(ctx, b.x - 0.3, b.y - 0.1, 2.2, 0.34, 14, t * 1.6, '#d08a52');
    var cz = 1.5 + 0.5 * (0.5 + 0.5 * Math.sin(t * 1.1));
    Iso.box(ctx, { x: b.x + 0.35, y: b.y - 0.2, z: cz, w: 0.5, d: 0.24, h: 0.16, color: '#5f6a72' });
    if (busy('channel')) sparks(b.x - 0.02, b.y - 0.1, cz, 5, 41, '#ffc978');
  }

  function drawPlating(b) {
    Iso.box(ctx, { x: b.x - 1.0, y: b.y - 0.8, z: 0, w: 2.0, d: 1.6, h: 0.9, color: '#3f4a4c' });
    /* electroforming bath: a lit surface with a part hanging in it */
    ctx.fillStyle = Iso.rgba(b.color, 0.75);
    Iso.poly(ctx, [P(b.x - 0.86, b.y - 0.66, 0.9), P(b.x + 0.86, b.y - 0.66, 0.9),
                   P(b.x + 0.86, b.y + 0.66, 0.9), P(b.x - 0.86, b.y + 0.66, 0.9)]);
    ctx.fillStyle = 'rgba(150,235,225,' + (0.12 + 0.1 * Math.sin(t * 2.1)).toFixed(2) + ')';
    Iso.poly(ctx, [P(b.x - 0.86, b.y - 0.66, 0.91), P(b.x + 0.86, b.y - 0.66, 0.91),
                   P(b.x + 0.86, b.y + 0.66, 0.91), P(b.x - 0.86, b.y + 0.66, 0.91)]);
    Iso.box(ctx, { x: b.x - 0.9, y: b.y - 0.86, z: 0.9, w: 1.8, d: 0.08, h: 0.16, color: '#4d585a' });
    Iso.cylinder(ctx, { x: b.x + 0.2, y: b.y, z: 0.55, r: 0.22, h: 0.7, color: '#c2703c' });
    if (busy('channel')) {
      puffs(b.x, b.y, 1.0, 4, 77, { color: '#a8ded6', alpha: 0.2, rise: 0.9, r1: 0.3 });
    }
  }

  function drawFurnace(b) {
    var on = busy('braze');
    Iso.box(ctx, { x: b.x - 1.8, y: b.y - 1.3, z: 0, w: 3.6, d: 2.6, h: 0.3, color: '#3a3630' });
    Iso.box(ctx, { x: b.x - 1.6, y: b.y - 1.1, z: 0.3, w: 3.2, d: 2.2, h: 1.8, color: b.color });
    Iso.box(ctx, { x: b.x - 1.4, y: b.y - 0.9, z: 2.1, w: 2.8, d: 1.8, h: 0.24, color: '#5a4a40' });
    /* the door glows when the cycle is running */
    Iso.box(ctx, {
      x: b.x - 0.75, y: b.y - 1.16, z: 0.6, w: 1.5, d: 0.08, h: 1.1,
      color: on ? Iso.mix('#8a3a20', '#ffb257', 0.4 + 0.35 * Math.sin(t * 3)) : '#4a3d34'
    });
    /* vacuum pumps and a stack */
    Iso.cylinder(ctx, { x: b.x - 1.9, y: b.y + 0.5, z: 0, r: 0.28, h: 0.9, color: '#5f6a72' });
    Iso.cylinder(ctx, { x: b.x + 1.9, y: b.y + 0.4, z: 0, r: 0.28, h: 1.2, color: '#5f6a72' });
    if (on) {
      ctx.fillStyle = 'rgba(255,150,60,0.18)';
      Iso.disc(ctx, b.x, b.y - 1.4, 0.05, 1.6);
      puffs(b.x, b.y - 1.0, 2.4, 5, 21, { color: '#c8b8a4', alpha: 0.3, rise: 2.0, r1: 0.6 });
    }
  }

  function drawHip(b) {
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.75, h: 2.4, color: b.color, ring: 0.3 });
    Iso.frustum(ctx, { x: b.x, y: b.y, z: 2.4, r0: 0.75, r1: 0.45, h: 0.4, color: Iso.shade(b.color, 0.9) });
    Iso.box(ctx, { x: b.x - 0.9, y: b.y - 0.9, z: 0, w: 1.8, d: 1.8, h: 0.22, color: '#3a3630' });
    faceText(b.x - 0.55, b.y + 0.75, 1.7, ['HIP', '2000 bar'], { size: 6.5 });
  }

  function drawChimney(b) {
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.42, h: 5.2, color: b.color, ring: 0.7 });
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 5.2, r: 0.48, h: 0.24, color: '#8a3f2c' });
    puffs(b.x, b.y, 5.5, 6, 5, { color: '#8f8a80', alpha: 0.22, rise: 3.4, r0: 0.26, r1: 1.0, rate: 0.35 });
  }

  function drawSpinformer(b) {
    casing(b, 2.6, 2.2, 1.2, b.color, 'nozzle');
    /* a bell blank turning on the mandrel */
    Iso.frustum(ctx, {
      x: b.x, y: b.y, z: 1.4, r0: 0.9, r1: 0.3, h: 1.0,
      color: busy('nozzle') ? Iso.mix('#8d949c', '#ff9a4a', 0.35 + 0.25 * Math.sin(t * 5)) : '#8d949c'
    });
    Iso.gear(ctx, b.x, b.y, 1.38, 0.92, 20, t * 2.6, '#6f757c');
    /* forming roller pressed against the wall */
    var rz = 1.5 + 0.7 * (0.5 + 0.5 * Math.sin(t * 0.9));
    Iso.box(ctx, { x: b.x + 0.85, y: b.y - 0.14, z: rz, w: 0.5, d: 0.28, h: 0.2, color: '#5f6a72' });
    if (busy('nozzle')) sparks(b.x + 0.72, b.y, rz, 6, 13, '#ffb257');
  }

  function drawWelder(b) {
    casing(b, 1.6, 1.4, 0.9, b.color, 'nozzle');
    var az = 1.2 + 0.25 * Math.sin(t * 2.2);
    Iso.box(ctx, { x: b.x - 0.1, y: b.y - 0.5, z: 1.5, w: 0.2, d: 1.0, h: 0.16, color: '#55606a' });
    Iso.cylinder(ctx, { x: b.x, y: b.y - 0.2, z: az, r: 0.06, h: 0.3, color: '#c8ccd2' });
    if (busy('nozzle')) {
      /* an arc is the brightest thing on the floor, so it gets a real bloom */
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var fl = 0.5 + 0.5 * Math.abs(Math.sin(t * 17));
      ctx.fillStyle = 'rgba(180,215,255,' + (0.5 * fl).toFixed(2) + ')';
      Iso.disc(ctx, b.x, b.y - 0.2, az, 0.5 + fl * 0.3);
      ctx.restore();
      sparks(b.x, b.y - 0.2, az, 8, 31, '#cfe4ff');
    }
  }

  /* The classic assembling machine: casing, a big gear turning on top, and two
     inserters feeding it from either side. */
  function drawAssembler(b) {
    casing(b, 2.3, 2.0, 1.15, b.color, b.station);
    var on = busy(b.station);
    var spin = on ? t * 2.2 : t * 0.25;
    Iso.gear(ctx, b.x - 0.42, b.y - 0.2, 1.45, 0.46, 12, spin, Iso.shade(b.color, 1.25));
    Iso.gear(ctx, b.x + 0.46, b.y + 0.16, 1.45, 0.34, 10, -spin * 1.3, Iso.shade(b.color, 1.1));
    Iso.box(ctx, { x: b.x - 0.24, y: b.y + 0.55, z: 1.33, w: 0.48, d: 0.3, h: 0.34, color: '#4b4941' });
    if (on) {
      sparks(b.x, b.y, 1.5, 5, (b.x * 11) | 0, '#ffd06a');
    }
    drawInserter(b.x - 1.55, b.y + 0.1, 0.2, 2.6, (t * 0.85) % 1, '#d9b64a');
    drawInserter(b.x + 1.55, b.y - 0.1, 3.4, 5.9, (t * 0.85 + 0.5) % 1, '#4a86b8');
  }

  function drawBench(b) {
    Iso.box(ctx, { x: b.x - 0.85, y: b.y - 0.5, z: 0, w: 1.7, d: 1.0, h: 0.62, color: '#4b4941' });
    Iso.box(ctx, { x: b.x - 0.9, y: b.y - 0.55, z: 0.62, w: 1.8, d: 1.1, h: 0.1, color: b.color });
    for (var i = 0; i < 3; i++) {
      Iso.box(ctx, { x: b.x - 0.6 + i * 0.5, y: b.y - 0.2, z: 0.72, w: 0.3, d: 0.36, h: 0.14,
                     color: i % 2 ? '#9aa2ab' : '#7a6f56' });
    }
    Iso.box(ctx, { x: b.x - 0.9, y: b.y + 0.42, z: 0.72, w: 1.8, d: 0.1, h: 0.7, color: '#3f3d37' });
  }

  function drawBalancer(b) {
    casing(b, 1.8, 1.5, 0.9, b.color, 'pump');
    var on = busy('pump');
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 1.08, r: 0.42, h: 0.16, color: '#6f757c' });
    Iso.gear(ctx, b.x, b.y, 1.25, 0.4, 16, on ? t * 9 : t * 0.6, '#a8b0b8');
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 1.25, r: 0.07, h: 0.42, color: '#c8ccd2' });
    if (on) {
      ctx.strokeStyle = 'rgba(120,220,200,0.45)';
      ctx.lineWidth = 1.2;
      var p = P(b.x, b.y, 1.3);
      ctx.beginPath();
      ctx.ellipse(p.x, p.y, 0.55 * Iso.TW * 1.414, 0.55 * Iso.TH * 1.414, 0, 0, 6.2832);
      ctx.stroke();
    }
  }

  function drawGasbottle(b) {
    for (var i = 0; i < 4; i++) {
      Iso.cylinder(ctx, {
        x: b.x - 0.36 + (i % 2) * 0.72, y: b.y - 0.3 + ((i / 2) | 0) * 0.6,
        z: 0, r: 0.24, h: 1.5, color: i % 2 ? b.color : '#6d7a80', ring: 0.15
      });
    }
    Iso.box(ctx, { x: b.x - 0.75, y: b.y - 0.66, z: 0, w: 1.5, d: 1.32, h: 0.14, color: '#3f3d37' });
  }

  function drawCleanroom(b) {
    Iso.box(ctx, { x: b.x - 1.9, y: b.y - 1.4, z: 0, w: 3.8, d: 2.8, h: 0.2, color: '#3a3833' });
    Iso.box(ctx, {
      x: b.x - 1.7, y: b.y - 1.2, z: 0.2, w: 3.4, d: 2.4, h: 1.9, color: '#c9d3d8', alpha: 0.24,
      edge: 'rgba(180,210,225,0.5)'
    });
    /* frame members, so the glass box reads as a structure */
    [[-1.7, -1.2], [1.7, -1.2], [-1.7, 1.2], [1.7, 1.2]].forEach(function (o) {
      Iso.box(ctx, { x: b.x + o[0] - 0.07, y: b.y + o[1] - 0.07, z: 0.2, w: 0.14, d: 0.14, h: 1.9,
                     color: '#767c82' });
    });
    Iso.box(ctx, { x: b.x - 1.75, y: b.y - 1.25, z: 2.1, w: 3.5, d: 2.5, h: 0.16, color: '#767c82' });
    /* light panels inside */
    ctx.fillStyle = 'rgba(190,225,240,' + (0.20 + 0.06 * Math.sin(t * 1.4)).toFixed(2) + ')';
    Iso.poly(ctx, [P(b.x - 1.3, b.y - 0.9, 2.06), P(b.x + 1.3, b.y - 0.9, 2.06),
                   P(b.x + 1.3, b.y + 0.9, 2.06), P(b.x - 1.3, b.y + 0.9, 2.06)]);
    Iso.box(ctx, { x: b.x - 0.7, y: b.y - 0.4, z: 0.2, w: 1.4, d: 0.8, h: 0.6, color: '#59616a' });
    if (busy('avionics')) sparks(b.x, b.y, 0.9, 4, 61, '#8fe0c0');
  }

  function drawStand(b) {
    Iso.box(ctx, { x: b.x - 0.9, y: b.y - 0.9, z: 0, w: 1.8, d: 1.8, h: 0.16, color: '#3f3d37' });
    for (var i = 0; i < 4; i++) {
      Iso.box(ctx, {
        x: b.x - 0.72 + (i % 2) * 1.3, y: b.y - 0.72 + ((i / 2) | 0) * 1.3,
        z: 0.16, w: 0.16, d: 0.16, h: 1.2, color: b.color
      });
    }
    Iso.box(ctx, { x: b.x - 0.8, y: b.y - 0.8, z: 1.36, w: 1.6, d: 1.6, h: 0.14, color: Iso.shade(b.color, 1.1) });
    Iso.disc(ctx, b.x, b.y, 1.51, 0.5);
  }

  function drawTorquebay(b) {
    casing(b, 1.9, 1.6, 1.0, b.color, 'assy');
    Iso.box(ctx, { x: b.x - 0.2, y: b.y - 0.7, z: 1.18, w: 0.4, d: 1.4, h: 0.2, color: '#55606a' });
    var arm = Math.sin(t * 1.3) * 0.45;
    Iso.box(ctx, { x: b.x + arm - 0.1, y: b.y - 0.16, z: 1.38, w: 0.2, d: 0.32, h: 0.44, color: C.amber });
    if (busy('assy')) sparks(b.x + arm, b.y, 1.3, 4, 97, '#ffd06a');
  }

  function drawXray(b) {
    Iso.box(ctx, { x: b.x - 1.6, y: b.y - 1.2, z: 0, w: 3.2, d: 2.4, h: 0.24, color: '#3a3833' });
    Iso.box(ctx, { x: b.x - 1.4, y: b.y - 1.0, z: 0.24, w: 2.8, d: 2.0, h: 1.7, color: b.color });
    /* leaded door with the trefoil-ish warning plate */
    Iso.box(ctx, { x: b.x - 0.6, y: b.y - 1.06, z: 0.5, w: 1.2, d: 0.08, h: 1.1, color: '#3d3646' });
    ctx.fillStyle = busy('ndt')
      ? 'rgba(255,206,64,' + (0.6 + 0.4 * Math.sin(t * 6)).toFixed(2) + ')'
      : 'rgba(120,110,70,0.5)';
    Iso.disc(ctx, b.x + 0.95, b.y - 1.02, 1.5, 0.16);
    faceText(b.x - 0.55, b.y - 1.06, 1.85, ['CT / RT'], { size: 6.5, color: 'rgba(240,220,150,0.75)' });
    Iso.box(ctx, { x: b.x - 1.45, y: b.y - 1.05, z: 1.94, w: 2.9, d: 2.1, h: 0.14, color: '#4e4756' });
  }

  /* The hot-fire stand: a concrete pedestal over a flame trench, with a gantry
     and a water tower. When the engine on the belt is firing, this is where the
     noise is coming from. */
  function drawTeststand(b) {
    var on = busy('hotfire') || Sim.state.fireFlash > 0.02;
    Iso.box(ctx, { x: b.x - 2.6, y: b.y - 2.0, z: 0, w: 5.2, d: 4.0, h: 0.3, color: '#46443e' });
    /* trench */
    ctx.fillStyle = '#17150f';
    Iso.poly(ctx, [P(b.x - 1.4, b.y - 1.3, 0.31), P(b.x + 1.4, b.y - 1.3, 0.31),
                   P(b.x + 1.4, b.y + 1.3, 0.31), P(b.x - 1.4, b.y + 1.3, 0.31)]);
    /* four legs and a deck the engine bolts under */
    for (var i = 0; i < 4; i++) {
      Iso.box(ctx, {
        x: b.x - 1.9 + (i % 2) * 3.6, y: b.y - 1.6 + ((i / 2) | 0) * 3.0,
        z: 0.3, w: 0.34, d: 0.34, h: 3.4, color: b.color
      });
    }
    Iso.box(ctx, { x: b.x - 2.1, y: b.y - 1.8, z: 3.7, w: 4.2, d: 3.4, h: 0.26, color: Iso.shade(b.color, 0.85) });
    Iso.box(ctx, { x: b.x - 2.1, y: b.y - 1.8, z: 3.96, w: 4.2, d: 0.16, h: 0.8, color: '#5a5850' });
    /* tower with the propellant run tanks */
    Iso.cylinder(ctx, { x: b.x + 2.4, y: b.y + 0.4, z: 0.3, r: 0.55, h: 4.2, color: '#7d8a90', ring: 0.25 });
    Iso.cylinder(ctx, { x: b.x - 2.5, y: b.y + 0.6, z: 0.3, r: 0.55, h: 4.2, color: '#8c968a', ring: 0.25 });
    if (on) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = 'rgba(255,150,60,0.22)';
      Iso.disc(ctx, b.x, b.y, 0.34, 3.0);
      ctx.restore();
      puffs(b.x, b.y, 0.4, 8, 3, { color: '#cfc7ba', alpha: 0.32, rise: 3.2, r0: 0.5, r1: 2.0, rate: 0.8, spread: 3 });
    }
  }

  function drawWatertank(b) {
    for (var i = 0; i < 4; i++) {
      Iso.box(ctx, {
        x: b.x - 0.9 + (i % 2) * 1.68, y: b.y - 0.9 + ((i / 2) | 0) * 1.68,
        z: 0, w: 0.22, d: 0.22, h: 2.4, color: '#5a5850'
      });
    }
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 2.4, r: 1.2, h: 1.7, color: b.color, ring: 0.4 });
    Iso.frustum(ctx, { x: b.x, y: b.y, z: 4.1, r0: 1.2, r1: 0.5, h: 0.5, color: Iso.shade(b.color, 1.05) });
  }

  function drawGantry(b) {
    /* the integration gantry: a portal frame the stage is rolled under */
    for (var s = -1; s <= 1; s += 2) {
      Iso.box(ctx, { x: b.x - 2.6, y: b.y + s * 2.2 - 0.2, z: 0, w: 0.4, d: 0.4, h: 5.0, color: b.color });
      Iso.box(ctx, { x: b.x + 2.2, y: b.y + s * 2.2 - 0.2, z: 0, w: 0.4, d: 0.4, h: 5.0, color: b.color });
    }
    Iso.box(ctx, { x: b.x - 2.8, y: b.y - 2.6, z: 5.0, w: 5.4, d: 5.2, h: 0.34,
                   color: Iso.shade(b.color, 0.8) });
    /* walkway decks up the legs */
    for (var k = 1; k <= 2; k++) {
      Iso.box(ctx, { x: b.x - 2.8, y: b.y - 2.6, z: 1.5 * k, w: 5.4, d: 0.3, h: 0.12, color: '#6a6e74' });
      Iso.hazardBand(ctx, b.x - 2.8, b.y - 2.6, b.x + 2.6, b.y - 2.6, 0.28, 1.5 * k + 0.13, { step: 9 });
    }
    var hoist = Math.sin(t * 0.42) * 1.5;
    Iso.box(ctx, { x: b.x + hoist - 0.4, y: b.y - 0.4, z: 4.6, w: 0.8, d: 0.8, h: 0.4, color: '#4b4941' });
    ctx.strokeStyle = 'rgba(30,28,24,0.8)';
    ctx.lineWidth = 1.4;
    var a = P(b.x + hoist, b.y, 4.6), c = P(b.x + hoist, b.y, 2.6);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(c.x, c.y); ctx.stroke();
    Iso.box(ctx, { x: b.x + hoist - 0.22, y: b.y - 0.22, z: 2.3, w: 0.44, d: 0.44, h: 0.3, color: C.amber });
  }

  function drawConsole(b) {
    Iso.box(ctx, { x: b.x - 0.6, y: b.y - 0.4, z: 0, w: 1.2, d: 0.8, h: 0.7, color: '#43413a' });
    Iso.box(ctx, { x: b.x - 0.6, y: b.y - 0.4, z: 0.7, w: 1.2, d: 0.5, h: 0.5, color: b.color });
    /* a small live trace on the screen */
    ctx.fillStyle = 'rgba(20,26,24,0.9)';
    Iso.poly(ctx, [P(b.x - 0.48, b.y - 0.34, 1.14), P(b.x + 0.48, b.y - 0.34, 1.14),
                   P(b.x + 0.48, b.y - 0.34, 0.82), P(b.x - 0.48, b.y - 0.34, 0.82)]);
    ctx.strokeStyle = 'rgba(120,230,150,0.85)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (var i = 0; i <= 12; i++) {
      var u = i / 12;
      var v = 0.86 + 0.24 * (0.5 + 0.5 * Math.sin(t * 3 + u * 7 + b.x));
      var p = P(b.x - 0.44 + u * 0.88, b.y - 0.34, v);
      if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
  }

  function drawTank(b) {
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0, r: 0.72, h: 2.2, color: b.color, ring: 0.3 });
    Iso.box(ctx, { x: b.x - 0.8, y: b.y - 0.8, z: 0, w: 1.6, d: 1.6, h: 0.16, color: '#3a3833' });
  }

  /* Cryogenic run tanks at the pad: insulated, frosted, and venting. */
  function drawProptank(b) {
    Iso.box(ctx, { x: b.x - 1.3, y: b.y - 1.3, z: 0, w: 2.6, d: 2.6, h: 0.24, color: '#3a3833' });
    Iso.cylinder(ctx, { x: b.x, y: b.y, z: 0.24, r: 1.05, h: 3.0, color: b.color, ring: 0.28 });
    Iso.frustum(ctx, { x: b.x, y: b.y, z: 3.24, r0: 1.05, r1: 0.4, h: 0.7, color: Iso.shade(b.color, 1.05) });
    Iso.hazardBand(ctx, b.x - 1.3, b.y - 1.4, b.x + 1.3, b.y - 1.4, 0.3, 0.26, { step: 10 });
    faceText(b.x - 0.5, b.y + 1.05, 2.1, [b.label || ''], { size: 9, color: 'rgba(240,236,226,0.7)' });
    puffs(b.x + 0.9, b.y, 3.0, 3, 43, { color: '#dfe6ea', alpha: 0.22, rise: 1.4, r1: 0.5, rate: 0.4 });
  }

  /* The launch mount: a ring the vehicle stands on, over the flame trench. */
  function drawPadmount(b) {
    var i;
    Iso.box(ctx, { x: b.x - 4.4, y: b.y - 4.4, z: 0, w: 8.8, d: 8.8, h: 0.3, color: '#4a4842' });
    /* the flame hole */
    ctx.fillStyle = '#100e0a';
    Iso.disc(ctx, b.x, b.y, 0.32, 2.5);
    for (i = 0; i < 6; i++) {
      var a = i / 6 * 6.2832 + 0.3;
      Iso.box(ctx, {
        x: b.x + Math.cos(a) * 3.5 - 0.28, y: b.y + Math.sin(a) * 3.5 - 0.28,
        z: 0.3, w: 0.56, d: 0.56, h: PAD.deckZ - 0.3, color: b.color
      });
    }
    /* the deck ring itself, drawn as a hexagon of beams around the hole */
    for (i = 0; i < 6; i++) {
      var a0 = i / 6 * 6.2832 + 0.3, a1 = (i + 1) / 6 * 6.2832 + 0.3;
      var x0 = b.x + Math.cos(a0) * 3.5, y0 = b.y + Math.sin(a0) * 3.5;
      var x1 = b.x + Math.cos(a1) * 3.5, y1 = b.y + Math.sin(a1) * 3.5;
      Iso.prism(ctx, [
        { x: x0, y: y0 }, { x: x1, y: y1 },
        { x: x1 * 0.88 + b.x * 0.12, y: y1 * 0.88 + b.y * 0.12 },
        { x: x0 * 0.88 + b.x * 0.12, y: y0 * 0.88 + b.y * 0.12 }
      ], PAD.deckZ - 0.3, 0.3, Iso.shade(b.color, 1.15));
    }
    Iso.hazardBand(ctx, b.x - 4.4, b.y - 4.5, b.x + 4.4, b.y - 4.5, 0.4, 0.31, { step: 12 });
    Iso.hazardBand(ctx, b.x - 4.5, b.y - 4.4, b.x - 4.5, b.y + 4.4, 0.4, 0.31, { step: 12 });
  }

  /* The strongback: the tower the rocket is raised against, which swings clear
     in the last minute before launch. */
  function drawStrongback(b) {
    var L = Sim.state.launch;
    var lean = (1 - L.gantry) * 0.55;                 /* radians away from vertical */
    var h = 22;
    var topX = b.x - Math.sin(lean) * h * 0.8;
    var topZ = PAD.deckZ + Math.cos(lean) * h;

    Iso.box(ctx, { x: b.x - 1.5, y: b.y - 1.5, z: 0, w: 3.0, d: 3.0, h: 0.5, color: '#46443e' });
    /* the mast, as a set of segments so it can lean */
    var seg = 10;
    for (var i = 0; i < seg; i++) {
      var f0 = i / seg, f1 = (i + 1) / seg;
      var ax = b.x + (topX - b.x) * f0, az = PAD.deckZ + (topZ - PAD.deckZ) * f0;
      var bx = b.x + (topX - b.x) * f1, bz = PAD.deckZ + (topZ - PAD.deckZ) * f1;
      var pa = P(ax, b.y, az), pb = P(bx, b.y, bz);
      ctx.strokeStyle = Iso.shade(b.color, 0.9);
      ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      ctx.strokeStyle = 'rgba(20,18,15,0.5)';
      ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(pa.x, pa.y); ctx.lineTo(pb.x, pb.y); ctx.stroke();
      /* cross-bracing */
      if (i % 2 === 0) {
        ctx.strokeStyle = 'rgba(150,155,160,0.5)';
        ctx.lineWidth = 1.6;
        var pc = P(ax + 0.9, b.y, az), pd = P(bx + 0.9, b.y, bz);
        ctx.beginPath();
        ctx.moveTo(pa.x, pa.y); ctx.lineTo(pd.x, pd.y);
        ctx.moveTo(pc.x, pc.y); ctx.lineTo(pb.x, pb.y);
        ctx.stroke();
      }
    }
    /* crew access arm at the top */
    Iso.box(ctx, { x: topX - 0.3, y: b.y - 0.5, z: topZ - 1.4, w: 2.2 * L.gantry + 0.4, d: 1.0, h: 0.3,
                   color: C.amber });
  }

  /* Lightning masts: three towers taller than the rocket, wired together. */
  function drawMast(b) {
    var h = 30;
    Iso.box(ctx, { x: b.x - 0.7, y: b.y - 0.7, z: 0, w: 1.4, d: 1.4, h: 0.4, color: '#46443e' });
    var steps = 12;
    for (var i = 0; i < steps; i++) {
      var z0 = 0.4 + (h - 0.4) * (i / steps), z1 = 0.4 + (h - 0.4) * ((i + 1) / steps);
      var w0 = 0.5 * (1 - i / steps) + 0.09;
      var w1 = 0.5 * (1 - (i + 1) / steps) + 0.09;
      Iso.prism(ctx, [
        { x: b.x - w0, y: b.y - w0 }, { x: b.x + w0, y: b.y - w0 },
        { x: b.x + w0, y: b.y + w0 }, { x: b.x - w0, y: b.y + w0 }
      ], z0, z1 - z0, i % 2 ? Iso.shade(b.color, 0.9) : b.color);
      if (w1 < 0) break;
    }
    /* obstruction light */
    ctx.fillStyle = 'rgba(255,70,50,' + (0.4 + 0.6 * Math.abs(Math.sin(t * 1.6))).toFixed(2) + ')';
    Iso.disc(ctx, b.x, b.y, h + 0.3, 0.28);
  }

  function drawBlockhouse(b) {
    Iso.box(ctx, { x: b.x - 2.0, y: b.y - 1.5, z: 0, w: 4.0, d: 3.0, h: 1.6, color: b.color,
                   panels: { cols: 4, rows: 2, band: 1, seed: 7, color: '#e7b455' } });
    Iso.box(ctx, { x: b.x - 2.2, y: b.y - 1.7, z: 1.6, w: 4.4, d: 3.4, h: 0.24, color: '#4e4b45' });
    /* dish on the roof, tracking */
    Iso.cylinder(ctx, { x: b.x + 1.2, y: b.y + 0.8, z: 1.84, r: 0.16, h: 0.7, color: '#6a6e74' });
    Iso.frustum(ctx, { x: b.x + 1.2, y: b.y + 0.8, z: 2.54, r0: 0.16, r1: 0.7, h: 0.5,
                       color: '#c3c8cd', inner: '#8f959b' });
    faceText(b.x - 1.6, b.y + 1.5, 1.2, ['LC-1 CONTROL'], { size: 7 });
  }

  /* ---------------------------------------------------------------- props */

  function drawPole(b) {
    Iso.box(ctx, { x: b.x - 0.12, y: b.y - 0.12, z: 0, w: 0.24, d: 0.24, h: 3.0, color: '#6b5f4a' });
    Iso.box(ctx, { x: b.x - 0.5, y: b.y - 0.08, z: 2.75, w: 1.0, d: 0.16, h: 0.1, color: '#7a6f56' });
    Iso.box(ctx, { x: b.x - 0.08, y: b.y - 0.5, z: 2.6, w: 0.16, d: 1.0, h: 0.1, color: '#7a6f56' });
    if (b.prev) {
      /* a wire, sagging. Drawn as a quadratic with the control point pulled
         down, which is close enough to a catenary at this scale. */
      var a = P(b.x, b.y, 2.85), c = P(b.prev.x, b.prev.y, 2.85);
      ctx.strokeStyle = 'rgba(40,38,32,0.55)';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo((a.x + c.x) / 2, (a.y + c.y) / 2 + 11, c.x, c.y);
      ctx.stroke();
    }
  }

  function drawPiperun(b) {
    var dx = b.x1 - b.x0, dy = b.y1 - b.y0;
    var len = Math.hypot(dx, dy) || 1;
    var n = Math.max(2, Math.round(len / 5));
    for (var i = 0; i <= n; i++) {
      var f = i / n;
      Iso.box(ctx, {
        x: b.x0 + dx * f - 0.1, y: b.y0 + dy * f - 0.1, z: 0,
        w: 0.2, d: 0.2, h: b.z, color: '#5a5850'
      });
    }
    /* two pipes side by side, in the pale grey every industrial pipe run is */
    for (var k = -1; k <= 1; k += 2) {
      var ox = -dy / len * 0.22 * k, oy = dx / len * 0.22 * k;
      ctx.fillStyle = k < 0 ? '#8f958c' : '#9aa0a6';
      Iso.ribbon(ctx, b.x0 + ox, b.y0 + oy, b.x1 + ox, b.y1 + oy, 0.3, b.z + 0.15);
      ctx.fillStyle = 'rgba(20,18,15,0.3)';
      Iso.ribbon(ctx, b.x0 + ox, b.y0 + oy, b.x1 + ox, b.y1 + oy, 0.34, b.z + 0.14);
    }
  }

  function drawLamp(b) {
    Iso.box(ctx, { x: b.x - 0.1, y: b.y - 0.1, z: 0, w: 0.2, d: 0.2, h: 2.4, color: '#55524a' });
    Iso.frustum(ctx, { x: b.x, y: b.y, z: 2.4, r0: 0.1, r1: 0.34, h: 0.3, color: '#6a6e74',
                       inner: 'rgba(255,226,150,0.9)' });
    /* the pool of light it throws */
    ctx.fillStyle = 'rgba(255,214,130,0.07)';
    Iso.disc(ctx, b.x, b.y, 0.03, 2.3);
    ctx.fillStyle = 'rgba(255,214,130,0.06)';
    Iso.disc(ctx, b.x, b.y, 0.035, 1.4);
  }

  function drawPallet(b) {
    Iso.box(ctx, { x: b.x - 0.55, y: b.y - 0.45, z: 0, w: 1.1, d: 0.9, h: 0.12, color: '#5c5342' });
    var n = 1 + (Iso.hash2(b.seed, 3, 9) * 3) | 0;
    for (var i = 0; i < n; i++) {
      var hh = 0.3 + Iso.hash2(b.seed, i, 11) * 0.3;
      Iso.box(ctx, {
        x: b.x - 0.42 + (i % 2) * 0.44, y: b.y - 0.34 + ((i / 2) | 0) * 0.42,
        z: 0.12, w: 0.4, d: 0.38, h: hh,
        color: i % 3 === 0 ? '#7a6f56' : (i % 3 === 1 ? '#6d7a80' : '#7f6b58')
      });
    }
  }

  function drawScrub(b) {
    ctx.fillStyle = 'rgba(14,12,9,0.28)';
    Iso.disc(ctx, b.x, b.y, 0.01, 0.3 * b.s);
    Iso.box(ctx, { x: b.x - 0.06 * b.s, y: b.y - 0.06 * b.s, z: 0, w: 0.12 * b.s, d: 0.12 * b.s,
                   h: 0.3 * b.s, color: '#4e4636', edge: false });
    ctx.fillStyle = '#5d6640';
    Iso.disc(ctx, b.x, b.y, 0.3 * b.s, 0.32 * b.s);
    ctx.fillStyle = '#6b7449';
    Iso.disc(ctx, b.x - 0.06, b.y - 0.06, 0.42 * b.s, 0.22 * b.s);
  }

  function drawRock(b) {
    ctx.fillStyle = 'rgba(14,12,9,0.3)';
    Iso.disc(ctx, b.x, b.y, 0.01, 0.34 * b.s);
    Iso.prism(ctx, [
      { x: b.x - 0.3 * b.s, y: b.y - 0.16 * b.s },
      { x: b.x + 0.1 * b.s, y: b.y - 0.3 * b.s },
      { x: b.x + 0.32 * b.s, y: b.y + 0.14 * b.s },
      { x: b.x - 0.08 * b.s, y: b.y + 0.28 * b.s }
    ], 0, 0.3 * b.s, '#6b665c');
  }

  /* ------------------------------------------------------------- vehicles */

  /* Trucks looping the perimeter road. Pure set-dressing, but a floor with
     nothing moving on it except the subject reads as a diagram. */
  var LOOP = [
    { x: 2, y: 31.6 }, { x: 49, y: 31.6 }, { x: 49, y: 2.6 }, { x: 2, y: 2.6 }
  ];

  function loopAt(d) {
    var total = 0, i, lens = [];
    for (i = 0; i < LOOP.length; i++) {
      var a = LOOP[i], b = LOOP[(i + 1) % LOOP.length];
      var l = Math.hypot(b.x - a.x, b.y - a.y);
      lens.push(l); total += l;
    }
    d = ((d % total) + total) % total;
    for (i = 0; i < LOOP.length; i++) {
      if (d <= lens[i]) {
        var p = LOOP[i], q = LOOP[(i + 1) % LOOP.length];
        var f = d / lens[i];
        var dx = (q.x - p.x) / lens[i], dy = (q.y - p.y) / lens[i];
        return { x: p.x + (q.x - p.x) * f, y: p.y + (q.y - p.y) * f, dx: dx, dy: dy };
      }
      d -= lens[i];
    }
    return { x: LOOP[0].x, y: LOOP[0].y, dx: 1, dy: 0 };
  }

  function trucks() {
    var out = [];
    for (var i = 0; i < 3; i++) {
      var v = loopAt(t * 3.2 + i * 52);
      v.color = [C.amber, '#7a8a6a', '#8a7a6a'][i];
      out.push(v);
    }
    return out;
  }

  function drawTruck(v) {
    ctx.fillStyle = 'rgba(14,12,9,0.3)';
    Iso.disc(ctx, v.x, v.y, 0.02, 0.5);
    Iso.orientedBox(ctx, { x: v.x, y: v.y, z: 0.1, len: 1.6, wid: 0.8, h: 0.4,
                           hx: v.dx, hy: v.dy, color: v.color });
    Iso.orientedBox(ctx, { x: v.x + v.dx * 0.4, y: v.y + v.dy * 0.4, z: 0.5, len: 0.6, wid: 0.7,
                           h: 0.4, hx: v.dx, hy: v.dy, color: Iso.shade(v.color, 0.8) });
  }

  /* ------------------------------------------------------ the engine itself */

  /* Local frame helpers: u runs along the belt, v across it. Everything the
     engine is made of is placed in (u, v) so the whole assembly turns through
     a corner as one object. */
  function fx(f, u, v) { return f.x + f.hx * u - f.hy * v; }
  function fy(f, u, v) { return f.y + f.hy * u + f.hx * v; }

  function ob(f, u, v, z, len, wid, h, color, edge) {
    Iso.orientedBox(ctx, {
      x: fx(f, u, v), y: fy(f, u, v), z: z,
      len: len, wid: wid, h: h, hx: f.hx, hy: f.hy, color: color, edge: edge
    });
  }

  function cy(f, u, v, z, r, h, color, ring) {
    Iso.cylinder(ctx, { x: fx(f, u, v), y: fy(f, u, v), z: z, r: r, h: h, color: color, ring: ring });
  }

  function fr(f, u, v, z, r0, r1, h, color, inner) {
    Iso.frustum(ctx, { x: fx(f, u, v), y: fy(f, u, v), z: z, r0: r0, r1: r1, h: h,
                       color: color, inner: inner });
  }

  /* Draw the engine at whatever level of completion it has reached. `scale`
     lets the pad draw the same engine smaller when it is one of nine. */
  function drawEngine(f, base, L, opts) {
    var o = opts || {};
    var s = o.scale || 1;
    var sooty = L >= Sim.LEVEL.hotfire;
    var i, a;

    if (L === 0) { drawStock(f, base, s); return; }

    /* ---- the nozzle bell: fitted at the nozzle shop, and the moment the
       thing on the belt stops being a lump and starts being an engine ---- */
    if (L >= Sim.LEVEL.nozzle) {
      fr(f, 0, 0, base + 0.05, 0.82 * s, 0.24 * s, 0.95 * s,
         sooty ? '#5e5a55' : '#9aa0a6', sooty ? '#2a2724' : '#6c7278');
      /* the brazed tube bundle reads as ribs running down the bell */
      ctx.strokeStyle = sooty ? 'rgba(30,26,22,0.45)' : 'rgba(60,64,70,0.4)';
      ctx.lineWidth = 1;
      for (i = 0; i < 14; i++) {
        a = i / 14 * 6.2832;
        var p0 = P(fx(f, Math.cos(a) * 0.82 * s, Math.sin(a) * 0.82 * s),
                   fy(f, Math.cos(a) * 0.82 * s, Math.sin(a) * 0.82 * s), base + 0.05);
        var p1 = P(fx(f, Math.cos(a) * 0.24 * s, Math.sin(a) * 0.24 * s),
                   fy(f, Math.cos(a) * 0.24 * s, Math.sin(a) * 0.24 * s), base + 1.0 * s);
        ctx.beginPath(); ctx.moveTo(p0.x, p0.y); ctx.lineTo(p1.x, p1.y); ctx.stroke();
      }
    } else {
      /* before the bell, the chamber sits on its handling ring */
      cy(f, 0, 0, base + 0.05, 0.34 * s, 0.12 * s, '#55524a');
    }

    /* ---- the chamber and throat ---- */
    var chamZ = base + (L >= Sim.LEVEL.nozzle ? 1.0 * s : 0.17 * s);
    var linerColor = L >= Sim.LEVEL.braze ? '#b0a08c'
                   : (L >= Sim.LEVEL.channel ? '#c2703c'
                   : (L >= Sim.LEVEL.machine ? '#a8aeb4' : '#8e8a80'));

    /* a printed part is matte and stripey; a machined one is not */
    fr(f, 0, 0, chamZ, 0.24 * s, 0.30 * s, 0.55 * s, linerColor);
    if (L === Sim.LEVEL.print) {
      ctx.strokeStyle = 'rgba(60,56,50,0.35)';
      ctx.lineWidth = 1;
      for (i = 1; i < 6; i++) {
        var zz = chamZ + 0.55 * s * (i / 6);
        var q0 = P(fx(f, -0.28 * s, 0), fy(f, -0.28 * s, 0), zz);
        var q1 = P(fx(f, 0.28 * s, 0), fy(f, 0.28 * s, 0), zz);
        ctx.beginPath(); ctx.moveTo(q0.x, q0.y); ctx.lineTo(q1.x, q1.y); ctx.stroke();
      }
    }

    /* cooling channels, milled and then roofed over */
    if (L === Sim.LEVEL.channel) {
      ctx.strokeStyle = 'rgba(70,40,20,0.55)';
      ctx.lineWidth = 1.4;
      for (i = 0; i < 12; i++) {
        a = i / 12 * 6.2832;
        var c0 = P(fx(f, Math.cos(a) * 0.25 * s, Math.sin(a) * 0.25 * s),
                   fy(f, Math.cos(a) * 0.25 * s, Math.sin(a) * 0.25 * s), chamZ);
        var c1 = P(fx(f, Math.cos(a) * 0.31 * s, Math.sin(a) * 0.31 * s),
                   fy(f, Math.cos(a) * 0.31 * s, Math.sin(a) * 0.31 * s), chamZ + 0.55 * s);
        ctx.beginPath(); ctx.moveTo(c0.x, c0.y); ctx.lineTo(c1.x, c1.y); ctx.stroke();
      }
    }

    var topZ = chamZ + 0.55 * s;

    /* ---- injector dome ---- */
    if (L >= Sim.LEVEL.inject) {
      fr(f, 0, 0, topZ, 0.32 * s, 0.38 * s, 0.22 * s, '#b8863a');
      cy(f, 0, 0, topZ + 0.22 * s, 0.38 * s, 0.1 * s, '#c9954a');
      topZ += 0.32 * s;
      /* the propellant manifolds around the dome */
      for (i = 0; i < 4; i++) {
        a = i / 4 * 6.2832 + 0.4;
        cy(f, Math.cos(a) * 0.34 * s, Math.sin(a) * 0.34 * s, topZ - 0.14 * s, 0.06 * s, 0.16 * s, '#8d949c');
      }
    }

    /* ---- turbopumps: one for each propellant, on opposite sides ---- */
    if (L >= Sim.LEVEL.pump) {
      var spin = Sim.state.spin;
      for (i = 0; i < 2; i++) {
        var side = i ? 1 : -1;
        var px = 0.52 * s * side, pv = 0.34 * s * side;
        cy(f, px, pv, chamZ + 0.1 * s, 0.20 * s, 0.44 * s, i ? '#4f7f82' : '#7d8a90', 0.5);
        Iso.gear(ctx, fx(f, px, pv), fy(f, px, pv), chamZ + 0.56 * s, 0.22 * s, 11,
                 spin * (i ? 1 : -1.2), i ? '#63989b' : '#98a4ab');
        /* volute scroll and the duct up to the injector */
        fr(f, px, pv, chamZ + 0.58 * s, 0.20 * s, 0.11 * s, 0.2 * s, '#6f757c');
        ctx.strokeStyle = 'rgba(140,148,156,0.9)';
        ctx.lineWidth = 3.2 * s;
        var d0 = P(fx(f, px, pv), fy(f, px, pv), chamZ + 0.78 * s);
        var d1 = P(fx(f, 0, 0), fy(f, 0, 0), topZ - 0.1 * s);
        ctx.beginPath();
        ctx.moveTo(d0.x, d0.y);
        ctx.quadraticCurveTo((d0.x + d1.x) / 2 + 6 * side, (d0.y + d1.y) / 2 - 10, d1.x, d1.y);
        ctx.stroke();
      }
    }

    /* ---- valves, ducts and the igniter ---- */
    if (L >= Sim.LEVEL.valve) {
      for (i = 0; i < 2; i++) {
        var sd = i ? 1 : -1;
        cy(f, 0.18 * s * sd, 0.46 * s * sd, chamZ + 0.05 * s, 0.10 * s, 0.24 * s, '#6d8f4c');
        ob(f, 0.18 * s * sd, 0.46 * s * sd, chamZ + 0.29 * s, 0.16 * s, 0.16 * s, 0.1 * s, '#8fae6a');
      }
      /* propellant lines wrapping the chamber */
      ctx.strokeStyle = 'rgba(154,160,166,0.85)';
      ctx.lineWidth = 2.2 * s;
      for (i = 0; i < 2; i++) {
        var w0 = P(fx(f, -0.34 * s, 0.2 * s * (i ? 1 : -1)), fy(f, -0.34 * s, 0.2 * s * (i ? 1 : -1)), chamZ + 0.1 * s);
        var w1 = P(fx(f, 0.34 * s, 0.2 * s * (i ? 1 : -1)), fy(f, 0.34 * s, 0.2 * s * (i ? 1 : -1)), topZ - 0.2 * s);
        ctx.beginPath();
        ctx.moveTo(w0.x, w0.y);
        ctx.quadraticCurveTo((w0.x + w1.x) / 2 - 8, (w0.y + w1.y) / 2, w1.x, w1.y);
        ctx.stroke();
      }
      /* torch igniter, bolted to the dome */
      cy(f, -0.3 * s, -0.3 * s, topZ - 0.1 * s, 0.06 * s, 0.2 * s, '#a25a35');
    }

    /* ---- controller and harness ---- */
    if (L >= Sim.LEVEL.avionics) {
      ob(f, 0.02 * s, -0.56 * s, chamZ + 0.2 * s, 0.5 * s, 0.22 * s, 0.34 * s, '#4a5158');
      ctx.fillStyle = 'rgba(110,220,140,' + (0.5 + 0.5 * Math.abs(Math.sin(t * 3))).toFixed(2) + ')';
      Iso.disc(ctx, fx(f, 0.16 * s, -0.56 * s), fy(f, 0.16 * s, -0.56 * s), chamZ + 0.55 * s, 0.05 * s);
      /* the harness, orange the world over */
      ctx.strokeStyle = 'rgba(214,124,40,0.85)';
      ctx.lineWidth = 2 * s;
      var h0 = P(fx(f, 0.02 * s, -0.56 * s), fy(f, 0.02 * s, -0.56 * s), chamZ + 0.54 * s);
      var h1 = P(fx(f, 0, 0), fy(f, 0, 0), topZ - 0.05 * s);
      ctx.beginPath();
      ctx.moveTo(h0.x, h0.y);
      ctx.quadraticCurveTo((h0.x + h1.x) / 2, (h0.y + h1.y) / 2 - 8, h1.x, h1.y);
      ctx.stroke();
    }

    /* ---- gimbal ring and thrust take-out ---- */
    if (L >= Sim.LEVEL.assy) {
      cy(f, 0, 0, topZ, 0.30 * s, 0.12 * s, '#8d949c');
      Iso.disc(ctx, fx(f, 0, 0), fy(f, 0, 0), topZ + 0.13 * s, 0.3 * s);
      for (i = 0; i < 2; i++) {
        var gs = i ? 1 : -1;
        cy(f, 0.42 * s * gs, 0.42 * s * gs, chamZ + 0.5 * s, 0.06 * s, 0.42 * s, '#aab2ba');
      }
    }

    /* ---- acceptance seal, applied after inspection ---- */
    if (L >= Sim.LEVEL.ndt) {
      ob(f, 0.36 * s, -0.2 * s, chamZ + 0.36 * s, 0.14 * s, 0.14 * s, 0.06 * s, '#d8c24a');
      ctx.fillStyle = Iso.rgba('#e8d05a', 0.5 + 0.35 * Math.abs(Math.sin(t * 2.6)));
      Iso.disc(ctx, fx(f, 0.36 * s, -0.2 * s), fy(f, 0.36 * s, -0.2 * s), chamZ + 0.43 * s, 0.1 * s);
    }

    /* ---- bolted into the thrust structure ---- */
    if (L >= Sim.LEVEL.integrate && !o.onRocket) {
      for (i = 0; i < 4; i++) {
        var ax = (i % 2 ? 1 : -1) * 0.78 * s, av = ((i / 2) | 0 ? 1 : -1) * 0.78 * s;
        ctx.strokeStyle = 'rgba(120,128,136,0.9)';
        ctx.lineWidth = 3;
        var s0 = P(fx(f, ax, av), fy(f, ax, av), topZ + 0.6 * s);
        var s1 = P(fx(f, 0, 0), fy(f, 0, 0), topZ + 0.1 * s);
        ctx.beginPath(); ctx.moveTo(s0.x, s0.y); ctx.lineTo(s1.x, s1.y); ctx.stroke();
      }
      ob(f, 0, 0, topZ + 0.6 * s, 1.9 * s, 1.9 * s, 0.14 * s, '#6f757c');
    }
  }

  function drawStock(f, base, s) {
    /* bar stock and two sealed powder canisters */
    for (var i = 0; i < 3; i++) {
      ob(f, -0.5 + i * 0.5, 0.28, base, 0.42, 0.9, 0.16, i % 2 ? '#8d949c' : '#a8865a');
    }
    cy(f, -0.32, -0.34, base, 0.24, 0.5, '#7d8a90', 0.4);
    cy(f, 0.32, -0.34, base, 0.24, 0.5, '#a2643c', 0.4);
  }

  /* The engine as it rides the line: on a pallet on the belt, or on a
     transporter once it is out on the road. */
  function drawCarrier(c) {
    var s = Sim.state;
    var f = { x: c.x, y: c.y, hx: c.dx || 1, hy: c.dy || 0 };
    var z = c.z;
    var onRoad = Sim.carrier.dist >= F.roadFrom;

    /* Once the launch has begun the engine is on the rocket, not on the pad. */
    if (s.launch.active && s.launch.engineIn > 0.6) return;

    ctx.fillStyle = 'rgba(10,9,7,0.35)';
    Iso.disc(ctx, c.x, c.y, z + 0.02, 0.95);

    var base;
    if (onRoad) {
      /* a self-propelled transporter, because a belt does not run to the pad */
      ob(f, 0, 0, z + 0.05, 3.4, 2.2, 0.34, '#5a5850');
      ob(f, 0, 0, z + 0.39, 3.0, 1.9, 0.14, '#6a6e74');
      for (var i = 0; i < 6; i++) {
        var u = -1.15 + (i % 3) * 1.15, v = ((i / 3) | 0 ? 1 : -1) * 0.95;
        cy(f, u, v, z + 0.02, 0.2, 0.28, '#2f2d29');
      }
      Iso.hazardBand(ctx, fx(f, -1.7, 0), fy(f, -1.7, 0), fx(f, 1.7, 0), fy(f, 1.7, 0), 0.3, z + 0.4, { step: 9 });
      base = z + 0.53;
    } else {
      ob(f, 0, 0, z + 0.06, 2.4, 1.7, 0.16, '#5c5342');
      ob(f, 0, 0, z + 0.22, 2.2, 1.5, 0.05, '#6a6153');
      base = z + 0.27;
    }

    drawEngine(f, base, s.level, {});

    /* serial number, stamped once it has been through inspection */
    if (s.level >= Sim.LEVEL.ndt && showLabels) {
      labels.push({
        x: c.x, y: c.y, z: z + 2.9, lift: 8,
        text: Sim.state.tag, color: '#e8c86a', size: 11, small: true, mono: true
      });
    }
  }

  /* ------------------------------------------------------------ the rocket */

  var ROCKET = {
    r: 1.95,
    stage1: 17.5,       // height of the first stage above the mount deck
    inter: 2.4,
    stage2: 6.6,
    fairing: 5.4,
    baseLift: 1.0       // engines hang below the tank in this gap
  };

  function rocketBaseZ() {
    return PAD.deckZ + Sim.state.launch.zVis;
  }

  function drawRocket() {
    var s = Sim.state;
    var L = s.launch;
    if (!s.rocketReady) return;

    var x = PAD.x, y = PAD.y;
    var z0 = rocketBaseZ() + ROCKET.baseLift;
    var R = ROCKET.r;
    var i, a;

    /* --- the engine cluster: eight already fitted, plus the one just built,
       which slides up into the centre during the mate step --- */
    var fitted = L.engineIn;
    for (i = 0; i < 9; i++) {
      var isNew = i === 8;
      var ang = i === 8 ? 0 : (i / 8 * 6.2832);
      var rr = i === 8 ? 0 : 1.22;
      var ex = x + Math.cos(ang) * rr, ey = y + Math.sin(ang) * rr;
      var drop = isNew ? (1 - fitted) * 3.2 : 0;
      if (isNew && fitted <= 0.02) continue;
      Iso.frustum(ctx, {
        x: ex, y: ey, z: z0 - 0.95 - drop, r0: 0.52, r1: 0.18, h: 0.9,
        color: isNew ? '#9aa0a6' : '#6d6a64', inner: '#33312d'
      });
      Iso.cylinder(ctx, { x: ex, y: ey, z: z0 - 0.06 - drop, r: 0.2, h: 0.12, color: '#8d949c' });
    }

    /* --- first stage --- */
    Iso.cylinder(ctx, { x: x, y: y, z: z0, r: R, h: ROCKET.stage1, color: '#d5d5d0' });
    /* the black band at the base, and an amber stripe because this is a
       Factorio-coloured world */
    Iso.cylinder(ctx, { x: x, y: y, z: z0, r: R * 1.005, h: 1.5, color: '#33322e' });
    Iso.cylinder(ctx, { x: x, y: y, z: z0 + 1.5, r: R * 1.005, h: 0.35, color: C.amber });

    /* frost creeping up the tanks as they are loaded */
    if (L.vent > 0.05) {
      ctx.fillStyle = 'rgba(226,238,244,' + (0.16 * L.vent).toFixed(2) + ')';
      var fa = P(x, y, z0 + 2), fb = P(x, y, z0 + 2 + ROCKET.stage1 * 0.6 * L.vent);
      ctx.fillRect(fa.x - R * Iso.TW * 1.414, fb.y, R * Iso.TW * 2.828, fa.y - fb.y);
    }

    /* grid fins, stowed against the body near the top of the stage */
    for (i = 0; i < 2; i++) {
      var gs = i ? 1 : -1;
      Iso.box(ctx, {
        x: x + gs * (R - 0.1) - 0.2, y: y - 0.45, z: z0 + ROCKET.stage1 - 2.2,
        w: 0.4, d: 0.9, h: 1.3, color: '#4c4a45'
      });
    }

    /* --- interstage, second stage, fairing --- */
    var z1 = z0 + ROCKET.stage1;
    Iso.cylinder(ctx, { x: x, y: y, z: z1, r: R, h: ROCKET.inter, color: '#33322e' });
    var z2 = z1 + ROCKET.inter;
    Iso.cylinder(ctx, { x: x, y: y, z: z2, r: R, h: ROCKET.stage2, color: '#d5d5d0' });
    var z3 = z2 + ROCKET.stage2;
    Iso.frustum(ctx, { x: x, y: y, z: z3, r0: R, r1: 0.34, h: ROCKET.fairing,
                       color: '#dedeD8', inner: '#c8c8c2' });
    Iso.cylinder(ctx, { x: x, y: y, z: z3 + ROCKET.fairing, r: 0.34, h: 0.5, color: '#c04a3a' });

    /* markings down the side, painted flat onto the body */
    faceText(x - 1.0, y - R, z0 + 8.5, ['LC-1'], { size: 13, color: 'rgba(70,68,64,0.75)' });

    /* --- venting, plume, and the cloud on the pad --- */
    if (L.vent > 0.05 && L.plume < 0.05) {
      for (i = 0; i < 2; i++) {
        puffs(x + (i ? 1.6 : -1.6), y, z0 + 6 + i * 5, 4, 60 + i, {
          color: '#e2eaef', alpha: 0.3 * L.vent, rise: -2.6, r0: 0.3, r1: 1.5, rate: 0.6, spread: 2
        });
      }
    }

    if (L.plume > 0.02) drawPlume(x, y, z0 - 1.0, L);
  }

  /* The exhaust. Nine engines make one merged plume, bright and short at sea
     level, spreading into a wide translucent cone as the ambient pressure
     drops away — which is a real effect and the easiest one to show. */
  function drawPlume(x, y, z, L) {
    var expand = 1 + Math.min(1, L.alt / 30000) * 3.2;
    var len = (5 + Math.min(1, L.alt / 20000) * 9) * L.plume;
    var flick = 0.85 + 0.15 * Math.sin(t * 40);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    /* the outer, cooler cone */
    Iso.frustum(ctx, {
      x: x, y: y, z: z - len, r0: 2.4 * expand * L.plume, r1: 1.5, h: len,
      color: '#a8560f', inner: 'rgba(255,190,110,0.5)', edge: false
    });
    /* the bright core */
    Iso.frustum(ctx, {
      x: x, y: y, z: z - len * 0.72, r0: 1.3 * expand * L.plume * flick, r1: 1.0, h: len * 0.72,
      color: '#ffb057', inner: 'rgba(255,240,210,0.85)', edge: false
    });

    /* Mach diamonds: the standing shock pattern in an over-expanded plume.
       They only exist low down, where there is atmosphere to make them. */
    var atmos = 1 - Math.min(1, L.alt / 22000);
    if (atmos > 0.05) {
      for (var i = 0; i < 4; i++) {
        var dz = z - len * (0.2 + i * 0.17);
        ctx.fillStyle = 'rgba(255,246,226,' + (0.28 * atmos * flick).toFixed(2) + ')';
        Iso.disc(ctx, x, y, dz, 0.7 - i * 0.1);
      }
    }

    ctx.fillStyle = 'rgba(255,170,80,0.16)';
    Iso.disc(ctx, x, y, z - len * 0.5, 4.5 * expand * L.plume);
    ctx.restore();
  }

  /* The cloud on the pad: ignition overpressure, water deluge steam, and dust.
     Drawn after everything else because it rolls out over the whole complex. */
  function drawPadCloud() {
    var L = Sim.state.launch;
    if (L.padSmoke <= 0.02) return;
    var grow = Math.min(1, L.padSmoke) * (1 + Math.min(1, L.alt / 3000) * 1.4);

    for (var i = 0; i < 26; i++) {
      var life = ((t * 0.32) + Iso.hash2(i, 5, 7)) % 1;
      var ang = Iso.hash2(i, 9, 3) * 6.2832;
      var reach = (2.2 + life * 9.5) * grow;
      var px = PAD.x + Math.cos(ang) * reach;
      var py = PAD.y + Math.sin(ang) * reach * 0.9;
      var pz = 0.3 + life * 4.5 * grow;
      var warm = life < 0.3 && L.alt < 900;
      ctx.fillStyle = warm
        ? 'rgba(226,178,120,' + (0.4 * L.padSmoke * (1 - life)).toFixed(2) + ')'
        : 'rgba(202,204,206,' + (0.34 * L.padSmoke * (1 - life)).toFixed(2) + ')';
      Iso.disc(ctx, px, py, pz, (0.9 + life * 3.4) * grow);
    }
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
      var ay = p.y * cam.scale + cam.oy - (L.lift || 12);

      var size = L.size || 14;
      ctx.font = (L.bold ? '700 ' : '600 ') + size + 'px ' +
        (L.mono ? 'ui-monospace, Menlo, Consolas, monospace'
                : 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
      ctx.textAlign = 'center';

      var w = ctx.measureText(L.text).width;
      var subW = L.sub ? ctx.measureText(L.sub).width * 0.82 : 0;
      var bw = Math.max(w, subW) + 18;
      var bh = L.sub ? size + 20 : size + 12;

      ctx.fillStyle = 'rgba(22,20,17,0.82)';
      roundRect(ax - bw / 2, ay - bh / 2, bw, bh, 4);
      ctx.fill();
      ctx.strokeStyle = L.tint ? Iso.rgba(L.tint, 0.65) : 'rgba(224,160,44,0.4)';
      ctx.lineWidth = 1;
      roundRect(ax - bw / 2, ay - bh / 2, bw, bh, 4);
      ctx.stroke();
      /* the little stem down to the thing being named */
      ctx.strokeStyle = 'rgba(224,160,44,0.35)';
      ctx.beginPath();
      ctx.moveTo(ax, ay + bh / 2);
      ctx.lineTo(ax, ay + bh / 2 + (L.lift || 12) * 0.6);
      ctx.stroke();

      ctx.fillStyle = L.color || '#e8e2d6';
      ctx.fillText(L.text, ax, ay - (L.sub ? size * 0.42 : 0));
      if (L.sub) {
        ctx.font = '500 ' + (size * 0.78) + 'px system-ui, -apple-system, "Segoe UI", sans-serif';
        ctx.fillStyle = 'rgba(200,194,180,0.75)';
        ctx.fillText(L.sub, ax, ay + size * 0.58);
      }
    }
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
    rack: drawRack, crane: drawCrane, silo: drawSilo, printer: drawPrinter,
    cnc: drawCnc, chipbin: drawChipbin, mill: drawMill, plating: drawPlating,
    furnace: drawFurnace, hip: drawHip, chimney: drawChimney,
    spinformer: drawSpinformer, welder: drawWelder, assembler: drawAssembler,
    bench: drawBench, balancer: drawBalancer, gasbottle: drawGasbottle,
    cleanroom: drawCleanroom, stand: drawStand, torquebay: drawTorquebay,
    xray: drawXray, teststand: drawTeststand, watertank: drawWatertank,
    gantry: drawGantry, console: drawConsole, tank: drawTank,
    proptank: drawProptank, padmount: drawPadmount, strongback: drawStrongback,
    mast: drawMast, blockhouse: drawBlockhouse
  };

  var PROP_KIND = {
    pole: drawPole, piperun: drawPiperun, lamp: drawLamp,
    pallet: drawPallet, scrub: drawScrub, rock: drawRock
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

    ctx.setTransform(cam.scale * cam.dpr, 0, 0, cam.scale * cam.dpr,
                     cam.ox * cam.dpr, cam.oy * cam.dpr);

    /* Once the vehicle is well clear of the ground there is nothing on the
       floor worth the fill rate, and skipping it keeps the ascent smooth. */
    var inSpace = Sim.state.launch.space > 0.985 && Sim.state.launch.zVis > 90;

    if (!inSpace) {
      drawGround();
      drawZones(activeStation);
      drawApproach();
      drawBelt(F.routes.main, 0, F.roadFrom, { width: 2.4, speed: 1.6 });
      drawRoad(F.routes.main, F.roadFrom);
      drawFeeders();

      /* ---- one sorted pass over everything with a footprint ---- */
      var items = [];
      var i;

      for (i = 0; i < F.machines.length; i++) {
        var m = F.machines[i];
        if (m.kind && KIND[m.kind]) items.push({ k: m.x + m.y, f: KIND[m.kind], a: m });
        else items.push({ k: key(m), f: null, a: m, box: true });
      }
      for (i = 0; i < F.props.length; i++) {
        var pr = F.props[i];
        var kf = PROP_KIND[pr.kind];
        if (!kf) continue;
        var pk = pr.kind === 'piperun' ? (pr.x0 + pr.y0 + pr.x1 + pr.y1) / 2 : pr.x + pr.y;
        items.push({ k: pk, f: kf, a: pr });
      }
      var vs = trucks();
      for (i = 0; i < vs.length; i++) items.push({ k: vs[i].x + vs[i].y, f: drawTruck, a: vs[i] });

      var pos = Sim.carrierPosition();
      items.push({ k: pos.x + pos.y + 0.3, f: drawCarrier, a: pos });
      items.push({ k: PAD.x + PAD.y + 0.2, f: drawRocket, a: null });

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
        } else {
          it.f(it.a);
        }
      }

      /* feeder furniture sits above the machines it serves, so it is one late
         group rather than sorted into the pass */
      drawFeederItems();
      drawFeederEnds();
      drawPadCloud();
    } else {
      drawRocket();
    }

    /* Station name plates. Zoomed far out (which is where a phone starts),
       every plate at once is an unreadable pile, so show only the live one. */
    if (showLabels && !inSpace) {
      var s = Sim.state;
      var declutter = cam.scale < 0.36;
      for (var k = 0; k < F.stations.length; k++) {
        var st = F.stations[k];
        var isActive = st.id === activeStation || st.id === hoverStation;
        if (declutter && !isActive) continue;
        var sub = isActive ? st.tag : null;
        if (st.id === 'integrate' && s.runCount) sub = s.runCount + ' engine' + (s.runCount === 1 ? '' : 's') + ' fitted';
        else if (st.id === 'assy' && s.parts) sub = Spec.group(s.parts) + ' parts fitted';
        var anchor = plateAnchor(st);
        labels.push({
          x: anchor.x, y: anchor.y, z: anchor.z, lift: isActive ? 18 : 13,
          text: st.name, sub: sub,
          color: isActive ? '#f2e6cc' : '#c9c2b2',
          tint: st.color,
          size: isActive ? 16 : 13.5, bold: isActive
        });
      }
    }

    drawLabels();
    drawLaunchOverlay(w, h);
  }

  /* Where a station's name plate hangs. A station's *centre* is on the belt,
     but its machinery is set back off the line, so anchoring on the centre
     leaves the plate floating over empty conveyor. These sit over the actual
     machine; drawLabels() then lifts each one a fixed number of screen pixels
     so the gap looks the same at every zoom. */
  var PLATE = {
    stock:     [5.0,  6.0,  3.6],
    print:     [15.0, 9.6,  2.4],
    machine:   [24.6, 9.6,  2.8],
    channel:   [34.0, 9.6,  2.6],
    braze:     [44.0, 10.2, 2.6],
    nozzle:    [45.0, 20.6, 2.8],
    inject:    [36.0, 20.6, 2.0],
    pump:      [27.0, 20.6, 2.0],
    valve:     [18.0, 20.6, 2.0],
    avionics:  [9.0,  21.0, 2.6],
    assy:      [13.0, 33.0, 3.6],
    ndt:       [23.0, 32.4, 2.4],
    hotfire:   [33.0, 33.0, 4.4],
    integrate: [43.0, 31.8, 5.6],
    launch:    [PAD.x, PAD.y, 2.0]
  };

  function plateAnchor(s) {
    var p = PLATE[s.id];
    return p ? { x: p[0], y: p[1], z: p[2] } : { x: s.x, y: s.y, z: 3.4 };
  }

  /* The countdown, and the flight readout during ascent. Screen space, large,
     centred — this is the one moment the page stops being a diagram. */
  function drawLaunchOverlay(w, h) {
    var L = Sim.state.launch;
    if (!L.active) return;
    ctx.setTransform(cam.dpr, 0, 0, cam.dpr, 0, 0);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (L.step === 'arm' || L.step === 'ignite') {
      var n = L.step === 'ignite' ? 0 : L.countdown;
      var pulse = 1 - ((L.t * 1) % 1);
      ctx.font = '700 ' + (54 + pulse * 10) + 'px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(224,160,44,' + (0.35 + 0.5 * pulse).toFixed(2) + ')';
      ctx.fillText('T−' + n, w / 2, h * 0.24);
      ctx.font = '600 13px system-ui, -apple-system, "Segoe UI", sans-serif';
      ctx.fillStyle = 'rgba(226,216,196,0.6)';
      ctx.fillText(L.gantry > 0.05 ? 'STRONGBACK RETRACTING' : 'ENGINE CHILL COMPLETE · READY FOR IGNITION',
                   w / 2, h * 0.24 + 46);
    }

    if (L.step === 'liftoff' || L.step === 'space') {
      var c = Sim.sheet(L.alt / 1000);
      ctx.font = '700 34px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(240,232,214,0.9)';
      ctx.fillText('T+' + Math.round(L.flightT) + 's', w / 2, h * 0.14);
      ctx.font = '600 15px ui-monospace, Menlo, Consolas, monospace';
      ctx.fillStyle = 'rgba(224,160,44,0.9)';
      ctx.fillText(
        (L.alt / 1000).toFixed(1) + ' km   ·   ' + Spec.group(L.vel) + ' m/s   ·   ' +
        Spec.group(c.thrustKN * Spec.ENG.engineCount) + ' kN',
        w / 2, h * 0.14 + 32);
      if (L.maxQ && L.alt < 20000) {
        ctx.fillStyle = 'rgba(226,101,58,0.85)';
        ctx.fillText('MAX Q', w / 2, h * 0.14 + 56);
      }
    }
  }

  global.Renderer = {
    draw: draw,
    setLabels: function (v) { showLabels = v; },
    getLabels: function () { return showLabels; }
  };
})(window);
