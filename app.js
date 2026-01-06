
document.addEventListener('DOMContentLoaded', () => {

    // --- Firebase Config ---
    const firebaseConfig = {
        "projectId": "aetherguild-37084708-fa531",
        "appId": "1:1020806444380:web:ea9a30f7705a294fc1fd99",
        "storageBucket": "aetherguild-37084708-fa531.firebasestorage.app",
        "apiKey": "AIzaSyAEven_LdLIDeHaCI3ayto4XVDt2hBMOx4",
        "authDomain": "aetherguild-37084708-fa531.firebaseapp.com",
        "messagingSenderId": "1020806444380"
    };

    // --- Global State ---
    let map, auth, db, user, activeTileLayer;
    let markerColor = '#ff00ff';
    const allMarkers = {};

    // --- Main Initializer ---
    function init() {
        firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();

        if (document.getElementById('map')) {
            initMapPage();
        } else if (document.getElementById('wiki-content-full')) {
            initAetherpediaPage();
        }
        
        initAuth();
    }

    // --- Page-Specific Initializers ---
    function initMapPage() {
        initMap();
        initUI();
        startDataSubscription();
    }

    function initAetherpediaPage() {
        const params = new URLSearchParams(window.location.search);
        const docId = params.get('id');
        if (docId) {
            fetchAndDisplayEntity(docId);
        } else {
            // Optional: Display general stats if no specific ID is provided
            fetchAndDisplayRegistryStats();
        }
    }

    // --- Authentication ---
    function initAuth() {
        auth.onAuthStateChanged(u => {
            user = u;
            if (user && document.getElementById('log-experience-btn')) {
                document.getElementById('log-experience-btn').disabled = false;
            } else if (!user) {
                auth.signInAnonymously().catch(err => console.error("Anonymous sign-in failed", err));
            }
        });
    }

    // --- Map Page Functions ---
    function initMap() {
        map = L.map('map', { zoomControl: false, center: [20, 0], zoom: 2 });
        L.control.scale({ imperial: false }).addTo(map);
        const savedMapLayer = localStorage.getItem('mapLayer') || 'Dark';
        setTileLayer(savedMapLayer);
        navigator.geolocation.getCurrentPosition(
            (pos) => map.flyTo([pos.coords.latitude, pos.coords.longitude], 7),
            () => console.log("Geolocation permission denied. Defaulting to global view.")
        );
    }

    function initUI() {
        const savedTheme = localStorage.getItem('theme') || 'aether';
        setTheme(savedTheme);
        document.getElementById('theme-select').value = savedTheme;
        const savedMarkerColor = localStorage.getItem('markerColor') || '#ff00ff';
        document.getElementById('marker-color-input').value = savedMarkerColor;
        setMarkerColor(savedMarkerColor);
        buildLayerControls();
        attachEventListeners();
        document.getElementById('settings-sidebar').style.transform = 'translateX(100%)';
        document.getElementById('map-layers-panel').classList.add('panel-hidden-bottom');
        document.getElementById('advanced-settings-modal').style.display = 'none';
        document.getElementById('submit-modal').style.display = 'none';
    }

    function attachEventListeners() {
        document.getElementById('log-experience-btn').addEventListener('click', () => toggleModal('submit-modal'));
        document.getElementById('toggle-layers-btn').addEventListener('click', toggleMapLayers);
        document.getElementById('toggle-settings-btn').addEventListener('click', toggleSettings);
        document.getElementById('close-settings-btn').addEventListener('click', toggleSettings);
        document.getElementById('theme-select').addEventListener('change', (e) => setTheme(e.target.value));
        document.getElementById('advanced-settings-btn').addEventListener('click', () => toggleModal('advanced-settings-modal'));
        document.getElementById('close-advanced-settings-btn').addEventListener('click', () => toggleModal('advanced-settings-modal'));
        document.getElementById('marker-color-input').addEventListener('input', (e) => setMarkerColor(e.target.value));
        document.getElementById('enable-weather-layers-checkbox').addEventListener('change', (e) => {
            const weatherCheckbox = document.querySelector('input[name="overlay-layer"][value="Weather"]');
            if(weatherCheckbox) weatherCheckbox.parentElement.style.display = e.target.checked ? 'flex' : 'none';
        });
        document.getElementById('close-submit-modal-btn').addEventListener('click', () => toggleModal('submit-modal'));
        document.getElementById('cancel-submit-btn').addEventListener('click', () => toggleModal('submit-modal'));
        document.getElementById('reportForm').addEventListener('submit', handleReportSubmit);
        document.getElementById('map-layers-container').addEventListener('change', handleLayerChange);
    }

    function startDataSubscription() {
        db.collection('phenomena').onSnapshot(snapshot => {
            snapshot.docChanges().forEach(change => {
                if (change.type === 'added') {
                    createMarker(change.doc.id, change.doc.data());
                }
            });
        }, err => console.error("Firestore subscription error:", err));
    }

    const tileLayers = {
        'Dark': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap & CartoDB' }),
        'Satellite': L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', { attribution: 'Tiles &copy; Esri' }),
        'Light': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap & CartoDB' }),
    };

    const overlayLayers = {
        'Weather': L.tileLayer('https://tile.openweathermap.org/map/temp_new/{z}/{x}/{y}.png?appid=5905299949788d3725d257e44e789d38', { attribution: '&copy; OpenWeatherMap' }),
        'Borders': L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '&copy; OpenStreetMap' }),
        'Place Names': L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager_only_labels/{z}/{x}/{y}{r}.png', { attribution: '&copy; OpenStreetMap & CartoDB' }),
    };

    function setTileLayer(name) {
        if (activeTileLayer) map.removeLayer(activeTileLayer);
        activeTileLayer = tileLayers[name];
        activeTileLayer.addTo(map);
        localStorage.setItem('mapLayer', name);
    }

    function toggleOverlayLayer(name, enabled) {
        if (enabled) overlayLayers[name].addTo(map);
        else map.removeLayer(overlayLayers[name]);
    }

    function createMarker(id, data) {
        if (data.lat == null || data.lng == null) return;
        const marker = L.circleMarker([data.lat, data.lng], {
            radius: 8, fillOpacity: 0.7, weight: 1, color: markerColor, fillColor: markerColor
        }).addTo(map);

        allMarkers[id] = marker;
        const popupContent = `<div class="map-popup"><h3 class="font-bold text-lg text-primary uppercase">${data.name}</h3><p class="text-secondary text-sm mb-2">${data.type || 'Unclassified'}</p><button id="popup-details-${id}" class="button-primary text-xs py-1 px-3">Details</button></div>`;
        marker.bindPopup(popupContent);
        marker.on('dblclick', () => map.flyTo([data.lat, data.lng], 10));
        marker.on('popupopen', () => {
            document.getElementById(`popup-details-${id}`).onclick = () => window.location.href = `aetherpedia.html?id=${id}`;
        });
    }

    function toggleModal(id) {
        const modal = document.getElementById(id);
        if (modal) modal.style.display = (modal.style.display === 'none' || modal.style.display === '') ? 'flex' : 'none';
    }

    function toggleMapLayers() {
        document.getElementById('map-layers-panel').classList.toggle('panel-hidden-bottom');
    }

    function toggleSettings() {
        const panel = document.getElementById('settings-sidebar');
        panel.style.transform = panel.style.transform === 'translateX(0%)' ? 'translateX(100%)' : 'translateX(0%)';
    }

    function buildLayerControls() {
        const container = document.getElementById('map-layers-container');
        const savedMapLayer = localStorage.getItem('mapLayer') || 'Dark';
        let base = '<h3 class="text-lg font-light text-primary uppercase tracking-tighter mb-2">Base Layers</h3>';
        Object.keys(tileLayers).forEach(name => { base += `<label class="flex items-center gap-2 text-secondary"><input type="radio" name="map-layer" value="${name}" ${name === savedMapLayer ? 'checked' : ''}> ${name}</label>`; });
        let overlay = '<h3 class="text-lg font-light text-primary uppercase tracking-tighter mt-4 mb-2">Overlay Layers</h3>';
        Object.keys(overlayLayers).forEach(name => { overlay += `<label class="flex items-center gap-2 text-secondary"><input type="checkbox" name="overlay-layer" value="${name}"> ${name}</label>`; });
        container.innerHTML = base + overlay;
        const weatherCheckbox = container.querySelector('input[name="overlay-layer"][value="Weather"]');
        if (weatherCheckbox) weatherCheckbox.parentElement.style.display = 'none'; // Hide by default
    }

    function handleLayerChange(e) {
        if (e.target.name === 'map-layer') setTileLayer(e.target.value);
        if (e.target.name === 'overlay-layer') toggleOverlayLayer(e.target.value, e.target.checked);
    }

    function handleReportSubmit(e) {
        e.preventDefault();
        if (!user) { alert("Authentication required."); return; }
        navigator.geolocation.getCurrentPosition(pos => {
            const report = {
                name: document.getElementById('formName').value,
                type: document.getElementById('formType').value,
                description: document.getElementById('formDesc').value,
                lat: pos.coords.latitude, lng: pos.coords.longitude,
                emf: document.getElementById('formEmf').value || null,
                temp: document.getElementById('formTemp').value || null,
                noise: document.getElementById('formNoise').value || null,
                timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                userId: user.uid
            };
            db.collection('phenomena').add(report).then(() => {
                toggleModal('submit-modal');
                document.getElementById('reportForm').reset();
            }).catch(err => alert("Error submitting report."));
        }, () => alert("Could not get your location."));
    }

    // --- Aetherpedia Page Functions ---
    async function fetchAndDisplayEntity(docId) {
        try {
            const doc = await db.collection('phenomena').doc(docId).get();
            if (doc.exists) {
                const data = doc.data();
                document.getElementById('p-name').innerText = data.name;
                document.getElementById('p-infobox-title').innerText = data.name;
                document.getElementById('p-desc').innerText = data.description;
                document.getElementById('p-type').innerText = data.type || "Unclassified";
                document.getElementById('p-coord').innerText = `${data.lat.toFixed(3)}, ${data.lng.toFixed(3)}`;
                document.getElementById('p-val').innerText = `${data.validity || Math.floor(Math.random()*40+30)}%`;
                document.getElementById('p-emf').innerText = data.emf || '--';
                document.getElementById('p-temp').innerText = data.temp || '--';
                document.getElementById('p-noise').innerText = data.noise || '--';
                // Fetch environmental data
                fetchEnvironmentalData(data.lat, data.lng);
            } else {
                console.error("No such document!");
                document.getElementById('p-name').innerText = "Error: Entity not found";
            }
        } catch (error) {
            console.error("Error getting document:", error);
        }
    }
    
    async function fetchEnvironmentalData(lat, lng) {
        document.getElementById('p-weather').innerText = 'Loading...';
        document.getElementById('p-moon').innerText = 'Loading...';
        try {
            const response = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
            const weather = await response.json();
            document.getElementById('p-weather').innerText = `${weatherCodeToString(weather.current_weather.weathercode)} (${weather.current_weather.temperature}°C)`;
        } catch (e) { document.getElementById('p-weather').innerText = 'Error'; }
        document.getElementById('p-moon').innerText = moonPhaseToString(SunCalc.getMoonIllumination(new Date()).phase);
    }

    function fetchAndDisplayRegistryStats() {
        db.collection('phenomena').get().then(snapshot => {
            document.getElementById('stats-total').innerText = snapshot.size;
            // Add more specific stats if needed, e.g., by querying for specific fields
            document.getElementById('stats-verified').innerText = '--'; // Placeholder
            document.getElementById('stats-pending').innerText = '--'; // Placeholder
        });
    }

    // --- Theming & Helpers ---
    function setTheme(theme) {
        document.body.setAttribute('data-theme', theme);
        localStorage.setItem('theme', theme);
    }

    function setMarkerColor(color) {
        markerColor = color;
        localStorage.setItem('markerColor', color);
        Object.values(allMarkers).forEach(marker => marker.setStyle({ color: markerColor, fillColor: markerColor }));
    }

    function moonPhaseToString(p){if(p<.03||p>.97)return'New Moon';if(p<.22)return'Waxing Crescent';if(p<.28)return'First Quarter';if(p<.47)return'Waxing Gibbous';if(p<.53)return'Full Moon';if(p<.72)return'Waning Gibbous';if(p<.78)return'Last Quarter';return'Waning Crescent';}
    function weatherCodeToString(c){const d={0:'Clear sky',1:'Mainly clear',2:'Partly cloudy',3:'Overcast',45:'Fog',48:'Rime fog',51:'Light drizzle',53:'Drizzle',55:'Dense drizzle',61:'Slight rain',63:'Rain',65:'Heavy rain',71:'Slight snow',73:'Snow',75:'Heavy snow',80:'Slight showers',81:'Showers',82:'Violent showers',95:'Thunderstorm'};return d[c]||'Unknown'}

    // --- Start the App ---
    init();
});
