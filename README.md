# Aether Guild | Project Bible & Vision Document

**Version:** 2.0
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

### A. The Geospatial Atlas (The GIS)

*   **Technology:** A high-performance, real-time map powered by Leaflet.js.
*   **Functionality:** Visualizes "Field Reports" as markers on a global map. Popups on each marker provide a summary of the report and a direct link to the full article in the Aetherpedia, fulfilling the core "Integrated Wiki-Map UI" concept.

### B. The Clinical Submission Engine

*   **Structured Data:** Investigators file structured "Field Reports" via a detailed modal form, not simple articles.
*   **Manual Entry:** Fields for manual sensor readings are provided: **EMF (mG), Temperature (°C), and Sound (dB)**.
*   **Automated Metadata Enrichment:** A (currently disabled) Cloud Function is designed to automatically enrich each report upon submission with objective data:
    *   **Astronomical Data:** Moon Phase, illumination.
    *   **Environmental Data:** Weather conditions, barometric pressure.
    *   **Geomagnetic Data:** Solar Activity (Kp-Index).

### C. The Aetherpedia (The Archive & Wiki)

*   **Functionality:** A dynamic, multi-page knowledge base that serves as the central repository for deep-dive research.
*   **Content Strategy:** Solves the "empty-room problem" with an on-demand import system.
    *   **Unified Search:** The main search bar queries both the internal Aetherpedia database (Firestore `articles` collection) and the live Wikipedia API.
    *   **On-Demand Import:** Users can choose to import a Wikipedia article. A Cloud Function fetches the article, sanitizes its HTML to match the Aetheric Interface style, and saves it to the Firestore database.
    *   **Attribution:** Imported articles automatically display a banner linking to the original Wikipedia source, complying with the Creative Commons Attribution-ShareAlike License.

### D. Investigator Ranking & Peer Review

*   **Meritocracy of Curation:** The ranking system is a meritocracy for **moderation and content curation**, not for accessing private data.
*   **Ranks:** Users progress from Rank 0 (Witness) to Rank 4 (Guild Master) based on the quality of their contributions. Higher ranks grant the ability to review and verify submissions.
*   **Three-Stage Review Pipeline:**
    1.  **Community Triage:** New reports enter a public "New Reports" feed where the community can vote and comment.
    2.  **Official Review:** High-ranking "Reviewers" use community feedback to prioritize and promote reports for official review.
    3.  **Verification & Publication:** A verified report is published to the main Archive, integrated into the Atlas, and assigned **Validation Badges** (`Guild Certified`, `Science-Backed`, `Historical/Legal`).

### E. "The Black Box": Trust, Ethics & Security

*   **Private Pins:** A future goal is to implement zero-knowledge encrypted pins, allowing users to keep private research notes that are unreadable by anyone else, including administrators.
*   **Closed Phenomena:** A "sensitivity" flag will be added to reports to manage access to culturally sensitive or restricted information, accessible only by high-level Guild members.
*   **Anonymous Research:** Users will be able to consent to their anonymized data being used in large-scale statistical studies conducted by the Guild.

---

## 4. Technical Stack & Architecture

*   **Frontend:** A vanilla JavaScript single-page application (SPA).
    *   **Styling:** A custom, themeable CSS design system (`style.css`). No utility-first frameworks like Tailwind are used, though Tailwind's design patterns serve as inspiration.
    *   **Mapping:** Leaflet.js.
*   **Backend:** Google Firebase
    *   **Database:** Cloud Firestore (for reports, articles, and user profiles).
    *   **Authentication:** Firebase Authentication for secure user management.
    *   **Serverless Logic:** Cloud Functions for Firebase (written in Node.js) for backend automation (e.g., creating user profiles, metadata enrichment).
*   **CI/CD:** Automated deployments to Firebase Hosting are configured via a GitHub Actions workflow (`.github/workflows/firebase-deploy.yml`).

---

## 5. Setup & Future Development

1.  **Firebase Configuration:** The project requires a `firebase-config.js` file (gitignored) containing the Firebase project's configuration object.
2.  **GitHub Actions Secret:** For CI/CD to function, a repository secret named `FIREBASE_SERVICE_ACCOUNT_AETHERGUILD_37084708_FA531` must be created with the JSON key from a Google Cloud service account.
3.  **Local Development:** The Firebase Local Emulator Suite is used for local testing of Hosting, Firestore, and Auth services. Run `firebase emulators:start`.

This document provides a complete overview of the Aether Guild platform's vision, architecture, and implementation details.
