// js/api.js
(function(HL){
  HL.api = HL.api || {};

  // Normaliza datos de API (Perenual/Trefle) al esquema tipo-CSV usado por la app
  HL.api.normalizeApiToCsvFields = function normalizeApiToCsvFields(item, source) {
    const out = {};
    if (source === 'perenual') {
      out.scientific_name = item.scientific_name || item.scientific || item.scientificName || '';
      out.common_name = item.common_name || item.common || item.commonName || item.name || '';
      out.description = item.description || item.summary || item.desc || '';
      out.image_url = item.image_url || item.image || item.thumbnail || (item.images && item.images[0]) || '';
      out.images = out.image_url ? [out.image_url] : [];
      out.family = item.family || '';
      out.genus = item.genus || '';
      out.species = item.species || '';
      out.medicinal = item.medicinal_uses || item.uses || '';
      out.habitat = item.habitat || item.habitat_range || '';
      out.pfaf = item.pfaf || '';
      out.source = 'perenual';
      return out;
    }

    if (source === 'trefle') {
      out.scientific_name = item.scientific_name || '';
      out.common_name = item.common_name || (item.common_names && item.common_names[0]) || '';
      out.description = item.description || item.synopsis || '';
      out.image_url = item.image_url || (item.image && item.image.url) || (item.images && item.images[0] && (item.images[0].url || item.images[0].image_url)) || '';
      out.images = out.image_url ? [out.image_url] : [];
      out.family = item.family || '';
      out.genus = item.genus || '';
      out.species = item.species || '';
      out.medicinal = item.medicinal_uses || item.uses || '';
      out.habitat = item.distribution || '';
      out.pfaf = '';
      out.source = 'trefle';
      return out;
    }

    return Object.assign({}, item);
  };

  // Helper: obtener preferencia DB-first desde HL.config o backend /api/config
  async function getDbFirstPreference() {
    try {
      if (typeof HL !== 'undefined' && HL.config) {
        if (typeof HL.config.useDbFirst !== 'undefined') return !!HL.config.useDbFirst;
        if (typeof HL.config.USE_DB_FIRST !== 'undefined') return !!HL.config.USE_DB_FIRST;
        if (typeof HL.config.USE_BACKEND !== 'undefined') return !!HL.config.USE_BACKEND;
      }
    } catch (e) {}

    // Si no está en HL.config, preguntar al backend (si se ha definido BACKEND_URL)
    try {
      const backend = (HL.config && HL.config.BACKEND_URL) ? HL.config.BACKEND_URL.replace(/\/+$/,'') : '';
      if (backend) {
        const res = await fetch(`${backend}/api/config`);
        if (res && res.ok) {
          const json = await res.json();
          if (typeof json.useDbFirst !== 'undefined') return !!json.useDbFirst;
          if (typeof json.USE_DB_FIRST !== 'undefined') return !!json.USE_DB_FIRST;
        }
      }
    } catch (e) {
      if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('No se pudo obtener /api/config', e);
    }

    return true;
  }

  // fetchAllPlants rework para soportar DB-first o API-first y BACKEND_URL absoluto (útil en emulador)
  HL.api.fetchAllPlants = async function fetchAllPlants() {
    const cfg = HL.config || {};
    const perenUrl = `${cfg.API_BASE_URL || ''}?key=${encodeURIComponent(cfg.API_KEY_PERENUAL || '')}&page=1&per_page=100`;
    const trefleUrl = `${cfg.TREFLE_BASE || ''}/api/v1/species?token=${cfg.TREFLE_TOKEN || ''}&page=1&limit=100`;

    const backendBase = (cfg.BACKEND_URL && String(cfg.BACKEND_URL).trim()) ? String(cfg.BACKEND_URL).replace(/\/+$/,'') : '';
    const preferDb = await getDbFirstPreference();

    async function tryDb() {
      // si hay BACKEND_URL usamos la URL absoluta; si no, intentamos la ruta relativa
      const url = backendBase ? `${backendBase}/api/plants` : '/api/plants';
      try {
        const resDb = await fetch(url);
        if (resDb && resDb.ok) {
          const dbData = await resDb.json();
          if (Array.isArray(dbData) && dbData.length > 0) return dbData;
        } else {
          if (cfg.DEBUG_SHOW_RAW) console.warn(`${url} responded not ok`, resDb && resDb.status);
        }
      } catch (e) {
        if (cfg.DEBUG_SHOW_RAW) console.warn('Fetch /api/plants failed', e);
      }
      return null;
    }

    async function tryPerenual() {
      try {
        if (!cfg.API_BASE_URL || !cfg.API_KEY_PERENUAL) return null;
        const res = await fetch(perenUrl);
        if (res.status === 429) throw new Error('Rate limit Perenual');
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const data = await res.json();
        if (data?.data?.length) return data.data.map(d => HL.api.normalizeApiToCsvFields(d, 'perenual'));
      } catch (e) {
        if (cfg.DEBUG_SHOW_RAW) console.warn('Perenual failed', e);
      }
      return null;
    }

    async function tryTrefle() {
      try {
        if (!cfg.TREFLE_BASE || !cfg.TREFLE_TOKEN) return null;
        const resT = await fetch(trefleUrl);
        if (!resT.ok) throw new Error('HTTP Trefle ' + resT.status);
        const dataT = await resT.json();
        if (dataT?.data?.length) return dataT.data.map(d => HL.api.normalizeApiToCsvFields(d, 'trefle'));
      } catch (e) {
        if (cfg.DEBUG_SHOW_RAW) console.warn('Trefle failed', e);
      }
      return null;
    }

    async function tryCsvLocal() {
      try {
        const csvRes = await fetch('data/plant_data.csv');
        if (csvRes && csvRes.ok) {
          const text = await csvRes.text();
          const parsed = HL.csv.parseCSV(text, HL.config ? HL.config.CSV_MAX_READ : 52);
          if (Array.isArray(parsed) && parsed.length > 0) return parsed;
        }
      } catch (e) {
        if (cfg.DEBUG_SHOW_RAW) console.warn('CSV load failed', e);
      }
      return null;
    }

    if (preferDb) {
      const dbRes = await tryDb();
      if (Array.isArray(dbRes) && dbRes.length) return dbRes;

      const pRes = await tryPerenual();
      if (Array.isArray(pRes) && pRes.length) return pRes;

      const tRes = await tryTrefle();
      if (Array.isArray(tRes) && tRes.length) return tRes;

      const cRes = await tryCsvLocal();
      if (Array.isArray(cRes) && cRes.length) return cRes;

      return [];
    } else {
      const pRes = await tryPerenual();
      if (Array.isArray(pRes) && pRes.length) return pRes;

      const tRes = await tryTrefle();
      if (Array.isArray(tRes) && tRes.length) return tRes;

      const dbRes = await tryDb();
      if (Array.isArray(dbRes) && dbRes.length) return dbRes;

      const cRes = await tryCsvLocal();
      if (Array.isArray(cRes) && cRes.length) return cRes;

      return [];
    }
  };

  // (El resto de funciones enrichers / wikipedia puedes dejar las que ya tengas)
  // Si ya tienes implementadas HL.api.enrichPlantWithTrefle, enrichPlantWithPerenual, enrichPlantWithWikipedia
  // en este mismo archivo, mantenlas igual.

})(window.HerboLive);
