/* ============================================================================
   mission-limit.js : station seven, "The probe shrinks".

   Station six left one thing unexplained: the gap between the two probes was
   0.6 because somebody chose 0.6. Nothing about the valley said so. So here
   the player stands in the same place on the same valley and closes the gap,
   ten times narrower at a stroke, and watches the two heights collapse towards
   each other while the number they give back stops moving.

   The two things the station has to make visible are:

     the heights get closer together    (a and b agree to more and more digits)
     the ratio does not                 (it settles on a value and stays there)

   and the picture carries the third: with both axes zooming together, a valley
   seen closely enough is a straight line, and the line through the probes lies
   down exactly on top of the slope at the point. THAT is the moment the word
   gradient is finally allowed into the page.

   Where the reading is taken is the player's to move. The ratio settles on a
   different number at every position on the valley, and settling is the part
   that does not change: on the flank it settles on something near minus one,
   on the floor it settles on zero, past the floor it settles on a positive
   number. The strip above the zoom keeps the whole valley in view so that the
   place being magnified is never in doubt.

   The ladder stops at a gap of one millionth. That is not squeamishness: below
   it the two heights agree in so many digits that their difference is mostly
   the arithmetic's own rounding, and the ratio starts to wobble. A student who
   pushes to the floor should be told that, not shown noise and left guessing.

   API : the station contract in stations.js
     window.MissionLimit.mount(host, ctx) -> { show, hide }
   ============================================================================ */
(function () {
  "use strict";

  var LS = window.Landscape;

  var THETA = 3.0;       /* the same spot on the same valley as station six */
  var EPS0 = 1;          /* the ladder starts here */
  var FLOOR = 1e-6;      /* and stops here, before the arithmetic gets noisy */

  function fmtEps(e) {
    if (e >= 0.001) return String(Number(e.toFixed(6)));
    return e.toExponential(0).replace("e-", " × 10⁻").replace("+", "");
  }

  function mono(s) {
    return '<span class="mono">' + s + "</span>";
  }

  function template() {
    return [
      '<div class="game-grid">',
      '<div class="game-main">',

      '<div class="card" data-el="lookcard">',
      '<div class="card-head">',
      '<h3 class="card-title">Let\'s take a closer look</h3>',
      "</div>",
      '<div class="card-body pv-body">',
      '<div class="pv-scroll pv-scroll-row">',
      '<div class="pv-col pv-col-over">',
      '<div class="pv-over" data-el="overhost"></div>',
      '<p class="caption pv-over-caption" data-el="overcaption"></p>',
      "</div>",
      '<div class="pv-zoom-hint" aria-hidden="true">',
      '<svg viewBox="0 0 32 32" class="pv-zoom-icon">',
      '<circle cx="13" cy="13" r="8"></circle>',
      '<line x1="19" y1="19" x2="27" y2="27"></line>',
      '<line x1="13" y1="9" x2="13" y2="17"></line>',
      '<line x1="9" y1="13" x2="17" y2="13"></line>',
      "</svg>",
      "</div>",
      '<div class="pv-col pv-col-zoom">',
      '<div class="pv-host" data-el="pvhost"></div>',
      '<p class="caption" data-el="pvcaption"></p>',
      "</div>",
      "</div>",
      "</div>",
      "</div>",

      '<div class="card" data-el="tablecard">',
      '<div class="card-body ml-table-body">',
      '<div class="ml-table-scroll">',
      '<table class="ml-table">',
      /* An explicit width on the gap column alone: it is the one column whose
         longest possible string is known ahead of time ("1 × 10⁻6", at the
         floor) rather than depending on the landscape. Fixed at that width,
         the other four columns can split the rest evenly without any of them
         having to guess how much room the gap needs. */
      "<colgroup>",
      '<col style="width: 92px;">',
      "<col><col><col><col>",
      "</colgroup>",
      "<thead><tr>",
      "<th>gap</th><th>a</th><th>b</th>",
      "<th>b − a</th><th>Slope</th>",
      "</tr></thead>",
      '<tbody data-el="rows"></tbody>',
      "</table></div>",
      "</div>",
      "</div>",

      '<div class="card verdict-card is-hidden" data-el="verdictcard">',
      '<div class="card-head"><h3 class="card-title">What you just did</h3></div>',
      '<div class="card-body">',
      '<div class="verdict" data-el="verdict"></div>',
      '<div class="verdict-actions" data-el="verdictactions"></div>',
      "</div>",
      "</div>",

      "</div>",

      '<aside class="game-side">',
      '<div class="card">',
      '<div class="card-head"><h3 class="card-title">The process</h3></div>',
      '<div class="card-body">',

      '<p class="ms-lede">Narrow the gap.<br>Watch the two heights.<br>Then watch the ' +
      "slope.</p>",

      '<div class="control-group side-gap">',
      '<div class="control-label"><span>Middle point</span></div>',
      '<div class="slider-row">',
      '<input type="range" class="slider" data-el="theta" step="0.05"',
      ' aria-label="Where the reading is taken">',
      '<input type="number" class="num-input" data-el="thetanum" step="0.05"',
      ' aria-label="Where the reading is taken, in numbers">',
      "</div>",
      "</div>",

      '<div class="side-actions">',
      '<button type="button" class="btn btn-primary btn-block" data-act="shrink">',
      "Close the gap</button>",
      '<button type="button" class="btn btn-block" data-act="restart">Start the ladder again</button>',
      "</div>",

      '<div class="ml-answer is-hidden" data-el="answerblock">',
      '<div class="control-group">',
      '<div class="control-label"><span>The final slope is</span></div>',
      '<div class="slider-row">',
      '<input type="number" class="num-input ms-answer" data-el="answer" step="0.01"',
      ' placeholder="your guess" aria-label="The value the ratio settles on">',
      "</div>",
      "</div>",
      '<button type="button" class="btn btn-primary btn-block" data-act="check">Check</button>',
      "</div>",

      '<p class="ms-feedback is-hidden" data-el="feedback"></p>',

      "</div>",
      "</div>",

      "</aside>",
      "</div>"
    ].join("");
  }

  function mount(root, ctx) {
    ctx = ctx || {};
    var L = window.LANDSCAPES[0];

    function truth() {
      return LS.grad(L, state.theta);
    }

    var state = {
      theta: THETA,
      eps: EPS0,
      rows: [],
      revealed: false,
      atFloor: false
    };

    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    /* Shorter than the 330 the zoom runs at in station two: here it sits beside
       the locator rather than alone, and the height is locked in game.css to
       match. */
    var view = window.ProbeView.create(el("pvhost"), {
      height: 260,
      label: "The first valley at the chosen spot, with the gap between the probes closing"
    });

    /* The locator. Same view, whole valley, no zoom: without it a reader who has
       shrunk the gap four times is looking at a straight line with no idea
       which straight line it is. */
    var over = window.ProbeView.create(el("overhost"), {
      window: L.domain,
      width: 260,
      height: 150,
      showGap: false,
      showValues: false,
      label: "The whole of the first valley, with the reading's position marked"
    });

    function readingAt(eps) {
      var a = L.J(state.theta - eps / 2);
      var b = L.J(state.theta + eps / 2);
      return { eps: eps, a: a, b: b, diff: b - a, ratio: (b - a) / eps };
    }

    function digits(v) {
      return v.toFixed(3);
    }

    /* The last rung's difference rounds to zero from below, and "-0.000" reads
       as a number that went slightly wrong rather than as the nothing it is. */
    function signedDigits(v) {
      var s = v.toFixed(3);
      return parseFloat(s) === 0 ? (0).toFixed(3) : s;
    }

    function renderRows() {
      var out = [];
      var i, r;
      for (i = 0; i < state.rows.length; i++) {
        r = state.rows[i];
        out.push(
          "<tr" + (i === state.rows.length - 1 ? ' class="is-latest"' : "") + ">" +
          "<td>" + fmtEps(r.eps) + "</td>" +
          "<td>" + digits(r.a) + "</td>" +
          "<td>" + digits(r.b) + "</td>" +
          "<td>" + signedDigits(r.diff) + "</td>" +
          "<td class=\"ml-ratio\">" + r.ratio.toFixed(3) + "</td></tr>"
        );
      }
      el("rows").innerHTML = out.join("");
    }

    function renderView(fromEps) {
      var st = {
        L: L,
        theta: state.theta,
        eps: state.eps,
        showSecant: true,
        showTangent: state.revealed
      };
      if (fromEps) view.zoomTo(st, fromEps); else view.render(st);

      over.render({
        L: L,
        theta: state.theta,
        eps: Math.max(state.eps, 0.35),
        showSecant: true,
        showTangent: false,
        showValues: false
      });
      el("pvcaption").textContent = state.revealed
        ? "The dashed line is the slope at the point itself, the one the game's switch draws. The line through your two probes is underneath it."
        : "";
    }

    function renderChrome() {
      var th = el("theta");
      var thn = el("thetanum");
      th.min = String(L.domain[0] + 0.6);
      th.max = String(L.domain[1] - 0.6);
      thn.min = th.min;
      thn.max = th.max;
      if (document.activeElement !== th) th.value = String(state.theta);
      if (document.activeElement !== thn) thn.value = state.theta.toFixed(2);
      /* The box opens on exactly the condition that greys the button: the
         ladder has nothing left to give. Asking what the number settles on
         while there are still rungs to take would be asking before the
         evidence is in, and a fixed count of rungs cannot stand in for it —
         near the floor of the valley the two heights agree after a rung or
         two, and at the floor itself after none. */
      el("answerblock").classList.toggle("is-hidden",
        !state.atFloor || state.revealed);
      root.querySelector('[data-act="shrink"]').disabled = state.atFloor || state.revealed;
    }

    function say(text, kind) {
      var f = el("feedback");
      f.className = "ms-feedback " + (kind || "");
      f.innerHTML = text || "";
      f.classList.toggle("is-hidden", !text);
    }

    function render(fromEps) {
      renderRows();
      renderView(fromEps);
      renderChrome();
    }

    /* === the ladder === */

    /* Would another rung say anything? The ladder runs until the two heights
       print the same, and that rung is the LAST one taken rather than the first
       one refused: a row whose difference has gone to zero is the point the
       whole station is making, so it belongs on the table. Once a rung is flat
       the one below it could only repeat it, so that is the end.

       The floor stops it too, where what is left of the difference would be
       mostly the arithmetic's own rounding.

       Asked before the step as well as after, so the button greys out on the
       last rung that carried something rather than on a dead click. */
    function isFlat(reading) {
      return digits(reading.a) === digits(reading.b);
    }

    function canShrink(eps) {
      if (eps / 10 < FLOOR * 0.999) return false;
      return !isFlat(readingAt(eps));
    }

    function shrink() {
      if (state.atFloor || state.revealed) return;
      if (!canShrink(state.eps)) {
        state.atFloor = true;
        renderChrome();
        return;
      }
      var from = state.eps;
      state.eps = state.eps / 10;
      state.rows.push(readingAt(state.eps));
      if (!canShrink(state.eps)) state.atFloor = true;
      say("", "");
      render(from);
    }

    function check() {
      var raw = parseFloat(el("answer").value);
      if (!Number.isFinite(raw)) {
        say("Put the number from the last column in the box.", "bad");
        return;
      }
      var g = truth();
      var tol = Math.max(0.05, Math.abs(g) * 0.05);
      if (Math.abs(raw - g) > tol) {
        say("Not that. Read the last column from the top down: the digits at the front " +
          "of it stopped changing several rungs ago. That is the number.", "bad");
        return;
      }
      reveal();
    }

    function reveal() {
      state.revealed = true;
      el("answer").value = truth().toFixed(4);
      say("", "");
      render();
      if (ctx.done) ctx.done();

      el("lookcard").classList.add("is-hidden");
      el("tablecard").classList.add("is-hidden");
      el("verdictcard").classList.remove("is-hidden");
      el("verdict").className = "verdict good";
      el("verdict").innerHTML =
        '<p class="verdict-title">That number has a name. It is the gradient.</p>' +
        '<p class="verdict-body">Written ' + mono("∇J(θ)") + ": the slope of the " +
        "landscape at position " + mono("θ") + ". You did not get it from the valley. " +
        "You got it from two heights and a division, repeated with the gap closing, " +
        "until the answer stopped moving.</p>" +
        '<p class="verdict-body">We stop the process just before the gap never reaches ' +
        "zero. Zero would be a height difference of nothing divided by a step of " +
        "nothing, which is not a number. Just small enough that the numerical answer " +
        "has stopped changing.</p>" +
        '<p class="verdict-body">Move the grasshopper along the valley and run the ladder ' +
        "again. The number it settles on changes at every position. Every place on " +
        "every landscape in this game has one of these.</p>";
      el("verdictactions").innerHTML =
        '<button type="button" class="btn" data-act="restart">Run the ladder again</button>' +
        '<button type="button" class="btn btn-primary" data-act="onward">' +
        "Let's leverage the gradient</button>";
    }

    function setTheta(v) {
      if (!Number.isFinite(v)) return;
      var lo = L.domain[0] + 0.6;
      var hi = L.domain[1] - 0.6;
      state.theta = Math.max(lo, Math.min(hi, Math.round(v * 20) / 20));
      restart();
    }

    function restart() {
      state.eps = EPS0;
      state.rows = [readingAt(EPS0)];
      state.revealed = false;
      state.atFloor = !canShrink(EPS0);
      el("answer").value = "";
      say("", "");
      el("verdictcard").classList.add("is-hidden");
      el("lookcard").classList.remove("is-hidden");
      el("tablecard").classList.remove("is-hidden");
      render();
    }

    /* === events === */

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var n = t.closest("[data-act]");
      if (!n || n.disabled) return;
      var act = n.getAttribute("data-act");
      if (act === "shrink") shrink();
      else if (act === "check") check();
      else if (act === "restart") restart();
      else if (act === "onward" && ctx.next) ctx.next();
    });

    el("theta").addEventListener("input", function () {
      setTheta(parseFloat(el("theta").value));
    });
    el("thetanum").addEventListener("change", function () {
      setTheta(parseFloat(el("thetanum").value));
    });

    el("answer").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });

    state.rows = [readingAt(EPS0)];
    state.atFloor = !canShrink(EPS0);
    render();

    return {
      show: function () { render(); },
      hide: function () { view.cancel(); }
    };
  }

  window.MissionLimit = { mount: mount };
})();
