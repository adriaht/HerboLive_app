// js/modal.js
(function(HL){
  HL.modal = HL.modal || {};

  HL.modal.openPlantModal = function openPlantModal(plant) {
    HL.state.selectedPlant = plant;
    plant.currentImageIndex = plant.currentImageIndex || 0;
    const images = (plant.images && plant.images.length > 0) ? plant.images : [plant.image_url || 'img/logo.png'];

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

    let infoRows = '';
    for (const [label, key] of fieldsToShow) {
      let val = plant[key];
      if (val === undefined || val === null) val = '';
      if (Array.isArray(val)) val = val.join(', ');
      infoRows += `<tr><td style="vertical-align:top; padding:6px 8px; font-weight:600; width:30%;">${HL.utils.escapeHtml(label)}</td><td style="padding:6px 8px;">${HL.utils.escapeHtml(String(val))}</td></tr>`;
    }

    const jsonDetailsHtml = (typeof HL.config.DEBUG_SHOW_RAW !== 'undefined' && HL.config.DEBUG_SHOW_RAW)
      ? `<hr/>
         <details>
           <summary>Mostrar JSON completo (debug)</summary>
           <pre id="plant-json" style="max-height:300px; overflow:auto; white-space:pre-wrap;">${HL.utils.escapeHtml(JSON.stringify(HL.utils.sanitizeForDisplay(plant), null, 2))}</pre>
         </details>`
      : '';

    const modalContent = `
      <h4>${HL.utils.escapeHtml(plant.common_name || 'Nombre desconocido')}</h4>
      <h6><i>${HL.utils.escapeHtml(plant.scientific_name || 'Nombre científico no disponible')}</i></h6>
      <div style="position: relative; margin-bottom: 15px;">
        <img id="plant-modal-img" src="${HL.utils.escapeHtml(images[plant.currentImageIndex])}" style="width:100%; max-height:300px; object-fit:cover;" onerror="this.src='img/logo.png'">
        ${images.length > 1 ? `
          <i id="prev-img" class="material-icons" style="position:absolute; top:50%; left:0; cursor:pointer; color:white; font-size:36px;">chevron_left</i>
          <i id="next-img" class="material-icons" style="position:absolute; top:50%; right:0; cursor:pointer; color:white; font-size:36px;">chevron_right</i>
        ` : ''}
      </div>

      <p><b>Descripción:</b> ${HL.utils.escapeHtml(plant.description || plant.other_uses || 'No disponible')}</p>
      <table style="width:100%; border-collapse:collapse; font-size:13px; color:#333;">
        ${infoRows}
      </table>

      ${jsonDetailsHtml}
    `;

    let modal = document.getElementById('plant-modal');
    if (modal) modal.remove();
    modal = document.createElement('div');
    modal.id = 'plant-modal';
    modal.className = 'modal';
    modal.innerHTML = `<div class="modal-content">${modalContent}</div><div class="modal-footer"><a href="#!" class="modal-close btn-flat">Cerrar</a></div>`;
    document.body.appendChild(modal);
    if (window.M) {
      const instance = M.Modal.init(modal);
      instance.open();
    }

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
  };

  HL.modal.refreshPlantJsonInModal = function refreshPlantJsonInModal(plant) {
    const pre = document.getElementById('plant-json');
    if (pre) pre.textContent = JSON.stringify(HL.utils.sanitizeForDisplay(plant), null, 2);
  };

})(window.HerboLive);
