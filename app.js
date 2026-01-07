/**
 * @class AetherAtlas
 * @description Core class for managing the Aether Guild application.
 * Handles map logic, user authentication, data management, and view switching.
 */
class AetherAtlas {
    constructor(firebaseConfig) {
        // Core Components
        this.map = null;
        this.auth = null;
        this.db = null;
        this.user = null;
        
        // UI / State
        this.markers = {};
        this.currentView = 'atlas';
        this.debounceTimer = null;

        // Modules
        this.authUI = new AuthUI();
        this.wiki = new Aetherpedia();

        // Constants
        this.TILE_LAYERS = {
            dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        };
        this.TILE_LAYER_ATTRIBUTIONS = {
            dark: '&copy; OpenStreetMap &copy; CARTO',
            satellite: 'Tiles &copy; Esri',
        };
        
        this.initFirebase(firebaseConfig);
        this.attachEventListeners();
        this.listenForAuthStateChanges();
        
        // Defer map initialization until the DOM is fully loaded and painted
        window.onload = () => {
            this.initMapView();
            feather.replace(); // Initialize icons after everything is loaded
        };
    }

    // --- INITIALIZATION ---

    initFirebase(config) {
        if (!firebase.apps.length) {
            firebase.initializeApp(config);
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        this.wiki.db = this.db;
    }

    initMapView() {
        if (this.map) return;
        this.map = L.map('map-container', { worldCopyJump: true, zoomControl: false }).setView([20, 0], 2);
        L.control.zoom({ position: 'bottomright' }).addTo(this.map);
        this.setTileLayer('dark');
        L.terminator().addTo(this.map);
        this.map.on('click', (e) => this.onMapClick(e));

        // Load initial data now that the map is ready
        if (this.user) {
            this.loadReportsFromFirestore();
        }
    }

    attachEventListeners() {
        document.getElementById('view-switch-atlas').addEventListener('click', () => this.switchView('atlas'));
        document.getElementById('view-switch-wiki').addEventListener('click', () => this.switchView('wiki'));
        document.getElementById('theme-switcher').addEventListener('click', () => document.body.classList.toggle('light-theme'));
        
        const searchInput = document.getElementById('search-input');
        searchInput.addEventListener('input', () => this.handleLiveSearch());
        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const articleId = e.target.value.replace(/ /g, '_');
                this.switchView('wiki');
                this.wiki.loadArticle(articleId);
                this.hideSearchResults();
            }
        });
        
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) this.hideSearchResults();
            const importBtn = e.target.closest('.import-button');
            if (importBtn) this.wiki.importArticle(importBtn.dataset.title, importBtn);
            const pageImportBtn = e.target.closest('.import-button-page');
            if (pageImportBtn) this.wiki.importArticle(pageImportBtn.dataset.title, pageImportBtn);
            const articleLink = e.target.closest('.aetherpedia-link');
            if (articleLink) {
                e.preventDefault();
                this.switchView('wiki');
                this.wiki.loadArticle(articleLink.dataset.id);
                this.hideSearchResults();
            }
        });
    }

    // --- VIEW MANAGEMENT ---

    switchView(viewName) {
        this.currentView = viewName;
        const atlasContainer = document.getElementById('map-container');
        const wikiContainer = document.getElementById('wiki-container');
        const atlasBtn = document.getElementById('view-switch-atlas');
        const wikiBtn = document.getElementById('view-switch-wiki');

        atlasBtn.classList.toggle('btn-primary', viewName === 'atlas');
        atlasBtn.classList.toggle('btn-secondary', viewName !== 'atlas');
        wikiBtn.classList.toggle('btn-primary', viewName === 'wiki');
        wikiBtn.classList.toggle('btn-secondary', viewName !== 'wiki');
        
        atlasContainer.classList.toggle('hidden', viewName !== 'atlas');
        wikiContainer.classList.toggle('hidden', viewName === 'atlas');

        if (viewName === 'atlas') {
            // Use a short timeout to ensure the container is visible and sized before invalidating
            setTimeout(() => this.map.invalidateSize(), 100);
        } else {
            if (!document.getElementById('wiki-content').hasChildNodes()) {
                this.wiki.loadArticle();
            }
        }
    }
    
    // --- AUTHENTICATION ---
    
    listenForAuthStateChanges() {
        this.auth.onAuthStateChanged(user => {
            this.user = user;
            this.updateAuthUI(!!user);
            if (user) {
                if (this.map) this.loadReportsFromFirestore(); // Load reports if map is already initialized
                this.authUI.hide();
            } else {
                this.clearMarkers();
            }
        });
    }

    updateAuthUI(isLoggedIn) {
        // ... (The rest of the app.js code remains the same)
        // This is a placeholder as the rest of the logic is correct.
    }
    
    // ... (All other methods: handleLiveSearch, renderSearchResults, addReportToMap, etc.)
}

// Main initialization logic is now inside the constructor's window.onload
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AetherAtlas(firebaseConfig);
});
