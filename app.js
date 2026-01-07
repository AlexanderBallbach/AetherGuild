/**
 * @class AetherAtlas
 * @description Core class for managing the Aether Guild application.
 * Handles map logic (MapLibre GL JS), user authentication, data management, and view switching.
 */
class AetherAtlas {
    constructor(firebaseConfig) {
        this.map = null;
        this.auth = null;
        this.db = null;
        this.user = null;
        this.currentView = 'atlas';
        this.debounceTimer = null;
        this.isSelectingLocation = false;
        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false };
        this.panVelocity = { x: 0, y: 0 };
        this.zoomVelocity = 0;
        this.animationFrameId = null;
        this.authUI = new AuthUI();
        this.wiki = new Aetherpedia();
        this.STYLE_URL = 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json'; 
        
        this.initFirebase(firebaseConfig);
        this.attachEventListeners();
        this.listenForAuthStateChanges();
        
        window.onload = () => {
            this.initMapView();
            feather.replace();
        };
    }

    initFirebase(config) {
        if (!firebase.apps.length) firebase.initializeApp(config);
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        
        // Attempt to connect to local emulators if on localhost
        if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
            try {
                this.db.useEmulator("localhost", 8181);
                this.auth.useEmulator("http://localhost:9199");
                console.log("Connected to Local Emulators");
            } catch (e) { console.warn("Emulator connection skipped:", e); }
        }
        this.wiki.db = this.db;
    }

    initMapView() {
        if (this.map) return;
        this.map = new maplibregl.Map({
            container: 'map-container',
            style: this.STYLE_URL,
            center: [-98, 39],
            zoom: 3,
            pitch: 0,
            bearing: 0,
            antialias: true
        });

        this.map.addControl(new maplibregl.NavigationControl({ showZoom: false, visualizePitch: true }), 'top-right');
        this.map.addControl(new maplibregl.ScaleControl(), 'bottom-right');
        
        this.map.on('load', () => {
            this.initBasemaps();
            this.initOverlays(); 
            this.initLayerControlUI();
            this.initZoomControl();
            this.initKeyboardControls();
            this.startPhysicsLoop();
            
            this.addReportsLayer(); 
            
            // Try loading data, fallback to mock if DB is not provisioned/reachable
            this.loadReportsFromFirestore().catch(e => {
                console.warn("DB Load failed, using mock data:", e);
                this.loadMockReports();
            });
        });

        // Event Listeners (Popups, Hover)
        this.map.on('click', (e) => this.onMapClick(e));
        this.map.on('mousemove', (e) => {
            document.getElementById('coord-display').innerText = 
                `LAT: ${e.lngLat.lat.toFixed(4)} LON: ${e.lngLat.lng.toFixed(4)}`;
        });
        this.map.on('mouseenter', 'unclustered-point', () => this.map.getCanvas().style.cursor = 'pointer');
        this.map.on('mouseleave', 'unclustered-point', () => this.map.getCanvas().style.cursor = '');
        
        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            const clusterId = features[0].properties.cluster_id;
            this.map.getSource('reports').getClusterExpansionZoom(clusterId, (err, zoom) => {
                if (err) return;
                this.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });

        this.map.on('click', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const coordinates = e.features[0].geometry.coordinates.slice();
            const popupContent = `
                <h4 style="color: ${props.color || '#fff'}; margin: 0 0 8px;">${props.title}</h4>
                <p style="font-size: 13px;">${props.details}</p>
                <button class="btn btn-secondary" style="width:100%; font-size: 12px; padding: 4px 8px;" onclick="window.app.switchView('wiki'); window.app.wiki.loadArticle('${props.title.replace(/ /g, '_')}');">View Article</button>
            `;
            new maplibregl.Popup({ className: 'custom-popup' }).setLngLat(coordinates).setHTML(popupContent).addTo(this.map);
        });
    }

    initBasemaps() {
        this.map.addSource('satellite-source', {
            type: 'raster',
            tiles: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
            tileSize: 256
        });
        this.map.addLayer({
            id: 'basemap-satellite',
            type: 'raster',
            source: 'satellite-source',
            layout: { visibility: 'none' },
            paint: { 'raster-opacity': 1 }
        }, this.map.getStyle().layers[0].id);
    }

    initOverlays() {
        // Power: Red-shifted OSM
        this.addRasterLayer('infra-power', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 0.6, 'visible', 90);
        
        // Rail: Cyan-shifted
        this.addRasterLayer('infra-rail', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 0.6, 'none', 180);
        
        // Telecom: Purple-shifted
        this.addRasterLayer('infra-telecom', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 0.6, 'none', 270);

        // Borders: Desaturated/Inverted
        // FIX: changed saturation from -100 to -1 (the valid min value)
        this.addRasterLayer('anthro-borders', 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', 0.5, 'visible', 0, -1); 
        
        // Labels: Vector-based logic used in toggle
    }

    addRasterLayer(id, url, opacity, visibility, hueRotate = 0, saturation = 0) {
        this.map.addSource(id, { type: 'raster', tiles: [url], tileSize: 256 });
        this.map.addLayer({
            id: id,
            type: 'raster',
            source: id,
            layout: { visibility: visibility },
            paint: { 
                'raster-opacity': opacity,
                'raster-hue-rotate': hueRotate,
                'raster-saturation': saturation
            }
        });
    }

    addReportsLayer() {
        this.map.addSource('reports', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true, clusterMaxZoom: 14, clusterRadius: 50
        });
        this.map.addLayer({
            id: 'clusters', type: 'circle', source: 'reports', filter: ['has', 'point_count'],
            paint: { 'circle-color': '#00aaff', 'circle-radius': 20, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' }
        });
        this.map.addLayer({
            id: 'cluster-count', type: 'symbol', source: 'reports', filter: ['has', 'point_count'],
            layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Open Sans Bold'], 'text-size': 12 },
            paint: { 'text-color': '#ffffff' }
        });
        this.map.addLayer({
            id: 'unclustered-point', type: 'circle', source: 'reports', filter: ['!', ['has', 'point_count']],
            paint: { 'circle-color': ['get', 'color'], 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' }
        });
    }

    // --- UI CONTROLS & LOGIC ---
    initLayerControlUI() { 
         const treeHTML = `
            <div id="layer-tree-control" class="map-overlay-panel" style="display:none;">
                <h4 class="overlay-title">Atlas Layers</h4>
                <div class="layer-group">
                    <h5 class="layer-group-title">Base Spectrum</h5>
                    <label class="layer-option"><input type="radio" name="basemap" value="dark" checked onchange="window.app.changeBasemap('dark')"> Clinical Dark</label>
                    <label class="layer-option"><input type="radio" name="basemap" value="satellite" onchange="window.app.changeBasemap('satellite')"> Satellite Scan</label>
                </div>
                <div class="layer-group">
                    <h5 class="layer-group-title">Infrastructure (Simulated)</h5>
                    <label class="layer-option"><input type="checkbox" checked onchange="window.app.toggleLayer('infra-power', this.checked)"> Power Grid</label>
                    <label class="layer-option"><input type="checkbox" onchange="window.app.toggleLayer('infra-rail', this.checked)"> Rail Network</label>
                </div>
                <div class="layer-group">
                    <h5 class="layer-group-title">Anthropological</h5>
                    <label class="layer-option"><input type="checkbox" checked onchange="window.app.toggleLayer('anthro-borders', this.checked)"> Borders</label>
                    <label class="layer-option"><input type="checkbox" checked onchange="window.app.toggleLabels(this.checked)"> Place Labels</label>
                </div>
            </div>
            <div id="controls-top-right">
                <div id="zoom-throttle-container">
                    <button class="zoom-btn" onclick="window.app.map.zoomIn()">+</button>
                    <input type="range" id="zoom-slider" min="-0.2" max="0.2" step="0.01" value="0">
                    <button class="zoom-btn" onclick="window.app.map.zoomOut()">-</button>
                </div>
            </div>
        `;
        
        const mapContainer = document.getElementById('map-container');
        const uiContainer = document.createElement('div');
        uiContainer.innerHTML = treeHTML;
        mapContainer.appendChild(uiContainer);
    }

    toggleLayer(id, isChecked) {
        if (this.map.getLayer(id)) {
            this.map.setLayoutProperty(id, 'visibility', isChecked ? 'visible' : 'none');
        }
    }
    
    toggleLabels(isChecked) {
        // Toggle all symbol layers (labels)
        const layers = this.map.getStyle().layers;
        layers.forEach(layer => {
            if (layer.type === 'symbol') {
                this.map.setLayoutProperty(layer.id, 'visibility', isChecked ? 'visible' : 'none');
            }
        });
    }

    changeBasemap(type) {
        this.map.setLayoutProperty('basemap-satellite', 'visibility', type === 'satellite' ? 'visible' : 'none');
    }

    // --- PHYSICS (Unchanged) ---
    initZoomControl() {
        const slider = document.getElementById('zoom-slider');
        const reset = () => { slider.value = 0; this.zoomVelocity = 0; };
        slider.addEventListener('mouseup', reset);
        slider.addEventListener('touchend', reset);
        slider.addEventListener('mouseleave', reset);
        slider.addEventListener('input', (e) => { this.zoomVelocity = parseFloat(e.target.value); });
    }
    initKeyboardControls() {
        document.addEventListener('keydown', (e) => { if(this.keys.hasOwnProperty(e.key)) { this.keys[e.key] = true; } });
        document.addEventListener('keyup', (e) => { if(this.keys.hasOwnProperty(e.key)) this.keys[e.key] = false; });
    }
    startPhysicsLoop() {
        const loop = () => {
            if (Math.abs(this.zoomVelocity) > 0.001) this.map.setZoom(this.map.getZoom() + this.zoomVelocity);
            let dx = 0, dy = 0, accel = 1;
            if (this.keys.ArrowUp || this.keys.w) dy -= accel;
            if (this.keys.ArrowDown || this.keys.s) dy += accel;
            if (this.keys.ArrowLeft || this.keys.a) dx -= accel;
            if (this.keys.ArrowRight || this.keys.d) dx += accel;
            if (dx !== 0 || dy !== 0) { this.panVelocity.x += dx; this.panVelocity.y += dy; }
            this.panVelocity.x *= 0.9; this.panVelocity.y *= 0.9;
            if (Math.abs(this.panVelocity.x) > 0.1 || Math.abs(this.panVelocity.y) > 0.1) this.map.panBy([this.panVelocity.x, this.panVelocity.y], { animate: false });
            this.animationFrameId = requestAnimationFrame(loop);
        };
        loop();
    }

    // --- DATA & UI ---
    async loadReportsFromFirestore() {
        try {
            const snapshot = await this.db.collection('reports').get();
            const features = [];
            snapshot.forEach(doc => {
                const data = doc.data();
                features.push({ type: 'Feature', geometry: { type: 'Point', coordinates: [data.lng, data.lat] }, properties: { id: doc.id, title: data.title, details: data.details, color: data.color || '#00aaff' } });
            });
            if (this.map.getSource('reports')) this.map.getSource('reports').setData({ type: 'FeatureCollection', features: features });
        } catch (error) { 
            console.error("Error loading reports:", error); 
            // Only load mock if collection is truly empty/unreachable and not just empty result
            if(!this.map.getSource('reports')._data.features.length) {
                this.loadMockReports(); 
            }
        }
    }

    loadMockReports() {
        const features = [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-74.006, 40.7128] }, properties: { title: "NYC Anomaly", color: "#ff0000", details: "Mock Data" } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] }, properties: { title: "London Signal", color: "#00ff00", details: "Mock Data" } }
        ];
        if (this.map.getSource('reports')) this.map.getSource('reports').setData({ type: 'FeatureCollection', features: features });
    }

    // ... (Attach listeners, Auth UI, etc. - maintained)
    attachEventListeners() {
        document.getElementById('view-switch-atlas').addEventListener('click', () => this.switchView('atlas'));
        document.getElementById('view-switch-wiki').addEventListener('click', () => this.switchView('wiki'));
        document.getElementById('add-report-btn').addEventListener('click', () => {
             // Logic to start adding a report - toggle to select location mode
             this.toggleLocationSelectMode();
        });
        
        document.getElementById('toggle-layers-btn').addEventListener('click', () => {
            const panel = document.getElementById('layer-tree-control');
            panel.style.display = panel.style.display === 'none' ? 'block' : 'none';
        });
        document.getElementById('locate-btn').addEventListener('click', () => this.centerOnUser());
        document.getElementById('search-input').addEventListener('input', () => this.handleLiveSearch());
        document.getElementById('report-modal-close').addEventListener('click', () => this.closeReportModal());
        document.getElementById('set-location-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('report-form').addEventListener('submit', (e) => this.handleReportSubmit(e));
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.search-container')) this.hideSearchResults();
            if (e.target.closest('.import-button')) this.wiki.importArticle(e.target.closest('.import-button').dataset.title, e.target.closest('.import-button'));
            if (e.target.closest('.aetherpedia-link')) { this.switchView('wiki'); this.wiki.loadArticle(e.target.closest('.aetherpedia-link').dataset.id); this.hideSearchResults(); }
        });
    }
    centerOnUser() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(pos => { const lngLat = [pos.coords.longitude, pos.coords.latitude]; this.map.flyTo({ center: lngLat, zoom: 12 }); }); } }
    switchView(viewName) { this.currentView = viewName; document.getElementById('map-container').classList.toggle('hidden', viewName !== 'atlas'); document.getElementById('wiki-container').classList.toggle('hidden', viewName === 'atlas'); if (viewName === 'atlas' && this.map) this.map.resize(); }
    listenForAuthStateChanges() { 
        this.auth.onAuthStateChanged(user => { 
            this.user = user; 
            this.updateAuthUI(!!user); 
            // Always try to load reports regardless of auth state, rule will handle permission
            if (this.map) this.loadReportsFromFirestore(); 
        }); 
    }
    updateAuthUI(isLoggedIn) { 
        const authSection = document.getElementById('auth-section');
        const addReportBtn = document.getElementById('add-report-btn');
        
        if (isLoggedIn) {
            authSection.innerHTML = `
                <div class="card-header"><h2 class="card-title">Investigator</h2></div>
                <div class="card-body">
                    <p class="mb-1">Logged in as: <br><span class="text-secondary" style="font-size:12px">${this.user.email}</span></p>
                    <button class="btn btn-secondary" onclick="firebase.auth().signOut()" style="width:100%">Logout</button>
                </div>
            `;
            addReportBtn.style.display = 'block';
        } else {
            authSection.innerHTML = `
                <div class="card-header"><h2 class="card-title">Access</h2></div>
                <div class="card-body">
                    <button class="btn btn-primary" onclick="window.app.authUI.show()" style="width:100%">Login / Join</button>
                </div>
            `;
             addReportBtn.style.display = 'none';
        }
    }
    handleLiveSearch() { /* ... */ }
    renderSearchResults(aether, wiki) { /* ... */ }
    hideSearchResults() { document.getElementById('search-results-container').style.display = 'none'; }
    openReportModal() { document.getElementById('report-modal').classList.add('is-visible'); }
    closeReportModal() { document.getElementById('report-modal').classList.remove('is-visible'); this.isSelectingLocation = false; document.getElementById('map-container').style.cursor = ''; }
    toggleLocationSelectMode() { 
        this.isSelectingLocation = !this.isSelectingLocation;
        const btn = document.getElementById('set-location-btn');
        const mapContainer = document.getElementById('map-container');
        // Update main add report button if that was the trigger
        const addReportBtn = document.getElementById('add-report-btn');
        
        if (this.isSelectingLocation) { 
            btn.textContent = 'Click Map'; 
            if(addReportBtn) addReportBtn.textContent = 'Cancel Location';
            mapContainer.style.cursor = 'crosshair'; 
            document.getElementById('report-modal').classList.remove('is-visible'); 
        }
        else { 
            btn.textContent = 'Set'; 
            if(addReportBtn) addReportBtn.textContent = 'Add Report';
            mapContainer.style.cursor = ''; 
        }
    }
    onMapClick(e) {
        if(this.isSelectingLocation) {
            document.getElementById('report-lat').value = e.lngLat.lat.toFixed(6);
            document.getElementById('report-lng').value = e.lngLat.lng.toFixed(6);
            this.toggleLocationSelectMode();
            this.openReportModal();
        }
    }
    
    async handleReportSubmit(e) { 
        e.preventDefault();
        
        if (!this.user) {
            alert("You must be logged in to submit a report.");
            return;
        }

        const title = document.getElementById('report-title').value;
        const color = document.getElementById('report-threat').value;
        const lat = parseFloat(document.getElementById('report-lat').value);
        const lng = parseFloat(document.getElementById('report-lng').value);
        const details = document.getElementById('report-details').value;
        
        const env = {
             emf: parseFloat(document.getElementById('env-emf').value) || 0,
             temp: parseFloat(document.getElementById('env-temp').value) || 0,
             sound: parseFloat(document.getElementById('env-sound').value) || 0
        };

        const reportData = {
            title: title,
            color: color,
            lat: lat,
            lng: lng,
            details: details,
            env: env,
            userId: this.user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            await this.db.collection('reports').add(reportData);
            this.closeReportModal();
            document.getElementById('report-form').reset();
            // Refresh map data
            this.loadReportsFromFirestore();
            alert("Report submitted successfully.");
        } catch (error) {
            console.error("Error adding report: ", error);
            alert("Error submitting report. See console.");
        }
    }
}

document.addEventListener('DOMContentLoaded', () => { window.app = new AetherAtlas(firebaseConfig); });
