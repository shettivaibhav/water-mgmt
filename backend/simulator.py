"""
simulator.py
─────────────────────────────────────────────────────────────
Runs independently. Every 60 seconds it calls POST /simulate-usage
which adds random water usage to every tap whose status is ON.

Start:  python simulator.py
Stop:   Ctrl-C

Troubleshooting:
  - "Simulated 0 tap(s)"  → Go to Tap Control in the browser and
                             toggle at least one tap to ON.
  - "Cannot connect"      → Make sure app.py is running first.
"""

import time
import requests
import logging
import sys
from config import Config

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [SIMULATOR] %(message)s",
    datefmt="%Y-%m-%d %H:%M:%S",
    handlers=[logging.StreamHandler(sys.stdout)],
)

API_BASE = "http://localhost:5000"
INTERVAL = Config.SIMULATE_INTERVAL_SECONDS   # default 60 s
TICK     = 0


def simulate():
    global TICK
    TICK += 1
    try:
        resp = requests.post(f"{API_BASE}/simulate-usage", timeout=10)
        resp.raise_for_status()
        data     = resp.json()
        taps_on  = data.get("taps_on", 0)
        msg      = data.get("message", "")

        if taps_on == 0:
            logging.warning(
                f"Tick #{TICK} → {msg}  "
                "Turn a tap ON in the browser (Tap Control page) to start simulation."
            )
        else:
            logging.info(f"Tick #{TICK} → SUCCESS: {msg}")

    except requests.exceptions.ConnectionError:
        logging.error(
            f"Tick #{TICK} → Cannot connect to Flask API at {API_BASE}. "
            "Is app.py running?"
        )
    except requests.exceptions.HTTPError as e:
        logging.error(f"Tick #{TICK} → HTTP error: {e}")
    except Exception as exc:
        logging.error(f"Tick #{TICK} → Unexpected error: {exc}")


if __name__ == "__main__":
    logging.info(f"Simulator started — ticking every {INTERVAL}s")
    logging.info(f"Sending to: {API_BASE}/simulate-usage")
    logging.info("Make sure at least one tap is ON in the dashboard.\n")

    # First tick immediately so you don't wait 60s
    simulate()

    while True:
        time.sleep(INTERVAL)
        simulate()
