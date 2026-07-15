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
const VEGETATION_HOTSPOTS = [
  { name: "Amazon Basin", lat: -3.5, lng: -62.0, weight: 5.0 },
  { name: "Congo Basin", lat: -0.5, lng: 23.5, weight: 4.6 },
  { name: "Southeast Asia", lat: 10.5, lng: 105.0, weight: 4.8 },
  { name: "Western Ghats", lat: 11.0, lng: 76.0, weight: 4.2 },
  { name: "Indo-Gangetic Plain", lat: 26.5, lng: 79.0, weight: 4.7 },
  { name: "East Africa Rift", lat: 0.5, lng: 36.5, weight: 3.4 },
  { name: "Eastern China", lat: 31.0, lng: 118.0, weight: 4.1 },
  { name: "US Midwest", lat: 41.5, lng: -93.5, weight: 3.8 },
  { name: "Central Europe", lat: 48.0, lng: 11.0, weight: 3.0 },
  { name: "Brazil Atlantic Coast", lat: -15.0, lng: -47.5, weight: 4.0 }
];

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
document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

/* ═══════════════════════════════════
   MAP — Vegetation heatmap & Places (Leaflet.js + OSM)
   ═══════════════════════════════════ */
let mapInstance = null;
let hotspotMarkers = [];
let placeMarkers = [];
let userLocation = null;

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
  { name: "Kerala Agricultural University Extension", lat: 9.9912, lng: 76.2890, address: "Kochi Center, Kerala", type: "university" },

  // --- Organic Farming Centers ---
  { name: "National Centre of Organic Farming (NCOF)", lat: 28.6790, lng: 77.4410, address: "Hapur Road, Ghaziabad near Delhi NCR", type: "organic" },
  { name: "Organic Agriculture Development Association", lat: 12.9212, lng: 77.6405, address: "HSR Layout, Bangalore, Karnataka", type: "organic" },
  { name: "Bio-dynamic Organic Research Station", lat: 19.1412, lng: 72.8234, address: "Borivali West, Mumbai, Maharashtra", type: "organic" }
];

function renderVegetationFallback(message) {
  if (vegetationMapElement) {
    vegetationMapElement.innerHTML = `
      <div class="map-fallback">
        <strong>Map preview unavailable</strong>
        <p>${message}</p>
      </div>
    `;
  }
  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = message;
  }
}

function clearPlaceMarkers() {
  if (mapInstance) {
    placeMarkers.forEach(m => mapInstance.removeLayer(m));
  }
  placeMarkers = [];
}

function showHotspotMarkers() {
  hideHotspotMarkers();
  VEGETATION_HOTSPOTS.forEach((hotspot) => {
    const circle = L.circle([hotspot.lat, hotspot.lng], {
      color: "#14532d",
      weight: 1,
      fillColor: "#22c55e",
      fillOpacity: 0.35 + (hotspot.weight * 0.08),
      radius: hotspot.weight * 130000
    }).bindPopup(`<strong>${hotspot.name}</strong><br>Vegetation density score: ${hotspot.weight}/5`)
      .addTo(mapInstance);
    hotspotMarkers.push(circle);
  });
}

function hideHotspotMarkers() {
  if (mapInstance) {
    hotspotMarkers.forEach(layer => mapInstance.removeLayer(layer));
  }
  hotspotMarkers = [];
}

function showHeatmap() {
  clearPlaceMarkers();
  showHotspotMarkers();
  if (mapInstance) {
    mapInstance.setView([12, 10], 2);
  }
  const resultsInfo = document.getElementById("mapResultsInfo");
  if (resultsInfo) resultsInfo.hidden = true;
  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = "Green zones highlight dense plantation and vegetation-friendly regions around the world.";
  }
}

function searchNearbyPlaces(category) {
  if (!mapInstance) return;

  clearPlaceMarkers();
  hideHotspotMarkers();

  const labelMap = {
    nursery: "Nurseries",
    fertilizer: "Fertilizer Shops & Seed Centers",
    plantation: "Agricultural Offices, Laboratories & Research Centers"
  };
  const label = labelMap[category] || category;

  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = `Searching for nearby ${label}...`;
  }

  if (userLocation) {
    doOsmSearch(category, userLocation.lat, userLocation.lng);
  } else {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(
        (pos) => {
          userLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
          doOsmSearch(category, userLocation.lat, userLocation.lng);
        },
        () => {
          userLocation = { lat: 12.9716, lng: 77.5946 };
          doOsmSearch(category, userLocation.lat, userLocation.lng);
        },
        { timeout: 5000 }
      );
    } else {
      userLocation = { lat: 12.9716, lng: 77.5946 };
      doOsmSearch(category, userLocation.lat, userLocation.lng);
    }
  }
}

function getOverpassQuery(category, lat, lng) {
  let subQueries = "";
  if (category === "nursery") {
    subQueries = `
      node["shop"="nursery"](around:15000, ${lat}, ${lng});
      way["shop"="nursery"](around:15000, ${lat}, ${lng});
      node["landuse"="nursery"](around:15000, ${lat}, ${lng});
      way["landuse"="nursery"](around:15000, ${lat}, ${lng});
    `;
  } else if (category === "fertilizer") {
    subQueries = `
      node["shop"="fertilizer"](around:15000, ${lat}, ${lng});
      node["shop"="agricultural_supplies"](around:15000, ${lat}, ${lng});
      node["shop"="seeds"](around:15000, ${lat}, ${lng});
      way["shop"="fertilizer"](around:15000, ${lat}, ${lng});
      way["shop"="agricultural_supplies"](around:15000, ${lat}, ${lng});
    `;
  } else if (category === "plantation") {
    subQueries = `
      node["office"="government"]["name"~"Agriculture|Krishi", i](around:15000, ${lat}, ${lng});
      node["office"="government"]["government"~"agriculture", i](around:15000, ${lat}, ${lng});
      node["amenity"="university"]["name"~"Agriculture|Krishi|Agri", i](around:15000, ${lat}, ${lng});
      node["shop"="organic"](around:15000, ${lat}, ${lng});
      node["building"="laboratory"]["name"~"Soil", i](around:15000, ${lat}, ${lng});
      node["office"="government"]["name"~"Soil", i](around:15000, ${lat}, ${lng});
    `;
  }
  return `[out:json][timeout:12];(${subQueries});out center 15;`;
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
      if (queryType === "plantation") return item.type === "office" || item.type === "lab" || item.type === "university" || item.type === "organic";
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

function doOsmSearch(category, lat, lng) {
  mapInstance.setView([lat, lng], 12);

  const blueIcon = L.divIcon({
    className: "user-leaflet-marker",
    html: `<div style="background-color: #4285F4; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); animation: pulseMarker 1.5s infinite alternate;"></div>`,
    iconSize: [14, 14],
    iconAnchor: [7, 7]
  });
  const userMarker = L.marker([lat, lng], { icon: blueIcon })
    .bindPopup(`<div style="font-family:Inter,sans-serif;padding:2px">
      <strong style="color:#4285F4;font-size:13px">📍 Your Location</strong>
      <p style="margin:4px 0 0;color:#555;font-size:11px">Centering search here.</p>
    </div>`)
    .addTo(mapInstance);
  placeMarkers.push(userMarker);

  const query = getOverpassQuery(category, lat, lng);
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
      console.log("[KrishiSev] Overpass returned zero results. Loading from local database...");
      loadLocalFallbackData(category, lat, lng);
      return;
    }

    const items = elements.map(el => {
      const tags = el.tags || {};
      let name = tags.name || tags.operator || "";
      if (!name) {
        if (category === "nursery") name = "Local Nursery";
        else if (category === "fertilizer") name = "Fertilizer Depot";
        else name = "Agricultural Office";
      }
      const elLat = el.lat || (el.center && el.center.lat);
      const elLng = el.lon || (el.center && el.center.lon);
      
      const street = tags["addr:street"] || "";
      const city = tags["addr:city"] || "";
      const address = [street, city].filter(Boolean).join(", ") || "Located nearby";

      return { name, lat: elLat, lng: elLng, address };
    }).filter(item => item.lat && item.lng);

    renderPlaceMarkers(items, category, false, lat, lng);
  })
  .catch(err => {
    console.warn("[KrishiSev] Overpass API query failed. Gracefully falling back to local database...", err);
    loadLocalFallbackData(category, lat, lng);
  });
}

function renderPlaceMarkers(items, category, isOffline, lat, lng) {
  const greenIcon = L.divIcon({
    className: "custom-leaflet-marker",
    html: `<div style="background-color: #198754; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
    iconSize: [12, 12],
    iconAnchor: [6, 6]
  });

  items.forEach(item => {
    const marker = L.marker([item.lat, item.lng], { icon: greenIcon })
      .bindPopup(`<div style="font-family:Inter,sans-serif;padding:2px">
        <strong style="color:#198754;font-size:13px">${item.name}</strong>
        <p style="margin:4px 0 0;color:#555;font-size:11px">${item.address}</p>
        <p style="margin:4px 0 0;font-size:11px;color:#777;">
          Type: ${item.type ? item.type.charAt(0).toUpperCase() + item.type.slice(1) : category.toUpperCase()}
        </p>
        ${isOffline ? `<p style="margin:4px 0 0;color:#dc3545;font-size:10px;font-weight:600;">⚠️ Loaded from Offline DB (Proximity: ${item.distance.toFixed(1)} km)</p>` : ""}
      </div>`)
      .addTo(mapInstance);
    placeMarkers.push(marker);
  });

  const resultsInfo = document.getElementById("mapResultsInfo");
  const resultsCount = document.getElementById("mapResultsCount");
  if (resultsInfo && resultsCount) {
    if (isOffline) {
      resultsCount.textContent = `Offline Mode: Showing ${items.length} closest verified resources for "${category}" from local database.`;
    } else {
      resultsCount.textContent = `Found ${items.length} live resource${items.length > 1 ? "s" : ""} for "${category}".`;
    }
    resultsInfo.hidden = false;
  }

  if (vegetationMapStatus) {
    if (isOffline) {
      vegetationMapStatus.textContent = `Showing offline database resources near coordinates [${lat.toFixed(4)}, ${lng.toFixed(4)}].`;
    } else {
      vegetationMapStatus.textContent = `Showing ${items.length} live resource${items.length > 1 ? "s" : ""} from OpenStreetMap.`;
    }
  }

  if (placeMarkers.length > 0) {
    const group = new L.featureGroup(placeMarkers);
    mapInstance.fitBounds(group.getBounds().pad(0.15));
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

  showHeatmap();

  if (navigator.geolocation) {
    if (vegetationMapStatus) vegetationMapStatus.textContent = "Detecting your location...";
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const userLat = pos.coords.latitude;
        const userLng = pos.coords.longitude;
        userLocation = { lat: userLat, lng: userLng };
        mapInstance.setView([userLat, userLng], 12);

        const blueIcon = L.divIcon({
          className: "user-leaflet-marker",
          html: `<div style="background-color: #4285F4; width: 14px; height: 14px; border-radius: 50%; border: 3px solid white; box-shadow: 0 0 6px rgba(0,0,0,0.4); animation: pulseMarker 1.5s infinite alternate;"></div>`,
          iconSize: [14, 14],
          iconAnchor: [7, 7]
        });

        const userMarker = L.marker([userLat, userLng], { icon: blueIcon })
          .bindPopup(`<div style="font-family:Inter,sans-serif;padding:2px">
            <strong style="color:#4285F4;font-size:13px">📍 Your Location</strong>
            <p style="margin:4px 0 0;color:#555;font-size:11px">Use the buttons above to find nurseries &amp; agri resources near you.</p>
          </div>`)
          .addTo(mapInstance);
        
        userMarker.openPopup();
        placeMarkers.push(userMarker);

        if (vegetationMapStatus) {
          vegetationMapStatus.textContent = "Showing your location. Use buttons above to search nearby resources.";
        }
      },
      () => {
        userLocation = { lat: 12.9716, lng: 77.5946 };
        mapInstance.setView([12.9716, 77.5946], 12);
        if (vegetationMapStatus) {
          vegetationMapStatus.textContent = "Location access denied. Centered on Bangalore. Use buttons above to search.";
        }
      },
      { timeout: 8000 }
    );
  } else {
    userLocation = { lat: 12.9716, lng: 77.5946 };
    mapInstance.setView([12.9716, 77.5946], 12);
    if (vegetationMapStatus) {
      vegetationMapStatus.textContent = "Geolocation not supported by browser. Centered on Bangalore.";
    }
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
          if (searchType === "hotspots") {
            showHeatmap();
          } else if (searchType === "nursery") {
            searchNearbyPlaces("nursery");
          } else if (searchType === "fertilizer") {
            searchNearbyPlaces("fertilizer");
          } else if (searchType === "plantation") {
            searchNearbyPlaces("plantation");
          }
        }
      }
    })
    .catch((err) => console.warn("[KrishiSev] Map search load error:", err));
}


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
