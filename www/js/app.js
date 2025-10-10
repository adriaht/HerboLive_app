// ===============================
// HERBOLIVE - app.js
// Versión: restaurada con campos completos + tabs independientes + CSV fallback (52 filas)
// ===============================

// DEBUG: poner a false para quitar la UI de depuración
const DEBUG_SHOW_RAW = false;

// -------------------
// Panel de depuración en pantalla (UI)
function initDebugUI() {
  if (!DEBUG_SHOW_RAW) return;
  if (document.getElementById('debug-panel')) return;

  const panel = document.createElement('div');
  panel.id = 'debug-panel';
  panel.style.position = 'fixed';
  panel.style.right = '12px';
  panel.style.bottom = '12px';
  panel.style.width = '360px';
  panel.style.maxHeight = '40vh';
  panel.style.overflow = 'auto';
  panel.style.background = 'rgba(255,255,255,0.95)';
  panel.style.border = '1px solid rgba(0,0,0,0.12)';
  panel.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
  panel.style.borderRadius = '8px';
  panel.style.fontSize = '12px';
  panel.style.zIndex = '99999';
  panel.style.padding = '8px';
  panel.style.display = 'flex';
  panel.style.flexDirection = 'column';
  panel.style.gap = '6px';

  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';

  const title = document.createElement('strong');
  title.textContent = 'Debug (UI)';
  title.style.fontSize = '13px';
  header.appendChild(title);

  const controls = document.createElement('div');

  const clearBtn = document.createElement('button');
  clearBtn.textContent = 'Limpiar';
  clearBtn.className = 'btn-flat';
  clearBtn.style.fontSize = '11px';
  clearBtn.style.marginRight = '6px';
  clearBtn.addEventListener('click', () => {
    const body = document.getElementById('debug-body');
    if (body) body.innerHTML = '';
  });
  controls.appendChild(clearBtn);

  const toggleBtn = document.createElement('button');
  toggleBtn.textContent = 'Ocultar';
  toggleBtn.className = 'btn-flat';
  toggleBtn.style.fontSize = '11px';
  toggleBtn.addEventListener('click', () => {
    const body = document.getElementById('debug-body');
    if (!body) return;
    if (body.style.display === 'none') {
      body.style.display = 'block';
      toggleBtn.textContent = 'Ocultar';
    } else {
      body.style.display = 'none';
      toggleBtn.textContent = 'Mostrar';
    }
  });
  controls.appendChild(toggleBtn);

  header.appendChild(controls);
  panel.appendChild(header);

  const body = document.createElement('div');
  body.id = 'debug-body';
  body.style.overflow = 'auto';
  body.style.maxHeight = 'calc(40vh - 60px)';
  body.style.paddingTop = '6px';
  panel.appendChild(body);

  appendDebugMessage('info', 'Panel de depuración inicializado');

  document.body.appendChild(panel);
}

// Formatea mensajes y los añade al panel
function appendDebugMessage(level, ...args) {
  try {
    if (!DEBUG_SHOW_RAW) return;
    const body = document.getElementById('debug-body');
    if (!body) return;

    const ts = new Date().toLocaleTimeString();
    const row = document.createElement('div');
    row.style.marginBottom = '6px';
    row.style.whiteSpace = 'pre-wrap';

    const label = document.createElement('span');
    label.textContent = `[${ts}] ${level.toUpperCase()}: `;
    label.style.fontWeight = '600';
    label.style.color = (level === 'error') ? '#b71c1c' : (level === 'warn' ? '#ff6f00' : '#0b8043');

    const text = document.createElement('span');
    const textParts = args.map(a => {
      try {
        if (typeof a === 'string') return a;
        return JSON.stringify(a, null, 2);
      } catch (e) {
        try { return String(a); } catch { return '[unserializable]'; }
      }
    });

    text.textContent = textParts.join(' ');
    row.appendChild(label);
    row.appendChild(text);
    body.appendChild(row);
    body.scrollTop = body.scrollHeight;
  } catch (e) {
    // silencioso si falla el UI debug
  }
}

// Sobrescribir console para que también muestre en UI
(function hijackConsoleToUI() {
  const original = {
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console)
  };

  console.log = function(...args) { original.log(...args); appendDebugMessage('log', ...args); };
  console.info = function(...args) { original.info(...args); appendDebugMessage('info', ...args); };
  console.warn = function(...args) { original.warn(...args); appendDebugMessage('warn', ...args); };
  console.error = function(...args) { original.error(...args); appendDebugMessage('error', ...args); };
})();

// -------------------
// Configuración global
const TREFLE_TOKEN = "usr-ijZevpsl8nyZp0aOPf46CnKpLwSvtvgg1yeCo4QTPU0"; // pon tu token si lo tienes
const TREFLE_BASE = "https://trefle.io";

const API_KEY_PERENUAL = "sk-mFfk68e59df7d26cd12759";
const API_BASE_URL = "https://perenual.com/api/species-list";

const PAGE_SIZE = 12;
const CSV_MAX_READ = 52; // tope de filas leídas del CSV

// Estado global (separado por vistas)
let plants = [];               // "Todas" - lista maestra
let searchResults = [];        // resultados para la pestaña Buscar
let selectedPlant = null;

let plantsPromise = null;
let allPlantsLoaded = false;
let loadingPlants = false;

// paginación independiente
let currentPageAll = 1;
let currentPageSearch = 1;

// si el usuario busca antes de que terminen de cargar los datos
let pendingSearchQuery = null;

// ------------------- Inicio
document.addEventListener('DOMContentLoaded', () => {
  initDebugUI();
  const tabs = document.querySelectorAll('.tabs');
  if (window.M && tabs) M.Tabs.init(tabs);
  if (window.M) M.Modal.init(document.querySelectorAll('.modal'));
  setupUIListeners();

  // Desactivar autocomplete en el input de búsqueda
  const searchInput = document.getElementById('search-input');
  if (searchInput) {
    searchInput.setAttribute('autocomplete', 'off');
    searchInput.setAttribute('autocorrect', 'off');
    searchInput.setAttribute('autocapitalize', 'off');
    searchInput.setAttribute('spellcheck', 'false');
  }

  startBackgroundLoad();
});

// ------------------- Setup listeners UI
function setupUIListeners() {
  const searchBtn = document.getElementById('search-btn');
  const searchInput = document.getElementById('search-input');
  if (searchBtn) searchBtn.addEventListener('click', () => searchPlant());
  if (searchInput) searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') searchPlant(); });

  // paginadores "Todas"
  const prevAll = document.getElementById('prev-page-all');
  const nextAll = document.getElementById('next-page-all');
  if (prevAll) prevAll.addEventListener('click', () => changePage('all', currentPageAll - 1));
  if (nextAll) nextAll.addEventListener('click', () => changePage('all', currentPageAll + 1));

  // paginadores "Buscar"
  const prevSearch = document.getElementById('prev-page-search');
  const nextSearch = document.getElementById('next-page-search');
  if (prevSearch) prevSearch.addEventListener('click', () => changePage('search', currentPageSearch - 1));
  if (nextSearch) nextSearch.addEventListener('click', () => changePage('search', currentPageSearch + 1));
}

// ------------------- Helpers UI para loaders/errores (por contenedor)
function showLoadingForContainer(containerId, text = 'Cargando...') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `
    <div class="center-align" style="padding:30px 0;">
      <div class="progress" style="max-width:400px; margin: 0 auto;">
        <div class="indeterminate"></div>
      </div>
      <p class="grey-text">${escapeHtml(text)}</p>
    </div>
  `;
  const pagId = (containerId === 'plants-container') ? 'pagination-all' : 'pagination-search';
  const pag = document.getElementById(pagId);
  if (pag) pag.style.display = 'none';
}
function showErrorForContainer(containerId, msg = 'Error al cargar.') {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="center-align" style="padding:30px 0;color:#c62828;">${escapeHtml(msg)}</div>`;
  const pagId = (containerId === 'plants-container') ? 'pagination-all' : 'pagination-search';
  const pag = document.getElementById(pagId);
  if (pag) pag.style.display = 'none';
}

// ------------------- Render "Todas"
function renderAllPlantsPage(page) {
  renderListPage({
    containerId: 'plants-container',
    source: plants,
    page,
    setPageFn: p => { currentPageAll = p; },
    pageLabelId: 'current-page-all',
    paginationId: 'pagination-all'
  });
}

// ------------------- Render búsqueda
function renderSearchPlantsPage(page) {
  renderListPage({
    containerId: 'search-results-container',
    source: searchResults,
    page,
    setPageFn: p => { currentPageSearch = p; },
    pageLabelId: 'current-page-search',
    paginationId: 'pagination-search'
  });
}

// Render genérico (tarjetas) - mantiene consistencia con campos del CSV
function renderListPage({ containerId, source, page, setPageFn, pageLabelId, paginationId }) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = '';

 

  if (!source || source.length === 0) {
    container.innerHTML += `<p class="grey-text center-align" style="padding:20px">No hay plantas disponibles.</p>`;
    const pag = document.getElementById(paginationId);
    if (pag) pag.style.display = 'none';
    return;
  }

  const totalPages = Math.max(1, Math.ceil(source.length / PAGE_SIZE));
  if (page < 1) page = 1;
  if (page > totalPages) page = totalPages;
  setPageFn(page);

  const start = (page - 1) * PAGE_SIZE;
  const end = Math.min(start + PAGE_SIZE, source.length);
  const pagePlants = source.slice(start, end);

  pagePlants.forEach(plant => {
    const cardWrapper = document.createElement('div');
    cardWrapper.className = 'plant-card-wrapper col s12 m6 l4';
    const card = document.createElement('div');
    card.className = 'card plant-card z-depth-2';

    const imgUrl = plant.image_url || (plant.images && plant.images[0]) || (plant.perenual && (plant.perenual.image_url || (plant.perenual.images && plant.perenual.images[0]))) || (plant.trefle && (plant.trefle.image_url || (plant.trefle.images && plant.trefle.images[0]))) || 'img/logo.png';
    const title = plant.common_name || plant.common_name_display || plant.scientific_name || 'Nombre desconocido';

    card.innerHTML = `
      <div class="card-image" style="padding:10px; display:flex; align-items:center; justify-content:center; height:160px; background:#fafafa;">
        <img src="${escapeHtml(imgUrl)}" alt="${escapeHtml(title)}" onerror="this.src='img/logo.png'" style="max-height:140px; width:auto;">
      </div>
      <div class="card-content" style="height:200px; overflow:hidden;">
        <span class="card-title">${escapeHtml(title)}</span>
        <p>${escapeHtml(plant.description ? truncateText(plant.description, 140) : 'No hay descripción disponible.')}</p>
      </div>
    `;
    card.addEventListener('click', () => openPlantModal(plant));
    cardWrapper.appendChild(card);
    container.appendChild(cardWrapper);
  });

  // paginador del contenedor
  const pag = document.getElementById(paginationId);
  if (pag) {
    if (totalPages > 1) {
      pag.style.display = 'flex';
      const pageSpan = document.getElementById(pageLabelId);
      if (pageSpan) pageSpan.textContent = `Página ${page} de ${totalPages}`;
    } else {
      pag.style.display = 'none';
    }
  }
}

// ------------------- Cambio de página por contexto
function changePage(context, page) {
  if (context === 'search') {
    const source = searchResults;
    const totalPages = Math.max(1, Math.ceil((source && source.length) ? source.length / PAGE_SIZE : 1));
    if (page < 1 || page > totalPages) return;
    currentPageSearch = page;
    renderSearchPlantsPage(page);
  } else {
    const source = plants;
    const totalPages = Math.max(1, Math.ceil((source && source.length) ? source.length / PAGE_SIZE : 1));
    if (page < 1 || page > totalPages) return;
    currentPageAll = page;
    renderAllPlantsPage(page);
  }
  scrollToTop();
}

function scrollToTop() {
  try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { document.documentElement.scrollTop = 0; document.body.scrollTop = 0; }
}

// ------------------- Inicio de carga y enriquecimiento
function startBackgroundLoad() {
  if (plantsPromise) return plantsPromise;
  loadingPlants = true;

  // Loader en "Todas" (no tocamos búsqueda)
  showLoadingForContainer('plants-container', 'Cargando plantas...');

  plantsPromise = (async () => {
    try {
      const list = await fetchAllPlants(); // obtiene desde Perenual (mapeado) o Trefle o CSV
      if (!Array.isArray(list)) throw new Error('La fuente no devolvió un array de plantas.');

      const enriched = [];
      for (let i = 0; i < list.length; i++) {
        let plant = Object.assign({}, list[i]); // puede venir ya mapeado

        // 1) intentar enriquecer con Trefle si no es CSV (y si tenemos token)
        try {
          const tref = await enrichPlantWithTrefle(plant);
          if (tref) plant = mergePlantData(plant, tref, 'trefle');
        } catch (e) { if (DEBUG_SHOW_RAW) console.warn('Trefle enrich error', e); }

        // 2) Wikipedia si falta descripción/imagen
        const needDesc = !plant.description || String(plant.description).trim() === '';
        const needImg = !plant.image_url && !plant.image && !(plant.images && plant.images.length);
        if (needDesc || needImg) {
          try {
            const wiki = await enrichPlantWithWikipedia(plant);
            if (wiki) plant = mergePlantData(plant, wiki, 'wiki');
          } catch (e) { if (DEBUG_SHOW_RAW) console.warn('Wikipedia error', e); }
        }

        // normalizar images
        if (!plant.images || !Array.isArray(plant.images)) {
          const maybe = plant.image_url || plant.image;
          if (maybe) plant.images = [maybe];
        }

        enriched.push(plant);
        if (DEBUG_SHOW_RAW && (i % 50 === 0 || i === list.length - 1)) {
          console.log(`Progreso enrich: ${i+1}/${list.length}`);
        }
      }

      // DEDUPLICACIÓN mejorada
      const seen = new Set();
      const unique = [];
      const duplicatesList = [];

      function buildDedupKey(p) {
        const sci = (p.scientific_name || p.scientific || '').toString().toLowerCase().trim();
        const com = (p.common_name || p.common || '').toString().toLowerCase().trim();
        const img = (p.image_url || (p.images && p.images[0]) || '').toString().toLowerCase().trim();
        const desc = (p.description || p.extract || '').toString().toLowerCase().trim().slice(0, 120);
        return `${sci}||${com}||${img}||${desc}`;
      }

      for (const p of enriched) {
        const key = buildDedupKey(p);
        if (!key || key === '||||') {
          const fallback = JSON.stringify(p).slice(0, 100);
          if (seen.has(fallback)) { duplicatesList.push(fallback); continue; }
          seen.add(fallback);
          unique.push(p);
        } else {
          if (seen.has(key)) { duplicatesList.push(key); continue; }
          seen.add(key);
          unique.push(p);
        }
      }

      if (DEBUG_SHOW_RAW && duplicatesList.length > 0) {
        console.log(`Se han eliminado ${duplicatesList.length} duplicados (claves):`, duplicatesList.slice(0,50));
      }

      plants = unique;
      allPlantsLoaded = true;
      loadingPlants = false;

      // render "Todas" con la lista enriquecida
      renderAllPlantsPage(currentPageAll);

      // si había búsqueda pendiente, ejecutarla (renderizará solo la pestaña Buscar)
      if (pendingSearchQuery) {
        const q = pendingSearchQuery;
        pendingSearchQuery = null;
        performSearchAndRender(q, q);
      }

      return plants;
    } catch (err) {
      loadingPlants = false;
      allPlantsLoaded = false;
      showErrorForContainer('plants-container', 'Error al cargar las plantas. Intenta más tarde.');
      console.error('startBackgroundLoad error', err);
      throw err;
    }
  })();

  plantsPromise.catch(err => console.error('plantsPromise error', err));
  return plantsPromise;
}

// ------------------- fetchAllPlants: Perenual -> Trefle -> CSV
async function fetchAllPlants() {
  console.log("[DEBUG] Iniciando fetchAllPlants()...");
  const perenualUrl = `https://perenual.com/api/species-list?key=${encodeURIComponent(API_KEY_PERENUAL)}&page=1&per_page=100`;
  const trefleUrl = `https://trefle.io/api/v1/species?token=${TREFLE_TOKEN}&page=1&limit=100`;
  let plantsLocal = [];

  // 1) Intentar Perenual (primario)
  try {
    console.log("[DEBUG] Solicitando Perenual -> " + perenualUrl);
    const res = await fetch(perenualUrl);
    console.log("[DEBUG] Respuesta Perenual:", res.status);
    if (res.status === 429) {
      console.warn("[WARN] Límite de Perenual superado (429).");
      throw new Error("Rate limit Perenual");
    }
    if (!res.ok) throw new Error("Error HTTP " + res.status);
    const data = await res.json();
    if (data?.data?.length) {
      console.log(`[DEBUG] Perenual devolvió ${data.data.length} plantas.`);
      // normalizar cada item al esquema tipo-CSV
      plantsLocal = data.data.map(d => normalizeApiToCsvFields(d, 'perenual'));
      return plantsLocal;
    } else {
      console.warn("[WARN] Perenual no devolvió resultados válidos.");
      throw new Error("Sin datos Perenual");
    }
  } catch (err) {
    console.warn("[WARN] Falla en Perenual:", err.message);
    // seguir al fallback
  }

  // 2) Intentar Trefle (fallback remoto)
  try {
    console.log("[DEBUG] Intentando fallback a Trefle -> " + trefleUrl);
    const resT = await fetch(trefleUrl);
    console.log("[DEBUG] Respuesta Trefle:", resT.status);
    if (!resT.ok) throw new Error("Error HTTP Trefle " + resT.status);
    const dataT = await resT.json();
    if (dataT?.data?.length) {
      console.log(`[DEBUG] Trefle devolvió ${dataT.data.length} plantas.`);
      plantsLocal = dataT.data.map(d => normalizeApiToCsvFields(d, 'trefle'));
      return plantsLocal;
    } else {
      throw new Error("Sin datos Trefle");
    }
  } catch (errT) {
    console.error("[ERROR] Falló también Trefle:", errT.message);
    // seguir al fallback local
  }

  // 3) Intentar CSV local (data/plant_data.csv)
  try {
    console.log("[DEBUG] Intentando cargar CSV local -> data/plant_data.csv ...");
    const csvRes = await fetch("data/plant_data.csv");
    if (csvRes && csvRes.ok) {
      const text = await csvRes.text();
      const parsed = parseCSV(text, CSV_MAX_READ);
      if (Array.isArray(parsed) && parsed.length > 0) {
        plantsLocal = parsed;
        console.log(`[DEBUG] CSV local cargado con ${plantsLocal.length} plantas (máx ${CSV_MAX_READ}).`);
        return plantsLocal;
      } else {
        console.warn("[WARN] CSV local parseado pero sin filas válidas.");
      }
    } else {
      console.warn("[WARN] No se encontró data/plant_data.csv o no se pudo leer.");
    }
  } catch (csvErr) {
    console.error("[ERROR] Error al leer/parsear CSV local:", csvErr.message);
  }

  // Si llegamos aquí, no hay datos desde ninguna fuente
  if (plantsLocal.length === 0) {
    console.error("[ERROR] No se pudieron obtener plantas desde ninguna fuente.");
    const debugMsg = document.createElement("p");
    debugMsg.style.color = "red";
    debugMsg.textContent = "⚠️ No se encontraron plantas. Revisa el log para más detalles.";
    document.body.appendChild(debugMsg);
  }

  return plantsLocal;
}

// ------------------- parseCSV (robusta) - mapea a campos usados por la app
function parseCSV(csvText, maxRows = Infinity) {
  if (!csvText || !csvText.trim()) return [];

  let text = csvText.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/^\uFEFF/, '');
  const firstLine = text.split('\n', 1)[0] || '';
  let sep = ',';
  const semis = (firstLine.match(/;/g) || []).length;
  const comms = (firstLine.match(/,/g) || []).length;
  if (semis > comms && semis > 0) sep = ';';

  const parseLine = (line) => {
    const fields = [];
    let cur = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (line[i+1] === '"') { cur += '"'; i++; } else { inQuotes = false; }
        } else cur += ch;
      } else {
        if (ch === '"') inQuotes = true;
        else if (ch === sep) { fields.push(cur); cur = ''; }
        else cur += ch;
      }
    }
    fields.push(cur);
    return fields.map(f => f.trim());
  };

  const lines = text.split('\n').filter(l => l.trim() !== '');
  if (lines.length === 0) return [];

  const headerRow = parseLine(lines[0]);
  const headers = headerRow.map(h => h.replace(/^"|"$/g,'').trim().toLowerCase());

  const out = [];
  let csvCounter = 0;
  for (let i = 1; i < lines.length; i++) {
    if (csvCounter >= maxRows) break;
    const cols = parseLine(lines[i]);
    if (cols.every(c => c === '')) continue;
    const obj = {};
    for (let j = 0; j < headers.length; j++) {
      const key = headers[j] || `col${j}`;
      obj[key] = cols[j] !== undefined ? cols[j] : '';
    }

    // conv con corchetes a lista
    for (const k of Object.keys(obj)) {
      if (typeof obj[k] === 'string' && obj[k].trim().startsWith('[') && obj[k].trim().endsWith(']')) {
        const s = obj[k].trim();
        try {
          obj[k] = JSON.parse(s.replace(/'/g, '"'));
        } catch (e) {
          // fallback: separar por comas internas
          const inner = s.slice(1, -1);
          obj[k] = inner.split(',').map(x => x.replace(/^["']|["']$/g,'').trim()).filter(Boolean);
        }
      }
    }

    // mapear a campos de la app (flexible con nombres)
    const mapped = {};
    mapped.family = obj['family'] || '';
    mapped.genus = obj['genus'] || '';
    mapped.species = obj['species'] || '';
    mapped.scientific_name = obj['scientificname'] || obj['scientific_name'] || obj['scientific'] || ((mapped.genus || '') + ' ' + (mapped.species || '')).trim();
    mapped.common_name = obj['commonname'] || obj['common_name'] || obj['common'] || obj['common name'] || '';
    mapped.growth_rate = obj['growthrate'] || obj['growth_rate'] || obj['growth rate'] || '';
    mapped.hardiness_zones = obj['hardinesszones'] || obj['hardiness_zones'] || '';
    mapped.height = obj['height'] || '';
    mapped.width = obj['width'] || '';
    mapped.type = obj['type'] || '';
    mapped.foliage = obj['foliage'] || '';
    mapped.pollinators = Array.isArray(obj['pollinators']) ? obj['pollinators'] : (obj['pollinators'] ? [obj['pollinators']] : []);
    mapped.leaf = obj['leaf'] || '';
    mapped.flower = obj['flower'] || '';
    mapped.ripen = obj['ripen'] || '';
    mapped.reproduction = obj['reproduction'] || '';
    mapped.soils = Array.isArray(obj['soils']) ? obj['soils'] : (obj['soils'] || '');
    mapped.pH = obj['p_h'] || obj['ph'] || obj['pH'] || '';
    mapped.pH_split = obj['p_h_split'] || '';
    mapped.preferences = obj['preferences'] || '';
    mapped.tolerances = obj['tolerances'] || '';
    mapped.habitat = obj['habitat'] || '';
    mapped.habitat_range = obj['habitatrange'] || obj['habitat_range'] || '';
    mapped.edibility = obj['edibility'] || '';
    mapped.medicinal = obj['medicinal'] || obj['medicinal_uses'] || obj['usos'] || '';
    mapped.other_uses = obj['otheruses'] || obj['other_uses'] || '';
    mapped.pfaf = obj['pfaf'] || '';
    mapped.image_url = obj['image url'] || obj['image_url'] || obj['image'] || obj['imagen'] || '';
    mapped.images = mapped.image_url ? [mapped.image_url] : [];
    mapped.description = obj['description'] || '';

    if ((mapped.common_name && mapped.common_name.trim() !== '') || (mapped.scientific_name && mapped.scientific_name.trim() !== '')) {
      csvCounter++;
      mapped.csv_counter = csvCounter; // contador interno (NO mostrar)
      mapped.source = 'csv';
      out.push(mapped);
      if (csvCounter >= maxRows) break;
    }
  }

  return out;
}

// ------------------- mergePlantData: combina target con source cuando faltan campos en target
function mergePlantData(targetPlant, sourceData, sourceKey) {
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
}

// ------------------- Enricher: Trefle (busca por nombre y devuelve candidate mapeado)
async function enrichPlantWithTrefle(rawPlant) {
  if (!TREFLE_TOKEN || TREFLE_TOKEN === 'TU_TREFLE_TOKEN_AQUI') {
    if (DEBUG_SHOW_RAW) console.warn('Trefle token no configurado. Saltando Trefle.');
    return null;
  }
  const q = (rawPlant.scientific_name && rawPlant.scientific_name.trim()) || (rawPlant.common_name && rawPlant.common_name.trim());
  if (!q) return null;
  try {
    const limit = 3;
    const url = `${TREFLE_BASE}/api/v1/species/search?q=${encodeURIComponent(q)}&limit=${limit}&token=${encodeURIComponent(TREFLE_TOKEN)}`;
    if (DEBUG_SHOW_RAW) console.log('Trefle search:', url);
    const res = await fetch(url);
    if (!res.ok) {
      if (DEBUG_SHOW_RAW) console.warn('Trefle search returned', res.status, 'for', q);
      return null;
    }
    const json = await res.json();
    const hits = Array.isArray(json.data) ? json.data : (Array.isArray(json) ? json : []);
    if (!hits || hits.length === 0) return null;
    const cand = hits[0];
    const mapped = {};
    mapped.id = cand.id || cand._id || '';
    mapped.common_name = cand.common_name || (cand.common_names && cand.common_names[0]) || '';
    mapped.scientific_name = cand.scientific_name || '';
    mapped.image_url = cand.image_url || (cand.image && cand.image.url) || (cand.images && cand.images[0] && (cand.images[0].url || cand.images[0].image_url)) || '';
    mapped.images = cand.images && Array.isArray(cand.images) ? cand.images.map(i => i.url || i.image_url || i) : (mapped.image_url ? [mapped.image_url] : []);
    mapped.family = cand.family || cand.family_common_name || '';
    mapped.genus = cand.genus || '';
    mapped.year = cand.year || '';
    mapped.rank = cand.rank || '';
    mapped.distribution = cand.distribution || cand.distributions || '';
    mapped.growth = cand.growth || cand.growth_habit || '';
    mapped._raw = cand;
    if (DEBUG_SHOW_RAW) console.log('Trefle candidate for', q, mapped);
    return mapped;
  } catch (err) {
    if (DEBUG_SHOW_RAW) console.warn('Trefle fetch error for', q, err);
    return null;
  }
}

// ------------------- Enricher: Perenual (buscar detalles si hiciera falta)
async function enrichPlantWithPerenual(rawPlant) {
  const scientific = rawPlant.scientific_name || rawPlant.scientific || '';
  const common = rawPlant.common_name || rawPlant.common || '';
  const queries = [];
  if (scientific) queries.push(scientific);
  if (common && common !== scientific) queries.push(common);

  const attempts = [
    (q) => `${API_BASE_URL}?key=${encodeURIComponent(API_KEY_PERENUAL)}&q=${encodeURIComponent(q)}`,
    (q) => `${API_BASE_URL}?key=${encodeURIComponent(API_KEY_PERENUAL)}&page=1&per_page=5&search=${encodeURIComponent(q)}`,
    (q) => `${API_BASE_URL}?key=${encodeURIComponent(API_KEY_PERENUAL)}&page=1&per_page=5&query=${encodeURIComponent(q)}`,
    (q) => `${API_BASE_URL}/${encodeURIComponent(q)}?key=${encodeURIComponent(API_KEY_PERENUAL)}`
  ];

  for (const q of queries) {
    for (const makeUrl of attempts) {
      const url = makeUrl(q);
      try {
        const res = await fetch(url);
        if (!res.ok) continue;
        const json = await res.json();
        let candidate = null;
        if (Array.isArray(json)) candidate = json[0];
        else if (Array.isArray(json.data)) candidate = json.data[0];
        else if (Array.isArray(json.results)) candidate = json.results[0];
        else if (typeof json === 'object') {
          if (json.description || json.image || json.thumbnail || json.uses || json.habitat) candidate = json;
          else {
            for (const k of Object.keys(json)) {
              if (Array.isArray(json[k]) && json[k].length > 0) {
                candidate = json[k][0];
                break;
              }
            }
          }
        }
        if (!candidate) continue;
        const mapped = {};
        mapped.description = candidate.description || candidate.desc || candidate.summary || candidate.bio || '';
        mapped.image_url = candidate.image_url || candidate.image || candidate.thumbnail || candidate.picture || candidate.photo || '';
        mapped.images = candidate.images || (mapped.image_url ? [mapped.image_url] : []);
        mapped.medicinal_uses = candidate.medicinal_uses || candidate.uses || candidate.usos || '';
        mapped.growth_zone = candidate.growth_zone || candidate.habitat || candidate.climate || '';
        mapped._raw = candidate;
        if (DEBUG_SHOW_RAW) console.log('Perenual candidate:', mapped);
        return mapped;
      } catch (err) {
        if (DEBUG_SHOW_RAW) console.warn('Perenual fetch error for', url, err);
        continue;
      }
    }
  }
  return null;
}

// ------------------- Enricher: Wikipedia
async function enrichPlantWithWikipedia(rawPlant) {
  const plant = Object.assign({}, rawPlant);
  const scientific = plant.scientific_name || plant.scientific || '';
  const common = plant.common_name || plant.common || '';
  const queries = [];
  if (scientific) queries.push(scientific);
  if (common && common !== scientific) queries.push(common);
  for (const q of queries) {
    if (!q) continue;
    let wikiData = await fetchWikipediaData(q, 'es');
    if (!wikiData) wikiData = await fetchWikipediaData(q, 'en');
    if (wikiData) {
      const mapped = {
        description: wikiData.extract || '',
        image_url: wikiData.image || '',
        _raw: wikiData,
        title: wikiData.title || '',
        pageurl: wikiData.pageurl || '',
        lang: wikiData.lang || ''
      };
      return mapped;
    }
  }
  return null;
}
async function fetchWikipediaData(query, lang = 'es') {
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
    if (DEBUG_SHOW_RAW) console.warn('fetchWikipediaData error:', err);
    return null;
  }
}

// ------------------- Modal y navegación de imágenes (mostrar campos CSV/API completos)
function openPlantModal(plant) {
  selectedPlant = plant;
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
    infoRows += `<tr><td style="vertical-align:top; padding:6px 8px; font-weight:600; width:30%;">${escapeHtml(label)}</td><td style="padding:6px 8px;">${escapeHtml(String(val))}</td></tr>`;
  }

  // Mostrar la sección JSON solo si DEBUG_SHOW_RAW === true
  const jsonDetailsHtml = (typeof DEBUG_SHOW_RAW !== 'undefined' && DEBUG_SHOW_RAW)
    ? `<hr/>
       <details>
         <summary>Mostrar JSON completo (debug)</summary>
         <pre id="plant-json" style="max-height:300px; overflow:auto; white-space:pre-wrap;">${escapeHtml(JSON.stringify(sanitizeForDisplay(plant), null, 2))}</pre>
       </details>`
    : '';

  const modalContent = `
    <h4>${escapeHtml(plant.common_name || 'Nombre desconocido')}</h4>
    <h6><i>${escapeHtml(plant.scientific_name || 'Nombre científico no disponible')}</i></h6>
    <div style="position: relative; margin-bottom: 15px;">
      <img id="plant-modal-img" src="${escapeHtml(images[plant.currentImageIndex])}" style="width:100%; max-height:300px; object-fit:cover;" onerror="this.src='img/logo.png'">
      ${images.length > 1 ? `
        <i id="prev-img" class="material-icons" style="position:absolute; top:50%; left:0; cursor:pointer; color:white; font-size:36px;">chevron_left</i>
        <i id="next-img" class="material-icons" style="position:absolute; top:50%; right:0; cursor:pointer; color:white; font-size:36px;">chevron_right</i>
      ` : ''}
    </div>

    <p><b>Descripción:</b> ${escapeHtml(plant.description || plant.other_uses || 'No disponible')}</p>
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
      refreshPlantJsonInModal(plant);
    });
    next && next.addEventListener('click', (e) => {
      e.stopPropagation();
      plant.currentImageIndex = (plant.currentImageIndex + 1) % images.length;
      document.getElementById('plant-modal-img').src = images[plant.currentImageIndex];
      refreshPlantJsonInModal(plant);
    });
  }
}

function refreshPlantJsonInModal(plant) {
  const pre = document.getElementById('plant-json');
  if (pre) pre.textContent = JSON.stringify(sanitizeForDisplay(plant), null, 2);
}
function sanitizeForDisplay(obj) {
  try {
    const copy = Object.assign({}, obj);
    if (copy.csv_counter !== undefined) delete copy.csv_counter;
    if (copy._raw && typeof copy._raw === 'object' && copy._raw.csv_counter !== undefined) {
      const rawCopy = Object.assign({}, copy._raw);
      delete rawCopy.csv_counter;
      copy._raw = rawCopy;
    }
    return copy;
  } catch (e) {
    return obj;
  }
}

// ------------------- BÚSQUEDA (solo escribe en search-results-container, no toca 'plants')
async function searchPlant() {
  const rawQuery = document.getElementById('search-input').value;
  const query = rawQuery ? rawQuery.trim().toLowerCase() : '';

  // Si campo vacío -> limpiar búsqueda (sin tocar 'Todas')
  if (!query) {
    searchResults = [];
    currentPageSearch = 1;
    renderSearchPlantsPage(currentPageSearch);
    return;
  }

  // Si plants aún no cargadas -> spinner en search container y guardar pending
  if (!allPlantsLoaded) {
    showLoadingForContainer('search-results-container', `Buscando "${escapeHtml(rawQuery)}" — esperando datos...`);
    pendingSearchQuery = query;
    if (!plantsPromise) startBackgroundLoad();
    return;
  }

  // Filtrar localmente sin tocar plants
  performSearchAndRender(query, rawQuery);
}

function performSearchAndRender(normalizedQuery, rawQuery) {
  const q = (normalizedQuery || '').toString().toLowerCase();
  if (!q) {
    searchResults = [];
    renderSearchPlantsPage(1);
    return;
  }

  const results = plants.filter(p => {
    const common = (p.common_name || p.common || '').toString().toLowerCase();
    const scientific = (p.scientific_name || p.scientific || '').toString().toLowerCase();
    const trefleTitle = (p.trefle && (p.trefle.common_name || p.trefle.scientific_name) || '').toString().toLowerCase();
    const perenTitle = (p.perenual && (p.perenual.common_name || p.perenual.scientific_name || p.perenual.title) || '').toString().toLowerCase();
    const family = (p.family || '').toString().toLowerCase();
    const species = (p.species || '').toString().toLowerCase();
    return (
      (common && common.includes(q)) ||
      (scientific && scientific.includes(q)) ||
      (trefleTitle && trefleTitle.includes(q)) ||
      (perenTitle && perenTitle.includes(q)) ||
      (family && family.includes(q)) ||
      (species && species.includes(q))
    );
  });

  if (!results || results.length === 0) {
    const container = document.getElementById('search-results-container');
    if (container) container.innerHTML = `<p class="grey-text center-align" style="padding:20px">No se encontraron resultados para "${escapeHtml(rawQuery)}"</p>`;
    searchResults = [];
    currentPageSearch = 1;
    const pag = document.getElementById('pagination-search');
    if (pag) pag.style.display = 'none';
    return;
  }

  searchResults = results;
  currentPageSearch = 1;
  renderSearchPlantsPage(currentPageSearch);
}

// ------------------- Helpers finales
function truncateText(text, maxLength) {
  if (!text) return '';
  text = String(text);
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + '...';
}
function escapeHtml(str) {
  if (str === undefined || str === null) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}
