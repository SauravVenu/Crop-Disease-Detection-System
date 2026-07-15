# KRISHISEV — Smart Farm Desk

KRISHISEV is an AI-powered agricultural assistance platform designed to help farmers with crop recommendations, soil moisture analysis, leaf disease detection, and intelligent farming guidance.

---

## 🚀 Key Features

* **Expert AI Chatbot (Ask Krishi)**: Powered by the Google Gemini 2.5 Flash API. Provides expert answers strictly on farming, crops, irrigation, soil health, pests, livestock, and Indian government schemes (like PM-KISAN, PMFBY, MSP, and eNAM).
* **Heuristic Soil Moisture Analysis**: Estimates soil moisture percentage based on color, darkness, and texture metrics of an uploaded soil image, and lists crop suitability scores.
* **Leaf Disease Diagnosis**: Evaluates yellowing, dry spots, and blight signs on crop leaves, providing confidence percentages and treatment recommendations.
* **Persistent Cloud Sync**: Integrated with Firebase Firestore to persist and sync:
  - Chat conversation history (for cross-device session restoring)
  - Leaf disease scans (with thumbnail compression to save space)
  - Soil moisture scans
  - User's last map search category
* **Security & Session Restoring**: Synchronizes user profiles securely using standard SQLite authentication locally, with metadata synced to Firestore, and clears passwords from memory immediately after submission.
* **Dark Mode**: Features a premium CSS layout with dynamic glassmorphism and animated typing indicators.

---

## 🏗 Technology Stack

* **Frontend:** HTML5, CSS3, JavaScript
* **Backend:** Python
* **Database:** SQLite (Local), Firebase Firestore (Cloud Synchronization)
* **Cloud Services:** Firebase Firestore
* **Artificial Intelligence:** Google Gemini 2.5 Flash API
* **Image Analysis:** Custom computer vision and heuristic analysis algorithms
* **Version Control:** Git & GitHub

---

## 🛠 Setup & Installation

### 1. Prerequisites
- Python 3.8 or higher
- Google Chrome or any modern web browser

### 2. Environment Variable Configuration
The application reads its keys dynamically from a `.env` file at startup.
1. Copy the `.env.example` file to create a `.env` file in the root directory:
   ```bash
   copy .env.example .env
   ```
2. Open `.env` and fill in your keys:
   - `GEMINI_API_KEY`: Your Google Gemini API Key.
   - Note: No Google Maps API key is required! The mapping and nearby shops feature runs on a fully free, keyless, open-source Leaflet.js and OpenStreetMap implementation.

### 3. Run the App
- On Windows: Double-click **`start_app.bat`** in the root directory.
- Alternatively, run via terminal:
  ```bash
  python server.py
  ```
The server will start running locally at:
```text
http://127.0.0.1:8000
```

---

## 📋 Pre-Release Testing Checklist

### 1. Verification of Chatbot
- Run the server, log in, and open **Ask Krishi**.
- Verify that standard farming questions (e.g. *"how to make compost"*) receive expert advice.
- Verify that off-topic questions (e.g. *"who won the 2022 world cup"*) are politely refused and redirected.

### 2. Verification of Scan Persistence
- Perform a **Soil Scan** and a **Disease Scan**.
- Verify that the success badge `"✔ Saved to Cloud"` appears on the scan report.
- Verify that the scan appears inside the history lists, and reloading/logging in again restores the history.

---

## 📦 Deployment Checklist

1. **Production DB**: Transition SQLite `krishisev.db` to a managed PostgreSQL or MySQL database in production if deploying to multi-server environments.
2. **Environment Variables**: Configure your system environment variable `GEMINI_API_KEY` in your hosting dashboard (e.g., Heroku, AWS, Render). No map keys are needed.
3. **CORS Restrictions**: Tighten CORS settings in `server.py` to allow only your production domain name instead of `*`.
4. **HTTPS Enforcing**: Serve the application over SSL/HTTPS to ensure secure geolocation permission requesting.

---

## 📈 Project Status

**Current Status:** Production Ready

Completed Modules:

* AI Chatbot (Ask Krishi)
* Crop Advisory System
* Soil Moisture Analysis
* Leaf Disease Detection
* User Authentication
* Cloud-Based History Management
* Location-Based Agricultural Services (Leaflet.js + OpenStreetMap)

Planned Modules:

* Public Cloud Deployment

---

## Location-Based Agricultural Services

KRISHISEV features a complete mapping and resource-discovery module using **Leaflet.js** and **OpenStreetMap (OSM)**. 

### Capabilities Include:
- **Pulsing User Geolocation**: Uses browser geolocation securely to highlight the user's position.
- **Resource Search**: Discovers nearby nurseries, fertilizer stores, seed centers, Krishi Bhavans / agricultural offices, soil labs, and organic centers using the public OpenStreetMap Overpass API.
- **Bundled Fallback Database**: If the Overpass API is rate-limited, offline, or unavailable, the map automatically loads verified real-world agricultural resources closest to the user's position from an offline local dataset.
- **Zero API Keys**: Runs 100% open-source, keyless, and free, keeping developer keys out of repositories and avoiding usage bills.

---

### Deployment Roadmap

KRISHISEV is currently in the final validation phase. All core modules—including AI crop assistance, soil analysis, disease detection, user authentication, cloud history management, and OpenStreetMap agricultural resource discovery—have been fully implemented and tested.

The final deployment roadmap includes:
* End-to-end system testing and performance validation.
* Production environment configuration and security review.
* Cloud hosting and deployment setup.
* Final user acceptance testing and validation.
