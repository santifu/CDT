// Variable global para controlar la instancia del gráfico
let network = null;

document.addEventListener('DOMContentLoaded', () => {
    // 0. Renderizar Tags desde tags.js global
    renderTags();

    // 1. Configurar hora por defecto
    const now = new Date();
    document.getElementById('time').value = now.toTimeString().split(' ')[0].substring(0, 5);

    // 2. Configurar listeners para sliders (actualizar número visual)
    const sliders = document.querySelectorAll('.dist-slider');
    sliders.forEach(slider => {
        slider.addEventListener('input', (e) => {
            const labelSpan = e.target.parentElement.querySelector('.range-val');
            if (labelSpan) labelSpan.textContent = e.target.value;
        });
    });

    // 3. Configurar Botones de Descarga
    document.getElementById('btnJson').addEventListener('click', exportToJSON);
    document.getElementById('btnCsv').addEventListener('click', exportToCSV);

    // 4. Iniciar la "Escucha en Vivo" para actualizar gráfico y JSON
    initLivePreview();
});

// --- LÓGICA DE RENDERIZADO DE TAGS ---
function renderTags() {
    // Buscamos todos los contenedores de tags
    const containers = document.querySelectorAll('.tag-container');

    containers.forEach(container => {
        const type = container.dataset.type; // PEOPLE, TOOLS, ARTIFACTS
        const fieldName = container.dataset.name; // people, tools, artifacts

        // Obtenemos la lista de tags desde la variable global TAGS (cargada desde tags.js)
        const items = TAGS[type] || [];

        // Creamos checkboxes
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


// --- LÓGICA DE ACTUALIZACIÓN EN TIEMPO REAL ---

function initLivePreview() {
    const form = document.getElementById('checkpointForm');

    // Función maestra que se ejecuta al teclear
    const updateAll = () => {
        const data = getFormData();
        updateJsonPreview(data);
        updateNetworkGraph(data);
    };

    // Escuchar cualquier cambio en el formulario
    // Inputs tradicionales + Checkboxes generados dinámicamente
    // Usamos delegación de eventos para capturar cambios en los nuevos checkboxes
    form.addEventListener('input', updateAll);
    form.addEventListener('change', updateAll);

    // Ejecutar una vez al inicio
    setTimeout(updateAll, 100); // Pequeño delay para asegurar renderizado
}

function updateJsonPreview(data) {
    const preview = document.getElementById('jsonPreview');
    preview.textContent = JSON.stringify(data, null, 2);
}

function updateNetworkGraph(data) {
    let nodes = [];
    let edges = [];
    let idCounter = 1;

    // Mapa para rastrear nodos de tags y no duplicarlos: "TagName" -> NodeID
    const globalTagMap = new Map();

    // NODO CENTRAL: Nombre del Equipo
    const teamNodeId = idCounter++;
    nodes.push({
        id: teamNodeId,
        label: data.teamName || "My Team",
        color: '#4a90e2',
        shape: 'box',
        font: { color: 'white', size: 20 }
    });

    // Iterar sobre las 4 fases
    const labels = { 'D': 'Design', 'C': 'Coding', 'P': 'Proto', 'O': 'Docs' };

    for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        // ID para el nodo de la fase
        const phaseNodeId = idCounter++;

        // Determinar tamaño/color basado en 'Distribution Level'
        const level = phaseData.distributionLevel;
        const phaseColor = level > 0 ? '#50e3c2' : '#e0e0e0';

        nodes.push({
            id: phaseNodeId,
            label: `${labels[phaseKey]}\n(Lvl ${level})`,
            color: phaseColor,
            shape: 'ellipse',
            value: level + 1 // Tamaño relativo
        });

        // Conectar Equipo -> Fase
        edges.push({ from: teamNodeId, to: phaseNodeId, length: 150 });

        // Helper para procesar items (tags)
        const processTags = (list, color, emoji) => {
            list.forEach(tagName => {
                let tagNodeId;

                // Verificar si ya existe el nodo para este tag
                if (globalTagMap.has(tagName)) {
                    tagNodeId = globalTagMap.get(tagName);
                } else {
                    // Crear nuevo nodo de tag
                    tagNodeId = idCounter++;
                    globalTagMap.set(tagName, tagNodeId);

                    nodes.push({
                        id: tagNodeId,
                        label: `${emoji} ${tagName}`,
                        shape: 'box',
                        color: { background: color, border: 'white' },
                        font: { size: 12 }
                    });
                }

                // Crear arista desde la Fase actual al Tag (ya sea nuevo o existente)
                edges.push({ from: phaseNodeId, to: tagNodeId });
            });
        };

        // Procesar Tools y Artifacts (y People)
        processTags(phaseData.people, '#ff6b6b', '👤');
        processTags(phaseData.tools, '#ffcc00', '🔧');
        processTags(phaseData.artifacts, '#ff9f43', '📦');
    }

    // Renderizar con Vis.js
    const container = document.getElementById('mynetwork');
    const visData = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };

    const options = {
        layout: { randomSeed: 2 },
        physics: {
            enabled: true,
            stabilization: false,
            barnesHut: { gravitationalConstant: -3000, springLength: 100 }
        }
    };

    if (network === null) {
        network = new vis.Network(container, visData, options);
    } else {
        network.setData(visData);
    }
}

// --- LÓGICA DE EXTRACCIÓN DE DATOS ---

function getFormData() {
    const teamName = document.getElementById('teamName').value.trim() || "UnknownTeam";
    const day = parseInt(document.getElementById('day').value) || 1;
    const time = document.getElementById('time').value;

    const phasesMap = { 'phase-D': 'D', 'phase-C': 'C', 'phase-P': 'P', 'phase-O': 'O' };
    const phasesData = {};

    for (const [htmlId, jsonKey] of Object.entries(phasesMap)) {
        const container = document.getElementById(htmlId);

        // Helper para obtener valor de text/range
        const getVal = (name) => container.querySelector(`[name="${name}"]`).value;

        // Helper para obtener valores de checkboxes seleccionados
        const getCheckedVals = (name) => {
            const checkboxes = container.querySelectorAll(`input[name="${name}"]:checked`);
            return Array.from(checkboxes).map(cb => cb.value);
        };

        phasesData[jsonKey] = {
            distributionLevel: parseInt(getVal('distributionLevel')),
            people: getCheckedVals('people'),     // ahora devuelve array
            tools: getCheckedVals('tools'),       // ahora devuelve array
            artifacts: getCheckedVals('artifacts'), // ahora devuelve array
            narrative: getVal('narrative').trim()
        };
    }

    return { teamName, day, time, phases: phasesData };
}

// --- LÓGICA DE DESCARGA (JSON/CSV) ---

function exportToJSON() {
    const data = getFormData();
    const jsonStr = JSON.stringify(data, null, 2);
    downloadFile(jsonStr, `checkpoint-${data.teamName}-day${data.day}.json`, 'application/json');
}

function exportToCSV() {
    const data = getFormData();
    const csvRows = [];
    csvRows.push(['teamName', 'day', 'time', 'phase', 'distributionLevel', 'people', 'tools', 'artifacts', 'narrative']);

    for (const [phaseKey, phaseData] of Object.entries(data.phases)) {
        const row = [
            data.teamName, data.day, data.time, phaseKey,
            phaseData.distributionLevel,
            phaseData.people.join(';'),
            phaseData.tools.join(';'),
            phaseData.artifacts.join(';'),
            phaseData.narrative
        ];
        // Escapar comillas para CSV válido
        const escapedRow = row.map(field => {
            const str = String(field);
            if (str.includes(',') || str.includes('"') || str.includes('\n')) {
                return `"${str.replace(/"/g, '""')}"`;
            }
            return str;
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