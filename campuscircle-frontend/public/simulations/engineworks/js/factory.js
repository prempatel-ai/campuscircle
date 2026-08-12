/* factory.js: belts, stations, machines and props for the static world. */
(function (global) {
  'use strict';

  var Iso = global.Iso;

  /* The poured slab the plant stands on. Everything is laid out in metres. */
  var GW = 54, GH = 42;

  /* ---- belts -------------------------------------------------------------- */

  function makeRoute(raw) {
    var pts = raw.map(function (p) { return { x: p[0], y: p[1], z: p[2] || 0 }; });
    var segs = [], total = 0, cum = [0];
    for (var i = 0; i < pts.length - 1; i++) {
      var a = pts[i], b = pts[i + 1];
      var len = Math.hypot(b.x - a.x, b.y - a.y) || 0.001;
      segs.push({ a: a, b: b, len: len, cum: total });
      total += len;
      cum.push(total);
    }
    return {
      pts: pts, segs: segs, total: total, cum: cum,
      at: function (d) {
        if (d <= 0) {
          var s0 = segs[0];
          return { x: s0.a.x, y: s0.a.y, z: s0.a.z, dx: (s0.b.x - s0.a.x) / s0.len, dy: (s0.b.y - s0.a.y) / s0.len };
        }
        if (d >= total) {
          var sn = segs[segs.length - 1];
          return { x: sn.b.x, y: sn.b.y, z: sn.b.z, dx: (sn.b.x - sn.a.x) / sn.len, dy: (sn.b.y - sn.a.y) / sn.len };
        }
        for (var i = 0; i < segs.length; i++) {
          var s = segs[i];
          if (d <= s.cum + s.len) {
            var t = (d - s.cum) / s.len;
            return {
              x: s.a.x + (s.b.x - s.a.x) * t,
              y: s.a.y + (s.b.y - s.a.y) * t,
              z: s.a.z + (s.b.z - s.a.z) * t,
              dx: (s.b.x - s.a.x) / s.len,
              dy: (s.b.y - s.a.y) / s.len
            };
          }
        }
      }
    };
  }

  /* The main line runs three passes across the floor: the hot end along the
     top, the parts shops down the middle, and build-and-test along the bottom.
     Indices marked below are station anchors. */
  var MAIN = makeRoute([
    [-3, 6],        // 0  goods-in, just off the pad. The stock arrives from
                    //    outside, but the default view starts close on the
                    //    carrier, so a long run-in would open on empty grass
    [5, 6],         // 1  raw stock bay
    [14, 6],        // 2  casting bay
    [23, 6],        // 3  heat treatment
    [33, 6],        // 4  machining hall
    [43, 6],        // 5  coatings
    [50, 6],        // 6  corner
    [50, 17],       // 7  corner
    [45, 17],       // 8  metrology
    [36, 17],       // 9  rotating assembly
    [26, 17],       // 10 heads and valvetrain
    [16, 17],       // 11 turbo shop
    [8, 17],        // 12 hybrid cell
    [4, 17],        // 13 corner
    [4, 28],        // 14 corner
    [14, 28],       // 15 clean assembly
    [26, 28],       // 16 dyno cell
    [36, 28],       // 17 homologation and seal
    [46, 28],       // 18 trackside fit
    [53, 28],       // 19 out of the building
    [53, 44.5],     // 20 down the east end, off the pad
    [49, 44.5]      // 21 the fire-up bay, at the head of the straight
  ]);

  /* Race engines come home. The return line is elevated so it can cross the
     shop without cutting it in half — the same trick a real plant plays with
     an overhead conveyor. It starts just inboard of the fire-up bay: far
     enough clear that its ramp does not paint over the parked carrier. */
  var RETURN = makeRoute([
    [48.4, 43.0, 0],
    [46.2, 39.6, 1.7],
    [26, 38, 3.4],
    [6, 38, 3.4],
    [1, 34, 3.4],
    [1, 20, 3.4],   // 5 strip and inspect
    [1, 10, 3.4],
    [-1.6, 7.6, 1.9],
    [-4.4, 6.4, 0.4],
    [-4.4, 6, 0.05],
    [-3, 6, 0]      /* lands exactly on the main line's first waypoint, so the
                       next unit starts where this one finished rather than
                       teleporting across the floor */
  ]);

  /* ---- the launch straight ----------------------------------------------- */

  /* The one thing on the site that is not a conveyor. The main line runs off
     the pad at its east end into a fire-up bay; the car built around the unit
     leaves from there and accelerates down a strip of asphalt laid along the
     boundary, past the whole length of the plant that made it.
     One grid unit is a metre here as everywhere else, so the run really is the
     55-odd metres it looks like. */
  var TRACK = {
    y: 44.5,
    x0: 52.0,               // head of the straight, beside the bay
    x1: -20.0,              // it carries on well past where the car fades out
    width: 3.6,
    bayX: 44.0,             // the car stands here while the engine goes in
    parkX: 49.0,            // and the carrier stops here, MAIN's last waypoint
    hoist: { x0: 41.4, x1: 49.9, mastY: 42.6, beamZ: 3.8 },
    fadeFrom: 2.0,          // the car is too far away to make out from here
    fadeTo: -6.0,
    /* seconds at 1x, in order: engine in, fire-up, run, camera back */
    mount: 5.0, fire: 2.6, launchMax: 8.0, settle: 2.0
  };

  /* Long enough for all four to play out before the carrier is allowed to go. */
  var LAUNCH_HOLD = TRACK.mount + TRACK.fire + 3.9 + TRACK.settle;

  /* `dwell` is how long the carrier waits once you have already read this
     station's write-up. The much longer first-visit stop is derived from the
     length of that write-up; see readSeconds() below. `hold` is a floor under
     both: the fire-up bay has a sequence to play out, and the carrier must not
     leave in the middle of it however short the stop would otherwise be. */
  function station(route, idx, id, dwell, hold) {
    return { dist: route.cum[idx], id: id, dwell: dwell == null ? 0.8 : dwell, hold: hold || 0 };
  }

  var STOPS = {
    main: [
      station(MAIN, 1, 'alloy', 1.4),
      station(MAIN, 2, 'cast', 2.4),
      station(MAIN, 3, 'heat', 1.6),
      station(MAIN, 4, 'machine', 2.6),
      station(MAIN, 5, 'coat', 1.6),
      station(MAIN, 8, 'metro', 1.8),
      station(MAIN, 9, 'crank', 2.4),
      station(MAIN, 10, 'valve', 2.4),
      station(MAIN, 11, 'turbo', 2.2),
      station(MAIN, 12, 'hybrid', 2.6),
      station(MAIN, 15, 'assy', 2.4),
      station(MAIN, 16, 'dyno', 3.0),
      station(MAIN, 17, 'seal', 1.6),
      station(MAIN, 18, 'fit', 2.2),
      station(MAIN, 21, 'track', 3.0, LAUNCH_HOLD)
    ],
    ret: [
      station(RETURN, 5, 'rebuild', 1.6)
    ]
  };

  /* ---- palette ----------------------------------------------------------- */

  /* A printed-diagram palette: muted, low-chroma hues that stay legible on a
     pale floor and read as ink rather than light. */
  var C = {
    steel:    '#4a7a9b',
    racing:   '#b3382f',
    ochre:    '#c2913c',
    graphite: '#6b7078',
    rose:     '#b05470',
    sage:     '#6d9068',
    teal:     '#3f8a86',
    orange:   '#c07a3c',
    brick:    '#a85a44',
    moss:     '#5f8a52',
    plum:     '#8b5f96',
    ink:      '#4a4540',
    beltDark: '#4e5257',
    concrete: '#cfcabb',
    concrete2:'#c6c0b0'
  };

  /* ---- stations (clickable, narrated) ------------------------------------ */

  var STATIONS = [
    {
      id: 'alloy', name: 'Raw Stock Bay', x: 5, y: 6, r: 3.8, color: C.graphite,
      phase: 'goods in', tag: 'Bar, billet and ingot',
      short: 'Nothing here is bought as a part. It arrives as certified metal with a paper trail.',
      body: 'A power unit is made from a handful of materials chosen for what they do at temperature: aluminium–silicon casting alloy for the crankcase and heads, high-strength steel for the crankshaft, titanium for connecting rods and valves, nickel superalloys for the turbine and exhaust, copper for the motor windings. Every batch is traceable back to the melt it came from, because one inclusion in the wrong place ends a race weekend rather than a component.'
    },
    {
      id: 'cast', name: 'Casting Bay', x: 14, y: 6, r: 4.4, color: C.orange,
      phase: 'foundry', tag: 'Molten alloy → crankcase',
      short: 'The crankcase and heads are cast in aluminium around sand cores that wash out afterwards.',
      body: 'The block is not carved from a solid lump: it is poured. Sand cores shaped like the water jackets, oil galleries and inlet ports are set into a mould, aluminium goes in around them, and once it has solidified the sand is broken out, leaving passages no cutter could ever reach. Walls come out only a few millimetres thick. Cylinder heads are cast the same way and are the harder job, because a head is mostly holes.'
    },
    {
      id: 'heat', name: 'Heat Treatment', x: 23, y: 6, r: 4.0, color: C.brick,
      phase: 'foundry', tag: 'Solution, quench, age',
      short: 'A fresh casting is soft and full of internal stress. Heat fixes both.',
      body: 'Castings are held near 500 °C to dissolve the alloying elements, quenched, then aged for hours at a lower temperature so those elements precipitate out as the particles that make the metal strong. Porosity trapped during pouring can be closed by hot isostatic pressing — heat plus a few thousand bar of argon. The parts come out harder, more uniform, and slightly the wrong shape, which is why they are cast oversize and machined afterwards.'
    },
    {
      id: 'machine', name: 'Machining Hall', x: 33, y: 6, r: 4.8, color: C.steel,
      phase: 'machining', tag: 'Five-axis, microns',
      short: 'Every surface that matters is cut, in a room held at 20 °C.',
      body: 'Castings are fixtured and cut on five-axis machining centres: bores, deck faces, cam tunnels, bearing saddles, thousands of oil and coolant drillings. Critical features are held to single-digit microns — a human hair is about 70. The shop is temperature-controlled because aluminium grows roughly 23 microns per metre per degree, so a warm afternoon is a manufacturing error. Big parts go round more than once, with a stress-relief bake in between, because cutting metal away lets what is left move.'
    },
    {
      id: 'coat', name: 'Coatings & Surfaces', x: 43, y: 6, r: 4.2, color: C.plum,
      phase: 'machining', tag: 'Friction and wear',
      short: 'The last few microns decide how long the engine lives.',
      body: 'Aluminium bores get a hard running surface sprayed or plated onto them, because aluminium on aluminium seizes. Cam followers, pins and gear teeth get diamond-like carbon, a coating a couple of microns thick and nearly as hard as diamond, which is what lets a valvetrain survive at 15,000 rpm. Crankshaft journals are nitrided; highly loaded parts are shot-peened to push a compressive stress into the surface so fatigue cracks have to fight their way out.'
    },
    {
      id: 'metro', name: 'Metrology', x: 45, y: 17, r: 4.0, console: true, color: C.teal,
      phase: 'machining', tag: 'Measure, then match',
      short: 'Nothing is "in spec" here. Everything is measured, recorded and paired.',
      body: 'Parts go onto coordinate measuring machines and, for anything with hidden internal geometry, into a CT scanner that finds porosity without cutting the part open. The numbers are not a pass/fail stamp: they are used to match parts into sets, so a piston is paired with the bore it actually fits and bearing shells are picked by grade to land a clearance measured in microns. Every part is serialised, and the measurements follow it for the rest of its life.'
    },
    {
      id: 'crank', name: 'Rotating Assembly', x: 36, y: 17, r: 4.6, color: C.racing,
      phase: 'sub-assembly', tag: 'Crank, rods, pistons',
      short: 'The parts that turn 250 times a second and stop dead twice per turn.',
      body: 'The crankshaft is machined from a single steel billet, gun-drilled for oil, nitrided and balanced. Connecting rods are titanium, pistons forged aluminium and then machined, each set weight-matched to a fraction of a gram so the engine does not shake itself apart. At the limiter each piston reverses direction 500 times a second and sees peak accelerations of thousands of g — the number on the build sheet is computed live from the stroke, the rod length and the engine speed you have dialled in.'
    },
    {
      id: 'valve', name: 'Heads & Valvetrain', x: 26, y: 17, r: 4.6, color: C.rose,
      phase: 'sub-assembly', tag: 'Pneumatic valve return',
      short: 'Four valves per cylinder, closed by compressed nitrogen instead of springs.',
      body: 'A steel spring cannot keep up at 15,000 rpm — it floats, and the valve stops following the cam. So the valves are closed by gas: a sealed chamber of nitrogen acts as a spring that cannot resonate, fed from a bottle on the car. Valves are titanium on the inlet side, cams run on diamond-coated finger followers, and fuel is injected straight into the cylinder at up to 500 bar. Twenty-four valves, two camshafts per bank, and the whole thing has to be gas-tight.'
    },
    {
      id: 'turbo', name: 'Turbo Shop', x: 16, y: 17, r: 4.2, color: C.ochre,
      phase: 'sub-assembly', tag: 'One turbine, one compressor',
      short: 'A wheel in exhaust gas at close to a thousand degrees, spinning past 100,000 rpm.',
      body: 'A single turbocharger is allowed. The turbine wheel lives in the exhaust stream and is cast in a nickel superalloy because aluminium would simply melt; the compressor on the other end of the shaft is aluminium or titanium. The assembly is balanced to a level you cannot see, since at those speeds a fraction of a gram out of true is a bearing failure. From 2026 there is no MGU-H recovering energy from this shaft, so response is managed with the wastegate and covered by the electric motor instead.'
    },
    {
      id: 'hybrid', name: 'Hybrid Cell', x: 8, y: 17, r: 4.4, color: C.moss,
      phase: 'sub-assembly', tag: 'MGU-K, inverter, energy store',
      short: 'Half the power of a 2026 car is built in this room, and none of it burns anything.',
      body: 'The MGU-K is an electrical machine geared to the crankshaft: it drags on the crank under braking to recover energy, and pushes on it down the straight to deploy it, up to 350 kW under the 2026 rules. Behind it sit the energy store — lithium cells, monitoring and cooling, built up and sealed as one unit — and the control electronics that switch hundreds of amps at high voltage. It is assembled clean and static-controlled, closer to electronics manufacturing than to an engine shop.'
    },
    {
      id: 'assy', name: 'Clean Assembly', x: 14, y: 28, r: 4.8, color: C.sage,
      phase: 'build', tag: 'Torque, clearance, cleanliness',
      short: 'The engine goes together in a white room, on a stand, in a fixed order.',
      body: 'Assembly is where the measurements from metrology are cashed in: shells are selected by grade, clearances checked as the build goes up, and fasteners torqued and then turned through a specified angle so the bolt is stretched to a known load rather than merely tightened. Everything is done clean — a single chip of swarf in an oil gallery is a destroyed engine. The completed unit is pressure- and leak-tested before it ever sees fuel.'
    },
    {
      id: 'dyno', name: 'Dyno Cell', x: 26, y: 28, r: 5.0, color: C.racing,
      phase: 'test', tag: 'The first fire',
      short: 'The engine is run, mapped and made to complete a race before anyone puts it in a car.',
      body: 'A new unit is motored cold, fired, then run in and taken through its map: every combination of engine speed, load, boost and hybrid deployment, logged. Endurance runs replay whole races, gearshifts and lift-and-coast included, with the software and hardware the car will actually use. Teams also run single-cylinder rigs for combustion research and transient rigs that drive the whole power unit through a lap. The dyno is where the design either survives or gets a revision.'
    },
    {
      id: 'seal', name: 'Homologation & Seal', x: 36, y: 28, r: 4.0, color: C.graphite,
      phase: 'test', tag: 'Serialised and sealed',
      short: 'The design is frozen, the hardware is numbered, and the count starts.',
      body: 'Power unit designs are homologated: submitted, approved and then locked, so a manufacturer cannot simply keep introducing new engines through the year. Individual elements — internal combustion engine, turbocharger, MGU-K, energy store, control electronics — are serialised and tracked, and each driver may use only a limited number of each across a season. Go past the allocation and the penalty is applied on the grid, which is why engine life is a strategic problem as much as an engineering one.'
    },
    {
      id: 'fit', name: 'Trackside Fit', x: 46, y: 28, r: 4.4, color: C.steel,
      phase: 'build', tag: 'A stressed member',
      short: 'The power unit is not carried by the car. It is part of it.',
      body: 'The engine bolts directly to the back of the survival cell and the gearbox bolts to the back of the engine, so the block carries suspension and aerodynamic loads on the way past — the mounting faces are structural, not brackets. Around it go radiators, intercooler, exhaust, harness and fuel system, all of it packaged inside bodywork whose shape is being fought over by the aerodynamicists. Installation is a design constraint from the first sketch, not the last job.'
    },
    {
      id: 'track', name: 'Fire-Up & Launch', x: 46.5, y: 44.5, r: 5.0, color: C.racing,
      phase: 'fire-up', tag: 'Engine in, car away',
      short: 'The last thing the line does is drop the unit into a car and let it go.',
      body: 'A power unit is not the product. A car that finishes a race is. The unit is craned off the belt and lowered into the back of the chassis, where it bolts up as a structural member with the gearbox hung off the back of it. Then it is fired: oil and water pressure first, the crank turned over on an external starter, and the whole thing brought up to temperature before it is asked for anything. The launch is a fair lesson in what all that power is and is not for. Off the line the car is held back by what the rear tyres can take, not by what the engine can make — around 1.1 g, whatever you have dialled in. Deployment only starts to tell once it is already moving, which is why the 0–200 km/h figure on the build sheet barely notices the MGU-K and the top speed depends on it entirely. The pallet leaves the bay empty; what climbs onto the overhead line behind the car is the same unit a race weekend later, on its way to be stripped.'
    },
    {
      id: 'rebuild', name: 'Strip & Rebuild', x: 1, y: 20, r: 3.6, color: C.brick,
      phase: 'service', tag: 'The line runs both ways',
      short: 'Used units come home, get taken apart, and go round again.',
      body: 'A race engine is not delivered and forgotten. It comes back, is stripped, and every part is inspected and measured against the numbers taken when it was new. Parts have a life expressed in kilometres or in cycles; some are scrapped, some go back in, and the unit is rebuilt for the next event. Oil is analysed for the metals suspended in it, which reveals what is wearing before it fails. The return belt overhead is not scenery — it is most of what an engine shop actually does.'
    }
  ];

  var STATION_BY_ID = {};
  STATIONS.forEach(function (s) { STATION_BY_ID[s.id] = s; });

  var ORDER = ['alloy', 'cast', 'heat', 'machine', 'coat', 'metro', 'crank', 'valve',
               'turbo', 'hybrid', 'assy', 'dyno', 'seal', 'fit', 'track', 'rebuild'];

  /* How long to hold the carrier the first time it reaches a station, so the
     panel copy can actually be read. ~230 words per minute, plus a beat to take
     in the machine before starting and a beat after finishing. */
  function readSeconds(id) {
    var s = STATION_BY_ID[id];
    if (!s) return 9;
    var words = (s.short + ' ' + s.body).split(/\s+/).length;
    return Math.min(26, Math.max(9, words / 3.8 + 3.5));
  }

  Object.keys(STOPS).forEach(function (route) {
    STOPS[route].forEach(function (st) { st.read = readSeconds(st.id); });
  });

  /* ---- geometry helpers -------------------------------------------------- */

  var ALL_ROUTES = [MAIN, RETURN];

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToRoutes(x, y) {
    var best = 1e9;
    for (var r = 0; r < ALL_ROUTES.length; r++) {
      var segs = ALL_ROUTES[r].segs;
      for (var i = 0; i < segs.length; i++) {
        var s = segs[i];
        var d = distToSegment(x, y, s.a.x, s.a.y, s.b.x, s.b.y);
        if (d < best) best = d;
      }
    }
    return best;
  }

  function distToStations(x, y) {
    var best = 1e9;
    for (var i = 0; i < STATIONS.length; i++) {
      var s = STATIONS[i];
      var v = Math.hypot(x - s.x, y - s.y) - s.r;
      if (v < best) best = v;
    }
    return best;
  }

  /* ---- feeder belts ------------------------------------------------------ */

  /* Short spurs that trickle components into a machine from a supply rack.
     Nothing rides the main line except the unit being built; everything else
     arrives sideways, which is what makes a factory look busy. */
  var FEEDERS = [
    { x: 12.4, y0: 1.4, y1: 4.5, into: 'cast',    item: 'ingot',  color: '#9fb0bb', label: 'Al ingot' },
    { x: 15.8, y0: 1.4, y1: 4.5, into: 'cast',    item: 'core',   color: '#cbb88a', label: 'sand core' },
    { x: 33.0, y0: 1.4, y1: 4.5, into: 'machine', item: 'tool',   color: '#8f959c', label: 'tooling' },
    { x: 43.0, y0: 1.4, y1: 4.5, into: 'coat',    item: 'drum',   color: '#9a86ae', label: 'coating stock' },
    { x: 36.0, y0: 12.2, y1: 15.5, into: 'crank', item: 'billet', color: '#8b939b', label: 'steel billet' },
    { x: 26.0, y0: 12.2, y1: 15.5, into: 'valve', item: 'valve',  color: '#a58cb4', label: 'Ti valves' },
    { x: 16.0, y0: 12.2, y1: 15.5, into: 'turbo', item: 'wheel',  color: '#c8a75e', label: 'superalloy' },
    { x: 6.6,  y0: 12.2, y1: 15.5, into: 'hybrid', item: 'coil',  color: '#bb8163', label: 'copper coil' },
    { x: 9.6,  y0: 12.2, y1: 15.5, into: 'hybrid', item: 'cell',  color: '#7fa36f', label: 'cells' },
    { x: 14.0, y0: 23.4, y1: 26.5, into: 'assy',   item: 'bolt',  color: '#8f959c', label: 'fasteners' },
    { x: 46.0, y0: 23.4, y1: 26.5, into: 'fit',    item: 'panel', color: '#5d5a54', label: 'composites' }
  ];

  var feeders = FEEDERS.map(function (f) {
    return {
      x: f.x, y0: f.y0, y1: f.y1, into: f.into,
      item: f.item, color: f.color, label: f.label,
      len: f.y1 - f.y0
    };
  });

  /* ---- machines ---------------------------------------------------------- */

  var machines = [];
  function put(o) { machines.push(o); return o; }

  function shed(cx, cy, opts) {
    put({
      x: cx - opts.w / 2, y: cy - opts.d / 2, z: opts.z || 0,
      w: opts.w, d: opts.d, h: opts.h,
      color: opts.color, kind: opts.kind || 'box',
      roof: opts.roof, roofH: opts.roofH || 0.5,
      panels: opts.panels !== false
        ? { cols: opts.cols || 4, rows: opts.rows || Math.max(2, Math.round(opts.h * 1.1)),
            seed: (cx * 31 + cy * 17) | 0, color: opts.glass || '#8fa4b0', band: opts.band }
        : null,
      tag: opts.tag
    });
  }

  function buildMachines() {
    /* --- raw stock bay --- */
    put({ kind: 'rack', x: 3.2, y: 2.6, color: C.graphite, rot: 0 });
    put({ kind: 'rack', x: 6.8, y: 2.6, color: C.graphite, rot: 0 });
    put({ kind: 'rack', x: 3.2, y: 9.4, color: C.graphite, rot: 0 });
    put({ kind: 'crane', x: 5, y: 6, color: C.steel });
    shed(8.4, 9.8, { w: 2.4, d: 2.0, h: 1.8, color: '#c8c2b2', roof: '#8b8578' });

    /* --- casting bay --- */
    put({ kind: 'furnace', x: 14, y: 9.4, color: C.orange });
    put({ kind: 'ladle', x: 11.2, y: 9.2, color: C.brick });
    shed(11.0, 3.0, { w: 2.6, d: 2.2, h: 2.4, color: '#d3ccbb', roof: '#9a6b4f', cols: 3 });
    shed(17.4, 3.0, { w: 2.4, d: 2.2, h: 2.0, color: '#d3ccbb', roof: '#9a6b4f', cols: 3 });
    put({ kind: 'sandbin', x: 17.8, y: 9.4, color: '#c5ae7c' });

    /* --- heat treatment --- */
    /* The oven is the widest thing on this row, so it is set back further:
       in this projection a machine hides the belt when half its footprint
       (w + d) / 2 exceeds its distance from the line. */
    put({ kind: 'oven', x: 23, y: 9.8, color: C.brick });
    put({ kind: 'quench', x: 26.6, y: 9.4, color: C.teal });
    shed(20.2, 2.9, { w: 2.4, d: 2.0, h: 1.8, color: '#cec7b6', roof: '#8b8578' });

    /* --- machining hall --- */
    put({ kind: 'cnc', x: 30.6, y: 9.4, color: C.steel });
    put({ kind: 'cnc', x: 33.8, y: 9.4, color: C.steel });
    put({ kind: 'cnc', x: 37.0, y: 9.4, color: C.steel });
    put({ kind: 'chipbin', x: 27.8, y: 9.6, color: C.graphite });
    shed(30.0, 2.9, { w: 3.0, d: 2.2, h: 2.6, color: '#c9cdd2', roof: '#6f757c', cols: 4, band: 1 });
    shed(36.4, 2.9, { w: 2.6, d: 2.2, h: 2.2, color: '#c9cdd2', roof: '#6f757c', cols: 3 });

    /* --- coatings --- */
    put({ kind: 'chamber', x: 43, y: 9.2, color: C.plum });
    put({ kind: 'chamber', x: 46.0, y: 9.2, color: C.plum });
    put({ kind: 'tank', x: 40.2, y: 9.4, color: '#9aa6ae' });
    shed(46.6, 3.0, { w: 2.4, d: 2.2, h: 2.0, color: '#cdc6d3', roof: '#7b6d84' });

    /* --- metrology --- */
    put({ kind: 'cmm', x: 45, y: 20.2, color: C.teal });
    shed(48.0, 20.6, { w: 2.6, d: 2.4, h: 2.2, color: '#cdd6d4', roof: '#6d817e', cols: 3, band: 1 });
    put({ kind: 'console', x: 42.2, y: 20.0, color: C.teal });

    /* --- rotating assembly --- */
    put({ kind: 'assembler', x: 36, y: 20.4, color: C.racing, station: 'crank' });
    put({ kind: 'bench', x: 33.0, y: 20.4, color: C.racing });
    put({ kind: 'rack', x: 38.9, y: 13.0, color: C.graphite });

    /* --- heads and valvetrain --- */
    put({ kind: 'assembler', x: 26, y: 20.4, color: C.rose, station: 'valve' });
    put({ kind: 'bench', x: 23.0, y: 20.4, color: C.rose });
    put({ kind: 'gasbottle', x: 28.9, y: 20.4, color: '#9fb2bd' });

    /* --- turbo shop --- */
    put({ kind: 'balancer', x: 16, y: 20.4, color: C.ochre });
    put({ kind: 'bench', x: 13.0, y: 20.4, color: C.ochre });
    put({ kind: 'tank', x: 19.0, y: 20.6, color: '#a8a08e' });

    /* --- hybrid cell --- */
    put({ kind: 'cleanroom', x: 8, y: 20.9, color: C.moss });
    put({ kind: 'winder', x: 4.6, y: 20.4, color: C.brick });

    /* --- clean assembly --- */
    /* The two big halls are the only structures on the floor tall and wide
       enough to reach back over the line, so they stand well clear of it. */
    shed(14, 33.2, { w: 6.4, d: 3.2, h: 2.8, color: '#dfe3dc', roof: '#8a9486', roofH: 0.45, cols: 5, band: 1, glass: '#a9c2b6' });
    put({ kind: 'stand', x: 10.2, y: 25.2, color: C.sage });
    put({ kind: 'torquebay', x: 17.8, y: 25.2, color: C.sage });

    /* --- dyno --- */
    put({ kind: 'dyno', x: 26, y: 33.4, color: C.racing });
    put({ kind: 'fan', x: 21.0, y: 32.6, color: C.graphite });
    put({ kind: 'console', x: 30.8, y: 32.4, color: C.racing });

    /* --- seal --- */
    put({ kind: 'gatePost', x: 36, y: 26.3, color: C.graphite });
    put({ kind: 'gateBeam', x: 36, y: 28, color: C.graphite });
    put({ kind: 'gatePost', x: 36, y: 29.7, color: C.graphite });
    shed(39.6, 32.0, { w: 2.6, d: 2.2, h: 2.0, color: '#cfcabb', roof: '#77716a' });

    /* --- trackside fit --- */
    put({ kind: 'dock', x: 49.8, y: 32.4, color: C.steel });
    put({ kind: 'chassisjig', x: 46, y: 31.4, color: C.steel });

    /* --- fire-up bay, off the pad at the head of the straight --- */
    /* The hoist sorts a hair behind the car deliberately: while the unit is on
       the hook it has to paint over an open engine bay, not disappear into it. */
    put({ kind: 'hoist', x: (TRACK.hoist.x0 + TRACK.hoist.x1) / 2, y: TRACK.hoist.mastY,
          sortKey: TRACK.bayX + TRACK.y + 0.02, color: C.steel });
    put({ kind: 'startlights', x: TRACK.hoist.x1 - 2.6, y: TRACK.hoist.mastY - 0.3, color: C.racing });
    put({ kind: 'startercart', x: 50.9, y: 42.4, color: C.graphite });

    /* --- strip and rebuild, up on the return line --- */
    put({ kind: 'stripbench', x: 1, y: 20, z: 3.4, color: C.brick });

    /* --- services and yard: tanks, stores, the odd shed --- */
    put({ kind: 'tank', x: 51.4, y: 11.4, color: '#a4aeb4' });
    put({ kind: 'tank', x: 53.0, y: 11.4, color: '#a4aeb4' });
    put({ kind: 'tank', x: 51.4, y: 23.0, color: '#b0a894' });
    put({ kind: 'tank', x: 6.6, y: 35.6, color: '#a8b0a4' });
    put({ kind: 'tank', x: 8.2, y: 35.6, color: '#a8b0a4' });
    shed(20.0, 36.4, { w: 3.0, d: 2.2, h: 1.8, color: '#cfcabb', roof: '#77716a', cols: 3 });
    shed(33.6, 36.2, { w: 2.6, d: 2.2, h: 1.6, color: '#c9d0cd', roof: '#6f757c' });
    put({ kind: 'rack', x: 30.2, y: 30.6, color: C.graphite });
    put({ kind: 'rack', x: 42.0, y: 36.0, color: C.graphite });
    put({ kind: 'chipbin', x: 11.0, y: 30.2, color: C.graphite });
  }

  /* ---- props ------------------------------------------------------------- */

  var props = [];

  function buildProps() {
    /* power poles along the main line, alternating sides, with wire strung
       between consecutive poles in render.js */
    var step = 8.5, prev = null;
    for (var d = 3; d < MAIN.total; d += step) {
      var p = MAIN.at(d);
      /* nothing on the tail out to the fire-up bay: a pole there would stand
         between the camera and the one thing it is meant to be watching */
      if (p.x < -1 || p.x > 52 || p.y > 34) continue;
      var nx = -p.dy, ny = p.dx;
      var pole = { kind: 'pole', x: p.x + nx * 2.4, y: p.y + ny * 2.4, z: 0, prev: prev };
      props.push(pole);
      prev = pole;
    }

    /* pipe runs between the aisles */
    props.push({ kind: 'piperun', x0: 8, y0: 11.9, x1: 48, y1: 11.9, z: 0.55 });
    props.push({ kind: 'piperun', x0: 8, y0: 23.0, x1: 44, y1: 23.0, z: 0.55 });

    /* floor lamps */
    [[10, 12.2], [30, 12.2], [44, 12.2], [10, 23.4], [30, 23.4], [42, 23.4]].forEach(function (p) {
      props.push({ kind: 'lamp', x: p[0], y: p[1], z: 0 });
    });

    /* pallets and crates in the leftover floor */
    var spots = [
      [8.8, 3.2], [19.6, 12.4], [29.4, 3.4], [40.4, 3.2], [48.6, 8.2],
      [41.0, 13.4], [31.2, 13.6], [21.2, 13.4], [11.8, 13.6],
      [19.6, 20.6], [32.0, 24.6], [41.4, 25.2], [7.0, 30.4], [33.4, 30.6],
      [43.6, 35.4], [9.0, 29.2], [52.0, 26.4]
    ];
    spots.forEach(function (p, i) {
      props.push({ kind: 'pallet', x: p[0], y: p[1], z: 0, seed: i });
    });

    /* greenery outside the fence, so the pad reads as a building on a site.
       The launch straight runs outside the fence too, so its corridor is
       cleared the same way the pad is. */
    for (var x = -6; x < 60; x += 2.2) {
      for (var y = -6; y < 48; y += 2.2) {
        var inside = x > -1.5 && x < GW + 1.5 && y > -1.5 && y < GH + 1.5;
        if (inside) continue;
        if (y > TRACK.y - 4.0 && x < TRACK.x0 + 3) continue;
        var n = Iso.hash2(x * 7, y * 11, 23);
        if (n > 0.3) continue;
        props.push({ kind: 'tree', x: x + n, y: y + n * 0.6, z: 0, s: 0.7 + n });
      }
    }
  }

  /* ---- build ------------------------------------------------------------- */

  var built = false;
  function build() {
    if (built) return;
    built = true;
    buildMachines();
    buildProps();
    machines.sort(function (a, b) {
      return (a.x + a.y + (a.w || 0) * 0.5 + (a.d || 0) * 0.5) - (b.x + b.y + (b.w || 0) * 0.5 + (b.d || 0) * 0.5);
    });
  }

  global.Factory = {
    GW: GW, GH: GH,
    routes: { main: MAIN, ret: RETURN },
    track: TRACK,
    stops: STOPS,
    stations: STATIONS,
    stationById: STATION_BY_ID,
    order: ORDER,
    feeders: feeders,
    machines: machines,
    props: props,
    palette: C,
    distToRoutes: distToRoutes,
    distToStations: distToStations,
    build: build
  };
})(window);
