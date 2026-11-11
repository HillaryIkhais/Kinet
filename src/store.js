import { create } from 'zustand';
import { DEFAULT_CONTRACT } from './factory.js';
import { enforce } from './runtime.js';
import { compileIntent } from './llm.js';

const INITIAL_STATE = {
  conveyorRunning: false,
  workerInDangerZone: false,
  maintenanceLockReleased: false,
  warningActive: false,
  maintenancePanelOpen: false,
};

export const useStore = create((set, get) => ({
  worldState: { ...INITIAL_STATE },
  contract: DEFAULT_CONTRACT,
  sceneSpec: DEFAULT_CONTRACT.scene,
  receipts: [],
  messages: [],
  apiKey: localStorage.getItem('kinet_key') || '',
  status: 'idle',

  setApiKey: (k) => {
    localStorage.setItem('kinet_key', k || '');
    set({ apiKey: k || '' });
  },

  resetWorld: () => set({ worldState: { ...INITIAL_STATE } }),

  setWorldState: (partial) =>
    set((s) => ({ worldState: { ...s.worldState, ...partial } })),

  regenerate: () => {
    set({
      contract: DEFAULT_CONTRACT,
      sceneSpec: DEFAULT_CONTRACT.scene,
      worldState: { ...INITIAL_STATE },
      receipts: [],
      messages: [],
    });
  },

  applyEdit: (kind) => {
    const s = get();
    let patch = {};
    let note = '';
    switch (kind) {
      case 'worker_in': patch = { workerInDangerZone: true }; note = 'Worker moved into the danger zone.'; break;
      case 'worker_out': patch = { workerInDangerZone: false }; note = 'Worker moved back to the factory floor.'; break;
      case 'lock_release': patch = { maintenanceLockReleased: true }; note = 'Maintenance lock released.'; break;
      case 'lock_engage': patch = { maintenanceLockReleased: false }; note = 'Maintenance lock engaged.'; break;
    }
    set((st) => ({
      worldState: { ...st.worldState, ...patch },
      receipts: [
        {
          id: Date.now().toString(),
          ts: Date.now(),
          actor: 'visitor',
          action: kind,
          target: 'world',
          allowed: true,
          reason: note,
          stateBefore: st.worldState,
          stateAfter: { ...st.worldState, ...patch },
        },
        ...st.receipts,
      ].slice(0, 50),
    }));
  },

  // Action: callable via getState().chat(message). Returns the runtime receipt.
  // State field `messages` holds the rendered transcript; `chat` is the function.
  chat: async (message) => {
    const msgs = Array.isArray(get().messages) ? get().messages : [];
    set({ messages: [...msgs, { role: 'user', text: message }], status: 'thinking' });
    const { action, target, reasoning, spoken, source } = await compileIntent(message, {
      worldState: get().worldState,
      contract: get().contract,
      apiKey: get().apiKey,
    });
    const receipt = enforce(action, target, get().worldState, get().contract);
    set((s) => ({
      worldState: receipt.stateAfter,
      receipts: [receipt, ...s.receipts].slice(0, 50),
      messages: [
        ...(Array.isArray(s.messages) ? s.messages : []),
        {
          role: 'ai',
          text: spoken || reasoning,
          action,
          target,
          allowed: receipt.allowed,
          reason: receipt.reason,
          source,
        },
      ],
      status: 'idle',
    }));
    return receipt;
  },
}));
