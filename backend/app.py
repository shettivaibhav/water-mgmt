"""
Smart Water Management – Flask REST API
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import mysql.connector
import bcrypt
import jwt
import datetime
import random
from functools import wraps
from config import Config

app = Flask(__name__)

# ── CORS: explicitly allow all methods so PUT/DELETE work from React ──
CORS(app,
     origins=Config.CORS_ORIGINS,
     methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
     allow_headers=["Content-Type", "Authorization"],
     supports_credentials=True)

@app.after_request
def add_cors_headers(response):
    """Safety net: ensure CORS headers are present on every response."""
    origin = request.headers.get("Origin", "")
    if origin in Config.CORS_ORIGINS:
        response.headers["Access-Control-Allow-Origin"]  = origin
        response.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        response.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return response

@app.errorhandler(Exception)
def handle_exception(e):
    """
    Catch ALL unhandled exceptions, log them clearly, and return a JSON 500
    with CORS headers — so the browser always sees the real error, not a
    misleading 'CORS blocked' message.
    """
    import traceback
    traceback.print_exc()          # prints full stack trace to Flask terminal
    origin = request.headers.get("Origin", "")
    resp = jsonify({"error": str(e), "type": type(e).__name__})
    resp.status_code = 500
    if origin in Config.CORS_ORIGINS:
        resp.headers["Access-Control-Allow-Origin"]  = origin
        resp.headers["Access-Control-Allow-Headers"] = "Content-Type, Authorization"
        resp.headers["Access-Control-Allow-Methods"] = "GET, POST, PUT, DELETE, OPTIONS"
    return resp

@app.route("/users/<int:user_id>/limits", methods=["OPTIONS"])
def limits_preflight(user_id):
    """Handle OPTIONS preflight for PUT /users/<id>/limits explicitly."""
    return jsonify({}), 200

# ─────────────────────────────────────────────────────────────
# AUTO-MIGRATION — runs once on startup, safe to re-run
# ─────────────────────────────────────────────────────────────

def run_migrations():
    """
    Adds any missing columns to the users table.
    Uses IF NOT EXISTS style checks so it's safe to run every time.
    """
    migrations = [
        # Check and add each new column individually
        ("people_count",
         "ALTER TABLE users ADD COLUMN people_count INT NOT NULL DEFAULT 1 AFTER password"),
        ("base_green_per_person",
         "ALTER TABLE users ADD COLUMN base_green_per_person FLOAT NOT NULL DEFAULT 100 AFTER people_count"),
        ("base_orange_per_person",
         "ALTER TABLE users ADD COLUMN base_orange_per_person FLOAT NOT NULL DEFAULT 200 AFTER base_green_per_person"),
    ]

    conn = get_db()
    cur  = conn.cursor(dictionary=True)

    # Get current columns
    cur.execute("SHOW COLUMNS FROM users")
    existing_cols = {row["Field"] for row in cur.fetchall()}

    for col_name, alter_sql in migrations:
        if col_name not in existing_cols:
            print(f"[MIGRATION] Adding column: {col_name}")
            cur.execute(alter_sql)
            conn.commit()
        else:
            print(f"[MIGRATION] Column already exists, skipping: {col_name}")

    # Drop old redundant columns if they still exist
    for old_col in ["green_limit", "orange_limit"]:
        if old_col in existing_cols:
            print(f"[MIGRATION] Dropping redundant column: {old_col}")
            cur.execute(f"ALTER TABLE users DROP COLUMN {old_col}")
            conn.commit()

    cur.close()
    conn.close()
    print("[MIGRATION] Done.")

# NOTE: run_migrations() and startup_catchup() are called at the bottom
# of the file, after get_db / query / helpers are all defined.

# ─────────────────────────────────────────────────────────────
# CORE ARCHIVE HELPER  (used by scheduler, startup, simulator)
# ─────────────────────────────────────────────────────────────

def _do_archive_for_date(archive_date):
    """
    Archives tap_usage_running values into tap_daily_archive and
    system_daily_totals for the given date.
    Does NOT reset tap_usage_running — caller decides when to reset.
    Safe to call multiple times for the same date (upsert).
    """
    all_taps = query("SELECT tap_id, user_id FROM taps")

    for tap in all_taps:
        tap_id = tap["tap_id"]

        running = query(
            "SELECT current_usage FROM tap_usage_running WHERE tap_id=%s",
            (tap_id,), fetch="one",
        )
        usage = float(running["current_usage"]) if running else 0.0

        existing_arch = query(
            "SELECT id FROM tap_daily_archive WHERE tap_id=%s AND archive_date=%s",
            (tap_id, archive_date), fetch="one",
        )
        if existing_arch:
            query(
                "UPDATE tap_daily_archive SET usage_liters=%s WHERE tap_id=%s AND archive_date=%s",
                (usage, tap_id, archive_date), commit=True,
            )
        else:
            query(
                "INSERT INTO tap_daily_archive (tap_id, usage_liters, archive_date) VALUES (%s,%s,%s)",
                (tap_id, usage, archive_date), commit=True,
            )

    # Update system_daily_totals per user
    users = query("SELECT DISTINCT user_id FROM taps")
    for u in users:
        uid = u["user_id"]
        total_row = query(
            """
            SELECT COALESCE(SUM(a.usage_liters),0) AS total
            FROM   tap_daily_archive a
            JOIN   taps t ON t.tap_id = a.tap_id
            WHERE  t.user_id=%s AND a.archive_date=%s
            """,
            (uid, archive_date), fetch="one",
        )
        total = float(total_row["total"]) if total_row else 0.0

        try:
            limits = query(
                "SELECT people_count, base_green_per_person, base_orange_per_person FROM users WHERE user_id=%s",
                (uid,), fetch="one",
            )
        except Exception:
            limits = None
        green_limit, orange_limit = calc_limits(
            limits or {"people_count":1,"base_green_per_person":100,"base_orange_per_person":200}
        )
        color = get_color(total, green_limit, orange_limit)

        existing_tot = query(
            "SELECT id FROM system_daily_totals WHERE user_id=%s AND usage_date=%s",
            (uid, archive_date), fetch="one",
        )
        if existing_tot:
            query(
                "UPDATE system_daily_totals SET total_usage=%s, color_status=%s WHERE user_id=%s AND usage_date=%s",
                (total, color, uid, archive_date), commit=True,
            )
        else:
            query(
                "INSERT INTO system_daily_totals (user_id, total_usage, color_status, usage_date) VALUES (%s,%s,%s,%s)",
                (uid, total, color, archive_date), commit=True,
            )


def _reset_running_totals():
    """Zero out tap_usage_running after archiving."""
    query("UPDATE tap_usage_running SET current_usage=0.0, last_update=NOW()", commit=True)


# ─────────────────────────────────────────────────────────────
# STARTUP CATCHUP — fixes missed midnight archives
# ─────────────────────────────────────────────────────────────

def startup_catchup():
    """
    Runs every time Flask starts.

    1. Checks tap_usage_running.last_update — if any tap has data from a
       PREVIOUS day, it archives that data for the correct past date and
       resets the running counter to 0 so today starts fresh.

    2. Fills in system_daily_totals for any dates that are in
       tap_daily_archive but missing from system_daily_totals (e.g. server
       was off when scheduler tried to run).
    """
    today = datetime.date.today()
    print("[STARTUP] Running catchup check…")

    # ── Step 1: Find stale running totals from previous days ─────────────
    stale_rows = query(
        """
        SELECT r.tap_id, r.current_usage, DATE(r.last_update) AS usage_date
        FROM   tap_usage_running r
        WHERE  DATE(r.last_update) < %s
          AND  r.current_usage > 0
        """,
        (today,),
    )

    if stale_rows:
        print(f"[STARTUP] Found {len(stale_rows)} tap(s) with un-archived data from previous days.")

        # Group by date so we archive each past date once
        dates_to_archive = set(r["usage_date"] for r in stale_rows)
        for past_date in sorted(dates_to_archive):
            print(f"[STARTUP] Archiving missed date: {past_date}")
            _do_archive_for_date(past_date)

        # Reset running totals so today starts from 0
        _reset_running_totals()
        print("[STARTUP] Running totals reset to 0 for today.")
    else:
        print("[STARTUP] No stale running data found.")

    # ── Step 2: Backfill system_daily_totals for any orphaned archive rows ─
    orphaned = query(
        """
        SELECT DISTINCT a.archive_date
        FROM   tap_daily_archive a
        JOIN   taps t ON t.tap_id = a.tap_id
        WHERE  a.archive_date < %s
          AND  NOT EXISTS (
              SELECT 1 FROM system_daily_totals s
              WHERE  s.user_id = t.user_id AND s.usage_date = a.archive_date
          )
        ORDER  BY a.archive_date
        """,
        (today,),
    )
    if orphaned:
        print(f"[STARTUP] Backfilling system_daily_totals for {len(orphaned)} missing date(s).")
        for row in orphaned:
            d = row["archive_date"]
            users = query("SELECT DISTINCT user_id FROM taps")
            for u in users:
                uid = u["user_id"]
                total_row = query(
                    """
                    SELECT COALESCE(SUM(a.usage_liters),0) AS total
                    FROM   tap_daily_archive a
                    JOIN   taps t ON t.tap_id = a.tap_id
                    WHERE  t.user_id=%s AND a.archive_date=%s
                    """,
                    (uid, d), fetch="one",
                )
                total = float(total_row["total"]) if total_row else 0.0
                try:
                    limits = query(
                        "SELECT people_count, base_green_per_person, base_orange_per_person FROM users WHERE user_id=%s",
                        (uid,), fetch="one",
                    )
                except Exception:
                    limits = None
                gl, ol = calc_limits(limits or {"people_count":1,"base_green_per_person":100,"base_orange_per_person":200})
                color = get_color(total, gl, ol)
                existing = query(
                    "SELECT id FROM system_daily_totals WHERE user_id=%s AND usage_date=%s",
                    (uid, d), fetch="one",
                )
                if not existing:
                    query(
                        "INSERT INTO system_daily_totals (user_id, total_usage, color_status, usage_date) VALUES (%s,%s,%s,%s)",
                        (uid, total, color, d), commit=True,
                    )
            print(f"[STARTUP]   ✓ {d}")
    else:
        print("[STARTUP] system_daily_totals is up to date.")

    print("[STARTUP] Catchup complete.")


with app.app_context():
    try:
        startup_catchup()
    except Exception as e:
        print(f"[STARTUP] Warning: {e}")

# ─────────────────────────────────────────────────────────────
# DB helpers
# ─────────────────────────────────────────────────────────────

def get_db():
    return mysql.connector.connect(
        host     = Config.MYSQL_HOST,
        user     = Config.MYSQL_USER,
        password = Config.MYSQL_PASSWORD,
        database = Config.MYSQL_DB,
        port     = Config.MYSQL_PORT,
        autocommit=False,
    )

def query(sql, params=None, fetch="all", commit=False):
    conn = get_db()
    cur  = conn.cursor(dictionary=True)
    cur.execute(sql, params or ())
    if commit:
        conn.commit()
        result = cur.lastrowid
    elif fetch == "one":
        result = cur.fetchone()
    else:
        result = cur.fetchall()
    cur.close()
    conn.close()
    return result

# ─────────────────────────────────────────────────────────────
# JWT auth decorator
# ─────────────────────────────────────────────────────────────

def token_required(f):
    @wraps(f)
    def wrapper(*args, **kwargs):
        token = None
        auth  = request.headers.get("Authorization", "")
        if auth.startswith("Bearer "):
            token = auth.split(" ")[1]
        if not token:
            return jsonify({"error": "Token missing"}), 401
        try:
            data = jwt.decode(token, Config.JWT_SECRET_KEY, algorithms=["HS256"])
            kwargs["current_user_id"] = data["user_id"]
        except jwt.ExpiredSignatureError:
            return jsonify({"error": "Token expired"}), 401
        except Exception:
            return jsonify({"error": "Invalid token"}), 401
        return f(*args, **kwargs)
    return wrapper

def make_token(user_id):
    payload = {
        "user_id": user_id,
        "exp": datetime.datetime.utcnow() + datetime.timedelta(hours=Config.JWT_EXPIRY_HOURS),
    }
    return jwt.encode(payload, Config.JWT_SECRET_KEY, algorithm="HS256")

# ─────────────────────────────────────────────────────────────
# Color status helper
# ─────────────────────────────────────────────────────────────

def get_color(total, green_limit, orange_limit):
    if total < green_limit:
        return "green"
    elif total < orange_limit:
        return "orange"
    return "red"

def calc_limits(user):
    """Derive green/orange limits from stored base-per-person × people_count."""
    people = user.get("people_count", 1) or 1
    green  = round((user.get("base_green_per_person",  100) or 100) * people, 2)
    orange = round((user.get("base_orange_per_person", 200) or 200) * people, 2)
    return green, orange

# ─────────────────────────────────────────────────────────────
# AUTH endpoints
# ─────────────────────────────────────────────────────────────

@app.route("/register", methods=["POST"])
def register():
    data        = request.get_json()
    name        = data.get("name", "").strip()
    email       = data.get("email", "").strip().lower()
    pwd         = data.get("password", "")
    people      = max(1, int(data.get("people_count", 1)))
    base_green  = float(data.get("base_green_per_person",  100))
    base_orange = float(data.get("base_orange_per_person", 200))

    if not name or not email or not pwd:
        return jsonify({"error": "All fields required"}), 400
    if base_green >= base_orange:
        return jsonify({"error": "Green limit must be less than orange limit"}), 400

    existing = query("SELECT user_id FROM users WHERE email=%s", (email,), fetch="one")
    if existing:
        return jsonify({"error": "Email already registered"}), 409

    hashed  = bcrypt.hashpw(pwd.encode(), bcrypt.gensalt()).decode()
    user_id = query(
        """INSERT INTO users
           (name, email, password, people_count, base_green_per_person, base_orange_per_person)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (name, email, hashed, people, base_green, base_orange),
        commit=True,
    )
    token = make_token(user_id)
    return jsonify({"message": "Registered", "token": token, "user_id": user_id, "name": name}), 201


@app.route("/login", methods=["POST"])
def login():
    data  = request.get_json()
    email = data.get("email", "").strip().lower()
    pwd   = data.get("password", "")

    user = query("SELECT * FROM users WHERE email=%s", (email,), fetch="one")
    if not user or not bcrypt.checkpw(pwd.encode(), user["password"].encode()):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["user_id"])
    return jsonify({
        "token":   token,
        "user_id": user["user_id"],
        "name":    user["name"],
        "email":   user["email"],
    })

# ─────────────────────────────────────────────────────────────
# USER endpoints
# ─────────────────────────────────────────────────────────────

@app.route("/users/<int:user_id>", methods=["GET"])
@token_required
def get_user(user_id, current_user_id):
    try:
        user = query(
            """SELECT user_id, name, email,
                      people_count, base_green_per_person, base_orange_per_person,
                      created_at
               FROM users WHERE user_id=%s""",
            (user_id,), fetch="one",
        )
    except Exception as e:
        if "Unknown column" in str(e):
            # Columns not migrated yet — fall back to defaults
            user = query(
                "SELECT user_id, name, email, created_at FROM users WHERE user_id=%s",
                (user_id,), fetch="one",
            )
            if user:
                user["people_count"]           = 1
                user["base_green_per_person"]  = 100.0
                user["base_orange_per_person"] = 200.0
        else:
            raise
    if not user:
        return jsonify({"error": "User not found"}), 404
    green_limit, orange_limit = calc_limits(user)
    return jsonify({**user, "green_limit": green_limit, "orange_limit": orange_limit})


@app.route("/users/<int:user_id>/limits", methods=["PUT"])
@token_required
def update_limits(user_id, current_user_id):
    data        = request.get_json()
    people      = max(1, int(data.get("people_count", 1)))
    base_green  = float(data.get("base_green_per_person",  100))
    base_orange = float(data.get("base_orange_per_person", 200))

    if base_green >= base_orange:
        return jsonify({"error": "Green limit per person must be less than Orange limit per person"}), 400

    try:
        query(
            """UPDATE users
               SET people_count=%s, base_green_per_person=%s, base_orange_per_person=%s
               WHERE user_id=%s""",
            (people, base_green, base_orange, user_id),
            commit=True,
        )
    except Exception as e:
        err = str(e)
        if "Unknown column" in err:
            return jsonify({
                "error": "DB migration not run. Open MySQL Workbench and execute:\n\n"
                         "ALTER TABLE users\n"
                         "  ADD COLUMN people_count INT NOT NULL DEFAULT 1 AFTER password,\n"
                         "  ADD COLUMN base_green_per_person FLOAT NOT NULL DEFAULT 100 AFTER people_count,\n"
                         "  ADD COLUMN base_orange_per_person FLOAT NOT NULL DEFAULT 200 AFTER base_green_per_person;"
            }), 500
        raise

    green_limit  = round(base_green  * people, 2)
    orange_limit = round(base_orange * people, 2)
    return jsonify({
        "message":      "Limits updated",
        "people_count": people,
        "green_limit":  green_limit,
        "orange_limit": orange_limit,
    })

# ─────────────────────────────────────────────────────────────
# TAP endpoints
# ─────────────────────────────────────────────────────────────

@app.route("/add-tap", methods=["POST"])
@token_required
def add_tap(current_user_id):
    data     = request.get_json()
    user_id  = data.get("user_id")
    tap_name = data.get("tap_name", "").strip()
    location = data.get("location", "General").strip()

    if not tap_name:
        return jsonify({"error": "tap_name required"}), 400

    tap_id = query(
        "INSERT INTO taps (user_id, tap_name, location) VALUES (%s,%s,%s)",
        (user_id, tap_name, location), commit=True,
    )
    # initialise running record
    query(
        "INSERT INTO tap_usage_running (tap_id, current_usage) VALUES (%s, 0.0)",
        (tap_id,), commit=True,
    )
    return jsonify({"message": "Tap added", "tap_id": tap_id}), 201


@app.route("/taps/<int:user_id>", methods=["GET"])
@token_required
def get_taps(user_id, current_user_id):
    taps = query(
        """
        SELECT t.tap_id, t.tap_name, t.location, t.tap_status,
               COALESCE(r.current_usage, 0) AS current_usage,
               r.last_update
        FROM   taps t
        LEFT JOIN tap_usage_running r ON r.tap_id = t.tap_id
        WHERE  t.user_id = %s
        ORDER BY t.tap_id
        """,
        (user_id,),
    )
    return jsonify(taps)


@app.route("/tap-on/<int:tap_id>", methods=["POST"])
@token_required
def tap_on(tap_id, current_user_id):
    query("UPDATE taps SET tap_status='ON' WHERE tap_id=%s", (tap_id,), commit=True)
    return jsonify({"message": f"Tap {tap_id} turned ON"})


@app.route("/tap-off/<int:tap_id>", methods=["POST"])
@token_required
def tap_off(tap_id, current_user_id):
    query("UPDATE taps SET tap_status='OFF' WHERE tap_id=%s", (tap_id,), commit=True)
    return jsonify({"message": f"Tap {tap_id} turned OFF"})


@app.route("/delete-tap/<int:tap_id>", methods=["DELETE"])
@token_required
def delete_tap(tap_id, current_user_id):
    query("DELETE FROM taps WHERE tap_id=%s", (tap_id,), commit=True)
    return jsonify({"message": "Tap deleted"})

# ─────────────────────────────────────────────────────────────
# DASHBOARD endpoint
# ─────────────────────────────────────────────────────────────

@app.route("/dashboard/<int:user_id>", methods=["GET"])
@token_required
def dashboard(user_id, current_user_id):
    try:
        user = query(
            "SELECT people_count, base_green_per_person, base_orange_per_person FROM users WHERE user_id=%s",
            (user_id,), fetch="one",
        )
    except Exception as e:
        if "Unknown column" in str(e):
            user = {"people_count": 1, "base_green_per_person": 100.0, "base_orange_per_person": 200.0}
        else:
            raise
    if not user:
        return jsonify({"error": "User not found"}), 404
    green_limit, orange_limit = calc_limits(user)

    today        = datetime.date.today()
    yesterday    = today - datetime.timedelta(days=1)

    # Today's total running usage across all taps
    today_total = query(
        """
        SELECT COALESCE(SUM(r.current_usage), 0) AS total
        FROM   tap_usage_running r
        JOIN   taps t ON t.tap_id = r.tap_id
        WHERE  t.user_id = %s
        """,
        (user_id,), fetch="one",
    )["total"]

    # Yesterday archived total
    yesterday_total = query(
        "SELECT COALESCE(total_usage, 0) AS total FROM system_daily_totals WHERE user_id=%s AND usage_date=%s",
        (user_id, yesterday), fetch="one",
    )
    yesterday_total = yesterday_total["total"] if yesterday_total else 0

    # Per-tap running usage
    tap_usage = query(
        """
        SELECT t.tap_id, t.tap_name, t.location, t.tap_status,
               COALESCE(r.current_usage, 0) AS usage_today
        FROM   taps t
        LEFT JOIN tap_usage_running r ON r.tap_id = t.tap_id
        WHERE  t.user_id = %s
        ORDER BY t.tap_id
        """,
        (user_id,),
    )

    color = get_color(today_total, green_limit, orange_limit)

    change_pct = 0
    if yesterday_total > 0:
        change_pct = round(((today_total - yesterday_total) / yesterday_total) * 100, 1)

    return jsonify({
        "today_total":     round(today_total, 2),
        "yesterday_total": round(yesterday_total, 2),
        "color_status":    color,
        "green_limit":     green_limit,
        "orange_limit":    orange_limit,
        "change_pct":      change_pct,
        "tap_usage":       tap_usage,
    })

# ─────────────────────────────────────────────────────────────
# ANALYTICS / REPORTS endpoints
# ─────────────────────────────────────────────────────────────

@app.route("/usage-timeseries/<int:user_id>", methods=["GET"])
@token_required
def usage_timeseries(user_id, current_user_id):
    hours = int(request.args.get("hours", 24))
    rows  = query(
        """
        SELECT ts.tap_id, t.tap_name,
               SUM(ts.usage_liters) AS usage_liters,
               DATE_FORMAT(ts.recorded_at, '%%Y-%%m-%%d %%H:%%i:00') AS bucket
        FROM   tap_usage_timeseries ts
        JOIN   taps t ON t.tap_id = ts.tap_id
        WHERE  t.user_id = %s
          AND  ts.recorded_at >= NOW() - INTERVAL %s HOUR
        GROUP  BY ts.tap_id, t.tap_name, bucket
        ORDER  BY bucket ASC
        """,
        (user_id, hours),
    )
    return jsonify(rows)


@app.route("/daily-usage/<int:user_id>", methods=["GET"])
@token_required
def daily_usage(user_id, current_user_id):
    days = int(request.args.get("days", 30))

    # ── Past archived days (excludes today) ───────────────────
    archived = query(
        """
        SELECT usage_date AS date, total_usage, color_status
        FROM   system_daily_totals
        WHERE  user_id = %s
          AND  usage_date >= CURDATE() - INTERVAL %s DAY
          AND  usage_date < CURDATE()
        ORDER  BY usage_date ASC
        """,
        (user_id, days),
    )

    # ── Today's live running total ────────────────────────────
    today_row = query(
        """
        SELECT COALESCE(SUM(r.current_usage), 0) AS total
        FROM   tap_usage_running r
        JOIN   taps t ON t.tap_id = r.tap_id
        WHERE  t.user_id = %s
        """,
        (user_id,), fetch="one",
    )
    today_total = today_row["total"] if today_row else 0

    try:
        user = query(
            "SELECT people_count, base_green_per_person, base_orange_per_person FROM users WHERE user_id=%s",
            (user_id,), fetch="one",
        )
    except Exception:
        user = {"people_count":1,"base_green_per_person":100,"base_orange_per_person":200}

    green_limit, orange_limit = calc_limits(user or {"people_count":1,"base_green_per_person":100,"base_orange_per_person":200})
    today_color = get_color(today_total, green_limit, orange_limit)

    # Merge: archived history + today live
    result = list(archived) + [{
        "date":         str(datetime.date.today()),
        "total_usage":  round(today_total, 2),
        "color_status": today_color,
        "is_live":      True,   # flag so frontend can mark it
    }]

    return jsonify(result)


@app.route("/usage-by-tap/<int:user_id>", methods=["GET"])
@token_required
def usage_by_tap(user_id, current_user_id):
    days = int(request.args.get("days", 7))

    # ── Archived past days (excludes today) ───────────────────
    archived = query(
        """
        SELECT t.tap_id, t.tap_name, t.location,
               COALESCE(SUM(a.usage_liters), 0) AS archived_usage
        FROM   taps t
        LEFT JOIN tap_daily_archive a
               ON a.tap_id = t.tap_id
              AND a.archive_date >= CURDATE() - INTERVAL %s DAY
              AND a.archive_date < CURDATE()
        WHERE  t.user_id = %s
        GROUP  BY t.tap_id, t.tap_name, t.location
        """,
        (days, user_id),
    )

    # ── Today's live running usage ────────────────────────────
    live = query(
        """
        SELECT t.tap_id, COALESCE(r.current_usage, 0) AS live_usage
        FROM   taps t
        LEFT JOIN tap_usage_running r ON r.tap_id = t.tap_id
        WHERE  t.user_id = %s
        """,
        (user_id,),
    )
    live_map = {row["tap_id"]: row["live_usage"] for row in live}

    # Combine: archived + today's live
    result = []
    for row in archived:
        total = round((row["archived_usage"] or 0) + (live_map.get(row["tap_id"], 0) or 0), 2)
        result.append({
            "tap_name":    row["tap_name"],
            "location":    row["location"],
            "total_usage": total,
        })

    result.sort(key=lambda x: x["total_usage"], reverse=True)
    return jsonify(result)


@app.route("/export-csv/<int:user_id>", methods=["GET"])
@token_required
def export_csv(user_id, current_user_id):
    import io, csv
    from flask import Response

    days = int(request.args.get("days", 30))
    rows = query(
        """
        SELECT a.archive_date, t.tap_name, t.location, a.usage_liters
        FROM   tap_daily_archive a
        JOIN   taps t ON t.tap_id = a.tap_id
        WHERE  t.user_id = %s
          AND  a.archive_date >= CURDATE() - INTERVAL %s DAY
        ORDER  BY a.archive_date DESC, t.tap_name
        """,
        (user_id, days),
    )

    buf = io.StringIO()
    writer = csv.DictWriter(buf, fieldnames=["archive_date","tap_name","location","usage_liters"])
    writer.writeheader()
    writer.writerows(rows)

    return Response(
        buf.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=water_usage.csv"},
    )

# ─────────────────────────────────────────────────────────────
# SIMULATE USAGE (manual trigger / called by simulator.py)
# ─────────────────────────────────────────────────────────────

@app.route("/simulate-usage", methods=["POST"])
def simulate_usage():
    """
    Add random usage to all ON taps.
    Also auto-archives and resets if the calendar date has changed since
    the last simulator tick (handles midnight without the scheduler running).
    """
    today = datetime.date.today()

    # ── Day-rollover check ────────────────────────────────────────────────
    # If any tap has running data from a previous date, archive that date
    # first and reset, so today always starts from 0.
    stale = query(
        """
        SELECT tap_id, current_usage, DATE(last_update) AS last_date
        FROM   tap_usage_running
        WHERE  DATE(last_update) < %s AND current_usage > 0
        """,
        (today,),
    )
    if stale:
        past_dates = set(r["last_date"] for r in stale)
        for past_date in sorted(past_dates):
            print(f"[SIMULATE] Day rollover detected — archiving {past_date}")
            _do_archive_for_date(past_date)
        _reset_running_totals()
        print(f"[SIMULATE] Reset complete. Today ({today}) starts from 0.")

    # ── Normal simulation ─────────────────────────────────────────────────
    on_taps = query("SELECT tap_id FROM taps WHERE tap_status='ON'")

    if not on_taps:
        return jsonify({"message": "Simulated 0 tap(s) — no taps are ON", "taps_on": 0})

    for row in on_taps:
        tap_id = row["tap_id"]
        amount = round(random.uniform(Config.SIMULATE_MIN_LITERS, Config.SIMULATE_MAX_LITERS), 3)

        query(
            "INSERT INTO tap_usage_timeseries (tap_id, usage_liters) VALUES (%s, %s)",
            (tap_id, amount), commit=True,
        )

        existing = query(
            "SELECT tap_id FROM tap_usage_running WHERE tap_id=%s",
            (tap_id,), fetch="one",
        )
        if existing:
            query(
                "UPDATE tap_usage_running SET current_usage = current_usage + %s, last_update = NOW() WHERE tap_id = %s",
                (amount, tap_id), commit=True,
            )
        else:
            query(
                "INSERT INTO tap_usage_running (tap_id, current_usage) VALUES (%s, %s)",
                (tap_id, amount), commit=True,
            )

    return jsonify({"message": f"Simulated {len(on_taps)} tap(s)", "taps_on": len(on_taps)})

# ─────────────────────────────────────────────────────────────
# ARCHIVE DAILY DATA (midnight scheduler)
# ─────────────────────────────────────────────────────────────

@app.route("/archive-daily-data", methods=["POST"])
def archive_daily_data():
    """Called at midnight by scheduler.py."""
    archive_date = datetime.date.today()
    _do_archive_for_date(archive_date)
    _reset_running_totals()
    return jsonify({"message": "Archive complete", "date": str(archive_date)})


# ─────────────────────────────────────────────────────────────
# SETUP page – System Setup
# ─────────────────────────────────────────────────────────────

@app.route("/setup/<int:user_id>", methods=["GET"])
@token_required
def get_setup(user_id, current_user_id):
    taps = query(
        "SELECT tap_id, tap_name, location, tap_status FROM taps WHERE user_id=%s",
        (user_id,),
    )
    user = query(
        "SELECT people_count, base_green_per_person, base_orange_per_person FROM users WHERE user_id=%s",
        (user_id,), fetch="one",
    )
    green_limit, orange_limit = calc_limits(user)
    return jsonify({"taps": taps, **user, "green_limit": green_limit, "orange_limit": orange_limit})


@app.route("/catchup-archive", methods=["POST"])
def catchup_archive():
    """
    Manual trigger: archives any stale running data from previous days,
    resets running totals, and backfills system_daily_totals.
    Call this if you suspect a midnight archive was missed.
    """
    try:
        startup_catchup()
        return jsonify({"message": "Catchup complete — check Flask terminal for details."})
    except Exception as e:
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True, port=5000)

# ─────────────────────────────────────────────────────────────
# STARTUP — runs after ALL functions/routes are defined
# ─────────────────────────────────────────────────────────────
with app.app_context():
    try:
        run_migrations()
    except Exception as e:
        print(f"[MIGRATION] Warning: {e}")

    try:
        startup_catchup()
    except Exception as e:
        print(f"[STARTUP] Warning: {e}")
