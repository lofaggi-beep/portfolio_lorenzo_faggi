/* ============================================================
   SCRIPT.JS
   Motore del sito: legge i dati dei lavori dal Google Sheet
   ============================================================ */

const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/e/2PACX-1vSQcCeE1IhaO7_Am6l5KO5TZL7S9ixISAgLK9sajgxXrp4Qu3LUb-uY7iTFodt_qQSSLFiowJcHk77D/pub?gid=0&single=true&output=csv"; 

/* ---------- Funzioni di supporto ---------- */

async function scaricaLavori() {
  if (!SHEET_CSV_URL) {
    console.warn("SHEET_CSV_URL non impostato.");
    return null;
  }
  const urlSenzaCache = SHEET_CSV_URL + (SHEET_CSV_URL.includes("?") ? "&" : "?") + "t=" + Date.now();
  const risposta = await fetch(urlSenzaCache, { cache: "no-store" });
  if (!risposta.ok) throw new Error("Impossibile leggere il foglio Google.");
  const testoCSV = await risposta.text();

  const risultato = Papa.parse(testoCSV, { header: true, skipEmptyLines: true });
  return risultato.data
    .filter(riga => String(riga.pubblica).trim().toUpperCase() === "TRUE")
    .sort((a, b) => Number(a.ordine || 0) - Number(b.ordine || 0));
}

// Prepara l'URL dell'embed di Vimeo mantenendo eventuali parametri di sicurezza (es. ?h=...)
function estraiEmbedVimeo(valore) {
  if (!valore) return "";
  const val = valore.trim();
  
  if (val.includes("player.vimeo.com")) {
    return val;
  }
  
  const match = val.match(/vimeo\.com\/(\d+)(?:\?h=([a-zA-Z0-9]+))?/);
  if (match) {
    const id = match[1];
    const hash = match[2];
    return `https://player.vimeo.com/video/${id}` + (hash ? `?h=${hash}` : "");
  }
  
  return `https://player.vimeo.com/video/${val}`;
}

// Genera l'HTML per la copertina nei box o in home
function generaHtmlCopertina(lavoro) {
  const tipoMedia = (lavoro.tipo_media || "").toLowerCase().trim();
  const mediaVal = lavoro.media || "";
  const haVideo = tipoMedia === "video" || tipoMedia === "vimeo" || mediaVal.includes("vimeo");

  if (haVideo && !lavoro.copertina) {
    const embedSrc = estraiEmbedVimeo(mediaVal);
    return `<iframe src="${embedSrc}" style="width:100%;height:100%;border:0;pointer-events:none;" allow="autoplay; fullscreen" title="${lavoro.titolo}"></iframe>`;
  }

  return `<img src="${lavoro.copertina}" alt="${lavoro.titolo}">`;
}

async function ottieniLavori() {
  try {
    const dati = await scaricaLavori();
    return dati && dati.length ? dati : [];
  } catch (err) {
    console.error(err);
    return [];
  }
}

/* ---------- Pagina index.html ---------- */
async function inizializzaHome() {
  const contenitore = document.getElementById("hero-container");
  if (!contenitore) return;
  const lavori = await ottieniLavori();
  const recente = lavori[0];
  if (!recente) { contenitore.innerHTML = "<p>Nessun lavoro pubblicato.</p>"; return; }

  const titoloFormatted = (recente.titolo || "").replace(/\r?\n/g, "<br>");
  const htmlCover = generaHtmlCopertina(recente);

  contenitore.innerHTML = `
    <a href="work.html?slug=${encodeURIComponent(recente.slug)}" class="hero-link">
      <div class="hero-frame">
        ${htmlCover}
      </div>
      <div class="hero-caption">
        <h1 class="hero-title">${titoloFormatted}</h1>
      </div>
    </a>`;
}

/* ---------- Pagina works.html ---------- */
async function inizializzaGriglia() {
  const container = document.getElementById("works-index");
  if (!container) return;

  const lavori = await ottieniLavori();
  if (!lavori || lavori.length === 0) {
    container.innerHTML = "<p>Nessun lavoro trovato.</p>";
    return;
  }

  const gruppi = {};

  lavori.forEach(lavoro => {
    const tipo = lavoro.tipo || lavoro.categoria || "Altro";

    if (!gruppi[tipo]) {
      gruppi[tipo] = [];
    }
    gruppi[tipo].push(lavoro);
  });

  container.innerHTML = Object.entries(gruppi)
    .map(([tipo, items]) => `
      <div class="category">
        <h2>${tipo}</h2>
        <ul>
          ${items.map(item => {
            const titleHtml = typeof marked !== 'undefined' 
              ? marked.parseInline(item.titolo || "") 
              : (item.titolo || "").replace(/\n/g, "<br>");

            return `
              <li>
                <a href="work.html?slug=${encodeURIComponent(item.slug)}">
                  <span class="work-title">${titleHtml}</span>
                </a>
              </li>
            `;
          }).join("")}
        </ul>
      </div>
    `).join("");
}

/* ---------- Pagina work.html: galleria e media del progetto ---------- */
function costruisciGalleria(lavoro) {
  let html = "";

  const tipoMedia = (lavoro.tipo_media || "").toLowerCase().trim();
  const mediaVal = lavoro.media || "";
  const haVideo = tipoMedia === "video" || tipoMedia === "vimeo" || mediaVal.includes("vimeo");

  // 1. Se c'è un'immagine di copertina, la mostra SEMPRE per prima a tutta larghezza
  if (lavoro.copertina) {
    html += `<figure class="media-full cover"><img src="${lavoro.copertina}" alt="${lavoro.titolo}"></figure>`;
  }

  // 2. Se c'è un video Vimeo, lo inserisce subito dopo
  if (haVideo && mediaVal) {
    const embedSrc = estraiEmbedVimeo(mediaVal);
    html += `
      <figure class="media-full" style="aspect-ratio: 16 / 9; width: 100%;">
        <iframe 
          src="${embedSrc}" 
          style="width: 100%; height: 100%; border: 0;" 
          allow="autoplay; fullscreen; picture-in-picture" 
          allowfullscreen 
          title="${lavoro.titolo}">
        </iframe>
      </figure>`;
  }

  // 3. Se ci sono immagini aggiuntive nella colonna 'immagini'
  const immaginiGrezze = lavoro.immagini || "";
  const immagini = immaginiGrezze
    .split(/\r?\n/)
    .map(url => url.trim())
    .filter(Boolean);

  if (immagini.length > 0) {
    html += immagini
      .map(url => `<figure><img src="${url}" alt="${lavoro.titolo}"></figure>`)
      .join("");
  }

  return html;
}

/* ---------- Pagina work.html: dettaglio letto da ?slug=... ---------- */
async function inizializzaDettaglio() {
  const contenitore = document.getElementById("work-container");
  if (!contenitore) return;

  const parametri = new URLSearchParams(window.location.search);
  const slug = parametri.get("slug");
  const lavori = await ottieniLavori();
  const lavoro = lavori.find(l => l.slug === slug) || lavori[0];

  if (!lavoro) { contenitore.innerHTML = "<p>Lavoro non trovato.</p>"; return; }

  const titoloConACapo = (lavoro.titolo || "").replace(/\r?\n/g, "<br>");
  document.title = `${lavoro.titolo.replace(/\r?\n/g, " ")} — Lorenzo Faggi`;

  if (typeof marked !== 'undefined') {
    const renderer = new marked.Renderer();
    renderer.link = ({ href, title, text }) => {
      const titleAttr = title ? ` title="${title}"` : '';
      return `<a href="${href}"${titleAttr} target="_blank" rel="noopener noreferrer">${text}</a>`;
    };
    marked.setOptions({ renderer });
  }

  const descrizioneHTML = typeof marked !== 'undefined' 
    ? marked.parse(lavoro.descrizione || "") 
    : `<p>${lavoro.descrizione || ""}</p>`;

  const mediaHTML = costruisciGalleria(lavoro);

  contenitore.innerHTML = `
    <section class="work-header">
      <h1>${titoloConACapo}</h1>
    </section>
    <section class="work-media">${mediaHTML}</section>
    <section class="work-body">${descrizioneHTML}</section>`;
}

/* ---------- Interazioni menu ---------- */
function attivaMenuMobile() {
  const toggle = document.querySelector(".nav-toggle");
  const nav = document.querySelector(".site-nav");
  if (!toggle || !nav) return;
  toggle.addEventListener("click", () => {
    const aperto = nav.classList.toggle("is-open");
    toggle.setAttribute("aria-expanded", aperto ? "true" : "false");
  });
}

/* ---------- Avvio ---------- */
document.addEventListener("DOMContentLoaded", () => {
  attivaMenuMobile();
  inizializzaHome();
  inizializzaGriglia();
  inizializzaDettaglio();
});
