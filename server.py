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
import os

import numpy as np
from PIL import Image, ImageStat


ROOT = Path(__file__).resolve().parent

def load_env():
    """Load keys from .env file into os.environ using pure Python standard library."""
    env_path = ROOT / ".env"
    if env_path.exists():
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" in line:
                        key, val = line.split("=", 1)
                        key = key.strip()
                        val = val.strip().strip('"').strip("'")
                        os.environ[key] = val
        except Exception as e:
            print(f"[KrishiSev] Error loading .env file: {e}")

load_env()
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
    # --- Crop rotation and intercropping ---
    (
        r"\b(crop rotation|rotate crops?|intercrop|intercropping|mixed crop)\b",
        "Crop rotation breaks pest and disease cycles, restores soil nutrients, and boosts yield. Rotate cereals with legumes (e.g., rice then chickpea) so nitrogen fixation replenishes the soil. Intercropping maize with beans or soybean is a proven combination for small farms.",
    ),
    # --- Composting and organic matter ---
    (
        r"\b(compost|composting|organic matter|vermicompost|farmyard manure|fym)\b",
        "Composting converts crop residues, cow dung and kitchen waste into nutrient-rich humus. Maintain a 3:1 carbon-to-nitrogen ratio, keep the heap moist but not soggy, and turn it every 2 weeks. Vermicomposting with earthworms gives ready compost in 45-60 days.",
    ),
    # --- Organic farming ---
    (
        r"\b(organic farming|organic certif|zero budget|natural farming|zbnf)\b",
        "Organic farming avoids synthetic chemicals and relies on compost, green manure, bio-fertilizers and biological pest control. Certification through agencies like APEDA or Jaivik Bharat adds market value. Zero Budget Natural Farming (ZBNF) uses jeevamrutha, beejamrutha and mulching to cut input costs.",
    ),
    # --- Greenhouse and polyhouse ---
    (
        r"\b(greenhouse|polyhouse|poly house|protected cultivation|net house)\b",
        "Greenhouse or polyhouse farming protects crops from extreme weather, pests and heavy rains. It is ideal for high-value vegetables, flowers and seedling nurseries. Government subsidies (NHM scheme) cover 50-65% of setup cost. Ventilation and temperature control are critical for success.",
    ),
    # --- Hydroponics and vertical farming ---
    (
        r"\b(hydropon|vertical farm|soilless|aeropon|nutrient film)\b",
        "Hydroponics grows plants in nutrient-rich water without soil, saving up to 90% water compared to field farming. Vertical farming stacks layers in a controlled environment. Popular crops include lettuce, herbs, strawberry and tomato. Initial investment is high but returns are strong near urban markets.",
    ),
    # --- Drip irrigation and sprinkler ---
    (
        r"\b(drip irrigation|sprinkler|micro.?irrigation|emitter|fertigation)\b",
        "Drip irrigation delivers water directly to roots, saving 30-60% water and boosting yield. Government subsidies under PMKSY cover 55-80% of cost. Fertigation (fertilizer through drip) improves nutrient uptake. Clean filters regularly to prevent emitter clogging.",
    ),
    # --- Mulching ---
    (
        r"\b(mulch|mulching|plastic mulch|straw mulch)\b",
        "Mulching with straw, dry leaves or plastic sheets conserves soil moisture, suppresses weeds and regulates soil temperature. Black plastic mulch works well for vegetables; organic mulch adds humus as it decomposes. Apply 5-10 cm thick organic mulch around plant bases.",
    ),
    # --- Companion planting ---
    (
        r"\b(companion plant|companion crop|trap crop|push.?pull)\b",
        "Companion planting uses beneficial plant combinations: marigold repels nematodes from tomatoes, basil deters whiteflies, and legumes fix nitrogen for neighbouring cereals. Trap cropping lures pests away from the main crop. The push-pull strategy with Napier grass and Desmodium works well for maize stem borers.",
    ),
    # --- Seed selection ---
    (
        r"\b(seed select|hybrid seed|open.?pollinat|heirloom|seed treat|seed rate)\b",
        "Choose certified seeds from ICAR-approved varieties. Hybrid seeds give higher yield but must be purchased each season. Open-pollinated and heirloom varieties allow seed saving. Treat seeds with Trichoderma or carbendazim before sowing to prevent seed-borne diseases.",
    ),
    # --- Harvest timing ---
    (
        r"\b(harvest tim|when to harvest|post.?harvest|storage loss|handling after harvest)\b",
        "Harvest at the right maturity stage to maximize quality and shelf life. For grains, moisture should be below 14% before storage. For fruits, use the color-break stage for distant markets. Post-harvest losses can be reduced by proper drying, grading, and cold-chain management.",
    ),
    # --- Soil testing ---
    (
        r"\b(soil test|soil analysis|soil sample|soil health card|shc)\b",
        "Collect soil samples from 15 cm depth at 8-10 random spots in the field, mix them and send 500g to your nearest Soil Health Card centre or KVK. Tests reveal pH, EC, organic carbon, N-P-K and micronutrients. Government provides free Soil Health Cards every 2 years under the SHC scheme.",
    ),
    # --- Crop storage and cold storage ---
    (
        r"\b(crop storage|cold storage|warehouse|grain storage|store grain|hermetic)\b",
        "Store grains in clean, dry, airtight containers or hermetic bags to prevent moisture and insect damage. Neem leaves between grain layers deter storage pests. For perishables, cold storage at 2-8°C extends shelf life. Government warehousing is available through FCI and state agencies.",
    ),
    # --- Government schemes ---
    (
        r"\b(pm.?kisan|government scheme|subsidy|crop insurance|pmfby|kcc|kisan credit|nabard|e.?nam)\b",
        "PM-KISAN provides Rs 6,000/year in 3 installments to eligible farmer families. PMFBY offers crop insurance at just 2% premium for Kharif and 1.5% for Rabi. KCC (Kisan Credit Card) gives short-term crop loans at 4% interest. Register on the eNAM portal to sell produce at the best market price nationwide.",
    ),
    # --- Organic pest control ---
    (
        r"\b(neem oil|bio.?pesticide|organic pest|trichoderma|beauveria|bt spray|panchagavya)\b",
        "Neem oil (3-5 ml/litre) controls sucking pests and fungal spores. Trichoderma viride protects roots from soil-borne fungi. Beauveria bassiana targets borers and beetles biologically. Panchagavya and Jeevamrutha boost plant immunity. Always spray in the evening to protect beneficial insects.",
    ),
    # --- Weed management ---
    (
        r"\b(weed|weeding|herbicide|weedicide|weed control|weed management)\b",
        "Control weeds early as they compete for nutrients and water. Use mulching, intercropping and timely hand-weeding for small fields. Pre-emergent herbicides should be applied on moist soil before weed germination. Avoid chemical herbicide drift on crop plants and always read label rates.",
    ),
    # --- Climate adaptation ---
    (
        r"\b(climate change|drought.?resist|flood.?tolerant|heat.?tolerant|climate adapt|weather risk)\b",
        "Choose climate-resilient varieties: drought-tolerant millets and sorghum, flood-tolerant rice (Swarna-Sub1), and heat-tolerant wheat (HD-3226). Diversify crops to spread weather risk. Rainwater harvesting, farm ponds and conservation agriculture reduce climate vulnerability.",
    ),
    # --- Seasonal planting calendar ---
    (
        r"\b(kharif|rabi|zaid|season|planting calendar|sowing time|monsoon crop|winter crop|summer crop)\b",
        "Kharif (June-Oct): rice, maize, soybean, cotton, groundnut with the monsoon. Rabi (Oct-Mar): wheat, mustard, gram, peas in the cool season. Zaid (Mar-Jun): watermelon, cucumber, moong dal in summer. Timely sowing within the first 2 weeks of the season window is critical for good yields.",
    ),
    # --- Plant nutrition deficiency ---
    (
        r"\b(iron deficiency|zinc deficiency|magnesium deficiency|calcium deficiency|boron deficiency|micro.?nutrient|deficiency symptom)\b",
        "Iron deficiency causes interveinal chlorosis on young leaves. Zinc deficiency shows as stunted growth with small, pale leaves. Magnesium deficiency yellows older leaves between veins. Calcium deficiency causes blossom-end rot in tomato and tip-burn in lettuce. Boron deficiency leads to hollow stems and poor fruit set. Apply foliar micro-nutrient sprays as a quick fix.",
    ),
    # --- Banana plantation ---
    (
        r"\b(banana|plantain|tissue culture banana|grand naine|cavendish)\b",
        "Banana grows best in well-drained loamy soil with pH 6.0-7.5 and regular irrigation. Use tissue culture plants (Grand Naine, G9) for uniform growth. Apply 200g N, 60g P, 300g K per plant per cycle. Protect from Panama wilt by using resistant varieties and avoiding infected soil.",
    ),
    # --- Mango ---
    (
        r"\b(mango|aam|alphonso|dasheri|langra)\b",
        "Mango trees need full sun, well-drained soil and pH 5.5-7.5. Prune after harvest to shape the canopy and improve fruiting. Apply paclobutrazol for off-season flowering. Common issues include anthracnose (copper spray), fruit fly (methyl eugenol traps) and mango hopper (neem oil during flowering).",
    ),
    # --- Coconut ---
    (
        r"\b(coconut|copra|nariyal|coir)\b",
        "Coconut palms thrive in coastal sandy loam with good drainage and 1500-2500 mm annual rainfall. Space trees 7.5m apart. Apply 500g urea, 700g bone meal and 1 kg potash per palm per year in two splits. Intercrop with cocoa, pineapple or banana for additional income from the same land.",
    ),
    # --- Tea ---
    (
        r"\b(tea plantation|tea garden|camellia sinensis|tea bush)\b",
        "Tea grows at elevations of 600-2000m in acidic soil (pH 4.5-5.5) with 1500-3000 mm well-distributed rainfall. Prune bushes regularly to maintain a flat plucking table. Apply shade trees like silver oak for filtered light. Two leaves and a bud picking gives the best quality.",
    ),
    # --- Coffee ---
    (
        r"\b(coffee|arabica|robusta|coffee plantation)\b",
        "Arabica coffee grows at higher altitudes (1000-1500m) in shade, while Robusta tolerates lower elevations and more sun. Maintain shade trees (silver oak, dadap) for 40-50% canopy cover. Coffee berry borer is the key pest; use Beauveria bassiana traps. Harvest only red-ripe cherries for premium quality.",
    ),
    # --- Rubber ---
    (
        r"\b(rubber|hevea|rubber plantation|latex tapping)\b",
        "Rubber (Hevea brasiliensis) needs 2000+ mm rainfall, deep well-drained soil and warm tropical climate. Trees are tapped for latex after 6-7 years using the S/2 d3 tapping system. RRII 105 and RRII 430 are high-yielding Indian clones. Intercrop with pineapple or banana during immature years.",
    ),
    # --- Mushroom cultivation ---
    (
        r"\b(mushroom|oyster mushroom|button mushroom|shiitake|mushroom spawn)\b",
        "Mushroom farming requires minimal space and water. Oyster mushrooms grow on wheat or paddy straw in 25-30°C; button mushrooms need composted substrate and cooler 16-22°C conditions. Maintain 80-90% humidity and good ventilation. A 10x10 ft room can produce 50-100 kg per cycle, making it highly profitable.",
    ),
    # --- Beekeeping and pollination ---
    (
        r"\b(beekeep|honey bee|apiculture|pollinator|pollination|bee colony)\b",
        "Beekeeping boosts crop yield through pollination and provides honey income. Place 2-5 hives per acre near flowering crops. Apis mellifera and Apis cerana indica are common species. Avoid spraying pesticides during flowering time. Government provides training and subsidies through the National Beekeeping and Honey Mission.",
    ),
    # --- Farm mechanization ---
    (
        r"\b(tractor|farm machine|mechaniz|harvester|rotavator|power tiller|thresher|transplanter)\b",
        "Farm mechanization saves labour and improves efficiency. Use a rotavator for field preparation, seed drill for precision sowing, and combine harvester for large-scale grain crops. Government subsidies under Sub-Mission on Agricultural Mechanization (SMAM) cover 40-50% of equipment cost for small farmers.",
    ),
    # --- Crop pricing and MSP ---
    (
        r"\b(msp|minimum support price|mandi|apmc|market price|crop price|e.?nam|selling price)\b",
        "MSP (Minimum Support Price) is announced by the government for 23 crops each season to protect farmers from price crashes. Sell at APMC mandis or register on eNAM for nationwide buyers. Check current MSP rates on the farmer.gov.in portal. Direct marketing and FPO aggregation often fetch 10-20% above MSP.",
    ),
    # --- Livestock integration ---
    (
        r"\b(livestock|dairy|cattle|goat|poultry|cow dung|integrated farming|fish.?farm|pisciculture)\b",
        "Integrating livestock with crops creates a circular farm economy: crop residues feed animals, cow dung and poultry litter enrich soil, and biogas from dung provides cooking fuel. Dairy with fodder crops, fish in farm ponds, and backyard poultry are low-investment models that diversify income and reduce risk.",
    ),
    # --- Wheat ---
    (
        r"\b(wheat|gehu|gehun)\b",
        "Wheat is a Rabi crop sown in November-December. It prefers cool winters, well-drained loamy soil and pH 6.0-7.5. Apply 120 kg N, 60 kg P, 40 kg K per hectare in splits. Timely sowing before December 15 is critical; late sowing reduces yield by 25-30 kg per hectare per day of delay.",
    ),
    # --- Sugarcane ---
    (
        r"\b(sugarcane|ganna)\b",
        "Sugarcane needs deep fertile soil, 1500-2500 mm water and 12-14 months to mature. Plant setts with 2-3 buds, apply 250 kg N per hectare in 3 splits, and use trash mulching to conserve moisture. Earthing up at 90 and 120 days supports tall canes. Watch for red rot and top borer.",
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


def call_llm(message):
    """Send a farming question to Gemini 2.0 Flash and return the reply text.

    The system prompt strictly limits answers to agricultural topics.
    Errors are printed to the server terminal for debugging.
    Returns None if the API call fails so callers can handle the fallback.
    """
    import urllib.request
    import json

    GEMINI_API_KEY = os.environ.get("GEMINI_API_KEY", "")

    system_prompt = (
        "You are KrishiSev, an expert agronomist and AI farming advisor for Indian farmers. "
        "You ONLY answer questions related to: farming, agriculture, crops, soil health, "
        "irrigation, fertilizers, pesticides, plant diseases, livestock, dairy, "
        "government farming schemes (PM-KISAN, PMFBY, MSP, eNAM, KCC), "
        "crop market prices, organic farming, plantation, and agricultural practices. "
        "If a question is NOT related to agriculture or farming, politely decline and redirect "
        "the user back to farming topics. "
        "Keep responses concise (2-5 sentences), practical, and written in simple language "
        "that is easy for a farmer to understand. "
        "Do not make up facts. If you are unsure, say so and suggest consulting a local agronomist."
    )

    data = {
        "contents": [
            {
                "parts": [
                    {
                        "text": f"{system_prompt}\n\nFarmer's Question: {message}"
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.4,
            "maxOutputTokens": 512
        }
    }

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key={GEMINI_API_KEY}"

    req = urllib.request.Request(
        url,
        data=json.dumps(data).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST"
    )

    try:
        with urllib.request.urlopen(req, timeout=25) as response:
            result = json.loads(response.read().decode("utf-8"))
            candidates = result.get("candidates", [])
            if not candidates:
                print("[KrishiSev] Gemini returned no candidates for message:", message[:80])
                return None
            return candidates[0]["content"]["parts"][0]["text"].strip()
    except Exception as exc:
        print(f"[KrishiSev] Gemini API error: {exc} | message: {message[:80]}")
        return None


def chat_reply(message):
    """Generate a reply for the chatbot.

    Routes ALL meaningful queries to the Gemini API first.
    Falls back to the local CHAT_KNOWLEDGE rules only when:
      - The message is a greeting (very short / hello pattern).
      - Gemini is unavailable (API error or rate limit).
    """
    text = message.strip().lower()

    # Short greeting shortcut — avoid burning API quota on one-word inputs
    if len(text) < 4:
        return "Please enter a crop, soil or disease question and I will guide you."

    # Greeting-only shortcut
    if re.match(r"^(hello|hi|hey|namaste|thanks|thank you|good morning|good evening)\.?\s*$", text):
        return "Hello! I am KrishiSev, your AI farming advisor. Ask me anything about crops, soil health, irrigation, fertilizers, plant diseases, or government farming schemes."

    # ── Primary path: Gemini API ──
    llm_reply = call_llm(message)
    if llm_reply:
        return llm_reply

    # ── Fallback: local CHAT_KNOWLEDGE rules (used only when Gemini is down) ──
    for pattern, reply in CHAT_KNOWLEDGE:
        if re.search(pattern, text):
            return reply + " (Note: AI assistant is temporarily unavailable — this is a cached response.)"

    return (
        "I'm having trouble connecting to the AI service right now. "
        "Please try again in a moment. In the meantime, I can help with crop recommendation, "
        "soil health, irrigation, fertilizers and disease symptoms — just share your crop name, "
        "soil pH, and visible symptoms."
    )


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
        if path == "/script.js":
            script_path = ROOT / "script.js"
            try:
                content = script_path.read_text(encoding="utf-8")
                firebase_key = os.environ.get("FIREBASE_API_KEY", "")
                content = content.replace("FIREBASE_API_KEY_PLACEHOLDER", firebase_key)
                self.send_response(200)
                self.send_header("Content-Type", "application/javascript; charset=utf-8")
                self.send_header("Cache-Control", "no-store")
                self.end_headers()
                self.wfile.write(content.encode("utf-8"))
                return
            except Exception as e:
                self.send_error(500, f"Error serving script.js: {e}")
                return
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
