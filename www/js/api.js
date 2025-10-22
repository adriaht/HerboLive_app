// www/js/api.js (modificada: logs extra, apiUrl más explícita, fetchPlantsPage robusto)
(function(HL){
  HL.api = HL.api || {};

  function apiUrl(path) {
    const cfg = HL.config || {};
    const backend = (cfg.BACKEND_URL ? String(cfg.BACKEND_URL).replace(/\/+$/,'') : '') || '';
    const apiBase = (cfg.API_BASE || '/api').replace(/\/+$/,'');
    // path puede ser undefined / null / '/something' / 'plants'
    let url;
    if (!path || path === '' || path === '/') {
      url = backend + apiBase;
    } else if (typeof path === 'string' && (path.startsWith('http://') || path.startsWith('https://'))) {
      url = path;
    } else if (path.startsWith('/')) {
      // si path empieza por /api/ lo interpretamos como ya con prefijo
      if (path.startsWith('/api/')) url = backend + path;
      else url = backend + apiBase + path;
    } else {
      url = backend + apiBase + '/' + path;
    }
    // normalize double slashes (except after http(s):)
    try {
      url = url.replace(/([^:]\/)\/+/g, '$1');
    } catch (e) {}
    console.debug('[HL.api] apiUrl built ->', { path, backend, apiBase, url });
    return url;
  }

  console.log('[HL.api] initializing api module, HL.config snapshot:', (HL.config || {}));

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
      if (typeof cfg.useDbFirst !== 'undefined') {
        console.debug('[HL.api] getDbFirstPreference from HL.config.useDbFirst ->', !!cfg.useDbFirst);
        return !!cfg.useDbFirst;
      }
      const res = await fetch(apiUrl('/config'));
      if (res && res.ok) {
        const json = await res.json();
        console.debug('[HL.api] getDbFirstPreference from server ->', json);
        if (typeof json.useDbFirst !== 'undefined') return !!json.useDbFirst;
      } else {
        console.debug('[HL.api] getDbFirstPreference fetch non-ok', res && res.status);
      }
    } catch (e) {
      console.warn('[HL.api] No se pudo obtener /api/config', e);
    }
    return true;
  }

  // fetch config wrapper
  HL.api.getConfig = async function() {
    try {
      const url = apiUrl('/config');
      console.log('[HL.api] getConfig ->', url);
      const res = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const j = await res.json();
      return j;
    } catch (e) {
      console.warn('[HL.api] getConfig error', e);
      return null;
    }
  };

  // fetch a single page (used by loader/prefetch). Returns array of items.
  HL.api.fetchPlantsPage = async function(page = 1, perPage = (HL.config && HL.config.PAGE_SIZE) || 6) {
    try {
      // Build URL - prefer page/perPage params
      const url = apiUrl('/plants') + `?page=${encodeURIComponent(page)}&perPage=${encodeURIComponent(perPage)}`;
      console.log('[HL.api] fetchPlantsPage ->', url);
      const resp = await fetch(url, { headers: { 'Accept': 'application/json' } });
      if (!resp.ok) {
        console.warn('[HL.api] fetchPlantsPage non-ok', resp.status, '-', resp.statusText);
        // fallback: try ?limit (limit = perPage * page) - algunos endpoints devuelven por limit
        const url2 = apiUrl('/plants') + `?limit=${encodeURIComponent(perPage * page)}&page=${encodeURIComponent(page)}`;
        console.log('[HL.api] fetchPlantsPage fallback ->', url2);
        const r2 = await fetch(url2, { headers: { 'Accept': 'application/json' } });
        if (!r2.ok) { console.warn('[HL.api] fallback non-ok', r2.status); return []; }
        const j2 = await r2.json();
        if (Array.isArray(j2)) return j2;
        if (j2 && Array.isArray(j2.rows)) return j2.rows;
        if (j2 && Array.isArray(j2.data)) return j2.data;
        if (j2 && Array.isArray(j2.items)) return j2.items;
        return [];
      }
      const json = await resp.json();
      // Handler: server might return array, or {rows: [...]}, or {data: [...]}
      if (Array.isArray(json)) {
        console.debug('[HL.api] fetchPlantsPage got array length', json.length);
        return json;
      }
      if (json && Array.isArray(json.rows)) {
        console.debug('[HL.api] fetchPlantsPage got rows length', json.rows.length);
        return json.rows;
      }
      if (json && Array.isArray(json.data)) {
        console.debug('[HL.api] fetchPlantsPage got data length', json.data.length);
        return json.data;
      }
      if (json && Array.isArray(json.items)) {
        console.debug('[HL.api] fetchPlantsPage got items length', json.items.length);
        return json.items;
      }
      // unexpected shape
      console.debug('[HL.api] fetchPlantsPage unexpected shape, returning []', json);
      return [];
    } catch (e) {
      console.warn('[HL.api] fetchPlantsPage error', e);
      return [];
    }
  };

  // --- existing fetchAllPlants (preserve) ---
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

    // order preference: DB -> Perenual -> Trefle
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

  console.log('[HL.api] module loaded. You can override HL.config.API_BASE or HL.config.BACKEND_URL to adjust paths if needed.');

})(window.HerboLive);
