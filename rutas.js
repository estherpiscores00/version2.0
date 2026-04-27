// ── SUPABASE ─────────────────────────────────────────────
const SUPA_URL = 'https://xnzjvcpqsnovojmqokza.supabase.co';
const SUPA_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhuemp2Y3Bxc25vdm9qbXFva3phIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY5MzU0ODcsImV4cCI6MjA5MjUxMTQ4N30.mUtROCQHtFsJcxMuq78wGlX93PxuxNXKZAYzHnwwR2c';

const supaHeaders = {
  'Content-Type':  'application/json',
  'apikey':        SUPA_KEY,
  'Authorization': 'Bearer ' + SUPA_KEY
};

const COOLDOWN_MS   = 5 * 60 * 1000; // 5 minutos
const LS_KEY        = 'senderistas_votes'; // clave en localStorage

// Cache local: { id_ruta: { likes, dislikes } }
let likesCache = {};

// ── CONTROL DE COOLDOWN ───────────────────────────────────
function getVotos() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '{}'); }
  catch { return {}; }
}

function registrarVoto(id_ruta, tipo) {
  const votos = getVotos();
  votos[id_ruta] = { tipo, ts: Date.now() };
  localStorage.setItem(LS_KEY, JSON.stringify(votos));
}

// Devuelve null si puede votar, o {tipo, segundosRestantes} si no puede
function estadoVoto(id_ruta) {
  const votos = getVotos();
  const v = votos[id_ruta];
  if (!v) return null;
  const restante = COOLDOWN_MS - (Date.now() - v.ts);
  if (restante <= 0) return null;
  return { tipo: v.tipo, segundosRestantes: Math.ceil(restante / 1000) };
}

// ── SUPABASE: CARGA Y ACTUALIZACIÓN ──────────────────────
async function cargarLikes() {
  try {
    const res  = await fetch(`${SUPA_URL}/rest/v1/likes?select=id_ruta,likes,dislikes`, { headers: supaHeaders });
    const data = await res.json();
    data.forEach(row => {
      likesCache[row.id_ruta] = { likes: row.likes || 0, dislikes: row.dislikes || 0 };
    });
  } catch (e) {
    console.warn('No se pudieron cargar los likes:', e);
  }
}

async function enviarVoto(id_ruta, tipo) {
  const estado = estadoVoto(id_ruta);
  if (estado) {
    mostrarToast('Ya has votado esta ruta 👍');
    return;
  }

  // Actualización optimista en pantalla
  if (!likesCache[id_ruta]) likesCache[id_ruta] = { likes: 0, dislikes: 0 };
  likesCache[id_ruta][tipo]++;
  registrarVoto(id_ruta, tipo);
  actualizarBotones(id_ruta);

  const emoji = tipo === 'likes' ? '👍' : '👎';
  mostrarToast(`${emoji} ¡Voto registrado!`);

  try {
    // Incremento atómico en Supabase mediante RPC
    await fetch(`${SUPA_URL}/rest/v1/rpc/incrementar_voto`, {
      method:  'POST',
      headers: supaHeaders,
      body: JSON.stringify({ p_id_ruta: id_ruta, p_campo: tipo })
    });
  } catch (e) {
    console.warn('Error guardando voto:', e);
    likesCache[id_ruta][tipo]--;
    actualizarBotones(id_ruta);
    mostrarToast('⚠️ Error al guardar el voto');
  }
}

function actualizarBotones(id_ruta) {
  const d = likesCache[id_ruta] || { likes: 0, dislikes: 0 };
  document.querySelectorAll(`.btn-like[data-id="${id_ruta}"]`).forEach(btn => {
    btn.querySelector('.like-count').textContent = d.likes;
  });
  document.querySelectorAll(`.btn-dislike[data-id="${id_ruta}"]`).forEach(btn => {
    btn.querySelector('.dislike-count').textContent = d.dislikes;
  });

  // Marcar visualmente si ya votó
  const estado = estadoVoto(id_ruta);
  document.querySelectorAll(`[data-id="${id_ruta}"]`).forEach(btn => {
    btn.classList.toggle('voted', !!estado);
    const esElTipo = estado && btn.classList.contains('btn-' + estado.tipo.replace('s',''));
    btn.classList.toggle('voted-this', !!esElTipo);
  });
}

// ── TOAST ─────────────────────────────────────────────────
function mostrarToast(msg) {
  let toast = document.getElementById('toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.classList.add('show');
  clearTimeout(toast._t);
  toast._t = setTimeout(() => toast.classList.remove('show'), 2500);
}

// ── ESTADO ───────────────────────────────────────────────
let allRutas     = [];
let ranking      = [];
let filtroActivo = '';

// ── CARGA ────────────────────────────────────────────────
Promise.all([
  fetch('puntos_completos_interactivos.geojson')
    .then(r => { if (!r.ok) throw new Error('No se pudo cargar el GeoJSON'); return r.json(); }),
  cargarLikes()
])
.then(([data]) => {
  allRutas = data.features
    .map(f => f.properties)
    .sort((a, b) => new Date(b.fecha) - new Date(a.fecha));

  calcularRanking();
  renderChips();
  renderRutas();
  renderRanking();
})
.catch(err => {
  console.error(err);
  document.getElementById('rutas-list').innerHTML =
    `<div class="empty-msg">⚠️ ${err.message}<br>Sirve la app desde un servidor HTTP.</div>`;
});

// ── CALCULAR RANKING ─────────────────────────────────────
function calcularRanking() {
  const map = {};
  allRutas.forEach(r => {
    parsearParticipantes(r.participantes).forEach(nombre => {
      if (!map[nombre]) map[nombre] = { nombre, rutas: 0, distancia: 0, desnivel: 0 };
      map[nombre].rutas++;
      map[nombre].distancia += r.distancia || 0;
      map[nombre].desnivel  += r.desnivel  || 0;
    });
  });
  ranking = Object.values(map)
    .sort((a, b) => b.rutas - a.rutas || b.distancia - a.distancia)
    .map((p, i) => ({ ...p, pos: i + 1 }));
}

function parsearParticipantes(str) {
  if (!str) return [];
  return str.split('-').map(n => n.trim()).filter(Boolean);
}

// ── CHIPS ────────────────────────────────────────────────
function renderChips() {
  const container = document.getElementById('chips-container');
  const chipTodos = crearChip('Todos', true);
  chipTodos.addEventListener('click', () => setFiltro(''));
  container.appendChild(chipTodos);

  ranking.map(r => r.nombre).forEach(nombre => {
    const chip = crearChip(nombre, false);
    chip.addEventListener('click', () => setFiltro(nombre));
    container.appendChild(chip);
  });
}

function crearChip(label, activo) {
  const el = document.createElement('div');
  el.className = 'chip' + (activo ? ' active' : '');
  el.textContent = label;
  el.dataset.nombre = label;
  return el;
}

function setFiltro(nombre) {
  filtroActivo = nombre;
  document.querySelectorAll('.chip').forEach(c => {
    c.classList.toggle('active',
      nombre === '' ? c.dataset.nombre === 'Todos' : c.dataset.nombre === nombre
    );
  });
  renderRutas();
  actualizarCabeceraParticipante();
  // Scroll al inicio al cambiar filtro
  document.getElementById('rutas-list').scrollTop = 0;
}

// ── CABECERA PARTICIPANTE ─────────────────────────────────
function actualizarCabeceraParticipante() {
  const header = document.getElementById('participante-header');
  if (!filtroActivo) { header.style.display = 'none'; return; }
  const datos = ranking.find(r => r.nombre === filtroActivo);
  if (!datos) return;
  header.style.display = 'block';
  document.getElementById('ph-rank').textContent = `Puesto ${datos.pos}º en el ranking`;
  document.getElementById('ph-name').textContent = datos.nombre;
  document.getElementById('ph-stats').innerHTML  =
    `<span>🥾 <strong>${datos.rutas}</strong> rutas</span>
     <span>📏 <strong>${datos.distancia.toFixed(1)}</strong> km</span>
     <span>⬆️ <strong>${datos.desnivel.toLocaleString('es-ES')}</strong> m↑</span>`;
}

// ── BOTONES DE VOTO HTML ──────────────────────────────────
function votosHtml(id_ruta) {
  const d      = likesCache[id_ruta] || { likes: 0, dislikes: 0 };
  const estado = estadoVoto(id_ruta);
  const voted  = estado ? 'voted' : '';
  const vLike  = estado && estado.tipo === 'likes'    ? 'voted-this' : '';
  const vDis   = estado && estado.tipo === 'dislikes' ? 'voted-this' : '';
  return `
    <div class="votos-row">
      <button class="btn-like ${voted} ${vLike}" data-id="${id_ruta}">
        👍 <span class="like-count">${d.likes}</span>
      </button>
      <button class="btn-dislike ${voted} ${vDis}" data-id="${id_ruta}">
        👎 <span class="dislike-count">${d.dislikes}</span>
      </button>
    </div>`;
}

function adjuntarVotos(container, id_ruta) {
  container.querySelector(`.btn-like[data-id="${id_ruta}"]`)
    ?.addEventListener('click', e => { e.stopPropagation(); enviarVoto(id_ruta, 'likes'); });
  container.querySelector(`.btn-dislike[data-id="${id_ruta}"]`)
    ?.addEventListener('click', e => { e.stopPropagation(); enviarVoto(id_ruta, 'dislikes'); });
}

// ── LISTA DE RUTAS ────────────────────────────────────────
function renderRutas() {
  const lista = document.getElementById('rutas-list');
  lista.innerHTML = '';

  const rutas = filtroActivo
    ? allRutas.filter(r => parsearParticipantes(r.participantes).includes(filtroActivo))
    : allRutas;

  if (rutas.length === 0) {
    lista.innerHTML = '<div class="empty-msg">No hay rutas para este participante.</div>';
    return;
  }

  rutas.forEach(r => {
    const card  = document.createElement('div');
    card.className = 'ruta-card';
    const fecha = formatearFecha(r.fecha);

    card.innerHTML = `
      <div class="ruta-card-top">
        <div class="ruta-name">${r.name || '—'}</div>
        <div class="ruta-fecha">${fecha}</div>
      </div>
      <div class="ruta-card-bottom">
        <div class="ruta-meta">
          <span>📏 ${r.distancia ? r.distancia.toFixed(1) + ' km' : '—'}</span>
          <span>⬆️ ${r.desnivel ? r.desnivel + ' m' : '—'}</span>
          <span>👥 ${r.participantes || '—'}</span>
        </div>
        ${votosHtml(r.id_ruta)}
      </div>`;

    card.addEventListener('click', e => {
      if (!e.target.closest('.btn-like') && !e.target.closest('.btn-dislike')) abrirModal(r);
    });
    adjuntarVotos(card, r.id_ruta);
    lista.appendChild(card);
  });
}

// ── MODAL DETALLE ─────────────────────────────────────────
function abrirModal(r) {
  const body  = document.getElementById('modal-body');
  const fecha = formatearFecha(r.fecha);

  const fotoHtml = r.foto
    ? `<img src="${r.foto}" class="modal-foto" alt="Foto de la ruta" loading="lazy"/>`
    : '';

  const wikiloc = r.wikiloc
    ? `<a href="${r.wikiloc}" target="_blank" class="btn-wikiloc">🔗 Ver en Wikiloc</a>`
    : '';

  body.innerHTML = `
    <div class="modal-temporada">Temporada ${r.temporada || '—'}</div>
    <div class="modal-title">${r.name || '—'}</div>

    <div class="modal-grid">
      <div class="modal-stat">
        <div class="modal-stat-label">Fecha</div>
        <div class="modal-stat-value">${fecha}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Distancia</div>
        <div class="modal-stat-value">${r.distancia ? r.distancia.toFixed(1) + ' km' : '—'}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Desnivel</div>
        <div class="modal-stat-value">${r.desnivel ? r.desnivel + ' m ↑' : '—'}</div>
      </div>
      <div class="modal-stat">
        <div class="modal-stat-label">Tiempo</div>
        <div class="modal-stat-value">${r.tiempo || '—'}</div>
      </div>
      <div class="modal-stat full">
        <div class="modal-stat-label">Participantes</div>
        <div class="modal-stat-value" style="font-size:0.88rem">${r.participantes || '—'}</div>
      </div>
    </div>

    ${r.comentario ? `<div class="modal-comentario">💬 ${r.comentario}</div>` : ''}
    ${fotoHtml}

    <div class="modal-votos">
      <div class="modal-votos-label">¿Qué te parece esta ruta?</div>
      ${votosHtml(r.id_ruta)}
    </div>

    ${wikiloc}
    <button class="btn-close-modal" id="btn-close-modal">Cerrar</button>`;

  adjuntarVotos(body, r.id_ruta);
  document.getElementById('modal').classList.add('open');
  document.getElementById('btn-close-modal').addEventListener('click', cerrarModal);
}

function cerrarModal() {
  document.getElementById('modal').classList.remove('open');
}

document.getElementById('modal').addEventListener('click', e => {
  if (e.target === document.getElementById('modal')) cerrarModal();
});
document.getElementById('btn-close-x').addEventListener('click', cerrarModal);

// ── RANKING ───────────────────────────────────────────────
function renderRanking() {
  const lista = document.getElementById('ranking-list');
  lista.innerHTML = '';

  ranking.forEach(p => {
    const card = document.createElement('div');
    card.className = 'rank-card';
    const posClass = p.pos === 1 ? 'gold' : p.pos === 2 ? 'silver' : p.pos === 3 ? 'bronze' : '';

    card.innerHTML = `
      <div class="rank-pos ${posClass}">${p.pos}</div>
      <div class="rank-body">
        <div class="rank-name">${p.nombre}</div>
        <div class="rank-stats">
          <span>🥾 <strong>${p.rutas}</strong> rutas</span>
          <span>📏 <strong>${p.distancia.toFixed(1)}</strong> km</span>
          <span>⬆️ <strong>${p.desnivel.toLocaleString('es-ES')}</strong> m↑</span>
        </div>
      </div>
      <div class="rank-badge">${p.rutas}</div>`;

    card.style.cursor = 'pointer';
    card.addEventListener('click', () => irARutasDeParticipante(p.nombre));
    lista.appendChild(card);
  });
}

// ── NAVEGACIÓN RANKING → RUTAS ────────────────────────────
function irARutasDeParticipante(nombre) {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
  document.querySelector('[data-tab="rutas"]').classList.add('active');
  document.getElementById('view-rutas').classList.add('active');
  setFiltro(nombre);
  document.getElementById('rutas-list').scrollTop = 0;
}

// ── TABS ─────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    const id = tab.dataset.tab;
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    tab.classList.add('active');
    document.getElementById('view-' + id).classList.add('active');
  });
});

// ── HELPERS ──────────────────────────────────────────────
function formatearFecha(iso) {
  if (!iso) return '—';
  const d = new Date(iso);
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
}
