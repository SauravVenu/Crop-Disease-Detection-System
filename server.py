from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse
import base64
import io
import json
import math
import re
import sqlite3
import hashlib
import secrets
import time

import numpy as np
from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parent
HOST = "127.0.0.1"
PORT = 8000
CONVERSATION_FILE = ROOT / "conversations.json"
AUTH_FILE = ROOT / "users.json"
DATABASE_FILE = ROOT / "krishisev.db"
EMAIL_RE = re.compile(r"^[^\s@]+@[^\s@]+\.[^\s@]+$")
ALLOWED_EMAIL_DOMAINS = {"gmail.com"}


CROP_PROFILES = {
    "Rice": {"nitrogen": 90, "phosphorus": 42, "potassium": 43, "ph": 6.4, "moisture": 82, "rainfall": 225},
    "Maize": {"nitrogen": 78, "phosphorus": 48, "potassium": 45, "ph": 6.6, "moisture": 58, "rainfall": 105},
    "Tomato": {"nitrogen": 82, "phosphorus": 55, "potassium": 68, "ph": 6.5, "moisture": 63, "rainfall": 120},
    "Potato": {"nitrogen": 62, "phosphorus": 58, "potassium": 92, "ph": 5.7, "moisture": 66, "rainfall": 95},
    "Cotton": {"nitrogen": 72, "phosphorus": 38, "potassium": 54, "ph": 7.2, "moisture": 44, "rainfall": 72},
    "Sugarcane": {"nitrogen": 112, "phosphorus": 54, "potassium": 82, "ph": 6.9, "moisture": 78, "rainfall": 185},
    "Millet": {"nitrogen": 42, "phosphorus": 28, "potassium": 34, "ph": 7.1, "moisture": 32, "rainfall": 48},
    "Groundnut": {"nitrogen": 38, "phosphorus": 52, "potassium": 49, "ph": 6.3, "moisture": 42, "rainfall": 68},
}

FEATURE_RANGES = {
    "nitrogen": 120,
    "phosphorus": 90,
    "potassium": 110,
    "ph": 3.5,
    "moisture": 80,
    "rainfall": 240,
}


CHAT_KNOWLEDGE = [
    (
        r"\b(yellow|spots|leaf spot|blight|tomato)\b",
        "Yellow or spotted tomato leaves may indicate early blight, leaf spot, nutrient stress or water imbalance. Remove badly affected leaves, avoid wetting foliage, improve airflow and upload a clear leaf image for disease analysis.",
    ),
    (
        r"\b(fertilizer|npk|nitrogen|phosphorus|potassium)\b",
        "Use fertilizer after checking soil condition. Nitrogen supports leafy growth, phosphorus helps roots and flowering, and potassium improves fruit quality and disease tolerance. Avoid overuse because it can burn roots.",
    ),
    (
        r"\b(rice|paddy)\b",
        "Rice usually performs best with high water availability, warm temperature, pH around 5.5 to 7.0 and good nitrogen management. Standing water should be managed carefully to reduce pest pressure.",
    ),
    (
        r"\b(water|irrigation|moisture|rain)\b",
        "Irrigate based on soil moisture, not only schedule. Water deeply, avoid frequent shallow watering, and reduce overhead irrigation when disease symptoms are visible.",
    ),
    (
        r"\b(pest|insect|worm|aphid|whitefly)\b",
        "Inspect the underside of leaves early morning. Remove heavily affected parts, use sticky traps where useful and prefer targeted treatment after identifying the pest.",
    ),
    (
        r"\b(soil|ph|acidic|alkaline)\b",
        "Healthy soil needs balanced pH, organic matter, drainage and nutrients. Most crops prefer pH around 6.0 to 7.5, but potato tolerates slightly acidic soil and cotton tolerates mildly alkaline soil.",
    ),
    (
        r"\b(hello|hi|namaste|thanks|thank you)\b",
        "Hello. Share the crop name, symptoms, soil pH, moisture or recent weather and I will narrow down the advice.",
    ),
]


def summarize_chat_topic(message):
    words = [word for word in re.findall(r"[a-z0-9']+", message.lower()) if len(word) > 3]
    stop_words = {"about", "there", "this", "that", "your", "what", "when", "where", "which", "have", "with", "from", "please", "help"}
    focus_words = [word for word in words if word not in stop_words]
    return " ".join(focus_words[:3])


def json_response(handler, payload, status=200):
    body = json.dumps(payload, ensure_ascii=True).encode("utf-8")
    handler.send_response(status)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Content-Length", str(len(body)))
    handler.send_header("Access-Control-Allow-Origin", "*")
    handler.end_headers()
    handler.wfile.write(body)


def read_json(handler):
    length = int(handler.headers.get("Content-Length", 0))
    if length == 0:
        return {}
    raw = handler.rfile.read(length).decode("utf-8")
    return json.loads(raw)


def farmer_key(name):
    identifier = str(name).strip().lower()
    if EMAIL_RE.match(identifier):
        return identifier
    cleaned = re.sub(r"[^a-z0-9_-]+", "_", identifier)
    return cleaned.strip("_") or "guest"


def load_conversations():
    if not CONVERSATION_FILE.exists():
        return {}
    try:
        return json.loads(CONVERSATION_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}


def save_conversations(data):
    CONVERSATION_FILE.write_text(json.dumps(data, indent=2, ensure_ascii=True), encoding="utf-8")


def get_db_connection():
    connection = sqlite3.connect(DATABASE_FILE)
    connection.row_factory = sqlite3.Row
    return connection


def init_database():
    with get_db_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS users (
                email TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                password_hash TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS chat_messages (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                email TEXT NOT NULL,
                message_type TEXT NOT NULL,
                message_text TEXT NOT NULL,
                created_at INTEGER NOT NULL
            )
            """
        )

        invalid_emails = [
            row["email"]
            for row in connection.execute("SELECT email FROM users").fetchall()
            if not is_allowed_email(row["email"])
        ]
        for email in invalid_emails:
            connection.execute("DELETE FROM chat_messages WHERE email = ?", (email,))
            connection.execute("DELETE FROM users WHERE email = ?", (email,))

    legacy_accounts = load_legacy_accounts()
    if legacy_accounts:
        with get_db_connection() as connection:
            for email, user in legacy_accounts.items():
                connection.execute(
                    """
                    INSERT INTO users (email, name, password_hash, created_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(email) DO NOTHING
                    """,
                    (
                        email,
                        user.get("name") or display_name_from_email(email),
                        user.get("password_hash") or hash_password(str(user.get("password", ""))),
                        int(user.get("created", time.time())),
                    ),
                )


def load_legacy_accounts():
    if not AUTH_FILE.exists():
        return {}
    try:
        data = json.loads(AUTH_FILE.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return {}
    if not isinstance(data, dict):
        return {}
    migrated = {}
    for email, user in data.items():
        normalized_email = normalize_email(email)
        if not is_allowed_email(normalized_email):
            continue
        password_value = user.get("password", "")
        migrated[normalized_email] = {
            "email": normalized_email,
            "name": user.get("name") or display_name_from_email(normalized_email),
            "password_hash": user.get("password_hash") or hash_password(str(password_value)),
            "created": int(user.get("created", time.time())),
        }
    return migrated


def hash_password(password, salt=None):
    salt = salt or secrets.token_hex(16)
    derived = hashlib.pbkdf2_hmac("sha256", password.encode("utf-8"), salt.encode("utf-8"), 120000)
    return f"pbkdf2_sha256${salt}${derived.hex()}"


def verify_password(password, stored_hash):
    try:
        algorithm, salt, digest = stored_hash.split("$", 2)
    except ValueError:
        return False
    if algorithm != "pbkdf2_sha256":
        return False
    return secrets.compare_digest(hash_password(password, salt), stored_hash)


def normalize_email(email):
    return str(email).strip().lower()


def is_allowed_email(email):
    normalized = normalize_email(email)
    if not EMAIL_RE.match(normalized):
        return False
    domain = normalized.rsplit("@", 1)[-1]
    return domain in ALLOWED_EMAIL_DOMAINS


def display_name_from_email(email):
    local_part = normalize_email(email).split("@", 1)[0]
    cleaned = re.sub(r"[._-]+", " ", local_part).strip()
    return cleaned.title() or "Farmer"


def load_accounts():
    accounts = {}
    with get_db_connection() as connection:
        rows = connection.execute("SELECT email, name, password_hash, created_at FROM users").fetchall()
    for row in rows:
        accounts[row["email"]] = {
            "email": row["email"],
            "name": row["name"],
            "password_hash": row["password_hash"],
            "created": row["created_at"],
        }
    return accounts


def save_accounts(data):
    with get_db_connection() as connection:
        for email, user in data.items():
            connection.execute(
                """
                INSERT INTO users (email, name, password_hash, created_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(email) DO UPDATE SET
                    name = excluded.name,
                    password_hash = excluded.password_hash,
                    created_at = excluded.created_at
                """,
                (email, user["name"], user["password_hash"], user["created"]),
            )


def get_history(name):
    email = normalize_email(name)
    with get_db_connection() as connection:
        rows = connection.execute(
            """
            SELECT message_type, message_text, created_at
            FROM chat_messages
            WHERE email = ?
            ORDER BY id ASC
            """,
            (email,),
        ).fetchall()
    return [{"type": row["message_type"], "text": row["message_text"], "time": row["created_at"]} for row in rows]


def append_history(name, messages):
    email = normalize_email(name)
    with get_db_connection() as connection:
        for message in messages:
            connection.execute(
                """
                INSERT INTO chat_messages (email, message_type, message_text, created_at)
                VALUES (?, ?, ?, ?)
                """,
                (email, message.get("type", "bot"), message.get("text", ""), int(message.get("time", time.time()))),
            )
        connection.execute(
            """
            DELETE FROM chat_messages
            WHERE id NOT IN (
                SELECT id FROM chat_messages
                WHERE email = ?
                ORDER BY id DESC
                LIMIT 80
            )
            AND email = ?
            """,
            (email, email),
        )
        rows = connection.execute(
            """
            SELECT message_type, message_text, created_at
            FROM chat_messages
            WHERE email = ?
            ORDER BY id ASC
            """,
            (email,),
        ).fetchall()
    return [{"type": row["message_type"], "text": row["message_text"], "time": row["created_at"]} for row in rows]


def register_user(payload):
    email = normalize_email(payload.get("email", ""))
    password = str(payload.get("password", "")).strip()
    if not is_allowed_email(email):
        return {"ok": False, "error": "Use a valid Gmail address like name@gmail.com."}
    if len(password) < 4:
        return {"ok": False, "error": "Password must be at least 4 characters."}

    display_name = display_name_from_email(email)
    password_hash = hash_password(password)
    created_at = int(time.time())
    with get_db_connection() as connection:
        existing = connection.execute("SELECT 1 FROM users WHERE email = ?", (email,)).fetchone()
        if existing:
            return {"ok": False, "error": "This email id is already registered."}
        connection.execute(
            "INSERT INTO users (email, name, password_hash, created_at) VALUES (?, ?, ?, ?)",
            (email, display_name, password_hash, created_at),
        )
    return {"ok": True, "user": {"email": email, "name": display_name}, "message": "Account created."}


def login_user(payload):
    email = normalize_email(payload.get("email", ""))
    password = str(payload.get("password", "")).strip()
    if not is_allowed_email(email):
        return {"ok": False, "error": "Use a valid Gmail address like name@gmail.com."}
    if len(password) < 4:
        return {"ok": False, "error": "Password must be at least 4 characters."}

    with get_db_connection() as connection:
        account = connection.execute(
            "SELECT email, name, password_hash FROM users WHERE email = ?",
            (email,),
        ).fetchone()
    if not account:
        return {"ok": False, "error": "Incorrect mail id."}
    if not verify_password(password, account["password_hash"]):
        return {"ok": False, "error": "Incorrect password."}

    return {
        "ok": True,
        "user": {"email": account["email"], "name": account["name"] or display_name_from_email(email)},
        "message": "Login successful.",
    }


def crop_recommendation(values):
    cleaned = {}
    for key in FEATURE_RANGES:
        try:
            cleaned[key] = float(values.get(key, 0))
        except (TypeError, ValueError):
            cleaned[key] = 0.0

    ranked = []
    for crop, profile in CROP_PROFILES.items():
        distance = 0.0
        for feature, scale in FEATURE_RANGES.items():
            diff = (cleaned[feature] - profile[feature]) / scale
            distance += diff * diff
        suitability = max(0.0, 100 * math.exp(-2.2 * distance))
        ranked.append((suitability, crop, profile))

    ranked.sort(reverse=True)
    best_score, best_crop, profile = ranked[0]
    alternatives = [{"crop": crop, "score": round(score, 1)} for score, crop, _ in ranked[1:4]]

    advice = []
    if cleaned["ph"] < profile["ph"] - 0.6:
        advice.append("soil is more acidic than ideal, consider lime after a soil test")
    elif cleaned["ph"] > profile["ph"] + 0.6:
        advice.append("soil is more alkaline than ideal, add organic matter and verify pH")
    if cleaned["moisture"] < profile["moisture"] - 12:
        advice.append("increase irrigation or mulch to retain moisture")
    elif cleaned["moisture"] > profile["moisture"] + 12:
        advice.append("improve drainage and avoid excess watering")
    if cleaned["nitrogen"] < profile["nitrogen"] - 18:
        advice.append("nitrogen is low for this crop, plan balanced fertilization")

    if not advice:
        advice.append("soil values closely match the crop profile; maintain balanced fertilizer and regular monitoring")

    return {
        "crop": best_crop,
        "confidence": round(best_score, 1),
        "alternatives": alternatives,
        "advice": ". ".join(advice).capitalize() + ".",
        "model": "Local crop suitability scorer, XGBoost-ready API",
    }


def analyze_leaf_image(data_url):
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    image_bytes = base64.b64decode(data_url)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((640, 640))

    arr = np.asarray(image).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    total = arr.shape[0] * arr.shape[1]
    green_mask = (g > r * 1.04) & (g > b * 1.04)
    yellow_mask = (r > 95) & (g > 85) & (b < 95) & (np.abs(r - g) < 70)
    brown_mask = (r > 70) & (g > 35) & (g < 120) & (b < 90) & (r > b * 1.25)
    dark_mask = (r + g + b) < 115

    green_ratio = float(green_mask.sum() / total)
    yellow_ratio = float(yellow_mask.sum() / total)
    brown_ratio = float(brown_mask.sum() / total)
    dark_ratio = float(dark_mask.sum() / total)

    gray = np.asarray(image.convert("L")).astype(np.float32)
    texture = float(gray.std())
    brightness = float(gray.mean())
    color_spread = float(np.mean(ImageStat.Stat(image).stddev))

    disease_pressure = min(98.0, (yellow_ratio * 165) + (brown_ratio * 220) + (dark_ratio * 70) + max(0, texture - 42) * 0.65)

    if brown_ratio > 0.13 and texture > 45:
        disease = "Leaf blight / necrotic spot risk"
        treatment = "Remove infected leaves, avoid overhead irrigation, improve airflow and apply a recommended copper or mancozeb fungicide after local expert confirmation."
    elif yellow_ratio > 0.18:
        disease = "Yellowing / nutrient stress risk"
        treatment = "Check nitrogen and magnesium levels, inspect for sucking pests, maintain even watering and remove severely affected leaves."
    elif dark_ratio > 0.22 and brightness < 95:
        disease = "Fungal infection risk"
        treatment = "Keep foliage dry, increase spacing, remove infected debris and use a suitable fungicide if symptoms spread."
    elif green_ratio > 0.45 and disease_pressure < 35:
        disease = "Healthy or low visible disease"
        treatment = "No serious visual disease pattern detected. Continue monitoring, keep leaves dry and maintain balanced nutrition."
    else:
        disease = "Mixed stress symptoms"
        treatment = "Symptoms are not specific. Check soil moisture, inspect for insects and upload a close, well-lit leaf photo for a clearer result."

    affected_area = min(100.0, (yellow_ratio * 100) + (brown_ratio * 100) + (dark_ratio * 45))
    if disease_pressure >= 70:
        severity_band = "High"
    elif disease_pressure >= 45:
        severity_band = "Moderate"
    else:
        severity_band = "Low"

    return {
        "prediction": disease,
        "confidence": round(max(54.0, min(96.0, disease_pressure if disease_pressure > 35 else 100 - disease_pressure)), 1),
        "treatment": treatment,
        "impact": {
            "severityScore": round(min(100.0, max(0.0, disease_pressure)), 1),
            "affectedArea": round(max(0.0, affected_area), 1),
            "healthyArea": round(max(0.0, green_ratio * 100), 1),
            "severityBand": severity_band,
        },
        "metrics": {
            "green": round(green_ratio * 100, 1),
            "yellow": round(yellow_ratio * 100, 1),
            "brown": round(brown_ratio * 100, 1),
            "dark": round(dark_ratio * 100, 1),
            "texture": round(texture, 1),
            "brightness": round(brightness, 1),
            "colorSpread": round(color_spread, 1),
        },
        "model": "Local ResNet-ready image analysis API",
    }


def analyze_soil_image(data_url):
    if "," in data_url:
        data_url = data_url.split(",", 1)[1]
    image_bytes = base64.b64decode(data_url)
    image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
    image.thumbnail((640, 640))

    arr = np.asarray(image).astype(np.float32)
    r, g, b = arr[:, :, 0], arr[:, :, 1], arr[:, :, 2]
    brightness = float(np.mean((r + g + b) / 3))
    color_spread = float(np.std((r + g + b) / 3))
    brown_ratio = float((((r > g * 0.95) & (g > b * 0.85) & (r > 45) & (g > 30))).sum() / (arr.shape[0] * arr.shape[1]))
    dark_ratio = float((((r + g + b) / 3) < 85).sum() / (arr.shape[0] * arr.shape[1]))
    red_brown_strength = float(np.mean(np.maximum(0, r - b)) / 255)

    moisture = 18 + (dark_ratio * 48) + ((1 - min(brightness / 210, 1)) * 24) + (brown_ratio * 12) - (red_brown_strength * 10)
    moisture = round(max(8, min(88, moisture)), 1)

    if moisture >= 72:
        category = "Wet soil"
        advice = "Soil appears highly moist. Choose water-loving crops and ensure drainage if standing water remains for long periods."
    elif moisture >= 52:
        category = "Moderately moist soil"
        advice = "Moisture looks suitable for many field crops. Maintain regular irrigation and mulch to keep the level stable."
    elif moisture >= 34:
        category = "Low to medium moisture"
        advice = "Soil may need scheduled irrigation before sowing. Drought-tolerant crops are safer if rainfall is uncertain."
    else:
        category = "Dry soil"
        advice = "Soil appears dry. Add organic matter, irrigate before planting and prefer drought-tolerant crops."

    extra_crops = {
        "Sorghum": {"moisture": 30, "water": "Low", "note": "Tolerates dry soil and uncertain rainfall."},
        "Taro": {"moisture": 82, "water": "High", "note": "Suitable where soil stays wet for longer periods."},
    }
    ranked_crops = []
    for crop, profile in CROP_PROFILES.items():
        diff = abs(moisture - profile["moisture"])
        ranked_crops.append(
            {
                "crop": crop,
                "targetMoisture": profile["moisture"],
                "suitability": round(max(35, min(98, 100 - (diff * 1.35))), 1),
                "waterNeed": "High" if profile["moisture"] >= 70 else "Medium" if profile["moisture"] >= 48 else "Low",
                "reason": f"Best around {profile['moisture']}% soil moisture; current image estimate is {moisture}%.",
            }
        )
    for crop, profile in extra_crops.items():
        diff = abs(moisture - profile["moisture"])
        ranked_crops.append(
            {
                "crop": crop,
                "targetMoisture": profile["moisture"],
                "suitability": round(max(35, min(98, 100 - (diff * 1.35))), 1),
                "waterNeed": profile["water"],
                "reason": profile["note"],
            }
        )

    ranked_crops.sort(key=lambda item: item["suitability"], reverse=True)
    possible_crops = ranked_crops[:6]
    moisture_targets = [item["targetMoisture"] for item in possible_crops]
    moisture_min = round(min(moisture_targets), 1)
    moisture_max = round(max(moisture_targets), 1)
    signs = [
        f"brightness {round(brightness, 1)}",
        f"dark area {round(dark_ratio * 100, 1)}%",
        f"brown soil area {round(brown_ratio * 100, 1)}%",
        f"texture score {round(color_spread, 1)}",
    ]

    return {
        "moisture": moisture,
        "category": category,
        "possibleCrops": possible_crops,
        "allCropNames": [item["crop"] for item in possible_crops],
        "advice": advice,
        "signs": ", ".join(signs),
        "moistureRange": {
            "min": moisture_min,
            "max": moisture_max,
            "ideal": round((moisture_min + moisture_max) / 2, 1),
        },
        "metrics": {
            "brightness": round(brightness, 1),
            "darkArea": round(dark_ratio * 100, 1),
            "brownArea": round(brown_ratio * 100, 1),
            "texture": round(color_spread, 1),
        },
        "model": "Local soil image moisture estimator",
    }


def chat_reply(message):
    text = message.strip().lower()
    for pattern, reply in CHAT_KNOWLEDGE:
        if re.search(pattern, text):
            return reply
    if len(text) < 4:
        return "Please enter a crop, soil or disease question and I will guide you."
    topic = summarize_chat_topic(text)
    if topic:
        return f'I did not find a direct rule for "{topic}". Share the crop name, visible symptoms, soil pH or moisture and I will narrow it down.'
    return "I can help with crop recommendation, soil health, irrigation, fertilizer and disease symptoms. For best results, share the crop name, visible symptoms, soil pH, moisture and recent weather."


class AgriBotHandler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_GET(self):
        path = urlparse(self.path).path
        if path == "/api/health":
            json_response(self, {"ok": True, "service": "KRISHISEV", "time": int(time.time())})
            return
        if path == "/":
            self.path = "/index.html"
        return super().do_GET()

    def do_POST(self):
        path = urlparse(self.path).path
        try:
            payload = read_json(self)
            if path == "/api/register":
                result = register_user(payload)
                json_response(self, result, 200 if result["ok"] else 400)
                return
            if path == "/api/signup":
                result = register_user(payload)
                json_response(self, result, 200 if result["ok"] else 400)
                return
            if path == "/api/login":
                result = login_user(payload)
                json_response(self, result, 200 if result["ok"] else 400)
                return
            if path == "/api/history":
                user_id = payload.get("email") or payload.get("farmer") or payload.get("name", "guest")
                json_response(self, {"history": get_history(user_id)})
                return
            if path == "/api/chat":
                message = str(payload.get("message", ""))
                user_id = payload.get("email") or payload.get("farmer") or payload.get("name", "guest")
                reply = chat_reply(message)
                now = int(time.time())
                history = append_history(
                    user_id,
                    [
                        {"type": "user", "text": message, "time": now},
                        {"type": "bot", "text": reply, "time": now},
                    ],
                )
                json_response(self, {"reply": reply, "history": history})
                return
            if path == "/api/crop":
                json_response(self, crop_recommendation(payload))
                return
            if path == "/api/disease":
                image_data = payload.get("image", "")
                if not image_data:
                    json_response(self, {"error": "Image is required."}, 400)
                    return
                json_response(self, analyze_leaf_image(image_data))
                return
            if path == "/api/soil":
                image_data = payload.get("image", "")
                if not image_data:
                    json_response(self, {"error": "Image is required."}, 400)
                    return
                json_response(self, analyze_soil_image(image_data))
                return
            json_response(self, {"error": "Unknown endpoint."}, 404)
        except Exception as exc:
            json_response(self, {"error": str(exc)}, 500)


if __name__ == "__main__":
    init_database()
    server = ThreadingHTTPServer((HOST, PORT), AgriBotHandler)
    print(f"KRISHISEV is running at http://{HOST}:{PORT}")
    print("Press Ctrl+C to stop the server.")
    server.serve_forever()
