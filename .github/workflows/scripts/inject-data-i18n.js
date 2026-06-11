const fs = require('fs');
const path = require('path');
const { globSync } = require('glob');
const cheerio = require('cheerio');

const I18N_PATH = 'engine/i18n.js';
const HTML_GLOB = './*.html';

/* ── Cargar traducciones existentes ── */
let translations = { es: {}, en: {}, fr: {}, de: {}, zh: {}, ja: {} };
let i18nPrefix = 'const translations = ';
let i18nSuffix = ';\n';

if (fs.existsSync(I18N_PATH)) {
  const raw = fs.readFileSync(I18N_PATH, 'utf8');
  const m = raw.match(/(const\s+translations\s*=\s*)(\{[\s\S]*?\n\})(;[\s\S]*)/);
  if (m) {
    i18nPrefix = m[1];
    i18nSuffix = m[3];
    try { translations = eval(`(${m[2]})`); } catch (e) {
      console.error('❌ Error parseando engine/i18n.js'); process.exit(1);
    }
  }
}

const esMap = new Map();
Object.entries(translations.es || {}).forEach(([k, v]) => {
  if (typeof v === 'string') esMap.set(v.trim(), k);
});
const usedKeys = new Set(Object.keys(translations.es || {}));

function slugify(t) {
  return t.toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim().replace(/\s+/g, '-').substring(0,30);
}

function makeKey(file, tag, text, idx) {
  const base = path.basename(file, '.html');
  let k = `${base}-${tag}-${slugify(text) || 'text'}`;
  if (usedKeys.has(k)) k = `${k}-${idx}`;
  while (usedKeys.has(k)) k = `${k}-${Math.floor(Math.random()*999)}`;
  usedKeys.add(k);
  return k;
}

/* ── Procesar HTML ── */
const files = globSync(HTML_GLOB, { ignore: ['node_modules/**', 'engine/**'] });
let total=0, reused=0, created=0;

files.forEach(file => {
  const html = fs.readFileSync(file, 'utf8');
  const $ = cheerio.load(html, { decodeEntities: false, xmlMode: false });
  let modified = false;

  const selectors = [
    'h1','h2','h3','h4','h5','h6','p','span','a','button',
    'label','strong','em','li','th','td','title','option','div'
  ].join(',');

  $(selectors).each(function(i){
    const el = $(this);
    if (el.attr('data-i18n')) return;

    const tag = (this.tagName||'').toLowerCase();
    if (['script','style','svg','path','noscript','meta','link','iframe','canvas'].includes(tag)) return;

    const txt = el.contents()
      .filter((_,n)=>n.type==='text')
      .map((_,n)=>n.data).get().join('').trim();

    if (!txt || txt.length<2) return;
    if (/^[—\d\s\.,€$¥£%\(\)\/\+\-\*]+$/.test(txt)) return;
    if (/^[^\p{L}]*$/u.test(txt)) return;

    let key = esMap.get(txt);
    if (!key) {
      key = makeKey(file, tag, txt, i);
      translations.es[key] = txt;
      ['en','fr','de','zh','ja'].forEach(l=>{
        if (!translations[l]) translations[l]={};
        if (!translations[l][key]) translations[l][key]=txt;
      });
      esMap.set(txt, key);
      created++;
    } else {
      reused++;
    }

    el.attr('data-i18n', key);
    modified = true; total++;
  });

  if (modified) {
    fs.writeFileSync(file, $.html(), 'utf8');
    console.log(`✅ ${file}`);
  } else {
    console.log(`⏭️  ${file}`);
  }
});

const out = `${i18nPrefix}${JSON.stringify(translations, null, 2)}${i18nSuffix}`;
fs.writeFileSync(I18N_PATH, out, 'utf8');

console.log(`\n🏁 Inyectados: ${total} | ♻️ Reutilizados: ${reused} | 🆕 Nuevos: ${created}`);
