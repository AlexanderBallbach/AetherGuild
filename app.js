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
        this.activeOverlays = new Set();
        this.isStyleLoaded = false;
        this.allReports = []; // Store all reports for filtering

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
                    // Dynamic Overpass Layers - Refined queries
                    { name: 'Power Grid', id: 'power', type: 'overpass', query: 'power=line', color: '#00ffff' },
                    { name: 'Rail Network', id: 'rail', type: 'overpass', query: 'railway=rail', color: '#ffaa00' },
                    { name: 'Telecoms', id: 'telecom', type: 'overpass', query: 'man_made=tower', color: '#ff0055' }
                ],
                'Hydrological': [
                    { name: 'Waterways', id: 'water', type: 'overpass', query: 'waterway~"river|canal"', color: '#00d9ff' }
                ],
                'Urban': [
                    // New Business/Feature Labels (POIs)
                    { name: 'Local Features', id: 'pois', type: 'overpass', query: 'amenity', minzoom: 15, color: '#ffffff' }
                ],
                'Labels': [
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
            this.initUIControls();
            this.initKeyboardControls();
            // this.startPhysicsLoop();

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
            const point = new maplibregl.Point(
                e.clientX - rect.left,
                e.clientY - rect.top
            );

            const lngLat = this.map.unproject(point);
            const delta = -e.deltaY / 400; // Adjust sensitivity
            const targetZoom = this.map.getZoom() + delta;

            this.map.easeTo({
                zoom: targetZoom,
                around: lngLat,
                duration: 100, // Short duration for responsive feel
                easing: t => t
            });
        }, { passive: false });
    }





    initUIControls() {
        this.initLayerControlUI();
        this.initZoomControl();

        // Add Standard Navigation Control (Compass + Zoom)
        this.map.addControl(new maplibregl.NavigationControl({
            visualizePitch: true,
            showCompass: true,
            showZoom: false // We have a custom zoom slider
        }), 'top-right');

        const scale = new maplibregl.ScaleControl({ maxWidth: 80, unit: 'imperial' });
        this.map.addControl(scale, 'bottom-right');
    }

    initChronosSlider() {
        const slider = document.getElementById('chronos-slider');
        const yearDisplay = document.getElementById('chronos-year-display');

        if (!slider || !yearDisplay) return;

        slider.addEventListener('input', (e) => {
            console.log("Slider Input:", e.target.value);
            const year = parseInt(e.target.value);
            this.currentYearFilter = year;

            if (year === parseInt(slider.max)) {
                yearDisplay.textContent = "ALL (Present)";
            } else {
                yearDisplay.textContent = year;
            }

            this.filterReportsByYear();
        });
    }

    filterReportsByYear() {
        if (!this.map.getSource('reports')) return;

        const filteredFeatures = this.allReports.filter(feature => {
            // If year is max (2026), show everything
            if (this.currentYearFilter === 2026) return true;

            // Extract year from feature property
            // Assuming 'timestamp' exists and is a Firestore timestamp or Date object or string
            let reportYear = 2024; // Default to recent if unknown

            if (feature.properties.timestamp) {
                // Handle Firestore Timestamp object (seconds property)
                if (feature.properties.timestamp.seconds) {
                    reportYear = new Date(feature.properties.timestamp.seconds * 1000).getFullYear();
                }
                // Handle standard Date object or string
                else {
                    reportYear = new Date(feature.properties.timestamp).getFullYear();
                }
            } else if (feature.properties.year) {
                reportYear = feature.properties.year;
            }

            return reportYear <= this.currentYearFilter;
        });

        this.map.getSource('reports').setData({
            type: 'FeatureCollection',
            features: filteredFeatures
        });
    }

    initCompass() {
        if (this.compassInterval) clearInterval(this.compassInterval);
        this.compassInterval = setInterval(() => this.updateCompass(), 100);
    }

    updateCompass() {
        if (!this.map || !this.allReports.length) return;

        const center = this.map.getCenter();
        let nearestDist = Infinity;
        let nearestFeature = null;

        // Use filtered reports for the compass
        // We can access the rendered features for better accuracy regarding "visible" reports,
        // but checking allReports is simpler for finding the absolute nearest globally
        // or we can use map.queryRenderedFeatures if we only care about visible ones.
        // Let's stick to visible/filtered ones from the source data if possible,
        // but source data isn't easily accessible as an array without storing it.
        // We stored filtered reports in 'this.allReports' but filtered via map source.
        // We should actually filter this.allReports again or cache filtered results.
        // For efficiency, let's just use this.allReports and check the filter.

        this.allReports.forEach(feature => {
            // Re-apply simple year filter for compass target
            let reportYear = 2024;
            if (feature.properties.timestamp) {
                if (feature.properties.timestamp.seconds) reportYear = new Date(feature.properties.timestamp.seconds * 1000).getFullYear();
                else reportYear = new Date(feature.properties.timestamp).getFullYear();
            } else if (feature.properties.year) reportYear = feature.properties.year;

            if (reportYear > this.currentYearFilter) return;

            const coords = feature.geometry.coordinates;
            const dist = Math.sqrt(Math.pow(coords[0] - center.lng, 2) + Math.pow(coords[1] - center.lat, 2));
            if (dist < nearestDist) {
                nearestDist = dist;
                nearestFeature = feature;
            }
        });

        if (nearestFeature) {
            const bearing = this.calculateBearing(center.lng, center.lat, nearestFeature.geometry.coordinates[0], nearestFeature.geometry.coordinates[1]);
            const mapBearing = this.map.getBearing();
            const compassScene = document.getElementById('compass-scene');
            // Rotate the compass against the map bearing so it always points to the target real-world direction,
            // minus the map bearing to account for map rotation/pitch.
            // Actually, we want the compass to point relative to the VIEW PORT.
            // If heading is 90 (East), and map is North-up, compass points Right.
            // If map rotates 90 deg, North is Right. We want compass to still point East?
            // Standard Compass behavior: "N" on compass points to North.
            // Dodecahedron Compass behavior: Points to *Nearest Anomaly*.

            // So if Anomaly is North (0 deg bearing), and Map is North-up (0 deg bearing), Compass points Up (0 deg).
            // If Map rotates 90 deg (North is Right), Anomaly is now Left (-90 deg relative to cam).
            // So relative Rotation = Bearing - MapBearing.

            const relativeRotation = bearing - mapBearing;

            // Simple X/Y rotation for effect.
            // We rotate around Y axis to point Left/Right.
            // We rotate around X axis to point Up/Down (if we had pitch calculation).

            if (compassScene) {
                // Invert rotation because CSS rotateY is counter-intuitive for compass? Test visually.
                // rotateY(90deg) turns the right face to front.
                // If bearing is 90 (East), we want to look right. So rotateY(-90)??
                // Let's try standard mapping: rotateY(-relativeRotation)
                compassScene.style.transform = `rotateY(${relativeRotation}deg) rotateX(20deg)`;
                document.getElementById('compass-label').innerText = `Nearest: ${nearestFeature.properties.title.substring(0, 15)}...`;
            }
        }
    }

    calculateBearing(startLng, startLat, destLng, destLat) {
        const startLatRad = startLng * Math.PI / 180;
        const startLngRad = startLat * Math.PI / 180;
        const destLatRad = destLng * Math.PI / 180;
        const destLngRad = destLat * Math.PI / 180;

        const y = Math.sin(destLngRad - startLngRad) * Math.cos(destLatRad);
        const x = Math.cos(startLatRad) * Math.sin(destLatRad) -
            Math.sin(startLatRad) * Math.cos(destLatRad) * Math.cos(destLngRad - startLngRad);

        let brng = Math.atan2(y, x);
        brng = brng * 180 / Math.PI;
        return (brng + 360) % 360;
    }

    reapplyAllOverlays() {
        this.addReportsLayer();
        this.loadReportsFromFirestore().catch(e => this.loadMockReports());

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
                this.map.addSource(layerId, {
                    type: 'geojson',
                    data: { type: 'FeatureCollection', features: [] }
                });

                // Determine styling based on layer type
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

                this.map.addLayer({
                    id: layerId,
                    type: type,
                    source: layerId,
                    paint: paint
                });

                // For POIs, maybe add text labels?
                if (layerConf.id === 'pois') {
                    this.map.addLayer({
                        id: `${layerId}-label`,
                        type: 'symbol',
                        source: layerId,
                        layout: {
                            'text-field': ['get', 'name'],
                            'text-size': 10,
                            'text-offset': [0, 1],
                            'text-anchor': 'top'
                        },
                        paint: {
                            'text-color': '#ffffff',
                            'text-halo-color': '#000000',
                            'text-halo-width': 1
                        }
                    });
                }
            }
            this.map.setLayoutProperty(layerId, 'visibility', 'visible');
            if (layerConf.id === 'pois') this.map.setLayoutProperty(`${layerId}-label`, 'visibility', 'visible');

            this.fetchOverpassData(layerConf);

            // Re-fetch on move
            this.map.on('moveend', () => {
                if (this.activeOverlays.has(layerConf.id)) {
                    this.fetchOverpassData(layerConf);
                }
            });

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

        const query = `
            [out:json][timeout:25];
            (
              way[${layerConf.query}](${bbox});
              node[${layerConf.query}](${bbox});
              relation[${layerConf.query}](${bbox});
            );
            out body;
            >;
            out skel qt;
        `;

        try {
            console.log(`Fetching Overpass data for ${layerConf.name}...`);
            const response = await fetch('https://overpass-api.de/api/interpreter', {
                method: 'POST',
                body: query
            });
            const data = await response.json();
            const geojson = osmtogeojson(data);

            const source = this.map.getSource(`overpass-${layerConf.id}`);
            if (source) {
                source.setData(geojson);
                console.log(`Updated ${layerConf.name}: ${geojson.features.length} features.`);
            }
        } catch (error) {
            console.error("Overpass fetch error:", error);
        }
    }

    updateLegend() {
        const container = document.getElementById('legend-content');
        const legendPanel = document.getElementById('dynamic-legend');
        if (!container || !legendPanel) return;

        let html = '';
        let hasVisibleLayers = false;

        // Check Overlays
        this.activeOverlays.forEach(layerId => {
            const layerConf = Object.values(this.layerConfig.overlays).flat().find(l => l.id === layerId);
            if (layerConf) {
                hasVisibleLayers = true;
                html += `<div class="legend-item">
                            <span class="legend-color" style="background-color: ${layerConf.color || '#fff'}"></span>
                            <span>${layerConf.name}</span>
                         </div>`;
            }
        });

        // Check Heatmap/Reports
        if (this.map.getLayer('clusters') && this.map.getLayoutProperty('clusters', 'visibility') !== 'none') {
            hasVisibleLayers = true;
            html += `<div class="legend-item"><span class="legend-color" style="background-color: #00aaff"></span><span>Reports (Cluster)</span></div>`;
        }

        container.innerHTML = html;
        legendPanel.style.display = hasVisibleLayers ? 'block' : 'none';
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

    async updateAuthUI(isLoggedIn) {
        const authSection = document.getElementById('auth-section');
        const addReportBtn = document.getElementById('add-report-btn');
        if (isLoggedIn) {
            // Calculate Rank
            let reportCount = 0;
            let rank = "Witness";
            try {
                const snapshot = await this.db.collection('reports').where('userId', '==', this.user.uid).get();
                reportCount = snapshot.size;

                if (reportCount >= 50) rank = "Guild Master";
                else if (reportCount >= 20) rank = "Senior Investigator";
                else if (reportCount >= 5) rank = "Field Agent";
                else if (reportCount >= 1) rank = "Observer";

            } catch (e) {
                console.log("Error fetching user rank:", e);
            }

            authSection.innerHTML = `
                <div class="card-header"><h2 class="card-title">Investigator Profile</h2></div>
                <div class="card-body">
                    <p class="mb-1"><strong>${rank}</strong></p>
                    <p class="mb-2 text-secondary" style="font-size:12px">${this.user.email}</p>
                    <div style="display:flex; justify-content:space-between; margin-bottom:12px; font-size:12px; border-top:1px solid var(--theme-border-color); padding-top:8px;">
                        <span>Reports:</span> <span style="color:var(--theme-accent-primary)">${reportCount}</span>
                    </div>
                    <button class="btn btn-secondary" onclick="firebase.auth().signOut()" style="width:100%">Logout</button>
                </div>`;
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
                        timestamp: data.timestamp // Ensure timestamp is passed
                    }
                };
            });
        } catch (error) {
            console.error("Error loading reports:", error);
            this.loadMockReports(); // Fallback
        }
    }

    loadMockReports() {
        if (!this.map.getSource('reports')) return;
        // Mock data with years for testing Chronos
        const mockData = [
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-74.006, 40.7128] }, properties: { title: "NYC Anomaly (2024)", color: "#ff0000", details: "Recent event.", year: 2024 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-0.1276, 51.5074] }, properties: { title: "London Fog (1952)", color: "#aaaaaa", details: "Historical event.", year: 1952 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [31.1342, 29.9792] }, properties: { title: "Pyramid Signal (1920)", color: "#ffaa00", details: "Ancient signal.", year: 1920 } },
            { type: 'Feature', geometry: { type: 'Point', coordinates: [-104.9903, 39.7392] }, properties: { title: "Denver Airport (1995)", color: "#00aaff", details: "Conspiracy hub.", year: 1995 } }
        ];

        this.allReports = mockData;
        this.allReports = mockData;
    }

    centerOnUser() {
        console.log("centerOnUser called");
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(pos => {
                console.log("Position found:", pos);
                this.map.flyTo({ center: [pos.coords.longitude, pos.coords.latitude], zoom: 12 });
            }, err => {
                console.error("Geolocation error:", err);
                alert("Could not get location: " + err.message);
            });
        } else {
            console.error("Geolocation not supported");
            alert("Geolocation not supported by this browser.");
        }
    }
    switchView(viewName) { this.currentView = viewName; document.getElementById('map-container').classList.toggle('hidden', viewName !== 'atlas'); document.getElementById('wiki-container').classList.toggle('hidden', viewName === 'atlas'); if (viewName === 'atlas' && this.map) this.map.resize(); }

    openReportModal() { document.getElementById('report-modal').classList.add('is-visible'); }
    closeReportModal() { document.getElementById('report-modal').classList.remove('is-visible'); this.isSelectingLocation = false; document.getElementById('map-container').style.cursor = ''; }

    toggleLocationSelectMode() {
        this.isSelectingLocation = !this.isSelectingLocation;
        const addReportBtn = document.getElementById('add-report-btn');
        document.getElementById('map-container').style.cursor = this.isSelectingLocation ? 'crosshair' : '';
        if (addReportBtn) addReportBtn.textContent = this.isSelectingLocation ? 'Cancel Location' : 'Add Report';
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
        document.addEventListener('keydown', (e) => { if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = true; });
        document.addEventListener('keyup', (e) => { if (this.keys.hasOwnProperty(e.key)) this.keys[e.key] = false; });
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
