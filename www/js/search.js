// js/search.js
// Búsqueda progresiva + búsqueda server-side garantizada + cancel on tab leave
// - mantiene mostrar rápido (umbral = 12, 2 páginas de 6 items)
// - tras la búsqueda local siempre hace una llamada al servidor para encontrar más coincidencias
// - filtra por seenKeys para evitar duplicados
// - si el usuario sale de la pestaña "Buscar" cancela todo y reanuda prefetch en "Todas"

(function(HL){
  HL.search = HL.search || {};

  // tokens y estado
  HL.search._searchToken = 0;
  HL.search._active = HL.search._active || {};

  const DEFAULT_PAGE_SIZE = 6;
  const PAGE_SIZE = (HL.config && HL.config.PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const INITIAL_MATCH_THRESHOLD = PAGE_SIZE * 2; // 12
  const POLL_INTERVAL_MS = 500;
  const POST_TIMEOUT_POLL_MS = 2000;
  const SEARCH_TIMEOUT_MS = 60000; // 60s
  const SERVER_FETCH_PER_PAGE = 100; // pedir un lote grande al servidor (ajustable)
  const SERVER_FETCH_TIMEOUT_MS = 20000; // 20s para la petición al servidor

  // utilidades
  function normalizeQuery(s) {
    return s ? String(s).trim().toLowerCase() : '';
  }

  function makeItemKey(item) {
    try {
      const id = (item && (item.id || item.ID || item.Id)) || '';
      const sci = (item && (item.scientific_name || item.scientific || '')) || '';
      const common = (item && (item.common_name || item.common || '')) || '';
      const img = (item && (item.image_url || (item.images && item.images[0]) || '')) || '';
      return `${id}||${sci}||${common}||${img}`.toLowerCase().trim();
    } catch (e) {
      try { return JSON.stringify(item || {}).slice(0,200); } catch (ee) { return String(item); }
    }
  }

  function itemMatchesQuery(p, q) {
    if (!p || !q) return false;
    const common = (p.common_name || p.common || '').toString().toLowerCase();
    const scientific = (p.scientific_name || p.scientific || '').toString().toLowerCase();
    const trefleTitle = (p.trefle && (p.trefle.common_name || p.trefle.scientific_name) || '').toString().toLowerCase();
    const perenTitle = (p.perenual && (p.perenual.common_name || p.perenual.scientific_name || p.perenual.title) || '').toString().toLowerCase();
    const family = (p.family || '').toString().toLowerCase();
    const species = (p.species || '').toString().toLowerCase();
    return (
      (common && common.includes(q)) ||
      (scientific && scientific.includes(q)) ||
      (trefleTitle && trefleTitle.includes(q)) ||
      (perenTitle && perenTitle.includes(q)) ||
      (family && family.includes(q)) ||
      (species && species.includes(q))
    );
  }

  function cancelPreviousSearch(token) {
    const act = HL.search._active[token];
    if (!act) return;
    try {
      console.info(`[search] cancelPreviousSearch token=${token} -> clearing timers / aborting fetches`);
      if (act.pollInterval) clearInterval(act.pollInterval);
      if (act.postPollInterval) clearInterval(act.postPollInterval);
      if (act.timeoutTimer) clearTimeout(act.timeoutTimer);
      if (act.serverFetchController && typeof act.serverFetchController.abort === 'function') {
        try { act.serverFetchController.abort(); } catch (e) {}
      }
    } catch (e) {
      console.warn('[search] cancelPreviousSearch error', e);
    }
    delete HL.search._active[token];
  }

  // Reanuda prefetch de la pestaña "Todas" (cuando salimos de Buscar)
  function resumeAllPrefetch() {
    try {
      if (HL.prefetch && typeof HL.prefetch.start === 'function') {
        console.debug('[search] resumeAllPrefetch -> HL.prefetch.start()');
        HL.prefetch.start();
        return;
      }
    } catch (e) { /* ignore */ }
    try {
      if (HL.loader && typeof HL.loader.startBackgroundLoad === 'function') {
        console.debug('[search] resumeAllPrefetch -> HL.loader.startBackgroundLoad() fallback');
        HL.loader.startBackgroundLoad();
      }
    } catch (e) { /* ignore */ }
  }

  // Detectar cambios de pestaña (tabs en index.html son anchors #intro #buscar #todas)
  function setupTabLeaveHandler() {
    try {
      const tabAnchors = document.querySelectorAll('.tabs a');
      if (!tabAnchors || !tabAnchors.length) return;
      tabAnchors.forEach(a => {
        a.addEventListener('click', (ev) => {
          setTimeout(() => {  // pequeño delay para que Materialize actualice active class
            const active = document.querySelector('.tabs a.active');
            const href = active ? active.getAttribute('href') : null;
            if (href !== '#buscar') {
              // cancelar búsqueda activa(s)
              console.info('[search.tab] leaving buscar tab -> cancelling active searches');
              // cancel all active tokens
              Object.keys(HL.search._active).forEach(t => cancelPreviousSearch(Number(t)));
              // reanudar prefetch de "Todas"
              resumeAllPrefetch();
            } else {
              // entering buscar tab -> optionally stop global prefetch (best-effort)
              try {
                if (HL.prefetch && typeof HL.prefetch.stop === 'function') {
                  console.debug('[search.tab] entering buscar tab -> HL.prefetch.stop() (best-effort)');
                  HL.prefetch.stop();
                }
              } catch (e) { /* ignore */ }
            }
          }, 50);
        }, { passive:true });
      });
    } catch (e) {
      console.debug('[search.tab] setupTabLeaveHandler error', e);
    }
  }

  // server-side search: primero intenta /api/plants?q=..., si falla fallback a HL.api.fetchAllPlants()
  async function launchServerSideSearch(myToken, q, seenKeys, matches) {
    if (!q) return;
    console.info(`[search.server] start token=${myToken} query="${q}"`);

    // prepare abort controller
    let controller = null;
    try { controller = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { controller = null; }
    if (!HL.search._active[myToken]) HL.search._active[myToken] = {};
    HL.search._active[myToken].serverFetchController = controller;

    // helper to process list results (dedupe + push new)
    function processList(list, sourceLabel) {
      if (!Array.isArray(list)) return 0;
      let newAdded = 0;
      for (const it of list) {
        const key = makeItemKey(it);
        if (seenKeys.has(key)) continue;
        // double-check it matches query (safe guard)
        if (!itemMatchesQuery(it, q)) continue;
        seenKeys.add(key);
        matches.push(it);
        newAdded++;
      }
      console.info(`[search.server] ${sourceLabel} returned ${list.length} items, new added=${newAdded}, total matches=${matches.length}`);
      if (newAdded > 0) {
        // if initial not rendered, or to update incremental view
        HL.state.searchResults = matches.slice();
        // if we haven't set page to 1 then set
        HL.state.currentPageSearch = HL.state.currentPageSearch || 1;
        HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
      }
      return newAdded;
    }

    // attempt A: server-side search endpoint
    let didSomething = false;
    try {
      const url = `/api/plants?q=${encodeURIComponent(q)}&perPage=${SERVER_FETCH_PER_PAGE}`;
      const opts = controller ? { signal: controller.signal } : {};
      const timeoutId = setTimeout(() => {
        try { if (controller && typeof controller.abort === 'function') controller.abort(); } catch (e) {}
      }, SERVER_FETCH_TIMEOUT_MS);

      console.info(`[search.server] sending request to ${url}`);
      const resp = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (!resp || !resp.ok) {
        console.warn(`[search.server] server search non-ok ${resp ? resp.status : 'no response'}`);
      } else {
        const json = await resp.json();
        if (Array.isArray(json)) {
          processList(json, 'serverSearch(/api/plants)');
          didSomething = true;
        } else if (json && Array.isArray(json.rows)) {
          processList(json.rows, 'serverSearch(rows)');
          didSomething = true;
        } else if (json && Array.isArray(json.data)) {
          processList(json.data, 'serverSearch(data)');
          didSomething = true;
        } else if (Array.isArray(json)) {
          processList(json, 'serverSearch(array)');
          didSomething = true;
        } else {
          console.debug('[search.server] serverSearch returned unexpected shape, will fallback if needed');
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') console.warn('[search.server] server fetch aborted (timeout or cancel)');
      else console.warn('[search.server] server fetch error', e);
    }

    // If server attempt didn't add anything, fallback to HL.api.fetchAllPlants()
    if (!didSomething) {
      try {
        if (HL.api && typeof HL.api.fetchAllPlants === 'function') {
          console.info('[search.server] falling back to HL.api.fetchAllPlants()');
          const fallbackList = await HL.api.fetchAllPlants();
          if (Array.isArray(fallbackList) && fallbackList.length) {
            processList(fallbackList, 'HL.api.fetchAllPlants fallback');
          } else {
            console.debug('[search.server] fallback returned no items');
          }
        } else {
          console.debug('[search.server] no HL.api.fetchAllPlants available to fallback to');
        }
      } catch (e) {
        console.warn('[search.server] fallback fetchAllPlants error', e);
      }
    }

    // cleanup controller ref
    try { if (HL.search._active[myToken]) delete HL.search._active[myToken].serverFetchController; } catch (e) {}
    console.info(`[search.server] finished token=${myToken}`);
  }

  // main search entrypoint
  HL.search.searchPlant = async function searchPlant() {
    const rawEl = document.getElementById('search-input');
    const rawQuery = rawEl ? rawEl.value : '';
    const q = normalizeQuery(rawQuery);

    HL.search._searchToken = (HL.search._searchToken || 0) + 1;
    const myToken = HL.search._searchToken;
    console.info(`[search] start token=${myToken} query="${rawQuery}" normalized="${q}"`);

    // cancel previous token
    Object.keys(HL.search._active).forEach(t => {
      const tn = Number(t);
      if (tn !== myToken) cancelPreviousSearch(tn);
    });

    HL.search._active[myToken] = { pollInterval: null, postPollInterval: null, timeoutTimer: null, serverFetchController: null, renderedInitial: false };

    if (!q) {
      console.info('[search] empty query -> clearing results');
      HL.state.searchResults = [];
      HL.state.currentPageSearch = 1;
      HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
      return;
    }

    // show loading
    HL.loader.showLoadingForContainer('search-results-container', `Buscando "${HL.utils.escapeHtml(rawQuery)}"...`);
    HL.state.searchResults = [];
    HL.state.currentPageSearch = 1;

    // try to stop global prefetch (best-effort)
    try {
      if (HL.prefetch && typeof HL.prefetch.stop === 'function') {
        HL.prefetch.stop();
        console.debug('[search] HL.prefetch.stop() called (best-effort)');
      }
    } catch (e) { /* ignore */ }

    // try to start background load if not started (best-effort)
    try {
      if (!HL.state.plantsPromise && HL.loader && typeof HL.loader.startBackgroundLoad === 'function') {
        const p = HL.loader.startBackgroundLoad();
        if (p && typeof p.then === 'function') p.catch(err => console.warn('[search] startBackgroundLoad rejected', err));
      }
    } catch (e) { /* ignore */ }

    const seenKeys = new Set();
    const matches = [];
    let renderedInitial = false;
    let lastKnownPlantsLen = (HL.state && Array.isArray(HL.state.plants)) ? HL.state.plants.length : 0;

    function scanMemoryAndMaybeRender() {
      let newFound = false;

      // scan HL.state.plants
      try {
        if (HL.state && Array.isArray(HL.state.plants)) {
          for (const it of HL.state.plants) {
            const key = makeItemKey(it);
            if (seenKeys.has(key)) continue;
            if (itemMatchesQuery(it, q)) {
              seenKeys.add(key);
              matches.push(it);
              newFound = true;
            }
          }
        }
      } catch (e) {
        console.warn('[search] error scanning HL.state.plants', e);
      }

      // scan HL.state.pages if present
      try {
        if (HL.state && HL.state.pages && typeof HL.state.pages === 'object') {
          for (const pn of Object.keys(HL.state.pages)) {
            const pageArr = HL.state.pages[pn];
            if (!Array.isArray(pageArr)) continue;
            for (const it of pageArr) {
              const key = makeItemKey(it);
              if (seenKeys.has(key)) continue;
              if (itemMatchesQuery(it, q)) {
                seenKeys.add(key);
                matches.push(it);
                newFound = true;
              }
            }
          }
        }
      } catch (e) {
        console.debug('[search] pages scan error', e);
      }

      if (HL.state && Array.isArray(HL.state.plants)) lastKnownPlantsLen = HL.state.plants.length;

      console.debug(`[search] scanMemory -> matches now=${matches.length} (newFound=${newFound})`);

      if (!renderedInitial && matches.length >= INITIAL_MATCH_THRESHOLD) {
        console.info(`[search] initial threshold reached (${matches.length} >= ${INITIAL_MATCH_THRESHOLD}) -> rendering initial results`);
        HL.state.searchResults = matches.slice();
        HL.state.currentPageSearch = 1;
        HL.render.renderSearchPlantsPage(1);
        renderedInitial = true;
        if (HL.search._active[myToken]) HL.search._active[myToken].renderedInitial = true;

        // After rendering quickly, launch server-side search to get more
        launchServerSideSearch(myToken, q, seenKeys, matches).catch(e => console.warn('[search.server] launch error', e));
      } else if (!renderedInitial && matches.length > 0 && HL.state.plants && HL.state.plants.length === lastKnownPlantsLen) {
        // fast-path partial render
        console.info(`[search] fast-path render partial (${matches.length} matches)`);
        HL.state.searchResults = matches.slice();
        HL.state.currentPageSearch = 1;
        HL.render.renderSearchPlantsPage(1);
        renderedInitial = true;
        if (HL.search._active[myToken]) HL.search._active[myToken].renderedInitial = true;

        // Also launch server-side search
        launchServerSideSearch(myToken, q, seenKeys, matches).catch(e => console.warn('[search.server] launch error', e));
      } else if (renderedInitial && matches.length > (HL.state.searchResults && HL.state.searchResults.length ? HL.state.searchResults.length : 0)) {
        // incremental update
        console.info(`[search] incremental update -> matches increased to ${matches.length}, updating render`);
        HL.state.searchResults = matches.slice();
        HL.render.renderSearchPlantsPage(HL.state.currentPageSearch || 1);
      }

      return newFound;
    }

    // initial synchronous scan
    try {
      console.debug('[search] performing initial synchronous scanMemorySourcesAndUpdate()');
      scanMemoryAndMaybeRender();
    } catch (e) {
      console.warn('[search] initial scan failed', e);
    }

    // if nothing sufficient found, still launch server-side search (guaranteed)
    if (!HL.search._active[myToken]) HL.search._active[myToken] = {};
    // always launch server side search after initial local scan (guaranteed per your request)
    launchServerSideSearch(myToken, q, seenKeys, matches).catch(e => console.warn('[search.server] guaranteed launch error', e));

    // attach to plantsPromise if present to rescan when loaded
    if (HL.state && HL.state.plantsPromise && typeof HL.state.plantsPromise.then === 'function') {
      try {
        const onReady = () => {
          if (HL.search._searchToken !== myToken) return;
          console.debug('[search] plantsPromise resolved -> rescanning memory');
          scanMemoryAndMaybeRender();
        };
        HL.state.plantsPromise.then(onReady).catch(e => console.warn('[search] plantsPromise then failed', e));
        HL.search._active[myToken].onPlantsPromise = onReady;
      } catch (e) { console.debug('[search] attach to plantsPromise failed', e); }
    }

    // polling for new local data (fast)
    HL.search._active[myToken].pollInterval = setInterval(() => {
      if (HL.search._searchToken !== myToken) {
        console.info(`[search] token changed - stopping pollInterval for token=${myToken}`);
        cancelPreviousSearch(myToken);
        return;
      }
      try {
        const newFound = scanMemoryAndMaybeRender();
        if (Date.now() - (HL.search._active[myToken].startTs || Date.now()) >= SEARCH_TIMEOUT_MS) {
          // switch to post poll
        }
      } catch (e) {
        console.warn('[search] poll error', e);
      }
    }, POLL_INTERVAL_MS);

    // finalizer (force render after timeout if not rendered)
    HL.search._active[myToken].timeoutTimer = setTimeout(() => {
      try {
        if (HL.search._searchToken !== myToken) { cancelPreviousSearch(myToken); return; }
        if (!renderedInitial) {
          console.warn('[search] finalizer: forcing render as no initial render happened within timeout');
          HL.state.searchResults = matches.slice();
          HL.state.currentPageSearch = 1;
          HL.render.renderSearchPlantsPage(1);
          renderedInitial = true;
          if (HL.search._active[myToken]) HL.search._active[myToken].renderedInitial = true;
        } else {
          console.debug('[search] finalizer: initial render already done');
        }

        // switch to post poll
        if (HL.search._active[myToken]) {
          clearInterval(HL.search._active[myToken].pollInterval);
          HL.search._active[myToken].pollInterval = null;
          HL.search._active[myToken].postPollInterval = setInterval(() => {
            if (HL.search._searchToken !== myToken) { cancelPreviousSearch(myToken); return; }
            try { scanMemoryAndMaybeRender(); } catch (e) { console.debug('[search] post-poll error', e); }
          }, POST_TIMEOUT_POLL_MS);
        }
      } catch (e) {
        console.warn('[search] finalizer error', e);
      }
    }, SEARCH_TIMEOUT_MS);

    // done - polls and server search will update UI incrementally
  }; // end searchPlant

  // keep old synchronous helper (compat fallback)
  HL.search.performSearchAndRender = function performSearchAndRender(normalizedQuery, rawQuery) {
    const q = (normalizedQuery || '').toString().toLowerCase();
    if (!q) {
      HL.state.searchResults = [];
      HL.render.renderSearchPlantsPage(1);
      return;
    }

    const results = (HL.state && Array.isArray(HL.state.plants) ? HL.state.plants : []).filter(p => {
      const common = (p.common_name || p.common || '').toString().toLowerCase();
      const scientific = (p.scientific_name || p.scientific || '').toString().toLowerCase();
      const trefleTitle = (p.trefle && (p.trefle.common_name || p.trefle.scientific_name) || '').toString().toLowerCase();
      const perenTitle = (p.perenual && (p.perenual.common_name || p.perenual.scientific_name || p.perenual.title) || '').toString().toLowerCase();
      const family = (p.family || '').toString().toLowerCase();
      const species = (p.species || '').toString().toLowerCase();
      return (
        (common && common.includes(q)) ||
        (scientific && scientific.includes(q)) ||
        (trefleTitle && trefleTitle.includes(q)) ||
        (perenTitle && perenTitle.includes(q)) ||
        (family && family.includes(q)) ||
        (species && species.includes(q))
      );
    });

    if (!results || results.length === 0) {
      const container = document.getElementById('search-results-container');
      if (container) container.innerHTML = `<p class="grey-text center-align" style="padding:20px">No se encontraron resultados para "${HL.utils.escapeHtml(rawQuery || '')}"</p>`;
      HL.state.searchResults = [];
      HL.state.currentPageSearch = 1;
      const pag = document.getElementById('pagination-search');
      if (pag) pag.style.display = 'none';
      return;
    }

    HL.state.searchResults = results;
    HL.state.currentPageSearch = 1;
    HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
  };

  // setup tab handler now (immediate attempt)
  try { setupTabLeaveHandler(); } catch (e) { console.debug('[search] setupTabLeaveHandler failed', e); }

  // expose cancel for external use (if needed)
  HL.search.cancelActiveSearches = function() {
    Object.keys(HL.search._active).forEach(t => cancelPreviousSearch(Number(t)));
  };

})(window.HerboLive);
