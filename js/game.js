/* ============================================================
   GAME.JS — Motor de la plataforma "Carrera Live"
   Pantallas: MENÚ -> CONFIG -> JUEGO -> GANADOR
   Integración TikFinity: el juego escucha 'keydown'. En TikFinity
   asigna cada acción (regalo/like/comentario) a la tecla de un competidor.
   ============================================================ */
(() => {
  'use strict';

  const KEY_POOL = '1234567890qwertyuiopasdfghjklñzxcvbnm'.split('');

  const state = {
    gameId: null,
    catId: null,
    winmode: 'tiempo', target: 30, duration: 60,
    teamMode: false, teamCount: 2,
    roster: [],          // {id,name,sub,color,icon?,abbr?,_av,key,on,teamId,gift,giftPts,word}
    racers: [],          // unidades que corren (individual o equipo)
    running: false, paused: false, startTs: 0, pausedAt: 0,
    rafTimer: null, keyMap: new Map(), listeningInput: null,
    // TikTok: comentarios (palabra clave) y likes (atribuidos al último voto)
    commentsOn: true, commentPts: 1, likesOn: true, likesPer: 10, likePts: 1,
    // TikTok: seguir / compartir (atribuidos al último voto del espectador)
    followOn: true, followPts: 3, shareOn: true, sharePts: 2,
    wordMap: new Map(),     // palabra clave -> {racer, pts}
    userLast: new Map(),    // uniqueId del espectador -> racer al que votó por última vez
    likeBuf: new Map(),     // uniqueId -> likes acumulados pendientes de convertir a puntos
    ttConnected: false,     // ¿conectado a un Live? (Paso 2 bloqueado hasta que sea true)
  };

  /* normaliza texto a minúsculas sin acentos (para comparar palabras clave) */
  const noAcc = s => String(s || '').toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '').trim();
  /* escapa texto para insertarlo seguro en HTML (palabras clave escritas a mano) */
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c =>
    ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' }[c]));

  /* ---------- helpers ---------- */
  const $  = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const screens = { menu: $('#menu'), setup: $('#setup'), game: $('#game'), win: $('#winScreen') };
  const show = name => { Object.values(screens).forEach(s => s.classList.remove('active')); screens[name].classList.add('active'); };
  const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
  /* segundos -> "m:ss" para el reloj grande. mmss fuerza el formato 0:ss
     (cuando la duración total es ≥60) para no saltar de "1:00" a "59". */
  const fmtTime = (s, mmss) => { s = Math.max(0, Math.ceil(s)); const m = (s/60)|0, ss = s%60;
    return (m || mmss) ? m + ':' + String(ss).padStart(2,'0') : String(ss); };

  /* ============================================================
     SONIDOS DE PELEA (Web Audio API — sintetizados, sin archivos, offline)
     ============================================================ */
  const SFX = (function(){
    let ctx, master, muted = false;
    function ac(){
      if (!ctx){
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain(); master.gain.value = muted ? 0 : 0.9;
        const comp = ctx.createDynamicsCompressor(); // evita saturación al solaparse golpes
        master.connect(comp).connect(ctx.destination);
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }
    function noise(c, dur){
      const n = Math.floor(c.sampleRate * dur);
      const buf = c.createBuffer(1, n, c.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < n; i++) d[i] = Math.random()*2 - 1;
      const src = c.createBufferSource(); src.buffer = buf; return src;
    }
    // golpe: cuerpo grave + impacto ruidoso (ligera variación de tono)
    function punch(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const f0 = 150 + Math.random()*90;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(55, t+0.12);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.8, t+0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.18);
      o.connect(g).connect(master); o.start(t); o.stop(t+0.2);
      const nb = noise(c, 0.09), lp = c.createBiquadFilter(), ng = c.createGain();
      lp.type = 'lowpass'; lp.frequency.value = 1100 + Math.random()*500;
      ng.gain.setValueAtTime(0.55, t); ng.gain.exponentialRampToValueAtTime(0.0001, t+0.09);
      nb.connect(lp).connect(ng).connect(master); nb.start(t); nb.stop(t+0.1);
    }
    function ding(c, t, freq){
      [1, 2.76, 5.4].forEach((mul, i) => {
        const o = c.createOscillator(); o.type = 'sine'; o.frequency.value = freq*mul;
        const g = c.createGain(); const amp = [0.5,0.25,0.12][i];
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(amp, t+0.004);
        g.gain.exponentialRampToValueAtTime(0.0001, t+0.7);
        o.connect(g).connect(master); o.start(t); o.stop(t+0.72);
      });
    }
    function bell(){   // campana de ring: ding-ding-ding
      const c = ac(); if (!c) return; const t = c.currentTime;
      ding(c, t, 860); ding(c, t+0.22, 860); ding(c, t+0.44, 860);
    }
    function bellEnd(){ const c = ac(); if (!c) return; ding(c, c.currentTime, 780); } // fin de round (empate)
    function ko(){     // KO: tono descendente + golpe seco
      const c = ac(); if (!c) return; const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(420, t); o.frequency.exponentialRampToValueAtTime(60, t+0.5);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.55);
      const lp = c.createBiquadFilter(); lp.type='lowpass'; lp.frequency.value=1500;
      o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t+0.6);
      punch();
    }
    function cheer(){  // ovación del público (ruido filtrado que sube y baja)
      const c = ac(); if (!c) return; const t = c.currentTime;
      const nb = noise(c, 1.4), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 1000; bp.Q.value = 0.5;
      g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(0.42, t+0.35);
      g.gain.linearRampToValueAtTime(0.30, t+0.9); g.gain.linearRampToValueAtTime(0.0001, t+1.4);
      nb.connect(bp).connect(g).connect(master); nb.start(t); nb.stop(t+1.45);
    }
    // fútbol: patada al balón (golpe seco + "pock" del contacto)
    function kick(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(160 + Math.random()*40, t); o.frequency.exponentialRampToValueAtTime(48, t+0.08);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.85, t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
      o.connect(g).connect(master); o.start(t); o.stop(t+0.13);
      const nb = noise(c, 0.05), bp = c.createBiquadFilter(), ng = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 480 + Math.random()*200; bp.Q.value = 1.2;
      ng.gain.setValueAtTime(0.5, t); ng.gain.exponentialRampToValueAtTime(0.0001, t+0.05);
      nb.connect(bp).connect(ng).connect(master); nb.start(t); nb.stop(t+0.06);
    }
    // silbato del árbitro (con trino tipo "pea whistle") de duración variable
    function whistle(dur){
      const c = ac(); if (!c) return; const t = c.currentTime; dur = dur || 0.45;
      const o = c.createOscillator(); o.type = 'triangle'; o.frequency.value = 2300;
      const lfo = c.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 24;
      const lfoG = c.createGain(); lfoG.gain.value = 130; lfo.connect(lfoG).connect(o.frequency);
      const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 2300; bp.Q.value = 6;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.4, t+0.02);
      g.gain.setValueAtTime(0.4, t+dur-0.06); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      o.connect(bp).connect(g).connect(master);
      o.start(t); o.stop(t+dur+0.02); lfo.start(t); lfo.stop(t+dur+0.02);
    }
    function whistleEnd(){ whistle(0.18); setTimeout(() => whistle(0.18), 210); setTimeout(() => whistle(0.6), 420); }
    // comidas: mordisco/crunch (ruido crujiente + cuerpo "ñam")
    function crunch(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const nb = noise(c, 0.06), bp = c.createBiquadFilter(), g = c.createGain();
      bp.type = 'bandpass'; bp.frequency.value = 800 + Math.random()*1800; bp.Q.value = 2.2;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t+0.004);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.06);
      nb.connect(bp).connect(g).connect(master); nb.start(t); nb.stop(t+0.07);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(230, t); o.frequency.exponentialRampToValueAtTime(120, t+0.06);
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.25, t+0.005);
      og.gain.exponentialRampToValueAtTime(0.0001, t+0.07);
      o.connect(og).connect(master); o.start(t); o.stop(t+0.08);
    }
    // comidas: campana de servicio (¡orden lista!)
    function serveBell(){ const c = ac(); if (!c) return; const t = c.currentTime; ding(c, t, 1245); ding(c, t+0.16, 1660); }
    // resistencia: pistola de salida (bang seco)
    function startGun(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const nb = noise(c, 0.12), hp = c.createBiquadFilter(), g = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 500;
      g.gain.setValueAtTime(0.9, t); g.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
      nb.connect(hp).connect(g).connect(master); nb.start(t); nb.stop(t+0.13);
      const o = c.createOscillator(); o.type = 'sine';
      o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(40, t+0.1);
      const og = c.createGain(); og.gain.setValueAtTime(0.7, t); og.gain.exponentialRampToValueAtTime(0.0001, t+0.12);
      o.connect(og).connect(master); o.start(t); o.stop(t+0.13);
    }
    // resistencia: tic de pedaleo/zancada (corto y agudo)
    function pedal(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const nb = noise(c, 0.03), hp = c.createBiquadFilter(), g = c.createGain();
      hp.type = 'highpass'; hp.frequency.value = 2500;
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.35, t+0.002);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.03);
      nb.connect(hp).connect(g).connect(master); nb.start(t); nb.stop(t+0.04);
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 1800 + Math.random()*400;
      const og = c.createGain();
      og.gain.setValueAtTime(0.0001, t); og.gain.exponentialRampToValueAtTime(0.12, t+0.002);
      og.gain.exponentialRampToValueAtTime(0.0001, t+0.025);
      o.connect(og).connect(master); o.start(t); o.stop(t+0.03);
    }
    // bocina de aire (meta de resistencia / desempate)
    function horn(dur){
      const c = ac(); if (!c) return; const t = c.currentTime; dur = dur || 0.5;
      const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 1400;
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.45, t+0.03);
      g.gain.setValueAtTime(0.45, t+dur-0.08); g.gain.exponentialRampToValueAtTime(0.0001, t+dur);
      [150, 189].forEach(f => { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; o.connect(lp); o.start(t); o.stop(t+dur+0.02); });
      lp.connect(g).connect(master);
    }
    // motos: acelerón corto (vroom)
    function rev(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(80, t);
      o.frequency.exponentialRampToValueAtTime(420 + Math.random()*120, t+0.09);
      o.frequency.exponentialRampToValueAtTime(160, t+0.18);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(600, t); lp.frequency.exponentialRampToValueAtTime(3000, t+0.09);
      lp.frequency.exponentialRampToValueAtTime(900, t+0.18);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t+0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t+0.2);
      o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t+0.22);
    }
    // motos: rugido largo (arranque / victoria)
    function revBig(){
      const c = ac(); if (!c) return; const t = c.currentTime;
      const o = c.createOscillator(); o.type = 'sawtooth';
      o.frequency.setValueAtTime(70, t);
      o.frequency.exponentialRampToValueAtTime(180, t+0.15);
      o.frequency.exponentialRampToValueAtTime(95, t+0.32);
      o.frequency.exponentialRampToValueAtTime(520, t+0.72);
      const lp = c.createBiquadFilter(); lp.type = 'lowpass';
      lp.frequency.setValueAtTime(700, t); lp.frequency.exponentialRampToValueAtTime(3600, t+0.72);
      const g = c.createGain();
      g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.5, t+0.05);
      g.gain.setValueAtTime(0.5, t+0.62); g.gain.exponentialRampToValueAtTime(0.0001, t+0.85);
      o.connect(lp).connect(g).connect(master); o.start(t); o.stop(t+0.9);
    }
    /* ---- AMBIENTE DE PÚBLICO (gentío de estadio que sube con likes / compartidos) ----
       Una "cama" de murmullo filtrado siempre sonando (casi en silencio en reposo) cuyo
       volumen sigue una variable de ENERGÍA. Cada like/compartido la sube y lanza un
       estallido de ovación proporcional (más likes/compartidos = más fuerte). Cada juego
       tiene su timbre: fútbol lleva un "drone" tipo vuvuzela, boxeo añade palmas, etc. */
    const crowd = (() => {
      let running = false, theme = 'futbol', energy = 0, timer = null;
      let bedSrc = null, bedGain = null, droneOsc = null, droneGain = null;
      // frecuencia central del gentío por escenario (el id del juego o su 'scenario')
      const FREQ = { futbol:520, cancha:520, boxeo:980, ring:980, comidas:680, cocina:680,
                     resistencia:600, ruta:600, motos:820, circuito:820 };
      function start(th){
        const c = ac(); if (!c) return;
        if (running) stop();
        theme = th || 'futbol'; energy = 0; running = true;
        // cama: ruido rosado (integrado) filtrado en banda -> "murmullo de multitud"
        const n = Math.floor(c.sampleRate * 2), buf = c.createBuffer(1, n, c.sampleRate), d = buf.getChannelData(0);
        let last = 0;
        for (let i = 0; i < n; i++){ const w = Math.random()*2 - 1; last = (last + 0.02*w) / 1.02; d[i] = last * 3.2; }
        bedSrc = c.createBufferSource(); bedSrc.buffer = buf; bedSrc.loop = true;
        const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = FREQ[theme] || 600; bp.Q.value = 0.8;
        bedGain = c.createGain(); bedGain.gain.value = 0.0001;
        bedSrc.connect(bp).connect(bedGain).connect(master); bedSrc.start();
        // drone temático grave (vuvuzela en fútbol, retumbe en boxeo) que asoma con energía alta
        droneOsc = c.createOscillator();
        droneOsc.type = (theme==='boxeo'||theme==='ring') ? 'square' : 'sawtooth';
        droneOsc.frequency.value = (theme==='futbol'||theme==='cancha') ? 116 : 72;
        const dlp = c.createBiquadFilter(); dlp.type = 'lowpass'; dlp.frequency.value = 420;
        droneGain = c.createGain(); droneGain.gain.value = 0.0001;
        droneOsc.connect(dlp).connect(droneGain).connect(master); droneOsc.start();
        tick();
      }
      function tick(){
        if (!running) return;
        energy *= 0.92;                                       // se enfría poco a poco
        if (energy < 0.0005) energy = 0;
        const c = ac();
        if (c && bedGain){
          bedGain.gain.setTargetAtTime(Math.max(0.0001, Math.min(0.5, energy*0.42)), c.currentTime, 0.25);
          droneGain.gain.setTargetAtTime(Math.max(0.0001, Math.min(0.11, (energy-0.7)*0.11)), c.currentTime, 0.3);
        }
        timer = setTimeout(tick, 180);
      }
      // sube la energía y lanza una ovación proporcional (amount ~ cuántos likes/compartidos)
      function bump(amount){
        if (!running) start(theme);
        amount = Math.max(0.2, Math.min(3, amount));
        energy = Math.min(3.4, energy + amount);
        burst(amount);
      }
      function burst(amount){
        const c = ac(); if (!c) return; const t = c.currentTime;
        const dur = 0.45 + amount * 0.28;
        const nb = noise(c, dur), bp = c.createBiquadFilter(), g = c.createGain();
        bp.type = 'bandpass'; bp.frequency.value = (FREQ[theme] || 600) * 1.25; bp.Q.value = 0.5;
        const peak = Math.min(0.5, 0.12 + amount * 0.14);
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.18);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        nb.connect(bp).connect(g).connect(master); nb.start(t); nb.stop(t + dur + 0.02);
        const fut = (theme==='futbol'   || theme==='cancha');
        const atl = (theme==='resistencia'|| theme==='ruta' || theme==='pista');
        if (theme==='boxeo' || theme==='ring'){                // boxeo: palmas del público
          const claps = Math.round(2 + amount * 2);
          for (let i = 0; i < claps; i++) setTimeout(clap, i*85 + Math.random()*40);
        }
        if (fut || atl){                                       // fútbol/atletismo: silbidos
          if (Math.random() < (fut ? 0.7 : 0.5)) setTimeout(() => whistle(0.15 + Math.random()*0.1), Math.random()*220);
        }
        if (fut){                                              // fútbol: tambor de barra (3 golpes)
          for (let i = 0; i < 3; i++) setTimeout(drum, 110 + i*180);
        }
      }
      // golpe grave de tambor (barra de fútbol)
      function drum(){
        const c = ac(); if (!c) return; const t = c.currentTime;
        const o = c.createOscillator(); o.type = 'sine';
        o.frequency.setValueAtTime(120, t); o.frequency.exponentialRampToValueAtTime(52, t+0.13);
        const g = c.createGain();
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.32, t+0.005);
        g.gain.exponentialRampToValueAtTime(0.0001, t+0.2);
        o.connect(g).connect(master); o.start(t); o.stop(t+0.22);
      }
      function clap(){
        const c = ac(); if (!c) return; const t = c.currentTime;
        const nb = noise(c, 0.04), hp = c.createBiquadFilter(), g = c.createGain();
        hp.type = 'highpass'; hp.frequency.value = 1500;
        g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(0.22, t + 0.003);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
        nb.connect(hp).connect(g).connect(master); nb.start(t); nb.stop(t + 0.06);
      }
      function stop(){
        running = false; if (timer){ clearTimeout(timer); timer = null; }
        try { if (bedSrc)   bedSrc.stop(); }   catch(_){}
        try { if (droneOsc) droneOsc.stop(); } catch(_){}
        bedSrc = droneOsc = bedGain = droneGain = null; energy = 0;
      }
      return { start, bump, stop, setTheme: t => theme = t };
    })();

    function setMuted(m){ muted = m; if (master) master.gain.value = m ? 0 : 0.9; }
    return { init: ac, punch, bell, bellEnd, ko, cheer, kick, whistle, whistleEnd, crunch, serveBell,
             startGun, pedal, horn, rev, revBig, crowd, setMuted, isMuted: () => muted };
  })();

  function normEvent(e){
    const p = [];
    if (e.ctrlKey)  p.push('ctrl');
    if (e.altKey)   p.push('alt');
    if (e.shiftKey) p.push('shift');
    let k = (e.key || '').toLowerCase();
    if (k === ' ') k = 'space';
    if (!['control','alt','shift','meta'].includes(k)) p.push(k);
    return p.join('+');
  }
  const niceKey = k => (k || '—').toUpperCase().replace('SPACE','␣');

  /* color de texto legible sobre un fondo */
  function textOn(hex){
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    const r=(n>>16)&255, g=(n>>8)&255, b=n&255;
    return (0.299*r + 0.587*g + 0.114*b) > 150 ? '#15151f' : '#ffffff';
  }
  function shade(hex, percent){
    const h = hex.replace('#','');
    const n = parseInt(h.length === 3 ? h.split('').map(c=>c+c).join('') : h, 16);
    let r=(n>>16)&255, g=(n>>8)&255, b=n&255, f=percent/100;
    r=clamp(Math.round(r+r*f),0,255); g=clamp(Math.round(g+g*f),0,255); b=clamp(Math.round(b+b*f),0,255);
    return `rgb(${r},${g},${b})`;
  }

  /* avatar: flag (img) | emoji | badge(color+abbr/icon) | photo (foto Wikipedia) */
  function badgeHTML(c, size){
    const cls = 'badge ' + (size === 'sm' ? 'b-sm' : (size === 'xl' ? 'b-xl' : 'b-lg'));
    const inner = c.abbr || (c.name || '').slice(0,3).toUpperCase();
    return `<span class="${cls}" style="background:${c.color};color:${textOn(c.color)}">${inner}</span>`;
  }
  function avatarHTML(c, size){
    if (c._av === 'flag'){
      const cls = size === 'sm' ? 'flag-sm' : (size === 'xl' ? 'flag-xl' : 'flag');
      return `<img class="${cls}" src="https://flagcdn.com/w320/${c.id.toLowerCase()}.png" alt="${c.name}" loading="lazy">`;
    }
    if (c._av === 'emoji'){
      const fs = size === 'sm' ? '22px' : (size === 'xl' ? '88px' : '38px');
      return `<span class="emoji" style="font-size:${fs}">${c.icon || '⭐'}</span>`;
    }
    if (c._av === 'photo'){
      const ps = size === 'sm' ? 'p-sm' : (size === 'xl' ? 'p-xl' : 'p-lg');
      const bs = size === 'sm' ? 'b-sm' : (size === 'xl' ? 'b-xl' : 'b-lg');
      const inner = c.abbr || (c.name || '').slice(0,3).toUpperCase();
      // foto local; si falta el archivo, cae a la insignia (onerror)
      return `<span class="ava-photo">`
        + `<img class="photo ${ps}" src="assets/fotos/${c.id}.jpg" alt="${c.name}" style="border-color:${c.color}" `
        + `onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">`
        + `<span class="badge ${bs}" style="display:none;background:${c.color};color:${textOn(c.color)}">${inner}</span>`
        + `</span>`;
    }
    // fallback: insignia de color (para 'badge')
    return badgeHTML(c, size);
  }

  /* ---------- acceso a datos ---------- */
  const game = () => GAMES[state.gameId];
  function sourceList(){
    const g = game();
    if (g.categories) return g.categories[state.catId];
    return g; // el propio juego trae avatar + competitors
  }

  /* ============================================================
     MENÚ DE JUEGOS
     ============================================================ */
  function renderMenu(){
    const grid = $('#gameGrid');
    grid.innerHTML = '';
    Object.values(GAMES).filter(g => !g.hidden).forEach((g, i) => {   // omite los juegos ocultos
      let count = g.categories
        ? Object.values(g.categories).reduce((a,c)=>a+c.competitors.length,0)
        : g.competitors.length;
      const card = document.createElement('div');
      card.className = 'game-card';
      card.innerHTML = `
        <div class="gc-num">${i+1}</div>
        <span class="gc-em">${g.emoji}</span>
        <div class="gc-nm">${g.name}</div>
        <div class="gc-ct">${count} competidores${g.categories ? ' · '+Object.keys(g.categories).length+' categorías' : ''}</div>`;
      card.onclick = () => openGame(g.id);
      grid.appendChild(card);
    });
  }

  /* ============================================================
     CONFIGURACIÓN DE JUEGO
     ============================================================ */
  function openGame(id){
    // Paso a paso: no se puede elegir juego sin estar conectado al Live.
    if (!state.ttConnected){
      const s1 = document.getElementById('step1'); if (s1) s1.scrollIntoView({ behavior:'smooth', block:'center' });
      const u = document.getElementById('ttUser'); if (u) u.focus();
      return;
    }
    state.gameId = id;
    const g = game();
    state.catId = g.categories ? Object.keys(g.categories)[0] : null;
    state.teamMode = false; state.teamCount = 2;
    $('#teamMode').checked = false; $('#teamCountRow').hidden = true;

    $('#setupTitle').textContent = `${g.emoji} ${g.name}`;
    $('#instrList').innerHTML = g.instructions.map(s => `<li>${s}</li>`).join('');

    // categorías
    const catCard = $('#catCard');
    if (g.categories){
      catCard.hidden = false;
      const tabs = $('#catTabs'); tabs.innerHTML = '';
      Object.entries(g.categories).forEach(([cid, c]) => {
        const b = document.createElement('button');
        b.className = 'cat-tab' + (cid === state.catId ? ' sel' : '');
        b.textContent = c.name;
        b.dataset.cid = cid;
        b.onclick = () => selectCat(cid);
        tabs.appendChild(b);
      });
    } else catCard.hidden = true;

    refreshRoster();

    // Presets según el juego:
    // - versusOnly (Fútbol): se OCULTA "Todos contra todos"; arranca en 1 vs 1 (duelo).
    // - individualOnly (Bandera de Países): se OCULTAN 1v1/2v2/3v3 y el modo equipos;
    //   queda solo "Todos contra todos" y arranca ahí (solo los que tienen regalo).
    const indivBtn = document.querySelector('.preset[data-preset="individual"]');
    const versusBtns = ['1v1','2v2','3v3'].map(k => document.querySelector(`.preset[data-preset="${k}"]`));
    const teamToggle = document.querySelector('.team-toggle');
    // reset (se comparten entre juegos): mostrar todo y luego ocultar según el juego
    if (indivBtn) indivBtn.style.display = '';
    versusBtns.forEach(b => { if (b) b.style.display = ''; });
    if (teamToggle) teamToggle.style.display = '';

    if (g.versusOnly){
      if (indivBtn) indivBtn.style.display = 'none';
      applyPreset('1v1');
    } else if (g.individualOnly){
      versusBtns.forEach(b => { if (b) b.style.display = 'none'; });
      if (teamToggle) teamToggle.style.display = 'none';
      $('#teamCountRow').hidden = true;
      applyPreset('individual');
    } else if (g.individualDefault){
      applyPreset('individual');
    }

    show('setup');
  }

  /* cambia de categoría sin reiniciar toda la pantalla */
  function selectCat(cid){
    state.catId = cid;
    $$('#catTabs .cat-tab').forEach(t => t.classList.toggle('sel', t.dataset.cid === cid));
    refreshRoster();
  }

  /* carga el roster y lo pinta */
  function refreshRoster(){
    loadRoster();
    renderRoster();
  }

  function loadRoster(){
    const src = sourceList();
    const av = src.avatar || 'emoji';
    state.roster = src.competitors.map((c, i) => ({
      ...c, _av: av,
      key: c.key || KEY_POOL[i] || '',
      on: true,
      teamId: (i % 2) + 1,
      gift: null, giftPts: 1,        // se asigna (único) en autoAssignGifts()
      word: String(i + 1),           // palabra clave del chat (default: su número de lista)
    }));
    autoAssignGifts();
  }

  /* regalos asignables (baratos primero). Con catálogo oficial = todos los de TikTok. */
  function giftPool(){
    const cat = (window.TikTok && (window.TikTok.pool ? window.TikTok.pool() : window.TikTok.GIFT_CATALOG)) || [];
    const val = g => (g.diamonds != null ? g.diamonds : g.coste);
    return [...cat].sort((a,b) => val(a) - val(b));
  }

  /* Asigna a cada participante un regalo ÚNICO (del más barato al más caro).
     No toca los que el admin cambió a mano (p._giftManual). Si no hay regalos
     suficientes (offline con muchos competidores), los sobrantes quedan sin regalo. */
  function autoAssignGifts(){
    const pool = giftPool();
    const used = new Set(state.roster.filter(p => p._giftManual && p.gift).map(p => p.gift));
    let i = 0;
    state.roster.forEach(p => {
      if (p.giftPts == null) p.giftPts = 1;
      if (p._giftManual) return;
      while (i < pool.length && used.has(pool[i].key)) i++;
      p.gift = i < pool.length ? pool[i].key : null;
      if (p.gift){ used.add(p.gift); i++; }
    });
  }
  /* <option> para el selector de regalo de cada competidor (con su valor en 💎) */
  function giftOptions(sel){
    const opts = ['<option value="">— sin regalo —</option>'];
    giftPool().forEach(g => {
      const d = g.diamonds != null ? g.diamonds : g.coste;
      opts.push(`<option value="${g.key}" ${g.key===sel?'selected':''}>${g.emoji} ${g.label} · ${d}💎</option>`);
    });
    return opts.join('');
  }
  /* datos del catalogo a partir de la key */
  function giftInfo(key){ return (window.TikTok && window.TikTok.byKey[key]) || null; }

  function renderRoster(){
    const box = $('#roster');
    box.innerHTML = '';
    state.roster.forEach((p, idx) => {
      const row = document.createElement('div');
      row.className = 'player-row' + (p.on ? '' : ' off');
      const teamSel = state.teamMode ? `
        <select class="pteam" title="Equipo">
          ${Array.from({length: state.teamCount}, (_,t)=>`<option value="${t+1}" ${p.teamId===t+1?'selected':''}>E${t+1}</option>`).join('')}
        </select>` : '';
      row.innerHTML = `
        <input type="checkbox" class="pcheck" ${p.on?'checked':''} title="Participa">
        <span class="picon">${avatarHTML(p,'sm')}</span>
        <div class="pinfo">
          <div class="pname">${p.name}</div>
          <div class="psub">${p.sub||''}</div>
        </div>
        ${teamSel}
        <button class="pkey" title="Clic y pulsa una tecla">${niceKey(p.key)}</button>
        <input class="pword" type="text" value="${p.word||''}" maxlength="20" title="Palabra que el chat comenta para votar por este competidor" placeholder="palabra">
        <select class="pgift" title="Regalo de TikTok que suma a este competidor">${giftOptions(p.gift)}</select>
        <input class="pgiftpts" type="number" value="${p.giftPts||1}" min="0" max="999" title="Puntos que da este regalo (×combo)">`;
      $('.pcheck', row).onchange = e => { p.on = e.target.checked; row.classList.toggle('off', !p.on); };
      $('.pkey', row).onclick = e => captureKey(p, e.target);
      const ts = $('.pteam', row); if (ts) ts.onchange = e => p.teamId = +e.target.value;
      const ws = $('.pword', row); if (ws) ws.oninput = e => p.word = e.target.value;
      const gs = $('.pgift', row); if (gs) gs.onchange = e => { p.gift = e.target.value || null; p._giftManual = true; };
      const ps = $('.pgiftpts', row); if (ps) ps.oninput = e => p.giftPts = clamp(+e.target.value || 1, 0, 999);
      box.appendChild(row);
    });
  }

  function captureKey(player, btn){
    if (state.listeningInput) state.listeningInput.classList.remove('listening');
    state.listeningInput = btn; btn.classList.add('listening'); btn.textContent = 'pulsa…';
    const onKey = e => {
      e.preventDefault();
      if (e.key === 'Escape'){ done(); return; }
      if (['Control','Alt','Shift','Meta'].includes(e.key)) return;
      player.key = normEvent(e); done();
    };
    function done(){
      window.removeEventListener('keydown', onKey, true);
      btn.classList.remove('listening'); btn.textContent = niceKey(player.key);
      state.listeningInput = null;
    }
    window.addEventListener('keydown', onKey, true);
  }

  function toggleAll(v){ state.roster.forEach(p => p.on = v); renderRoster(); }

  /* ---------- presets de enfrentamiento ---------- */
  function applyPreset(preset){
    if (preset === 'individual'){
      state.teamMode = false; $('#teamMode').checked = false; $('#teamCountRow').hidden = true;
      // SOLO los que tienen regalo asignado (12 disponibles), así cada competidor del
      // "todos contra todos" tiene su regalo y su foto. Si alguno ya tenía regalo manual, también.
      const conRegalo = state.roster.filter(p => p.gift);
      state.roster.forEach(p => p.on = !!p.gift);
      // si por lo que sea ninguno tiene regalo (sin catálogo), deja todos como respaldo
      if (!conRegalo.length) state.roster.forEach(p => p.on = true);
      renderRoster(); return;
    }
    const n = +preset[0]; // 1v1->1, 3v3->3
    state.teamMode = true; state.teamCount = 2;
    $('#teamMode').checked = true; $('#teamCountRow').hidden = false; $('#teamCount').value = '2';
    state.roster.forEach((p, i) => {
      if (i < n)       { p.on = true;  p.teamId = 1; }
      else if (i < 2*n){ p.on = true;  p.teamId = 2; }
      else             { p.on = false; }
    });
    renderRoster();
  }

  /* ============================================================
     INICIAR PARTIDA
     ============================================================ */
  function computeRacers(){
    const active = state.roster.filter(p => p.on);
    if (!state.teamMode){
      return active.map(p => ({
        id: p.id, name: p.name, sub: p.sub, color: p.color,
        members: [p], keys: [p.key], score: 0
      }));
    }
    const teams = {};
    active.forEach(p => {
      const t = clamp(p.teamId, 1, state.teamCount);
      (teams[t] = teams[t] || []).push(p);
    });
    return Object.entries(teams).map(([t, members]) => ({
      id: 'team'+t,
      name: members.length === 1 ? members[0].name : 'Equipo '+t,
      sub:  members.length === 1 ? members[0].sub  : members.map(m=>m.name).join(' + '),
      color: members[0].color, members, keys: members.map(m=>m.key), score: 0
    }));
  }

  function startGame(){
    state.winmode  = $('input[name=winmode]:checked').value;
    state.target   = clamp(+$('#targetPoints').value || 30, 3, 9999);
    state.duration = clamp(+$('#durationSecs').value || 60, 10, 3600);

    // TikTok: comentarios y likes (lee los controles de la tarjeta TikTok)
    state.commentsOn = $('#commentsOn') ? $('#commentsOn').checked : true;
    state.commentPts = clamp(+($('#commentPts') && $('#commentPts').value) || 1, 0, 999);
    state.likesOn    = $('#likesOn') ? $('#likesOn').checked : true;
    state.likesPer   = clamp(+($('#likesPer') && $('#likesPer').value) || 10, 1, 99999);
    state.likePts    = clamp(+($('#likePts') && $('#likePts').value) || 1, 0, 999);
    state.followOn   = $('#followOn') ? $('#followOn').checked : true;
    state.followPts  = clamp(+($('#followPts') && $('#followPts').value) || 3, 0, 999);
    state.shareOn    = $('#shareOn') ? $('#shareOn').checked : true;
    state.sharePts   = clamp(+($('#sharePts') && $('#sharePts').value) || 2, 0, 999);

    const active = state.roster.filter(p => p.on);
    if (active.length < 2){ alert('Marca al menos 2 participantes 🙂'); return; }

    // teclas válidas y sin repetir
    const seen = new Map();
    for (const p of active){
      if (!p.key){ alert(`${p.name} no tiene tecla asignada.`); return; }
      if (seen.has(p.key)){ alert(`La tecla "${niceKey(p.key)}" está repetida (${seen.get(p.key)} y ${p.name}).`); return; }
      seen.set(p.key, p.name);
    }

    state.racers = computeRacers();
    if (state.racers.length < 2){ alert('Necesitas al menos 2 equipos/competidores.'); return; }

    state.keyMap = new Map();
    state.racers.forEach(r => r.keys.forEach(k => state.keyMap.set(k, r)));

    // mapa regalo -> competidor (cada miembro aporta su regalo a su equipo).
    // "primero gana": si por error dos comparten regalo, no se pisa al primero.
    state.giftMap = new Map();
    state.racers.forEach(r => r.members.forEach(m => {
      if (m.gift && !state.giftMap.has(m.gift)) state.giftMap.set(m.gift, { racer: r, pts: +m.giftPts || 1 });
    }));

    // mapa palabra clave -> competidor (comentarios del chat). "primero gana".
    state.wordMap = new Map();
    if (state.commentsOn){
      state.racers.forEach(r => r.members.forEach(m => {
        const w = noAcc(m.word);
        if (w && !state.wordMap.has(w)) state.wordMap.set(w, { racer: r });
      }));
    }
    state.userLast = new Map();   // a quién votó cada espectador (para atribuir sus likes)
    state.likeBuf  = new Map();   // likes acumulados por espectador

    buildTrack(); buildLegend(); show('game');
    SFX.init();                                   // habilita audio con el gesto del click
    if (game().id === 'boxeo') SFX.bell();        // campana de inicio (boxeo)
    else if (game().id === 'futbol') SFX.whistle(0.45);  // silbato de inicio (fútbol)
    else if (game().id === 'comidas') SFX.serveBell();   // campana de servicio (comidas)
    else if (game().id === 'resistencia') SFX.startGun(); // pistola de salida (resistencia)
    else if (game().id === 'motos') SFX.revBig();         // rugido de motor (motos)
    SFX.crowd.start(game().id);                            // ambiente de público (sube con likes/compartidos)
    state.running = true; state.paused = false; state.startTs = performance.now();
    window.addEventListener('keydown', onGameKey, true);
    loop();
  }

  function buildTrack(){
    const g = game();
    $('#scene').className = 'scene ' + g.scenario;
    $('#hudTheme').textContent = `${g.emoji} ${g.name}`;
    $('#hudGoal').classList.remove('warn');
    $('#hudGoal').textContent = state.winmode === 'meta'
      ? `🎯 ${state.target}`
      : `⏱️ ${fmtTime(state.duration, state.duration >= 60)}`;

    // duelo a 2 lados (1v1/2v2/3v3): cancha con arcos (fútbol) o ring (boxeo)
    state._arena = false;
    // Solo fútbol y boxeo son duelo "cara a cara" (arena). Comidas/resistencia/motos
    // corren en LÍNEA RECTA (carriles), cada uno con su ambiente (cocina/pista/circuito).
    if (state.racers.length === 2 && (g.id === 'futbol' || g.id === 'boxeo')){ buildArena(g); return; }

    state._boxeo = false; state._field = null; state._clash = null; state._close = false;

    // tamaño adaptable: pocos = grandes, muchos = compactos
    const n = state.racers.length;
    const tier = n <= 2 ? 't-xl' : n <= 5 ? 't-lg' : n <= 9 ? 't-md' : 't-sm';
    const track = $('#track'); track.className = 'track ' + tier; track.innerHTML = '';
    state.racers.forEach((r, idx) => {
      const lane = document.createElement('div');
      lane.className = 'lane';
      lane.style.setProperty('--lane-a', shade(r.color, -6));
      lane.style.setProperty('--lane-b', shade(r.color, -24));
      lane.style.setProperty('--delay', (-(idx % 5) * 0.35) + 's'); // desincroniza la animación

      const avas = r.members.map(m => avatarHTML(m,'sm')).join('');
      const runnerAvas = r.members.map(m => avatarHTML(m,'lg')).join('');

      lane.innerHTML = `
        <div class="info">
          ${laneGiftHTML(r)}${laneWordHTML(r)}
          <span class="ava">${avas}</span>
          <div class="meta"><div class="nm">${r.name}</div><div class="sub">${r.sub||''}</div></div>
          <span class="score">0</span>
        </div>
        <div class="strip"><i class="pfill"></i><div class="runner"><span class="ava">${runnerAvas}</span></div></div>`;
      track.appendChild(lane);
      r.runnerEl = $('.runner', lane);
      r.scoreEl  = $('.info .score', lane);
      r.pfillEl  = $('.pfill', lane);
    });
    updatePositions();
  }

  /* Config de arena por juego: clase de tema, icono central (sigue al líder),
     decoración lateral y efectos flotantes al puntuar. Boxeo es especial (choque). */
  const ARENA = {
    futbol: { cls:'arena-cancha', icon:'⚽', side:'🥅', fx:['⚽','¡GOL!','🔥'] },
    boxeo:  { cls:'arena-ring',   icon:'🏆', side:'🥊', fx:['💥','🥊','POW!'], boxeo:true },
  };

  /* Duelo 1v1 (o equipos 2v2/3v3): arena temática. Boxeo = ring con choque; el resto
     = campo dinámico (vaivén + objeto central que viaja con el líder + efectos). */
  function buildArena(g){
    state._arena = true;
    const cfg = ARENA[g.id] || ARENA.futbol;
    const boxeo = !!cfg.boxeo;
    const track = $('#track');
    track.className = 'track arena ' + cfg.cls + (boxeo ? '' : ' arena-dyn');
    const [a, b] = state.racers;
    const centerIcon = cfg.icon;
    state._arenaFx = cfg.fx;
    const decor = boxeo
      ? '<div class="corner corner-l">🥊</div><div class="corner corner-r">🥊</div><div class="clash"></div>'
      : `<div class="goal goal-l">${cfg.side}</div><div class="goal goal-r">${cfg.side}</div>`;
    track.innerHTML = `
      <div class="arena-field">
        <div class="vs-names">
          <div class="vs-name vn-l" style="--c:${shade(a.color,8)}"><span class="nm">${a.name}</span><span class="sc">0</span></div>
          <div class="vs-name vn-r" style="--c:${shade(b.color,8)}"><span class="sc">0</span><span class="nm">${b.name}</span></div>
        </div>
        <div class="vs-crown">👑</div>
        <div class="aprog aprog-l" style="--c:${shade(a.color,8)}"><i></i></div>
        <div class="aprog aprog-r" style="--c:${shade(b.color,8)}"><i></i></div>
        ${decor}
        <div class="arena-center"><div class="vs">VS</div>${boxeo ? `<div class="arena-ball">${centerIcon}</div>` : ''}</div>
        ${boxeo ? '' : `<div class="arena-ball">${centerIcon}</div>`}
        ${arenaFighter(a, 'l')}
        ${arenaFighter(b, 'r')}
      </div>`;
    a.runnerEl = $('.fighter.f-l', track); a.scoreEl = $('.fighter.f-l .score', track);
    b.runnerEl = $('.fighter.f-r', track); b.scoreEl = $('.fighter.f-r .score', track);
    a.pfillEl = $('.aprog-l i', track); b.pfillEl = $('.aprog-r i', track);
    a.tagScoreEl = $('.vn-l .sc', track); b.tagScoreEl = $('.vn-r .sc', track);
    state._crown = $('.vs-crown', track);
    state._crownSide = null;
    $('#scene').classList.add('arena-mode');   // oculta el cuadro de líder del HUD
    a.runnerEl.dataset.side = 'l'; b.runnerEl.dataset.side = 'r';
    state._boxeo = boxeo;
    state._field = $('.arena-field', track);
    state._clash = boxeo ? $('.clash', track) : null;
    state._ball  = boxeo ? null : $('.arena-field > .arena-ball', track);
    state._ballOwner = null; state._ballDash = null;
    state._close = false;
    // lado físico de cada equipo (cambia al medio tiempo) + elementos de cada miembro
    a.side = 'l'; b.side = 'r';
    a._memEls = [...a.runnerEl.querySelectorAll('.amem')];
    b._memEls = [...b.runnerEl.querySelectorAll('.amem')];
    state._ballTargetEl = null; state._passIdx = 0; state._passT = 0;
    state._halftimeDone = false;
    updatePositions();
  }

  /* Versus: desliza la corona al lado del que va ganando, con salto al cambiar.
     Empate o 0-0 => sin corona (centrada/oculta). */
  function moveArenaCrown(){
    if (!state._arena || !state._crown) return;
    const [a, b] = state.racers;
    let side = null;
    if (a.score !== b.score && (a.score > 0 || b.score > 0)){
      const leader = a.score > b.score ? a : b;
      side = leader.side || (leader === a ? 'l' : 'r');     // lado FÍSICO del líder (cambia al medio tiempo)
    }
    if (side === state._crownSide) return;
    state._crownSide = side;
    state._field.classList.toggle('lead-l', side === 'l');
    state._field.classList.toggle('lead-r', side === 'r');
    state._crown.classList.toggle('show', side !== null);
    // re-dispara la animación de salto al cambiar de lado
    state._crown.classList.remove('hop'); void state._crown.offsetWidth; state._crown.classList.add('hop');
  }

  /* Boxeo: detecta cuando ambos boxeadores se acercan al centro y activa el
     "choque" (jabs + destello). Posiciona el destello en el punto de encuentro. */
  function arenaClashUpdate(){
    if (!state._boxeo || !state._clash) return;
    const [a, b] = state.racers;
    const leftC  = parseFloat(a.runnerEl.style.left)  || 9;   // centro del izq. (%)
    const rightC = 100 - (parseFloat(b.runnerEl.style.right) || 9); // centro del der. (%)
    const mid = (leftC + rightC) / 2;
    const gap = rightC - leftC;
    state._clash.style.left = mid + '%';
    const close = gap < 30 && a.score > 0 && b.score > 0;
    state._close = close;
    state._field.classList.toggle('clashing', close);
    state._clash.classList.toggle('on', close);
  }

  function spawnPunch(){
    if (!state._field || !state._clash) return;
    const fx = document.createElement('div');
    fx.className = 'punch';
    const icons = ['💥','🥊','⭐','POW!','BAM!','¡PAF!','¡PUM!'];
    fx.textContent = icons[(Math.random() * icons.length) | 0];
    const midPct = parseFloat(state._clash.style.left) || 50;
    fx.style.left = (midPct + (Math.random() * 18 - 9)) + '%';
    fx.style.top  = (44 + Math.random() * 12) + '%';
    fx.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
    state._field.appendChild(fx);
    // sacudida del ring en cada golpe
    state._field.classList.remove('hit'); void state._field.offsetWidth; state._field.classList.add('hit');
    setTimeout(() => fx.remove(), 650);
  }

  /* Efecto flotante temático al puntuar en arena (comidas/resistencia/motos/fútbol):
     lanza un emoji/letrero desde la posición del competidor que anotó. */
  function spawnFx(r){
    if (!state._field || !state._arenaFx || !r || !r.runnerEl) return;
    const fr = state._field.getBoundingClientRect();
    const rr = r.runnerEl.getBoundingClientRect();
    const fx = document.createElement('div');
    fx.className = 'punch';                                 // reutiliza el estilo de texto flotante
    const arr = state._arenaFx; fx.textContent = arr[(Math.random() * arr.length) | 0];
    fx.style.left = (((rr.left + rr.width / 2 - fr.left) / fr.width) * 100) + '%';
    fx.style.top  = (((rr.top + rr.height / 2 - fr.top) / fr.height) * 100) + '%';
    fx.style.setProperty('--rot', (Math.random() * 30 - 15) + 'deg');
    state._field.appendChild(fx);
    setTimeout(() => fx.remove(), 650);
  }

  function arenaFighter(r, side){
    // cada miembro en su propio <span class="amem"> -> formación (alineación) y el balón
    // puede ubicar a un jugador concreto para "pasárselo".
    const avas = r.members.map((m,i) => `<span class="amem" data-mem="${i}">${avatarHTML(m, 'lg')}</span>`).join('');
    const keys = r.members.map(m => `<span class="key">${niceKey(m.key)}</span>`).join('');
    const formCls = ' form-' + r.members.length;   // form-1 / form-2 / form-3
    return `
      <div class="runner fighter f-${side}" style="--lane-a:${shade(r.color,-6)}">
        <span class="ava${formCls}">${avas}</span>
        <div class="afoot">${keys}<span class="nm">${r.name}</span><span class="score">0</span></div>
      </div>`;
  }

  function onGameKey(e){
    if (!state.running) return;
    if (e.key === 'Escape'){ togglePause(); return; }
    if (state.paused) return;
    const r = state.keyMap.get(normEvent(e));
    if (!r) return;
    e.preventDefault();
    addPoint(r, 1);
  }

  /* Suma n puntos a un competidor (lo usan las teclas Y los regalos de TikTok),
     con la animacion y el sonido del juego, y comprueba la victoria por meta. */
  function addPoint(r, n = 1){
    if (!state.running || state.paused || !r) return;
    r.score += n;
    r.runnerEl.classList.add('bump');
    setTimeout(() => r.runnerEl && r.runnerEl.classList.remove('bump'), 280);
    updatePositions();
    if (state._close) spawnPunch();                        // boxeo: golpe al estar cerca
    else if (state._arena && !state._boxeo) spawnFx(r);    // arena temática: efecto flotante al puntuar
    if (game().id === 'boxeo') SFX.punch();        // sonido de golpe en cada pegada
    else if (game().id === 'futbol') SFX.kick();   // patada al balón en cada gol
    else if (game().id === 'comidas') SFX.crunch(); // mordisco en cada punto
    else if (game().id === 'resistencia') SFX.pedal(); // pedaleo/zancada en cada avance
    else if (game().id === 'motos') SFX.rev();          // acelerón en cada avance
    if (state.winmode === 'meta' && r.score >= state.target) endGame();
  }

  /* Llega un REGALO de TikTok: busca a quien apoya y le suma sus puntos. */
  function onGift(g){
    // si llegó la foto REAL del regalo por primera vez, refresca fotos en pantalla
    if (g.picture && g.key){
      state._giftPicSeen = state._giftPicSeen || new Set();
      if (!state._giftPicSeen.has(g.key)){ state._giftPicSeen.add(g.key); buildLegend(); refreshGiftPhotos(); }
    }
    showGiftToast(g);
    const entry = g.key ? state.giftMap.get(g.key) : null;
    if (!entry) return;                       // regalo no asignado a nadie -> se ignora
    addPoint(entry.racer, entry.pts * (g.count || 1));
    if (g.uniqueId) state.userLast.set(g.uniqueId, entry.racer);  // su próximo like apoya aquí
    flashLegend(g.key);
  }

  /* Llega un COMENTARIO del chat: si contiene el nombre/palabra de un competidor,
     GRITA su nombre + lo muestra en grande + anima al público. NO suma puntos. */
  function onComment(c){
    if (!state.running || state.paused || !state.commentsOn) return;
    const text = noAcc(c.comment);
    if (!text) return;
    const tokens = text.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
    let entry = null;
    for (const [w, e] of state.wordMap){
      const hit = w.includes(' ') ? text.includes(w) : tokens.includes(w);
      if (hit){ entry = e; break; }              // primera palabra clave que aparezca gana
    }
    if (!entry) return;                                       // no menciona a nadie -> nada
    // NO suma puntos (los puntos SOLO vienen de los regalos): el comentario solo AMBIENTA.
    SFX.crowd.bump(0.6);                                       // el público se anima
    // ¡grita el nombre del competidor y lo muestra en grande! (con throttle para no saturar)
    const now = performance.now();
    if (!state._lastShout || now - state._lastShout > 1100){
      state._lastShout = now;
      spawnNameShout(entry.racer.name, entry.racer.color);
      speakName(entry.racer.name);
    }
  }

  /* Texto GIGANTE con el nombre del competidor que sube desde abajo con zoom (al comentar). */
  function spawnNameShout(text, color){
    const scene = $('#scene'); if (!scene || !text) return;
    const el = document.createElement('div');
    el.className = 'name-shout';
    el.style.setProperty('--c', color || '#ffd166');
    el.textContent = text;
    scene.appendChild(el);
    setTimeout(() => el.remove(), 2500);
  }

  /* Voz que "grita" el nombre (Web Speech API, voz del sistema). Respeta el silencio. */
  function speakName(text){
    try {
      if (!text || SFX.isMuted() || !('speechSynthesis' in window)) return;
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'es-ES'; u.rate = 1; u.pitch = 1.05; u.volume = 1;
      window.speechSynthesis.cancel();                         // no encolar: el último manda
      window.speechSynthesis.speak(u);
    } catch(_){}
  }

  /* Llegan LIKES (en lote): SOLO suben el ruido del público (no dan puntos). */
  function onLike(l){
    if (!state.running || state.paused || !state.likesOn) return;
    SFX.crowd.bump(Math.min(3, (l.count || 1) * 0.2));      // SOLO ruido: más likes = más fuerte
  }

  /* Llega un SEGUIDOR nuevo: SOLO anima al público (los puntos vienen solo de los regalos). */
  function onFollow(f){
    if (!state.running || state.paused || !state.followOn) return;
    SFX.crowd.bump(1.0);                                    // SOLO anima al público, no suma puntos
  }

  /* Llega un COMPARTIR: SOLO anima al público (no suma puntos). */
  function onShare(s){
    if (!state.running || state.paused || !state.shareOn) return;
    SFX.crowd.bump(1.3);                                    // SOLO anima al público, no suma puntos
  }

  /* Aviso flotante genérico para comentario / like (reusa el estilo del toast de regalo). */
  function showActionToast(kind, icon, user, label, racer, pts){
    const scene = $('#scene'); if (!scene) return;
    const t = document.createElement('div');
    t.className = 'gift-toast act-' + kind;
    t.innerHTML = `<span class="gt-photo as-em">${icon}</span>
      <span class="gt-tx"><b>${esc(user || 'alguien')}</b> ${label}
      <span class="gt-to">→ ${racer.name} <b>+${pts}</b></span></span>`;
    scene.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  /* <img> de la foto del regalo, con respaldo al emoji si la imagen falla. */
  function giftPhotoHTML(key, cls){
    const info = giftInfo(key); if (!info) return '';
    const img  = (window.TikTok && window.TikTok.giftImg(key)) || '';
    return `<img class="${cls}" src="${img}" alt="${info.label}"
      onerror="this.style.display='none';this.nextElementSibling.style.display='inline-flex'">
      <span class="${cls} as-em" style="display:none">${info.emoji}</span>`;
  }

  /* Regalo(s) de un competidor para mostrar EN SU CARRIL (foto + valor). */
  function laneGiftHTML(r){
    const gifts = r.members.map(m => ({ key: m.gift, pts: +m.giftPts || 1 })).filter(x => x.key && giftInfo(x.key));
    if (!gifts.length) return '';
    return `<span class="lane-gift">` + gifts.map(g =>
      `<span class="lg-one" data-gift="${g.key}">${giftPhotoHTML(g.key, 'lg-photo')}<span class="lg-pt">+${g.pts}</span></span>`
    ).join('') + `</span>`;
  }

  /* Palabra(s) clave de chat de un competidor para mostrar EN SU CARRIL. */
  function laneWordHTML(r){
    if (!state.commentsOn) return '';
    const words = r.members.map(m => (m.word || '').trim()).filter(Boolean);
    if (!words.length) return '';
    return `<span class="lane-word" title="Comenta esta palabra para votar">💬 ${words.map(w => `<b>${esc(w)}</b>`).join('/')}</span>`;
  }

  /* Leyenda inferior: SOLO en duelos (formato "VS"). En modo carriles el regalo
     se muestra dentro de cada carril (laneGiftHTML), así que la barra se oculta. */
  function buildLegend(){
    const box = document.getElementById('giftLegend');
    if (!box) return;
    if (!state._arena){ box.hidden = true; box.innerHTML = ''; box.classList.remove('duel'); return; }

    const sides = state.racers.map(r => ({
      racer: r,
      gifts: r.members.map(m => ({ key: m.gift, pts: +m.giftPts || 1 })).filter(x => x.key && giftInfo(x.key)),
      words: state.commentsOn ? r.members.map(m => (m.word || '').trim()).filter(Boolean) : [],
    })).filter(s => s.gifts.length || s.words.length);

    if (sides.length !== 2){ box.hidden = true; box.innerHTML = ''; box.classList.remove('duel'); return; }
    box.hidden = false;
    box.classList.add('duel');

    const sideHTML = s => {
      const photos = s.gifts.map(g =>
        `<span class="gl-gift" data-gift="${g.key}">
           ${giftPhotoHTML(g.key, 'gl-photo')}<span class="gl-pt">+${g.pts}</span>
         </span>`).join('');
      const wordC = s.words.length
        ? `<span class="gl-word">💬 ${s.words.map(w => `<b>${esc(w)}</b>`).join('/')}</span>` : '';
      return `<div class="gl-side" style="--c:${shade(s.racer.color, 8)}">
        ${photos}${wordC}<span class="gl-ar">→</span><span class="gl-nm">${s.racer.name}</span></div>`;
    };
    box.innerHTML = sideHTML(sides[0]) + '<span class="gl-vsx">VS</span>' + sideHTML(sides[1]);
  }

  /* Resalta el regalo recibido (en la leyenda VS y/o en el carril). */
  function flashLegend(key){
    document.querySelectorAll(`#giftLegend .gl-gift[data-gift="${key}"], #track .lg-one[data-gift="${key}"]`).forEach(el => {
      el.classList.remove('pulse'); void el.offsetWidth; el.classList.add('pulse');
    });
  }

  /* Refresca las fotos de los regalos (al llegar el catálogo oficial en pleno juego). */
  function refreshGiftPhotos(){
    if (!window.TikTok) return;
    document.querySelectorAll('#track .lg-one[data-gift], #giftLegend .gl-gift[data-gift]').forEach(el => {
      const img = el.querySelector('img'); const src = window.TikTok.giftImg(el.dataset.gift);
      if (img && src){ img.src = src; img.style.display = ''; const em = img.nextElementSibling; if (em) em.style.display = 'none'; }
    });
  }

  /* Aviso flotante: quién envió qué regalo (con su foto) y a quién apoya. */
  function showGiftToast(g){
    const scene = $('#scene'); if (!scene) return;
    const info  = giftInfo(g.key);
    const entry = g.key ? state.giftMap.get(g.key) : null;
    const t = document.createElement('div');
    t.className = 'gift-toast';
    const total = entry ? entry.pts * (g.count || 1) : 0;
    const who   = entry ? `<span class="gt-to">→ ${entry.racer.name} <b>+${total}</b></span>` : '';
    const photo = info ? giftPhotoHTML(g.key, 'gt-photo') : '<span class="gt-photo as-em">🎁</span>';
    t.innerHTML = `${photo}<span class="gt-tx"><b>${g.user || 'alguien'}</b> envió ${info ? info.label : (g.giftName || 'un regalo')}${g.count > 1 ? ' ×' + g.count : ''} ${who}</span>`;
    scene.appendChild(t);
    setTimeout(() => t.remove(), 3200);
  }

  function updatePositions(){
    const maxScore = Math.max(1, ...state.racers.map(r => r.score));
    const ref = state.winmode === 'meta' ? state.target : Math.max(maxScore, 1);
    let leader = null;
    state.racers.forEach(r => {
      const pct = Math.min(1, r.score / ref);
      if (state._arena && state._boxeo){
        const off = (9 + pct * 33) + '%';   // boxeo: de cada borde hacia el centro (para el choque)
        if (r.runnerEl.dataset.side === 'l'){ r.runnerEl.style.left = off; r.runnerEl.style.right = 'auto'; }
        else { r.runnerEl.style.right = off; r.runnerEl.style.left = 'auto'; }
      } else if (!state._arena){
        r.runnerEl.style.left = (6 + pct * 86) + '%';
      }
      // fútbol (arena, no boxeo) necesita ambos marcadores -> se posiciona tras el bucle
      if (r.pfillEl) r.pfillEl.style.width = (pct * 100) + '%';   // barra de progreso
      r.scoreEl.textContent = r.score;
      if (r.tagScoreEl) r.tagScoreEl.textContent = r.score;       // puntaje del nombre de arriba (versus)
      r.runnerEl.classList.remove('leader');
      if (!leader || r.score > leader.score) leader = r;
    });
    if (leader && leader.score > 0) leader.runnerEl.classList.add('leader');
    $('#leaderName').textContent  = (leader && leader.score > 0) ? leader.name : '—';
    $('#leaderScore').textContent = leader ? leader.score : 0;
    if (state._arena && !state._boxeo) updateFutbolArena();
    moveArenaCrown();
    arenaClashUpdate();
  }

  /* Fútbol (duelo): "tira y afloja". El que va ganando empuja la línea de juego
     hacia el campo rival (lo invade) y el perdedor retrocede a defender su arco;
     el balón viaja con el que domina. Gradual y equilibrado: arranca suave y se
     acentúa conforme crece el marcador, sin saltos bruscos. */
  /* MEDIO TIEMPO: los dos equipos cambian de lado de la cancha (como un partido real).
     Solo invierte la POSICIÓN física (el marcador de arriba se queda fijo, como un
     marcador real). La transition CSS anima el cruce; la corona se recoloca. */
  function swapSides(){
    if (!state._arena || state._boxeo) return;
    const [a, b] = state.racers;
    a.side = a.side === 'l' ? 'r' : 'l';
    b.side = b.side === 'l' ? 'r' : 'l';
    a.runnerEl.dataset.side = a.side; b.runnerEl.dataset.side = b.side;
    updateFutbolArena();                 // reposiciona (la transición anima el cruce)
    state._crownSide = '_'; moveArenaCrown();
    spawnCenterBanner('🔄 ¡Cambio de cancha!');
    if (game().id === 'futbol') SFX.whistle(0.4);
  }

  /* Cartel grande y breve en el centro (medio tiempo, etc.) */
  function spawnCenterBanner(text){
    const scene = $('#scene'); if (!scene) return;
    const el = document.createElement('div');
    el.className = 'center-banner';
    el.textContent = text;
    scene.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function updateFutbolArena(){
    const [a, b] = state.racers;
    // equipo que está físicamente a la izquierda / derecha (puede cambiar al medio tiempo)
    const L = a.side === 'l' ? a : b;
    const R = a.side === 'l' ? b : a;
    const tot = a.score + b.score;
    const dom = tot > 0 ? (L.score - R.score) / tot : 0;   // -1..1 (cuota del de la IZQUIERDA)
    const conf = tot / (tot + 5);                           // suaviza al inicio, crece con el total
    const C  = clamp(50 + dom * conf * 34, 22, 78);         // línea de juego (% desde la izquierda)
    const gap = 12;
    L.runnerEl.style.left = clamp(C - gap, 9, 74) + '%'; L.runnerEl.style.right = 'auto';
    R.runnerEl.style.left = clamp(C + gap, 26, 91) + '%'; R.runnerEl.style.right = 'auto';
    // el balón ya NO se posiciona aquí: lo sigue updateBall() cada frame (entre los compañeros).
  }

  /* El balón va PEGADO al equipo que va ganando: cada frame copia su posición real
     (incluido el vaivén). Cuando el otro lo supera, cruza RÁPIDO y con un efecto
     pronunciado (giro + rebote) hacia el nuevo líder. */
  function updateBall(){
    if (!state._ball || !state._field) return;
    const [a, b] = state.racers;
    const tot = a.score + b.score;
    const now = performance.now();
    let owner = null;                                        // null = empate/0-0 -> al centro
    if (tot > 0 && a.score !== b.score) owner = a.score > b.score ? a : b;

    // ¿cambió de equipo? -> reinicia el "pase" y dispara el cruce con giro
    const ownerChanged = owner !== state._ballOwner;
    if (ownerChanged){
      state._ballOwner = owner;
      state._passIdx = 0; state._passT = now;
      if (owner){
        state._ball.classList.remove('switching'); void state._ball.offsetWidth;
        state._ball.classList.add('switching');
      }
    }

    // elegir el COMPAÑERO que tiene el balón: se lo pasan cada ~1.1s (entre ellos)
    let targetEl = owner ? owner.runnerEl : null;
    if (owner && owner._memEls && owner._memEls.length > 1){
      if (!ownerChanged && now - (state._passT || 0) > 1100){
        state._passIdx = (state._passIdx + 1) % owner._memEls.length;   // pasa al siguiente
        state._passT = now;
      }
      targetEl = owner._memEls[Math.min(state._passIdx, owner._memEls.length - 1)] || owner.runnerEl;
    }

    // si cambió el compañero (sin cambiar de equipo) -> arranca un dash corto (el pase)
    if (!ownerChanged && targetEl !== state._ballTargetEl && owner){
      state._ballDash = { fx: parseFloat(state._ball.style.left) || 50,
                          fy: parseFloat(state._ball.style.top)  || 50, t0: now };
    }
    if (ownerChanged){
      state._ballDash = { fx: parseFloat(state._ball.style.left) || 50,
                          fy: parseFloat(state._ball.style.top)  || 50, t0: now };
    }
    state._ballTargetEl = targetEl;

    // posición objetivo (en % del campo): el jugador que tiene el balón
    const fr = state._field.getBoundingClientRect();
    let tx = 50, ty = 50;
    if (targetEl){
      const rr = targetEl.getBoundingClientRect();
      tx = ((rr.left + rr.width / 2 - fr.left) / fr.width)  * 100;
      ty = ((rr.top  + rr.height / 2 - fr.top) / fr.height) * 100;
      tx += owner.side === 'l' ? 7 : -7;    // un poco hacia el arco rival (driblando)
    }
    tx = clamp(tx, 4, 96); ty = clamp(ty, 12, 88);

    const curX = parseFloat(state._ball.style.left) || 50;
    const curY = parseFloat(state._ball.style.top)  || 50;
    let nx, ny;
    if (state._ballDash){
      const p = (performance.now() - state._ballDash.t0) / 380;   // duración del cruce
      if (p >= 1){
        state._ballDash = null;
        state._ball.classList.remove('switching');
        nx = tx; ny = ty;
      } else {
        const e = 1 - Math.pow(1 - p, 3);                   // easeOutCubic: sale rápido, asienta suave
        nx = state._ballDash.fx + (tx - state._ballDash.fx) * e;
        ny = state._ballDash.fy + (ty - state._ballDash.fy) * e;
      }
    } else {
      nx = curX + (tx - curX) * 0.6;                         // pegado: sigue de cerca el vaivén
      ny = curY + (ty - curY) * 0.6;
    }
    state._ball.style.left = nx + '%';
    state._ball.style.top  = ny + '%';
  }

  function loop(){
    if (!state.running) return;
    if (state.winmode === 'tiempo' && !state.paused){
      const left = Math.max(0, state.duration - (performance.now() - state.startTs)/1000);
      $('#hudGoal').textContent = '⏱️ ' + fmtTime(left, state.duration >= 60);
      $('#hudGoal').classList.toggle('warn', left <= 10);   // aviso de urgencia
      // MEDIO TIEMPO: cambio de cancha (como un partido real), solo en fútbol-arena
      if (!state._halftimeDone && state._arena && !state._boxeo &&
          (state.duration - left) >= state.duration / 2){
        state._halftimeDone = true;
        swapSides();
      }
      if (left <= 0){ endGame(); return; }
    }
    if (state._arena && !state._boxeo && !state.paused) updateBall();   // balón pegado al líder
    state.rafTimer = requestAnimationFrame(loop);
  }

  function togglePause(){
    state.paused = !state.paused;
    $('#pauseBtn').textContent = state.paused ? '▶' : '⏸';
    if (state.paused) state.pausedAt = performance.now();
    else if (state.pausedAt){ state.startTs += performance.now() - state.pausedAt; state.pausedAt = 0; }
  }

  /* ============================================================
     GANADOR
     ============================================================ */
  function endGame(){
    state.running = false;
    cancelAnimationFrame(state.rafTimer);
    window.removeEventListener('keydown', onGameKey, true);
    SFX.crowd.stop();                                       // corta el ambiente de público

    const ranking = [...state.racers].sort((a,b) => b.score - a.score);
    const w = ranking[0];
    const duelo = ranking.length === 2;   // 1v1 / 2v2 / 3v3: cara a cara
    const empate = ranking.length >= 2 && ranking[0].score === ranking[1].score; // mismo puntaje arriba

    // título / medalla / botón según haya ganador o empate
    $('#winMedal').textContent = empate ? '🤝' : '🏆';
    $('#winTitle').textContent = empate ? '¡EMPATE!' : '¡GANADOR!';
    $('#rematchBtn').textContent = empate ? '🥊 Desempate' : '🔁 Revancha';

    // --- cara a cara (ganador vs perdedor con efectos) ---
    const fo = $('#faceoff');
    if (duelo){
      fo.hidden = false;
      fo.innerHTML = empate
        ? foSide(ranking[0], 'tie') + '<div class="fo-vs">VS</div>' + foSide(ranking[1], 'tie')
        : foSide(ranking[0], 'win') + '<div class="fo-vs">VS</div>' + foSide(ranking[1], 'lose');
      $('#winIcon').hidden = $('#winName').hidden = $('#winSub').hidden = $('#winScore').hidden = $('#podium').hidden = true;
    } else {
      fo.hidden = true; fo.innerHTML = '';
      // en empate no destacamos un único ganador: solo el podio con los puntajes
      $('#winIcon').hidden = $('#winName').hidden = $('#winSub').hidden = $('#winScore').hidden = empate;
      $('#podium').hidden = false;
      if (!empate){
        $('#winIcon').innerHTML   = w.members.map(m => avatarHTML(m,'xl')).join('');
        $('#winName').textContent = w.name;
        $('#winSub').textContent  = w.sub || '';
        $('#winScore').textContent= w.score + ' pts';
      }

      const podium = $('#podium'); podium.innerHTML = '';
      ['🥇','🥈','🥉'].forEach((m, i) => {
        const r = ranking[i]; if (!r) return;
        const d = document.createElement('div'); d.className = 'p';
        d.innerHTML = `${m} <b>${r.members.map(x=>avatarHTML(x,'sm')).join('')}</b><br>${r.name}<br>${r.score} pts`;
        podium.appendChild(d);
      });
    }
    show('win'); launchConfetti();
    const gid = game().id;
    if (empate){
      if (gid === 'futbol') SFX.whistleEnd();               // silbato de fin
      else if (gid === 'resistencia') SFX.horn(0.4);        // bocina de meta
      else if (gid === 'motos') SFX.rev();                  // acelerón final
      else SFX.bellEnd();                                   // campana de fin
    } else if (gid === 'boxeo'){
      SFX.ko(); SFX.cheer();                                 // KO + ovación
    } else if (gid === 'futbol'){
      SFX.cheer(); SFX.whistleEnd();                         // rugido de la afición + pitido final
    } else if (gid === 'comidas'){
      SFX.cheer(); SFX.serveBell();                          // ovación + campana (¡plato ganador!)
    } else if (gid === 'resistencia'){
      SFX.cheer(); SFX.horn(0.6);                            // multitud en meta + bocina
    } else if (gid === 'motos'){
      SFX.cheer(); SFX.revBig();                             // multitud + rugido de victoria
    } else {
      SFX.cheer();                                           // ovación genérica
    }
  }

  // un lado del cara a cara: 'win' (victoria), 'lose' (roto/KO) o 'tie' (empate, neutral)
  function foSide(r, estado){
    const sz = r.members.length > 1 ? 'lg' : 'xl';
    const avas = r.members.map(m => avatarHTML(m, sz)).join('');
    const cfg = {
      win:  { photo:'winner', adorno:'<span class="fo-crown">👑</span>', tag:'tag-win',  txt:'🏆 GANADOR' },
      lose: { photo:'broken', adorno:'',                                  tag:'tag-lose', txt:'K.O.' },
      tie:  { photo:'tied',   adorno:'',                                  tag:'tag-tie',  txt:'🤝 EMPATE' }
    }[estado];
    return `
      <div class="fo">
        <div class="fo-photo ${cfg.photo}">${avas}${cfg.adorno}</div>
        <div class="fo-tag ${cfg.tag}">${cfg.txt}</div>
        <div class="fo-name">${r.name}</div>
        <div class="fo-pts">${r.score} <small>pts</small></div>
      </div>`;
  }

  /* ---------- confeti ---------- */
  let confettiRAF = null;
  function launchConfetti(){
    const cv = $('#confetti'), ctx = cv.getContext('2d');
    cv.width = innerWidth; cv.height = innerHeight;
    const colors = ['#ff2d75','#7c4dff','#ffd166','#06d6a0','#3a86ff','#fff'];
    const parts = Array.from({length:160}, () => ({
      x: Math.random()*cv.width, y: -20 - Math.random()*cv.height,
      r: 4+Math.random()*7, c: colors[(Math.random()*colors.length)|0],
      vy: 2+Math.random()*4, vx: -2+Math.random()*4, rot: Math.random()*6, vr: -.2+Math.random()*.4
    }));
    cancelAnimationFrame(confettiRAF);
    let f = 0;
    (function draw(){
      ctx.clearRect(0,0,cv.width,cv.height);
      parts.forEach(p => {
        p.x+=p.vx; p.y+=p.vy; p.rot+=p.vr;
        if (p.y > cv.height+20){ p.y=-20; p.x=Math.random()*cv.width; }
        ctx.save(); ctx.translate(p.x,p.y); ctx.rotate(p.rot);
        ctx.fillStyle=p.c; ctx.fillRect(-p.r/2,-p.r/2,p.r,p.r*1.6); ctx.restore();
      });
      if (++f < 360) confettiRAF = requestAnimationFrame(draw);
    })();
  }

  /* ============================================================
     EVENTOS UI
     ============================================================ */
  function stopRun(){
    state.running = false;
    cancelAnimationFrame(state.rafTimer);
    window.removeEventListener('keydown', onGameKey, true);
    SFX.crowd.stop();                                       // corta el ambiente de público
  }
  function backToMenu(){
    stopRun(); cancelAnimationFrame(confettiRAF);
    show('menu');
  }

  function bindUI(){
    $('#backMenu').onclick = () => show('menu');
    $('#startBtn').onclick  = startGame;
    $('#pauseBtn').onclick  = togglePause;
    $('#soundBtn').onclick  = () => { const m = !SFX.isMuted(); SFX.setMuted(m); $('#soundBtn').textContent = m ? '🔇' : '🔊'; };
    $('#exitBtn').onclick   = () => { stopRun(); show('setup'); };
    $('#menuBtn').onclick    = backToMenu;
    $('#rematchBtn').onclick = startGame;
    $('#selectAll').onclick  = () => toggleAll(true);
    $('#selectNone').onclick = () => toggleAll(false);
    $$('.preset').forEach(b => b.onclick = () => applyPreset(b.dataset.preset));
    $$('.time-preset').forEach(b => b.onclick = () => {
      $('#durationSecs').value = b.dataset.secs;                 // fija la duración
      $('input[name=winmode][value=tiempo]').checked = true;    // asegura el modo por tiempo
      $$('.time-preset').forEach(x => x.classList.toggle('on', x === b));
    });
    $('#durationSecs').oninput = () => $$('.time-preset').forEach(x =>
      x.classList.toggle('on', +x.dataset.secs === +$('#durationSecs').value));
    $('#teamMode').onchange = e => {
      state.teamMode = e.target.checked;
      $('#teamCountRow').hidden = !state.teamMode;
      renderRoster();
    };
    $('#teamCount').onchange = e => {
      state.teamCount = +e.target.value;
      state.roster.forEach(p => { if (p.teamId > state.teamCount) p.teamId = state.teamCount; });
      renderRoster();
    };
    addEventListener('resize', () => { const cv=$('#confetti'); if (cv){ cv.width=innerWidth; cv.height=innerHeight; } });
    bindTikTok();
  }

  /* ---------- TikTok Live: conexión + regalos ---------- */
  const TT_USER_KEY = 'cl_ttUser';   // recuerda el último @usuario en este navegador

  function bindTikTok(){
    if (!window.TikTok) return;
    const statusEl = $('#ttStatus'), connBtn = $('#ttConnect'), discBtn = $('#ttDisconnect');
    const userInput = $('#ttUser');

    // recordar el último usuario: rellena el campo al abrir
    let savedUser = '';
    try { savedUser = localStorage.getItem(TT_USER_KEY) || ''; } catch(_){}
    if (userInput && savedUser) userInput.value = savedUser;

    TikTok.onStatus((stt, msg) => {
      const cls = { connected:'ok', connecting:'wait', error:'bad', ended:'bad', disconnected:'' }[stt] || '';
      if (statusEl){ statusEl.className = 'tt-status ' + cls; statusEl.textContent = '● ' + (msg || stt); }
      const live = stt === 'connected';
      if (connBtn) connBtn.hidden = live;
      if (discBtn) discBtn.hidden = !live;
      // Paso 2 (elegir juego) se DESBLOQUEA solo al conectar; se bloquea si se cae la conexión.
      state.ttConnected = live;
      const step2 = document.getElementById('step2');
      if (step2) step2.classList.toggle('locked', !live);
    });
    TikTok.onGift(onGift);
    TikTok.onComment(onComment);                 // comentarios con palabra clave
    TikTok.onLike(onLike);                        // likes (atribuidos al último voto)
    TikTok.onFollow(onFollow);                    // seguir (atribuido al último voto)
    TikTok.onShare(onShare);                      // compartir (atribuido al último voto)
    // al llegar el catálogo OFICIAL: refresca selectores (foto/valor reales) y leyenda
    TikTok.onCatalog(() => {
      autoAssignGifts();                          // ahora hay más regalos -> reparte únicos
      if (screens.setup.classList.contains('active')) renderRoster();
      if (state.running){ buildLegend(); refreshGiftPhotos(); }
    });

    const doConnect = (u) => {
      u = (u || '').trim();
      if (!u){ if (userInput) userInput.focus(); return; }
      try { localStorage.setItem(TT_USER_KEY, u); } catch(_){}   // guarda para la próxima vez
      TikTok.connect(u);
    };
    if (connBtn) connBtn.onclick = () => doConnect(userInput && userInput.value);
    if (userInput) userInput.onkeydown = e => { if (e.key === 'Enter') doConnect(userInput.value); };
    if (discBtn) discBtn.onclick = () => TikTok.disconnect();

    // autoconexión: si ya habías conectado un usuario antes, reconecta solo al abrir
    if (savedUser) setTimeout(() => doConnect(savedUser), 600);
  }

  renderMenu();
  bindUI();
})();
