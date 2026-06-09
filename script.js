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

function getSavedUser() {
  const raw = sessionStorage.getItem(SESSION_KEY);
  if (!raw) return null;
  try {
    const user = JSON.parse(raw);
    if (user && typeof user === "object" && user.email) {
      return user;
    }
  } catch {
    return null;
  }
  return null;
}

function setSavedUser(user) {
  sessionStorage.setItem(SESSION_KEY, JSON.stringify(user));
}

async function apiPost(path, payload) {
  try {
    const response = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });
    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.error || "Request failed");
    }
    return data;
  } catch {
    throw new Error("Server offline. Run start_app.bat and open http://127.0.0.1:8000.");
  }
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

function initVegetationMap() {
  if (!vegetationMapElement) return;
  if (!window.google || !window.google.maps || !window.google.maps.visualization) {
    renderVegetationFallback("Google Maps did not load.");
    return;
  }

  const map = new window.google.maps.Map(vegetationMapElement, {
    center: { lat: 12, lng: 10 },
    zoom: 2,
    minZoom: 2,
    maxZoom: 5,
    disableDefaultUI: true,
    gestureHandling: "greedy",
    mapTypeId: "terrain",
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

  const heatmap = new window.google.maps.visualization.HeatmapLayer({
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

  heatmap.setMap(map);

  VEGETATION_HOTSPOTS.forEach((hotspot) => {
    new window.google.maps.Marker({
      position: { lat: hotspot.lat, lng: hotspot.lng },
      map,
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
  });

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
  script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(GOOGLE_MAPS_API_KEY)}&libraries=visualization&callback=initVegetationMap&v=weekly`;
  script.onerror = () => renderVegetationFallback("Google Maps failed to load.");
  document.head.appendChild(script);
}

loadVegetationMap();

function setLoggedIn(user) {
  setSavedUser(user);
  farmerBadge.textContent = user.name || user.email;
  loginScreen.classList.add("hidden");
  document.body.classList.remove("locked");
  loadConversation(user);
}

function setLoggedOut() {
  sessionStorage.removeItem(SESSION_KEY);
  loginScreen.classList.remove("hidden");
  document.body.classList.add("locked");
  chatWindow.innerHTML = "";
  loginEmail.focus();
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
  apiPost("/api/login", {
    email: loginEmail.value,
    password: loginPassword.value
  })
    .then((result) => setLoggedIn(result.user))
    .catch((error) => {
      loginError.textContent = error.message || "Login failed.";
    });
});

registerButton.addEventListener("click", () => {
  loginError.textContent = "";
  apiPost("/api/register", {
    email: loginEmail.value,
    password: loginPassword.value
  })
    .then((result) => setLoggedIn(result.user))
    .catch((error) => {
      loginError.textContent = error.message || "Account creation failed.";
    });
});

logoutButton.addEventListener("click", () => {
  loginPassword.value = "";
  setLoggedOut();
});

document.querySelectorAll("[data-scroll]").forEach((button) => {
  button.addEventListener("click", () => {
    document.querySelector(button.dataset.scroll).scrollIntoView({ behavior: "smooth" });
  });
});

document.getElementById("themeToggle").addEventListener("click", () => {
  document.body.classList.toggle("dark");
});

chatForm.addEventListener("submit", (event) => {
  event.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  const user = getSavedUser() || { email: "guest", name: "Guest" };
  addMessage(text, "user");
  chatInput.value = "";
  addMessage("Analyzing your question...", "bot loading");
  apiPost("/api/chat", { message: text, email: user.email, name: user.name })
    .then((data) => replaceLoadingMessage(data.reply))
    .catch(() => replaceLoadingMessage("Please run start_app.bat first, then open http://127.0.0.1:8000 for the full KRISHISEV chatbot."));
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
        addMessage(`Welcome ${user.name || user.email}. Ask about crops, soil, irrigation, fertilizer or leaf disease.`, "bot");
        return;
      }
      data.history.forEach((item) => addMessage(item.text, item.type));
    })
    .catch(() => {
      addMessage(`Welcome ${user.name || user.email}. Your saved conversation will load when the server is available.`, "bot");
    });
}

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
        document.getElementById("soilCropList").innerHTML = crops;
        document.getElementById("soilDetailReport").hidden = false;
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
        leafReport.hidden = false;
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
