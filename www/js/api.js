/* Cambios realizados:
 - Añadidas funciones para pedir páginas al backend:
    - HL.api.fetchPlantsPage(page, perPage)
    - HL.api.fetchPlantsRange(limit, page)  (fallback sencillo)
 - Las funciones existentes (fetchAllPlants) se mantienen para compatibilidad.
 - Las nuevas funciones intentan usar /api/plants?page=&perPage= y caen a ?limit= si hace falta.
*/

(function(HL){
  HL.api = HL.api || {};

  function apiUrl(path) {
    const cfg = HL.config || {};
    const base = (cfg.BACKEND_URL ? cfg.BACKEND_URL.replace(/\/+$/,'') : '') || '';
    const apiBase = (cfg.API_BASE || '/api').replace(/\/+$/,'');
    if (!path) return base + apiBase;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) {
      if (path.startsWith('/api/')) return base + path;
      return base + apiBase + path;
    }
    return base + apiBase + '/' + path;
  }

  HL.api.normalizeApiToCsvFields = function(item, source) {
    const out = {};
    const s = (v) => v === undefined || v === null ? '' : String(v);
    if (source === 'perenual') {
      out.scientific_name = s(item.scientific_name || item.scientific || '');
      out.common_name = s(item.common_name || item.common || item.name || '');
      out.description = s(item.description || item.summary || '');
      out.image_url = s(item.image_url || item.image || (item.images && item.images[0]) || '');
      out.images = out.image_url ? [out.image_url] : [];
      out.family = s(item.family || '');
      out.genus = s(item.genus || '');
      out.species = s(item.species || '');
      out.medicinal = s(item.medicinal_uses || item.uses || '');
      out.habitat = s(item.habitat || item.habitat_range || '');
      out.pfaf = s(item.pfaf || '');
      out.source = 'perenual';
      return out;
    }
    if (source === 'trefle') {
      out.scientific_name = s(item.scientific_name || '');
      out.common_name = s(item.common_name || (item.common_names && item.common_names[0]) || '');
      out.description = s(item.description || item.synopsis || '');
      out.image_url = s(item.image_url || (item.image && item.image.url) || (item.images && item.images[0]) || '');
      out.images = out.image_url ? [out.image_url] : [];
      out.family = s(item.family || '');
      out.genus = s(item.genus || '');
      out.species = s(item.species || '');
      out.medicinal = s(item.medicinal_uses || item.uses || '');
      out.habitat = s(item.distribution || '');
      out.pfaf = '';
      out.source = 'trefle';
      return out;
    }
    return Object.assign({}, item);
  };

  // safe merge / key building
  function mergePlantsByKey(list) {
    const map = new Map();
    for (const p of (list || [])) {
      const rawKey = p && (p.scientific_name || (p.genus && p.species ? `${p.genus} ${p.species}` : '') || p.common_name || '');
      const key = String(rawKey || '').toLowerCase().trim();
      if (!key) continue;
      if (!map.has(key)) map.set(key, Object.assign({}, p));
      else {
        const cur = map.get(key);
        for (const k of Object.keys(p)) {
          const cv = cur[k];
          const pv = p[k];
          const cvEmpty = cv === undefined || cv === null || cv === '' || (Array.isArray(cv) && cv.length===0);
          if (cvEmpty && (pv !== undefined && pv !== null && pv !== '')) cur[k] = pv;
        }
        map.set(key, cur);
      }
    }
    return Array.from(map.values());
  }

  async function getDbFirstPreference() {
    try {
      const cfg = HL.config || {};
      if (typeof cfg.useDbFirst !== 'undefined') return !!cfg.useDbFirst;
      const res = await fetch(apiUrl('/config'));
      if (res && res.ok) {
        const json = await res.json();
        if (typeof json.useDbFirst !== 'undefined') return !!json.useDbFirst;
      }
    } catch (e) {
      if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('No se pudo obtener /api/config', e);
    }
    return true;
  }

  // ---- Nuevo: fetch por página ----
  HL.api.fetchPlantsPage = async function(page = 1, perPage = (HL.config && HL.config.PAGE_SIZE) || 6) {
    const cfg = HL.config || {};
    const preferDb = await getDbFirstPreference().catch(()=>true);

    // try page/perPage first
    try {
      const url = apiUrl(`/plants?page=${encodeURIComponent(page)}&perPage=${encodeURIComponent(perPage)}`);
      const res = await fetch(url);
      if (res && res.ok) {
        const json = await res.json();
        if (Array.isArray(json)) return json;
      }
    } catch (e) {
      if (cfg.DEBUG_SHOW_RAW) console.warn('fetchPlantsPage page/perPage failed', e);
    }

    // fallback: some backends accept limit (we ask limit=perPage and hope server handles page via query)
    try {
      const url2 = apiUrl(`/plants?limit=${encodeURIComponent(perPage)}&page=${encodeURIComponent(page)}`);
      const r2 = await fetch(url2);
      if (r2 && r2.ok) {
        const j2 = await r2.json();
        if (Array.isArray(j2)) return j2;
      }
    } catch (e) {
      if (cfg.DEBUG_SHOW_RAW) console.warn('fetchPlantsPage fallback failed', e);
    }

    // last resort: ask first N and slice client-side (not ideal but safe)
    try {
      const url3 = apiUrl(`/plants?limit=${encodeURIComponent(perPage * page)}`);
      const r3 = await fetch(url3);
      if (r3 && r3.ok) {
        const j3 = await r3.json();
        if (Array.isArray(j3)) {
          const start = (page - 1) * perPage;
          return j3.slice(start, start + perPage);
        }
      }
    } catch (e) {
      if (cfg.DEBUG_SHOW_RAW) console.warn('fetchPlantsPage last-resort failed', e);
    }

    // give up
    return [];
  };

  HL.api.fetchPlantsRange = async function(limit = 30, page = 1) {
    // convenience wrapper: page*limit first attempt via page/perPage
    return HL.api.fetchPlantsPage(page, limit);
  };

  // ---- Mantener fetchAllPlants por compatibilidad ----
  HL.api.fetchAllPlants = async function() {
    const cfg = HL.config || {};
    const preferDb = await getDbFirstPreference();

    async function tryDb() {
      console.log('API debug — Iniciando búsqueda en: DB (backend)');
      try {
        const resDb = await fetch(apiUrl('/plants'));
        if (!resDb.ok) {
          console.warn('API debug — /api/plants returned', resDb.status);
          return null;
        }
        const dbData = await resDb.json();
        if (Array.isArray(dbData)) {
          console.log('API debug — DB: devuelto', dbData.length, 'items');
          return dbData;
        }
      } catch (e) {
        console.warn('tryDb: fallo', e);
      }
      return null;
    }

    async function tryPerenual() {
      console.log('API debug — Iniciando búsqueda en: Perenual');
      try {
        const url = apiUrl('/proxy/perenual') + `?page=1&per_page=100`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (data?.data?.length) {
          console.log('API debug — Perenual: devuelto', data.data.length, 'items');
          return data.data.map(d => HL.api.normalizeApiToCsvFields(d, 'perenual'));
        }
      } catch (e) {
        console.warn('API debug — Perenual failed:', e && e.message ? e.message : e);
      }
      return null;
    }

    async function tryTrefle() {
      console.log('API debug — Iniciando búsqueda en: Trefle');
      try {
        const url = apiUrl('/proxy/trefle') + `?page=1&limit=100`;
        const r = await fetch(url);
        if (!r.ok) throw new Error('HTTP ' + r.status);
        const data = await r.json();
        if (data?.data?.length) {
          console.log('API debug — Trefle: devuelto', data.data.length, 'items');
          return data.data.map(d => HL.api.normalizeApiToCsvFields(d, 'trefle'));
        }
      } catch (e) {
        console.warn('API debug — Trefle failed:', e && e.message ? e.message : e);
      }
      return null;
    }

    if (preferDb) {
      const dbRes = await tryDb();
      if (Array.isArray(dbRes) && dbRes.length) return mergePlantsByKey(dbRes);
      const pRes = await tryPerenual();
      const tRes = await tryTrefle();
      const merged = mergePlantsByKey([].concat(pRes||[], tRes||[]));
      return merged;
    } else {
      const pRes = await tryPerenual();
      const tRes = await tryTrefle();
      const dbRes = await tryDb();
      const merged = mergePlantsByKey([].concat(pRes||[], tRes||[], dbRes||[]));
      return merged;
    }
  };

})(window.HerboLive);
