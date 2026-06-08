import hashlib
import re
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier, RandomForestRegressor
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics import accuracy_score, r2_score
from sklearn.model_selection import train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import LabelEncoder


INCIDENT_TYPES = [
    "WILDFIRE",
    "FLOOD",
    "GAS LEAK",
    "BUILDING COLLAPSE",
    "POWER OUTAGE",
    "TRAFFIC INCIDENT",
    "MEDICAL EMERGENCY",
]

CALLER_MAP = {
    "citizen": 0,
    "public": 0,
    "officer": 1,
    "official": 1,
    "automated": 2,
    "sensor": 2,
}

# Keywords kept only as lightweight supplementary signal, NOT the primary features
KEYWORDS = {
    "kw_fire": ["fire", "wildfire", "blaze", "आग", "जल रहा", "धुआं"],
    "kw_flood": ["flood", "waterlogging", "overflow", "बाढ़", "पानी भर", "जलभराव"],
    "kw_gas": ["gas", "leak", "toxic", "गैस", "रिसाव"],
    "kw_collapse": ["collapse", "building down", "debris", "ढह", "गिर", "मलबा"],
    "kw_power": ["power", "electric", "outage", "बिजली", "करंट"],
    "kw_traffic": ["traffic", "accident", "collision", "जाम", "टक्कर"],
    "kw_medical": ["medical", "ambulance", "heart", "चोट", "एम्बुलेंस"],
}

ACTION_MAP = {
    "WILDFIRE": ["Dispatch fire brigade", "Evacuate area", "Set up water supply chain"],
    "FLOOD": ["Send rescue boats", "Move people to safe zones", "Issue flood warnings"],
    "GAS LEAK": ["Seal area immediately", "Send hazmat team", "Evacuate 500m radius"],
    "BUILDING COLLAPSE": ["Send urban rescue team", "Provide medical support", "Secure perimeter"],
    "POWER OUTAGE": ["Send electrical team", "Activate backup power", "Notify utility provider"],
    "TRAFFIC INCIDENT": ["Send police and ambulance", "Divert traffic", "Clear accident site"],
    "MEDICAL EMERGENCY": ["Dispatch ambulance", "Alert nearest hospital", "Send first responders"],
}


class IncidentModel:
    # Structural/contextual features alongside TF-IDF
    CONTEXT_COLUMNS = [
        "location_hash",
        "caller_type_enc",
        "hour",
        "is_night",
        "is_peak_hour",
        "call_duration",
        # keyword flags as supplementary signals only
        "kw_fire", "kw_flood", "kw_gas", "kw_collapse",
        "kw_power", "kw_traffic", "kw_medical",
    ]

    def __init__(self) -> None:
        self.classifier = RandomForestClassifier(n_estimators=150, random_state=42, min_samples_leaf=1)
        self.regressor = RandomForestRegressor(n_estimators=150, random_state=42, min_samples_leaf=1)
        self.tfidf = TfidfVectorizer(max_features=200, ngram_range=(1, 2), min_df=1)
        self.label_encoder = LabelEncoder()
        self.metrics: Dict[str, float] = {"accuracy": 0.0, "r2": 0.0}
        self.is_trained = False

    @staticmethod
    def _clean_text(value) -> str:
        if pd.isna(value):
            return ""
        text = str(value).strip().lower()
        text = re.sub(r"\s+", " ", text)
        return text

    @staticmethod
    def _location_hash(location: str) -> int:
        cleaned = IncidentModel._clean_text(location)
        digest = hashlib.md5(cleaned.encode("utf-8")).hexdigest()
        return int(digest[:8], 16) % 1000

    @staticmethod
    def _parse_hour(value) -> int:
        if pd.isna(value):
            return 12
        text = str(value)
        if ":" in text:
            try:
                return int(text.split(":")[0]) % 24
            except ValueError:
                return 12
        try:
            return int(text) % 24
        except ValueError:
            return 12

    @staticmethod
    def _caller_type_encode(value: str) -> int:
        cleaned = IncidentModel._clean_text(value)
        return CALLER_MAP.get(cleaned, 3)

    @staticmethod
    def _contains_keyword(text: str, terms: List[str]) -> int:
        for term in terms:
            if term in text:
                return 1
        return 0

    def _normalize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        required = ["incident_id", "location", "issue_reported", "caller_type", "time", "call_duration"]
        for col in required:
            if col not in df.columns:
                df[col] = ""
        df["incident_id"] = df["incident_id"].fillna("").astype(str)
        df["location"] = df["location"].fillna("Unknown").astype(str)
        df["issue_reported"] = df["issue_reported"].fillna("").astype(str)
        df["caller_type"] = df["caller_type"].fillna("citizen").astype(str)
        df["time"] = df["time"].fillna("12:00").astype(str)
        df["call_duration"] = (
            pd.to_numeric(df["call_duration"], errors="coerce").fillna(5).clip(lower=1, upper=120)
        )
        if "incident_type" in df.columns:
            df["incident_type"] = df["incident_type"].fillna("").astype(str).str.upper()
        if "risk_score" in df.columns:
            df["risk_score"] = pd.to_numeric(df["risk_score"], errors="coerce")
        return df

    def prepare_features(self, df: pd.DataFrame) -> pd.DataFrame:
        df = self._normalize_columns(df.copy())
        clean_issue = df["issue_reported"].apply(self._clean_text)

        # Keyword flags — supplementary context only
        for key, terms in KEYWORDS.items():
            df[key] = clean_issue.apply(lambda text, t=terms: self._contains_keyword(text, t))

        df["location_hash"] = df["location"].apply(self._location_hash)
        df["caller_type_enc"] = df["caller_type"].apply(self._caller_type_encode)
        df["hour"] = df["time"].apply(self._parse_hour)
        df["is_night"] = df["hour"].apply(lambda h: 1 if h >= 21 or h < 6 else 0)
        df["is_peak_hour"] = df["hour"].apply(lambda h: 1 if (7 <= h <= 10) or (17 <= h <= 20) else 0)
        df["_clean_issue"] = clean_issue
        return df

    def _build_feature_matrix(self, df: pd.DataFrame, fit_tfidf: bool = False) -> np.ndarray:
        """Combine TF-IDF text features with contextual numeric features."""
        if fit_tfidf:
            tfidf_matrix = self.tfidf.fit_transform(df["_clean_issue"]).toarray()
        else:
            tfidf_matrix = self.tfidf.transform(df["_clean_issue"]).toarray()

        context_matrix = df[self.CONTEXT_COLUMNS].values.astype(float)
        return np.hstack([tfidf_matrix, context_matrix])

    def _derive_labels(self, df: pd.DataFrame) -> Tuple[pd.Series, pd.Series]:
        """
        Derive training labels. If ground-truth labels exist in the data, use them.
        Otherwise fall back to a soft keyword heuristic — but this is a last resort,
        not the primary signal.
        """
        # Incident type label
        if "incident_type" in df.columns and not df["incident_type"].eq("").all():
            y_class = df["incident_type"].replace("", np.nan)
        else:
            # Fallback: pick the first matching keyword category
            flag_to_type = [
                ("kw_fire", "WILDFIRE"), ("kw_flood", "FLOOD"), ("kw_gas", "GAS LEAK"),
                ("kw_collapse", "BUILDING COLLAPSE"), ("kw_power", "POWER OUTAGE"),
                ("kw_traffic", "TRAFFIC INCIDENT"), ("kw_medical", "MEDICAL EMERGENCY"),
            ]
            def _infer_type(row):
                for flag, t in flag_to_type:
                    if row.get(flag, 0) == 1:
                        return t
                return "TRAFFIC INCIDENT"
            y_class = df.apply(_infer_type, axis=1)

        # Fill missing with mode
        mode_val = y_class.mode()
        y_class = y_class.fillna(mode_val[0] if len(mode_val) else "TRAFFIC INCIDENT")

        # Risk score label — use ground truth if available, otherwise a simple heuristic
        if "risk_score" in df.columns and df["risk_score"].notna().any():
            y_reg = df["risk_score"].fillna(50.0).clip(0, 100)
        else:
            # Simple heuristic: base on call_duration + time features — NOT hardcoded per type
            y_reg = (
                (df["call_duration"] / 120.0) * 40        # longer call → higher risk
                + df["is_night"] * 15                      # night → higher risk
                + df["is_peak_hour"] * 10                  # peak hour → higher risk
                + (df["caller_type_enc"] == 1).astype(int) * 10  # official caller → more serious
                + 25                                        # base offset
            ).clip(0, 100)

        return y_class, y_reg

    def train(self, df: pd.DataFrame) -> Dict[str, float]:
        prepared = self.prepare_features(df)
        y_class, y_reg = self._derive_labels(prepared)

        # Build feature matrix — TF-IDF is fitted here
        X = self._build_feature_matrix(prepared, fit_tfidf=True)

        class_counts = y_class.value_counts()
        enough_for_stratify = (
            y_class.nunique() > 1
            and class_counts.min() >= 2
            and int(len(prepared) * 0.2) >= y_class.nunique()
        )
        stratify_target = y_class if enough_for_stratify else None

        X_train, X_test, yc_train, yc_test, yr_train, yr_test = train_test_split(
            X, y_class, y_reg, test_size=0.2, random_state=42, stratify=stratify_target
        )

        self.classifier.fit(X_train, yc_train)
        self.regressor.fit(X_train, yr_train)

        class_pred = self.classifier.predict(X_test)
        reg_pred = self.regressor.predict(X_test)

        self.metrics["accuracy"] = float(accuracy_score(yc_test, class_pred))
        self.metrics["r2"] = float(r2_score(yr_test, reg_pred))
        self.is_trained = True
        return self.metrics

    def predict_top_incidents(self, df: pd.DataFrame, top_n: int = 10) -> Tuple[List[Dict], Dict[str, float]]:
        if not self.is_trained:
            self.train(df)

        prepared = self.prepare_features(df)
        X = self._build_feature_matrix(prepared, fit_tfidf=False)

        predicted_type = self.classifier.predict(X)
        predicted_risk = self.regressor.predict(X)  # regressor output directly — no hardcoded blending
        predicted_risk = np.clip(predicted_risk, 0, 100)

        proba = self.classifier.predict_proba(X)

        rows = []
        for idx, (_, row) in enumerate(prepared.iterrows()):
            class_label = predicted_type[idx]
            classes_list = list(self.classifier.classes_)
            class_index = classes_list.index(class_label) if class_label in classes_list else 0
            confidence = float(proba[idx][class_index] * 100.0)
            rows.append({
                "incident_id": str(row["incident_id"] or f"INC{idx + 1}"),
                "type": class_label,
                "risk": round(float(predicted_risk[idx]), 2),
                "confidence": round(confidence, 2),
                "location": str(row["location"]),
            })

        top_incidents = sorted(rows, key=lambda item: item["risk"], reverse=True)[:top_n]
        return top_incidents, self.metrics


def load_dataset(file_path: str) -> pd.DataFrame:
    if file_path.lower().endswith(".csv"):
        return pd.read_csv(file_path)
    if file_path.lower().endswith(".json"):
        return pd.read_json(file_path)
    raise ValueError("Unsupported file format. Please upload CSV or JSON.")
