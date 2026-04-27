/* ============================================================
   VISOR DE RUTAS — script.js
   ============================================================
   Estructura:
     1. Configuración del mapa
     2. Variables globales
     3. Carga de datos (GeoJSON)
     4. Puntos interactivos
     5. Utilidades (color, fecha)
     6. Panel de detalle
     7. Buscador
     8. Leyenda
============================================================ */


/* ------------------------------------------------------------
   1. CONFIGURACIÓN DEL MAPA
------------------------------------------------------------ */
const map = L.map('map').setView([40.4167, -3.70325], 6);

L.tileLayer('https://{s}.tile-cyclosm.openstreetmap.fr/cyclosm/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: 'Map data &copy; OpenStreetMap contributors, CyclOSM'
}).addTo(map);

// Cerrar panel al hacer clic en zona vacía del mapa
map.on('click', cerrarPanel);


/* ------------------------------------------------------------
   2. VARIABLES GLOBALES
------------------------------------------------------------ */
let capaRutaActiva    = null;   // Track GPX actualmente dibujado
let todasLasRutasGeoJSON = null; // GeoJSON con geometrías de todas las rutas
let capaPuntos        = null;   // Capa de marcadores clicables


/* ------------------------------------------------------------
   3. CARGA DE DATOS
------------------------------------------------------------ */

/**
 * Carga las geometrías de las rutas y, al terminar, los puntos.
 * El loader se oculta cuando ambos ficheros están listos.
 */
fetch('rutas_unificadas_con_id.geojson')
    .then(res => res.json())
    .then(data => {
        todasLasRutasGeoJSON = data;
        cargarPuntosInteractivos();
    })
    .catch(err => console.error('Error cargando rutas GeoJSON:', err));


/* ------------------------------------------------------------
   4. PUNTOS INTERACTIVOS
------------------------------------------------------------ */

/**
 * Dibuja en el mapa los puntos clicables y activa el buscador.
 */
function cargarPuntosInteractivos() {
    fetch('puntos_completos_interactivos.geojson')
        .then(res => res.json())
        .then(data => {
            capaPuntos = L.geoJSON(data, {
                pointToLayer: crearMarcador,
                onEachFeature: asignarEventosPunto
            }).addTo(map);

            configurarBuscador(data.features);
            ocultarLoader();
        })
        .catch(err => {
            console.error('Error cargando puntos GeoJSON:', err);
            ocultarLoader();
        });
}

/**
 * Crea un circleMarker con el color de dificultad correspondiente.
 * @param {object} feature - Feature GeoJSON del punto
 * @param {L.LatLng} latlng - Coordenadas del punto
 * @returns {L.CircleMarker}
 */
function crearMarcador(feature, latlng) {
    const color = calcularColorDificultad(
        feature.properties.distancia,
        feature.properties.desnivel
    );

    return L.circleMarker(latlng, {
        radius: 8,
        fillColor: color,
        color: '#fff',
        weight: 2,
        opacity: 1,
        fillOpacity: 0.85,
        className: 'punto-interactivo'
    });
}

/**
 * Asigna los eventos de clic y hover a cada punto del mapa.
 * Guarda el color original para restaurarlo correctamente en mouseout.
 * @param {object} feature
 * @param {L.Layer} layer
 */
function asignarEventosPunto(feature, layer) {
    const colorOriginal = calcularColorDificultad(
        feature.properties.distancia,
        feature.properties.desnivel
    );

    layer.on('click', (e) => {
        L.DomEvent.stopPropagation(e);
        mostrarDetalleRuta(feature.properties);
    });

    layer.on('mouseover', function () {
        this.setStyle({ fillColor: '#2c3e50', radius: 10 });
    });

    layer.on('mouseout', function () {
        // Restauramos el color original calculado, no un hardcode
        this.setStyle({ fillColor: colorOriginal, radius: 8 });
    });
}


/* ------------------------------------------------------------
   5. UTILIDADES
------------------------------------------------------------ */

/**
 * Calcula el color del marcador según distancia y desnivel.
 * Escala de esfuerzo: dist(km) + desnivel(m)/100
 *   < 10  → Fácil      (verde)
 *   < 14 → Moderada   (amarillo)
 *   < 18 → Difícil    (naranja)
 *   ≥ 18 → Muy difícil (rojo)
 * @param {number|string} dist     - Distancia en km
 * @param {number|string} desnivel - Desnivel en metros
 * @returns {string} Color hexadecimal
 */
function calcularColorDificultad(dist, desnivel) {
    const esfuerzo = parseFloat(dist) + (parseFloat(desnivel) / 100);
    if (esfuerzo < 10)  return '#27ae60';
    if (esfuerzo < 14) return '#f1c40f';
    if (esfuerzo < 18) return '#e67e22';
    return '#ff1900';
}

/**
 * Convierte una fecha ISO (AAAA-MM-DD o AAAA-MM-DDTHH:mm:ss)
 * al formato legible DD/MM/AAAA.
 * @param {string} fechaOriginal
 * @returns {string}
 */
function formatearFecha(fechaOriginal) {
    if (!fechaOriginal || fechaOriginal === '-') return '-';

    const soloFecha = fechaOriginal.split('T')[0];
    const partes    = soloFecha.split('-');

    if (partes.length === 3) {
        const [year, month, day] = partes;
        return `${day}/${month}/${year}`;
    }

    return fechaOriginal;
}

/**
 * Oculta el indicador de carga con animación.
 */
function ocultarLoader() {
    const loader = document.getElementById('loader');
    if (loader) loader.classList.add('oculto');
}


/* ------------------------------------------------------------
   6. PANEL DE DETALLE
------------------------------------------------------------ */

const sidebar     = document.getElementById('sidebar');
const sidebarInfo = document.getElementById('sidebar-info');
const leyenda     = document.getElementById('leyenda');

/**
 * Muestra el panel inferior con los datos de la ruta clicada
 * y dibuja su track en el mapa.
 * @param {object} props - Propiedades del feature GeoJSON
 */
function mostrarDetalleRuta(props) {
    // Eliminar track anterior si lo hay
    if (capaRutaActiva) {
        map.removeLayer(capaRutaActiva);
        capaRutaActiva = null;
    }

    const idBuscado = String(props.id_ruta);
    const rutaGeom  = todasLasRutasGeoJSON.features.find(
        f => String(f.properties.id_ruta) === idBuscado
    );

    // Volver al inicio del scroll
    sidebar.scrollTop = 0;

    if (!rutaGeom) return;

    // Dibujar track
    capaRutaActiva = L.geoJSON(rutaGeom, {
        style: { color: '#e74c3c', weight: 4, opacity: 0.85 }
    }).addTo(map);

    // Ajustar cámara respetando el panel inferior
    const altoPanel = window.innerHeight * 0.42;
    map.fitBounds(capaRutaActiva.getBounds(), {
        paddingTopLeft:     [20, 20],
        paddingBottomRight: [20, altoPanel + 20],
        animate: true
    });

    // Construir HTML del panel
    sidebarInfo.innerHTML = construirHTMLPanel(props);

    // Mostrar panel y ocultar leyenda
    sidebar.classList.add('sidebar-active');
    leyenda.classList.add('oculta');
}

/**
 * Genera el HTML interior del panel de detalle.
 * @param {object} props
 * @returns {string} HTML
 */
function construirHTMLPanel(props) {
    const fotoHTML = props.foto
        ? `<a href="${props.foto}" target="_blank" class="foto-link">
               <img src="${props.foto}" class="sidebar-foto" onerror="this.style.display='none'" alt="Foto de la ruta">
           </a>`
        : '';

    return `
        <button class="btn-cerrar-circulo" onclick="cerrarPanel()" title="Cerrar">✕</button>

        <div class="ruta-titulo">${props.name || 'Sin nombre'}</div>

        <table class="meta-table">
            <tr>
                <td>🆔 ${props.id_ruta}</td>
                <td>📅 ${formatearFecha(props.fecha)}</td>
            </tr>
            <tr>
                <td>🍂 ${props.temporada || '-'}</td>
                <td>⏱️ ${props.tiempo || '-'}</td>
            </tr>
            <tr>
                <td>📏 ${props.distancia} km</td>
                <td>⛰️ ${props.desnivel} m</td>
            </tr>
            <tr>
                <td colspan="2" class="full-width">
                    👥 ${props.participantes || '-'}
                </td>
            </tr>
        </table>

        ${props.comentario
            ? `<div class="ruta-comentario">${props.comentario}</div>`
            : ''}

        <a href="${props.wikiloc}" target="_blank" rel="noopener" class="btn-wikiloc">
            🔗 Ver en Wikiloc
        </a>

        ${fotoHTML}

        <button class="btn-cerrar" onclick="cerrarPanel()">Cerrar</button>
    `;
}

/**
 * Cierra el panel lateral, elimina el track del mapa
 * y limpia el buscador.
 */
function cerrarPanel() {
    sidebar.classList.remove('sidebar-active');
    leyenda.classList.remove('oculta');

    if (capaRutaActiva) {
        map.removeLayer(capaRutaActiva);
        capaRutaActiva = null;
    }

    // Limpiar buscador
    const inputBuscador   = document.getElementById('map-search');
    const resultadosBuscador = document.getElementById('search-results');
    if (inputBuscador)    inputBuscador.value = '';
    if (resultadosBuscador) resultadosBuscador.style.display = 'none';

    map.invalidateSize();
}


/* ------------------------------------------------------------
   7. BUSCADOR
------------------------------------------------------------ */

/**
 * Inicializa el buscador de rutas por nombre.
 * @param {Array} features - Array de features GeoJSON de los puntos
 */
function configurarBuscador(features) {
    const input      = document.getElementById('map-search');
    const resultados = document.getElementById('search-results');

    input.addEventListener('input', () => {
        const query = input.value.toLowerCase().trim();
        resultados.innerHTML = '';

        if (query.length < 2) {
            resultados.style.display = 'none';
            return;
        }

        const filtrados = features
            .filter(f => f.properties.name.toLowerCase().includes(query))
            .slice(0, 10);

        if (filtrados.length > 0) {
            resultados.style.display = 'block';
            filtrados.forEach(ruta => {
                resultados.appendChild(crearItemBuscador(ruta, input, resultados));
            });
        } else {
            resultados.style.display = 'none';
        }
    });

    // Cerrar al clic fuera del buscador
    document.addEventListener('click', (e) => {
        if (!document.getElementById('search-container').contains(e.target)) {
            resultados.style.display = 'none';
        }
    });
}

/**
 * Crea el elemento DOM de un resultado de búsqueda.
 * @param {object} ruta    - Feature GeoJSON
 * @param {HTMLElement} input
 * @param {HTMLElement} resultados
 * @returns {HTMLDivElement}
 */
function crearItemBuscador(ruta, input, resultados) {
    const div = document.createElement('div');
    div.className = 'search-item';
    div.innerHTML = `
        <div class="search-item-nombre">${ruta.properties.name}</div>
        <div class="search-item-fecha">${formatearFecha(ruta.properties.fecha)}</div>
    `;

    div.onclick = () => {
        const [lng, lat] = ruta.geometry.coordinates;
        map.setView([lat, lng], 14);
        mostrarDetalleRuta(ruta.properties);
        input.value = ruta.properties.name;
        resultados.style.display = 'none';
    };

    return div;
}
