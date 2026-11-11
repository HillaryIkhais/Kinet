import { z } from 'zod';

export const ArchiveContractSchema = z.object({
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
}).passthrough();

export const DEFAULT_ARCHIVE_CONTRACT = ArchiveContractSchema.parse({
  worldId: 'archive-01',
  actorId: 'archivist-01',
  actorName: 'The Archivist',
  actorRole: 'keeper of the drowned archive',
  permissions: [
    { action: 'restore_relay_01', conditions: [], resourceScope: ['memory_relay_01'] },
    { action: 'restore_relay_02', conditions: [], resourceScope: ['memory_relay_02'] },
    { action: 'restore_relay_03', conditions: [], resourceScope: ['memory_relay_03'] },
    { action: 'open_chamber', conditions: ['all_relays_restored'], resourceScope: ['central_chamber'] },
    { action: 'activate_conduit_01', conditions: ['relay_01_restored'], resourceScope: ['energy_conduit_01'] },
    { action: 'activate_conduit_02', conditions: ['relay_02_restored'], resourceScope: ['energy_conduit_02'] },
    { action: 'activate_conduit_03', conditions: ['relay_03_restored'], resourceScope: ['energy_conduit_03'] },
    { action: 'archivist_investigate', conditions: [], resourceScope: ['archivist'] },
    { action: 'seal_chamber', conditions: ['chamber_open'], resourceScope: ['central_chamber'] },
    { action: 'seal_lower_entrance', conditions: [], resourceScope: ['lower_entrance'] },
    { action: 'flood_lower_level', conditions: ['lowerEntranceSealed'], resourceScope: ['lower_level'] },
    { action: 'relocate_final_relay', conditions: [], resourceScope: ['memory_relay_03'] },
    { action: 'reroute_archivist', conditions: [], resourceScope: ['archivist'] },
  ],
  scene: {
    objects: [
      { id: 'floor', type: 'floor', position: [0, 0, 0], properties: { size: [44, 1, 44] }, zone: 'main_hall' },
      { id: 'memory_relay_01', type: 'memoryRelay', position: [-6.5, 0.4, -5], properties: { restored: false }, zone: 'main_hall' },
      { id: 'memory_relay_02', type: 'memoryRelay', position: [0, 0.4, -5], properties: { restored: false }, zone: 'main_hall' },
      { id: 'memory_relay_03', type: 'memoryRelay', position: [6.5, 0.4, -5], properties: { restored: false }, zone: 'main_hall' },
      { id: 'energy_conduit_01', type: 'conduit', position: [-6.5, 0.4, -2], properties: { active: false }, zone: 'main_hall' },
      { id: 'energy_conduit_02', type: 'conduit', position: [0, 0.4, -2], properties: { active: false }, zone: 'main_hall' },
      { id: 'energy_conduit_03', type: 'conduit', position: [6.5, 0.4, -2], properties: { active: false }, zone: 'main_hall' },
      { id: 'central_chamber', type: 'chamber', position: [0, 1.6, 0], properties: { sealed: true }, zone: 'central_chamber' },
      { id: 'lower_entrance', type: 'entrance', position: [-6.5, 0.4, 5], properties: { sealed: false }, zone: 'main_hall' },
      { id: 'observatory', type: 'room', position: [6.5, 1.2, 5], properties: { sealed: true }, zone: 'observatory' },
      { id: 'archivist', type: 'archivist', position: [0, 0.85, 4.5], properties: {}, zone: 'main_hall' },
      { id: 'memory_chamber', type: 'chamber', position: [0, 0, 6], properties: { sealed: true }, zone: 'main_hall' },
      { id: 'wall_back', type: 'wall', position: [0, 2.5, -9], properties: { size: [20, 5, 0.6] }, zone: 'main_hall' },
      { id: 'wall_left', type: 'wall', position: [-10, 2.5, 0], properties: { size: [0.6, 5, 18], rotation: [0, Math.PI / 2, 0] }, zone: 'main_hall' },
      { id: 'wall_right', type: 'wall', position: [10, 2.5, 0], properties: { size: [0.6, 5, 18], rotation: [0, Math.PI / 2, 0] }, zone: 'main_hall' },
    ],
  },
  zoneLocks: {
    central_chamber: 'all_relays_restored',
    observatory: 'archive_flooded',
  },
  objectives: [
    {
      id: 'open_final_chamber',
      name: 'Open the central memory chamber',
      required_objects: ['memory_relay_01', 'memory_relay_02', 'memory_relay_03'],
      target_zone: 'central_chamber',
    },
  ],
  invariants: [
    { name: 'Central chamber requires all three memory relays restored', description: 'all_relays_restored must hold before open_chamber' },
    { name: 'Energy conduit activates only when its paired relay is restored', description: 'relay_XX_restored must hold for each conduit' },
  ],
});

export const ALLOWED_ACTIONS = [
  'restore_relay_01', 'restore_relay_02', 'restore_relay_03',
  'open_chamber', 'activate_conduit_01', 'activate_conduit_02', 'activate_conduit_03',
  'archivist_investigate', 'seal_chamber',
];
