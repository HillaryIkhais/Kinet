import { WorldContractSchema } from './factory.js';

const DERIVED = (s) => ({
  'hazard_zone_empty': !s.workerInDangerZone,
  'maintenance_lock_released': s.maintenanceLockReleased === true,
  'conveyor_stopped': s.conveyorRunning === false,
  'warning_active': s.warningActive === true,
  'maintenance_panel_open': s.maintenancePanelOpen === true,
});

const MUTATIONS = {
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
};

export function enforce(action, targetId, worldState, contract) {
  WorldContractSchema.parse(contract); // guard: contract must be well typed
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
