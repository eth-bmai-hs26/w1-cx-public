/* ============================================================================
   worldview.js : the truth.

   The whole domain in one 740 by 280 panel: the real profile, the sliver the
   grasshopper can currently see, and every position it has visited. This is
   the view the player is not entitled to, so the game only mounts it when the
   landscape switch is on or the flag has been planted.

   The floor is NOT marked until the player commits. Before that the panel
   shows where you have been, never where you should have gone.

   API
     window.WorldView.create(hostEl, opts) -> { render(state), clear() }

     state = { L, theta, trail: [theta...], committed: bool }

   clear() empties every path in the panel. The game calls it whenever the card
   goes back into hiding, so a landscape the player has not earned is not left
   sitting in the DOM behind a display:none.

   Colours: every fill and stroke comes from a class in css/style.css or
   css/game.css. Nothing here writes a colour.
   ============================================================================ */
(function () {
  "use strict";

  var W = 740;
  var H = 570;
  var M = { top: 16, right: 18, bottom: 32, left: 58 };
  var SAMPLES = 901;

  function fmt1(v) {
    return v.toFixed(1);
  }

  function create(hostEl, opts) {
    opts = opts || {};
    var w = opts.width > 0 ? opts.width : W;
    var h = opts.height > 0 ? opts.height : H;

    var svg = d3.select(hostEl).append("svg")
      .attr("class", "wv-svg")
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("role", "img")
      .attr("aria-label", "The whole landscape, which the grasshopper cannot see");

    var pw = w - M.left - M.right;
    var ph = h - M.top - M.bottom;
    var x0 = M.left;
    var y0 = M.top;
    var x1 = x0 + pw;
    var y1 = y0 + ph;

    svg.append("rect").attr("class", "sky")
      .attr("x", x0).attr("y", y0).attr("width", pw).attr("height", ph);

    var groundPath = svg.append("path").attr("class", "ground-world");
    var band = svg.append("rect").attr("class", "window-band")
      .attr("y", y0).attr("height", ph);
    var curvePath = svg.append("path").attr("class", "curve wv-curve");
    var bandEdges = svg.append("path").attr("class", "window-edge");

    var gAxis = svg.append("g").attr("class", "wv-axis");
    var gTrail = svg.append("g").attr("class", "wv-trail");
    var trailLine = gTrail.append("path").attr("class", "trail-line");
    var gDots = gTrail.append("g");
    /* Sits behind the grasshopper in paint order, so the floor disc never
       covers the glyph once the two coincide. */
    var gFloorDot = svg.append("g").attr("class", "wv-floordot");
    /* The same glyph localview.js draws, scaled down for the zoomed out
       panel. Its anchor (0, 0) is the contact point, it faces right, and it
       is about 34px from hind leg to head before the scale below. */
    var gHopper = svg.append("g").attr("class", "wv-hopper");
    var hop = gHopper.append("g").attr("transform", "scale(0.62)");
    hop.append("ellipse").attr("class", "hopper-ring lv-halo")
      .attr("cx", -1).attr("cy", -8.5).attr("rx", 13.3).attr("ry", 6.9);
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
    var gMarks = svg.append("g").attr("class", "wv-marks");

    var line = d3.line()
      .x(function (d) { return d.px; })
      .y(function (d) { return d.py; });

    var area = d3.area()
      .x(function (d) { return d.px; })
      .y0(y1)
      .y1(function (d) { return d.py; });

    /* Kept from the last render so a click can invert pixel back to theta.
       Rebuilt every render because the domain — and so the scale — is a
       property of the level, not a constant of the panel. */
    var lastX = null;

    /* Opt-in: only a caller that hands over onClick gets a clickable panel,
       so the descent stations' read-only view of the truth is untouched. A
       click outside the plot, past the axis into the margin, is ignored
       rather than clamped into the nearest edge. */
    if (opts.onClick) {
      svg.style("cursor", "pointer").on("click", function (event) {
        if (!lastX) return;
        var px = d3.pointer(event, svg.node())[0];
        if (px < x0 || px > x1) return;
        opts.onClick(lastX.invert(px));
      });
    }

    function render(state) {
      if (!state || !state.L) return;
      var L = state.L;
      var span = L.range.hi - L.range.lo;

      var x = d3.scaleLinear().domain(L.domain).range([x0, x1]);
      var y = d3.scaleLinear()
        .domain([L.range.lo - 0.10 * span, L.range.hi + 0.18 * span])
        .range([y1, y0]);
      lastX = x;

      /* === the profile === */
      var raw = window.Landscape.sampleCurve(L, L.domain[0], L.domain[1], SAMPLES);
      var pts = new Array(raw.length);
      var i;
      for (i = 0; i < raw.length; i++) {
        pts[i] = { px: x(raw[i].t), py: y(raw[i].J) };
      }
      groundPath.attr("d", area(pts));
      curvePath.attr("d", line(pts));

      /* === the sliver the grasshopper can see === */
      var bl = x(window.Landscape.clamp(L, state.theta - L.view.halfW));
      var br = x(window.Landscape.clamp(L, state.theta + L.view.halfW));
      band.attr("x", bl).attr("width", Math.max(1, br - bl));
      bandEdges.attr("d",
        "M " + bl + " " + y0 + " L " + bl + " " + y1 +
        " M " + br + " " + y0 + " L " + br + " " + y1);

      /* === axes === */
      gAxis.selectAll("*").remove();
      gAxis.append("line").attr("class", "axis-line")
        .attr("x1", x0).attr("y1", y1).attr("x2", x1).attr("y2", y1);

      var xt = x.ticks(Math.min(13, Math.round(L.domain[1] - L.domain[0]) + 1));
      xt.forEach(function (t) {
        gAxis.append("line").attr("class", "axis-line")
          .attr("x1", x(t)).attr("y1", y1).attr("x2", x(t)).attr("y2", y1 + 4);
        gAxis.append("text").attr("class", "axis-ink")
          .attr("x", x(t)).attr("y", y1 + 16)
          .attr("text-anchor", "middle")
          .text(String(t));
      });
      /* centred under the axis, the ordinary place a horizontal axis label
         stands, rather than tucked as a caption at its right end */
      gAxis.append("text").attr("class", "axis-title")
        .attr("x", (x0 + x1) / 2).attr("y", y1 + 28)
        .attr("text-anchor", "middle")
        .text("position");

      y.ticks(3).forEach(function (v) {
        gAxis.append("line").attr("class", "axis-line")
          .attr("x1", x0 - 4).attr("y1", y(v)).attr("x2", x0).attr("y2", y(v));
        gAxis.append("text").attr("class", "axis-ink")
          .attr("x", x0 - 7).attr("y", y(v) + 3.5)
          .attr("text-anchor", "end")
          .text(fmt1(v));
      });
      /* standing beside the axis it labels, rotated upright rather than laid
         across the top-left corner of the plot: the ordinary place a vertical
         axis label stands. Centred on the tick column's own centre, clear of
         the tick numbers, which end at x0 - 7. */
      gAxis.append("text").attr("class", "axis-title")
        .attr("x", 0).attr("y", 0)
        .attr("text-anchor", "middle")
        .attr("transform",
          "translate(14," + ((y0 + y1) / 2) + ") rotate(-90)")
        .text("height");

      /* === the trail === */
      var trail = state.trail || [];
      var tp = trail.map(function (t) {
        return { px: x(t), py: y(L.J(t)) };
      });
      trailLine.attr("d", tp.length > 1 ? line(tp) : null);

      var dots = gDots.selectAll("circle").data(tp);
      dots.exit().remove();
      dots.enter().append("circle").attr("class", "trail-dot")
        .merge(dots)
        .attr("cx", function (d) { return d.px; })
        .attr("cy", function (d) { return d.py; })
        .attr("r", function (d, k) { return Math.min(6, 2.6 + 0.22 * k); });

      /* === where the grasshopper stands === */
      gHopper
        .attr("display", null)
        .attr("transform",
          "translate(" + x(state.theta) + "," + y(L.J(state.theta)) + ")");

      /* === after the flag is planted, and only then, the truth === */
      gMarks.selectAll("*").remove();
      gFloorDot.selectAll("*").remove();
      if (!state.committed) return;

      /* The label rides at the top of the panel on a dashed leader, so it
         never fights the flag when the player finishes next to the floor. */
      var sx = x(L.floor.theta);
      var sy = y(L.floor.J);
      var fx = x(state.theta);
      var fy = y(L.J(state.theta));
      var ly = y0 + 15;

      /* A player who solved the level lands on the floor, putting the amber
         floor disc and the grasshopper on the same point. The disc sits in
         gFloorDot, behind the glyph in paint order, so the grasshopper's own
         art stays visible standing on it rather than being covered. */
      var fused = Math.abs(sx - fx) < 6 && Math.abs(sy - fy) < 6;
      gMarks.append("line").attr("class", "peak-mark")
        .attr("x1", sx).attr("y1", sy - (fused ? 10 : 7))
        .attr("x2", sx).attr("y2", ly + 4);
      gFloorDot.append("circle").attr("class", "peak-dot")
        .attr("cx", sx).attr("cy", sy).attr("r", fused ? 7.6 : 4.6);

      /* the label goes on the side the flag is not on, never off the right
         edge, and never on top of the amber window band */
      var right = fx < sx;
      if (sx > x1 - 80) right = false;
      if (sx < x0 + 80) right = true;
      if (sx >= bl - 8 && sx <= br + 8) right = br + 84 < x1;
      var lx = right ? Math.max(sx, br) + 8 : Math.min(sx, bl) - 8;
      gMarks.append("text").attr("class", "peak-ink")
        .attr("x", lx).attr("y", ly)
        .attr("text-anchor", right ? "start" : "end")
        .text("the floor");

      /* the pole is drawn last, so it covers the dashed leader over its own
         length and the flag reads as planted in the marker rather than as
         floating above it */
      var side = fx > x1 - 34 ? -1 : 1;
      gMarks.append("line").attr("class", "flag-pole")
        .attr("x1", fx).attr("y1", fy).attr("x2", fx).attr("y2", fy - 26);
      gMarks.append("path").attr("class", "flag-cloth")
        .attr("d",
          "M " + fx + " " + (fy - 26) +
          " L " + (fx + side * 14) + " " + (fy - 21.5) +
          " L " + fx + " " + (fy - 17) + " Z");
    }

    function clear() {
      groundPath.attr("d", null);
      curvePath.attr("d", null);
      bandEdges.attr("d", null);
      trailLine.attr("d", null);
      band.attr("width", 0);
      gDots.selectAll("circle").remove();
      gAxis.selectAll("*").remove();
      gMarks.selectAll("*").remove();
      gFloorDot.selectAll("*").remove();
      gHopper.attr("display", "none");
    }

    return { render: render, clear: clear };
  }

  window.WorldView = { create: create };
})();
