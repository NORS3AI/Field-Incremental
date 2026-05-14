// Tiny localStorage wrapper with namespacing + safe JSON.
(function () {
  const NS = "field-incremental/v1";

  function load(key, fallback) {
    try {
      const raw = localStorage.getItem(`${NS}/${key}`);
      if (raw == null) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(`${NS}/${key}`, JSON.stringify(value));
    } catch (e) {
      // quota or disabled — ignore silently
    }
  }

  window.Storage2 = { load, save };
})();
