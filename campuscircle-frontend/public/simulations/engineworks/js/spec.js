/* spec.js: the power unit itself — regulation figures, and the arithmetic that
 * falls out of them.
 *
 * Everything in compute() is worked out from the numbers in REG plus whatever
 * the sliders are set to. Nothing here is looked up in a table of results, so
 * the panel changes because the physics changed, not because a lerp did.
 *
 * The one modelled quantity is ICE output: no team publishes an engine map, so
 * we assume a constant brake thermal efficiency and a fuel flow that rises with
 * engine speed until it meets the regulation ceiling. Everything derived from
 * it is flagged as an estimate in the UI.
 */
(function (global) {
  'use strict';

  /* ---- what the rulebook fixes ------------------------------------------- */

  var REG = {
    cylinders: 6,
    vAngle: 90,               // degrees
    boreMM: 80,               // mandated exactly
    strokeMM: 53,             // what 1.6 litres over six 80 mm bores leaves you
    rodMM: 102,               // ASSUMED: teams do not publish this
    maxDisplacementCC: 1600,
    rpmLimit: 15000,
    turbos: 1,
    injectionBar: 500,        // direct injection pressure ceiling
    fuelEnergyMJh: 3000,      // 2026: fuel flow is limited by energy, not mass
    fuelEnergyKneeRPM: 12000, // below this the engine is not at the ceiling
    mguKmaxKW: 350,           // 2026 figure, up from 120 kW
    thermalEff: 0.48,         // ASSUMED for the ICE model
    recoveryMJlap: 8.5        // MGU-K recovery ceiling per lap
  };

  var G = 9.80665;

  function boreArea() {                       // mm²
    return Math.PI * 0.25 * REG.boreMM * REG.boreMM;
  }

  function displacementCC() {                 // cc, from geometry not from the rulebook
    return REG.cylinders * boreArea() * REG.strokeMM / 1000;
  }

  /* Fuel energy the rules allow at a given engine speed. Flat out above the
     knee, proportional below it — a crude stand-in for a real flow curve. */
  function fuelEnergyMJh(rpm) {
    var f = Math.min(1, rpm / REG.fuelEnergyKneeRPM);
    return REG.fuelEnergyMJh * f;
  }

  function compute(rpm, deployKW) {
    var strokeM = REG.strokeMM / 1000;
    var rps = rpm / 60;

    /* piston kinematics */
    var meanPistonSpeed = 2 * strokeM * rps;                 // m/s
    var omega = 2 * Math.PI * rps;                            // rad/s
    var crankR = strokeM / 2;
    var lambda = crankR / (REG.rodMM / 1000);
    var peakAccel = omega * omega * crankR * (1 + lambda);    // m/s² at TDC

    /* four-stroke: every cylinder fires once every two revolutions */
    var firingHz = REG.cylinders * rpm / 120;

    /* energy budget */
    var fuelMJh = fuelEnergyMJh(rpm);
    var fuelKW = fuelMJh * 1000 / 3600;
    var iceKW = fuelKW * REG.thermalEff;
    var kKW = Math.min(deployKW, REG.mguKmaxKW);
    var totalKW = iceKW + kKW;

    return {
      rpm: rpm,
      displacementCC: displacementCC(),
      meanPistonSpeed: meanPistonSpeed,
      pistonKmPerMin: meanPistonSpeed * 60 / 1000,
      peakAccelG: peakAccel / G,
      firingHz: firingHz,
      fuelMJh: fuelMJh,
      fuelKW: fuelKW,
      iceKW: iceKW,
      mguKW: kKW,
      totalKW: totalKW,
      totalHP: totalKW / 0.7457,
      thermalEff: REG.thermalEff,
      atCeiling: rpm >= REG.fuelEnergyKneeRPM
    };
  }

  /* ---- what the car does with it ------------------------------------------ */

  /* The launch at the end of the line is integrated from this, not keyframed,
     so the car on the straight is doing what the numbers say it should.
     Weight is the 2026 minimum including driver. Grip and drag are the two
     assumptions: 1.1 g is what a slick puts down off the line, and CdA ≈ 1.0
     is a low-drag setup. Both are quoted, neither is published. */
  var CAR = {
    massKg: 768,
    gripG: 1.1,
    driveline: 0.87,          // crank to contact patch
    cdA: 1.0,                 // m², drag area
    rhoAir: 1.225             // kg/m³
  };

  /* Longitudinal acceleration at a given speed: the smaller of what the tyres
     can hold and what the power unit can push, less aerodynamic drag. Off the
     line the first term wins, which is the whole point of it. */
  function launchAccel(vms, powerKW) {
    var tyre = CAR.gripG * G;
    var drive = powerKW * 1000 * CAR.driveline / (CAR.massKg * Math.max(vms, 1.5));
    var drag = 0.5 * CAR.rhoAir * CAR.cdA * vms * vms / CAR.massKg;
    return Math.min(tyre, drive) - drag;
  }

  /* Seconds from rest to a given speed, integrated forward in fixed steps.
     Returns null when the car cannot get there at all, which is what happens
     to top speed when you turn the deployment down. */
  function timeToSpeed(kmh, powerKW) {
    var target = kmh / 3.6, v = 0, tt = 0, step = 0.004;
    while (v < target) {
      var a = launchAccel(v, powerKW);
      if (a <= 0.02) return null;           /* drag has caught the drive */
      v += a * step;
      tt += step;
      if (tt > 60) return null;
    }
    return tt;
  }

  /* ---- materials ---------------------------------------------------------- */

  /* Indicative only. Real bills of material are among the most closely held
     documents in the sport; these shares are here to show how the mix shifts
     from "a lump of aluminium" to "an electrical machine bolted to an engine". */
  var MATERIALS = [
    { id: 'al',   name: 'Aluminium',   color: '#4a7a9b' },
    { id: 'steel', name: 'Steel',      color: '#6b7078' },
    { id: 'ti',   name: 'Titanium',    color: '#8b5f96' },
    { id: 'ni',   name: 'Superalloy',  color: '#b4832f' },
    { id: 'cu',   name: 'Copper',      color: '#a85a44' },
    { id: 'cell', name: 'Cells',       color: '#55803f' },
    { id: 'elec', name: 'Electronics', color: '#3f8a86' },
    { id: 'comp', name: 'Composites',  color: '#4a4540' }
  ];

  var MATERIAL_BY_ID = {};
  MATERIALS.forEach(function (m) { MATERIAL_BY_ID[m.id] = m; });

  /* What each station adds: material units (indicative mass share) and a part
     count. Machining is the one station with a negative material entry, which
     is the point of it — a finished block is a fraction of the casting. */
  var STATION_ADDS = {
    alloy:   { parts: 0,    mat: {} },
    cast:    { parts: 3,    mat: { al: 42 } },
    heat:    { parts: 0,    mat: {} },
    machine: { parts: 0,    mat: { al: -19 } },
    coat:    { parts: 0,    mat: {} },
    metro:   { parts: 0,    mat: {} },
    crank:   { parts: 84,   mat: { steel: 14, ti: 6, al: 4 } },
    valve:   { parts: 246,  mat: { ti: 6, steel: 5, al: 7 } },
    turbo:   { parts: 48,   mat: { ni: 8, ti: 2, steel: 3 } },
    hybrid:  { parts: 618,  mat: { cu: 7, cell: 11, elec: 4, al: 4, steel: 3 } },
    assy:    { parts: 1946, mat: { steel: 6, comp: 5, al: 3 } },
    dyno:    { parts: 0,    mat: {} },
    seal:    { parts: 0,    mat: {} },
    fit:     { parts: 318,  mat: { comp: 6, al: 3, steel: 2 } },
    /* the car around it is not part of the unit, so the bill does not move */
    track:   { parts: 0,    mat: {} },
    rebuild: { parts: 0,    mat: {} }
  };

  function totalParts() {
    var n = 0;
    Object.keys(STATION_ADDS).forEach(function (k) { n += STATION_ADDS[k].parts; });
    return n;
  }

  /* ---- formatting --------------------------------------------------------- */

  function group(n) {
    return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  global.Spec = {
    REG: REG,
    CAR: CAR,
    compute: compute,
    launchAccel: launchAccel,
    timeToSpeed: timeToSpeed,
    displacementCC: displacementCC,
    MATERIALS: MATERIALS,
    materialById: MATERIAL_BY_ID,
    STATION_ADDS: STATION_ADDS,
    totalParts: totalParts,
    group: group
  };
})(window);
