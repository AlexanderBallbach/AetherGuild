# Aether Guild | Project Bible & Vision Document

**Version:** 2.2 (MapLibre Migration)
**Status:** In Development
**Founder:** Alexander Ballbach
**Organization:** The Aether Guild

---

## 1. Core Vision: A Clinical Research Platform for Anomalous Phenomena

The Aether Guild platform is a **laboratory-grade, collaborative intelligence tool** designed to elevate the study of paranormal, spiritual, and unexplained events from anecdotal accounts into a rigorous, data-driven science.

Its primary purpose is to be a secure, professional, and scientifically-minded platform that empowers a community of "Investigators" to collaboratively map and understand the unexplained. The project is framed as the official **"Aether Guild Global Atlas & Research Archive,"** an integrated system where geospatial data and a deep knowledge base enrich one another.

---

## 2. Design Philosophy: The "Aetheric Interface"

The UI/UX is built on a crucial duality: it must be a **"sleek, vibrant, and sexy web app"** while simultaneously feeling **"mature, clinical, and sophisticated."** The aesthetic is that of a high-tech laboratory instrument—precise, data-driven, yet beautiful and engaging to use.

*   **Aesthetic:** Clean, fast, and data-forward. The interface uses the `Exo` font family for a technical yet readable feel. Animations are purposeful and subtle, reinforcing the sense of a responsive, high-tech tool.
*   **Theming:** A custom CSS variable system (`style.css`) enables a seamless user experience.
    *   **Modes:** Supports both **Light and Dark modes**.
    *   **Customization:** Users can change the primary accent color and choose from pre-designed themes.
*   **Gamification:** The system for ranks and reputation is subtle and professional, signifying career progression rather than "playing a game." The goal is to reward quality contributions with greater responsibility.

---

## 3. Core Features & Systems Architecture

The platform is a single-page application built on a unified `index.html` shell that dynamically renders two primary views: The Atlas and The Aetherpedia.

### A. The Geospatial Atlas (Mapping Specification)

The Atlas has been migrated to **MapLibre GL JS** to support vector tiles, 3D terrain, and high-performance rendering.

#### 1. Core Architecture (The Basics)
*   **Layer Control (Basemaps):** A toggle to switch between "Clinical Dark" (vector tiles), "Satellite/Topographic" (for terrain analysis), "Light Mode" (high contrast), and "Heatmap" (density visualization).
*   **Dynamic Clustering:** When zoomed out, thousands of points group into clusters with a count (e.g., "142 Phenomena in MN"). Clicking expands the cluster.
*   **Search & Geocoding:** A clinical search bar that allows investigators to jump to specific coordinates, cities, or named landmarks.
*   **Coordinate Display:** A persistent readout in the header or footer showing the exact Latitude/Longitude of the cursor's current hover position.
*   **Scale Bar:** A metric/imperial scale bar in the corner.
*   **Dynamic Legend:** A smart legend that adapts to show only the symbols relevant to the currently enabled layers.

#### 2. Advanced Layer Systems (Categorized Dropdowns)
Layers are organized into nested dropdowns to manage visual complexity, similar to Google Earth Pro.

*   **Infrastructure Layers (Interference Analysis):**
    *   **Power Grid:** High-voltage lines and substations (to rule out EMF hallucinations).
    *   **Telecoms:** Cell towers and radio antennas.
    *   **Rail Network:** Active and abandoned railway lines.
*   **Hydrological Layers (Energy Theory):**
    *   **Waterways:** Rivers, lakes, and aquifers (tracking the "Stone Tape" theory of energy conduction via water).
*   **Anthropological Layers:**
    *   **Historical Land Use:** Cemeteries, battlefields, and ancient settlements.
    *   **Borders:** Hierarchical borders for Country, State/Province, and Property (with ownership info on hover where available).
*   **Transportation & Pathways:**
    *   **Highways & Streets:** Standard vehicular navigation layers.
    *   **Walkways & Cycle Paths:** Dedicated layers for pedestrian-accessible areas often frequented by investigators.
*   **Labels & Overlays:**
    *   **Place Labels:** Plain white text (in Dark Mode) that dynamically fades out when zooming out to reduce clutter.
    *   **Landmarks:** Overlay for named points of interest.

#### 3. Clinical Field Tools (Interaction)
*   **Zoom Acceleration Slider:** A vertical slider with "+" and "-" buttons that offers smooth, interpolated zooming physics (momentum-based), mimicking Google Earth Pro.
*   **Smooth Keyboard Navigation:** WASD/Arrow keys allow for fluid, diagonal panning with momentum/smoothing, eliminating "jerky" step-movements.
*   **The Chronos Slider:** A timeline tool to "scrub" through history and visualize phenomena density changes over decades.
*   **Spatial Filters:** Filter visible pins by manifestation type or environmental conditions (e.g., "Show only pins submitted during a New Moon").
*   **User Geolocation:** A "Center on My Location" button using browser GPS.

#### 4. The Aether Protocols (Unique Features)
*   **Special Marker Bezels:** Markers display different bezels based on their "Validity Score" or "Recency."
*   **Redaction Blur:** "Closed Phenomena" appear as translucent blur zones rather than pins to protect culturally sensitive locations.
*   **Sidebar Data Injection:** Clicking a marker triggers a "Neural Handshake," populating the sidebar with witness logs and metadata.
*   **Dodecahedron Compass:** A 3D UI element that rotates toward the nearest "Active" phenomenon.

---

### B. The Clinical Submission Engine

*   **Structured Data:** Investigators file structured "Field Reports" via a detailed modal form.
*   **Manual Entry:** Fields for **EMF (mG), Temperature (°C), and Sound (dB)**.
*   **Automated Metadata Enrichment:**
    *   **Astronomical:** Moon Phase, illumination.
    *   **Environmental:** Weather, barometric pressure.
    *   **Geomagnetic:** Solar Activity (Kp-Index).

### C. The Aetherpedia (The Archive & Wiki)

*   **Functionality:** A dynamic, multi-page knowledge base backed by Firestore.
*   **Wikipedia Integration:**
    *   **Unified Search:** Queries both Aetherpedia and Wikipedia APIs.
    *   **On-Demand Import:** Users can import Wikipedia articles, which are sanitized and stored in the Guild's database with proper attribution.

### D. Investigator Ranking & Peer Review

*   **Meritocracy:** Ranks (Witness to Guild Master) based on contribution quality.
*   **Three-Stage Review:** Community Triage -> Official Review -> Verification & Badging (`Guild Certified`, `Science-Backed`).

### E. Trust, Ethics & Security

*   **Private Pins:** Zero-knowledge encrypted user notes.
*   **Closed Phenomena:** "Sensitivity" flags for restricted content.
*   **Anonymous Research:** Protocols for data sharing in large-scale studies.

---

## 4. Technical Stack & Architecture

*   **Frontend:** Vanilla JavaScript SPA.
    *   **Styling:** Custom "Aetheric Interface" CSS system (Glassmorphism, Dark/Light modes).
    *   **Mapping Engine:** **MapLibre GL JS** (Vector tiles, WebGL).
*   **Backend:** Google Firebase (Firestore, Auth, Functions).
*   **CI/CD:** GitHub Actions for automated Firebase Hosting deployment.

---

## 5. Setup & Development

1.  **Firebase Configuration:** `firebase-config.js` (gitignored).
2.  **GitHub Secrets:** `FIREBASE_SERVICE_ACCOUNT...` for CI/CD.
3.  **Local Emulators:** `firebase emulators:start` for offline testing.

This document serves as the master specification for the Aether Guild platform.
