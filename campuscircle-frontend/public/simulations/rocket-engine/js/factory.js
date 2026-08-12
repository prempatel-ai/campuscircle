/* factory.js: belts, stations, machines, props, and the pad at the end of it.

   The plant is three runs across a concrete slab — the hot end along the top,
   the parts shops down the middle, build-and-test along the bottom — and then
   a transporter road out of the south-east corner to Launch Complex 1. */
(function (global) {
  'use strict';

  var Iso = global.Iso;

  /* The poured slab the plant stands on, in metres. */
  var GW = 54, GH = 34;

  /* Launch Complex 1, out on its own pad south of the plant. */
  var PAD = {
    x: 27, y: 47,
    r: 11,               // the cleared circle
    mountR: 3.4,         // launch mount ring
    deckZ: 1.6           // top of the launch mount, where the rocket sits
  };

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

  /* The main line. Indices marked below are station anchors; the last three
     waypoints are the transporter road out to the pad, which is a road rather
     than a belt and is drawn differently. */
  var MAIN = makeRoute([
    [-4, 6],        // 0  goods-in, just off the slab
    [5, 6],         // 1  raw stock
    [14, 6],        // 2  additive shop
    [24, 6],        // 3  machining hall
    [34, 6],        // 4  cooling channels
    [44, 6],        // 5  close-out furnace
    [50, 6],        // 6  corner
    [50, 17],       // 7  corner
    [45, 17],       // 8  nozzle shop
    [36, 17],       // 9  injector build
    [27, 17],       // 10 turbopump
    [18, 17],       // 11 valves and ducts
    [9, 17],        // 12 controller
    [4, 17],        // 13 corner
    [4, 28],        // 14 corner
    [13, 28],       // 15 powerhead assembly
    [23, 28],       // 16 proof and NDT
    [33, 28],       // 17 hot fire
    [43, 28],       // 18 stage integration
    [51, 28],       // 19 out of the hall
    [51, 41],       // 20 down the transporter road
    [38, 47],       // 21 onto the pad approach
    [27, 47]        // 22 the pad itself
  ]);

  /* Where the belt stops being a belt and becomes a road. Everything past this
     distance is the transporter crawling to the pad, not a conveyor. */
  var ROAD_FROM = MAIN.cum[19];

  /* `dwell` is how long the carrier waits once you have already read this
     station's write-up. The much longer first-visit stop is derived from the
     length of that write-up; see readSeconds() below. */
  function station(route, idx, id, dwell) {
    return { dist: route.cum[idx], id: id, dwell: dwell == null ? 0.8 : dwell };
  }

  var STOPS = {
    main: [
      station(MAIN, 1, 'stock', 1.4),
      station(MAIN, 2, 'print', 2.8),
      station(MAIN, 3, 'machine', 2.4),
      station(MAIN, 4, 'channel', 2.4),
      station(MAIN, 5, 'braze', 2.0),
      station(MAIN, 8, 'nozzle', 2.6),
      station(MAIN, 9, 'inject', 2.6),
      station(MAIN, 10, 'pump', 2.6),
      station(MAIN, 11, 'valve', 2.2),
      station(MAIN, 12, 'avionics', 2.0),
      station(MAIN, 15, 'assy', 2.4),
      station(MAIN, 16, 'ndt', 1.8),
      station(MAIN, 17, 'hotfire', 3.2),
      station(MAIN, 18, 'integrate', 2.4),
      station(MAIN, 22, 'launch', 0)
    ]
  };

  /* ---- palette ----------------------------------------------------------- */

  /* Iron, rust, machine tan and one loud amber. Everything is low-chroma
     except the things that are meant to grab you: hazard banding, hot metal,
     warning lights and the belt arrows. */
  var C = {
    iron:     '#8d949c',
    steel:    '#aab2ba',
    machine:  '#9c9482',      // the tan every assembler is painted
    machine2: '#7d7768',
    amber:    '#e0a02c',
    amberLit: '#ffc255',
    rust:     '#a25a35',
    copper:   '#c2703c',
    ember:    '#e2653a',
    plum:     '#8a6ea6',
    teal:     '#3f8f92',
    moss:     '#6d8f4c',
    lead:     '#5a5f66',
    ink:      '#221f1b',
    beltDeck: '#2f2e2b',
    beltRail: '#b08a2c',
    concrete: '#5f5d57',
    concrete2:'#6a6862',
    dirt:     '#4b4034',
    dirt2:    '#554839'
  };

  /* ---- stations (clickable, narrated) ------------------------------------ */

  var STATIONS = [
    {
      id: 'stock', name: 'Goods In', x: 5, y: 6, r: 3.8, color: C.iron,
      phase: 'goods in', tag: 'Bar, billet and powder',
      short: 'Almost nothing here is bought as a finished part. It arrives as certified metal with a paper trail back to the melt it came from.',
      body: 'A liquid rocket engine is made from a short list of materials chosen for what they survive: nickel superalloys for anything that sees hot gas, a copper–chromium–niobium alloy for the chamber liner because it moves heat away faster than anything else that is also strong, stainless and titanium for ducts, pumps and pressure vessels. Half of it arrives as bar and plate; the rest as spherical metal powder in sealed argon-filled canisters, because that is what a printer eats. Every batch is traceable to a specific melt — one inclusion in the wrong place is not a warranty claim, it is a crater.'
    },
    {
      id: 'print', name: 'Additive Layer Shop', x: 14, y: 6, r: 4.4, color: C.plum,
      phase: 'forming', tag: 'Laser powder-bed fusion',
      short: 'The injector, the manifolds and the pump housings are not carved from solid. They are printed out of powder, a layer at a time.',
      body: 'A laser sweeps a bed of 30-micron metal powder and welds one cross-section of the part; the bed drops fifty microns, a blade spreads fresh powder, and it happens again — tens of thousands of times over several days. Printing is not here to save money on simple parts. It is here because it makes parts that cannot be made any other way: injector elements with curved internal swirl passages, manifolds where the plumbing is grown inside the wall, cooling channels that follow a contour no drill could reach. A modern engine has a few hundred printed parts where an engine of the 1960s had thousands of machined ones joined by thousands of welds.'
    },
    {
      id: 'machine', name: 'Machining Hall', x: 24, y: 6, r: 4.6, color: C.steel,
      phase: 'forming', tag: 'Five-axis, microns',
      short: 'Everything that seals, bolts or spins is cut, in a hall held at a fixed temperature all year.',
      body: 'Printed parts come off the build plate rough and deliberately oversize; forged parts arrive as blanks. Both go onto five-axis machining centres for the surfaces that matter — sealing faces, bearing bores, bolt circles, the throat contour itself. Critical features are held to single-digit microns, and a human hair is about seventy. The hall is temperature-controlled because steel grows around twelve microns per metre per degree, so an afternoon of sun on the roof is a manufacturing error rather than a weather event. Large parts go round more than once with a stress-relief bake in between, because taking metal away lets whatever is left move.'
    },
    {
      id: 'channel', name: 'Chamber & Cooling Channels', x: 34, y: 6, r: 4.4, color: C.copper,
      phase: 'chamber', tag: 'Regenerative cooling',
      short: 'The chamber wall sits millimetres from a 3,600 K flame and never melts, because the fuel goes through it first.',
      body: 'Hundreds of narrow slots are cut down the outside of the copper liner, running from the nozzle end up to the injector. Cold methane is pumped through them at high pressure before it is burned, picking up heat on the way and holding the wall a few hundred degrees below the point where copper gives up. The heat flux at the throat is among the highest in any engineered device — tens of megawatts per square metre. That is why the liner is a copper alloy and not steel, why the channels narrow exactly where the throat does, and why this one feature dictates the shape of everything around it.'
    },
    {
      id: 'braze', name: 'Close-out & Vacuum Furnace', x: 44, y: 6, r: 4.2, color: C.ember,
      phase: 'chamber', tag: 'Braze, HIP, stress relieve',
      short: 'The channels are roofed over with a structural jacket, and the whole assembly is bonded in one furnace cycle.',
      body: 'Open channels are useless: they need a lid that can carry the pressure inside them and the loads of the entire engine hanging off the chamber. The jacket is nickel electroformed out of solution directly onto the liner, or a machined shell brazed over it. Either way the assembly goes into a vacuum furnace and comes up to temperature until the braze alloy flows into every joint at once. Prints and castings go through hot isostatic pressing in the same shop — heat plus a couple of thousand bar of argon — which closes internal porosity that would otherwise be a crack waiting for its first thermal cycle.'
    },
    {
      id: 'nozzle', name: 'Nozzle Shop', x: 45, y: 17, r: 4.4, color: C.rust,
      phase: 'chamber', tag: 'The bell',
      short: 'The bell is the part everyone recognises, and it is mostly one very carefully chosen area ratio.',
      body: 'The nozzle turns hot high-pressure gas into fast gas going one direction. Its shape is a bell rather than a cone because a bell straightens the flow in a shorter length, and its area ratio is a compromise you can watch on the panel: too small and pressure is thrown away out of the back; too large and at sea level the flow separates from the wall and beats the nozzle to death. The extension is built from hundreds of formed tubes brazed side by side, or spun from sheet and welded — either way it is a thin, enormous, precisely contoured part that has to stay round while glowing.'
    },
    {
      id: 'inject', name: 'Injector Build', x: 36, y: 17, r: 4.4, color: C.amber,
      phase: 'powerhead', tag: 'Where the fire starts',
      short: 'A few hundred small holes decide whether the engine runs smoothly or destroys itself in milliseconds.',
      body: 'The injector meters oxygen and fuel into the chamber and mixes them, and it is the hardest part of the engine to get right. Each element is a coaxial swirler: oxygen down the centre with a spin on it, fuel around the outside, arranged so the sheets break into droplets that evaporate and burn within a few centimetres of the face. Get the pattern wrong and the chamber develops combustion instability — a pressure wave that couples with the flame and runs round the chamber at kilohertz, stripping the wall in under a second. This is the part that gets acoustic cavities, baffles, and more test time than everything else combined.'
    },
    {
      id: 'pump', name: 'Turbopump Assembly', x: 27, y: 17, r: 4.6, color: C.teal,
      phase: 'powerhead', tag: 'Tens of megawatts on one shaft',
      short: 'To push propellant into a 300-bar chamber you need pumps driven by turbines that are themselves rocket engines.',
      body: 'Feeding the chamber by pressurising the tanks would need tanks built like submarines, so a turbine drives a pump instead. The turbine is spun by hot gas from a preburner and puts tens of megawatts through a shaft about the diameter of your wrist; the pump on the other end raises propellant from a couple of bar to over four hundred. An inducer ahead of the impeller stops the liquid flashing to vapour as it is drawn in. It runs at tens of thousands of rpm with liquid oxygen on one side and a fire on the other, separated by seals and an inert purge — which is why the rotor is balanced to a level you cannot see and every bearing is serialised.'
    },
    {
      id: 'valve', name: 'Valves, Igniter & Ducts', x: 18, y: 17, r: 4.2, color: C.moss,
      phase: 'powerhead', tag: 'Sequence and control',
      short: 'An engine start is a sequence measured in milliseconds, and the valves are what execute it.',
      body: 'Main oxidiser and fuel valves, preburner valves, purge and bleed valves, the throttle — each is an actuator, a position sensor and a seat that has to seal against cryogenic liquid one second and hot gas the next. The ducts between them carry flexible joints, because the whole engine gimbals and because a line shrinks several millimetres when it goes cold. Ignition on a methalox engine is usually a torch igniter: a small spark-lit flame that lights the preburners, which light the chamber. Nothing here is allowed to be slow, and none of it is allowed to leak.'
    },
    {
      id: 'avionics', name: 'Controller & Instrumentation', x: 9, y: 17, r: 4.2, color: C.lead,
      phase: 'powerhead', tag: 'The engine flies itself',
      short: 'A modern engine starts, throttles, watches itself and shuts down without being told how.',
      body: 'The engine controller is a redundant flight computer bolted to the engine. It runs the start sequence in milliseconds, closes the loop on chamber pressure and mixture ratio, and watches a few hundred sensors for the signature of something going wrong. It can shut an engine down faster than a person could notice the problem, which is the only reason a nine-engine first stage can lose one and still reach orbit. Around it go the harness, the pressure and temperature instrumentation, and the thrust-vector actuators that swing the entire engine on its gimbal to steer the rocket.'
    },
    {
      id: 'assy', name: 'Powerhead Assembly', x: 13, y: 28, r: 4.6, color: C.machine,
      phase: 'build', tag: 'Torque, clearance, cleanliness',
      short: 'The engine goes together on a stand, in a fixed order, in a room cleaner than an operating theatre.',
      body: 'Assembly is where the measurements taken earlier get cashed in: parts are matched into sets, clearances are checked as the stack goes up, and every fastener is torqued and then turned through a specified angle so the bolt is stretched to a known load rather than merely tightened. Everything that will touch liquid oxygen is cleaned to a standard with a number attached, because in high-pressure oxygen a fingerprint is fuel — a smear of hydrocarbon in an oxygen line will ignite and take the line with it. One chip of swarf left in a passage is a destroyed engine.'
    },
    {
      id: 'ndt', name: 'Proof, Leak & Inspection', x: 23, y: 28, r: 4.2, color: C.plum,
      phase: 'test', tag: 'Look inside without cutting',
      short: 'Before it is allowed to burn anything, the engine is over-pressurised, leak-checked and X-rayed.',
      body: 'Every pressure-carrying part is proof-tested above its working pressure, then leak-checked with helium, which finds holes far smaller than anything else will. Welds and printed parts go through radiography or computed tomography, which locates porosity and lack-of-fusion inside a wall without opening it — the single biggest reason additive parts are trusted in flight hardware at all. Passages are flow-tested to confirm they are the size the drawing claims and that nothing is sitting in them. Everything is serialised, and the numbers follow that part for the rest of its life.'
    },
    {
      id: 'hotfire', name: 'Hot-Fire Test Stand', x: 33, y: 28, r: 5.0, color: C.ember,
      phase: 'test', tag: 'Acceptance firing',
      short: 'Every engine is fired before it flies. Not a sample from the batch — every single one.',
      body: 'The engine is bolted into a stand over a flame trench, chilled down with cryogenic propellant until the hardware is at temperature, and started. The acceptance run measures thrust, chamber pressure, mixture ratio and specific impulse against the numbers the design promised, sweeps the throttle, and gimbals the engine through its full range. Development engines are treated far worse — run deliberately off-nominal, past redlines, until something lets go, because that is how you find the edge. An engine that fires clean is then torn down, inspected and reassembled, and only after that is it flight hardware. The soot on the bell is not damage. It is a receipt.'
    },
    {
      id: 'integrate', name: 'Stage Integration', x: 43, y: 28, r: 4.4, color: C.steel,
      phase: 'integration', tag: 'Nine engines, one structure',
      short: 'The engine is not carried by the rocket. Bolted into the thrust structure, it is the thing that pushes the rocket.',
      body: 'The engine mounts into a thrust structure at the base of the stage which spreads several meganewtons of load into the tank wall above it. Around it go the other eight engines of the cluster, the propellant feed lines down from the tanks, the gimbal actuators, the helium bottles and a heat shield to keep the plume off everything that is not meant to be in it. The stage is then leak-checked, the engines are aligned to each other, and the rocket is rolled out horizontally and raised on the pad. None of this fit is an afterthought — the mounting interface was a constraint on the engine from the first sketch.'
    },
    {
      id: 'launch', name: 'Launch Complex 1', x: PAD.x, y: PAD.y, r: PAD.r, color: C.amber,
      phase: 'launch', tag: 'T-0',
      short: 'Chill down, spin up, ignite, release. From here it is nine engines and physics.',
      body: 'In the last minutes the tanks are topped off and the engines are chilled by flowing propellant straight through them, which is the white vapour pouring off the side of the vehicle. The strongback swings clear. At about T-3 seconds the igniters fire and the turbopumps spin up; the engines reach full thrust in under a second and the flight computer confirms all nine before the hold-down clamps let go. Nothing is thrown upward — the rocket leaves at a walking pace, with a thrust-to-weight barely above one, and only gets quick once it has burned away a third of its own mass. Everything on the floor behind you exists to make that first second uneventful.'
    }
  ];

  var STATION_BY_ID = {};
  STATIONS.forEach(function (s) { STATION_BY_ID[s.id] = s; });

  var ORDER = ['stock', 'print', 'machine', 'channel', 'braze', 'nozzle', 'inject',
               'pump', 'valve', 'avionics', 'assy', 'ndt', 'hotfire', 'integrate', 'launch'];

  /* How long to hold the carrier the first time it reaches a station, so the
     panel copy can actually be read. Roughly 230 words per minute, plus a beat
     to take in the machine before starting and a beat after finishing. */
  function readSeconds(id) {
    var s = STATION_BY_ID[id];
    if (!s) return 9;
    var words = (s.short + ' ' + s.body).split(/\s+/).length;
    return Math.min(28, Math.max(9, words / 3.8 + 3.5));
  }

  Object.keys(STOPS).forEach(function (route) {
    STOPS[route].forEach(function (st) { st.read = readSeconds(st.id); });
  });

  /* ---- geometry helpers -------------------------------------------------- */

  function distToSegment(px, py, ax, ay, bx, by) {
    var dx = bx - ax, dy = by - ay;
    var l2 = dx * dx + dy * dy;
    if (l2 === 0) return Math.hypot(px - ax, py - ay);
    var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2));
    return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
  }

  function distToRoute(x, y) {
    var best = 1e9, segs = MAIN.segs;
    for (var i = 0; i < segs.length; i++) {
      var s = segs[i];
      var d = distToSegment(x, y, s.a.x, s.a.y, s.b.x, s.b.y);
      if (d < best) best = d;
    }
    return best;
  }

  /* ---- feeder belts ------------------------------------------------------ */

  /* Short spurs that trickle components into a machine from a supply rack.
     Nothing rides the main line except the engine being built; everything else
     arrives sideways, which is most of what makes a factory look busy. */
  var FEEDERS = [
    { x: 12.2, y0: 1.2, y1: 4.4, into: 'print',    item: 'powder', color: '#9aa2ab', label: 'Ni powder' },
    { x: 15.8, y0: 1.2, y1: 4.4, into: 'print',    item: 'powder', color: '#c2703c', label: 'Cu powder' },
    { x: 24.0, y0: 1.2, y1: 4.4, into: 'machine',  item: 'tool',   color: '#8d949c', label: 'tooling' },
    { x: 34.0, y0: 1.2, y1: 4.4, into: 'channel',  item: 'liner',  color: '#c2703c', label: 'liner stock' },
    { x: 44.0, y0: 1.2, y1: 4.4, into: 'braze',    item: 'foil',   color: '#b8863a', label: 'braze foil' },
    { x: 45.0, y0: 12.0, y1: 15.2, into: 'nozzle', item: 'tube',   color: '#a25a35', label: 'formed tube' },
    { x: 36.0, y0: 12.0, y1: 15.2, into: 'inject', item: 'element', color: '#e0a02c', label: 'swirl elements' },
    { x: 27.0, y0: 12.0, y1: 15.2, into: 'pump',   item: 'rotor',  color: '#3f8f92', label: 'impellers' },
    { x: 18.0, y0: 12.0, y1: 15.2, into: 'valve',  item: 'valve',  color: '#6d8f4c', label: 'valve bodies' },
    { x: 9.0,  y0: 12.0, y1: 15.2, into: 'avionics', item: 'board', color: '#4f9d78', label: 'avionics' },
    { x: 13.0, y0: 23.2, y1: 26.4, into: 'assy',   item: 'bolt',   color: '#aab2ba', label: 'fasteners' },
    { x: 43.0, y0: 23.2, y1: 26.4, into: 'integrate', item: 'panel', color: '#6d675e', label: 'structure' }
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
            seed: (cx * 31 + cy * 17) | 0, color: opts.glass || '#e7b455', band: opts.band }
        : null
    });
  }

  function buildMachines() {
    /* --- goods in --- */
    put({ kind: 'rack', x: 3.0, y: 2.4, color: C.lead });
    put({ kind: 'rack', x: 6.6, y: 2.4, color: C.lead });
    put({ kind: 'rack', x: 3.0, y: 9.6, color: C.lead });
    put({ kind: 'crane', x: 5.6, y: 6, color: C.amber });
    put({ kind: 'silo', x: 8.6, y: 9.8, color: C.iron });

    /* --- additive shop: printers set back so the belt stays visible --- */
    put({ kind: 'printer', x: 12.0, y: 9.6, color: C.plum });
    put({ kind: 'printer', x: 15.0, y: 9.6, color: C.plum });
    put({ kind: 'printer', x: 18.0, y: 9.6, color: C.plum });
    put({ kind: 'silo', x: 10.6, y: 2.8, color: C.iron });
    shed(17.4, 2.8, { w: 2.6, d: 2.2, h: 2.2, color: '#6b6577', roof: '#4b4552', cols: 3, band: 1 });

    /* --- machining hall --- */
    put({ kind: 'cnc', x: 21.6, y: 9.6, color: C.steel });
    put({ kind: 'cnc', x: 24.6, y: 9.6, color: C.steel });
    put({ kind: 'cnc', x: 27.6, y: 9.6, color: C.steel });
    put({ kind: 'chipbin', x: 30.4, y: 9.8, color: C.lead });
    shed(21.8, 2.8, { w: 3.0, d: 2.2, h: 2.6, color: '#727880', roof: '#4d5259', cols: 4, band: 1 });

    /* --- cooling channels --- */
    put({ kind: 'mill', x: 32.4, y: 9.6, color: C.copper });
    put({ kind: 'plating', x: 35.8, y: 9.6, color: C.teal });
    put({ kind: 'tank', x: 38.6, y: 9.8, color: '#7d8a90' });
    shed(31.0, 2.8, { w: 2.4, d: 2.0, h: 2.0, color: '#6f6258', roof: '#4a4139' });

    /* --- close-out furnace: the widest thing on the row, so set well back.
       In this projection a machine hides the belt when half its footprint
       exceeds its distance from the line. --- */
    put({ kind: 'furnace', x: 44, y: 10.2, color: C.ember });
    put({ kind: 'hip', x: 47.6, y: 9.8, color: C.rust });
    put({ kind: 'chimney', x: 41.0, y: 10.6, color: C.lead });
    shed(41.0, 2.8, { w: 2.4, d: 2.0, h: 1.8, color: '#6b5a4e', roof: '#463b32' });

    /* --- nozzle shop --- */
    put({ kind: 'spinformer', x: 45, y: 20.6, color: C.rust });
    put({ kind: 'welder', x: 48.2, y: 20.4, color: C.amber });
    put({ kind: 'rack', x: 41.8, y: 20.4, color: C.lead });

    /* --- injector build --- */
    put({ kind: 'assembler', x: 36, y: 20.6, color: C.amber, station: 'inject' });
    put({ kind: 'bench', x: 33.0, y: 20.4, color: C.amber });
    put({ kind: 'console', x: 38.9, y: 20.4, color: C.amber });

    /* --- turbopump --- */
    put({ kind: 'assembler', x: 27, y: 20.6, color: C.teal, station: 'pump' });
    put({ kind: 'balancer', x: 30.0, y: 20.4, color: C.teal });
    put({ kind: 'bench', x: 24.0, y: 20.4, color: C.teal });

    /* --- valves and ducts --- */
    put({ kind: 'assembler', x: 18, y: 20.6, color: C.moss, station: 'valve' });
    put({ kind: 'gasbottle', x: 21.0, y: 20.4, color: '#7d8a90' });
    put({ kind: 'bench', x: 15.0, y: 20.4, color: C.moss });

    /* --- controller --- */
    put({ kind: 'cleanroom', x: 9, y: 21.0, color: C.lead });
    put({ kind: 'console', x: 5.6, y: 20.4, color: C.teal });

    /* --- powerhead assembly: the two big halls are the only structures wide
       enough to reach back over the line, so they stand well clear of it. --- */
    shed(13, 33.0, { w: 6.4, d: 3.2, h: 3.0, color: '#7c766a', roof: '#4e4b45', roofH: 0.5, cols: 5, band: 1 });
    put({ kind: 'stand', x: 9.4, y: 25.2, color: C.machine });
    put({ kind: 'torquebay', x: 16.6, y: 25.2, color: C.machine });

    /* --- proof and NDT --- */
    put({ kind: 'xray', x: 23, y: 32.4, color: C.plum });
    put({ kind: 'tank', x: 19.6, y: 31.8, color: '#7d8a90' });
    put({ kind: 'console', x: 26.2, y: 31.8, color: C.plum });

    /* --- hot fire --- */
    put({ kind: 'teststand', x: 33, y: 33.0, color: C.ember });
    put({ kind: 'watertank', x: 28.4, y: 32.6, color: C.teal });
    put({ kind: 'console', x: 37.4, y: 32.4, color: C.ember });

    /* --- stage integration --- */
    put({ kind: 'gantry', x: 43, y: 31.8, color: C.steel });
    put({ kind: 'rack', x: 47.4, y: 31.6, color: C.lead });

    /* --- services and yard --- */
    put({ kind: 'tank', x: 51.6, y: 11.6, color: '#7d8a90' });
    put({ kind: 'tank', x: 53.2, y: 11.6, color: '#7d8a90' });
    put({ kind: 'tank', x: 51.6, y: 22.6, color: '#8a8070' });
    put({ kind: 'silo', x: 1.4, y: 31.6, color: C.iron });
    shed(6.0, 31.4, { w: 2.6, d: 2.0, h: 1.8, color: '#605c54', roof: '#3f3c37' });
    put({ kind: 'rack', x: 29.6, y: 24.6, color: C.lead });
    put({ kind: 'chipbin', x: 39.6, y: 24.6, color: C.lead });

    /* --- the pad --- */
    put({ kind: 'padmount', x: PAD.x, y: PAD.y, color: C.lead });
    put({ kind: 'strongback', x: PAD.x - 5.0, y: PAD.y, color: C.iron });
    put({ kind: 'watertank', x: PAD.x + 7.4, y: PAD.y - 5.6, color: C.teal });
    put({ kind: 'proptank', x: PAD.x - 8.6, y: PAD.y - 6.4, color: '#9aa6ac', label: 'LOX' });
    put({ kind: 'proptank', x: PAD.x - 5.4, y: PAD.y - 7.2, color: '#8c968a', label: 'CH4' });
    put({ kind: 'mast', x: PAD.x - 8.5, y: PAD.y + 6.0, color: C.iron });
    put({ kind: 'mast', x: PAD.x + 8.5, y: PAD.y + 4.0, color: C.iron });
    put({ kind: 'mast', x: PAD.x + 4.0, y: PAD.y - 9.0, color: C.iron });
    put({ kind: 'blockhouse', x: PAD.x + 9.0, y: PAD.y + 8.6, color: C.machine2 });
  }

  /* ---- props ------------------------------------------------------------- */

  var props = [];

  function buildProps() {
    /* power poles along the belt, with wire strung between consecutive poles
       in render.js. They stop where the belt becomes a road. */
    var step = 8.5, prev = null;
    for (var d = 3; d < ROAD_FROM; d += step) {
      var p = MAIN.at(d);
      if (p.x < -1 || p.x > 52) continue;
      var nx = -p.dy, ny = p.dx;
      var pole = { kind: 'pole', x: p.x + nx * 2.5, y: p.y + ny * 2.5, z: 0, prev: prev };
      props.push(pole);
      prev = pole;
    }

    /* pipe runs between the aisles */
    props.push({ kind: 'piperun', x0: 7, y0: 12.0, x1: 49, y1: 12.0, z: 0.55 });
    props.push({ kind: 'piperun', x0: 7, y0: 23.2, x1: 46, y1: 23.2, z: 0.55 });

    /* floor lamps */
    [[10, 12.3], [30, 12.3], [45, 12.3], [10, 23.5], [30, 23.5], [44, 23.5]].forEach(function (p) {
      props.push({ kind: 'lamp', x: p[0], y: p[1], z: 0 });
    });

    /* pallets and crates in the leftover floor */
    [[8.8, 3.0], [19.8, 12.6], [29.6, 3.2], [40.2, 3.0], [48.8, 8.2],
     [41.2, 13.2], [31.4, 13.4], [21.4, 13.2], [11.8, 13.4],
     [20.0, 20.6], [31.6, 24.8], [41.6, 25.0], [6.6, 30.6], [35.8, 24.8],
     [46.4, 35.2], [8.6, 29.4], [52.2, 26.2]
    ].forEach(function (p, i) {
      props.push({ kind: 'pallet', x: p[0], y: p[1], z: 0, seed: i });
    });

    /* Scrub and boulders outside the fence, so the plant reads as a building
       standing on a site rather than a diagram floating in space. The pad and
       the transporter road are kept clear. */
    for (var x = -10; x < 66; x += 2.3) {
      for (var y = -10; y < 60; y += 2.3) {
        var onSlab = x > -2 && x < GW + 2 && y > -2 && y < GH + 2;
        var onPad = Math.hypot(x - PAD.x, y - PAD.y) < PAD.r + 3;
        var onRoad = distToRoute(x, y) < 4.5;
        if (onSlab || onPad || onRoad) continue;
        var n = Iso.hash2(x * 7, y * 11, 23);
        if (n > 0.34) continue;
        props.push({
          kind: n < 0.09 ? 'rock' : 'scrub',
          x: x + n, y: y + n * 0.6, z: 0, s: 0.6 + n * 2
        });
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
    GW: GW, GH: GH, PAD: PAD,
    routes: { main: MAIN },
    roadFrom: ROAD_FROM,
    stops: STOPS,
    stations: STATIONS,
    stationById: STATION_BY_ID,
    order: ORDER,
    feeders: feeders,
    machines: machines,
    props: props,
    palette: C,
    distToRoute: distToRoute,
    build: build
  };
})(window);
