/* ============================================================================
   probeview.js : the ground under two probes.

   Stations two and three both need the same picture: a piece of valley, two
   probes a gap apart, their two heights, and, once it is earned, the line
   through them. It cannot be LocalView, whose window is a fixed constant of
   the level (halfW = 0.25): probes sit at theta +/- eps/2 and eps starts wider
   than that window and ends far narrower than it.

   The two heights are labelled where they are read, on plates beside their own
   probes, and the gap is bracketed under them. No axes: at the far end of
   station three the window is a millionth of a unit wide, and an axis there
   carries six identical tick labels and tells the reader nothing they cannot
   get from the panel beside it.

   It has two modes, and which one a station wants depends on what it is
   asking.

   ZOOM (the default). The window is a multiple of the gap and BOTH axes carry
   the same units per pixel, so they zoom together. Fit the vertical span to
   the visible curve instead and every zoom level looks identical, which is the
   opposite of the lesson. Zoomed this way the curve genuinely straightens as
   eps shrinks and the secant genuinely lies down on top of the tangent.

   WHOLE (state.window = [lo, hi]). A fixed stretch of landscape with the
   vertical span fitted to it, for the stations that need the reader to see
   where on the valley a reading is being taken. Lines stay lines under any
   scaling, so a secant drawn here is still exactly the line through its two
   probes; only the angle on screen is not to scale, which is why the zoom mode
   exists at all.

   API
     window.ProbeView.create(hostEl, opts) -> { render(state),
       zoomTo(state, fromEps, done), cancel() }

     state = {
       L,             the landscape
       theta,         where the reading is taken
       eps,           gap between the probes
       window,        [lo, hi] to draw that stretch instead of zooming
       showSecant,    draw the line through the two probes
       showTangent,   draw the true slope at theta
       showValues,    print a and b beside the probe dots (default true)
       extra          [{ theta, eps }] : earlier readings, drawn faint
     }

     opts = { width, height, span, window, showGap, label }

   Colours: every fill and stroke comes from a class in css/style.css.
   ============================================================================ */
(function () {
  "use strict";

  var W = 620;
  var H = 330;
  var SAMPLES = 481;
  var PAD = 44;          /* px kept clear at the bottom for the gap bracket */
  var SPAN = 3.4;        /* default: the window is this many gaps wide */
  var DUR = 520;         /* ms, one zoom */

  function reduceMotion() {
    try {
      return !!(window.matchMedia &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches);
    } catch (e) {
      return false;
    }
  }

  function ease(u) {
    return u < 0.5 ? 4 * u * u * u : 1 - Math.pow(-2 * u + 2, 3) / 2;
  }

  /* the same rendering of a small number the ladder table uses, so the frame
     and the table never disagree about what the gap is called */
  function fmtGap(e) {
    if (e >= 0.001) {
      var s = e.toFixed(6);
      if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
      return s;
    }
    return e.toExponential(0).replace("e-", " × 10⁻").replace("+", "");
  }

  function create(hostEl, opts) {
    opts = opts || {};
    var span = opts.span > 0 ? opts.span : SPAN;
    var w = opts.width > 0 ? opts.width : W;
    var h = opts.height > 0 ? opts.height : H;
    var showGap = opts.showGap !== false;
    var pad = showGap ? PAD : 12;

    var d3 = window.d3;
    var LS = window.Landscape;
    var raf = 0;

    var svg = d3.select(hostEl).append("svg")
      .attr("class", "pv-svg")
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("role", "img")
      .attr("aria-label", opts.label || "Two probes on the ground");

    var gGround = svg.append("g");
    var gLines = svg.append("g");
    var gMarks = svg.append("g");
    var gInk = svg.append("g");

    function draw(state) {
      var L = state.L;
      var theta = state.theta;
      var eps = Math.max(state.eps, 1e-9);
      var win = state.window || opts.window;
      var lo, hi, x, y, pts, i;

      if (win) {
        /* WHOLE: a fixed stretch, vertical span fitted to what is in it */
        lo = win[0];
        hi = win[1];
        pts = LS.sampleCurve(L, lo, hi, SAMPLES);
        var jlo = Infinity;
        var jhi = -Infinity;
        for (i = 0; i < pts.length; i++) {
          if (pts[i].J < jlo) jlo = pts[i].J;
          if (pts[i].J > jhi) jhi = pts[i].J;
        }
        var margin = 0.12 * (jhi - jlo || 1);
        x = d3.scaleLinear().domain([lo, hi]).range([0, w]);
        y = d3.scaleLinear().domain([jlo - margin, jhi + margin]).range([h - pad, 0]);
      } else {
        /* ZOOM: both spans from one factor, so units per pixel match on both
           axes and the curve is allowed to look as straight as it really is */
        var halfW = (span * eps) / 2;
        var unitsPerPx = (2 * halfW) / w;
        var halfV = (unitsPerPx * (h - pad)) / 2;
        lo = theta - halfW;
        hi = theta + halfW;
        x = d3.scaleLinear().domain([lo, hi]).range([0, w]);
        y = d3.scaleLinear()
          .domain([L.J(theta) - halfV, L.J(theta) + halfV])
          .range([h - pad, 0]);
        pts = LS.sampleCurve(L, lo, hi, SAMPLES);
      }

      gGround.selectAll("*").remove();
      gLines.selectAll("*").remove();
      gMarks.selectAll("*").remove();
      gInk.selectAll("*").remove();

      gGround.append("rect")
        .attr("class", "sky")
        .attr("x", 0).attr("y", 0)
        .attr("width", w).attr("height", h);

      var area = d3.area()
        .x(function (p) { return x(p.t); })
        .y0(h)
        .y1(function (p) { return y(p.J); });
      var line = d3.line()
        .x(function (p) { return x(p.t); })
        .y(function (p) { return y(p.J); });

      gGround.append("path").attr("class", "ground").attr("d", area(pts));
      gGround.append("path").attr("class", "curve").attr("d", line(pts));

      var l = theta - eps / 2;
      var r = theta + eps / 2;
      var a = L.J(l);
      var b = L.J(r);
      var plates = [];

      /* === readings already taken, left on the picture === */

      if (state.extra && state.extra.length) {
        state.extra.forEach(function (e) {
          var ea = L.J(e.theta - e.eps / 2);
          var eb = L.J(e.theta + e.eps / 2);
          var em = (eb - ea) / e.eps;
          var half = Math.min((hi - lo) * 0.16, 1.4);
          gLines.append("line")
            .attr("class", "secant-past")
            .attr("x1", x(e.theta - half)).attr("y1", y(L.J(e.theta) - em * half))
            .attr("x2", x(e.theta + half)).attr("y2", y(L.J(e.theta) + em * half));
          gMarks.append("circle")
            .attr("class", "probe-dot-past")
            .attr("cx", x(e.theta)).attr("cy", y(L.J(e.theta))).attr("r", 3.5);
        });
      }

      /* On a whole-valley view a line drawn right across the frame leaves the
         valley entirely and takes the eye with it, so there it is a short
         segment through the point instead. In the zoom it spans the frame,
         because in the zoom it IS the frame. */
      var reach = win ? (hi - lo) * 0.11 : (hi - lo) / 2;

      var secant = null;
      if (state.showSecant) {
        var m = (b - a) / eps;
        var s0 = theta - reach;
        var s1 = theta + reach;
        secant = {
          px0: x(s0), py0: y(a + m * (s0 - l)),
          px1: x(s1), py1: y(a + m * (s1 - l))
        };
        gLines.append("line")
          .attr("class", "secant")
          .attr("x1", secant.px0).attr("y1", secant.py0)
          .attr("x2", secant.px1).attr("y2", secant.py1);
      }

      /* The true slope goes on TOP of the secant, not under it: at a narrow
         gap the two lines are the same line, and the only way to see that is
         for the dashes to show through. */
      if (state.showTangent) {
        var g = LS.grad(L, theta);
        var t0 = theta - reach;
        var t1 = theta + reach;
        gLines.append("line")
          .attr("class", "tangent")
          .attr("x1", x(t0)).attr("y1", y(L.J(theta) + g * (t0 - theta)))
          .attr("x2", x(t1)).attr("y2", y(L.J(theta) + g * (t1 - theta)));
      }

      /* === the two readings, dropped onto the axes === */

      /* probe drops, so the two heights read as measurements off the ground
         rather than as two dots floating on a curve */
      [[l, a], [r, b]].forEach(function (p) {
        gMarks.append("line")
          .attr("class", "probe-drop")
          .attr("x1", x(p[0])).attr("y1", y(p[1]))
          .attr("x2", x(p[0])).attr("y2", h - pad);
        gMarks.append("circle")
          .attr("class", "probe-dot")
          .attr("cx", x(p[0])).attr("cy", y(p[1])).attr("r", 5);
      });

      gMarks.append("circle")
        .attr("class", "here-dot")
        .attr("cx", x(theta)).attr("cy", y(L.J(theta))).attr("r", 4);

      /* Every label rides on a plate in the panel colour. Near the top of a
         valley the two probes and the standing point are within a few pixels of
         each other and of the curve, and bare text there is unreadable
         whichever way it is nudged. The plates lean outward from the pair so
         they do not cover the thing they are labelling. */
      function plate(cls, px, py, text, anchor) {
        var pw = text.length * 6.6 + 12;
        var cx = Math.max(4, Math.min(w - pw - 4,
          anchor === "end" ? px - pw : (anchor === "middle" ? px - pw / 2 : px)));
        var cy = Math.max(4, Math.min(h - pad - 22, py - 13));
        /* kept so the slope label, placed last, can steer around them */
        plates.push({ x: cx, y: cy, w: pw, h: 18 });
        var g = gInk.append("g");
        g.append("rect")
          .attr("class", "pv-plate")
          .attr("x", cx).attr("y", cy)
          .attr("width", pw).attr("height", 18).attr("rx", 3);
        g.append("text")
          .attr("class", cls)
          .attr("x", cx + pw / 2).attr("y", cy + 13)
          .attr("text-anchor", "middle")
          .text(text);
      }

      if (state.showValues !== false) {
        plate("probe-ink", x(l) - 10, y(a) + 24, "a = " + a.toFixed(3), "end");
        plate("probe-ink", x(r) + 10, y(b) + 24, "b = " + b.toFixed(3), "start");
      }

      /* The line named on the line, in the line's own colour, so which mark on
         the picture is the slope never has to be inferred. "Slope line" rather
         than "Slope": the slope is the NUMBER (b - a) / gap, the one the table
         column of that name holds, and this is the line whose steepness is that
         number. Labelling the line "Slope" would quietly teach that the slope is
         something you can see rather than something you work out.

         Placed last, after the height plates, because it is the one label here
         free to move: it walks in from the right along the line until it finds a
         spot inside the frame and clear of the plates.

         The step off the line is along the normal rather than straight up. The
         label is some 68px wide, and on a steep line a purely vertical nudge
         leaves it lying across the very line it names. Of the two normals,
         (dy, -dx) is the one pointing up the screen, dx being positive here.

         Only on a segment with room to be labelled. The test is the drawn
         length rather than the mode: station two's whole-valley view draws a
         136px segment and carries the label, while the locator strip beside
         station three's zoom draws about 57px, where the label would be wider
         than the line it names. */
      var secLen = secant
        ? Math.sqrt(Math.pow(secant.px1 - secant.px0, 2) +
            Math.pow(secant.py1 - secant.py0, 2))
        : 0;
      if (secant && secLen >= 120) {
        var dx = secant.px1 - secant.px0;
        var dy = secant.py1 - secant.py0;
        var lw = 68;
        var lh = 17;
        /* How far the label has to step off the line to clear it. The label is
           an upright box, so the distance needed depends on the line's angle:
           a*|sin| + b*|cos| for a box of half-width a and half-height b. Flat
           lines need barely more than half the label's height, steep ones need
           most of its half-width, and a fixed offset that suits one leaves the
           other either grazed or adrift. */
        var off = (lw / 2) * Math.abs(dy) / secLen +
          (lh / 2) * Math.abs(dx) / secLen + 6;
        var nx = (dy / secLen) * off;
        var ny = (-dx / secLen) * off;
        var spot = null;
        var k;
        for (k = 0.82; k > 0.06; k -= 0.02) {
          var cx2 = secant.px0 + dx * k + nx;
          var cy2 = secant.py0 + dy * k + ny;
          if (cx2 - lw / 2 < 4 || cx2 + lw / 2 > w - 4) continue;
          if (cy2 - lh / 2 < 4 || cy2 + lh / 2 > h - pad - 4) continue;
          var clash = plates.some(function (p) {
            return cx2 + lw / 2 > p.x - 3 && cx2 - lw / 2 < p.x + p.w + 3 &&
              cy2 + lh / 2 > p.y - 3 && cy2 - lh / 2 < p.y + p.h + 3;
          });
          if (!clash) { spot = { x: cx2, y: cy2 }; break; }
        }
        if (spot) {
          gInk.append("text")
            .attr("class", "slope-ink")
            .attr("x", spot.x)
            .attr("y", spot.y + 4)   /* baseline down to optical centre */
            .attr("text-anchor", "middle")
            .text("Slope line");
        }
      }

      /* The gap, measured along the bottom edge, and on a whole-valley view a
         band between the two probes as well: at that scale the gap is a
         fortieth of the frame, and a bracket alone under it is easy to read as
         belonging to the whole picture rather than to the two dots. The band
         is drawn behind the marks, in the probes' own colour, so it reads as
         the stretch of ground the reading covers. */
      if (!showGap) return;
      if (win) {
        gGround.append("rect")
          .attr("class", "gap-band")
          .attr("x", x(l)).attr("y", 0)
          .attr("width", Math.max(2, x(r) - x(l)))
          .attr("height", h - pad);
      }
      var gy = h - pad + 16;
      gMarks.append("line")
        .attr("class", "gap-mark")
        .attr("x1", x(l)).attr("y1", gy).attr("x2", x(r)).attr("y2", gy);
      [l, r].forEach(function (t) {
        gMarks.append("line")
          .attr("class", "gap-mark")
          .attr("x1", x(t)).attr("y1", gy - 5)
          .attr("x2", x(t)).attr("y2", gy + 5);
      });
      gInk.append("text")
        .attr("class", "gap-ink")
        .attr("x", x(theta))
        .attr("y", gy + 17)
        .attr("text-anchor", "middle")
        .text("gap = " + fmtGap(eps));
    }

    function cancel() {
      if (raf) {
        window.cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    /* The zoom is the whole argument of station three, so it is animated: the
       probes walk in, the frame closes on them, and the curve flattens under
       both. Instant when the reader has asked for less motion, and instant on
       a whole-valley view, where there is nothing to zoom. */
    function zoomTo(state, fromEps, done) {
      cancel();
      if (reduceMotion() || !(fromEps > 0) || state.window || opts.window) {
        draw(state);
        if (done) done();
        return;
      }
      var k0 = Math.log(fromEps);
      var k1 = Math.log(Math.max(state.eps, 1e-9));
      var t0 = null;

      /* requestAnimationFrame does not fire in a background tab, and a
         headless renderer may never fire it at all. The picture is not allowed
         to be a frame behind the numbers beside it, so the final state is
         drawn unconditionally once the animation's time is up. */
      var guard = window.setTimeout(function () {
        if (!raf) return;
        window.cancelAnimationFrame(raf);
        raf = 0;
        draw(state);
        if (done) done();
      }, DUR + 240);

      var frame = function (ts) {
        if (t0 === null) t0 = ts;
        var u = Math.min(1, (ts - t0) / DUR);
        var e = Math.exp(k0 + (k1 - k0) * ease(u));
        draw({
          L: state.L, theta: state.theta, eps: e,
          window: state.window,
          showSecant: state.showSecant, showTangent: state.showTangent,
          showValues: state.showValues, extra: state.extra
        });
        if (u < 1) {
          raf = window.requestAnimationFrame(frame);
        } else {
          raf = 0;
          window.clearTimeout(guard);
          draw(state);
          if (done) done();
        }
      };
      raf = window.requestAnimationFrame(frame);
    }

    return {
      render: function (state) { cancel(); draw(state); },
      zoomTo: zoomTo,
      cancel: cancel
    };
  }

  window.ProbeView = { create: create };
})();
