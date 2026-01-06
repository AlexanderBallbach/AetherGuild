
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getFirestore, collection, addDoc, onSnapshot, query, Timestamp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";

// --- Firebase & App Config ---
const firebaseConfig = typeof __firebase_config !== 'undefined' ? JSON.parse(__firebase_config) : {};
const appId = typeof __app_id !== 'undefined' ? __app_id : 'default-app-id';
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
let user = null;

// --- Map Setup ---
const map = L.map('map', { zoomControl: false, center: [20, 0], zoom: 2 });
L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; OpenStreetMap & CartoDB'
}).addTo(map);

// --- Authentication ---
onAuthStateChanged(auth, (u) => {
    user = u;
    if (user) {
        startDataSubscription();
    }
});

const initAuth = async () => {
    try {
        if (typeof __initial_auth_token !== 'undefined' && __initial_auth_token) {
            await signInWithCustomToken(auth, __initial_auth_token);
        } else {
            await signInAnonymously(auth);
        }
    } catch (err) {
        console.error("Authentication Error:", err);
    }
};
initAuth();

// --- Data Subscription ---
function startDataSubscription() {
    if (!user) return;
    const publicDataPath = collection(db, 'artifacts', appId, 'public', 'data', 'phenomena');
    const q = query(publicDataPath);

    onSnapshot(q, (snapshot) => {
        snapshot.docChanges().forEach((change) => {
            if (change.type === "added") {
                const data = change.doc.data();
                if (!data.lat || !data.lng) return;
                createMarker(data);
            }
        });
    }, (error) => console.error("Firestore Listen Error:", error));
}

// --- Marker Creation & Sidebar Logic ---
function createMarker(data) {
    const marker = L.circleMarker([data.lat, data.lng], {
        color: '#22d3ee', radius: 6, fillColor: '#22d3ee', fillOpacity: 0.6, weight: 1
    }).addTo(map);

    marker.on('click', async () => {
        // --- Populate Basic Info ---
        document.getElementById('p-name').innerText = data.name;
        document.getElementById('p-coord').innerText = `${data.lat.toFixed(3)}, ${data.lng.toFixed(3)}`;
        document.getElementById('p-desc').innerText = data.description;
        document.getElementById('p-type').innerText = data.type || "Unclassified";
        document.getElementById('p-val').innerText = (data.validity || Math.floor(Math.random() * 40 + 30)) + "%";

        // --- Populate Sensor Data ---
        document.getElementById('p-emf').innerText = data.emf || '--';
        document.getElementById('p-temp').innerText = data.temp || '--';
        document.getElementById('p-noise').innerText = data.noise || '--';

        // --- Fetch & Populate Environmental Data ---
        await updateEnvironmentalData(data.lat, data.lng);

        document.getElementById('sidebar').classList.remove('translate-x-full');
    });
}

// --- Environmental Data Fetching ---
async function updateEnvironmentalData(lat, lng) {
    // Weather
    try {
        const weatherResponse = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lng}&current_weather=true`);
        const weatherData = await weatherResponse.json();
        const weatherString = weatherCodeToString(weatherData.current_weather.weathercode);
        document.getElementById('p-weather').innerText = `${weatherString} (${weatherData.current_weather.temperature}°C)`;
    } catch (e) {
        document.getElementById('p-weather').innerText = 'Error';
    }

    // Moon Phase
    const moonIllumination = SunCalc.getMoonIllumination(new Date());
    const phase = moonIllumination.phase;
    document.getElementById('p-moon').innerText = moonPhaseToString(phase);
}

function moonPhaseToString(phase) {
    if (phase < 0.03 || phase > 0.97) return 'New Moon';
    if (phase < 0.22) return 'Waxing Crescent';
    if (phase < 0.28) return 'First Quarter';
    if (phase < 0.47) return 'Waxing Gibbous
    if (phase < 0.53) return 'Full Moon';
    if (phase < 0.72) return 'Waning Gibbous';
    if (phase < 0.78) return 'Last Quarter';
    return 'Waning Crescent';
}

function weatherCodeToString(code) {
    const codes = {0: 'Clear sky', 1: 'Mainly clear', 2: 'Partly cloudy', 3: 'Overcast', 45: 'Fog', 48: 'Depositing rime fog', 51: 'Light drizzle', 53: 'Drizzle', 55: 'Dense drizzle', 61: 'Slight rain', 63: 'Rain', 65: 'Heavy rain', 71: 'Slight snow', 73: 'Snow', 75: 'Heavy snow', 80: 'Slight showers', 81: 'Showers', 82: 'Violent showers', 95: 'Thunderstorm'};
    return codes[code] || 'Unknown';
}

// --- Form Submission ---
document.getElementById('reportForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!user) { console.error("Authentication required."); return; }

    navigator.geolocation.getCurrentPosition(async (position) => {
        const report = {
            name: document.getElementById('formName').value,
            type: document.getElementById('formType').value,
            description: document.getElementById('formDesc').value,
            lat: position.coords.latitude,
            lng: position.coords.longitude,
            emf: document.getElementById('formEmf').value || null,
            temp: document.getElementById('formTemp').value || null,
            noise: document.getElementById('formNoise').value || null,
            timestamp: Timestamp.now(),
            userId: user.uid
        };
        
        try {
            const publicDataPath = collection(db, 'artifacts', appId, 'public', 'data', 'phenomena');
            await addDoc(publicDataPath, report);
            toggleModal('submit-modal');
            document.getElementById('reportForm').reset();
        } catch (err) {
            console.error("Error writing to Firestore:", err);
        }
    }, (err) => {
        console.error("Geolocation Error:", err);
        alert("Could not get your location. Please enable location services.");
    });
});

// --- UI Helpers ---
window.closeSidebar = () => document.getElementById('sidebar').classList.add('translate-x-full');
window.toggleModal = (id) => document.getElementById(id).classList.toggle('hidden');
