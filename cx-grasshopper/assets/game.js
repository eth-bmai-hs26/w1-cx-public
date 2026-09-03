/* ============================================================================
   game.js : state, controls, verdict.

   The player has two levers, direction and distance, and one piece of
   evidence, the patch of ground under the grasshopper's feet. Everything the
   player is not entitled to (the floor, the lowest height, the whole landscape)
   stays hidden until the flag is planted or the landscape switch is thrown.
   There is no target number of jumps and no score: the descent is not a race,
   and a jump count as a goal teaches the wrong thing about a method whose step
   count is decided by one number nobody has met yet. What a jump count is good
   for comes back at station eight, where alpha is what decides it. The three
   switches are the only way to buy more information, and all three start off.

   This is the first station of the session (the five valleys) and it answers to
   the station contract in stations.js: mount(host, ctx), then show and hide as
   the player moves along the bar. The five valleys are sub-levels inside it, with
   their own quiet bar under the station bar; ctx.onChange tells the spine which
   valley is showing.

   API
     window.Game.mount(root, ctx) -> {
       show(), hide(),
       setLevel(idx), setReveal(bool), setHints({grad, tangent}),
       jump(dir, dist), commit(), reset(), replayDemo(kind)
     }
     window.Game.readBest(L) -> best jump count for that valley, or null

   js/main.js reaches the last six through the spine. replayDemo applies a
   pinned demo sequence instantly, with no animation, and leaves the trail and
   the turn count fully populated.
   ============================================================================ */
(function () {
  "use strict";

  var LS = window.Landscape;

  /* === small helpers === */

  function bestKey(L) {
    return "grasshopper-best-" + L.id;
  }

  function readBest(L) {
    try {
      var v = parseInt(window.localStorage.getItem(bestKey(L)), 10);
      return Number.isFinite(v) ? v : null;
    } catch (e) {
      return null;
    }
  }

  function writeBest(L, n) {
    try {
      window.localStorage.setItem(bestKey(L), String(n));
    } catch (e) {
      /* file:// or private mode : the score simply does not persist */
    }
  }

  /* === the page furniture, built once === */

  function template() {
    return [
      '<div class="game-grid">',
      '<div class="game-main">',
      '<div class="card view-card">',
      '<div class="card-body lv-body">',
      '<div class="lv-scroll" data-el="lvscroll"><div class="lv-host" data-el="lvhost"></div></div>',
      '<div class="wv-scroll is-hidden" data-el="wvscroll">',
      '<div class="wv-host" data-el="wvhost"></div></div>',
      '<div class="step-overlay" data-el="stepoverlay">',
      '<div class="control-label"><span>Step</span></div>',
      '<div class="slider-row">',
      '<input type="range" class="slider" data-el="slider" min="0.01" max="3" step="0.01" value="0.5"',
      ' aria-label="Jump distance">',
      '<input type="number" class="num-input" data-el="num" min="0.01" max="3" step="0.01" value="0.50"',
      ' aria-label="Jump distance in numbers">',
      "</div>",
      "</div>",
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

      /* The sidebar is taller than a laptop viewport and it is sticky, so
         whatever sits at the top of it is what stays on screen: the loop the
         player is in, which is jump, plant and the three switches.
         The level picker is not part of that loop and lives in the bar at the
         top of the section instead. */
      '<aside class="game-side">',
      '<div class="card">',
      '<div class="card-head"><h3 class="card-title">Controls</h3></div>',
      '<div class="card-body">',
      '<p class="kbd-hint">Set the direction with <kbd>&#8592;</kbd> and <kbd>&#8594;</kbd>.<br><br><br>',
      "Set the distance with <kbd>&#8593;</kbd> and <kbd>&#8595;</kbd>.<br><br><br>",
      "Jump with <kbd>Space</kbd>.<br><br><br>",
      "Plant the flag with <kbd>F</kbd>.</p>",
      "</div>",
      "</div>",
      "</aside>",
      "</div>"
    ].join("");
  }

  /* === the mount === */

  function mount(root, ctx) {
    var levels = window.LANDSCAPES;
    ctx = ctx || {};

    /* The station spine hides this panel rather than tearing it down, so the
       window key handler has to know whether it is the one on screen. */
    var active = true;

    var state = {
      levelIdx: 0,
      theta: levels[0].start,
      turns: 0,
      trail: [levels[0].start],
      dir: 1,
      dist: 0.5,
      reveal: false,
      hints: { grad: false, tangent: false },
      committed: false,
      verdict: null,
      flying: false
    };

    root.classList.add("game");
    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    function level() {
      return levels[state.levelIdx];
    }

    var local = window.LocalView.create(el("lvhost"), {});
    var world = window.WorldView.create(el("wvhost"), {});

    var slider = el("slider");
    var num = el("num");

    /* === state transitions === */

    function clampDist(v) {
      var L = level();
      if (!Number.isFinite(v)) return state.dist;
      if (v < 0.01) return 0.01;
      if (v > L.maxJump) return L.maxJump;
      return Math.round(v * 100) / 100;
    }

    function resetLevelState() {
      var L = level();
      state.theta = L.start;
      state.turns = 0;
      state.trail = [L.start];
      state.committed = false;
      state.verdict = null;
      state.dir = 1;
      state.dist = Math.min(0.5, L.maxJump);
    }

    function setLevel(idx) {
      if (!Number.isFinite(idx)) return;
      idx = Math.round(idx);
      if (idx < 0) idx = 0;
      if (idx > levels.length - 1) idx = levels.length - 1;
      local.cancel();
      state.flying = false;
      state.levelIdx = idx;
      resetLevelState();
      render();
    }

    function reset() {
      local.cancel();
      state.flying = false;
      resetLevelState();
      render();
    }

    function setReveal(on) {
      state.reveal = !!on;
      render();
    }

    function setHints(h) {
      h = h || {};
      if ("grad" in h) state.hints.grad = !!h.grad;
      if ("tangent" in h) state.hints.tangent = !!h.tangent;
      render();
    }

    /* One control at a time: while a jump is still in the air, nothing else
       is allowed to touch state. render() would call local.render(), which
       cancels the running animation out from under itself and leaves
       state.flying stuck true forever, so every control that can fire mid
       flight (keys, the slider, the number box) is blocked here at the
       source instead of at each caller. */
    function setDir(d) {
      if (state.flying) return;
      state.dir = d < 0 ? -1 : 1;
      render();
    }

    function setDist(v) {
      if (state.flying) return;
      state.dist = clampDist(v);
      render();
    }

    function jump(dir, dist) {
      if (state.flying || state.committed) return;
      var L = level();
      var d = dir < 0 ? -1 : 1;
      var s = clampDist(dist);
      var from = state.theta;
      var to = LS.clamp(L, from + d * s);
      state.dir = d;
      state.dist = s;
      state.flying = true;
      renderChrome();
      local.animateJump(from, to, function () {
        state.flying = false;
        state.theta = to;
        state.turns += 1;
        state.trail.push(to);
        render();
      });
    }

    function commit() {
      if (state.committed || state.flying) return;
      var L = level();
      state.committed = true;
      state.verdict = judge(L, state.theta, state.turns);
      if (state.verdict.kind === "good") {
        var b = readBest(L);
        if (b === null || state.turns < b) writeBest(L, state.turns);
      }
      render();
    }

    function replayDemo(kind) {
      var L = level();
      var script = (L.demo && L.demo[kind === "stuck" ? "stuck" : "descend"]) || [];
      local.cancel();
      state.flying = false;
      resetLevelState();
      var i, d, s, to;
      for (i = 0; i < script.length; i++) {
        d = script[i][0] < 0 ? -1 : 1;
        s = clampDist(script[i][1]);
        to = LS.clamp(L, state.theta + d * s);
        state.theta = to;
        state.turns += 1;
        state.trail.push(to);
        state.dir = d;
        state.dist = s;
      }
      render();
    }

    /* === the verdict === */

    function judge(L, theta, turns) {
      var jt = L.J(theta);
      var span = L.range.hi - L.range.lo;
      var rel = span > 0 ? (jt - L.floor.J) / span : 0;
      var g = LS.grad(L, theta);
      var flat = 0.01 * L.maxSlope;
      var pct = span > 0 ? ((L.range.hi - jt) / span) * 100 : 100;

      var v = { kind: "bad", title: "", body: "", J: jt, pct: pct, turns: turns };

      if (rel <= 0.01) {
        v.kind = "good";
        v.title = "You are at the floor.";
        v.body = "";
        return v;
      }

      if (Math.abs(g) <= flat) {
        v.kind = "warn";
        /* which flat thing is this : a shallower floor, or a shelf that only
           feels like one? */
        var near = null;
        var bestGap = Infinity;
        var i, gap;
        for (i = 0; i < L.minima.length; i++) {
          gap = Math.abs(L.minima[i].theta - theta);
          if (gap < bestGap) {
            bestGap = gap;
            near = L.minima[i];
          }
        }
        var tol = Math.max(0.35, L.view.halfW * 2);
        /* Nearness in theta alone is not enough. On a rippled landscape a
           ridge sits well inside tol of the floor beside it, and calling that
           ridge a floor is the one thing this verdict must never do. The
           slope has to be turning upward, not merely flattening. */
        var curv = LS.grad(L, theta + 0.01) - LS.grad(L, theta - 0.01);
        if (near && bestGap <= tol && curv > 0 &&
            Math.abs(near.theta - L.floor.theta) > 1e-6) {
          v.title = "You are in a pit, but not the lowest one.";
          v.body = "";
        } else {
          v.title = "You are on flat ground, but not at the floor.";
          v.body = "";
        }
        return v;
      }

      v.kind = "bad";
      v.title = "You placed your flag on a slope.";
      v.body = "";
      return v;
    }

    /* === rendering === */

    /* The station bar above belongs to stations.js, and only wants to know
       which valley this is. The spine never calls back in here, so there is no
       loop. */
    function notify() {
      if (typeof ctx.onChange === "function") ctx.onChange(state.levelIdx);
    }

    function renderVerdict() {
      var card = el("verdictcard");
      var L = level();
      if (!state.committed || !state.verdict) {
        card.classList.add("is-hidden");
        el("verdict").className = "verdict";
        el("verdict").innerHTML = "";
        el("verdictactions").innerHTML = "";
        return;
      }
      var v = state.verdict;
      card.classList.remove("is-hidden");
      el("verdict").className = "verdict " + v.kind;
      el("verdict").innerHTML =
        '<p class="verdict-body"><span class="verdict-title">' + v.title + "</span>" +
        (v.body ? " " + v.body : "") + "</p>";

      var acts = ['<button type="button" class="btn" data-act="retry">Try this level again</button>'];
      if (state.levelIdx < levels.length - 1) {
        acts.push('<button type="button" class="btn btn-primary" data-act="next">Next level</button>');
      } else if (ctx.next) {
        /* the last valley has no next valley to offer, so the onward button
           leaves the descent behind and moves to the next station instead */
        acts.push('<button type="button" class="btn btn-primary" data-act="onward">Next</button>');
      }
      el("verdictactions").innerHTML = acts.join("");
    }

    function renderChrome() {
      var L = level();
      var showWorld = state.reveal || state.committed;

      slider.max = String(L.maxJump);
      if (document.activeElement !== slider) slider.value = String(state.dist);
      if (document.activeElement !== num) num.value = state.dist.toFixed(2);
      num.max = String(L.maxJump);

      /* One frame, two things it can show: the grasshopper's own narrow
         window, or the whole landscape once the flag is planted. */
      el("lvscroll").classList.toggle("is-hidden", showWorld);
      el("wvscroll").classList.toggle("is-hidden", !showWorld);

      /* Once the flag is down there is nothing left to set: the step that
         got you there is over. */
      el("stepoverlay").classList.toggle("is-hidden", state.committed);

      notify();
      renderVerdict();
    }

    /* The world card is only display:none while it is hidden, so rendering it
       anyway would leave the full profile of the current level sitting in the
       DOM for anyone who opens the inspector. It is drawn the first time it is
       actually shown, and wiped on the way back out. */
    var worldDrawn = false;

    function renderViews() {
      var L = level();
      local.render({ L: L, theta: state.theta, hints: state.hints, dir: state.dir });
      if (state.reveal || state.committed) {
        world.render({
          L: L,
          theta: state.theta,
          trail: state.trail,
          committed: state.committed
        });
        worldDrawn = true;
      } else if (worldDrawn) {
        world.clear();
        worldDrawn = false;
      }
    }

    function render() {
      renderChrome();
      renderViews();
    }

    /* === events === */

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var n;
      if ((n = t.closest("[data-act]"))) {
        var act = n.getAttribute("data-act");
        if (act === "retry") reset();
        else if (act === "next") setLevel(state.levelIdx + 1);
        else if (act === "onward" && ctx.next) ctx.next();
      }
    });

    slider.addEventListener("input", function () {
      setDist(parseFloat(slider.value));
    });
    num.addEventListener("input", function () {
      var v = parseFloat(num.value);
      if (Number.isFinite(v)) setDist(v);
    });
    num.addEventListener("change", function () {
      setDist(parseFloat(num.value));
      num.value = state.dist.toFixed(2);
    });

    window.addEventListener("keydown", function (e) {
      if (!active) return;
      var t = e.target;
      if (t && t.tagName && /^(input|textarea|select)$/i.test(t.tagName)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "ArrowLeft") { e.preventDefault(); setDir(-1); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setDir(1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); setDist(state.dist + 0.05); }
      else if (e.key === "ArrowDown") { e.preventDefault(); setDist(state.dist - 0.05); }
      else if (e.key === " ") {
        if (t && t.tagName === "BUTTON") return;   /* the button click handles it */
        e.preventDefault();
        jump(state.dir, state.dist);
      } else if (e.key === "f" || e.key === "F") {
        e.preventDefault();
        commit();
      }
    });

    resetLevelState();
    render();

    return {
      show: function () { active = true; render(); },
      hide: function () {
        active = false;
        local.cancel();
        state.flying = false;
      },
      setLevel: setLevel,
      setReveal: setReveal,
      setHints: setHints,
      jump: jump,
      commit: commit,
      reset: reset,
      replayDemo: replayDemo
    };
  }

  window.Game = { mount: mount, readBest: readBest };
})();
