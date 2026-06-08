# 🛡️ AI Incident Commander 

A machine learning powered command and control platform for emergency incident triage, risk scoring, and response dispatch. Built with Flask, scikit-learn, and Chart.js.

---

## 📸 Pages

| Page | Route | Description |
|------|-------|-------------|
| Upload | `/` | Upload incident datasets, train the model, view summary stats |
| Dashboard | `/dashboard` | View top 10 priority incidents with charts and filters |
| Action Center | `/action` | Review a selected incident, dispatch resources, or mark as false |

---

## 🧠 How the ML Model Works

The model trains fresh on every dataset upload — no pre-trained weights are stored.

**Pipeline:**
1. Raw `issue_reported` text → **TF-IDF vectorization** (200 features, unigrams + bigrams)
2. Contextual features added alongside TF-IDF: `location_hash`, `caller_type`, `hour`, `is_night`, `is_peak_hour`, `call_duration`, and 7 lightweight keyword flags as supplementary signals
3. Two **Random Forest** models trained simultaneously:
   - `RandomForestClassifier` → predicts **incident type**
   - `RandomForestRegressor` → predicts **risk score (0–100)**
4. Predictions reported with honest accuracy — typically **60–80%** depending on dataset size and label quality

> The model learns from text patterns, not memorized rules. Accuracy will be lower than a rule-based system but the predictions are genuine.

---

## 📁 Project Structure

```
ai-ccp/
├── app.py                  # Flask routes and API
├── ml_model.py             # TF-IDF + Random Forest model
├── requirements.txt        # Python dependencies
│
├── data/
│   ├── resources.csv       # Resource pool (fire trucks, ambulances, etc.)
│   └── sample_incidents.csv
│
├── demo_datasets/          # Ready-to-upload test datasets
│   ├── 01_basic_incidents.csv       — 20 labelled incidents, all types
│   ├── 02_large_mixed.csv           — 30 labelled incidents, varied risk
│   ├── 03_no_labels.csv             — 20 unlabelled (model infers type)
│   ├── 04_hindi_english_mixed.csv   — 20 bilingual incidents
│   ├── 05_high_risk_only.csv        — 10 critical incidents (risk 91–99)
│   ├── 06_low_risk_routine.csv      — 15 routine low-risk incidents
│   ├── 07_basic_incidents.json      — JSON version of dataset 01
│   ├── 08_no_labels.json            — JSON version of dataset 03
│   └── 09_high_risk.json            — JSON version of dataset 05
│
├── static/
│   ├── style.css           # Dark/light theme, full UI styling
│   ├── script.js           # Upload, charts, dashboard, action logic
│   └── bg.jpg
│
└── templates/
    ├── index.html          # Upload page
    ├── dashboard.html      # Dashboard with charts
    └── action.html         # Action center
```

---

## 🚀 Getting Started

### 1. Install dependencies

```bash
pip install -r requirements.txt
```

### 2. Run the server

```bash
python app.py
```

### 3. Open in browser

```
http://127.0.0.1:5000
```

---

## 📊 Dataset Format

### CSV (minimum required columns)

```csv
incident_id,location,issue_reported,caller_type,time,call_duration
INC001,Sector 14,Fire near market heavy smoke,citizen,22:10,18
```

### Optional columns (improve model accuracy)

| Column | Values | Effect |
|--------|--------|--------|
| `incident_type` | `WILDFIRE`, `FLOOD`, `GAS LEAK`, `BUILDING COLLAPSE`, `POWER OUTAGE`, `TRAFFIC INCIDENT`, `MEDICAL EMERGENCY` | Provides ground-truth labels for the classifier |
| `risk_score` | `0–100` | Provides ground-truth for the risk regressor |

> Without labels, the model infers everything from text and context. Accuracy will be lower but still functional.

### caller_type values

| Value | Meaning |
|-------|---------|
| `citizen` / `public` | General public caller |
| `officer` / `official` | Law enforcement or official |
| `automated` / `sensor` | Automated sensor or system alert |

---

## 🧪 Testing with Demo Datasets

All demo datasets are in the `demo_datasets/` folder. Recommended testing order:

| # | File | What it tests |
|---|------|---------------|
| 1 | `01_basic_incidents.csv` | Standard labelled dataset — baseline accuracy |
| 2 | `02_large_mixed.csv` | More data — better model generalization |
| 3 | `03_no_labels.csv` | Pure inference — no ground truth provided |
| 4 | `04_hindi_english_mixed.csv` | Bilingual text handling |
| 5 | `05_high_risk_only.csv` | All high-risk — tests chart and filter behaviour |
| 6 | `06_low_risk_routine.csv` | All low-risk — contrast view |
| 7 | `07_basic_incidents.json` | JSON upload format |
| 8 | `08_no_labels.json` | JSON without labels |
| 9 | `09_high_risk.json` | JSON high-risk incidents |

You can also **upload multiple files at once** — the app merges them before training.

---

## 🔌 API Endpoints

| Method | Route | Description |
|--------|-------|-------------|
| `GET` | `/` | Upload page |
| `GET` | `/dashboard` | Dashboard page |
| `GET` | `/action` | Action center page |
| `POST` | `/upload` | Upload CSV/JSON files, train model, get predictions |
| `GET` | `/incident/<id>` | Get actions and resources for a specific incident |

### POST `/upload` — Response

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

## ⚙️ Requirements

```
Flask
pandas
numpy
scikit-learn
```

Python 3.8+ recommended.

---

## 🎨 UI Features

- Dark mode by default, toggle to light mode (persisted in localStorage)
- **3 charts** on dashboard: Risk Bar Chart, Incident Type Doughnut, Confidence Line Chart
- Filter incidents by risk level: All / High / Medium / Low
- Animated progress bar during model training
- Responsive layout for smaller screens

---

## 📝 Notes

- The model retrains on every upload — there is no saved model state between sessions
- `latest_incidents` is stored in server memory — restarting the server clears it
- For best accuracy, provide datasets with at least 15–20 labelled rows
- Accuracy displayed in the UI is honest test-set accuracy, not training accuracy
