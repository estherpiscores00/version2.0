// ── PALETA ───────────────────────────────────────────────
const FONT = "'Nunito', sans-serif";
const COLORES = { c1:'#f0a500', c2:'#e05c2a', c3:'#1a7fc1', c4:'#3a7d5a', c5:'#c8a96e' };

// ── PLUGIN ETIQUETAS ENCIMA ───────────────────────────────
const topLabelsPlugin = {
  id: 'topLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        if (raw == null) return;
        const label  = ds._labelFmt ? ds._labelFmt(raw) : String(raw);
        const angulo = ds._labelAngle || 0;
        ctx.save();
        ctx.translate(el.x, el.y - 4);
        ctx.rotate((angulo * Math.PI) / 180);
        ctx.font = `700 9px ${FONT}`;
        ctx.fillStyle    = '#555';
        ctx.textAlign    = 'center';
        ctx.textBaseline = 'bottom';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
    });
  }
};
Chart.register(topLabelsPlugin);

// ── OPCIONES BASE ─────────────────────────────────────────
function baseOpts(grace = 0) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 22, right: 6, left: 6, bottom: 0 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: { font: { family: FONT, size: 10, weight: '700' }, color: '#bbb', maxRotation: 45, minRotation: 30 }
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.06)', drawTicks: false }, border: { display: false },
        ticks: { font: { family: FONT, size: 9 }, color: '#ccc', padding: 4 },
        grace
      }
    }
  };
}

// ── CARGA ────────────────────────────────────────────────
fetch('puntos_completos_interactivos.geojson')
  .then(r => { if (!r.ok) throw new Error('No se pudo cargar el GeoJSON'); return r.json(); })
  .then(data => {
    const rutas = data.features.map(f => f.properties);
    const stats = calcularStats(rutas);
    renderTodo(stats);
    document.getElementById('loader').classList.add('oculto');
    initDots();
  })
  .catch(err => { console.error(err); document.getElementById('loader').classList.add('oculto'); });

// ── CÁLCULOS ─────────────────────────────────────────────
function calcularStats(rutas) {
  const temps = {};
  rutas.forEach(r => {
    const t = r.temporada || '?';
    if (!temps[t]) temps[t] = { rutas: 0, dist: 0, desn: 0, parts: 0, rankMap: {} };
    temps[t].rutas++;
    temps[t].dist += parseFloat(r.distancia || 0);
    temps[t].desn += parseFloat(r.desnivel  || 0);
    const nombres = (r.participantes || '').split('-').map(n => n.trim()).filter(Boolean);
    temps[t].parts += nombres.length;
    nombres.forEach(n => { temps[t].rankMap[n] = (temps[t].rankMap[n] || 0) + 1; });
  });

  const temporadas = Object.keys(temps).sort();

  // Pódium por temporada (ranking completo ordenado)
  const podiums = {};
  temporadas.forEach(t => {
    podiums[t] = Object.entries(temps[t].rankMap)
      .sort((a, b) => b[1] - a[1])
      .map(([nombre, n]) => ({ nombre, n }));
  });

  return { temporadas, temps, podiums, totalRutas: rutas.length };
}

// ── RENDER ────────────────────────────────────────────────
function renderTodo({ temporadas, temps, podiums, totalRutas }) {
  const labels = temporadas;

  // G1
  const rutasPorTemp = labels.map(t => temps[t].rutas);
  document.getElementById('sum1').textContent = totalRutas;
  crearBarras('chart1', labels, rutasPorTemp, COLORES.c1, v => v, 3);

  // G2
  const kmPorTemp = labels.map(t => +(temps[t].dist.toFixed(1)));
  document.getElementById('sum2').textContent = kmPorTemp.reduce((a,b)=>a+b,0).toFixed(0);
  crearLinea('chart2', labels, kmPorTemp, COLORES.c2, v => v+' km', -50);

  // G3
  const mediaPartic = labels.map(t => +(temps[t].parts / temps[t].rutas).toFixed(1));
  const totalParts  = labels.reduce((s,t) => s + temps[t].parts, 0);
  document.getElementById('sum3').textContent = (totalParts / totalRutas).toFixed(1);
  crearBarras('chart3', labels, mediaPartic, COLORES.c3, v => v, 1);

  // G4
  const desnPorTemp = labels.map(t => Math.round(temps[t].desn));
  document.getElementById('sum4').textContent = desnPorTemp.reduce((a,b)=>a+b,0).toLocaleString('es-ES');
  crearLinea('chart4', labels, desnPorTemp, COLORES.c4, v => v.toLocaleString('es-ES'), -90);

  // G5 — Medallero (última temporada primero)
  const ultimaTemp = temporadas[temporadas.length - 1];
  renderMedallero(podiums, [...temporadas].reverse(), ultimaTemp);
}

// ── BARRAS ───────────────────────────────────────────────
function crearBarras(id, labels, data, color, labelFmt, grace = 2) {
  new Chart(document.getElementById(id), {
    type: 'bar',
    data: { labels, datasets: [{
      data,
      backgroundColor: hexAlpha(color, 0.18),
      borderColor: color, borderWidth: 2,
      borderRadius: 6, borderSkipped: false,
      _labelFmt: labelFmt, _labelAngle: 0
    }]},
    options: baseOpts(grace)
  });
}

// ── LÍNEA ────────────────────────────────────────────────
function crearLinea(id, labels, data, color, labelFmt, angulo = -45) {
  const opts = baseOpts(0);
  opts.layout.padding = { top: 28, right: 14, left: 14, bottom: 0 };
  opts.scales.y.beginAtZero = true;
  new Chart(document.getElementById(id), {
    type: 'line',
    data: { labels, datasets: [{
      data,
      borderColor: color, borderWidth: 2.5,
      backgroundColor: hexAlpha(color, 0.08), fill: true,
      pointBackgroundColor: color, pointBorderColor: '#fff',
      pointBorderWidth: 2, pointRadius: 4, tension: 0.35,
      _labelFmt: labelFmt, _labelAngle: angulo
    }]},
    options: opts
  });
}

// ── MEDALLERO ────────────────────────────────────────────
function renderMedallero(podiums, temporadasDesc, tempActiva) {
  const chipsEl   = document.getElementById('podium-chips');
  const container = document.getElementById('podium-container');

  chipsEl.innerHTML = temporadasDesc.map(t =>
    `<div class="pod-chip${t === tempActiva ? ' active' : ''}" data-t="${t}">${t}</div>`
  ).join('');

  chipsEl.querySelectorAll('.pod-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chipsEl.querySelectorAll('.pod-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      chip.scrollIntoView({ inline: 'center', behavior: 'smooth' });
      dibujarMedallero(podiums[chip.dataset.t], container, chip.dataset.t);
      lanzarFuegos();
    });
  });

  dibujarMedallero(podiums[tempActiva], container, tempActiva);

  // Lanzar fuegos al inicio (tras un pequeño delay para que el DOM esté pintado)
  setTimeout(() => lanzarFuegos(), 400);

  // Volver a lanzar cada vez que la card sea visible
  const cardEl = document.getElementById('card-medallero');
  const scroll = document.getElementById('cards-scroll');
  let fuegoLanzado = false;
  scroll.addEventListener('scroll', () => {
    const cardRect   = cardEl.getBoundingClientRect();
    const scrollRect = scroll.getBoundingClientRect();
    const visible    = cardRect.left < scrollRect.right - 40 && cardRect.right > scrollRect.left + 40;
    if (visible && !fuegoLanzado) { fuegoLanzado = true; lanzarFuegos(); }
    if (!visible) fuegoLanzado = false;
  }, { passive: true });
}

function dibujarMedallero(ranking, container, temporada) {
  const top3    = ranking.slice(0, 3);
  const diploma = ranking.slice(3, 6);
  const resto   = ranking.slice(6);

  const medallas = ['🥇','🥈','🥉'];
  const colores  = ['#f0a500','#9e9e9e','#a0522d'];
  const alturas  = ['82px','62px','48px'];
  const orden    = [1, 0, 2];

  const tempHtml = temporada
    ? `<div class="podium-temporada">Temporada ${temporada}</div>`
    : ''; // plata izq, oro centro, bronce der

  // ── Pódium ──
  const podHtml = `
    ${tempHtml}
    <div class="podium-stage">
      ${orden.map(i => {
        const p = top3[i];
        if (!p) return `<div class="podium-col"></div>`;
        return `<div class="podium-col">
          <div class="podium-medal">${medallas[i]}</div>
          <div class="podium-name">${p.nombre}</div>
          <div class="podium-count" style="color:${colores[i]}">${p.n} rutas</div>
          <div class="podium-bar" style="height:${alturas[i]};background:${hexAlpha(colores[i],0.15)};border-color:${colores[i]}"></div>
        </div>`;
      }).join('')}
    </div>`;

  // ── Diploma olímpico (4º-6º) ──
  const diploHtml = diploma.length ? `
    <div class="diploma-section">
      <div class="diploma-label">🎖️ Diploma olímpico</div>
      ${diploma.map((p, i) => `
        <div class="diploma-row">
          <div class="diploma-pos">${i + 4}º</div>
          <div class="diploma-name">${p.nombre}</div>
          <div class="diploma-n">${p.n} rutas</div>
          <div class="diploma-icon">📜</div>
        </div>`).join('')}
    </div>` : '';

  // ── Resto ──
  const restoHtml = resto.length ? `
    <div class="resto-section">
      <div class="resto-label">Resto de participantes</div>
      ${resto.map((p, i) => `
        <div class="resto-row">
          <div class="resto-pos">${i + 7}º</div>
          <div class="resto-name">${p.nombre}</div>
          <div class="resto-n">${p.n} rutas</div>
        </div>`).join('')}
    </div>` : '';

  container.innerHTML = podHtml + diploHtml + restoHtml;
}

// ── FUEGOS ARTIFICIALES ───────────────────────────────────
let fireworksFrame = null;

function lanzarFuegos() {
  const canvas = document.getElementById('fireworks-canvas');
  const card   = document.getElementById('card-medallero');
  const ctx    = canvas.getContext('2d');

  // Cancelar animación anterior si la hubiera
  cancelAnimationFrame(fireworksFrame);

  // Función que ejecuta los fuegos una vez tenemos dimensiones reales
  function ejecutar() {
    const w = card.getBoundingClientRect().width;
    const h = card.getBoundingClientRect().height;

    if (w === 0 || h === 0) {
      // Si aún no hay tamaño, reintentamos en el siguiente frame
      fireworksFrame = requestAnimationFrame(ejecutar);
      return;
    }

    canvas.width  = w;
    canvas.height = h;

    const particulas   = [];
    const COLORES_FW   = ['#f0a500','#e05c2a','#1a7fc1','#c8a96e','#e03020','#3a7d5a','#fff','#ffdd44'];

    function crearExplosion(x, y) {
      const color = COLORES_FW[Math.floor(Math.random() * COLORES_FW.length)];
      for (let i = 0; i < 32; i++) {
        const ang = (Math.PI * 2 / 32) * i;
        const vel = 2 + Math.random() * 3;
        particulas.push({
          x, y,
          vx: Math.cos(ang) * vel,
          vy: Math.sin(ang) * vel,
          alpha: 1,
          color,
          radio: 2.5 + Math.random() * 2
        });
      }
    }

    // 6 explosiones escalonadas en posiciones repartidas por la card
    [[0.25,0.3],[0.75,0.2],[0.5,0.12],[0.15,0.5],[0.85,0.45],[0.5,0.4]]
      .forEach(([rx, ry], i) => {
        setTimeout(() => crearExplosion(w * rx, h * ry), i * 250);
      });

    function animar() {
      ctx.clearRect(0, 0, w, h);
      for (let i = particulas.length - 1; i >= 0; i--) {
        const p = particulas[i];
        p.x  += p.vx;
        p.y  += p.vy;
        p.vy += 0.07;
        p.alpha -= 0.016;
        if (p.alpha <= 0) { particulas.splice(i, 1); continue; }
        ctx.save();
        ctx.globalAlpha = p.alpha;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.radio, 0, Math.PI * 2);
        ctx.fillStyle = p.color;
        ctx.fill();
        ctx.restore();
      }
      if (particulas.length > 0) {
        fireworksFrame = requestAnimationFrame(animar);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
    }

    fireworksFrame = requestAnimationFrame(animar);
  }

  ejecutar();
}

// ── DOTS + DRAG SCROLL ───────────────────────────────────
function initDots() {
  const scroll  = document.getElementById('cards-scroll');
  const dots    = document.querySelectorAll('.dot');
  const cardW   = () => scroll.querySelector('.stat-card').offsetWidth + 14;

  const actualizar = () => {
    const idx = Math.round(scroll.scrollLeft / cardW());
    dots.forEach((d, i) => {
      const activo = i === idx;
      d.style.background = activo ? COLORES['c' + (i + 1)] : '#ddd';
      d.style.width      = activo ? '18px' : '6px';
    });
  };

  scroll.addEventListener('scroll', actualizar, { passive: true });
  actualizar();

  // ── Scroll con rueda de ratón (escritorio) ──
  scroll.addEventListener('wheel', e => {
    e.preventDefault();
    scroll.scrollBy({ left: e.deltaY * 2, behavior: 'smooth' });
  }, { passive: false });

  // ── Drag con ratón (escritorio) ──
  let isDown = false, startX, startLeft;

  scroll.addEventListener('mousedown', e => {
    isDown  = true;
    startX  = e.pageX;
    startLeft = scroll.scrollLeft;
    scroll.classList.add('grabbing');
  });

  window.addEventListener('mouseup',   () => { isDown = false; scroll.classList.remove('grabbing'); });
  window.addEventListener('mousemove', e => {
    if (!isDown) return;
    e.preventDefault();
    scroll.scrollLeft = startLeft - (e.pageX - startX);
  });
}

// ── HELPER ───────────────────────────────────────────────
function hexAlpha(hex, alpha) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${alpha})`;
}
