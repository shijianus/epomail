window.__EPO_LOADING_START__ = Date.now();
// Failsafe auto-dismiss: ensure loading screen is ALWAYS dismissed after at most 1500ms
setTimeout(function() {
  var el = document.getElementById('loading-first');
  if (el && !el.classList.contains('loading-hide')) {
    el.classList.add('loading-hide');
    setTimeout(function() { if (el && el.parentNode) el.parentNode.removeChild(el); }, 400);
  }
}, 1500);
