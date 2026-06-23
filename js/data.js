/* ============================================================
   DATA.JS — Configuración de JUEGOS, CATEGORÍAS y COMPETIDORES
   ------------------------------------------------------------
   avatar: 'flag'  -> bandera real (id = código ISO)
           'emoji' -> emoji de `icon`
           'badge' -> círculo de color con `abbr`/iniciales (o `icon`)
           'photo' -> FOTO real desde Wikipedia (campo `wiki` = título de la
                       página en Wikipedia ES). Si falla, cae a insignia.
   competitor = { id, name, sub, color, icon?, abbr?, wiki? }
   Las TECLAS se autoasignan al cargar (y se pueden editar en pantalla).
   ============================================================ */

const GAMES = {

  /* ============================== FÚTBOL ============================== */
  futbol: {
    id: 'futbol', name: 'Fútbol', emoji: '⚽',
    scenario: 'cancha', finishLabel: '⚽ GOL',
    instructions: [
      'Elige una categoría: Selecciones (mundial), Clubes de Latinoamérica o Jugadores.',
      'Cada competidor tiene una tecla. Cada pulsación = +1 gol / avance.',
      'Puedes jugar todos contra todos, o por equipos (1v1, 2v2, 3v3...).',
      'En TikFinity asigna cada regalo/like/comentario a la tecla de un competidor.',
      'El primero en llegar a la meta (o el que más tenga al acabar el tiempo) ¡gana!'
    ],
    categories: {
      selecciones: {
        name: '🌎 Selecciones', avatar: 'flag', useFlags: true,
        competitors: [
          { id: 'AR', name: 'Argentina',   sub: 'CONMEBOL', color: '#74ACDF' },
          { id: 'BR', name: 'Brasil',      sub: 'CONMEBOL', color: '#009C3B' },
          { id: 'MX', name: 'México',      sub: 'CONCACAF', color: '#006847' },
          { id: 'CO', name: 'Colombia',    sub: 'CONMEBOL', color: '#FCD116' },
          { id: 'UY', name: 'Uruguay',     sub: 'CONMEBOL', color: '#5BA8DF' },
          { id: 'CL', name: 'Chile',       sub: 'CONMEBOL', color: '#0039A6' },
          { id: 'PE', name: 'Perú',        sub: 'CONMEBOL', color: '#D91023' },
          { id: 'EC', name: 'Ecuador',     sub: 'CONMEBOL', color: '#FFD100' },
          { id: 'PY', name: 'Paraguay',    sub: 'CONMEBOL', color: '#D52B1E' },
          { id: 'VE', name: 'Venezuela',   sub: 'CONMEBOL', color: '#FFCE00' },
          { id: 'BO', name: 'Bolivia',     sub: 'CONMEBOL', color: '#007934' },
          { id: 'CR', name: 'Costa Rica',  sub: 'CONCACAF', color: '#002B7F' },
          { id: 'PA', name: 'Panamá',      sub: 'CONCACAF', color: '#DA121A' },
          { id: 'HN', name: 'Honduras',    sub: 'CONCACAF', color: '#18C3DF' },
          { id: 'GT', name: 'Guatemala',   sub: 'CONCACAF', color: '#4997D0' },
          { id: 'ES', name: 'España',      sub: 'UEFA',     color: '#AA151B' },
          { id: 'FR', name: 'Francia',     sub: 'UEFA',     color: '#0055A4' },
          { id: 'DE', name: 'Alemania',    sub: 'UEFA',     color: '#222222' },
          { id: 'IT', name: 'Italia',      sub: 'UEFA',     color: '#0066CC' },
          { id: 'PT', name: 'Portugal',    sub: 'UEFA',     color: '#006600' },
          { id: 'NL', name: 'Países Bajos',sub: 'UEFA',     color: '#FF6200' },
          { id: 'GB-ENG', name: 'Inglaterra', sub: 'UEFA',  color: '#CF142B' },
        ]
      },

      /* Clubes más populares por país de Latinoamérica */
      clubes: {
        name: '🛡️ Clubes', avatar: 'badge',
        competitors: [
          { id: 'BOC', name: 'Boca Juniors',     abbr: 'BOC', sub: 'Argentina 🇦🇷', color: '#0A2D6E' },
          { id: 'RIV', name: 'River Plate',      abbr: 'RIV', sub: 'Argentina 🇦🇷', color: '#C2152B' },
          { id: 'FLA', name: 'Flamengo',         abbr: 'FLA', sub: 'Brasil 🇧🇷',    color: '#C52613' },
          { id: 'PAL', name: 'Palmeiras',        abbr: 'PAL', sub: 'Brasil 🇧🇷',    color: '#006437' },
          { id: 'MLL', name: 'Millonarios',      abbr: 'MLL', sub: 'Colombia 🇨🇴',  color: '#0A2C7C' },
          { id: 'NAC', name: 'Atl. Nacional',    abbr: 'NAC', sub: 'Colombia 🇨🇴',  color: '#00873E' },
          { id: 'AMC', name: 'América de Cali',  abbr: 'AMC', sub: 'Colombia 🇨🇴',  color: '#D2122E' },
          { id: 'AME', name: 'Club América',     abbr: 'AME', sub: 'México 🇲🇽',    color: '#0A2240' },
          { id: 'CHI', name: 'Chivas',           abbr: 'CHI', sub: 'México 🇲🇽',    color: '#C8102E' },
          { id: 'CAZ', name: 'Cruz Azul',        abbr: 'CAZ', sub: 'México 🇲🇽',    color: '#00457C' },
          { id: 'CLC', name: 'Colo-Colo',        abbr: 'CLC', sub: 'Chile 🇨🇱',     color: '#111827' },
          { id: 'UCH', name: 'U. de Chile',      abbr: 'UCH', sub: 'Chile 🇨🇱',     color: '#11489B' },
          { id: 'ALI', name: 'Alianza Lima',     abbr: 'ALI', sub: 'Perú 🇵🇪',      color: '#16407A' },
          { id: 'UNI', name: 'Universitario',    abbr: 'UNI', sub: 'Perú 🇵🇪',      color: '#8B1A2B' },
          { id: 'PEN', name: 'Peñarol',          abbr: 'PEÑ', sub: 'Uruguay 🇺🇾',   color: '#F2C200' },
          { id: 'NAU', name: 'Nacional (URU)',   abbr: 'NAC', sub: 'Uruguay 🇺🇾',   color: '#0A4FA0' },
          { id: 'BSC', name: 'Barcelona SC',     abbr: 'BSC', sub: 'Ecuador 🇪🇨',   color: '#FFD100' },
          { id: 'LDU', name: 'LDU Quito',        abbr: 'LDU', sub: 'Ecuador 🇪🇨',   color: '#0A2C7C' },
          { id: 'OLI', name: 'Olimpia',          abbr: 'OLI', sub: 'Paraguay 🇵🇾',  color: '#1A1A1A' },
          { id: 'BOL', name: 'Bolívar',          abbr: 'BOL', sub: 'Bolivia 🇧🇴',   color: '#0E76BD' },
        ]
      },

      /* Jugadores más populares a nivel mundial — con FOTO real (Wikipedia ES) */
      jugadores: {
        name: '⭐ Jugadores', avatar: 'photo',
        competitors: [
          { id: 'MES', name: 'Messi',       abbr: 'MES', sub: 'Argentina 🇦🇷', color: '#5BA8DF', wiki: 'Lionel_Messi' },
          { id: 'CR7', name: 'Cristiano',   abbr: 'CR7', sub: 'Portugal 🇵🇹',  color: '#C8102E', wiki: 'Cristiano_Ronaldo' },
          { id: 'NEY', name: 'Neymar',      abbr: 'NEY', sub: 'Brasil 🇧🇷',    color: '#009C3B', wiki: 'Neymar' },
          { id: 'MBA', name: 'Mbappé',      abbr: 'MBA', sub: 'Francia 🇫🇷',   color: '#0055A4', wiki: 'Kylian_Mbappé' },
          { id: 'HAA', name: 'Haaland',     abbr: 'HAA', sub: 'Noruega 🇳🇴',   color: '#6CABDD', wiki: 'Erling_Haaland' },
          { id: 'VIN', name: 'Vinícius',    abbr: 'VIN', sub: 'Brasil 🇧🇷',    color: '#1D3F8F', wiki: 'Vinícius_Júnior' },
          { id: 'BEL', name: 'Bellingham',  abbr: 'BEL', sub: 'Inglaterra 🏴', color: '#FEBE10', wiki: 'Jude_Bellingham' },
          { id: 'LEW', name: 'Lewandowski', abbr: 'LEW', sub: 'Polonia 🇵🇱',   color: '#A50044', wiki: 'Robert_Lewandowski' },
          { id: 'BEN', name: 'Benzema',     abbr: 'BEN', sub: 'Francia 🇫🇷',   color: '#2E8B57', wiki: 'Karim_Benzema' },
          { id: 'MOD', name: 'Modrić',      abbr: 'MOD', sub: 'Croacia 🇭🇷',   color: '#E63946', wiki: 'Luka_Modrić' },
          { id: 'KDB', name: 'De Bruyne',   abbr: 'KDB', sub: 'Bélgica 🇧🇪',   color: '#1B9AAA', wiki: 'Kevin_De_Bruyne' },
          { id: 'SAL', name: 'Salah',       abbr: 'SAL', sub: 'Egipto 🇪🇬',    color: '#C8102E', wiki: 'Mohamed_Salah' },
          { id: 'KAN', name: 'Kane',        abbr: 'KAN', sub: 'Inglaterra 🏴', color: '#DC052D', wiki: 'Harry_Kane' },
          { id: 'LAU', name: 'Lautaro',     abbr: 'LAU', sub: 'Argentina 🇦🇷', color: '#74ACDF', wiki: 'Lautaro_Martínez' },
        ]
      }
    }
  },

  /* ============================== COMIDAS TÍPICAS (Latinoamérica) ============================== */
  comidas: {
    id: 'comidas', name: 'Comidas Típicas', emoji: '🍽️',
    scenario: 'cocina', finishLabel: '🏆',
    avatar: 'photo',
    instructions: [
      'Cada plato típico (uno por país de Latinoamérica) es un competidor.',
      'Cada pulsación de su tecla hace avanzar al plato +1.',
      'Vota por tu comida favorita: ¡la más votada gana!',
      'En TikFinity conecta cada regalo/comentario a la tecla de un plato.'
    ],
    competitors: [
      { id: 'F01', name: 'Tacos',       icon: '🌮', sub: 'México 🇲🇽',       color: '#F4A261' },
      { id: 'F02', name: 'Feijoada',    icon: '🍛', sub: 'Brasil 🇧🇷',       color: '#6B4226' },
      { id: 'F03', name: 'Asado',       icon: '🥩', sub: 'Argentina 🇦🇷',    color: '#C1440E' },
      { id: 'F04', name: 'Arepa',       icon: '🫓', sub: 'Colombia 🇨🇴',     color: '#FFD166' },
      { id: 'F05', name: 'Ceviche',     icon: '🐟', sub: 'Perú 🇵🇪',         color: '#48CAE4' },
      { id: 'F06', name: 'Empanada',    icon: '🥟', sub: 'Chile 🇨🇱',        color: '#E9C46A' },
      { id: 'F07', name: 'Chivito',     icon: '🥪', sub: 'Uruguay 🇺🇾',      color: '#5BA8DF' },
      { id: 'F08', name: 'Encebollado', icon: '🍲', sub: 'Ecuador 🇪🇨',      color: '#F4A300' },
      { id: 'F09', name: 'Pabellón',    icon: '🍛', sub: 'Venezuela 🇻🇪',    color: '#E9B500' },
      { id: 'F10', name: 'Salteña',     icon: '🥟', sub: 'Bolivia 🇧🇴',      color: '#C97B30' },
      { id: 'F11', name: 'Sopa Paragua',icon: '🧀', sub: 'Paraguay 🇵🇾',     color: '#D9A441' },
      { id: 'F12', name: 'Gallo Pinto', icon: '🍚', sub: 'Costa Rica 🇨🇷',   color: '#6A994E' },
      { id: 'F13', name: 'Baleada',     icon: '🌯', sub: 'Honduras 🇭🇳',     color: '#18C3DF' },
      { id: 'F14', name: 'Pupusa',      icon: '🫓', sub: 'El Salvador 🇸🇻',  color: '#2A9D8F' },
      { id: 'F15', name: 'Pepián',      icon: '🍲', sub: 'Guatemala 🇬🇹',    color: '#A0522D' },
      { id: 'F16', name: 'Sancocho',    icon: '🍲', sub: 'Panamá 🇵🇦',       color: '#DA6A3C' },
      { id: 'F17', name: 'Mofongo',     icon: '🍌', sub: 'Puerto Rico 🇵🇷',  color: '#F6BD60' },
      { id: 'F18', name: 'Ropa Vieja',  icon: '🍖', sub: 'Cuba 🇨🇺',         color: '#B5651D' },
    ]
  },

  /* ============================== BOXEO (boxeadores famosos de Latinoamérica) ============================== */
  boxeo: {
    id: 'boxeo', name: 'Boxeo', emoji: '🥊',
    scenario: 'ring', finishLabel: '🥊 KO',
    avatar: 'photo',
    instructions: [
      'Compiten los boxeadores más famosos de cada país de Latinoamérica.',
      'Cada pulsación de su tecla es un golpe: +1.',
      '¡El más votado gana el combate!',
      'En TikFinity asigna cada regalo/like a la tecla de un boxeador.'
    ],
    competitors: [
      // México
      { id: 'CAN', name: 'Canelo Álvarez', abbr: 'CAN', sub: 'México 🇲🇽',      color: '#C8102E', wiki: 'Saúl_Álvarez' },
      { id: 'JCC', name: 'J.C. Chávez',    abbr: 'JCC', sub: 'México 🇲🇽',      color: '#006847', wiki: 'Julio_César_Chávez' },
      { id: 'JMM', name: 'J.M. Márquez',   abbr: 'JMM', sub: 'México 🇲🇽',      color: '#9B2D1F', wiki: 'Juan_Manuel_Márquez' },
      // Argentina
      { id: 'MON', name: 'Carlos Monzón',  abbr: 'MON', sub: 'Argentina 🇦🇷',   color: '#74ACDF', wiki: 'Carlos_Monzón' },
      { id: 'MAI', name: 'Marcos Maidana', abbr: 'MAI', sub: 'Argentina 🇦🇷',   color: '#3A6FB0', wiki: 'Marcos_Maidana' },
      // Puerto Rico
      { id: 'TRI', name: 'Félix Trinidad', abbr: 'TRI', sub: 'Puerto Rico 🇵🇷', color: '#3A86FF', wiki: 'Félix_Trinidad' },
      { id: 'COT', name: 'Miguel Cotto',   abbr: 'COT', sub: 'Puerto Rico 🇵🇷', color: '#1D6FB8', wiki: 'Miguel_Cotto' },
      { id: 'WGO', name: 'Wilfredo Gómez', abbr: 'WGO', sub: 'Puerto Rico 🇵🇷', color: '#2A6FB0', wiki: 'Wilfredo_Gómez' },
      // Panamá
      { id: 'DUR', name: 'Roberto Durán',  abbr: 'DUR', sub: 'Panamá 🇵🇦',      color: '#DA121A', wiki: 'Roberto_Durán' },
      // Nicaragua
      { id: 'AGU', name: 'Alexis Argüello',abbr: 'AGÜ', sub: 'Nicaragua 🇳🇮',   color: '#0098D8', wiki: 'Alexis_Argüello' },
      { id: 'CHO', name: 'Chocolatito',    abbr: 'CHO', sub: 'Nicaragua 🇳🇮',   color: '#0067C6', wiki: 'Román_González' },
      // Colombia / Cuba / Venezuela
      { id: 'PAM', name: 'Kid Pambelé',    abbr: 'PAM', sub: 'Colombia 🇨🇴',    color: '#FCD116', wiki: 'Antonio_Cervantes' },
      { id: 'STE', name: 'T. Stevenson',   abbr: 'STE', sub: 'Cuba 🇨🇺',        color: '#002A8F', wiki: 'Teófilo_Stevenson' },
      { id: 'SAV', name: 'Félix Savón',    abbr: 'SAV', sub: 'Cuba 🇨🇺',        color: '#0A3D91', wiki: 'Félix_Savón' },
      { id: 'LIN', name: 'Jorge Linares',  abbr: 'LIN', sub: 'Venezuela 🇻🇪',   color: '#FFCE00', wiki: 'Jorge_Linares' },
      { id: 'VAL', name: 'Edwin Valero',   abbr: 'VAL', sub: 'Venezuela 🇻🇪',   color: '#C99700', wiki: 'Edwin_Valero' },
      // Mundiales
      { id: 'ALI', name: 'Muhammad Ali',   abbr: 'ALI', sub: 'EE.UU. 🇺🇸',      color: '#B22234', wiki: 'Muhammad_Ali' },
      { id: 'TYS', name: 'Mike Tyson',     abbr: 'TYS', sub: 'EE.UU. 🇺🇸',      color: '#1A1A1A', wiki: 'Mike_Tyson' },
      { id: 'FMW', name: 'Mayweather',     abbr: 'FMW', sub: 'EE.UU. 🇺🇸',      color: '#FFD700', wiki: 'Floyd_Mayweather' },
      { id: 'PAC', name: 'Pacquiao',       abbr: 'PAC', sub: 'Filipinas 🇵🇭',   color: '#0038A8', wiki: 'Manny_Pacquiao' },
      { id: 'GGG', name: 'Golovkin',       abbr: 'GGG', sub: 'Kazajistán 🇰🇿',  color: '#00AFCA', wiki: 'Gennadi_Golovkin' },
      { id: 'KLI', name: 'Klitschko',      abbr: 'KLI', sub: 'Ucrania 🇺🇦',     color: '#FFD500', wiki: 'Vitali_Klitschko' },
    ]
  },

  /* ============================== CARRERAS DE RESISTENCIA (ciclismo/maratón LatAm + mundo) ============================== */
  resistencia: {
    id: 'resistencia', name: 'Carreras de Resistencia', emoji: '🚴',
    scenario: 'ruta', finishLabel: '🏁',
    avatar: 'photo',
    instructions: [
      'Compiten las figuras de resistencia (ciclismo y maratón) de Latinoamérica.',
      'Cada pulsación de su tecla lo impulsa +1.',
      '¡El primero en llegar a la meta gana!',
      'En TikFinity asigna cada acción del live a la tecla de un atleta.'
    ],
    competitors: [
      // Latinoamérica
      { id: 'NAI', name: 'Nairo Quintana', abbr: 'NAI', sub: 'Colombia 🇨🇴',  color: '#FCD116', wiki: 'Nairo_Quintana' },
      { id: 'EGA', name: 'Egan Bernal',    abbr: 'EGA', sub: 'Colombia 🇨🇴',  color: '#1D6FB8', wiki: 'Egan_Bernal' },
      { id: 'URA', name: 'Rigoberto Urán', abbr: 'URÁ', sub: 'Colombia 🇨🇴',  color: '#E5302F', wiki: 'Rigoberto_Urán' },
      { id: 'CAR', name: 'R. Carapaz',     abbr: 'CAR', sub: 'Ecuador 🇪🇨',   color: '#FFD100', wiki: 'Richard_Carapaz' },
      { id: 'LIM', name: 'Vanderlei Lima', abbr: 'LIM', sub: 'Brasil 🇧🇷',    color: '#009C3B', wiki: 'Vanderlei_Cordeiro_de_Lima' },
      { id: 'TEJ', name: 'Gladys Tejeda',  abbr: 'TEJ', sub: 'Perú 🇵🇪',      color: '#D91023', wiki: 'Gladys_Tejeda' },
      { id: 'KOB', name: 'Kristel Köbrich',abbr: 'KÖB', sub: 'Chile 🇨🇱',     color: '#0039A6', wiki: 'Kristel_Köbrich' },
      { id: 'CUR', name: 'Juan Curuchet',  abbr: 'CUR', sub: 'Argentina 🇦🇷', color: '#74ACDF', wiki: 'Juan_Curuchet' },
      { id: 'POL', name: 'Claudia Poll',   abbr: 'POL', sub: 'Costa Rica 🇨🇷',color: '#002B7F', wiki: 'Claudia_Poll' },
      { id: 'BRR', name: 'Erick Barrondo', abbr: 'BRR', sub: 'Guatemala 🇬🇹', color: '#4997D0', wiki: 'Erick_Barrondo' },
      // Mundiales (africanos, españoles, etc.)
      { id: 'KIP', name: 'Eliud Kipchoge', abbr: 'KIP', sub: 'Kenia 🇰🇪',     color: '#006600', wiki: 'Eliud_Kipchoge' },
      { id: 'GEB', name: 'Gebrselassie',   abbr: 'GEB', sub: 'Etiopía 🇪🇹',   color: '#078930', wiki: 'Haile_Gebrselassie' },
      { id: 'BEK', name: 'Kenenisa Bekele',abbr: 'BEK', sub: 'Etiopía 🇪🇹',   color: '#DA121A', wiki: 'Kenenisa_Bekele' },
      { id: 'DIB', name: 'Tirunesh Dibaba',abbr: 'DIB', sub: 'Etiopía 🇪🇹',   color: '#FCDD09', wiki: 'Tirunesh_Dibaba' },
      { id: 'IND', name: 'Miguel Induráin',abbr: 'IND', sub: 'España 🇪🇸',    color: '#AA151B', wiki: 'Miguel_Induráin' },
      { id: 'CTD', name: 'Alberto Contador',abbr:'CON', sub: 'España 🇪🇸',    color: '#FABD00', wiki: 'Alberto_Contador' },
      { id: 'VLV', name: 'A. Valverde',    abbr: 'VLV', sub: 'España 🇪🇸',    color: '#C60B1E', wiki: 'Alejandro_Valverde' },
      { id: 'FAR', name: 'Mo Farah',       abbr: 'FAR', sub: 'R. Unido 🇬🇧',  color: '#00247D', wiki: 'Mo_Farah' },
      { id: 'FRO', name: 'Chris Froome',   abbr: 'FRO', sub: 'R. Unido 🇬🇧',  color: '#CF142B', wiki: 'Chris_Froome' },
      { id: 'POG', name: 'Tadej Pogačar',  abbr: 'POG', sub: 'Eslovenia 🇸🇮', color: '#1B75BC', wiki: 'Tadej_Pogačar' },
      { id: 'MER', name: 'Eddy Merckx',    abbr: 'MER', sub: 'Bélgica 🇧🇪',   color: '#111111', wiki: 'Eddy_Merckx' },
    ]
  },

  /* ============================== CARRERA DE MOTOS ============================== */
  motos: {
    id: 'motos', name: 'Carrera de Motos', emoji: '🏍️',
    scenario: 'circuito', finishLabel: '🏁',
    avatar: 'badge',
    instructions: [
      'Cada moto compite en el circuito.',
      'Cada pulsación de su tecla acelera la moto +1.',
      '¡La primera en cruzar la línea de meta gana!',
      'En TikFinity asigna cada regalo/like a la tecla de una moto.'
    ],
    competitors: [
      { id: 'M1', name: 'Rayo',   icon: '🏍️', sub: '#46 ⚡', color: '#FFBE0B' },
      { id: 'M2', name: 'Trueno', icon: '🏍️', sub: '#93 🔥', color: '#FB5607' },
      { id: 'M3', name: 'Cohete', icon: '🏍️', sub: '#21 🚀', color: '#FF006E' },
      { id: 'M4', name: 'Sombra', icon: '🏍️', sub: '#07 🌑', color: '#8338EC' },
      { id: 'M5', name: 'Viento', icon: '🏍️', sub: '#11 💨', color: '#3A86FF' },
      { id: 'M6', name: 'Furia',  icon: '🏍️', sub: '#99 😤', color: '#06D6A0' },
    ]
  },

};
