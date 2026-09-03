/* ============================================================================
   mission-2d.js : station nine, "Two directions at once".

   The last station, and the only thing it adds is a second number. Position
   was one number and is now two; the slope was one number and is now two, one
   per direction; the rule is character for character what it was:

       theta  <-  theta  -  alpha * grad J(theta)

   applied to each number separately. Everything else the player already has.
   That is the whole point and the station says nothing more than that, because
   this is the door to the rest of the course: a real model's theta is not two
   numbers, it is a million, and not one line of the rule changes for that.

   The valley is drawn from above, as a contour map, because a surface drawn
   in perspective hides exactly the thing worth seeing: the arrow. The arrow is
   not the gradient, it is alpha times the gradient, which is to say it is the
   move the rule is about to make, drawn to scale before it makes it.

   The shallower floor is still on the map. Starting on the wrong side of the
   ridge and converging on it is the same trap as "two valleys", now reachable
   from two directions instead of one, and the player can move the start by
   clicking the map.

   API : the station contract in stations.js
     window.Mission2D.mount(host, ctx) -> { show, hide }
   ============================================================================ */
(function () {
  "use strict";

  var W = 520;
  var H = 390;             /* the domain is square, this view is not */
  var GRID = 121;         /* samples per side for the contour bands */
  var BANDS = 14;
  var BUDGET = 80;
  var TICK = 130;
  var SETTLED = 1e-4;
  var ALPHA0 = 0.6;

  function template() {
    return [
      '<div class="game-grid">',
      '<div class="game-main">',

      '<div class="card" data-el="mapcard">',
      '<div class="card-head">',
      '<h3 class="card-title">The valley from above</h3>',
      '<span class="card-note">Click the map to start somewhere else</span>',
      "</div>",
      '<div class="card-body md-body">',
      '<div class="md-scroll"><div class="md-host" data-el="mdhost"></div></div>',
      "</div>",
      "</div>",

      '<div class="card" data-el="tablecard">',
      '<div class="card-body ml-table-body">',
      '<div class="ml-table-scroll">',
      '<table class="ml-table">',
      "<thead><tr><th>Step</th><th>Position θ₁</th><th>Position θ₂</th>",
      "<th>Slope, first direction</th><th>Slope, second direction</th>",
      "<th>Height J(θ)</th></tr></thead>",
      '<tbody data-el="rows"></tbody>',
      "</table></div>",
      "</div>",
      "</div>",

      '<div class="card verdict-card is-hidden" data-el="verdictcard">',
      '<div class="card-head"><h3 class="card-title">Where it stopped</h3></div>',
      '<div class="card-body">',
      '<div class="verdict" data-el="verdict"></div>',
      '<div class="verdict-actions" data-el="verdictactions"></div>',
      "</div>",
      "</div>",

      "</div>",

      '<aside class="game-side">',
      '<div class="card">',
      '<div class="card-head"><h3 class="card-title">The same rule</h3></div>',
      '<div class="card-body">',

      '<div class="ap-rule">θ &larr; θ &minus; α × ∇J(θ)</div>',
      '<p class="ms-lede">Not a new rule, the same one.<br>Just applied to two ' +
      "numbers.<br>X and Y, the current position.<br>Read both slopes.<br>Move both " +
      "numbers.<br>Repeat.</p>",

      '<div class="control-group side-gap">',
      '<div class="control-label"><span>Step size <span class="ctl-sym">α</span></span></div>',
      '<div class="slider-row">',
      '<input type="range" class="slider" data-el="alpha" min="0.05" max="4" step="0.05"',
      ' value="0.6" aria-label="Step size alpha">',
      '<input type="number" class="num-input" data-el="alphanum" min="0.05" max="4"',
      ' step="0.05" value="0.60" aria-label="Step size alpha in numbers">',
      "</div>",
      "</div>",

      '<div class="side-actions">',
      '<button type="button" class="btn btn-primary btn-block" data-act="step">One step</button>',
      '<button type="button" class="btn btn-block" data-act="auto">Automatic run</button>',
      '<button type="button" class="btn btn-block is-hidden" data-act="stop" data-el="stopbtn">Stop</button>',
      '<button type="button" class="btn btn-primary btn-block" data-act="skip">Get the verdict</button>',
      '<button type="button" class="btn btn-ghost btn-block" data-act="reset">Try again</button>',
      "</div>",

      "</div>",
      "</div>",

      "</aside>",
      "</div>"
    ].join("");
  }

  function mount(root, ctx) {
    ctx = ctx || {};
    var d3 = window.d3;
    var S = window.LANDSCAPE2D;

    var state = {
      alpha: ALPHA0,
      start: S.start.slice(),
      theta: S.start.slice(),
      steps: 0,
      trail: [S.start.slice()],
      log: [],
      running: false,
      stopped: null,
      verdictShown: false
    };

    var timer = null;

    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    /* === the map === */

    var svg = d3.select(el("mdhost")).append("svg")
      .attr("class", "md-svg")
      .attr("width", W).attr("height", H)
      .attr("viewBox", "0 0 " + W + " " + H)
      .attr("role", "img")
      .attr("aria-label", "A contour map of a valley with two floors");

    var x = d3.scaleLinear().domain(S.domain).range([0, W]);
    var y = d3.scaleLinear().domain(S.domain).range([H, 0]);

    svg.append("rect").attr("class", "sky")
      .attr("x", 0).attr("y", 0).attr("width", W).attr("height", H);

    /* An arrowhead has to be a marker, and a marker needs an id that cannot
       collide with another copy of this station elsewhere on the page. */
    var uid = "md" + Math.random().toString(36).slice(2, 8);
    var defs = svg.append("defs");
    defs.append("marker")
      .attr("id", uid + "-head")
      .attr("viewBox", "0 0 10 10")
      .attr("refX", 8).attr("refY", 5)
      .attr("markerWidth", 5).attr("markerHeight", 5)
      .attr("orient", "auto-start-reverse")
      .append("path")
      .attr("class", "md-arrowhead")
      .attr("d", "M0,0 L10,5 L0,10 z");

    var gBands = svg.append("g");
    var gTrail = svg.append("g");
    var gMarks = svg.append("g");
    var gInk = svg.append("g");

    /* The contour bands are computed once: the landscape does not move. */
    (function drawBands() {
      var values = new Array(GRID * GRID);
      var i, j, t1, t2;
      for (j = 0; j < GRID; j++) {
        /* row 0 is the TOP of the picture, which is the high end of theta 2 */
        t2 = S.domain[1] - (S.domain[1] - S.domain[0]) * (j / (GRID - 1));
        for (i = 0; i < GRID; i++) {
          t1 = S.domain[0] + (S.domain[1] - S.domain[0]) * (i / (GRID - 1));
          values[j * GRID + i] = S.J(t1, t2);
        }
      }
      var lo = S.range.lo;
      var hi = S.range.hi;
      var thresholds = [];
      for (i = 0; i < BANDS; i++) thresholds.push(lo + ((hi - lo) * i) / BANDS);

      var contours = d3.contours().size([GRID, GRID]).thresholds(thresholds)(values);
      var sx = W / (GRID - 1);
      var sy = H / (GRID - 1);
      var path = d3.geoPath();

      gBands.selectAll("path")
        .data(contours)
        .join("path")
        .attr("class", "md-band")
        .attr("d", function (c) { return path(c); })
        .attr("transform", "scale(" + sx + "," + sy + ")")
        /* lower ground is more solid ground: the eye reads the floors
           without a colour scale to look up. J was negated at the source, so
           the ascending thresholds now run from the basins (index 0) up to
           the flat outer tilt (index BANDS-1) — the opacity ramp has to run
           the other way to keep the deep ground the darkest ground. */
        .attr("fill-opacity", function (c, i2) { return 0.06 + (1 - i2 / BANDS) * 0.78; })
        .attr("stroke-width", 1 / Math.max(sx, sy));
    })();

    function render() {
      renderMap();
      renderRows();
      renderChrome();
      renderVerdict();
    }

    function renderMap() {
      gTrail.selectAll("*").remove();
      gMarks.selectAll("*").remove();
      gInk.selectAll("*").remove();

      var t = state.trail;
      if (t.length > 1) {
        var line = d3.line()
          .x(function (p) { return x(p[0]); })
          .y(function (p) { return y(p[1]); });
        gTrail.append("path").attr("class", "trail-line").attr("d", line(t));
      }
      t.forEach(function (p) {
        gTrail.append("circle").attr("class", "trail-dot")
          .attr("cx", x(p[0])).attr("cy", y(p[1])).attr("r", 3);
      });

      /* the move the rule is about to make, drawn to scale */
      if (!state.stopped) {
        var g = S.grad(state.theta[0], state.theta[1]);
        var to = S.clamp([
          state.theta[0] - state.alpha * g[0],
          state.theta[1] - state.alpha * g[1]
        ]);
        if (Math.abs(to[0] - state.theta[0]) + Math.abs(to[1] - state.theta[1]) > 1e-3) {
          gMarks.append("line")
            .attr("class", "md-arrow")
            .attr("x1", x(state.theta[0])).attr("y1", y(state.theta[1]))
            .attr("x2", x(to[0])).attr("y2", y(to[1]))
            .attr("marker-end", "url(#" + uid + "-head)");
        }
      }

      gMarks.append("circle").attr("class", "hopper-body")
        .attr("cx", x(state.theta[0])).attr("cy", y(state.theta[1])).attr("r", 6);
      gMarks.append("circle").attr("class", "hopper-ring")
        .attr("cx", x(state.theta[0])).attr("cy", y(state.theta[1])).attr("r", 6);

      /* Both floors are marked only once the run has stopped, exactly as the
         world view in the game holds the floor back until the flag is in. */
      if (state.stopped) {
        [[S.floor, "the bottom"], [S.shallower, "the shallower floor"]].forEach(function (pair) {
          var px = x(pair[0].theta[0]);
          var py = y(pair[0].theta[1]);
          var right = px < W - 130;
          gMarks.append("circle").attr("class", "peak-dot")
            .attr("cx", px).attr("cy", py).attr("r", 5);
          gInk.append("text").attr("class", "peak-ink")
            .attr("x", right ? px + 10 : px - 10)
            .attr("y", Math.max(14, Math.min(H - 8, py + 4)))
            .attr("text-anchor", right ? "start" : "end")
            .text(pair[1]);
        });
      }
    }

    function renderRows() {
      var tail = state.log.slice(-6);
      var out = [];
      var i, r;
      for (i = 0; i < tail.length; i++) {
        r = tail[i];
        out.push("<tr" + (i === tail.length - 1 ? ' class="is-latest"' : "") + ">" +
          "<td>" + r.n + "</td><td>" + r.t1.toFixed(3) + "</td><td>" + r.t2.toFixed(3) +
          "</td><td>" + (r.g1 >= 0 ? "+" : "") + r.g1.toFixed(4) + "</td><td>" +
          (r.g2 >= 0 ? "+" : "") + r.g2.toFixed(4) + "</td><td>" + r.J.toFixed(3) +
          "</td></tr>");
      }
      el("rows").innerHTML = out.join("") ||
        '<tr><td colspan="6" class="ml-empty">No steps yet.</td></tr>';
    }

    function renderChrome() {
      if (document.activeElement !== el("alpha")) el("alpha").value = String(state.alpha);
      if (document.activeElement !== el("alphanum")) {
        el("alphanum").value = state.alpha.toFixed(2);
      }

      root.querySelector('[data-act="step"]').disabled = !!state.stopped || state.running;
      root.querySelector('[data-act="auto"]').disabled = !!state.stopped || state.running;
      root.querySelector('[data-act="skip"]').disabled = !state.stopped;
      el("stopbtn").classList.toggle("is-hidden", !state.running);
    }

    function renderVerdict() {
      var card = el("verdictcard");
      /* The verdict takes the place of the map and the step table rather than
         sitting below them, but only once asked for: the rule stopping on its
         own does not show it, "Get the verdict" does. */
      el("mapcard").classList.toggle("is-hidden", state.verdictShown);
      el("tablecard").classList.toggle("is-hidden", state.verdictShown);
      if (!state.stopped || !state.verdictShown) {
        card.classList.add("is-hidden");
        return;
      }
      var v = state.stopped;
      card.classList.remove("is-hidden");
      el("verdict").className = "verdict " + v.kind;
      el("verdict").innerHTML =
        '<p class="verdict-title">' + v.title + "</p>" +
        '<p class="verdict-body">' + v.body + "</p>";
      el("verdictactions").innerHTML =
        '<button type="button" class="btn" data-act="reset">Run it again</button>' +
        '<button type="button" class="btn btn-primary" data-act="onward">' +
        "Read what you were doing</button>";
    }

    /* The button is only enabled once state.stopped is already set (see
       renderChrome), so by the time this runs the outcome is known and
       waiting; this just admits the reader to it. */
    function revealVerdict() {
      if (!state.stopped) return;
      state.verdictShown = true;
      render();
    }

    /* === the run === */

    function step() {
      if (state.stopped) return;
      var t1 = state.theta[0];
      var t2 = state.theta[1];
      var g = S.grad(t1, t2);
      var to = S.clamp([t1 - state.alpha * g[0], t2 - state.alpha * g[1]]);
      var move = Math.abs(to[0] - t1) + Math.abs(to[1] - t2);

      state.steps += 1;
      state.log.push({ n: state.steps, t1: t1, t2: t2, g1: g[0], g2: g[1], J: S.J(t1, t2) });
      state.theta = to;
      state.trail.push(to.slice());

      if (move < SETTLED) finish("settled");
      else if (state.steps >= BUDGET) finish("budget");
      render();
    }

    function startAuto() {
      if (state.running || state.stopped) return;
      state.running = true;
      renderChrome();
      timer = window.setInterval(function () {
        if (state.stopped) { stopAuto(); return; }
        step();
      }, TICK);
    }

    function stopAuto() {
      if (timer) {
        window.clearInterval(timer);
        timer = null;
      }
      state.running = false;
    }

    function dist(a, b) {
      return Math.sqrt(Math.pow(a[0] - b[0], 2) + Math.pow(a[1] - b[1], 2));
    }

    function finish(why) {
      stopAuto();
      var v = { kind: "warn", title: "", body: "" };
      var atBottom = dist(state.theta, S.floor.theta) < 0.4;
      var atShallower = dist(state.theta, S.shallower.theta) < 0.4;

      if (atBottom) {
        v.kind = "good";
        v.title = "It walked down into a valley.";
        v.body = "Two numbers give the position, two slopes say which way each number " +
          "should move, and the same line moved both. The path bends around the " +
          "valley because the two slopes are rarely equal: the steeper direction " +
          "gets the longer part of every step, which is the whole of what the arrow " +
          "was doing on the map.";
      } else if (atShallower) {
        v.kind = "bad";
        v.title = "It stopped on the shallower floor.";
        v.body = "This is the trap from the third valley, in two directions instead of " +
          "one: both slopes really are zero here, so the rule really is finished, and " +
          "nothing it can read says otherwise. Click the map somewhere on the far side " +
          "and run it again — the same rule, the same α, a different answer.";
      } else if (why === "budget") {
        v.kind = "warn";
        v.title = "It ran out of budget.";
        v.body = "At a large α the two numbers can throw each other about; at a small " +
          "one there is simply not enough distance in the steps it was given.";
      } else {
        v.kind = "warn";
        v.title = "It stopped short of both floors.";
        v.body = "The ground here is flat enough that α times the slope is smaller than " +
          "the rule can act on, and it is not a floor. The map's tilt is gentle out " +
          "here; the rule cannot tell gentle from finished.";
      }

      state.stopped = v;
      if (ctx.done) ctx.done();
    }

    function resetRun(keepStart) {
      stopAuto();
      if (!keepStart) state.start = S.start.slice();
      state.theta = S.clamp(state.start.slice());
      state.steps = 0;
      state.trail = [state.theta.slice()];
      state.log = [];
      state.stopped = null;
      state.verdictShown = false;
      render();
    }

    function setAlpha(v) {
      if (!Number.isFinite(v)) return;
      state.alpha = Math.max(0.05, Math.min(4, Math.round(v * 100) / 100));
      resetRun(true);
    }

    /* === events === */

    svg.on("click", function (e) {
      var pt = d3.pointer(e);
      state.start = S.clamp([x.invert(pt[0]), y.invert(pt[1])]);
      resetRun(true);
    });

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var n;
      if ((n = t.closest("[data-act]"))) {
        var act = n.getAttribute("data-act");
        if (act === "step") step();
        else if (act === "auto") startAuto();
        else if (act === "stop") { stopAuto(); render(); }
        else if (act === "skip") revealVerdict();
        else if (act === "reset") resetRun(true);
        else if (act === "onward" && ctx.next) ctx.next();
      }
    });

    el("alpha").addEventListener("input", function () {
      setAlpha(parseFloat(el("alpha").value));
    });
    el("alphanum").addEventListener("change", function () {
      setAlpha(parseFloat(el("alphanum").value));
    });

    resetRun(false);

    return {
      show: function () { render(); },
      hide: function () { stopAuto(); render(); }
    };
  }

  window.Mission2D = { mount: mount };
})();
