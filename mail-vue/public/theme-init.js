// Blocking head script: apply the saved theme before the first paint.
(() => {
  let uiStoreStr;
  try { uiStoreStr = localStorage.getItem('ui'); } catch (_) {}
  const root = document.documentElement;
  const metaTag = document.getElementById('theme-color-meta');
  const isMobile = !window.matchMedia("(pointer: fine) and (hover: hover)").matches;
  let isDark = true;
  if (uiStoreStr) {
    try {
      const uiStore = JSON.parse(uiStoreStr);
      if (uiStore.themeMode === 'light') {
        isDark = false;
      } else if (uiStore.themeMode === 'dark') {
        isDark = true;
      } else if (uiStore.themeMode === 'auto' || uiStore.themeMode === 'system') {
        isDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
      } else {
        isDark = uiStore.dark !== false;
      }
    } catch (e) {}
  }
  root.setAttribute('class', isDark ? 'dark' : '');
  metaTag.setAttribute('content', isDark ? (isMobile ? '#141414' : '#000000') : (isMobile ? '#FFFFFF' : '#F1F1F1'));
})();
