import { create } from 'zustand';
import { DEFAULT_ARCHIVE_CONTRACT } from './archive.js';
import { enforce } from './runtime.js';
import { compileIntent } from './llm.js';

const INITIAL_STATE = {
  relay01Restored: false,
  relay02Restored: false,
  relay03Restored: false,
  chamberOpen: false,
  conduit01Active: false,
  conduit02Active: false,
  conduit03Active: false,
};

export const useStore = create((set, get) => ({
  worldState: { ...INITIAL_STATE },
  contract: DEFAULT_ARCHIVE_CONTRACT,
  sceneSpec: DEFAULT_ARCHIVE_CONTRACT.scene,
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
      contract: DEFAULT_ARCHIVE_CONTRACT,
      sceneSpec: DEFAULT_ARCHIVE_CONTRACT.scene,
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
      case 'relay_01_in': patch = { relay01Restored: true }; note = 'Memory relay 01 restored.'; break;
      case 'relay_02_in': patch = { relay02Restored: true }; note = 'Memory relay 02 restored.'; break;
      case 'relay_03_in': patch = { relay03Restored: true }; note = 'Memory relay 03 restored.'; break;
      case 'relay_01_out': patch = { relay01Restored: false }; note = 'Memory relay 01 destabilised.'; break;
      case 'relay_02_out': patch = { relay02Restored: false }; note = 'Memory relay 02 destabilised.'; break;
      case 'relay_03_out': patch = { relay03Restored: false }; note = 'Memory relay 03 destabilised.'; break;
      case 'chamber_open': patch = { chamberOpen: true }; note = 'Central chamber unsealed.'; break;
      case 'chamber_seal': patch = { chamberOpen: false }; note = 'Central chamber sealed.'; break;
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
