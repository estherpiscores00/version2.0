// ── MAPA ──────────────────────────────────────────────────
const map = L.map('map', { center: [40.65, -3.85], zoom: 10, tap: true });

L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
  maxZoom: 18,
  attribution: '<a href="https://github.com/cyclosm/cyclosm-cartocss-style/releases">CyclOSM</a> | © <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
}).addTo(map);

// ── ICONOS ───────────────────────────────────────────────
function makePeakIcon(color) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="22" height="26" viewBox="0 0 32 36">
    <defs><filter id="sh"><feDropShadow dx="0" dy="2" stdDeviation="2" flood-color="rgba(0,0,0,0.5)"/></filter></defs>
    <path d="M16 0 C7.16 0 0 7.16 0 16 C0 24.84 16 36 16 36 C16 36 32 24.84 32 16 C32 7.16 24.84 0 16 0Z" fill="${color}" filter="url(#sh)"/>
    <polygon points="16,7 9,23 23,23" fill="white" opacity="0.9"/>
    <polygon points="16,7 13,14 19,14" fill="${color}" opacity="0.55"/>
    <ellipse cx="16" cy="7.5" rx="2.5" ry="1.5" fill="white" opacity="0.95"/>
  </svg>`;
  return L.divIcon({ html: svg, className: '', iconSize: [22, 26], iconAnchor: [11, 26], popupAnchor: [0, -28] });
}

const iconGold   = makePeakIcon('#f0a500');  // amarillo-naranja vivo
const iconBlue   = makePeakIcon('#1a7fc1');  // azul vivo
const iconAccent = makePeakIcon('#e03020');  // rojo vivo para filtro activo

// ── LIMPIEZA SENDERISTAS ─────────────────────────────────
// Filtra valores vacíos, 'nan', 'null', etc. del array
function limpiarSenderistas(arr) {
  if (!Array.isArray(arr)) return [];
  return arr
    .map(n => (n || '').trim())
    .filter(n => n && n.toLowerCase() !== 'nan' && n.toLowerCase() !== 'null' && n !== '');
}

// ── ESTADO ───────────────────────────────────────────────
let allFeatures    = [];
let allSenderistas = {};  // nombre -> nº picos
let activeSend     = '';
const layerGroup   = L.layerGroup().addTo(map);

// ── CARGA GEOJSON ────────────────────────────────────────
fetch('todos_los_picos.geojson')
  .then(r => {
    if (!r.ok) throw new Error('No se pudo cargar todos_los_picos.geojson');
    return r.json();
  })
  .then(data => {
    allFeatures = data.features;

    // Rango real de elevaciones
    const elevs   = allFeatures.map(f => f.properties.elev);
    const elevMin = Math.floor(Math.min(...elevs) / 100) * 100;
    const elevMax = Math.ceil (Math.max(...elevs) / 100) * 100;

    ['slider-min', 'slider-max'].forEach(id => {
      document.getElementById(id).min = elevMin;
      document.getElementById(id).max = elevMax;
    });
    document.getElementById('slider-min').value = elevMin;
    document.getElementById('slider-max').value = elevMax;
    document.getElementById('val-min').textContent = elevMin;
    document.getElementById('val-max').textContent = elevMax;

    // Recopilar senderistas únicos con conteo de picos
    allFeatures.forEach(f => {
      limpiarSenderistas(f.properties.senderistas).forEach(n => {
        allSenderistas[n] = (allSenderistas[n] || 0) + 1;
      });
    });

    updateMarkers();
    initSliders();
    initSenderista();
  })
  .catch(err => {
    console.error(err);
    alert('⚠️ ' + err.message + '\n\nSirve la app desde un servidor HTTP:\npython -m http.server 8080');
  });

// ── MARCADORES ───────────────────────────────────────────
function updateMarkers() {
  layerGroup.clearLayers();

  const min = +document.getElementById('slider-min').value;
  const max = +document.getElementById('slider-max').value;

  const visible = allFeatures.filter(f => {
    const elev = f.properties.elev;
    if (elev < min || elev > max) return false;
    if (activeSend) {
      const s = limpiarSenderistas(f.properties.senderistas);
      return s.some(n => n.toLowerCase() === activeSend.toLowerCase());
    }
    return true;
  });

  document.getElementById('stat-visible').textContent = visible.length;
  document.getElementById('no-data').style.display = visible.length === 0 ? 'block' : 'none';

  // Badge filtro senderista activo
  const badge = document.getElementById('filter-badge');
  if (activeSend) {
    badge.style.display = 'block';
    badge.textContent   = `🧍 ${activeSend}  ·  ${visible.length} pico${visible.length !== 1 ? 's' : ''}`;
  } else {
    badge.style.display = 'none';
  }

  visible.forEach(f => {
    const p        = f.properties;
    const lat      = f.geometry.coordinates[1];
    const lon      = f.geometry.coordinates[0];
    const senders  = limpiarSenderistas(p.senderistas);
    const hasSend  = senders.length > 0;

    let icon = hasSend ? iconGold : iconBlue;
    if (activeSend) icon = iconAccent;

    const marker = L.marker([lat, lon], { icon }).addTo(layerGroup);

    // HTML de senderistas en el popup
    let sendHtml = '';
    if (hasSend) {
      const tags = senders.map(s => {
        const hl = activeSend && s.toLowerCase() === activeSend.toLowerCase();
        return `<span class="senderista-tag${hl ? ' highlight' : ''}">${s}</span>`;
      }).join('');
      sendHtml = `
        <div class="popup-senderistas-count">${senders.length} ascenso${senders.length !== 1 ? 's' : ''}</div>
        <div class="popup-senderistas-list">${tags}</div>`;
    } else {
      sendHtml = `<div style="color:#999;font-size:0.8rem;font-family:'Nunito',sans-serif">Sin ascensos todavía</div>`;
    }

    marker.bindPopup(`
      <div class="popup-inner">
        <div class="popup-sierra">${p.name_sierra || ''}</div>
        <div class="popup-name">${p.name_pico}</div>
        <div class="popup-elev">⛰ ${p.elev.toLocaleString('es-ES')} m</div>
        <div class="popup-divider"></div>
        <div class="popup-senderistas-title">Senderistas que lo han hollado</div>
        ${sendHtml}
      </div>`, { maxWidth: 290 });
  });

  updateSliderRange();
}

// ── SLIDER DOBLE ─────────────────────────────────────────
function initSliders() {
  const sMin = document.getElementById('slider-min');
  const sMax = document.getElementById('slider-max');

  sMin.addEventListener('input', () => {
    if (+sMin.value > +sMax.value - 50) sMin.value = +sMax.value - 50;
    document.getElementById('val-min').textContent = sMin.value;
    updateMarkers();
  });

  sMax.addEventListener('input', () => {
    if (+sMax.value < +sMin.value + 50) sMax.value = +sMin.value + 50;
    document.getElementById('val-max').textContent = sMax.value;
    updateMarkers();
  });
}

function updateSliderRange() {
  const sMin  = document.getElementById('slider-min');
  const sMax  = document.getElementById('slider-max');
  const range = document.getElementById('slider-range');
  const min   = +sMin.min;
  const max   = +sMin.max;
  const pctA  = ((+sMin.value - min) / (max - min)) * 100;
  const pctB  = ((+sMax.value - min) / (max - min)) * 100;
  range.style.left  = pctA + '%';
  range.style.width = (pctB - pctA) + '%';
}

// ── FILTRO SENDERISTA ─────────────────────────────────────
function initSenderista() {
  const input    = document.getElementById('senderista-input');
  const list     = document.getElementById('autocomplete-list');
  const clearBtn = document.getElementById('search-clear');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    clearBtn.style.display = q ? 'block' : 'none';

    if (!q) {
      list.style.display = 'none';
      activeSend = '';
      updateMarkers();
      return;
    }

    const matches = Object.entries(allSenderistas)
      .filter(([n]) => n.toLowerCase().includes(q))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);

    if (!matches.length) { list.style.display = 'none'; return; }

    list.innerHTML = matches.map(([nombre, count]) =>
      `<div class="autocomplete-item" data-nombre="${nombre}">
        🧍 ${nombre}
        <span class="autocomplete-count">${count} pico${count !== 1 ? 's' : ''}</span>
      </div>`
    ).join('');

    list.style.display = 'block';

    list.querySelectorAll('.autocomplete-item').forEach(item => {
      item.addEventListener('click', () => {
        input.value = item.dataset.nombre;
        activeSend  = item.dataset.nombre;
        list.style.display    = 'none';
        clearBtn.style.display = 'block';
        updateMarkers();
        collapsePanel();
      });
    });
  });

  clearBtn.addEventListener('click', () => {
    input.value = '';
    activeSend  = '';
    clearBtn.style.display = 'none';
    list.style.display     = 'none';
    updateMarkers();
  });

  // Cerrar autocompletado al tocar fuera
  document.addEventListener('click', e => {
    if (!input.contains(e.target) && !list.contains(e.target))
      list.style.display = 'none';
  });
}

// ── PANEL COLAPSABLE ─────────────────────────────────────
const panel  = document.getElementById('control-panel');
const toggle = document.getElementById('panel-toggle');
const tlabel = document.getElementById('toggle-label');
let collapsed = false;

function collapsePanel() {
  collapsed = true;
  panel.classList.add('collapsed');
  tlabel.textContent = 'Filtros';
}

toggle.addEventListener('click', () => {
  collapsed = !collapsed;
  panel.classList.toggle('collapsed', collapsed);
  tlabel.textContent = collapsed ? 'Filtros' : 'Cerrar';
});

// Ajustar mapa al redimensionar
window.addEventListener('resize', () => map.invalidateSize());
