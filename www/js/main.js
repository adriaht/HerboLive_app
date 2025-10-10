(function(HL){
HL.main = HL.main || {};


function setupUIListeners() {
const searchBtn = document.getElementById('search-btn');
const searchInput = document.getElementById('search-input');
if (searchBtn) searchBtn.addEventListener('click', () => HL.search.searchPlant());
if (searchInput) searchInput.addEventListener('keyup', (e) => { if (e.key === 'Enter') HL.search.searchPlant(); });


// paginadores "Todas"
const prevAll = document.getElementById('prev-page-all');
const nextAll = document.getElementById('next-page-all');
if (prevAll) prevAll.addEventListener('click', () => HL.render.changePage('all', HL.state.currentPageAll - 1));
if (nextAll) nextAll.addEventListener('click', () => HL.render.changePage('all', HL.state.currentPageAll + 1));


// paginadores "Buscar"
const prevSearch = document.getElementById('prev-page-search');
const nextSearch = document.getElementById('next-page-search');
if (prevSearch) prevSearch.addEventListener('click', () => HL.render.changePage('search', HL.state.currentPageSearch - 1));
if (nextSearch) nextSearch.addEventListener('click', () => HL.render.changePage('search', HL.state.currentPageSearch + 1));
}


document.addEventListener('DOMContentLoaded', () => {
// debug UI
HL.debug && HL.debug.initDebugUI && HL.debug.initDebugUI();


const tabs = document.querySelectorAll('.tabs');
if (window.M && tabs) M.Tabs.init(tabs);
if (window.M) M.Modal.init(document.querySelectorAll('.modal'));


// setup listeners local (if not already)
setupUIListeners();


// Disable autocomplete on search input
const searchInput = document.getElementById('search-input');
if (searchInput) {
searchInput.setAttribute('autocomplete', 'off');
searchInput.setAttribute('autocorrect', 'off');
searchInput.setAttribute('autocapitalize', 'off');
searchInput.setAttribute('spellcheck', 'false');
}


// start loading plants in background
HL.loader && HL.loader.startBackgroundLoad && HL.loader.startBackgroundLoad();
});


// expose for console if needed
HL.main.setupUIListeners = setupUIListeners;
})(window.HerboLive);