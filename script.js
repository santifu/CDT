// Variable global para controlar la instancia del gráfico
let network = null;
let currentDayIndex = 0; // 0-based index for array of saved days
let savedTimeline = [];  // Array of day objects

const TAG_COLORS = {
    PEOPLE: '#ff6b6b',
    TOOLS: '#ffcc00',
    ARTIFACTS: '#ff9f43'
};

document.addEventListener('DOMContentLoaded', () => {
    // 0. Renderizar Tags
    renderTags();

    // 1. Cargar Datos Guardados (LocalStorage)
    loadTimeline();

    // 2. Configurar Botones del Timeline y Slider
    document.getElementById('btnPrevDay').addEventListener('click', () => changeDay(-1));
    document.getElementById('btnNextDay').addEventListener('click', () => changeDay(1));
    document.getElementById('timelineSlider').addEventListener('input', (e) => jumpToDay(parseInt(e.target.value)));

    document.getElementById('btnSaveCheckpoint').addEventListener('click', saveCurrentDay);
    document.getElementById('btnClearData').addEventListener('click', clearAllData);

    // 3. Configurar hora por defecto
    if (savedTimeline.length === 0) setTimeNow();

    // 4. Configurar sliders (UI)
    const sliders = document.querySelectorAll('.dist-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const labelSpan = e.target.parentElement.querySelector('.range-val');
            if (labelSpan) labelSpan.textContent = e.target.value;
        });
    });

    // 5. Configurar Botones de Descarga
    document.getElementById('btnJson').addEventListener('click', exportToJSON);
    document.getElementById('btnCsv').addEventListener('click', exportToCSV);

    // 6. Init Live Preview
    initLivePreview();
});

function setTimeNow() {
    const now = new Date();
    document.getElementById('time').value = now.toTimeString().split(' ')[0].substring(0, 5);
}

// --- TIMELINE LOGIC ---

function loadTimeline() {
    const json = localStorage.getItem('project_timeline');
    if (json) {
        savedTimeline = JSON.parse(json);
        // Si hay datos, cargar el último día guardado
        if (savedTimeline.length > 0) {
            currentDayIndex = savedTimeline.length - 1;
            loadDayIntoForm(savedTimeline[currentDayIndex]);
        }
    } else {
        savedTimeline = [];
        document.getElementById('day').value = 1;
    }
    updateTimelineUI();
}

function saveCurrentDay() {
    const data = getFormData();

    const existingIndex = savedTimeline.findIndex(d => d.day === data.day);

    if (existingIndex >= 0) {
        savedTimeline[existingIndex] = data;
    } else {
        savedTimeline.push(data);
        savedTimeline.sort((a, b) => a.day - b.day);
        currentDayIndex = savedTimeline.findIndex(d => d.day === data.day);
    }

    localStorage.setItem('project_timeline', JSON.stringify(savedTimeline));
    updateTimelineUI();
}

function changeDay(delta) {
    const possibleNewIndex = currentDayIndex + delta;
    jumpToDay(possibleNewIndex);
}

function jumpToDay(index) {
    // Validar límites
    if (index < 0) return; // No ir antes de 0
    if (index > savedTimeline.length) return; // No saltar más allá de "New Day"

    currentDayIndex = index;

    if (currentDayIndex < savedTimeline.length) {
        // Cargar día existente
        loadDayIntoForm(savedTimeline[currentDayIndex]);
    } else {
        // Ir a "Nuevo Día"
        const nextDayNum = savedTimeline.length > 0 ? savedTimeline[savedTimeline.length - 1].day + 1 : 1;
        clearFormForNewDay(nextDayNum);
    }

    updateTimelineUI();

    // Forzar actualización del grafo
    const data = getFormData();
    updateJsonPreview(data);
    updateNetworkGraph(data);
}

function updateTimelineUI() {
    const slider = document.getElementById('timelineSlider');
    const label = document.getElementById('currentDayLabel');

    // El slider va de 0 a savedTimeline.length (donde length = New Day)
    slider.max = savedTimeline.length;
    slider.value = currentDayIndex;

    if (currentDayIndex < savedTimeline.length) {
        label.textContent = `Day ${savedTimeline[currentDayIndex].day} (Saved)`;
    } else {
        label.textContent = `New Day`;
    }

    document.getElementById('btnPrevDay').disabled = currentDayIndex <= 0;
    // Deshabilitar Next si ya estamos en "New Day" (el final)
    document.getElementById('btnNextDay').disabled = currentDayIndex >= savedTimeline.length;
}

function loadDayIntoForm(data) {
    document.getElementById('teamName').value = data.teamName;
    document.getElementById('day').value = data.day;
    document.getElementById('time').value = data.time;

    const map = { 'D': 'phase-D', 'C': 'phase-C', 'P': 'phase-P', 'O': 'phase-O' };

    for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        const containerId = map[phaseKey];
        const container = document.getElementById(containerId);

        // Sliders
        const slider = container.querySelector('[name="distributionLevel"]');
        slider.value = phaseData.distributionLevel;
        container.querySelector('.range-val').textContent = phaseData.distributionLevel;

        // Textarea
        container.querySelector('[name="narrative"]').value = phaseData.narrative;

        // Checkboxes
        container.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        const checkItems = (name, list) => {
            list.forEach(val => {
                const cb = container.querySelector(`input[name="${name}"][value="${val}"]`);
                if (cb) cb.checked = true;
            });
        };
        checkItems('people', phaseData.people);
        checkItems('tools', phaseData.tools);
        checkItems('artifacts', phaseData.artifacts);
    }
}

function clearFormForNewDay(nextDayNum) {
    document.getElementById('day').value = nextDayNum;
    setTimeNow();
    document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('textarea').forEach(t => t.value = '');
    document.querySelectorAll('.dist-slider').forEach(s => { s.value = 0; s.querySelector('span').textContent = "0"; s.dispatchEvent(new Event('input')); });
}

function clearAllData() {
    if (confirm("Are you sure you want to delete all saved history?")) {
        localStorage.removeItem('project_timeline');
        location.reload();
    }
}

// --- RENDERING TAGS ---
function renderTags() {
    const containers = document.querySelectorAll('.tag-container');
    containers.forEach(container => {
        const type = container.dataset.type;
        const fieldName = container.dataset.name;
        const items = TAGS[type] || [];

        items.forEach(item => {
            const label = document.createElement('label');
            label.style.display = 'inline-block';
            label.style.marginRight = '10px';
            label.style.cursor = 'pointer';

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.name = fieldName;
            checkbox.value = item;

            label.appendChild(checkbox);
            label.appendChild(document.createTextNode(' ' + item));
            container.appendChild(label);
        });
    });
}

// --- LIVE PREVIEW ---

function initLivePreview() {
    const form = document.getElementById('checkpointForm');
    const updateAll = () => {
        const data = getFormData();
        updateJsonPreview(data);
        updateNetworkGraph(data);
    };

    form.addEventListener('input', updateAll);
    form.addEventListener('change', updateAll);
    setTimeout(updateAll, 100);
}

function updateJsonPreview(data) {
    document.getElementById('jsonPreview').textContent = JSON.stringify(data, null, 2);
}

function updateNetworkGraph(data) {
    let nodes = [];
    let edges = [];
    let idCounter = 1;
    const globalTagMap = new Map();

    const teamNodeId = idCounter++;
    nodes.push({
        id: teamNodeId,
        label: data.teamName || "Team",
        color: '#4a90e2',
        shape: 'box',
        font: { color: 'white', size: 20 },
        value: 10,
        type: 'team'
    });

    const labels = { 'D': 'Design', 'C': 'Coding', 'P': 'Proto', 'O': 'Docs' };

    for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        const phaseNodeId = idCounter++;
        const level = phaseData.distributionLevel;
        const phaseColor = level > 0 ? '#50e3c2' : '#e0e0e0';

        nodes.push({
            id: phaseNodeId,
            label: `${labels[phaseKey]}\n(Lvl ${level})`,
            color: phaseColor,
            shape: 'ellipse',
            value: 5 + (level * 2),
            type: 'phase',
            phaseKey: phaseKey // Guardar key para buscar datos después
        });

        edges.push({ from: teamNodeId, to: phaseNodeId, length: 150 });

        const processTags = (list, color, emoji) => {
            list.forEach(tagName => {
                let tagNodeId;

                if (globalTagMap.has(tagName)) {
                    tagNodeId = globalTagMap.get(tagName);
                } else {
                    tagNodeId = idCounter++;
                    globalTagMap.set(tagName, tagNodeId);

                    nodes.push({
                        id: tagNodeId,
                        label: `${emoji} ${tagName}`,
                        shape: 'box',
                        color: { background: color, border: 'white' },
                        font: { size: 12 },
                        value: 1,
                        type: 'tag'
                    });
                }
                edges.push({ from: phaseNodeId, to: tagNodeId });

                const node = nodes.find(n => n.id === tagNodeId);
                if (node) node.value += 2;
            });
        };

        processTags(phaseData.people, TAG_COLORS.PEOPLE, '👤');
        processTags(phaseData.tools, TAG_COLORS.TOOLS, '🔧');
        processTags(phaseData.artifacts, TAG_COLORS.ARTIFACTS, '📦');
    }

    const container = document.getElementById('mynetwork');
    const visData = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };

    const options = {
        layout: { randomSeed: 2 },
        nodes: {
            scaling: {
                min: 10,
                max: 30,
                label: { enabled: true, min: 14, max: 24 }
            }
        },
        physics: {
            enabled: true,
            stabilization: false,
            barnesHut: { gravitationalConstant: -3000, springLength: 100 }
        }
    };

    if (network === null) {
        network = new vis.Network(container, visData, options);

        network.on('click', function (params) {
            if (params.nodes.length > 0) {
                const nodeId = params.nodes[0];
                const node = visData.nodes.get(nodeId);
                handleNodeClick(node);
            } else {
                document.getElementById('nodeHistoryPanel').style.display = 'none';
            }
        });

    } else {
        network.setData(visData);
    }
}

// --- CLICK HANDLERS ---
function handleNodeClick(node) {
    const panel = document.getElementById('nodeHistoryPanel');
    const content = document.getElementById('nodeHistoryContent');
    panel.style.display = 'block';

    if (node.type === 'phase') {
        // MOSTRAR NARRATIVA
        // Obtenemos datos actuales (form) o del historial según qué estemos viendo
        const currentData = getFormData(); // Siempre refleja lo que hay en los inputs
        // Buscar la fase correcta
        const pData = currentData.phases[node.phaseKey];
        const narrative = pData.narrative || "No narrative available for this phase.";

        content.innerHTML = `
            <h4>Narrative: ${node.label.split('\n')[0]}</h4>
            <div style="background:white; padding:10px; border-radius:4px; margin-top:5px;">
                <em>"${narrative}"</em>
            </div>
        `;

    } else if (node.type === 'tag') {
        // MOSTRAR HISTORIAL (Lógica anterior)
        showTagHistory(node.label, content);
    } else {
        content.innerHTML = `<p>Selected: <strong>${node.label}</strong></p>`;
    }
}

function showTagHistory(nodeLabelWithEmoji, container) {
    const rawTag = nodeLabelWithEmoji.replace(/^[^\w\s]+\s/, '');

    let html = `<h4>History for: ${rawTag}</h4>`;

    if (savedTimeline.length === 0) {
        html += `<p>No saved history yet.</p>`;
    } else {
        savedTimeline.forEach(day => {
            const uses = [];
            Object.entries(day.phases).forEach(([phaseKey, pData]) => {
                if (pData.people.includes(rawTag) ||
                    pData.tools.includes(rawTag) ||
                    pData.artifacts.includes(rawTag)) {
                    uses.push(phaseKey);
                }
            });

            if (uses.length > 0) {
                html += `
                <div class="history-item">
                    <span class="history-day">Day ${day.day}:</span> 
                    Used in phase(s) <strong>${uses.join(', ')}</strong>
                </div>`;
            }
        });
    }
    container.innerHTML = html;
}


// --- DATA EXTRACTION ---
function getFormData() {
    const teamName = document.getElementById('teamName').value.trim() || "UnknownTeam";
    const day = parseInt(document.getElementById('day').value) || 1;
    const time = document.getElementById('time').value;

    const phasesMap = { 'phase-D': 'D', 'phase-C': 'C', 'phase-P': 'P', 'phase-O': 'O' };
    const phasesData = {};

    for (const [htmlId, jsonKey] of Object.entries(phasesMap)) {
        const container = document.getElementById(htmlId);
        const getVal = (name) => container.querySelector(`[name="${name}"]`).value;
        const getCheckedVals = (name) => {
            const checkboxes = container.querySelectorAll(`input[name="${name}"]:checked`);
            return Array.from(checkboxes).map(cb => cb.value);
        };

        phasesData[jsonKey] = {
            distributionLevel: parseInt(getVal('distributionLevel')),
            people: getCheckedVals('people'),
            tools: getCheckedVals('tools'),
            artifacts: getCheckedVals('artifacts'),
            narrative: getVal('narrative').trim()
        };
    }

    return { teamName, day, time, phases: phasesData };
}

function exportToJSON() {
    const data = getFormData();
    const jsonStr = JSON.stringify(data, null, 2);
    downloadFile(jsonStr, `checkpoint-${data.teamName}-day${data.day}.json`, 'application/json');
}

function exportToCSV() {
    const data = getFormData();
    const csvRows = [['teamName', 'day', 'time', 'phase', 'distributionLevel', 'people', 'tools', 'artifacts', 'narrative']];

    for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        const row = [
            data.teamName, data.day, data.time, phaseKey,
            phaseData.distributionLevel,
            phaseData.people.join(';'),
            phaseData.tools.join(';'),
            phaseData.artifacts.join(';'),
            phaseData.narrative
        ];
        const escapedRow = row.map(field => {
            const str = String(field);
            return (str.includes(',') || str.includes('"') || str.includes('\n'))
                ? `"${str.replace(/"/g, '""')}"`
                : str;
        });
        csvRows.push(escapedRow.join(','));
    }
    downloadFile(csvRows.join('\n'), `checkpoint-${data.teamName}-day${data.day}.csv`, 'text/csv');
}

function downloadFile(content, fileName, contentType) {
    const blob = new Blob([content], { type: contentType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    window.URL.revokeObjectURL(url);
}