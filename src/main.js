import { FactoryScene } from './scene.js';
import { useStore } from './store.js';

const root = document.getElementById('root');
const store = useStore;

// ---- Canvas (behind sidebar) ----
const canvas = document.createElement('canvas');
canvas.style.position = 'absolute';
canvas.style.inset = '0';
canvas.style.display = 'block';
root.insertBefore(canvas, root.firstChild);

const scene = new FactoryScene(canvas);

// ---- DOM refs ----
const els = {
  statusText: document.getElementById('statusText'),
  sidebar: document.getElementById('sidebar'),
  toggle: document.getElementById('toggle'),
  chat: document.getElementById('chat'),
  chatInput: document.getElementById('chatInput'),
  btnSend: document.getElementById('btnSend'),
  log: document.getElementById('log'),
  chips: document.getElementById('chips'),
  btnWorkerIn: document.getElementById('btnWorkerIn'),
  btnWorkerOut: document.getElementById('btnWorkerOut'),
  btnLockRelease: document.getElementById('btnLockRelease'),
  btnLockEngage: document.getElementById('btnLockEngage'),
  btnGen: document.getElementById('btnGen'),
  apiKey: document.getElementById('apiKey'),
};

// initialise api key from store
els.apiKey.value = store.getState().apiKey;

let frame = null;
let last = performance.now();

function status(msg, kind = 'idle') {
  els.statusText.textContent = msg;
  const p = document.getElementById('statusPill');
  if (!p) return;
}

function fmt(ts) {
  return new Date(ts).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

function chip(label, key, state) {
  const on = state[key] === true;
  const c = document.createElement('div');
  c.className = `chip ${on ? 'on' : 'off'}`;
  c.textContent = label;
  return c;
}

function render() {
  const s = store.getState();
  const ws = s.worldState;

  // chips
  els.chips.innerHTML = '';
  els.chips.appendChild(chip('Conveyor running', 'conveyorRunning', ws));
  els.chips.appendChild(chip('Worker in danger zone', 'workerInDangerZone', ws));
  els.chips.appendChild(chip('Maintenance lock released', 'maintenanceLockReleased', ws));
  els.chips.appendChild(chip('Warning active', 'warningActive', ws));
  els.chips.appendChild(chip('Maintenance panel open', 'maintenancePanelOpen', ws));

  // receipts
  els.log.innerHTML = '';
  const receipts = Array.isArray(s.receipts) ? s.receipts : [];
  for (const r of receipts.slice(0, 12)) {
    const e = document.createElement('div');
    e.className = `entry ${r.allowed ? 'ok' : 'no'}`;
    const tag = document.createElement('span');
    tag.className = `tag ${r.allowed ? 'ok' : 'no'}`;
    tag.textContent = r.allowed ? 'ALLOWED' : 'BLOCKED';
    const left = document.createElement('div');
    left.className = 'left';
    left.textContent = `${r.actor} ▸ ${r.action}${r.target ? ' → ' + r.target : ''}`;
    const why = document.createElement('div');
    why.className = 'why';
    why.textContent = r.reason || (r.allowed ? 'Executed.' : 'Rejected.');
    left.appendChild(why);
    const time = document.createElement('span');
    time.className = 'time';
    time.textContent = fmt(r.ts);
    e.appendChild(left);
    e.appendChild(tag);
    e.appendChild(time);
    els.log.appendChild(e);
  }

  // chat
  els.chat.innerHTML = '';
  const chat = Array.isArray(s.chat) ? s.chat : [];
  for (const m of chat.slice(-14)) {
    const div = document.createElement('div');
    div.className = `msg ${m.role}`;
    div.textContent = m.text;
    if (m.role === 'ai' && m.action) {
      const act = document.createElement('div');
      act.className = 'act';
      act.textContent = `Proposed ${m.action}${m.target ? ' on ' + m.target : ''} — ${m.allowed ? 'allowed by runtime' : 'rejected by runtime'}` + (m.source ? ` [${m.source}]` : '');
      div.appendChild(act);
    }
    els.chat.appendChild(div);
  }
  els.chat.scrollTop = els.chat.scrollHeight;
}

const unsub = store.subscribe(render);
render();

// ---- Animation loop ----
function loop(now) {
  const dt = (now - last) / 1000;
  last = now;
  const s = store.getState();
  scene.update(dt, s.worldState);
  scene.render();
  frame = requestAnimationFrame(loop);
}
frame = requestAnimationFrame((t) => { last = t; loop(t); });

// ---- Interactions ----
els.toggle.onclick = () => els.sidebar.classList.toggle('open');

els.btnWorkerIn.onclick = () => store.applyEdit('worker_in');
els.btnWorkerOut.onclick = () => store.applyEdit('worker_out');
els.btnLockRelease.onclick = () => store.applyEdit('lock_release');
els.btnLockEngage.onclick = () => store.applyEdit('lock_engage');

els.btnGen.onclick = () => {
  store.regenerate();
  scene.workerPos.copy(POS_OUT);
  scene.doorAngle = 0;
  render();
};

els.apiKey.onchange = (e) => store.getState().setApiKey(e.target.value);
els.apiKey.onblur = (e) => store.getState().setApiKey(e.target.value);

function send() {
  const text = els.chatInput.value.trim();
  if (!text) return;
  els.chatInput.value = '';
  store.chat(text);
}
els.btnSend.onclick = send;
els.chatInput.onkeydown = (e) => { if (e.key === 'Enter') send(); };

// handle sidebar open initially on desktop
if (window.innerWidth > 768) els.sidebar.classList.add('open');
