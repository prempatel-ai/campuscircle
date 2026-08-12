# EngineWorks

**[▶ Open the live factory](https://laurentiugabriel.github.io/engineworks/)**

An isometric factory that builds a Formula 1 power unit on conveyor belts. A
carrier rides the main line through sixteen stations: it leaves the raw stock
bay as a pallet of ingots, comes out of the casting bay as a rough crankcase,
is heat treated, machined, coated and measured, is given its rotating assembly,
heads, turbo and hybrid system, is built up in a clean room, run on a dyno,
sealed and delivered. At the end of the line a hoist lifts it off the belt into
the back of a car, the car is fired up and accelerates away down the straight —
and then the unit rides the overhead return line home to be stripped and
rebuilt, because that is what really happens to a race engine between events.

Pure static site. No build step, no dependencies, no network calls.

## Run it

Open `index.html` in a browser. That's it.

If you'd rather serve it:

```
python -m http.server 8000
# → http://localhost:8000
```

## Controls

| | |
|---|---|
| **Space** | play / pause (holds a reading stop indefinitely) |
| **S** | advance exactly one station |
| **R** | reset and replay the slow tour |
| **F** | toggle camera follow |
| **L** | toggle labels |
| drag | pan · scroll: zoom · double-click: fit the whole factory |
| **+ − ⤢** | zoom controls on the left edge; **⤢** shows the whole plant |
| click a station | pin its write-up (click empty floor to resume) |

The view starts zoomed in on the carrier and follows it, since that is where
everything happens. Zooming out to the whole plant is deliberate: the **⤢**
button, a double-click, or the scroll wheel. Turning off **Follow** lets you
pan around independently.

The sliders change **speed** (0.4×–8×), **engine speed** (9,000–15,000 rpm),
**MGU-K deployment** (0–350 kW) and how many **units** to build. Engine speed
and deployment feed the live build sheet, so you can watch mean piston speed,
peak piston load and combined output move as you drag them.

## Pacing

It is built to be read, not raced. The first time the carrier reaches a station
it stops for 9–26 seconds, scaled to the length of that station's write-up, and
a progress bar under the panel text shows how much of the stop is left. The
first unit therefore takes about **five minutes**: that is the guided tour.

After every station has been explained there is nothing new to read, so the line
switches to a watchable pace. The HUD says which mode you are in. The Speed
slider scales everything, reading stops included; **Reset** (⟲) replays the slow
tour, while **Build** keeps what you have already read.

## The stations

| Station | Step |
|---|---|
| Raw Stock Bay | certified bar, billet and ingot |
| Casting Bay | aluminium poured around sand cores |
| Heat Treatment | solution, quench, age, hot isostatic pressing |
| Machining Hall | five-axis cutting to single-digit microns |
| Coatings & Surfaces | DLC, bore coatings, nitriding, peening |
| Metrology | CMM and CT, then parts matched into sets |
| Rotating Assembly | crankshaft, titanium rods, forged pistons |
| Heads & Valvetrain | 24 valves closed by nitrogen, not springs |
| Turbo Shop | superalloy turbine, balanced to nothing |
| Hybrid Cell | MGU-K, inverter, energy store |
| Clean Assembly | clearances, torque-and-angle, cleanliness |
| Dyno Cell | run-in, mapping, endurance |
| Homologation & Seal | serialised, sealed, counted |
| Trackside Fit | the engine as a stressed chassis member |
| Fire-Up & Launch | into the car, lit, and gone down the straight |
| Strip & Rebuild | the overhead return line |

## How much of it is real

**Genuinely computed, live, in the browser:** the swept volume from the
regulated 80 mm bore and the 53 mm stroke that follows from it (1,598 cc, just
under the 1,600 cc ceiling); mean piston speed and peak piston acceleration at
whatever engine speed you dial in; combustion events per second; the fuel energy
flow the rules allow and the thermal efficiency implied by it; and the combined
output with the MGU-K deployment you choose. Those numbers move because they are
being worked out, not looked up. All of it lives in `js/spec.js`.

**Integrated, not animated:** the launch at the end of the line. The car
accelerates on `a = min(tyre grip, power / (mass × speed)) − drag`, stepped
forward every frame from the combined output on the build sheet and the 2026
minimum weight of 768 kg. That is why the run barely changes when you drag the
MGU-K slider: off the line the car is held back by what the rear tyres can take,
about 1.1 g, and deployment only tells once it is already moving — the same
model gives the 0–200 km/h figure on the panel. Grip, a drag area of about
1.0 m² and an 87% driveline are assumptions; the arithmetic on top of them is
not. It lives in `Spec.launchAccel`.

**Regulation figures, quoted:** 1.6 litres, six cylinders in a 90° V, a single
turbocharger, an 80 mm bore, a 15,000 rpm limit, 500 bar direct injection, 100%
sustainable fuel, and for 2026 a 350 kW MGU-K with the MGU-H deleted and a fuel
energy flow limit of about 3,000 MJ/h.

**Modelled, not measured:** the internal combustion engine's output. Teams do
not publish engine maps. This one assumes a flat 48% brake thermal efficiency
and a fuel flow that rises with engine speed until it meets the regulation cap,
which lands the ICE near 400 kW at the limiter — the figure the paddock
generally assumes. It is a sanity-check model, not an engine map.

**Indicative:** the materials split, the part counts, the tolerances quoted in
the station write-ups, and every dimension of the machinery on the floor. Real
engine shops do not publish their process sheets. Treat the numbers on the panel
as the lesson and the factory itself as an illustration.

## Layout

```
index.html          markup, controls, about copy
css/styles.css      light, print-like UI
js/iso.js           isometric projection + box/prism/cylinder/gear primitives
js/spec.js          the power unit: regulation figures and the arithmetic
js/factory.js       belts, stations, machines, feeder spurs, props, the straight
js/sim.js           the state machine that walks one unit down the line
js/render.js        canvas 2D painter's-algorithm renderer
js/ui.js            panels, narration, controls
js/main.js          camera, input, frame loop
```

`Factory.routes` holds the polylines the carrier travels and `Factory.stops`
maps distances along them to station IDs. `Sim` fires a station handler when the
carrier arrives, which is where the unit's build level, part count and materials
advance. The renderer draws the thing on the belt cumulatively from that build
level, so the same function draws a pallet of ingots, a rough casting and a
complete power unit depending on how far down the line it has got — and the same
one draws it hanging off the hoist and sitting in the back of the car.

The finale is the one thing that is not a carrier on a belt, so it has a small
state machine of its own in `Sim` (`wait → mount → fire → launch → gone`) and a
stop with a `hold` on it, which keeps the carrier parked until the sequence has
played out however short the stop would otherwise be. `Sim.viewTarget()` blends
the camera from the carrier to the car and back, rather than cutting.

One layout rule is worth knowing before moving anything: in this projection a
machine standing at `(mx, my)` hides the belt point at `(mx, by)` when half its
footprint, `(w + d) / 2`, exceeds its setback `my - by`. That is why the two big
halls stand well back from the line and the oven sits further off it than its
neighbours — anything closer would swallow the unit you are meant to be
watching.

## Credits

A companion piece to [TokenTown](https://laurentiugabriel.github.io/token-town/),
which lays a language model out as a city. All code, art and copy here are
original.
