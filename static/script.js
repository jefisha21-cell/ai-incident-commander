/* ═══════════════════════════════════════════════════════
   AI Incident Commander — script.js
   ═══════════════════════════════════════════════════════ */

const INCIDENT_ICONS = {
  "WILDFIRE": "🔥",
  "FLOOD": "🌊",
  "GAS LEAK": "☣️",
  "BUILDING COLLAPSE": "🏚️",
  "POWER OUTAGE": "⚡",
  "TRAFFIC INCIDENT": "🚗",
  "MEDICAL EMERGENCY": "🏥",
};

const RESOURCE_ICONS = {
  "fire": "🚒", "police": "🚓", "ambulance": "🚑",
  "medical": "🏥", "rescue": "🚁", "hazmat": "☣️",
  "electric": "⚡", "flood": "⛵",
};

function getResourceIcon(type = "") {
  const lower = type.toLowerCase();
  for (const [key, icon] of Object.entries(RESOURCE_ICONS)) {
    if (lower.includes(key)) return icon;
  }
  return "🔧";
}

function getRiskClass(risk) {
  if (risk >= 75) return "risk-high";
  if (risk >= 50) return "risk-medium";
  return "risk-low";
}

function setStatus(el, message, isError = false) {
  if (!el) return;
  el.textContent = message;
  el.style.color = isError ? "var(--danger)" : "var(--muted)";
}

/* ─── Theme & Greeting ──────────────────────────────── */
function initThemeAndGreeting() {
  const root = document.documentElement;
  const saved = localStorage.getItem("ai_ic_theme") || "dark";
  root.setAttribute("data-theme", saved);

  const btn = document.getElementById("themeToggle");
  if (btn) {
    btn.textContent = saved === "dark" ? "☀️ Light" : "🌙 Dark";
    btn.addEventListener("click", () => {
      const next = root.getAttribute("data-theme") === "dark" ? "light" : "dark";
      root.setAttribute("data-theme", next);
      localStorage.setItem("ai_ic_theme", next);
      btn.textContent = next === "dark" ? "☀️ Light" : "🌙 Dark";
    });
  }

  const greetingEl = document.getElementById("greeting");
  if (greetingEl) {
    const h = new Date().getHours();
    const period = h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
    const name = localStorage.getItem("ai_ic_commander_name") || "Commander";
    greetingEl.textContent = `${period}, ${name}`;
  }
}

/* ─── Session helpers ───────────────────────────────── */
function readRejectedSet() {
  return new Set(JSON.parse(sessionStorage.getItem("rejectedIncidents") || "[]"));
}
function writeRejectedSet(s) {
  sessionStorage.setItem("rejectedIncidents", JSON.stringify([...s]));
}
function applyRejectedFilter(incidents = []) {
  const rejected = readRejectedSet();
  return incidents.filter(i => !rejected.has(i.incident_id));
}

/* ─── Overview Cards ────────────────────────────────── */
function updateOverviewCards(summary = null) {
  const total    = document.getElementById("ovTotal");
  const accuracy = document.getElementById("ovAccuracy");
  const speed    = document.getElementById("ovSpeed");
  const alerts   = document.getElementById("ovAlerts");
  if (!total) return;

  const incidents = JSON.parse(sessionStorage.getItem("incidents") || "[]");
  const metrics   = JSON.parse(sessionStorage.getItem("metrics")   || "{}");
  const stored    = JSON.parse(sessionStorage.getItem("summary")    || "null");
  const s = summary || stored || {
    total_incidents_processed: incidents.length,
    model_accuracy: ((metrics.accuracy || 0) * 100).toFixed(2),
    avg_response_time: 0,
    active_alerts: incidents.length,
  };

  if (total)    total.textContent    = s.total_incidents_processed ?? 0;
  if (accuracy) accuracy.textContent = `${Number(s.model_accuracy || 0).toFixed(1)}%`;
  if (speed)    speed.textContent    = `${Number(s.avg_response_time || 0).toFixed(2)}s`;
  if (alerts)   alerts.textContent   = s.active_alerts ?? 0;
}

/* ─── Upload Page ───────────────────────────────────── */
function initUploadPage() {
  const fileInput     = document.getElementById("fileInput");
  if (!fileInput) return;

  const chooseBtn     = document.getElementById("chooseFileBtn");
  const uploadBtn     = document.getElementById("uploadBtn");
  const fileLabel     = document.getElementById("selectedFileName");
  const spinner       = document.getElementById("spinner");
  const statusMsg     = document.getElementById("statusMsg");
  const dropZone      = document.getElementById("dropZone");
  const progressWrap  = document.getElementById("uploadProgress");
  const progressBar   = document.getElementById("progressBar");
  const progressLabel = document.getElementById("progressLabel");

  let selectedFiles = [];

  updateOverviewCards();

  chooseBtn.addEventListener("click", () => fileInput.click());

  fileInput.addEventListener("change", () => {
    selectedFiles = [...(fileInput.files || [])];
    fileLabel.textContent = selectedFiles.length
      ? `${selectedFiles.length} file(s) selected: ${selectedFiles.map(f => f.name).join(", ")}`
      : "No files selected";
  });

  dropZone.addEventListener("dragover",  e => { e.preventDefault(); dropZone.classList.add("drag-over"); });
  dropZone.addEventListener("dragleave", () => dropZone.classList.remove("drag-over"));
  dropZone.addEventListener("drop", e => {
    e.preventDefault();
    dropZone.classList.remove("drag-over");
    selectedFiles = [...e.dataTransfer.files].filter(f => /\.(csv|json)$/i.test(f.name));
    fileLabel.textContent = selectedFiles.length
      ? `${selectedFiles.length} file(s) selected`
      : "No valid files";
  });

  /* Fake animated progress to keep UX lively during training */
  function startProgress() {
    progressWrap.style.display = "block";
    let pct = 0;
    const steps = [
      [15, "Uploading files…"],
      [35, "Parsing dataset…"],
      [55, "Extracting TF-IDF features…"],
      [75, "Training Random Forest…"],
      [90, "Evaluating model…"],
    ];
    let si = 0;
    const iv = setInterval(() => {
      if (si < steps.length) {
        pct = steps[si][0];
        progressLabel.textContent = steps[si][1];
        si++;
      }
      progressBar.style.width = pct + "%";
    }, 600);
    return iv;
  }

  uploadBtn.addEventListener("click", async () => {
    if (!selectedFiles.length) {
      setStatus(statusMsg, "Please select at least one CSV or JSON file.", true);
      return;
    }

    spinner.classList.remove("hidden");
    uploadBtn.disabled = true;
    const iv = startProgress();
    setStatus(statusMsg, "");

    try {
      const formData = new FormData();
      selectedFiles.forEach(f => formData.append("files", f));
      const res  = await fetch("/upload", { method: "POST", body: formData });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Upload failed.");

      clearInterval(iv);
      progressBar.style.width = "100%";
      progressLabel.textContent = "Done!";

      sessionStorage.setItem("incidents", JSON.stringify(data.incidents || []));
      sessionStorage.setItem("metrics",   JSON.stringify(data.metrics   || {}));
      sessionStorage.setItem("summary",   JSON.stringify(data.summary   || {}));
      sessionStorage.removeItem("rejectedIncidents");

      updateOverviewCards(data.summary || null);
      setStatus(statusMsg, "✅ Analysis complete — redirecting to dashboard…");
      setTimeout(() => { window.location.href = "/dashboard"; }, 900);
    } catch (err) {
      clearInterval(iv);
      progressWrap.style.display = "none";
      setStatus(statusMsg, err.message, true);
    } finally {
      spinner.classList.add("hidden");
      uploadBtn.disabled = false;
    }
  });
}

/* ─── Chart Helpers ─────────────────────────────────── */
const CHART_COLORS = ["#6366f1","#06b6d4","#10b981","#f59e0b","#ef4444","#8b5cf6","#ec4899"];

function buildBarChart(ctx, incidents) {
  const labels = incidents.map(i => i.incident_id);
  const data   = incidents.map(i => i.risk);
  const colors = incidents.map(i =>
    i.risk >= 75 ? "#ef4444" : i.risk >= 50 ? "#f59e0b" : "#10b981"
  );

  new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Risk Score",
        data,
        backgroundColor: colors,
        borderRadius: 6,
        borderSkipped: false,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => ` Risk: ${c.parsed.y.toFixed(1)}`
          }
        }
      },
      scales: {
        x: {
          ticks: { color: "#7b8299", maxRotation: 45, font: { size: 11 } },
          grid: { color: "rgba(255,255,255,0.04)" },
        },
        y: {
          beginAtZero: true, max: 100,
          ticks: { color: "#7b8299" },
          grid: { color: "rgba(255,255,255,0.06)" },
        },
      },
    },
  });
}

function buildPieChart(ctx, incidents) {
  const typeCounts = {};
  incidents.forEach(i => { typeCounts[i.type] = (typeCounts[i.type] || 0) + 1; });
  const labels = Object.keys(typeCounts);
  const data   = labels.map(l => typeCounts[l]);

  new Chart(ctx, {
    type: "doughnut",
    data: {
      labels,
      datasets: [{
        data,
        backgroundColor: CHART_COLORS.slice(0, labels.length),
        borderWidth: 2,
        borderColor: "rgba(0,0,0,0.3)",
        hoverOffset: 8,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: "bottom",
          labels: { color: "#7b8299", padding: 12, font: { size: 11 } },
        },
        tooltip: {
          callbacks: {
            label: c => ` ${c.label}: ${c.parsed} incident${c.parsed !== 1 ? "s" : ""}`
          }
        }
      },
    },
  });
}

function buildLineChart(ctx, incidents) {
  new Chart(ctx, {
    type: "line",
    data: {
      labels: incidents.map(i => i.incident_id),
      datasets: [{
        label: "Confidence %",
        data: incidents.map(i => i.confidence),
        borderColor: "#6366f1",
        backgroundColor: "rgba(99,102,241,0.12)",
        borderWidth: 2,
        pointBackgroundColor: "#6366f1",
        pointRadius: 4,
        tension: 0.4,
        fill: true,
      }],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: { label: c => ` Confidence: ${c.parsed.y.toFixed(1)}%` }
        }
      },
      scales: {
        x: { ticks: { color: "#7b8299", font: { size: 11 } }, grid: { color: "rgba(255,255,255,0.04)" } },
        y: { beginAtZero: true, max: 100, ticks: { color: "#7b8299" }, grid: { color: "rgba(255,255,255,0.06)" } },
      },
    },
  });
}

/* ─── Dashboard Page ────────────────────────────────── */
function renderDashboard() {
  const incidentCards = document.getElementById("incidentCards");
  if (!incidentCards) return;

  const allIncidents = JSON.parse(sessionStorage.getItem("incidents") || "[]");
  const metrics      = JSON.parse(sessionStorage.getItem("metrics")   || "{}");
  const incidents    = applyRejectedFilter(allIncidents);

  // Metric chips
  const chips = document.getElementById("metricChips");
  if (chips && metrics.accuracy !== undefined) {
    chips.innerHTML = `
      <div class="metric-chip">Accuracy <span>${(metrics.accuracy * 100).toFixed(1)}%</span></div>
      <div class="metric-chip">R² Score <span>${(metrics.r2 || 0).toFixed(3)}</span></div>
      <div class="metric-chip">Incidents <span>${incidents.length}</span></div>
    `;
  }

  if (!incidents.length) {
    incidentCards.innerHTML = `
      <div class="empty-state" style="grid-column:1/-1;">
        <div class="empty-icon">📭</div>
        <h3>No incidents to display</h3>
        <p>Upload a dataset on the Upload page to get started.</p>
      </div>`;
    return;
  }

  // Build charts
  const barCtx  = document.getElementById("riskBarChart");
  const pieCtx  = document.getElementById("typePieChart");
  const lineCtx = document.getElementById("confidenceLineChart");
  if (barCtx)  buildBarChart(barCtx,   incidents);
  if (pieCtx)  buildPieChart(pieCtx,   incidents);
  if (lineCtx) buildLineChart(lineCtx, incidents);

  // Filter pills
  let activeFilter = "all";
  function renderCards(filter) {
    const filtered = filter === "all" ? incidents : incidents.filter(i => {
      const rc = getRiskClass(i.risk);
      return rc === `risk-${filter}`;
    });

    if (!filtered.length) {
      incidentCards.innerHTML = `
        <div class="empty-state" style="grid-column:1/-1;">
          <div class="empty-icon">🔍</div>
          <h3>No ${filter} risk incidents</h3>
        </div>`;
      return;
    }

    incidentCards.innerHTML = filtered.map(incident => `
      <article class="incident-card ${getRiskClass(incident.risk)}" data-id="${incident.incident_id}">
        <div class="incident-card-header">
          <div class="incident-type-badge">
            ${INCIDENT_ICONS[incident.type] || "⚠️"} ${incident.type}
          </div>
          <div class="risk-score-display">
            <div class="score-num">${incident.risk}</div>
            <div class="score-label">Risk</div>
          </div>
        </div>
        <div class="incident-meta">
          <div class="meta-row"><span class="meta-icon">🆔</span><strong>${incident.incident_id}</strong></div>
          <div class="meta-row"><span class="meta-icon">📍</span>${incident.location}</div>
        </div>
        <div style="font-size:0.78rem;color:var(--muted);margin-bottom:4px;">
          Confidence: ${incident.confidence.toFixed(1)}%
        </div>
        <div class="confidence-bar-wrap">
          <div class="confidence-bar" style="width:${incident.confidence}%"></div>
        </div>
        <button class="btn primary view-details" data-id="${incident.incident_id}" style="width:100%;">
          View Details →
        </button>
      </article>
    `).join("");

    document.querySelectorAll(".view-details").forEach(btn => {
      btn.addEventListener("click", () => {
        const sel = incidents.find(i => i.incident_id === btn.dataset.id);
        sessionStorage.setItem("selectedIncident", JSON.stringify(sel));
        window.location.href = "/action";
      });
    });
  }

  renderCards("all");

  document.querySelectorAll(".pill").forEach(pill => {
    pill.addEventListener("click", () => {
      document.querySelectorAll(".pill").forEach(p => p.classList.remove("active"));
      pill.classList.add("active");
      renderCards(pill.dataset.filter);
    });
  });
}

/* ─── Action Page ───────────────────────────────────── */
async function loadActionPage() {
  const heroEl = document.getElementById("incidentDetail");
  if (!heroEl) return;

  const selectedIncident = JSON.parse(sessionStorage.getItem("selectedIncident") || "null");

  if (!selectedIncident || readRejectedSet().has(selectedIncident.incident_id)) {
    heroEl.innerHTML = `
      <div class="empty-state">
        <div class="empty-icon">📭</div>
        <h3>No incident selected</h3>
        <p>Go to the Dashboard and click "View Details" on an incident.</p>
      </div>`;
    return;
  }

  const riskClass = getRiskClass(selectedIncident.risk);
  const riskLevel = riskClass === "risk-high" ? "high" : riskClass === "risk-medium" ? "medium" : "low";
  const icon = INCIDENT_ICONS[selectedIncident.type] || "⚠️";

  heroEl.innerHTML = `
    <div class="detail-header">
      <div class="detail-type-icon ${riskLevel}">${icon}</div>
      <div class="detail-title">
        <h3>${selectedIncident.type}</h3>
        <div class="detail-id">ID: ${selectedIncident.incident_id} · ${selectedIncident.location}</div>
      </div>
    </div>
    <div class="detail-stats">
      <div class="detail-stat">
        <div class="score-num ${riskClass.replace("risk-", "")}" style="color:${
          riskLevel === "high" ? "var(--danger)" : riskLevel === "medium" ? "var(--warn)" : "var(--safe)"
        };">${selectedIncident.risk}</div>
        <div class="stat-key">Risk Score</div>
      </div>
      <div class="detail-stat">
        <div class="score-num" style="color:var(--primary);">${selectedIncident.confidence.toFixed(1)}%</div>
        <div class="stat-key">Confidence</div>
      </div>
      <div class="detail-stat">
        <div class="score-num" style="color:var(--accent);">${riskLevel.toUpperCase()}</div>
        <div class="stat-key">Priority</div>
      </div>
    </div>
  `;

  const actionList   = document.getElementById("actionList");
  const resourceList = document.getElementById("resourceList");
  const actionCount  = document.getElementById("actionCount");
  const resourceCount= document.getElementById("resourceCount");

  try {
    const res  = await fetch(`/incident/${selectedIncident.incident_id}`);
    const data = await res.json();
    const actions   = data.actions   || [];
    const resources = data.resources || [];

    if (actionCount)   actionCount.textContent   = `${actions.length} actions`;
    if (resourceCount) resourceCount.textContent = `${resources.length} units`;

    actionList.innerHTML = actions.map(a => `
      <li class="action-item">${a}</li>
    `).join("") || "<li class='action-item'>No actions available.</li>";

    resourceList.innerHTML = resources.map(r => `
      <div class="resource-item">
        <div class="resource-icon">${getResourceIcon(r.resource_type)}</div>
        <div class="resource-info">
          <strong>${r.resource_type || "Unit"}</strong>
          <span>Status: ${r.status || "Available"}</span>
        </div>
        <div class="resource-eta">⏱ ${r.arrival_time_min || "?"} min</div>
      </div>
    `).join("") || "<p style='color:var(--muted);font-size:0.875rem;'>No resources on record.</p>";

  } catch {
    actionList.innerHTML   = "<li class='action-item'>Unable to load actions.</li>";
    resourceList.innerHTML = "<p style='color:var(--danger);font-size:0.875rem;'>Failed to fetch data.</p>";
  }

  const decisionMsg = document.getElementById("decisionMsg");
  const acceptBtn   = document.getElementById("acceptBtn");
  const rejectBtn   = document.getElementById("rejectBtn");

  acceptBtn.addEventListener("click", () => {
    setStatus(decisionMsg, "✅ Incident accepted — response teams notified.");
    acceptBtn.disabled = true;
    rejectBtn.disabled = true;
  });

  rejectBtn.addEventListener("click", () => {
    const rejected = readRejectedSet();
    rejected.add(selectedIncident.incident_id);
    writeRejectedSet(rejected);

    const remaining = applyRejectedFilter(JSON.parse(sessionStorage.getItem("incidents") || "[]"));
    const metrics   = JSON.parse(sessionStorage.getItem("metrics") || "{}");
    sessionStorage.setItem("summary", JSON.stringify({
      total_incidents_processed: remaining.length,
      model_accuracy: ((metrics.accuracy || 0) * 100).toFixed(2),
      avg_response_time: 0,
      active_alerts: remaining.length,
    }));
    sessionStorage.removeItem("selectedIncident");
    setStatus(decisionMsg, "Incident marked as false — removing…", true);
    setTimeout(() => { window.location.href = "/dashboard"; }, 700);
  });
}

/* ─── Boot ──────────────────────────────────────────── */
document.addEventListener("DOMContentLoaded", () => {
  initThemeAndGreeting();
  initUploadPage();
  renderDashboard();
  loadActionPage();
});
