# KRISHISEV — Smart Farm Desk

KRISHISEV is a production-ready, AI-powered agricultural assistant web application designed to help farmers with crop recommendations, soil moisture analysis, leaf disease detection, and plantation guidance.

---

## 🚀 Key Features

* **Expert AI Chatbot (Ask Krishi)**: Powered by the Google Gemini 2.5 Flash API. Provides expert answers strictly on farming, crops, irrigation, soil health, pests, livestock, and Indian government schemes (like PM-KISAN, PMFBY, MSP, and eNAM).
* **Interactive Plantation Map & Nearby Shops**: Uses the Google Maps JavaScript API to center on the user's location (using browser geolocation) and search Google Places for nearby **nurseries**, **fertilizer shops**, and **plantation/agri-supply stores**.
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

### 2. Verification of Google Maps
- Navigate to the **Map & Shops** view.
- Allow location permissions and confirm the blue pin indicates your location.
- Verify that clicking "Nearby Nurseries" displays markers with details.
- Verify that starting the server with a blank/invalid Maps key gracefully falls back to the offline simulated map layout without crashing.

### 3. Verification of Scan Persistence
- Perform a **Soil Scan** and a **Disease Scan**.
- Verify that the success badge `"✔ Saved to Cloud"` appears on the scan report.
- Verify that the scan appears inside the history lists, and reloading/logging in again restores the history.

---

## 📦 Deployment Checklist

1. **Production DB**: Transition SQLite `krishisev.db` to a managed PostgreSQL or MySQL database in production if deploying to multi-server environments.
2. **Environment Variables**: Configure system environment variables `GEMINI_API_KEY` and `GOOGLE_MAPS_API_KEY` in your hosting dashboard (e.g., Heroku, AWS, Render).
3. **CORS Restrictions**: Tighten CORS settings in `server.py` to allow only your production domain name instead of `*`.
4. **HTTPS Enforcing**: Serve the application over SSL/HTTPS to ensure secure geolocation permission requesting.
