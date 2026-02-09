/************************************************
 * STATE COMPARISON TAB (FINAL – POLICY GRADE)
 * Features: Benchmark | Multi-State | Insights | Composite Index
 ************************************************/

/* ---------- SAFETY ---------- */
function isComparisonActive() {
    return document.getElementById("comparison")?.classList.contains("active");
}

function num(v) {
    const n = Number(v);
    return isNaN(n) ? 0 : n;
}

/* ---------- DROPDOWNS ---------- */
function populateComparisonDropdowns() {
    const primary = document.getElementById("comparisonStateSelect");
    const multi = document.getElementById("multiStateSelect");
    if (!primary || !Array.isArray(crimeData)) return;

    primary.innerHTML = "";
    if (multi) multi.innerHTML = "";

    const states = crimeData
        .map(d => d.state_ut)
        .filter(s => s && !s.toLowerCase().includes("total"));

    states.forEach(state => {
        primary.appendChild(new Option(state, state));
    });

    /* HARD RESET — prevents Delhi bleed forever */
    primary.selectedIndex = 0;

    refreshMultiStateOptions();
}

function refreshMultiStateOptions() {
    const primaryState = document.getElementById("comparisonStateSelect")?.value;
    const multi = document.getElementById("multiStateSelect");
    if (!multi) return;

    multi.innerHTML = "";

    crimeData
        .map(d => d.state_ut)
        .filter(
            s =>
                s &&
                !s.toLowerCase().includes("total") &&
                standardizeState(s) !== standardizeState(primaryState)
        )
        .forEach(state => multi.appendChild(new Option(state, state)));
}

/* ---------- BENCHMARK ---------- */
function computeAverage(rows) {
    const avg = k => {
        const v = rows.map(r => num(r[k])).filter(x => x > 0);
        return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
    };
    return {
        ipc: avg("Rate of Cognizable Crimes (IPC) (2022)"),
        murder: avg("murder_rate_2022"),
        charge: avg("Chargesheeting Rate (2022)")
    };
}

function getBenchmarkForState(state) {
    const row = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    if (!row) return null;

    const mode = document.getElementById("benchmarkMode")?.value;

    if (mode === "cluster")
        return computeAverage(
            crimeData.filter(d => getCluster(d) === getCluster(row))
        );

    if (mode === "peers")
        return computeAverage(
            crimeData.filter(d =>
                Math.abs(
                    num(d["Rate of Cognizable Crimes (IPC) (2022)"]) -
                    num(row["Rate of Cognizable Crimes (IPC) (2022)"])
                ) <= 50
            )
        );

    return computeAverage(
        crimeData.filter(
            d => d.state_ut && !d.state_ut.toLowerCase().includes("total")
        )
    );
}

/* ---------- FEATURE 1: STATE vs BENCHMARK ---------- */
let benchmarkBarChart = null;

function percentDelta(a, b) {
    if (!b) return "—";
    return (((a - b) / b) * 100).toFixed(1) + "%";
}

function updateStateVsBenchmarkChart() {
    if (!isComparisonActive()) return;

    const state = document.getElementById("comparisonStateSelect")?.value;
    const row = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    const bench = getBenchmarkForState(state);
    if (!row || !bench) return;

    const stateVals = [
        num(row["Rate of Cognizable Crimes (IPC) (2022)"]),
        num(row["murder_rate_2022"]),
        num(row["Chargesheeting Rate (2022)"])
    ];
    const benchVals = [bench.ipc, bench.murder, bench.charge];

    if (benchmarkBarChart) benchmarkBarChart.destroy();

    benchmarkBarChart = new Chart(
        document.getElementById("benchmarkBarChart"),
        {
            type: "bar",
            data: {
                labels: ["IPC Crime Rate", "Murder Rate", "Chargesheeting %"],
                datasets: [
                    { label: state, data: stateVals, backgroundColor: "#0b3c5d" },
                    { label: "Benchmark", data: benchVals, backgroundColor: "#b0c4d8" }
                ]
            },
            options: {
                responsive: true,
                plugins: { legend: { position: "bottom" } }
            }
        }
    );

    document.getElementById("delta-ipc").innerText = percentDelta(stateVals[0], benchVals[0]);
    document.getElementById("delta-murder").innerText = percentDelta(stateVals[1], benchVals[1]);
    document.getElementById("delta-charge").innerText = percentDelta(stateVals[2], benchVals[2]);

    generateComparisonInsight();
    updateCompositeIndex();
}

/* ---------- FEATURE 2: MULTI-STATE COMPARISON ---------- */
let multiStateChart = null;

function updateMultiStateComparison() {
    if (!isComparisonActive()) return;

    const canvas = document.getElementById("multiStateBarChart");
    if (!canvas) return;

    const selected = Array.from(
        document.getElementById("multiStateSelect")?.selectedOptions || []
    ).map(o => o.value);

    if (selected.length < 2) {
        if (multiStateChart) multiStateChart.destroy();
        return;
    }

    const rows = selected
        .map(s =>
            crimeData.find(
                d => standardizeState(d.state_ut) === standardizeState(s)
            )
        )
        .filter(Boolean);

    if (multiStateChart) multiStateChart.destroy();

    multiStateChart = new Chart(canvas, {
        type: "bar",
        data: {
            labels: rows.map(r => r.state_ut),
            datasets: [
                {
                    label: "IPC Crime Rate",
                    data: rows.map(r => num(r["Rate of Cognizable Crimes (IPC) (2022)"])),
                    backgroundColor: "#d73027"
                },
                {
                    label: "Murder Rate",
                    data: rows.map(r => num(r["murder_rate_2022"])),
                    backgroundColor: "#fc8d59"
                },
                {
                    label: "Chargesheeting %",
                    data: rows.map(r => num(r["Chargesheeting Rate (2022)"])),
                    backgroundColor: "#91cf60"
                }
            ]
        },
        options: {
            responsive: true,
            plugins: { legend: { position: "bottom" } },
            scales: { y: { beginAtZero: true } }
        }
    });
}

/* ---------- FEATURE 3: COMPOSITE CRIME INDEX ---------- */
function updateCompositeIndex() {
    const state = document.getElementById("comparisonStateSelect")?.value;
    const rows = crimeData.filter(
        d => d.state_ut && !d.state_ut.toLowerCase().includes("total")
    );

    const mm = k => ({
        min: Math.min(...rows.map(r => num(r[k]))),
        max: Math.max(...rows.map(r => num(r[k])))
    });

    const ipcMM = mm("Rate of Cognizable Crimes (IPC) (2022)");
    const murderMM = mm("murder_rate_2022");
    const chargeMM = mm("Chargesheeting Rate (2022)");

    const r = rows.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    if (!r) return;

    const ipcScore =
        100 * (ipcMM.max - num(r["Rate of Cognizable Crimes (IPC) (2022)"])) /
        (ipcMM.max - ipcMM.min);

    const murderScore =
        100 * (murderMM.max - num(r["murder_rate_2022"])) /
        (murderMM.max - murderMM.min);

    const chargeScore =
        100 * (num(r["Chargesheeting Rate (2022)"]) - chargeMM.min) /
        (chargeMM.max - chargeMM.min);

    const index = Math.round(
        0.4 * ipcScore + 0.3 * murderScore + 0.3 * chargeScore
    );

    document.getElementById("comparisonInsightText").innerHTML += `
        <br><br>
        <strong>Composite Crime Index:</strong>
        <span style="font-weight:700;"> ${index} / 100</span>
    `;
}

/* ---------- FEATURE 4: POLICY INSIGHTS ---------- */
function generateComparisonInsight() {
    const state = document.getElementById("comparisonStateSelect")?.value;
    const row = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    const bench = getBenchmarkForState(state);
    const box = document.getElementById("comparisonInsightText");
    if (!row || !bench || !box) return;

    box.innerHTML = `
        <strong>${state} – Policy Interpretation (2022)</strong><br><br>
        IPC crime pressure is ${num(row["Rate of Cognizable Crimes (IPC) (2022)"]) > bench.ipc ? "above" : "below"} benchmark.
        Murder trends are ${num(row["murder_rate_2022"]) > bench.murder ? "concerning" : "relatively controlled"}.
        Chargesheeting performance is ${num(row["Chargesheeting Rate (2022)"]) < bench.charge ? "weaker" : "stronger"}.
    `;
}

/* ---------- EVENTS ---------- */
document.getElementById("benchmarkMode")
    ?.addEventListener("change", updateStateVsBenchmarkChart);

document.getElementById("comparisonStateSelect")
    ?.addEventListener("change", () => {
        refreshMultiStateOptions();
        updateStateVsBenchmarkChart();
        updateMultiStateComparison();
    });

document.getElementById("multiStateSelect")
    ?.addEventListener("change", updateMultiStateComparison);

/* ---------- TAB ACTIVATION ---------- */
function onComparisonTabActivated() {
    populateComparisonDropdowns();

    setTimeout(() => {
        updateStateVsBenchmarkChart();
        updateMultiStateComparison();
    }, 300);
}
