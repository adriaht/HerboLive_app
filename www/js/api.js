// js/api.js
(function(HL){
  HL.api = HL.api || {};

  // Normaliza datos de API (Perenual/Trefle) al esquema tipo-CSV usado por la app
  HL.api.normalizeApiToCsvFields = function normalizeApiToCsvFields(item, source) {
    const out = {};
    // Perenual (ya con campos distintos según su API)
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

    // Trefle
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

    // fallback: devolver item tal cual si no se reconoce
    return Object.assign({}, item);
  };

  // fetch helpers (Trefle / Perenual / CSV) - fetchAllPlants ya existía en monolito, lo reimplementamos aquí
  HL.api.fetchAllPlants = async function fetchAllPlants() {
    const cfg = HL.config;
    const perenUrl = `${cfg.API_BASE_URL}?key=${encodeURIComponent(cfg.API_KEY_PERENUAL)}&page=1&per_page=100`;
    const trefleUrl = `${cfg.TREFLE_BASE}/api/v1/species?token=${cfg.TREFLE_TOKEN}&page=1&limit=100`;

    let plantsLocal = [];

    // 1) Perenual
    try {
      const res = await fetch(perenUrl);
      if (res.status === 429) throw new Error('Rate limit Perenual');
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const data = await res.json();
      if (data?.data?.length) {
        plantsLocal = data.data.map(d => HL.api.normalizeApiToCsvFields(d, 'perenual'));
        return plantsLocal;
      }
    } catch (e) {
      if (HL.config.DEBUG_SHOW_RAW) console.warn('Perenual failed', e);
    }

    // 2) Trefle
    try {
      const resT = await fetch(trefleUrl);
      if (!resT.ok) throw new Error('HTTP Trefle ' + resT.status);
      const dataT = await resT.json();
      if (dataT?.data?.length) {
        plantsLocal = dataT.data.map(d => HL.api.normalizeApiToCsvFields(d, 'trefle'));
        return plantsLocal;
      }
    } catch (e) {
      if (HL.config.DEBUG_SHOW_RAW) console.warn('Trefle failed', e);
    }

    // 3) CSV local
    try {
      const csvRes = await fetch('data/plant_data.csv');
      if (csvRes && csvRes.ok) {
        const text = await csvRes.text();
        const parsed = HL.csv.parseCSV(text, HL.config.CSV_MAX_READ);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch (e) {
      if (HL.config.DEBUG_SHOW_RAW) console.warn('CSV load failed', e);
    }

    return plantsLocal;
  };

  // Enrichers (Trefle, Perenual, Wikipedia) - kept similar to original
  HL.api.enrichPlantWithTrefle = async function enrichPlantWithTrefle(rawPlant) {
    const token = HL.config.TREFLE_TOKEN;
    if (!token) { if (HL.config.DEBUG_SHOW_RAW) console.warn('Trefle token not set'); return null; }
    const q = (rawPlant.scientific_name || rawPlant.common_name || '').trim();
    if (!q) return null;
    try {
      const url = `${HL.config.TREFLE_BASE}/api/v1/species/search?q=${encodeURIComponent(q)}&limit=3&token=${encodeURIComponent(token)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const json = await res.json();
      const hits = Array.isArray(json.data) ? json.data : [];
      if (!hits.length) return null;
      const cand = hits[0];
      const mapped = HL.api.normalizeApiToCsvFields(cand, 'trefle');
      mapped._raw = cand;
      return mapped;
    } catch (e) {
      if (HL.config.DEBUG_SHOW_RAW) console.warn('Trefle error', e);
      return null;
    }
  };

  HL.api.enrichPlantWithPerenual = async function enrichPlantWithPerenual(rawPlant) {
    // Keep implementation lightweight: try /search endpoints
    const q = (rawPlant.scientific_name || rawPlant.common_name || '').trim();
    if (!q) return null;
    const attempts = [
      (qq) => `${HL.config.API_BASE_URL}?key=${encodeURIComponent(HL.config.API_KEY_PERENUAL)}&q=${encodeURIComponent(qq)}`,
      (qq) => `${HL.config.API_BASE_URL}?key=${encodeURIComponent(HL.config.API_KEY_PERENUAL)}&page=1&per_page=5&search=${encodeURIComponent(qq)}`
    ];
    for (const make of attempts) {
      try {
        const url = make(q);
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        let candidate = null;
        if (Array.isArray(json)) candidate = json[0];
        else if (Array.isArray(json.data)) candidate = json.data[0];
        else if (typeof json === 'object') {
          if (json.description || json.image) candidate = json;
          else {
            for (const k of Object.keys(json)) {
              if (Array.isArray(json[k]) && json[k].length>0) { candidate = json[k][0]; break; }
            }
          }
        }
        if (!candidate) continue;
        const mapped = HL.api.normalizeApiToCsvFields(candidate, 'perenual');
        mapped._raw = candidate;
        return mapped;
      } catch (e) {
        if (HL.config.DEBUG_SHOW_RAW) console.warn('Perenual attempt error', e);
        continue;
      }
    }
    return null;
  };

  HL.api.enrichPlantWithWikipedia = async function enrichPlantWithWikipedia(rawPlant) {
    const queries = [];
    if (rawPlant.scientific_name) queries.push(rawPlant.scientific_name);
    if (rawPlant.common_name && rawPlant.common_name !== rawPlant.scientific_name) queries.push(rawPlant.common_name);
    for (const q of queries) {
      try {
        let wikiData = await HL.api.fetchWikipediaData(q, 'es');
        if (!wikiData) wikiData = await HL.api.fetchWikipediaData(q, 'en');
        if (wikiData) {
          const mapped = { description: wikiData.extract || '', image_url: wikiData.image || '', _raw: wikiData, title: wikiData.title || '', pageurl: wikiData.pageurl || '', lang: wikiData.lang || '' };
          return mapped;
        }
      } catch (e) {
        if (HL.config.DEBUG_SHOW_RAW) console.warn('Wikipedia enrich error', e);
      }
    }
    return null;
  };

  HL.api.fetchWikipediaData = async function fetchWikipediaData(query, lang = 'es') {
    try {
      const apiBase = (lang === 'es') ? 'https://es.wikipedia.org/w/api.php' : 'https://en.wikipedia.org/w/api.php';
      const searchUrl = `${apiBase}?action=query&format=json&list=search&srprop=&srlimit=5&srsearch=${encodeURIComponent(query)}&origin=*`;
      const searchRes = await fetch(searchUrl);
      if (!searchRes.ok) return null;
      const searchJson = await searchRes.json();
      const hits = searchJson.query && searchJson.query.search ? searchJson.query.search : [];
      if (!hits || hits.length === 0) return null;
      const pageid = hits[0].pageid;
      const title = hits[0].title;
      const detailUrl = `${apiBase}?action=query&format=json&prop=extracts|pageimages&exintro=1&explaintext=1&pageids=${pageid}&pithumbsize=800&origin=*`;
      const detailRes = await fetch(detailUrl);
      if (!detailRes.ok) return null;
      const detailJson = await detailRes.json();
      const page = detailJson.query && detailJson.query.pages && detailJson.query.pages[pageid] ? detailJson.query.pages[pageid] : null;
      if (!page) return null;
      const extract = page.extract || '';
      const thumbnail = page.thumbnail && page.thumbnail.source ? page.thumbnail.source : null;
      const pageurl = (lang === 'es') ? `https://es.wikipedia.org/wiki/${encodeURIComponent(title)}` : `https://en.wikipedia.org/wiki/${encodeURIComponent(title)}`;
      return { title: title, extract: extract, image: thumbnail, pageurl: pageurl, lang: lang };
    } catch (err) {
      if (HL.config.DEBUG_SHOW_RAW) console.warn('fetchWikipediaData error:', err);
      return null;
    }
  };

})(window.HerboLive);
