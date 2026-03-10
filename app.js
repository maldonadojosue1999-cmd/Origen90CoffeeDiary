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

// Initialize App
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
  initFirebaseSync();
}

function initFirebaseSync() {
  db.collection("extractions").onSnapshot((snapshot) => {
    extractions = snapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() }));
    updateExtractionDropdown();
    renderRecipes();
  });

  db.collection("tastings").onSnapshot((snapshot) => {
    tastings = snapshot.docs.map(d => ({ firebaseId: d.id, ...d.data() }));
    updateExtractionDropdown();
    renderRecipes();
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
    
    // Hide replicate view, show recetario
    document.getElementById('view-replicar').classList.add('hidden');
    document.getElementById('view-recetario').classList.remove('hidden');
    document.querySelector('nav').classList.remove('hidden'); // Show bottom nav again
  });
}

function updateRepTimerUI() {
  if (isRepTimerRunning) {
    repElapsedTime = Date.now() - repStartTime;
    
    if (replicateStages.length > 0) {
      if (nextStageIndex < replicateStages.length) {
        const stage = replicateStages[nextStageIndex];
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
  
  roadmapContainer.innerHTML = '';
  replicateStages.forEach((stage, idx) => {
    const isPast = elapsedTime >= stage.timeMs;
    const isCurrent = idx === nextStageIndex - 1;
    
    const row = document.createElement('div');
    row.style.display = 'flex';
    row.style.justifyContent = 'space-between';
    row.style.fontSize = '0.85rem';
    row.style.padding = '4px 0';
    row.style.borderBottom = '1px solid rgba(255,255,255,0.05)';
    
    if (isPast && !isCurrent) {
      row.style.opacity = '0.4';
      row.style.textDecoration = 'line-through';
    } else if (isCurrent) {
      row.style.color = 'var(--color-accent)';
      row.style.fontWeight = 'bold';
    } else {
      row.style.color = 'var(--color-text-secondary)';
    }

    row.innerHTML = `
      <span style="font-family: monospace;">${stage.timeFormatted.substring(0, 5)}</span>
      <span>${stage.note || 'Vertido'}</span>
      <span>${stage.waterTarget ? stage.waterTarget + 'ml' : '-'}</span>
    `;
    roadmapContainer.appendChild(row);
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

  // Rating Stars
  const stars = document.querySelectorAll('.rating-star');
  const cupRatingInput = document.getElementById('cup-rating');
  stars.forEach(star => {
    star.addEventListener('click', (e) => {
      const rating = parseInt(star.getAttribute('data-rating'));
      cupRatingInput.value = rating;
      stars.forEach(s => {
        if (parseInt(s.getAttribute('data-rating')) <= rating) {
          s.classList.add('active');
        } else {
          s.classList.remove('active');
        }
      });
    });
  });

  // Method change hook for Smart Recommendations
  const methodSelect = document.getElementById('method');
  methodSelect.addEventListener('change', handleMethodChange);
}

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

    const newTasting = {
      id: Date.now().toString(),
      extractionId: document.getElementById('cata-extraction').value,
      origin: document.getElementById('bean-origin').value,
      process: document.getElementById('bean-process').value,
      roastDate: document.getElementById('roast-date').value,
      flavors: selectedFlavors,
      rating: parseInt(rating)
    };

    try {
      await db.collection("tastings").add(newTasting);
      // Reset Form
      formCata.reset();
      document.querySelectorAll('.chip').forEach(c => c.classList.remove('selected'));
      document.querySelectorAll('.rating-star').forEach(s => s.classList.remove('active'));
      document.getElementById('cup-rating').value = 0;
      alert('Evaluación guardada.');
    } catch (error) {
      console.error("Error guardando cata:", error);
      alert('Hubo un error al guardar la cata.');
    } finally {
      submitBtn.disabled = false;
      submitBtn.textContent = 'Guardar Evaluación';
    }
  });
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
  if (confirm('¿Estás seguro de que deseas eliminar esta receta y su calificación?')) {
    try {
      const ext = extractions.find(ex => ex.id === extractionId);
      if (ext && ext.firebaseId) {
        await db.collection("extractions").doc(ext.firebaseId).delete();
      }
      
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
  if (extractions.length === 0) {
    recipeList.innerHTML = `<div class="text-center" style="color: var(--color-text-muted); margin-top: 2rem;">Aún no hay recetas guardadas.</div>`;
    return;
  }

  recipeList.innerHTML = '';
  
  // Sort by newest
  const sortedExtractions = [...extractions].sort((a,b) => b.id - a.id);

  sortedExtractions.forEach(ext => {
    const t = tastings.find(t => t.extractionId === ext.id);
    const dateStr = new Date(ext.date).toLocaleDateString([], { dateStyle: 'long' });
    
    let ratingStars = '';
    if (t) {
      const activeStars = '★'.repeat(t.rating);
      const inactiveStars = '☆'.repeat(5 - t.rating);
      ratingStars = `<div style="color: var(--color-accent); font-size: 1.25rem;">${activeStars}<span style="color: var(--color-text-muted)">${inactiveStars}</span></div>`;
    } else {
      ratingStars = `<div style="color: var(--color-text-muted); font-size: 0.875rem;">Sin calificar</div>`;
    }

    const html = `
      <div class="surface">
        <div class="recipe-card-header">
          <div style="display: flex; flex-direction: column; gap: 4px;">
            <div class="recipe-method">${ext.method}</div>
            <div class="recipe-date">${dateStr}</div>
          </div>
          <div style="display: flex; align-items: center; gap: 12px;">
            ${ratingStars}
            ${ext.pourStages && ext.pourStages.length > 0 ? `
              <button class="btn btn-primary" style="padding: 4px 12px; font-size: 0.8rem;" onclick="window.startReplication('${ext.id}')">
                Replicar
              </button>
            ` : ''}
            <button class="btn btn-danger" style="padding: 4px 8px;" onclick="window.deleteRecipe('${ext.id}')" title="Eliminar receta">
              <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M19 4H15.5L14.5 3H9.5L8.5 4H5V6H19M6 19C6 20.1 6.9 21 8 21H16C17.1 21 18 20.1 18 19V7H6V19Z"/></svg>
            </button>
          </div>
        </div>
        
        <div class="recipe-stats">
          <div class="recipe-stat">
            <span>Ratio</span>
            1:${ext.ratio}
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
              <span style="color: var(--color-accent); font-family: monospace;">${stage.timeFormatted.substring(0, 5)}</span>
              <span style="color: var(--color-text-primary);">${stage.note || 'Vertido'}</span>
              <span style="color: var(--color-text-secondary);">${stage.waterTarget ? stage.waterTarget + 'ml' : '-'}</span>
            </div>
          `).join('')}
        </div>
        ` : ''}

        ${t ? `
        <div style="margin-top: 12px; font-size: 0.875rem; color: var(--color-text-secondary);">
          <div style="margin-bottom: 4px;"><strong>Origen:</strong> ${t.origin} (${t.process})</div>
          ${t.flavors.length > 0 ? `<div style="color: var(--color-accent)">Notas: ${t.flavors.join(', ')}</div>` : ''}
        </div>
        ` : ''}
        
        ${ext.notes ? `
        <div style="margin-top: 8px; font-size: 0.875rem; font-style: italic; color: var(--color-text-muted);">
          "${ext.notes}"
        </div>
        ` : ''}
      </div>
    `;
    
    recipeList.insertAdjacentHTML('beforeend', html);
  });
}

window.startReplication = function(recipeId) {
  const ext = extractions.find(ex => ex.id === recipeId);
  if (!ext || !ext.pourStages || ext.pourStages.length === 0) return;

  // Setup Replication Mode State
  replicateMode = true;
  replicateStages = [...ext.pourStages].sort((a, b) => a.timeMs - b.timeMs);
  nextStageIndex = 0;
  
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

// Start app
init();
