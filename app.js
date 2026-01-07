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
        this.activeOverlays = new Set(); 
        this.isStyleLoaded = false;
        this.terminatorInterval = null;

        this.keys = { ArrowUp: false, ArrowDown: false, ArrowLeft: false, ArrowRight: false, w: false, a: false, s: false, d: false };
        this.panVelocity = { x: 0, y: 0 };
        this.zoomVelocity = 0;
        this.animationFrameId = null;

        this.authUI = new AuthUI();
        this.wiki = new Aetherpedia();

        this.layerConfig = {
            basemaps: {
                groupName: 'Base Spectrum',
                layers: {
                    'Clinical Dark': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                    'Satellite Scan': 'https://api.maptiler.com/maps/satellite/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL',
                }
            },
            overlays: {
                'Infrastructure': [
                    { name: 'Power Grid', id: 'overlay-power', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', paint: { 'raster-hue-rotate': 90, 'raster-opacity': 0.5 }, visible: false },
                    { name: 'Rail Network', id: 'overlay-rail', url: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', paint: { 'raster-hue-rotate': 180, 'raster-opacity': 0.5 }, visible: false }
                ],
                'Astronomical': [
                    { name: 'Day/Night Terminator', id: 'terminator', action: 'toggle_terminator', visible: true }
                ],
                'Anthropological': [
                    { name: 'Place Labels', id: 'toggle-labels', action: 'toggle_labels', visible: true },
                ]
            }
        };

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
        
        // This block is now commented out to prioritize the live database
        // if (location.hostname === "localhost" || location.hostname === "127.0.0.1") {
        //     try {
        //         this.db.useEmulator("localhost", 8181);
        //         this.auth.useEmulator("http://localhost:9199");
        //         console.log("Connected to Local Emulators");
        //     } catch (e) { console.warn("Emulator connection skipped:", e); }
        // }
        
        console.log("Connecting to LIVE Firebase backend.");
        this.wiki.db = this.db;
    }

    initMapView() {
        if (this.map) return;
        this.map = new maplibregl.Map({
            container: 'map-container',
            style: this.layerConfig.basemaps.layers['Clinical Dark'],
            center: [-98, 39],
            zoom: 3,
            pitch: 0,
            bearing: 0,
            antialias: true
        });

        this.map.on('load', () => {
            this.isStyleLoaded = true;
            this.reapplyAllOverlays();
            this.initUIControls();
            this.initKeyboardControls();
            this.startPhysicsLoop();
        });
        
        this.map.on('styledata', () => {
            if (this.isStyleLoaded) {
                 this.reapplyAllOverlays();
            }
        });

        this.attachMapEventListeners();
    }

    initUIControls() {
        this.initLayerControlUI();
        this.initZoomControl();
        const scale = new maplibregl.ScaleControl({ maxWidth: 80, unit: 'imperial' });
        this.map.addControl(scale, 'bottom-right');
    }

    reapplyAllOverlays() {
        this.addReportsLayer();
        this.loadReportsFromFirestore().catch(e => this.loadMockReports());

        if (this.activeOverlays.has('terminator')) {
            this.toggleTerminator(true);
        }

        Object.values(this.layerConfig.overlays).flat().forEach(layer => {
             if (layer.url && !this.map.getSource(layer.id)) {
                this.map.addSource(layer.id, {
                    type: 'raster',
                    tiles: [layer.url.replace('{s}', 'a')],
                    tileSize: 256
                });
            }
            if (layer.url && !this.map.getLayer(layer.id)) {
                this.map.addLayer({
                    id: layer.id,
                    type: 'raster',
                    source: layer.id,
                    paint: layer.paint,
                    layout: {
                        visibility: this.activeOverlays.has(layer.id) ? 'visible' : 'none'
                    }
                });
            }
        });
    }
    
    addReportsLayer() {
        if (this.map.getSource('reports')) return;
        this.map.addSource('reports', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] },
            cluster: true, clusterMaxZoom: 14, clusterRadius: 50
        });
        this.map.addLayer({ id: 'clusters', type: 'circle', source: 'reports', filter: ['has', 'point_count'], paint: { 'circle-color': '#00aaff', 'circle-radius': 20, 'circle-stroke-width': 1, 'circle-stroke-color': '#fff' } });
        this.map.addLayer({ id: 'cluster-count', type: 'symbol', source: 'reports', filter: ['has', 'point_count'], layout: { 'text-field': '{point_count_abbreviated}', 'text-font': ['Open Sans Bold'], 'text-size': 12 }, paint: { 'text-color': '#ffffff' } });
        this.map.addLayer({ id: 'unclustered-point', type: 'circle', source: 'reports', filter: ['!', ['has', 'point_count']], paint: { 'circle-color': ['get', 'color'], 'circle-radius': 8, 'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });
    }

    handleLayerToggle(layerId, isChecked) {
        const layerConf = Object.values(this.layerConfig.overlays).flat().find(l => l.id === layerId);
        if (!layerConf) return;

        if (layerConf.action === 'toggle_labels') this.toggleLabels(isChecked);
        else if (layerConf.action === 'toggle_terminator') this.toggleTerminator(isChecked);
        else if (layerConf.id) this.map.setLayoutProperty(layerId, 'visibility', isChecked ? 'visible' : 'none');
        
        if(isChecked) this.activeOverlays.add(layerId);
        else this.activeOverlays.delete(layerId);
    }
    
    toggleTerminator(isVisible) {
        if (isVisible) {
            if (!this.map.getSource('terminator')) {
                this.map.addSource('terminator', {
                    type: 'geojson',
                    data: calculateTerminator(new Date())
                });
                this.map.addLayer({
                    id: 'terminator-layer',
                    type: 'fill',
                    source: 'terminator',
                    paint: {
                        'fill-color': '#000',
                        'fill-opacity': 0.3
                    }
                });
            }
            
            this.terminatorInterval = setInterval(() => {
                this.map.getSource('terminator').setData(calculateTerminator(new Date()));
            }, 60000); // Update every minute
            
            this.map.setLayoutProperty('terminator-layer', 'visibility', 'visible');
        } else {
            if (this.terminatorInterval) clearInterval(this.terminatorInterval);
            if (this.map.getLayer('terminator-layer')) {
                this.map.setLayoutProperty('terminator-layer', 'visibility', 'none');
            }
        }
    }


    toggleLabels(isVisible) {
        const layers = this.map.getStyle().layers;
        layers.forEach(layer => {
            if (layer.type === 'symbol') {
                this.map.setLayoutProperty(layer.id, 'visibility', isVisible ? 'visible' : 'none');
            }
        });
    }

    changeBasemap(styleUrl) {
        this.isStyleLoaded = false;
        this.map.setStyle(styleUrl);
        setTimeout(() => this.isStyleLoaded = true, 500);
    }

    initLayerControlUI() { 
         const container = document.getElementById('layer-tree-container');
         let html = '<div id="layer-tree-control" class="map-overlay-panel" style="display:none;"><h4 class="overlay-title">Atlas Layers</h4>';

         html += `<div class="layer-group"><h5 class="layer-group-title">${this.layerConfig.basemaps.groupName}</h5>`;
         Object.entries(this.layerConfig.basemaps.layers).forEach(([name, url], index) => {
             const checked = index === 0 ? 'checked' : '';
             html += `<label class="layer-option"><input type="radio" name="basemap" value="${url}" ${checked}> ${name}</label>`;
         });
         html += `</div>`;

         Object.entries(this.layerConfig.overlays).forEach(([groupName, layers]) => {
             html += `<div class="layer-group"><h5 class="layer-group-title">${groupName}</h5>`;
             layers.forEach(layer => {
                 const checked = layer.visible ? 'checked' : '';
                  if (layer.visible) this.activeOverlays.add(layer.id);
                 html += `<label class="layer-option"><input type="checkbox" name="overlay" value="${layer.id}" ${checked}> ${layer.name}</label>`;
             });
             html += `</div>`;
         });

         html += '</div>';
         container.innerHTML = html;

         container.addEventListener('change', (e) => {
            const el = e.target;
            if (el.name === 'basemap') this.changeBasemap(el.value);
            else if (el.name === 'overlay') this.handleLayerToggle(el.value, el.checked);
        });
    }

    initZoomControl() {
        const container = document.getElementById('zoom-control-container');
        container.innerHTML = `<button id="zoom-in" class="zoom-btn">+</button><input type="range" id="zoom-slider" min="-0.2" max="0.2" step="0.01" value="0"><button id="zoom-out" class="zoom-btn">-</button>`;
        document.getElementById('zoom-in').addEventListener('click', () => this.map.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.map.zoomOut());
        const slider = document.getElementById('zoom-slider');
        const reset = () => { slider.value = 0; this.zoomVelocity = 0; };
        slider.addEventListener('mouseup', reset);
        slider.addEventListener('touchend', reset);
        slider.addEventListener('mouseleave', reset);
        slider.addEventListener('input', (e) => { this.zoomVelocity = parseFloat(e.target.value); });
    }

    attachMapEventListeners() {
        this.map.on('click', (e) => this.onMapClick(e));
        this.map.on('mousemove', (e) => { document.getElementById('coord-display').innerText = `LAT: ${e.lngLat.lat.toFixed(4)} LON: ${e.lngLat.lng.toFixed(4)}`; });
        this.map.on('mouseenter', 'unclustered-point', () => this.map.getCanvas().style.cursor = 'pointer');
        this.map.on('mouseleave', 'unclustered-point', () => this.map.getCanvas().style.cursor = '');
        this.map.on('click', 'clusters', (e) => {
            const features = this.map.queryRenderedFeatures(e.point, { layers: ['clusters'] });
            this.map.getSource('reports').getClusterExpansionZoom(features[0].properties.cluster_id, (err, zoom) => {
                if (!err) this.map.easeTo({ center: features[0].geometry.coordinates, zoom: zoom });
            });
        });
        this.map.on('click', 'unclustered-point', (e) => {
            const props = e.features[0].properties;
            const coordinates = e.features[0].geometry.coordinates.slice();
            const popupContent = `<h4 style="color: ${props.color || '#fff'}; margin: 0 0 8px;">${props.title}</h4><p style="font-size: 13px;">${props.details}</p><button class="btn btn-secondary" style="width:100%; font-size: 12px; padding: 4px 8px;" onclick="window.app.switchView('wiki'); window.app.wiki.loadArticle('${props.title.replace(/ /g, '_')}');">View Article</button>`;
            new maplibregl.Popup({ className: 'custom-popup' }).setLngLat(coordinates).setHTML(popupContent).addTo(this.map);
        });
    }

    attachEventListeners() {
        document.getElementById('view-switch-atlas').addEventListener('click', () => this.switchView('atlas'));
        document.getElementById('view-switch-wiki').addEventListener('click', () => this.switchView('wiki'));
        document.getElementById('add-report-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('toggle-layers-btn').addEventListener('click', () => { document.getElementById('layer-tree-control').style.display = document.getElementById('layer-tree-control').style.display === 'none' ? 'block' : 'none'; });
        document.getElementById('locate-btn').addEventListener('click', () => this.centerOnUser());
        document.getElementById('report-modal-close').addEventListener('click', () => this.closeReportModal());
        document.getElementById('set-location-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('report-form').addEventListener('submit', (e) => this.handleReportSubmit(e));
    }
    
    listenForAuthStateChanges() { this.auth.onAuthStateChanged(user => { this.user = user; this.updateAuthUI(!!user); if (this.map) this.loadReportsFromFirestore(); }); }
    
    updateAuthUI(isLoggedIn) { 
        const authSection = document.getElementById('auth-section');
        const addReportBtn = document.getElementById('add-report-btn');
        if (isLoggedIn) {
            authSection.innerHTML = `<div class="card-header"><h2 class="card-title">Investigator</h2></div><div class="card-body"><p class="mb-1">Logged in as: <br><span class="text-secondary" style="font-size:12px">${this.user.email}</span></p><button class="btn btn-secondary" onclick="firebase.auth().signOut()" style="width:100%">Logout</button></div>`;
            addReportBtn.style.display = 'block';
        } else {
            authSection.innerHTML = `<div class="card-header"><h2 class="card-title">Access</h2></div><div class="card-body"><button class="btn btn-primary" onclick="window.app.authUI.show()" style="width:100%">Login / Join</button></div>`;
            addReportBtn.style.display = 'none';
        }
    }
    
    async loadReportsFromFirestore() {
        if (!this.map.getSource('reports')) return;
        try {
            const snapshot = await this.db.collection('reports').get();
            const features = snapshot.docs.map(doc => { const data = doc.data(); return { type: 'Feature', geometry: { type: 'Point', coordinates: [data.lng, data.lat] }, properties: { id: doc.id, title: data.title, details: data.details, color: data.color || '#00aaff' } }; });
            this.map.getSource('reports').setData({ type: 'FeatureCollection', features: features });
        } catch (error) { console.error("Error loading reports:", error); }
    }

    loadMockReports() {
        if (!this.map.getSource('reports')) return;
        this.map.getSource('reports').setData({ type: 'FeatureCollection', features: [ { type: 'Feature', geometry: { type: 'Point', coordinates: [-74.006, 40.7128] }, properties: { title: "NYC Anomaly", color: "#ff0000", details: "Mock Data" } }] });
    }
    
    centerOnUser() { if (navigator.geolocation) { navigator.geolocation.getCurrentPosition(pos => { this.map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 }); }); } }
    switchView(viewName) { this.currentView = viewName; document.getElementById('map-container').classList.toggle('hidden', viewName !== 'atlas'); document.getElementById('wiki-container').classList.toggle('hidden', viewName === 'atlas'); if (viewName === 'atlas' && this.map) this.map.resize(); }
    
    openReportModal() { document.getElementById('report-modal').classList.add('is-visible'); }
    closeReportModal() { document.getElementById('report-modal').classList.remove('is-visible'); this.isSelectingLocation = false; document.getElementById('map-container').style.cursor = ''; }
    
    toggleLocationSelectMode() { 
        this.isSelectingLocation = !this.isSelectingLocation;
        const addReportBtn = document.getElementById('add-report-btn');
        document.getElementById('map-container').style.cursor = this.isSelectingLocation ? 'crosshair' : '';
        if(addReportBtn) addReportBtn.textContent = this.isSelectingLocation ? 'Cancel Location' : 'Add Report';
        if (this.isSelectingLocation) this.closeReportModal();
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
        if (!this.user) { alert("You must be logged in."); return; }
        const reportData = {
            title: document.getElementById('report-title').value, color: document.getElementById('report-threat').value, lat: parseFloat(document.getElementById('report-lat').value), lng: parseFloat(document.getElementById('report-lng').value), details: document.getElementById('report-details').value,
            env: { emf: parseFloat(document.getElementById('env-emf').value) || 0, temp: parseFloat(document.getElementById('env-temp').value) || 0, sound: parseFloat(document.getElementById('env-sound').value) || 0 },
            userId: this.user.uid, timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };
        try {
            await this.db.collection('reports').add(reportData);
            this.closeReportModal();
            document.getElementById('report-form').reset();
            this.loadReportsFromFirestore();
            alert("Report submitted.");
        } catch (error) { console.error("Error adding report: ", error); alert("Error submitting report."); }
    }
    
    initKeyboardControls() {
        document.addEventListener('keydown', (e) => { if(this.keys.hasOwnProperty(e.key)) this.keys[e.key] = true; });
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
}

document.addEventListener('DOMContentLoaded', () => { window.app = new AetherAtlas(firebaseConfig); });
