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
const GOOGLE_MAPS_API_KEY = window.GOOGLE_MAPS_API_KEY || "";
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
  apiKey: "AIzaSyAH9mJPopVA_rH83FNO9YGeJZkVLidCnww",
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

async function saveDiseaseScanToFirestore(email, scanResult, base64Image) {
  if (!firestoreDb) return;
  try {
    const cropSelect = document.getElementById("diseaseCropSelect");
    const cropName = cropSelect ? cropSelect.value : "General Crop";
    
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
      image: base64Image
    };
    
    await firestoreDb.collection("detections").add(docData);
    console.log("Disease scan result successfully saved to Firestore 'detections' collection.");
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
      recommendedCrops: scanResult.allCropNames || [],
      suitabilityScores: (scanResult.possibleCrops || []).map(item => ({
        crop: item.crop,
        suitability: item.suitability
      })),
      imageAnalysis: scanResult.metrics || {}
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
      
      let condition = "Soil Analysis";
      if (data.moisturePercentage !== undefined) {
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
  timestamp: firebase.firestore.FieldValue.serverTimestamp()
});
      console.log("User credentials successfully saved to Firestore 'users' collection.");
    }
  } catch (error) {
    console.error("Error saving user credentials to Firestore:", error);
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
   MAP — Vegetation heatmap & Places
   ═══════════════════════════════════ */
let mapInstance = null;
let heatmapLayer = null;
let hotspotMarkers = [];
let placeMarkers = [];
let placesService = null;

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
  placeMarkers.forEach(m => m.setMap(null));
  placeMarkers = [];
}

function showHotspotMarkers() {
  hotspotMarkers.forEach(m => m.setMap(mapInstance));
}

function hideHotspotMarkers() {
  hotspotMarkers.forEach(m => m.setMap(null));
}

function showHeatmap() {
  clearPlaceMarkers();
  showHotspotMarkers();
  if (heatmapLayer) heatmapLayer.setMap(mapInstance);
  if (mapInstance) {
    mapInstance.setCenter({ lat: 12, lng: 10 });
    mapInstance.setZoom(2);
  }
  const resultsInfo = document.getElementById("mapResultsInfo");
  if (resultsInfo) resultsInfo.hidden = true;
  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = "Green zones highlight dense plantation and vegetation-friendly regions around the world.";
  }
}

function searchNearbyPlaces(query) {
  if (!mapInstance) return;

  clearPlaceMarkers();
  hideHotspotMarkers();
  if (heatmapLayer) heatmapLayer.setMap(null);

  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = `Searching for "${query}" near your area...`;
  }

  // Try to get user's location, otherwise fall back to India center
  if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
      (pos) => doPlacesSearch(query, pos.coords.latitude, pos.coords.longitude),
      () => doPlacesSearch(query, 20.5937, 78.9629), // India center fallback
      { timeout: 5000 }
    );
  } else {
    doPlacesSearch(query, 20.5937, 78.9629);
  }
}

function doPlacesSearch(query, lat, lng) {
  mapInstance.setCenter({ lat, lng });
  mapInstance.setZoom(12);

  if (!placesService) {
    // If Places library isn't loaded, show fallback markers
    showFallbackPlaces(query, lat, lng);
    return;
  }

  const request = {
    query: query,
    location: new window.google.maps.LatLng(lat, lng),
    radius: 15000
  };

  placesService.textSearch(request, (results, status) => {
    if (status === window.google.maps.places.PlacesServiceStatus.OK && results.length > 0) {
      results.forEach((place) => {
        const marker = new window.google.maps.Marker({
          position: place.geometry.location,
          map: mapInstance,
          title: place.name,
          animation: window.google.maps.Animation.DROP,
          icon: {
            path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
            fillColor: "#198754",
            fillOpacity: 0.95,
            strokeColor: "#14532d",
            strokeWeight: 1.5,
            scale: 6
          }
        });

        const info = new window.google.maps.InfoWindow({
          content: `<div style="font-family:Inter,sans-serif;padding:4px">
            <strong style="font-size:14px">${place.name}</strong>
            <p style="margin:4px 0 0;color:#555;font-size:12px">${place.formatted_address || ""}</p>
            ${place.rating ? `<p style="margin:4px 0 0;font-size:12px">⭐ ${place.rating} / 5</p>` : ""}
          </div>`
        });

        marker.addListener("click", () => info.open(mapInstance, marker));
        placeMarkers.push(marker);
      });

      const resultsInfo = document.getElementById("mapResultsInfo");
      const resultsCount = document.getElementById("mapResultsCount");
      if (resultsInfo && resultsCount) {
        resultsCount.textContent = `Found ${results.length} result${results.length > 1 ? "s" : ""} for "${query}"`;
        resultsInfo.hidden = false;
      }
      if (vegetationMapStatus) {
        vegetationMapStatus.textContent = `Showing ${results.length} result${results.length > 1 ? "s" : ""} near your location.`;
      }
    } else {
      showFallbackPlaces(query, lat, lng);
    }
  });
}

function showFallbackPlaces(query, lat, lng) {
  // Generate simulated nearby places when Places API is unavailable
  const offsets = [
    { dlat: 0.01, dlng: 0.02 },
    { dlat: -0.015, dlng: 0.008 },
    { dlat: 0.008, dlng: -0.018 },
    { dlat: -0.005, dlng: -0.012 },
    { dlat: 0.02, dlng: -0.005 }
  ];
  const names = {
    nursery: ["Green Valley Nursery", "Farmers Plant Hub", "Krishi Nursery", "Seedling Center", "Plant World"],
    fertilizer: ["Agri Fertilizer Store", "Krishi Seva Kendra", "Farm Chem Supply", "Nutrient Plus", "Soil Health Shop"],
    plantation: ["Plantation Supplies Co", "Crop & Seed Mart", "Farm Equipment Store", "Agri Tools Center", "Green Farm Shop"]
  };
  const category = query.includes("nursery") || query.includes("nurseries") ? "nursery"
    : query.includes("fertilizer") ? "fertilizer" : "plantation";

  offsets.forEach((offset, i) => {
    const pos = { lat: lat + offset.dlat, lng: lng + offset.dlng };
    const marker = new window.google.maps.Marker({
      position: pos,
      map: mapInstance,
      title: names[category][i],
      animation: window.google.maps.Animation.DROP,
      icon: {
        path: window.google.maps.SymbolPath.BACKWARD_CLOSED_ARROW,
        fillColor: "#198754",
        fillOpacity: 0.95,
        strokeColor: "#14532d",
        strokeWeight: 1.5,
        scale: 6
      }
    });

    const info = new window.google.maps.InfoWindow({
      content: `<div style="font-family:Inter,sans-serif;padding:4px">
        <strong style="font-size:14px">${names[category][i]}</strong>
        <p style="margin:4px 0 0;color:#555;font-size:12px">Near your location</p>
      </div>`
    });
    marker.addListener("click", () => info.open(mapInstance, marker));
    placeMarkers.push(marker);
  });

  const resultsInfo = document.getElementById("mapResultsInfo");
  const resultsCount = document.getElementById("mapResultsCount");
  if (resultsInfo && resultsCount) {
    resultsCount.textContent = `Showing ${offsets.length} estimated locations for "${query}". Enable Google Places API for real results.`;
    resultsInfo.hidden = false;
  }
  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = "Showing estimated locations. Add Google Places API key for accurate results.";
  }
}

function initVegetationMap() {
  if (!vegetationMapElement) return;
  if (!window.google || !window.google.maps || !window.google.maps.visualization) {
    renderVegetationFallback("Google Maps did not load.");
    return;
  }

  mapInstance = new window.google.maps.Map(vegetationMapElement, {
    center: { lat: 12, lng: 10 },
    zoom: 2,
    minZoom: 2,
    maxZoom: 18,
    disableDefaultUI: false,
    gestureHandling: "greedy",
    mapTypeId: "terrain",
    zoomControl: true,
    streetViewControl: false,
    styles: [
      { elementType: "geometry", stylers: [{ color: "#e7f0df" }] },
      { elementType: "labels.text.fill", stylers: [{ color: "#3f5b40" }] },
      { elementType: "labels.text.stroke", stylers: [{ color: "#eff6e8" }] },
      { featureType: "water", elementType: "geometry", stylers: [{ color: "#8fc1ff" }] },
      { featureType: "landscape.natural", elementType: "geometry.fill", stylers: [{ color: "#d9eac0" }] },
      { featureType: "landscape.man_made", elementType: "geometry.fill", stylers: [{ color: "#f2eed4" }] },
      { featureType: "road", elementType: "geometry", stylers: [{ color: "#ffffff" }] }
    ]
  });

  heatmapLayer = new window.google.maps.visualization.HeatmapLayer({
    data: VEGETATION_HOTSPOTS.map((hotspot) => ({
      location: new window.google.maps.LatLng(hotspot.lat, hotspot.lng),
      weight: hotspot.weight
    })),
    radius: 52,
    opacity: 0.78,
    dissipating: true,
    gradient: [
      "rgba(255, 255, 255, 0)",
      "rgba(194, 240, 136, 0.3)",
      "rgba(122, 210, 87, 0.55)",
      "rgba(41, 173, 70, 0.84)",
      "rgba(16, 126, 49, 1)"
    ]
  });

  heatmapLayer.setMap(mapInstance);

  VEGETATION_HOTSPOTS.forEach((hotspot) => {
    const marker = new window.google.maps.Marker({
      position: { lat: hotspot.lat, lng: hotspot.lng },
      map: mapInstance,
      title: hotspot.name,
      icon: {
        path: window.google.maps.SymbolPath.CIRCLE,
        fillColor: "#22c55e",
        fillOpacity: 0.92,
        strokeColor: "#14532d",
        strokeWeight: 1,
        scale: 5 + hotspot.weight
      }
    });
    hotspotMarkers.push(marker);
  });

  // Initialize Places service if available
  if (window.google.maps.places) {
    placesService = new window.google.maps.places.PlacesService(mapInstance);
  }

  if (vegetationMapStatus) {
    vegetationMapStatus.textContent = "Green zones highlight dense plantation and vegetation-friendly regions around the world.";
  }
}

function loadVegetationMap() {
  if (!vegetationMapElement) return;
  if (!GOOGLE_MAPS_API_KEY) {
    renderVegetationFallback("Add a Google Maps API key in window.GOOGLE_MAPS_API_KEY to show the live map.");
    return;
  }
  if (window.google && window.google.maps) {
    initVegetationMap();
    return;
  }

  window.initVegetationMap = initVegetationMap;
  const existing = document.getElementById("googleMapsScript");
  if (existing) return;

  const script = document.createElement("script");
  script.id = "googleMapsScript";
  script.async = true;
  script.defer = true;
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=visualization,places&callback=initVegetationMap&v=weekly`;
  script.onerror = () => renderVegetationFallback("Google Maps failed to load.");
  document.head.appendChild(script);
}

loadVegetationMap();

// Map search buttons
document.querySelectorAll(".map-search-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    // Toggle active state
    document.querySelectorAll(".map-search-btn").forEach(b => b.classList.remove("active"));
    btn.classList.add("active");

    const searchType = btn.dataset.search;
    if (searchType === "hotspots") {
      showHeatmap();
    } else if (searchType === "nursery") {
      searchNearbyPlaces("plant nursery near me");
    } else if (searchType === "fertilizer") {
      searchNearbyPlaces("fertilizer shop near me");
    } else if (searchType === "plantation") {
      searchNearbyPlaces("plantation shop agricultural supply near me");
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
  const email = loginEmail.value;
  const password = loginPassword.value;
  apiPost("/api/login", {
    email: email,
    password: password
  })
    .then((result) => {
      setLoggedIn(result.user);
saveUserCredentialsToFirestore(email);
    })
    .catch((error) => {
      loginError.textContent = error.message || "Login failed.";
    });
});

registerButton.addEventListener("click", () => {
  loginError.textContent = "";
  const email = loginEmail.value;
  const password = loginPassword.value;
  apiPost("/api/register", {
    email: email,
    password: password
  })
    .then((result) => {
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
chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const user = getSavedUser() || { email: "guest", name: "Guest" };
  addMessage(text, "user");
  chatInput.value = "";
  addMessage("Thinking...", "bot loading");
  apiPost("/api/chat", { message: text, email: user.email, name: user.name })
    .then((data) => replaceLoadingMessage(data.reply))
    .catch(() => replaceLoadingMessage("Server offline. Please run start_app.bat and open http://127.0.0.1:8000."));
});

function addMessage(text, type) {
  const message = document.createElement("div");
  message.className = `message ${type}`;
  message.textContent = text;
  chatWindow.appendChild(message);
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function replaceLoadingMessage(text) {
  const loading = chatWindow.querySelector(".message.loading");
  if (loading) {
    loading.className = "message bot";
    loading.textContent = text;
  } else {
    addMessage(text, "bot");
  }
  chatWindow.scrollTop = chatWindow.scrollHeight;
}

function loadConversation(user) {
  chatWindow.innerHTML = "";
  apiPost("/api/history", { email: user.email, name: user.name })
    .then((data) => {
      if (!data.history || data.history.length === 0) {
        addMessage(`Welcome ${user.name || user.email}. Ask about crops, soil, irrigation, fertilizer, plantation, government schemes or leaf disease.`, "bot");
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
