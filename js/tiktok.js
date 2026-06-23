/* ============================================================
   TIKTOK.JS — Cliente del puente TikTok Live (navegador)
   ------------------------------------------------------------
   - Se conecta por WebSocket al proceso server/bridge.js.
   - Recibe los REGALOS del Live y los entrega al juego.
   - Trae un catalogo de regalos (emoji + nombre + alias) para
     mapear "regalo -> competidor" y mostrar la leyenda.
   - Incluye TikTok.simulateGift(...) para probar sin estar en vivo.
   ============================================================ */
(() => {
  'use strict';

  /* Catalogo de regalos. `aliases` son los nombres que TikTok puede
     reportar (en ingles/espanol) en minusculas. `coste` = diamantes
     (informativo). Los baratos (1) son ideales para "1 punto". */
  // 12 regalos REALES de 1 moneda (confirmados en vivo). El `aliases` lleva el NOMBRE EXACTO
  // que envía TikTok (en minúsculas) para que el regalo mapee al competidor. 1 regalo = 1 punto.
  const GIFT_CATALOG = [
    { key:'rose',      emoji:'🌹', label:'Rose',         aliases:['rose','rosa'],                        coste:1 },
    { key:'tiktok',    emoji:'🎵', label:'TikTok',       aliases:['tiktok'],                             coste:1 },
    { key:'gg',        emoji:'🎮', label:'GG',           aliases:['gg'],                                 coste:1 },
    { key:'coffee',    emoji:'☕', label:'Coffee',       aliases:['coffee','café','cafe'],               coste:1 },
    { key:'icecream',  emoji:'🍦', label:'Ice Cream',    aliases:['ice cream cone','ice cream','helado'],coste:1 },
    { key:'heartpuff', emoji:'💗', label:'Heart Puff',   aliases:['heart puff'],                         coste:1 },
    { key:'rainbow',   emoji:'🌈', label:'Rainbow',      aliases:['rainbow'],                            coste:1 },
    { key:'orange',    emoji:'🧃', label:'Orange Juice', aliases:['orange juice'],                       coste:1 },
    { key:'cakeslice', emoji:'🍰', label:'Cake Slice',   aliases:['cake slice'],                         coste:1 },
    { key:'chili',     emoji:'🌶️', label:'Chili',        aliases:['chili'],                              coste:1 },
    { key:'tomato',    emoji:'🍅', label:'Tomato',       aliases:['tom the tomato','tomato'],            coste:1 },
    { key:'glowstick', emoji:'🔆', label:'Glow Stick',   aliases:['glow stick'],                         coste:1 },
  ];
  const byKey  = Object.fromEntries(GIFT_CATALOG.map(g => [g.key, g]));
  const norm   = s => String(s || '').toLowerCase().trim();
  const aliasIndex = {};                       // nombre normalizado -> key del catalogo
  GIFT_CATALOG.forEach(g => g.aliases.forEach(a => aliasIndex[norm(a)] = g.key));

  const pictures = {};                          // key -> URL de la foto REAL del regalo (del Live)
  const idIndex  = {};                           // giftId oficial -> key del catalogo
  const extras   = [];                          // regalos OFICIALES no curados (se añaden al pool)
  let liveLoaded = false;                        // ¿ya llegó el catalogo oficial?

  /* Dado el nombre de un regalo de TikTok, devuelve la key del catalogo (o null). */
  function giftKeyFromName(name){ return aliasIndex[norm(name)] || null; }

  /* Catalogo OFICIAL de TikTok (al conectar): enriquece los regalos curados con su
     foto/valor/id reales, y AÑADE el resto de regalos oficiales al pool para que,
     con muchos competidores, cada uno pueda tener un regalo único. Empareja por ID. */
  function ingestLiveGifts(list){
    extras.length = 0;
    (list || []).forEach(real => {
      if (real.id == null) return;
      const key = giftKeyFromName(real.name);
      if (key){                                  // ya está en el catálogo curado -> enriquece
        const g = byKey[key];
        if (real.image) g.image = real.image;
        if (real.diamonds != null) g.diamonds = real.diamonds;
        g.giftId = real.id; idIndex[real.id] = key;
      } else {                                   // regalo oficial nuevo -> al pool
        const k = 'g' + real.id;
        const g = { key: k, emoji: '🎁', label: real.name, aliases: [norm(real.name)],
                    diamonds: real.diamonds, coste: real.diamonds, image: real.image || '', giftId: real.id };
        byKey[k] = g; extras.push(g);
        aliasIndex[norm(real.name)] = k; idIndex[real.id] = k;
      }
    });
    liveLoaded = true;
  }

  /* Pool de regalos asignables: con catálogo oficial = curados + todos los oficiales. */
  function pool(){ return liveLoaded ? GIFT_CATALOG.concat(extras) : GIFT_CATALOG.slice(); }

  /* key del catalogo a partir de un regalo entrante: por ID oficial, si no por nombre. */
  function giftKeyFrom(m){ return (m.giftId != null && idIndex[m.giftId]) || giftKeyFromName(m.giftName); }

  /* Foto del regalo: foto OFICIAL > foto recibida en vivo > imagen local. */
  function giftImg(key){
    const g = byKey[key];
    return (g && g.image) || pictures[key] || (g ? `assets/gifts/${key}.png` : null);
  }

  /* ---------- conexion WebSocket ---------- */
  let ws = null, giftCb = null, statusCb = null, catalogCb = null;
  let commentCb = null, likeCb = null, followCb = null, shareCb = null, lastUser = '';

  function setStatus(state, msg){ if (statusCb) statusCb(state, msg); }

  function connect(username){
    lastUser = username;
    const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host;
    try { ws = new WebSocket(url); }
    catch(e){ setStatus('error', 'No se pudo abrir el WebSocket: ' + e.message); return; }

    ws.onopen = () => ws.send(JSON.stringify({ cmd:'connect', username }));
    ws.onclose = () => setStatus('disconnected', 'Conexión cerrada. ¿Está corriendo el puente (npm start)?');
    ws.onerror = () => setStatus('error', 'Error de WebSocket. Inicia el puente con: cd server && npm start');
    ws.onmessage = (ev) => {
      let m; try { m = JSON.parse(ev.data); } catch { return; }
      if (m.type === 'status') setStatus(m.state, m.msg);
      else if (m.type === 'gifts'){ ingestLiveGifts(m.list); if (catalogCb) catalogCb(); }
      else if (m.type === 'gift' && giftCb){
        m.key = giftKeyFrom(m);                 // mapea al catalogo (por id oficial o nombre)
        if (m.key && m.picture) pictures[m.key] = m.picture;   // guarda la foto real del regalo
        giftCb(m);
      }
      else if (m.type === 'comment' && commentCb) commentCb(m);
      else if (m.type === 'like'    && likeCb)    likeCb(m);
      else if (m.type === 'follow'  && followCb)  followCb(m);
      else if (m.type === 'share'   && shareCb)   shareCb(m);
    };
  }

  function disconnect(){
    if (ws){ try { ws.send(JSON.stringify({ cmd:'disconnect' })); ws.close(); } catch(_){} ws = null; }
    setStatus('disconnected', 'Desconectado.');
  }

  /* ---------- simulador (pruebas sin estar en vivo) ---------- */
  function simulateGift(giftKeyOrName, count = 1){
    const g = byKey[giftKeyOrName] || byKey[giftKeyFromName(giftKeyOrName)];
    const name = g ? g.aliases[0] : giftKeyOrName;
    if (giftCb) giftCb({ type:'gift', giftName:name, count, diamonds:(g?g.coste:1),
      user:'Tester', uniqueId:'tester', key:(g?g.key:giftKeyFromName(name)) });
  }

  /* simula la llegada del catalogo oficial (pruebas sin estar en vivo) */
  function simulateCatalog(list){ ingestLiveGifts(list); if (catalogCb) catalogCb(); }

  /* simuladores de comentario / like (pruebas sin estar en vivo) */
  function simulateComment(text, user, uniqueId){
    if (commentCb) commentCb({ type:'comment', comment:text, user:user||'Tester', uniqueId:uniqueId||'tester' });
  }
  function simulateLike(count, user, uniqueId){
    if (likeCb) likeCb({ type:'like', count:count||1, user:user||'Tester', uniqueId:uniqueId||'tester' });
  }
  function simulateFollow(user, uniqueId){
    if (followCb) followCb({ type:'follow', user:user||'Tester', uniqueId:uniqueId||'tester' });
  }
  function simulateShare(user, uniqueId){
    if (shareCb) shareCb({ type:'share', user:user||'Tester', uniqueId:uniqueId||'tester' });
  }

  window.TikTok = {
    GIFT_CATALOG, byKey, giftKeyFromName, giftImg, pool,
    connect, disconnect, simulateGift, simulateCatalog, simulateComment, simulateLike,
    simulateFollow, simulateShare,
    onGift:    cb => giftCb = cb,
    onStatus:  cb => statusCb = cb,
    onCatalog: cb => catalogCb = cb,
    onComment: cb => commentCb = cb,
    onLike:    cb => likeCb = cb,
    onFollow:  cb => followCb = cb,
    onShare:   cb => shareCb = cb,
    isLive:    () => liveLoaded,
    isOpen:    () => !!ws && ws.readyState === 1,
  };
})();
