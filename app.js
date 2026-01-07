class AetherAtlas {
    constructor(firebaseConfig) {
        this.map = null;
        this.markers = {};
        this.currentTileLayer = null;
        this.terminator = null;
        this.isAddingMarker = false;
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
        document.getElementById('tile-layer-select').addEventListener('change', (e) => this.setTileLayer(e.target.value));
        document.getElementById('add-marker-btn').addEventListener('click', () => this.toggleAddMarkerMode());
        document.getElementById('theme-switcher').addEventListener('click', () => {
            document.body.classList.toggle('light-theme');
            feather.replace(); // Re-render icons for new theme
        });
        this.map.on('click', (e) => this.onMapClick(e));
    }

    // --- AUTHENTICATION ---

    listenForAuthStateChanges() {
        this.auth.onAuthStateChanged(user => {
            if (user) {
                this.user = user;
                this.updateAuthUI(true);
                this.loadMarkersFromFirestore();
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

    toggleAddMarkerMode() {
        this.isAddingMarker = !this.isAddingMarker;
        const btn = document.getElementById('add-marker-btn');
        const mapContainer = document.getElementById('map');
        btn.textContent = this.isAddingMarker ? 'Cancel' : 'Add Report to Map';
        mapContainer.style.cursor = this.isAddingMarker ? 'crosshair' : '';
    }

    onMapClick(e) {
        if (this.isAddingMarker && this.user) {
            const name = document.getElementById('marker-name').value.trim() || 'Unnamed Report';
            const color = document.getElementById('marker-color').value;
            this.saveMarkerToFirestore({ lat: e.latlng.lat, lng: e.latlng.lng }, name, color);
            this.toggleAddMarkerMode();
        }
    }

    addMarkerToMap(docId, data) {
        if (this.markers[docId]) return; // Avoid duplicates

        const latlng = new L.LatLng(data.lat, data.lng);
        const marker = L.marker(latlng, {
            draggable: this.user && this.user.uid === data.authorId,
            icon: this.createColoredIcon(data.color)
        }).addTo(this.map);

        marker.id = docId;
        this.markers[docId] = { marker, ...data };

        if (this.user && this.user.uid === data.authorId) {
            marker.on('dragend', (e) => {
                const newLatLng = e.target.getLatLng();
                this.db.collection('markers').doc(docId).update({ lat: newLatLng.lat, lng: newLatLng.lng });
            });
        }
        
        const popupContent = `<b>${data.name}</b><br><small>Author: ${data.authorEmail}</small>${this.user && this.user.uid === data.authorId ? `<br><button class="btn btn-secondary" onclick="app.deleteMarkerFromFirestore('${docId}')">Delete</button>` : ''}`;
        marker.bindPopup(popupContent);
    }

    // --- FIRESTORE OPERATIONS ---

    async loadMarkersFromFirestore() {
        this.clearMarkers();
        try {
            const snapshot = await this.db.collection('markers').get();
            snapshot.forEach(doc => this.addMarkerToMap(doc.id, doc.data()));
        } catch (error) {
            console.error("Error loading markers: ", error);
        }
    }

    async saveMarkerToFirestore(latlng, name, color) {
        if (!this.user) return;
        try {
            const docRef = await this.db.collection('markers').add({
                ...latlng,
                name,
                color,
                authorId: this.user.uid,
                authorEmail: this.user.email
            });
            this.addMarkerToMap(docRef.id, { ...latlng, name, color, authorId: this.user.uid, authorEmail: this.user.email });
        } catch (error) {
            console.error("Error saving marker: ", error);
        }
    }

    async deleteMarkerFromFirestore(docId) {
        if (!confirm('Are you sure you want to delete this report?')) return;
        try {
            await this.db.collection('markers').doc(docId).delete();
            this.map.removeLayer(this.markers[docId].marker);
            delete this.markers[docId];
        } catch (error) {
            console.error("Error deleting marker: ", error);
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
    // This assumes firebase-config.js has already been loaded
    window.app = new AetherAtlas(firebaseConfig);
});
