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
const scaData = [
  { category: 'Floral', color: '#eabae8', flavors: ['Manzanilla', 'Rosa', 'Jazmín'] },
  { category: 'Frutal', color: '#e04c5e', flavors: ['Mora', 'Fresa', 'Frambuesa', 'Arándano', 'Uva', 'Manzana', 'Melocotón', 'Pera', 'Naranja', 'Limón', 'Toronja'] },
  { category: 'Ácido / Fermentado', color: '#e4cc4a', flavors: ['Vino', 'Agrío', 'Acético', 'Cítrico'] },
  { category: 'Verde / Vegetal', color: '#6abf63', flavors: ['Aceite de oliva', 'Crudo', 'Verde', 'Hierba'] },
  { category: 'Tostado', color: '#c5523f', flavors: ['Pipa', 'Tabaco', 'Quemado', 'Cereal', 'Ahumado'] },
  { category: 'Especias', color: '#c43343', flavors: ['Pimienta', 'Clavo', 'Canela', 'Nuez Moscada', 'Anís'] },
  { category: 'Nuez / Cacao', color: '#ab7045', flavors: ['Almendra', 'Avellana', 'Cacahuete', 'Nuez', 'Chocolate Negro', 'Chocolate con Leche'] },
  { category: 'Dulce', color: '#dc7a3e', flavors: ['Vainilla', 'Melaza', 'Miel', 'Caramelo', 'Azúcar Moreno'] },
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
let selectedIngredients = [];

function setupInspirationFilters() {
  const container = document.getElementById('ingredient-chips');
  container.innerHTML = '';
  // Get unique ingredients from all recipes
  const allReqs = espressoRecipes.flatMap(r => r.req);
  const uniqueReqs = [...new Set(allReqs)].sort();

  // Define categories
  const categories = {
    "Básicos y Lácteos": ["Hielo", "Leche", "Leche de almendra", "Leche de avena", "Cold brew", "Agua Tónica"],
    "Jarabes y Salsas": ["Jarabe de chocolate", "Jarabe de vainilla", "Jarabe de caramelo", "Jarabe de almendra tostada", "Jarabe de menta", "Jarabe de lavanda", "Jarabe simple", "Leche condensada", "Miel", "Crema de pistache"],
    "Polvos y Especias": ["Cacao", "Canela", "Matcha en polvo", "Chai (polvo o concentrado)", "Piloncillo (o panela)"],
    "Extras y Toppings": ["Naranja", "Helado de vainilla", "Chispas de chocolate", "Azúcar morena", "Mazapán de cacahuate", "Clavo (opcional)"]
  };

  // Render by category
  for (const [catName, catItems] of Object.entries(categories)) {
    // Find which items in this category are actually used in our active recipes
    const activeItems = catItems.filter(item => uniqueReqs.includes(item));
    if (activeItems.length === 0) continue;

    const catGroup = document.createElement('div');
    catGroup.style.cssText = 'width: 100%; margin-bottom: 12px;';
    
    const catTitle = document.createElement('div');
    catTitle.style.cssText = 'font-size: 0.75rem; color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 1px; margin-bottom: 8px; font-weight: 500;';
    catTitle.textContent = catName;
    catGroup.appendChild(catTitle);

    const chipsWrapper = document.createElement('div');
    chipsWrapper.style.cssText = 'display: flex; flex-wrap: wrap; gap: 8px;';

    activeItems.forEach(ing => {
      const chip = document.createElement('div');
      chip.className = 'ingredient-chip';
      chip.textContent = ing;
      chip.addEventListener('click', () => {
        chip.classList.toggle('active');
        if (chip.classList.contains('active')) {
          selectedIngredients.push(ing);
        } else {
          selectedIngredients = selectedIngredients.filter(i => i !== ing);
        }
        filterAndRenderRecipes();
      });
      chipsWrapper.appendChild(chip);
    });

    catGroup.appendChild(chipsWrapper);
    container.appendChild(catGroup);
  }
}

async function renderInspiration() {
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

  // Initial render of all recipes
  filterAndRenderRecipes();

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
  titleEl.textContent = "Noni está inventando algo...";
  descEl.textContent = "Buscando inspiración en los granos ✨🐾";
  reqContainer.innerHTML = '';
  stepsContainer.innerHTML = '';

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
  suggesterBox.classList.add('hidden'); // Hide by default

  if (!tastings || tastings.length === 0) return;

  // 1. Find the highest rated varietals
  const highlyRated = tastings.filter(t => t.rating >= 4 && t.varietal);
  
  // If no highly rated ones, look at recent ones
  const beansToAnalyze = highlyRated.length > 0 ? highlyRated : tastings.filter(t => t.varietal);

  if (beansToAnalyze.length === 0) return;

  // Sort by newest first
  beansToAnalyze.sort((a, b) => b.id - a.id);

  // Take the most recent highly-rated bean
  const targetBean = beansToAnalyze[0];
  
  // Clean varietal string for matching (remove parens extra data)
  let cleanVarietal = targetBean.varietal.split(' (')[0].trim();
  
  // Match with intelligence database
  const recommendation = varietalRecommendations[cleanVarietal];

  if (recommendation) {
    const recipe = masterRecipes.find(r => r.id === recommendation.recipe);
    if (recipe) {
      // Build UI
      suggesterContent.innerHTML = `
        <div style="font-size: 0.9rem; color: var(--color-text-primary); margin-bottom: 12px; line-height: 1.4;">
          Hemos notado que has estado catando <strong>${cleanVarietal}</strong> (Origen: ${targetBean.origin}). 
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
  } else {
    // If no specific recommendation but tastings exist, just show the box to allow catalog access
    suggesterContent.innerHTML = `<div style="font-size: 0.9rem; color: var(--color-text-secondary); padding: 10px 0;">Sigue catando diferentes granos para recibir recomendaciones personalizadas. Mientras tanto, explora el Catálogo de Masterclass.</div>`;
    suggesterBox.classList.remove('hidden');
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
    card.style.cssText = 'background: var(--color-bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid rgba(255,255,255,0.05);';
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

function filterAndRenderRecipes() {
  const container = document.getElementById('inspiration-results');
  const countLabel = document.getElementById('recipe-count');
  container.innerHTML = '';

  let filtered = espressoRecipes;
  if (selectedIngredients.length > 0) {
    // Show recipes that can be made with the selected ingredients (recipe reqs must be a subset of selected)
    // Actually, a more forgiving filter: Show recipes that contain AT LEAST ONE of the selected ingredients.
    filtered = espressoRecipes.filter(r => 
      r.req.some(req => selectedIngredients.includes(req))
    );
  }

  countLabel.textContent = `(${filtered.length})`;

  if (filtered.length === 0) {
    container.innerHTML = '<div style="color: var(--color-text-muted); font-size: 0.9rem; padding: 20px; text-align: center;">No encontramos recetas exactas, ¡intenta mezclar otros ingredientes!</div>';
    return;
  }

  filtered.forEach(recipe => {
    const card = document.createElement('div');
    card.style.cssText = 'background: var(--color-bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--color-border);';
    card.innerHTML = `
      <div style="font-weight: 500; font-size: 1.1rem; margin-bottom: 4px; color: var(--color-text-primary);">${recipe.name}</div>
      <div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-bottom: 12px;">${recipe.description}</div>
      <div style="font-size: 0.75rem; color: var(--color-accent); margin-bottom: 8px;">Necesitas: ${recipe.req.join(', ')}</div>
      <div style="font-size: 0.85rem; color: var(--color-text-muted); border-left: 2px solid var(--color-border); padding-left: 10px;">
        ${recipe.steps.map((s, i) => `<div style="margin-bottom: 4px;">${i+1}. ${s}</div>`).join('')}
      </div>
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
  renderSCAFlavors();
  setupForms();
  setupInteractivity();
  setupPantryForm();
  setupInspirationFilters();
  renderInspiration();
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
      // Update active nav
      navItems.forEach(n => n.classList.remove('active'));
      item.classList.add('active');

      // Update header
      headerSubtitle.textContent = item.getAttribute('data-title');

      // Update view
      const targetId = item.getAttribute('data-target');
      views.forEach(view => {
        if (view.id === targetId) {
          view.classList.remove('hidden');
        } else {
          view.classList.add('hidden');
        }
      });
    });
  });
}

// Timer Logic
function setupTimer() {
  btnTimerStart.addEventListener('click', () => {
    if (!isTimerRunning) {
      startTime = Date.now() - elapsedTime;
      timerInterval = setInterval(updateTimerUI, 100);
      isTimerRunning = true;
      btnTimerStart.classList.add('hidden');
      btnTimerLap.classList.remove('hidden'); // Show lap when running
      btnTimerStop.classList.remove('hidden');
      btnTimerReset.classList.add('hidden');
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
    }
  });

  btnTimerStop.addEventListener('click', () => {
    if (isTimerRunning) {
      clearInterval(timerInterval);
      isTimerRunning = false;
      btnTimerStart.classList.remove('hidden');
      btnTimerLap.classList.add('hidden'); // Hide lap when stopped
      btnTimerStop.classList.add('hidden');
      btnTimerReset.classList.remove('hidden');
      btnTimerStart.textContent = 'Resume';
    }
  });

  btnTimerReset.addEventListener('click', () => {
    clearInterval(timerInterval);
    isTimerRunning = false;
    elapsedTime = 0;
    recordedStages = [];
    
    if (timerGuideDisplay) {
      timerGuideDisplay.textContent = '';
      timerGuideDisplay.classList.add('hidden');
    }

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
  timerDisplay.textContent = formatTime(elapsedTime);
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
          repTimerGuideDisplay.textContent = `${nextStageIndex === 0 ? 'Paso actual' : 'Siguiente paso'}: ${stage.note || 'Vertido'} -> ${stage.waterTarget ? stage.waterTarget + 'ml' : '...'}`;
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
          repTimerGuideDisplay.textContent = `Paso actual: ${lastStage.note || 'Vertido'} -> ${lastStage.waterTarget ? lastStage.waterTarget + 'ml' : '...'}`;
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
          <span>${stage.waterTarget ? stage.waterTarget + 'ml' : '-'}</span>
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
    row.style.alignItems = 'center';
    row.style.backgroundColor = 'var(--color-bg)';
    row.style.padding = '8px';
    row.style.borderRadius = 'var(--radius-sm)';
    row.style.border = '1px solid var(--color-border)';

    row.innerHTML = `
      <div style="color: var(--color-accent); font-family: monospace; width: 60px;">${stage.timeFormatted.substring(0, 5)}</div>
      <input type="text" id="note-${stage.id}" value="${stage.note}" style="flex: 2; padding: 6px;" placeholder="Nota (ej. Blooming)">
      <div style="display: flex; align-items: center; gap: 4px; flex: 1;">
        <input type="number" id="water-${stage.id}" style="padding: 6px; width: 100%;" placeholder="150" value="${stage.waterTarget}">
        <span style="color: var(--color-text-muted); font-size: 0.8rem;">ml</span>
      </div>
      <button type="button" class="btn btn-danger" style="padding: 6px;" onclick="window.removeStage('${stage.id}')">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4H15.5L14.5 3H9.5L8.5 4H5V6H19M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19Z"/></svg>
      </button>
    `;

    // Add event listeners to save input changes back to the state array
    const noteInput = row.querySelector(`#note-${stage.id}`);
    const waterInput = row.querySelector(`#water-${stage.id}`);
    
    noteInput.addEventListener('input', (e) => {
      recordedStages[index].note = e.target.value;
    });
    
    waterInput.addEventListener('input', (e) => {
      recordedStages[index].waterTarget = e.target.value;
    });

    pourStagesList.appendChild(row);
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
  formCata.addEventListener('submit', async (e) => {
    e.preventDefault();
    
    const selectedFlavors = Array.from(document.querySelectorAll('.chip.selected')).map(chip => chip.getAttribute('data-value'));
    const rating = document.getElementById('cup-rating').value;

    if (rating === "0") {
      alert("Por favor califica la taza (estrellas).");
      return;
    }

    const submitBtn = formCata.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.textContent = 'Guardando...';

    const baseVarietal = document.getElementById('bean-varietal').value;
    const extraVarietal = document.getElementById('bean-varietal-extra').value.trim();
    const finalVarietal = extraVarietal ? `${baseVarietal} (${extraVarietal})` : baseVarietal;

    const metricsData = {
      sweetness: parseInt(document.getElementById('metric-sweetness').value || 3),
      acidity: parseInt(document.getElementById('metric-acidity').value || 3),
      clarity: parseInt(document.getElementById('metric-clarity').value || 3),
      aftertaste: parseInt(document.getElementById('metric-aftertaste').value || 3)
    };

    const newTasting = {
      id: Date.now().toString(),
      extractionId: document.getElementById('cata-extraction').value,
      origin: document.getElementById('bean-origin').value,
      varietal: finalVarietal,
      process: document.getElementById('bean-process').value,
      roastDate: document.getElementById('roast-date').value,
      flavors: selectedFlavors,
      metrics: metricsData,
      rating: parseInt(rating)
    };

    try {
      await db.collection("tastings").add(newTasting);
      // Reset Form
      formCata.reset();
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      
      const starsReset = document.querySelectorAll('.rating-star');
      starsReset.forEach(s => {
        s.classList.remove('active');
        s.innerHTML = `<svg viewBox="0 0 24 24"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z" fill="currentColor" fill-opacity="0.3"/></svg>`;
      });
      document.getElementById('cup-rating').value = 0;
      
      metrics.forEach(m => document.getElementById(`val-${m}`).textContent = '3');
      alert('Cata guardada exitosamente.');
    } catch (error) {
      console.error("Error guardando cata:", error);
      alert('Hubo un error al guardar la cata.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar Evaluación';
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
}

function updateExtractionDropdown() {
  const select = document.getElementById('cata-extraction');
  select.innerHTML = '<option value="" disabled selected>Selecciona extracción reciente</option>';
  
  // Sort by newest first
  const sortedExtractions = [...extractions].sort((a,b) => b.id - a.id);
  
  sortedExtractions.forEach(ext => {
    // Check if already tasted
    const isTasted = tastings.some(t => t.extractionId === ext.id);
    if (!isTasted) {
      const dateStr = new Date(ext.date).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' });
      const option = document.createElement('option');
      option.value = ext.id;
      option.textContent = `${ext.method} - ${dateStr} (${ext.coffeeWeight}g / ${ext.waterWeight}ml)`;
      select.appendChild(option);
    }
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

function renderSCAFlavors() {
  const container = document.getElementById('sca-flavors-container');
  container.innerHTML = '';

  scaData.forEach(group => {
    const groupDiv = document.createElement('div');
    groupDiv.className = 'flavor-category';
    
    const title = document.createElement('div');
    title.className = 'flavor-category-title';
    title.textContent = group.category;
    title.style.color = group.color; // Subtle hint of color for the title
    groupDiv.appendChild(title);

    const chipsContainer = document.createElement('div');
    chipsContainer.className = 'chips-container';

    group.flavors.forEach(flavor => {
      const chip = document.createElement('div');
      chip.className = 'chip';
      chip.textContent = flavor;
      chip.setAttribute('data-value', flavor);
      chip.setAttribute('data-color', group.color);
      chipsContainer.appendChild(chip);
    });

    groupDiv.appendChild(chipsContainer);
    container.appendChild(groupDiv);
  });
}

function renderRecipes() {
  const recipeList = document.getElementById('recipe-list');
  
  // Apply Filter
  let filtered = extractions;

  // 1. App Top Tabs Filter
  if (currentRecetarioFilter === 'favorites') {
    filtered = filtered.filter(row => row.isFavorite === true);
  } else if (currentRecetarioFilter === 'filtrados') {
    filtered = filtered.filter(row => row.method !== 'Bebida Preparada');
  } else if (currentRecetarioFilter === 'preparados') {
    filtered = filtered.filter(row => row.method === 'Bebida Preparada');
  }

  if (filtered.length === 0) {
    if (currentRecetarioFilter === 'favorites') {
      recipeList.innerHTML = `<div class="text-center" style="color: var(--color-text-muted); margin-top: 2rem;">No tienes recetas marcadas como favoritas.</div>`;
    } else {
      recipeList.innerHTML = `<div class="text-center" style="color: var(--color-text-muted); margin-top: 2rem;">Aún no hay recetas guardadas.</div>`;
    }
    return;
  }

  recipeList.innerHTML = '';
  let sortedExtractions = [...filtered];
  
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
    recipeList.innerHTML = `<div class="text-center" style="color: var(--color-text-muted); margin-top: 2rem;">No hay recetas que coincidan con los filtros.</div>`;
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
        <div class="surface ${isFav ? 'favorite-glow' : ''}" style="${isFav ? 'border-color: rgba(231, 76, 60, 0.3);' : ''}">
          <div class="recipe-card-header">
            <div style="display: flex; flex-direction: column; gap: 4px;">
              <div style="display: flex; align-items: center; gap: 6px;">
                <div class="recipe-method">${ext.method || 'Método Desconocido'}
                  ${ext.isFromNoni ? `<span style="font-size: 0.7rem; color: #a18cf5; background: rgba(161, 140, 245, 0.1); border: 1px solid rgba(161, 140, 245, 0.3); padding: 2px 6px; border-radius: 4px; display: inline-flex; align-items: center; gap: 4px; margin-left: 6px;">✨ Creado por Noni</span>` : ''}
                </div>
                <button onclick="window.toggleFavorite('${ext.id}')" style="background:none; border:none; padding: 2px; cursor: pointer; display: flex; align-items: center;">
                  ${heartIcon}
                </button>
              </div>
              <div class="recipe-date">${dateStr}</div>
            </div>
            <div style="display: flex; align-items: center; gap: 12px;">
              ${ratingStars}
              ${(ext.isFromNoni && (!t || t.rating === 0)) ? `
                <button class="btn" style="padding: 4px 12px; font-size: 0.8rem; background: var(--color-surface); color: var(--color-accent); border: 1px solid var(--color-accent);" onclick="window.rateRecipe('${ext.id}')">
                  Valorar
                </button>
              ` : ''}
              ${ext.pourStages && ext.pourStages.length > 0 ? `
                <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="window.startReplication('${ext.id}')">
                  Replicar
                </button>` : ''}
            </div>
          </div>
          <div class="recipe-card-body">
            <div class="recipe-card-grid">
              <div class="grid-item"><div class="grid-label">Café (g)</div><div class="grid-value">${ext.coffeeWeight}</div></div>
              <div class="grid-item"><div class="grid-label">Agua (ml)</div><div class="grid-value">${ext.waterWeight}</div></div>
              <div class="grid-item"><div class="grid-label">Ratio</div><div class="grid-value">1:${ext.ratio}</div></div>
              <div class="grid-item"><div class="grid-label">Molienda</div><div class="grid-value">${ext.grindSize}</div></div>
              <div class="grid-item"><div class="grid-label">Tiempo</div><div class="grid-value" style="font-family: monospace;">${ext.timeFormatted || '00:00.0'}</div></div>
              <div class="grid-item"><div class="grid-label">Temp (ºC)</div><div class="grid-value">${ext.temperature || '--'}</div></div>
            </div>
            ${ext.notes ? `<div style="font-size: 0.85rem; color: var(--color-text-secondary); margin-top: 12px;"><strong>Notas:</strong> ${ext.notes}</div>` : ''}
            <div style="display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px;">
              <button class="btn" style="padding: 4px 12px; font-size: 0.8rem; background: rgba(106, 191, 99, 0.1); color: var(--color-success); border: 1px solid rgba(106,191,99,0.3);" onclick="window.exportRecipeToImage('${ext.id}')">
                Compartir IG <svg width="14" height="14" viewBox="0 0 24 24" style="vertical-align: middle; margin-left: 4px;"><path fill="currentColor" d="M18 16.08C17.24 16.08 16.56 16.38 16.04 16.85L8.91 12.7C8.96 12.47 9 12.24 9 12S8.96 11.53 8.91 11.3L15.96 7.19C16.5 7.69 17.21 8 18 8C19.66 8 21 6.66 21 5S19.66 2 18 2 15 3.34 15 5C15 5.24 15.04 5.47 15.09 5.7L7.96 9.81C7.44 9.31 6.73 9 6 9C4.34 9 3 10.34 3 12S4.34 15 6 15C6.73 15 7.44 14.69 7.96 14.19L15.09 18.3C15.04 18.53 15 18.76 15 19C15 20.66 16.34 22 18 22S21 20.66 21 19 19.66 16.08 18 16.08Z"/></svg>
              </button>
              <button class="btn" style="padding: 4px 12px; font-size: 0.8rem; background: rgba(255,255,255,0.05); color: var(--color-text-secondary);" onclick="window.openEditModal('${ext.id}')">
                Editar
              </button>
              <button class="btn" style="padding: 6px; color: var(--color-danger);" onclick="window.deleteRecipe('${ext.id}')">
                <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4H15.5L14.5 3H9.5L8.5 4H5V6H19M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19Z"/></svg>
              </button>
            </div>
          </div>
        </div>
          </div>
          <div class="recipe-stat">
            <span>Dosis</span>
            ${ext.coffeeWeight}g / ${ext.waterWeight}ml
          </div>
          <div class="recipe-stat">
            <span>Molienda</span>
            ${ext.grindSize} pts
          </div>
          <div class="recipe-stat">
            <span>Temp.</span>
            ${ext.temperature}°C
          </div>
          <div class="recipe-stat">
            <span>Tiempo</span>
            ${ext.timeFormatted !== '00:00.0' ? ext.timeFormatted : '--:--'}
          </div>
        </div>
        
        ${ext.pourStages && ext.pourStages.length > 0 ? `
        <div style="margin-top: 12px; background-color: rgba(255,255,255,0.03); border-radius: var(--radius-sm); padding: 8px;">
          <div style="font-size: 0.75rem; color: var(--color-text-secondary); margin-bottom: 6px; text-transform: uppercase;">Vertidos Registrados</div>
          ${ext.pourStages.map(stage => `
            <div style="display: flex; justify-content: space-between; font-size: 0.85rem; padding: 2px 0; border-bottom: 1px solid rgba(255,255,255,0.05);">
              <span style="color: var(--color-accent); font-family: monospace;">${(stage.timeFormatted || '00:00').substring(0, 5)}</span>
              <span style="color: var(--color-text-primary);">${stage.note || 'Vertido'}</span>
              <span style="color: var(--color-text-secondary);">${stage.waterTarget ? stage.waterTarget + 'ml' : '-'}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${t ? `
        <div style="margin-top: 12px; font-size: 0.875rem; color: var(--color-text-secondary);">
          <div style="margin-bottom: 4px;"><strong>Origen:</strong> ${t.origin} ${t.varietal ? `<span style="color: var(--color-accent); font-weight: 500;">(${t.varietal})</span>` : ''} - ${t.process}</div>
          ${t.flavors.length > 0 ? `<div style="margin-bottom: 4px; color: var(--color-accent)">Notas: ${t.flavors.join(', ')}</div>` : ''}
          ${t.metrics ? `
          <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(255,255,255,0.05); display: grid; grid-template-columns: 1fr 1fr; gap: 6px;">
            <div style="font-size: 0.75rem;"><span style="color: var(--color-text-muted);">Dulzor:</span> <span style="color: var(--color-success); font-weight: 600;">${t.metrics.sweetness}/5</span></div>
            <div style="font-size: 0.75rem;"><span style="color: var(--color-text-muted);">Acidez:</span> <span style="color: var(--color-success); font-weight: 600;">${t.metrics.acidity}/5</span></div>
            <div style="font-size: 0.75rem;"><span style="color: var(--color-text-muted);">Claridad:</span> <span style="color: var(--color-success); font-weight: 600;">${t.metrics.clarity}/5</span></div>
            <div style="font-size: 0.75rem;"><span style="color: var(--color-text-muted);">Postgusto:</span> <span style="color: var(--color-success); font-weight: 600;">${t.metrics.aftertaste}/5</span></div>
          </div>
          ` : ''}
        </div>
        ` : ''}
        
        ${ext.notes ? `
        <div style="margin-top: 8px; font-size: 0.875rem; font-style: italic; color: var(--color-text-muted);">
          "${ext.notes}"
        </div>
        ` : ''}
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
}

window.exportRecipeToImage = async function(id) {
  const ext = extractions.find(ex => ex.id === id);
  if (!ext) return;
  const t = tastings.find(ta => ta.extractionId === ext.id);

  // Populate Template
  document.getElementById('export-title').textContent = ext.method || 'Receta';
  document.getElementById('export-origin').textContent = t ? `Origen: ${t.origin}` : `Origen: Origen 90`;
  document.getElementById('export-method-badge').textContent = t && t.varietal ? t.varietal : (ext.method || 'Café');
  document.getElementById('export-coffee').textContent = `${ext.coffeeWeight}g`;
  document.getElementById('export-water').textContent = `${ext.waterWeight}g`;
  document.getElementById('export-grind').textContent = ext.grindSize;
  document.getElementById('export-notes').textContent = ext.notes || (t && t.flavors && t.flavors.length > 0 ? t.flavors.join(', ') : 'Una extracción digna de compartir.');
  
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
}

window.renderPantry = function() {
  const container = document.getElementById('pantry-list');
  if(!container) return;
  container.innerHTML = '';
  
  const activeBags = pantry.filter(p => p.currentWeight > 0);
  const emptyBags = pantry.filter(p => p.currentWeight <= 0);
  
  if (pantry.length === 0) {
    container.innerHTML = '<div style="color: var(--color-text-muted); font-size: 0.9rem; padding: 20px; text-align: center;">Tu alacena está vacía. Añade tu primera bolsa de café.</div>';
    return;
  }
  
  const renderBags = (bags, opacity = 1) => {
    bags.forEach(bag => {
      const p = Math.max(0, Math.min(100, (bag.currentWeight / bag.initialWeight) * 100));
      const isLow = p < 20;
      
      const card = document.createElement('div');
      card.style.cssText = `background: var(--color-bg); padding: 16px; border-radius: var(--radius-sm); border: 1px solid var(--color-border); opacity: ${opacity}; position: relative; overflow: hidden;`;
      
      card.innerHTML = `
        <div style="display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 4px; position: relative; z-index: 2;">
          <div>
            <div style="font-weight: 600; font-size: 1.1rem; color: var(--color-text-primary); margin-bottom: 2px;">${bag.name}</div>
            <div style="font-size: 0.8rem; color: var(--color-text-secondary); text-transform: uppercase; letter-spacing: 0.5px;">${bag.roaster}</div>
          </div>
          <div style="text-align: right;">
            <div style="font-weight: bold; font-size: 1.1rem; color: ${isLow ? 'var(--color-danger)' : 'var(--color-success)'};">${bag.currentWeight.toFixed(1)}g</div>
            <div style="font-size: 0.7rem; color: var(--color-text-muted);">/ ${bag.initialWeight}g</div>
          </div>
        </div>
        
        <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 12px; position: relative; z-index: 2;">
          ${bag.origin} • ${bag.process} • Tostado: ${new Date(bag.roastDate).toLocaleDateString()}
        </div>
        
        <div style="width: 100%; height: 6px; background-color: rgba(255,255,255,0.05); border-radius: 3px; margin-bottom: 16px; position: relative; z-index: 2; overflow: hidden;">
          <div style="width: ${p}%; height: 100%; background-color: ${isLow ? 'var(--color-danger)' : 'var(--color-accent)'}; transition: width 0.3s ease;"></div>
        </div>

        <div style="display: flex; gap: 8px; position: relative; z-index: 2;">
          <button onclick="window.editPantryWeight('${bag.firebaseId}', ${bag.currentWeight})" style="flex: 1; padding: 6px; background: transparent; border: 1px solid var(--color-border); color: var(--color-text-secondary); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem;">
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19,6.41L17.59,5L12,10.59L6.41,5L5,6.41L10.59,12L5,17.59L6.41,19L12,13.41L17.59,19L19,17.59L13.41,12L19,6.41Z" style="display:none;"/><path fill="currentColor" d="M14.06,9.02L15.98,10.94L5.92,21H4V19.08L14.06,9.02M17.66,3.34C17.85,3.15 18.1,3.05 18.35,3.06C18.61,3.05 18.86,3.15 19.05,3.34L20.66,4.95C21.05,5.34 21.05,5.97 20.66,6.36L18.71,8.31L16.79,6.39L18.66,4.52L17.66,3.5L14.06,7.1L12.14,5.18L17.66,3.34Z" /></svg>
            Corregir Peso
          </button>
          <button onclick="window.deletePantryBag('${bag.firebaseId}')" style="flex: 1; padding: 6px; background: transparent; border: 1px solid var(--color-border); color: var(--color-danger); border-radius: 6px; cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 6px; font-size: 0.8rem;">
            <svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M19,4H15.5L14.5,3H9.5L8.5,4H5V6H19M6,19A2,2 0 0,0 8,21H16A2,2 0 0,0 18,19V7H6V19Z" /></svg>
            Eliminar
          </button>
        </div>
      `;
      container.appendChild(card);
    });
  }
  
  renderBags(activeBags, 1);
  if(emptyBags.length > 0) {
    const divider = document.createElement('div');
    divider.style.cssText = 'font-size: 0.8rem; color: var(--color-text-muted); margin: 12px 0 4px 0; text-transform: uppercase; letter-spacing: 1px;';
    divider.textContent = 'Histórico (Vacías)';
    container.appendChild(divider);
    renderBags(emptyBags, 0.5);
  }
};

window.updatePantryDropdown = function() {
  const select = document.getElementById('ext-pantry-id');
  if(!select) return;
  const oldValue = select.value;
  select.innerHTML = '<option value="">Usar café general (No descontar)</option>';
  
  const activeBags = pantry.filter(p => p.currentWeight > 0);
  activeBags.forEach(bag => {
    const opt = document.createElement('option');
    opt.value = bag.firebaseId;
    opt.textContent = `${bag.name} - ${bag.roaster} (${bag.currentWeight.toFixed(1)}g)`;
    select.appendChild(opt);
  });
  
  if (activeBags.some(b => b.firebaseId === oldValue)) {
    select.value = oldValue;
  }
};

window.editPantryWeight = async function(id, currentWeight) {
  const newWeightStr = prompt("¿Cuántos gramos le quedan a esta bolsa realmente? (ej. 150)", currentWeight.toFixed(1));
  if (newWeightStr === null) return;
  const newWeight = parseFloat(newWeightStr.trim());
  
  if (!isNaN(newWeight) && newWeight >= 0) {
    try {
      await db.collection("pantry").doc(id).update({ currentWeight: newWeight });
    } catch(e) {
      alert("Error al actualizar el peso de la bolsa.");
    }
  } else {
    alert("Peso inválido. Debes ingresar un número válido (ej. 150.5).");
  }
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
