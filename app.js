document.addEventListener('DOMContentLoaded', () => {
    let map;
    let markers = {};
    let currentId = 0;
    let isAddingMarker = false;
    let currentTileLayer = null;
    let terminator = null;

    const TILE_LAYERS = {
        dark: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        satellite: 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}',
        street: 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
        terrain: 'https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png',
    };

    const TILE_LAYER_ATTRIBUTIONS = {
        dark: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
        satellite: 'Tiles &copy; Esri &mdash; Source: Esri, i-cubed, USDA, USGS, AEX, GeoEye, Getmapping, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community',
        street: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
        terrain: 'Map data: &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, <a href="http://viewfinderpanoramas.org">SRTM</a> | Map style: &copy; <a href="https://opentopomap.org">OpenTopoMap</a> (<a href="https://creativecommons.org/licenses/by-sa/3.0/">CC-BY-SA</a>)',
    };

    // --- INITIALIZATION ---
    function init() {
        initMapPage();
        attachEventListeners();
        updateMarkerList();
        updateTerminator();
        setInterval(updateTerminator, 60000); // Update every minute
    }

    function initMapPage() {
        initMap();
    }

    function initMap() {
        map = L.map('map', {
            worldCopyJump: true,
            maxBounds: [[-90, -180], [90, 180]] // Prevent excessive panning
        }).setView([20, 0], 2); // Default view

        setTileLayer('dark'); // Set default tile layer
    }

    // --- EVENT LISTENERS ---
    function attachEventListeners() {
        document.getElementById('tile-layer-select').addEventListener('change', (e) => setTileLayer(e.target.value));
        document.getElementById('add-marker-btn').addEventListener('click', toggleAddMarkerMode);
        document.getElementById('import-geojson-btn').addEventListener('click', () => document.getElementById('import-geojson-input').click());
        document.getElementById('import-geojson-input').addEventListener('change', handleGeoJSONImport);
        document.getElementById('export-geojson-btn').addEventListener('click', exportToGeoJSON);
        document.getElementById('clear-all-btn').addEventListener('click', clearAllMarkers);
        document.getElementById('toggle-controls-btn').addEventListener('click', toggleControlsVisibility);

        map.on('click', onMapClick);
    }

    // --- MAP & TILE LAYER FUNCTIONS ---
    function setTileLayer(layerKey) {
        if (currentTileLayer) {
            map.removeLayer(currentTileLayer);
        }
        currentTileLayer = L.tileLayer(TILE_LAYERS[layerKey], {
            attribution: TILE_LAYER_ATTRIBUTIONS[layerKey],
            maxZoom: 19,
        }).addTo(map);
    }

    function updateTerminator() {
        if (terminator) {
            map.removeLayer(terminator);
        }
        terminator = L.terminator().addTo(map);
    }

    // --- MARKER MANAGEMENT ---
    function toggleAddMarkerMode() {
        isAddingMarker = !isAddingMarker;
        const btn = document.getElementById('add-marker-btn');
        const mapContainer = document.getElementById('map');
        btn.textContent = isAddingMarker ? 'Cancel Adding' : 'Add Marker';
        btn.classList.toggle('button-secondary', isAddingMarker);
        mapContainer.style.cursor = isAddingMarker ? 'crosshair' : '';
    }

    function onMapClick(e) {
        if (isAddingMarker) {
            const name = document.getElementById('marker-name').value.trim() || 'Unnamed Marker';
            const color = document.getElementById('marker-color').value;
            addMarker(e.latlng, name, color);
            toggleAddMarkerMode(); // Exit adding mode after placing a marker
        }
    }

    function addMarker(latlng, name, color, id = null) {
        const markerId = id !== null ? id : ++currentId;
        if (id !== null && markerId > currentId) currentId = markerId;

        const marker = L.marker(latlng, {
            draggable: true,
            icon: createColoredIcon(color)
        }).addTo(map);

        marker.id = markerId;
        markers[markerId] = { marker, name, color };

        marker.on('dragend', () => updateMarkerList());
        marker.on('popupopen', () => {
            document.querySelector(`.popup-delete-btn[data-id="${markerId}"]`).addEventListener('click', () => {
                removeMarker(markerId);
                map.closePopup();
            });
        });

        bindPopupToMarker(markerId);
        updateMarkerList();
    }

    function removeMarker(id) {
        if (markers[id]) {
            map.removeLayer(markers[id].marker);
            delete markers[id];
            updateMarkerList();
        }
    }

    function clearAllMarkers() {
        if (confirm('Are you sure you want to delete all markers?')) {
            Object.keys(markers).forEach(id => map.removeLayer(markers[id].marker));
            markers = {};
            currentId = 0;
            updateMarkerList();
        }
    }

    function bindPopupToMarker(id) {
        const { marker, name } = markers[id];
        const latlng = marker.getLatLng();
        const popupContent = 
            `<b>${name}</b><br>` +
            `Lat: ${latlng.lat.toFixed(4)}, Lng: ${latlng.lng.toFixed(4)}<br>` +
            `<div class="popup-actions"><button class="button button-danger popup-delete-btn" data-id="${id}">Delete</button></div>`;
        marker.bindPopup(popupContent);
    }

    // --- UI & LIST MANAGEMENT ---
    function updateMarkerList() {
        const list = document.getElementById('marker-list');
        list.innerHTML = '';
        if (Object.keys(markers).length === 0) {
            list.innerHTML = '<li>No markers placed.</li>';
            return;
        }

        Object.entries(markers).forEach(([id, data]) => {
            const { marker, name, color } = data;
            const listItem = document.createElement('li');
            listItem.className = 'marker-list-item';
            listItem.style.setProperty('--marker-color', color);

            listItem.innerHTML = `
                <div class="marker-item-info" title="${name}">
                    <span class="marker-item-name">${name}</span>
                </div>
                <div class="marker-item-actions">
                    <button class="edit-marker-btn" title="Edit Name"><i class="fas fa-edit"></i></button>
                    <button class="delete-marker-btn" title="Delete Marker"><i class="fas fa-trash-alt"></i></button>
                </div>
            `;

            listItem.querySelector('.marker-item-info').addEventListener('click', () => {
                map.setView(marker.getLatLng(), Math.max(map.getZoom(), 5));
                marker.openPopup();
            });
            listItem.querySelector('.delete-marker-btn').addEventListener('click', () => removeMarker(id));
            listItem.querySelector('.edit-marker-btn').addEventListener('click', () => editMarkerName(id));
            
            list.appendChild(listItem);
        });
    }

    function editMarkerName(id) {
        const newName = prompt('Enter new marker name:', markers[id].name);
        if (newName && newName.trim() !== '') {
            markers[id].name = newName.trim();
            bindPopupToMarker(id);
            updateMarkerList();
        }
    }

    function toggleControlsVisibility() {
        const content = document.getElementById('controls-content');
        const btn = document.getElementById('toggle-controls-btn');
        const isVisible = content.style.display !== 'none';
        content.style.display = isVisible ? 'none' : '';
        btn.innerHTML = isVisible ? '<i class="fas fa-eye"></i>' : '<i class="fas fa-eye-slash"></i>';
        btn.title = isVisible ? 'Show Controls' : 'Hide Controls';
    }

    // --- DATA I/O ---
    function handleGeoJSONImport(event) {
        const file = event.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const geojsonData = JSON.parse(e.target.result);
                importFromGeoJSON(geojsonData);
            } catch (error) {
                alert('Error parsing GeoJSON file.');
            }
        };
        reader.readAsText(file);
        event.target.value = '';
    }

    function importFromGeoJSON(geojsonData) {
        if (!confirm('This will clear existing markers. Are you sure?')) return;
        
        clearAllMarkers();

        geojsonData.features.forEach(feature => {
            if (feature.geometry.type === 'Point') {
                const [lng, lat] = feature.geometry.coordinates;
                const name = feature.properties.name || 'Imported Marker';
                const color = feature.properties.color || '#007bff';
                addMarker(L.latLng(lat, lng), name, color, feature.properties.id);
            }
        });
    }

    function exportToGeoJSON() {
        const features = Object.entries(markers).map(([id, { marker, name, color }]) => {
            const latlng = marker.getLatLng();
            return {
                type: 'Feature',
                properties: { id: parseInt(id), name, color },
                geometry: { type: 'Point', coordinates: [latlng.lng, latlng.lat] }
            };
        });
        const geojson = { type: 'FeatureCollection', features };
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(geojson, null, 2));
        const dl = document.createElement('a');
        dl.setAttribute("href", dataStr);
        dl.setAttribute("download", "aether-atlas-markers.geojson");
        document.body.appendChild(dl);
        dl.click();
        dl.remove();
    }

    // --- HELPERS ---
    function createColoredIcon(color) {
        return L.divIcon({
            className: 'custom-div-icon',
            html: `<svg width="24" height="36" viewBox="0 0 24 36" xmlns="http://www.w3.org/2000/svg"><path d="M12 0C5.373 0 0 5.373 0 12c0 8.01 7.462 16.51 11.232 23.468a.998.998 0 001.536 0C16.538 28.51 24 20.01 24 12 24 5.373 18.627 0 12 0zm0 18a6 6 0 110-12 6 6 0 010 12z" fill="${color}"/></svg>`,
            iconSize: [24, 36],
            iconAnchor: [12, 36],
            popupAnchor: [0, -36]
        });
    }

    // --- LET'S GO ---
    init();
});
