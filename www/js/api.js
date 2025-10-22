// www/js/api.js (modificada: safe merge + usa proxy + logging + fallback de subpath)
(function(HL){
  HL.api = HL.api || {};

  // --- debug / configuración visible ---
  console.debug('[HL.api] initializing api module, HL.config snapshot:', (HL.config || {}));

  function ensureSlash(s) {
    if (!s) return '';
    return s.replace(/\/+$/,'');
  }

  function apiUrl(path) {
    const cfg = HL.config || {};
    const base = (cfg.BACKEND_URL ? ensureSlash(cfg.BACKEND_URL) : '') || '';
    const apiBaseCfg = (cfg.API_BASE || '/api').replace(/\/+$/,'');
    const apiBase = apiBaseCfg.startsWith('/') ? apiBaseCfg : '/' + apiBaseCfg;
    // Normalización de path
    let p = path || '';
    if (p === '') {
      const full = base + apiBase;
      console.debug('[HL.api.apiUrl] computed (no path) ->', full);
      return full;
    }
    if (p.startsWith('http://') || p.startsWith('https://')) {
      console.debug('[HL.api.apiUrl] path is absolute url ->', p);
      return p;
    }
    if (p.startsWith('/')) {
      // if path starts with /api/ allow using base as prefix if user set BACKEND_URL
      if (p.startsWith('/api/')) {
        const full = base + p;
        console.debug('[HL.api.apiUrl] computed (absolute /api path) ->', full);
        return full;
      }
      const full = base + apiBase + p;
      console.debug('[HL.api.apiUrl] computed (absolute path) ->', full);
      return full;
    }
    const full = base + apiBase + '/' + p;
    console.debug('[HL.api.apiUrl] computed (relative path) ->', full);
    return full;
  }

  // Helper: construir alternativa basada en primer segmento de la ruta actual (p.ej. /herboLive)
  function detectAppBaseFromLocation() {
    try {
      const parts = (window.location && window.location.pathname) ? window.location.pathname.split('/').filter(Boolean) : [];
      if (parts.length > 0) {
        return '/' + parts[0];
      }
    } catch (e) {}
    return '';
  }

  // fetch con fallback: si 404, intentará una vez con prefijo (p.ej. /herboLive)
  async function fetchWithFallback(url, opts = {}) {
    const debugPrefix = '[HL.api.fetchWithFallback]';
    console.debug(`${debugPrefix} attempting fetch ->`, url, opts);
    let triedAlt = !!opts._triedAlt;
    try {
      const resp = await fetch(url, opts);
      console.debug(`${debugPrefix} response for ${url}: status=${resp && resp.status}`);
      if (resp && resp.status === 404 && !triedAlt) {
        // intentar fallback
        const firstSeg = detectAppBaseFromLocation();
        if (firstSeg) {
          const apiBase = (HL.config && (HL.config.API_BASE || '/api')) || '/api';
          const altUrl = ensureSlash(firstSeg) + apiBase + (url.indexOf(apiBase) !== -1 ? url.split(apiBase).pop() : url);
          console.warn(`${debugPrefix} got 404 for ${url} -> trying fallback ${altUrl}`);
          // mark tried to avoid recursion
          const newOpts = Object.assign({}, opts, { _triedAlt: true });
          triedAlt = true;
          const resp2 = await fetch(altUrl, newOpts);
          console.debug(`${debugPrefix} fallback response for ${altUrl}: status=${resp2 && resp2.status}`);
          return { resp: resp2, usedAlt: true, altUrl };
        }
      }
      return { resp, usedAlt: false, altUrl: null };
    } catch (err) {
      console.warn(`${debugPrefix} fetch error for ${url}:`, err && err.message ? err.message : err);
      // if there's a fallback and not tried, attempt it as well
      if (!triedAlt) {
        const firstSeg = detectAppBaseFromLocation();
        if (firstSeg) {
          const apiBase = (HL.config && (HL.config.API_BASE || '/api')) || '/api';
          const altUrl = ensureSlash(firstSeg) + apiBase + (url.indexOf(apiBase) !== -1 ? url.split(apiBase).pop() : url);
          console.warn(`${debugPrefix} network failed for ${url}, trying fallback ${altUrl}`);
          try {
            const resp2 = await fetch(altUrl, Object.assign({}, opts, { _triedAlt: true }));
            console.debug(`${debugPrefix} fallback response for ${altUrl}: status=${resp2 && resp2.status}`);
            return { resp: resp2, usedAlt: true, altUrl };
          } catch (err2) {
            console.warn(`${debugPrefix} fallback fetch also failed for ${altUrl}:`, err2 && err2.message ? err2.message : err2);
            return { resp: null, usedAlt: true, altUrl };
          }
        }
      }
      return { resp: null, usedAlt: false, altUrl: null };
    }
  }

  // --- Normalize helpers (sin cambios) ---
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

  // fetch helper used by getDbFirstPreference
  async function safeGetJson(url, opts) {
    const resWrap = await fetchWithFallback(url, opts);
    if (!resWrap || !resWrap.resp) {
      console.warn('[HL.api.safeGetJson] no response for', url);
      return null;
    }
    const resp = resWrap.resp;
    try {
      if (!resp.ok) {
        console.warn('[HL.api.safeGetJson] HTTP not ok for', url, 'status', resp.status);
        return { status: resp.status, ok: false, json: null, usedAlt: resWrap.usedAlt, altUrl: resWrap.altUrl };
      }
      const json = await resp.json();
      return { status: resp.status, ok: true, json, usedAlt: resWrap.usedAlt, altUrl: resWrap.altUrl };
    } catch (e) {
      console.warn('[HL.api.safeGetJson] parse json failed for', url, e && e.message ? e.message : e);
      return { status: resp.status, ok: false, json: null, usedAlt: resWrap.usedAlt, altUrl: resWrap.altUrl };
    }
  }

  async function getDbFirstPreference() {
    try {
      const cfg = HL.config || {};
      if (typeof cfg.useDbFirst !== 'undefined') return !!cfg.useDbFirst;
      const url = apiUrl('/config');
      console.debug('[HL.api.getDbFirstPreference] fetching', url);
      const got = await safeGetJson(url);
      if (got && got.ok && got.json) {
        console.debug('[HL.api.getDbFirstPreference] /api/config returned', got.json);
        if (typeof got.json.useDbFirst !== 'undefined') return !!got.json.useDbFirst;
      } else {
        console.debug('[HL.api.getDbFirstPreference] /api/config not available or returned non-ok', got && got.status);
      }
    } catch (e) {
      if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('No se pudo obtener /api/config', e);
    }
    return true;
  }

  HL.api.fetchAllPlants = async function() {
    const cfg = HL.config || {};
    const preferDb = await getDbFirstPreference();

    async function tryDb() {
      console.info('API debug — Iniciando búsqueda en: DB (backend)');
      try {
        const url = apiUrl('/plants');
        console.debug('[HL.api.tryDb] fetch url ->', url);
        const got = await safeGetJson(url);
        if (got && got.ok && Array.isArray(got.json)) {
          console.log('API debug — DB: devuelto', got.json.length, 'items', 'usedAlt:', got.usedAlt, got.altUrl);
          return got.json;
        }
        // Some servers return { rows: [...] } or { data: [...] }
        if (got && got.ok && got.json && Array.isArray(got.json.rows)) {
          console.log('API debug — DB(rows): devuelto', got.json.rows.length, 'items');
          return got.json.rows;
        }
        if (got && got.ok && got.json && Array.isArray(got.json.data)) {
          console.log('API debug — DB(data): devuelto', got.json.data.length, 'items');
          return got.json.data;
        }
        console.warn('API debug — /api/plants returned unexpected shape or non-ok status', got && got.status);
      } catch (e) {
        console.warn('tryDb: fallo', e);
      }
      return null;
    }

    async function tryPerenual() {
      console.log('API debug — Iniciando búsqueda en: Perenual');
      try {
        const url = apiUrl('/proxy/perenual') + `?page=1&per_page=100`;
        console.debug('[HL.api.tryPerenual] fetch url ->', url);
        const got = await safeGetJson(url);
        if (got && got.ok && got.json && got.json.data && Array.isArray(got.json.data)) {
          console.log('API debug — Perenual: devuelto', got.json.data.length, 'items');
          return got.json.data.map(d => HL.api.normalizeApiToCsvFields(d, 'perenual'));
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
        console.debug('[HL.api.tryTrefle] fetch url ->', url);
        const got = await safeGetJson(url);
        if (got && got.ok && got.json && got.json.data && Array.isArray(got.json.data)) {
          console.log('API debug — Trefle: devuelto', got.json.data.length, 'items');
          return got.json.data.map(d => HL.api.normalizeApiToCsvFields(d, 'trefle'));
        }
      } catch (e) {
        console.warn('API debug — Trefle failed:', e && e.message ? e.message : e);
      }
      return null;
    }

    // orden de preferencia: DB -> Perenual -> Trefle
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

  // expose for debugging
  HL.api._internal = HL.api._internal || {};
  HL.api._internal.fetchWithFallback = fetchWithFallback;
  HL.api._internal.apiUrl = apiUrl;
  HL.api._internal.safeGetJson = safeGetJson;

  console.info('[HL.api] module loaded. You can override HL.config.API_BASE or HL.config.BACKEND_URL to adjust paths if needed.');
})(window.HerboLive);
