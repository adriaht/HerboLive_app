// js/api.js
(function(HL){
  HL.api = HL.api || {};

  // Small on-screen panel for logs (useful in emulator where no inspector)
  function ensureDebugPanel() {
    if (document.getElementById('api-debug-log')) return document.getElementById('api-debug-log');
    const panel = document.createElement('div');
    panel.id = 'api-debug-log';
    panel.style.position = 'fixed';
    panel.style.right = '8px';
    panel.style.top = '8px';
    panel.style.zIndex = 99999;
    panel.style.maxWidth = '360px';
    panel.style.maxHeight = '40vh';
    panel.style.overflow = 'auto';
    panel.style.background = 'rgba(0,0,0,0.75)';
    panel.style.color = '#fff';
    panel.style.fontSize = '12px';
    panel.style.padding = '8px';
    panel.style.borderRadius = '6px';
    panel.style.boxShadow = '0 2px 6px rgba(0,0,0,0.4)';
    panel.style.fontFamily = 'sans-serif';
    panel.innerHTML = `<div style="font-weight:700; margin-bottom:6px;">API debug</div>`;
    document.body.appendChild(panel);
    return panel;
  }

  function logToPanel(msg) {
    try {
      console.log(msg);
      const panel = ensureDebugPanel();
      const el = document.createElement('div');
      el.style.marginBottom = '4px';
      el.textContent = `${(new Date()).toLocaleTimeString()} — ${msg}`;
      panel.appendChild(el);
      // keep last 200 lines
      while (panel.childNodes.length > 220) panel.removeChild(panel.childNodes[1]);
    } catch (e) { console.log('logToPanel error', e); }
  }

  // Helper: construir URL absoluta hacia el backend público
  function apiUrl(path) {
    const cfg = (window.HerboLive && window.HerboLive.config) ? window.HerboLive.config : {};
    const base = (cfg.BACKEND_URL ? cfg.BACKEND_URL.replace(/\/+$/,'') : '') || '';
    const apiBase = (cfg.API_BASE || '/api').replace(/\/+$/,''); // '/api'
    if (!path) return base + apiBase;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    if (path.startsWith('/')) {
      if (path.startsWith('/api/')) return base + path;
      return base + apiBase + path;
    }
    return base + apiBase + '/' + path;
  }

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

  // key for merging/deduping: prefer scientific_name, else genus+species, else common_name
  function keyForItem(it) {
    if (!it) return '';
    const s = (it.scientific_name || it.scientific || (it.genus && it.species ? `${it.genus} ${it.species}` : '') || it.common_name || it.CommonName || '').toString().trim().toLowerCase();
    return s;
  }

  // Field list to consider for enrichment
  const ENRICH_FIELDS = [
    'description','image_url','images','pfaf',
    'family','genus','species','common_name',
    'habitat','other_uses','medicinal'
  ];

  async function getDbFirstPreference() {
    try {
      if (typeof HL !== 'undefined' && HL.config) {
        if (typeof HL.config.useDbFirst !== 'undefined') return !!HL.config.useDbFirst;
        if (typeof HL.config.USE_DB_FIRST !== 'undefined') return !!HL.config.USE_DB_FIRST;
        if (typeof HL.config.USE_BACKEND !== 'undefined') return !!HL.config.USE_BACKEND;
      }
    } catch (e) {}

    try {
      const res = await fetch(apiUrl('/config'));
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

  // Fetch helpers (DB, Perenual, Trefle, CSV)
  HL.api.fetchAllPlants = async function fetchAllPlants() {
    const cfg = HL.config || {};
    const perenUrl = `${cfg.API_BASE_URL || ''}?key=${encodeURIComponent(cfg.API_KEY_PERENUAL || '')}&page=1&per_page=100`;
    const trefleUrl = `${cfg.TREFLE_BASE || ''}/api/v1/species?token=${cfg.TREFLE_TOKEN || ''}&page=1&limit=100`;

    const preferDb = await getDbFirstPreference();

    // each tryX returns array or null
    async function tryDb() {
      try {
        logToPanel('Iniciando búsqueda en: DB (backend)');
        const resDb = await fetch(apiUrl('/plants'));
        if (resDb && resDb.ok) {
          const dbData = await resDb.json();
          if (Array.isArray(dbData) && dbData.length > 0) {
            logToPanel(`DB: devuelto ${dbData.length} items`);
            return dbData;
          }
          logToPanel('DB: no devolvió items');
        } else {
          logToPanel('DB: respuesta no OK ' + (resDb && resDb.status));
        }
      } catch (e) {
        logToPanel('DB fetch error: ' + (e && e.message ? e.message : e));
      }
      return [];
    }

    async function tryPerenual() {
      try {
        if (!cfg.API_BASE_URL || !cfg.API_KEY_PERENUAL) {
          logToPanel('Perenual: no configurado');
          return [];
        }
        logToPanel('Iniciando búsqueda en: Perenual');
        const res = await fetch(perenUrl);
        if (res.status === 429) {
          logToPanel('Perenual: rate limit (429)');
          return [];
        }
        if (!res.ok) {
          logToPanel('Perenual: HTTP ' + res.status);
          return [];
        }
        const data = await res.json();
        const items = data && data.data ? data.data.map(d => HL.api.normalizeApiToCsvFields(d, 'perenual')) : [];
        logToPanel(`Perenual: devuelto ${items.length} items`);
        return items;
      } catch (e) {
        logToPanel('Perenual failed: ' + (e && e.message ? e.message : e));
        return [];
      }
    }

    async function tryTrefle() {
      try {
        if (!cfg.TREFLE_BASE || !cfg.TREFLE_TOKEN) {
          logToPanel('Trefle: no configurado');
          return [];
        }
        logToPanel('Iniciando búsqueda en: Trefle');
        const resT = await fetch(trefleUrl);
        if (!resT.ok) {
          logToPanel('Trefle: HTTP ' + resT.status);
          return [];
        }
        const dataT = await resT.json();
        const items = dataT && dataT.data ? dataT.data.map(d => HL.api.normalizeApiToCsvFields(d, 'trefle')) : [];
        logToPanel(`Trefle: devuelto ${items.length} items`);
        return items;
      } catch (e) {
        logToPanel('Trefle failed: ' + (e && e.message ? e.message : e));
        return [];
      }
    }

    async function tryCsvLocal() {
      try {
        logToPanel('Iniciando lectura CSV local');
        const csvRes = await fetch('data/plant_data.csv');
        if (csvRes && csvRes.ok) {
          const text = await csvRes.text();
          const parsed = HL.csv.parseCSV(text, HL.config ? HL.config.CSV_MAX_READ : 52);
          if (Array.isArray(parsed) && parsed.length > 0) {
            logToPanel(`CSV local: devuelto ${parsed.length} items`);
            return parsed;
          }
        } else {
          logToPanel('CSV local: no disponible');
        }
      } catch (e) {
        logToPanel('CSV load failed: ' + (e && e.message ? e.message : e));
      }
      return [];
    }

    // Strategy: fetch DB (quick) then in parallel call other sources and merge results
    try {
      // fetch DB first synchronously (fast)
      const dbData = await tryDb(); // may be []
      // prepare base map keyed by keyForItem
      const baseMap = new Map();
      for (const r of (dbData || [])) {
        const k = keyForItem(r) || (`__db_${Math.random().toString(36).slice(2,8)}`);
        baseMap.set(k, Object.assign({}, r, { source: (r.source || 'db') }));
      }

      // fetch external sources in parallel (we WANT them even if DB had items)
      const promises = [ tryPerenual(), tryTrefle(), tryCsvLocal() ];
      const results = await Promise.allSettled(promises);
      const perenualRes = results[0].status === 'fulfilled' ? (results[0].value || []) : [];
      const trefleRes = results[1].status === 'fulfilled' ? (results[1].value || []) : [];
      const csvRes = results[2].status === 'fulfilled' ? (results[2].value || []) : [];

      // counters
      let totalEnriched = 0;
      let totalAdded = 0;

      // helper to merge a list into baseMap (counts enrichments + additions)
      function mergeList(list, sourceName) {
        let found = 0;
        let enriched = 0;
        let added = 0;
        for (const item of list || []) {
          const key = keyForItem(item);
          if (!key) {
            // fallback: add with generated key
            const genk = `__api_${sourceName}_${Math.random().toString(36).slice(2,8)}`;
            baseMap.set(genk, Object.assign({}, item, { source: sourceName }));
            added++;
            continue;
          }
          if (baseMap.has(key)) {
            found++;
            const base = baseMap.get(key);
            let didFill = false;
            for (const f of ENRICH_FIELDS) {
              const baseVal = base[f];
              const newVal = item[f];
              const baseEmpty = baseVal === null || typeof baseVal === 'undefined' || (typeof baseVal === 'string' && baseVal.trim() === '') || (Array.isArray(baseVal) && baseVal.length === 0);
              const newHas = newVal !== null && typeof newVal !== 'undefined' && ( (typeof newVal === 'string' && String(newVal).trim() !== '') || (Array.isArray(newVal) && newVal.length > 0) || (typeof newVal === 'boolean') );
              if (baseEmpty && newHas) {
                base[f] = newVal;
                didFill = true;
              }
            }
            if (didFill) {
              enriched++;
              // mark that this record now has multi-source info
              base.source = Array.isArray(base.source) ? base.source.concat([sourceName]) : (base.source ? [base.source, sourceName] : [sourceName]);
            }
            baseMap.set(key, base);
          } else {
            // not in DB base -> add as new
            baseMap.set(key, Object.assign({}, item, { source: sourceName }));
            added++;
          }
        }
        return { found, enriched, added };
      }

      const perStats = mergeList(perenualRes, 'perenual');
      logToPanel(`Perenual: encontrados ${perStats.found}, enriquecidos ${perStats.enriched}, nuevos ${perStats.added}`);

      const trefStats = mergeList(trefleRes, 'trefle');
      logToPanel(`Trefle: encontrados ${trefStats.found}, enriquecidos ${trefStats.enriched}, nuevos ${trefStats.added}`);

      const csvStats = mergeList(csvRes, 'csv');
      logToPanel(`CSV: encontrados ${csvStats.found}, enriquecidos ${csvStats.enriched}, nuevos ${csvStats.added}`);

      totalEnriched = perStats.enriched + trefStats.enriched + csvStats.enriched;
      totalAdded = perStats.added + trefStats.added + csvStats.added;

      if (totalEnriched || totalAdded) {
        logToPanel(`Total enriquecidos: ${totalEnriched}, añadidos: ${totalAdded}`);
      } else {
        logToPanel('No se añadieron ni enriquecieron registros (por ahora).');
      }

      // produce final array, prefer DB order when possible; keep unique
      const final = Array.from(baseMap.values());
      // optional: sort by common_name then scientific_name
      final.sort((a,b) => {
        const A = (a.common_name || a.common || a.scientific_name || '').toString().toLowerCase();
        const B = (b.common_name || b.common || b.scientific_name || '').toString().toLowerCase();
        if (A < B) return -1;
        if (A > B) return 1;
        return 0;
      });

      // return final array
      return final;
    } catch (e) {
      logToPanel('Error combinando fuentes: ' + (e && e.message ? e.message : e));
      return [];
    }
  };

  // export small helper so you can clear debug panel programmatically
  HL.api.debugClear = function() {
    const panel = document.getElementById('api-debug-log');
    if (panel) {
      panel.parentNode.removeChild(panel);
    }
  };

})(window.HerboLive);
