# 💧 AquaTrack – Smart Water Management & Usage Analytics System

> Final Year Project | Full Stack | React · Flask · MySQL

---

## 📐 System Architecture

```
[React Dashboard]
      ↑  (Axios REST)
      |
[Flask API  :5000]  ←── POST /simulate-usage  ←── [simulator.py]  (every 60s)
      |                                                    ↑
      |              POST /archive-daily-data  ←── [scheduler.py]  (midnight)
      ↓
[MySQL Database]
  users · taps · tap_usage_running · tap_usage_timeseries
  tap_daily_archive · system_daily_totals
```

---

## 🗂️ Project Structure

```
water-mgmt/
├── backend/
│   ├── app.py              ← Flask REST API (all endpoints)
│   ├── config.py           ← DB credentials, JWT secret, simulator config
│   ├── simulator.py        ← Adds water usage every 60s to ON taps
│   ├── scheduler.py        ← Midnight archive job
│   ├── schema.sql          ← Full MySQL schema
│   └── requirements.txt    ← Python dependencies
│
└── frontend/
    ├── public/index.html
    ├── package.json
    └── src/
        ├── App.jsx                 ← Router & private routes
        ├── index.js                ← Entry point
        ├── api/index.js            ← All Axios API calls
        ├── context/AuthContext.jsx ← JWT auth context
        ├── components/
        │   ├── Layout.jsx          ← Sidebar navigation
        │   └── WaterTank.jsx       ← SVG animated beaker
        └── pages/
            ├── Login.jsx
            ├── Register.jsx
            ├── Dashboard.jsx       ← Main analytics dashboard
            ├── TapControl.jsx      ← Toggle taps ON/OFF
            ├── TapManagement.jsx   ← Add / delete taps
            ├── Reports.jsx         ← Charts + CSV export
            └── SystemSetup.jsx     ← Limits config + profile
```

---

## ⚙️ Setup & Installation

### Step 1 – MySQL Database

1. Open **MySQL Workbench**
2. Connect to your local MySQL server
3. Open and run `backend/schema.sql`
   - Creates database `water_mgmt`
   - Creates all 6 tables with proper foreign keys

### Step 2 – Backend (Flask)

```bash
cd backend

# Create virtual environment
python -m venv venv

# Activate
# Windows:
venv\Scripts\activate
# Mac/Linux:
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Edit config.py → set your MySQL password
# MYSQL_PASSWORD = "your_actual_password"

# Run the API server
python app.py
# → Runs on http://localhost:5000
```

### Step 3 – Simulator (separate terminal)

```bash
cd backend
source venv/bin/activate   # or venv\Scripts\activate on Windows

python simulator.py
# → Ticks every 60 seconds, adds usage to all ON taps
```

### Step 4 – Daily Scheduler (separate terminal)

```bash
cd backend
source venv/bin/activate

python scheduler.py
# → Archives data at midnight every day
```

### Step 5 – Frontend (React)

```bash
cd frontend

npm install
npm start
# → Opens http://localhost:3000
```

---

## 🔑 First-Time Usage

1. Open `http://localhost:3000`
2. Click **Register** → create your account
3. Go to **Tap Management** → add your taps (Bathroom, Kitchen, Toilet…)
4. Go to **System Setup** → configure your daily green/orange limits
5. Go to **Tap Control** → toggle taps ON
6. Watch the **Dashboard** auto-refresh every 60 seconds with live data!

---

## 🌐 API Reference

| Method | Endpoint                      | Auth | Description                      |
|--------|-------------------------------|------|----------------------------------|
| POST   | `/register`                   | ✗    | Register new user                |
| POST   | `/login`                      | ✗    | Login, returns JWT token         |
| GET    | `/users/{user_id}`            | ✓    | Get user profile                 |
| PUT    | `/users/{user_id}/limits`     | ✓    | Update green/orange limits       |
| POST   | `/add-tap`                    | ✓    | Add a new tap                    |
| GET    | `/taps/{user_id}`             | ✓    | Get all taps with running usage  |
| DELETE | `/delete-tap/{tap_id}`        | ✓    | Delete a tap                     |
| POST   | `/tap-on/{tap_id}`            | ✓    | Turn tap ON                      |
| POST   | `/tap-off/{tap_id}`           | ✓    | Turn tap OFF                     |
| GET    | `/dashboard/{user_id}`        | ✓    | Full dashboard data              |
| GET    | `/usage-timeseries/{user_id}` | ✓    | Time-series data (last N hours)  |
| GET    | `/daily-usage/{user_id}`      | ✓    | Daily archived totals            |
| GET    | `/usage-by-tap/{user_id}`     | ✓    | Per-tap breakdown                |
| GET    | `/export-csv/{user_id}`       | ✓    | Download usage CSV               |
| POST   | `/simulate-usage`             | ✗    | Trigger simulator tick           |
| POST   | `/archive-daily-data`         | ✗    | Trigger midnight archive         |
| GET    | `/setup/{user_id}`            | ✓    | Setup page data                  |

---

## 🗄️ Database Schema Summary

| Table                  | Purpose                                      |
|------------------------|----------------------------------------------|
| `users`                | Accounts with green/orange limits            |
| `taps`                 | Tap definitions (name, location, ON/OFF)     |
| `tap_usage_running`    | Today's running total per tap (reset daily)  |
| `tap_usage_timeseries` | Every simulator tick (detailed history)      |
| `tap_daily_archive`    | Archived daily totals per tap                |
| `system_daily_totals`  | Aggregated daily total + color status / user |

---

## 🎨 Color Status Logic

| Status     | Condition                          | Meaning         |
|------------|------------------------------------|-----------------|
| 🟢 Green   | `usage < green_limit`              | Safe usage      |
| 🟠 Orange  | `green_limit ≤ usage < orange_limit` | Moderate usage  |
| 🔴 Red     | `usage ≥ orange_limit`             | Critical usage  |

Default limits: Green = 100 L/day, Orange = 200 L/day

---

## 🔮 Future Improvements

- **IoT Integration** – Replace simulator with real sensor MQTT feed (ESP32/Arduino)
- **Push Notifications** – Email/SMS alerts when orange/red threshold crossed
- **Mobile App** – React Native companion app
- **Leak Detection** – Anomaly detection if tap ON for too long with no user
- **Multi-house** – Support for multiple properties per user
- **Bill Estimation** – Calculate estimated water bill from usage data
- **Weather Integration** – Correlate usage with temperature/season
- **AI Recommendations** – ML model to suggest usage reduction tips
- **Two-Factor Auth** – Enhanced security for production
- **Docker Deployment** – Containerise all services with docker-compose

---

## 👨‍💻 Tech Stack

| Layer      | Technology                  |
|------------|-----------------------------|
| Frontend   | React 18, React Router 6, Recharts, Axios |
| Styling    | Inline CSS (dark theme), Google Fonts DM Sans |
| Backend    | Python 3.10+, Flask 3, Flask-CORS |
| Auth       | JWT (PyJWT), bcrypt          |
| Database   | MySQL 8, mysql-connector-python |
| Scheduler  | `schedule` library           |
| Simulator  | Python `requests` + `time`   |

---

## 📊 PPT Slide Outline

1. **Title Slide** – AquaTrack: Smart Water Management System
2. **Problem Statement** – Water scarcity, lack of home monitoring
3. **Proposed Solution** – IoT-ready multi-user water tracking
4. **System Architecture** – Flow diagram (tap → simulator → DB → API → frontend)
5. **Database Design** – 6 tables, ER diagram
6. **Key Features** – Live dashboard, tap control, analytics, archiving
7. **Technology Stack** – React, Flask, MySQL, Python
8. **Demo Screenshots** – Dashboard, Tap Control, Reports
9. **Color Status System** – Green/Orange/Red explanation
10. **Future Scope** – IoT integration, ML, mobile app
11. **Conclusion** – Summary of achievements

---

_Built with 💧 for Final Year Project_
