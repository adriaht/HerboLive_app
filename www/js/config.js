// js/config.js
// Configuración y estado global compartido por los módulos
window.HerboLive = window.HerboLive || {};

(function(HL){
  HL.config = {
    DEBUG_SHOW_RAW: false, // cambiar aquí para depuración
    TREFLE_TOKEN: "usr-ijZevpsl8nyZp0aOPf46CnKpLwSvtvgg1yeCo4QTPU0",
    TREFLE_BASE: "https://trefle.io",
    API_KEY_PERENUAL: "sk-mFfk68e59df7d26cd12759",
    API_BASE_URL: "https://perenual.com/api/species-list",
    PAGE_SIZE: 12,
    CSV_MAX_READ: 52
  };

  HL.state = {
    // "Todas"
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
    pendingSearchQuery: null
  };
})(window.HerboLive);

