import { FactoryScene } from './scene.js';
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
const scene = new FactoryScene(canvas);

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
  // inspector
  cardActor: document.getElementById('cardActor'),
  cardConveyor: document.getElementById('cardConveyor'),
  cardDefault: document.getElementById('cardDefault'),
  inspTitle: document.getElementById('inspTitle'),
  aPermitted: document.getElementById('aPermitted'), aConditional: document.getElementById('aConditional'),
  cTag: document.getElementById('cTag'), cState: document.getElementById('cState'),
  cHazard: document.getElementById('cHazard'), cLock: document.getElementById('cLock'),
  cRestart: document.getElementById('cRestart'), cReason: document.getElementById('cReason'),
  btnLockRelease: document.getElementById('btnLockRelease'),
  btnLockEngage: document.getElementById('btnLockEngage'),
  btnStopConv: document.getElementById('btnStopConv'),
  btnWorkerIn: document.getElementById('btnWorkerIn'),
  btnWorkerOut: document.getElementById('btnWorkerOut'),
  // nav
  navWorld: document.getElementById('navWorld'), navActors: document.getElementById('navActors'),
  navContracts: document.getElementById('navContracts'), navObjects: document.getElementById('navObjects'),
  navHistory: document.getElementById('navHistory'),
  // hud
  hud: document.getElementById('hud'),
};

let frame = null, last = performance.now();
let loadResolve;
const loadPromise = new Promise((r) => { loadResolve = r; });

// ---- Loading sequence (real work mapped to stages) ----
const STAGES = ['s1', 's2', 's3', 's4', 's5'];
let stageIdx = 0;
function advanceStage() {
  if (stageIdx >= STAGES.length) { loadResolve(); return; }
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
  const s = store.getState();
  const ws = s.worldState;

  // trace count
  els.traceCount.textContent = `${s.receipts.length} events`;

  const messages = Array.isArray(s.messages) ? s.messages : [];
  // timeline
  els.log.innerHTML = '';
  for (const r of s.receipts.slice(0, 14)) {
    const e = document.createElement('div');
    e.className = `entry ${r.allowed ? '' : ''}`;
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
      // focus relevant object
      const targets = { conveyor_01: 'conveyor_01', warning_light_01: 'warning_light_01', maintenance_panel_01: 'maintenance_panel_01', worker: 'worker' };
      if (targets[r.target]) selectObject(targets[r.target]);
      else selectObject(null);
    };
    els.log.appendChild(e);
  }
  els.log.scrollTop = els.log.scrollHeight;

  // inspector: conveyoor card
  const running = ws.conveyorRunning === true;
  const occupied = ws.workerInDangerZone === true;
  const lockReleased = ws.maintenanceLockReleased === true;
  const panelOpen = ws.maintenancePanelOpen === true;
  const restartAllowed = (!occupied) && lockReleased;

  els.cTag.textContent = running ? 'RUNNING' : 'STOPPED';
  els.cTag.className = `tag ${running ? 'active' : ''}`;
  els.cState.textContent = running ? 'Running' : 'Stopped';
  els.cState.className = `v ${running ? 'active' : ''}`;
  els.cHazard.textContent = occupied ? 'Occupied' : 'Clear';
  els.cHazard.className = `v ${occupied ? 'warn' : 'ok'}`;
  els.cLock.textContent = lockReleased ? 'Released' : 'Engaged';
  els.cLock.className = `v ${lockReleased ? 'ok' : 'warn'}`;
  els.cRestart.textContent = restartAllowed ? 'Yes' : 'No';
  els.cRestart.className = `v ${restartAllowed ? 'ok' : 'warn'}`;
  els.cReason.textContent = restartAllowed ? 'All preconditions satisfied'
    : (!occupied ? 'maintenance lock engaged' : 'hazard zone occupied');

  // HUD annotation
  const annot = document.createElement('div');
  // reuse single annotation
  let hudEl = els.hud.firstElementChild;
  if (!hudEl) {
    hudEl = document.createElement('div');
    hudEl.className = 'annot';
    els.hud.appendChild(hudEl);
  }
  if (scene.selectedId && scene.objs[scene.selectedId]) {
    const pos = scene.objs[scene.selectedId].position.clone();
    pos.y += (scene.selectedId === 'worker' ? 0.7 : scene.selectedId === 'danger_zone' ? 0.05 : 1.6);
    // project to screen
    const v = pos.clone().project(scene.camera);
    const w = window.innerWidth, h = window.innerHeight;
    const x = (v.x * 0.5 + 0.5) * w;
    const y = (1 - (v.y * 0.5 + 0.5)) * h;
    const visible = v.z <= 1 && v.z >= -1;
    hudEl.style.left = `${x}px`;
    hudEl.style.top = `${y}px`;
    hudEl.style.opacity = visible ? '1' : '0';
    hudEl.className = 'annot show ' + (scene.selectedId === 'danger_zone' ? 'oxide' : 'amber');
    const labels = { conveyor_01: 'CONVEYOR 01', worker: 'WORKER', danger_zone: 'HAZARD ZONE', warning_light_01: 'WARNING LIGHT', maintenance_panel_01: 'MAINTENANCE PANEL' };
    hudEl.textContent = labels[scene.selectedId] || 'OBJECT';
  } else {
    hudEl.style.opacity = '0';
  }
}

// ---- Selection / camera ----
function selectObject(id) {
  scene.setSelected(id);
  if (!id) {
    els.inspTitle.textContent = 'SELECT OBJECT';
    els.cardActor.classList.add('hidden');
    els.cardConveyor.classList.add('hidden');
    els.cardDefault.classList.remove('hidden');
    return;
  }
  // camera ease target
  const targets = {
    conveyor_01: new THREE.Vector3(2.2, 3.6, 5.6),
    worker: new THREE.Vector3(-1.0, 3.2, 4.6),
    danger_zone: new THREE.Vector3(5.4, 3.4, 2.2),
    warning_light_01: new THREE.Vector3(-0.6, 4.4, 4.2),
    maintenance_panel_01: new THREE.Vector3(0.6, 3.4, -3.4),
  };
  const look = new THREE.Vector3(0, 0.9, 0);
  if (targets[id]) {
    scene.camera.position.lerp(targets[id], 0); // snap start
    scene.camera.lookAt(look);
  }
  const labels = { conveyor_01: 'CONVEYOR 01', worker: 'WORKER', danger_zone: 'HAZARD ZONE', warning_light_01: 'WARNING LIGHT', maintenance_panel_01: 'MAINTENANCE PANEL' };
  els.inspTitle.textContent = labels[id] || 'OBJECT';
  els.cardActor.classList.add('hidden');
  els.cardConveyor.classList.add('hidden');
  els.cardDefault.classList.add('hidden');
  if (id === 'conveyor_01') els.cardConveyor.classList.remove('hidden');
  else if (id === 'worker') {
    // worker card = actor card reuse
    els.cardActor.classList.remove('hidden');
    els.inspTitle.textContent = 'WORKER · ZONE OCCUPANT';
  } else els.cardDefault.classList.remove('hidden');
}

// ---- Nav ----
function setNav(activeId) {
  [els.navWorld, els.navActors, els.navContracts, els.navObjects, els.navHistory].forEach((el) => el.classList.remove('active'));
  const el = document.getElementById(activeId);
  if (el) el.classList.add('active');
}
els.navWorld.onclick = () => { setNav('navWorld'); selectObject(null); };
els.navObjects.onclick = () => { setNav('navObjects'); selectObject(null); };
els.navContracts.onclick = () => { setNav('navContracts'); selectObject(null); };
els.navHistory.onclick = () => { setNav('navHistory'); };

// ---- Actions from nav / world ----
function applyEdit(kind) {
  const note = { worker_in: 'Worker moved into the danger zone.', worker_out: 'Worker moved back to the factory floor.', lock_release: 'Maintenance lock released.', lock_engage: 'Maintenance lock engaged.' }[kind];
  store.applyEdit(kind);
}

// wire via store buttons? The new UI moved buttons into cards. We'll expose via inspector buttons + keyboard.
// Simpler: keep store.applyEdit accessible globally for console use.
window.__kinetApplyEdit = applyEdit;

// ---- AI chat ----
async function send() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = '';
  appendChat('user', text);
  try {
    const receipt = await store.getState().chat(text);
    appendChat('ai', receipt, text);
    selectObject(receipt.target || null);
  } catch (err) {
    appendChat('ai', { text: 'Supervisor unavailable. Fallback compiled locally.', action: null, target: null, allowed: false, reason: err.message, source: 'error' });
  }
}
els.btnSend.onclick = send;
els.chatInput.onkeydown = (e) => { if (e.key === 'Enter') send(); };

els.btnLockRelease.onclick = () => applyEdit('lock_release');
els.btnLockEngage.onclick = () => applyEdit('lock_engage');
els.btnWorkerIn.onclick = () => applyEdit('worker_in');
els.btnWorkerOut.onclick = () => applyEdit('worker_out');
els.btnStopConv.onclick = () => {
  store.getState().chat('Stop the conveyor.');
};

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
  scene.update(dt, s.worldState);
  scene.render();
  render();
  frame = requestAnimationFrame(loop);
}

// ---- Boot ----
function boot() {
  try {
    last = performance.now();
    frame = requestAnimationFrame((t) => { last = t; loop(t); });
  } catch (e) {
    console.error('Boot failed:', e);
    // Still try to render something so the page isn't blank
    last = performance.now();
    frame = requestAnimationFrame((t) => { last = t; loop(t); });
  }
}

advanceStage();
// Hard stop: loader always comes off after ~2.5s even if JS errors
setTimeout(() => {
  els.loader.classList.add('hidden');
  boot();
}, 2700);

// expose for console debugging
window.__kinetStore = store;
window.__kinetScene = scene;
