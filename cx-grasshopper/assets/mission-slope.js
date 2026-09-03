/* ============================================================================
   mission-slope.js : station six, "Read the ground yourself".

   Five valleys were descended on a feeling: it slopes down to the right, more
   here than there. This station makes the player put a number on that feeling
   with the only two things the grasshopper has ever been allowed, two
   heights, and the arithmetic in between:

       slope  =  (b - a) / gap

   Four readings, taken along one valley, and the SEQUENCE is the lesson
   rather than any one of them:

     low on the flank      about -1     descending
     at the steepest part  about -1.2   descending fastest
     on the floor          exactly 0    nothing left to descend
     past the floor        about +1.2   the sign has turned over

   Same valley, same arithmetic, same gap between the probes, four different
   answers. The slope is not a property of the valley. It is a property of
   where you are standing on it, and the whole valley is on screen the entire
   time so that the four readings can be seen accumulating on it.

   The gradient is NOT named here. It is named at the end of station seven,
   once the number has stopped moving. Here it is only ever "the slope".

   API : the station contract in stations.js
     window.MissionSlope.mount(host, ctx) -> { show, hide }
   ============================================================================ */
(function () {
  "use strict";

  var LS = window.Landscape;

  /* All four readings live on valley one: a single clean Gaussian, no shelf,
     no ripple, nothing to argue with. The gap is 1.2, and the four positions
     are solved so that b - a lands exactly on a clean multiple of 0.6 at
     every one of them: -0.6, -1.2, 0, +1.2. The slope is then that number
     over 1.2 with nothing left to round: -0.5, -1, 0, +1. */
  var ROUNDS = [
    {
      theta: 1.051935,
      where: "low on the flank",
      after: "The ground drops half a unit of height for every unit you walk to the " +
        "right, which is why long jumps to the right pay off."
    },
    {
      theta: 2.558850,
      where: "further down the same slope",
      after: "Twice as steep as the last reading!"
    },
    {
      theta: 6.2,
      where: "on the floor itself",
      after: "The two probes read the same height because the ground is level here, " +
        "and level is what a floor is."
    },
    {
      theta: 7.755498,
      where: "over the floor and up the far side",
      after: "The same size as the steeper of the two descending readings, with the " +
        "sign turned over. Downhill is now behind you, to the left. Nothing else in " +
        "the reading changed."
    }
  ];

  var EPS = 1.2;   /* one gap for all four, chosen with the positions above so every
                       b - a comes out an exact multiple of 0.6 */

  function trim(v, dp) {
    var s = v.toFixed(dp === undefined ? 3 : dp);
    if (s.indexOf(".") >= 0) s = s.replace(/0+$/, "").replace(/\.$/, "");
    return s;
  }

  function mono(s) {
    return '<span class="mono">' + s + "</span>";
  }

  function template() {
    return [
      '<div class="game-grid">',
      '<div class="game-main">',

      '<div class="card">',
      '<div class="card-head">',
      '<h3 class="card-title">Two probes on the ground</h3>',
      "</div>",
      '<div class="card-body pv-body">',
      '<div class="pv-scroll"><div class="pv-host" data-el="pvhost"></div></div>',
      '<p class="caption" data-el="pvcaption"></p>',
      "</div>",
      "</div>",

      '<div class="card" data-el="readingcard">',
      '<div class="card-head"><h3 class="card-title">How does the grasshopper calculate a slope</h3></div>',
      '<div class="card-body">',

      '<p class="ms-lede">The grasshopper cannot see the valley. It can read the height ',
      "under its feet. So it reads the height in two positions ",
      "and works out the slope using:</p>",

      '<div class="ms-formula">',
      '<span>slope =</span>',
      '<span class="ms-frac"><span class="ms-frac-num">b &minus; a</span>',
      '<span class="ms-frac-den">gap</span></span>',
      "</div>",

      '<div class="control-group">',
      '<div class="control-label"><span>Guess the slope</span></div>',
      '<div class="slider-row">',
      '<input type="number" class="num-input ms-answer" data-el="answer" step="0.01"',
      ' placeholder="type your guess here" aria-label="The slope at this position">',
      "</div>",
      "</div>",

      '<div class="side-actions">',
      '<button type="button" class="btn btn-primary btn-block" data-act="check">Check</button>',
      "</div>",

      '<p class="ms-feedback is-hidden" data-el="feedback"></p>',

      "</div>",
      "</div>",

      '<div class="card verdict-card is-hidden" data-el="verdictcard">',
      '<div class="card-head"><h3 class="card-title">Verdict</h3></div>',
      '<div class="card-body">',
      '<div class="verdict" data-el="verdict"></div>',
      '<div class="verdict-actions" data-el="verdictactions"></div>',
      "</div>",
      "</div>",

      "</div>",

      '<aside class="game-side">',
      '<div class="card">',
      '<div class="card-head"><h3 class="card-title">Slopes measured</h3></div>',
      '<div class="card-body">',
      '<div class="ms-taken is-hidden" data-el="taken"></div>',
      "</div>",
      "</div>",
      "</aside>",

      "</div>"
    ].join("");
  }

  function mount(root, ctx) {
    ctx = ctx || {};
    var L = window.LANDSCAPES[0];

    var state = {
      idx: 0,
      solved: [],
      revealed: false,      /* this round's answer is on the table */
      finished: false
    };

    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    /* The whole valley, every time. This station is not about the zoom: it is
       about the same arithmetic giving four different answers at four places,
       and that is only visible if all four places are on screen at once. */
    var view = window.ProbeView.create(el("pvhost"), {
      window: L.domain,
      label: "The first valley, with two probes on it"
    });

    function round() {
      return ROUNDS[state.idx];
    }

    function reading() {
      var R = round();
      var l = R.theta - EPS / 2;
      var r = R.theta + EPS / 2;
      var a = L.J(l);
      var b = L.J(r);
      return { l: l, r: r, a: a, b: b, slope: (b - a) / EPS };
    }

    /* Tolerance has to survive a reader who rounded a and b to the three
       decimals printed on screen, and still reject an answer that is only
       vaguely the right size. */
    function tolerance(slope) {
      return Math.max(0.05, Math.abs(slope) * 0.1);
    }

    /* every reading already answered, so they pile up on the valley */
    function taken() {
      var out = [];
      var i;
      for (i = 0; i < state.idx; i++) {
        if (state.solved[i]) out.push({ theta: ROUNDS[i].theta, eps: EPS });
      }
      return out;
    }

    function renderView() {
      var R = round();
      view.render({
        L: L,
        theta: R.theta,
        eps: EPS,
        showSecant: state.revealed,
        showTangent: false,
        extra: taken()
      });
      el("pvcaption").textContent = "";
    }

    /* The point of the station is the column of answers, not any one of them,
       so it is built up in front of the player as they go. */
    function renderTaken() {
      var host = el("taken");
      var out = [];
      var i, sl;
      for (i = 0; i < ROUNDS.length; i++) {
        if (!state.solved[i]) continue;
        sl = (L.J(ROUNDS[i].theta + EPS / 2) - L.J(ROUNDS[i].theta - EPS / 2)) / EPS;
        out.push('<div class="ms-taken-row' + (i === state.idx ? " is-latest" : "") + '">' +
          '<span class="ms-taken-where">Slope ' + (i + 1) + ":</span>" +
          '<span class="ms-taken-slope ' + (sl > 0.02 ? "up" : (sl < -0.02 ? "down" : "flat")) +
          '">' + (sl >= 0 ? "+" : "") + sl.toFixed(2) + "</span></div>");
      }
      host.innerHTML = out.join("");
      host.classList.toggle("is-hidden", !out.length);
    }

    function renderChrome() {
      el("answer").disabled = state.revealed;
      root.querySelector('[data-act="check"]').disabled = state.revealed;
    }

    /* One line, and it stays out of the layout entirely while it has nothing
       to say: an empty box under the button reads as a thing that failed. */
    function say(text, kind) {
      var f = el("feedback");
      f.className = "ms-feedback " + (kind || "");
      f.innerHTML = text || "";
      f.classList.toggle("is-hidden", !text);
    }

    function render() {
      renderView();
      renderTaken();
      renderChrome();
    }

    /* === answering === */

    function judge(guess, d, R) {
      var tol = tolerance(d.slope);
      if (Math.abs(guess - d.slope) <= tol) return { kind: "good" };

      /* the two mistakes worth naming, because each one is a different
         misreading of the same picture */
      if (Math.abs(guess - (d.b - d.a)) <= Math.max(0.02, Math.abs(d.b - d.a) * 0.1)) {
        return {
          kind: "rise",
          why: "That is the rise on its own, the drop between the two probes. A " +
            "slope is a rise per step sideways, so it still has to be divided by " +
            "the gap of " + mono(trim(EPS)) + "."
        };
      }
      if (guess * d.slope < 0) {
        return {
          kind: "sign",
          why: "Close, but not quite there. Also, pay attention to the sign!"
        };
      }
      return {
        kind: "size",
        why: "Not that size. Take " + mono("b − a") + " first, then divide by the " +
          "gap of " + mono(trim(EPS)) + "."
      };
    }

    function check() {
      if (state.revealed) return;
      var raw = parseFloat(el("answer").value);
      var d = reading();
      var R = round();
      if (!Number.isFinite(raw)) {
        say("Put a number in the box first. Two heights and a gap are all it takes.", "bad");
        return;
      }
      var v = judge(raw, d, R);
      if (v.kind === "good") {
        solve();
        return;
      }
      say(v.why, "bad");
      renderChrome();
    }

    function solve() {
      var d = reading();
      var R = round();
      state.revealed = true;
      state.solved[state.idx] = true;
      el("answer").value = d.slope.toFixed(3);
      say("", "");
      renderView();
      renderTaken();
      renderChrome();
      if (state.idx < ROUNDS.length - 1) {
        var next = ROUNDS[state.idx + 1];
        el("readingcard").classList.add("is-hidden");
        el("verdictcard").classList.remove("is-hidden");
        el("verdict").className = "verdict good";
        el("verdict").innerHTML =
          '<p class="verdict-body"><span class="verdict-title">That is the correct slope.</span>' +
          "<br><br>&#128161; " + R.after + "</p>";
        el("verdictactions").innerHTML =
          '<button type="button" class="btn btn-primary" data-act="nextround">' +
          "Next slope</button>";
      } else {
        finish();
      }
    }

    function nextRound() {
      state.idx += 1;
      state.revealed = false;
      el("answer").value = "";
      say("", "");
      el("verdictcard").classList.add("is-hidden");
      el("readingcard").classList.remove("is-hidden");
      render();
      el("answer").focus();
    }

    function finish() {
      state.finished = true;
      if (ctx.done) ctx.done();

      el("readingcard").classList.add("is-hidden");
      el("verdictcard").classList.remove("is-hidden");
      el("verdict").className = "verdict good";
      el("verdict").innerHTML =
        '<p class="verdict-title">One valley, one method, four different answers.</p>' +
        '<p class="verdict-body">The valley never changed, the grasshopper location did. ' +
        "Thus, the slope is a property of each position, which the grasshopper can " +
        "discover.</p>" +
        '<p class="verdict-body">Read the slopes as instructions: go right, go ' +
        "right harder, stop, you went too far. The grasshopper found a floor without " +
        "seen it.</p>" +
        '<p class="verdict-stats">One question is left: the gap between the probes was ' +
        mono(trim(EPS)) + ". What happens to these four slopes when probes move " +
        "closer?</p>";
      el("verdictactions").innerHTML =
        '<button type="button" class="btn" data-act="again">Take the readings again</button>' +
        '<button type="button" class="btn btn-primary" data-act="onward">Close the gap</button>';
    }

    function restart() {
      state.idx = 0;
      state.revealed = false;
      state.finished = false;
      el("answer").value = "";
      say("", "");
      el("verdictcard").classList.add("is-hidden");
      el("readingcard").classList.remove("is-hidden");
      render();
    }

    /* === events === */

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var n = t.closest("[data-act]");
      if (!n) return;
      var act = n.getAttribute("data-act");
      if (act === "check") check();
      else if (act === "nextround") nextRound();
      else if (act === "again") restart();
      else if (act === "onward" && ctx.next) ctx.next();
    });

    el("answer").addEventListener("keydown", function (e) {
      if (e.key === "Enter") {
        e.preventDefault();
        check();
      }
    });

    /* a mouse scroll over a focused number input silently bumps its value;
       the player should only be able to change it by typing */
    el("answer").addEventListener("wheel", function (e) {
      e.preventDefault();
    }, { passive: false });

    say("", "");
    render();

    return {
      show: function () { render(); },
      hide: function () { view.cancel(); }
    };
  }

  window.MissionSlope = { mount: mount };
})();
