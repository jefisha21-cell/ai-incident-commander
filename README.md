# 🛡️ AI Incident Commander

> ML-powered emergency incident triage and response platform — risk scoring, dispatch, and real-time decision support.

![Python](https://img.shields.io/badge/Python-3.8+-3776AB?style=flat&logo=python&logoColor=white)
![Flask](https://img.shields.io/badge/Flask-2.x-000000?style=flat&logo=flask&logoColor=white)
![scikit-learn](https://img.shields.io/badge/scikit--learn-RandomForest-F7931E?style=flat&logo=scikit-learn&logoColor=white)
![Chart.js](https://img.shields.io/badge/Chart.js-4.x-FF6384?style=flat&logo=chartdotjs&logoColor=white)

---

## What is this?

AI Incident Commander is a web-based command and control platform for emergency incident management. You upload a dataset of reported incidents, the system trains a machine learning model on the fly, classifies each incident by type and risk, and surfaces the top 10 priorities for dispatch.

It's designed to assist emergency response teams in making faster, data-driven triage decisions — without needing a data scientist to operate it.

---

## Pages

| Page | Route | What it does |
|------|-------|--------------|
| **Upload** | `/` | Upload CSV or JSON incident data, trigger model training, view summary stats |
| **Dashboard** | `/dashboard` | View top 10 priority incidents with 3 live charts and risk-level filters |
| **Action Center** | `/action` | Deep-dive into a single incident — recommended actions, nearby resources, accept or reject |

---

## How the ML Model Works

The model trains fresh on every upload. No pre-saved weights. No memorized rules.

### Pipeline

```
issue_reported (raw text)
        ↓
   TF-IDF Vectorizer
   (200 features, unigrams + bigrams)
        ↓
   + Contextual Features
   (hour, is_night, is_peak_hour, call_duration,
    caller_type, location_hash, keyword flags)
        ↓
   ┌─────────────────────┬──────────────────────┐
   │ RandomForestClassifier │ RandomForestRegressor │
   │  → Incident Type    │  → Risk Score (0–100) │
   └─────────────────────┴──────────────────────┘
        ↓
   Top 10 incidents ranked by predicted risk
```

### Key design decisions

- **TF-IDF is the primary signal** — the model reads raw text and learns patterns from it, not from pre-baked keyword rules
- **Keyword flags are supplementary** — they add a small signal boost but do not dominate predictions
- **Risk score comes from the regressor directly** — no blending with hardcoded baselines
- **Honest accuracy** — typically 60–80% depending on dataset size and label quality. Lower than a rule-based system, but genuinely learned

> If `incident_type` and `risk_score` columns are present in your data, they become ground-truth training labels. Without them, the model infers everything from text and context alone.

---

## Project Structure

```
ai-incident-commander/
│
├── app.py                       # Flask server — routes, API, file handling
├── ml_model.py                  # TF-IDF + Random Forest training and prediction
├── requirements.txt             # Python dependencies
├── .gitignore
├── README.md
│
├── data/
│   ├── resources.csv            # Resource pool used live by the app (ambulances, fire trucks, etc.)
│   └── sample_incidents.csv     # Reference dataset
│
├── demo_datasets/               # 9 ready-to-upload test datasets
│   ├── 01_basic_incidents.csv
│   ├── 02_large_mixed.csv
│   ├── 03_no_labels.csv
│   ├── 04_hindi_english_mixed.csv
│   ├── 05_high_risk_only.csv
│   ├── 06_low_risk_routine.csv
│   ├── 07_basic_incidents.json
│   ├── 08_no_labels.json
│   └── 09_high_risk.json
│
├── static/
│   ├── style.css                # Full dark/light theme, all UI styling
│   └── script.js                # Upload logic, Chart.js charts, dashboard, action page
│
└── templates/
    ├── index.html               # Upload page
    ├── dashboard.html           # Dashboard with charts
    └── action.html              # Action center
```

---

## Getting Started

### Prerequisites

- Python 3.8 or higher
- pip

### 1. Clone the repo

```bash
git clone https://github.com/jefisha21-cell/ai-incident-commander.git
cd ai-incident-commander
```

### 2. Install dependencies

```bash
pip install -r requirements.txt
```

### 3. Run the server

```bash
python app.py
```

### 4. Open in your browser

```
http://127.0.0.1:5000
```

---

## Dataset Format

### Minimum required columns

```csv
incident_id,location,issue_reported,caller_type,time,call_duration
INC001,Sector 14,Fire near market with heavy smoke,citizen,22:10,18
```

### Full column reference

| Column | Required | Description |
|--------|----------|-------------|
| `incident_id` | ✅ | Unique identifier per row |
| `location` | ✅ | Address or area name |
| `issue_reported` | ✅ | Free-text description — this is the primary ML input |
| `caller_type` | ✅ | `citizen`, `officer`, or `automated` |
| `time` | ✅ | Time in `HH:MM` format |
| `call_duration` | ✅ | Duration in seconds |
| `incident_type` | Optional | Providing this improves classifier accuracy significantly |
| `risk_score` | Optional | Providing this improves regressor accuracy significantly |

### Supported incident types

`WILDFIRE` · `FLOOD` · `GAS LEAK` · `BUILDING COLLAPSE` · `POWER OUTAGE` · `TRAFFIC INCIDENT` · `MEDICAL EMERGENCY`

### caller_type values

| Value | Meaning |
|-------|---------|
| `citizen` or `public` | General public caller |
| `officer` or `official` | Law enforcement or official |
| `automated` or `sensor` | Automated sensor or system alert |

---

## Demo Datasets

All 9 test datasets are in `demo_datasets/`. Use them to explore different model behaviours.

| # | File | Rows | Labels | What to observe |
|---|------|------|--------|-----------------|
| 1 | `01_basic_incidents.csv` | 20 | ✅ | Baseline — all 7 types, balanced |
| 2 | `02_large_mixed.csv` | 30 | ✅ | More data = better accuracy |
| 3 | `03_no_labels.csv` | 20 | ❌ | Pure inference from text only |
| 4 | `04_hindi_english_mixed.csv` | 20 | ✅ | Bilingual text (Hindi + English) |
| 5 | `05_high_risk_only.csv` | 10 | ✅ | All critical — risk 91–99 |
| 6 | `06_low_risk_routine.csv` | 15 | ✅ | All routine — risk 18–35 |
| 7 | `07_basic_incidents.json` | 15 | ✅ | JSON upload format |
| 8 | `08_no_labels.json` | 15 | ❌ | JSON without labels |
| 9 | `09_high_risk.json` | 10 | ✅ | JSON high-risk incidents |

You can upload **multiple files at once** — the app merges and deduplicates them before training.

---

## API Reference

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/` | Serves upload page |
| `GET` | `/dashboard` | Serves dashboard page |
| `GET` | `/action` | Serves action center page |
| `POST` | `/upload` | Accepts CSV/JSON files, trains model, returns predictions |
| `GET` | `/incident/<id>` | Returns recommended actions and nearby resources for an incident |

### POST `/upload` response shape

```json
{
  "incidents": [
    {
      "incident_id": "INC001",
      "type": "WILDFIRE",
      "risk": 88.4,
      "confidence": 73.2,
      "location": "Sector 14"
    }
  ],
  "metrics": {
    "accuracy": 0.75,
    "r2": 0.56
  },
  "summary": {
    "total_incidents_processed": 20,
    "model_accuracy": 75.0,
    "avg_response_time": 14.2,
    "active_alerts": 10
  }
}
```

---

## UI Features

- **Dark mode by default** — toggle to light, preference saved in localStorage
- **3 dashboard charts** — Risk Score bar chart, Incident Type doughnut, Confidence trend line
- **Risk filters** — filter incident cards by All / High / Medium / Low
- **Animated progress bar** — step-by-step feedback during model training
- **Bilingual support** — handles Hindi and English text in `issue_reported`
- **Responsive layout** — works on smaller screens

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Backend | Python, Flask |
| ML | scikit-learn (RandomForest, TF-IDF) |
| Data | pandas, numpy |
| Frontend | Vanilla JS, Chart.js 4 |
| Styling | CSS custom properties, dark/light theming |

---

## Known Limitations

- Model retrains on every upload — no persistence between sessions
- `latest_incidents` lives in server memory — restarting the server clears it
- Best results with 15+ labelled rows — smaller datasets will show low or unstable accuracy
- Accuracy shown in the UI is honest test-set accuracy (80/20 split), not training accuracy

---

## License

MIT
