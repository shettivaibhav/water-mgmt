import os

class Config:
    # ── MySQL ──────────────────────────────────────────────────
    MYSQL_HOST     = os.getenv("MYSQL_HOST",     "localhost")
    MYSQL_USER     = os.getenv("MYSQL_USER",     "root")
    MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "root")
    MYSQL_DB       = os.getenv("MYSQL_DB",       "water_mgmt")
    MYSQL_PORT     = int(os.getenv("MYSQL_PORT", 3306))

    # ── JWT ───────────────────────────────────────────────────
    JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", "super-secret-water-key-2024")
    JWT_EXPIRY_HOURS = 24

    # ── CORS ──────────────────────────────────────────────────
    CORS_ORIGINS = ["http://localhost:3000", "http://127.0.0.1:3000"]

    # ── Simulator ────────────────────────────────────────────
    SIMULATE_INTERVAL_SECONDS = 60       # how often simulator runs
    SIMULATE_MIN_LITERS       = 0.5      # min litres per tick
    SIMULATE_MAX_LITERS       = 3.0      # max litres per tick
