/* ============================================================================
   stations.js : the spine of the session.

   The page is one bar of six stations. The first is the descent itself, which
   holds the five valleys as sub-levels of its own: they are one activity with
   changing scenery, not five separate things to get through, so they are
   picked inside the station and the top bar stays short. The four after it are
   the missions that put numbers on what the hand-descending taught: measure
   the slope, shrink the probe, hand the descending to the rule, then do it in
   two directions at once. The bar is the only navigation there is, and the
   order is the argument:

     descend by feel  ->  measure the feel  ->  sharpen the measurement
                      ->  hand it to the rule  ->  the rule in two directions
                      ->  read back what all of that was

   Every station lives in its own container inside one host. A container is
   built the first time its station is visited and then kept, hidden, so a
   player who steps away to a mission and comes back finds their jumps where
   they left them. Only one container is visible at a time.

   A station module is anything with this shape:

     window.<Module>.mount(hostEl, ctx) -> { show?, hide?, destroy? }

   ctx gives the module the two things it cannot know about itself:
     ctx.done()      mark this station cleared (drives the bar, persists)
     ctx.next()      move to the next station
     ctx.station     the station record

   API
     window.Stations.mount(root) -> {
       setStation(idx), setHill(i), next(), prev(), climb(), stationCount()
     }
   ============================================================================ */
(function () {
  "use strict";

  /* === the running order === */

  var MISSIONS = [
    {
      id: "read-the-ground",
      module: "MissionSlope",
      name: "Measure",
      title: "Read the ground yourself",
      teaches: "Two probes and a subtraction give you the number you have been feeling for."
    },
    {
      id: "probe-shrinks",
      module: "MissionLimit",
      name: "Shrink",
      title: "The probe shrinks",
      teaches: "Narrow the gap between the probes and the number settles. That number is the gradient."
    },
    {
      id: "autopilot",
      module: "MissionAutopilot",
      name: "Autopilot",
      title: "Hand it to the rule",
      teaches: "One step size, applied by the rule, on every valley you descended by hand."
    },
    {
      id: "two-directions",
      module: "Mission2D",
      name: "Two directions",
      title: "Two directions at once",
      teaches: "The same rule when position is two numbers instead of one."
    },
    {
      /* The written explanation is the last station rather than a section
         underneath the game. Underneath, it was below the fold of a page that
         already scrolls a long way, and a reader who had just finished the
         last mission had no reason to believe anything was down there. In the
         bar it is a destination, and it is the one the whole order has been
         walking towards. */
      id: "after-the-descent",
      module: "Explain",
      group: "after",
      autoDone: true,
      name: "After the descent",
      title: "What you were doing has a name",
      teaches: "The method you have been using, written down: four symbols and one line."
    }
  ];

  function buildStations() {
    var out = [];
    var i;
    out.push({
      id: "the-descent",
      kind: "climb",
      group: "hills",
      name: "The descent",
      title: "The five valleys",
      teaches: "Five landscapes, descended by hand, with nothing to go on but the ground " +
        "under your feet."
    });
    for (i = 0; i < MISSIONS.length; i++) {
      out.push({
        id: MISSIONS[i].id,
        kind: "mission",
        group: MISSIONS[i].group || "missions",
        module: MISSIONS[i].module,
        autoDone: !!MISSIONS[i].autoDone,
        name: MISSIONS[i].name,
        title: MISSIONS[i].title,
        teaches: MISSIONS[i].teaches
      });
    }
    return out;
  }

  /* === cleared-station memory ===
     Hills already keep a best score under their own key and that is what makes
     them cleared, so nothing is written twice. Missions have no score, only a
     flag. Both reads are wrapped: on file:// or in private mode storage throws,
     and a game that cannot remember is still a game. */

  function doneKey(st) {
    return "grasshopper-done-" + st.id;
  }

  function isDone(st) {
    if (st.kind === "climb") {
      /* the descent counts as done once any valley has been reached; which
         valleys those are is the sub-bar's business, inside the station */
      if (!window.Game || typeof window.Game.readBest !== "function") return false;
      var levels = window.LANDSCAPES;
      var i;
      for (i = 0; i < levels.length; i++) {
        if (window.Game.readBest(levels[i]) !== null) return true;
      }
      return false;
    }
    try {
      return window.localStorage.getItem(doneKey(st)) === "1";
    } catch (e) {
      return false;
    }
  }

  function markDone(st) {
    if (st.kind === "climb") return;
    try {
      window.localStorage.setItem(doneKey(st), "1");
    } catch (e) {
      /* the flag simply does not persist */
    }
  }

  /* === the page furniture === */

  function template() {
    return [
      /* The bar is the session: five valleys nested right inside the descent's
         own node, a divider, four missions. All of it is one horizontally
         scrollable strip rather than two stacked bars: the whole shape of the
         session reads in a glance, and a narrow window scrolls it sideways
         instead of hiding pieces of it. It is sticky under the topbar, so
         where you are and what is left stay readable from the back of a
         lecture room. */
      '<div class="level-bar">',
      '<div class="lvbar-row">',
      '<div class="lvbar-steps" data-el="steps"></div>',
      "</div>",
      "</div>",

      '<div class="station-host" data-el="host"></div>'
    ].join("");
  }

  /* === the mount === */

  function mount(root) {
    var stations = buildStations();
    var idx = 0;

    /* one entry per station id: { box, instance }. Missing means never
       visited, so never built. */
    var built = {};
    var game = null;

    /* Which valley the descent is on, for the readout at the end of the bar. */
    var climbLevel = null;

    root.innerHTML = template();

    function el(name) {
      return root.querySelector('[data-el="' + name + '"]');
    }

    function station() {
      return stations[idx];
    }

    /* === the bar === */

    /* five labels across one row, so the article goes and the next word takes
       the capital: "The long shelf" -> "Long shelf" */
    function shortName(name) {
      var s = name.replace(/^The /, "");
      return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function renderBar() {
      var host = el("steps");
      var i, j, st, node;
      var levels = window.LANDSCAPES;
      if (!host.children.length) {
        var out = [];
        for (i = 0; i < stations.length; i++) {
          st = stations[i];
          /* the divider carries the one structural fact the bar has to say:
             the valleys are one thing, the missions after them are another */
          if (i > 0 && st.group !== stations[i - 1].group) {
            out.push('<span class="lvbar-gap" aria-hidden="true"></span>');
          }
          if (st.kind === "climb") {
            /* the five valleys listed straight out, in the descent's own
               place in the bar, rather than behind a single "The descent"
               node: they are the session's real first five steps */
            for (j = 0; j < levels.length; j++) {
              out.push(
                '<button type="button" class="lvbar-step" data-level="' + j + '" ' +
                'title="' + levels[j].name + " — " + levels[j].teaches + '">' +
                '<span class="lvbar-tick"></span>' +
                '<span class="lvbar-name">' + shortName(levels[j].name) + "</span></button>"
              );
            }
          } else {
            out.push(
              '<button type="button" class="lvbar-step" data-station="' + i + '" ' +
              'title="' + (i + 1) + ". " + st.title + " — " + st.teaches + '">' +
              '<span class="lvbar-tick"></span>' +
              '<span class="lvbar-name">' + st.name + "</span></button>"
            );
          }
        }
        host.innerHTML = out.join("");
      }
      for (i = 0; i < stations.length; i++) {
        if (stations[i].kind === "climb") continue;
        node = host.querySelector('[data-station="' + i + '"]');
        node.classList.toggle("is-current", i === idx);
        node.classList.toggle("is-done", isDone(stations[i]) && i !== idx);
        node.setAttribute("aria-current", i === idx ? "true" : "false");
      }
      /* The valleys are peers of the stations in this one flat list now, so
         only one tick in the whole bar is ever "current": a valley counts
         only while the descent is actually the station on screen. */
      var onClimb = idx === 0;
      for (i = 0; i < levels.length; i++) {
        node = host.querySelector('[data-level="' + i + '"]');
        node.classList.toggle("is-current", onClimb && i === climbLevel);
        node.classList.toggle("is-done",
          !!(window.Game && window.Game.readBest(levels[i]) !== null) &&
          !(onClimb && i === climbLevel));
        node.setAttribute("aria-current", onClimb && i === climbLevel ? "true" : "false");
      }
    }

    /* === station containers === */

    /* Both kinds of station answer to the same three optional hooks, so the
       switch below never has to know which kind it is holding. */
    function ctxFor(st) {
      return {
        station: st,
        done: function () {
          markDone(st);
          renderBar();
        },
        next: function () {
          setStation(indexOf(st) + 1);
        }
      };
    }

    function indexOf(st) {
      var i;
      for (i = 0; i < stations.length; i++) if (stations[i] === st) return i;
      return 0;
    }

    /* Valleys share one container and one Game: five copies of the descent
       would be five copies of its state, and the bar would be lying about
       which one you are in. */
    function keyOf(st) {
      return st.kind === "climb" ? "climb" : st.id;
    }

    function build(st) {
      var key = keyOf(st);
      if (built[key]) return built[key];

      var box = document.createElement("div");
      box.className = "station is-hidden";
      box.setAttribute("data-station-box", key);
      el("host").appendChild(box);

      var instance = null;
      if (st.kind === "climb") {
        var climbCtx = ctxFor(st);
        climbCtx.onChange = onClimbChange;
        instance = window.Game.mount(box, climbCtx);
        game = instance;
        window.grasshopperGame = instance;
      } else if (window[st.module] && typeof window[st.module].mount === "function") {
        instance = window[st.module].mount(box, ctxFor(st));
      } else {
        /* The module for this station has not landed yet. Say so plainly
           rather than showing an empty column: this page is handed to a room
           of students mid-build. */
        box.innerHTML = placeholder(st);
      }

      built[key] = { box: box, instance: instance };
      return built[key];
    }

    function placeholder(st) {
      return [
        '<div class="card station-soon">',
        '<div class="card-head"><h3 class="card-title">' + st.title + "</h3>",
        '<span class="card-note">Not built yet</span></div>',
        '<div class="card-body">',
        '<p class="soon-line">' + st.teaches + "</p>",
        '<p class="soon-sub">This station is still being written. Everything before it ',
        "works.</p>",
        "</div></div>"
      ].join("");
    }

    /* The descent owns which valley it is on, and says so whenever it moves:
       the bar only repeats it in the readout. */
    function onClimbChange(levelIdx) {
      climbLevel = levelIdx;
      renderBar();
    }

    /* ?level=N, and anything else that wants a particular valley, goes through
       the descent station rather than through the bar. */
    function setHill(i) {
      setStation(0);
      var entry = built[keyOf(stations[0])];
      if (entry && entry.instance && entry.instance.setLevel) entry.instance.setLevel(i);
    }

    /* === switching === */

    function setStation(n) {
      if (!Number.isFinite(n)) return;
      n = Math.round(n);
      if (n < 0) n = 0;
      if (n > stations.length - 1) n = stations.length - 1;

      var prevKey = keyOf(station());
      var st = stations[n];
      var nextKey = keyOf(st);

      /* Leaving a station stops it: an autopilot left running behind a hidden
         panel would keep stepping, and a jump animation would keep firing. */
      if (built[prevKey] && prevKey !== nextKey) {
        built[prevKey].box.classList.add("is-hidden");
        if (built[prevKey].instance && built[prevKey].instance.hide) {
          built[prevKey].instance.hide();
        }
      }

      idx = n;
      var entry = build(st);
      entry.box.classList.remove("is-hidden");
      if (entry.instance && entry.instance.show) entry.instance.show();
      /* a station with nothing to answer is done by being read */
      if (st.autoDone) markDone(st);
      renderBar();
    }

    /* === events === */

    root.addEventListener("click", function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var n = t.closest("[data-station]");
      if (n) {
        setStation(Number(n.getAttribute("data-station")));
        return;
      }
      n = t.closest("[data-level]");
      if (n) {
        /* the valley ticks stay on screen no matter which station is showing,
           so picking one has to bring the descent onto the screen too */
        if (idx !== 0) setStation(0);
        if (game && game.setLevel) game.setLevel(Number(n.getAttribute("data-level")));
        return;
      }
    });

    setStation(0);

    return {
      setStation: setStation,
      setHill: setHill,
      next: function () { setStation(idx + 1); },
      prev: function () { setStation(idx - 1); },
      climb: function () { return game; },
      stationCount: function () { return stations.length; }
    };
  }

  window.Stations = { mount: mount };
})();
