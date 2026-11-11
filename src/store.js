import { create } from 'zustand';
import { DEFAULT_ARCHIVE_CONTRACT } from './archive.js';
import { enforce, commitChangeSet, validatePlayability } from './runtime.js';
import { compileIntent } from './llm.js';

// Build initial object placement from contract scene objects (zone property).
const initialPlacement = {};
for (const obj of DEFAULT_ARCHIVE_CONTRACT.scene.objects) {
  if (obj.zone) initialPlacement[obj.id] = obj.zone;
}

const INITIAL_STATE = {
  relay01Restored: false,
  relay02Restored: false,
  relay03Restored: false,
  chamberOpen: false,
  conduit01Active: false,
  conduit02Active: false,
  conduit03Active: false,
  lowerEntranceSealed: false,
  floodActive: false,
  bridgeRaised: false,
  observatoryOpen: false,
  archivistRerouted: false,
  objectPlacement: { ...initialPlacement },
  worldVersion: 1,
};

export const useStore = create((set, get) => ({
  worldState: { ...INITIAL_STATE },
  contract: DEFAULT_ARCHIVE_CONTRACT,
  sceneSpec: DEFAULT_ARCHIVE_CONTRACT.scene,
  receipts: [],
  messages: [],
  apiKey: localStorage.getItem('kinet_key') || '',
  status: 'idle',
  playability: null,
  undo: null,

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
      playability: null,
      undo: null,
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
      case 'relocate_relay_03_chamber':
        patch = { objectPlacement: { ...s.worldState.objectPlacement, memory_relay_03: 'central_chamber' } };
        note = 'Moved Relay 03 into the central chamber.'; break;
      case 'relocate_relay_03_hall':
        patch = { objectPlacement: { ...s.worldState.objectPlacement, memory_relay_03: 'main_hall' } };
        note = 'Moved Relay 03 back to the main hall.'; break;
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
    const ns = get();
    set({ playability: validatePlayability(ns.worldState, ns.contract) });
  },

  // Coordinated world-change: one instruction → change-set → validate → commit/reject.
  direct: async (instruction) => {
    const s = get();
    const before = { ...s.worldState };

    // Undo snapshot.
    set({ undo: { state: before, version: s.worldState.worldVersion } });

    // 1. Interpret instruction → structured change-set.
    const { changeSet, spoken, source } = await compileChangeSet(instruction, {
      worldState: s.worldState,
      contract: s.contract,
      apiKey: s.apiKey,
    });

    // 2. Validate + atomically commit.
    const result = commitChangeSet(s.worldState, s.contract, changeSet);

    const receipt = {
      id: Date.now().toString(),
      ts: Date.now(),
      actor: 'creator',
      action: 'direct',
      target: 'world',
      allowed: result.committed,
      reason: result.reason,
      stateBefore: before,
      stateAfter: result.committed ? result.worldState : before,
      changeSet,
      validation: result.validation,
    };

    if (result.committed) {
      set((st) => ({
        worldState: result.worldState,
        receipts: [receipt, ...st.receipts].slice(0, 50),
        messages: [
          ...(Array.isArray(st.messages) ? st.messages : []),
          { role: 'ai', text: spoken || reason, action: 'direct', target: 'world', allowed: true, reason: result.reason, source },
        ],
        status: 'idle',
        playability: validatePlayability(result.worldState, s.contract),
        undo: null,
      }));
    } else {
      // Rejection: restore pre-change state, undo no longer valid.
      set((st) => ({
        worldState: before,
        receipts: [receipt, ...st.receipts].slice(0, 50),
        messages: [
          ...(Array.isArray(st.messages) ? st.messages : []),
          { role: 'ai', text: spoken || result.reason, action: 'direct', target: 'world', allowed: false, reason: result.reason, source },
        ],
        status: 'idle',
        playability: validatePlayability(before, s.contract),
        undo: null,
      }));
    }
    return receipt;
  },

  // Coordinated world-change: commit a prepared change-set atomically.
  commitChange: (changeSet) => {
    const s = get();
    const before = { ...s.worldState };
    set({ undo: { state: before, version: s.worldState.worldVersion } });

    const result = commitChangeSet(s.worldState, s.contract, changeSet);
    const receipt = {
      id: Date.now().toString(),
      ts: Date.now(),
      actor: 'creator',
      action: 'direct',
      target: 'world',
      allowed: result.committed,
      reason: result.reason,
      stateBefore: before,
      stateAfter: result.committed ? result.worldState : before,
      changeSet,
      validation: result.validation,
    };

    if (result.committed) {
      set((st) => ({
        worldState: result.worldState,
        receipts: [receipt, ...st.receipts].slice(0, 50),
        messages: [
          ...(Array.isArray(st.messages) ? st.messages : []),
          { role: 'ai', text: result.reason, action: 'direct', target: 'world', allowed: true, reason: result.reason, source: changeSet.source || 'direct' },
        ],
        status: 'idle',
        playability: validatePlayability(result.worldState, s.contract),
        undo: null,
      }));
    } else {
      set((st) => ({
        worldState: before,
        receipts: [receipt, ...st.receipts].slice(0, 50),
        messages: [
          ...(Array.isArray(st.messages) ? st.messages : []),
          { role: 'ai', text: result.reason, action: 'direct', target: 'world', allowed: false, reason: result.reason, source: changeSet.source || 'direct' },
        ],
        status: 'idle',
        playability: validatePlayability(before, s.contract),
        undo: null,
      }));
    }
    return receipt;
  },

  undoChange: () => {
    const s = get();
    if (!s.undo) return null;
    set((st) => ({
      worldState: { ...s.undo.state },
      worldVersion: s.undo.version,
      receipts: [
        {
          id: Date.now().toString(),
          ts: Date.now(),
          actor: 'system',
          action: 'undo',
          target: 'world',
          allowed: true,
          reason: 'Reverted last coordinated change.',
          stateBefore: st.worldState,
          stateAfter: { ...s.undo.state },
        },
        ...st.receipts,
      ].slice(0, 50),
      playability: validatePlayability(s.undo.state, s.contract),
      undo: null,
    }));
    return s.undo;
  },
}));
