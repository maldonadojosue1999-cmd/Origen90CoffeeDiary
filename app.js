const firebaseConfig = {
  apiKey: "AIzaSyA9pfbv77u95BfLQ6-syOkbj7HA0h-yg1w",
  authDomain: "origen-90-coffee-diary.firebaseapp.com",
  projectId: "origen-90-coffee-diary",
  storageBucket: "origen-90-coffee-diary.firebasestorage.app",
  messagingSenderId: "633377816776",
  appId: "1:633377816776:web:8d997ad36ea0d4e58965fd",
  measurementId: "G-F0JDS73J47"
};

// Initialize Firebase using the Compat API via CDN
firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// State
let extractions = [];
let tastings = [];
let pantry = [];

// Theme & Toasts
function setupTheme() {
  const btnThemeToggle = document.getElementById('btn-theme-toggle');
  const currentTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark');
  if (currentTheme === 'light') {
    document.body.setAttribute('data-theme', 'light');
  }

  if (btnThemeToggle) {
    btnThemeToggle.addEventListener('click', () => {
      const isLight = document.body.getAttribute('data-theme') === 'light';
      if (isLight) {
        document.body.removeAttribute('data-theme');
        localStorage.setItem('theme', 'dark');
      } else {
        document.body.setAttribute('data-theme', 'light');
        localStorage.setItem('theme', 'light');
      }
    });
  }
}

window.showToast = function(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) {
    console.log(`[Toast ${type}]`, message);
    return;
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  const icon = type === 'success' 
    ? `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.5 2 2 6.5 2 12S6.5 22 12 22 22 17.5 22 12 17.5 2 12 2M10 17L5 12L6.41 10.59L10 14.17L17.59 6.58L19 8L10 17Z"/></svg>`
    : `<svg width="20" height="20" viewBox="0 0 24 24"><path fill="currentColor" d="M13 14H11V9H13M13 18H11V16H13M1 21H23L12 2L1 21Z"/></svg>`;
  toast.innerHTML = `${icon} <span>${message}</span>`;
  container.appendChild(toast);
  setTimeout(() => {
    if (toast.parentNode) toast.parentNode.removeChild(toast);
  }, 3500);
};

window.alert = function(msg) {
  const text = String(msg).toLowerCase();
  const isError = text.includes('error') || text.includes('por favor') || text.includes('inválido');
  window.showToast(msg, isError ? 'error' : 'success');
};

setupTheme();

// Guide state
let replicateMode = false;
let replicateStages = [];
let nextStageIndex = 0;
let lastCountdownSec = -1;
let audioCtx = null;

function playBeep(freq = 440, type = 'sine', duration = 150) {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    
    oscillator.type = type;
    oscillator.frequency.value = freq;
    
    // Soft volume envelope
    gainNode.gain.setValueAtTime(0.1, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration/1000);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + duration/1000);
  } catch (e) {
    console.warn("AudioContext not supported or blocked", e);
  }
}

// Inspiracion - Base de Datos Local de Recetas
const espressoRecipes = [
  { id: 1, name: "Iced Latte de Vainilla", description: "Refrescante, dulce y cremoso. Un clásico infalible.", req: ["Hielo", "Leche", "Jarabe de vainilla"], steps: ["Llena un vaso con Hielo.", "Añade 20g de Jarabe de vainilla.", "Vierte 150ml de Leche.", "Extrae un Espresso doble (aprox. 36g) encima de todo y revuelve."] },
  { id: 2, name: "Mocha Helado", description: "El balance perfecto entre el amargor del café y el dulzor del chocolate.", req: ["Hielo", "Leche", "Jarabe de chocolate"], steps: ["En el fondo del vaso, añade 20g de Jarabe de chocolate.", "Extrae un Espresso doble directamente sobre el chocolate y revuelve para derretirlo.", "Añade Hielo.", "Rellena con 150ml de Leche y disfruta."] },
  { id: 3, name: "Espresso Orange Tonic", description: "Burbujeante y cítrico. Ideal para tardes calurosas.", req: ["Hielo", "Naranja", "Agua Tónica"], steps: ["Coloca una rodaja gruesa de Naranja en el fondo del vaso.", "Agrega mucho Hielo.", "Vierte Agua Tónica (aprox. 120ml) lentamente para no perder gas.", "Extrae un Espresso doble y viértelo suavemente encima para crear capas."] },
  { id: 4, name: "Cortado de Canela", description: "Pequeño pero poderoso, con un toque especiado reconfortante.", req: ["Leche", "Canela"], steps: ["Espuma 60ml de Leche caliente (textura sedosa).", "Extrae un Espresso doble (aprox 36g).", "Vierte la Leche sobre el Espresso.", "Espolvorea una pizca de Canela encima y sirve."] },
  { id: 5, name: "Cold Brew con Espuma de Vainilla", description: "Café frío intenso coronado con una nube dulce.", req: ["Cold brew", "Hielo", "Leche", "Jarabe de vainilla"], steps: ["Sirve 150ml de Cold brew sobre Hielo.", "Aparte, mezcla 50ml de Leche fría con 15g de Jarabe de vainilla.", "Bate vigorosamente o usa un espumador manual para densificar la mezcla de leche.", "Vierte la espuma dulce encima del Cold Brew y a disfrutar."] },
  { id: 6, name: "Latte de Chocolate y Canela", description: "Una bebida caliente abrazadora e indulgente.", req: ["Leche", "Cacao", "Canela"], steps: ["Mezcla 1 cucharadita de Cacao en polvo y una pizca de Canela con un poco de agua caliente para formar una pasta en la taza.", "Extrae un Espresso doble sobre la pasta y disuelve bien.", "Espuma 150ml de Leche caliente y vierte texturizando."] },
  { id: 7, name: "Shakerato de Vainilla", description: "Espresso sacudido, espumoso y refrescante.", req: ["Hielo", "Jarabe de vainilla"], steps: ["En una coctelera (o tarro con tapa), agrega mucho Hielo.", "Vierte 15g de Jarabe de vainilla.", "Extrae un Espresso doble e inmediatamente échalo a la coctelera.", "Agita fuertemente por 15 segundos y sirve colando el hielo."] },
  { id: 8, name: "Cold Brew Orange", description: "Un twist brillante al café extraído en frío usando el cítrico de la naranja.", req: ["Cold brew", "Naranja", "Hielo"], steps: ["Exprime el jugo de media Naranja en un vaso y agrega una rodaja.", "Añade Hielo.", "Vierte 150ml de tu Cold brew favorito."] },
  { id: 9, name: "Dirty Chai", description: "Si tienes mezcla de Chai, esta es la versión rápida y deliciosa.", req: ["Leche", "Chai (polvo o concentrado)"], steps: ["Extrae un Espresso doble.", "Mezcla 150ml de Leche con el Chai y calienta o espuma.", "Vierte la leche especiada y espumada sobre el espresso."] },
  { id: 10, name: "Mocha con Chispas", description: "Un capricho chocolatoso con textura crocante al final.", req: ["Leche", "Jarabe de chocolate", "Chispas de chocolate"], steps: ["Extrae el Espresso doble sobre 20g de Jarabe de chocolate.", "Espuma 150ml de Leche caliente y viértela sobre la base.", "Decora el tope de la espuma con abundantes Chispas de chocolate que se irán derritiendo lentamente."] },
  { id: 11, name: "Iced Americano", description: "Fuerte, fresco y directo al grano.", req: ["Hielo"], steps: ["Llena un vaso de cristal con abundante Hielo.", "Rellena 3/4 partes con agua fría.", "Vierte un Espresso doble recién extraído en la parte superior para hacer notar las capas hermosas antes de mezclar."] },
  { id: 12, name: "Naranja Moka Helado", description: "El chocolate y la naranja son una pareja espectacular.", req: ["Hielo", "Leche", "Jarabe de chocolate", "Naranja"], steps: ["En el fondo pon 20g de Jarabe de chocolate y una piel pequeña de Naranja machacada.", "Extrae el Espresso encima, mezcla con el chocolate caliente.", "Agrega hielo y por último 150ml de Leche fría."] },
  { id: 13, name: "Cold Brew Dulce Rápido", description: "Sin complicaciones, frío y con un toque de dulzor.", req: ["Cold brew", "Hielo", "Jarabe simple"], steps: ["Vierte 200ml de Cold Brew sobre Hielo.", "Agrega de 10 a 20g de Jarabe simple según tu gusto y revuelve bien."] },
  { id: 14, name: "Flat White", description: "Café intenso y textura de leche sedosa con microespuma fina.", req: ["Leche"], steps: ["Extrae un Espresso doble en una taza pequeña (~150ml).", "Espuma suavemente la Leche (menor grosor que un capuchino).", "Vierte la leche texturizada rápidamente sobre el espresso para mantener el sabor a café muy presente."] },
  { id: 15, name: "Bicerin Minimalista", description: "Capas de magia italiana versionadas en casa.", req: ["Cacao", "Leche"], steps: ["Mezcla Cacao espeso en el fondo con un de poco de agua caliente.", "Capa intermedia de Espresso doble caliente.", "Capa superior de Leche fría batida sin mezclar. Bébete las capas de un sorbo."] },
  { id: 16, name: "Caramel Macchiato", description: "Visualmente atractivo con capas de vainilla, leche, espresso y caramelo.", req: ["Leche", "Jarabe de vainilla", "Jarabe de caramelo"], steps: ["Añade 15g de Jarabe de vainilla en el fondo de la taza.", "Espuma 150ml de Leche caliente y viértela sobre la vainilla.", "Extrae el Espresso doble y viértelo lentamente por el centro para manchar la leche.", "Dibuja una red de Jarabe de caramelo sobre la espuma."] },
  { id: 17, name: "Matcha Espresso Fusion", description: "La colisión de dos mundos: té verde terroso y café intenso.", req: ["Hielo", "Leche de avena", "Matcha en polvo", "Jarabe simple"], steps: ["Mezcla 2g de Matcha con 30ml de agua caliente y 10g de Jarabe simple hasta quitar grumos.", "En un vaso alto pon Hielo y vierte la mezcla de matcha.", "Agrega 120ml de Leche de avena muy suavemente.", "Extrae un Espresso doble y viértelo al final para una tercera capa."] },
  { id: 18, name: "Oat Milk Honey Latte", description: "Suave, floral y reconfortante. El dulzor perfecto de la miel.", req: ["Leche de avena", "Miel"], steps: ["En tu taza, coloca 15g de Miel pura.", "Extrae un Espresso doble directo sobre la miel y revuelve para integrar.", "Espuma 150ml de Leche de avena (no la sobrecalientes).", "Vierte la leche sobre el espresso."] },
  { id: 19, name: "Affogato Clásico", description: "El postre por excelencia del barista italiano.", req: ["Helado de vainilla"], steps: ["Coloca una bola grande y firme de Helado de vainilla en una taza mediana.", "Extrae un Espresso doble caliente directamente sobre el helado inmediatamente antes de servir."] },
  { id: 20, name: "Café de Olla Espress", description: "Un tributo a México pero en máquina de espresso.", req: ["Canela", "Piloncillo (o panela)", "Clavo (opcional)"], steps: ["Rompe 15g de Piloncillo, una pizca de Canela y un Clavo en el fondo de la taza.", "Extrae el Espresso doble sobre las especias y deja infusionar por 1 minuto revolviendo.", "Añade un chorrito de agua caliente para aligerarlo (Americano corto)."] },
  { id: 21, name: "Espresso Martini (Mocktail)", description: "Sofisticado, con espuma de bar, pero sin alcohol.", req: ["Hielo", "Jarabe simple"], steps: ["En una coctelera, coloca abundante Hielo, 15g de Jarabe simple y un Espresso doble recién extraído.", "Agita vigorosamente durante 20 segundos.", "Cuela finamente (doble colado idealmente) en una copa Martini y decora con 3 granos de café."] },
  { id: 22, name: "Lavender Oat Latte", description: "Aromático y relajante. Tendencia en cafeterías indie.", req: ["Leche de avena", "Jarabe de lavanda"], steps: ["Agrega 15g de Jarabe de lavanda en la taza.", "Extrae el Espresso doble sobre el jarabe.", "Espuma 150ml de Leche de avena cuidando la textura.", "Vierte con arte latte y disfruta la fragancia."] },
  { id: 23, name: "Cappuccino Tradicional", description: "El verdadero: 1/3 espresso, 1/3 leche, 1/3 espuma densa gruesa.", req: ["Leche"], steps: ["Extrae un Espresso sencillo (aprox 18g a 20g) en una taza de 150ml.", "Espuma la Leche incorporando mucho más aire que en un Latte.", "Vierte la leche terminando con una corona de espuma blanca en la superficie."] },
  { id: 24, name: "Mazapán Latte", description: "Un toque mexicano de cacahuate (maní).", req: ["Leche", "Mazapán de cacahuate"], steps: ["Desmorona medio Mazapán (polvo de cacahuate) en el fondo de la taza.", "Extrae el Espresso doble para derretir la mezcla del dulce y revuelve vigorosamente.", "Espuma 150ml de Leche caliente y viértela encima. Espolvorea un poco de mazapán extra."] },
  { id: 25, name: "Toasted Almond Latte", description: "Sabores de nuez exquisitos combinados con café.", req: ["Leche de almendra", "Jarabe de almendra tostada"], steps: ["Añade 15g de Jarabe de almendra a la taza.", "Extrae un Espresso doble y revuélvelo.", "Espuma Leche de almendras y vierte con cuidado. Adorna con almendras fileteadas (opcional)."] },
  { id: 26, name: "Café Bombón", description: "Mitad espresso, mitad cielo muy dulce. Origen: España valenciana.", req: ["Leche condensada"], steps: ["En un vaso pequeño transparente, sirve 30-40ml de Leche condensada pura.", "Extrae un Espresso doble lentamente usando una cuchara invertida para que no se mezcle.", "Revuelve justo antes de beber."] },
  { id: 27, name: "Peppermint Mocha", description: "Clásico de invierno: frescura mentolada con el choque del cacao.", req: ["Leche", "Jarabe de chocolate", "Jarabe de menta"], steps: ["En tu taza, mezcla 15g de Jarabe de chocolate oscuro y 10g de Jarabe de menta.", "Extrae un Espresso doble en la taza y revuelve bien.", "Espuma la Leche y vierte. Coronado con crema batida (opcional)."] },
  { id: 28, name: "Pistachio Latte", description: "Verde, dulce cremoso y visualmente atractivo.", req: ["Leche", "Crema de pistache"], steps: ["Mezcla en la taza 15g de crema untable de Pistache con 5ml de agua caliente para aligerarlo.", "Extrae un Espresso doble encima y emulsiona.", "Espuma Leche regular texturizada y vierte. Sabor espectacular."] },
  { id: 29, name: "Dirty Matcha Iced", description: "Matcha y Espresso, versión helada con un choque de energías.", req: ["Hielo", "Leche", "Matcha en polvo"], steps: ["Prepárate 30ml de Matcha concentrado disuelto en agua tibia.", "Llena un vaso con Hielo y Leche.", "Vierte el Matcha encima de la leche.", "Extrae un Espresso y viértelo flotando sobre el Matcha verde para hacer 3 capas."] },
  { id: 30, name: "Espresso Cubano", description: "Un short shot inyectado con azúcar directamente en la pastilla o en la crema.", req: ["Azúcar morena"], steps: ["Prepara tu portafiltro con el café molido. Pon una capa fina de Azúcar morena en el fondo de la taza receptora (o arriba del disco de café).", "Extrae el Espresso (ristretto idealmente).", "La primera crema del café formará una 'espumita' increíblemente densa con el azúcar al revolver vigorosamente."] }
];

// Masterclass Intelligence Database
const masterRecipes = [
  { 
    id: "v60_jas", 
    method: "V60",
    name: "Método James Hoffmann (The Ultimate V60)", 
    description: "Extracción uniforme que favorece la dulzura y el balance en granos de alta densidad.", 
    steps: ["Molienda: Media-fina. Ratio: 1:15 (Ej. 15g café / 225g agua).", "0:00 - Vierte el doble o triple de agua (45g) y haz un 'Swirl' vigoroso para el blooming.", "0:45 - Vierte en espiral hasta alcanzar el 60% del peso total (135g) rápidamente.", "1:15 - Vierte el 40% restante (hasta 225g) más lento.", "1:30 - Remueve una vez con cuchara y haz otro 'Swirl' ligero.", "2:30 a 3:00 - Debería terminar la extracción. Cama plana."],
    pourStages: [
      { id: 'jas_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Blooming + Swirl', waterTarget: '45' },
      { id: 'jas_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Vertido Fuerte', waterTarget: '135' },
      { id: 'jas_3', timeMs: 75000, timeFormatted: '01:15.0', note: 'Vertido Suave', waterTarget: '225' },
      { id: 'jas_4', timeMs: 90000, timeFormatted: '01:30.0', note: 'Remover + Swirl', waterTarget: '225' },
      { id: 'jas_end', timeMs: 180000, timeFormatted: '03:00.0', note: 'Fin Extracción', waterTarget: '225' }
    ]
  },
  { 
    id: "v60_46", 
    method: "V60",
    name: "Método Tetsu Kasuya (4:6 Switch)", 
    description: "Control total de acidez/dulzura (primer 40%) y fuerza (último 60%). Ideal para resaltar notas brillantes.", 
    steps: ["Molienda: Muy gruesa (casi prensa francesa). Ratio: 1:15.", "0:00 - Vertido 1: 50g (Más agua aquí = Más acidez. Menos agua = Más dulzura).", "0:45 - Vertido 2: 70g (Completa el primer 40%).", "1:30 - Vertido 3: 60g.", "2:15 - Vertido 4: 60g.", "3:00 - Vertido 5: 60g (Divide el último 60% en más vertidos para mayor fuerza, o menos para un café más ligero)."],
    pourStages: [
      { id: 'kas_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Fase Dulzura/Acidez', waterTarget: '50' },
      { id: 'kas_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Cierre de Fase 40%', waterTarget: '120' },
      { id: 'kas_3', timeMs: 90000, timeFormatted: '01:30.0', note: 'Fuerza 1/3', waterTarget: '180' },
      { id: 'kas_4', timeMs: 135000, timeFormatted: '02:15.0', note: 'Fuerza 2/3', waterTarget: '240' },
      { id: 'kas_5', timeMs: 180000, timeFormatted: '03:00.0', note: 'Fuerza 3/3', waterTarget: '300' }
    ]
  },
  { 
    id: "v60_osmotic", 
    method: "V60",
    name: "Flujo Osmótico (Café Dark/Medium)", 
    description: "Extrae solo los componentes dulces y ricos del centro, evitando las canalizaciones amargas del borde.", 
    steps: ["Molienda: Media-gruesa. Ratio: 1:15.", "0:00 - Vierte 30g solo en el centro muy suavemente y deja florecer hasta que se agriete (aprox. 30s).", "0:30 - Comienza a verter con flujo milimétrico solo en una moneda del tamaño de 1 peso en el centro.", "Nunca toques el borde de papel ni rompas la costra exterior oscura.", "Mantén el nivel de agua constante hasta llegar al peso final."],
    pourStages: [
      { id: 'osm_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Centro (Soft Bloom)', waterTarget: '30' },
      { id: 'osm_2', timeMs: 30000, timeFormatted: '00:30.0', note: 'Pulsos Centro (Gota)', waterTarget: '100' },
      { id: 'osm_3', timeMs: 60000, timeFormatted: '01:00.0', note: 'Mantener Nivel Centro', waterTarget: '180' },
      { id: 'osm_4', timeMs: 90000, timeFormatted: '01:30.0', note: 'Flujo Constante (Flotar)', waterTarget: '250' }
    ]
  },
  { 
    id: "v60_rao", 
    method: "V60",
    name: "Scott Rao (One Pour & Spin)", 
    description: "Alta eficiencia de extracción. Ideal para tuestes nórdicos muy claros que cuestan disolver.", 
    steps: ["Molienda: Media-fina. Ratio: 1:17.", "0:00 - Blooming con 3x agua (Ej. 20g café / 60g agua). Revuelve agresivamente con cuchara excavando ('Excavation').", "0:45 - Un solo vertido continuo y relativamente rápido en círculos concéntricos hasta llegar al peso total (340g).", "Al finalizar el vertido, haz el 'Rao Spin' (toma la V60 y gírala en círculos para crear fuerza centrífuga).", "La cama debe quedar perfectamente plana y sin sedimentos en las paredes."],
    pourStages: [
      { id: 'rao_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Bloom + Excavación', waterTarget: '60' },
      { id: 'rao_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Vertido Principal Rápido', waterTarget: '340' },
      { id: 'rao_3', timeMs: 90000, timeFormatted: '01:30.0', note: 'Rao Spin (Centrífuga)', waterTarget: '340' }
    ]
  },
  { 
    id: "v60_iced", 
    method: "V60",
    name: "Flash Brew Hielo Japonés", 
    description: "Atrapa los compuestos volátiles florales enfriando repentinamente el café. Perfecto para Geishas y lavados florales.", 
    steps: ["Molienda: Ligeramente más fina. Ratio total 1:15 (2/3 Agua caliente, 1/3 Hielo).", "Ejemplo: 20g café, 100g de Hielo en el servidor, 200g de Agua caliente para extraer.", "0:00 - Blooming 60g de agua por 45s.", "0:45 - Viertido lento y centro-céntrico de los 140g restantes.", "Deja que gotee directo sobre los cubos de hielo. Remueve bien para enfriar instantáneamente."],
    pourStages: [
      { id: 'ice_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Blooming Fuerte', waterTarget: '60' },
      { id: 'ice_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Vertido Lento Central', waterTarget: '200' },
      { id: 'ice_3', timeMs: 120000, timeFormatted: '02:00.0', note: 'Remover Hielo Total', waterTarget: '200' }
    ]
  },
  { 
    id: "ap_hoffmann", 
    method: "Aeropress",
    name: "Hoffmann Aeropress Ultimate", 
    description: "La técnica estándar definitiva para consistencia y cero acidez amarga.", 
    steps: ["Molienda: Fina (tipo espresso goteo). Ratio: 1:18 (11g café / 200g agua caliente plena).", "0:00 - Vierte los 200g de agua directamente sobre el café de una sola vez.", "0:10 - Inserta el émbolo justo en la punta para crear un sello de vacío (evita que el agua gotee).", "2:00 - Toma la Aeropress por el cuerpo, haz un leve 'swirl' para nivelar la cama.", "2:30 - Presiona suavemente el émbolo hacia abajo por 30 segundos (sin hacer fuerza excesiva)."],
    pourStages: [
      { id: 'ap_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Vertido Total', waterTarget: '200' },
      { id: 'ap_2', timeMs: 10000, timeFormatted: '00:10.0', note: 'Insertar Sello Émbolo', waterTarget: '200' },
      { id: 'ap_3', timeMs: 120000, timeFormatted: '02:00.0', note: 'Romper Costra (Swirl)', waterTarget: '200' },
      { id: 'ap_4', timeMs: 150000, timeFormatted: '02:30.0', note: 'Prensar Suavemente (30s)', waterTarget: '200' },
      { id: 'ap_end', timeMs: 180000, timeFormatted: '03:00.0', note: 'Fin Extracción', waterTarget: '200' }
    ]
  },
  { 
    id: "ap_inverted", 
    method: "Aeropress",
    name: "Aeropress Invertido (Cuerpo Denso)", 
    description: "Maximiza el tiempo de inmersión total similar a una cata brasileña.", 
    steps: ["Molienda: Media. Ratio: 1:15 (15g café / 225g agua).", "0:00 - Con la Aeropress invertida (sobre el émbolo), vierte 50g para un blooming agresivo, revuelve 5 veces.", "0:30 - Llena lentamente hasta 225g.", "1:00 - Coloca el filtro de papel, enróscalo y purga el aire extra. Espera.", "2:00 - Voltea rápidamente la Aeropress sobre la taza (cuidado) y presiona por 30s."],
    pourStages: [
      { id: 'inv_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Blooming + Remover Invertido', waterTarget: '50' },
      { id: 'inv_2', timeMs: 30000, timeFormatted: '00:30.0', note: 'Llenado Total', waterTarget: '225' },
      { id: 'inv_3', timeMs: 60000, timeFormatted: '01:00.0', note: 'Colocar Filtro y Purgar', waterTarget: '225' },
      { id: 'inv_4', timeMs: 120000, timeFormatted: '02:00.0', note: 'Voltear y Prensar', waterTarget: '225' },
      { id: 'inv_end', timeMs: 150000, timeFormatted: '02:30.0', note: 'Fin Extracción', waterTarget: '225' }
    ]
  },
  { 
    id: "fp_hoffmann", 
    method: "Prensa Francesa",
    name: "Hoffmann No-Press French Press", 
    description: "Adiós a los sedimentos y sabor a barro. Una técnica pasiva para una taza cristalina.", 
    steps: ["Molienda: Media. Ratio: 1:15 (30g café / 450g agua recién hervida).", "0:00 - Vierte toda el agua directo sobre el café asegurando mojar todo.", "4:00 - La costra está flotando arriba. Con dos cucharas, rompe la costra y remueve la espuma/sedimentos flotantes.", "5:00 - ¡No pongas la tapa aún! Deja el café asentar solo por 5 a 8 minutos más. La gravedad limpiará tu taza.", "10:00 - Ahora sí, pon el émbolo pero NO LO BAJES, solo que descanse sobre la superficie. Sirve suavemente."],
    pourStages: [
      { id: 'fp_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Vertido Fuerte (Llenar)', waterTarget: '450' },
      { id: 'fp_2', timeMs: 240000, timeFormatted: '04:00.0', note: 'Romper Costra (Cucharas)', waterTarget: '450' },
      { id: 'fp_3', timeMs: 300000, timeFormatted: '05:00.0', note: 'Asentamiento Pasivo Térmico', waterTarget: '450' },
      { id: 'fp_end', timeMs: 600000, timeFormatted: '10:00.0', note: 'Servir (Sin Prensar)', waterTarget: '450' }
    ]
  },
  { 
    id: "cx_standard", 
    method: "Chemex",
    name: "Chemex Estándar (Claridad Floral)", 
    description: "Filtros gruesos atrapan todos los aceites. Perfecto para resaltar acidez brillante en grandes lotes.", 
    steps: ["Molienda: Media-Gruesa. Ratio: 1:16 (30g café / 480g agua).", "0:00 - Blooming lento en espiral con 60g de agua. Deja florecer hasta 45s.", "0:45 - Vertido central concéntrico extendido muy suave hasta 250g.", "1:45 - Segundo vertido suave evitando las paredes gruesas (no 'lavar' el papel) hasta los 480g finales.", "3:30 a 5:00 - Drenaje completo esperado por la restricción de flujo de la Chemex."],
    pourStages: [
      { id: 'cx_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Blooming Suave', waterTarget: '60' },
      { id: 'cx_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Vertido Lento al Centro', waterTarget: '250' },
      { id: 'cx_3', timeMs: 105000, timeFormatted: '01:45.0', note: 'Vertido Final', waterTarget: '480' },
      { id: 'cx_end', timeMs: 270000, timeFormatted: '04:30.0', note: 'Fin Extracción Esperado', waterTarget: '480' }
    ]
  },
  { 
    id: "esp_modern", 
    method: "Espresso",
    name: "Espresso Moderno (Ratio 1:2.5)", 
    description: "Extracción equilibrada, dulce y con mucha claridad. Ideal para tuestes medios o claros.", 
    steps: ["Molienda: Muy Fina (Espresso). Ratio: 1:2.5 (Ej. 18g café / 45g rendimiento).", "Distribuye con WDT para romper grumos y compacta (Tamp) niveladamente.", "0:00 - Inicia el cronómetro al encender la bomba.", "Si la extracción gotea a los 6-8 segundos, la molienda es correcta.", "Detén la bomba unos gramos antes de llegar a tu meta, porque seguirán cayendo gotas."],
    pourStages: [
      { id: 'esp_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Distribución y Compactado', waterTarget: '0' },
      { id: 'esp_2', timeMs: 5000, timeFormatted: '00:05.0', note: 'Pre-infusión (Goteo)', waterTarget: '0' },
      { id: 'esp_3', timeMs: 30000, timeFormatted: '00:30.0', note: 'Detener Bomba a 45g', waterTarget: '45' }
    ]
  },
  { 
    id: "esp_ristretto", 
    method: "Espresso",
    name: "Ristretto Tradicional (Ratio 1:1.5)", 
    description: "Cuerpo pesado, intenso y meloso. Perfecto para tuestes medios/oscuros y bases con leche.", 
    steps: ["Molienda: Extra Fina. Ratio: 1:1.5 (Ej. 18g café / 27g rendimiento).", "Distribución y compactado tradicional.", "0:00 - Inicia la bomba.", "La extracción debe ser lenta, similar al flujo de la miel caliente, casi goteando.", "Detén a los 25 a 30 segundos, obteniendo muy poco líquido pero ultra concentrado."],
    pourStages: [
      { id: 'ris_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Encender Bomba', waterTarget: '0' },
      { id: 'ris_2', timeMs: 25000, timeFormatted: '00:25.0', note: 'Detener a 27g', waterTarget: '27' }
    ]
  },
  { 
    id: "moka_classic", 
    method: "Moka Pot",
    name: "Moka Pot Hoffman Technique", 
    description: "Evita el sabor a quemado o metálico. Intenso como espresso, dulce como V60.", 
    steps: ["Molienda: Media-fina (un poco más gruesa que espresso). Llena la canasta sin presionar.", "Agua: Hervida. Llena la cámara inferior con agua caliente hasta justo debajo de la válvula.", "Pon la Moka a fuego bajo-medio, con la tapa ABIERTA.", "Cuando empiece a fluir el café lentamente, reduce el calor al mínimo.", "Al momento de burbujear o salir aire, retira del fuego y pon la base en agua fría para detener la extracción."],
    pourStages: [
      { id: 'mok_1', timeMs: 0, timeFormatted: '00:00.0', note: 'Armar cafetera con agua caliente', waterTarget: 'Vol' },
      { id: 'mok_2', timeMs: 45000, timeFormatted: '00:45.0', note: 'Fuego lento, flujo uniforme', waterTarget: 'Flu' },
      { id: 'mok_3', timeMs: 90000, timeFormatted: '01:30.0', note: 'Cortar calor (Base en Agua Fría)', waterTarget: 'Fin' }
    ]
  }
];

const varietalRecommendations = {
  "Geisha / Gesha": { recipe: "v60_jas", reason: "Tu pasión por el Geisha significa que valoras la extrema limpieza y notas florales. El método de James Hoffmann es ideal para maximizar esa claridad sin sobre-extraer amargor en granos de tan alta densidad genética." },
  "Heirloom (Etiopía)": { recipe: "v60_iced", reason: "Los etíopes Heirloom tienen delicadas notas a jazmín y té negro. ¿Has probado atrapar esos compuestos volátiles sobre hielo? El Flash Brew evitará que esas frágiles notas ácidas se oxiden con el calor." },
  "Bourbon": { recipe: "v60_osmotic", reason: "El Bourbon suele tener un cuerpo meloso y una dulzura fantástica. El Flujo Osmótico concentra la extracción en el corazón trufado de la pastilla de café, resaltando chocolates y nueces intensas." },
  "Caturra": { recipe: "v60_46", reason: "El Caturra puede tener una acidez brillante y cítrica. Usando el método 4:6 de Kasuya (modificando el vertido inicial a 60g y el segundo a 40g), podrás enfatizar su brillo natural al máximo." },
  "Castillo": { recipe: "v60_rao", reason: "El Castillo y otros híbridos colombianos resisten súper bien altas extracciones sin amargar rápido. El vertido único de Scott Rao te dará una taza súper sólida y de mucho cuerpo." },
  "Bourbon Rosado": { recipe: "v60_jas", reason: "El Pink Bourbon brilla en su complejidad enzimática (frutas de hueso). Hoffmann asegura una cama plana y térmica estable, lo mejor para no perder esas notas de melocotón/frutos rojos." },
  "Typica": { recipe: "v60_46", reason: "Los Typicas son tés dulces y elegantes. Con la molienda gruesa del 4:6 lograrás una bebida súper cristalina, casi como una infusión limpia." },
  "Blend / Mezcla": { recipe: "v60_rao", reason: "Cuando es un blend, necesitas asegurar una extracción ultra pareja porque tienes granos de diferentes tamaños y densidades. La agitación del 'Rao Spin' te garantiza consistencia taza a taza." },
  "Otra": { recipe: "v60_jas", reason: "Para orígenes experimentales o desconocidos, la receta del 'Ultimate V60' es el punto de partida estándar de oro para juzgar un café especial." }
};

// SCA Flavor Wheel Data
// Phase 3: Rueda SCA (3 levels)
const flavorWheel = [
  {
    id: 'fruity', name: 'Frutal', color: '#D4423E',
    children: [
      { id: 'berry', name: 'Bayas', children: ['Mora', 'Frambuesa', 'Arándano', 'Fresa'] },
      { id: 'dried-fruit', name: 'Fruta seca', children: ['Pasa', 'Ciruela pasa'] },
      { id: 'other-fruit', name: 'Otras frutas', children: ['Coco', 'Cereza', 'Granada', 'Piña', 'Uva', 'Manzana', 'Durazno', 'Pera'] },
      { id: 'citrus', name: 'Cítricos', children: ['Toronja', 'Naranja', 'Limón', 'Lima'] },
    ],
  },
  {
    id: 'sour-fermented', name: 'Ácido / Fermentado', color: '#E8B021',
    children: [
      { id: 'sour', name: 'Ácido', children: ['Aromático ácido', 'Ácido acético', 'Ácido butírico', 'Ácido isovalérico', 'Ácido cítrico', 'Ácido málico'] },
      { id: 'alcohol-fermented', name: 'Alcohol / Fermentado', children: ['Vino', 'Whiskey', 'Fermentado', 'Sobrefermentado'] },
    ],
  },
  {
    id: 'green-vegetative', name: 'Verde / Vegetal', color: '#5BA84F',
    children: [
      { id: 'olive-oil', name: 'Aceite de oliva', children: [] },
      { id: 'raw', name: 'Crudo', children: [] },
      { id: 'green-veg', name: 'Verde / Vegetal', children: ['Bajo maduración', 'Guisante', 'Vegetal crudo', 'Hierba fresca', 'Oscuro verde', 'Vegetal', 'Heno', 'Herbáceo'] },
      { id: 'beany', name: 'Frijolesco', children: [] },
    ],
  },
  {
    id: 'other', name: 'Otros', color: '#3B82C9',
    children: [
      { id: 'papery-musty', name: 'Papel / Mohoso', children: ['Rancio', 'Cartón', 'Papel', 'Madera', 'Mohoso', 'Polvoriento', 'Terroso'] },
      { id: 'chemical', name: 'Químico', children: ['Caucho', 'Hule', 'Bilis', 'Petróleo', 'Sulfuroso', 'Medicinal'] },
    ],
  },
  {
    id: 'roasted', name: 'Tostado', color: '#9B5538',
    children: [
      { id: 'pipe-tobacco', name: 'Tabaco de pipa', children: [] },
      { id: 'tobacco', name: 'Tabaco', children: [] },
      { id: 'burnt', name: 'Quemado', children: ['Acre', 'Cenizas', 'Humo', 'Café marrón', 'Quemado'] },
      { id: 'cereal', name: 'Cereal', children: ['Granos', 'Maltoso'] },
    ],
  },
  {
    id: 'spices', name: 'Especias', color: '#B83A4F',
    children: [
      { id: 'pungent', name: 'Picante', children: [] },
      { id: 'pepper', name: 'Pimienta', children: [] },
      { id: 'brown-spice', name: 'Especias dulces', children: ['Anís', 'Nuez moscada', 'Canela', 'Clavo'] },
    ],
  },
  {
    id: 'nutty-cocoa', name: 'Nuez / Cacao', color: '#8B5E3C',
    children: [
      { id: 'nutty', name: 'Nueces', children: ['Maní', 'Avellana', 'Almendra'] },
      { id: 'cocoa', name: 'Cacao', children: ['Chocolate', 'Chocolate oscuro'] },
    ],
  },
  {
    id: 'sweet', name: 'Dulce', color: '#E07A5F',
    children: [
      { id: 'brown-sugar', name: 'Azúcar morena', children: ['Melaza', 'Jarabe de arce', 'Azúcar caramelizada', 'Miel'] },
      { id: 'vanilla', name: 'Vainilla', children: [] },
      { id: 'vanillin', name: 'Vainillina', children: [] },
      { id: 'overall-sweet', name: 'Dulce general', children: [] },
      { id: 'sweet-aromatics', name: 'Aromáticos dulces', children: [] },
    ],
  },
  {
    id: 'floral', name: 'Floral', color: '#C76E9C',
    children: [
      { id: 'black-tea', name: 'Té negro', children: [] },
      { id: 'floral-sub', name: 'Floral', children: ['Manzanilla', 'Rosa', 'Jazmín'] },
    ],
  },
];

// DOM Elements
let navItems;
let views;
let headerSubtitle;

// Timer Variables
let timerInterval;
let startTime = 0;
let elapsedTime = 0;
let isTimerRunning = false;
let recordedStages = []; // Store laps here
let timerDisplay;
let btnTimerStart;
let btnTimerStop;
let btnTimerReset;
let btnTimerLap;
let pourStagesContainer;
let pourStagesList;
let timerGuideDisplay;

// Replicate Timer DOM
let repTimerDisplay;
let repTimerGuideDisplay;
let btnRepStart;
let btnRepStop;
let btnRepReset;
let btnRepBack;
let repTimerInterval;
let isRepTimerRunning = false;
let repStartTime = 0;
let repElapsedTime = 0;
let previousViewBeforeReplication = 'view-recetario';
// Inspiration Logic

function setupInspirationFilters() {
  // New: Wire up Noni Quick Prompts
  const quickPrompts = document.querySelectorAll('.noni-prompt-chip');
  const noniDrawer = document.getElementById('noni-drawer');
  const noniFab = document.getElementById('noni-fab');
  const noniInput = document.getElementById('noni-input');
  const formNoni = document.getElementById('form-noni-chat');

  quickPrompts.forEach(chip => {
    chip.addEventListener('click', () => {
      const promptText = chip.innerText.trim();
      
      // Open drawer if closed
      if (noniDrawer && !noniDrawer.classList.contains('open')) {
        noniDrawer.classList.add('open');
        if (noniFab) noniFab.classList.remove('sleeping');
      }

      // Inject text and submit
      if (noniInput && formNoni) {
        noniInput.value = promptText;
        // Simulate form submit to trigger Noni logic natively
        formNoni.dispatchEvent(new Event('submit', { cancelable: true, bubbles: true }));
      }
    });
  });

  document.querySelectorAll('.noni-prompt-chip').forEach(chip => {
    chip.addEventListener('mousemove', (e) => {
      const rect = chip.getBoundingClientRect();
      chip.style.setProperty('--mx', `${e.clientX - rect.left}px`);
      chip.style.setProperty('--my', `${e.clientY - rect.top}px`);
    });
  });
}

async function renderInspiration() {
  const dateEl = document.getElementById('daily-hero-date');
  if (dateEl) {
    const today = new Date();
    dateEl.textContent = today.toLocaleDateString('es', {
      day: 'numeric', month: 'short'
    }).toUpperCase();
  }

  const currentDateStr = new Date().toDateString();
  const cachedRecipeStr = localStorage.getItem('daily_noni_recipe');
  const cachedDate = localStorage.getItem('daily_noni_date');
  const apiKey = localStorage.getItem('gemini_api_key');

  const titleEl = document.getElementById('daily-recipe-name');
  const descEl = document.getElementById('daily-recipe-desc');
  const reqContainer = document.getElementById('daily-recipe-ingredients');
  const stepsContainer = document.getElementById('daily-recipe-steps');

  if (cachedDate === currentDateStr && cachedRecipeStr) {
    try {
      const dailyRecipe = JSON.parse(cachedRecipeStr);
      renderDailyNoniUI(dailyRecipe, titleEl, descEl, reqContainer, stepsContainer);
    } catch(e) {
      if (apiKey) fetchAndSaveDailyNoni(apiKey, currentDateStr, titleEl, descEl, reqContainer, stepsContainer);
      else renderFallbackDaily(titleEl, descEl, reqContainer, stepsContainer);
    }
  } else {
    // Need to fetch fresh
    if (apiKey) {
      fetchAndSaveDailyNoni(apiKey, currentDateStr, titleEl, descEl, reqContainer, stepsContainer);
    } else {
      renderFallbackDaily(titleEl, descEl, reqContainer, stepsContainer);
    }
  }



  const btnRefresh = document.getElementById('btn-refresh-daily');
  if (btnRefresh && !btnRefresh.dataset.wired) {
    btnRefresh.dataset.wired = '1';
    btnRefresh.addEventListener('click', async () => {
      const apiKey = localStorage.getItem('gemini_api_key');
      if (!apiKey) {
        alert('Configura la API Key de Gemini en ajustes para regenerar.');
        return;
      }
      btnRefresh.classList.add('spinning');
      btnRefresh.disabled = true;

      // Limpiar cache para forzar regeneración
      localStorage.removeItem('daily_noni_recipe');
      localStorage.removeItem('daily_noni_date');

      try {
        const titleEl = document.getElementById('daily-recipe-name');
        const descEl = document.getElementById('daily-recipe-desc');
        const reqContainer = document.getElementById('daily-recipe-ingredients');
        const stepsContainer = document.getElementById('daily-recipe-steps');
        await fetchAndSaveDailyNoni(
          apiKey,
          new Date().toDateString(),
          titleEl, descEl, reqContainer, stepsContainer
        );
      } finally {
        btnRefresh.classList.remove('spinning');
        btnRefresh.disabled = false;
      }
    });
  }

  // Trigger AI Suggester
  analyzeUserBeans();
}

function renderFallbackDaily(titleEl, descEl, reqContainer, stepsContainer) {
  const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0)) / 1000 / 60 / 60 / 24);
  const dailyRecipeIndex = dayOfYear % espressoRecipes.length;
  const dailyRecipe = espressoRecipes[dailyRecipeIndex];
  titleEl.textContent = dailyRecipe.name;
  descEl.textContent = dailyRecipe.description;
  reqContainer.innerHTML = dailyRecipe.req.map(r => `<span style="background: rgba(212,138,53,0.2); color: var(--color-accent); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">${r}</span>`).join('');
  stepsContainer.innerHTML = dailyRecipe.steps.map((s, i) => `<div style="margin-bottom: 4px;"><strong>${i+1}.</strong> ${s}</div>`).join('');
}

async function fetchAndSaveDailyNoni(apiKey, currentDateStr, titleEl, descEl, reqContainer, stepsContainer) {
  titleEl.innerHTML = '<span class="skeleton skeleton-title"></span>';
  descEl.innerHTML = '<span class="skeleton skeleton-line"></span><span class="skeleton skeleton-line short"></span>';
  reqContainer.innerHTML = `
    <span class="skeleton skeleton-pill"></span>
    <span class="skeleton skeleton-pill"></span>
    <span class="skeleton skeleton-pill"></span>
  `;
  stepsContainer.innerHTML = `
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line"></div>
    <div class="skeleton skeleton-line short"></div>
  `;

  const prompt = `Eres Noni. Inventa una receta aleatoria y exótica de café para la 'Receta del Día'. Puede ser cold brew, mocktail, latte, fermentación especial, o método filtrado. IMPORTANTE: En "method" si es una Bebida Preparada, usa exactamente "Bebida Preparada". Devuelve EXACTAMENTE este JSON y agrega las propiedades "recipeName" y "description" al mismo nivel: \`\`\`json\n{"recipeName": "Titúlo Creativo", "description": "Breve descripción seductora", "method": "Bebida Preparada", "coffeeWeight": 15, "waterWeight": 250, "grindSize": 45, "timeFormatted": "02:30.0", "notes": "...", "steps": ["1. Haz X"], "stages": [{ "type": "timer", "timeMs": 0, "timeFormatted": "00:00.0", "note": "Bloom", "waterTarget": 50 } ]}\n\`\`\``;

  try {
    const rawRes = await getNoniResponse("Invéntate la receta mágica y creativa del día para inspirarme", prompt);
    const jsonMatch = rawRes.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
    if (jsonMatch && jsonMatch[1]) {
      const dailyRecipe = JSON.parse(jsonMatch[1]);
      dailyRecipe.id = 'daily_' + Date.now();
      
      localStorage.setItem('daily_noni_recipe', JSON.stringify(dailyRecipe));
      localStorage.setItem('daily_noni_date', currentDateStr);
      
      renderDailyNoniUI(dailyRecipe, titleEl, descEl, reqContainer, stepsContainer);
    } else {
       throw new Error("Formato inválido");
    }
  } catch(e) {
    console.error("Noni Daily Error:", e);
    renderFallbackDaily(titleEl, descEl, reqContainer, stepsContainer);
  }
}

function renderDailyNoniUI(dailyRecipe, titleEl, descEl, reqContainer, stepsContainer) {
  titleEl.textContent = dailyRecipe.recipeName || "Receta Sorpresa";
  descEl.textContent = dailyRecipe.description || "";
  reqContainer.innerHTML = `<span style="background: rgba(212,138,53,0.2); color: var(--color-accent); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">Molienda: ${dailyRecipe.grindSize}</span><span style="background: rgba(212,138,53,0.2); color: var(--color-accent); padding: 2px 8px; border-radius: 4px; font-size: 0.7rem;">Café: ${dailyRecipe.coffeeWeight}g</span>`;
  
  const safeSteps = dailyRecipe.steps || [];
  stepsContainer.innerHTML = safeSteps.map((s, i) => `<div style="margin-bottom: 4px;"><strong>${i+1}.</strong> ${s}</div>`).join('');
  
  const actionsHtml = `
    <div style="margin-top: 12px; display: flex; gap: 8px;">
      <button class="btn btn-outline" style="font-size: 0.8rem; padding: 6px 12px; border-color: var(--color-accent); color: var(--color-accent);" onclick="window.saveNoniDailyRecipe()">Guardar en Recetario</button>
    </div>
  `;
  stepsContainer.innerHTML += actionsHtml;
  
  window.saveNoniDailyRecipe = async () => {
    try {
      const rd = JSON.parse(localStorage.getItem('daily_noni_recipe'));
      const newExt = {
        id: Date.now().toString(),
        date: new Date().toISOString(),
        method: rd.method || "Bebida Preparada",
        grindSize: rd.grindSize || 0,
        coffeeWeight: rd.coffeeWeight || 0,
        waterWeight: rd.waterWeight || 0,
        ratio: rd.coffeeWeight > 0 ? (rd.waterWeight / rd.coffeeWeight).toFixed(1) : 0,
        timeFormatted: rd.timeFormatted || "00:00.0",
        timeMs: 0,
        notes: (rd.recipeName || "") + " - " + (rd.description || ""), 
        isFavorite: false,
        isFromNoni: true,
        steps: rd.steps || [],
        pourStages: (rd.stages || []).map(s => {
          if (s.timeFormatted) return s;
          const ms = s.timeMs || 0;
          const mins = Math.floor(ms / 60000).toString().padStart(2, '0');
          const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
          return { ...s, timeFormatted: `${mins}:${secs}.0` };
        })
      };
      await db.collection("extractions").add(newExt);
      alert('¡Aventura del día guardada en tu Recetario!');
      // Prevent spam clicks
      const btn = stepsContainer.querySelector('.btn-outline');
      if (btn) btn.style.display = 'none';
    } catch(e) {
      alert('Error al guardar la receta en Firestore.');
    }
  };
}

function analyzeUserBeans() {
  const suggesterBox = document.getElementById('ai-suggester-box');
  const suggesterContent = document.getElementById('ai-suggester-content');
  if (!suggesterBox || !suggesterContent) return;
  suggesterBox.classList.add('hidden'); // Hide by default

  let targetVarietal = null;
  let targetOrigin = null;
  let isFromPantry = false;

  // 1. Try to find a highly rated or recent tasting
  if (tastings && tastings.length > 0) {
    const highlyRated = tastings.filter(t => t.rating >= 4 && t.varietal);
    const beansToAnalyze = highlyRated.length > 0 ? highlyRated : tastings.filter(t => t.varietal);
    
    if (beansToAnalyze.length > 0) {
      beansToAnalyze.sort((a, b) => b.id - a.id);
      const targetBean = beansToAnalyze[0];
      targetVarietal = targetBean.varietal.split(' (')[0].trim();
      targetOrigin = targetBean.origin;
    }
  }

  // 2. If no valid tasting found, fallback to pantry
  if (!targetVarietal && pantry && pantry.length > 0) {
    // Sort pantry by newest
    const sortedPantry = [...pantry].sort((a, b) => b.id - a.id);
    const targetPantry = sortedPantry[0];
    targetVarietal = "Otra"; // Fallback varietal
    targetOrigin = targetPantry.origin || "tu Alacena";
    isFromPantry = true;
  }

  // 3. If still nothing, show empty state message
  if (!targetVarietal) {
    suggesterContent.innerHTML = `<div style="font-size: 0.9rem; color: var(--color-text-secondary); padding: 10px 0;">Añade granos a tu Alacena o registra catas para recibir recomendaciones personalizadas basadas en tus gustos.</div>`;
    suggesterBox.classList.remove('hidden');
    return;
  }

  // 4. Match with intelligence database (use specific or fallback "Otra")
  const recommendation = varietalRecommendations[targetVarietal] || varietalRecommendations["Otra"];
  
  if (recommendation) {
    const recipe = masterRecipes.find(r => r.id === recommendation.recipe);
    if (recipe) {
      // Build UI
      let contextMsg = isFromPantry 
        ? `Hemos notado que has añadido un café de <strong>${targetOrigin}</strong> a tu Alacena.`
        : `Hemos notado que has estado catando <strong>${targetVarietal}</strong> (Origen: ${targetOrigin}).`;

      suggesterContent.innerHTML = `
        <div style="font-size: 0.9rem; color: var(--color-text-primary); margin-bottom: 12px; line-height: 1.4;">
          ${contextMsg} 
          <span style="color: var(--color-text-muted);">${recommendation.reason}</span>
        </div>
        
        <div style="background-color: var(--color-surface); padding: 12px; border-radius: var(--radius-sm); border-left: 3px solid var(--color-success);">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
            <div style="font-weight: 600; font-size: 1rem; color: var(--color-success);">${recipe.name}</div>
            <span style="font-size: 0.7rem; background: rgba(106, 191, 99, 0.1); color: var(--color-success); padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${recipe.method}</span>
          </div>
          <div style="font-size: 0.8rem; color: var(--color-text-secondary); margin-bottom: 12px; font-style: italic;">${recipe.description}</div>
          
          <div style="font-size: 0.85rem; color: var(--color-text-primary); margin-bottom: 12px;">
            ${recipe.steps.map((s, i) => `<div style="margin-bottom: 6px;"><strong>Paso ${i+1}:</strong> ${s}</div>`).join('')}
          </div>
          
          <button class="btn btn-primary" onclick="window.startReplicationFromAI('${recipe.id}')" style="width: 100%; font-size: 0.9rem; padding: 10px;">
            <svg width="18" height="18" viewBox="0 0 24 24" style="margin-right: 6px; vertical-align: bottom;"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M12.5,7V12.25L17,14.92L16.25,16.15L11,13V7H12.5Z"/></svg>
            Replicar Receta ${recipe.method}
          </button>
        </div>
      `;
      suggesterBox.classList.remove('hidden');
    }
  }
}

// (Masterclass Tabs system removed since Noni handles the IA now and the catalog is the only view)

// Catalog Filters
document.querySelectorAll('#ai-catalog-filters .chip').forEach(chip => {
  chip.addEventListener('click', (e) => {
    document.querySelectorAll('#ai-catalog-filters .chip').forEach(c => c.classList.remove('selected'));
    e.target.classList.add('selected');
    renderMasterCatalog(e.target.dataset.method);
  });
});

function renderMasterCatalog(methodFilter) {
  const container = document.getElementById('ai-catalog-list');
  container.innerHTML = '';
  
  let recipesToRender = masterRecipes;
  if (methodFilter !== 'Todos') {
    recipesToRender = masterRecipes.filter(r => r.method === methodFilter);
  }

  recipesToRender.forEach(recipe => {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--color-bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05); flex: 0 0 calc(100vw - 48px); max-width: 320px; scroll-snap-align: start;';
    card.innerHTML = `
      <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px;">
        <div style="font-weight: 500; font-size: 1.05rem; color: var(--color-text-primary);">${recipe.name}</div>
        <span style="font-size: 0.7rem; background: rgba(255,255,255,0.1); color: var(--color-text-secondary); padding: 2px 6px; border-radius: 4px; text-transform: uppercase;">${recipe.method}</span>
      </div>
      <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 12px; font-style: italic;">${recipe.description}</div>
      
      <div style="font-size: 0.8rem; color: var(--color-text-muted); border-left: 2px solid var(--color-border); padding-left: 10px; margin-bottom: 12px; max-height: 80px; overflow-y: auto; scrollbar-width: thin;">
        ${recipe.steps.map((s, i) => `<div style="margin-bottom: 4px;"><strong>Paso ${i+1}:</strong> ${s}</div>`).join('')}
      </div>

      <button class="btn btn-outline" onclick="window.startReplicationFromAI('${recipe.id}')" style="width: 100%; font-size: 0.85rem; padding: 6px;">
        Replicar
      </button>
    `;
    container.appendChild(card);
  });
}



// Initialize on load
function init() {
  // DOM Elements
  navItems = document.querySelectorAll('.nav-item');
  views = document.querySelectorAll('.view-section');
  headerSubtitle = document.getElementById('header-subtitle');
  
  // Timer DOM
  timerDisplay = document.getElementById('timer-display');
  btnTimerStart = document.getElementById('btn-timer-start');
  btnTimerStop = document.getElementById('btn-timer-stop');
  btnTimerReset = document.getElementById('btn-timer-reset');
  btnTimerLap = document.getElementById('btn-timer-lap');
  pourStagesContainer = document.getElementById('pour-stages-container');
  pourStagesList = document.getElementById('pour-stages-list');
  timerGuideDisplay = document.getElementById('timer-guide-display');

  // Replication DOM
  repTimerDisplay = document.getElementById('rep-timer-display');
  repTimerGuideDisplay = document.getElementById('rep-timer-guide-display');
  btnRepStart = document.getElementById('btn-rep-start');
  btnRepStop = document.getElementById('btn-rep-stop');
  btnRepReset = document.getElementById('btn-rep-reset');
  btnRepBack = document.getElementById('btn-rep-back');

  setupNavigation();
  setupTimer();
  setupReplicationTimer();

  setupForms();
  setupInteractivity();
  setupPantryForm();
  initInteractiveBitacora();
  initInteractiveCata();
  initInteractiveCups();
  initInteractiveWheel();
  setupInspirationFilters();
  renderInspiration();
  setupRecetarioSearch();
  setupQuickPreview();
  initFirebaseSync();
}

function initFirebaseSync() {
  db.collection("extractions").onSnapshot((snapshot) => {
    extractions = snapshot.docs.map(d => {
      const data = d.data();
      let safeDate = data.date;
      if (!safeDate || isNaN(new Date(safeDate).getTime())) {
          safeDate = new Date().toISOString(); // Fallback valid ISO
      }
      return { 
        ...data,
        firebaseId: d.id, 
        id: data.id || Date.parse(safeDate).toString(), 
        date: safeDate
      };
    });
    updateExtractionDropdown();
    renderRecipes();
  });

  db.collection("tastings").onSnapshot((snapshot) => {
    tastings = snapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() }));
    updateExtractionDropdown();
    renderRecipes();
    analyzeUserBeans(); // Re-run AI logic if new tastings arrive
  });

  db.collection("pantry").onSnapshot((snapshot) => {
    pantry = snapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() }));
    if (window.renderPantry) window.renderPantry();
    if (window.updatePantryDropdown) window.updatePantryDropdown();
  });
}

// Navigation
function setupNavigation() {
  navItems.forEach(item => {
    item.addEventListener('click', () => {
      const targetId = item.getAttribute('data-target');
      
      const updateDOM = () => {
        // Update active nav
        navItems.forEach(n => n.classList.remove('active'));
        item.classList.add('active');

        // Update header
        headerSubtitle.textContent = item.getAttribute('data-title');

        // Update view
        views.forEach(view => {
          if (view.id === targetId) {
            view.classList.remove('hidden');
          } else {
            view.classList.add('hidden');
          }
        });
      };

      if (!document.startViewTransition) {
        updateDOM();
      } else {
        document.startViewTransition(() => updateDOM());
      }
    });
  });
}

// Interactive Bitacora State
const METHOD_PROFILES = {
  "V60 02": { targetTime: 180, ratioIdeal: 16, ratioMin: 14, ratioMax: 17, tempMin: 92, tempMax: 96 },
  "Dripper de cerámica 01": { targetTime: 150, ratioIdeal: 15.5, ratioMin: 14, ratioMax: 17, tempMin: 92, tempMax: 96 },
  "AeroPress": { targetTime: 90, ratioIdeal: 14, ratioMin: 12, ratioMax: 16, tempMin: 80, tempMax: 92 },
  "Mocca": { targetTime: 240, ratioIdeal: 10, ratioMin: 8, ratioMax: 12, tempMin: 0, tempMax: 0 },
  "Prensa Francesa": { targetTime: 240, ratioIdeal: 15, ratioMin: 13, ratioMax: 17, tempMin: 92, tempMax: 96 },
  "Bebida Preparada": { targetTime: 240, ratioIdeal: 15, ratioMin: 10, ratioMax: 20, tempMin: 80, tempMax: 100 }
};

let currentTargetTime = 240;
let animFrameId = null;

// Phase 3: Interactive Sensory Tasting
const SENSORY_MAP = {
  sweetness: {
    color: '#E07A5F',
    levels: [
      { val: 1, emoji: '🫥', label: 'Imperceptible' },
      { val: 2, emoji: '😐', label: 'Sutil' },
      { val: 3, emoji: '🙂', label: 'Balanceado' },
      { val: 4, emoji: '😋', label: 'Marcado' },
      { val: 5, emoji: '🤩', label: 'Intenso, casi azucarado' },
    ],
  },
  acidity: {
    color: '#E8B021',
    levels: [
      { val: 1, emoji: '😶', label: 'Plana' },
      { val: 2, emoji: '🙂', label: 'Suave' },
      { val: 3, emoji: '😊', label: 'Vibrante y limpia' },
      { val: 4, emoji: '🤔', label: 'Brillante y compleja' },
      { val: 5, emoji: '😬', label: 'Punzante / agresiva' },
    ],
  },
  clarity: {
    color: '#3B82C9',
    levels: [
      { val: 1, emoji: '🌫️', label: 'Turbia / confusa' },
      { val: 2, emoji: '😕', label: 'Difusa' },
      { val: 3, emoji: '🙂', label: 'Definida' },
      { val: 4, emoji: '✨', label: 'Cristalina' },
      { val: 5, emoji: '💎', label: 'Translúcida, los sabores brillan' },
    ],
  },
  aftertaste: {
    color: '#8B5E3C',
    levels: [
      { val: 1, emoji: '💨', label: 'Se desvanece de inmediato' },
      { val: 2, emoji: '😐', label: 'Corto' },
      { val: 3, emoji: '🙂', label: 'Medio, agradable' },
      { val: 4, emoji: '😌', label: 'Largo y limpio' },
      { val: 5, emoji: '🥹', label: 'Persistente, memorable' },
    ],
  },
};

function generateCataSummary() {
  const extId = document.getElementById('cata-extraction')?.value;
  const ext = extractions.find(e => e.id === extId);
  const method = ext?.method || 'Cata';
  const flavors = Array.from(selectedSCAFlavors);
  const rating = parseFloat(document.getElementById('cup-rating')?.value || 0);
  const sweetness = parseInt(document.getElementById('metric-sweetness')?.value || 3);
  const acidity = parseInt(document.getElementById('metric-acidity')?.value || 3);
  const clarity = parseInt(document.getElementById('metric-clarity')?.value || 3);
  const aftertaste = parseInt(document.getElementById('metric-aftertaste')?.value || 3);
  return {
    method,
    flavors,
    rating,
    metrics: { sweetness, acidity, clarity, aftertaste },
    narrative: buildNarrative({ method, flavors, sweetness, acidity, clarity, aftertaste, rating })
  };
}

function buildNarrative({ method, flavors, sweetness, acidity, clarity, aftertaste, rating }) {
  if (rating === 0 && flavors.length === 0) return 'Completa la cata para ver el resumen.';

  const parts = [];
  parts.push(`<strong>${method}</strong>`);

  if (flavors.length > 0) {
    const flavorText = flavors.length <= 3
      ? `con notas a ${flavors.slice(0, -1).join(', ')}${flavors.length > 1 ? ' y ' : ''}${flavors[flavors.length - 1]}`
      : `con notas a ${flavors.slice(0, 2).join(', ')} y ${flavors.length - 2} matices más`;
    parts.push(flavorText);
  }

  const bd = [];
  if (sweetness >= 4) bd.push('dulzor marcado');
  else if (sweetness <= 2) bd.push('dulzor sutil');
  if (acidity >= 4) bd.push('acidez vibrante');
  else if (acidity <= 2) bd.push('acidez suave');
  if (clarity >= 4) bd.push('taza cristalina');
  else if (clarity <= 2) bd.push('cuerpo turbio');
  if (aftertaste >= 4) bd.push('postgusto persistente');
  else if (aftertaste <= 2) bd.push('postgusto corto');
  if (bd.length === 0 && sweetness === 3 && acidity === 3 && clarity === 3 && aftertaste === 3)
    bd.push('perfil balanceado');

  if (bd.length > 0) {
    const bodyText = bd.length === 1
      ? `de ${bd[0]}`
      : `con ${bd.slice(0, -1).join(', ')} y ${bd[bd.length - 1]}`;
    parts.push(bodyText);
  }

  let closing = '';
  if      (rating >= 4.5) closing = '. Una taza memorable.';
  else if (rating >= 4)   closing = '. Excelente extracción.';
  else if (rating >= 3)   closing = '. Cata sólida.';
  else if (rating >= 2)   closing = '. Hay margen para mejorar.';
  else if (rating > 0)    closing = '. Vale la pena ajustar la receta.';

  return parts.join(' ') + closing;
}

function renderSummaryCard() {
  const card = document.getElementById('cata-summary-card');
  if (!card) return;

  const data = generateCataSummary();
  const hasData = data.rating > 0 || data.flavors.length > 0;

  if (!hasData) { card.classList.add('hidden'); return; }

  // Animate in only when transitioning hidden→visible
  const wasHidden = card.classList.contains('hidden');
  card.classList.remove('hidden');
  if (wasHidden) {
    card.style.animation = 'none';
    void card.offsetWidth;
    card.style.animation = '';
  }

  const methodEl = document.getElementById('summary-method');
  if (methodEl) methodEl.textContent = data.method;

  const starsEl = document.getElementById('summary-stars');
  const scoreEl = document.getElementById('summary-score');
  if (starsEl && scoreEl) {
    if (data.rating > 0) {
      const full = Math.floor(data.rating);
      const hasHalf = data.rating % 1 !== 0;
      let stars = '★'.repeat(full);
      if (hasHalf) stars += '⯬';
      stars += '☆'.repeat(5 - Math.ceil(data.rating));
      starsEl.textContent = stars;
      scoreEl.textContent = data.rating.toFixed(1) + ' / 5';
    } else {
      starsEl.textContent = '☆☆☆☆☆';
      scoreEl.textContent = 'Sin calificar';
    }
  }

  const polygon = document.getElementById('summary-radar-polygon');
  if (polygon) {
    const m = data.metrics;
    const pts = [
      `60,${60 - (m.sweetness * 10)}`,
      `${60 + (m.acidity * 10)},60`,
      `60,${60 + (m.clarity * 10)}`,
      `${60 - (m.aftertaste * 10)},60`
    ];
    polygon.setAttribute('points', pts.join(' '));
  }

  const narrativeEl = document.getElementById('summary-narrative');
  if (narrativeEl) narrativeEl.innerHTML = data.narrative;

  const flavorsEl = document.getElementById('summary-flavors');
  if (flavorsEl) {
    flavorsEl.innerHTML = '';
    data.flavors.slice(0, 5).forEach(f => {
      const tag = document.createElement('span');
      tag.className = 'summary-flavor-tag';
      tag.textContent = f;
      flavorsEl.appendChild(tag);
    });
    if (data.flavors.length > 5) {
      const more = document.createElement('span');
      more.className = 'summary-flavor-tag';
      more.style.opacity = '0.6';
      more.textContent = `+${data.flavors.length - 5}`;
      flavorsEl.appendChild(more);
    }
  }
}

function initInteractiveCata() {
  const radarPolygon = document.getElementById('radar-polygon');
  const radarVSweet = document.getElementById('radar-v-sweet');
  const radarVAcid = document.getElementById('radar-v-acid');
  const radarVClear = document.getElementById('radar-v-clear');
  const radarVAfter = document.getElementById('radar-v-after');

  const sensoryValues = { sweetness: 3, acidity: 3, clarity: 3, aftertaste: 3 };
  let comparingTasting = null;

  function populateCompareDropdown() {
    const select = document.getElementById('compare-source-select');
    if (!select) return;

    const currentExtId = document.getElementById('cata-extraction').value;
    const currentExt = extractions.find(e => e.id === currentExtId);
    const currentMethod = currentExt?.method;

    const candidates = tastings
      .filter(t => t.metrics && typeof t.metrics.sweetness === 'number')
      .map(t => {
        const ext = extractions.find(e => e.id === t.extractionId);
        return {
          tasting: t,
          extraction: ext,
          sameMethod: ext && currentMethod && ext.method === currentMethod,
          sameVarietal: t.varietal && currentExt && t.varietal === currentExt.varietal
        };
      })
      .filter(c => c.extraction);

    candidates.sort((a, b) => {
      if (a.sameVarietal !== b.sameVarietal) return b.sameVarietal - a.sameVarietal;
      if (a.sameMethod !== b.sameMethod) return b.sameMethod - a.sameMethod;
      return new Date(b.extraction.date) - new Date(a.extraction.date);
    });

    select.innerHTML = '<option value="">Selecciona una cata...</option>';

    if (candidates.length === 0) {
      select.innerHTML = '<option value="">No hay catas previas para comparar</option>';
      select.disabled = true;
      return;
    }
    select.disabled = false;

    candidates.slice(0, 15).forEach(c => {
      const date = new Date(c.extraction.date);
      const dateStr = date.toLocaleDateString('es', { day: 'numeric', month: 'short' });
      const tag = c.sameVarietal ? '⭐ ' : (c.sameMethod ? '◆ ' : '');
      const label = `${tag}${c.extraction.method} · ${c.tasting.varietal || 'Sin varietal'} · ${dateStr}`;

      const opt = document.createElement('option');
      opt.value = c.tasting.id;
      opt.textContent = label;
      select.appendChild(opt);
    });
  }

  function updateCompareRadar() {
    const elements = {
      poly: document.getElementById('radar-compare-polygon'),
      sweet: document.getElementById('radar-compare-v-sweet'),
      acid: document.getElementById('radar-compare-v-acid'),
      clear: document.getElementById('radar-compare-v-clear'),
      after: document.getElementById('radar-compare-v-after')
    };

    if (!elements.poly) return;

    const legend = document.getElementById('radar-legend');
    const legendLabel = document.getElementById('legend-compare-label');

    if (!comparingTasting || !comparingTasting.metrics) {
      Object.values(elements).forEach(el => { if (el) el.style.display = 'none'; });
      if (legend) legend.classList.add('hidden');
      return;
    }

    const m = comparingTasting.metrics;
    const pts = [
      `140,${140 - (m.sweetness * 20)}`,
      `${140 + (m.acidity * 20)},140`,
      `140,${140 + (m.clarity * 20)}`,
      `${140 - (m.aftertaste * 20)},140`
    ];
    elements.poly.setAttribute('points', pts.join(' '));
    elements.poly.style.display = 'block';

    elements.sweet.setAttribute('cy', 140 - (m.sweetness * 20));
    elements.acid.setAttribute('cx', 140 + (m.acidity * 20));
    elements.clear.setAttribute('cy', 140 + (m.clarity * 20));
    elements.after.setAttribute('cx', 140 - (m.aftertaste * 20));

    ['sweet', 'acid', 'clear', 'after'].forEach(k => {
      elements[k].style.display = 'block';
    });

    if (legend && legendLabel) {
      const ext = extractions.find(e => e.id === comparingTasting.extractionId);
      const dateStr = ext ? new Date(ext.date).toLocaleDateString('es', { day: 'numeric', month: 'short' }) : '';
      legendLabel.textContent = `Cata del ${dateStr}`;
      legend.classList.remove('hidden');
    }
  }

  function updateInsightMessage() {
    const insightEl = document.getElementById('cata-insight');
    if (!insightEl) return;

    if (!comparingTasting || !comparingTasting.metrics) {
      insightEl.classList.remove('visible');
      return;
    }

    const cur = sensoryValues;
    const prev = comparingTasting.metrics;

    const diffs = {
      sweetness: cur.sweetness - prev.sweetness,
      acidity: cur.acidity - prev.acidity,
      clarity: cur.clarity - prev.clarity,
      aftertaste: cur.aftertaste - prev.aftertaste
    };

    const totalDiff = Math.abs(diffs.sweetness) + Math.abs(diffs.acidity) +
                      Math.abs(diffs.clarity) + Math.abs(diffs.aftertaste);
    const avgDiff = totalDiff / 4;

    let message = '';

    if (avgDiff < 0.5) {
      message = `<span class="insight-icon">👌</span><strong>Cata muy consistente</strong> con la anterior. Estás replicando bien la experiencia.`;
    } else if (avgDiff > 1.5) {
      message = `<span class="insight-icon">🔍</span><strong>Diferencia notable</strong> con la cata anterior. ¿Cambió algo en la extracción o el grano?`;
    } else {
      const maxKey = Object.keys(diffs).reduce((a, b) =>
        Math.abs(diffs[a]) > Math.abs(diffs[b]) ? a : b
      );
      const maxDiff = diffs[maxKey];
      const direction = maxDiff > 0 ? 'subió' : 'bajó';
      const labels = {
        sweetness: 'el dulzor',
        acidity: 'la acidez',
        clarity: 'la claridad',
        aftertaste: 'el postgusto'
      };
      message = `<span class="insight-icon">📊</span>Comparado con la anterior, <strong>${labels[maxKey]} ${direction}</strong> ${Math.abs(maxDiff)} ${Math.abs(maxDiff) === 1 ? 'punto' : 'puntos'}.`;
    }

    insightEl.innerHTML = message;
    insightEl.classList.add('visible');
  }

  function updateRadar() {
    if (!radarPolygon) return;
    const pts = [
      `140,${140 - (sensoryValues.sweetness * 20)}`,
      `${140 + (sensoryValues.acidity * 20)},140`,
      `140,${140 + (sensoryValues.clarity * 20)}`,
      `${140 - (sensoryValues.aftertaste * 20)},140`
    ];
    radarPolygon.setAttribute('points', pts.join(' '));
    
    if(radarVSweet) radarVSweet.setAttribute('cy', 140 - (sensoryValues.sweetness * 20));
    if(radarVAcid) radarVAcid.setAttribute('cx', 140 + (sensoryValues.acidity * 20));
    if(radarVClear) radarVClear.setAttribute('cy', 140 + (sensoryValues.clarity * 20));
    if(radarVAfter) radarVAfter.setAttribute('cx', 140 - (sensoryValues.aftertaste * 20));
  }

  const containers = document.querySelectorAll('.sensory-slider-container');
  containers.forEach(container => {
    const metric = container.getAttribute('data-metric');
    const input = container.querySelector('.sensory-input');
    const emojiEl = container.querySelector('.sensory-emoji');
    const valEl = container.querySelector('.sensory-val');
    const descEl = container.querySelector('.sensory-desc');
    const map = SENSORY_MAP[metric];
    
    if (!input || !map) return;

    input.addEventListener('input', () => {
      const val = parseInt(input.value);
      const level = map.levels.find(l => l.val === val);
      if (!level) return;

      valEl.textContent = val;
      sensoryValues[metric] = val;
      updateRadar();
      updateInsightMessage();
      renderSummaryCard();

      const pct = ((val - 1) / 4) * 100;
      input.style.background = `linear-gradient(to right, ${map.color} ${pct}%, #94A3B8 ${pct}%)`;

      if (emojiEl.textContent !== level.emoji) {
        emojiEl.style.opacity = '0';
        emojiEl.classList.remove('bounce');
        descEl.style.transform = 'translateY(-6px)';
        descEl.style.opacity = '0';
        
        if (navigator.vibrate) navigator.vibrate(8);

        setTimeout(() => {
          emojiEl.textContent = level.emoji;
          descEl.textContent = level.label;
          emojiEl.style.opacity = '1';
          void emojiEl.offsetWidth; // force reflow
          emojiEl.classList.add('bounce');
          descEl.style.transform = 'translateY(0)';
          descEl.style.opacity = '1';
        }, 120);
      }
    });
    
    emojiEl.addEventListener('animationend', () => {
      emojiEl.classList.remove('bounce');
    });

    input.dispatchEvent(new Event('input'));
  });

  const btnToggle = document.getElementById('btn-toggle-compare');
  const compareSelector = document.getElementById('compare-selector');
  const compareSelect = document.getElementById('compare-source-select');
  const btnCloseCompare = document.getElementById('btn-close-compare');

  if (btnToggle) {
    btnToggle.addEventListener('click', () => {
      populateCompareDropdown();
      btnToggle.classList.add('active');
      compareSelector.classList.remove('hidden');
      btnToggle.style.display = 'none';
    });
  }

  if (compareSelect) {
    compareSelect.addEventListener('change', (e) => {
      const id = e.target.value;
      if (!id) {
        comparingTasting = null;
      } else {
        comparingTasting = tastings.find(t => t.id === id) || null;
      }
      updateCompareRadar();
      updateInsightMessage();
    });
  }

  if (btnCloseCompare) {
    btnCloseCompare.addEventListener('click', () => {
      comparingTasting = null;
      compareSelect.value = '';
      updateCompareRadar();
      updateInsightMessage();
      compareSelector.classList.add('hidden');
      btnToggle.style.display = 'inline-flex';
      btnToggle.classList.remove('active');
    });
  }

  const cataExtractionEl = document.getElementById('cata-extraction');
  if(cataExtractionEl) {
    cataExtractionEl.addEventListener('change', () => {
      comparingTasting = null;
      if (btnToggle && compareSelector) {
        compareSelector.classList.add('hidden');
        btnToggle.style.display = 'inline-flex';
        btnToggle.classList.remove('active');
      }
      if(compareSelect) compareSelect.value = '';
      updateCompareRadar();
      updateInsightMessage();
    });
  }

  renderSummaryCard();
}

function initInteractiveCups() {
  const container = document.getElementById('interactive-cup-rating');
  const ratingInput = document.getElementById('cup-rating');
  const display = document.getElementById('cup-rating-display');
  if (!container || !ratingInput || !display) return;

  container.innerHTML = '';
  const cups = [];

  for (let i = 1; i <= 5; i++) {
    const wrapper = document.createElement('div');
    wrapper.className = 'cup-wrapper';
    wrapper.dataset.index = i;
    
    wrapper.innerHTML = `
      <svg viewBox="0 0 40 40" class="cup-svg">
        <defs>
          <clipPath id="cup-clip-${i}">
            <rect x="0" y="40" width="40" height="40" class="cup-fill-rect" style="transition: y 350ms var(--ease-state);"/>
          </clipPath>
          <linearGradient id="coffee-grad-${i}" x1="0" y1="1" x2="0" y2="0">
            <stop offset="0%" stop-color="#3e2723"/>
            <stop offset="100%" stop-color="#5d4037"/>
          </linearGradient>
        </defs>
        <path class="cup-vapor" d="M15,12 Q12,8 15,4 M21,14 Q18,9 21,4 M27,12 Q24,8 27,4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" opacity="0"/>
        <path d="M10,15 L10,30 Q10,35 20,35 Q30,35 30,30 L30,15 Z" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M30,18 Q35,18 35,23 Q35,28 30,28" fill="none" stroke="currentColor" stroke-width="2"/>
        <ellipse cx="20" cy="36" rx="14" ry="2" fill="none" stroke="currentColor" stroke-width="2"/>
        <path d="M10,15 L10,30 Q10,35 20,35 Q30,35 30,30 L30,15 Z" fill="url(#coffee-grad-${i})" clip-path="url(#cup-clip-${i})"/>
      </svg>
    `;
    container.appendChild(wrapper);
    cups.push(wrapper);

    wrapper.addEventListener('mousemove', (e) => {
      const rect = wrapper.getBoundingClientRect();
      const isHalf = e.clientX - rect.left < rect.width / 2;
      const hoverVal = i - (isHalf ? 0.5 : 0);
      updateCupsVisual(hoverVal, true);
    });

    wrapper.addEventListener('mouseleave', () => {
      updateCupsVisual(parseFloat(ratingInput.value) || 0, false);
    });

    wrapper.addEventListener('click', (e) => {
      const rect = wrapper.getBoundingClientRect();
      const isHalf = e.clientX - rect.left < rect.width / 2;
      const finalVal = i - (isHalf ? 0.5 : 0);
      
      ratingInput.value = finalVal;
      display.textContent = finalVal.toFixed(1);
      updateCupsVisual(finalVal, false);
      if (typeof renderSummaryCard === 'function') renderSummaryCard();

      if (finalVal === 5 && window.confetti) {
        window.confetti({
          particleCount: 30,
          spread: 50,
          origin: { y: 0.6 },
          colors: ['#b87333', '#4a3022', '#eaddcf'],
          shapes: ['circle']
        });
      }
    });

    wrapper.addEventListener('dblclick', () => {
      const exact = prompt("Calificación exacta (ej. 4.25):", ratingInput.value);
      if (exact !== null && !isNaN(exact)) {
        let v = Math.min(5, Math.max(0, parseFloat(exact)));
        ratingInput.value = v;
        display.textContent = v.toFixed(2);
        updateCupsVisual(v, false);
        if (typeof renderSummaryCard === 'function') renderSummaryCard();
      }
    });
  }

  container.addEventListener('mouseleave', () => {
    updateCupsVisual(parseFloat(ratingInput.value) || 0, false);
  });

  function updateCupsVisual(val, isHover) {
    cups.forEach((wrapper, idx) => {
      const cupIndex = idx + 1;
      const rect = wrapper.querySelector('.cup-fill-rect');
      
      wrapper.classList.remove('hover', 'active');
      
      if (cupIndex <= Math.floor(val)) {
        rect.setAttribute('y', '15');
        wrapper.classList.add(isHover ? 'hover' : 'active');
      } else if (cupIndex === Math.ceil(val) && val % 1 !== 0) {
        const fraction = val % 1;
        const yPos = 35 - (20 * fraction);
        rect.setAttribute('y', yPos.toString());
        wrapper.classList.add(isHover ? 'hover' : 'active');
      } else {
        rect.setAttribute('y', '40');
      }
    });
  }
}

function initInteractiveBitacora() {
  const methodSelect = document.getElementById('method');
  const methodCards = document.querySelectorAll('.method-card');
  if (methodSelect && methodCards.length) {
    methodCards.forEach(card => {
      card.addEventListener('click', () => {
        methodCards.forEach(c => c.classList.remove('active'));
        card.classList.add('active');
        methodSelect.value = card.getAttribute('data-value');
        methodSelect.dispatchEvent(new Event('change'));
        updateInteractiveRanges();
      });
    });
  }

  const grindSize = document.getElementById('grind-size');
  const grindValueLarge = document.getElementById('grind-value-large');
  const grindStrip = document.getElementById('grind-visual-strip');
  const labelPoetic = document.getElementById('grind-label-poetic');
  const labelDesc = document.getElementById('grind-label-desc');

  if (grindSize && grindStrip) {
    grindStrip.innerHTML = '';
    for (let i = 1; i <= 80; i += 8) {
      const dot = document.createElement('div');
      dot.className = 'grind-dot';
      dot.dataset.val = i;
      const inner = document.createElement('div');
      inner.className = 'grind-dot-inner';
      const size = Math.max(2, i / 6.5);
      inner.style.width = size + 'px';
      inner.style.height = size + 'px';
      dot.appendChild(inner);
      grindStrip.appendChild(dot);
    }

    grindSize.addEventListener('input', () => {
      const val = parseInt(grindSize.value);
      if (grindValueLarge) grindValueLarge.textContent = val;
      
      document.querySelectorAll('.grind-dot').forEach(d => {
        d.classList.remove('active');
        if (Math.abs(parseInt(d.dataset.val) - val) < 6) d.classList.add('active');
      });

      let poetic = "Polvo fino", desc = "Espresso, Turka";
      if (val > 12 && val <= 25) { poetic = "Sal fina"; desc = "Moka, Aeropress corto"; }
      else if (val > 25 && val <= 40) { poetic = "Azúcar de mesa"; desc = "V60, Aeropress"; }
      else if (val > 40 && val <= 55) { poetic = "Sal gruesa"; desc = "Chemex, Kalita"; }
      else if (val > 55 && val <= 70) { poetic = "Cuscús"; desc = "Prensa Francesa"; }
      else if (val > 70) { poetic = "Pimienta gruesa"; desc = "Cold brew, immersión"; }

      if (labelPoetic && labelPoetic.textContent !== poetic) {
        labelPoetic.style.opacity = '0';
        labelPoetic.style.transform = 'translateY(-10px)';
        setTimeout(() => {
          labelPoetic.textContent = poetic;
          labelDesc.textContent = desc;
          labelPoetic.style.opacity = '1';
          labelPoetic.style.transform = 'translateY(0)';
        }, 150);
      }
    });
  }

  const coffeeWeight = document.getElementById('coffee-weight');
  const waterWeight = document.getElementById('water-weight');
  const ratioInput = document.getElementById('ratio');
  const ratioArm = document.getElementById('ratio-arm');
  const ratioBase = document.getElementById('ratio-pivot-base');
  const ratioLiveLabel = document.getElementById('ratio-live-label');

  if (coffeeWeight && waterWeight && ratioInput) {
    const calcRatio = () => {
      const c = parseFloat(coffeeWeight.value) || 0;
      const w = parseFloat(waterWeight.value) || 0;
      if (c > 0 && w > 0) ratioInput.value = (w / c).toFixed(1);
      updateBalanceSVG();
    };
    const calcWater = () => {
      const c = parseFloat(coffeeWeight.value) || 0;
      const r = parseFloat(ratioInput.value) || 0;
      if (c > 0 && r > 0) waterWeight.value = Math.round(c * r);
      updateBalanceSVG();
    };

    coffeeWeight.addEventListener('input', calcRatio);
    waterWeight.addEventListener('input', calcRatio);
    ratioInput.addEventListener('input', calcWater);
  }

  function updateBalanceSVG() {
    if (!ratioArm || !ratioInput || !methodSelect) return;
    const method = methodSelect.value;
    const profile = METHOD_PROFILES[method] || METHOD_PROFILES["V60 02"];
    const r = parseFloat(ratioInput.value) || 0;
    if (ratioLiveLabel) ratioLiveLabel.textContent = `Ratio Objetivo: 1:${profile.ratioIdeal}`;
    
    if (!r) return;
    
    const diff = r - profile.ratioIdeal;
    let tilt = Math.max(-15, Math.min(15, diff * 3));
    ratioArm.style.transform = `rotate(${tilt}deg)`;

    let colorClass = 'text-success';
    if (r < profile.ratioMin || r > profile.ratioMax) colorClass = 'text-danger';
    else if (Math.abs(diff) > 1) colorClass = 'text-warning';

    ratioArm.setAttribute('class', colorClass);
    ratioBase.setAttribute('class', colorClass);
  }

  const tempInput = document.getElementById('temperature');
  const thermoLiquid = document.getElementById('thermo-liquid');
  const thermoZone = document.getElementById('thermo-ideal-zone');
  const thermoBulb = document.getElementById('thermo-bulb');

  if (tempInput && thermoLiquid) {
    tempInput.addEventListener('input', () => {
      const t = parseFloat(tempInput.value) || 0;
      const scaleY = Math.max(0, Math.min(1, (t - 60) / 40));
      thermoLiquid.style.transform = `scaleY(${scaleY})`;
    });

    tempInput.addEventListener('change', () => {
      if (!methodSelect) return;
      const profile = METHOD_PROFILES[methodSelect.value];
      if (!profile) return;
      const t = parseFloat(tempInput.value) || 0;
      if (profile.tempMin > 0 && (t < profile.tempMin || t > profile.tempMax)) {
        thermoBulb.style.transform = 'translateX(2px)';
        setTimeout(() => thermoBulb.style.transform = 'translateX(-2px)', 50);
        setTimeout(() => thermoBulb.style.transform = 'translateX(2px)', 100);
        setTimeout(() => thermoBulb.style.transform = 'translateX(0)', 150);
        if (navigator.vibrate) navigator.vibrate(50);
      }
    });
  }

  function updateInteractiveRanges() {
    if (!methodSelect) return;
    const profile = METHOD_PROFILES[methodSelect.value];
    if (!profile) return;

    currentTargetTime = profile.targetTime;
    
    if (thermoZone) {
      if (profile.tempMin > 0) {
        const scaleMin = (profile.tempMin - 60) / 40;
        const scaleMax = (profile.tempMax - 60) / 40;
        thermoZone.setAttribute('y', 100 - (scaleMax * 80) - 20);
        thermoZone.setAttribute('height', (scaleMax - scaleMin) * 80);
        thermoZone.style.display = 'block';
      } else {
        thermoZone.style.display = 'none';
      }
    }
    updateBalanceSVG();
  }

  if (methodCards.length > 0) methodCards[0].click();
  if (grindSize) grindSize.dispatchEvent(new Event('input'));
  if (tempInput) tempInput.dispatchEvent(new Event('input'));
}

// Timer Logic
function setupTimer() {
  const timerProgress = document.getElementById('timer-progress');
  const timerOverProgress = document.getElementById('timer-over-progress');
  const timerMarkers = document.getElementById('timer-markers');
  const timerPulse = document.getElementById('timer-center-pulse');
  const poursLabel = document.getElementById('timer-pours-label');

  const baseDash = 816.81;
  const overDash = 722.56;

  function updateSVGTimer() {
    if (!isTimerRunning) return;
    
    elapsedTime = Date.now() - startTime;
    const sec = elapsedTime / 1000;
    
    if (timerProgress) {
      const progress = Math.min(sec / currentTargetTime, 1);
      timerProgress.style.strokeDashoffset = baseDash - (baseDash * progress);
      
      if (sec > currentTargetTime && timerOverProgress) {
        timerProgress.style.stroke = 'var(--color-danger)';
        timerOverProgress.style.opacity = '1';
        const overProgress = Math.min((sec - currentTargetTime) / currentTargetTime, 1);
        timerOverProgress.style.strokeDashoffset = overDash - (overDash * overProgress);
      } else if (timerOverProgress) {
        timerProgress.style.stroke = 'var(--color-accent)';
        timerOverProgress.style.opacity = '0';
      }
    }

    animFrameId = requestAnimationFrame(updateSVGTimer);
  }

  btnTimerStart.addEventListener('click', () => {
    if (!isTimerRunning) {
      startTime = Date.now() - elapsedTime;
      timerInterval = setInterval(updateTimerUI, 100);
      isTimerRunning = true;
      btnTimerStart.classList.add('hidden');
      btnTimerLap.classList.remove('hidden');
      btnTimerStop.classList.remove('hidden');
      btnTimerReset.classList.add('hidden');
      animFrameId = requestAnimationFrame(updateSVGTimer);
    }
  });

  btnTimerLap.addEventListener('click', () => {
    if (isTimerRunning && !replicateMode) {
      const currentMs = elapsedTime;
      const formattedTime = formatTime(currentMs);
      
      const newStage = {
        id: 'stage-' + Date.now(),
        timeMs: currentMs,
        timeFormatted: formattedTime,
        waterTarget: '',
        note: `Vertido ${recordedStages.length + 1}`
      };
      recordedStages.push(newStage);
      renderPourStages();
      
      if (poursLabel) poursLabel.textContent = `${recordedStages.length} vertidos`;
      
      if (timerPulse) {
        timerPulse.style.transform = 'translate(-50%, -50%) scale(1.08)';
        setTimeout(() => timerPulse.style.transform = 'translate(-50%, -50%) scale(1)', 150);
      }

      if (timerMarkers) {
        const sec = currentMs / 1000;
        const target = currentTargetTime;
        const angle = (sec / target) * 360 - 90;
        const r1 = 120, r2 = 140;
        const rad = angle * Math.PI / 180;
        const x1 = 140 + r1 * Math.cos(rad);
        const y1 = 140 + r1 * Math.sin(rad);
        const x2 = 140 + r2 * Math.cos(rad);
        const y2 = 140 + r2 * Math.sin(rad);
        
        const line = document.createElementNS("http://www.w3.org/2000/svg", "line");
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        line.setAttribute("stroke", "var(--color-text-primary)");
        line.setAttribute("stroke-width", "4");
        line.setAttribute("stroke-linecap", "round");
        line.style.opacity = "0";
        line.style.transition = "opacity 150ms ease";
        timerMarkers.appendChild(line);
        
        requestAnimationFrame(() => line.style.opacity = "1");
      }
    }
  });

  btnTimerStop.addEventListener('click', () => {
    if (isTimerRunning) {
      clearInterval(timerInterval);
      cancelAnimationFrame(animFrameId);
      isTimerRunning = false;
      btnTimerStart.classList.remove('hidden');
      btnTimerLap.classList.add('hidden');
      btnTimerStop.classList.add('hidden');
      btnTimerReset.classList.remove('hidden');
      btnTimerStart.textContent = 'Resume';
    }
  });

  btnTimerReset.addEventListener('click', () => {
    clearInterval(timerInterval);
    cancelAnimationFrame(animFrameId);
    isTimerRunning = false;
    elapsedTime = 0;
    recordedStages = [];
    
    if (timerGuideDisplay) {
      timerGuideDisplay.textContent = '';
      timerGuideDisplay.classList.add('hidden');
    }
    
    if (timerProgress) timerProgress.style.strokeDashoffset = baseDash;
    if (timerOverProgress) timerOverProgress.style.opacity = '0';
    if (timerMarkers) {
      const lines = Array.from(timerMarkers.children).reverse();
      lines.forEach((line, i) => {
        setTimeout(() => {
          line.style.opacity = '0';
          setTimeout(() => line.remove(), 150);
        }, i * 30);
      });
    }
    if (poursLabel) poursLabel.textContent = '0 vertidos';

    renderPourStages();
    updateTimerUI();
    btnTimerStart.classList.remove('hidden');
    btnTimerStart.textContent = 'Start';
    btnTimerStop.classList.add('hidden');
    btnTimerLap.classList.add('hidden');
    btnTimerReset.classList.add('hidden');
  });
}

function formatTime(msDuration) {
  const date = new Date(msDuration);
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  const ms = Math.floor(date.getMilliseconds() / 100);
  return `${m}:${s}.${ms}`;
}

function updateTimerUI() {
  if (isTimerRunning) {
    elapsedTime = Date.now() - startTime;
  }
  const t = formatTime(elapsedTime);
  if (timerDisplay) {
    timerDisplay.textContent = elapsedTime >= 600000 ? t.substring(0, 5) : t;
  }
}

// Dedicated Replication Timer Logic
function setupReplicationTimer() {
  btnRepStart.addEventListener('click', () => {
    if (!isRepTimerRunning) {
      repStartTime = Date.now() - repElapsedTime;
      repTimerInterval = setInterval(updateRepTimerUI, 100);
      isRepTimerRunning = true;
      btnRepStart.classList.add('hidden');
      btnRepStop.classList.remove('hidden');
      btnRepReset.classList.add('hidden');
    }
  });

  btnRepStop.addEventListener('click', () => {
    if (isRepTimerRunning) {
      clearInterval(repTimerInterval);
      isRepTimerRunning = false;
      btnRepStart.classList.remove('hidden');
      btnRepStop.classList.add('hidden');
      btnRepReset.classList.remove('hidden');
      btnRepStart.textContent = 'Resume';
    }
  });

  btnRepReset.addEventListener('click', () => {
    clearInterval(repTimerInterval);
    isRepTimerRunning = false;
    repElapsedTime = 0;
    nextStageIndex = 0;
    lastCountdownSec = -1;
    
    repTimerGuideDisplay.textContent = '¡Listo! Presiona Start para comenzar.';
    repTimerGuideDisplay.style.color = 'var(--color-accent)';
    document.getElementById('rep-roadmap').innerHTML = ''; // Force rebuild
    updateRepTimerUI();
    renderRoadmapProgress(0);

    btnRepStart.classList.remove('hidden');
    btnRepStart.textContent = 'Start';
    btnRepStop.classList.add('hidden');
    btnRepReset.classList.add('hidden');
  });

  btnRepBack.addEventListener('click', () => {
    clearInterval(repTimerInterval);
    isRepTimerRunning = false;
    repElapsedTime = 0;
    replicateMode = false;
    
    // Hide replicate view, show previous view
    document.getElementById('view-replicar').classList.add('hidden');
    document.getElementById(previousViewBeforeReplication).classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden'); // Show bottom nav again
  });

  const btnRepNextAction = document.getElementById('btn-rep-next-action');
  if (btnRepNextAction) {
    btnRepNextAction.addEventListener('click', () => {
      nextStageIndex++;
      repStartTime = Date.now() - repElapsedTime;
      
      document.getElementById('rep-timer-display').classList.remove('hidden');
      document.getElementById('rep-timer-controls').classList.remove('hidden');
      document.getElementById('rep-action-display').classList.add('hidden');
      
      if (nextStageIndex < replicateStages.length) {
          btnRepStart.click(); 
      } else {
          // Auto-stop since it was the last stage
          updateRepTimerUI();
      }
    });
  }
}

function updateRepTimerUI() {
  if (isRepTimerRunning) {
    repElapsedTime = Date.now() - repStartTime;
    
    if (replicateStages.length > 0) {
      if (nextStageIndex < replicateStages.length) {
        const stage = replicateStages[nextStageIndex];

        // Intercept Action Steps
        if (stage.type === 'action') {
          if (repElapsedTime >= stage.timeMs) {
            clearInterval(repTimerInterval);
            isRepTimerRunning = false;
            
            document.getElementById('rep-timer-display').classList.add('hidden');
            document.getElementById('rep-timer-controls').classList.add('hidden');
            document.getElementById('rep-action-display').classList.remove('hidden');
            
            document.getElementById('rep-action-note').textContent = stage.note || 'Paso completado';
            repTimerGuideDisplay.textContent = "Esperando tu confirmación...";
            repTimerGuideDisplay.style.color = 'var(--color-primary)';
            return;
          }
        }

        const timeToNext = stage.timeMs - repElapsedTime;
        
        if (timeToNext <= 3000 && timeToNext > 0) {
          const sec = Math.ceil(timeToNext / 1000);
          repTimerGuideDisplay.textContent = `¡Prepárate! Siguiente en ${sec}s`;
          repTimerGuideDisplay.style.color = 'var(--color-warning, #f39c12)';
          
          if (sec !== lastCountdownSec) {
            playBeep(440, 'sine', 150);
            lastCountdownSec = sec;
          }
        } 
        else if (repElapsedTime >= stage.timeMs) {
          playBeep(880, 'sine', 300);
          lastCountdownSec = -1;
          nextStageIndex++;
        }
        else {
          repTimerGuideDisplay.textContent = `${nextStageIndex === 0 ? 'Paso actual' : 'Llegar a'}: ${stage.waterTarget ? stage.waterTarget + 'g' : '...'} (${stage.note || 'Vertido'})`;
          repTimerGuideDisplay.style.color = 'var(--color-accent)';
        }
      } 
      else {
        const lastStage = replicateStages[replicateStages.length - 1];
        if (repElapsedTime >= lastStage.timeMs + 5000) {
          btnRepStop.click(); 
          
          repTimerGuideDisplay.innerHTML = `
            <div class="coffee-drop-anim" style="color: var(--color-accent); display: flex; justify-content: center;">
              <svg width="48" height="48" viewBox="0 0 24 24"><path fill="currentColor" d="M2,21V19H20V21H2M20,8V5H18V8H20M20,3A2,2 0 0,1 22,5V8A2,2 0 0,1 20,10H18V13A4,4 0 0,1 14,17H8A4,4 0 0,1 4,13V3H20M16,5H6V13A2,2 0 0,0 8,15H14A2,2 0 0,0 16,13V5Z"/></svg>
            </div>
            <div style="font-size: 1.25rem; font-weight: 600; margin-top: 10px;">¡Café Listo!</div>
            <div style="font-size: 0.9rem; margin-top: 5px;">Extracción finalizada.</div>
          `;
          repTimerGuideDisplay.style.color = 'var(--color-success, #2ecc71)';
          
          playBeep(523.25, 'sine', 200);
          setTimeout(() => playBeep(659.25, 'sine', 400), 200);
        } else {
          repTimerGuideDisplay.textContent = `Paso final: Llegar a ${lastStage.waterTarget ? lastStage.waterTarget + 'g' : '...'} (${lastStage.note || 'Vertido'})`;
          repTimerGuideDisplay.style.color = 'var(--color-accent)';
        }
      }
      renderRoadmapProgress(repElapsedTime);
    }
  }
  repTimerDisplay.textContent = formatTime(repElapsedTime);
}

function renderRoadmapProgress(elapsedTimeParam) {
  if (!replicateMode || replicateStages.length === 0) return;
  const roadmapContainer = document.getElementById('rep-roadmap');
  if (!roadmapContainer) return;
  
  // Initialize DOM if it's empty
  if (roadmapContainer.children.length === 0) {
    replicateStages.forEach((stage, idx) => {
      const row = document.createElement('div');
      row.id = `roadmap-row-${idx}`;
      row.style.display = 'flex';
      row.style.flexDirection = 'column';
      row.style.padding = '8px 0';
      row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
      
      row.innerHTML = `
        <div style="display: flex; justify-content: space-between; font-size: 0.85rem; margin-bottom: 6px;" id="roadmap-text-${idx}">
          <span style="font-family: monospace;">${stage.timeFormatted.substring(0, 5)}</span>
          <span>${stage.note || 'Vertido'}</span>
          <span style="font-weight: bold; color: var(--color-success);">${stage.waterTarget ? stage.waterTarget + 'g' : '-'}</span>
        </div>
        <div style="width: 100%; height: 4px; background-color: rgba(255,255,255,0.08); border-radius: 2px; overflow: hidden;">
          <div id="roadmap-bar-${idx}" style="width: 0%; height: 100%; background-color: var(--color-accent); transition: width 0.1s linear;"></div>
        </div>
      `;
      roadmapContainer.appendChild(row);
    });
  }

  // Update logic (runs every 100ms)
  replicateStages.forEach((stage, idx) => {
    const isPast = elapsedTimeParam >= stage.timeMs;
    const isCurrent = isPast && (idx === replicateStages.length - 1 || elapsedTimeParam < replicateStages[idx + 1].timeMs);
    
    const textRow = document.getElementById(`roadmap-text-${idx}`);
    const progressBar = document.getElementById(`roadmap-bar-${idx}`);
    
    if (textRow && progressBar) {
      if (isPast && !isCurrent) {
        textRow.style.opacity = '0.4';
        textRow.style.textDecoration = 'line-through';
      } else if (isCurrent) {
        textRow.style.color = 'var(--color-accent)';
        textRow.style.fontWeight = 'bold';
        textRow.style.opacity = '1';
        textRow.style.textDecoration = 'none';
      } else {
        textRow.style.color = 'var(--color-text-secondary)';
        textRow.style.fontWeight = 'normal';
        textRow.style.opacity = '1';
        textRow.style.textDecoration = 'none';
      }

      // Calculate progress percentage
      let progress = 0;
      if (idx < nextStageIndex - 1 || (idx === replicateStages.length - 1 && isPast && !isCurrent)) {
         progress = 100; // Past stages are full
      } else if (isCurrent) {
         let nextTime = 0;
         if (idx < replicateStages.length - 1) {
           nextTime = replicateStages[idx+1].timeMs;
         } else {
           nextTime = stage.timeMs + 5000; // Last visual step lasts 5 seconds before completion
         }
         const duration = nextTime - stage.timeMs;
         progress = Math.min(100, Math.max(0, ((elapsedTimeParam - stage.timeMs) / duration) * 100));
      }

      progressBar.style.width = `${progress}%`;
    }
  });
}

function renderPourStages() {
  pourStagesContainer.classList.toggle('hidden', recordedStages.length === 0);
  pourStagesList.innerHTML = '';
  
  recordedStages.forEach((stage, index) => {
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.gap = '8px';
    row.style.alignItems = 'flex-start';
    row.style.backgroundColor = 'var(--color-bg)';
    row.style.padding = '8px';
    row.style.borderRadius = 'var(--radius-sm)';
    row.style.border = '1px solid var(--color-border)';

    row.innerHTML = `
      <div style="color: var(--color-accent); font-family: monospace; width: 50px; padding-top: 8px;">${stage.timeFormatted.substring(0, 5)}</div>
      <input type="text" id="note-${stage.id}" value="${stage.note}" style="flex: 2; padding: 6px; margin-top: 2px;" placeholder="Nota (ej. Blooming)">
      <div style="display: flex; flex-direction: column; align-items: flex-end; flex: 1.5;">
        <div style="display: flex; align-items: center; gap: 4px; width: 100%;">
          <input type="number" id="water-${stage.id}" style="padding: 6px; width: 100%;" placeholder="Total g" value="${stage.waterTarget}">
          <span style="color: var(--color-text-muted); font-size: 0.8rem;">g</span>
        </div>
        <div id="delta-${stage.id}" style="height: 16px; margin-top: 2px;"></div>
      </div>
      <button type="button" class="btn btn-danger" style="padding: 6px; margin-top: 2px;" onclick="window.removeStage('${stage.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4H15.5L14.5 3H9.5L8.5 4H5V6H19M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19Z"/></svg>
      </button>
    `;

    pourStagesList.appendChild(row);
  });

  // Attach event listeners after appending exactly matching the element references
  recordedStages.forEach((stage, index) => {
    const noteInput = document.getElementById(`note-${stage.id}`);
    const waterInput = document.getElementById(`water-${stage.id}`);
    
    noteInput.addEventListener('input', (e) => {
      recordedStages[index].note = e.target.value;
    });
    
    waterInput.addEventListener('input', (e) => {
      recordedStages[index].waterTarget = e.target.value;
      calculateFlowDeltas();
    });
  });

  calculateFlowDeltas();
}

function calculateFlowDeltas() {
  recordedStages.forEach((stage, index) => {
    const deltaDiv = document.getElementById(`delta-${stage.id}`);
    if (!deltaDiv) return;

    if (stage.waterTarget && !isNaN(stage.waterTarget) && stage.waterTarget.trim() !== '') {
      const currentVal = parseFloat(stage.waterTarget);
      let prevVal = 0;
      if (index > 0 && recordedStages[index-1].waterTarget && !isNaN(recordedStages[index-1].waterTarget) && recordedStages[index-1].waterTarget.trim() !== '') {
        prevVal = parseFloat(recordedStages[index-1].waterTarget);
      }
      
      const delta = currentVal - prevVal;
      const deltaColor = delta < 0 ? 'var(--color-danger)' : 'var(--color-success)';
      const deltaSign = delta > 0 ? '+' : '';
      deltaDiv.innerHTML = `<span style="font-size: 0.75rem; color: ${deltaColor}; font-weight: 500;">[ ${deltaSign}${delta.toFixed(1)}g ]</span>`;
    } else {
      deltaDiv.innerHTML = '';
    }
  });
}

window.removeStage = function(id) {
  recordedStages = recordedStages.filter(s => s.id !== id);
  renderPourStages();
};

// Smart Recommendations Engine
function handleMethodChange(e) {
  const method = e.target.value;
  const recommendationBox = document.getElementById('recommendation-box');
  
  // Find top rated tasting for this method
  let bestTasting = null;
  let highestRating = -1;

  tastings.forEach(tasting => {
    const extraction = extractions.find(ex => ex.id === tasting.extractionId);
    if (extraction && extraction.method === method && tasting.rating > highestRating) {
      highestRating = tasting.rating;
      bestTasting = tasting;
    }
  });

  if (bestTasting && highestRating >= 4) { // Suggest if rating is 4 or 5
    const extraction = extractions.find(ex => ex.id === bestTasting.extractionId);
    
    // Auto-fill
    document.getElementById('grind-size').value = extraction.grindSize;
    document.getElementById('grind-value').textContent = extraction.grindSize;
    document.getElementById('coffee-weight').value = extraction.coffeeWeight;
    document.getElementById('water-weight').value = extraction.waterWeight;
    document.getElementById('ratio').value = extraction.ratio;
    document.getElementById('temperature').value = extraction.temperature;
    
    recommendationBox.classList.remove('hidden');
    setTimeout(() => recommendationBox.classList.add('hidden'), 5000);
  }
}

// Forms and Interactivity
function setupInteractivity() {
  // Grind Size display update
  const grindSizeInput = document.getElementById('grind-size');
  const grindValueDisplay = document.getElementById('grind-value');
  grindSizeInput.addEventListener('input', (e) => {
    grindValueDisplay.textContent = e.target.value;
  });

  // Calculate ratio / water dynamically
  const coffeeWeightInput = document.getElementById('coffee-weight');
  const waterWeightInput = document.getElementById('water-weight');
  const ratioInput = document.getElementById('ratio');

  function updateRatio() {
    const c = parseFloat(coffeeWeightInput.value);
    const w = parseFloat(waterWeightInput.value);
    if (c > 0 && w > 0) {
      ratioInput.value = (w / c).toFixed(1);
    }
  }

  function updateWater() {
    const c = parseFloat(coffeeWeightInput.value);
    const r = parseFloat(ratioInput.value);
    if (c > 0 && r > 0) {
      waterWeightInput.value = Math.round(c * r);
    }
  }

  coffeeWeightInput.addEventListener('input', updateRatio);
  waterWeightInput.addEventListener('input', updateRatio);
  ratioInput.addEventListener('input', updateWater);

  // Chips selection (Dynamic SCA Chips)
  document.querySelectorAll('.chip').forEach(chip => {
    chip.addEventListener('click', () => {
      chip.classList.toggle('selected');
      const scaColor = chip.getAttribute('data-color');
      if (chip.classList.contains('selected')) {
        chip.style.borderColor = scaColor;
        chip.style.color = scaColor;
        chip.style.backgroundColor = `${scaColor}1A`; // 10% opacity
      } else {
        chip.style.borderColor = 'var(--color-border)';
        chip.style.color = 'var(--color-text-secondary)';
        chip.style.backgroundColor = 'var(--color-bg)';
      }
    });
  });

  // Varietal Extra input logic
  const varietalSelect = document.getElementById('bean-varietal');
  const varietalExtra = document.getElementById('bean-varietal-extra');
  varietalSelect.addEventListener('change', (e) => {
    const val = e.target.value;
    if (val === 'Blend / Mezcla' || val === 'Otra') {
      varietalExtra.classList.remove('hidden');
      varietalExtra.required = true;
    } else {
      varietalExtra.classList.add('hidden');
      varietalExtra.required = false;
      varietalExtra.value = '';
    }
  });

  // SCA Metrics Sliders
  const metrics = ['sweetness', 'acidity', 'clarity', 'aftertaste'];
  metrics.forEach(m => {
    const slider = document.getElementById(`metric-${m}`);
    const display = document.getElementById(`val-${m}`);
    if (slider && display) {
      slider.addEventListener('input', (e) => {
        display.textContent = e.target.value;
      });
    }
  });

  // Rating Stars (Half-Star Logic)
  const stars = document.querySelectorAll('.rating-star');
  const cupRatingInput = document.getElementById('cup-rating');
  stars.forEach(star => {
    star.addEventListener('click', (e) => {
      const starValue = parseInt(star.getAttribute('data-rating'));
      let currentRating = parseFloat(cupRatingInput.value) || 0;
      
      let newRating;
      // If clicking the current highest full star, drop it to a half star
      if (currentRating === starValue) {
        newRating = starValue - 0.5;
      } 
      // If clicking the current highest half star, bump it to full star
      else if (currentRating === starValue - 0.5) {
        newRating = starValue;
      } 
      // Otherwise, jump straight to full star
      else {
        newRating = starValue;
      }
      
      cupRatingInput.value = newRating;
      
      // Update visual stars
      stars.forEach(s => {
        const sVal = parseInt(s.getAttribute('data-rating'));
        s.innerHTML = ''; // Clear SVG
        s.classList.remove('active');
        
        if (sVal <= newRating) {
          // Full Star SVG
          s.classList.add('active');
          s.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>`;
        } else if (sVal - 0.5 === newRating) {
          // Half Star SVG
          s.classList.add('active');
          s.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" opacity="0.4"/><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" clip-path="polygon(0 0, 50% 0, 50% 100%, 0 100%)"/></svg>`;
        } else {
          // Empty Star SVG
          s.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" fill-opacity="0.3"/></svg>`;
        }
      });
    });
  });

  // Method change hook for Smart Recommendations
  const methodSelect = document.getElementById('method');
  methodSelect.addEventListener('change', handleMethodChange);

  // Edit Recipe Modal closing
  document.getElementById('btn-close-edit').addEventListener('click', () => {
    document.getElementById('edit-recipe-modal').classList.add('hidden');
  });

  // Edit Pantry Modal closing
  const btnCloseEditPantry = document.getElementById('btn-close-edit-pantry');
  if (btnCloseEditPantry) {
    btnCloseEditPantry.addEventListener('click', () => {
      document.getElementById('edit-pantry-modal').classList.add('hidden');
    });
  }

  // Recetario Filters
  document.querySelectorAll('#recetario-filters .chip').forEach(chip => {
    chip.addEventListener('click', (e) => {
      document.querySelectorAll('#recetario-filters .chip').forEach(c => c.classList.remove('selected'));
      e.target.classList.add('selected');
      currentRecetarioFilter = e.target.dataset.filter;
      renderRecipes();
    });
  });
  
  // Advanced Recetario Dropdowns
  document.getElementById('filter-sort').addEventListener('change', (e) => {
    currentSortOrder = e.target.value;
    renderRecipes();
  });
  
  document.getElementById('filter-method').addEventListener('change', (e) => {
    currentMethodFilter = e.target.value;
    renderRecipes();
  });
}
let currentRecetarioFilter = 'all';
let currentSortOrder = 'date_desc';
let currentMethodFilter = 'all';

function setupForms() {
  // Bitácora Submit
  const formBitacora = document.getElementById('form-bitacora');
  formBitacora.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const submitBtn = formBitacora.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';
    
    const newExtraction = {
      id: Date.now().toString(),
      date: new Date().toISOString(),
      method: document.getElementById('method').value,
      grindSize: document.getElementById('grind-size').value,
      coffeeWeight: document.getElementById('coffee-weight').value,
      waterWeight: document.getElementById('water-weight').value,
      ratio: document.getElementById('ratio').value,
      temperature: document.getElementById('temperature').value,
      timeMs: elapsedTime,
      timeFormatted: timerDisplay.textContent,
      pourStages: recordedStages,
      notes: document.getElementById('notes').value
    };

    try {
      await db.collection("extractions").add(newExtraction);
      
      // ALACENA VIRTUAL DEDUCTION
      const extPantryId = document.getElementById('ext-pantry-id').value;
      const parsedCoffeeWeight = parseFloat(document.getElementById('coffee-weight').value) || 0;
      if (extPantryId && parsedCoffeeWeight > 0) {
        const selectedBag = pantry.find(p => p.firebaseId === extPantryId);
        if (selectedBag) {
          const newWeight = Math.max(0, selectedBag.currentWeight - parsedCoffeeWeight);
          try {
            await db.collection("pantry").doc(extPantryId).update({ currentWeight: newWeight });
          } catch(err) { console.warn("Fallo sincronización alacena", err); }
        }
      }

      // Reset Form & Timer
      formBitacora.reset();
      document.getElementById('grind-value').textContent = "40";
      document.getElementById('grind-size').value = 40;
      btnTimerReset.click();
      alert('Extracción guardada en el recetario.');
    } catch (error) {
      console.error("Error guardando extracción:", error);
      alert('Hubo un error al guardar la extracción.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar Extracción';
    }
  });

  // Cata Submit
  const formCata = document.getElementById('form-cata');
  const cataPantrySelect = document.getElementById('cata-pantry-id');
  const manualBeanDetails = document.getElementById('manual-bean-details');
  if (cataPantrySelect && manualBeanDetails) {
    cataPantrySelect.addEventListener('change', (e) => {
      if (e.target.value === "") {
        manualBeanDetails.classList.remove('hidden');
        document.getElementById('bean-origin').required = true;
        document.getElementById('bean-varietal').required = true;
        document.getElementById('bean-process').required = true;
        document.getElementById('roast-date').required = true;
      } else {
        manualBeanDetails.classList.add('hidden');
        document.getElementById('bean-origin').required = false;
        document.getElementById('bean-varietal').required = false;
        document.getElementById('bean-process').required = false;
        document.getElementById('roast-date').required = false;
      }
    });
  }

  formCata.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedFlavors = Array.from(selectedSCAFlavors);
    const rating = document.getElementById('cup-rating').value;

    if (rating === "0") {
      alert("Por favor califica la taza (toca las tazas de arriba).");
      return;
    }

    const submitBtn = formCata.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const baseVarietal = document.getElementById('bean-varietal').value;
    const extraVarietal = document.getElementById('bean-varietal-extra').value.trim();
    let finalVarietal = extraVarietal ? `${baseVarietal} (${extraVarietal})` : baseVarietal;

    let beanOrigin = document.getElementById('bean-origin').value;
    let beanProcess = document.getElementById('bean-process').value;
    let roastDate = document.getElementById('roast-date').value;

    const cataPantryId = document.getElementById('cata-pantry-id') ? document.getElementById('cata-pantry-id').value : "";
    if (cataPantryId) {
      const selectedBag = pantry.find(p => p.firebaseId === cataPantryId);
      if (selectedBag) {
        beanOrigin = selectedBag.origin;
        finalVarietal = selectedBag.varietal;
        beanProcess = selectedBag.process;
        roastDate = selectedBag.roastDate;
      }
    }

    const metricsData = {
      sweetness: parseInt(document.getElementById('metric-sweetness').value || 3),
      acidity: parseInt(document.getElementById('metric-acidity').value || 3),
      clarity: parseInt(document.getElementById('metric-clarity').value || 3),
      aftertaste: parseInt(document.getElementById('metric-aftertaste').value || 3)
    };

    const summaryData = generateCataSummary();

    const newTasting = {
      id: Date.now().toString(),
      extractionId: document.getElementById('cata-extraction').value,
      origin: beanOrigin,
      varietal: finalVarietal,
      process: beanProcess,
      roastDate: roastDate,
      flavors: selectedFlavors,
      metrics: metricsData,
      rating: parseFloat(rating),
      summary: summaryData.narrative.replace(/<\/?strong>/g, '')
    };

    try {
      await db.collection("tastings").add(newTasting);
      
      // Success Animation
      submitBtn.textContent = '¡Cata Guardada! ✓';
      submitBtn.style.backgroundColor = 'var(--color-success)';
      submitBtn.style.transform = 'scale(1.05)';
      
      if (parseFloat(rating) >= 4.5 && typeof window.confetti === 'function') {
        window.confetti({
          particleCount: 50,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#b87333', '#4a3022', '#eaddcf']
        });
      }

      setTimeout(() => {
        formCata.reset();
        selectedSCAFlavors.clear();
        
        // reset visuals
        const wheelCenter = document.getElementById('sca-center-text');
        if(wheelCenter) wheelCenter.textContent = 'Toca un sabor';
        const scaChips = document.getElementById('sca-selected-chips');
        if(scaChips) scaChips.innerHTML = '';
        document.querySelectorAll('.flavor-arc.selected').forEach(el => {
          el.classList.remove('selected');
          el.style.opacity = '1';
        });
        
        document.querySelectorAll('.extraction-card').forEach(c => c.classList.remove('selected'));
        document.getElementById('interactive-cup-rating').innerHTML = '';
        document.getElementById('cup-rating-display').textContent = '0.0';
        initInteractiveCups();
        const summaryCard = document.getElementById('cata-summary-card');
        if (summaryCard) summaryCard.classList.add('hidden');

        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Evaluación';
        submitBtn.style.backgroundColor = '';
        submitBtn.style.transform = '';

        navItems.forEach(n => n.classList.remove('active'));
        document.querySelector('.nav-item[data-view="recetario"]').classList.add('active');
        views.forEach(v => v.classList.add('hidden'));
        document.getElementById('view-recetario').classList.remove('hidden');
        headerSubtitle.textContent = 'Tus Mejores Extracciones';
      }, 1500);

    } catch (error) {
      console.error("Error adding document: ", error);
      submitBtn.textContent = 'Error al guardar';
      submitBtn.style.backgroundColor = 'var(--color-danger)';
      
      // Shake animation using Web Animations API
      if (submitBtn.animate) {
        submitBtn.animate([
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(-4px)' },
          { transform: 'translateX(4px)' },
          { transform: 'translateX(0)' }
        ], { duration: 400 });
      }

      setTimeout(() => {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Evaluación';
        submitBtn.style.backgroundColor = '';
      }, 2000);
    }
  });

  // Edit Recipe Submit
  const formEditRecipe = document.getElementById('form-edit-recipe');
  if (formEditRecipe) {
    formEditRecipe.addEventListener('submit', async (e) => {
      e.preventDefault();
      const firebaseId = document.getElementById('edit-recipe-id').value;
      if (!firebaseId) return;

      const submitBtn = formEditRecipe.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';

      // Auto calculate ratio based on new coffee/water values
      const c = parseFloat(document.getElementById('edit-coffee-weight').value);
      const w = parseFloat(document.getElementById('edit-water-weight').value);
      const ratio = c > 0 && w > 0 ? (w / c).toFixed(1) : 0;

      const updates = {
        method: document.getElementById('edit-method').value,
        coffeeWeight: document.getElementById('edit-coffee-weight').value,
        waterWeight: document.getElementById('edit-water-weight').value,
        ratio: ratio,
        grindSize: document.getElementById('edit-grind-size').value,
        timeFormatted: document.getElementById('edit-time').value,
        notes: document.getElementById('edit-notes').value
      };

      try {
        await db.collection("extractions").doc(firebaseId).update(updates);
        document.getElementById('edit-recipe-modal').classList.add('hidden');
        alert('Receta actualizada correctamente.');
      } catch (error) {
        console.error("Error updating recipe:", error);
        alert('Error al actualizar la receta.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Cambios';
      }
    });
  }

  // Edit Pantry Submit
  const formEditPantry = document.getElementById('form-edit-pantry');
  if (formEditPantry) {
    formEditPantry.addEventListener('submit', async (e) => {
      e.preventDefault();
      const firebaseId = document.getElementById('edit-pantry-id').value;
      if (!firebaseId) return;

      const submitBtn = formEditPantry.querySelector('button[type="submit"]');
      submitBtn.disabled = true;
      submitBtn.textContent = 'Guardando...';

      const updates = {
        roaster: document.getElementById('edit-pantry-roaster').value,
        name: document.getElementById('edit-pantry-name').value,
        varietal: document.getElementById('edit-pantry-varietal').value,
        origin: document.getElementById('edit-pantry-origin').value,
        process: document.getElementById('edit-pantry-process').value,
        currentWeight: parseFloat(document.getElementById('edit-pantry-weight').value)
      };

      try {
        await db.collection("pantry").doc(firebaseId).update(updates);
        document.getElementById('edit-pantry-modal').classList.add('hidden');
        alert('Café actualizado correctamente.');
      } catch (error) {
        console.error("Error updating pantry:", error);
        alert('Error al actualizar el café.');
      } finally {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Guardar Cambios';
      }
    });
  }
}

function updateExtractionDropdown() {
  const container = document.getElementById('cata-extraction-cards');
  const hiddenInput = document.getElementById('cata-extraction');
  if(!container || !hiddenInput) return;
  
  container.innerHTML = '';
  
  const sortedExtractions = [...extractions].sort((a,b) => b.id - a.id);
  const untasted = sortedExtractions.filter(ext => !tastings.some(t => t.extractionId === ext.id)).slice(0, 5);
  
  if (untasted.length === 0) {
    container.innerHTML = '<div style="color: var(--color-text-secondary); font-size: 0.875rem;">No hay extracciones recientes sin catar.</div>';
    return;
  }
  
  untasted.forEach(ext => {
    const card = document.createElement('div');
    card.className = 'extraction-card';
    
    // Relative time formatting
    const msDiff = Date.now() - new Date(ext.date).getTime();
    const hoursDiff = Math.floor(msDiff / (1000 * 60 * 60));
    let timeStr = hoursDiff === 0 ? 'Hace poco' : `Hace ${hoursDiff}h`;
    if (hoursDiff > 24) timeStr = `Hace ${Math.floor(hoursDiff/24)}d`;

    card.innerHTML = `
      <div class="extraction-card-title">${ext.method}</div>
      <div class="extraction-card-date">${timeStr}</div>
      <div class="extraction-card-stats">${ext.coffeeWeight}g : ${ext.waterWeight}ml</div>
    `;
    
    card.addEventListener('click', () => {
      // Deselect all
      container.querySelectorAll('.extraction-card').forEach(c => c.classList.remove('selected'));
      // Select this
      card.classList.add('selected');
      hiddenInput.value = ext.id;
      
      // Attempt Autocomplete from Pantry
      if (ext.pantryId && pantry) {
        const bean = pantry.find(p => p.firebaseId === ext.pantryId || p.id === ext.pantryId);
        if (bean) {
          const selectPantry = document.getElementById('cata-pantry-id');
          if (selectPantry) selectPantry.value = bean.firebaseId || bean.id;
          
          document.getElementById('bean-origin').value = bean.origin || '';
          document.getElementById('bean-varietal').value = bean.varietal || '';
          document.getElementById('bean-process').value = bean.process || 'Lavado';
          document.getElementById('roast-date').value = bean.roastDate || '';
          
          // Show small 'Auto' badge feedback (optional UI touch, maybe vibrate)
          if (navigator.vibrate) navigator.vibrate(8);
        }
      }
    });
    
    container.appendChild(card);
  });
}

/* Global functions for recipe deletion */
window.deleteRecipe = async function(extractionId) {
  if (confirm('¿Estás seguro de eliminar esta receta? También se eliminarán las catas asociadas.')) {
    try {
      const ext = extractions.find(ex => ex.id === extractionId);
      if (ext && ext.firebaseId) {
        await db.collection("extractions").doc(ext.firebaseId).delete();
      }
      
      // Local state update for immediate feedback
      extractions = extractions.filter(e => e.id !== extractionId);
      renderRecipes();
      updateExtractionDropdown();
      
      const tastingMatches = tastings.filter(t => t.extractionId === extractionId);
      for (const t of tastingMatches) {
        if (t.firebaseId) {
          await db.collection("tastings").doc(t.firebaseId).delete();
        }
      }
    } catch (error) {
      console.error("Error eliminando receta:", error);
      alert('Hubo un error al eliminar la receta.');
    }
  }
};

window.toggleFavorite = async function(extractionId) {
  const ext = extractions.find(e => e.id === extractionId);
  if (!ext || !ext.firebaseId) return;

  const newFavStatus = !ext.isFavorite;
  
  // Optimistic UI update
  ext.isFavorite = newFavStatus;
  renderRecipes();

  try {
    await db.collection("extractions").doc(ext.firebaseId).update({
      isFavorite: newFavStatus
    });
  } catch (error) {
    console.error("Error updating favorite status:", error);
    // Revert optimistic update
    ext.isFavorite = !newFavStatus;
    renderRecipes();
  }
};

window.openEditModal = function(extractionId) {
  const ext = extractions.find(e => e.id === extractionId);
  if (!ext) return;

  document.getElementById('edit-recipe-id').value = ext.firebaseId;
  document.getElementById('edit-method').value = ext.method;
  document.getElementById('edit-coffee-weight').value = ext.coffeeWeight;
  document.getElementById('edit-water-weight').value = ext.waterWeight;
  document.getElementById('edit-grind-size').value = ext.grindSize;
  document.getElementById('edit-time').value = ext.timeFormatted;
  document.getElementById('edit-notes').value = ext.notes || '';

  document.getElementById('edit-recipe-modal').classList.remove('hidden');
};

let selectedSCAFlavors = new Set(); // Expose globally for form submission

function initInteractiveWheel() {
  const svgG = document.getElementById('sca-wheel-g');
  const chipsContainer = document.getElementById('sca-selected-chips');
  const centerText = document.getElementById('sca-center-text');
  const searchInput = document.getElementById('sca-search');
  const wheelWrapper = document.getElementById('sca-wheel');
  const btnZoomOut = document.getElementById('btn-sca-zoom-out');
  if (!svgG) return;

  const CENTER_X = 240, CENTER_Y = 240;
  const RADIUS_L1 = [60, 139], RADIUS_L2 = [140, 199], RADIUS_L3 = [200, 230];
  
  let currentView = 'root';
  let paths = [];

  function processNode(nodeRaw, level, parentColor) {
    let node = typeof nodeRaw === 'string' ? { name: nodeRaw, id: nodeRaw } : nodeRaw;
    
    let weight = 0;
    const isLeaf = level === 3 || (!node.children || node.children.length === 0);
    let processedChildren = [];
    
    if (isLeaf) {
      weight = 1;
    } else if (level === 1) {
      processedChildren = (node.children || []).map(c => {
        const p = processNode(c, 2, node.color || parentColor);
        weight += p.weight;
        return p;
      });
    } else if (level === 2) {
      processedChildren = (node.children || []).map(c => {
        const p = processNode(c, 3, node.color || parentColor);
        weight += p.weight;
        return p;
      });
    }
    
    return {
      ...node,
      children: processedChildren,
      level,
      isLeaf,
      weight,
      color: node.color || parentColor,
      id: node.id || node.name
    };
  }

  const rootNodes = flavorWheel.map(n => processNode(n, 1, n.color));
  const totalWeight = rootNodes.reduce((s, n) => s + n.weight, 0);

  function getPathData(cx, cy, r0, r1, startAngle, endAngle) {
    const start = polarToCartesian(cx, cy, r1, startAngle);
    const end = polarToCartesian(cx, cy, r1, endAngle);
    const start0 = polarToCartesian(cx, cy, r0, startAngle);
    const end0 = polarToCartesian(cx, cy, r0, endAngle);
    const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";
    return [
      "M", start.x, start.y, 
      "A", r1, r1, 0, largeArcFlag, 1, end.x, end.y,
      "L", end0.x, end0.y, 
      "A", r0, r0, 0, largeArcFlag, 0, start0.x, start0.y, 
      "Z"
    ].join(" ");
  }

  function polarToCartesian(cx, cy, r, angleInDegrees) {
    const angleInRadians = (angleInDegrees - 90) * Math.PI / 180.0;
    return { x: cx + (r * Math.cos(angleInRadians)), y: cy + (r * Math.sin(angleInRadians)) };
  }

  function createArc(node, startAngle, endAngle, radii, parentId) {
    const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    const id = node.id || node;
    const d = getPathData(CENTER_X, CENTER_Y, radii[0], radii[1], startAngle, endAngle);
    const midAngle = startAngle + (endAngle - startAngle) / 2;
    
    path.setAttribute('d', d);
    path.setAttribute('fill', node.color);
    path.setAttribute('stroke', getComputedStyle(document.body).getPropertyValue('--color-bg').trim() || '#1a1410');
    path.setAttribute('stroke-width', '1');
    path.setAttribute('class', 'flavor-arc');
    path.setAttribute('data-id', id);
    path.setAttribute('data-name', node.name || node);
    path.setAttribute('data-level', node.level);
    
    const rText = radii[0] + (radii[1] - radii[0]) / 2;
    const textPos = polarToCartesian(CENTER_X, CENTER_Y, rText, midAngle);

    const text = document.createElementNS("http://www.w3.org/2000/svg", "text");
    text.setAttribute('class', 'flavor-text');
    text.setAttribute('x', textPos.x);
    text.setAttribute('y', textPos.y);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('dominant-baseline', 'middle');
    text.setAttribute('fill', '#ffffff');
    text.textContent = node.name || node;

    // Rotar el texto para que sea legible
    let rotation = midAngle - 90;
    // Si está en la mitad inferior, voltearlo para que no quede de cabeza
    if (rotation > 90 && rotation < 270) {
      rotation += 180;
    }
    text.setAttribute('transform', `rotate(${rotation} ${textPos.x} ${textPos.y})`);

    const fontSize = currentView === 'root' ? 18 : (node.level === 2 ? 14 : 11);
    text.setAttribute('font-size', fontSize);

    const arcAngle = endAngle - startAngle;
    const name = node.name || node;
    const maxChars = Math.max(3, Math.floor(arcAngle / 0.7));
    if (name.length > maxChars) {
      text.textContent = name.substring(0, Math.max(3, maxChars - 1)) + '…';
    } else {
      text.textContent = name;
    }

    const title = document.createElementNS("http://www.w3.org/2000/svg", "title");
    title.textContent = node.name || node;
    path.appendChild(title);
    
    let touched = false;
    path.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      touched = true;
      handleWheelClick(node, path);
      setTimeout(() => { touched = false; }, 350);
    });
    path.addEventListener('click', (e) => {
      if (touched) return; // Evita doble disparo en móvil
      handleWheelClick(node, path);
    });

    paths.push({path, text, node, startAngle, endAngle});
    svgG.appendChild(path);
    svgG.appendChild(text);
  }

  function updateBreadcrumb() {
    const crumb = document.getElementById('sca-breadcrumb');
    const current = document.getElementById('sca-crumb-current');
    if (!crumb || !current) return;

    if (currentView === 'root') {
      crumb.setAttribute('data-view', 'root');
      current.textContent = '';
    } else {
      crumb.setAttribute('data-view', 'detail');
      const cat = rootNodes.find(n => n.id === currentView);
      if (cat) {
        current.textContent = cat.name;
        current.style.color = cat.color;
      }
    }
  }

  function renderWheel() {
    const wheelWrapper = document.getElementById('sca-wheel');
    svgG.style.opacity = '0';

    setTimeout(() => {
      svgG.innerHTML = '';
      paths = [];
      let currentAngle = 0;

      if (currentView === 'root') {
        const ROOT_RADII = [70, 220];
        const totalW = rootNodes.reduce((s, n) => s + n.weight, 0);
        rootNodes.forEach(n1 => {
          const angle = (n1.weight / totalW) * 360;
          createArc(n1, currentAngle, currentAngle + angle, ROOT_RADII, null);
          currentAngle += angle;
        });
      } else {
        const cat = rootNodes.find(n => n.id === currentView);
        if (!cat) { currentView = 'root'; renderWheel(); return; }

        const SUB_RADII = [70, 145];
        const LEAF_RADII = [146, 220];
        const totalW = cat.children.reduce((s, n) => s + n.weight, 0);

        cat.children.forEach(n2 => {
          const angle = (n2.weight / totalW) * 360;
          createArc(n2, currentAngle, currentAngle + angle, SUB_RADII, cat.id);

          let leafAngle = currentAngle;
          if (n2.children && n2.children.length > 0) {
            n2.children.forEach(n3 => {
              const a3 = (n3.weight / totalW) * 360;
              createArc(n3, leafAngle, leafAngle + a3, LEAF_RADII, n2.id);
              leafAngle += a3;
            });
          } else {
            createArc(n2, currentAngle, currentAngle + angle, LEAF_RADII, n2.id);
          }
          currentAngle += angle;
        });
      }

      if (wheelWrapper) {
        wheelWrapper.classList.remove('sca-entering');
        void wheelWrapper.offsetWidth;
        wheelWrapper.classList.add('sca-entering');
        setTimeout(() => wheelWrapper.classList.remove('sca-entering'), 500);
      }

      svgG.style.transition = 'opacity 200ms ease';
      svgG.style.opacity = '1';

      updateSelectionVisuals();
      updateBreadcrumb();
    }, 150);
  }

  function handleWheelClick(node, pathEl) {
    if (currentView === 'root' && node.level === 1) {
      currentView = node.id;
      renderWheel();
    } else if (node.isLeaf || node.level === 3) {
      toggleFlavor(node.name || node, node.color);
    } else if (node.level === 2 && (!node.children || node.children.length === 0)) {
      toggleFlavor(node.name || node, node.color);
    }
  }

  function toggleFlavor(name, color, forceSelect) {
    const key = name;
    const wasSelected = selectedSCAFlavors.has(key);

    if (wasSelected && !forceSelect) {
      selectedSCAFlavors.delete(key);
    } else {
      selectedSCAFlavors.add(key);

      const target = paths.find(p => (p.node.name || p.node) === name);
      if (target && target.path) {
        target.path.classList.remove('just-selected');
        void target.path.offsetWidth;
        target.path.classList.add('just-selected');
        setTimeout(() => target.path.classList.remove('just-selected'), 400);
      }

      if (navigator.vibrate) navigator.vibrate(8);
    }
    updateSelectionVisuals();
  }

  function updateSelectionVisuals() {
    paths.forEach(p => {
      if (p.node.isLeaf || (p.node.level === 2 && (!p.node.children || p.node.children.length === 0))) {
        if (selectedSCAFlavors.has(p.node.name || p.node)) {
          p.path.classList.add('selected');
        } else {
          p.path.classList.remove('selected');
        }
      }
    });

    const count = selectedSCAFlavors.size;
    if (count === 0) {
      centerText.textContent = currentView === 'root' ? "Toca una categoría" : "Toca un sabor";
      centerText.setAttribute('font-size', '14');
    } else if (count === 1) {
      centerText.textContent = "1 sabor";
      centerText.setAttribute('font-size', '16');
    } else if (count <= 5) {
      centerText.textContent = `${count} sabores`;
      centerText.setAttribute('font-size', '16');
    } else if (count <= 12) {
      centerText.textContent = `${count} sabores ✨`;
      centerText.setAttribute('font-size', '15');
    } else {
      centerText.textContent = `${count} sabores`;
      centerText.setAttribute('font-size', '15');
    }

    const hintEl = document.getElementById('sca-hint');
    if (hintEl) {
      if (count > 12) {
        hintEl.textContent = "Una cata clara suele tener 3-5 sabores principales. ¿Quieres refinar?";
        hintEl.classList.add('visible');
      } else {
        hintEl.classList.remove('visible');
      }
    }

    chipsContainer.innerHTML = '';
    selectedSCAFlavors.forEach(flavor => {
      const pData = paths.find(p => (p.node.name || p.node) === flavor);
      const color = pData ? pData.node.color : '#3B82C9';
      
      const chip = document.createElement('div');
      chip.className = 'flavor-chip';
      chip.style.backgroundColor = `${color}22`;
      chip.style.border = `1px solid ${color}`;
      chip.style.color = color;
      
      chip.innerHTML = `<span>${flavor}</span><span class="remove">&times;</span>`;
      chip.querySelector('.remove').addEventListener('click', () => {
        chip.classList.add('removing');
        setTimeout(() => toggleFlavor(flavor, color), 180);
      });
      chipsContainer.appendChild(chip);
    });

    const actionsBar = document.getElementById('sca-actions-bar');
    if (actionsBar) {
      if (count >= 2) {
        actionsBar.innerHTML = `
          <button class="sca-clear-btn visible" id="sca-clear-all">
            Limpiar selección
          </button>
        `;
        document.getElementById('sca-clear-all').addEventListener('click', () => {
          const allChips = chipsContainer.querySelectorAll('.flavor-chip');
          allChips.forEach((chip, i) => {
            setTimeout(() => chip.classList.add('removing'), i * 30);
          });
          setTimeout(() => {
            selectedSCAFlavors.clear();
            updateSelectionVisuals();
          }, allChips.length * 30 + 200);
        });
      } else {
        actionsBar.innerHTML = '';
      }
    }
    if (typeof renderSummaryCard === 'function') renderSummaryCard();
  }

  const crumbRoot = document.querySelector('.sca-crumb-root');
  if (crumbRoot) {
    crumbRoot.addEventListener('click', () => {
      if (currentView !== 'root') {
        currentView = 'root';
        renderWheel();
      }
    });
  }

  searchInput.addEventListener('input', (e) => {
    const val = e.target.value.toLowerCase();
    paths.forEach(p => {
      if (p.node.isLeaf) {
        const name = (p.node.name || p.node).toLowerCase();
        if (val && !name.includes(val)) {
          p.path.classList.add('not-matched');
        } else {
          p.path.classList.remove('not-matched');
        }
      }
    });
  });

  renderWheel();
}

/* ============================================
   FASE 4 — Recetario Globals
   ============================================ */
let currentSearchQuery = '';

function matchesSearch(ext, query) {
  if (!query) return true;
  const t = tastings.find(t => t.extractionId === ext.id);
  const haystack = [
    ext.method, ext.notes, ext.summary,
    t?.origin, t?.varietal, t?.process,
    ...(t?.flavors || [])
  ].filter(Boolean).join(' ').toLowerCase();
  return haystack.includes(query);
}

function highlightMatch(text, query) {
  if (!query || !text) return text || '';
  const regex = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return String(text).replace(regex, '<span class="search-highlight">$1</span>');
}

function setupRecetarioSearch() {
  const input = document.getElementById('recetario-search-input');
  const clearBtn = document.getElementById('recetario-search-clear');
  if (!input) return;

  let debounceTimer;
  input.addEventListener('input', (e) => {
    const query = e.target.value.trim().toLowerCase();
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      currentSearchQuery = query;
      if (clearBtn) clearBtn.classList.toggle('hidden', query.length === 0);
      renderRecipes();
    }, 200);
  });

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      input.value = '';
      currentSearchQuery = '';
      clearBtn.classList.add('hidden');
      renderRecipes();
      input.focus();
    });
  }
}

function animateCount(element, target) {
  if (!element) return;
  const current = parseInt(element.textContent) || 0;
  if (current === target) return;
  element.classList.remove('counting');
  void element.offsetWidth;
  element.classList.add('counting');
  const duration = 600;
  const start = performance.now();
  function update(now) {
    const elapsed = now - start;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 3);
    element.textContent = Math.floor(current + (target - current) * eased);
    if (progress < 1) requestAnimationFrame(update);
    else element.textContent = target;
  }
  requestAnimationFrame(update);
}

function renderRecetarioStats() {
  const totalEl = document.getElementById('stat-total-extractions');
  if (totalEl) animateCount(totalEl, extractions.length);

  const methodCounts = {};
  extractions.forEach(e => { if (e.method) methodCounts[e.method] = (methodCounts[e.method] || 0) + 1; });
  const topMethod = Object.entries(methodCounts).sort((a, b) => b[1] - a[1])[0];
  const topMethodEl = document.getElementById('stat-top-method');
  const topMethodLabelEl = document.getElementById('stat-top-method-label');
  if (topMethodEl) {
    topMethodEl.textContent = topMethod ? topMethod[0] : '—';
    if (topMethodLabelEl && topMethod && extractions.length > 0) {
      const pct = Math.round((topMethod[1] / extractions.length) * 100);
      topMethodLabelEl.textContent = `${pct}% de tus tazas`;
    }
  }

  const originScores = {};
  tastings.forEach(t => {
    if (t.origin && t.rating >= 4) originScores[t.origin] = (originScores[t.origin] || 0) + 1;
  });
  const topOrigin = Object.entries(originScores).sort((a, b) => b[1] - a[1])[0];
  const topOriginEl = document.getElementById('stat-top-origin');
  if (topOriginEl) topOriginEl.textContent = topOrigin ? topOrigin[0] : '—';

  const rated = tastings.filter(t => t.rating > 0);
  const avgEl = document.getElementById('stat-avg-rating');
  if (avgEl) {
    if (rated.length > 0) {
      const avg = rated.reduce((s, t) => s + t.rating, 0) / rated.length;
      avgEl.textContent = avg.toFixed(1);
    } else {
      avgEl.textContent = '—';
    }
  }
}

function renderHeatmap() {
  const grid = document.getElementById('heatmap-grid');
  const streakEl = document.getElementById('heatmap-streak');
  if (!grid) return;

  // Ensure global tooltip exists (created once, reused across re-renders)
  let heatmapTooltip = document.getElementById('heatmap-tooltip-global');
  if (!heatmapTooltip) {
    heatmapTooltip = document.createElement('div');
    heatmapTooltip.id = 'heatmap-tooltip-global';
    heatmapTooltip.className = 'heatmap-tooltip';
    document.body.appendChild(heatmapTooltip);
  }

  function positionTooltip(targetCell) {
    const rect = targetCell.getBoundingClientRect();
    // getBoundingClientRect of tooltip requires it to be briefly visible
    heatmapTooltip.style.visibility = 'hidden';
    heatmapTooltip.style.opacity = '1';
    const tipRect = heatmapTooltip.getBoundingClientRect();
    heatmapTooltip.style.visibility = '';
    heatmapTooltip.style.opacity = '';

    let top = rect.top - tipRect.height - 8;
    let left = rect.left + (rect.width / 2) - (tipRect.width / 2);

    if (top < 8) {
      top = rect.bottom + 8;
      heatmapTooltip.classList.add('below');
    } else {
      heatmapTooltip.classList.remove('below');
    }

    if (left < 8) left = 8;
    if (left + tipRect.width > window.innerWidth - 8) {
      left = window.innerWidth - tipRect.width - 8;
    }

    heatmapTooltip.style.top = top + 'px';
    heatmapTooltip.style.left = left + 'px';
  }

  const byDay = {};
  extractions.forEach(e => {
    const d = new Date(e.date);
    if (isNaN(d.getTime())) return;
    const key = d.toISOString().slice(0, 10);
    byDay[key] = (byDay[key] || 0) + 1;
  });

  grid.innerHTML = '';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const cells = [];

  for (let i = 89; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    const count = byDay[key] || 0;
    let level = count === 0 ? 0 : count === 1 ? 1 : count === 2 ? 2 : count === 3 ? 3 : 4;
    const cell = document.createElement('div');
    cell.className = 'heat-cell';
    cell.setAttribute('data-level', level);

    const dateStr = d.toLocaleDateString('es', { day: 'numeric', month: 'short', year: 'numeric' });
    const tooltipText = count === 0
      ? `Sin extracciones \u00b7 ${dateStr}`
      : `${count} extracci${count === 1 ? '\u00f3n' : 'ones'} \u00b7 ${dateStr}`;

    cell.addEventListener('mouseenter', () => {
      heatmapTooltip.textContent = tooltipText;
      heatmapTooltip.classList.add('visible');
      positionTooltip(cell);
    });
    cell.addEventListener('mouseleave', () => {
      heatmapTooltip.classList.remove('visible');
    });
    cell.addEventListener('touchstart', () => {
      heatmapTooltip.textContent = tooltipText;
      heatmapTooltip.classList.add('visible');
      positionTooltip(cell);
      setTimeout(() => heatmapTooltip.classList.remove('visible'), 1500);
    }, { passive: true });

    grid.appendChild(cell);
    cells.push({ date: key, count });
  }


  let currentStreak = 0;
  for (let i = cells.length - 1; i >= 0; i--) {
    if (cells[i].count > 0) currentStreak++; else break;
  }
  let maxStreak = 0, temp = 0;
  cells.forEach(c => { if (c.count > 0) { temp++; maxStreak = Math.max(maxStreak, temp); } else temp = 0; });
  const activeDays = cells.filter(c => c.count > 0).length;

  if (streakEl) {
    streakEl.innerHTML = `
      <span><strong>${currentStreak}</strong> racha actual</span>
      <span><strong>${maxStreak}</strong> racha máxima</span>
      <span><strong>${activeDays}</strong> días activos · 90</span>
    `;
  }
}

function getEmptyState() {
  if (currentSearchQuery) {
    return `<div class="recetario-empty"><div class="empty-icon">🔍</div><div class="empty-title">Sin resultados para &ldquo;${currentSearchQuery}&rdquo;</div><div class="empty-subtitle">Intenta con otra palabra o limpia la búsqueda.</div></div>`;
  }
  if (currentRecetarioFilter === 'favorites') {
    return `<div class="recetario-empty"><div class="empty-icon">🤍</div><div class="empty-title">No tienes favoritas todavía</div><div class="empty-subtitle">Marca recetas con corazón para encontrarlas aquí.</div></div>`;
  }
  return `<div class="recetario-empty"><div class="empty-icon">☕</div><div class="empty-title">Aún no hay recetas guardadas</div><div class="empty-subtitle">Empieza tu primera extracción en la Bitácora.</div></div>`;
}

function setupDragAndDrop() {
  const list = document.getElementById('recipe-list');
  if (!list) return;
  const cards = list.querySelectorAll(':scope > div');
  let draggedCard = null;

  cards.forEach(card => {
    const surface = card.querySelector('.surface');
    if (!surface) return;
    surface.classList.add('recipe-card-draggable');
    if (!surface.querySelector('.drag-handle')) {
      const handle = document.createElement('div');
      handle.className = 'drag-handle';
      handle.innerHTML = '⋮⋮';
      handle.title = 'Arrastra para reordenar';
      surface.appendChild(handle);
    }
    surface.draggable = true;
    surface.addEventListener('dragstart', (e) => {
      draggedCard = card;
      surface.classList.add('recipe-card-dragging');
      e.dataTransfer.effectAllowed = 'move';
    });
    surface.addEventListener('dragend', () => {
      surface.classList.remove('recipe-card-dragging');
      list.querySelectorAll('.recipe-card-drag-over').forEach(el => el.classList.remove('recipe-card-drag-over'));
      draggedCard = null;
    });
    surface.addEventListener('dragover', (e) => {
      e.preventDefault();
      if (card !== draggedCard) surface.classList.add('recipe-card-drag-over');
    });
    surface.addEventListener('dragleave', () => surface.classList.remove('recipe-card-drag-over'));
    surface.addEventListener('drop', async (e) => {
      e.preventDefault();
      surface.classList.remove('recipe-card-drag-over');
      if (!draggedCard || draggedCard === card) return;
      const all = Array.from(list.children);
      const fromIdx = all.indexOf(draggedCard);
      const toIdx = all.indexOf(card);
      if (fromIdx < toIdx) list.insertBefore(draggedCard, card.nextSibling);
      else list.insertBefore(draggedCard, card);
      await persistFavoriteOrder();
    });
  });
}

async function persistFavoriteOrder() {
  const list = document.getElementById('recipe-list');
  if (!list) return;
  const surfaces = list.querySelectorAll(':scope > div .surface');
  const updates = [];
  surfaces.forEach((surface, newOrder) => {
    const btn = surface.querySelector('[onclick*="toggleFavorite"]');
    if (!btn) return;
    const match = btn.getAttribute('onclick').match(/'([^']+)'/);
    if (!match) return;
    const ext = extractions.find(e => e.id === match[1]);
    if (ext && ext.firebaseId) {
      updates.push(db.collection('extractions').doc(ext.firebaseId).update({ favoriteOrder: newOrder }));
      ext.favoriteOrder = newOrder;
    }
  });
  await Promise.all(updates);
  showToast('Orden de favoritas actualizado', 'success');
}

let qpEl = null;
let qpHideTimer = null;

function ensureQuickPreview() {
  if (qpEl) return qpEl;
  qpEl = document.createElement('div');
  qpEl.className = 'recipe-quick-preview';
  document.body.appendChild(qpEl);
  return qpEl;
}

function setupQuickPreview() {
  document.addEventListener('mouseover', (e) => {
    const card = e.target.closest('#recipe-list > div .surface');
    if (!card) return;
    const btn = card.querySelector('[onclick*="toggleFavorite"]');
    if (!btn) return;
    const match = btn.getAttribute('onclick').match(/'([^']+)'/);
    if (!match) return;
    const ext = extractions.find(ex => ex.id === match[1]);
    if (!ext) return;
    const t = tastings.find(ta => ta.extractionId === ext.id);
    const qp = ensureQuickPreview();

    const noteText = ext.summary || ext.notes || 'Sin notas registradas.';
    let html = `<p class="qp-narrative">&ldquo;${noteText}&rdquo;</p>`;
    html += `<div class="qp-meta">`;
    html += `<span>${ext.coffeeWeight}g · ${ext.waterWeight}ml</span>`;
    html += `<span>1:${ext.ratio}</span>`;
    if (t?.flavors?.length) html += `<span>${t.flavors.length} sabores</span>`;
    html += `</div>`;
    qp.innerHTML = html;

    const rect = card.getBoundingClientRect();
    let top = rect.top + window.scrollY - 10;
    let left = rect.right + window.scrollX + 12;
    if (left + 270 > window.innerWidth) left = rect.left + window.scrollX - 282;
    qp.style.top = top + 'px';
    qp.style.left = left + 'px';
    clearTimeout(qpHideTimer);
    qp.classList.add('visible');
  });

  document.addEventListener('mouseout', (e) => {
    const card = e.target.closest('#recipe-list > div .surface');
    if (!card) return;
    qpHideTimer = setTimeout(() => { if (qpEl) qpEl.classList.remove('visible'); }, 100);
  });
}

function renderRecipes() {
  const recipeList = document.getElementById('recipe-list');
  
  // Apply Filter
  let filtered = extractions;

  // 1. App Top Tabs Filter
  if (currentRecetarioFilter === 'favorites') {
    filtered = filtered.filter(row => row.isFavorite === true);
    filtered.sort((a, b) => {
      const oA = typeof a.favoriteOrder === 'number' ? a.favoriteOrder : 999999;
      const oB = typeof b.favoriteOrder === 'number' ? b.favoriteOrder : 999999;
      return oA !== oB ? oA - oB : new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  } else if (currentRecetarioFilter === 'filtrados') {
    filtered = filtered.filter(row => row.method !== 'Bebida Preparada');
  } else if (currentRecetarioFilter === 'preparados') {
    filtered = filtered.filter(row => row.method === 'Bebida Preparada');
  }

  if (filtered.length === 0) {
    recipeList.innerHTML = getEmptyState();
    renderRecetarioStats();
    renderHeatmap();
    return;
  }

  recipeList.innerHTML = '';
  let sortedExtractions = [...filtered];
  
  // Search filter
  if (currentSearchQuery) {
    sortedExtractions = sortedExtractions.filter(ext => matchesSearch(ext, currentSearchQuery));
  }
  
  // Method Filter
  if (currentMethodFilter !== 'all') {
    sortedExtractions = sortedExtractions.filter(e => e.method === currentMethodFilter);
  }

  // Sorting
  if (currentSortOrder === 'date_desc') {
    sortedExtractions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  } else if (currentSortOrder === 'date_asc') {
    sortedExtractions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  } else if (currentSortOrder === 'rating_desc') {
    sortedExtractions.sort((a,b) => {
      const tA = tastings.find(t => t.extractionId === a.id);
      const tB = tastings.find(t => t.extractionId === b.id);
      const rA = tA ? (tA.rating || 0) : 0;
      const rB = tB ? (tB.rating || 0) : 0;
      
      if (rA !== rB) return rB - rA; // High to Low
      // Fallback to date if ratings tie
      return new Date(b.date).getTime() - new Date(a.date).getTime();
    });
  }

  if (sortedExtractions.length === 0) {
    recipeList.innerHTML = getEmptyState();
    return;
  }

  sortedExtractions.forEach(ext => {
    try {
      const t = tastings.find(t => t.extractionId === ext.id);
      
      // Safe Date parsing
      const extractedDate = new Date(ext.date);
      const dateStr = !isNaN(extractedDate.getTime()) 
          ? extractedDate.toLocaleDateString([], { dateStyle: 'long' }) 
          : 'Fecha Desconocida';
      
      let ratingStars = '';
      if (t && t.rating > 0) {
        const fullStars = Math.floor(t.rating);
        const hasHalfStar = (t.rating % 1) !== 0;
        const emptyStars = 5 - Math.ceil(t.rating);
        
        let htmlOutput = '';
        for(let i=0; i<fullStars; i++) htmlOutput += '★';
        if(hasHalfStar) htmlOutput += '<svg width="20" height="20" viewBox="0 0 24 24" style="vertical-align: text-bottom; margin: 0; display: inline-block; transform: translateY(2px);"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" opacity="0.4"/><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" clip-path="polygon(0 0, 50% 0, 50% 100%, 0 100%)"/></svg>';
        for(let i=0; i<emptyStars; i++) htmlOutput += '<span style="color: var(--color-text-muted); font-size: 1.1rem;">☆</span>';
        
        ratingStars = `<div style="color: var(--color-accent); font-size: 1.25rem; display: flex; align-items: center;">${htmlOutput} <span style="font-size: 0.95rem; margin-left: 6px; color: var(--color-text-primary); font-weight: 700;">${t.rating.toFixed(1)}</span></div>`;
      } else {
        ratingStars = `<div style="color: var(--color-text-muted); font-size: 0.875rem;">Sin calificar</div>`;
      }

      const isFav = ext.isFavorite;
      const heartIcon = isFav 
        ? `<svg width="22" height="22" viewBox="0 0 24 24" style="color: #e74c3c;"><path fill="currentColor" d="M12,21.35L10.55,20.03C5.4,15.36 2,12.28 2,8.5C2,5.42 4.42,3 7.5,3C9.24,3 10.91,3.81 12,5.09C13.09,3.81 14.76,3 16.5,3C19.58,3 22,5.42 22,8.5C22,12.28 18.6,15.36 13.45,20.04L12,21.35Z"/></svg>`
        : `<svg width="22" height="22" viewBox="0 0 24 24" style="color: var(--color-text-secondary);"><path fill="currentColor" d="M12.1,18.55L12,18.65L11.89,18.55C7.14,14.24 4,11.39 4,8.5C4,6.5 5.5,5 7.5,5C9.04,5 10.54,6 11.07,7.36H12.93C13.46,6 14.96,5 16.5,5C18.5,5 20,6.5 20,8.5C20,11.39 16.86,14.24 12.1,18.55M16.5,3C14.76,3 13.09,3.81 12,5.08C10.91,3.81 9.24,3 7.5,3C4.42,3 2,5.41 2,8.5C2,12.27 5.4,15.36 10.55,20.03L12,21.35L13.45,20.03C18.6,15.36 22,12.27 22,8.5C22,5.41 19.58,3 16.5,3Z"/></svg>`;

      const html = `
        <div class="surface ${isFav ? 'favorite-glow' : ''}" style="${isFav ? 'border-color: rgba(231, 76, 60, 0.3); padding-bottom: 20px;' : 'padding-bottom: 20px;'}">
          <div class="recipe-card-header">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <div class="recipe-method">${highlightMatch(ext.method || 'Método Desconocido', currentSearchQuery)}
                  ${ext.isFromNoni ? `<span style="font-size: 0.7rem; color: #a18cf5; background: rgba(161, 140, 245, 0.1); border: 1px solid rgba(161, 140, 245, 0.3); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px;">✨ Creado por Noni</span>` : ''}
                </div>
                <button onclick="window.toggleFavorite('${ext.id}')" style="background:none; border:none; padding: 2px; cursor: pointer; display: flex; align-items: center; font-size: 1.15rem; line-height: 1; margin-left: 4px;">
                  ${ext.isFavorite ? '❤️' : '🤍'}
                </button>
              </div>
              <div class="recipe-date">${dateStr}</div>
            </div>
            
            <div style="display: flex; align-items: center; gap: 12px;">
              ${ratingStars}
              
              <div class="context-menu-container">
                <button class="context-menu-btn" onclick="this.nextElementSibling.classList.toggle('active')">⋮</button>
                <div class="context-menu-dropdown">
                  <button class="context-menu-item" onclick="window.exportRecipeToImage('${ext.id}')">📸 Compartir IG</button>
                  <button class="context-menu-item" onclick="window.openEditModal('${ext.id}')">✏️ Editar Receta</button>
                  <button class="context-menu-item danger" onclick="window.deleteRecipe('${ext.id}')">🗑️ Eliminar</button>
                </div>
              </div>

            </div>
          </div>

          <div class="recipe-card-body" style="padding-top: 16px;">
            <!-- Slim Flex Grid for Metrics -->
            <div style="display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 16px;">
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--color-text-muted);">⚖️</span> ${ext.coffeeWeight}g / ${ext.waterWeight}ml
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--color-text-muted);">💧</span> 1:${ext.ratio}
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--color-text-muted);">⚙️</span> ${ext.grindSize} pts
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--color-text-muted);">⏱️</span> ${ext.timeFormatted !== '00:00.0' ? ext.timeFormatted : '--:--'}
              </div>
              <div style="background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.05); padding: 4px 8px; border-radius: 4px; font-size: 0.75rem; color: var(--color-text-secondary); display: flex; align-items: center; gap: 4px;">
                <span style="color: var(--color-text-muted);">🌡️</span> ${ext.temperature}°C
              </div>
            </div>

            <!-- Notes -->
            ${ext.notes ? `<div style="font-size: 0.85rem; font-style: italic; color: var(--color-text-muted); padding: 8px 12px; background: rgba(0,0,0,0.2); border-left: 2px solid var(--color-accent); border-radius: 2px; margin-bottom: 16px;">"${ext.notes}"</div>` : ''}

            <!-- Tasting Profile -->
            ${t ? `
            <div style="margin-bottom: 20px; font-size: 0.85rem; color: var(--color-text-secondary);">
              <div style="margin-bottom: 4px; color: var(--color-text-primary);"><strong>${t.origin}</strong> ${t.varietal ? `<span style="color: var(--color-accent); font-weight: 500;">(${t.varietal})</span>` : ''} <span style="color: var(--color-text-muted); font-size: 0.75rem; text-transform: uppercase;">• ${t.process}</span></div>
              ${t.flavors.length > 0 ? `<div style="color: var(--color-accent); font-size: 0.8rem; margin-top: 6px;">Notas: ${t.flavors.join(' • ')}</div>` : ''}
              ${t.metrics ? `
              <div style="margin-top: 10px; display: flex; gap: 12px; flex-wrap: wrap;">
                <div style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px;"><span style="color: var(--color-text-muted); text-transform: uppercase;">Dulzor</span> <span style="width: 16px; height: 16px; border-radius: 50%; background: var(--color-surface); display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); border: 1px solid var(--color-border);">${t.metrics.sweetness}</span></div>
                <div style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px;"><span style="color: var(--color-text-muted); text-transform: uppercase;">Acidez</span> <span style="width: 16px; height: 16px; border-radius: 50%; background: var(--color-surface); display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); border: 1px solid var(--color-border);">${t.metrics.acidity}</span></div>
                <div style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px;"><span style="color: var(--color-text-muted); text-transform: uppercase;">Claridad</span> <span style="width: 16px; height: 16px; border-radius: 50%; background: var(--color-surface); display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); border: 1px solid var(--color-border);">${t.metrics.clarity}</span></div>
                <div style="font-size: 0.7rem; display: flex; align-items: center; gap: 4px;"><span style="color: var(--color-text-muted); text-transform: uppercase;">Postgusto</span> <span style="width: 16px; height: 16px; border-radius: 50%; background: var(--color-surface); display: inline-flex; align-items: center; justify-content: center; color: var(--color-success); border: 1px solid var(--color-border);">${t.metrics.aftertaste}</span></div>
              </div>
              ` : ''}
            </div>
            ` : ''}

            <!-- Expandable Pour Stages -->
            ${ext.pourStages && ext.pourStages.length > 0 ? `
            <details style="margin-bottom: 20px; color: var(--color-text-secondary); font-size: 0.8rem; background: rgba(0,0,0,0.15); border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.03);">
              <summary style="padding: 10px 12px; cursor: pointer; user-select: none; font-weight: 500; text-transform: uppercase; letter-spacing: 0.5px; opacity: 0.8; list-style: none; display: flex; align-items: center; gap: 8px;">
                <svg width="14" height="14" viewBox="0 0 24 24" style="opacity: 0.5;"><path fill="currentColor" d="M3,15H21V19H3V15M3,5H21V9H3V5M3,10H21V14H3V10Z" /></svg> Vertidos
              </summary>
              <div style="padding: 0 12px 12px 12px;">
                ${ext.pourStages.map(stage => `
                  <div style="display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid rgba(255,255,255,0.02);">
                    <span style="color: var(--color-accent); font-family: monospace;">${(stage.timeFormatted || '00:00').substring(0, 5)}</span>
                    <span style="color: var(--color-text-primary);">${stage.note || 'Vertido'}</span>
                    <span style="color: var(--color-text-secondary);">${stage.waterTarget ? stage.waterTarget + 'ml' : '-'}</span>
                  </div>
                `).join('')}
              </div>
            </details>
            ` : ''}

            <!-- Primary Action -->
            <div style="margin-top: auto;">
              ${ext.pourStages && ext.pourStages.length > 0 ? `
              <button class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 0.95rem; font-weight: 600; justify-content: center; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px;" onclick="window.startReplication('${ext.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M8,5.14V19.14L19,12.14L8,5.14Z"/></svg>
                Replicar Extracción
              </button>` : `
              <button class="btn btn-primary" style="width: 100%; padding: 14px; font-size: 0.95rem; font-weight: 600; justify-content: center; text-transform: uppercase; letter-spacing: 1px; display: flex; align-items: center; gap: 8px; opacity: 0.5; cursor: not-allowed;" disabled>
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M12,2A10,10 0 0,0 2,12A10,10 0 0,0 12,22A10,10 0 0,0 22,12A10,10 0 0,0 12,2M12,4A8,8 0 0,1 20,12A8,8 0 0,1 12,20A8,8 0 0,1 4,12A8,8 0 0,1 12,4M11,7V13H16.2L15.3,14.5H9.5V7H11Z" /></svg>
                Sin Replicación Automática
              </button>
              `}
              ${(ext.isFromNoni && (!t || t.rating === 0)) ? `
                <button class="btn" style="width: 100%; padding: 10px; margin-top: 8px; font-size: 0.8rem; background: transparent; color: var(--color-accent); border: 1px solid var(--color-accent);" onclick="window.rateRecipe('${ext.id}')">
                  Valorar Receta
                </button>
              ` : ''}
            </div>

          </div>
        </div>
      `;
    
    const card = document.createElement('div');
    card.innerHTML = html;
    recipeList.appendChild(card);
    } catch (e) {
      console.error("Error renderizando tarjeta de receta:", e, ext);
      alert("Error UI: " + e.message);
    }
  });

  renderRecetarioStats();
  renderHeatmap();
  if (currentRecetarioFilter === 'favorites') {
    document.getElementById('recipe-list').classList.add('recetario-favorites-mode');
    setupDragAndDrop();
  } else {
    document.getElementById('recipe-list').classList.remove('recetario-favorites-mode');
  }
}

window.exportRecipeToImage = async function(id) {
  const ext = extractions.find(ex => ex.id === id);
  if (!ext) return;
  const t = tastings.find(ta => ta.extractionId === ext.id);

  // Populate Template
  document.getElementById('export-title').textContent = ext.method || 'Receta';
  document.getElementById('export-origin').textContent = t ? `${t.origin}` : 'Origen 90';
  document.getElementById('export-method-badge').textContent = t && t.varietal ? t.varietal : (ext.method || 'Café');
  document.getElementById('export-coffee').textContent = `${ext.coffeeWeight}g`;
  document.getElementById('export-water').textContent = `${ext.waterWeight}g`;
  document.getElementById('export-grind').textContent = ext.grindSize;
  document.getElementById('export-notes').textContent = ext.summary || ext.notes || (t && t.flavors && t.flavors.length > 0 ? t.flavors.join(', ') : 'Una extracción digna de compartir.');
  const dateEl = document.getElementById('export-date');
  if (dateEl) {
    const d = new Date(ext.date);
    dateEl.textContent = !isNaN(d.getTime())
      ? d.toLocaleDateString('es', { day: '2-digit', month: 'short', year: 'numeric' }).toUpperCase()
      : '—';
  }
  
  const starsEl = document.getElementById('export-stars');
  if (t && t.rating) {
    let s = '';
    for(let i=0; i<Math.floor(t.rating); i++) s+='★';
    if(t.rating % 1 !== 0) s+='★'; 
    for(let i=0; i<(5-Math.ceil(t.rating)); i++) s+='☆';
    starsEl.textContent = s;
  } else {
    starsEl.textContent = '★★★★★';
  }

  const wrapper = document.getElementById('export-wrapper');
  wrapper.style.zIndex = '1000'; // Make sure canvas can render it
  
  try {
    if (typeof html2canvas === 'undefined') {
      throw new Error("html2canvas no cargó desde el CDN. Verifica conexión.");
    }
    const canvas = await html2canvas(document.getElementById('export-card'), { 
      backgroundColor: '#0a0a0c',
      scale: 2, // High res
      useCORS: true,
      allowTaint: false,
      logging: false
    });
    
    wrapper.style.zIndex = '-1';
    // Convert to Image
    canvas.toBlob(async (blob) => {
      if (!blob) throw new Error("Fallo al generar el archivo Blob.");
      const safeId = ext.id && ext.id.toString ? ext.id.toString().replace(/ /g, '_') : 'origen';
      const file = new File([blob], `receta_${safeId}.png`, { type: 'image/png' });
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({
            title: 'Mi Receta de Café',
            text: '¡Mira esta extracción de café en Origen 90!',
            files: [file]
          });
        } catch(shareErr) {
          // Si falló por falta de gesto de usuario, forzamos descarga
          downloadExportImage(canvas.toDataURL('image/png'), `receta_${safeId}.png`);
        }
      } else {
        // Fallback Download
        downloadExportImage(canvas.toDataURL('image/png'), `receta_${safeId}.png`);
      }
    }, 'image/png');
  } catch(e) {
    wrapper.style.zIndex = '-1';
    console.error("Error exporting image", e);
    alert("Error Canvas: " + e.message);
  }
};

function downloadExportImage(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}

window.startReplication = function(recipeId) {
  const ext = extractions.find(ex => ex.id === recipeId);
  if (!ext || !ext.pourStages || ext.pourStages.length === 0) return;

  // Setup Replication Mode State
  replicateMode = true;
  replicateStages = [...ext.pourStages].sort((a, b) => a.timeMs - b.timeMs);
  
  const instructionsList = document.getElementById('rep-instructions-list');
  if (instructionsList) {
    if (ext.steps && ext.steps.length > 0) {
      instructionsList.innerHTML = `<ul style="margin: 0; padding-left: 16px;">${ext.steps.map(s => `<li>${s}</li>`).join('')}</ul>`;
      instructionsList.classList.remove('hidden');
    } else {
      instructionsList.classList.add('hidden');
    }
  }
  
  // Auto-Complete Logic: Ensure it starts at 00:00.0
  if (replicateStages.length > 0 && replicateStages[0].timeMs > 0) {
    // Force the first user-recorded lap to be the start of the recipe (00:00)
    replicateStages[0].timeMs = 0;
    replicateStages[0].timeFormatted = '00:00.0';
  }

  // Auto-Complete Logic: Ensure it has an explicit end based on total timer
  if (ext.timeMs && replicateStages.length > 0) {
    const lastStage = replicateStages[replicateStages.length - 1];
    if (ext.timeMs > lastStage.timeMs + 2000) {
      replicateStages.push({
        id: 'auto-end',
        timeMs: ext.timeMs,
        timeFormatted: ext.timeFormatted,
        note: 'Fin de Extracción',
        waterTarget: '-'
      });
    }
  }

  nextStageIndex = 0;
  previousViewBeforeReplication = 'view-recetario';
  
  // Reset replication UI
  btnRepReset.click();

  // Hide main views and nav, show replicar view
  views.forEach(view => view.classList.add('hidden'));
  document.querySelector('nav').classList.add('hidden');
  document.getElementById('view-replicar').classList.remove('hidden');
  
  // Show initial message
  repTimerGuideDisplay.classList.remove('hidden');
  repTimerGuideDisplay.textContent = '¡Listo! Presiona Start para seguir la receta.';
  
  renderRoadmapProgress(0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

window.startReplicationFromAI = function(v60RecipeId) {
  const recipe = masterRecipes.find(r => r.id === v60RecipeId);
  if (!recipe || !recipe.pourStages || recipe.pourStages.length === 0) return;

  // Setup Replication Mode State
  replicateMode = true;
  replicateStages = [...recipe.pourStages].sort((a, b) => a.timeMs - b.timeMs);
  nextStageIndex = 0;
  previousViewBeforeReplication = 'view-inspiracion';
  
  // Reset replication UI
  btnRepReset.click();

  // Hide main views and nav, show replicar view
  views.forEach(view => view.classList.add('hidden'));
  document.querySelector('nav').classList.add('hidden');
  document.getElementById('view-replicar').classList.remove('hidden');
  
  // Show initial message
  repTimerGuideDisplay.classList.remove('hidden');
  repTimerGuideDisplay.textContent = '¡Listo! Presiona Start para replicar la IA.';
  
  renderRoadmapProgress(0);
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

/* --- NONI IA - GEMINI ENGINE --- */
async function getNoniResponse(userQuery, systemPrompt = "Eres Noni, un barista experto.") {
  const apiKey = localStorage.getItem('gemini_api_key');
  if (!apiKey) {
    throw new Error("API_KEY_MISSING");
  }
  
  const model = "gemini-2.5-flash";
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const payload = {
    contents: [{ parts: [{ text: userQuery }] }],
    systemInstruction: { parts: [{ text: systemPrompt }] }
  };

  let retries = 0;
  const maxRetries = 2;
  const delay = (ms) => new Promise(res => setTimeout(res, ms));

  while (retries < maxRetries) {
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`HTTP ${response.status}: ${errText}`);
      }
      
      const data = await response.json();
      const aiText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      
      if (!aiText) throw new Error("Respuesta vacía de la API");
      return aiText;
    } catch (error) {
      retries++;
      if (retries === maxRetries) {
        console.error("Error Noni IA:", error);
        throw error;
      }
      await delay(Math.pow(2, retries - 1) * 1000);
    }
  }
}

// UI Setup For Settings and Noni Chat Drawer
function setupNoniAndSettings() {
  const btnSettings = document.getElementById('btn-settings');
  const btnCloseSettings = document.getElementById('btn-close-settings');
  const settingsModal = document.getElementById('settings-modal');
  const formSettings = document.getElementById('form-settings');
  const apiKeyInput = document.getElementById('settings-gemini-key');

  if(btnSettings) {
    btnSettings.addEventListener('click', () => {
      apiKeyInput.value = localStorage.getItem('gemini_api_key') || '';
      settingsModal.classList.remove('hidden');
    });
  }
  
  if(btnCloseSettings) {
    btnCloseSettings.addEventListener('click', () => settingsModal.classList.add('hidden'));
  }

  if(formSettings) {
    formSettings.addEventListener('submit', (e) => {
      e.preventDefault();
      localStorage.setItem('gemini_api_key', apiKeyInput.value.trim());
      settingsModal.classList.add('hidden');
      alert('Ajustes guardados correctamente.');
    });
  }

  // Noni Drawer & FAB Logic
  const noniFab = document.getElementById('noni-fab');
  const noniDrawer = document.getElementById('noni-drawer');
  const closeNoniBtn = document.getElementById('btn-close-noni');

  if(noniFab && noniDrawer) {
    noniFab.addEventListener('click', () => {
      const isOpen = noniDrawer.classList.contains('open');
      if(isOpen) {
        noniDrawer.classList.remove('open');
        noniFab.classList.add('sleeping');
      } else {
        noniDrawer.classList.add('open');
        noniFab.classList.remove('sleeping');
        document.getElementById('noni-input').focus();
      }
    });
  }

  if(closeNoniBtn) {
    closeNoniBtn.addEventListener('click', () => {
      noniDrawer.classList.remove('open');
      noniFab.classList.add('sleeping');
    });
  }

  // Noni Chat Logic
  const formNoni = document.getElementById('form-noni-chat');
  const noniInput = document.getElementById('noni-input');
  const noniChatBox = document.getElementById('noni-chat-box');

  if(formNoni) {
    formNoni.addEventListener('submit', async (e) => {
      e.preventDefault();
      const query = noniInput.value.trim();
      if(!query) return;

      // Ensure API key
      if(!localStorage.getItem('gemini_api_key')) {
        alert("¡Guau! Necesito que configures mi llave de Gemini (API Key) en los ajustes ⚙️ para tener cerebro.");
        return;
      }

      // Append User message
      const userBubble = document.createElement('div');
      userBubble.style.cssText = "align-self: flex-end; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); padding: 10px 14px; border-radius: 12px 12px 0 12px; max-width: 85%; font-size: 0.9rem;";
      userBubble.textContent = query;
      noniChatBox.appendChild(userBubble);
      noniInput.value = '';
      noniChatBox.scrollTop = noniChatBox.scrollHeight;

      // Append Noni Loading
      const typingBubble = document.createElement('div');
      typingBubble.style.cssText = "align-self: flex-start; background: rgba(106, 191, 99, 0.1); border: 1px solid rgba(106, 191, 99, 0.3); padding: 10px 14px; border-radius: 12px 12px 12px 0; max-width: 85%; font-size: 0.9rem; color: var(--color-text-secondary);";
      typingBubble.innerHTML = `<strong style="color: var(--color-success); display: block; margin-bottom: 4px; font-size: 0.8rem;">Noni</strong>Pensando... 🐾`;
      noniChatBox.appendChild(typingBubble);
      noniChatBox.scrollTop = noniChatBox.scrollHeight;

      // Build context
      const recentTastings = tastings.slice(-3).map(t => {
        const ext = extractions.find(ex => ex.id === t.extractionId);
        return ext ? `Tomó ${t.varietal} en ${ext.method} con molienda ${ext.grindSize}, calificado ${t.rating} estrellas.` : '';
      }).filter(Boolean).join(" ");
      const systemContext = `Eres Noni, una inteligente y tierna mascota virtual experta en café. Usas expresiones tiernas de modo suave (¡Miau!, 🐾). Eres también experta barista mundial en Espresso, vaporización de leche, ratios de Moka Pot y herramientas avanzadas (WDT). Respalda tus recomendaciones con ciencia y pasión. El usuario usa la app 'Origen 90 Coffee Diary'. Contexto reciente de sus cafés: ${recentTastings || "Ninguno."}\nREGLA ESTRICTA: Si el usuario te pide una receta, siempre genera al final EXACTAMENTE este bloque de código JSON (inventa los parámetros cronológicamente). El array "steps" es SOLO para preparaciones PREVIAS al cronómetro (hervir agua, moler, lavar filtro, preparar disco de espresso). El array "stages" DEBE contener TODOS los pasos interactivos dentro del cronómetro divididos en milisegundos, ya sea de tipo "timer" o "action". IMPORTANTE: En "method", si es un mocktail, cold brew compuesto o latte, usa EXACTAMENTE "Bebida Preparada". Si es Espresso, usa "Espresso": \`\`\`json\n{"method": "Espresso", "coffeeWeight": 18, "waterWeight": 36, "grindSize": 8, "timeFormatted": "00:30.0", "notes": "Textura sedosa.", "steps": ["1. Nivelar café", "2. Tamp"], "stages": [{ "type": "timer", "timeMs": 0, "timeFormatted": "00:00.0", "note": "Encender Bomba", "waterTarget": 0 }, { "type": "action", "timeMs": 30000, "timeFormatted": "00:30.0", "note": "Apagar a los 36g", "waterTarget": 36 } ]}\n\`\`\` No incluyas JSON si hace preguntas generales.`;

      try {
        const responseText = await getNoniResponse(query, systemContext);
        
        // Extract JSON using robust Regex for markdown codeblocks
        const jsonMatch = responseText.match(/```(?:json)?\s*(\{[\s\S]*?\})\s*```/i);
        let visibleText = responseText;
        let saveButtonHtml = "";

        if (jsonMatch && jsonMatch[1]) {
          visibleText = responseText.replace(jsonMatch[0], '').trim();
          
          const suggestionId = 'rec_' + Date.now();
          window.noniSuggestions = window.noniSuggestions || {};
          window.noniSuggestions[suggestionId] = jsonMatch[1];
          
          saveButtonHtml = `
            <button onclick="window.saveNoniRecipe('${suggestionId}')" style="margin-top: 12px; width: 100%; padding: 8px; background: rgba(106, 191, 99, 0.1); border: 1px solid var(--color-success); color: var(--color-success); border-radius: 8px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; font-weight: 500; transition: all 0.2s;">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M15,9H5V5H15M12,19A3,3 0 0,1 9,16A3,3 0 0,1 12,13A3,3 0 0,1 15,16A3,3 0 0,1 12,19M17,3H5C3.89,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V7L17,3Z"/></svg>
              Guardar en Recetario
            </button>
          `;
        }

        typingBubble.innerHTML = `<strong style="color: var(--color-success); display: block; margin-bottom: 4px; font-size: 0.8rem;">Noni</strong>${visibleText}${saveButtonHtml}`;
      } catch (e) {
        if (e.message === "API_KEY_MISSING") {
          typingBubble.innerHTML = `<strong style="color: var(--color-danger); display: block; margin-bottom: 4px; font-size: 0.8rem;">Error</strong>Falta la API Key en ajustes.`;
        } else if (e.message.includes("503")) {
          typingBubble.innerHTML = `<strong style="color: var(--color-warning); display: block; margin-bottom: 4px; font-size: 0.8rem;">Noni cansada 💤</strong>¡Guau! Hay mucha fila en la cafetería mundial ahora mismo (El cerebro de IA está saturado).<br><br><span style="font-size: 0.7rem; color: var(--color-text-secondary);">El servidor de Google reporta alta demanda. Intenta preguntarme en un par de minutos. 🐾</span>`;
        } else {
          typingBubble.innerHTML = `<strong style="color: var(--color-danger); display: block; margin-bottom: 4px; font-size: 0.8rem;">Error del Servidor</strong>${e.message}<br><br><span style="font-size: 0.7rem; color: var(--color-text-secondary);">Guau... revisa que tu llave no tenga espacios.</span>`;
        }
      }
      noniChatBox.scrollTop = noniChatBox.scrollHeight;
    });
  }
}

// Global hook for the injected button
window.saveNoniRecipe = async function(suggestionId) {
  if (!window.noniSuggestions || !window.noniSuggestions[suggestionId]) return;
  const jsonString = window.noniSuggestions[suggestionId];
  try {
    const rawData = JSON.parse(jsonString);
    const dateStr = new Date().toISOString();
    const newExt = {
      id: Date.now().toString(),
      date: dateStr,
      method: rawData.method || "Desconocido",
      grindSize: rawData.grindSize || 0,
      coffeeWeight: rawData.coffeeWeight || 0,
      waterWeight: rawData.waterWeight || 0,
      ratio: rawData.coffeeWeight > 0 ? (rawData.waterWeight / rawData.coffeeWeight).toFixed(1) : 0,
      timeFormatted: rawData.timeFormatted || "00:00.0",
      timeMs: 0,
      notes: rawData.notes || "Receta sugerida por la mascota Noni.",
      isFavorite: false,
      isFromNoni: true,
      steps: rawData.steps || [],
      pourStages: (rawData.stages || []).map(s => {
        if (s.timeFormatted) return s;
        const ms = s.timeMs || 0;
        const mins = Math.floor(ms / 60000).toString().padStart(2, '0');
        const secs = Math.floor((ms % 60000) / 1000).toString().padStart(2, '0');
        return { ...s, timeFormatted: `${mins}:${secs}.0` };
      })
    };
    await db.collection("extractions").add(newExt);
    alert('¡Receta guardada en tu Recetario!');
    
    // Auto-close Noni UI after saving
    const drawer = document.getElementById('noni-drawer');
    const fab = document.getElementById('noni-fab');
    if (drawer) drawer.classList.remove('open');
    if (fab) fab.classList.add('sleeping');
    
  } catch(e) {
    console.error("Error saving Noni recipe:", e);
    alert("Error al guardar la receta. Puede que el código de Noni haya estado corrupto.");
  }
};

window.rateRecipe = function(recipeId) {
  // Switch to Cata tab
  const cataTab = document.querySelector('.nav-item[data-target="view-cata"]');
  if (cataTab) cataTab.click();
  
  // Set the dropdown to the specific recipe
  setTimeout(() => {
    const select = document.getElementById('extraction-select');
    if (select) {
      select.value = recipeId;
      // Trigger change event to populate fields if needed
      select.dispatchEvent(new Event('change'));
      
      // Auto-focus sliders
      const slider = document.getElementById('metric-sweetness');
      if (slider) slider.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, 100);
};

// --- ALACENA VIRTUAL / PANTRY BACKEND ---

function setupPantryForm() {
  const formPantry = document.getElementById('form-pantry');
  if(!formPantry) return;
  formPantry.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = formPantry.querySelector('button');
    btn.disabled = true;
    
    const initialW = parseFloat(document.getElementById('pantry-weight').value);
    const newBag = {
      id: Date.now().toString(),
      roaster: document.getElementById('pantry-roaster').value,
      name: document.getElementById('pantry-name').value,
      origin: document.getElementById('pantry-origin').value,
      varietal: document.getElementById('pantry-varietal').value,
      process: document.getElementById('pantry-process').value,
      roastDate: document.getElementById('pantry-roast-date').value,
      initialWeight: initialW,
      currentWeight: initialW,
      addedDate: new Date().toISOString()
    };
    
    try {
      await db.collection('pantry').add(newBag);
      formPantry.reset();
      alert('¡Café añadido a tu Alacena Virtual!');
    } catch(err) {
      console.error(err);
      alert('Error guardando en la alacena');
    } finally {
      btn.disabled = false;
    }
  });

  // Origin flag live preview
  const originInput = document.getElementById('pantry-origin');
  const originFlag  = document.getElementById('pantry-origin-flag');
  if (originInput && originFlag) {
    originInput.addEventListener('input', () => {
      const flag = countryToFlag(originInput.value);
      if (flag && flag !== '☕') {
        originFlag.textContent = flag;
        originFlag.classList.add('visible');
      } else {
        originFlag.classList.remove('visible');
      }
    });
  }
}

/* ============================================
   FASE 5 — Alacena Visual Helpers
   ============================================ */

function computeFreshness(roastDateStr) {
  if (!roastDateStr) return { level: 'unknown', label: 'Tueste sin fecha', days: null };
  const roast = new Date(roastDateStr);
  if (isNaN(roast.getTime())) return { level: 'unknown', label: 'Fecha inválida', days: null };
  const days = Math.floor((Date.now() - roast.getTime()) / (1000 * 60 * 60 * 24));
  if (days < 5)  return { level: 'fresh', label: `Reposando · ${days}d`, days };
  if (days <= 14) return { level: 'fresh', label: `En su punto · ${days}d`, days };
  if (days <= 30) return { level: 'ok',    label: `Aún bueno · ${days}d`, days };
  if (days <= 60) return { level: 'aging', label: `Decayendo · ${days}d`, days };
  return { level: 'aging', label: `Viejo · ${days}d`, days };
}

function escapeHtml(str) {
  if (str === null || str === undefined) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

const COUNTRY_FLAGS = {
  'guatemala': '🇬🇹', 'colombia': '🇨🇴', 'etiopía': '🇪🇹', 'etiopia': '🇪🇹',
  'kenia': '🇰🇪', 'kenya': '🇰🇪', 'brasil': '🇧🇷', 'brazil': '🇧🇷',
  'costa rica': '🇨🇷', 'panamá': '🇵🇦', 'panama': '🇵🇦',
  'honduras': '🇭🇳', 'el salvador': '🇸🇻', 'nicaragua': '🇳🇮',
  'méxico': '🇲🇽', 'mexico': '🇲🇽', 'perú': '🇵🇪', 'peru': '🇵🇪',
  'bolivia': '🇧🇴', 'ecuador': '🇪🇨', 'rwanda': '🇷🇼', 'ruanda': '🇷🇼',
  'burundi': '🇧🇮', 'tanzania': '🇹🇿', 'uganda': '🇺🇬',
  'yemen': '🇾🇪', 'indonesia': '🇮🇩', 'india': '🇮🇳',
  'vietnam': '🇻🇳', 'jamaica': '🇯🇲', 'república dominicana': '🇩🇴',
  'rep. dominicana': '🇩🇴', 'cuba': '🇨🇺', 'puerto rico': '🇵🇷',
  'haití': '🇭🇹', 'haiti': '🇭🇹', 'china': '🇨🇳', 'tailandia': '🇹🇭',
  'filipinas': '🇵🇭', 'papúa nueva guinea': '🇵🇬', 'papua nueva guinea': '🇵🇬',
  'venezuela': '🇻🇪'
};

function countryToFlag(originStr) {
  if (!originStr) return '☕';
  const country = resolveOriginToCountry(originStr);
  if (!country) return '☕';
  // Normalizar el nombre del país a la clave del diccionario de banderas
  const flagKey = country.toLowerCase();
  return COUNTRY_FLAGS[flagKey] || '☕';
}

function renderAlacenaStats() {
  const active = pantry.filter(p => p.currentWeight > 0);
  const totalGrams = active.reduce((s, p) => s + (parseFloat(p.currentWeight) || 0), 0);
  const origins = new Set(active.map(p => p.origin).filter(Boolean));
  const elActive  = document.getElementById('alacena-stat-active');
  const elGrams   = document.getElementById('alacena-stat-grams');
  const elOrigins = document.getElementById('alacena-stat-origins');
  if (elActive)  animateCount(elActive,  active.length);
  if (elGrams)   animateCount(elGrams,   Math.round(totalGrams));
  if (elOrigins) animateCount(elOrigins, origins.size);
}

function setupPantryTilt(container) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  if (window.matchMedia('(hover: none)').matches) return;
  const cards = container.querySelectorAll('.pantry-card.tiltable');
  cards.forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const rotY = ((x - rect.width / 2) / (rect.width / 2)) * 5;
      const rotX = -((y - rect.height / 2) / (rect.height / 2)) * 5;
      card.style.setProperty('--tilt-x', `${rotX.toFixed(2)}deg`);
      card.style.setProperty('--tilt-y', `${rotY.toFixed(2)}deg`);
      card.style.setProperty('--mouse-x', `${x}px`);
      card.style.setProperty('--mouse-y', `${y}px`);
    });
    card.addEventListener('mouseleave', () => {
      card.style.setProperty('--tilt-x', '0deg');
      card.style.setProperty('--tilt-y', '0deg');
    });
  });
}

const COFFEE_COUNTRIES = {
  'México': {
    name: 'México',
    d: 'M 349,319 L 358,328 L 383,326 L 399,326 L 408,323 L 419,333 L 432,334 L 439,334 L 450,347 L 459,356 L 460,357 L 461,367 L 458,378 L 469,396 L 476,400 L 488,397 L 496,401 L 494,406 L 495,411 L 488,419 L 488,419 L 472,411 L 447,407 L 419,396 L 406,382 L 389,371 L 375,358 L 364,346 L 356,333 L 349,319 Z'
  },
  'Guatemala': {
    name: 'Guatemala',
    d: 'M 488,419 L 489,418 L 492,414 L 493,411 L 497,411 L 500,411 L 504,412 L 506,414 L 508,413 L 509,415 L 506,419 L 503,422 L 500,424 L 494,423 L 489,421 L 488,419 Z'
  },
  'Honduras': {
    name: 'Honduras',
    d: 'M 504,417 L 508,413 L 514,412 L 522,411 L 528,412 L 538,417 L 536,418 L 531,419 L 525,424 L 518,426 L 514,428 L 512,426 L 506,421 L 504,417 Z'
  },
  'El Salvador': {
    name: 'El Salvador',
    d: 'M 500,422 L 503,420 L 508,423 L 513,426 L 512,427 L 506,427 L 502,426 L 500,424 L 500,422 Z'
  },
  'Nicaragua': {
    name: 'Nicaragua',
    d: 'M 514,428 L 518,426 L 524,424 L 531,419 L 536,418 L 538,422 L 536,431 L 535,439 L 524,439 L 519,434 L 514,430 L 514,428 Z'
  },
  'Costa Rica': {
    name: 'Costa Rica',
    d: 'M 524,439 L 528,439 L 533,440 L 539,442 L 541,447 L 536,453 L 531,447 L 525,444 L 524,442 L 524,439 Z'
  },
  'Panamá': {
    name: 'Panamá',
    d: 'M 539,447 L 542,447 L 547,451 L 553,450 L 558,449 L 567,449 L 570,453 L 571,456 L 567,458 L 558,460 L 550,458 L 544,454 L 539,450 L 539,447 Z'
  },
  'Cuba': {
    name: 'Cuba',
    d: 'M 528,381 L 533,377 L 542,371 L 547,371 L 553,373 L 569,373 L 581,383 L 586,384 L 588,388 L 572,389 L 564,389 L 553,379 L 542,379 L 528,381 Z'
  },
  'Jamaica': {
    name: 'Jamaica',
    d: 'M 564,397 L 572,397 L 577,400 L 576,402 L 569,402 L 564,400 L 564,397 Z'
  },
  'Haití': {
    name: 'Haití',
    d: 'M 587,389 L 594,389 L 600,391 L 602,394 L 602,398 L 597,399 L 592,399 L 587,398 L 587,389 Z'
  },
  'República Dominicana': {
    name: 'República Dominicana',
    d: 'M 602,389 L 608,389 L 614,391 L 620,397 L 618,399 L 606,398 L 602,394 L 602,389 Z'
  },
  'Puerto Rico': {
    name: 'Puerto Rico',
    d: 'M 626,397 L 633,397 L 636,398 L 636,400 L 627,400 L 626,397 Z'
  },
  'Colombia': {
    name: 'Colombia',
    d: 'M 569,452 L 572,456 L 578,456 L 581,447 L 589,438 L 597,433 L 603,431 L 607,432 L 611,435 L 613,436 L 613,467 L 625,467 L 625,490 L 614,497 L 611,511 L 608,522 L 600,511 L 589,506 L 583,497 L 569,497 L 564,494 L 563,486 L 569,478 L 572,467 L 569,452 Z'
  },
  'Venezuela': {
    name: 'Venezuela',
    d: 'M 597,433 L 606,434 L 614,436 L 622,436 L 631,441 L 642,442 L 656,441 L 663,447 L 667,456 L 658,467 L 647,478 L 644,492 L 633,494 L 625,490 L 625,467 L 613,467 L 613,436 L 611,435 L 597,433 Z'
  },
  'Ecuador': {
    name: 'Ecuador',
    d: 'M 556,494 L 561,494 L 564,492 L 569,497 L 581,500 L 583,508 L 575,514 L 564,519 L 558,514 L 556,508 L 553,500 L 556,494 Z'
  },
  'Perú': {
    name: 'Perú',
    d: 'M 556,517 L 561,519 L 564,519 L 575,514 L 589,506 L 600,511 L 608,522 L 606,539 L 614,550 L 617,561 L 614,575 L 617,586 L 614,597 L 603,597 L 594,592 L 583,589 L 572,575 L 561,544 L 553,533 L 550,528 L 550,522 L 556,517 Z'
  },
  'Bolivia': {
    name: 'Bolivia',
    d: 'M 614,556 L 625,561 L 636,556 L 650,558 L 664,575 L 675,592 L 678,608 L 669,617 L 656,622 L 636,622 L 628,622 L 619,614 L 614,603 L 617,589 L 614,575 L 617,561 L 614,556 Z'
  },
  'Brasil': {
    name: 'Brasil',
    d: 'M 597,556 L 606,539 L 608,522 L 614,506 L 628,497 L 639,494 L 647,489 L 661,475 L 667,472 L 678,475 L 689,489 L 703,489 L 714,478 L 722,494 L 733,506 L 753,514 L 769,516 L 786,521 L 803,531 L 806,544 L 794,558 L 783,575 L 781,594 L 775,614 L 769,625 L 753,628 L 733,642 L 725,658 L 711,678 L 697,686 L 686,669 L 681,658 L 689,653 L 694,642 L 697,631 L 700,614 L 675,608 L 678,592 L 664,575 L 650,558 L 636,556 L 625,561 L 614,556 L 597,556 Z'
  },
  'Etiopía': {
    name: 'Etiopía',
    d: 'M 1183,422 L 1194,406 L 1211,403 L 1231,411 L 1242,433 L 1239,442 L 1253,442 L 1264,456 L 1250,475 L 1228,478 L 1211,478 L 1197,475 L 1192,472 L 1186,458 L 1186,439 L 1183,422 Z'
  },
  'Kenia': {
    name: 'Kenia',
    d: 'M 1188,474 L 1197,472 L 1211,478 L 1228,478 L 1231,489 L 1231,508 L 1222,517 L 1217,525 L 1208,517 L 1192,506 L 1189,494 L 1188,474 Z'
  },
  'Uganda': {
    name: 'Uganda',
    d: 'M 1164,478 L 1172,481 L 1186,481 L 1192,494 L 1186,506 L 1175,506 L 1164,494 L 1164,478 Z'
  },
  'Rwanda': {
    name: 'Rwanda',
    d: 'M 1161,506 L 1167,506 L 1171,506 L 1171,514 L 1164,516 L 1161,514 L 1161,506 Z'
  },
  'Burundi': {
    name: 'Burundi',
    d: 'M 1161,514 L 1169,514 L 1171,519 L 1169,525 L 1161,525 L 1161,514 Z'
  },
  'Tanzania': {
    name: 'Tanzania',
    d: 'M 1164,506 L 1183,506 L 1194,511 L 1208,517 L 1214,528 L 1219,536 L 1222,544 L 1219,558 L 1208,564 L 1192,564 L 1178,553 L 1169,544 L 1161,533 L 1161,525 L 1161,514 L 1164,506 Z'
  },
  'Yemen': {
    name: 'Yemen',
    d: 'M 1239,406 L 1247,403 L 1258,406 L 1272,406 L 1289,394 L 1294,408 L 1289,422 L 1272,428 L 1250,431 L 1242,428 L 1239,419 L 1239,406 Z'
  },
  'India': {
    name: 'India',
    d: 'M 1378,369 L 1386,353 L 1397,342 L 1411,322 L 1433,314 L 1442,319 L 1447,331 L 1467,347 L 1489,350 L 1497,356 L 1511,347 L 1514,358 L 1494,378 L 1483,381 L 1469,392 L 1453,408 L 1444,428 L 1436,447 L 1431,456 L 1422,453 L 1411,433 L 1403,408 L 1403,389 L 1389,386 L 1381,381 L 1378,369 Z'
  },
  'China': {
    name: 'China',
    d: 'M 1539,344 L 1528,339 L 1547,361 L 1561,378 L 1583,378 L 1600,383 L 1617,381 L 1628,375 L 1650,369 L 1672,361 L 1678,333 L 1675,300 L 1683,275 L 1708,269 L 1722,264 L 1744,236 L 1744,206 L 1708,206 L 1672,203 L 1658,225 L 1611,236 L 1597,228 L 1542,214 L 1528,228 L 1486,228 L 1472,239 L 1458,239 L 1444,250 L 1425,272 L 1414,286 L 1411,306 L 1436,319 L 1444,331 L 1467,347 L 1489,350 L 1511,347 L 1539,344 Z'
  },
  'Vietnam': {
    name: 'Vietnam',
    d: 'M 1569,381 L 1575,375 L 1583,375 L 1592,381 L 1600,394 L 1608,428 L 1606,442 L 1589,450 L 1583,447 L 1581,439 L 1583,422 L 1592,408 L 1597,406 L 1594,397 L 1583,394 L 1575,392 L 1569,381 Z'
  },
  'Tailandia': {
    name: 'Tailandia',
    d: 'M 1542,400 L 1550,386 L 1558,386 L 1564,392 L 1569,400 L 1575,403 L 1586,419 L 1581,436 L 1569,431 L 1561,431 L 1561,453 L 1567,464 L 1561,469 L 1556,464 L 1550,458 L 1547,453 L 1544,439 L 1547,419 L 1542,411 L 1542,400 Z'
  },
  'Filipinas': {
    name: 'Filipinas',
    d: 'M 1669,397 L 1678,403 L 1686,425 L 1692,436 L 1694,447 L 1703,458 L 1703,469 L 1692,467 L 1681,461 L 1675,436 L 1667,425 L 1664,408 L 1669,397 Z'
  },
  'Indonesia': {
    name: 'Indonesia',
    d: 'M 1531,469 L 1547,478 L 1569,492 L 1581,506 L 1589,517 L 1631,522 L 1642,547 L 1658,547 L 1689,547 L 1706,547 L 1744,519 L 1778,514 L 1778,544 L 1747,544 L 1725,544 L 1689,558 L 1658,550 L 1636,547 L 1603,544 L 1586,533 L 1569,528 L 1556,514 L 1542,508 L 1533,494 L 1531,469 Z'
  },
  'Papúa Nueva Guinea': {
    name: 'Papúa Nueva Guinea',
    d: 'M 1783,517 L 1794,517 L 1817,511 L 1839,517 L 1861,536 L 1864,558 L 1842,558 L 1817,556 L 1797,550 L 1783,550 L 1783,517 Z'
  }
};


function normalizeText(str) {
  if (!str) return '';
  return str
    .toLowerCase()
    .normalize('NFD')                    // separa tildes
    .replace(/[\u0300-\u036f]/g, '')     // quita tildes
    .replace(/\s+/g, ' ')                // colapsa espacios
    .trim();
}

// Regiones cafetaleras famosas → país padre.
// Cuando el usuario escribe solo la región, mapeamos al país.
const REGION_TO_COUNTRY = {
  // Guatemala
  'atitlan': 'Guatemala',
  'huehuetenango': 'Guatemala',
  'huehue': 'Guatemala',
  'antigua': 'Guatemala',
  'san marcos': 'Guatemala',
  'coban': 'Guatemala',
  'fraijanes': 'Guatemala',
  'acatenango': 'Guatemala',
  'nuevo oriente': 'Guatemala',

  // Colombia
  'huila': 'Colombia',
  'narino': 'Colombia',
  'cauca': 'Colombia',
  'tolima': 'Colombia',
  'antioquia': 'Colombia',
  'caldas': 'Colombia',
  'quindio': 'Colombia',
  'risaralda': 'Colombia',
  'santander': 'Colombia',

  // Etiopía
  'yirgacheffe': 'Etiopía',
  'sidamo': 'Etiopía',
  'sidama': 'Etiopía',
  'guji': 'Etiopía',
  'limu': 'Etiopía',
  'harrar': 'Etiopía',
  'kaffa': 'Etiopía',

  // Kenia
  'nyeri': 'Kenia',
  'kirinyaga': 'Kenia',
  'kiambu': 'Kenia',

  // Costa Rica
  'tarrazu': 'Costa Rica',
  'tres rios': 'Costa Rica',
  'naranjo': 'Costa Rica',
  'dota': 'Costa Rica',

  // Panamá
  'boquete': 'Panamá',
  'volcan': 'Panamá',
  'chiriqui': 'Panamá',

  // Brasil
  'cerrado': 'Brasil',
  'minas gerais': 'Brasil',
  'sul de minas': 'Brasil',
  'mogiana': 'Brasil',
  'bahia': 'Brasil',
  'espirito santo': 'Brasil',

  // Honduras
  'marcala': 'Honduras',
  'copan': 'Honduras',
  'santa barbara': 'Honduras',

  // El Salvador
  'apaneca': 'El Salvador',
  'ilamatepec': 'El Salvador',

  // México
  'chiapas': 'México',
  'oaxaca': 'México',
  'veracruz': 'México',

  // Perú
  'amazonas peru': 'Perú',
  'amazonas': 'Perú',
  'cajamarca': 'Perú',
  'puno': 'Perú',
  'cusco': 'Perú',
  'junin': 'Perú',
  'chanchamayo': 'Perú',

  // Nicaragua
  'jinotega': 'Nicaragua',
  'matagalpa': 'Nicaragua',
  'segovia': 'Nicaragua',
  'nueva segovia': 'Nicaragua',

  // Yemen
  'mocha': 'Yemen',
  'haraz': 'Yemen',
  'ismaili': 'Yemen',

  // Indonesia
  'sumatra': 'Indonesia',
  'mandheling': 'Indonesia',
  'gayo': 'Indonesia',
  'java': 'Indonesia',
  'bali': 'Indonesia',
  'flores': 'Indonesia',
  'sulawesi': 'Indonesia',
  'toraja': 'Indonesia',

  // Rwanda
  'huye': 'Rwanda',
  'nyamasheke': 'Rwanda',

  // India
  'monsoon malabar': 'India',
  'mysore': 'India',
  'karnataka': 'India',

  // Ecuador
  'loja': 'Ecuador',
  'pichincha': 'Ecuador',

  // Bolivia
  'caranavi': 'Bolivia',
  'yungas': 'Bolivia',

  // Venezuela
  'tachira': 'Venezuela',
  'merida': 'Venezuela'
};

function resolveOriginToCountry(originStr) {
  if (!originStr) return null;
  const normalized = normalizeText(originStr);
  if (!normalized) return null;

  // 1. ¿Coincide directo con un país del diccionario?
  for (const key of Object.keys(COFFEE_COUNTRIES)) {
    const normKey = normalizeText(key);
    if (normalized === normKey) return key;
  }

  // 2. ¿El string contiene un nombre de país?
  for (const key of Object.keys(COFFEE_COUNTRIES)) {
    const normKey = normalizeText(key);
    // Buscar como palabra completa (con bordes de palabra)
    const regex = new RegExp(`\\b${normKey}\\b`);
    if (regex.test(normalized)) return key;
  }

  // 3. ¿Es una región famosa que mapea a un país?
  for (const region of Object.keys(REGION_TO_COUNTRY)) {
    const regex = new RegExp(`\\b${region}\\b`);
    if (regex.test(normalized)) return REGION_TO_COUNTRY[region];
  }

  // 4. Match parcial sólo como último recurso (sin word boundaries).
  //    Útil para casos como "guate" o "etiop"
  const aliases = {
    'guate': 'Guatemala',
    'etiop': 'Etiopía',
    'colomb': 'Colombia',
    'bras': 'Brasil',
    'mex': 'México',
    'panam': 'Panamá',
    'salvador': 'El Salvador',
    'rica': 'Costa Rica',
    'rwand': 'Rwanda',
    'ruand': 'Rwanda',
    'kenya': 'Kenia',
    'keny': 'Kenia',
    'yemen': 'Yemen',
    'peru': 'Perú',
    'bolivi': 'Bolivia',
    'ecuador': 'Ecuador',
    'jamaic': 'Jamaica',
    'cuba': 'Cuba',
    'haiti': 'Haití',
    'india': 'India',
    'china': 'China',
    'indonesi': 'Indonesia',
    'vietnam': 'Vietnam',
    'tailand': 'Tailandia',
    'filipin': 'Filipinas',
    'nicaragua': 'Nicaragua',
    'honduras': 'Honduras',
    'tanzan': 'Tanzania',
    'uganda': 'Uganda',
    'burundi': 'Burundi',
    'venezuel': 'Venezuela',
    'puerto rico': 'Puerto Rico',
    'dominican': 'República Dominicana',
    'papua': 'Papúa Nueva Guinea'
  };
  for (const alias of Object.keys(aliases)) {
    if (normalized.includes(alias)) return aliases[alias];
  }

  return null;
}

function renderOriginsMap() {
  const svg = document.getElementById('origins-map');
  const counter = document.getElementById('origins-map-counter');
  if (!svg) return;

  const countByCountry = {};
  const unmatched = [];
  pantry.forEach(p => {
    if (!p.origin) return;
    const matched = resolveOriginToCountry(p.origin);
    if (matched) {
      countByCountry[matched] = (countByCountry[matched] || 0) + 1;
    } else {
      unmatched.push(p.origin);
    }
  });

  if (unmatched.length > 0) {
    console.warn('[Mapa] No se pudo mapear estos orígenes:', unmatched);
  }

  svg.innerHTML = `
  <line x1="0" y1="500" x2="2000" y2="500" stroke="rgba(184,115,51,0.18)" stroke-width="0.8" stroke-dasharray="4 6"/>
  <line x1="0" y1="370" x2="2000" y2="370" stroke="rgba(255,255,255,0.04)" stroke-width="0.5" stroke-dasharray="2 8"/>
  <line x1="0" y1="630" x2="2000" y2="630" stroke="rgba(255,255,255,0.04)" stroke-width="0.5" stroke-dasharray="2 8"/>
`;
  Object.entries(COFFEE_COUNTRIES).forEach(([key, info]) => {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', info.d);
    path.setAttribute('class', 'country-shape');
    path.dataset.country = key;
    path.dataset.name = info.name;
    const count = countByCountry[key] || 0;
    if (count > 0) { path.classList.add('active'); path.dataset.count = count; }
    svg.appendChild(path);
  });

  setupOriginsMapTooltip();
  if (counter) {
    const activeCount = Object.keys(countByCountry).length;
    counter.textContent = `${activeCount} ${activeCount === 1 ? 'país' : 'países'}`;
  }
}

function setupOriginsMapTooltip() {
  const tooltip = document.getElementById('origins-map-tooltip');
  const svg = document.getElementById('origins-map');
  if (!tooltip || !svg) return;

  const showTip = (e, target) => {
    if (!target.classList.contains('active')) return;
    const name = target.dataset.name;
    const count = parseInt(target.dataset.count) || 0;
    tooltip.innerHTML = `<strong>${name}</strong>${count} ${count === 1 ? 'bolsa' : 'bolsas'} en alacena`;
    tooltip.classList.add('visible');
    const x = (e.clientX || (e.touches && e.touches[0] && e.touches[0].clientX) || 0);
    const y = (e.clientY || (e.touches && e.touches[0] && e.touches[0].clientY) || 0);
    const tipW = tooltip.offsetWidth;
    let left = x - tipW / 2;
    if (left < 8) left = 8;
    if (left + tipW > window.innerWidth - 8) left = window.innerWidth - tipW - 8;
    tooltip.style.left = left + 'px';
    tooltip.style.top = (y - tooltip.offsetHeight - 12) + 'px';
  };

  svg.addEventListener('mousemove', (e) => {
    const target = e.target.closest('.country-shape');
    if (target) showTip(e, target); else tooltip.classList.remove('visible');
  });
  svg.addEventListener('mouseleave', () => tooltip.classList.remove('visible'));
  svg.addEventListener('touchstart', (e) => {
    const target = e.target.closest('.country-shape');
    if (target) { showTip(e, target); setTimeout(() => tooltip.classList.remove('visible'), 1800); }
  }, { passive: true });
};


window.renderPantry = function() {
  const container = document.getElementById('pantry-list');
  if (!container) return;
  container.innerHTML = '';

  const activeBags = pantry.filter(p => p.currentWeight > 0);
  const emptyBags  = pantry.filter(p => p.currentWeight <= 0);

  if (pantry.length === 0) {
    container.innerHTML = `
      <div class="pantry-empty">
        <div class="pantry-empty-icon">🫙</div>
        <div class="pantry-empty-title">Tu alacena está vacía</div>
        <div class="pantry-empty-subtitle">Añade tu primera bolsa de café arriba.</div>
      </div>`;
    renderAlacenaStats();
    renderOriginsMap();
    return;
  }

  function renderBag(bag, isEmpty) {
    const card = document.createElement('div');
    card.className = `pantry-card tiltable${isEmpty ? ' empty' : ''}`;
    if (bag.firebaseId) card.dataset.id = bag.firebaseId;

    const freshness = computeFreshness(bag.roastDate);
    const pct = Math.max(0, Math.min(100, (bag.currentWeight / bag.initialWeight) * 100));
    const radius = 33;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (pct / 100) * circumference;
    const flag = countryToFlag(bag.origin);

    card.innerHTML = `
      <div class="pantry-card-shine"></div>
      <div class="pantry-card-context-menu">
        <div class="context-menu-container">
          <button class="context-menu-btn" onclick="this.nextElementSibling.classList.toggle('active')">⋮</button>
          <div class="context-menu-dropdown">
            <button class="context-menu-item" onclick="window.openEditPantryModal('${bag.firebaseId}')">✏️ Editar</button>
            <button class="context-menu-item danger" onclick="window.deletePantryBag('${bag.firebaseId}')">🗑️ Eliminar</button>
          </div>
        </div>
      </div>
      <div class="pantry-card-header">
        <div class="pantry-card-title-block">
          <div class="pantry-card-name">${escapeHtml(bag.name || 'Sin nombre')}</div>
          <div class="pantry-card-roaster">${escapeHtml(bag.roaster || '—')}</div>
          <span class="freshness-badge" data-level="${freshness.level}">
            <span class="freshness-dot"></span>
            ${freshness.label}
          </span>
        </div>
        <div class="pantry-card-ring" title="${pct.toFixed(0)}% restante">
          <svg viewBox="0 0 78 78">
            <circle class="pantry-ring-bg" cx="39" cy="39" r="${radius}"/>
            <circle class="pantry-ring-fg" cx="39" cy="39" r="${radius}"
              stroke-dasharray="${circumference.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"/>
          </svg>
          <div class="pantry-ring-text">
            <div class="pantry-ring-grams">${Math.round(bag.currentWeight)}g</div>
            <div class="pantry-ring-total">/ ${Math.round(bag.initialWeight)}g</div>
          </div>
        </div>
      </div>
      <div class="pantry-card-meta">
        ${bag.origin   ? `<span class="pantry-meta-pill"><span class="meta-flag">${flag}</span>${escapeHtml(bag.origin)}</span>` : ''}
        ${bag.varietal ? `<span class="pantry-meta-pill">${escapeHtml(bag.varietal)}</span>` : ''}
        ${bag.process  ? `<span class="pantry-meta-pill">${escapeHtml(bag.process)}</span>`  : ''}
      </div>
    `;
    return card;
  }

  activeBags.forEach(b => container.appendChild(renderBag(b, false)));

  if (emptyBags.length > 0) {
    const divider = document.createElement('div');
    divider.className = 'pantry-divider';
    divider.textContent = `Histórico (${emptyBags.length} vacías)`;
    container.appendChild(divider);
    emptyBags.forEach(b => container.appendChild(renderBag(b, true)));
  }

  setupPantryTilt(container);
  renderAlacenaStats();
  renderOriginsMap();
};

window.updatePantryDropdown = function() {
  const selectExt = document.getElementById('ext-pantry-id');
  const selectCata = document.getElementById('cata-pantry-id');
  
  const activeBags = pantry.filter(p => p.currentWeight > 0);
  
  if (selectExt) {
    const oldValueExt = selectExt.value;
    selectExt.innerHTML = '<option value="">Usar café general (No descontar)</option>';
    activeBags.forEach(bag => {
      const opt = document.createElement('option');
      opt.value = bag.firebaseId;
      opt.textContent = `${bag.name} - ${bag.roaster} (${bag.currentWeight.toFixed(1)}g)`;
      selectExt.appendChild(opt);
    });
    if (activeBags.some(b => b.firebaseId === oldValueExt)) {
      selectExt.value = oldValueExt;
    }
  }

  if (selectCata) {
    const oldValueCata = selectCata.value;
    selectCata.innerHTML = '<option value="">Otro grano (Ingreso manual)</option>';
    pantry.forEach(bag => {
      const opt = document.createElement('option');
      opt.value = bag.firebaseId;
      opt.textContent = `${bag.name} - ${bag.roaster}`;
      selectCata.appendChild(opt);
    });
    if (pantry.some(b => b.firebaseId === oldValueCata)) {
      selectCata.value = oldValueCata;
    }
  }
};

window.openEditPantryModal = function(id) {
  const bag = pantry.find(p => p.firebaseId === id);
  if (!bag) return;

  document.getElementById('edit-pantry-id').value = bag.firebaseId;
  document.getElementById('edit-pantry-roaster').value = bag.roaster || '';
  document.getElementById('edit-pantry-name').value = bag.name || '';
  document.getElementById('edit-pantry-varietal').value = bag.varietal || '';
  document.getElementById('edit-pantry-origin').value = bag.origin || '';
  
  const processSelect = document.getElementById('edit-pantry-process');
  let processOptionExists = Array.from(processSelect.options).some(o => o.value === bag.process);
  if (!processOptionExists && bag.process) {
    const newOption = new Option(bag.process, bag.process);
    processSelect.add(newOption);
  }
  processSelect.value = bag.process || 'Lavado';
  
  document.getElementById('edit-pantry-weight').value = bag.currentWeight;

  document.getElementById('edit-pantry-modal').classList.remove('hidden');
};

window.deletePantryBag = async function(id) {
  const confirmDel = confirm("¿Estás seguro de que deseas eliminar esta bolsa de café de la Alacena?");
  if (confirmDel) {
    try {
      await db.collection("pantry").doc(id).delete();
    } catch(e) {
      alert("Error al eliminar la bolsa.");
    }
  }
};

// Start app
setupNoniAndSettings();
init();

// Global Context Menu click handler
document.addEventListener('click', (e) => {
  const isMenuBtn = e.target.closest('.context-menu-btn');
  if (!isMenuBtn) {
    document.querySelectorAll('.context-menu-dropdown.active').forEach(menu => {
      menu.classList.remove('active');
    });
  }
});
