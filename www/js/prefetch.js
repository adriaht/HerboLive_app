/* Nuevo archivo: prefetch.js
 - Implementa HL.prefetch: cola de páginas por descargar, control de concurrencia,
   uso de requestIdleCallback fallback, pausa basada en visibilidad o pestaña búsqueda.
 - Expone:
     - HL.prefetch.start(initialPage)
     - HL.prefetch.scheduleAround(page)
     - HL.prefetch.fetchPageImmediate(page, { enrich: true/false })
     - HL.prefetch.enrichPage(page)  (enriquecer items de una página)
*/

(function(HL){
  HL.prefetch = HL.prefetch || {};

  const cfg = HL.config || {};
  const PAGE_SIZE = cfg.PAGE_SIZE || 6;
  const INITIAL_PAGES = cfg.INITIAL_PAGES || 5;
  const PREFETCH_CONCURRENCY = cfg.PREFETCH_CONCURRENCY || 2;
  const ENRICH_CONCURRENCY = cfg.ENRICH_CONCURRENCY || 3;
  const AHEAD = cfg.PREFETCH_PAGES_AHEAD || 5;
  const BEHIND = cfg.PREFETCH_PAGES_BEHIND || 5;
  const MAX_WINDOW = cfg.MAX_PREFETCH_PAGES_WINDOW || 10;

  let pageQueue = []; // simple queue of pages to fetch
  let active = 0;
  let stopped = false;

  function isSearchTabActive() {
    try {
      if (cfg.PAUSE_PREFETCH_ON_SEARCH) {
        const buscar = document.getElementById('buscar');
        if (buscar && buscar.classList.contains('active')) return true;
      }
    } catch (e) {}
    return false;
  }

  function shouldPausePrefetch() {
    if (typeof document !== 'undefined') {
      if (document.visibilityState && document.visibilityState !== 'visible') return true;
    }
    if (isSearchTabActive()) return true;
    return false;
  }

  async function worker() {
    if (stopped) return;
    if (shouldPausePrefetch()) {
      // poll later
      setTimeout(worker, 1000);
      return;
    }
    if (active >= PREFETCH_CONCURRENCY) return;
    const page = pageQueue.shift();
    if (!page) return;
    if (HL.state.prefetchingPages.has(page)) {
      // already in progress
      setTimeout(worker, 0);
      return;
    }

    active++;
    HL.state.prefetchingPages.add(page);
    try {
      await HL.prefetch.fetchPageImmediate(page, { enrich: true, background: true });
    } catch (e) {
      // ignore but log
      if (HL.config.DEBUG_SHOW_RAW) console.warn('prefetch.fetchPageImmediate failed for page', page, e);
    } finally {
      HL.state.prefetchingPages.delete(page);
      active--;
      // schedule next
      setTimeout(worker, 0);
    }
  }

  // push page into queue if not loaded nor queued already
  HL.prefetch.enqueuePage = function(page) {
    page = Number(page);
    if (!page || page < 1) return;
    if (HL.state.loadedPages && HL.state.loadedPages.has(page)) return;
    if (pageQueue.includes(page)) return;
    pageQueue.push(page);
    // sort queue ascending by distance to current page for efficiency
    try {
      const cp = HL.state.currentPageAll || 1;
      pageQueue.sort((a,b)=> Math.abs(a-cp) - Math.abs(b-cp));
    } catch (e) {}
    setTimeout(worker, 0);
  };

  HL.prefetch.start = function(initialPage = 1) {
    stopped = false;
    // schedule around initialPage
    HL.prefetch.scheduleAround(initialPage);
  };

  HL.prefetch.stop = function() {
    stopped = true;
  };

  // schedule pages to keep window [page-BEHIND, page+ AHEAD]
  HL.prefetch.scheduleAround = function(page) {
    page = Number(page) || 1;
    const start = Math.max(1, page - BEHIND);
    const end = page + AHEAD;
    // enqueue pages in smart order: closest first
    const pages = [];
    for (let p = start; p <= end; p++) pages.push(p);
    // ensure minimum initial window of INITIAL_PAGES (first load)
    for (let p = 1; p <= Math.max(INITIAL_PAGES, page+0); p++) {
      if (!pages.includes(p)) pages.push(p);
    }
    // unique
    const uniq = Array.from(new Set(pages)).sort((a,b)=>a-b);
    // enqueue
    for (const p of uniq) HL.prefetch.enqueuePage(p);
    // also ask cache cleanup
    HL.cache.clearAround(page, Math.min(MAX_WINDOW, Math.max(INITIAL_PAGES, AHEAD + BEHIND + 1)));
  };

  // fetch a page, optionally enrich items
  HL.prefetch.fetchPageImmediate = async function(page, options = {}) {
    page = Number(page) || 1;
    const perPage = (HL.config && HL.config.PAGE_SIZE) || PAGE_SIZE;
    const enrich = options.enrich === undefined ? true : !!options.enrich;

    // if already loaded return
    const existing = await HL.cache.getPage(page);
    if (existing && existing.length) return existing;

    try {
      const items = await HL.api.fetchPlantsPage(page, perPage);
      // normalize: ensure array
      const arr = Array.isArray(items) ? items : [];
      // store raw page immediately (so navigation can show something)
      await HL.cache.setPage(page, arr);

      if (enrich) {
        // enqueue enrichment for page (enrichPage handles concurrency)
        await HL.prefetch.enrichPage(page);
      }

      return arr;
    } catch (e) {
      if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('fetchPageImmediate error', e);
      throw e;
    }
  };

  // enrich items of a page using available HL.api enrichment functions
  HL.prefetch.enrichPage = async function(page) {
    page = Number(page) || 1;
    if (HL.state.enrichingPages.has(page)) return;
    HL.state.enrichingPages.add(page);

    try {
      const items = await HL.cache.getPage(page);
      if (!Array.isArray(items)) return;

      // run enrichment with limited concurrency
      const concurrency = ENRICH_CONCURRENCY || 3;
      let idx = 0;
      const results = new Array(items.length);

      const workerEnrich = async () => {
        while (idx < items.length) {
          const i = idx++;
          const it = items[i];
          try {
            const enriched = await HL.prefetch._enrichOneItem(it);
            results[i] = enriched || it;
          } catch (e) {
            results[i] = it;
            if (HL.config.DEBUG_SHOW_RAW) console.warn('enrich item failed', e);
          }
        }
      };

      const workers = new Array(Math.min(concurrency, items.length)).fill(0).map(()=>workerEnrich());
      await Promise.all(workers);

      // merge: replace page with enriched items (non-destructive: only set fields missing)
      const merged = results.map((r, idx) => {
        try {
          const orig = items[idx] || {};
          // merge non-destructively
          const out = Object.assign({}, orig);
          if (r && typeof r === 'object') {
            for (const k of Object.keys(r)) {
              const curv = out[k];
              const newv = r[k];
              const isEmpty = curv === undefined || curv === null || curv === '' || (Array.isArray(curv) && curv.length===0);
              if (isEmpty && (newv !== undefined && newv !== null && newv !== '')) out[k] = newv;
            }
          }
          return out;
        } catch (e) {
          return items[idx];
        }
      });

      await HL.cache.setPage(page, merged);
      return merged;
    } finally {
      HL.state.enrichingPages.delete(page);
    }
  };

  // helper to enrich single item by trying available HL.api helpers (client-side best-effort)
  HL.prefetch._enrichOneItem = async function(item) {
    if (!item || typeof item !== 'object') return item;
    // if item already has description and images, skip
    const needDesc = !item.description || String(item.description).trim() === '';
    const needImg = !item.image_url && !item.image && !(item.images && item.images.length);
    if (!needDesc && !needImg) return item;

    // 1) try HL.api.fetchByScientificName (if exists)
    try {
      if (typeof HL.api.fetchByScientificName === 'function') {
        const name = item.scientific_name || `${item.genus || ''} ${item.species || ''}`.trim();
        if (name) {
          const x = await HL.api.fetchByScientificName(name);
          if (x && typeof x === 'object') return x;
        }
      }
    } catch (e) { if (HL.config.DEBUG_SHOW_RAW) console.warn('enrich: fetchByScientificName error', e); }

    // 2) try HL.api.fetchFromPerenual / fetchFromTrefle / fetchFromWikipedia if available
    try {
      const name2 = item.scientific_name || item.common_name || `${item.genus || ''} ${item.species || ''}`.trim();
      if (name2) {
        if (typeof HL.api.fetchFromPerenual === 'function') {
          const p = await HL.api.fetchFromPerenual(name2);
          if (p) return p;
        }
        if (typeof HL.api.fetchFromTrefle === 'function') {
          const t = await HL.api.fetchFromTrefle(name2);
          if (t) return t;
        }
        if (typeof HL.api.fetchFromWikipedia === 'function') {
          const w = await HL.api.fetchFromWikipedia(name2);
          if (w) return w;
        }
      }
    } catch (e) { if (HL.config.DEBUG_SHOW_RAW) console.warn('enrich: external helpers error', e); }

    // 3) fallback: try backend detail endpoint if id exists
    try {
      if (item.id) {
        const base = (typeof HL.config.API_BASE !== 'undefined') ? HL.config.API_BASE : '';
        const url = (HL.config && HL.config.BACKEND_URL ? HL.config.BACKEND_URL.replace(/\/+$/,'') : '') + (base || '/api') + `/plants/${encodeURIComponent(item.id)}`;
        const resp = await fetch(url);
        if (resp && resp.ok) {
          const j = await resp.json();
          if (j && typeof j === 'object') return j;
        }
      }
    } catch (e) { if (HL.config.DEBUG_SHOW_RAW) console.warn('enrich: backend detail error', e); }

    // nothing found; return original
    return item;
  };

  // pause/resume hooks
  document.addEventListener('visibilitychange', () => {
    // nothing immediate; worker polls should respect visibility
  });

  return HL.prefetch;
})(window.HerboLive);
