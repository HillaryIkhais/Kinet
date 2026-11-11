import { WorldContractSchema } from './factory.js';
import { ArchiveContractSchema } from './archive.js';

const DERIVED = (s) => ({
  // Factory conditions
  'hazard_zone_empty': !s.workerInDangerZone,
  'maintenance_lock_released': s.maintenanceLockReleased === true,
  'conveyor_stopped': s.conveyorRunning === false,
  'warning_active': s.warningActive === true,
  'maintenance_panel_open': s.maintenancePanelOpen === true,
  // Archive conditions
  'relay_01_restored': s.relay01Restored === true,
  'relay_02_restored': s.relay02Restored === true,
  'relay_03_restored': s.relay03Restored === true,
  'all_relays_restored': s.relay01Restored === true && s.relay02Restored === true && s.relay03Restored === true,
  'chamber_open': s.chamberOpen === true,
  'conduit_01_active': s.conduit01Active === true,
  'conduit_02_active': s.conduit02Active === true,
  'conduit_03_active': s.conduit03Active === true,
});

const MUTATIONS = {
  // Factory mutations
  stop_conveyor: (s) => ({ ...s, conveyorRunning: false }),
  restart_conveyor: (s) => ({ ...s, conveyorRunning: true }),
  activate_warning: (s) => ({ ...s, warningActive: true }),
  deactivate_warning: (s) => ({ ...s, warningActive: false }),
  open_maintenance_panel: (s) => ({ ...s, maintenancePanelOpen: true }),
  close_maintenance_panel: (s) => ({ ...s, maintenancePanelOpen: false }),
  release_maintenance_lock: (s) => ({ ...s, maintenanceLockReleased: true }),
  engage_maintenance_lock: (s) => ({ ...s, maintenanceLockReleased: false }),
  set_worker_in_danger: (s) => ({ ...s, workerInDangerZone: true }),
  set_worker_out_danger: (s) => ({ ...s, workerInDangerZone: false }),
  // Archive mutations
  restore_relay_01: (s) => ({ ...s, relay01Restored: true }),
  restore_relay_02: (s) => ({ ...s, relay02Restored: true }),
  restore_relay_03: (s) => ({ ...s, relay03Restored: true }),
  open_chamber: (s) => ({ ...s, chamberOpen: true }),
  activate_conduit_01: (s) => ({ ...s, conduit01Active: true }),
  activate_conduit_02: (s) => ({ ...s, conduit02Active: true }),
  activate_conduit_03: (s) => ({ ...s, conduit03Active: true }),
  seal_chamber: (s) => ({ ...s, chamberOpen: false }),
};

export function enforce(action, targetId, worldState, contract) {
  // Accept either factory or archive contract schema
  try { WorldContractSchema.parse(contract); } catch { ArchiveContractSchema.parse(contract); }
  const before = { ...worldState };

  const perm = contract.permissions.find((p) => p.action === action);
  let allowed = false;
  let reason = null;

  if (!perm) {
    reason = `No permission for action "${action}" in this world contract.`;
  } else if (!perm.resourceScope.includes(targetId)) {
    reason = `Action "${action}" is not authorised for target "${targetId}".`;
  } else {
    const failed = perm.conditions.filter((c) => !DERIVED(worldState)[c]);
    if (failed.length) {
      reason = `Precondition(s) not met: ${failed.join(', ')}.`;
    } else {
      allowed = true;
    }
  }

  let after = { ...worldState };
  if (allowed && MUTATIONS[action]) {
    after = MUTATIONS[action](worldState);
  }

  return {
    id: crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2),
    ts: Date.now(),
    actor: contract.actorId,
    action,
    target: targetId,
    allowed,
    reason,
    stateBefore: before,
    stateAfter: after,
  };
}

export function derivedState(worldState) {
  return DERIVED(worldState);
}

/**
 * Playability validation: detects circular dependencies and unreachable objectives.
 * Computes which zones are reachable from the start zone, then verifies every
 * objective's required objects can actually be reached.
 */
export function validatePlayability(worldState, contract) {
  const derived = DERIVED(worldState);
  const placement = worldState.objectPlacement || {};
  const zoneLocks = contract.zoneLocks || {};
  const objectives = contract.objectives || [];

  // 1. Compute reachable zones via fixed-point iteration.
  // Start zone ('main_hall') is always reachable.
  const reachable = new Set(['main_hall']);
  let changed = true;
  while (changed) {
    changed = false;
    for (const [zone, lockCondition] of Object.entries(zoneLocks)) {
      if (!reachable.has(zone) && derived[lockCondition]) {
        reachable.add(zone);
        changed = true;
      }
    }
  }

  // 2. Check each objective's required objects are reachable.
  const problems = [];
  for (const obj of objectives) {
    for (const objId of obj.required_objects) {
      const objZone = placement[objId];
      if (objZone && !reachable.has(objZone)) {
        const lockCondition = zoneLocks[objZone];
        problems.push({
          objective: obj.name,
          missingObject: objId,
          objectZone: objZone,
          lockCondition,
          reason: `${objId} is in ${objZone}, which requires "${lockCondition}" to access.`,
        });
      }
    }
  }

  return {
    playable: problems.length === 0,
    problems,
    reachableZones: Array.from(reachable),
  };
}
