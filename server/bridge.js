/* ============================================================
   BRIDGE.JS — Puente TikTok Live  ->  juego "Carrera Live"
   ------------------------------------------------------------
   - Sirve los archivos del juego (index.html, css, js, assets).
   - Abre un WebSocket en el mismo puerto.
   - El navegador pide conectarse a un Live (@usuario) y este
     proceso reenvia cada REGALO recibido al juego.

   Arrancar:   cd server  &&  npm install  &&  npm start
   Luego abrir http://localhost:8123 en el navegador.
   ============================================================ */
'use strict';

const http = require('http');
const fs   = require('fs');
const path = require('path');
const { WebSocketServer } = require('ws');
// v2 API MODERNA (TikTokLiveConnection). NO usamos el shim "legacy" porque tiene un bug
// (getTopViewerAttributes revienta con la lista de espectadores y tumba el procesamiento).
// La API moderna trae el regalo con su NOMBRE incluido (gift.name), así no hace falta el
// catálogo de pago. Eventos por WebcastEvent.GIFT/CHAT/LIKE/STREAM_END.
const { TikTokLiveConnection, WebcastEvent, SignConfig } = require('tiktok-live-connector');

// Clave de Euler Stream (firma). Se pone con:  set SIGN_API_KEY=tu_clave
if (process.env.SIGN_API_KEY) SignConfig.apiKey = process.env.SIGN_API_KEY;

// helpers para leer los objetos anidados del proto v2
const uName = u => (u && (u.nickname || u.displayId)) || 'alguien';
const uId   = u => (u && (u.id || u.displayId)) || '';
const img0  = m => (m && m.urlList && m.urlList[0]) || '';

const PORT = process.env.PORT || 8123;

// Red de seguridad: que NINGÚN error inesperado tumbe el puente (si el proceso muere,
// el juego muestra "Conexión cerrada"). Mejor loguear y seguir vivo.
process.on('uncaughtException',  (e) => console.error('⚠️ uncaughtException:',  e && e.message || e));
process.on('unhandledRejection', (e) => console.error('⚠️ unhandledRejection:', e && e.message || e));
const ROOT = path.join(__dirname, '..');   // raiz del proyecto (un nivel arriba de /server)

/* ---------- BASE DE DATOS LOCAL de regalos enviados ----------
   Archivo JSON que va registrando CADA regalo recibido en los Lives:
   cuántas veces se ha enviado (count), su valor (diamonds), foto y nombre.
   Sirve para que el juego priorice los regalos MÁS enviados / populares.
   Se guarda junto al .exe (o en la raíz del proyecto en desarrollo). */
const DATA_DIR  = process.pkg ? path.dirname(process.execPath) : ROOT;
const STATS_FILE = path.join(DATA_DIR, 'gift-stats.json');
let giftStats = {};                          // { [giftId]: { id, name, diamonds, image, count, coins, last } }

/* Carpeta donde se DESCARGAN las fotos de los regalos para que siempre carguen (sin depender
   del CDN de TikTok, que puede caducar). Se sirve en /gift-img/.  "Foto sí o sí". */
const IMG_DIR = path.join(DATA_DIR, 'gift-img');
try { fs.mkdirSync(IMG_DIR, { recursive: true }); } catch (_) {}

/* descarga la foto de un regalo a disco y devuelve su ruta local (/gift-img/<id>.png) */
async function downloadGiftImage(id, url){
  if (!url || !/^https?:/.test(url)) return null;
  const name = String(id).replace(/[^a-zA-Z0-9_-]/g, '_') + '.png';
  const file = path.join(IMG_DIR, name);
  if (fs.existsSync(file) && fs.statSync(file).size > 0) return '/gift-img/' + name;
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const buf = Buffer.from(await res.arrayBuffer());
    if (!buf.length) return null;
    fs.writeFileSync(file, buf);
    return '/gift-img/' + name;
  } catch (_) { return null; }
}
/* baja a disco las fotos que aún son URL del CDN y reescribe la BD a rutas locales */
function backfillImages(){
  let pending = 0;
  Object.values(giftStats).forEach(s => {
    if (s.image && /^https?:/.test(s.image)){
      pending++;
      downloadGiftImage(s.id, s.image).then(local => { if (local){ s.image = local; saveStats(); } });
    }
  });
  if (pending) console.log(`🖼️  BD: descargando ${pending} fotos de regalos a disco…`);
}

function loadStats(){
  try { giftStats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')).gifts || {}; }
  catch (_) { giftStats = {}; }
}

/* Catálogo base (regalos conocidos con su FOTO local en assets/gifts/). Se SIEMBRA en la
   base de datos al arrancar para que TODOS estén en el mismo lugar, aunque aún no se hayan
   enviado en un Live. No duplica: si ya existe uno con el mismo nombre, no lo agrega. */
const SEED_GIFTS = [
  { id:'rose',      name:'Rose',           diamonds:1, image:'assets/gifts/rose.png' },
  { id:'tiktok',    name:'TikTok',         diamonds:1, image:'assets/gifts/tiktok.png' },
  { id:'gg',        name:'GG',             diamonds:1, image:'assets/gifts/gg.png' },
  { id:'coffee',    name:'Coffee',         diamonds:1, image:'assets/gifts/coffee.png' },
  { id:'icecream',  name:'Ice Cream Cone', diamonds:1, image:'assets/gifts/icecream.png' },
  { id:'heartpuff', name:'Heart Puff',     diamonds:1, image:'assets/gifts/heartpuff.png' },
  { id:'rainbow',   name:'Rainbow',        diamonds:1, image:'assets/gifts/rainbow.png' },
  { id:'orange',    name:'Orange Juice',   diamonds:1, image:'assets/gifts/orange.png' },
  { id:'cakeslice', name:'Cake Slice',     diamonds:1, image:'assets/gifts/cake.png' },
  { id:'chili',     name:'Chili',          diamonds:1, image:'assets/gifts/chili.png' },
  { id:'tomato',    name:'Tom the Tomato', diamonds:1, image:'assets/gifts/tomato.png' },
  { id:'glowstick', name:'Glow Stick',     diamonds:1, image:'' },
  { id:'finger',    name:'Finger Heart',   diamonds:5, image:'assets/gifts/finger.png' },
  { id:'donut',     name:'Doughnut',       diamonds:1, image:'assets/gifts/donut.png' },
  { id:'flower',    name:'Flowers',        diamonds:1, image:'assets/gifts/flower.png' },
  { id:'heart',     name:'Heart',          diamonds:1, image:'assets/gifts/heart.png' },
  { id:'star',      name:'Star',           diamonds:1, image:'assets/gifts/star.png' },
  { id:'lion',      name:'Lion',           diamonds:29999, image:'assets/gifts/lion.png' },
];
function seedStats(){
  let added = 0;
  SEED_GIFTS.forEach(g => {
    const exists = Object.values(giftStats).some(s => s.name && s.name.toLowerCase() === g.name.toLowerCase());
    if (!exists){ giftStats[g.id] = { id:g.id, name:g.name, diamonds:g.diamonds, image:g.image||'', count:0, coins:0, last:0 }; added++; }
  });
  if (added){ console.log(`🌱 BD: sembrados ${added} regalos del catálogo (con foto).`); saveStats(); }
}
let saveTimer = null;
function saveStats(){                         // guardado con "debounce" para no escribir en cada regalo
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try { fs.writeFileSync(STATS_FILE, JSON.stringify({ gifts: giftStats }, null, 0)); }
    catch (e) { console.error('⚠️ No se pudo guardar gift-stats.json:', e && e.message || e); }
  }, 1500);
}
/* registra un regalo recibido (suma su frecuencia y monedas).
   Localiza por id; si no, por NOMBRE (para FUSIONAR con el catálogo sembrado en vez de
   crear un duplicado), y adopta el id numérico/ foto reales del Live. */
function recordGift({ giftId, giftName, diamonds, image, count }){
  const n = Math.max(1, Number(count) || 1);
  let key = (giftId != null && giftStats[String(giftId)]) ? String(giftId) : null;
  if (!key && giftName){
    key = Object.keys(giftStats).find(k => giftStats[k].name && giftStats[k].name.toLowerCase() === String(giftName).toLowerCase());
  }
  if (!key) key = String(giftId || giftName || '').trim();
  if (!key) return;
  const s = giftStats[key] || (giftStats[key] = { id: giftId, name: giftName || '', diamonds: 0, image: '', count: 0, coins: 0, last: 0 });
  if (giftId != null) s.id = giftId;            // adopta el id numérico real
  if (giftName) s.name = giftName;
  if (diamonds != null) s.diamonds = diamonds;
  if (image) s.image = image;                   // prefiere la foto REAL del Live sobre la local
  s.count += n;
  s.coins += (Number(diamonds) || 0) * n;
  s.last   = Date.now();
  saveStats();
  // descarga la foto a disco la 1ª vez (para que cargue siempre, sin depender del CDN)
  if (s.image && /^https?:/.test(s.image)){
    downloadGiftImage(s.id, s.image).then(local => { if (local){ s.image = local; saveStats(); broadcastStats(); } });
  }
}
/* lista de regalos conocidos, del MÁS enviado al menos enviado */
function statsList(){
  return Object.values(giftStats)
    .map(s => ({ id: s.id, name: s.name, diamonds: s.diamonds, image: s.image, count: s.count, coins: s.coins, last: s.last }))
    .sort((a, b) => b.count - a.count);
}
loadStats();
seedStats();                                   // asegura que TODO el catálogo esté en la BD (con foto)
backfillImages();                              // baja a disco las fotos que aún sean del CDN
// guardado final si se cierra el proceso
['SIGINT','SIGTERM','exit'].forEach(ev => process.on(ev, () => {
  if (saveTimer){ clearTimeout(saveTimer); saveTimer = null; }
  try { fs.writeFileSync(STATS_FILE, JSON.stringify({ gifts: giftStats }, null, 0)); } catch (_) {}
  if (ev !== 'exit') process.exit(0);
}));

/* ---------- 1) Servidor estatico del juego ---------- */
const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
};

const server = http.createServer((req, res) => {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  // las fotos de regalos descargadas viven en DATA_DIR (fuera del snapshot pkg, escribible)
  const base = urlPath.startsWith('/gift-img/') ? DATA_DIR : ROOT;
  const filePath = path.join(base, path.normalize(urlPath));
  // evita salir de la carpeta
  if (!filePath.startsWith(base)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------- 2) WebSocket: el juego se conecta aqui ---------- */
const wss = new WebSocketServer({ server });

function sendTo(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }
function broadcastStats(){                    // avisa a todos los juegos abiertos del ranking actualizado
  const list = statsList();
  wss.clients.forEach(c => { if (c.readyState === 1) sendTo(c, { type: 'giftstats', list }); });
}
let statsBcTimer = null;
function scheduleStatsBroadcast(){ if (statsBcTimer) return; statsBcTimer = setTimeout(() => { statsBcTimer = null; broadcastStats(); }, 1500); }

wss.on('connection', (ws) => {
  let tiktok = null;                         // conexion al Live de este cliente
  console.log('🎮 Juego conectado al puente.');
  sendTo(ws, { type: 'giftstats', list: statsList() });   // manda el ranking guardado al abrir el juego

  const cleanup = () => { if (tiktok) { try { tiktok.disconnect(); } catch (_) {} tiktok = null; } };

  ws.on('message', async (raw) => {
    let msg; try { msg = JSON.parse(raw.toString()); } catch { return; }

    /* --- conectar a un Live --- */
    if (msg.cmd === 'connect') {
      cleanup();
      const username = String(msg.username || '').replace(/^@/, '').trim();
      if (!username) return sendTo(ws, { type: 'status', state: 'error', msg: 'Falta el usuario de TikTok.' });

      sendTo(ws, { type: 'status', state: 'connecting', msg: `Conectando a @${username}…` });
      tiktok = new TikTokLiveConnection(username, { processInitialData: false });

      // REGALO: la API moderna trae el nombre/valor/foto dentro de data.gift (no hace falta
      // catálogo de pago). data.giftId, data.repeatCount, data.repeatEnd; data.gift.{name,diamondCount,type,image}.
      tiktok.on(WebcastEvent.GIFT, (data) => {
        const g = data.gift || {};
        const giftType = g.type;
        // combos (giftType 1): contar solo al terminar la racha, para no sumar de más.
        if (giftType === 1 && !data.repeatEnd) return;
        console.log(`🎁 GIFT name="${g.name || '?'}" id=${data.giftId} type=${giftType} x${data.repeatCount || 1} de ${uName(data.user)}`);
        const giftMsg = {
          type:     'gift',
          giftId:   Number(data.giftId) || data.giftId,
          giftName: g.name || '',
          count:    data.repeatCount || 1,
          diamonds: g.diamondCount || 0,
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
          picture:  img0(g.image) || img0(g.icon),
        };
        sendTo(ws, giftMsg);
        // BD local: registra el regalo (frecuencia + valor) y avisa el ranking actualizado
        recordGift({ giftId: giftMsg.giftId, giftName: giftMsg.giftName, diamonds: giftMsg.diamonds, image: giftMsg.picture, count: giftMsg.count });
        scheduleStatsBroadcast();
      });

      // COMENTARIO del chat: el texto está en data.content (no data.comment).
      tiktok.on(WebcastEvent.CHAT, (data) => {
        sendTo(ws, {
          type:     'comment',
          comment:  data.content || '',
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
        });
      });

      // LIKES en lote: data.count = los de este evento (no likeCount). Se atribuyen al último voto.
      tiktok.on(WebcastEvent.LIKE, (data) => {
        sendTo(ws, {
          type:     'like',
          count:    data.count || 1,
          total:    Number(data.total) || 0,
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
        });
      });

      // SEGUIR: alguien empezó a seguir la cuenta durante el Live (WebcastEvent.FOLLOW).
      if (WebcastEvent.FOLLOW) tiktok.on(WebcastEvent.FOLLOW, (data) => {
        sendTo(ws, {
          type:     'follow',
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
        });
      });

      // COMPARTIR: alguien compartió el Live (WebcastEvent.SHARE).
      if (WebcastEvent.SHARE) tiktok.on(WebcastEvent.SHARE, (data) => {
        sendTo(ws, {
          type:     'share',
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
        });
      });

      tiktok.on(WebcastEvent.STREAM_END, () => sendTo(ws, { type: 'status', state: 'ended', msg: 'El Live terminó.' }));
      tiktok.on('disconnected', () => sendTo(ws, { type: 'status', state: 'disconnected', msg: 'Desconectado del Live.' }));
      // IMPORTANTE: en Node, un evento 'error' sin manejar MATA el proceso (se caería el
      // puente y el juego mostraría "Conexión cerrada"). Lo capturamos y lo reportamos.
      tiktok.on('error', (err) => {
        // los errores de la v2 traen el texto legible en .info (o .message)
        let m = (err && (err.info || err.message));
        if (!m) { try { m = JSON.stringify(err); } catch { m = String(err); } }
        console.error('⚠️ Error de TikTok:', err);          // objeto completo en la ventana negra
        sendTo(ws, { type: 'status', state: 'error', msg: 'Error de TikTok: ' + m });
      });

      try {
        const st = await tiktok.connect();
        sendTo(ws, { type: 'status', state: 'connected', msg: `Conectado a @${username}`, roomId: st && st.roomId });
        console.log(`✅ Conectado al Live de @${username}.`);
        // NOTA: NO pedimos el catálogo oficial de regalos (tiktok.fetchAvailableGifts):
        // esa ruta es de PAGO (Business) y daba "Failed to fetch room gifts". El juego usa
        // su catálogo LOCAL y los regalos se mapean por NOMBRE, así que no hace falta.
      } catch (e) {
        sendTo(ws, { type: 'status', state: 'error', msg: 'No se pudo conectar: ' + (e && e.message || e) });
        console.error('❌ Error al conectar:', e && e.message || e);
      }
    }

    /* --- el juego pide el ranking de regalos guardado --- */
    if (msg.cmd === 'getstats') { sendTo(ws, { type: 'giftstats', list: statsList() }); }

    /* --- desconectar --- */
    if (msg.cmd === 'disconnect') {
      cleanup();
      sendTo(ws, { type: 'status', state: 'disconnected', msg: 'Desconectado.' });
    }
  });

  ws.on('close', cleanup);
  ws.on('error', cleanup);
});

server.listen(PORT, () => {
  console.log(`\n🏁 Carrera Live — puente TikTok activo`);
  console.log(`   Juego:     http://localhost:${PORT}`);
  console.log(`   WebSocket: ws://localhost:${PORT}\n`);
  // Si corre como .exe empaquetado (pkg), abre el navegador automáticamente.
  if (process.pkg) {
    try { require('child_process').exec(`start "" http://localhost:${PORT}`); } catch (_) {}
    console.log('   (Deja esta ventana abierta mientras juegas; ciérrala para detener.)\n');
  }
});
