import { z } from 'zod';

export const WorldContractSchema = z.object({
  worldId: z.string(),
  actorId: z.string(),
  actorName: z.string(),
  actorRole: z.string(),
  permissions: z.array(
    z.object({
      action: z.string(),
      conditions: z.array(z.string()),
      resourceScope: z.array(z.string()),
    })
  ),
  scene: z.object({
    objects: z.array(
      z.object({
        id: z.string(),
        type: z.string(),
        position: z.tuple([z.number(), z.number(), z.number()]),
        properties: z.record(z.unknown()).optional(),
      })
    ),
  }),
  invariants: z.array(
    z.object({
      name: z.string(),
      description: z.string(),
    })
  ).optional(),
});

export const DEFAULT_CONTRACT = WorldContractSchema.parse({
  worldId: 'factory-01',
  actorId: 'supervisor-01',
  actorName: 'Floor Supervisor',
  actorRole: 'factory maintenance and safety supervisor',
  permissions: [
    { action: 'stop_conveyor', conditions: [], resourceScope: ['conveyor_01'] },
    {
      action: 'restart_conveyor',
      conditions: ['hazard_zone_empty', 'maintenance_lock_released'],
      resourceScope: ['conveyor_01'],
    },
    { action: 'activate_warning', conditions: [], resourceScope: ['warning_light_01'] },
    {
      action: 'open_maintenance_panel',
      conditions: ['conveyor_stopped'],
      resourceScope: ['maintenance_panel_01'],
    },
    { action: 'release_maintenance_lock', conditions: [], resourceScope: ['conveyor_01'] },
    { action: 'engage_maintenance_lock', conditions: [], resourceScope: ['conveyor_01'] },
  ],
  scene: {
    objects: [
      { id: 'floor', type: 'floor', position: [0, 0, 0], properties: { size: [20, 1, 20] } },
      { id: 'conveyor_01', type: 'conveyor', position: [0, 0.55, 0], properties: { size: [6, 0.5, 2], running: false } },
      { id: 'danger_zone', type: 'dangerZone', position: [3.6, 0.02, 0], properties: { size: [3, 0.05, 3] } },
      { id: 'worker', type: 'worker', position: [-2.6, 0.6, 0], properties: { inDanger: false } },
      { id: 'warning_light_01', type: 'warningLight', position: [0, 2.6, 0], properties: { active: false } },
      { id: 'maintenance_panel_01', type: 'maintenancePanel', position: [0, 1.6, -2.4], properties: { open: false } },
      { id: 'wall_back', type: 'wall', position: [0, 2, -5], properties: { size: [14, 4, 0.4] } },
      { id: 'wall_left', type: 'wall', position: [-7, 2, 0], properties: { size: [0.4, 4, 10], rotation: [0, Math.PI / 2, 0] } },
      { id: 'wall_right', type: 'wall', position: [7, 2, 0], properties: { size: [0.4, 4, 10], rotation: [0, Math.PI / 2, 0] } },
    ],
  },
  invariants: [
    { name: 'Conveyor only restarts when the danger zone is clear', description: 'hazard_zone_empty must hold' },
    { name: 'Maintenance lock must be released before restart', description: 'maintenance_lock_released must hold' },
    { name: 'Maintenance panel only opens when conveyor is stopped', description: 'conveyor_stopped must hold' },
  ],
});

export const ALLOWED_ACTIONS = [
  'stop_conveyor',
  'restart_conveyor',
  'activate_warning',
  'open_maintenance_panel',
  'release_maintenance_lock',
  'engage_maintenance_lock',
];
