// js/config.js
// Configuración y estado global compartido por los módulos
window.HerboLive = window.HerboLive || {};

(function(HL){
  // Valores principales de configuración de la app
  HL.config = {
    // Depuración: true para mostrar logs adicionales
    DEBUG_SHOW_RAW: false,

    // BACKEND público (usa https para producción)
    BACKEND_URL: "https://ahernandeztorredemer.ieti.site", // <--- usa HTTPS

    // Ruta base para llamadas a APIs (se usará como BACKEND_URL + '/api')
    API_BASE: "/api",

    // Trefle API (si usas Trefle)
    TREFLE_TOKEN: "usr-ijZevpsl8nyZp0aOPf46CnKpLwSvtvgg1yeCo4QTPU0",
    TREFLE_BASE: "https://trefle.io",

    // Perenual API (si usas Perenual)
    API_KEY_PERENUAL: "sk-mFfk68e59df7d26cd12759",
    API_BASE_URL: "https://perenual.com/api/species-list",

    // Paginación / límites
    PAGE_SIZE: 12,
    CSV_MAX_READ: 52,

    // MODO DE BÚSQUEDA: true = DB-first; false = API-first
    useDbFirst: true,

    // Compatibilidad (mayúsculas)
    USE_DB_FIRST: true,
    USE_BACKEND: true
  };

  HL.state = {
    plants: [],
    searchResults: [],
    selectedPlant: null,
    plantsPromise: null,
    allPlantsLoaded: false,
    loadingPlants: false,
    currentPageAll: 1,
    currentPageSearch: 1,
    pendingSearchQuery: null
  };
})(window.HerboLive);
