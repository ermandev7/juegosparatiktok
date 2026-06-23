# 🏁 Carrera Live — Juegos para TikTok Live + TikFinity

Plataforma web **100% local** (sin instalar nada) con **5 juegos** donde varios
competidores corren hacia la meta. **Cada vez que se presiona la tecla de un
competidor, este avanza +1.** El que más "votos" (teclas) reciba, gana.

Pensado para conectarse con **TikFinity**: cada regalo, like o comentario de tu live
dispara una tecla, y esa tecla mueve al competidor.

---

## 🎮 Los 5 juegos

1. **⚽ Fútbol** — con 3 categorías:
   - 🌎 **Selecciones** (estilo mundial, +20 países con banderas reales)
   - 🛡️ **Clubes** (los más populares de Latinoamérica: Boca, River, Flamengo, Millonarios, Nacional, América, Chivas, Colo-Colo, Alianza, Peñarol, Bolívar…)
   - ⭐ **Jugadores** (los más populares del mundo con **foto real**: Messi, Cristiano, Neymar, Mbappé, Haaland…)
2. **🍽️ Comidas Típicas** — el plato más popular de cada país de Latinoamérica (Tacos, Ceviche, Arepa, Asado, Empanada, Pupusa…).
3. **🥊 Boxeo** — 22 boxeadores con **foto real**: varios por país de Latinoamérica
   (Canelo, J.C. Chávez, J.M. Márquez, Monzón, Maidana, Trinidad, Cotto, W. Gómez,
   Durán, Argüello, Chocolatito, Kid Pambelé, Stevenson, Savón, Linares, Valero) y
   leyendas mundiales (Ali, Tyson, Mayweather, Pacquiao, Golovkin, Klitschko).
4. **🚴 Carreras de Resistencia** — 21 figuras con **foto real**: ciclismo y maratón
   de Latinoamérica (Nairo, Egan, Rigoberto Urán, Carapaz, Vanderlei, Gladys Tejeda,
   Köbrich, Curuchet, Claudia Poll, Barrondo) y del mundo —africanos y españoles—
   (Kipchoge, Gebrselassie, Bekele, Dibaba, Induráin, Contador, Valverde, Mo Farah,
   Froome, Pogačar, Merckx).
5. **🏍️ Carrera de Motos** — circuito de velocidad.

Cada juego tiene su **escenario** propio y sus **instrucciones** en pantalla.

> 📸 **Las fotos** de jugadores y atletas están **descargadas localmente** en
> `assets/fotos/` (funciona sin internet). Se ven grandes, circulares y con borde
> de color. Si faltara una, aparece una insignia con sus iniciales.
>
> 🎞️ **Todo se ve "vivo"**: las banderas ondean y los avatares se balancean.
> El tamaño es **adaptable**: en 1 vs 1 los avatares son enormes; con muchos
> competidores se ajustan para que todo se vea bien en pantalla.

### Actualizar / agregar fotos
Las fotos se bajan con un script (requiere Python e internet **solo al descargarlas**):

```
python scripts/download_photos.py
```

Edita el diccionario `PEOPLE` (id → título de Wikipedia) dentro del script para
agregar o cambiar caras. Guarda cada imagen como `assets/fotos/<id>.jpg` (el `id`
es el del competidor en `js/data.js`).

---

## ▶️ Cómo abrirlo

Doble clic en **`index.html`** (Chrome o Edge). ¡Listo!

> 💡 El modo **Fútbol → Selecciones** usa imágenes reales de banderas (flagcdn.com),
> así que necesita internet. Como vas a transmitir en vivo, ya tendrás conexión. Los
> demás juegos/categorías usan emojis e insignias y funcionan sin internet.

---

## 🕹️ Cómo se juega

1. En el **menú**, elige uno de los 5 juegos.
2. (Fútbol) Elige la **categoría**: Selecciones / Clubes / Jugadores.
3. **Condición de victoria**:
   - 🎯 **Por meta**: el primero en llegar a X puntos gana.
   - ⏱️ **Por tiempo**: tras X segundos, gana quien tenga más puntos.
4. **Enfrentamiento**:
   - 👥 **Todos contra todos** (cada competidor en su carril), o
   - **Por equipos**: usa los botones rápidos **1v1 / 2v2 / 3v3**, o activa
     *Modo equipos* y asigna manualmente cada competidor a un equipo (los puntos
     del equipo se suman). Ej.: *Messi + Cristiano + Isco vs otros 3*.
5. **Participantes y teclas**: marca quién participa y, si quieres, cambia su tecla
   (haz clic en el botón de la tecla y pulsa la deseada; admite combos tipo `Ctrl+1`).
6. **▶ ¡EMPEZAR!**
7. Durante la partida: `Esc` pausa · ✕ vuelve a la configuración.

---

## 🔌 Conectar con TikFinity (paso a paso)

TikFinity puede **simular pulsaciones de teclado** cuando ocurre un evento en tu live.
El juego solo "escucha" el teclado:

> **Regalo/like/comentario → TikFinity presiona una tecla → el competidor avanza.**

1. Abre **TikFinity** y conecta tu cuenta de TikTok.
2. Ve a **Actions / Custom Actions** (Eventos).
3. Crea una acción por cada disparador y ponle **Press Key** con la tecla del competidor:
   - *Regalo "Rosa"* → tecla `Q`
   - *Comentario "MEX"* → tecla `W`
   - *Like* → tecla `E`
4. **Importante:** la ventana del juego debe estar **enfocada (al frente)** para
   recibir las teclas. Tip: úsala como fuente de navegador en OBS con interacción
   activada, o tenla visible mientras transmites.

> Las teclas por defecto se asignan automáticamente (1,2,3…,Q,W,E…). Puedes cambiar
> cualquiera desde la pantalla de configuración antes de empezar.

---

## 🛠️ Personalizar (agregar países, equipos, jugadores, platos…)

Todo está en **`js/data.js`**. Cada competidor es un objeto, por ejemplo:

```js
// Selección (usa bandera real: el id es el código ISO del país)
{ id: 'PE', name: 'Perú', sub: 'CONMEBOL', color: '#D91023' }

// Club o jugador (insignia de color con sigla)
{ id: 'RMA', name: 'Real Madrid', abbr: 'RMA', sub: 'España 🇪🇸', color: '#1D3F8F' }

// Comida (emoji)
{ id: 'C01', name: 'Tacos', icon: '🌮', sub: 'México 🇲🇽', color: '#F4A261' }
```

Copia una línea dentro del juego/categoría que quieras y aparecerá solo. El tipo de
avatar (`flag` / `emoji` / `badge`) y el escenario se definen al inicio de cada juego.

---

## 📁 Estructura

```
juegosInteractivos/
├─ index.html        ← abre este archivo
├─ css/styles.css    ← estilos y escenarios
└─ js/
   ├─ data.js        ← JUEGOS, categorías, competidores, escenarios (edita aquí)
   └─ game.js        ← motor del juego
```
