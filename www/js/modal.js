// js/modal.js
(function(HL){
  HL.modal = HL.modal || {};

  // Abre modal de planta: ahora intenta recargar la ficha desde backend (/api/plants/:id)
  HL.modal.openPlantModal = async function openPlantModal(plant) {
    // mantener referencia
    HL.state.selectedPlant = plant;
    plant.currentImageIndex = plant.currentImageIndex || 0;

    // helper: fetch detalle desde backend por id (si existe id)
    async function fetchDetailById(id) {
      try {
        const base = (typeof HL.config.API_BASE !== 'undefined') ? HL.config.API_BASE : '';
        const url = `${base}/api/plants/${encodeURIComponent(id)}`;
        const resp = await fetch(url, { method: 'GET', credentials: 'same-origin' });
        if (!resp.ok) {
          // no panic: devolver null para quedarse con la versión local
          return null;
        }
        const json = await resp.json();
        return json;
      } catch (e) {
        console.warn('fetchDetailById error', e && e.message ? e.message : e);
        return null;
      }
    }

    // si no hay images, construir fallback
    const images = (plant.images && plant.images.length > 0) ? plant.images : [plant.image_url || 'img/logo.png'];

    // Mostrar modal con contenido provisional mientras se busca detalle
    let infoRows = '';
    const fieldsToShow = [
      ['Common name', 'common_name'],
      ['Scientific name', 'scientific_name'],
      ['Family', 'family'],
      ['Genus', 'genus'],
      ['Species', 'species'],
      ['Growth rate', 'growth_rate'],
      ['Hardiness zones', 'hardiness_zones'],
      ['Height', 'height'],
      ['Width', 'width'],
      ['Type', 'type'],
      ['Foliage', 'foliage'],
      ['Pollinators', 'pollinators'],
      ['Leaf', 'leaf'],
      ['Flower', 'flower'],
      ['Ripen', 'ripen'],
      ['Reproduction', 'reproduction'],
      ['Soils', 'soils'],
      ['pH', 'pH'],
      ['Preferences', 'preferences'],
      ['Tolerances', 'tolerances'],
      ['Habitat', 'habitat'],
      ['Habitat range', 'habitat_range'],
      ['Edibility', 'edibility'],
      ['Medicinal', 'medicinal'],
      ['Other uses', 'other_uses'],
      ['PFAF', 'pfaf']
    ];

    function buildInfoRowsFromPlant(p) {
      let rows = '';
      for (const [label, key] of fieldsToShow) {
        let val = p[key];
        if (val === undefined || val === null) val = '';
        if (Array.isArray(val)) val = val.join(', ');
        rows += `<tr><td style="vertical-align:top; padding:6px 8px; font-weight:600; width:30%;">${HL.utils.escapeHtml(label)}</td><td style="padding:6px 8px;">${HL.utils.escapeHtml(String(val))}</td></tr>`;
      }
      return rows;
    }

    // placeholder modal content (se actualizará si conseguimos detalle)
    infoRows = buildInfoRowsFromPlant(plant);
    const modalContentInitial = `
      <h4>${HL.utils.escapeHtml(plant.common_name || 'Nombre desconocido')}</h4>
      <h6><i>${HL.utils.escapeHtml(plant.scientific_name || 'Nombre científico no disponible')}</i></h6>
      <div style="position: relative; margin-bottom: 15px;">
        <img id="plant-modal-img" src="${HL.utils.escapeHtml(images[plant.currentImageIndex])}" style="width:100%; max-height:300px; object-fit:cover;" onerror="this.src='img/logo.png'">
        ${images.length > 1 ? `
          <i id="prev-img" class="material-icons" style="position:absolute; top:50%; left:0; cursor:pointer; color:white; font-size:36px;">chevron_left</i>
          <i id="next-img" class="material-icons" style="position:absolute; top:50%; right:0; cursor:pointer; color:white; font-size:36px;">chevron_right</i>
        ` : ''}
      </div>

      <p id="plant-description"><b>Descripción:</b> ${HL.utils.escapeHtml(plant.description || plant.other_uses || 'No disponible')}</p>

      <table id="plant-info-table" style="width:100%; border-collapse:collapse; font-size:13px; color:#333;">
        ${infoRows}
      </table>
    `;

    // crear modal DOM
    let modal = document.getElementById('plant-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'plant-modal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content">${modalContentInitial}</div><div class="modal-footer"><a href="#!" class="modal-close btn-flat">Cerrar</a></div>`;
    document.body.appendChild(modal);
    if (window.M) {
      const instance = M.Modal.init(modal);
      instance.open();
    }

    // listeners de cambio de imagen (si procede)
    if (images.length > 1) {
      const prev = document.getElementById('prev-img');
      const next = document.getElementById('next-img');
      prev && prev.addEventListener('click', (e) => {
        e.stopPropagation();
        plant.currentImageIndex = (plant.currentImageIndex - 1 + images.length) % images.length;
        document.getElementById('plant-modal-img').src = images[plant.currentImageIndex];
        HL.modal.refreshPlantJsonInModal(plant);
      });
      next && next.addEventListener('click', (e) => {
        e.stopPropagation();
        plant.currentImageIndex = (plant.currentImageIndex + 1) % images.length;
        document.getElementById('plant-modal-img').src = images[plant.currentImageIndex];
        HL.modal.refreshPlantJsonInModal(plant);
      });
    }

    // Si hay id y no tenemos descripción o queremos refrescar -> pedir al backend
    if (plant.id) {
      // show "loading" in description
      const descNode = document.getElementById('plant-description');
      if (descNode) descNode.innerHTML = '<b>Descripción:</b> Cargando información adicional…';

      // fetch detalle
      const detail = await fetchDetailById(plant.id);
      if (detail && typeof detail === 'object') {
        // fusionar datos: usa HL.mergePlantData si existe
        try {
          const merged = (typeof HL.mergePlantData === 'function') ? HL.mergePlantData(plant, detail, 'db') : Object.assign({}, detail, plant);
          // actualizar estado
          HL.state.selectedPlant = merged;
          // actualizar imagenes si vienen nuevas
          const newImages = merged.images && merged.images.length ? merged.images : (merged.image_url ? [merged.image_url] : images);
          document.getElementById('plant-modal-img').src = HL.utils.escapeHtml(newImages[merged.currentImageIndex || 0] || 'img/logo.png');

          // actualizar descripción y tabla
          const newDesc = merged.description || merged.other_uses || 'No disponible';
          const descNode2 = document.getElementById('plant-description');
          if (descNode2) descNode2.innerHTML = `<b>Descripción:</b> ${HL.utils.escapeHtml(newDesc)}`;

          const infoTable = document.getElementById('plant-info-table');
          if (infoTable) infoTable.innerHTML = buildInfoRowsFromPlant(merged);

          // si existe la vista JSON debug, actualizarla
          HL.modal.refreshPlantJsonInModal(merged);
        } catch (e) {
          console.warn('Error merging detail into modal:', e && e.message ? e.message : e);
          // restaurar descripción original (si falla)
          const descNode3 = document.getElementById('plant-description');
          if (descNode3) descNode3.innerHTML = `<b>Descripción:</b> ${HL.utils.escapeHtml(plant.description || plant.other_uses || 'No disponible')}`;
        }
      } else {
        // no detail -> restaurar
        const descNode4 = document.getElementById('plant-description');
        if (descNode4) descNode4.innerHTML = `<b>Descripción:</b> ${HL.utils.escapeHtml(plant.description || plant.other_uses || 'No disponible')}`;
      }
    }

    // Si debug: añadir JSON
    const jsonDetailsHtml = (typeof HL.config.DEBUG_SHOW_RAW !== 'undefined' && HL.config.DEBUG_SHOW_RAW)
      ? `<hr/>
         <details>
           <summary>Mostrar JSON completo (debug)</summary>
           <pre id="plant-json" style="max-height:300px; overflow:auto; white-space:pre-wrap;">${HL.utils.escapeHtml(JSON.stringify(HL.utils.sanitizeForDisplay(HL.state.selectedPlant || plant), null, 2))}</pre>
         </details>`
      : '';

    // insertar debug section si procede (al final del modal)
    if (jsonDetailsHtml) {
      const modalContentEl = document.querySelector('#plant-modal .modal-content');
      if (modalContentEl && !modalContentEl.querySelector('#plant-json')) {
        modalContentEl.innerHTML = modalContentEl.innerHTML + jsonDetailsHtml;
      }
    }
  };

  HL.modal.refreshPlantJsonInModal = function refreshPlantJsonInModal(plant) {
    const pre = document.getElementById('plant-json');
    if (pre) pre.textContent = JSON.stringify(HL.utils.sanitizeForDisplay(plant), null, 2);
  };

})(window.HerboLive);
