/* spec.js: the engine itself — the design parameters, and the gas dynamics
 * that falls out of them.
 *
 * Everything in compute() is worked out from the numbers in ENG plus whatever
 * the sliders are set to. Nothing is looked up in a table of results, so the
 * panel changes because the flow changed, not because a lerp did.
 *
 * The exit Mach number is solved numerically from the area ratio every time
 * the sliders move, and thrust follows from the rocket equation's momentum and
 * pressure terms. The one modelled input is combustion: real chamber
 * temperature and exhaust molar mass come out of an equilibrium solver nobody
 * is going to run in a page like this, so those two are fitted curves against
 * mixture ratio and flagged as modelled in the UI.
 */
(function (global) {
  'use strict';

  /* ---- what the design fixes --------------------------------------------- */

  var ENG = {
    name: 'RS-9 "Anvil"',
    cycle: 'full-flow staged combustion',
    propellants: 'liquid oxygen / liquid methane',
    chamberBar: 300,          // nominal chamber pressure
    mixtureRatio: 3.6,        // O/F by mass
    throatMM: 132,            // throat diameter
    expansion: 40,            // Ae / At, sea-level bell
    gamma: 1.16,              // ratio of specific heats, ASSUMED constant
    dryMassKg: 1630,          // engine dry mass
    gimbalDeg: 15,
    engineCount: 9,           // per first stage
    restarts: 20,             // qualified relights
    /* the vehicle these nine engines are bolted into, for the launch readout.
       "dry" here is what is left when the first stage is empty: the stage
       itself plus the whole upper stage and payload still riding on top. */
    vehicleWetKg: 520000,
    vehicleDryKg: 142000
  };

  var G0 = 9.80665;
  var RU = 8314.462;          // universal gas constant, J/(kmol·K)
  var PA_SL = 101325;         // sea-level ambient

  /* ---- combustion: the two modelled quantities ---------------------------- */

  /* Methalox flame temperature peaks a little rich of stoichiometric and falls
     away either side. A parabola through the peak is not an equilibrium
     solution, but it puts the peak in the right place and moves the right way,
     which is all the panel is claiming. */
  function chamberTempK(mr) {
    var t = 3620 - 780 * Math.pow((mr - 3.55) / 1.05, 2);
    return Math.max(2300, t);
  }

  /* More oxygen means heavier exhaust: fewer light H2/CO fragments, more CO2
     and H2O. Monotone and roughly right over the range the slider allows. */
  function molarMass(mr) {
    return 13.6 + 2.4 * mr;   // kg/kmol
  }

  /* ---- nozzle ------------------------------------------------------------- */

  /* The isentropic area-Mach relation, which cannot be inverted in closed form.
     Bisection on M in [1, 30]: the function is monotone above Mach 1, so this
     always converges, and 60 halvings is far more precision than the inputs
     deserve. */
  function areaRatio(M, g) {
    var a = (g + 1) / 2;
    var b = 1 + (g - 1) / 2 * M * M;
    return Math.pow(b / a, a / (g - 1)) / M;
  }

  function exitMach(eps, g) {
    var lo = 1.0001, hi = 30, mid = 0;
    for (var i = 0; i < 60; i++) {
      mid = (lo + hi) / 2;
      if (areaRatio(mid, g) < eps) lo = mid; else hi = mid;
    }
    return mid;
  }

  /* ---- the whole engine --------------------------------------------------- */

  function compute(opt) {
    var pcBar = opt.chamberBar, mr = opt.mixtureRatio;
    var eps = opt.expansion, throttle = opt.throttle;
    var altKm = opt.altKm || 0;

    var g = ENG.gamma;
    var Pc = pcBar * 1e5 * throttle;                    // Pa, throttled
    var Tc = chamberTempK(mr);
    var M = molarMass(mr);
    var Rs = RU / M;                                     // J/(kg·K)

    var rt = ENG.throatMM / 2000;                        // m
    var At = Math.PI * rt * rt;
    var Ae = At * eps;
    var re = Math.sqrt(Ae / Math.PI);

    /* characteristic velocity: everything the chamber does before the throat */
    var cStar = Math.sqrt(Rs * Tc / g) /
                Math.pow(2 / (g + 1), (g + 1) / (2 * (g - 1)));
    var mdot = Pc * At / cStar;                          // kg/s

    var Me = exitMach(eps, g);
    var Pe = Pc * Math.pow(1 + (g - 1) / 2 * Me * Me, -g / (g - 1));
    var Te = Tc / (1 + (g - 1) / 2 * Me * Me);
    var ve = Me * Math.sqrt(g * Rs * Te);                // m/s

    /* ambient pressure: exponential atmosphere, 8.4 km scale height */
    var Pa = PA_SL * Math.exp(-altKm / 8.4);

    var Fvac = mdot * ve + Pe * Ae;
    var Fsl = mdot * ve + (Pe - PA_SL) * Ae;
    var F = mdot * ve + (Pe - Pa) * Ae;

    /* A bell this big only works in vacuum. Below the separation limit the
       flow tears off the wall instead of filling it, which is a real physical
       cliff and worth showing rather than hiding. */
    var separated = Pe < Pa * 0.35;

    return {
      chamberBarActual: Pc / 1e5,
      throttle: throttle,
      Tc: Tc, molarMass: M,
      throatMM: ENG.throatMM,
      exitMM: re * 2000,
      areaRatio: eps,
      cStar: cStar,
      mdot: mdot,
      mdotOx: mdot * mr / (1 + mr),
      mdotFuel: mdot / (1 + mr),
      exitMach: Me,
      exitPressureBar: Pe / 1e5,
      exitTempK: Te,
      exhaustVel: ve,
      thrustVacKN: Fvac / 1000,
      thrustSLkN: Fsl / 1000,
      thrustKN: F / 1000,
      ispVac: Fvac / (mdot * G0),
      ispSL: Fsl / (mdot * G0),
      isp: F / (mdot * G0),
      twRatio: Fvac / (ENG.dryMassKg * G0),
      separated: separated,
      altKm: altKm
    };
  }

  /* Stage-level numbers for the launch readout. Thrust-to-weight at liftoff is
     the one that decides whether the thing moves at all: below 1.0 the rocket
     sits on the pad and burns, which the panel says out loud. */
  function stage(c) {
    var thrustN = c.thrustKN * 1000 * ENG.engineCount;
    var totalMdot = c.mdot * ENG.engineCount;
    return {
      thrustMN: thrustN / 1e6,
      liftoffTW: thrustN / (ENG.vehicleWetKg * G0),
      totalMdot: totalMdot,
      burnSeconds: (ENG.vehicleWetKg - ENG.vehicleDryKg) / totalMdot
    };
  }

  /* ---- materials ---------------------------------------------------------- */

  /* Indicative only. Nobody publishes an engine's bill of material; these
     shares exist to show the mix shift from "a crate of powder and bar stock"
     to "a plumbed, instrumented machine". */
  var MATERIALS = [
    { id: 'ni',    name: 'Nickel superalloy', color: '#b8863a' },
    { id: 'cu',    name: 'Copper alloy',      color: '#c2703c' },
    { id: 'ss',    name: 'Stainless',         color: '#8d949c' },
    { id: 'ti',    name: 'Titanium',          color: '#9a7fb0' },
    { id: 'al',    name: 'Aluminium',         color: '#7f97ac' },
    { id: 'elec',  name: 'Electronics',       color: '#4f9d78' },
    { id: 'seal',  name: 'Seals & insulation', color: '#a8a06a' },
    { id: 'comp',  name: 'Composites',        color: '#6d675e' }
  ];

  var MATERIAL_BY_ID = {};
  MATERIALS.forEach(function (m) { MATERIAL_BY_ID[m.id] = m; });

  /* What each station adds: material units (indicative mass share) and a part
     count. Machining is the one station with a negative material entry, which
     is the entire point of it — a finished part is a fraction of the blank. */
  var STATION_ADDS = {
    stock:     { parts: 0,   mat: {} },
    print:     { parts: 6,   mat: { ni: 26, cu: 14 } },
    machine:   { parts: 0,   mat: { ni: -9, cu: -4 } },
    channel:   { parts: 2,   mat: { cu: 4, ni: 5 } },
    braze:     { parts: 0,   mat: {} },
    nozzle:    { parts: 390, mat: { ni: 16, ss: 7 } },
    inject:    { parts: 248, mat: { ni: 6, cu: 3, ss: 2 } },
    pump:      { parts: 310, mat: { ni: 9, ti: 7, ss: 6 } },
    valve:     { parts: 186, mat: { ss: 9, ti: 3, seal: 5 } },
    avionics:  { parts: 940, mat: { elec: 6, al: 4, comp: 3 } },
    assy:      { parts: 1240, mat: { ss: 5, seal: 4, al: 3 } },
    ndt:       { parts: 0,   mat: {} },
    hotfire:   { parts: 0,   mat: {} },
    integrate: { parts: 260, mat: { al: 8, comp: 6, ss: 3 } }
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
    ENG: ENG,
    G0: G0,
    compute: compute,
    stage: stage,
    chamberTempK: chamberTempK,
    exitMach: exitMach,
    MATERIALS: MATERIALS,
    materialById: MATERIAL_BY_ID,
    STATION_ADDS: STATION_ADDS,
    totalParts: totalParts,
    group: group
  };
})(window);
