from pathlib import Path
from typing import Dict, List

import pandas as pd
from flask import Flask, jsonify, render_template, request
from werkzeug.utils import secure_filename

from ml_model import ACTION_MAP, IncidentModel, load_dataset


BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
RESOURCE_FILE = DATA_DIR / "resources.csv"

ALLOWED_EXTENSIONS = {"csv", "json"}

app = Flask(__name__)
app.config["UPLOAD_FOLDER"] = str(UPLOAD_DIR)
app.config["MAX_CONTENT_LENGTH"] = 10 * 1024 * 1024

UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

incident_model = IncidentModel()
latest_incidents: Dict[str, Dict] = {}


def _allowed_file(filename: str) -> bool:
    return "." in filename and filename.rsplit(".", 1)[1].lower() in ALLOWED_EXTENSIONS


def _load_resources() -> pd.DataFrame:
    if RESOURCE_FILE.exists():
        df = pd.read_csv(RESOURCE_FILE)
    else:
        df = pd.DataFrame(columns=["incident_id", "resource_type", "status", "arrival_time_min"])
    for col in ["incident_id", "resource_type", "status", "arrival_time_min"]:
        if col not in df.columns:
            df[col] = ""
    return df


RESOURCE_DF = _load_resources()


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/dashboard")
def dashboard():
    return render_template("dashboard.html")


@app.route("/action")
def action():
    return render_template("action.html")


@app.route("/upload", methods=["POST"])
def upload_file():
    files = request.files.getlist("files")
    if not files:
        single = request.files.get("file")
        if single:
            files = [single]

    if not files:
        return jsonify({"error": "No file provided."}), 400

    try:
        dataset_parts: List[pd.DataFrame] = []
        for file in files:
            if file.filename == "":
                continue
            if not _allowed_file(file.filename):
                return jsonify({"error": "Only CSV or JSON files are supported."}), 400

            filename = secure_filename(file.filename)
            save_path = UPLOAD_DIR / filename
            file.save(str(save_path))
            dataset_parts.append(load_dataset(str(save_path)))

        if not dataset_parts:
            return jsonify({"error": "No valid files selected."}), 400

        dataset = pd.concat(dataset_parts, ignore_index=True, sort=False).drop_duplicates().reset_index(drop=True)
        incident_model.train(dataset)
        incidents, metrics = incident_model.predict_top_incidents(dataset, top_n=10)
        latest_incidents.clear()
        latest_incidents.update({item["incident_id"]: item for item in incidents})

        avg_response_time = float(
            pd.to_numeric(dataset.get("call_duration", pd.Series(dtype=float)), errors="coerce").fillna(0).mean()
        )
        summary = {
            "total_incidents_processed": int(len(dataset)),
            "avg_response_time": round(avg_response_time, 2),
            "model_accuracy": round(float(metrics.get("accuracy", 0)) * 100, 2),
            "active_alerts": int(len(incidents)),
        }

        return jsonify({"incidents": incidents, "metrics": metrics, "summary": summary})
    except Exception as exc:
        return jsonify({"error": f"Failed to process dataset: {exc}"}), 500


@app.route("/incident/<incident_id>", methods=["GET"])
def get_incident_details(incident_id: str):
    incident = latest_incidents.get(incident_id)
    if not incident:
        incident = {
            "incident_id": incident_id,
            "type": "TRAFFIC INCIDENT",
            "risk": 45,
            "confidence": 60,
            "location": "Unknown",
        }

    resource_rows: List[Dict] = (
        RESOURCE_DF[RESOURCE_DF["incident_id"].astype(str) == str(incident_id)]
        .head(3)
        .to_dict(orient="records")
    )

    if not resource_rows:
        resource_rows = RESOURCE_DF.head(3).to_dict(orient="records")

    response = {
        "incident": incident,
        "actions": ACTION_MAP.get(incident["type"], ["Monitor situation"]),
        "resources": resource_rows,
    }
    return jsonify(response)


if __name__ == "__main__":
    app.run(debug=True)
