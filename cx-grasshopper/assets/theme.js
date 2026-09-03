/* ============================================================================
   theme.js : light / dark theme toggle.
   Light is the lecture default. Stores the choice in localStorage, stamps
   data-theme on <html>, wires the topbar toggle button, and binds the 't'
   keyboard shortcut for a mid-lecture switch. Exposes window.Theme.
   Loads before the views so data-theme is set before anything measures.
   ============================================================================ */
(function () {
  "use strict";

  var KEY = "grasshopper-theme";
  var root = document.documentElement;
  var listeners = [];

  function apply(theme) {
    root.setAttribute("data-theme", theme);
    var btn = document.getElementById("theme-toggle");
    if (btn) {
      // the label shows the action : clicking it switches TO the other theme
      btn.textContent = theme === "dark" ? "Light" : "Dark";
      btn.setAttribute("aria-label", "Switch to " + (theme === "dark" ? "light" : "dark") + " theme");
    }
    for (var i = 0; i < listeners.length; i++) {
      try { listeners[i](theme); } catch (e) { /* a listener must not break the toggle */ }
    }
  }

  function current() {
    return root.getAttribute("data-theme") === "dark" ? "dark" : "light";
  }

  function set(theme) {
    theme = theme === "dark" ? "dark" : "light";
    try { localStorage.setItem(KEY, theme); } catch (e) { /* private mode */ }
    apply(theme);
  }

  function toggle() { set(current() === "dark" ? "light" : "dark"); }

  /* initial theme : ?theme= override (headless screenshots), then the stored
     preference, then the light default */
  var forced = null;
  try {
    var m = (window.location.search + window.location.hash).match(/[?&#]theme=(light|dark)/);
    if (m) forced = m[1];
  } catch (e) { /* ignore */ }
  var stored = null;
  try { stored = localStorage.getItem(KEY); } catch (e) { /* private mode */ }
  apply(forced || (stored === "dark" ? "dark" : "light"));

  document.addEventListener("DOMContentLoaded", function () { apply(current()); });

  /* wire the toggle button (script sits in <head> order but the button may not
     exist yet, so bind on the document) */
  document.addEventListener("click", function (e) {
    var t = e.target;
    if (t && t.id === "theme-toggle") toggle();
  });

  /* 't' shortcut, ignored while typing in a field */
  window.addEventListener("keydown", function (e) {
    var t = e.target;
    if (t && t.tagName && /^(input|textarea|select)$/i.test(t.tagName)) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (e.key === "t" || e.key === "T") { e.preventDefault(); toggle(); }
  });

  window.Theme = {
    toggle: toggle,
    set: set,
    current: current,
    onChange: function (fn) { if (typeof fn === "function") listeners.push(fn); }
  };
})();
