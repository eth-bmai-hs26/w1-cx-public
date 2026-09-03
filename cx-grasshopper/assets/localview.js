/* ============================================================================
   localview.js : what the grasshopper sees.

   A 620 by 380 window on the ground, with the grasshopper at the exact centre.
   The scales are fixed for the whole level:

     x : [theta - halfW, theta + halfW]  ->  [0, 620]
     y : [J(theta) - halfV, J(theta) + halfV]  ->  [380, 0]

   Both spans are constants of the level, so pixels per unit never change. That
   is the one rule that makes this view teach anything: a flat stretch looks
   flat, a steep stretch looks steep, and the tilt of the glyph IS the
   gradient. The vertical scale is never fitted to the visible window.

   The jump animation pans the view centre instead of moving the hopper: the
   ground slides horizontally under a fixed horizon while the glyph rides a
   parabolic arc above its resting point. At the end of the animation the
   drawing is exactly the drawing of the new resting state.

   API
     window.LocalView.create(hostEl, opts)
       -> { render(state), animateJump(fromTheta, toTheta, done), cancel() }

     state = { L: <landscape>, theta: <number>, hints: { grad, tangent },
               dir: <-1 or 1, which way the glyph faces> }

   Colours: every fill and stroke comes from a class in css/style.css or
   css/game.css. Nothing here writes a colour.
   ============================================================================ */
(function () {
  "use strict";

  var W = 620;          /* panel width in px, locked in css/game.css too */
  var H = 570;          /* panel height in px */
  var SAMPLES = 481;    /* points across the visible window */
  var FADE = 86;        /* px of eyesight fading out at each edge */
  var ARC = 82;         /* px, the top of the jump arc */
  var DUR = 620;        /* ms, one jump */
  var MAX_TILT = 70;    /* degrees, the clamp on the glyph rotation */

  /* The vertical window is fixed, so on a steep level the ground leaves the
     bottom of the frame. Without this the fill collapses to nothing there and
     the panel reads as a floating rock instead of as cropped ground, so the
     fill is never allowed to be thinner than STRIP px at the bottom edge. */
  var STRIP = 7;

  var seq = 0;

  function reduceMotion() {
    try {
      return !!(window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  /* cubic in out, so the jump leaves and lands softly */
  function ease(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  function signed(v, digits) {
    var s = v.toFixed(digits);
    return s.charAt(0) === "-" ? s : "+" + s;
  }

  function create(hostEl, opts) {
    opts = opts || {};

    var uid = "lv" + (++seq);
    var last = null;   /* the last state handed to render */
    var raf = 0;

    var svg = d3.select(hostEl).append("svg")
      .attr("class", "lv-svg")
      .attr("width", W)
      .attr("height", H)
      .attr("viewBox", "0 0 " + W + " " + H)
      .attr("role", "img")
      .attr("aria-label", "The patch of ground the grasshopper can see");

    /* === the two eyesight fades, coloured from CSS so the theme follows === */
    var defs = svg.append("defs");

    var gl = defs.append("linearGradient")
      .attr("id", uid + "-fade-left")
      .attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0");
    gl.append("stop").attr("offset", "0").attr("class", "fade-stop-full");
    gl.append("stop").attr("offset", "1").attr("class", "fade-stop-none");

    var gr = defs.append("linearGradient")
      .attr("id", uid + "-fade-right")
      .attr("x1", "0").attr("y1", "0").attr("x2", "1").attr("y2", "0");
    gr.append("stop").attr("offset", "0").attr("class", "fade-stop-none");
    gr.append("stop").attr("offset", "1").attr("class", "fade-stop-full");

    /* === back to front === */
    svg.append("rect").attr("class", "sky")
      .attr("x", 0).attr("y", 0).attr("width", W).attr("height", H);

    var groundPath = svg.append("path").attr("class", "ground");
    var curvePath = svg.append("path").attr("class", "curve");
    /* where the domain ends inside the window, so the player sees the world
       run out instead of seeing slope that a clamped jump cannot act on */
    var edgePath = svg.append("path").attr("class", "lv-edge");

    var tangentLine = svg.append("line").attr("class", "tangent");

    svg.append("rect").attr("class", "lv-fade")
      .attr("x", 0).attr("y", 0).attr("width", FADE).attr("height", H)
      .attr("fill", "url(#" + uid + "-fade-left)");
    svg.append("rect").attr("class", "lv-fade")
      .attr("x", W - FADE).attr("y", 0).attr("width", FADE).attr("height", H)
      .attr("fill", "url(#" + uid + "-fade-right)");

    /* === the glyph, built once. Its anchor (0, 0) is the contact point, it
       faces right, and it is about 34 px from hind leg to head. === */
    var hop = svg.append("g").attr("class", "lv-hopper");
    hop.append("ellipse").attr("class", "hopper-ring lv-halo")
      .attr("cx", -1).attr("cy", -8.5).attr("rx", 13.3).attr("ry", 6.9);
    /* the knee sits behind the thorax rather than above it: at the tilts a
       steep level produces, a knee drawn above the body swings over the back
       and the leg reads as a broken limb */
    hop.append("path").attr("class", "hopper-leg")
      .attr("d", "M -2 -8 L -13 -13 L -16.5 -0.5");
    hop.append("path").attr("class", "hopper-leg")
      .attr("d", "M 3.5 -6.5 L 6.5 -0.5");
    hop.append("ellipse").attr("class", "hopper-body")
      .attr("cx", -1).attr("cy", -8.5).attr("rx", 12).attr("ry", 5.6);
    hop.append("path").attr("class", "hopper-wing")
      .attr("d", "M -10 -10.6 Q -2 -13.8 6 -10.2");
    hop.append("circle").attr("class", "hopper-body")
      .attr("cx", 10.6).attr("cy", -11).attr("r", 4.8);
    hop.append("circle").attr("class", "hopper-dark")
      .attr("cx", 12.3).attr("cy", -11.8).attr("r", 1.5);
    hop.append("path").attr("class", "hopper-antenna")
      .attr("d", "M 13.6 -14 Q 18.6 -18.6 21.6 -21.6");

    /* === the gradient readout === */
    var badge = svg.append("g").attr("class", "lv-badge");
    badge.append("rect").attr("class", "badge-box")
      .attr("x", W / 2 + 26).attr("y", H / 2 - 88)
      .attr("width", 132).attr("height", 25).attr("rx", 3);
    var badgeText = badge.append("text").attr("class", "badge-ink")
      .attr("x", W / 2 + 36).attr("y", H / 2 - 70);

    var line = d3.line()
      .x(function (d) { return d.px; })
      .y(function (d) { return d.py; });

    /* y1 clamps to H - STRIP, not to the bottom edge: where the profile has
       dropped out of the vertical window the fill still carries a band along
       the bottom, so the frame reads as cropping ground that continues below.
       The profile line itself is drawn unclamped and simply runs off the
       panel, which is what tells the reader the ground went that way. */
    var area = d3.area()
      .x(function (d) { return d.px; })
      .y0(H + 2)
      .y1(function (d) { return Math.min(H - STRIP, d.py); });

    /* Draw the panel with the view centred on `centre`, the glyph lifted
       `lift` px above the ground. lift is 0 at rest. */
    function draw(st, centre, lift) {
      if (!st || !st.L) return;

      var L = st.L;
      var hints = st.hints || {};
      var halfW = L.view.halfW;
      var halfV = L.view.halfV;
      var pxT = W / (2 * halfW);          /* px per unit of theta */
      var pxJ = H / (2 * halfV);          /* px per unit of J */
      var jc = L.J(centre);

      /* the window is clamped to the domain: past either end there is no
         landscape, and drawing ground there would offer slope the grasshopper
         is never allowed to jump onto */
      var a = Math.max(L.domain[0], centre - halfW);
      var b = Math.min(L.domain[1], centre + halfW);
      var raw = window.Landscape.sampleCurve(L, a, b, SAMPLES);
      var pts = new Array(raw.length);
      var i;
      for (i = 0; i < raw.length; i++) {
        pts[i] = {
          px: W / 2 + (raw[i].t - centre) * pxT,
          py: H / 2 - (raw[i].J - jc) * pxJ
        };
      }

      groundPath.attr("d", area(pts));
      curvePath.attr("d", line(pts));

      var edges = "";
      if (a > centre - halfW + 1e-9) {
        edges += "M " + (W / 2 + (a - centre) * pxT) + " 0 V " + H + " ";
      }
      if (b < centre + halfW - 1e-9) {
        edges += "M " + (W / 2 + (b - centre) * pxT) + " 0 V " + H + " ";
      }
      edgePath.attr("d", edges || null);

      /* the slope in screen space : the tilt of the glyph is the gradient */
      var g = window.Landscape.grad(L, window.Landscape.clamp(L, centre));
      var mScreen = -g * pxJ / pxT;
      var tilt = Math.atan(mScreen) * 180 / Math.PI;
      if (tilt > MAX_TILT) tilt = MAX_TILT;
      if (tilt < -MAX_TILT) tilt = -MAX_TILT;

      if (hints.tangent) {
        tangentLine
          .attr("x1", 0).attr("y1", H / 2 + mScreen * (0 - W / 2))
          .attr("x2", W).attr("y2", H / 2 + mScreen * (W / 2))
          .attr("display", null);
      } else {
        tangentLine.attr("display", "none");
      }

      var facing = st.dir < 0 ? -1 : 1;
      hop.attr("transform",
        "translate(" + (W / 2) + "," + (H / 2 - lift) + ") rotate(" + tilt.toFixed(2) + ") scale(" + facing + ",1)");

      if (hints.grad) {
        badgeText.text("grad J = " + signed(g, 2));
        badge.attr("display", null);
      } else {
        badge.attr("display", "none");
      }

    }

    function cancel() {
      if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    function render(state) {
      cancel();
      last = state;
      draw(state, state.theta, 0);
    }

    function animateJump(fromTheta, toTheta, done) {
      var st = last;
      if (!st || !st.L) {
        if (done) done();
        return;
      }
      cancel();
      if (reduceMotion() || fromTheta === toTheta) {
        draw(st, toTheta, 0);
        if (done) done();
        return;
      }
      var t0 = null;
      function frame(ts) {
        if (t0 === null) t0 = ts;
        var u = (ts - t0) / DUR;
        if (u > 1) u = 1;
        var c = fromTheta + (toTheta - fromTheta) * ease(u);
        draw(st, c, ARC * Math.sin(Math.PI * u));
        if (u < 1) {
          raf = requestAnimationFrame(frame);
        } else {
          raf = 0;
          draw(st, toTheta, 0);
          if (done) done();
        }
      }
      raf = requestAnimationFrame(frame);
    }

    return { render: render, animateJump: animateJump, cancel: cancel };
  }

  window.LocalView = { create: create };
})();
