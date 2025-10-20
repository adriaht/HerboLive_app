/* Cambios realizados:
 - En lugar de llamar HL.api.fetchAllPlants() que devolvía todo, hacemos:
   1) Pedir páginas 1..INITIAL_PAGES vía HL.api.fetchPlantsPage
   2) Guardarlas en HL.cache (IndexedDB) y en memoria
   3) Enriquecer al menos las 2 primeras páginas antes de renderizar (según tu petición)
   4) Renderizar la página actual (1) y dejar prefetch en background para el resto
 - Si el usuario solicita una página que no está en cache o no ha sido enriquecida,
   el render mostrará el loader y llamará a HL.prefetch.fetchPageImmediate.
 - No eliminé tu lógica de enrich previa; la moví a HL.prefetch.enrichPage para control.
*/

(function(HL){
  HL.loader = HL.loader || {};

  HL.loader.showLoadingForContainer = function showLoadingForContainer(containerId, text = 'Cargando...') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `
      <div class="center-align" style="padding:30px 0;">
        <div class="progress" style="max-width:400px; margin: 0 auto;">
          <div class="indeterminate"></div>
        </div>
        <p class="grey-text">${HL.utils.escapeHtml(text)}</p>
      </div>
    `;
    const pagId = (containerId === 'plants-container') ? 'pagination-all' : 'pagination-search';
    const pag = document.getElementById(pagId);
    if (pag) pag.style.display = 'none';
  };

  HL.loader.showErrorForContainer = function showErrorForContainer(containerId, msg = 'Error al cargar.') {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = `<div class="center-align" style="padding:30px 0;color:#c62828;">${HL.utils.escapeHtml(msg)}</div>`;
    const pagId = (containerId === 'plants-container') ? 'pagination-all' : 'pagination-search';
    const pag = document.getElementById(pagId);
    if (pag) pag.style.display = 'none';
  };

  // Start background load (uses HL.api.fetchPlantsPage and HL.prefetch.enrichPage)
  HL.loader.startBackgroundLoad = function startBackgroundLoad() {
    if (HL.state.plantsPromise) return HL.state.plantsPromise;
    HL.state.loadingPlants = true;
    HL.loader.showLoadingForContainer('plants-container', 'Cargando plantas...');

    HL.state.plantsPromise = (async () => {
      try {
        // ensure cache & prefetch modules initialized
        if (typeof HL.cache !== 'undefined' && typeof HL.cache.init === 'function') await HL.cache.init();
        // compute first batch: pages 1..INITIAL_PAGES
        const perPage = (HL.config && HL.config.PAGE_SIZE) || 6;
        const initialPages = (HL.config && HL.config.INITIAL_PAGES) || 5;

        const fetchedPages = [];
        for (let p = 1; p <= initialPages; p++) {
          try {
            // fetch page via HL.api.fetchPlantsPage
            const pageItems = await HL.api.fetchPlantsPage(p, perPage);
            const arr = Array.isArray(pageItems) ? pageItems : [];
            // store in cache & state
            await (HL.cache && HL.cache.setPage ? HL.cache.setPage(p, arr) : Promise.resolve());
            HL.state.pages = HL.state.pages || {};
            HL.state.pages[p] = arr;
            HL.state.loadedPages.add(p);
            fetchedPages.push(p);
            if (HL.config && HL.config.DEBUG_SHOW_RAW) console.log(`Loader: page ${p} fetched, items=${arr.length}`);
          } catch (e) {
            console.warn('Error fetching initial page', p, e);
          }
        }

        // Enrich at least first 2 pages before showing (según tu petición)
        const pagesToEnrichNow = [];
        for (let p = 1; p <= Math.min(2, initialPages); p++) pagesToEnrichNow.push(p);

        // enrich concurrently but controlled via HL.prefetch.enrichPage
        const enrichPromises = pagesToEnrichNow.map(p => {
          try {
            return HL.prefetch && typeof HL.prefetch.enrichPage === 'function' ? HL.prefetch.enrichPage(p) : Promise.resolve();
          } catch (e) { return Promise.resolve(); }
        });
        await Promise.all(enrichPromises);

        // finished initial load: mark states
        HL.state.allPlantsLoaded = false; // still not full catalog
        HL.state.loadingPlants = false;

        // set current page default 1 and render it
        HL.render.renderAllPlantsPage(HL.state.currentPageAll || 1);

        // start prefetch background (maintain window around current page)
        if (HL.config.PREFETCH_ENABLED && HL.prefetch && typeof HL.prefetch.start === 'function') {
          HL.prefetch.start(HL.state.currentPageAll || 1);
        }

        // attach pending search handler if needed
        if (HL.state.pendingSearchQuery) {
          const q = HL.state.pendingSearchQuery;
          HL.state.pendingSearchQuery = null;
          HL.search.performSearchAndRender(q, q);
        }

        return HL.state.pages;
      } catch (err) {
        HL.state.loadingPlants = false;
        HL.state.allPlantsLoaded = false;
        HL.loader.showErrorForContainer('plants-container', 'Error al cargar las plantas. Intenta más tarde.');
        console.error('startBackgroundLoad error', err);
        throw err;
      }
    })();

    HL.state.plantsPromise.catch(err => console.error('plantsPromise error', err));
    return HL.state.plantsPromise;
  };

})(window.HerboLive);
