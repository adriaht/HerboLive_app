/* Cambios realizados:
 - PAGE_SIZE cambiado a 6 (según tu petición).
 - Añadidos parámetros de prefetch: INITIAL_PAGES, PREFETCH_ENABLED, PREFETCH_CONCURRENCY,
   ENRICH_CONCURRENCY, PREFETCH_PAGES_AHEAD, PREFETCH_PAGES_BEHIND, MAX_PREFETCH_PAGES_WINDOW.
 - PAUSE_PREFETCH_ON_SEARCH: pausa prefetch si el usuario está en la pestaña de búsqueda.
 - Tokens sensibles (TREFLE, PERENUAL) **eliminados** del frontend: se deben mantener en .env.
*/

window.HerboLive = window.HerboLive || {};

(function(HL){
  HL.config = {
    DEBUG_SHOW_RAW: false, // cambiar aquí para depuración

    // Tokens sensibles borrados del frontend por seguridad.
    // TREFLE_TOKEN: "<REMOVED>",
    // API_KEY_PERENUAL: "<REMOVED>",

    TREFLE_BASE: "https://trefle.io",
    API_BASE_URL: "https://perenual.com/api/species-list",

    // Si tu app está servida en un subdirectorio (p.ej. /herboLive) y quieres forzarlo:
    // BACKEND_URL: '/herboLive', // descomentar si la app está en /herboLive
    // API_BASE: '/api', // normalmente no hace falta tocar

    // Pagination / prefetch config (nuevos)
    PAGE_SIZE: 6,               // ahora 6 por página
    INITIAL_PAGES: 5,           // cargar 5 páginas iniciales (6 * 5 = 30)
    PREFETCH_ENABLED: true,     // flag para activar/desactivar la nueva lógica
    PREFETCH_CONCURRENCY: 2,    // peticiones de páginas concurrentes
    ENRICH_CONCURRENCY: 3,      // concurrencia para enriquecimiento de items
    PREFETCH_PAGES_AHEAD: 5,    // cuantas páginas hacia delante prefetch
    PREFETCH_PAGES_BEHIND: 5,   // cuantas páginas hacia atrás prefetch
    MAX_PREFETCH_PAGES_WINDOW: 10, // máximo de páginas cacheadas alrededor de la actual
    PAUSE_PREFETCH_ON_SEARCH: true, // pausa prefetch si el usuario está en la pestaña Buscar

    CSV_MAX_READ: 52
  };

  HL.state = {
    // pages cache: map pageNumber -> [items]
    pages: {},

    // "Todas" (estado por compatibilidad, no contendrá todo cuando use server paging)
    plants: [],

    // "Buscar"
    searchResults: [],

    // other
    selectedPlant: null,
    plantsPromise: null,
    allPlantsLoaded: false,
    loadingPlants: false,
    currentPageAll: 1,
    currentPageSearch: 1,
    pendingSearchQuery: null,

    // helper state for prefetch/paging
    loadedPages: new Set(),      // páginas que ya están cargadas
    enrichingPages: new Set(),   // páginas actualmente en proceso de enriquecimiento
    prefetchingPages: new Set(), // páginas actualmente en prefetch
  };
})(window.HerboLive);
