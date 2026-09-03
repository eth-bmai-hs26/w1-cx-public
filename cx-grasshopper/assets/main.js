/* ============================================================================
   main.js : boot file.
   Mounts the station spine, then applies the URL test hooks. Everything here is a DEV AFFORDANCE for headless screenshots except
   ?level=, which is a legitimate deep link a lecturer can use mid-lecture.

   URL parameters (query string or hash, both accepted):
     ?level=N        select valley N of the descent, 1-based (user-facing deep link)
     ?station=N      select station N, 1-based          (user-facing deep link)
     ?theme=dark     force a theme                     (handled in theme.js)
     ?test=revealed  turn the landscape toggle on
     ?test=hints     turn the slope-line and gradient readouts on
     ?test=played    replay the level's scripted demo jumps
     ?test=committed replay the demo jumps, then plant the flag
     ?test=stuck     replay the scripted jumps that end short of the floor,
                     then plant the flag, which is the losing verdict
   ============================================================================ */
(function () {
  "use strict";

  function params() {
    var q = window.location.search || "";
    var h = (window.location.hash || "").replace(/^#/, "");
    return new URLSearchParams(q.replace(/^\?/, "") + "&" + h);
  }

  document.addEventListener("DOMContentLoaded", function () {
    var p = params();

    var hero = document.querySelector(".hero");
    var gameRoot = document.getElementById("game-root");
    var heroNext = document.getElementById("hero-next");
    var aboutToggle = document.getElementById("about-toggle");

    /* The hero is its own screen until the reader clicks past it. A deep link
       (?station=, ?level=, ?test=) means the reader has already been sent
       straight at a station on purpose, so it skips the hero instead of
       hiding the very thing the link asked for. The hint button stays off
       the hero too: the hero already says everything it would show. */
    function reveal() {
      if (hero) hero.classList.add("is-hidden");
      gameRoot.classList.remove("is-hidden");
      if (aboutToggle) aboutToggle.classList.remove("is-hidden");
      gameRoot.scrollIntoView({ block: "start" });
    }
    if (heroNext) heroNext.addEventListener("click", reveal);

    /* The intro text, reachable again from any station without leaving it:
       a sheet that drops open from the topbar and closes on a second press. */
    var aboutPanel = document.getElementById("about-panel");
    if (aboutToggle && aboutPanel) {
      aboutToggle.addEventListener("click", function () {
        var open = aboutPanel.classList.toggle("is-hidden") === false;
        aboutToggle.setAttribute("aria-expanded", String(open));
      });
    }

    var hasDeepLink = p.has("station") || p.has("level") || p.has("test");
    if (hasDeepLink) reveal();

    /* The explanation is not mounted here: it is the last station, and
       stations.js mounts it the first time a reader goes there. */
    var stations = null;
    if (window.Stations && typeof window.Stations.mount === "function") {
      stations = window.Stations.mount(gameRoot);
      window.grasshopperStations = stations;
    }
    if (!stations) return;

    /* ?station= addresses the bar, ?level= addresses a valley inside the first
       station. Both are 1-based. */
    var st = parseInt(p.get("station"), 10);
    if (Number.isFinite(st) && st >= 1) stations.setStation(st - 1);

    var lvl = parseInt(p.get("level"), 10);
    if (Number.isFinite(lvl) && lvl >= 1) stations.setHill(lvl - 1);

    /* Every hook below drives the descent, so it only exists once the descent has
       been mounted, which setStation above has done for any valley. */
    var game = stations.climb();
    if (!game) return;

    var test = p.get("test");
    if (!test) return;

    if (test === "revealed") {
      game.setReveal(true);
    } else if (test === "hints") {
      game.setHints({ grad: true, tangent: true });
    } else if (test === "played" || test === "committed" || test === "stuck") {
      game.replayDemo(test === "stuck" ? "stuck" : "descend");
      game.setReveal(true);
      /* stuck plants the flag too: the whole point of that sequence is the
         verdict it earns, and there is no other way to reach it from a URL */
      if (test === "committed" || test === "stuck") game.commit();
    }
  });
})();
