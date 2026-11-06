/* DSN Frame shared code: feed parsing, spacecraft names, formatting, Wikipedia lookups.
   Used by index.html (full display) and overlay.html (OBS overlay). */
const P = new URLSearchParams(location.search);
const DEMO = P.has('demo');
if (P.has('lite')) document.documentElement.classList.add('lite');

const SITES = {
  gdscc: {name:'Goldstone', place:'California', tz:'America/Los_Angeles'},
  mdscc: {name:'Madrid',    place:'Spain',      tz:'Europe/Madrid'},
  cdscc: {name:'Canberra',  place:'Australia',  tz:'Australia/Sydney'},
};
const BIG = new Set(['DSS14','DSS43','DSS63']); // the 70 m dishes

// Feed code -> [display name, Wikipedia article]. Unknown codes fall back to NASA's config names.
const CRAFT = {
  VGR1:['Voyager 1','Voyager 1'], VGR2:['Voyager 2','Voyager 2'],
  NHPC:['New Horizons','New Horizons'], JNO:['Juno','Juno (spacecraft)'],
  MRO:['Mars Reconnaissance Orbiter','Mars Reconnaissance Orbiter'], MVN:['MAVEN','MAVEN'],
  M01O:['Mars Odyssey','2001 Mars Odyssey'], MEX:['Mars Express','Mars Express'],
  TGO:['ExoMars Trace Gas Orbiter','Trace Gas Orbiter'], M20:['Perseverance','Perseverance (rover)'],
  MSL:['Curiosity','Curiosity (rover)'], EMM:['Hope','Emirates Mars Mission'],
  JWST:['James Webb Space Telescope','James Webb Space Telescope'],
  LRO:['Lunar Reconnaissance Orbiter','Lunar Reconnaissance Orbiter'], KPLO:['Danuri','Danuri'],
  CAPS:['CAPSTONE','CAPSTONE'], PSYC:['Psyche','Psyche (spacecraft)'], LUCY:['Lucy','Lucy (spacecraft)'],
  EURC:['Europa Clipper','Europa Clipper'], JUCE:['JUICE','Jupiter Icy Moons Explorer'],
  JUICE:['JUICE','Jupiter Icy Moons Explorer'], SPP:['Parker Solar Probe','Parker Solar Probe'],
  SOHO:['SOHO','Solar and Heliospheric Observatory'], ACE:['ACE','Advanced Composition Explorer'],
  WIND:['Wind','Wind (spacecraft)'], STA:['STEREO-A','STEREO'], SOLO:['Solar Orbiter','Solar Orbiter'],
  BEPI:['BepiColombo','BepiColombo'], ORX:['OSIRIS-APEX','OSIRIS-REx'], HYB2:['Hayabusa2','Hayabusa2'],
  TESS:['TESS','Transiting Exoplanet Survey Satellite'], DSCO:['DSCOVR','Deep Space Climate Observatory'],
  GAIA:['Gaia','Gaia (spacecraft)'], CHDR:['Chandra','Chandra X-ray Observatory'],
};
const PSEUDO = /^(DSN|DSS|TEST|TST|RFC|GBRA|NONE|SPACE)/i; // calibration / self-test targets
let configNames = {};

const $ = id => document.getElementById(id);
const num = v => { const n = parseFloat(v); return isFinite(n) ? n : null; };
const pos0 = v => { const n = num(v); return n > 0 ? n : null; };

/* ---------- formatting ---------- */
function fmtRate(bps){
  if (bps == null || bps <= 0) return null;
  if (bps >= 1e6) return [(bps/1e6).toFixed(bps>=1e7?0:1), 'Mb/s'];
  if (bps >= 1e3) return [(bps/1e3).toFixed(bps>=1e4?0:1), 'kb/s'];
  return [bps < 10 ? bps.toFixed(1) : Math.round(bps), 'b/s'];
}
function fmtDist(km){
  if (km == null || km <= 0) return ['–',''];
  const AU = 149597870.7;
  if (km >= 0.1*AU) return [(km/AU).toFixed(km/AU >= 10 ? 1 : 2), 'AU'];
  if (km >= 1e6) return [(km/1e6).toFixed(2), 'million km'];
  return [Math.round(km).toLocaleString(), 'km'];
}
function fmtLight(sec){
  if (sec == null || sec <= 0) return ['–',''];
  if (sec >= 3600) return [`${Math.floor(sec/3600)}h ${String(Math.round(sec%3600/60)).padStart(2,'0')}`, 'm'];
  if (sec >= 60) return [`${Math.floor(sec/60)}m ${String(Math.round(sec%60)).padStart(2,'0')}`, 's'];
  return [sec.toFixed(1), 's'];
}
const html = (a,b) => b ? `${a}<small>${b}</small>` : a;
const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function craftName(code){
  const k = (code||'').toUpperCase();
  return (CRAFT[k] && CRAFT[k][0]) || configNames[k.toLowerCase()] || k;
}
function wikiTitle(code){
  const k = (code||'').toUpperCase();
  return (CRAFT[k] && CRAFT[k][1]) || configNames[k.toLowerCase()] || null;
}

/* ---------- feed parsing ---------- */
function parse(xmlText){
  const doc = new DOMParser().parseFromString(xmlText, 'application/xml');
  const root = doc.documentElement;
  if (!root || root.nodeName === 'parsererror') throw new Error('bad xml');
  const sites = {gdscc:[], mdscc:[], cdscc:[]};
  let cur = null;
  for (const el of root.children){
    if (el.nodeName === 'station'){ cur = el.getAttribute('name'); if (!sites[cur]) sites[cur]=[]; }
    else if (el.nodeName === 'dish' && cur){
      const sig = tag => [...el.getElementsByTagName(tag)].map(s => ({
        type:(s.getAttribute('signalType')||'none').toLowerCase(),
        rate:num(s.getAttribute('dataRate')), freq:num(s.getAttribute('frequency')),
        power:num(s.getAttribute('power')), craft:(s.getAttribute('spacecraft')||'').toUpperCase(),
      })).filter(s => s.type !== 'none' && s.craft && !PSEUDO.test(s.craft));
      const targets = [...el.getElementsByTagName('target')].map(t => ({
        craft:(t.getAttribute('name')||'').toUpperCase(),
        // NASA sends -1 when range or light time is unknown (e.g. Earth orbiters)
        range:pos0(t.getAttribute('downlegRange')) ?? pos0(t.getAttribute('uplegRange')),
        rtlt:pos0(t.getAttribute('rtlt')),
      })).filter(t => t.craft && !PSEUDO.test(t.craft));
      const name = el.getAttribute('name');
      sites[cur].push({
        name, site:cur, big:BIG.has(name),
        el:num(el.getAttribute('elevationAngle')) ?? 90,
        down:sig('downSignal'), up:sig('upSignal'), targets,
        array: el.getAttribute('isArray') === 'true',
      });
    }
  }
  return sites;
}

/* Flatten into one spotlight entry per (dish, spacecraft) */
function spotlights(sites){
  const out = [];
  for (const k of Object.keys(SITES)) for (const d of sites[k]||[]){
    const crafts = new Set([...d.targets.map(t=>t.craft), ...d.down.map(s=>s.craft), ...d.up.map(s=>s.craft)]);
    for (const c of crafts){
      const t = d.targets.find(t=>t.craft===c) || {};
      const dn = d.down.find(s=>s.craft===c), up = d.up.find(s=>s.craft===c);
      if (!dn && !up) continue;
      out.push({dish:d, craft:c, range:t.range, rtlt:t.rtlt, dn, up});
    }
  }
  return out;
}

/* ---------- rendering: complexes ---------- */
function dishSvg(el){
  // the bowl tilts with the antenna's real elevation angle
  const tilt = 90 - Math.max(0, Math.min(90, el));
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M12 14v6M8 21h8" stroke="var(--dim)" stroke-width="1.6" fill="none" stroke-linecap="round"/>
    <g transform="rotate(${-tilt} 12 12)">
      <path d="M4 10a8 5 0 0 0 16 0z" fill="currentColor"/>
      <path d="M12 10V4" stroke="currentColor" stroke-width="1.2"/>
      <circle class="wave dn" cx="12" cy="3" r="3.5" fill="none" stroke="var(--down)" stroke-width="1"/>
      <circle class="wave up" cx="12" cy="3" r="3.5" fill="none" stroke="var(--up)" stroke-width="1"/>
    </g></svg>`;
}


const LMIN = Math.log10(1e5), LMAX = Math.log10(3e10);
const MARKS = [['Moon',384400],['Sun',1.496e8],['Jupiter',7.78e8],['Neptune',4.5e9],['Heliopause',1.8e10]];
const pos = km => Math.max(0, Math.min(100, (Math.log10(Math.max(km,1e5)) - LMIN) / (LMAX - LMIN) * 100));


const wikiCache = {};
async function wiki(title){
  if (!title) return null;
  if (title in wikiCache) return wikiCache[title];
  let j = null;
  const tries = DEMO
    ? [`https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(title.replace(/ /g,'_'))}`]
    : [`api/wiki?title=${encodeURIComponent(title)}`];
  for (const u of tries){
    try { const r = await fetch(u); if (r.ok){ j = await r.json(); break; } } catch(e){}
  }
  return (wikiCache[title] = j);
}
function imgUrl(src, big=true){
  if (!src) return null;
  // Wikimedia only serves standard thumb widths (330, 500, 960, ...); 960 is sharper than the default 330
  const u = big ? src.replace(/\/(\d+)px-/, '/960px-') : src;
  return DEMO ? u : `api/img?u=${encodeURIComponent(u)}`;
}


async function loadConfig(){
  if (DEMO) return;
  try {
    const r = await fetch('api/config'); if (!r.ok) return;
    const doc = new DOMParser().parseFromString(await r.text(), 'application/xml');
    for (const sc of doc.getElementsByTagName('spacecraft')){
      const n = sc.getAttribute('name'), f = sc.getAttribute('friendlyName');
      if (n && f) configNames[n.toLowerCase()] = f;
    }
  } catch(e){}
}
