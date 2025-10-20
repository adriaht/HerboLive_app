/* Nuevo archivo: cache.js
 - Implementa HL.cache con API simple: init(), getPage(page), setPage(page, items), hasPage(page), clearAround(center, keep)
 - Persistencia via localForage (IndexedDB). Además mantiene cache en memoria en HL.state.pages.
 - No toca la lógica de render; solo provee persistencia y helpers.
*/

(function(HL){
  HL.cache = HL.cache || {};

  // defaults
  const CFG = {
    prefix: 'herbolive_page_',
    maxCachedPages: (HL.config && HL.config.MAX_PREFETCH_PAGES_WINDOW) || 20
  };

  HL.cache._inited = false;

  HL.cache.init = async function() {
    if (HL.cache._inited) return;
    // ensure localforage available
    if (typeof localforage === 'undefined') {
      console.warn('localForage no disponible; cache persistente no será usada');
      HL.cache._inited = true;
      return;
    }
    try {
      localforage.config({ name: 'HerboLiveCache' });
      HL.cache._inited = true;
    } catch (e) {
      console.warn('HL.cache.init error', e);
      HL.cache._inited = true;
    }
  };

  HL.cache._inMemorySet = function(page, items) {
    HL.state.pages = HL.state.pages || {};
    HL.state.pages[page] = items;
    HL.state.loadedPages.add(page);
  };

  HL.cache.setPage = async function(page, items) {
    if (!page || !Array.isArray(items)) return;
    HL.cache._inMemorySet(page, items);
    if (typeof localforage !== 'undefined') {
      try {
        await localforage.setItem(CFG.prefix + page, { ts: Date.now(), items: items });
      } catch (e) {
        if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('localforage.setItem failed', e);
      }
    }
    return true;
  };

  HL.cache.getPage = async function(page) {
    if (!page) return null;
    // in-memory first
    if (HL.state.pages && HL.state.pages[page]) return HL.state.pages[page];
    // try persisted
    if (typeof localforage !== 'undefined') {
      try {
        const v = await localforage.getItem(CFG.prefix + page);
        if (v && Array.isArray(v.items)) {
          // populate in-memory
          HL.cache._inMemorySet(page, v.items);
          return v.items;
        }
      } catch (e) {
        if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('localforage.getItem failed', e);
      }
    }
    return null;
  };

  HL.cache.hasPage = function(page) {
    if (!page) return false;
    if (HL.state.pages && HL.state.pages[page]) return true;
    return false;
  };

  HL.cache.clearAround = async function(centerPage, keep = 10) {
    // keep at most `keep` pages around centerPage; remove older from memory and persist if needed
    const keys = Array.from(HL.state.loadedPages || new Set()).map(Number).sort((a,b)=>a-b);
    if (keys.length <= keep) return;
    const half = Math.floor(keep/2);
    const min = Math.max(1, centerPage - half);
    const max = min + keep - 1;
    const toRemove = keys.filter(k => k < min || k > max);
    for (const p of toRemove) {
      // remove memory
      if (HL.state.pages && HL.state.pages[p]) delete HL.state.pages[p];
      if (HL.state.loadedPages && HL.state.loadedPages.has(p)) HL.state.loadedPages.delete(p);
      // optionally remove from localforage if you want to free space (we won't auto-delete to be safe)
      // await localforage.removeItem(CFG.prefix + p);
    }
  };

  // init eagerly
  HL.cache.init();

})(window.HerboLive);
