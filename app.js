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
        this.isSelectingLocation = false; // Initialize explicitly
        this.allReports = []; // Store all reports for filtering

        // Ensure config is available
        const config = firebaseConfig || window.firebaseConfig;
        if (!config) {
            console.error("Firebase config not found!");
            alert("Configuration Error: Firebase config missing.");
            return;
        }

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
                    'Dark': 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json',
                    'Light': 'https://basemaps.cartocdn.com/gl/positron-gl-style/style.json',
                    'Satellite': 'https://api.maptiler.com/maps/satellite/style.json?key=get_your_own_OpIi9ZULNHzrESv6T2vL',
                }
            },
            overlays: {
                'Infrastructure': [
                    // Dynamic Overpass Layers
                    { name: 'Power Grid', id: 'power', type: 'overpass', query: 'power=line', color: '#00ffff' },
                    { name: 'Rail Network', id: 'rail', type: 'overpass', query: 'railway=rail', color: '#ffaa00' },
                    { name: 'Telecoms', id: 'telecom', type: 'overpass', query: 'man_made=tower', color: '#ff0055' }
                ],
                'Hydrological': [
                    { name: 'Waterways', id: 'water', type: 'overpass', query: 'waterway~"river|canal"', color: '#00d9ff' }
                ],
                'Urban': [
                    { name: 'Local Features', id: 'pois', type: 'overpass', query: 'amenity', minzoom: 15, color: '#ffffff' }
                ],
                'Labels': [
                    { name: 'Place Labels', id: 'toggle-labels', action: 'toggle_labels', visible: true },
                ]
            }
        };

        this.initFirebase(config);
        this.attachEventListeners();
        this.listenForAuthStateChanges();

        // Initialize UI immediately (don't wait for map)
        this.initUIControls();

        // Initialize Map
        this.initMapView();
    }

    initFirebase(config) {
        if (!firebase.apps.length) firebase.initializeApp(config);
        this.auth = firebase.auth();
        this.db = firebase.firestore();
        console.log("Connecting to LIVE Firebase backend.");
        this.wiki.db = this.db;
    }

    initMapView() {
        if (this.map) return;
        this.map = new maplibregl.Map({
            container: 'map-container',
            style: this.layerConfig.basemaps.layers['Dark'],
            center: [-98, 39],
            zoom: 3,
            pitch: 0,
            bearing: 0,
            antialias: true,
            trackResize: true
        });

        this.map.on('load', () => {
            this.isStyleLoaded = true;
            this.reapplyAllOverlays();
            this.initMapControls();
            this.initKeyboardControls();

            // Force resize to ensure flex layout is respected
            setTimeout(() => {
                this.map.resize();
            }, 100);
        });

        this.map.on('styledata', () => {
            if (this.isStyleLoaded) {
                this.reapplyAllOverlays();
            }
        });

        this.attachMapEventListeners();

        // Disable native scroll zoom and use custom handler for precise centering
        this.map.scrollZoom.disable();
        this.enableCustomScrollZoom();
    }

    enableCustomScrollZoom() {
        const canvas = this.map.getCanvas();
        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            const rect = canvas.getBoundingClientRect();
            const point = new maplibregl.Point(e.clientX - rect.left, e.clientY - rect.top);
            const lngLat = this.map.unproject(point);
            const delta = -e.deltaY / 400;
            const targetZoom = this.map.getZoom() + delta;
            this.map.easeTo({
                zoom: targetZoom,
                around: lngLat,
                duration: 100,
                easing: t => t
            });
        }, { passive: false });
    }

    initUIControls() {
        this.initLayerControlUI();
        this.initZoomControl();

        this.initLocationSearch();

        // Initialize icons for injected content
        setTimeout(() => feather.replace(), 0);
    }

    initMapControls() {
        if (!this.map) return;

        this.map.addControl(new maplibregl.NavigationControl({
            visualizePitch: true,
            showCompass: true,
            showZoom: false
        }), 'top-right');

        const scale = new maplibregl.ScaleControl({ maxWidth: 80, unit: 'imperial' });
        this.map.addControl(scale, 'bottom-right');
    }

    initLocationSearch() {
        const input = document.getElementById('location-search-input');
        const suggestionsBox = document.getElementById('location-suggestions');
        if (!input || !suggestionsBox) return;

        let debounceTimer;

        input.addEventListener('input', (e) => {
            clearTimeout(debounceTimer);
            const query = e.target.value.trim();
            if (query.length < 3) {
                suggestionsBox.classList.add('hidden');
                return;
            }

            debounceTimer = setTimeout(async () => {
                try {
                    const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}`);
                    const results = await response.json();

                    suggestionsBox.innerHTML = '';
                    if (results.length > 0) {
                        results.forEach(place => {
                            const li = document.createElement('li');
                            li.textContent = place.display_name;
                            li.addEventListener('click', () => {
                                this.map.flyTo({
                                    center: [parseFloat(place.lon), parseFloat(place.lat)],
                                    zoom: 14,
                                    essential: true
                                });
                                input.value = place.display_name;
                                suggestionsBox.classList.add('hidden');
                            });
                            suggestionsBox.appendChild(li);
                        });
                        suggestionsBox.classList.remove('hidden');
                    } else {
                        suggestionsBox.classList.add('hidden');
                    }
                } catch (err) {
                    console.error("Geocoding error:", err);
                }
            }, 300);
        });

        document.addEventListener('click', (e) => {
            if (!input.contains(e.target) && !suggestionsBox.contains(e.target)) {
                suggestionsBox.classList.add('hidden');
            }
        });
    }

    reapplyAllOverlays() {
        this.addReportsLayer();
        this.loadReportsFromFirestore().catch(e => this.loadMockReports());

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
        else if (layerConf.type === 'overpass') this.toggleOverpassLayer(layerConf, isChecked);
        else if (layerConf.id) this.map.setLayoutProperty(layerId, 'visibility', isChecked ? 'visible' : 'none');

        if (isChecked) this.activeOverlays.add(layerId);
        else this.activeOverlays.delete(layerId);

        this.updateLegend();
    }

    async toggleOverpassLayer(layerConf, isChecked) {
        const layerId = `overpass-${layerConf.id}`;

        if (isChecked) {
            if (!this.map.getSource(layerId)) {
                this.map.addSource(layerId, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });

                let type = 'line';
                let paint = { 'line-color': layerConf.color, 'line-width': 2 };

                if (layerConf.id === 'telecom' || layerConf.id === 'pois') {
                    type = 'circle';
                    paint = {
                        'circle-color': layerConf.color,
                        'circle-radius': layerConf.id === 'pois' ? 3 : 5,
                        'circle-stroke-width': 1,
                        'circle-stroke-color': '#000'
                    };
                }

                this.map.addLayer({ id: layerId, type: type, source: layerId, paint: paint });

                if (layerConf.id === 'pois') {
                    this.map.addLayer({
                        id: `${layerId}-label`, type: 'symbol', source: layerId,
                        layout: { 'text-field': ['get', 'name'], 'text-size': 10, 'text-offset': [0, 1], 'text-anchor': 'top' },
                        paint: { 'text-color': '#ffffff', 'text-halo-color': '#000000', 'text-halo-width': 1 }
                    });
                }
            }
            this.map.setLayoutProperty(layerId, 'visibility', 'visible');
            if (layerConf.id === 'pois') this.map.setLayoutProperty(`${layerId}-label`, 'visibility', 'visible');

            this.fetchOverpassData(layerConf);
            this.map.on('moveend', () => { if (this.activeOverlays.has(layerConf.id)) this.fetchOverpassData(layerConf); });

        } else {
            if (this.map.getLayer(layerId)) {
                this.map.setLayoutProperty(layerId, 'visibility', 'none');
                if (layerConf.id === 'pois') this.map.setLayoutProperty(`${layerId}-label`, 'visibility', 'none');
            }
        }
    }

    async fetchOverpassData(layerConf) {
        const zoom = this.map.getZoom();
        const minZoom = layerConf.minzoom || 10;
        if (zoom < minZoom) return;

        const bounds = this.map.getBounds();
        const bbox = `${bounds.getSouth()},${bounds.getWest()},${bounds.getNorth()},${bounds.getEast()}`;

        const query = `[out:json][timeout:25];(way[${layerConf.query}](${bbox});node[${layerConf.query}](${bbox});relation[${layerConf.query}](${bbox}););out body;>;out skel qt;`;

        try {
            console.log(`Fetching Overpass data for ${layerConf.name}...`);
            const response = await fetch('https://overpass-api.de/api/interpreter', { method: 'POST', body: query });
            const data = await response.json();
            const geojson = osmtogeojson(data);
            const source = this.map.getSource(`overpass-${layerConf.id}`);
            if (source) source.setData(geojson);
        } catch (error) { console.error("Overpass fetch error:", error); }
    }

    updateLegend() {
        const container = document.getElementById('legend-content');
        const legendPanel = document.getElementById('dynamic-legend');
        if (!container || !legendPanel) return;

        let html = '';
        let hasVisibleLayers = false;

        this.activeOverlays.forEach(layerId => {
            const layerConf = Object.values(this.layerConfig.overlays).flat().find(l => l.id === layerId);
            if (layerConf) {
                hasVisibleLayers = true;
                html += `<div class="legend-item"><span class="legend-color" style="background-color: ${layerConf.color || '#fff'}"></span><span>${layerConf.name}</span></div>`;
            }
        });

        if (this.map.getLayer('clusters') && this.map.getLayoutProperty('clusters', 'visibility') !== 'none') {
            hasVisibleLayers = true;
            html += `<div class="legend-item"><span class="legend-color" style="background-color: #00aaff"></span><span>Reports (Cluster)</span></div>`;
        }

        container.innerHTML = html;
        legendPanel.style.display = hasVisibleLayers ? 'block' : 'none';
        legendPanel.classList.toggle('hidden', !hasVisibleLayers);
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
        // We use display: contents on the wrapper to let groups sit in the grid
        let html = '<div id="layer-tree-control"><h4 class="overlay-title">Atlas Layers</h4>';

        // Column 1: Basemaps & First Overlay Group
        html += `<div class="layer-group"><h5 class="layer-group-title">${this.layerConfig.basemaps.groupName}</h5>`;
        Object.entries(this.layerConfig.basemaps.layers).forEach(([name, url], index) => {
            const checked = index === 0 ? 'checked' : '';
            html += `<label class="layer-option"><input type="radio" name="basemap" value="${url}" ${checked}> ${name}</label>`;
        });
        html += `</div>`;

        // Overlays
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
        if (!container) return;
        container.innerHTML = `<button id="zoom-in" class="hud-btn" style="width:32px; height:32px; font-size:18px;">+</button><button id="zoom-out" class="hud-btn" style="width:32px; height:32px; font-size:18px;">-</button>`;
        document.getElementById('zoom-in').addEventListener('click', () => this.map.zoomIn());
        document.getElementById('zoom-out').addEventListener('click', () => this.map.zoomOut());
    }

    attachEventListeners() {
        document.getElementById('view-switch-atlas').addEventListener('click', () => this.switchView('atlas'));
        document.getElementById('view-switch-wiki').addEventListener('click', () => this.switchView('wiki'));
        document.getElementById('close-wiki').addEventListener('click', () => this.switchView('atlas'));

        document.getElementById('add-report-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('toggle-layers-btn').addEventListener('click', () => {
            const tree = document.getElementById('layer-tree-container');
            tree.classList.toggle('hidden');
        });
        document.getElementById('locate-btn').addEventListener('click', () => this.centerOnUser());
        document.getElementById('report-modal-close').addEventListener('click', () => this.closeReportModal());
        document.getElementById('set-location-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('report-form').addEventListener('submit', (e) => this.handleReportSubmit(e));

        document.getElementById('user-menu-btn').addEventListener('click', () => {
            document.getElementById('user-dropdown').classList.toggle('hidden');
        });
        document.getElementById('settings-btn').addEventListener('click', () => {
            alert('Settings coming soon.');
        });
    }

    async updateAuthUI(isLoggedIn) {
        const authSection = document.getElementById('auth-section');
        const userAvatar = document.getElementById('user-avatar-display');
        const addReportBtn = document.getElementById('add-report-btn');

        if (isLoggedIn) {
            let reportCount = 0;
            let rank = "Witness";
            try {
                const snapshot = await this.db.collection('reports').where('userId', '==', this.user.uid).get();
                reportCount = snapshot.size;
                if (reportCount >= 50) rank = "Guild Master";
                else if (reportCount >= 20) rank = "Senior Investigator";
                else if (reportCount >= 5) rank = "Field Agent";
                else if (reportCount >= 1) rank = "Observer";
            } catch (e) { console.log("Error fetching user rank:", e); }

            if (userAvatar) userAvatar.textContent = rank.substring(0, 2).toUpperCase();
            if (authSection) {
                authSection.innerHTML = `
                    <div style="padding:16px; min-width:240px;">
                        <div style="margin-bottom:12px;">
                            <h4 style="margin:0; color:var(--theme-accent-primary);">${rank}</h4>
                            <p style="margin:4px 0 0 0; font-size:12px; color:var(--theme-text-secondary);">${this.user.email}</p>
                        </div>
                        <div style="display:flex; justify-content:space-between; margin-bottom:16px; font-size:13px; border-bottom:1px solid var(--theme-border-color); padding-bottom:12px;">
                            <span>Submitted Reports</span> 
                            <span style="font-weight:bold; color:#fff;">${reportCount}</span>
                        </div>
                        <button class="btn btn-secondary w-100" onclick="firebase.auth().signOut()">Log Out</button>
                    </div>`;
            }
            if (addReportBtn) addReportBtn.style.display = 'inline-flex';
        } else {
            if (userAvatar) userAvatar.textContent = '?';
            if (authSection) {
                authSection.innerHTML = `
                    <div style="padding:16px; text-align:center;">
                        <p style="font-size:13px; margin-bottom:12px;">Access restricted to Archives.</p>
                        <button class="btn btn-primary w-100" onclick="window.app.authUI.show()">Log In / Sign Up</button>
                    </div>`;
            }
            if (addReportBtn) addReportBtn.style.display = 'none';
        }
    }

    listenForAuthStateChanges() {
        this.auth.onAuthStateChanged(user => {
            this.user = user;
            this.updateAuthUI(!!user);
        });
    }

    async loadReportsFromFirestore() {
        if (!this.map.getSource('reports')) return;
        try {
            const snapshot = await this.db.collection('reports').get();
            this.allReports = snapshot.docs.map(doc => {
                const data = doc.data();
                return {
                    type: 'Feature',
                    geometry: { type: 'Point', coordinates: [data.lng, data.lat] },
                    properties: {
                        id: doc.id,
                        title: data.title,
                        details: data.details,
                        color: data.color || '#00aaff',
                        timestamp: data.timestamp
                    }
                };
            });
            this.map.getSource('reports').setData({ type: 'FeatureCollection', features: this.allReports });
        } catch (error) {
            console.error("Error loading reports:", error);
            this.loadMockReports();
        }
    }

    loadMockReports() {
        if (!this.map.getSource('reports')) return;
        const mockData = [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-74.006, 40.7128] }, properties: { title: "NYC Anomaly (2024)", color: "#ff0000", details: "Recent event.", year: 2024 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] }, properties: { title: "London Fog (1952)", color: "#aaaaaa", details: "Historical event.", year: 1952 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [31.1342, 29.9792] }, properties: { title: "Pyramid Signal (1920)", color: "#ffaa00", details: "Ancient signal.", year: 1920 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-104.9903, 39.7392] }, properties: { title: "Denver Airport (1995)", color: "#00aaff", details: "Conspiracy hub.", year: 1995 } }
        ];
        this.allReports = mockData.map(d => ({ ...d, properties: { ...d.properties, id: Math.random().toString(36) } }));
        this.map.getSource('reports').setData({ type: 'FeatureCollection', features: this.allReports });
    }

    centerOnUser() {
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                this.map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 });
            }, err => { alert("Could not get location: " + err.message); });
        } else { alert("Geolocation not supported."); }
    }

    switchView(viewName) {
        this.currentView = viewName;
        const wikiContainer = document.getElementById('wiki-container');
        if (viewName === 'atlas') {
            document.getElementById('view-switch-atlas').classList.add('active');
            document.getElementById('view-switch-wiki').classList.remove('active');
            wikiContainer.classList.add('hidden');
            if (this.map) this.map.resize();
        } else if (viewName === 'wiki') {
            document.getElementById('view-switch-wiki').classList.add('active');
            document.getElementById('view-switch-atlas').classList.remove('active');
            wikiContainer.classList.remove('hidden');
        }
    }

    openReportModal() { document.getElementById('report-modal').classList.remove('hidden'); }

    closeReportModal() {
        document.getElementById('report-modal').classList.add('hidden');
        this.isSelectingLocation = false;
        document.getElementById('map-container').style.cursor = '';
    }

    toggleLocationSelectMode() {
        this.isSelectingLocation = !this.isSelectingLocation;
        const addReportBtn = document.getElementById('add-report-btn');
        document.getElementById('map-container').style.cursor = this.isSelectingLocation ? 'crosshair' : '';
        if (addReportBtn) {
            if (this.isSelectingLocation) {
                addReportBtn.classList.add('btn-secondary');
                addReportBtn.classList.remove('btn-primary');
                addReportBtn.innerHTML = '<i data-feather="x"></i> Cancel';
            } else {
                addReportBtn.classList.add('btn-primary');
                addReportBtn.classList.remove('btn-secondary');
                addReportBtn.innerHTML = '<i data-feather="plus-circle"></i> Report';
            }
        }
        if (this.isSelectingLocation) this.closeReportModal();
    }

    onMapClick(e) {
        if (this.isSelectingLocation) {
            document.getElementById('report-lat').value = e.lngLat.lat.toFixed(6);
            document.getElementById('report-lng').value = e.lngLat.lng.toFixed(6);
            this.toggleLocationSelectMode();
            this.openReportModal();
        }
    }

    attachMapEventListeners() {
        this.map.on('click', (e) => this.onMapClick(e));
        this.map.on('mousemove', (e) => {
            const disp = document.getElementById('coord-display');
            if (disp) disp.innerText = `LAT: ${e.lngLat.lat.toFixed(4)} LON: ${e.lngLat.lng.toFixed(4)}`;
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
                <div style="min-width:200px">
                    <h4 style="color: ${props.color || '#fff'}; margin: 0 0 8px;">${props.title}</h4>
                    <p style="font-size: 13px; margin-bottom:8px;">${props.details}</p>
                    <button class="btn btn-secondary btn-sm w-100" onclick="window.app.switchView('wiki'); window.app.wiki.loadArticle('${props.title.replace(/ /g, '_')}');">View Article</button>
                    ${props.timestamp ? `<div style="font-size:10px; color:#aaa; margin-top:4px;">${new Date(props.timestamp.seconds * 1000).toLocaleDateString()}</div>` : ''}
                </div>`;
            new maplibregl.Popup({ className: 'custom-popup', maxWidth: '300px' })
                .setLngLat(coordinates).setHTML(popupContent).addTo(this.map);
        });
    }

    async handleReportSubmit(e) {
        e.preventDefault();
        if (!this.user) { alert("You must be logged in."); return; }
        const reportData = {
            title: document.getElementById('report-title').value,
            color: document.getElementById('report-threat').value,
            lat: parseFloat(document.getElementById('report-lat').value),
            lng: parseFloat(document.getElementById('report-lng').value),
            details: document.getElementById('report-details').value,
            env: {
                emf: parseFloat(document.getElementById('env-emf').value) || 0,
                temp: parseFloat(document.getElementById('env-temp').value) || 0,
                sound: parseFloat(document.getElementById('env-sound').value) || 0
            },
            userId: this.user.uid,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
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
        document.addEventListener('keydown', (e) => { if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = true; });
        document.addEventListener('keyup', (e) => { if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = false; });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    try {
        if (typeof firebase === 'undefined' || typeof maplibregl === 'undefined') {
            throw new Error("Required libraries (Firebase or MapLibre) not loaded. Check internet connection.");
        }
        window.app = new AetherAtlas(window.firebaseConfig);
    } catch (e) {
        console.error("Critical Application Error:", e);
        alert(`Failed to start application: ${e.message}. Check console for details.`);
    }
});
