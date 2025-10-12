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

  // -------------------------
  // Helper: determina base URL del backend
  // - Usa HL.config.backendHost / backendPort si están configurados
  // - Si backendHost vacío intenta heurísticas según entorno (Cordova/AVD/Genymotion)
  // - Si devuelve null, el resto del código usará paths relativos (/api/...)
  // -------------------------
  function getBackendBase() {
    const cfg = HL.config || {};
    // Si backendHost explícito
    if (cfg.backendHost && String(cfg.backendHost).trim() !== '') {
      const hostRaw = String(cfg.backendHost).trim();
      // Si ya incluye esquema http/https lo usamos tal cual
      if (/^https?:\/\//i.test(hostRaw)) {
        // Si incluyes puerto manualmente en backendHost, lo respetamos.
        return hostRaw;
      }
      // Si backendUseHttps true o puerto 443 => https
      const useHttps = !!cfg.backendUseHttps || (cfg.backendPort === 443);
      const scheme = useHttps ? 'https' : 'http';
      const portPart = (cfg.backendPort && cfg.backendPort !== 80 && cfg.backendPort !== 443) ? `:${cfg.backendPort}` : '';
      return `${scheme}://${hostRaw}${portPart}`;
    }

    // heurísticas según ejecución (file:// = Cordova)
    try {
      if (typeof window !== 'undefined' && window.location && window.location.protocol === 'file:') {
        // Android AVD
        return `http://10.0.2.2:${cfg.backendPort || 3000}`;
      }
      const ua = (navigator && navigator.userAgent) ? navigator.userAgent : '';
      if (/Genymotion/.test(ua)) return `http://10.0.3.2:${cfg.backendPort || 3000}`;
      if (/Android/.test(ua) && /Emulator|Android SDK built for x86/.test(ua)) return `http://10.0.2.2:${cfg.backendPort || 3000}`;
      if (/iPhone|iPad|iPod/.test(ua) && /Simulator/.test(ua)) return `http://localhost:${cfg.backendPort || 3000}`;
    } catch (e) {
      // ignore
    }

    // fallback: null -> usar rutas relativas '/api/...'
    return null;
  }

  // -------------------------
  // Preferencia DB-first (existente)
  // -------------------------
  async function getDbFirstPreference() {
    try {
      if (typeof HL !== 'undefined' && HL.config) {
        if (typeof HL.config.useDbFirst !== 'undefined') return !!HL.config.useDbFirst;
        if (typeof HL.config.USE_DB_FIRST !== 'undefined') return !!HL.config.USE_DB_FIRST;
        if (typeof HL.config.USE_BACKEND !== 'undefined') return !!HL.config.USE_BACKEND;
      }
    } catch (e) {}

    try {
      const res = await fetch('/api/config');
      if (res && res.ok) {
        const json = await res.json();
        if (typeof json.useDbFirst !== 'undefined') return !!json.useDbFirst;
        if (typeof json.USE_DB_FIRST !== 'undefined') return !!json.USE_DB_FIRST;
      }
    } catch (e) {
      if (HL.config && HL.config.DEBUG_SHOW_RAW) console.warn('No se pudo obtener /api/config', e);
    }

    return true;
  }

  HL.api.fetchAllPlants = async function fetchAllPlants() {
    const cfg = HL.config || {};
    const perenUrl = `${cfg.API_BASE_URL || ''}?key=${encodeURIComponent(cfg.API_KEY_PERENUAL || '')}&page=1&per_page=100`;
    const trefleUrl = `${cfg.TREFLE_BASE || ''}/api/v1/species?token=${cfg.TREFLE_TOKEN || ''}&page=1&limit=100`;

    const preferDb = await getDbFirstPreference();

    // -------- tryDb: usa URL absoluta si getBackendBase() devuelve algo ----------
    async function tryDb() {
      try {
        const backendBase = getBackendBase();
        const url = backendBase ? `${backendBase.replace(/\/$/,'')}/api/plants` : '/api/plants';
        if (cfg.DEBUG_SHOW_RAW) console.log('tryDb -> fetching', url);
        const resDb = await fetch(url);
        if (resDb && resDb.ok) {
          const dbData = await resDb.json();
          if (Array.isArray(dbData) && dbData.length > 0) return dbData;
        } else {
          if (cfg.DEBUG_SHOW_RAW) console.warn('Backend /api/plants not ok', resDb && resDb.status, url);
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

  // Enrichers and wikipedia helpers unchanged (keep existing code)...

})(window.HerboLive);
