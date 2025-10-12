// js/render.js
(function(HL){
  HL.render = HL.render || {};

  // mergePlantData (mismo comportamiento que tenías)
  HL.mergePlantData = HL.mergePlantData || function mergePlantData(targetPlant, sourceData, sourceKey) {
    const out = Object.assign({}, targetPlant);
    const fields = ['description', 'image_url', 'image', 'images', 'medicinal_uses', 'uses', 'growth_zone', 'habitat', 'climate', 'family', 'genus', 'species', 'common_name', 'height', 'width', 'type', 'foliage', 'soils', 'pH', 'preferences', 'tolerances', 'edibility', 'other_uses'];
    for (const f of fields) {
      const haveTarget = out[f] !== undefined && out[f] !== null && String(out[f]).trim() !== '';
      const haveSource = sourceData[f] !== undefined && sourceData[f] !== null && String(sourceData[f]).trim() !== '';
      if (!haveTarget && haveSource) out[f] = sourceData[f];
    }
    if ((!out.images || out.images.length === 0) && (sourceData.thumbnail || sourceData.image || sourceData.image_url)) {
      out.images = [ sourceData.thumbnail || sourceData.image || sourceData.image_url ].filter(Boolean);
    }
    out[sourceKey] = sourceData;
    return out;
  };

  // render genérico
  HL.render.renderListPage = function renderListPage({ containerId, source, page, setPageFn, pageLabelId, paginationId }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    if (!source || source.length === 0) {
      container.innerHTML += `<p class="grey-text center-align" style="padding:20px">No hay plantas disponibles.</p>`;
      const pag = document.getElementById(paginationId);
      if (pag) pag.style.display = 'none';
      return;
    }

    const totalPages = Math.max(1, Math.ceil(source.length / HL.config.PAGE_SIZE));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setPageFn(page);

    const start = (page - 1) * HL.config.PAGE_SIZE;
    const end = Math.min(start + HL.config.PAGE_SIZE, source.length);
    const pagePlants = source.slice(start, end);

    pagePlants.forEach(plant => {
      const cardWrapper = document.createElement('div');
      cardWrapper.className = 'plant-card-wrapper col s12 m6 l4';
      const card = document.createElement('div');
      card.className = 'card plant-card z-depth-2';

      const imgUrl = plant.image_url || (plant.images && plant.images[0]) || (plant.perenual && (plant.perenual.image_url || (plant.perenual.images && plant.perenual.images[0]))) || (plant.trefle && (plant.trefle.image_url || (plant.trefle.images && plant.trefle.images[0]))) || 'img/logo.png';
      const title = plant.common_name || plant.common_name_display || plant.scientific_name || 'Nombre desconocido';

      card.innerHTML = `
        <div class="card-image" style="padding:10px; display:flex; align-items:center; justify-content:center; height:160px; background:#fafafa;">
          <img src="${HL.utils.escapeHtml(imgUrl)}" alt="${HL.utils.escapeHtml(title)}" onerror="this.src='img/logo.png'" style="max-height:140px; width:auto;">
        </div>
        <div class="card-content" style="height:200px; overflow:hidden;">
          <span class="card-title">${HL.utils.escapeHtml(title)}</span>
          <p>${HL.utils.escapeHtml(plant.description ? HL.utils.truncateText(plant.description, 140) : 'No hay descripción disponible.')}</p>
        </div>
      `;
      card.addEventListener('click', () => HL.modal.openPlantModal(plant));
      cardWrapper.appendChild(card);
      container.appendChild(cardWrapper);
    });

    // paginador del contenedor
    const pag = document.getElementById(paginationId);
    if (pag) {
      if (totalPages > 1) {
        pag.style.display = 'block';
        const pageSpan = document.getElementById(pageLabelId);
        if (pageSpan) pageSpan.textContent = `Página ${page} de ${totalPages}`;
      } else {
        pag.style.display = 'none';
      }
    }
  };

  HL.render.renderAllPlantsPage = function renderAllPlantsPage(page) {
    HL.render.renderListPage({
      containerId: 'plants-container',
      source: HL.state.plants,
      page,
      setPageFn: p => { HL.state.currentPageAll = p; },
      pageLabelId: 'current-page-all',
      paginationId: 'pagination-all'
    });
  };

  HL.render.renderSearchPlantsPage = function renderSearchPlantsPage(page) {
    HL.render.renderListPage({
      containerId: 'search-results-container',
      source: HL.state.searchResults,
      page,
      setPageFn: p => { HL.state.currentPageSearch = p; },
      pageLabelId: 'current-page-search',
      paginationId: 'pagination-search'
    });
  };

  HL.render.changePage = function changePage(context, page) {
    if (context === 'search') {
      const source = HL.state.searchResults;
      const totalPages = Math.max(1, Math.ceil((source && source.length) ? source.length / HL.config.PAGE_SIZE : 1));
      if (page < 1 || page > totalPages) return;
      HL.state.currentPageSearch = page;
      HL.render.renderSearchPlantsPage(page);
    } else {
      const source = HL.state.plants;
      const totalPages = Math.max(1, Math.ceil((source && source.length) ? source.length / HL.config.PAGE_SIZE : 1));
      if (page < 1 || page > totalPages) return;
      HL.state.currentPageAll = page;
      HL.render.renderAllPlantsPage(page);
    }
    HL.utils.scrollToTop();
  };

})(window.HerboLive);
