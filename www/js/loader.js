// js/loader.js
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

  // Start background load (uses HL.api.fetchAllPlants and enrichers)
  HL.loader.startBackgroundLoad = function startBackgroundLoad() {
    if (HL.state.plantsPromise) return HL.state.plantsPromise;
    HL.state.loadingPlants = true;
    HL.loader.showLoadingForContainer('plants-container', 'Cargando plantas...');

    HL.state.plantsPromise = (async () => {
      try {
        const list = await HL.api.fetchAllPlants();
        if (!Array.isArray(list)) throw new Error('La fuente no devolvió un array de plantas.');

        const enriched = [];
        for (let i = 0; i < list.length; i++) {
          let plant = Object.assign({}, list[i]);

          try {
            const tref = await HL.api.enrichPlantWithTrefle(plant);
            if (tref) plant = HL.utils.merge ? HL.utils.merge(plant, tref) : HL.mergePlantData(plant, tref, 'trefle');
          } catch (e) { if (HL.config.DEBUG_SHOW_RAW) console.warn('Trefle enrich error', e); }

          const needDesc = !plant.description || String(plant.description).trim() === '';
          const needImg = !plant.image_url && !plant.image && !(plant.images && plant.images.length);
          if (needDesc || needImg) {
            try {
              const wiki = await HL.api.enrichPlantWithWikipedia(plant);
              if (wiki) plant = HL.mergePlantData(plant, wiki, 'wiki');
            } catch (e) { if (HL.config.DEBUG_SHOW_RAW) console.warn('Wikipedia error', e); }
          }

          if (!plant.images || !Array.isArray(plant.images)) {
            const maybe = plant.image_url || plant.image;
            if (maybe) plant.images = [maybe];
          }

          enriched.push(plant);
        }

        // Dedupe
        const seen = new Set();
        const unique = [];
        const duplicatesList = [];

        function buildDedupKey(p) {
          const sci = (p.scientific_name || p.scientific || '').toString().toLowerCase().trim();
          const com = (p.common_name || p.common || '').toString().toLowerCase().trim();
          const img = (p.image_url || (p.images && p.images[0]) || '').toString().toLowerCase().trim();
          const desc = (p.description || p.extract || '').toString().toLowerCase().trim().slice(0, 120);
          return `${sci}||${com}||${img}||${desc}`;
        }

        for (const p of enriched) {
          const key = buildDedupKey(p);
          if (!key || key === '||||') {
            const fallback = JSON.stringify(p).slice(0, 100);
            if (seen.has(fallback)) { duplicatesList.push(fallback); continue; }
            seen.add(fallback);
            unique.push(p);
          } else {
            if (seen.has(key)) { duplicatesList.push(key); continue; }
            seen.add(key);
            unique.push(p);
          }
        }

        if (HL.config.DEBUG_SHOW_RAW && duplicatesList.length > 0) {
          console.log(`Se han eliminado ${duplicatesList.length} duplicados (claves):`, duplicatesList.slice(0,50));
        }

        HL.state.plants = unique;
        HL.state.allPlantsLoaded = true;
        HL.state.loadingPlants = false;

        // render "Todas"
        HL.render.renderAllPlantsPage(HL.state.currentPageAll);

        // si había búsqueda pendiente
        if (HL.state.pendingSearchQuery) {
          const q = HL.state.pendingSearchQuery;
          HL.state.pendingSearchQuery = null;
          HL.search.performSearchAndRender(q, q);
        }

        return HL.state.plants;
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
