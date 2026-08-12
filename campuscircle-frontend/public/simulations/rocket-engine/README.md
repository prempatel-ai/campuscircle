# Rocket Engine Works

An isometric factory that builds a liquid rocket engine, station by station, and
then launches it.

A carrier rides a conveyor through fourteen production stations. It leaves
goods-in as bar stock and sealed canisters of metal powder; it is printed,
machined, given regenerative cooling channels and a brazed jacket, fitted with a
nozzle, an injector, turbopumps, valves and a controller; it is assembled,
proof-tested, X-rayed and fired on a test stand. Then a transporter crawls it out
to Launch Complex 1, where it is mated into the base of a rocket — and the rocket
flies.

No build step, no dependencies, no framework. Open `index.html`.

## What is actually being computed

The point of the page is that the numbers on the panel are worked out rather
than looked up. Move a slider and the gas dynamics change.

**Computed live, in the browser:**

- **Exit Mach number**, solved numerically from the nozzle area ratio by
  bisecting the isentropic area–Mach relation. There is no closed form for this,
  so it is genuinely iterated, sixty halvings per call.
- **Exit pressure and temperature** from that Mach number, and **exhaust
  velocity** from the energy equation.
- **Characteristic velocity** `c*` from chamber temperature, exhaust molar mass
  and the ratio of specific heats, and **mass flow** from `ṁ = Pc·At / c*`.
- **Thrust** from the momentum term plus the pressure term at whatever ambient
  pressure the vehicle is currently at, so sea-level and vacuum thrust differ for
  the right reason — and thrust visibly climbs during the ascent.
- **Specific impulse**, engine thrust-to-weight, and stage thrust-to-weight at
  liftoff.
- **Flow separation**: if you wind the expansion ratio up far enough that exit
  pressure falls well below ambient, the panel says so, because a bell that
  large only works in vacuum.

**Also computed:** the launch itself. Altitude and velocity are integrated from
thrust, from vehicle mass falling as propellant burns, and from gravity falling
off with altitude. That is why the rocket leaves the pad at walking pace and is
doing three kilometres a second two minutes later. A full run reaches roughly
170 km and 3,000 m/s at first-stage cut-off.

**Modelled, not measured:** combustion. Chamber temperature and exhaust molar
mass come from an equilibrium solver in real life; here they are fitted curves
against mixture ratio — the peak is in the right place and moves the right way,
but it is not chemistry. The ratio of specific heats is held constant, which it
is not. The gravity turn is a crude pitch schedule, not an optimised trajectory.

**Indicative:** the materials split, the part counts, the tolerances quoted in
the station write-ups, and every dimension of the machinery on the floor. Engine
builders do not publish process sheets or bills of material.

At the default settings the engine works out to about 737 kN at sea level, 792 kN
in vacuum, Isp of 332 s sea level and 357 s vacuum, and an engine thrust-to-weight
around 50 — which is the right neighbourhood for a methalox staged-combustion
engine of this class.

## The stations

| # | Station | What happens |
|---|---------|--------------|
| 1 | Goods In | Superalloy bar, copper alloy, stainless, titanium, and metal powder in argon |
| 2 | Additive Layer Shop | Injector, manifolds and pump housings printed by laser powder-bed fusion |
| 3 | Machining Hall | Five-axis cutting of every sealing face, bore and bolt circle |
| 4 | Chamber & Cooling Channels | Hundreds of slots milled down the copper liner for regenerative cooling |
| 5 | Close-out & Vacuum Furnace | The jacket is electroformed or brazed on; HIP closes internal porosity |
| 6 | Nozzle Shop | The bell — formed tubes brazed side by side, or spun and welded |
| 7 | Injector Build | Coaxial swirl elements; the part that decides whether it runs or detonates |
| 8 | Turbopump Assembly | Tens of megawatts on a wrist-thick shaft, LOX one side and fire the other |
| 9 | Valves, Igniter & Ducts | The sequence, the torch igniter, and joints that shrink when they go cold |
| 10 | Controller & Instrumentation | The redundant computer that starts, throttles and shuts the engine down |
| 11 | Powerhead Assembly | Torque-to-angle, matched clearances, and LOX-clean everything |
| 12 | Proof, Leak & Inspection | Proof pressure, helium leak check, CT and radiography |
| 13 | Hot-Fire Test Stand | Every engine is fired before it flies. The soot on the bell is a receipt |
| 14 | Stage Integration | Bolted into the thrust structure with eight others |
| — | Launch Complex 1 | Chill down, strongback retract, ignition, liftoff |

## Controls

- **Space** play / pause · **S** advance one station · **R** reset and replay the
  tour · **F** follow camera · **L** labels
- Drag to pan, scroll to zoom, click any station for its write-up.
- **⤢** (or double-click the ground) pulls back to the whole site.
- During the launch the camera climbs with the rocket regardless of the Follow
  setting — the point of the last thirty seconds is up in the air.

The first time the carrier reaches a station it holds long enough to read that
station's write-up, between 9 and 28 seconds depending on length, with a progress
bar under the panel. Once every station has been explained the line runs at a
watchable pace instead of a readable one.

## Layout

```
index.html          markup only
css/styles.css      dark industrial chrome
js/iso.js           isometric projection and solid primitives
js/spec.js          the engine: design parameters and the gas dynamics
js/factory.js       belts, stations, machines, props, the pad
js/sim.js           the state machine, including the launch sequence
js/render.js        everything drawn, canvas 2D, painter's algorithm
js/ui.js            DOM panels and narration
js/main.js          camera, input, frame loop
```

## Deployment

Pushing to `main` deploys to GitHub Pages via `.github/workflows/pages.yml`. The
workflow sets `enablement: true`, so Pages turns itself on the first time it
runs — no visit to repository settings needed.

## Credit and licence

Original code, art and copy. Visually indebted to Factorio's industrial
iconography — the belts, inserters, hazard banding and machine palette — but no
game assets are used and none of it is traced. A companion piece to
[EngineWorks](https://github.com/LaurentiuGabriel/engineworks), which lays out a
Formula 1 power unit the same way.
