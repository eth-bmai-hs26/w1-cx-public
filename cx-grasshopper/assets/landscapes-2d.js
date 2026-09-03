/* ============================================================================
   landscapes-2d.js : the one valley that has two directions.

   Station nine needs a landscape where position is two numbers instead of one,
   and it needs to make exactly one point: nothing about the rule changed, only
   the number of numbers. So the surface is deliberately the same story the
   player already knows, told in one more dimension:

     a deeper floor     near (6.9, 6.4)  the bottom, stretched along the first
                                         direction so the two slopes there are
                                         never equal and the path has to bend
     a shallower floor  near (2.5, 3.0)  a genuine local minimum: the trap from
                                         "two valleys", now reachable from two
                                         directions instead of one
     a gentle tilt                       so the flat corners still lead somewhere

   Both dips are Gaussians, so the whole thing is a closed form with a closed
   form gradient: no sampling, no fitting, nothing random. The gradient is
   returned as a pair, one number per direction, which is the only new idea in
   the station.

   The deeper dip is stretched (s1 much wider than s2) on purpose. On a round
   dip the rule walks a straight line to the bottom and the picture says
   nothing; stretched, the steeper direction takes the larger share of every
   step, the path swings onto the ridge and then runs along it, and the two
   numbers in the table are visibly doing different things.

   window.LANDSCAPE2D = {
     domain: [lo, hi] (both directions), start: [t1, t2],
     J(t1, t2), grad(t1, t2) -> [g1, g2],
     floor: { theta: [t1, t2], J }, shallower: { theta: [t1, t2], J },
     range: { lo, hi }, clamp(t) -> [t1, t2]
   }
   ============================================================================ */
(function () {
  "use strict";

  var LO = 0;
  var HI = 10;

  /* centre, spread in each direction, and depth of each dip */
  var TALL = { c1: 6.8, c2: 6.4, s1: 3.2, s2: 1.5, h: 3.4 };
  var LESS = { c1: 2.4, c2: 2.8, s1: 1.4, s2: 1.4, h: 2.0 };
  var TILT = 0.02;   /* a slight lean, so nowhere is perfectly dead */

  function bump(B, t1, t2) {
    var u = (t1 - B.c1) / B.s1;
    var v = (t2 - B.c2) / B.s2;
    return B.h * Math.exp(-(u * u + v * v) / 2);
  }

  function J(t1, t2) {
    return -(0.4 + TILT * (t1 + t2) + bump(TALL, t1, t2) + bump(LESS, t1, t2));
  }

  /* d/dt of a Gaussian bump is the bump itself times -(t - centre) / s^2, so
     the gradient is written out rather than measured. The station still calls
     it "the slope in that direction", which is what it is. */
  function gradOf(B, t1, t2) {
    var b = bump(B, t1, t2);
    return [-b * (t1 - B.c1) / (B.s1 * B.s1), -b * (t2 - B.c2) / (B.s2 * B.s2)];
  }

  function grad(t1, t2) {
    var a = gradOf(TALL, t1, t2);
    var b = gradOf(LESS, t1, t2);
    return [-(TILT + a[0] + b[0]), -(TILT + a[1] + b[1])];
  }

  function clamp1(v) {
    if (!(v > LO)) return LO;
    if (v > HI) return HI;
    return v;
  }

  /* Both floors are shifted a little by the tilt and by each other's tail, so
     they are found rather than assumed: a few hundred steps of the very rule
     the station is about, run once at load. */
  function settle(t1, t2) {
    var i, g;
    for (i = 0; i < 4000; i++) {
      g = grad(t1, t2);
      t1 = clamp1(t1 - 0.05 * g[0]);
      t2 = clamp1(t2 - 0.05 * g[1]);
      if (Math.abs(g[0]) + Math.abs(g[1]) < 1e-9) break;
    }
    return [t1, t2];
  }

  function extremes() {
    var lo = Infinity;
    var hi = -Infinity;
    var i, j, v;
    for (i = 0; i <= 60; i++) {
      for (j = 0; j <= 60; j++) {
        v = J(LO + (HI - LO) * i / 60, LO + (HI - LO) * j / 60);
        if (v < lo) lo = v;
        if (v > hi) hi = v;
      }
    }
    return { lo: lo, hi: hi };
  }

  var floorT = settle(TALL.c1, TALL.c2);
  var shallowT = settle(LESS.c1, LESS.c2);

  window.LANDSCAPE2D = {
    id: "two-directions",
    domain: [LO, HI],
    /* Starts high on the far side of the ridge: the first run the player sees
       descends into the deeper floor, with a path that bends. The trap is one
       click away, in the lower left, and the verdict says so. */
    start: [2.0, 7.5],
    trap: [1.4, 1.2],
    J: J,
    grad: grad,
    floor: { theta: floorT, J: J(floorT[0], floorT[1]) },
    shallower: { theta: shallowT, J: J(shallowT[0], shallowT[1]) },
    range: extremes(),
    clamp: function (t) {
      return [clamp1(t[0]), clamp1(t[1])];
    }
  };
})();
