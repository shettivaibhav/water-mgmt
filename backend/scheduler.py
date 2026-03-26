"""
scheduler.py
─────────────────────────────────────────────────────────────
Runs independently.  At midnight every day it calls:
  POST /archive-daily-data  – archives usage, inserts zero-rows,
                               updates system_daily_totals, resets running.

Start:  python scheduler.py
Stop:   Ctrl-C
"""

import schedule
import time
import requests
import logging

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SCHEDULER] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
)

API_BASE = "http://localhost:5000"


def archive():
    try:
        resp = requests.post(f"{API_BASE}/archive-daily-data", timeout=30)
        resp.raise_for_status()
        logging.info(resp.json().get("message", "Archive OK"))
    except requests.exceptions.ConnectionError:
        logging.warning("Cannot connect to Flask API — archive skipped")
    except Exception as exc:
        logging.error(f"Archive error: {exc}")


# Run at 00:00 every day
schedule.every().day.at("00:00").do(archive)

if __name__ == "__main__":
    logging.info("Scheduler started — will archive at midnight …")
    while True:
        schedule.run_pending()
        time.sleep(30)
