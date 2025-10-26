// js/search.js
// Búsqueda progresiva + búsqueda server-side garantizada + cancel on tab leave
// Ajustado: GLOBAL_MEMORY_SHOWN_COUNT para forzar allowAll cuando no hay items en memoria
// Ajustado: allowAll permite aceptar todos los items devueltos por servidor
// Ajustado: dedupe por scientific_name (si mismo scientific_name y distinto id -> duplicado)
(function(HL){
  HL.search = HL.search || {};

  // ---------- GLOBAL (por fichero) ----------
  let GLOBAL_MEMORY_SHOWN_COUNT = 0;

  // tokens y estado
  HL.search._searchToken = 0;
  HL.search._active = HL.search._active || {};

  const DEFAULT_PAGE_SIZE = 6;
  const PAGE_SIZE = (HL.config && HL.config.PAGE_SIZE) || DEFAULT_PAGE_SIZE;
  const INITIAL_MATCH_THRESHOLD = PAGE_SIZE * 2; // 12
  const POLL_INTERVAL_MS = 500;
  const POST_TIMEOUT_POLL_MS = 2000;
  const SEARCH_TIMEOUT_MS = 150000; // 150s solicitado
  const SERVER_LAUNCH_DELAY_MS = 10000; // 10s antes de lanzar la búsqueda al servidor
  const SERVER_FETCH_PER_PAGE = 100; // lote server-side
  const SERVER_FETCH_TIMEOUT_MS = 20000; // 20s timeout para petición al servidor

  // utilidades
  function normalizeQuery(s) { return s ? String(s).trim().toLowerCase() : ''; }

  function makeItemKey(item) {
    try {
      const id = (item && (item.id || item.ID || item.Id)) || '';
      const sci = (item && (item.scientific_name || item.scientific || '')) || '';
      const common = (item && (item.common_name || item.common || '')) || '';
      const img = (item && (item.image_url || (item.images && item.images[0]) || '')) || '';
      return `${id}||${sci}||${common}||${img}`.toLowerCase().trim();
    } catch (e) { try { return JSON.stringify(item || {}).slice(0,200); } catch (ee) { return String(item); } }
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
      console.info(`[search.cancel] cancelPreviousSearch token=${token} -> clearing timers / aborting fetches`);
      if (act.pollInterval) { clearInterval(act.pollInterval); act.pollInterval = null; console.debug(`[search.cancel] cleared pollInterval token=${token}`); }
      if (act.postPollInterval) { clearInterval(act.postPollInterval); act.postPollInterval = null; console.debug(`[search.cancel] cleared postPollInterval token=${token}`); }
      if (act.serverLaunchTimer) { clearTimeout(act.serverLaunchTimer); act.serverLaunchTimer = null; console.debug(`[search.cancel] cleared serverLaunchTimer token=${token}`); }
      if (act.timeoutTimer) { clearTimeout(act.timeoutTimer); act.timeoutTimer = null; console.debug(`[search.cancel] cleared timeoutTimer token=${token}`); }
      if (act.serverFetchController && typeof act.serverFetchController.abort === 'function') {
        try { act.serverFetchController.abort(); console.debug(`[search.cancel] aborted fetch controller token=${token}`); } catch (e) {}
      }
      act.memoryScanActive = false;
    } catch (e) { console.warn('[search.cancel] cancelPreviousSearch error', e); }
    delete HL.search._active[token];
    console.info(`[search.cancel] token=${token} fully removed from active map`);
  }

  function resumeAllPrefetch() {
    try {
      if (HL.prefetch && typeof HL.prefetch.start === 'function') {
        console.debug('[search] resumeAllPrefetch -> HL.prefetch.start()');
        HL.prefetch.start();
        return;
      }
    } catch (e) {}
    try {
      if (HL.loader && typeof HL.loader.startBackgroundLoad === 'function') {
        console.debug('[search] resumeAllPrefetch -> HL.loader.startBackgroundLoad() fallback');
        HL.loader.startBackgroundLoad();
      }
    } catch (e) {}
  }

  function setupTabLeaveHandler() {
    try {
      const tabAnchors = document.querySelectorAll('.tabs a');
      if (!tabAnchors || !tabAnchors.length) return;
      tabAnchors.forEach(a => {
        a.addEventListener('click', (ev) => {
          setTimeout(() => {
            const active = document.querySelector('.tabs a.active');
            const href = active ? active.getAttribute('href') : null;
            if (href !== '#buscar') {
              console.info('[search.tab] leaving buscar tab -> cancelling active searches');
              Object.keys(HL.search._active).forEach(t => cancelPreviousSearch(Number(t)));
              resumeAllPrefetch();
            } else {
              try {
                if (HL.prefetch && typeof HL.prefetch.stop === 'function') {
                  console.debug('[search.tab] entering buscar tab -> HL.prefetch.stop() (best-effort)');
                  HL.prefetch.stop();
                }
              } catch (e) {}
            }
          }, 50);
        }, { passive:true });
      });
    } catch (e) { console.debug('[search.tab] setupTabLeaveHandler error', e); }
  }

  // server-side search
  async function launchServerSideSearch(myToken, q, stateHolder) {
    if (!q) return 0;
    const act = HL.search._active[myToken];
    if (!act) { console.debug('[search.server] launch aborted: no act'); return 0; }
    if (act.serverLaunched) { console.debug('[search.server] server already launched for token=' + myToken); return 0; }
    act.serverLaunched = true;

    // force allowAll if memory showed none
    stateHolder.allowAll = (GLOBAL_MEMORY_SHOWN_COUNT === 0);
    console.info(`[search.server] launching server-side search token=${myToken} q="${q}" GLOBAL_MEMORY_SHOWN_COUNT=${GLOBAL_MEMORY_SHOWN_COUNT} -> allowAll=${stateHolder.allowAll}`);

    // stop local scanning immediately
    try {
      if (act.pollInterval) { clearInterval(act.pollInterval); act.pollInterval = null; console.debug(`[search.server] cleared pollInterval token=${myToken}`); }
      if (act.postPollInterval) { clearInterval(act.postPollInterval); act.postPollInterval = null; console.debug(`[search.server] cleared postPollInterval token=${myToken}`); }
      act.memoryScanActive = false;
      console.info(`[search.server] local memory scanning disabled for token=${myToken}`);
    } catch (e) { console.warn('[search.server] clearing intervals error', e); }

    let controller = null;
    try { controller = (typeof AbortController !== 'undefined') ? new AbortController() : null; } catch (e) { controller = null; }
    act.serverFetchController = controller;

    // ensure scientificSeen map exists (for dedupe by scientific)
    if (!stateHolder.scientificSeen) stateHolder.scientificSeen = new Map();

    function processList(list, sourceLabel) {
      if (!Array.isArray(list)) return 0;
      let newAdded = 0;
      console.info(`[search.server] processing ${list.length} items from ${sourceLabel}`);

      for (const it of list) {
        const key = makeItemKey(it);
        if (stateHolder.seenKeys.has(key)) { /* already exact key */ continue; }

        // If allowAll is false, require itemMatchesQuery; if allowAll true accept everything
        const matchesQuery = stateHolder.allowAll ? true : itemMatchesQuery(it, q);
        if (!matchesQuery) {
          console.debug(`[search.server] skipping item (doesn't match query) key=${key}`);
          continue;
        }

        // dedupe by scientific_name: if same scientific_name already present with different id -> skip (user requested)
        const sci = (it.scientific_name || it.scientific || '').toString().toLowerCase().trim();
        const id = (it.id || it.ID || it.Id || '') || '';
        if (sci) {
          if (stateHolder.scientificSeen.has(sci)) {
            const existingId = stateHolder.scientificSeen.get(sci);
            if (existingId && existingId.toString() !== id.toString()) {
              // Duplicate by scientific name but different id -> skip
              stateHolder.duplicateMatchesCounter++;
              console.debug(`[search.server] skipping duplicate by scientific_name "${sci}" (existing id=${existingId} vs new id=${id})`);
              continue;
            }
            // else same id -> it's fine to add if key different (rare)
          }
        }

        // Additional dedupe against memory's shown scientific names when memoryShownCount > 0
        if (!stateHolder.allowAll && stateHolder.memoryShownCount > 0 && sci && stateHolder.memoryShownScientificNames.has(sci)) {
          stateHolder.duplicateMatchesCounter++;
          console.debug(`[search.server] skipping because scientific_name "${sci}" was shown from memory (duplicate)`);
          continue;
        }

        // accept item
        stateHolder.seenKeys.add(key);
        stateHolder.matches.push(it);
        newAdded++;

        // register scientificSeen
        if (sci && !stateHolder.scientificSeen.has(sci)) stateHolder.scientificSeen.set(sci, id || '');

      } // end for

      // If duplicates reached memoryShownCount, allow previously skipped logic (kept from prior behavior)
      if (!stateHolder.allowAll && stateHolder.memoryShownCount > 0 && stateHolder.duplicateMatchesCounter >= stateHolder.memoryShownCount) {
        console.info(`[search.server] duplicateMatchesCounter (${stateHolder.duplicateMatchesCounter}) >= memoryShownCount (${stateHolder.memoryShownCount}) -> allowAll=true`);
        stateHolder.allowAll = true;
        // We won't reprocess skipped items list here specifically; server likely returns everything and second pass would add them if not seen.
      }

      if (newAdded > 0) {
        HL.state.searchResults = stateHolder.matches.slice();
        HL.state.currentPageSearch = HL.state.currentPageSearch || 1;
        console.info(`[search.server] rendering search page after adding ${newAdded} items (total=${stateHolder.matches.length})`);
        HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
      }

      console.info(`[search.server] ${sourceLabel} processed: newAdded=${newAdded}, totalMatches=${stateHolder.matches.length}, duplicateMatchesCounter=${stateHolder.duplicateMatchesCounter}, allowAll=${stateHolder.allowAll}`);
      return newAdded;
    }

    // fetch server endpoint
    let totalNewAdded = 0;
    try {
      const url = `/api/plants?q=${encodeURIComponent(q)}&perPage=${SERVER_FETCH_PER_PAGE}`;
      const opts = controller ? { signal: controller.signal } : {};
      const timeoutId = setTimeout(() => {
        try { if (controller && typeof controller.abort === 'function') controller.abort(); } catch (e) {}
      }, SERVER_FETCH_TIMEOUT_MS);

      console.info(`[search.server] fetching ${url}`);
      const resp = await fetch(url, opts);
      clearTimeout(timeoutId);
      if (!resp || !resp.ok) {
        console.warn(`[search.server] server search non-ok ${resp ? resp.status : 'no response'}`);
      } else {
        const json = await resp.json();
        if (Array.isArray(json)) {
          totalNewAdded += processList(json, 'serverSearch(/api/plants)[array]');
        } else if (json && Array.isArray(json.rows)) {
          totalNewAdded += processList(json.rows, 'serverSearch(rows)');
        } else if (json && Array.isArray(json.data)) {
          totalNewAdded += processList(json.data, 'serverSearch(data)');
        } else {
          console.debug('[search.server] serverSearch returned unexpected shape');
        }
      }
    } catch (e) {
      if (e && e.name === 'AbortError') console.warn('[search.server] server fetch aborted (timeout or cancel)');
      else console.warn('[search.server] server fetch error', e);
    }

    // fallback if server returned none
    if (totalNewAdded === 0) {
      try {
        if (HL.api && typeof HL.api.fetchAllPlants === 'function') {
          console.info('[search.server] falling back to HL.api.fetchAllPlants()');
          const fallbackList = await HL.api.fetchAllPlants();
          if (Array.isArray(fallbackList) && fallbackList.length) {
            totalNewAdded += processList(fallbackList, 'HL.api.fetchAllPlants fallback');
          } else {
            console.debug('[search.server] fallback returned no items');
          }
        } else {
          console.debug('[search.server] no HL.api.fetchAllPlants available');
        }
      } catch (e) { console.warn('[search.server] fallback fetchAllPlants error', e); }
    }

    // cleanup
    try { if (HL.search._active[myToken]) delete HL.search._active[myToken].serverFetchController; } catch (e) {}

    console.info(`[search.server] finished token=${myToken} totalNewAdded=${totalNewAdded} duplicateMatches=${stateHolder.duplicateMatchesCounter} memoryShownCount=${stateHolder.memoryShownCount} allowAll=${stateHolder.allowAll}`);

    if (totalNewAdded > 0) {
      console.info(`[search.server] server added results (${totalNewAdded}) -> stopping active search token=${myToken} and resuming prefetch`);
      cancelPreviousSearch(myToken);
      resumeAllPrefetch();
    } else {
      if (HL.search._active[myToken]) {
        HL.search._active[myToken].memoryScanActive = false;
        if (HL.search._active[myToken].pollInterval) { clearInterval(HL.search._active[myToken].pollInterval); HL.search._active[myToken].pollInterval = null; }
        console.info(`[search.server] no new results added -> memory scanning disabled for token=${myToken}`);
      }
    }

    return totalNewAdded;
  }

  // main entrypoint
  HL.search.searchPlant = async function searchPlant() {
    const rawEl = document.getElementById('search-input');
    const rawQuery = rawEl ? rawEl.value : '';
    const q = normalizeQuery(rawQuery);

    GLOBAL_MEMORY_SHOWN_COUNT = 0;

    HL.search._searchToken = (HL.search._searchToken || 0) + 1;
    const myToken = HL.search._searchToken;
    console.info(`[search] start token=${myToken} query="${rawQuery}" normalized="${q}"`);

    Object.keys(HL.search._active).forEach(t => {
      const tn = Number(t);
      if (tn !== myToken) cancelPreviousSearch(tn);
    });

    HL.search._active[myToken] = {
      pollInterval: null,
      postPollInterval: null,
      timeoutTimer: null,
      serverFetchController: null,
      serverLaunchTimer: null,
      serverLaunched: false,
      memoryScanActive: true,
      renderedInitial: false,
      startTs: Date.now()
    };

    if (!q) {
      console.info('[search] empty query -> clearing results');
      HL.state.searchResults = [];
      HL.state.currentPageSearch = 1;
      HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
      return;
    }

    HL.loader.showLoadingForContainer('search-results-container', `Buscando "${HL.utils.escapeHtml(rawQuery)}"...`);
    HL.state.searchResults = [];
    HL.state.currentPageSearch = 1;

    try { if (HL.prefetch && typeof HL.prefetch.stop === 'function') { HL.prefetch.stop(); console.debug('[search] HL.prefetch.stop() called (best-effort)'); } } catch (e) {}

    try {
      if (!HL.state.plantsPromise && HL.loader && typeof HL.loader.startBackgroundLoad === 'function') {
        const p = HL.loader.startBackgroundLoad();
        if (p && typeof p.then === 'function') p.catch(err => console.warn('[search] startBackgroundLoad rejected', err));
      }
    } catch (e) {}

    const seenKeys = new Set();
    const matches = [];
    let renderedInitial = false;
    let lastKnownPlantsLen = (HL.state && Array.isArray(HL.state.plants)) ? HL.state.plants.length : 0;

    const memoryShownScientificNames = new Set();

    const stateHolder = {
      seenKeys,
      matches,
      allowAll: false,
      duplicateMatchesCounter: 0,
      memoryShownCount: 0,
      memoryShownScientificNames
    };

    function scanMemoryAndMaybeRender() {
      const act = HL.search._active[myToken];
      if (!act) { console.debug(`[search] scanMemory aborted: no act for token=${myToken}`); return false; }
      if (act.memoryScanActive === false) { return false; }

      let newFound = false;

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
      } catch (e) { console.warn('[search] error scanning HL.state.plants', e); }

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
      } catch (e) { console.debug('[search] pages scan error', e); }

      if (HL.state && Array.isArray(HL.state.plants)) lastKnownPlantsLen = HL.state.plants.length;

      console.debug(`[search] scanMemory -> matches now=${matches.length} (newFound=${newFound}) token=${myToken}`);

      if (!renderedInitial && matches.length >= INITIAL_MATCH_THRESHOLD) {
        console.info(`[search] initial threshold reached (${matches.length} >= ${INITIAL_MATCH_THRESHOLD}) -> rendering initial results token=${myToken}`);
        HL.state.searchResults = matches.slice();
        HL.state.currentPageSearch = 1;
        HL.render.renderSearchPlantsPage(1);
        renderedInitial = true;
        if (HL.search._active[myToken]) HL.search._active[myToken].renderedInitial = true;

        GLOBAL_MEMORY_SHOWN_COUNT = HL.state.searchResults.length;
        stateHolder.memoryShownCount = GLOBAL_MEMORY_SHOWN_COUNT;
        memoryShownScientificNames.clear();
        for (const p of HL.state.searchResults) {
          const sci = (p.scientific_name || p.scientific || '').toString().toLowerCase().trim();
          if (sci) memoryShownScientificNames.add(sci);
        }
        stateHolder.memoryShownScientificNames = memoryShownScientificNames;
        stateHolder.allowAll = (GLOBAL_MEMORY_SHOWN_COUNT === 0);
        console.info(`[search] initialMemoryShownCount=${GLOBAL_MEMORY_SHOWN_COUNT} allowAll=${stateHolder.allowAll} token=${myToken}`);

        if (HL.search._active[myToken]) {
          const act = HL.search._active[myToken];
          if (!act.serverLaunchTimer && !act.serverLaunched) {
            act.serverLaunchTimer = setTimeout(() => {
              if (!HL.search._active[myToken]) return;
              console.info(`[search.server] scheduled timer fired -> launching server search token=${myToken} q="${q}" allowAll=${stateHolder.allowAll}`);
              launchServerSideSearch(myToken, q, stateHolder).catch(e => console.warn('[search.server] launch error', e));
            }, SERVER_LAUNCH_DELAY_MS);
            console.debug(`[search.server] scheduled to start in ${SERVER_LAUNCH_DELAY_MS}ms token=${myToken} q="${q}"`);
          }
        }
      } else if (!renderedInitial && matches.length > 0 && HL.state.plants && HL.state.plants.length === lastKnownPlantsLen) {
        console.info(`[search] fast-path render partial (${matches.length} matches) token=${myToken}`);
        HL.state.searchResults = matches.slice();
        HL.state.currentPageSearch = 1;
        HL.render.renderSearchPlantsPage(1);
        renderedInitial = true;
        if (HL.search._active[myToken]) HL.search._active[myToken].renderedInitial = true;

        GLOBAL_MEMORY_SHOWN_COUNT = HL.state.searchResults.length;
        stateHolder.memoryShownCount = GLOBAL_MEMORY_SHOWN_COUNT;
        memoryShownScientificNames.clear();
        for (const p of HL.state.searchResults) {
          const sci = (p.scientific_name || p.scientific || '').toString().toLowerCase().trim();
          if (sci) memoryShownScientificNames.add(sci);
        }
        stateHolder.memoryShownScientificNames = memoryShownScientificNames;
        stateHolder.allowAll = (GLOBAL_MEMORY_SHOWN_COUNT === 0);
        console.info(`[search] fast-path initialMemoryShownCount=${GLOBAL_MEMORY_SHOWN_COUNT} allowAll=${stateHolder.allowAll} token=${myToken}`);

        if (HL.search._active[myToken]) {
          const act = HL.search._active[myToken];
          if (!act.serverLaunchTimer && !act.serverLaunched) {
            act.serverLaunchTimer = setTimeout(() => {
              if (!HL.search._active[myToken]) return;
              console.info(`[search.server] scheduled timer fired -> launching server search token=${myToken} q="${q}" allowAll=${stateHolder.allowAll}`);
              launchServerSideSearch(myToken, q, stateHolder).catch(e => console.warn('[search.server] launch error', e));
            }, SERVER_LAUNCH_DELAY_MS);
            console.debug(`[search.server] scheduled to start in ${SERVER_LAUNCH_DELAY_MS}ms token=${myToken} q="${q}"`);
          }
        }
      } else if (renderedInitial && matches.length > (HL.state.searchResults && HL.state.searchResults.length ? HL.state.searchResults.length : 0)) {
        console.info(`[search] incremental update -> matches increased to ${matches.length}, updating render token=${myToken}`);
        HL.state.searchResults = matches.slice();
        HL.render.renderSearchPlantsPage(HL.state.currentPageSearch || 1);
      }

      return newFound;
    }

    try {
      console.debug('[search] performing initial synchronous scanMemorySourcesAndUpdate()');
      scanMemoryAndMaybeRender();
    } catch (e) { console.warn('[search] initial scan failed', e); }

    // guaranteed server launch scheduling (if not scheduled by memory scan)
    if (HL.search._active[myToken]) {
      const act = HL.search._active[myToken];
      if (!act.serverLaunchTimer && !act.serverLaunched) {
        act.serverLaunchTimer = setTimeout(() => {
          if (!HL.search._active[myToken]) return;
          console.info(`[search.server] guaranteed scheduled timer fired -> launching server search token=${myToken} q="${q}"`);
          launchServerSideSearch(myToken, q, stateHolder).catch(e => console.warn('[search.server] guaranteed launch error', e));
        }, SERVER_LAUNCH_DELAY_MS);
        console.debug(`[search.server] guaranteed scheduled to start in ${SERVER_LAUNCH_DELAY_MS}ms token=${myToken} q="${q}"`);
      }
    }

    if (HL.state && HL.state.plantsPromise && typeof HL.state.plantsPromise.then === 'function') {
      try {
        const onReady = () => {
          if (HL.search._searchToken !== myToken) return;
          const act = HL.search._active[myToken];
          if (!act || act.memoryScanActive === false) {
            console.debug(`[search] onReady (plantsPromise) called but memoryScanActive=false for token=${myToken}, ignoring`);
            return;
          }
          console.debug('[search] plantsPromise resolved -> rescanning memory');
          scanMemoryAndMaybeRender();
        };
        HL.state.plantsPromise.then(onReady).catch(e => console.warn('[search] plantsPromise then failed', e));
        HL.search._active[myToken].onPlantsPromise = onReady;
      } catch (e) { console.debug('[search] attach to plantsPromise failed', e); }
    }

    HL.search._active[myToken].pollInterval = setInterval(() => {
      if (HL.search._searchToken !== myToken) {
        console.info(`[search] token changed - stopping pollInterval for token=${myToken}`);
        cancelPreviousSearch(myToken);
        return;
      }
      const act = HL.search._active[myToken];
      if (!act || act.memoryScanActive === false) {
        if (act && act.pollInterval) { clearInterval(act.pollInterval); act.pollInterval = null; console.debug(`[search] cleared pollInterval in interval callback token=${myToken}`); }
        return;
      }
      try { scanMemoryAndMaybeRender(); } catch (e) { console.warn('[search] poll error', e); }
    }, POLL_INTERVAL_MS);

    HL.search._active[myToken].timeoutTimer = setTimeout(() => {
      try {
        if (HL.search._searchToken !== myToken) { cancelPreviousSearch(myToken); return; }
        const act = HL.search._active[myToken];
        if (!act) return;
        if (!act.renderedInitial) {
          console.warn('[search] finalizer: forcing render as no initial render happened within timeout');
          HL.state.searchResults = matches.slice();
          HL.state.currentPageSearch = 1;
          HL.render.renderSearchPlantsPage(1);
          act.renderedInitial = true;

          GLOBAL_MEMORY_SHOWN_COUNT = HL.state.searchResults.length;
          stateHolder.memoryShownCount = GLOBAL_MEMORY_SHOWN_COUNT;
          memoryShownScientificNames.clear();
          for (const p of HL.state.searchResults) {
            const sci = (p.scientific_name || p.scientific || '').toString().toLowerCase().trim();
            if (sci) memoryShownScientificNames.add(sci);
          }
          stateHolder.memoryShownScientificNames = memoryShownScientificNames;
          stateHolder.allowAll = (GLOBAL_MEMORY_SHOWN_COUNT === 0);
          console.info(`[search] finalizer initialMemoryShownCount=${GLOBAL_MEMORY_SHOWN_COUNT} allowAll=${stateHolder.allowAll}`);
        } else {
          console.debug('[search] finalizer: initial render already done');
        }

        if (HL.search._active[myToken]) {
          if (HL.search._active[myToken].pollInterval) { clearInterval(HL.search._active[myToken].pollInterval); HL.search._active[myToken].pollInterval = null; }
          HL.search._active[myToken].postPollInterval = setInterval(() => {
            if (HL.search._searchToken !== myToken) { cancelPreviousSearch(myToken); return; }
            const act = HL.search._active[myToken];
            if (!act || act.memoryScanActive === false) {
              if (act && act.postPollInterval) { clearInterval(act.postPollInterval); act.postPollInterval = null; }
              return;
            }
            try { scanMemoryAndMaybeRender(); } catch (e) { console.debug('[search] post-poll error', e); }
          }, POST_TIMEOUT_POLL_MS);
        }
      } catch (e) { console.warn('[search] finalizer error', e); }
    }, SEARCH_TIMEOUT_MS);

  }; // end searchPlant

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

  try { setupTabLeaveHandler(); } catch (e) { console.debug('[search] setupTabLeaveHandler failed', e); }

  HL.search.cancelActiveSearches = function() {
    Object.keys(HL.search._active).forEach(t => cancelPreviousSearch(Number(t)));
  };

})(window.HerboLive);
