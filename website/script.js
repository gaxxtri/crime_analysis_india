/************************************************
 * GLOBAL STATE
 ************************************************/
let crimeData = [];
let map, geojsonLayer;
let legend;

/************************************************
 * HELPERS
 ************************************************/
function normalize(s) {
    return s?.toLowerCase()
        .replace(/&/g, "and")
        .replace(/\s+/g, " ")
        .trim();
}

/* ---------- STATE NAME FIX ---------- */
const STATE_FIX = {
    "tamilnadu": "tamil nadu",
    "telengana": "telangana",
    "chhattishgarh": "chhattisgarh",
    "andaman & nicobar": "andaman and nicobar islands",
    "andaman and nicobar": "andaman and nicobar islands",
    "dadra & nagar haveli and daman & diu":
        "dadra and nagar haveli and daman and diu",
    "nct of delhi": "delhi",
    "jammu & kashmir": "jammu and kashmir",
    "odisha": "orissa",
    "puducherry": "pondicherry"
};

function standardizeState(name) {
    const n = normalize(name);
    return STATE_FIX[n] || n;
}

/************************************************
 * COMPARISON SUBTITLE (FEATURE 1)
 ************************************************/
function updateComparisonSubtitle() {
    const state =
        document.getElementById("stateSelect")?.value || "Selected State";

    const mode =
        document.getElementById("benchmarkMode")?.value || "national";

    let benchmarkText =
        mode === "national"
            ? "National Average"
            : mode === "cluster"
            ? "Cluster Average"
            : "Peer States (Similar IPC)";

    document.getElementById("comparisonSubtitle").innerHTML =
        `Comparing <strong>${state}</strong> with ${benchmarkText} (2022)`;
}
/************************************************
 * BENCHMARK COMPUTATION (FEATURE 2)
 ************************************************/

/* --- NATIONAL AVERAGE --- */
function getNationalBenchmark() {
    // Prefer explicit All India row if present
    const indiaRow = crimeData.find(d =>
        d.state_ut && d.state_ut.toLowerCase().includes("india")
    );

    if (indiaRow) return indiaRow;

    // Fallback: mean of all states
    const states = crimeData.filter(
        d => d.state_ut && !d.state_ut.toLowerCase().includes("total")
    );

    return computeAverage(states);
}

/* --- CLUSTER AVERAGE --- */
function getClusterBenchmark(selectedRow) {
    const cluster = getCluster(selectedRow);

    const clusterStates = crimeData.filter(d =>
        d.state_ut &&
        getCluster(d) === cluster
    );

    return computeAverage(clusterStates);
}

/* --- PEER STATES (±50 IPC) --- */
function getPeerBenchmark(selectedRow) {
    const ipc = Number(selectedRow["Rate of Cognizable Crimes (IPC) (2022)"]);

    const peers = crimeData.filter(d => {
        const v = Number(d["Rate of Cognizable Crimes (IPC) (2022)"]);
        return (
            d.state_ut &&
            Math.abs(v - ipc) <= 50 &&
            standardizeState(d.state_ut) !== standardizeState(selectedRow.state_ut)
        );
    });

    return peers.length ? computeAverage(peers) : null;
}

/* --- GENERIC AVERAGE CALCULATOR --- */
function computeAverage(rows) {
    const avg = (key) => {
        const vals = rows
            .map(r => Number(r[key]))
            .filter(v => !isNaN(v));
        return vals.length
            ? vals.reduce((a, b) => a + b, 0) / vals.length
            : null;
    };

    return {
        ipc: avg("Rate of Cognizable Crimes (IPC) (2022)"),
        murder: avg("murder_rate_2022"),
        charge: avg("Chargesheeting Rate (2022)")
    };
}
function getBenchmarkForState(state) {
    const selectedRow = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    if (!selectedRow) return null;

    const mode = document.getElementById("benchmarkMode").value;

    if (mode === "national") {
        return getNationalBenchmark();
    }

    if (mode === "cluster") {
        return getClusterBenchmark(selectedRow);
    }

    if (mode === "peers") {
        return getPeerBenchmark(selectedRow);
    }

    return null;
}

/************************************************
 * LOAD DATA
 ************************************************/
fetch("data/master.csv")
    .then(r => r.text())
    .then(csv => {
        crimeData = Papa.parse(csv, {
            header: true,
            dynamicTyping: true,
            skipEmptyLines: true
        }).data;

        populateDropdown();
        initMap();
        updateKPIs("Delhi");
        updateComparisonSubtitle();
    })
    .catch(err => console.error("CSV load error:", err));

/************************************************
 * DROPDOWN
 ************************************************/
function populateDropdown() {
    const select = document.getElementById("stateSelect");
    select.innerHTML = "";

    crimeData
        .map(d => d.state_ut)
        .filter(s => s && !s.toLowerCase().includes("total"))
        .forEach(s => {
            const o = document.createElement("option");
            o.value = s;
            o.text = s;
            select.appendChild(o);
        });

    select.value = "Delhi";

    select.onchange = () => {
        updateKPIs(select.value);
        updateComparisonSubtitle();
    };

    document.getElementById("benchmarkMode").onchange = () => {
        updateComparisonSubtitle();
    };
}

/************************************************
 * KPI UPDATE
 ************************************************/
function updateKPIs(state) {
    const r = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    if (!r) return;

    document.getElementById("kpi-ipc").innerText =
        r["Rate of Cognizable Crimes (IPC) (2022)"] ?? "—";

    document.getElementById("kpi-murder").innerText =
        r["murder_rate_2022"]
            ? `${r["murder_rate_2022"].toFixed(2)} / lakh`
            : "—";

    document.getElementById("kpi-charge").innerText =
        r["Chargesheeting Rate (2022)"] !== undefined
            ? `${r["Chargesheeting Rate (2022)"].toFixed(1)} %`
            : "—";

    const recoveryKey = Object.keys(r).find(
        k => k.toLowerCase().includes("recovery") &&
             k.toLowerCase().includes("percent")
    );

    document.getElementById("kpi-kidnap").innerText =
        recoveryKey && r[recoveryKey] !== null
            ? `${Number(r[recoveryKey]).toFixed(1)} %`
            : "Not Available";

    document.getElementById("kpi-cluster").innerText = getCluster(r);
}

/************************************************
 * CLUSTER + POLICY LOGIC
 ************************************************/
function getCluster(r) {
    const ipc = Number(r["Rate of Cognizable Crimes (IPC) (2022)"]);
    const urban = Number(r["urbanization_rate_2011"]);
    const murder = Number(r["murder_rate_2022"]);

    if (ipc > 700 && urban > 40 && murder > 3)
        return "Very High Crime & Urban Stress";
    if (ipc > 500 && (urban > 30 || murder > 2))
        return "High Crime Pressure";
    if (ipc > 300)
        return "Moderate Crime Risk";
    return "Low Crime Stable";
}

function clusterColor(c) {
    return c === "Very High Crime & Urban Stress" ? "#67000d" :
           c === "High Crime Pressure" ? "#cb181d" :
           c === "Moderate Crime Risk" ? "#fdae61" :
           "#1a9850";
}

function policyPriority(r) {
    const ipc = Number(r["Rate of Cognizable Crimes (IPC) (2022)"]);
    const charge = Number(r["Chargesheeting Rate (2022)"]);
    const murder = Number(r["murder_rate_2022"]);

    if (ipc > 600 && charge < 60 && murder > 3) return "Critical Priority";
    if (ipc > 400 && charge < 70) return "High Priority";
    if (ipc > 250) return "Moderate Priority";
    return "Low Priority";
}

function policyColor(p) {
    return p === "Critical Priority" ? "#7f0000" :
           p === "High Priority" ? "#d7301f" :
           p === "Moderate Priority" ? "#fc8d59" :
           "#1a9850";
}

/************************************************
 * COLOR SCALES
 ************************************************/
function ipcColor(v) {
    return v > 700 ? "#800026" :
           v > 500 ? "#BD0026" :
           v > 300 ? "#E31A1C" :
           v > 150 ? "#FD8D3C" :
                     "#FED976";
}

function murderColor(v) {
    return v > 6 ? "#67000d" :
           v > 4 ? "#a50f15" :
           v > 2 ? "#cb181d" :
           v > 1 ? "#fb6a4a" :
                   "#fee5d9";
}

function chargeColor(v) {
    if (v === null || isNaN(v)) return "#cccccc";
    return v > 90 ? "#08306b" :
           v > 80 ? "#2171b5" :
           v > 70 ? "#6baed6" :
           v > 60 ? "#c6dbef" :
                    "#f7fbff";
}

function kidnapColor(v) {
    if (v === null || v === undefined) return "#cccccc";
    return v > 90 ? "#00441b" :
           v > 75 ? "#238b45" :
           v > 60 ? "#66c2a4" :
           v > 40 ? "#ccece6" :
                    "#f7fcfd";
}

/************************************************
 * MAP INIT
 ************************************************/
function initMap() {
    map = L.map("map").setView([22.5, 80], 5);

    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
        attribution: "&copy; OpenStreetMap contributors"
    }).addTo(map);

    fetch("data/india_states.geojson")
        .then(r => r.json())
        .then(geo => {
            geojsonLayer = L.geoJson(geo, {
                style,
                onEachFeature
            }).addTo(map);
            updateLegend();
        });

    document.getElementById("mapMode").onchange = () => {
        geojsonLayer.setStyle(style);
        updateLegend();
    };
}

/************************************************
 * MAP STYLE + TOOLTIP
 ************************************************/
function style(feature) {
    const state = feature.properties.Name;
    const r = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );
    if (!r) return { fillColor: "#ccc", weight: 1, fillOpacity: 0.4 };

    const mode = document.getElementById("mapMode").value;
    const ipc = Number(r["Rate of Cognizable Crimes (IPC) (2022)"]);
    const murder = Number(r["murder_rate_2022"]);
    const charge = Number(r["Chargesheeting Rate (2022)"]);

    const recoveryKey = Object.keys(r).find(
        k => k.toLowerCase().includes("recovery") &&
             k.toLowerCase().includes("percent")
    );
    const kidnap = recoveryKey ? Number(r[recoveryKey]) : null;

    let fill =
        mode === "ipc" ? ipcColor(ipc) :
        mode === "murder" ? murderColor(murder) :
        mode === "charge" ? chargeColor(charge) :
        mode === "kidnap" ? kidnapColor(kidnap) :
        mode === "cluster" ? clusterColor(getCluster(r)) :
        policyColor(policyPriority(r));

    return { fillColor: fill, weight: 1, fillOpacity: 0.75 };
}

function onEachFeature(feature, layer) {
    const state = feature.properties.Name;

    layer.on({
        click: () => {
            updateKPIs(state);
            document.getElementById("stateSelect").value = state;
            updateComparisonSubtitle();
        }
    });

    const r = crimeData.find(
        d => standardizeState(d.state_ut) === standardizeState(state)
    );

    layer.bindTooltip(
        `<strong>${state}</strong><br>
         IPC: ${r?.["Rate of Cognizable Crimes (IPC) (2022)"] ?? "NA"}<br>
         Murder: ${r?.["murder_rate_2022"] ?? "NA"}<br>
         Chargesheeting: ${r?.["Chargesheeting Rate (2022)"] ?? "NA"}%`,
        { sticky: true }
    );
}

/************************************************
 * LEGEND
 ************************************************/
legend = L.control({ position: "bottomright" });

function updateLegend() {
    legend.remove();

    legend.onAdd = function () {
        const div = L.DomUtil.create("div", "legend");
        const mode = document.getElementById("mapMode").value;

        let labels = [], colors = [], title = "";

        if (mode === "ipc") {
            title = "IPC Crime Rate";
            labels = [0,150,300,500,700];
            colors = labels.map(l => ipcColor(l+1));
        } else if (mode === "murder") {
            title = "Murder Rate";
            labels = [0,1,2,4,6];
            colors = labels.map(l => murderColor(l+0.1));
        } else if (mode === "charge") {
            title = "Chargesheeting %";
            labels = [0,35,50,65,80];
            colors = labels.map(l => chargeColor(l+1));
        } else if (mode === "kidnap") {
            title = "Kidnapping Recovery %";
            labels = [0,40,60,75,90];
            colors = labels.map(l => kidnapColor(l+1));
        } else if (mode === "cluster") {
            title = "Crime Cluster";
            labels = [
                "Very High Crime",
                "High Crime",
                "Moderate Crime",
                "Low Crime"
            ];
            colors = labels.map(l => clusterColor(l));
        } else {
            title = "Policy Priority";
            labels = [
                "Critical Priority",
                "High Priority",
                "Moderate Priority",
                "Low Priority"
            ];
            colors = labels.map(l => policyColor(l));
        }

        div.innerHTML = `<strong>${title}</strong><br>`;
        labels.forEach((l,i)=>{
            div.innerHTML += `<i style="background:${colors[i]}"></i> ${l}<br>`;
        });

        return div;
    };

    legend.addTo(map);
}
/************************************************
 * TAB SWITCHING LOGIC (FIX)
 ************************************************/
function openTab(tabId, event) {
    // Hide all tabs
    document.querySelectorAll(".tab-content").forEach(tab => {
        tab.classList.remove("active");
    });

    // Remove active state from all buttons
    document.querySelectorAll(".tab-button").forEach(btn => {
        btn.classList.remove("active");
    });

    // Show selected tab
    document.getElementById(tabId).classList.add("active");

    // Activate clicked button
    event.currentTarget.classList.add("active");
    
    // Resize map properly when switching to overview
    if (tabId === "overview" && map) {
        setTimeout(() => {
            map.invalidateSize();
        }, 200);
    }
    // ✅ ADD THIS PART (Feature 3 trigger)
    if (tabId === "comparison" && typeof onComparisonTabActivated === "function") {
        onComparisonTabActivated();
    }
}
/************************************************
 * POLICY MAPS (STATIC, DASHBOARD-GRADE)
 * Used ONLY in the "Maps" tab
 ************************************************/

const policyMaps = {
    ipc_rate: {
        title: "IPC Crime Rate by State",
        image: "maps/ipc_rate.png",
        insight:
            "Persistently high IPC crime rates are observed across several northern and central states, suggesting structural and socio-economic risk factorsrather than short-term or event-driven crime fluctuations.",
        implications: [
            "Prioritise long-term preventive interventions alongside routine law enforcement.",
            "Integrate crime prevention with social welfare, education, and employment programmes.",
            "Strengthen institutional capacity at the district and state levels."
        ]
    },

    murder_rate: {
        title: "Murder Rate Across Indian States",
        image: "maps/murder_rate.png",
        insight:
            "Elevated murder rates are concentrated in a limited number of states and do not uniformly align with overall IPC crime intensity.",
        implications: [
            "Design targeted strategies for violent crime reduction.",
            "Address local conflict drivers and organised crime networks.",
            "Enhance intelligence-led policing in high-severity regions."
        ]
    },

    chargesheet_efficiency: {
        title: "Chargesheet Completion Efficiency",
        image: "maps/chargesheet_efficiency.png",
        insight:
            "Several states with high registered crime levels display comparatively low chargesheet completion rates , indicating investigation and case-processing constraints.",
        implications: [
            "Invest in investigative training and forensic infrastructure.",
            "Reduce procedural delays through standardised timelines.",
            "Improve coordination between police and prosecution agencies."
        ]
    },

    conviction_gap: {
        title: "Conviction Gap Across States",
        image: "maps/conviction_gap.png",
        insight:
            "Significant conviction gaps persist across multiple regions, reflecting judicial inefficiencies within judicial processes.",
        implications: [
            "Strengthen case tracking and judicial workload management.",
            "Expand fast-track courts for serious and high-volume offences.",
            "Improve evidence quality and witness protection mechanisms."
        ]
    },

    urban_rural: {
        title: "Urban–Rural Crime Distribution",
        image: "maps/urban_rural.png",
        insight:
            "Urban areas record higher crime density, while rural regions show lower reported rates due to reporting access differences.",
        implications: [
            "Adopt differentiated policing strategies for urban and rural areas.",
            "Improve crime reporting accessibility in rural regions.",
            "Expand community policing and victim outreach programmes."
        ]
    },

    crime_clusters: {
        title: "State-Level Crime Risk Clusters",
        image: "maps/crime_clusters.png",
        insight:
            "Crime–justice clustering identifies states where high crime coincides with weaker justice outcomes.",
        implications: [
            "Use cluster-based targeting for policy prioritisation.",
            "Coordinate reforms across policing, prosecution, and judiciary.",
            "Allocate resources based on composite risk profiles."
        ]
    }
};


function updatePolicyMap() {
    const select = document.getElementById("mapSelect");
    if (!select) return;

    const data = policyMaps[select.value];
    if (!data) return;

    document.getElementById("policyMapTitle").innerText = data.title;
    document.getElementById("policyMapImage").src = data.image;
    document.getElementById("policyMapInsight").innerText = data.insight;

    const ul = document.getElementById("policyImplications");
    ul.innerHTML = "";
    data.implications.forEach(item => {
        const li = document.createElement("li");
        li.innerText = item;
        ul.appendChild(li);
    });
}
/************************************************
 * POLICY CHARTS (STATIC, POLICY-GRADE)
 * Used inside the "Maps" tab → Analytical Charts
 ************************************************/

const policyCharts = {
    top_ipc_states: {
        title: "Top 10 States by IPC Crimes",
        image: "charts/states_IPC.png",
        insight:
            "A small number of states contribute disproportionately to total IPC crime volume, reflecting concentrated governance and enforcement pressure in specific regions.",
        implications: [
            "Prioritise resource allocation to high-burden states.",
            "Strengthen district-level policing capacity in populous regions.",
            "Adopt differentiated strategies for high-volume crime states."
        ]
    },

    ipc_trends: {
        title: "IPC Crime Trends (2020–2022)",
        image: "charts/ipc_trend.png",
        insight:
            "IPC crime trends across major states remain structurally stable over time, indicating persistent systemic drivers rather than temporary fluctuations.",
        implications: [
            "Focus on long-term crime prevention strategies.",
            "Track multi-year performance benchmarks.",
            "Align crime policy with socio-economic planning cycles."
        ]
    },
//tree
    ipc_treemap: {
         title: "IPC Crime Concentration Across Top States",
         image: "charts/tree.png",
        insight:
             "IPC crime burden is heavily concentrated among a small group of states, with a few regions accounting for a dominant share of national crime volume.",
         implications: [
             "Adopt targeted national crime reduction strategies focused on high-burden states.",
             "Prioritise fiscal and institutional support to states with concentrated crime loads.",
             "Use crime concentration metrics for inter-state resource allocation."
        ]
    },
    crime_share: {
        title: "Share of IPC Crimes: Top States vs Others",
        image: "charts/pie.png",
        insight:
            "More than half of IPC crimes are concentrated in a limited number of states, highlighting uneven crime distribution nationwide.",
        implications: [
            "Adopt targeted funding models instead of uniform allocation.",
            "Focus national crime strategies on hotspot states.",
            "Improve inter-state capacity balancing."
        ]
    },

    urban_vs_ipc: {
        title: "Urbanization vs IPC Crime Rate",
        image: "charts/urb_vs_ipc.png",
        insight:
            "Higher levels of urbanization are generally associated with increased registered crime rates, reflecting density effects and reporting access.",
        implications: [
            "Strengthen urban policing infrastructure.",
            "Address migration-driven urban vulnerabilities.",
            "Expand surveillance and situational crime prevention."
        ]
    },

    charge_vs_ipc: {
        title: "Chargesheeting vs IPC Crime Rate",
        image: "charts/chargesheeting.png",
        insight:
            "High crime rates do not consistently correspond with higher chargesheeting efficiency, indicating investigation bottlenecks in high-pressure states.",
        implications: [
            "Enhance investigative staffing in high-crime regions.",
            "Reduce case backlogs through process optimisation.",
            "Improve police–prosecution coordination."
        ]
    },

    ipc_urban_dist: {
        title: "IPC Crime Distribution by Urbanization",
        image: "charts/urban_distri.png",
        insight:
            "Urban states display wider and higher crime rate distributions, while rural regions show lower but more compressed reported crime ranges.",
        implications: [
            "Adopt differentiated policing strategies by settlement type.",
            "Improve crime reporting accessibility in rural regions.",
            "Tailor enforcement models to spatial context."
        ]
    },
//radar
    state_radar: {
        title: "State Crime Profile: Multi-Dimensional Indicator View",
        image: "charts/radar.png",
        insight:
              "State-level crime profiles reveal imbalances across crime intensity, justice efficiency, and socio-demographic indicators, underscoring uneven governance outcomes.",
        implications: [
            "Use radar-based profiling for state-specific policy diagnostics.",
            "Identify mismatches between crime burden and justice capacity.",
            "Support customised reform strategies instead of uniform interventions."
        ]
    },

//corr
    crime_correlation: {
        title: "Correlation Between Crime, Demographic and Justice Indicators",
        image: "charts/correl.png",
        insight:
             "Crime rates exhibit moderate correlation with urbanisation and literacy, while chargesheeting efficiency shows a weak or negative association with crime intensity.",
        implications: [
             "Avoid single-factor explanations for crime dynamics.",
             "Design multi-dimensional crime prevention policies.",
             "Use composite indicators for crime risk and justice performance assessment."
        ]
    },


    ipc_vs_murder: {
        title: "IPC Crime Rate vs Murder Rate",
        image: "charts/ipc_vs_murder.png",
        insight:
            "States with high IPC crime rates do not always exhibit high murder rates, indicating distinct dynamics for violent crime.",
        implications: [
            "Separate strategies for volume crime and violent crime.",
            "Deploy specialised units for violent crime prevention.",
            "Use severity-based crime classification in planning."
        ]
    }
};


/************************************************
 * UPDATE CHART HANDLER
 ************************************************/
function updatePolicyChart() {
    const select = document.getElementById("chartSelect");
    if (!select) return;

    const data = policyCharts[select.value];
    if (!data) return;

    document.getElementById("policyChartTitle").innerText = data.title;
    document.getElementById("policyChartImage").src = data.image;
    document.getElementById("policyChartImage").alt = data.title;
    document.getElementById("policyChartInsight").innerText = data.insight;

    const ul = document.getElementById("policyChartImplications");
    ul.innerHTML = "";

    data.implications.forEach(item => {
        const li = document.createElement("li");
        li.innerText = item;
        ul.appendChild(li);
    });
}


/************************************************
 * DEFAULT LOAD
 ************************************************/
document.addEventListener("DOMContentLoaded", () => {
    if (document.getElementById("chartSelect")) {
        updatePolicyChart();
    }
});
