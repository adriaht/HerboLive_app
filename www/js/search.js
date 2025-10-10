// js/search.js
(function(HL){
  HL.search = HL.search || {};

  HL.search.searchPlant = async function searchPlant() {
    const rawQuery = document.getElementById('search-input').value;
    const query = rawQuery ? rawQuery.trim().toLowerCase() : '';

    if (!query) {
      HL.state.searchResults = [];
      HL.state.currentPageSearch = 1;
      HL.render.renderSearchPlantsPage(HL.state.currentPageSearch);
      return;
    }

    if (!HL.state.allPlantsLoaded) {
      HL.loader.showLoadingForContainer('search-results-container', `Buscando "${HL.utils.escapeHtml(rawQuery)}" — esperando datos...`);
      HL.state.pendingSearchQuery = query;
      if (!HL.state.plantsPromise) HL.loader.startBackgroundLoad();
      return;
    }

    HL.search.performSearchAndRender(query, rawQuery);
  };

  HL.search.performSearchAndRender = function performSearchAndRender(normalizedQuery, rawQuery) {
    const q = (normalizedQuery || '').toString().toLowerCase();
    if (!q) {
      HL.state.searchResults = [];
      HL.render.renderSearchPlantsPage(1);
      return;
    }

    const results = HL.state.plants.filter(p => {
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
      if (container) container.innerHTML = `<p class="grey-text center-align" style="padding:20px">No se encontraron resultados para "${HL.utils.escapeHtml(rawQuery)}"</p>`;
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

})(window.HerboLive);
