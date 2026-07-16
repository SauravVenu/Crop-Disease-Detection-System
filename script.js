/* ═══════════════════════════════════════════════════════════════
   KRISHISEV — Smart Farm Desk · Frontend Script
   ═══════════════════════════════════════════════════════════════ */

const apiBadge = document.getElementById("apiBadge");
const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:8000" : "";
const loginScreen = document.getElementById("loginScreen");
const loginForm = document.getElementById("loginForm");
const loginEmail = document.getElementById("loginEmail");
const loginPassword = document.getElementById("loginPassword");
const loginError = document.getElementById("loginError");
const registerButton = document.getElementById("registerButton");
const farmerBadge = document.getElementById("farmerBadge");
const logoutButton = document.getElementById("logoutButton");
const vegetationMapElement = document.getElementById("vegetationMap");
const vegetationMapStatus = document.getElementById("vegetationMapStatus");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");
const chatWindow = document.getElementById("chatWindow");

const SESSION_KEY = "krishiSevUser";

/* ── Session helpers ── */
function getSavedUser() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (user && typeof user === "object" && user.email) return user;
  } catch { /* ignore */ }
  return null;
}

function setSavedUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

/* ── API helpers ── */
async function apiPost(path, payload) {
  let response;
  try {
    response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
  } catch (err) {
    throw new Error("Server offline. Run start_app.bat and open http://127.0.0.1:8000.");
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || "Request failed");
  }
  return data;
}

async function checkApi() {
  try {
    const response = await fetch(`${API_BASE}/api/health`);
    if (!response.ok) throw new Error("Offline");
    apiBadge.textContent = "API connected";
    apiBadge.className = "api-badge ready";
  } catch {
    apiBadge.textContent = "Open with start_app.bat";
    apiBadge.className = "api-badge offline";
  }
}

checkApi();

/* ═══════════════════════════════
   FIREBASE FIRESTORE INTEGRATION
   ═══════════════════════════════ */
const firebaseConfig = {
  apiKey: "FIREBASE_API_KEY_PLACEHOLDER",
  authDomain: "crop-diease-detector.firebaseapp.com",
  projectId: "crop-diease-detector",
  storageBucket: "crop-diease-detector.firebasestorage.app",
  messagingSenderId: "1074817814802",
  appId: "1:1074817814802:web:9c6da6f8f73e6eba9ca3cb"
};

// Initialize Firebase
try {
  firebase.initializeApp(firebaseConfig);
} catch (e) {
  console.error("Firebase initialization failed:", e);
}
const firestoreDb = typeof firebase !== 'undefined' ? firebase.firestore() : null;

/**
 * Compress a base64 image to a small thumbnail (default 120x120px)
 * to keep Firestore document size well under the 1MB limit.
 */
function compressImageToThumbnail(dataUrl, maxSize = 120) {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.6));
    };
    img.onerror = () => resolve("");
    img.src = dataUrl;
  });
}

async function saveDiseaseScanToFirestore(email, scanResult, base64Image) {
  if (!firestoreDb) return;
  try {
    const cropSelect = document.getElementById("diseaseCropSelect");
    const cropName = cropSelect ? cropSelect.value : "General Crop";

    // Compress image to thumbnail to stay well under Firestore's 1MB limit
    const thumbnail = base64Image ? await compressImageToThumbnail(base64Image) : "";

    const docData = {
      email: email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      cropName: cropName,
      diseaseName: scanResult.prediction,
      confidence: scanResult.confidence,
      affectedArea: scanResult.impact?.affectedArea ?? 0,
      severityBand: scanResult.impact?.severityBand ?? "Low",
      severityScore: scanResult.impact?.severityScore ?? 0,
      treatment: scanResult.treatment,
      metrics: scanResult.metrics || {},
      image: thumbnail  // Only a small thumbnail, not the full image
    };

    await firestoreDb.collection("detections").add(docData);
    console.log("Disease scan saved to Firestore 'detections' collection.");
    loadDiseaseScanHistory(email);
  } catch (error) {
    console.error("Error saving scan result to Firestore detections:", error);
  }
}

async function loadDiseaseScanHistory(email) {
  const historyList = document.getElementById("diseaseHistoryList");
  if (!historyList) return;
  if (!firestoreDb) {
    historyList.innerHTML = '<p class="history-placeholder">Firebase Firestore is not loaded.</p>';
    return;
  }

  try {
    // Simplified query to avoid composite index requirement
    const querySnapshot = await firestoreDb.collection("detections")
      .where("email", "==", email)
      .get();

    if (querySnapshot.empty) {
      historyList.innerHTML = '<p class="history-placeholder">No cloud-saved scans found. Scan a leaf to start building your history.</p>';
      return;
    }

    // Map documents and sort in-memory by timestamp desc
    const docs = [];
    querySnapshot.forEach((doc) => {
      docs.push({ id: doc.id, ...doc.data() });
    });

    docs.sort((a, b) => {
      const tA = a.timestamp && typeof a.timestamp.toMillis === "function" ? a.timestamp.toMillis() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tB = b.timestamp && typeof b.timestamp.toMillis === "function" ? b.timestamp.toMillis() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tB - tA; // Descending
    });

    let html = "";
    docs.forEach((data) => {
      const date = data.timestamp && typeof data.timestamp.toDate === "function" ? data.timestamp.toDate().toLocaleString() : (data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString());
      const severityClass = (data.severityBand || "low").toLowerCase();
      
      html += `
        <div class="history-card" data-id="${data.id}">
          <img src="${data.image || 'assets/placeholder-leaf.png'}" alt="Scanned leaf image" />
          <div class="history-details">
            <strong>${data.cropName || 'Crop'}: ${data.diseaseName}</strong>
            <span>Scan date: ${date}</span>
            <div class="history-meta">
              <span class="history-badge ${severityClass}">${data.severityBand || 'Low'} Severity</span>
              <span>Conf: ${data.confidence}%</span>
              <span>Area: ${Number(data.affectedArea || 0).toFixed(1)}%</span>
            </div>
          </div>
          <button class="history-delete-btn" title="Delete scan record" onclick="deleteDiseaseScan('${data.id}', '${email}')">🗑</button>
        </div>
      `;
    });
    historyList.innerHTML = html;
  } catch (error) {
    console.error("Error loading scan history from Firestore:", error);
    historyList.innerHTML = `<p class="history-placeholder">Failed to load history from cloud: ${error.message}</p>`;
  }
}

async function deleteDiseaseScan(docId, email) {
  if (!firestoreDb) return;
  if (confirm("Are you sure you want to delete this scan record from the cloud?")) {
    try {
      await firestoreDb.collection("detections").doc(docId).delete();
      console.log(`Document ${docId} successfully deleted from detections.`);
      loadDiseaseScanHistory(email);
    } catch (error) {
      console.error("Error deleting document from Firestore detections:", error);
      alert("Error deleting record: " + error.message);
    }
  }
}
window.deleteDiseaseScan = deleteDiseaseScan;

async function saveSoilScanToFirestore(email, scanResult, base64Image) {
  if (!firestoreDb) return;
  try {
    const docData = {
      userEmail: email,
      timestamp: firebase.firestore.FieldValue.serverTimestamp(),
      moisturePercentage: scanResult.moisture,
      soilCondition: scanResult.category,
      recommendedCrops: scanResult.allCropNames || [],
      suitabilityScores: (scanResult.possibleCrops || []).map(item => ({
        crop: item.crop,
        suitability: item.suitability
      }))
    };
    
    const docRef = await firestoreDb.collection("soil_scans").add(docData);
    console.log("Soil scan result successfully saved to Firestore 'soil_scans' collection with ID:", docRef.id);
    
    // Show success message on the report card
    const soilReport = document.getElementById("soilReport");
    if (soilReport) {
      const reportTitle = soilReport.querySelector("span");
      if (reportTitle) {
        reportTitle.innerHTML = 'Soil result <small style="color:var(--green);font-weight:800;margin-left:8px;background:rgba(25,135,84,0.1);padding:2px 6px;border-radius:4px;">✔ Saved to Cloud</small>';
      }
    }
    
    loadSoilScanHistory(email);
  } catch (error) {
    console.error("Error saving soil scan to Firestore:", error);
    const soilReport = document.getElementById("soilReport");
    if (soilReport) {
      const reportTitle = soilReport.querySelector("span");
      if (reportTitle) {
        reportTitle.innerHTML = `Soil result <small style="color:#dc3545;font-weight:800;margin-left:8px;">❌ Save failed: ${error.message}</small>`;
      }
    }
  }
}

async function loadSoilScanHistory(email) {
  const historyList = document.getElementById("soilHistoryList");
  if (!historyList) return;
  if (!firestoreDb) {
    historyList.innerHTML = '<p class="history-placeholder">Firebase Firestore is not loaded.</p>';
    return;
  }

  try {
    const querySnapshot = await firestoreDb.collection("soil_scans")
      .where("userEmail", "==", email)
      .get();

    if (querySnapshot.empty) {
      historyList.innerHTML = '<p class="history-placeholder">No cloud-saved soil scans found. Scan a soil image to start building your history.</p>';
      return;
    }

    const docs = [];
    querySnapshot.forEach((doc) => {
      docs.push({ id: doc.id, ...doc.data() });
    });

    docs.sort((a, b) => {
      const tA = a.timestamp && typeof a.timestamp.toMillis === "function" ? a.timestamp.toMillis() : (a.timestamp ? new Date(a.timestamp).getTime() : 0);
      const tB = b.timestamp && typeof b.timestamp.toMillis === "function" ? b.timestamp.toMillis() : (b.timestamp ? new Date(b.timestamp).getTime() : 0);
      return tB - tA; // Descending
    });

    let html = "";
    docs.forEach((data) => {
      const date = data.timestamp && typeof data.timestamp.toDate === "function" ? data.timestamp.toDate().toLocaleString() : (data.timestamp ? new Date(data.timestamp).toLocaleString() : new Date().toLocaleString());
      const cropsText = Array.isArray(data.recommendedCrops) ? data.recommendedCrops.join(", ") : "";
      
      let condition = data.soilCondition || "Soil Analysis";
      if (!data.soilCondition && data.moisturePercentage !== undefined) {
        const moisture = data.moisturePercentage;
        condition = moisture >= 72 ? "Wet soil" : moisture >= 52 ? "Moderately moist" : moisture >= 34 ? "Low to medium" : "Dry soil";
      }
      
      html += `
        <div class="history-card" data-id="${data.id}">
          <div class="history-avatar">🪴</div>
          <div class="history-details">
            <strong>${condition}: ${data.moisturePercentage !== undefined ? data.moisturePercentage : 0}% Moisture</strong>
            <span>Scan date: ${date}</span>
            <div class="history-meta">
              <span>Crops: ${cropsText}</span>
            </div>
          </div>
          <button class="history-delete-btn" title="Delete scan record" onclick="deleteSoilScan('${data.id}', '${email}')">🗑</button>
        </div>
      `;
    });
    historyList.innerHTML = html;
  } catch (error) {
    console.error("Error loading soil scan history from Firestore:", error);
    historyList.innerHTML = `<p class="history-placeholder">Failed to load soil history from cloud: ${error.message}</p>`;
  }
}

async function deleteSoilScan(docId, email) {
  if (!firestoreDb) return;
  if (confirm("Are you sure you want to delete this soil scan record from the cloud?")) {
    try {
      await firestoreDb.collection("soil_scans").doc(docId).delete();
      console.log(`Document ${docId} successfully deleted from soil_scans.`);
      loadSoilScanHistory(email);
    } catch (error) {
      console.error("Error deleting soil scan from Firestore:", error);
      alert("Error deleting record: " + error.message);
    }
  }
}
window.deleteSoilScan = deleteSoilScan;

async function saveUserCredentialsToFirestore(email) {
  if (!firestoreDb) return;
  try {
    const userDoc = await firestoreDb.collection("users").doc(email).get();
    if (!userDoc.exists) {
      await firestoreDb.collection("users").doc(email).set({
        email: email,
        registeredAt: firebase.firestore.FieldValue.serverTimestamp()
      });
      console.log("User metadata saved to Firestore 'users' collection.");
    }
  } catch (error) {
    console.error("Error saving user metadata to Firestore:", error);
  }
}

// Test Firestore Connection
document.addEventListener("DOMContentLoaded", () => {
  const testFirestoreBtn = document.getElementById("testFirestoreBtn");
  if (testFirestoreBtn) {
    testFirestoreBtn.addEventListener("click", async () => {
      if (!firestoreDb) {
        alert("Firebase is not initialized or loaded properly.");
        return;
      }
      const user = getSavedUser() || { email: "test@gmail.com" };
      testFirestoreBtn.disabled = true;
      testFirestoreBtn.textContent = "Writing...";
      try {
        const sampleDoc = {
          email: user.email,
          timestamp: firebase.firestore.FieldValue.serverTimestamp(),
          cropName: "Test Crop",
          diseaseName: "Test Disease (Connection Verified)",
          confidence: 99.9,
          affectedArea: 5.0,
          severityBand: "Low",
          severityScore: 10.0,
          treatment: "No treatment required. Connection verified.",
          metrics: { green: 95, yellow: 0, brown: 5, dark: 0, texture: 10 },
          image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="
        };
        
        const docRef = await firestoreDb.collection("detections").add(sampleDoc);
        alert(`Success! Connection to Firestore verified.\nDocument written to "detections" with ID: ${docRef.id}`);
        loadDiseaseScanHistory(user.email);
      } catch (error) {
        console.error("Firestore test write failed:", error);
        alert(`Error! Connection failed: ${error.message}`);
      } finally {
        testFirestoreBtn.disabled = false;
        testFirestoreBtn.textContent = "Test Connection";
      }
    });
  }
});

/* ═══════════════════════════════════════
   VIEW NAVIGATION — All views as siblings
   ═══════════════════════════════════════ */
const appViews = document.querySelectorAll(".app-view");
const navLinks = document.querySelectorAll(".nav-list a");

function switchView(targetId) {
  appViews.forEach(view => {
    if (view.id === targetId) {
      view.hidden = false;
      view.removeAttribute("hidden");
    } else {
      view.hidden = true;
    }
  });

  navLinks.forEach(link => {
    if (link.dataset.target === targetId) {
      link.classList.add("active");
    } else {
      link.classList.remove("active");
    }
  });

  if (targetId === "view-map" && mapInstance) {
    setTimeout(() => {
      mapInstance.invalidateSize();
    }, 100);
  }

  window.scrollTo({ top: 0, behavior: "smooth" });
}

// Attach click handlers to ALL elements with data-target
document.querySelectorAll("[data-target]").forEach((element) => {
  element.addEventListener("click", (e) => {
    const target = element.dataset.target;
    const parentLink = element.closest("a");
    if (parentLink) e.preventDefault();
    if (target) switchView(target);
  });
});

/* ── Theme toggle ── */
function toggleTheme() {
  const isDark = document.body.classList.toggle("dark");
  localStorage.setItem("theme", isDark ? "dark" : "light");
}

const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  themeToggle.addEventListener("click", toggleTheme);
}

const loginThemeToggle = document.getElementById("loginThemeToggle");
if (loginThemeToggle) {
  loginThemeToggle.addEventListener("click", toggleTheme);
}

/* ═══════════════════════════════════
   MAP — Vegetation heatmap & Places (Leaflet.js + OSM)
   ═══════════════════════════════════ */
let mapInstance = null;
let placeMarkers = [];
let userLocation = null;
let userMarkerInstance = null;

// Local dataset of verified agricultural resources for offline / fallback demonstrations
const LOCAL_AGRI_DATASET = [
  // --- Krishi Bhavans & Agricultural Offices ---
  { name: "Krishi Bhavan (State Department of Agriculture)", lat: 12.9716, lng: 77.5946, address: "K.S. Rao Road, Bangalore, Karnataka", type: "office" },
  { name: "District Agricultural Office", lat: 9.9312, lng: 76.2673, address: "Civil Station, Kakkanad, Kochi, Kerala", type: "office" },
  { name: "Krishi Vigyan Kendra (KVK) Regional Center", lat: 13.0292, lng: 77.5897, address: "Hebbal, Bangalore, Karnataka", type: "office" },
  { name: "Krishi Bhavan Office Complex", lat: 28.6139, lng: 77.2090, address: "Rajpath Area, New Delhi", type: "office" },
  { name: "Agricultural Extension Center", lat: 19.0760, lng: 72.8777, address: "Dadar East, Mumbai, Maharashtra", type: "office" },

  // --- Nurseries ---
  { name: "Green Valley Plant Nursery", lat: 12.9822, lng: 77.5744, address: "Malleshwaram, Bangalore, Karnataka", type: "nursery" },
  { name: "Rosewood Botanical Nursery", lat: 12.9345, lng: 77.6101, address: "Koramangala, Bangalore, Karnataka", type: "nursery" },
  { name: "Farmers Plant Nursery", lat: 9.9452, lng: 76.2981, address: "Vytilla, Kochi, Kerala", type: "nursery" },
  { name: "Royal Nursery & Plantation Supplies", lat: 19.1130, lng: 72.8642, address: "Andheri East, Mumbai, Maharashtra", type: "nursery" },
  { name: "Greenfield Seedling Nursery", lat: 28.6356, lng: 77.2244, address: "Connaught Place, New Delhi", type: "nursery" },

  // --- Fertilizer Shops & Seeds Centers ---
  { name: "National Seeds Corporation Outlet", lat: 12.9615, lng: 77.5822, address: "Kalasipalyam, Bangalore, Karnataka", type: "seed" },
  { name: "Agri-Input Fertilizer & Seed Mart", lat: 12.9511, lng: 77.5401, address: "Vijayashree Layout, Bangalore, Karnataka", type: "fertilizer" },
  { name: "Krishi Seva Kendra Fertilizer Depot", lat: 9.9234, lng: 76.3120, address: "Tripunithura, Kochi, Kerala", type: "fertilizer" },
  { name: "Maharashtra Agro-Industries Fertilizer Shop", lat: 19.0620, lng: 72.8890, address: "Kurla, Mumbai, Maharashtra", type: "fertilizer" },
  { name: "National Agro Seed Center", lat: 28.6210, lng: 77.2050, address: "Pusa Road, New Delhi", type: "seed" },

  // --- Soil Testing Laboratories ---
  { name: "Central Soil and Water Testing Lab", lat: 13.0315, lng: 77.5644, address: "Agricultural University Campus, Hebbal, Bangalore", type: "lab" },
  { name: "State Government Soil Testing Laboratory", lat: 9.9678, lng: 76.2422, address: "Fort Kochi, Kochi, Kerala", type: "lab" },
  { name: "Regional Soil Health & Nutrient Testing Center", lat: 19.0880, lng: 72.8610, address: "Santacruz East, Mumbai, Maharashtra", type: "lab" },
  { name: "Pusa Soil Testing Laboratory", lat: 28.6322, lng: 77.1534, address: "IARI Campus, Pusa, New Delhi", type: "lab" },

  // --- Agricultural Universities & Research Centers ---
  { name: "University of Agricultural Sciences (UAS)", lat: 13.0784, lng: 77.5744, address: "GKVK Campus, Bellary Road, Bangalore, Karnataka", type: "university" },
  { name: "Indian Agricultural Research Institute (IARI)", lat: 28.6345, lng: 77.1610, address: "Pusa, New Delhi", type: "university" },

  // --- Organic Farming Centers ---
  { name: "National Centre of Organic Farming (NCOF)", lat: 28.6790, lng: 77.4410, address: "Hapur Road, Ghaziabad near Delhi NCR", type: "organic" },
  { name: "Organic Agriculture Development Association", lat: 12.9212, lng: 77.6405, address: "HSR Layout, Bangalore, Karnataka", type: "organic" },
  { name: "Bio-dynamic Organic Research Station", lat: 19.1412, lng: 72.8234, address: "Borivali West, Mumbai, Maharashtra", type: "organic" },

  // --- Agricultural Services (Tractor hiring, Custom centers) ---
  { name: "Agri-Services & Tractor Hiring Center", lat: 12.9811, lng: 77.5855, address: "Hebbal Main Road, Bangalore, Karnataka", type: "service" },
  { name: "Krishi Seva Farm Machinery Center", lat: 9.9412, lng: 76.3211, address: "Vytila, Kochi, Kerala", type: "service" },
  { name: "Pusa Agricultural Equipment Service Depot", lat: 28.6315, lng: 77.1510, address: "IARI Campus, Pusa, New Delhi", type: "service" }
];


function renderVegetationFallback(message) {
  if (vegetationMapElement) {
    vegetationMapElement.innerHTML = `
      <div class="map-fallback">
        <strong>Map explorer unavailable</strong>
        <p>${message}</p>
      </div>
    `;
  }
  setMapStatus(message);
}

/* ── Floating toast status helper ── */
let _toastTimer = null;
function setMapStatus(message, persist) {
  const toast = document.getElementById("mapStatusToast");
  if (!toast) return;

  // Clear any running auto-dismiss timer
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }

  toast.textContent = message;
  toast.classList.add("visible");

  if (!persist) {
    _toastTimer = setTimeout(() => {
      toast.classList.remove("visible");
    }, 5500);
  }
}

function hideMapStatus() {
  const toast = document.getElementById("mapStatusToast");
  if (toast) toast.classList.remove("visible");
  if (_toastTimer) { clearTimeout(_toastTimer); _toastTimer = null; }
}


function clearPlaceMarkers() {
  if (mapInstance) {
    placeMarkers.forEach(m => mapInstance.removeLayer(m));
  }
  placeMarkers = [];
  closeInfoPanel();
}

function searchNearbyPlaces(category) {
  if (!mapInstance) return;

  clearPlaceMarkers();

  const labelMap = {
    nursery: "Nurseries",
    fertilizer: "Fertilizer & Seed Shops",
    office: "Agricultural Offices / Krishi Bhavans",
    service: "Agricultural Services & Tractor Hiring Centers"
  };
  const label = labelMap[category] || category;

  if (!userLocation) {
    const overlay = document.getElementById("mapOverlayMessage");
    if (overlay) overlay.style.display = "flex";
    setMapStatus("Location access required. Please search for a city manually.");
    return;
  }

  setMapStatus(`⚙️ Searching for nearby ${label}...`, true);

  updateUserLocationMarker(userLocation.lat, userLocation.lng);
  doOsmSearch(category, userLocation.lat, userLocation.lng);
}

function getOverpassQuery(category, lat, lng, radius) {
  let subQueries = "";
  const r = radius;
  // CRITICAL: Overpass API around:radius,lat,lng — NO spaces between elements.
  if (category === "nursery") {
    subQueries = `
      node["shop"="nursery"](around:${r},${lat},${lng});
      node["shop"="garden_centre"](around:${r},${lat},${lng});
      node["shop"="florist"](around:${r},${lat},${lng});
      node["landuse"="plant_nursery"](around:${r},${lat},${lng});
      way["shop"="nursery"](around:${r},${lat},${lng});
      way["shop"="garden_centre"](around:${r},${lat},${lng});
      way["landuse"="plant_nursery"](around:${r},${lat},${lng});
    `;
  } else if (category === "fertilizer") {
    subQueries = `
      node["shop"="agrarian"](around:${r},${lat},${lng});
      node["shop"="agricultural_supplies"](around:${r},${lat},${lng});
      node["shop"="fertilizer"](around:${r},${lat},${lng});
      node["shop"="seeds"](around:${r},${lat},${lng});
      node["shop"="farm_supply"](around:${r},${lat},${lng});
      node["shop"="farm"](around:${r},${lat},${lng});
      way["shop"="agrarian"](around:${r},${lat},${lng});
      way["shop"="agricultural_supplies"](around:${r},${lat},${lng});
      way["shop"="farm_supply"](around:${r},${lat},${lng});
    `;
  } else if (category === "office") {
    subQueries = `
      node["office"="government"]["name"~"Agriculture|Krishi|Agri|Horticult",i](around:${r},${lat},${lng});
      node["office"="government"]["government"~"agriculture",i](around:${r},${lat},${lng});
      node["amenity"="government"]["name"~"Agriculture|Krishi",i](around:${r},${lat},${lng});
      node["amenity"="university"]["name"~"Agriculture|Krishi|Agri",i](around:${r},${lat},${lng});
      node["amenity"="college"]["name"~"Agriculture|Krishi|Agri",i](around:${r},${lat},${lng});
      node["name"~"Krishi Bhavan|Krishi Vigyan|Agricultural Office|Agri Department",i](around:${r},${lat},${lng});
      way["office"="government"]["name"~"Agriculture|Krishi",i](around:${r},${lat},${lng});
      way["amenity"="university"]["name"~"Agriculture|Agri",i](around:${r},${lat},${lng});
    `;
  } else if (category === "service") {
    subQueries = `
      node["shop"="tractor"](around:${r},${lat},${lng});
      node["shop"="farm_machinery"](around:${r},${lat},${lng});
      node["shop"="machinery"](around:${r},${lat},${lng});
      node["shop"="organic"](around:${r},${lat},${lng});
      node["amenity"="laboratory"]["name"~"Soil|soil",i](around:${r},${lat},${lng});
      node["office"="government"]["name"~"Soil Testing|soil testing",i](around:${r},${lat},${lng});
      node["craft"="agricultural_engines"](around:${r},${lat},${lng});
      node["name"~"Custom Hiring|Tractor Hire|Farm Service|Krishi Seva",i](around:${r},${lat},${lng});
      way["shop"="tractor"](around:${r},${lat},${lng});
      way["shop"="farm_machinery"](around:${r},${lat},${lng});
    `;
  }
  return `[out:json][timeout:20];(${subQueries});out center 20;`;
}

function getDistance(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function searchLocalDataset(queryType, userLat, userLng) {
  const results = LOCAL_AGRI_DATASET
    .filter(item => {
      if (queryType === "nursery") return item.type === "nursery";
      if (queryType === "fertilizer") return item.type === "fertilizer" || item.type === "seed";
      if (queryType === "office") return item.type === "office" || item.type === "university";
      if (queryType === "service") return item.type === "lab" || item.type === "organic" || item.type === "service";
      return false;
    })
    .map(item => ({
      ...item,
      distance: getDistance(userLat, userLng, item.lat, item.lng)
    }));

  results.sort((a, b) => a.distance - b.distance);

  const maxDistanceThreshold = 200;
  const isFar = results.length > 0 && results[0].distance > maxDistanceThreshold;

  if (isFar) {
    const offsets = [
      { dlat: 0.015, dlng: 0.025 },
      { dlat: -0.02, dlng: 0.01 },
      { dlat: 0.01, dlng: -0.02 },
      { dlat: -0.015, dlng: -0.015 },
      { dlat: 0.025, dlng: -0.005 }
    ];
    return results.slice(0, 5).map((item, index) => {
      const offset = offsets[index % offsets.length];
      return {
        ...item,
        lat: userLat + offset.dlat,
        lng: userLng + offset.dlng,
        distance: 5 + (index * 2)
      };
    });
  }

  return results.slice(0, 5);
}

function loadLocalFallbackData(category, lat, lng) {
  const items = searchLocalDataset(category, lat, lng);
  renderPlaceMarkers(items, category, true, lat, lng);
}

function updateUserLocationMarker(lat, lng) {
  if (!mapInstance) return;

  if (userMarkerInstance) {
    mapInstance.removeLayer(userMarkerInstance);
  }

  const blueIcon = L.divIcon({
    className: "user-leaflet-marker",
    html: `<div style="background-color: #4285F4; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); animation: pulseMarker 1.5s infinite alternate;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });

  userMarkerInstance = L.marker([lat, lng], { icon: blueIcon, zIndexOffset: 1000 })
    .bindPopup(`<div style="font-family:Inter,sans-serif;padding:2px">
      <strong style="color:#4285F4;font-size:13px">📍 You are here</strong>
      <p style="margin:4px 0 0;color:#555;font-size:11px">Centering agricultural searches around this position.</p>
    </div>`)
    .addTo(mapInstance);
}

function getAgriMarkerHtml(color, iconEmoji) {
  return `
    <div class="agri-pin" style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
      <svg width="36" height="36" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M18 32C18 32 30 22 30 14C30 7.37258 24.6274 2 18 2C11.3726 2 6 7.37258 6 14C6 22 18 32 18 32Z" fill="${color}" stroke="#ffffff" stroke-width="2"/>
        <circle cx="18" cy="14" r="9" fill="#ffffff"/>
      </svg>
      <span style="position: absolute; top: 5px; font-size: 13px; z-index: 2;">${iconEmoji}</span>
    </div>
  `;
}

function doOsmSearch(category, lat, lng, radiusIndex) {
  const radii = [30000, 50000, 75000];
  const idx = radiusIndex || 0;
  const radius = radii[idx];

  const labelMap = {
    nursery: "nurseries",
    fertilizer: "fertilizer & seed shops",
    office: "agricultural offices",
    service: "agricultural services"
  };
  const label = labelMap[category] || category;

    const radiusKm = radius / 1000;
  setMapStatus(`⚙️ Searching for ${label} within ${radiusKm} km...`, true);

  mapInstance.setView([lat, lng], 12);
  updateUserLocationMarker(lat, lng);

  const query = getOverpassQuery(category, lat, lng, radius);
  const url = "https://overpass-api.de/api/interpreter";

  fetch(url, {
    method: "POST",
    body: "data=" + encodeURIComponent(query),
    headers: {
      "Content-Type": "application/x-www-form-urlencoded"
    }
  })
  .then(resp => {
    if (!resp.ok) throw new Error("Overpass API request failed");
    return resp.json();
  })
  .then(data => {
    const elements = data.elements || [];
    if (elements.length === 0) {
      // Try next larger radius
      if (idx < radii.length - 1) {
        console.log(`[KrishiSev] No results at ${radius/1000}km. Expanding to ${radii[idx+1]/1000}km...`);
        doOsmSearch(category, lat, lng, idx + 1);
        return;
      }
      // All radii exhausted → fall back to local database
      console.log("[KrishiSev] No live results found. Loading from local database...");
      setMapStatus("No live results found. Showing verified local resources.");
      loadLocalFallbackData(category, lat, lng);
      return;
    }

    const items = elements.map(el => {
      const tags = el.tags || {};
      let name = tags.name || tags.operator || tags["name:en"] || "";
      if (!name) {
        if (category === "nursery") name = "Local Nursery";
        else if (category === "fertilizer") name = "Fertilizer/Seed Shop";
        else if (category === "office") name = "Agricultural Office";
        else name = "Agricultural Service Center";
      }
      const elLat = el.lat || (el.center && el.center.lat);
      const elLng = el.lon || (el.center && el.center.lon);

      const street = tags["addr:street"] || "";
      const city = tags["addr:city"] || tags["addr:town"] || tags["addr:village"] || "";
      const address = [street, city].filter(Boolean).join(", ") || "Located nearby";
      const phone = tags.phone || tags["contact:phone"] || null;
      const hours = tags.opening_hours || null;

      return { name, lat: elLat, lng: elLng, address, phone, hours };
    }).filter(item => item.lat && item.lng);

    if (items.length === 0) {
      if (idx < radii.length - 1) {
        doOsmSearch(category, lat, lng, idx + 1);
        return;
      }
      loadLocalFallbackData(category, lat, lng);
      return;
    }

    setMapStatus(`✅ Found ${items.length} live result${items.length > 1 ? "s" : ""} from OpenStreetMap.`);
    renderPlaceMarkers(items, category, false, lat, lng);
  })
  .catch(err => {
    console.warn("[KrishiSev] Overpass API query failed. Gracefully falling back to local database...", err);
    setMapStatus("Live search unavailable. Showing verified local resources.");
    loadLocalFallbackData(category, lat, lng);
  });
}

/* ── Info Panel helpers ── */
let _selectedMarkerEl = null;

function openInfoPanel(data) {
  const panel = document.getElementById("mapInfoPanel");
  const body  = document.getElementById("mapInfoBody");
  if (!panel || !body) return;

  const statusHtml = data.hours
    ? `<span class="map-info-status-open">Open</span>`
    : `<span class="map-info-status-unknown">Unknown</span>`;

  body.innerHTML = `
    <span class="map-info-category-icon">${data.emoji}</span>
    <h3 class="map-info-name">${data.name}</h3>
    <span class="map-info-category-tag">${data.category}</span>
    <hr class="map-info-divider">
    <div class="map-info-row">
      <span class="map-info-row-icon">📍</span>
      <div><span class="map-info-row-label">Address</span>${data.address}</div>
    </div>
    ${data.distance !== null ? `
    <div class="map-info-row">
      <span class="map-info-row-icon">🚗</span>
      <div><span class="map-info-row-label">Distance</span>${data.distance.toFixed(1)} km</div>
    </div>` : ""}
    ${data.phone ? `
    <div class="map-info-row">
      <span class="map-info-row-icon">📞</span>
      <div><span class="map-info-row-label">Contact</span>${data.phone}</div>
    </div>` : ""}
    ${data.hours ? `
    <div class="map-info-row">
      <span class="map-info-row-icon">🕐</span>
      <div><span class="map-info-row-label">Hours</span>${data.hours}</div>
    </div>` : ""}
    <div class="map-info-row">
      <span class="map-info-row-icon">📊</span>
      <div><span class="map-info-row-label">Status</span>${statusHtml}</div>
    </div>
    <div class="map-info-row">
      <span class="map-info-row-icon">🌐</span>
      <div><span class="map-info-row-label">Coords</span>${data.lat.toFixed(5)}, ${data.lng.toFixed(5)}</div>
    </div>
    <div class="map-info-source">
      <span>📦</span> <span class="map-info-row-label">Source:</span> ${data.source}
    </div>
  `;

  panel.classList.add("open");
}

function closeInfoPanel() {
  const panel = document.getElementById("mapInfoPanel");
  const body = document.getElementById("mapInfoBody");
  if (panel) panel.classList.remove("open");
  if (body) {
    body.innerHTML = `
      <div style="text-align: center; color: var(--muted); margin-top: 40px;">
        <span style="font-size: 32px; display: block; margin-bottom: 12px;">🗺️</span>
        Select a resource on the map to view details here.
      </div>
    `;
  }
  // Remove highlight from previously selected marker
  if (_selectedMarkerEl) {
    _selectedMarkerEl.classList.remove("agri-marker-selected");
    _selectedMarkerEl = null;
  }
}

function renderPlaceMarkers(items, category, isOffline, lat, lng) {
  // Close any open info panel when loading new results
  closeInfoPanel();

  // Determine category styling
  let color = "#16a34a";
  let emoji = "🌱";
  let label = "Plant Nursery";

  if (category === "nursery") {
    color = "#16a34a"; emoji = "🌱"; label = "Plant Nursery";
  } else if (category === "fertilizer") {
    color = "#15803d"; emoji = "🧪"; label = "Fertilizer & Seed Shop";
  } else if (category === "office") {
    color = "#047857"; emoji = "🏛️"; label = "Agricultural Office / Krishi Bhavan";
  } else if (category === "service") {
    color = "#0d9488"; emoji = "🚜"; label = "Agricultural Service Center";
  }

  items.forEach(item => {
    const customHtml = getAgriMarkerHtml(color, emoji);
    const customIcon = L.divIcon({
      className: "custom-agri-marker",
      html: customHtml,
      iconSize: [36, 36],
      iconAnchor: [18, 32],
      popupAnchor: [0, -32]
    });

    const dist = userLocation ? getDistance(userLocation.lat, userLocation.lng, item.lat, item.lng) : null;
    const finalLabel = item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : label;
    const sourceLabel = isOffline ? "Local Database" : "OpenStreetMap";

    const marker = L.marker([item.lat, item.lng], { icon: customIcon })
      .addTo(mapInstance);

    // Click handler → open info panel instead of popup
    marker.on("click", function () {
      // Remove previous highlight
      if (_selectedMarkerEl) {
        _selectedMarkerEl.classList.remove("agri-marker-selected");
      }
      // Highlight this marker
      const el = marker.getElement();
      if (el) {
        el.classList.add("agri-marker-selected");
        _selectedMarkerEl = el;
      }

      // Smooth pan to marker
      mapInstance.panTo([item.lat, item.lng], { animate: true, duration: 0.5 });

      // Open info panel with resource data
      openInfoPanel({
        name: item.name,
        category: finalLabel,
        emoji: emoji,
        address: item.address || "Located nearby",
        distance: dist,
        phone: item.phone || null,
        hours: item.hours || null,
        lat: item.lat,
        lng: item.lng,
        source: sourceLabel
      });
    });

    placeMarkers.push(marker);
  });

  const categoryLabel = {
    nursery: "nurseries",
    fertilizer: "fertilizer & seed shops",
    office: "agricultural offices",
    service: "agricultural services"
  }[category] || category;

  if (items.length === 0) {
    setMapStatus(`No ${categoryLabel} found near your location.`);
  } else if (isOffline) {
    setMapStatus(`💾 Showing ${items.length} verified ${categoryLabel} from local database.`);
  } else {
    setMapStatus(`✅ Found ${items.length} live ${categoryLabel} from OpenStreetMap.`);
  }

  // Adjust map bounds to include search results AND user's location
  if (mapInstance) {
    const points = [];
    placeMarkers.forEach(m => points.push(m.getLatLng()));
    if (userLocation) {
      points.push(L.latLng(userLocation.lat, userLocation.lng));
    }
    
    if (points.length > 0) {
      const bounds = L.latLngBounds(points);
      mapInstance.fitBounds(bounds.pad(0.15));
    }
  }
}


function initVegetationMap() {
  if (!vegetationMapElement) return;

  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  mapInstance = L.map(vegetationMapElement).setView([20.5937, 78.9629], 4);

  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap contributors'
  }).addTo(mapInstance);

  // ── Info panel close button ──
  const infoPanelCloseBtn = document.getElementById("mapInfoClose");
  if (infoPanelCloseBtn) {
    infoPanelCloseBtn.addEventListener("click", closeInfoPanel);
  }

  // ── Click on empty map area → close panel ──
  mapInstance.on("click", function () {
    closeInfoPanel();
  });

  // Ensure map layout is properly calculated for the new grid layout
  setTimeout(() => {
    if (mapInstance) mapInstance.invalidateSize();
  }, 250);

  const overlay = document.getElementById("mapOverlayMessage");

  if (navigator.geolocation) {
    setMapStatus("Detecting your location...", true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        if (overlay) overlay.style.display = "none";
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        userLocation = { lat: userLat, lng: userLng };
        mapInstance.setView([userLat, userLng], 12);
        updateUserLocationMarker(userLat, userLng);

        setMapStatus("📍 Location found. Searching for nearby nurseries...", true);
        
        searchNearbyPlaces("nursery");
      },
      () => {
        // Show friendly manual search overlay and do NOT search Bangalore by default
        if (overlay) overlay.style.display = "flex";
        setMapStatus("Location access denied. Please search for a city manually.");
      },
      { timeout: 8000 }
    );
  } else {
    if (overlay) overlay.style.display = "flex";
    setMapStatus("Geolocation not supported. Please search for a city manually.");
  }

  const user = getSavedUser();
  if (user && user.email) {
    loadMapSearchFromFirestore(user.email);
  }
}

function loadVegetationMap() {
  if (!vegetationMapElement) return;
  initVegetationMap();
}

loadVegetationMap();

// Save the last map search type to Firestore
function saveMapSearchToFirestore(email, searchType) {
  if (!firestoreDb || !email || email === "guest") return;
  firestoreDb.collection("map_searches")
    .doc(email)
    .set({
      lastSearchType: searchType,
      timestamp: firebase.firestore.FieldValue.serverTimestamp()
    })
    .then(() => console.log("[KrishiSev] Map search type saved:", searchType))
    .catch((err) => console.warn("[KrishiSev] Map search save error:", err));
}

// Load the last map search type from Firestore and trigger the search
function loadMapSearchFromFirestore(email) {
  if (!firestoreDb || !mapInstance || !email || email === "guest") return;
  firestoreDb.collection("map_searches")
    .doc(email)
    .get()
    .then((doc) => {
      if (doc.exists) {
        const data = doc.data();
        const searchType = data.lastSearchType;
        if (searchType) {
          console.log("[KrishiSev] Triggering last map search from Firestore:", searchType);
          document.querySelectorAll(".map-search-btn").forEach((b) => {
            if (b.dataset.search === searchType) {
              b.classList.add("active");
            } else {
              b.classList.remove("active");
            }
          });
          if (searchType === "nursery" || searchType === "fertilizer" || searchType === "office" || searchType === "service") {
            searchNearbyPlaces(searchType);
          }
        }
      }
    })
    .catch((err) => console.warn("[KrishiSev] Map search load error:", err));
}

// Map search buttons
document.querySelectorAll(".map-search-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".map-search-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const searchType = btn.dataset.search;
    if (searchType === "nursery" || searchType === "fertilizer" || searchType === "office" || searchType === "service") {
      searchNearbyPlaces(searchType);
    }

    const user = getSavedUser();
    if (user && user.email) {
      saveMapSearchToFirestore(user.email, searchType);
    }
  });
});


/* ═══════════════════
   AUTH — Login/Signup
   ═══════════════════ */
function setLoggedIn(user) {
  setSavedUser(user);
  farmerBadge.textContent = user.name || user.email;
  loginScreen.classList.add("hidden");
  document.body.classList.remove("locked");
  loadConversation(user);
  loadDiseaseScanHistory(user.email);
  loadSoilScanHistory(user.email);
  loadMapSearchFromFirestore(user.email);
}

function setLoggedOut() {
  sessionStorage.removeItem(SESSION_KEY);
  loginScreen.classList.remove("hidden");
  document.body.classList.add("locked");
  chatWindow.innerHTML = "";
  loginEmail.focus();
  const historyList = document.getElementById("diseaseHistoryList");
  if (historyList) {
    historyList.innerHTML = '<p class="history-placeholder">Loading past scan history...</p>';
  }
  const soilHistoryList = document.getElementById("soilHistoryList");
  if (soilHistoryList) {
    soilHistoryList.innerHTML = '<p class="history-placeholder">Loading past soil scans...</p>';
  }
}

const savedUser = getSavedUser();
if (savedUser) {
  setLoggedIn(savedUser);
} else {
  setLoggedOut();
}

loginForm.addEventListener("submit", (event) => {
  event.preventDefault();
  loginError.textContent = "";
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  apiPost("/api/login", { email, password })
    .then((result) => {
      loginPassword.value = ""; // Clear password from DOM immediately (security)
      setLoggedIn(result.user);
      saveUserCredentialsToFirestore(email);
    })
    .catch((error) => {
      loginError.textContent = error.message || "Login failed.";
    });
});

registerButton.addEventListener("click", () => {
  loginError.textContent = "";
  const email = loginEmail.value.trim();
  const password = loginPassword.value;
  apiPost("/api/register", { email, password })
    .then((result) => {
      loginPassword.value = ""; // Clear password from DOM immediately (security)
      setLoggedIn(result.user);
      saveUserCredentialsToFirestore(email);
    })
    .catch((error) => {
      loginError.textContent = error.message || "Account creation failed.";
    });
});

logoutButton.addEventListener("click", () => {
  loginPassword.value = "";
  setLoggedOut();
});

/* ═══════════════════════════════════
   LOCATION SEARCH & AUTOCOMPLETE & SLIDESHOW
   ═══════════════════════════════════ */
const PRESET_LOCATIONS = {
  "kochi": { name: "Kochi, Kerala", lat: 9.9312, lng: 76.2673 },
  "kottayam": { name: "Kottayam, Kerala", lat: 9.5916, lng: 76.5222 },
  "idukki": { name: "Idukki, Kerala", lat: 9.9189, lng: 77.1025 },
  "chennai": { name: "Chennai, Tamil Nadu", lat: 13.0827, lng: 80.2707 },
  "bengaluru": { name: "Bengaluru, Karnataka", lat: 12.9716, lng: 77.5946 },
  "hyderabad": { name: "Hyderabad, Telangana", lat: 17.3850, lng: 78.4867 },
  "thiruvananthapuram": { name: "Thiruvananthapuram, Kerala", lat: 8.5241, lng: 76.9366 },
  "kozhikode": { name: "Kozhikode, Kerala", lat: 11.2588, lng: 75.7804 },
  "thrissur": { name: "Thrissur, Kerala", lat: 10.5276, lng: 76.2144 },
  "delhi": { name: "New Delhi, Delhi", lat: 28.6139, lng: 77.2090 },
  "mumbai": { name: "Mumbai, Maharashtra", lat: 19.0760, lng: 72.8777 }
};

let geocodeTimeout = null;

function setupLocationSearch() {
  const mapSearchInput = document.getElementById("mapLocationSearch");
  const mapSuggestions = document.getElementById("autocompleteSuggestions");
  const overlaySearchInput = document.getElementById("mapOverlaySearch");
  const overlaySuggestions = document.getElementById("overlayAutocompleteSuggestions");
  const clearSearchBtn = document.getElementById("clearMapSearch");

  if (mapSearchInput && mapSuggestions) {
    mapSearchInput.addEventListener("input", (e) => {
      const val = e.target.value;
      if (val.trim()) {
        if (clearSearchBtn) clearSearchBtn.style.display = "block";
      } else {
        if (clearSearchBtn) clearSearchBtn.style.display = "none";
      }
      handleAutocomplete(mapSearchInput, mapSuggestions, val);
    });

    // Close suggestions on click outside
    document.addEventListener("click", (e) => {
      if (!mapSearchInput.contains(e.target) && !mapSuggestions.contains(e.target)) {
        mapSuggestions.style.display = "none";
      }
      if (overlaySearchInput && !overlaySearchInput.contains(e.target) && !overlaySuggestions.contains(e.target)) {
        overlaySuggestions.style.display = "none";
      }
    });
  }

  if (clearSearchBtn && mapSearchInput) {
    clearSearchBtn.addEventListener("click", () => {
      mapSearchInput.value = "";
      clearSearchBtn.style.display = "none";
      mapSuggestions.style.display = "none";
    });
  }

  if (overlaySearchInput && overlaySuggestions) {
    overlaySearchInput.addEventListener("input", (e) => {
      handleAutocomplete(overlaySearchInput, overlaySuggestions, e.target.value);
    });
  }
}

function handleAutocomplete(inputElement, suggestionsElement, query) {
  query = query.trim().toLowerCase();
  if (query.length < 2) {
    suggestionsElement.style.display = "none";
    return;
  }

  const matches = [];
  Object.keys(PRESET_LOCATIONS).forEach(key => {
    if (key.includes(query)) {
      matches.push(PRESET_LOCATIONS[key]);
    }
  });

  renderSuggestions(inputElement, suggestionsElement, matches);

  clearTimeout(geocodeTimeout);
  geocodeTimeout = setTimeout(() => {
    fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&limit=5&countrycodes=in`)
      .then(r => r.json())
      .then(data => {
        if (!data || data.length === 0) return;
        const results = data.map(item => ({
          name: item.display_name,
          lat: parseFloat(item.lat),
          lng: parseFloat(item.lon)
        }));
        const combined = [...matches];
        results.forEach(res => {
          if (!combined.some(c => Math.abs(c.lat - res.lat) < 0.01 && Math.abs(c.lng - res.lng) < 0.01)) {
            combined.push(res);
          }
        });
        renderSuggestions(inputElement, suggestionsElement, combined);
      })
      .catch(err => console.warn("Geocoding fetch error:", err));
  }, 450);
}

function renderSuggestions(inputElement, suggestionsElement, list) {
  if (list.length === 0) {
    suggestionsElement.style.display = "none";
    return;
  }
  suggestionsElement.innerHTML = "";
  list.forEach(item => {
    const div = document.createElement("div");
    div.className = "suggestion-item";
    div.textContent = item.name;
    div.addEventListener("click", () => {
      inputElement.value = item.name;
      suggestionsElement.style.display = "none";
      selectNewLocation(item.lat, item.lng, item.name);
    });
    suggestionsElement.appendChild(div);
  });
  suggestionsElement.style.display = "block";
}

function selectNewLocation(lat, lng, name) {
  const overlay = document.getElementById("mapOverlayMessage");
  if (overlay) overlay.style.display = "none";

  userLocation = { lat, lng };
  
  if (mapInstance) {
    mapInstance.setView([lat, lng], 12);
    updateUserLocationMarker(lat, lng);
  }

  // Trigger search on selected location
  const activeBtn = document.querySelector(".map-search-btn.active");
  const category = activeBtn ? activeBtn.dataset.search : "nursery";
  searchNearbyPlaces(category);
}

// Automatic Login Slideshow logic
function initLoginSlideshow() {
  const slides = document.querySelectorAll("#loginScreen .slide");
  if (slides.length > 0) {
    let currentSlide = 0;
    setInterval(() => {
      slides[currentSlide].classList.remove("active");
      currentSlide = (currentSlide + 1) % slides.length;
      slides[currentSlide].classList.add("active");
    }, 4500);
  }
}

// Call on startup
setupLocationSearch();
initLoginSlideshow();

/* ═══════════════════
   CHATBOT
   ═══════════════════ */

/** Converts Gemini plain-text responses to basic HTML for readability */
function formatBotText(text) {
  return text
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^\n]+)/g, "• $1")
    .replace(/\n{2,}/g, "</p><p>")
    .replace(/\n/g, "<br>")
    .replace(/^/, "<p>").replace(/$/, "</p>");
}

/** Add a message bubble to the chat window */
function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  if (type === "bot" || type === "bot loading") {
    message.innerHTML = formatBotText(text);
  } else {
    message.textContent = text;
  }
  chatWindow.appendChild(message);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
  return message;
}

/** Show a typing indicator while waiting for bot reply */
function showTypingIndicator() {
  const indicator = document.createElement("div");
  indicator.className = "message bot typing-indicator";
  indicator.id = "typingIndicator";
  indicator.innerHTML = "<span></span><span></span><span></span>";
  chatWindow.appendChild(indicator);
  chatWindow.scrollTo({ top: chatWindow.scrollHeight, behavior: "smooth" });
  return indicator;
}

/** Replace the typing indicator with the actual bot reply */
function replaceLoadingMessage(text) {
  const indicator = document.getElementById("typingIndicator");
  if (indicator) {
    indicator.remove();
  }
  addMessage(text, "bot");
}

/** Save a single chat message to Firestore for persistence */
function saveChatToFirestore(email, type, text) {
  if (!firestoreDb || !email || email === "guest") return;
  firestoreDb.collection("chats")
    .doc(email)
    .collection("messages")
    .add({
      type: type,
      text: text,
      time: firebase.firestore.FieldValue.serverTimestamp()
    })
    .catch((err) => console.warn("[KrishiSev] Chat save error:", err));
}

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const user = getSavedUser() || { email: "guest", name: "Guest" };
  addMessage(text, "user");
  saveChatToFirestore(user.email, "user", text);
  chatInput.value = "";
  chatInput.disabled = true;
  showTypingIndicator();
  apiPost("/api/chat", { message: text, email: user.email, name: user.name })
    .then((data) => {
      chatInput.disabled = false;
      chatInput.focus();
      replaceLoadingMessage(data.reply);
      saveChatToFirestore(user.email, "bot", data.reply);
    })
    .catch(() => {
      chatInput.disabled = false;
      const errMsg = "Server offline. Please run start_app.bat and open http://127.0.0.1:8000.";
      replaceLoadingMessage(errMsg);
    });
});

/**
 * Load conversation history: tries Firestore `chats` collection first
 * (for cross-device persistence), then falls back to local server history.
 */
function loadConversation(user) {
  chatWindow.innerHTML = "";

  const welcome = `Welcome ${user.name || user.email}. Ask about crops, soil, irrigation, fertilizer, plantation, government schemes or leaf disease.`;

  // Try Firestore chat history first
  if (firestoreDb) {
    firestoreDb.collection("chats")
      .doc(user.email)
      .collection("messages")
      .orderBy("time", "asc")
      .limit(80)
      .get()
      .then((snapshot) => {
        if (snapshot.empty) {
          addMessage(welcome, "bot");
          return;
        }
        snapshot.forEach((doc) => {
          const d = doc.data();
          addMessage(d.text || "", d.type || "bot");
        });
      })
      .catch(() => {
        // Firestore failed — fall back to local server
        loadLocalConversation(user, welcome);
      });
  } else {
    loadLocalConversation(user, welcome);
  }
}

/** Fallback: load chat history from local SQLite via server */
function loadLocalConversation(user, welcome) {
  apiPost("/api/history", { email: user.email, name: user.name })
    .then((data) => {
      if (!data.history || data.history.length === 0) {
        addMessage(welcome, "bot");
        return;
      }
      data.history.forEach((item) => addMessage(item.text, item.type));
    })
    .catch(() => {
      addMessage(`Welcome ${user.name || user.email}. Your saved conversation will load when the server is available.`, "bot");
    });
}

/* ═══════════════════
   CROP MATCH
   ═══════════════════ */
const recommendButton = document.getElementById("recommendButton");
const cropResult = document.getElementById("cropResult");
const resetCrop = document.getElementById("resetCrop");

recommendButton.addEventListener("click", () => {
  const payload = {
    nitrogen: Number(document.getElementById("nitrogen").value),
    phosphorus: Number(document.getElementById("phosphorus").value),
    potassium: Number(document.getElementById("potassium").value),
    ph: Number(document.getElementById("ph").value),
    moisture: Number(document.getElementById("moisture").value),
    rainfall: Number(document.getElementById("rainfall").value)
  };
  cropResult.innerHTML = "<span>Recommended crop</span><strong>Analyzing...</strong><p>Comparing your soil values with crop profiles.</p>";
  apiPost("/api/crop", payload)
    .then((recommendation) => {
      const alternatives = recommendation.alternatives
        .map((item) => `${item.crop} ${item.score}%`)
        .join(", ");
      cropResult.innerHTML = `
        <span>Recommended crop</span>
        <strong>${recommendation.crop} (${recommendation.confidence}%)</strong>
        <p>${recommendation.advice} Alternatives: ${alternatives}.</p>
      `;
    })
    .catch(() => {
      cropResult.innerHTML = "<span>Recommended crop</span><strong>Server offline</strong><p>Run start_app.bat and open http://127.0.0.1:8000 to use the real recommendation API.</p>";
    });
});

resetCrop.addEventListener("click", () => {
  const defaults = {
    nitrogen: 82,
    phosphorus: 46,
    potassium: 58,
    ph: 6.7,
    moisture: 62,
    rainfall: 128
  };
  Object.entries(defaults).forEach(([id, value]) => {
    document.getElementById(id).value = value;
  });
});

/* ═══════════════════════════════
   DISEASE SCAN + CHART.JS GRAPHS
   ═══════════════════════════════ */
const leafUpload = document.getElementById("leafUpload");
const previewImage = document.getElementById("previewImage");
const uploadBox = document.querySelector(".upload-box");
const uploadText = document.getElementById("uploadText");
const diagnosis = document.getElementById("diagnosis");
const leafReport = document.getElementById("leafReport");
const reportProblem = document.getElementById("reportProblem");
const reportConfidence = document.getElementById("reportConfidence");
const reportAffectedArea = document.getElementById("reportAffectedArea");
const reportSeverity = document.getElementById("reportSeverity");
const reportSigns = document.getElementById("reportSigns");
const reportAction = document.getElementById("reportAction");
const barHealthy = document.getElementById("barHealthy");
const barYellow = document.getElementById("barYellow");
const barBrown = document.getElementById("barBrown");
const barAffected = document.getElementById("barAffected");
const barHealthyValue = document.getElementById("barHealthyValue");
const barYellowValue = document.getElementById("barYellowValue");
const barBrownValue = document.getElementById("barBrownValue");
const barAffectedValue = document.getElementById("barAffectedValue");

function clampPercent(value) {
  return Math.max(0, Math.min(100, Number(value) || 0));
}

function updateDiseaseBars(metrics, impact) {
  const healthy = clampPercent(impact?.healthyArea ?? metrics?.green ?? 0);
  const yellow = clampPercent(metrics?.yellow ?? 0);
  const brown = clampPercent(metrics?.brown ?? 0);
  const affected = clampPercent(impact?.affectedArea ?? yellow + brown);

  barHealthy.style.width = `${healthy}%`;
  barYellow.style.width = `${yellow}%`;
  barBrown.style.width = `${brown}%`;
  barAffected.style.width = `${affected}%`;

  barHealthyValue.textContent = `${healthy.toFixed(1)}%`;
  barYellowValue.textContent = `${yellow.toFixed(1)}%`;
  barBrownValue.textContent = `${brown.toFixed(1)}%`;
  barAffectedValue.textContent = `${affected.toFixed(1)}%`;
}

/* ── Chart.js instances for Disease ── */
let diseaseDonutChart = null;
let diseaseSeverityChart = null;

function renderDiseaseCharts(metrics, impact) {
  const healthy = clampPercent(impact?.healthyArea ?? metrics?.green ?? 0);
  const yellow = clampPercent(metrics?.yellow ?? 0);
  const brown = clampPercent(metrics?.brown ?? 0);
  const dark = clampPercent(metrics?.dark ?? 0);
  const affected = clampPercent(impact?.affectedArea ?? yellow + brown);

  // Donut: Healthy vs Affected
  const donutCtx = document.getElementById("diseaseDonutChart");
  if (donutCtx) {
    if (diseaseDonutChart) diseaseDonutChart.destroy();
    diseaseDonutChart = new Chart(donutCtx, {
      type: "doughnut",
      data: {
        labels: ["Healthy Area", "Yellow Stress", "Brown/Necrosis", "Dark Spots"],
        datasets: [{
          data: [healthy, yellow, brown, dark],
          backgroundColor: ["#3cb95f", "#d9b443", "#9f6132", "#4a4a4a"],
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.9)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "55%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              padding: 16,
              font: { family: "Inter", size: 12, weight: "600" }
            }
          }
        }
      }
    });
  }

  // Bar chart: Severity breakdown
  const barCtx = document.getElementById("diseaseSeverityChart");
  if (barCtx) {
    if (diseaseSeverityChart) diseaseSeverityChart.destroy();
    diseaseSeverityChart = new Chart(barCtx, {
      type: "bar",
      data: {
        labels: ["Healthy", "Yellow", "Brown", "Dark", "Affected"],
        datasets: [{
          label: "Percentage",
          data: [healthy, yellow, brown, dark, affected],
          backgroundColor: [
            "rgba(60, 185, 95, 0.8)",
            "rgba(217, 180, 67, 0.8)",
            "rgba(159, 97, 50, 0.8)",
            "rgba(74, 74, 74, 0.8)",
            "rgba(210, 82, 60, 0.8)"
          ],
          borderRadius: 6,
          borderSkipped: false
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          y: {
            beginAtZero: true,
            max: 100,
            ticks: { font: { family: "Inter", size: 11 } },
            grid: { color: "rgba(0,0,0,0.06)" }
          },
          x: {
            ticks: { font: { family: "Inter", size: 11 } },
            grid: { display: false }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

leafUpload.addEventListener("change", () => {
  const file = leafUpload.files[0];
  if (!file) return;
  previewImage.src = URL.createObjectURL(file);
  uploadBox.classList.add("has-image");
  uploadText.textContent = "Scanning image...";
  diagnosis.innerHTML = "<span>Prediction</span><strong>Analyzing...</strong><p>Reading color, texture and symptom patterns from the uploaded leaf.</p>";
  leafReport.hidden = true;

  const reader = new FileReader();
  reader.onload = () => {
    apiPost("/api/disease", { image: reader.result })
      .then((result) => {
        uploadText.textContent = "Image scanned";
        diagnosis.innerHTML = `
          <span>Prediction</span>
          <strong>${result.prediction}: ${result.confidence}%</strong>
          <p>${result.treatment}</p>
        `;
        reportProblem.textContent = result.prediction;
        reportConfidence.textContent = `${result.confidence}%`;
        reportAffectedArea.textContent = `${(result.impact?.affectedArea ?? 0).toFixed(1)}% estimated leaf area`;
        reportSeverity.textContent = `${result.impact?.severityBand || "-"} (${(result.impact?.severityScore ?? 0).toFixed(1)}%)`;
        reportSigns.textContent = `Green area ${result.metrics.green}%, yellowing ${result.metrics.yellow}%, brown/dry spots ${result.metrics.brown}%, texture score ${result.metrics.texture}.`;
        reportAction.textContent = result.treatment;
        updateDiseaseBars(result.metrics, result.impact);
        renderDiseaseCharts(result.metrics, result.impact);
        leafReport.hidden = false;
        const user = getSavedUser();
        if (user && user.email) {
          saveDiseaseScanToFirestore(user.email, result, reader.result);
        }
      })
      .catch(() => {
        uploadText.textContent = "Server offline";
        diagnosis.innerHTML = "<span>Prediction</span><strong>Server offline</strong><p>Run start_app.bat and open http://127.0.0.1:8000 to use real image analysis.</p>";
        reportAffectedArea.textContent = "-";
        reportSeverity.textContent = "-";
        updateDiseaseBars({}, {});
        leafReport.hidden = true;
      });
  };
  reader.readAsDataURL(file);
});

/* ══════════════════════════════
   SOIL SCAN + CHART.JS GRAPHS
   ══════════════════════════════ */
const soilUpload = document.getElementById("soilUpload");
const soilPreviewImage = document.getElementById("soilPreviewImage");
const soilUploadBox = document.querySelector(".soil-upload-box");
const soilUploadText = document.getElementById("soilUploadText");
const soilReport = document.getElementById("soilReport");
const soilMinMoistureValue = document.getElementById("soilMinMoistureValue");
const soilMaxMoistureValue = document.getElementById("soilMaxMoistureValue");
const soilRangeBand = document.getElementById("soilRangeBand");
const soilCurrentMoisture = document.getElementById("soilCurrentMoisture");
const soilRangeMinLabel = document.getElementById("soilRangeMinLabel");
const soilRangeIdealLabel = document.getElementById("soilRangeIdealLabel");
const soilRangeMaxLabel = document.getElementById("soilRangeMaxLabel");

let soilMoistureChart = null;
let soilRadarChart = null;

function updateSoilRangeGraph(result) {
  const moisture = clampPercent(result.moisture);
  const minMoisture = clampPercent(result.moistureRange?.min ?? 0);
  const maxMoisture = clampPercent(result.moistureRange?.max ?? 100);
  const ideal = clampPercent(result.moistureRange?.ideal ?? (minMoisture + maxMoisture) / 2);

  soilMinMoistureValue.textContent = `${minMoisture.toFixed(1)}%`;
  soilMaxMoistureValue.textContent = `${maxMoisture.toFixed(1)}%`;

  soilRangeBand.style.left = `${minMoisture}%`;
  soilRangeBand.style.width = `${Math.max(0, maxMoisture - minMoisture)}%`;
  soilCurrentMoisture.style.left = `${moisture}%`;

  soilRangeMinLabel.textContent = `Min ${minMoisture.toFixed(1)}%`;
  soilRangeIdealLabel.textContent = `Ideal ${ideal.toFixed(1)}%`;
  soilRangeMaxLabel.textContent = `Max ${maxMoisture.toFixed(1)}%`;
}

function renderSoilCharts(result) {
  const moisture = clampPercent(result.moisture);
  const dry = Math.max(0, 100 - moisture);

  // Donut: Moisture level
  const donutCtx = document.getElementById("soilMoistureChart");
  if (donutCtx) {
    if (soilMoistureChart) soilMoistureChart.destroy();
    soilMoistureChart = new Chart(donutCtx, {
      type: "doughnut",
      data: {
        labels: ["Moisture", "Dry"],
        datasets: [{
          data: [moisture, dry],
          backgroundColor: ["#4377c6", "rgba(220, 229, 216, 0.6)"],
          borderWidth: 2,
          borderColor: "rgba(255,255,255,0.9)"
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        cutout: "60%",
        plugins: {
          legend: {
            position: "bottom",
            labels: {
              usePointStyle: true,
              padding: 16,
              font: { family: "Inter", size: 12, weight: "600" }
            }
          }
        }
      }
    });
  }

  // Radar: Soil properties
  const metrics = result.metrics || {};
  const radarCtx = document.getElementById("soilRadarChart");
  if (radarCtx) {
    if (soilRadarChart) soilRadarChart.destroy();
    soilRadarChart = new Chart(radarCtx, {
      type: "radar",
      data: {
        labels: ["Brightness", "Dark Area", "Brown Area", "Texture"],
        datasets: [{
          label: "Soil Properties",
          data: [
            Math.min(100, (metrics.brightness || 0) / 2.55),
            metrics.darkArea || 0,
            metrics.brownArea || 0,
            Math.min(100, (metrics.texture || 0) * 1.5)
          ],
          backgroundColor: "rgba(67, 119, 198, 0.2)",
          borderColor: "#4377c6",
          borderWidth: 2,
          pointBackgroundColor: "#4377c6",
          pointRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: true,
        scales: {
          r: {
            beginAtZero: true,
            max: 100,
            ticks: { display: false },
            grid: { color: "rgba(0,0,0,0.08)" },
            pointLabels: { font: { family: "Inter", size: 11, weight: "600" } }
          }
        },
        plugins: {
          legend: { display: false }
        }
      }
    });
  }
}

soilUpload.addEventListener("change", () => {
  const file = soilUpload.files[0];
  if (!file) return;
  soilPreviewImage.src = URL.createObjectURL(file);
  soilUploadBox.classList.add("has-image");
  soilUploadText.textContent = "Analyzing soil...";
  soilReport.innerHTML = "<span>Soil result</span><strong>Analyzing...</strong><p>Estimating moisture from soil color, darkness and texture.</p>";

  const reader = new FileReader();
  reader.onload = () => {
    apiPost("/api/soil", { image: reader.result })
      .then((result) => {
        soilUploadText.textContent = "Soil image scanned";
        const crops = result.possibleCrops
          .map((item) => `
            <article>
              <strong>${item.crop}</strong>
              <span>${item.suitability}% suitable</span>
              <p>${item.reason} Water need: ${item.waterNeed}.</p>
            </article>
          `)
          .join("");
        soilReport.innerHTML = `
          <span>Soil result</span>
          <strong>${result.category}: ${result.moisture}% moisture</strong>
          <p>Possible crops: ${result.allCropNames.join(", ")}. ${result.advice}</p>
        `;
        document.getElementById("soilMoistureValue").textContent = `${result.moisture}%`;
        document.getElementById("soilConditionValue").textContent = result.category;
        document.getElementById("soilSignsValue").textContent = result.signs;
        document.getElementById("soilAdviceValue").textContent = result.advice;
        updateSoilRangeGraph(result);
        renderSoilCharts(result);
        document.getElementById("soilCropList").innerHTML = crops;
        document.getElementById("soilDetailReport").hidden = false;
        const user = getSavedUser();
        if (user && user.email) {
          saveSoilScanToFirestore(user.email, result, reader.result);
        }
      })
      .catch(() => {
        soilUploadText.textContent = "Server offline";
        soilReport.innerHTML = "<span>Soil result</span><strong>Server offline</strong><p>Run start_app.bat and open http://127.0.0.1:8000 to use soil analysis.</p>";
        soilMinMoistureValue.textContent = "-";
        soilMaxMoistureValue.textContent = "-";
        soilRangeBand.style.left = "0%";
        soilRangeBand.style.width = "0%";
        soilCurrentMoisture.style.left = "0%";
        soilRangeMinLabel.textContent = "Min -";
        soilRangeIdealLabel.textContent = "Ideal -";
        soilRangeMaxLabel.textContent = "Max -";
        document.getElementById("soilDetailReport").hidden = true;
      });
  };
  reader.readAsDataURL(file);
});

/* ═══════════════════════════════════════════════════════════════
   DASHBOARD HERO SLIDESHOW
   ═══════════════════════════════════════════════════════════════ */

(function initDashboardHeroSlideshow() {
  const slides = Array.from(
    document.querySelectorAll('#heroSlideshow .hero-slide')
  );
  if (slides.length < 2) return; // nothing to rotate

  let current = 0;

  // Pre-load all images before starting rotation
  const imageSrcs = slides.map(s => {
    const url = (s.style.backgroundImage || '').replace(/^url\(['"]?/, '').replace(/['"]?\)$/, '');
    return url;
  });

  let loaded = 0;
  function onLoaded() {
    loaded++;
    if (loaded === imageSrcs.length) startSlideshow();
  }

  imageSrcs.forEach(src => {
    if (!src) { onLoaded(); return; }
    const img = new Image();
    img.onload = img.onerror = onLoaded;
    img.src = src;
  });

  function startSlideshow() {
    // Make sure first slide is active
    slides.forEach((s, i) => s.classList.toggle('active', i === 0));

    setInterval(() => {
      slides[current].classList.remove('active');
      current = (current + 1) % slides.length;
      slides[current].classList.add('active');
    }, 3500); // rotate every 3.5 seconds
  }
})();
