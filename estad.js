const FONT = "'Nunito', sans-serif";
const COLORES = { c1:'#f0a500', c2:'#e05c2a', c3:'#1a7fc1', c4:'#3a7d5a', c5:'#c8a96e' };

// Plugin para etiquetas encima de las barras/puntos
Chart.register({
  id: 'topLabels',
  afterDatasetsDraw(chart) {
    const { ctx } = chart;
    chart.data.datasets.forEach((ds, di) => {
      const meta = chart.getDatasetMeta(di);
      if (meta.hidden) return;
      meta.data.forEach((el, i) => {
        const raw = ds.data[i];
        if (raw == null) return;
        const label = ds._labelFmt ? ds._labelFmt(raw) : String(raw);
        const angulo = ds._labelAngle || 0;
        ctx.save();
        ctx.translate(el.x, el.y - 6);
        ctx.rotate((angulo * Math.PI) / 180);
        ctx.font = `700 9px ${FONT}`;
        ctx.fillStyle = '#666';
        ctx.textAlign = 'center';
        ctx.fillText(label, 0, 0);
        ctx.restore();
      });
    });
  }
});

function baseOpts(grace = 0) {
  return {
    responsive: true,
    maintainAspectRatio: false,
    layout: { padding: { top: 25, right: 10, left: 10, bottom: 15 } },
    plugins: { legend: { display: false }, tooltip: { enabled: false } },
    scales: {
      x: {
        grid: { display: false }, border: { display: false },
        ticks: { font: { family: FONT, size: 10, weight: '700' }, color: '#bbb', maxRotation: 45, minRotation: 30 }
      },
      y: {
        grid: { color: 'rgba(0,0,0,0.05)', drawTicks: false }, border: { display: false },
        ticks: { display: false },
        grace
      }
    }
  };
}

fetch('puntos_completos_interactivos.geojson')
  .then(r => r.json())
  .then(data => {
    const rutas = data.features.map(f => f.properties);
    const stats = calcularStats(rutas);
    renderTodo(stats);
    document.getElementById('loader').classList.add('oculto');
    initDots();
  });

function calcularStats(rutas) {
  const temps = {};
  rutas.forEach(r => {
    const t = r.temporada || '?';
    if (!temps[t]) temps[t] = { rutas:0, dist:0, desn:0, parts:0, rankMap:{} };
    temps[t].rutas++;
    temps[t].dist += parseFloat(r.distancia || 0);
    temps[t].desn += parseFloat(r.desnivel || 0);
    const pList = (r.participantes || '').split('-').filter(Boolean);
    temps[t].parts += pList.length;
    pList.forEach(name => {
      const n = name.trim();
      temps[t].rankMap[n] = (temps[t].rankMap[n] || 0) + 1;
    });
  });
  const temporadas = Object.keys(temps).sort();
  const podiums = {};
  temporadas.forEach(t => {
    podiums[t] = Object.entries(temps[t].rankMap)
      .sort((a,b) => b[1] - a[1])
      .map(([nombre, n]) => ({ nombre, n }));
  });
  return { temporadas, temps, podiums, totalRutas: rutas.length };
}

function renderTodo({ temporadas, temps, podiums, totalRutas }) {
  const labels = temporadas;

  // G1: Rutas
  document.getElementById('sum1').textContent = totalRutas;
  new Chart(document.getElementById('chart1'), {
    type: 'bar',
    data: { labels, datasets: [{ data: labels.map(t => temps[t].rutas), backgroundColor: hexAlpha(COLORES.c2, 0.2), borderColor: COLORES.c2, borderWidth: 2, borderRadius: 5, _labelFmt: v => v }]},
    options: baseOpts(2)
  });

  // G2: KM
  const kmData = labels.map(t => Math.round(temps[t].dist));
  document.getElementById('sum2').textContent = kmData.reduce((a,b)=>a+b,0);
  new Chart(document.getElementById('chart2'), {
    type: 'line',
    data: { labels, datasets: [{ data: kmData, borderColor: COLORES.c3, backgroundColor: hexAlpha(COLORES.c3, 0.1), fill: true, tension: 0.4, pointRadius: 4, _labelFmt: v => v+'km', _labelAngle: -40 }]},
    options: baseOpts('10%')
  });

  // G3: Media Partic
  const mediaP = labels.map(t => (temps[t].parts / temps[t].rutas).toFixed(1));
  document.getElementById('sum3').textContent = (labels.reduce((s,t)=>s+temps[t].parts,0)/totalRutas).toFixed(1);
  new Chart(document.getElementById('chart3'), {
    type: 'bar',
    data: { labels, datasets: [{ data: mediaP, backgroundColor: hexAlpha(COLORES.c4, 0.2), borderColor: COLORES.c4, borderWidth: 2, borderRadius: 5, _labelFmt: v => v }]},
    options: baseOpts(1)
  });

  // G4: Desnivel
  const desnData = labels.map(t => Math.round(temps[t].desn));
  document.getElementById('sum4').textContent = desnData.reduce((a,b)=>a+b,0).toLocaleString();
  new Chart(document.getElementById('chart4'), {
    type: 'line',
    data: { labels, datasets: [{ data: desnData, borderColor: COLORES.c5, backgroundColor: hexAlpha(COLORES.c5, 0.1), fill: true, tension: 0.4, pointRadius: 4, _labelFmt: v => v.toLocaleString(), _labelAngle: -45 }]},
    options: baseOpts('15%')
  });

  renderMedallero(podiums, [...temporadas].reverse(), temporadas[temporadas.length-1]);
}

function renderMedallero(podiums, tempsDesc, activa) {
  const container = document.getElementById('podium-chips');
  container.innerHTML = tempsDesc.map(t => `<div class="pod-chip${t===activa?' active':''}" data-t="${t}">${t}</div>`).join('');
  
  container.querySelectorAll('.pod-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      container.querySelectorAll('.pod-chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');
      dibujarMedallero(podiums[chip.dataset.t], chip.dataset.t);
      lanzarFuegos();
    });
  });
  dibujarMedallero(podiums[activa], activa);
  setTimeout(lanzarFuegos, 500);
}

function dibujarMedallero(ranking, temp) {
  const top = document.getElementById('podium-top');
  const rest = document.getElementById('podium-rest');
  
  const t3 = ranking.slice(0,3);
  const diplo = ranking.slice(3,6);
  const resto = ranking.slice(6);
  const ord = [1, 0, 2];
  const meds = ['🥇','🥈','🥉'];
  const cols = ['#f0a500','#9e9e9e','#a0522d'];
  const h = ['70px','50px','40px'];

  top.innerHTML = `<div class="podium-temporada">Temporada ${temp}</div>
    <div class="podium-stage">${ord.map(i => t3[i] ? `<div class="podium-col">
      <div class="podium-medal">${meds[i]}</div>
      <div class="podium-name">${t3[i].nombre}</div>
      <div class="podium-count" style="color:${cols[i]}">${t3[i].n} r.</div>
      <div class="podium-bar" style="height:${h[i]}; background:${hexAlpha(cols[i],0.1)}; border-color:${cols[i]}"></div>
    </div>` : '<div class="podium-col"></div>').join('')}</div>`;

  rest.innerHTML = (diplo.length ? `<div class="diploma-section"><div class="diploma-label">🎖️ Diplomas</div>
    ${diplo.map((p,i)=>`<div class="diploma-row"><div class="diploma-pos">${i+4}º</div><div class="diploma-name">${p.nombre}</div><div class="diploma-n">${p.n}</div></div>`).join('')}</div>` : '') +
    (resto.length ? `<div class="resto-section" style="margin-top:10px"><div class="resto-label">Otros</div>
    ${resto.map((p,i)=>`<div class="resto-row"><div class="resto-pos">${i+7}º</div><div class="resto-name">${p.nombre}</div><div class="resto-n">${p.n}</div></div>`).join('')}</div>` : '');
}

function lanzarFuegos() {
  const canvas = document.getElementById('fireworks-canvas');
  const ctx = canvas.getContext('2d');
  const card = document.getElementById('card-medallero');
  let w = canvas.width = card.offsetWidth;
  let h = canvas.height = 200;
  let particles = [];

  for(let i=0; i<5; i++) {
    setTimeout(() => {
      const x = Math.random()*w, y = Math.random()*h;
      for(let j=0; j<20; j++) {
        particles.push({x, y, vx:(Math.random()-0.5)*4, vy:(Math.random()-0.5)*4, a:1, c:COLORES['c'+(Math.floor(Math.random()*5)+1)]});
      }
    }, i*200);
  }

  function anim() {
    ctx.clearRect(0,0,w,h);
    particles.forEach((p,i) => {
      p.x+=p.vx; p.y+=p.vy; p.vy+=0.05; p.a-=0.02;
      if(p.a<=0) return particles.splice(i,1);
      ctx.globalAlpha = p.a; ctx.fillStyle = p.c;
      ctx.beginPath(); ctx.arc(p.x, p.y, 2, 0, 7); ctx.fill();
    });
    if(particles.length) requestAnimationFrame(anim);
  }
  anim();
}

function initDots() {
  const scroll = document.getElementById('cards-scroll');
  const dots = document.querySelectorAll('.dot');
  const update = () => {
    const i = Math.round(scroll.scrollLeft / (scroll.offsetWidth - 34));
    dots.forEach((d,idx) => {
      d.style.width = i===idx?'15px':'6px';
      d.style.background = i===idx?COLORES['c'+(idx+1)]:'#ddd';
    });
  };
  scroll.addEventListener('scroll', update);
  update();
}

function hexAlpha(hex, a) {
  const r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
  return `rgba(${r},${g},${b},${a})`;
}