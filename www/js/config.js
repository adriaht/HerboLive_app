// js/config.js
// Configuración y estado global compartido por los módulos
window.HerboLive = window.HerboLive || {};

(function(HL){
  // Valores principales de configuración de la app
  HL.config = {
    // Depuración: true para mostrar logs adicionales
    DEBUG_SHOW_RAW: false,

    // BACKEND / API propio (backend Node + nginx reverse-proxy)
    // Usar la URL pública donde esté alojado el frontend/backend.
    // IMPORTANTE: usa HTTPS si la app se ejecuta en Android >= 9 (cleartext restrictions).
    BACKEND_BASE: "https://ahernandeztorredemer.ieti.site",

    // URLs de la API externa (si las usas)
    TREFLE_TOKEN: "usr-ijZevpsl8nyZp0aOPf46CnKpLwSvtvgg1yeCo4QTPU0",
    TREFLE_BASE: "https://trefle.io",

    API_KEY_PERENUAL: "sk-mFfk68e59df7d26cd12759",
    API_BASE_URL: "https://perenual.com/api/species-list",

    // Paginación / límites
    PAGE_SIZE: 12,
    CSV_MAX_READ: 52,

    // --- MODO DE BÚSQUEDA ---
    // true = primero intenta el backend propio (/api/plants),
    // false = intenta Trefle/Perenual primero.
    useDbFirst: true,

    // Compatibilidad (mayúsculas para módulos antiguos)
    USE_DB_FIRST: true,
    USE_BACKEND: true,

    // ENDPOINTS (derivados, no los cambies a menos que tengas que)
    // Nota: el frontend usa fetch('/api/plants') en código; si sirves
    // la app desde el mismo dominio que el backend (nginx) la ruta relativa funciona.
    // Si sirves el front desde otro dominio, la app llamará a BACKEND_BASE + '/api/plants'
    apiPlantsPath: '/api/plants',
    backendBaseUrl: "https://ahernandeztorredemer.ieti.site"
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

  // Helper para construir URLs de backend (usa BACKEND_BASE si es absoluto)
  HL.config.buildBackendUrl = function(path) {
    if (!path) return HL.config.backendBaseUrl;
    if (path.startsWith('http://') || path.startsWith('https://')) return path;
    const base = HL.config.backendBaseUrl.replace(/\/+$/, '');
    return base + (path.startsWith('/') ? path : ('/' + path));
  };

})(window.HerboLive);
