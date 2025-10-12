// js/config.js
// Configuración y estado global compartido por los módulos
// Adaptado para backend en HTTPS: https://ahernandeztorredemer.ieti.site
window.HerboLive = window.HerboLive || {};

(function(HL){
  // Valores principales de configuración de la app
  HL.config = {
    // Depuración: true para mostrar logs adicionales en consola
    DEBUG_SHOW_RAW: false,

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
    USE_BACKEND: true,

    // ---------------------------
    // CONFIGURACIÓN DEL BACKEND
    // ---------------------------
    // Como vas a usar HTTPS con tu dominio en Proxmox, ponemos la URL completa.
    // Al incluir el esquema (https://) la función getBackendBase() utilizará exactamente esta URL.
    //
    // Si en algún momento sirves sólo por IP o puerto distinto, cambia aquí.
    backendHost: "https://ahernandeztorredemer.ieti.site",
    // backendPort: si usas 443 con HTTPS, puedes dejar 443 u omitirlo (la función resolverá por esquema)
    backendPort: 443,
    // Forzar esquema https cuando sólo passes host + puerto (opcional)
    backendUseHttps: true
  };

  // Estado de la aplicación
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
