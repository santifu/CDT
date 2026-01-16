// Variable global para controlar la instancia del gráfico
let network = null;

document.addEventListener('DOMContentLoaded', () => {
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
    const inputs = form.querySelectorAll('input, textarea, select');
    inputs.forEach(input => {
        input.addEventListener('input', updateAll);
        input.addEventListener('change', updateAll); // Para sliders/selects
    });

    // Ejecutar una vez al inicio
    updateAll();
}

function updateJsonPreview(data) {
    const preview = document.getElementById('jsonPreview');
    preview.textContent = JSON.stringify(data, null, 2);
}

function updateNetworkGraph(data) {
    let nodes = [];
    let edges = [];
    let idCounter = 1;

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

        // Crear Nodos Hijos: Tools y Artifacts (si existen)
        const items = [
            ...phaseData.tools.map(t => ({ label: `🔧 ${t}`, color: '#ffcc00' })),
            ...phaseData.artifacts.map(a => ({ label: `📦 ${a}`, color: '#ff9f43' }))
        ];

        items.forEach(item => {
            const itemId = idCounter++;
            nodes.push({
                id: itemId,
                label: item.label,
                shape: 'box',
                color: { background: item.color, border: 'white' },
                font: { size: 12 }
            });
            edges.push({ from: phaseNodeId, to: itemId });
        });
    }

    // Renderizar con Vis.js
    const container = document.getElementById('mynetwork');
    const visData = {
        nodes: new vis.DataSet(nodes),
        edges: new vis.DataSet(edges)
    };

    const options = {
        layout: { randomSeed: 2 }, // Para mantener consistencia visual
        physics: {
            enabled: true,
            stabilization: false, // Animación continua
            barnesHut: { gravitationalConstant: -3000, springLength: 100 }
        }
    };

    if (network === null) {
        network = new vis.Network(container, visData, options);
    } else {
        // Solo actualizamos datos para no resetear zoom/posición
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
        const getVal = (name) => container.querySelector(`[name="${name}"]`).value;
        const splitStr = (str) => str.split(',').map(s => s.trim()).filter(s => s !== "");

        phasesData[jsonKey] = {
            distributionLevel: parseInt(getVal('distributionLevel')),
            people: splitStr(getVal('people')),
            tools: splitStr(getVal('tools')),
            artifacts: splitStr(getVal('artifacts')),
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