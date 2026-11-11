import { ArchiveScene } from './scene.js';
import { useStore } from './store.js';
import { compileIntent } from './llm.js';
import { enforce } from './runtime.js';

const app = document.getElementById('app');
const canvas = document.createElement('canvas');
canvas.id = 'world-canvas';
canvas.style.position = 'absolute';
canvas.style.inset = '0';
canvas.style.display = 'block';
document.getElementById('world').appendChild(canvas);

const store = useStore;
let scene = null;
let frame = null, last = performance.now();

// ---- DOM refs ----
const els = {
  sysStatus: document.getElementById('sysStatus'),
  traceCount: document.getElementById('traceCount'),
  log: document.getElementById('log'),
  chat: document.getElementById('chat'),
  chatInput: document.getElementById('chatInput'),
  btnSend: document.getElementById('btnSend'),
  loader: document.getElementById('loader'),
  loadFill: document.getElementById('loadFill'),
  loaderStages: {
    s1: document.getElementById('s1'), s2: document.getElementById('s2'),
    s3: document.getElementById('s3'), s4: document.getElementById('s4'), s5: document.getElementById('s5'),
  },
  // inspector cards
  cardRelay: document.getElementById('cardRelay'),
  cardChamber: document.getElementById('cardChamber'),
  cardArchivist: document.getElementById('cardArchivist'),
  cardDefault: document.getElementById('cardDefault'),
  inspTitle: document.getElementById('inspTitle'),
  rId: document.getElementById('rId'), rState: document.getElementById('rState'),
  rRestored: document.getElementById('rRestored'), rFlow: document.getElementById('rFlow'),
  cId: document.getElementById('cId'), cState: document.getElementById('cState'),
  cCondition: document.getElementById('cCondition'), cProgress: document.getElementById('cProgress'),
  aPermitted: document.getElementById('aPermitted'), aConditional: document.getElementById('aConditional'),
  // nav
  navRelay1: document.getElementById('navRelay1'), navRelay2: document.getElementById('navRelay2'),
  navRelay3: document.getElementById('navRelay3'), navChamber: document.getElementById('navChamber'),
  navArchivist: document.getElementById('navArchivist'),
  // mode buttons
  modeWorld: document.getElementById('modeWorld'), modeLogic: document.getElementById('modeLogic'),
  modeChars: document.getElementById('modeChars'), modePlay: document.getElementById('modePlay'),
  // hud
  hud: document.getElementById('hud'),
  // creation canvas
  create: document.getElementById('create'),
  createInput: document.getElementById('createInput'),
  btnCreate: document.getElementById('btnCreate'),
  // trace
  traceCountEl: document.getElementById('traceCount'),
};

// ---- Mode state ----
let currentMode = 'world';
let creationComplete = false;

function setMode(mode) {
  currentMode = mode;
  [els.modeWorld, els.modeLogic, els.modeChars, els.modePlay].forEach(b => b.classList.remove('active'));
  const el = document.getElementById('mode' + mode.charAt(0).toUpperCase() + mode.slice(1));
  if (el) el.classList.add('active');
  // Hide inspector cards in PLAY mode (minimal chrome)
  const inspector = document.getElementById('inspector');
  const aiConsole = document.getElementById('ai-console');
  if (mode === 'play') {
    inspector.style.opacity = '0';
    aiConsole.style.opacity = '0';
  } else {
    inspector.style.opacity = '1';
    aiConsole.style.opacity = '1';
  }
  render();
}

// ---- Creation canvas ----
function startCreation() {
  els.create.classList.remove('hidden');
  // Pause render loop while creating
  if (frame) cancelAnimationFrame(frame);
}
startCreation();

els.btnCreate.onclick = () => {
  const text = els.createInput.value.trim();
  if (!text) return;
  // Transition out of creation
  els.create.classList.add('hidden');
  creationComplete = true;
  initScene();
  boot();
};

els.createInput.onkeydown = (e) => { if (e.key === 'Enter') els.btnCreate.click(); };

// ---- DOM refs for buttons (set after creation) ----
function wireButtons() {
  els.btnRestoreRelay = document.getElementById('btnRestoreRelay');
  els.btnOpenChamber = document.getElementById('btnOpenChamber');
  if (!els.btnRestoreRelay || !els.btnOpenChamber) return false;
  return true;
}

// ---- Loading sequence ----
const STAGES = ['s1', 's2', 's3', 's4', 's5'];
let stageIdx = 0;
function advanceStage() {
  if (stageIdx >= STAGES.length) return;
  const id = STAGES[stageIdx];
  STAGES.forEach((k) => els.loaderStages[k].classList.remove('active'));
  els.loaderStages[id].classList.add('active');
  els.loadFill.style.width = `${((stageIdx + 1) / STAGES.length) * 100}%`;
  stageIdx++;
  setTimeout(advanceStage, 520);
}

// ---- Formatters ----
function fmt(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

// ---- UI sync ----
function render() {
  if (creationComplete === false) return;
  const s = store.getState();
  const ws = s.worldState;

  // trace count
  els.traceCount.textContent = `${s.receipts.length} events`;

  // timeline
  els.log.innerHTML = '';
  for (const r of s.receipts.slice(0, 14)) {
    const e = document.createElement('div');
    e.className = `entry`;
    const dot = document.createElement('div');
    dot.className = `dot ${r.allowed ? 'ok' : 'no'}`;
    const text = document.createElement('div');
    text.className = 'text';
    const who = document.createElement('span');
    who.className = 'who';
    who.textContent = r.actor;
    const action = document.createElement('span');
    action.className = 'b';
    action.textContent = ` ▸ ${r.action}${r.target ? ' → ' + r.target : ''}`;
    const decision = document.createElement('span');
    decision.className = 'decision';
    decision.textContent = r.allowed ? ' AUTHORIZED' : ' BLOCKED';
    const reason = document.createElement('span');
    reason.className = 'muted';
    reason.textContent = ` — ${r.reason || (r.allowed ? 'executed' : 'rejected')}`;
    text.appendChild(who); text.appendChild(action); text.appendChild(decision); text.appendChild(reason);
    const time = document.createElement('div');
    time.className = 'time';
    time.textContent = fmt(r.ts);
    e.appendChild(dot); e.appendChild(text); e.appendChild(time);
    e.onclick = () => {
      const targets = { memory_relay_01: 'memory_relay_01', memory_relay_02: 'memory_relay_02', memory_relay_03: 'memory_relay_03', central_chamber: 'central_chamber', archivist: 'archivist' };
      if (targets[r.target]) selectObject(targets[r.target]);
      else selectObject(null);
    };
    els.log.appendChild(e);
  }
  els.log.scrollTop = els.log.scrollHeight;

  // Inspector: relay state (show whichever relay is selected, or first damaged)
  const r1 = ws.relay01Restored === true;
  const r2 = ws.relay02Restored === true;
  const r3 = ws.relay03Restored === true;
  const chamberOpen = ws.chamberOpen === true;
  const restoredCount = [r1, r2, r3].filter(Boolean).length;

  els.rState.textContent = chamberOpen ? 'Open' : 'Sealed';
  els.rState.className = `v ${chamberOpen ? 'ok' : 'warn'}`;
  els.cProgress.textContent = `${restoredCount} / 3`;

  // HUD annotation
  let hudEl = els.hud.firstElementChild;
  if (!hudEl) {
    hudEl = document.createElement('div');
    hudEl.className = 'annot';
    els.hud.appendChild(hudEl);
  }
  if (scene.selectedId && scene.objs[scene.selectedId]) {
    const pos = scene.objs[scene.selectedId].position.clone();
    pos.y += (scene.selectedId === 'archivist' ? 1.0 : scene.selectedId === 'central_chamber' ? 1.8 : 0.7);
    const v = pos.clone().project(scene.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (1 - (v.y * 0.5 + 0.5)) * h;
    const visible = v.z <= 1 && v.z >= -1;
    hudEl.style.left = `${x}px`;
    hudEl.style.top = `${y}px`;
    hudEl.style.opacity = visible ? '1' : '0';
    const labels = {
      memory_relay_01: 'MEMORY RELAY 01', memory_relay_02: 'MEMORY RELAY 02', memory_relay_03: 'MEMORY RELAY 03',
      central_chamber: 'CENTRAL CHAMBER', archivist: 'THE ARCHIVIST', energy_conduit_01: 'ENERGY CONDUIT 01',
      energy_conduit_02: 'ENERGY CONDUIT 02', energy_conduit_03: 'ENERGY CONDUIT 03',
    };
    hudEl.textContent = labels[scene.selectedId] || 'OBJECT';
    hudEl.className = 'annot show ' + (scene.selectedId === 'central_chamber' ? 'copper' : 'mint');
  } else {
    hudEl.style.opacity = '0';
  }
}

// ---- Selection / camera ----
function selectObject(id) {
  if (scene) scene.setSelected(id);
  if (!id) {
    els.inspTitle.textContent = 'SELECT OBJECT';
    els.cardRelay.classList.add('hidden');
    els.cardChamber.classList.add('hidden');
    els.cardArchivist.classList.add('hidden');
    els.cardDefault.classList.remove('hidden');
    return;
  }
  const targets = {
    memory_relay_01: new THREE.Vector3(-3.6, 3.4, 5.6),
    memory_relay_02: new THREE.Vector3(0, 3.4, 5.6),
    memory_relay_03: new THREE.Vector3(3.6, 3.4, 5.6),
    central_chamber: new THREE.Vector3(0, 4.0, 3.2),
    archivist: new THREE.Vector3(-1.0, 3.2, 5.4),
  };
  const look = new THREE.Vector3(0, 1.3, 0);
  if (targets[id] && scene) {
    scene.camera.position.copy(targets[id]);
    scene.camera.lookAt(look);
  }
  const labels = {
    memory_relay_01: 'MEMORY RELAY 01', memory_relay_02: 'MEMORY RELAY 02', memory_relay_03: 'MEMORY RELAY 03',
    central_chamber: 'CENTRAL CHAMBER', archivist: 'THE ARCHIVIST',
  };
  els.inspTitle.textContent = labels[id] || 'OBJECT';
  els.cardRelay.classList.add('hidden');
  els.cardChamber.classList.add('hidden');
  els.cardArchivist.classList.add('hidden');
  els.cardDefault.classList.add('hidden');

  const s = store.getState();
  const ws = s.worldState;

  if (id.startsWith('memory_relay')) {
    const idx = id.slice(-1);
    const restored = ws[`relay0${idx}Restored`] === true;
    els.rId.textContent = id;
    els.rState.textContent = restored ? 'Restored' : 'Damaged';
    els.rState.className = `v ${restored ? 'ok' : 'warn'}`;
    els.rRestored.textContent = restored ? 'Yes' : 'No';
    els.rFlow.textContent = restored ? 'Active' : 'Inert';
    els.cardRelay.classList.remove('hidden');
  } else if (id === 'central_chamber') {
    els.cId.textContent = id;
    els.cState.textContent = chamberOpen ? 'Open' : 'Sealed';
    els.cState.className = `v ${chamberOpen ? 'ok' : 'warn'}`;
    els.cardChamber.classList.remove('hidden');
  } else if (id === 'archivist') {
    els.cardArchivist.classList.remove('hidden');
  }
}

// ---- Actions ----
function restoreRelay(idx) {
  store.applyEdit(`relay_0${idx}_in`);
}
function openChamber() {
  store.getState().chat('Open the central chamber.');
}

function wireActionButtons() {
  const r1Btn = document.getElementById('btnRestoreRelay');
  const openBtn = document.getElementById('btnOpenChamber');
  if (!r1Btn || !openBtn) return;
  r1Btn.onclick = () => restoreRelay(1);
  openBtn.onclick = () => openChamber();
}

// ---- AI chat ----
async function send() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = '';
  appendChat('user', text);
  try {
    const receipt = await store.getState().chat(text);
    appendChat('ai', receipt, text);
    if (receipt.target) selectObject(receipt.target);
  } catch (err) {
    appendChat('ai', { text: 'Archivist unavailable. Fallback compiled locally.', action: null, target: null, allowed: false, reason: err.message, source: 'error' });
  }
}
els.btnSend.onclick = send;
els.chatInput.onkeydown = (e) => { if (e.key === 'Enter') send(); };

function appendChat(role, receipt, userText) {
  const div = document.createElement('div');
  div.className = `msg ${role}`;
  if (role === 'user') {
    div.textContent = userText;
  } else {
    div.textContent = receipt.text || receipt.reason || '…';
    if (receipt.action) {
      const act = document.createElement('div');
      act.className = 'act';
      act.textContent = `Proposed ${receipt.action}${receipt.target ? ' on ' + receipt.target : ''} — ${receipt.allowed ? 'AUTHORIZED by runtime' : 'BLOCKED by runtime'}` + (receipt.source ? ` [${receipt.source}]` : '');
      div.appendChild(act);
    }
  }
  els.chat.appendChild(div);
  els.chat.scrollTop = els.chat.scrollHeight;
}

// ---- Animation loop ----
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  const s = store.getState();
  if (scene) {
    scene.update(dt, s.worldState);
    scene.render();
  }
  render();
  frame = requestAnimationFrame(loop);
}

// ---- Boot ----
function initScene() {
  try {
    scene = new ArchiveScene(canvas);
    window.__kinetScene = scene;
    return true;
  } catch (e) {
    console.error('Scene init failed:', e);
    return false;
  }
}

function boot() {
  try {
    last = performance.now();
    frame = requestAnimationFrame((t) => { last = t; loop(t); });
  } catch (e) {
    console.error('Boot failed:', e);
    last = performance.now();
    frame = requestAnimationFrame((t) => { last = t; loop(t); });
  }
}

// Mode button wiring
els.modeWorld.onclick = () => setMode('world');
els.modeLogic.onclick = () => setMode('logic');
els.modeChars.onclick = () => setMode('chars');
els.modePlay.onclick = () => setMode('play');

// Boot after loader timeout (loader starts during creation canvas)
advanceStage();
setTimeout(() => {
  els.loader.classList.add('hidden');
  wireActionButtons();
}, 2700);

// expose for console debugging
window.__kinetStore = store;
window.__kinetSceneGetter = () => scene;
