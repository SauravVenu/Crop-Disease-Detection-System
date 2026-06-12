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
   - `GOOGLE_MAPS_API_KEY`: Your Google Maps JavaScript API Key (required for live interactive maps; if left blank, the app will fall back gracefully to a clean offline mockup view).

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
2. **Environment Variables**: Configure system environment variables `GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY` in your hosting dashboard (e.g., Heroku, AWS, Render).
3. **CORS Restrictions**: Tighten CORS settings in `server.py` to allow only your production domain name instead of `*`.
4. **HTTPS Enforcing**: Serve the application over SSL/HTTPS to ensure secure geolocation permission requesting.

---

## 📈 Project Status

**Current Status:** Active Development

Completed Modules:

* AI Chatbot (Ask Krishi)
* Crop Advisory System
* Soil Moisture Analysis
* Leaf Disease Detection
* User Authentication
* Cloud-Based History Management

Planned Modules:

* Location-Based Agricultural Services
* Google Maps & Places Integration
* Public Cloud Deployment

---

## Future Enhancements

### Location-Based Agricultural Services (Planned)

A future version of KRISHISEV will integrate Google Maps Platform and Places API services to provide farmers with location-aware agricultural assistance.

Planned capabilities include:

- Discovering nearby nurseries, fertilizer suppliers, seed distributors, and agricultural service centers.
- Interactive map-based visualization of agricultural resources.
- Region-specific recommendations and agricultural support services.
- Enhanced location-aware farming assistance.

The application architecture has been designed to support Google Maps integration. This feature will be enabled in a future release through Google Maps Platform configuration and API integration.

---

### Deployment Roadmap

KRISHISEV is currently in the final development and validation phase. Core modules, including AI-powered crop assistance, soil analysis, disease detection, user authentication, and cloud-based history management, have been successfully implemented and tested.

Public deployment of the platform is planned after the completion and validation of the location-based agricultural services module, which includes Google Maps and Places API integration. This phased approach ensures that all major features are fully tested, documented, and production-ready before release.

The planned deployment process includes:

* Completion of Google Maps and location-aware agricultural resource discovery features.
* End-to-end system testing and performance validation.
* Production environment configuration and security review.
* Cloud hosting and deployment setup.
* Final user acceptance testing and documentation updates.

This approach ensures that KRISHISEV is released as a complete, reliable, and scalable agricultural assistance platform.
