const FONT = "'Nunito', sans-serif";
const COLORES = { c1:'#f0a500', c2:'#e05c2a', c3:'#1a7fc1', c4:'#3a7d5a', c5:'#c8a96e' };

// SVG icons inline
const SVG_TICK = `<svg viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>`;
const SVG_CROSS = `<svg viewBox="0 0 12 12"><line x1="3" y1="3" x2="9" y2="9"/><line x1="9" y1="3" x2="3" y2="9"/></svg>`;

// Carga inicial
fetch('puntos_completos_interactivos.geojson')
  .then(r => r.json())
  .then(data => {
    const features = data.features;
    const rutasProps = features.map(f => f.properties);
    
    // 1. Renderizar Gráficos
    const statsGlobales = calcularStatsGlobales(rutasProps);
    renderGraficos(statsGlobales);
    
    // 2. Renderizar Tabla Clasificación (Card 1)
    inicializarClasificacion(features);

    document.getElementById('loader').classList.add('oculto');
    initDots();
  });

// --- LÓGICA DE LA TABLA (CARD 1) ---

function inicializarClasificacion(features) {
    const temporadasSet = new Set();
    features.forEach(f => temporadasSet.add(f.properties.temporada));
    
    // Ordenar temporadas descendente (más reciente primero)
    const temporadas = Array.from(temporadasSet).sort((a, b) => b.localeCompare(a));
    const select = document.getElementById('temporada-select');
    
    temporadas.forEach(t => {
        let opt = document.createElement('option');
        opt.value = t; opt.textContent = t;
        select.appendChild(opt);
    });

    select.addEventListener('change', (e) => renderTabla(features, e.target.value));
    renderTabla(features, temporadas[0]);
}

// Abrevia la primera palabra si el nombre tiene más de una palabra
// Ej: "Carlos M." → ya está bien | "Juan Antonio" → "J. Antonio" | "Carlos" → "Carlos"
function abreviarNombre(nombre) {
    const partes = nombre.trim().split(/\s+/);
    if (partes.length <= 1) return nombre;
    if (partes[0].includes('.')) return nombre;  // ya viene abreviado
    return partes[0][0].toUpperCase() + '. ' + partes.slice(1).join(' ');
}

function renderTabla(features, tempSel) {
    const rutasTemp = features.filter(f => f.properties.temporada === tempSel);
    
    // --- LÓGICA DE DÍAS (Para los últimos 5 días con actividad) ---
    // Agrupamos rutas por fecha exacta (sin la hora) — un día = una "jornada"
    const rutasPorFecha = {};
    rutasTemp.forEach(f => {
        const fecha = f.properties.fecha.split('T')[0];
        if (!rutasPorFecha[fecha]) rutasPorFecha[fecha] = [];
        rutasPorFecha[fecha].push(f);
    });

    // Obtenemos los últimos 5 DÍAS con actividad (orden cronológico)
    const fechasOrdenadas = Object.keys(rutasPorFecha).sort();
    const ultimas5Fechas = fechasOrdenadas.slice(-5);

    // Para cada uno de esos 5 días: qué senderistas participaron (en cualquier ruta de ese día)
    const participacionPorDia = ultimas5Fechas.map(fecha => {
        const nombresEnEsteDia = new Set();
        rutasPorFecha[fecha].forEach(ruta => {
            const lista = (ruta.properties.participantes || '').split('-').map(p => p.trim()).filter(Boolean);
            lista.forEach(n => nombresEnEsteDia.add(n));
        });
        return nombresEnEsteDia;
    });

    // --- ESTADÍSTICAS ACUMULADAS ---
    const stats = {};
    rutasTemp.forEach(f => {
        const pRaw = f.properties.participantes || '';
        const nombres = pRaw.split('-').map(p => p.trim()).filter(Boolean);
        nombres.forEach(n => {
            if (!stats[n]) stats[n] = { nombre: n, rutas: 0, km: 0, desn: 0 };
            stats[n].rutas++;
            stats[n].km += (Number(f.properties.distancia) || 0);
            stats[n].desn += (Number(f.properties.desnivel) || 0);
        });
    });

    // Ranking: primero por rutas, desempate por km, desempate por desnivel
    const ranking = Object.values(stats).sort((a, b) => {
        if (b.rutas !== a.rutas) return b.rutas - a.rutas;
        if (b.km   !== a.km)   return b.km   - a.km;
        return b.desn - a.desn;
    });

    // Dibujar filas
    const body = document.getElementById('ranking-body');
    body.innerHTML = '';

    ranking.forEach((s, idx) => {
        const esPodium = idx < 3;
        const pos = idx + 1;

        // Círculos de últimas 5 jornadas
        const ultimasHTML = participacionPorDia.map(setDia => {
            const estuvo = setDia.has(s.nombre);
            return `<div class="ult-icon ${estuvo ? 'si' : 'no'}">${estuvo ? SVG_TICK : SVG_CROSS}</div>`;
        }).join('');

        const row = document.createElement('div');
        row.className = 'clas-row';
        row.innerHTML = `
            <div class="clas-banda ${esPodium ? 'podium' : 'none'}"></div>
            <div class="clas-pos">${pos}</div>
            <div class="clas-nombre">${abreviarNombre(s.nombre)}</div>
            <div class="clas-stat">${s.rutas}</div>
            <div class="clas-stat">${s.km.toFixed(1)}</div>
            <div class="clas-stat pts-col">${Math.round(s.desn)}</div>
            <div class="clas-ultimas">${ultimasHTML}</div>
        `;
        body.appendChild(row);
    });
}

// --- LÓGICA DE GRÁFICOS (RESTO DE CARDS) ---

function calcularStatsGlobales(rutas) {
    const temps = {};
    rutas.forEach(r => {
        const t = r.temporada || '?';
        if (!temps[t]) temps[t] = { rutas:0, km:0, desn:0, parts:0 };
        temps[t].rutas++;
        temps[t].km += parseFloat(r.distancia || 0);
        temps[t].desn += parseFloat(r.desnivel || 0);
        temps[t].parts += (r.participantes || '').split('-').filter(Boolean).length;
    });
    return { temporadas: Object.keys(temps).sort(), datos: temps, totalRutas: rutas.length };
}

function renderGraficos({ temporadas, datos, totalRutas }) {
    const labels = temporadas;
    const commonOpts = (grace) => ({
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { 
            x: { grid: { display: false }, ticks: { font: { size: 10, weight: '700' } } },
            y: { display: false, grace }
        }
    });

    document.getElementById('sum1').textContent = totalRutas;
    new Chart(document.getElementById('chart1'), {
        type: 'bar',
        data: { labels, datasets: [{ data: labels.map(t => datos[t].rutas), backgroundColor: '#e05c2a33', borderColor: '#e05c2a', borderWidth: 2, borderRadius: 5 }]},
        options: commonOpts('10%')
    });

    const totalKm = labels.reduce((acc, t) => acc + datos[t].km, 0);
    document.getElementById('sum2').textContent = Math.round(totalKm).toLocaleString();
    new Chart(document.getElementById('chart2'), {
        type: 'line',
        data: { labels, datasets: [{ data: labels.map(t => Math.round(datos[t].km)), borderColor: '#1a7fc1', tension: 0.4, fill: true, backgroundColor: '#1a7fc111' }]},
        options: commonOpts('15%')
    });

    const mediaGral = (labels.reduce((acc, t) => acc + datos[t].parts, 0) / totalRutas).toFixed(1);
    document.getElementById('sum3').textContent = mediaGral;
    new Chart(document.getElementById('chart3'), {
        type: 'bar',
        data: { labels, datasets: [{ data: labels.map(t => (datos[t].parts / datos[t].rutas).toFixed(1)), backgroundColor: '#3a7d5a33', borderColor: '#3a7d5a', borderWidth: 2, borderRadius: 5 }]},
        options: commonOpts('10%')
    });

    const totalDesn = labels.reduce((acc, t) => acc + datos[t].desn, 0);
    document.getElementById('sum4').textContent = Math.round(totalDesn).toLocaleString();
    new Chart(document.getElementById('chart4'), {
        type: 'line',
        data: { labels, datasets: [{ data: labels.map(t => Math.round(datos[t].desn)), borderColor: '#c8a96e', tension: 0.4, fill: true, backgroundColor: '#c8a96e11' }]},
        options: commonOpts('15%')
    });
}

function initDots() {
    const scroll = document.getElementById('cards-scroll');
    const dots = document.querySelectorAll('.dot');
    const update = () => {
        const i = Math.round(scroll.scrollLeft / (scroll.offsetWidth - 30));
        dots.forEach((d, idx) => {
            d.style.width = i === idx ? '16px' : '6px';
            d.style.background = i === idx ? '#1a1a18' : '#ddd';
        });
    };
    scroll.addEventListener('scroll', update);
    update();
}
