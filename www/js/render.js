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

  // render genérico (para arrays ya disponibles — usado por search)
  HL.render.renderListPage = function renderListPage({ containerId, source, page, setPageFn, pageLabelId, paginationId }) {
    const container = document.getElementById(containerId);
    if (!container) return;
    container.innerHTML = '';

    const pag = document.getElementById(paginationId);
    if (!pag) {
      // nothing to do if pagination container is missing
      return;
    }

    // start safe: ensure pagination is empty & hidden until we explicitly show it
    pag.innerHTML = '';
    pag.classList.add('hidden-pagination');
    pag.classList.remove('pagination-fullwidth');
    pag.style.removeProperty('display'); // let CSS control

    // si no hay resultados, no mostrar paginación (ni flechas) — así no ves absolutamente nada
    if (!source || source.length === 0) {
      container.innerHTML += `<p class="grey-text center-align" style="padding:20px">No hay plantas disponibles.</p>`;
      return;
    }

    // calcular totalPages en base a los resultados locales (search)
    const totalPages = Math.max(1, Math.ceil(source.length / HL.config.PAGE_SIZE));
    if (page < 1) page = 1;
    if (page > totalPages) page = totalPages;
    setPageFn(page);

    const start = (page - 1) * HL.config.PAGE_SIZE;
    const end = Math.min(start + HL.config.PAGE_SIZE, source.length);
    const pagePlants = source.slice(start, end);

    // renderizar las cards
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

    // === paginador dinámico (igual que renderAllPlantsPage, pero con totalPages conocido) ===
    // If only 1 page, keep it hidden entirely
    if (totalPages <= 1) {
      // keep hidden (class already set)
      return;
    }

    // Ahora sí construiremos la paginación: quitamos la clase hidden y aplicamos layout
    pag.classList.remove('hidden-pagination');
    pag.classList.add('pagination-fullwidth');

    // ventana de páginas (hasta 5 centradas alrededor de page), acotada por totalPages
    const windowSize = 5;
    let startPage = Math.max(1, page - Math.floor(windowSize/2));
    let endPage = startPage + windowSize - 1;
    if (startPage === 1) endPage = Math.max(windowSize, endPage);
    if (endPage > totalPages) {
      endPage = totalPages;
      startPage = Math.max(1, endPage - (windowSize - 1));
    }
    if (endPage < startPage) endPage = startPage;

    pag.innerHTML = ''; // limpiar contenido previo

    // prev button
    const prevBtn = document.createElement('button');
    prevBtn.id = paginationId === 'pagination-search' ? 'prev-page-search' : 'prev-page-all';
    prevBtn.className = 'btn-flat green-text';
    prevBtn.title = 'Página anterior';
    prevBtn.innerHTML = `<i class="material-icons left">chevron_left</i>`;
    prevBtn.disabled = (page <= 1);
    prevBtn.addEventListener('click', () => {
      if (paginationId === 'pagination-search') {
        HL.render.changePage('search', page - 1);
      } else {
        HL.render.changePage('all', page - 1);
      }
    });

    // next button
    const nextBtn = document.createElement('button');
    nextBtn.id = paginationId === 'pagination-search' ? 'next-page-search' : 'next-page-all';
    nextBtn.className = 'btn-flat green-text';
    nextBtn.title = 'Página siguiente';
    nextBtn.innerHTML = `<i class="material-icons right">chevron_right</i>`;
    nextBtn.addEventListener('click', () => {
      if (paginationId === 'pagination-search') {
        HL.render.changePage('search', page + 1);
      } else {
        HL.render.changePage('all', page + 1);
      }
    });

    pag.appendChild(prevBtn);

    for (let p = startPage; p <= endPage; p++) {
      const nb = document.createElement('button');
      nb.className = 'btn-flat';
      if (p === page) {
        nb.className += ' green darken-2 white-text';
      } else {
        nb.className += ' green-text';
      }
      nb.style.margin = '0 4px';
      nb.textContent = p;
      nb.addEventListener('click', () => {
        if (paginationId === 'pagination-search') {
          HL.render.changePage('search', p);
        } else {
          HL.render.changePage('all', p);
        }
      });
      pag.appendChild(nb);
    }

    pag.setAttribute('aria-label', `Página ${page} de ${totalPages}`);
    pag.appendChild(nextBtn);

    HL.utils.scrollToTop();
  };

  // helper: render page items array into plants-container (reuse card creation)
  function renderItemsArrayIntoContainer(container, items) {
    container.innerHTML = '';
    if (!items || items.length === 0) {
      container.innerHTML = `<p class="grey-text center-align" style="padding:20px">No hay plantas disponibles.</p>`;
      return;
    }
    items.forEach(plant => {
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
  }

  // Render dinámico para "Todas" usando páginas cacheadas (server-side / paged)
  HL.render.renderAllPlantsPage = async function renderAllPlantsPage(page) {
    // sanitize page
    page = Number(page) || 1;
    HL.state.currentPageAll = page;

    const container = document.getElementById('plants-container');
    if (!container) return;

    // check if page is available in cache
    const cached = await (HL.cache && HL.cache.getPage ? HL.cache.getPage(page) : null);
    const enriching = (HL.state.enrichingPages && HL.state.enrichingPages.has(page));
    const loadingUi = (!cached || cached.length === 0) || enriching;

    if (loadingUi) {
      // show loader in container (reuse loader)
      HL.loader.showLoadingForContainer('plants-container', `Cargando página ${page}...`);
      try {
        // fetch and (by default) enrich page then re-render
        await HL.prefetch.fetchPageImmediate(page, { enrich: true });
        const nowItems = await (HL.cache && HL.cache.getPage ? HL.cache.getPage(page) : null);
        if (nowItems && nowItems.length) {
          renderItemsArrayIntoContainer(container, nowItems);
        } else {
          HL.loader.showErrorForContainer('plants-container', 'No hay datos en esta página.');
        }
      } catch (e) {
        HL.loader.showErrorForContainer('plants-container', 'Error al cargar la página. Intenta más tarde.');
        console.error('renderAllPlantsPage fetch error', e);
      }
    } else {
      // page is cached and (likely) enriched -> render immediately
      renderItemsArrayIntoContainer(container, cached);
    }

    // update pagination UI (dynamic window of numbered pages)
    const pag = document.getElementById('pagination-all');
    if (!pag) return;

    // start hidden & empty, only show when we append >1 visible page buttons
    pag.innerHTML = '';
    pag.classList.add('hidden-pagination');
    pag.classList.remove('pagination-fullwidth');
    pag.style.removeProperty('display');

    // Build visible numbered pages window (5 buttons centered around current page when possible)
    const windowSize = 5;
    let start = Math.max(1, page - Math.floor(windowSize/2));
    let end = start + windowSize - 1;

    // ensure start=1 if page small
    if (start === 1) end = Math.max(windowSize, end);

    // ensure end not less than start
    if (end < start) end = start;

    // Determine highestLoaded page based on HL.state.loadedPages (if available)
    const loadedPagesArr = Array.from(HL.state.loadedPages || new Set()).map(Number).sort((a,b)=>a-b);
    const highestLoaded = loadedPagesArr.length ? loadedPagesArr[loadedPagesArr.length - 1] : Math.max(page, start);
    // ensure end at least page (so user can move forward)
    if (end < page) end = page;
    // allow end to grow up to highestLoaded or page+2
    end = Math.max(end, Math.min(highestLoaded, page + 2));

    // sanitize (in case loadedPages are not present): ensure end >= start
    if (end < start) end = start;

    // If after all this only one page would be visible, keep it hidden (no chevrons)
    const numVisible = end - start + 1;
    if (numVisible <= 1) {
      // keep hidden
      return;
    }

    // otherwise build UI and unhide
    pag.classList.remove('hidden-pagination');
    pag.classList.add('pagination-fullwidth');

    const prevBtn = document.createElement('button');
    prevBtn.id = 'prev-page-all';
    prevBtn.className = 'btn-flat green-text';
    prevBtn.title = 'Página anterior';
    prevBtn.innerHTML = `<i class="material-icons left">chevron_left</i>`;
    prevBtn.disabled = (page <= 1);
    prevBtn.addEventListener('click', () => {
      HL.render.changePage('all', page - 1);
    });

    const nextBtn = document.createElement('button');
    nextBtn.id = 'next-page-all';
    nextBtn.className = 'btn-flat green-text';
    nextBtn.title = 'Página siguiente';
    nextBtn.innerHTML = `<i class="material-icons right">chevron_right</i>`;
    nextBtn.addEventListener('click', () => {
      HL.render.changePage('all', page + 1);
    });

    pag.appendChild(prevBtn);

    // numbered pages
    for (let p = start; p <= end; p++) {
      const nb = document.createElement('button');
      nb.className = 'btn-flat';
      if (p === page) {
        nb.className += ' green darken-2 white-text';
      } else {
        nb.className += ' green-text';
      }
      nb.style.margin = '0 4px';
      nb.textContent = p;
      nb.addEventListener('click', () => HL.render.changePage('all', p));
      pag.appendChild(nb);
    }

    // add the visible pageSpan (kept for accessibility but hidden by CSS)
    const pageSpan = document.createElement('span');
    pageSpan.id = 'current-page-all';
    pageSpan.style.margin = '0 10px';
    pageSpan.textContent = `Página ${page}`;
    pag.appendChild(pageSpan);

    pag.appendChild(nextBtn);

    // finally, tell prefetch to maintain window around this page
    if (HL.prefetch && typeof HL.prefetch.scheduleAround === 'function' && HL.config.PREFETCH_ENABLED) {
      HL.prefetch.scheduleAround(page);
    }

    HL.utils.scrollToTop();
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
      // server-paged mode: allow any page >=1
      if (page < 1) return;
      HL.state.currentPageAll = page;
      HL.render.renderAllPlantsPage(page);
    }
    HL.utils.scrollToTop();
  };

})(window.HerboLive);
