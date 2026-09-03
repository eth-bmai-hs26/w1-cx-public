/* ============================================================================
   mission-autopilot.js : station eight, "Hand it to the rule".

   Everything the player has built is now in one line:

       theta  <-  theta  -  alpha * grad J(theta)

   The gradient came from station seven. Alpha is the one thing left to choose,
   and choosing it is the whole station: it is the number that turns a
   steepness into a distance, which is exactly the judgement the player has
   been making by eye for five valleys.

   The rule then runs on THOSE five valleys, and it fails on the same four
   things the player failed on, for the same four reasons. That is the point of
   the station and the reason it comes before the written explanation rather
   than after it: by the time the reader meets "why the levels were hard", they
   have watched an automatic procedure hit every one of them.

   At alpha = 0.5, the value the station starts with, the five valleys give all
   five outcomes. The messages are computed, never pinned to a valley:

     one valley      descends to the floor and stops there on its own
     the long shelf  creeps, and runs out of budget still creeping
     two valleys     converges on the SHALLOWER floor and is content
     narrow pit      steps over the bottom and back, over and back
     rough ground    settles on the first ripple trough it meets

   The landscape is revealed here, on purpose. For five valleys the player was
   not allowed to see it. The rule still is not: it reads one slope where it
   stands, exactly as before. The reveal is for the player, so they can watch
   what a blind procedure does with a valley it cannot see.

   API : the station contract in stations.js
     window.MissionAutopilot.mount(host, ctx) -> { show, hide }
   ============================================================================ */
(function () {
  "use strict";

  var LS = window.Landscape;

  var BUDGET = 60;        /* steps, the same budget the hills are pinned against */
  var TICK = 130;         /* ms between steps on auto */
  var SETTLED = 1e-4;     /* a step this small is the rule stopping itself */
  var ALPHA0 = 0.5;       /* every hill gives a different outcome at this alpha */

  function dirWord(d) {
    return d >= 0 ? "right" : "left";
  }

  function template() {
    return [
      '<div class="game-grid">',
      '<div class="game-main">',

      '<div class="card" data-el="worldcard">',
      '<div class="card-head">',
      '<h3 class="card-title" data-el="hilltitle">Valley</h3>',
      '<span class="card-note">Click to start somewhere else</span>',
      "</div>",
      '<div class="card-body wv-body">',
      '<div class="wv-scroll"><div class="wv-host ap-wv-host" data-el="wvhost"></div></div>',
      '<p class="caption" data-el="wvcaption"></p>',
      "</div>",
      "</div>",

      '<div class="card" data-el="tablecard">',
      '<div class="card-body ml-table-body">',
      '<div class="ml-table-scroll">',
      '<table class="ml-table">',
      "<thead><tr><th>Step</th><th>Middle point θ</th><th>Slope ∇J(θ)</th>",
      "<th>Move by α × ∇J(θ)</th><th>Height J(θ)</th></tr></thead>",
      '<tbody data-el="rows"></tbody>',
      "</table></div>",
      '<p class="caption" data-el="tablecaption"></p>',
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
      '<div class="card-head"><h3 class="card-title">The rule</h3></div>',
      '<div class="card-body">',

      '<div class="ap-rule">θ &larr; θ &minus; α × ∇J(θ)</div>',
      '<p class="ms-lede">Read the slope.<br>Multiply it by a number.<br>Move that far.' +
      "<br>Repeat.</p>",

      '<div class="control-group">',
      '<div class="control-label"><span>Step size <span class="ctl-sym">α</span></span></div>',
      '<div class="slider-row">',
      '<input type="range" class="slider" data-el="alpha" min="0.01" max="7" step="0.01"',
      ' value="0.5" aria-label="Step size alpha">',
      '<input type="number" class="num-input" data-el="alphanum" min="0.01" max="7"',
      ' step="0.01" value="0.50" aria-label="Step size alpha in numbers">',
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
    var levels = window.LANDSCAPES;

    var state = {
      hill: 0,
      alpha: ALPHA0,
      start: levels[0].start,
      theta: levels[0].start,
      steps: 0,
      trail: [levels[0].start],
      log: [],
      running: false,
      stopped: null,        /* the classified outcome once it has stopped */
      verdictShown: false,  /* the outcome is known; the reader has asked to see it */
      best: null,           /* lowest J seen during the run */
      flips: 0,             /* times the slope changed sign, over the whole run */
      biggest: null         /* the largest single move, and where it landed */
    };

    var timer = null;

    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    /* Smaller than the 740x570 the descent stations run this same view at:
       here it sits above a table rather than carrying the whole card alone,
       and the height is locked in game.css to match. */
    var world = window.WorldView.create(el("wvhost"), {
      width: 620,
      height: 380,
      onClick: function (theta) { setStart(theta); }
    });

    function L() {
      return levels[state.hill];
    }

    /* === the run === */

    function resetRun(keepStart) {
      stopAuto();
      var lv = L();
      if (!keepStart) state.start = lv.start;
      state.theta = LS.clamp(lv, state.start);
      state.steps = 0;
      state.trail = [state.theta];
      state.log = [];
      state.stopped = null;
      state.verdictShown = false;
      state.best = { theta: state.theta, J: lv.J(state.theta) };
      state.flips = 0;
      state.biggest = null;
      render();
    }

    function setHill(i) {
      state.hill = i;
      resetRun(false);
    }

    /* One application of the line in the sidebar, and the only place in this
       file where the landscape is touched at all. */
    function step() {
      if (state.stopped) return;
      var lv = L();
      var from = state.theta;
      var g = LS.grad(lv, from);
      var move = state.alpha * g;
      var to = LS.clamp(lv, from - move);

      var last = state.log[state.log.length - 1];
      if (last && last.grad * g < 0) state.flips += 1;
      if (!state.biggest || Math.abs(move) > Math.abs(state.biggest.move)) {
        state.biggest = { move: move, from: from, to: to, grad: g, n: state.steps + 1 };
      }

      state.steps += 1;
      state.theta = to;
      state.trail.push(to);
      state.log.push({ n: state.steps, theta: from, grad: g, move: move, J: lv.J(from) });
      if (lv.J(to) < state.best.J) state.best = { theta: to, J: lv.J(to) };

      if (Math.abs(move) < SETTLED) finish("settled");
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

    /* The button is only enabled once state.stopped is already set (see
       renderChrome), so by the time this runs the outcome is known and
       waiting; this just admits the reader to it. */
    function revealVerdict() {
      if (!state.stopped) return;
      state.verdictShown = true;
      render();
    }

    /* === what happened ===
       Every branch below is read off the run and the landscape's own pinned
       facts, so a hill can be edited without a message here going stale. */

    function nearestMin(lv, theta) {
      var near = null;
      var gap = Infinity;
      var i, d;
      for (i = 0; i < lv.minima.length; i++) {
        d = Math.abs(lv.minima[i].theta - theta);
        if (d < gap) { gap = d; near = lv.minima[i]; }
      }
      return { min: near, gap: gap };
    }

    function finish(why) {
      stopAuto();
      var lv = L();
      var jt = lv.J(state.theta);
      var span = lv.range.hi - lv.range.lo;
      var rel = span > 0 ? (jt - lv.floor.J) / span : 0;
      var nm = nearestMin(lv, state.theta);
      var v = { why: why, kind: "warn", title: "", body: "", J: jt, rel: rel };

      if (rel <= 0.01) {
        v.kind = "good";
        v.title = "It stopped at the floor, and stopped itself.";
        v.body = "Near the bottom the ground flattens and the slope ∇J(θ) shrinks, " +
          "so the moves shrink with it.";
      } else if (why === "settled" && nm.min && nm.gap <= 0.35 &&
                 Math.abs(nm.min.theta - lv.floor.theta) > 1e-6) {
        v.kind = "bad";
        v.title = "It stopped, and it is not the bottom.";
        v.body = "The rule converged short of the real floor, further to the " +
          dirWord(lv.floor.theta - state.theta) + ". The rule is not broken and it did " +
          "not give up: the slope here really is zero, so the line really does have " +
          "nothing left to do. This is a <strong>local minimum</strong>, and a slope " +
          "read where you stand cannot tell you that lower ground exists elsewhere.";
      } else if (why === "settled") {
        v.kind = "warn";
        v.title = "It stopped on flat ground that is not the floor.";
        v.body = "The slope here is small enough that α times it is smaller than the " +
          "rule can act on, and this is not the bottom.";
      } else if (state.biggest && Math.abs(state.biggest.move) > 1) {
        /* the narrow pit: one α cannot serve both a gentle basin and a
           narrow dip, and the run says so in one number */
        v.kind = "bad";
        v.title = "One step threw it clean across the valley.";
        v.body = "It descended the gentle ground without trouble. Then one step, " +
          "multiplied by α, carried it straight over the bottom and up the far side. " +
          "The step size that suited the basin is far too big for the pit in it. It " +
          "touched the bottom on the way through, and could not stay there.";
      } else if (state.flips >= 3) {
        v.kind = "bad";
        v.title = "It is stepping over the bottom and back again.";
        v.body = "Look at the sign in the third column: right, left, right, left. The " +
          "slope keeps changing sign because every step lands on the far side of the " +
          "bottom and is sent back. A smaller α stops the bouncing, and takes longer " +
          "over everything else.";
      } else if (Math.abs(state.theta - state.start) < 0.6) {
        v.kind = "warn";
        v.title = "It ran out of budget without going anywhere.";
        v.body = "It barely moved, and it is still pointing the right way: the slope " +
          "has the correct sign and almost no size. On a shelf the rule is right and " +
          "useless at the same time. It would keep creeping for as long as the shelf " +
          "lasts.";
      } else {
        v.kind = "warn";
        v.title = "It ran out of budget while still descending.";
        v.body = "It just was not going to get there at this α.";
      }

      state.stopped = v;
      if (ctx.done) ctx.done();
    }

    /* === rendering === */

    function renderRows() {
      var tail = state.log.slice(-6);
      var out = [];
      var i, r;
      for (i = 0; i < tail.length; i++) {
        r = tail[i];
        out.push("<tr" + (i === tail.length - 1 ? ' class="is-latest"' : "") + ">" +
          "<td>" + r.n + "</td><td>" + r.theta.toFixed(3) + "</td><td>" +
          (r.grad >= 0 ? "+" : "") + r.grad.toFixed(4) + "</td><td>" +
          (r.move >= 0 ? "+" : "") + r.move.toFixed(4) + "</td><td>" +
          r.J.toFixed(3) + "</td></tr>");
      }
      el("rows").innerHTML = out.join("") ||
        '<tr><td colspan="5" class="ml-empty">No steps yet.</td></tr>';
      el("tablecaption").textContent = "";
    }

    function renderWorld() {
      var lv = L();
      world.render({
        L: lv,
        theta: state.theta,
        trail: state.trail,
        committed: !!state.stopped
      });
      el("hilltitle").textContent = "Valley " + (state.hill + 1) + " of " + levels.length +
        " : " + lv.name;
      el("wvcaption").textContent = "";
    }

    function renderChrome() {
      var alpha = el("alpha");
      var alphanum = el("alphanum");
      if (document.activeElement !== alpha) alpha.value = String(state.alpha);
      if (document.activeElement !== alphanum) alphanum.value = state.alpha.toFixed(2);

      root.querySelector('[data-act="step"]').disabled = !!state.stopped || state.running;
      root.querySelector('[data-act="auto"]').disabled = !!state.stopped || state.running;
      root.querySelector('[data-act="skip"]').disabled = !state.stopped;
      el("stopbtn").classList.toggle("is-hidden", !state.running);
    }

    function renderVerdict() {
      var card = el("verdictcard");
      /* The verdict takes the place of the world view and the step table
         rather than sitting below them, but only once asked for: the rule
         stopping on its own does not show it, "Get the verdict" does. Until
         then the reader is still looking at the run itself, not a page that
         has already told them how it ends. */
      el("worldcard").classList.toggle("is-hidden", state.verdictShown);
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

      var acts = ['<button type="button" class="btn" data-act="reset">Run it again</button>'];
      if (state.hill < levels.length - 1) {
        acts.push('<button type="button" class="btn" data-act="nexthill">' +
          "Try the next valley</button>");
      } else {
        acts.push('<button type="button" class="btn btn-primary" data-act="onward">' +
          "On to two directions</button>");
      }
      el("verdictactions").innerHTML = acts.join("");
    }

    function render() {
      renderWorld();
      renderRows();
      renderChrome();
      renderVerdict();
    }

    /* === events === */

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
        else if (act === "nexthill") setHill(state.hill + 1);
        else if (act === "onward" && ctx.next) ctx.next();
      }
    });

    function setAlpha(v) {
      if (!Number.isFinite(v)) return;
      state.alpha = Math.max(0.01, Math.min(7, Math.round(v * 100) / 100));
      /* changing the rule mid-run would make the table a record of two
         different rules, so it starts the run over */
      resetRun(true);
    }

    function setStart(v) {
      if (!Number.isFinite(v)) return;
      state.start = LS.clamp(L(), v);
      resetRun(true);
    }

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

  window.MissionAutopilot = { mount: mount };
})();
