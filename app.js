class AetherAtlas {
    constructor(firebaseConfig) {
        this.map = null;
        this.markers = {};
        this.currentTileLayer = null;
        this.terminator = null;
        this.isSelectingLocation = false;
        this.auth = null;
        this.db = null;
        this.user = null;
        this.authUI = new AuthUI();

        this.TILE_LAYERS = {
            dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
            satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
            street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
            terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
        };

        this.TILE_LAYER_ATTRIBUTIONS = {
            dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
            satellite: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
            street: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            terrain: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
        };
        
        this.initFirebase(firebaseConfig);
        this.initMap();
        this.attachEventListeners();
        this.listenForAuthStateChanges();
    }

    // --- INITIALIZATION ---

    initFirebase(config) {
        if (!firebase.apps.length) {
            firebase.initializeApp(config);
        }
        this.auth = firebase.auth();
        this.db = firebase.firestore();
    }

    initMap() {
        this.map = L.map('map', {
            worldCopyJump: true,
            maxBounds: [[-90, -180], [90, 180]]
        }).setView([20, 0], 2);
        this.setTileLayer('dark');
        this.updateTerminator();
        setInterval(() => this.updateTerminator(), 60000);
    }

    attachEventListeners() {
        // Tile Layer & Theme
        document.getElementById('tile-layer-select').addEventListener('change', (e) => this.setTileLayer(e.target.value));
        document.getElementById('theme-switcher').addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            feather.replace(); 
        });

        // Map Interactions
        this.map.on('click', (e) => this.onMapClick(e));

        // Report Modal Interactions
        document.getElementById('open-report-modal-btn')?.addEventListener('click', () => this.openReportModal());
        document.getElementById('report-modal-close').addEventListener('click', () => this.closeReportModal());
        document.getElementById('set-location-btn').addEventListener('click', () => this.toggleLocationSelectMode());
        document.getElementById('report-form').addEventListener('submit', (e) => this.handleReportSubmit(e));
    }

    // --- AUTHENTICATION ---

    listenForAuthStateChanges() {
        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.user = user;
                this.updateAuthUI(true);
                this.loadReportsFromFirestore();
                this.authUI.hide();
            } else {
                this.user = null;
                this.updateAuthUI(false);
                this.clearMarkers();
            }
        });
    }

    updateAuthUI(isLoggedIn) {
        const authSection = document.getElementById('auth-section');
        const addReportSection = document.getElementById('add-report-section');
        
        // Re-attach event listeners after HTML update requires a slight delay or delegating, 
        // but simple re-rendering is fine here.
        
        if (isLoggedIn) {
            authSection.innerHTML = `
                <div class="card-body">
                    <p class="text-secondary mb-1">Investigator:</p>
                    <h3 class="card-title mt-0 mb-2">${this.user.email}</h3>
                    <button id="logout-btn" class="btn btn-secondary" style="width: 100%;">Logout</button>
                </div>
            `;
            addReportSection.style.display = 'block';
            document.getElementById('logout-btn').addEventListener('click', () => this.signOut());
            // Re-bind the open modal button since the section was potentially hidden/shown
            document.getElementById('open-report-modal-btn').onclick = () => this.openReportModal();
        } else {
            authSection.innerHTML = `
                <div class="card-header"><h2 class="card-title">Welcome</h2></div>
                <div class="card-body">
                    <p class="text-secondary">Login to begin your investigation.</p>
                    <button id="login-register-btn" class="btn btn-primary" style="width: 100%;">Login / Register</button>
                </div>
            `;
            addReportSection.style.display = 'none';
            document.getElementById('login-register-btn').addEventListener('click', () => this.authUI.show());
        }
        feather.replace();
    }
    
    signOut() {
        this.auth.signOut().catch(error => console.error("Sign out error:", error));
    }

    // --- MAP & MARKERS ---

    setTileLayer(layerKey) {
        if (this.currentTileLayer) this.map.removeLayer(this.currentTileLayer);
        this.currentTileLayer = L.tileLayer(this.TILE_LAYERS[layerKey], {
            attribution: this.TILE_LAYER_ATTRIBUTIONS[layerKey],
            maxZoom: 19,
        }).addTo(this.map);
    }

    updateTerminator() {
        if (this.terminator) this.map.removeLayer(this.terminator);
        this.terminator = L.terminator().addTo(this.map);
    }
    
    clearMarkers() {
        Object.values(this.markers).forEach(({ marker }) => this.map.removeLayer(marker));
        this.markers = {};
    }

    // --- REPORT MANAGEMENT ---

    openReportModal() {
        document.getElementById('report-modal').classList.add('is-visible');
        this.isSelectingLocation = false;
        document.getElementById('map').style.cursor = '';
    }

    closeReportModal() {
        document.getElementById('report-modal').classList.remove('is-visible');
        this.isSelectingLocation = false;
        document.getElementById('map').style.cursor = '';
    }

    toggleLocationSelectMode() {
        this.isSelectingLocation = !this.isSelectingLocation;
        const btn = document.getElementById('set-location-btn');
        const mapContainer = document.getElementById('map');
        
        if (this.isSelectingLocation) {
            btn.textContent = 'Click on Map...';
            btn.classList.add('btn-primary');
            btn.classList.remove('btn-secondary');
            mapContainer.style.cursor = 'crosshair';
            // Temporarily hide modal to see map
            document.getElementById('report-modal').classList.remove('is-visible');
        } else {
            btn.textContent = 'Set';
            btn.classList.remove('btn-primary');
            btn.classList.add('btn-secondary');
            mapContainer.style.cursor = '';
        }
    }

    onMapClick(e) {
        if (this.isSelectingLocation) {
            document.getElementById('report-lat').value = e.latlng.lat.toFixed(6);
            document.getElementById('report-lng').value = e.latlng.lng.toFixed(6);
            
            // Exit selection mode and show modal again
            this.toggleLocationSelectMode();
            document.getElementById('report-modal').classList.add('is-visible');
        }
    }

    async handleReportSubmit(e) {
        e.preventDefault();
        if (!this.user) return;

        const title = document.getElementById('report-title').value;
        const threatColor = document.getElementById('report-threat').value;
        const lat = parseFloat(document.getElementById('report-lat').value);
        const lng = parseFloat(document.getElementById('report-lng').value);
        const emf = document.getElementById('env-emf').value;
        const temp = document.getElementById('env-temp').value;
        const sound = document.getElementById('env-sound').value;
        const details = document.getElementById('report-details').value;

        if (isNaN(lat) || isNaN(lng)) {
            alert("Please set a location on the map.");
            return;
        }

        const reportData = {
            title,
            color: threatColor,
            lat,
            lng,
            readings: { emf, temp, sound },
            details,
            authorId: this.user.uid,
            authorEmail: this.user.email,
            timestamp: firebase.firestore.FieldValue.serverTimestamp()
        };

        try {
            const docRef = await this.db.collection('reports').add(reportData);
            this.addReportToMap(docRef.id, reportData);
            this.closeReportModal();
            document.getElementById('report-form').reset();
        } catch (error) {
            console.error("Error submitting report:", error);
            alert("Failed to submit report. Please try again.");
        }
    }

    addReportToMap(docId, data) {
        if (this.markers[docId]) return;

        const latlng = new L.LatLng(data.lat, data.lng);
        const marker = L.marker(latlng, {
            draggable: this.user && this.user.uid === data.authorId,
            icon: this.createColoredIcon(data.color)
        }).addTo(this.map);

        marker.id = docId;
        this.markers[docId] = { marker, ...data };

        // Drag update logic
        if (this.user && this.user.uid === data.authorId) {
            marker.on('dragend', (e) => {
                const newLatLng = e.target.getLatLng();
                this.db.collection('reports').doc(docId).update({ lat: newLatLng.lat, lng: newLatLng.lng });
            });
        }
        
        // Popup Content
        const popupContent = `
            <div style="min-width: 200px;">
                <h3 style="margin: 0 0 8px 0; color: ${data.color};">${data.title}</h3>
                <p style="margin: 0 0 8px 0; font-size: 13px;">${data.details}</p>
                <div style="background: rgba(255,255,255,0.1); padding: 8px; border-radius: 4px; font-size: 12px; margin-bottom: 8px;">
                    <div><strong>EMF:</strong> ${data.readings?.emf || 'N/A'} mG</div>
                    <div><strong>Temp:</strong> ${data.readings?.temp || 'N/A'} °C</div>
                    <div><strong>Sound:</strong> ${data.readings?.sound || 'N/A'} dB</div>
                </div>
                <small style="display:block; color: #888;">Investigator: ${data.authorEmail}</small>
                ${this.user && this.user.uid === data.authorId ? 
                    `<button class="btn btn-secondary mt-1" onclick="app.deleteReport('${docId}')" style="font-size: 12px; padding: 4px 8px;">Delete Report</button>` 
                    : ''}
            </div>
        `;
        marker.bindPopup(popupContent);
    }

    // --- FIRESTORE OPERATIONS ---

    async loadReportsFromFirestore() {
        this.clearMarkers();
        try {
            const snapshot = await this.db.collection('reports').get();
            snapshot.forEach(doc => this.addReportToMap(doc.id, doc.data()));
        } catch (error) {
            console.error("Error loading reports: ", error);
        }
    }

    async deleteReport(docId) {
        if (!confirm('Are you sure you want to delete this report?')) return;
        try {
            await this.db.collection('reports').doc(docId).delete();
            this.map.removeLayer(this.markers[docId].marker);
            delete this.markers[docId];
        } catch (error) {
            console.error("Error deleting report: ", error);
        }
    }

    // --- HELPERS ---
    createColoredIcon(color) {
        return L.divIcon({
            className: 'custom-div-icon',
            html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 8.01 7.462 16.51 11.232 23.468a.998.998 0 001.536 0C16.538 28.51 24 20.01 24 12 24 5.373 18.627 0 12 0zm0 18a6 6 0 110-12 6 6 0 010 12z" fill="${color}"/></svg>`,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -36]
        });
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.app = new AetherAtlas(firebaseConfig);
});
