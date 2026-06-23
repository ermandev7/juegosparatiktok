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
  const filePath = path.join(ROOT, path.normalize(urlPath));
  // evita salir de la raiz
  if (!filePath.startsWith(ROOT)) { res.writeHead(403); return res.end('Forbidden'); }
  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

/* ---------- 2) WebSocket: el juego se conecta aqui ---------- */
const wss = new WebSocketServer({ server });

function sendTo(ws, obj) { try { ws.send(JSON.stringify(obj)); } catch (_) {} }

wss.on('connection', (ws) => {
  let tiktok = null;                         // conexion al Live de este cliente
  console.log('🎮 Juego conectado al puente.');

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
        sendTo(ws, {
          type:     'gift',
          giftId:   Number(data.giftId) || data.giftId,
          giftName: g.name || '',
          count:    data.repeatCount || 1,
          diamonds: g.diamondCount || 0,
          user:     uName(data.user),
          uniqueId: uId(data.user),
          avatar:   img0(data.user && data.user.avatarThumb),
          picture:  img0(g.image) || img0(g.icon),
        });
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
