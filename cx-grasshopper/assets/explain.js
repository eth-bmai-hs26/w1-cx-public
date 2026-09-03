/* ============================================================================
   explain.js : the explanation that sits below the game.
   Four parts, four figures. Exposes window.Explain.mount(root).

   Every figure is computed, never drawn by hand. The valleys are real
   functions, the paths are real iterations of the update rule (see descend),
   and the gradient values printed under figure B come out of the same
   derivative the figure draws. Change a parameter and the picture changes
   with it.

   Colour never appears in this file. Everything is a CSS class from
   css/style.css or css/explain.css, which is what makes both themes work.

   The section is mounted with the page and is NOT gated on a first commit.
   That is a decision, not an oversight: it is written in the past tense and
   gives the game away, but a lecturer needs to be able to scroll to it and
   read from it without playing five levels first, and a reader who scrolls
   past the game has chosen to skip the discovery. The cost is that the first
   sentence of a section titled "After the descent" can be read before the
   descent.
   ============================================================================ */
(function () {
  "use strict";

  var d3 = window.d3;
  var katex = window.katex;

  /* ======================================================================
     1. Landscapes
     Figures A, B and C all read the same single valley, so the reader meets
     one shape three times. Figure D needs a second floor, so it has its
     own function.

     hill() and twoHills() are the negative of what they would be for an
     ascent figure: J is negated at the source here exactly as it is in
     landscapes.js, so the same theta a plus-sign update once walked toward
     is still where a minus-sign update walks to, and the marked point is a
     minimum rather than a maximum.
     ====================================================================== */

  var K = Math.PI / 5;

  function hill(t) { return -(1.5 * (1 + Math.cos(K * (t - 5)))); }
  function hillGrad(t) { return 1.5 * K * Math.sin(K * (t - 5)); }

  function twoHills(t) {
    return -(1.9 * Math.exp(-Math.pow(t - 2.6, 2) / 1.6) +
             3.0 * Math.exp(-Math.pow(t - 7.0, 2) / 2.6));
  }
  function twoHillsGrad(t) {
    return -(1.9 * Math.exp(-Math.pow(t - 2.6, 2) / 1.6) * (-2 * (t - 2.6) / 1.6) +
             3.0 * Math.exp(-Math.pow(t - 7.0, 2) / 2.6) * (-2 * (t - 7.0) / 2.6));
  }

  /* the update rule, run for real. Every path in every figure comes from
     here and from nowhere else. */
  function descend(grad, t0, alpha, steps) {
    var path = [t0], t = t0, i;
    for (i = 0; i < steps; i++) {
      t = t - alpha * grad(t);
      path.push(t);
    }
    return path;
  }

  function samples(f, lo, hi, n) {
    var out = [], i, t;
    for (i = 0; i <= n; i++) {
      t = lo + (hi - lo) * i / n;
      out.push([t, f(t)]);
    }
    return out;
  }

  /* U+2212 MINUS SIGN, not an ASCII hyphen: this figure is about the sign, and
     a short high hyphen next to a full width plus does not read as its
     opposite. (U+2212 is a minus, not a dash.) */
  function fmtGrad(v) {
    if (Math.abs(v) < 5e-3) return "0";
    return (v > 0 ? "+" : "−") + Math.abs(v).toFixed(2);
  }

  /* ======================================================================
     2. Drawing helpers
     ====================================================================== */

  function makeSvg(host, cls, w, h) {
    return d3.select(host).append("svg")
      .attr("class", cls)
      .attr("width", w)
      .attr("height", h)
      .attr("viewBox", "0 0 " + w + " " + h)
      .attr("role", "img");
  }

  /* mixed maths and words inside one SVG text node */
  function tspans(text, parts) {
    parts.forEach(function (p) {
      var t = text.append("tspan").text(p[1]);
      if (p[0]) t.attr("class", p[0]);
    });
    return text;
  }

  /* the grasshopper, foot at the origin, rotated by the slope it stands on */
  function hopper(parent, x, y, angleDeg, scale) {
    var g = parent.append("g").attr("transform",
      "translate(" + x + "," + y + ") rotate(" + angleDeg + ") scale(" + scale + ")");
    g.append("path").attr("class", "fig-leg").attr("d", "M -1 -6.5 L -8.5 -16 L -11.5 -0.5");
    g.append("path").attr("class", "fig-leg").attr("d", "M 3 -5.5 L 6 -1 L 4 0.5");
    g.append("ellipse").attr("class", "hopper-body")
      .attr("cx", 0).attr("cy", -8.5).attr("rx", 9).attr("ry", 5);
    g.append("circle").attr("class", "hopper-body")
      .attr("cx", 7.2).attr("cy", -13.2).attr("r", 3.9);
    g.append("path").attr("class", "fig-antenna").attr("d", "M 9.4 -16.2 L 12.6 -23.4");
    g.append("circle").attr("class", "fig-eye")
      .attr("cx", 8.4).attr("cy", -14.2).attr("r", 1.1);
    return g;
  }

  /* a chain of hops : one arc per step, so the size of a step and the
     direction of a step are both visible. nest lifts each successive arc a
     little, which is only a drawing aid : it keeps repeated crossings of the
     same stretch of ground countable instead of stacked on each other. The
     landing points are exact either way. */
  function drawHops(g, pts, x, y, f, nest) {
    var i, s, x1, y1, x2, y2, topY, chordY, apexY, lift;
    nest = nest || 0;
    for (i = 0; i < pts.length - 1; i++) {
      x1 = x(pts[i]); y1 = y(f(pts[i]));
      x2 = x(pts[i + 1]); y2 = y(f(pts[i + 1]));
      if (Math.abs(x2 - x1) < 1.5) continue;
      /* clear the highest ground the hop passes over, so a jump that crosses
         a ridge is drawn crossing it */
      topY = Math.min(y1, y2);
      for (s = 1; s < 24; s++) {
        topY = Math.min(topY, y(f(pts[i] + (pts[i + 1] - pts[i]) * s / 24)));
      }
      chordY = (y1 + y2) / 2;
      lift = Math.min(21, 7 + nest * i);
      apexY = Math.min(chordY, topY) - lift;
      g.append("path").attr("class", "fig-hop").attr("d",
        "M " + x1 + " " + y1 +
        " Q " + ((x1 + x2) / 2) + " " + (2 * apexY - chordY) +
        " " + x2 + " " + y2);
    }
    for (i = 0; i < pts.length; i++) {
      g.append("circle").attr("class", "trail-dot")
        .attr("cx", x(pts[i])).attr("cy", y(f(pts[i]))).attr("r", 2.7);
    }
    g.append("circle").attr("class", "fig-start")
      .attr("cx", x(pts[0])).attr("cy", y(f(pts[0]))).attr("r", 3.6);
  }

  /* ======================================================================
     3. Figure A : the landscape has a name
     ====================================================================== */

  function figureA(host) {
    var W = 560, H = 250;
    var svg = makeSvg(host, "fig-a", W, H);
    var x = d3.scaleLinear().domain([0, 10]).range([48, 528]);
    var y = d3.scaleLinear().domain([-3.2, 0]).range([206, 40]);
    var pts = samples(hill, 0, 10, 300);

    var line = d3.line().x(function (p) { return x(p[0]); }).y(function (p) { return y(p[1]); });
    var area = d3.area().x(function (p) { return x(p[0]); })
      .y0(y(-3.2)).y1(function (p) { return y(p[1]); });

    svg.append("path").attr("class", "ground").attr("d", area(pts));
    svg.append("path").attr("class", "curve").attr("d", line(pts));

    svg.append("line").attr("class", "axis-line")
      .attr("x1", 40).attr("y1", y(0)).attr("x2", 540).attr("y2", y(0));
    svg.append("line").attr("class", "axis-line")
      .attr("x1", 48).attr("y1", y(-3.2)).attr("x2", 48).attr("y2", 38);

    svg.append("text").attr("class", "axis-title")
      .attr("x", 528).attr("y", 226).attr("text-anchor", "end").text("position");
    svg.append("text").attr("class", "axis-title")
      .attr("x", 48).attr("y", 30).text("height");

    /* one position, read off the landscape */
    var tm = 2.4, jm = hill(tm);
    svg.append("line").attr("class", "hz-line")
      .attr("x1", x(tm)).attr("y1", y(0)).attr("x2", x(tm)).attr("y2", y(jm));
    svg.append("line").attr("class", "hz-line")
      .attr("x1", 48).attr("y1", y(jm)).attr("x2", x(tm)).attr("y2", y(jm));
    svg.append("circle").attr("class", "fig-dot")
      .attr("cx", x(tm)).attr("cy", y(jm)).attr("r", 3.6);
    tspans(svg.append("text").attr("class", "label-ink fig-sym")
      .attr("x", 42).attr("y", y(jm) + 4).attr("text-anchor", "end"),
      [["fig-math", "J(\u03b8)"]]);
    tspans(svg.append("text").attr("class", "label-ink fig-sym")
      .attr("x", x(tm)).attr("y", y(0) + 19).attr("text-anchor", "middle"),
      [["fig-math", "\u03b8"]]);

    /* the floor */
    var tp = 5, jp = hill(tp);
    svg.append("line").attr("class", "peak-mark")
      .attr("x1", x(tp)).attr("y1", y(jp)).attr("x2", x(tp)).attr("y2", y(0));
    svg.append("circle").attr("class", "peak-dot")
      .attr("cx", x(tp)).attr("cy", y(jp)).attr("r", 4);
    tspans(svg.append("text").attr("class", "peak-ink")
      .attr("x", x(tp)).attr("y", y(jp) - 13).attr("text-anchor", "middle"),
      [[null, "the smallest "], ["fig-math", "J"]]);
  }

  /* ======================================================================
     4. Figure B : what the grasshopper feels
     ====================================================================== */

  function figureB(host) {
    var W = 660, H = 186;
    var svg = makeSvg(host, "fig-b", W, H);
    var PW = 200, GAP = 30, TOP = 6, PH = 124;
    var PPX = 90;      /* pixels per unit of position */
    var PPY = 51.4;    /* pixels per unit of height, the same in all three
                          panels so the three slopes are comparable */
    var MIDY = TOP + PH / 2;

    var panels = [
      { c: 2.2, note: "downhill is to the right" },
      { c: 8.9, note: "downhill is to the left" },
      { c: 5.0, note: "no downhill at all: a floor" }
    ];

    panels.forEach(function (p, i) {
      var g = svg.append("g").attr("transform", "translate(" + (i * (PW + GAP)) + ",0)");
      var jc = hill(p.c), gr = hillGrad(p.c);
      var x = function (t) { return 100 + (t - p.c) * PPX; };
      var y = function (j) { return MIDY - (j - jc) * PPY; };

      var clipId = "fig-b-clip-" + i;
      g.append("clipPath").attr("id", clipId).append("rect")
        .attr("x", 1).attr("y", TOP).attr("width", PW - 2).attr("height", PH);

      g.append("rect").attr("class", "fig-frame")
        .attr("x", 0.5).attr("y", TOP + 0.5).attr("width", PW - 1)
        .attr("height", PH - 1).attr("rx", 3);

      var inner = g.append("g").attr("clip-path", "url(#" + clipId + ")");
      var pts = samples(hill, p.c - 1.1, p.c + 1.1, 120);
      var line = d3.line().x(function (q) { return x(q[0]); }).y(function (q) { return y(q[1]); });
      var area = d3.area().x(function (q) { return x(q[0]); })
        .y0(TOP + PH).y1(function (q) { return y(q[1]); });

      inner.append("path").attr("class", "ground").attr("d", area(pts));
      inner.append("path").attr("class", "curve").attr("d", line(pts));

      /* the slope itself, as rise over run. A bare tangent line hugs the
         curve too closely to be read, so the run and the rise are drawn as
         two dashed legs and the slope is their hypotenuse. */
      var run = 40, rise = gr * (PPY / PPX) * run;
      inner.append("line").attr("class", "tangent")
        .attr("x1", 100).attr("y1", MIDY).attr("x2", 100 + run).attr("y2", MIDY);
      inner.append("line").attr("class", "tangent")
        .attr("x1", 100 + run).attr("y1", MIDY)
        .attr("x2", 100 + run).attr("y2", MIDY - rise);
      inner.append("line").attr("class", "fig-slope")
        .attr("x1", 100).attr("y1", MIDY)
        .attr("x2", 100 + run).attr("y2", MIDY - rise);

      hopper(inner, 100, MIDY, Math.atan2(-gr * PPY / PPX, 1) * 180 / Math.PI, 0.95);

      tspans(g.append("text").attr("class", "tangent-ink")
        .attr("x", PW / 2).attr("y", TOP + PH + 24).attr("text-anchor", "middle"),
        [["fig-nabla", "\u2207"], ["fig-math", "J(\u03b8)"], [null, " = " + fmtGrad(gr)]]);

      g.append("text").attr("class", "label-ink fig-note")
        .attr("x", PW / 2).attr("y", TOP + PH + 44).attr("text-anchor", "middle")
        .text(p.note);
    });
  }

  /* ======================================================================
     5. Figure C : the same rule at three step sizes
     ====================================================================== */

  function figureC(host) {
    var W = 780, H = 242;
    var svg = makeSvg(host, "fig-c", W, H);
    var PW = 246, GAP = 21, START = 1.2;

    var runs = [
      { alpha: 0.35, steps: 10, nest: 0, tag: "too small",
        note: "ten steps, still on the flank" },
      { alpha: 1.6, steps: 6, nest: 0, tag: "about right",
        note: "at the floor after four steps" },
      { alpha: 4.4, steps: 4, nest: 3.5, tag: "too large",
        note: "overshoots the bottom, then overshoots back" }
    ];

    runs.forEach(function (r, i) {
      var g = svg.append("g").attr("transform", "translate(" + (i * (PW + GAP)) + ",0)");
      var x = d3.scaleLinear().domain([0, 10]).range([12, 234]);
      var y = d3.scaleLinear().domain([-3.05, 0]).range([196, 64]);
      var pts = samples(hill, 0, 10, 240);

      var line = d3.line().x(function (q) { return x(q[0]); }).y(function (q) { return y(q[1]); });
      var area = d3.area().x(function (q) { return x(q[0]); })
        .y0(y(-3.05)).y1(function (q) { return y(q[1]); });

      /* the value and its verdict belong to each other, so they sit together
         at the left and the 21px column gap stays the largest gap in the row.
         Spread to the two ends of the panel they group across the gutter
         instead, and the eye reads "too small, alpha = 1.6" as one unit. */
      tspans(g.append("text").attr("class", "fig-mono").attr("x", 0).attr("y", 16),
        [["fig-math", "\u03b1"], [null, " = " + r.alpha]]);
      g.append("text").attr("class", "label-ink fig-note")
        .attr("x", 74).attr("y", 16).attr("text-anchor", "start").text(r.tag);

      g.append("path").attr("class", "ground").attr("d", area(pts));
      g.append("path").attr("class", "curve").attr("d", line(pts));
      g.append("line").attr("class", "axis-line")
        .attr("x1", 6).attr("y1", y(0) + 3).attr("x2", 240).attr("y2", y(0) + 3);

      drawHops(g, descend(hillGrad, START, r.alpha, r.steps), x, y, hill, r.nest);

      /* the floor marker sits on top of the trail, so a path that arrives
         does not bury the thing it arrived at */
      g.append("circle").attr("class", "peak-dot")
        .attr("cx", x(5)).attr("cy", y(hill(5))).attr("r", 3.4);

      g.append("text").attr("class", "label-ink fig-note")
        .attr("x", 0).attr("y", 228).text(r.note);
    });
  }

  /* ======================================================================
     6. Figure D : descent finds the nearest floor
     ====================================================================== */

  function figureD(host) {
    var W = 560, H = 262;
    var svg = makeSvg(host, "fig-d", W, H);
    var x = d3.scaleLinear().domain([0, 10]).range([46, 524]);
    var y = d3.scaleLinear().domain([-3.25, 0]).range([212, 40]);
    var pts = samples(twoHills, 0, 10, 400);

    var line = d3.line().x(function (q) { return x(q[0]); }).y(function (q) { return y(q[1]); });
    var area = d3.area().x(function (q) { return x(q[0]); })
      .y0(y(-3.25)).y1(function (q) { return y(q[1]); });

    svg.append("path").attr("class", "ground").attr("d", area(pts));
    svg.append("path").attr("class", "curve").attr("d", line(pts));
    svg.append("line").attr("class", "axis-line")
      .attr("x1", 38).attr("y1", y(0) + 3).attr("x2", 532).attr("y2", y(0) + 3);
    svg.append("text").attr("class", "axis-title")
      .attr("x", 524).attr("y", 232).attr("text-anchor", "end").text("position");

    /* the deeper floor, marked but never reached */
    var tp = 7.0;
    svg.append("line").attr("class", "peak-mark")
      .attr("x1", x(tp)).attr("y1", y(twoHills(tp))).attr("x2", x(tp)).attr("y2", y(0) + 3);
    svg.append("circle").attr("class", "peak-dot")
      .attr("cx", x(tp)).attr("cy", y(twoHills(tp))).attr("r", 4);
    svg.append("text").attr("class", "peak-ink")
      .attr("x", x(tp)).attr("y", y(twoHills(tp)) - 13).attr("text-anchor", "middle")
      .text("deeper, and never visited");

    var path = descend(twoHillsGrad, 1.1, 0.4, 7);
    drawHops(svg, path, x, y, twoHills);

    var last = path[path.length - 1];
    var slope = twoHillsGrad(last) * ((172 / 3.25) / (478 / 10));
    hopper(svg, x(last), y(twoHills(last)), Math.atan2(-slope, 1) * 180 / Math.PI, 0.95);

    svg.append("text").attr("class", "label-ink fig-note")
      .attr("x", x(path[0]) - 9).attr("y", y(twoHills(path[0])) - 8)
      .attr("text-anchor", "end").text("start");
    svg.append("text").attr("class", "label-ink")
      .attr("x", x(last)).attr("y", y(twoHills(last)) - 52).attr("text-anchor", "middle")
      .text("a local minimum");
    svg.append("text").attr("class", "label-ink fig-note")
      .attr("x", x(last)).attr("y", y(twoHills(last)) - 36).attr("text-anchor", "middle")
      .text("the slope here really is zero");
  }

  /* ======================================================================
     7. The prose
     ====================================================================== */

  var HTML = [
    '<div class="section-rule"><span class="section-kicker">After the descent</span></div>',
    '<h2 class="exp-title">What you were doing has a name</h2>',
    '<p class="lede">Five stations, and not one equation in any of them. There was a method,',
    'and the method is the one the rest of the day is built on. Here it is with as little',
    'notation as it can be written in: four symbols and one line, all four of which you have',
    'already used.</p>',

    /* part one */
    '<div class="section-rule"><span class="section-kicker">One</span></div>',
    '<h3 class="exp-h">The landscape has a name: <span class="m" data-tex="J"></span></h3>',
    '<p class="exp-p">The curve you were walking on is a function. Give it a position and it',
    'gives back a height. Write the position <span class="m" data-tex="\\theta"></span> and',
    'the height at that position <span class="m" data-tex="J(\\theta)"></span>.</p>',
    '<p class="exp-p"><span class="m" data-tex="\\theta"></span> is where you stand.',
    '<span class="m" data-tex="J(\\theta)"></span> is how good it is there. The whole game,',
    'from the first jump to the last, was one sentence: find the',
    '<span class="m" data-tex="\\theta"></span> where <span class="m" data-tex="J"></span> is',
    'smallest.</p>',
    '<p class="exp-p">You were never shown <span class="m" data-tex="J"></span>. It has a',
    'shape, and the shape decides everything, but the only part of it you could reach was the',
    'ground under your feet.</p>',
    '<div class="exp-fig"><div class="fig-host" id="fig-a-host"></div>',
    '<p class="caption">One landscape, drawn in full. Position runs along the bottom, the height',
    'of the curve is J. In the game you saw a narrow window of this and nothing else</p></div>',

    /* part two */
    '<div class="section-rule"><span class="section-kicker">Two</span></div>',
    '<h3 class="exp-h">What the grasshopper feels has a name too:',
    '<span class="m" data-tex="\\nabla J"></span></h3>',
    '<p class="exp-p">What the ground under your feet tells you is the slope. The slope of',
    '<span class="m" data-tex="J"></span> at position <span class="m" data-tex="\\theta"></span>',
    'is written <span class="m" data-tex="\\nabla J(\\theta)"></span> and said out loud as',
    '“nabla <span class="m" data-tex="J"></span>”, or “the gradient of',
    '<span class="m" data-tex="J"></span>”.</p>',
    '<p class="exp-p">Here <span class="m" data-tex="\\theta"></span> is one number, so',
    '<span class="m" data-tex="\\nabla J(\\theta)"></span> is one number too, and there are',
    'exactly two things to read off it.</p>',
    '<p class="exp-p">The <strong>sign</strong> says which way is downhill. Positive means downhill',
    'is to the left, negative means downhill is to the right.</p>',
    '<p class="exp-p">The <strong>size</strong> says how steep the ground is. A large number is',
    'a wall. A number close to zero is nearly flat ground, and gives you almost nothing to go',
    'on.</p>',
    '<p class="exp-p">That is all the information a grasshopper ever gets, and it is not',
    'given to it. Two heights a small gap apart, subtracted and divided: that was the',
    '<em>Shrink</em> station, and closing the gap is all the word <em>gradient</em> means.</p>',
    '<div class="exp-fig"><div class="fig-host" id="fig-b-host"></div>',
    '<p class="caption">One valley, felt from three places. The blue line is the slope under the',
    'grasshopper, drawn as the rise that comes with a fixed run. The number below each panel is',
    'that slope</p></div>',

    /* part three */
    '<div class="section-rule"><span class="section-kicker">Three</span></div>',
    '<h3 class="exp-h">The method is one line</h3>',
    '<div class="exp-formula" id="exp-descent"></div>',
    '<p class="exp-formula-note">The arrow means replace. The new',
    '<span class="m" data-tex="\\theta"></span> is the old',
    '<span class="m" data-tex="\\theta"></span> minus that step, and then you do the same thing',
    'again from where you landed.</p>',
    '<p class="exp-p">Read it in words: step against the direction the slope points, by an',
    'amount proportional to how steep the slope is, scaled by',
    '<span class="m" data-tex="\\alpha"></span>.</p>',
    '<p class="exp-p">In the game you set both levers yourself, the direction and the distance.',
    'The rule takes over the first one completely, because the sign of',
    '<span class="m" data-tex="\\nabla J"></span> is the direction. It takes over most of the',
    'second one too, because the size of <span class="m" data-tex="\\nabla J"></span> is most of',
    'the distance. <span class="m" data-tex="\\alpha"></span> is what is left of the distance',
    'lever: one number, fixed before you start, that says how far a given steepness carries you.',
    'In machine learning it is called the <strong>learning rate</strong>.</p>',
    '<p class="exp-p">This one line reproduces what a good player learns by feel. Steep ground',
    'gives a large <span class="m" data-tex="\\nabla J"></span>, so the step is long. Near the',
    'bottom the ground flattens, <span class="m" data-tex="\\nabla J"></span> shrinks, and the',
    'steps shorten on their own. At a floor the slope is zero, so the step is zero: the',
    'procedure stops there without being told to.</p>',
    '<p class="exp-name">The method is called gradient descent.</p>',
    '<p class="exp-p">It is also the whole of the autopilot. The line above is every',
    'instruction the <em>Autopilot</em> station had: it never saw a valley, it read one slope',
    'where it stood and multiplied it by the <span class="m" data-tex="\\alpha"></span> you',
    'chose.</p>',
    '<p class="exp-p">Change the minus to a plus and you have gradient ascent. Same procedure,',
    'for a landscape you want to be at the top of rather than the bottom.</p>',
    '<div class="exp-formula" id="exp-ascent"></div>',
    '<div class="exp-fig"><div class="fig-host" id="fig-c-host"></div>',
    '<p class="caption">The same landscape and the same starting point, three values of alpha.',
    'Every dot is one application of the line above, iterated in the code that draws the',
    'figure</p></div>',

    /* part four */
    '<div class="section-rule"><span class="section-kicker">Four</span></div>',
    '<h3 class="exp-h">Why the levels were hard</h3>',
    '<p class="exp-p">Nothing that made a level awkward was a flaw in the method. Each one is a',
    'property of the landscape that the method has no defence against, and each one stopped',
    'the autopilot on the same valley it stopped you on.</p>',
    '<div class="fail-list">',
    '<div class="fail-item"><p class="fail-name">The long shelf</p>',
    '<p class="fail-body">On a shelf the slope is near zero, so',
    '<span class="m" data-tex="\\nabla J"></span> carries the right sign and almost no push. The',
    'rule still points you the correct way. It just moves you a few centimetres at a time, and it',
    'will keep doing that for as long as the shelf lasts.</p></div>',
    '<div class="fail-item"><p class="fail-name">The narrow pit</p>',
    '<p class="fail-body">One <span class="m" data-tex="\\alpha"></span> that suited the gentle',
    'ground on the way down is far too large for a narrow pit. You cross the bottom, land on the',
    'far slope, and get sent back. The step size that got you there is the step size that will',
    'not let you stop.</p></div>',
    '<div class="fail-item"><p class="fail-name">Two valleys</p>',
    '<p class="fail-body">The slope only knows about the valley you are standing on. Descent walks',
    'to the nearest floor and finishes, because at that floor the slope really is zero and the',
    'rule really has nothing left to do. That floor is a <strong>local minimum</strong>. Nothing',
    'in the reading tells you the deeper valley exists.</p></div>',
    '<div class="fail-item"><p class="fail-name">Rough ground</p>',
    '<p class="fail-body">Every reading is contaminated. The direction you feel is not quite the',
    'direction of the valley, so any single step can point somewhere useless. Many steps average',
    'out. One step does not.</p></div>',
    '</div>',
    '<div class="exp-fig"><div class="fig-host" id="fig-d-host"></div>',
    '<p class="caption">Descent from the left flank of the small valley, seven steps of the same rule.',
    'The last three are too small to draw, which is what arriving looks like, and the deeper floor',
    'is never visited</p></div>'
  ].join("\n");

  /* ======================================================================
     8. Mount
     ====================================================================== */

  function renderInline(root) {
    var nodes = root.querySelectorAll(".m");
    var i;
    for (i = 0; i < nodes.length; i++) {
      katex.render(nodes[i].getAttribute("data-tex"), nodes[i], { throwOnError: false });
    }
  }

  function mount(root) {
    if (!root) return null;
    root.classList.add("explain");
    root.innerHTML = HTML;

    renderInline(root);

    katex.render("\\theta \\;\\leftarrow\\; \\theta \\,+\\, \\alpha \\, \\nabla J(\\theta)",
      root.querySelector("#exp-ascent"), { throwOnError: false, displayMode: true });
    katex.render("\\theta \\;\\leftarrow\\; \\theta \\,-\\, \\alpha \\, \\nabla J(\\theta)",
      root.querySelector("#exp-descent"), { throwOnError: false, displayMode: true });

    figureA(root.querySelector("#fig-a-host"));
    figureB(root.querySelector("#fig-b-host"));
    figureC(root.querySelector("#fig-c-host"));
    figureD(root.querySelector("#fig-d-host"));

    return { root: root };
  }

  window.Explain = { mount: mount };
})();
