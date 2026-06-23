/* ============================================================
   EXTRACT_GIFTS.JS — Extrae el catálogo de regalos de TikTok
   ------------------------------------------------------------
   Se conecta a un Live y vuelca TODOS los regalos disponibles
   (id, nombre, valor en monedas/diamantes y URL de imagen) a
   un JSON, fusionando con lo ya guardado SIN duplicar por id.

   Por qué así: getAvailableGifts() devuelve el catálogo OFICIAL
   completo de la sala de una sola vez. Escuchar el evento 'gift'
   solo captura lo que la gente envía en vivo (lento e incompleto),
   por eso aquí es solo un "enriquecimiento" opcional (--listen).

   Uso:
     node extract_gifts.js @usuario
     node extract_gifts.js @usuario --out=regalos_tiktok.json
     node extract_gifts.js @usuario --listen=60     (escucha 60 s extra)

   Requiere que el @usuario esté EN VIVO en ese momento.
   ============================================================ */
'use strict';

const fs   = require('fs');
const path = require('path');
const { WebcastPushConnection } = require('tiktok-live-connector');

/* ---------- argumentos ---------- */
const args = process.argv.slice(2);
const flag = (name, def) => {
  const a = args.find(x => x.startsWith(`--${name}=`));
  return a ? a.split('=').slice(1).join('=') : def;
};
const username = (args.find(a => !a.startsWith('--')) || '').replace(/^@/, '').trim();
const OUT     = path.resolve(flag('out', 'regalos_tiktok.json'));
const LISTEN  = Math.max(0, parseInt(flag('listen', '0'), 10) || 0);   // segundos extra escuchando 'gift'

if (!username) {
  console.error('❌ Falta el usuario.  Uso:  node extract_gifts.js @usuario [--out=archivo.json] [--listen=segundos]');
  process.exit(1);
}

/* ---------- helpers ---------- */
// Primera URL no vacía de un objeto tipo {url_list:[...]} (icon | image | thumbnail)
const firstUrl = (...objs) => {
  for (const o of objs) {
    const u = o && o.url_list && o.url_list.find(Boolean);
    if (u) return u;
  }
  return '';
};

// Normaliza un regalo (venga de getAvailableGifts() o del evento 'gift') a nuestro esquema.
function normalize(g) {
  const id = g.id ?? g.giftId;
  if (id == null) return null;
  return {
    id:       Number(id),
    name:     g.name || g.giftName || '',
    coins:    g.diamond_count ?? g.diamondCount ?? null,   // valor en monedas/diamantes
    image:    firstUrl(g.icon, g.image, g.thumbnail)
              || g.giftPictureUrl
              || firstUrl(g.extendedGiftInfo && g.extendedGiftInfo.image),
  };
}

// Carga el JSON existente como Map por id (para fusionar sin duplicar).
function loadExisting(file) {
  try {
    const arr = JSON.parse(fs.readFileSync(file, 'utf8'));
    return new Map(arr.map(g => [g.id, g]));
  } catch {
    return new Map();
  }
}

// Inserta/actualiza en el Map; solo rellena campos vacíos si ya existía. Devuelve 'new'|'upd'|'skip'.
function upsert(map, g) {
  if (!g) return 'skip';
  const prev = map.get(g.id);
  if (!prev) { map.set(g.id, g); return 'new'; }
  let changed = false;
  for (const k of ['name', 'coins', 'image']) {
    const empty = prev[k] === '' || prev[k] == null;
    if (empty && g[k] !== '' && g[k] != null) { prev[k] = g[k]; changed = true; }
  }
  return changed ? 'upd' : 'skip';
}

function save(file, map) {
  const arr = [...map.values()].sort((a, b) => (a.coins ?? 0) - (b.coins ?? 0) || a.id - b.id);
  fs.writeFileSync(file, JSON.stringify(arr, null, 2) + '\n', 'utf8');
  return arr.length;
}

/* ---------- principal ---------- */
(async () => {
  const catalog = loadExisting(OUT);
  const before  = catalog.size;
  let added = 0, updated = 0;

  const conn = new WebcastPushConnection(username, {
    processInitialData: false,
    enableExtendedGiftInfo: true,   // necesario para que diamond_count/imagen vengan completos
  });

  // Limpieza única (Ctrl+C o fin normal).
  let closed = false;
  const finish = (code = 0) => {
    if (closed) return; closed = true;
    try { conn.disconnect(); } catch {}
    const total = save(OUT, catalog);
    console.log(`\n💾 Guardado en ${OUT}`);
    console.log(`   Antes: ${before}  ·  nuevos: ${added}  ·  enriquecidos: ${updated}  ·  total: ${total}`);
    process.exit(code);
  };
  process.on('SIGINT', () => { console.log('\n⏹  Interrumpido, guardando…'); finish(0); });

  try {
    const state = await conn.connect();
    console.log(`✅ Conectado a @${username} (room ${state.roomId}).`);
  } catch (e) {
    console.error(`❌ No se pudo conectar a @${username}: ${e && e.message || e}`);
    console.error('   ¿Está la persona EN VIVO ahora mismo? El catálogo solo se obtiene dentro de una sala.');
    process.exit(2);
  }

  // 1) Catálogo OFICIAL completo (la fuente principal).
  try {
    const gifts = await conn.getAvailableGifts();
    for (const g of gifts || []) {
      const r = upsert(catalog, normalize(g));
      if (r === 'new') added++; else if (r === 'upd') updated++;
    }
    console.log(`🎁 getAvailableGifts(): ${(gifts || []).length} regalos en la sala.`);
  } catch (e) {
    console.warn(`⚠️  getAvailableGifts() falló: ${e && e.message || e}`);
  }

  // 2) (Opcional) Escucha 'gift' un rato para captar/confirmar lo que se envíe en vivo.
  if (LISTEN > 0) {
    console.log(`👂 Escuchando regalos en vivo ${LISTEN}s (Ctrl+C para terminar antes)…`);
    conn.on('gift', (data) => {
      const r = upsert(catalog, normalize(data));
      if (r === 'new') { added++; console.log(`   + nuevo por evento: ${data.giftName} (#${data.giftId})`); }
    });
    setTimeout(() => finish(0), LISTEN * 1000);
  } else {
    finish(0);
  }
})();
