import * as THREE from 'three';

const POS_RELAY_01 = new THREE.Vector3(-6.5, 0.4, -5);
const POS_RELAY_02 = new THREE.Vector3(0, 0.4, -5);
const POS_RELAY_03 = new THREE.Vector3(6.5, 0.4, -5);
const POS_CHAMBER = new THREE.Vector3(0, 1.6, 0);
const POS_ARCHIVIST = new THREE.Vector3(0, 0.85, 4.5);

const MAT = {};
const makeColor = (hex) => new THREE.Color(hex);

export class ArchiveScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = makeColor(0x091b20);
    this.scene.fog = new THREE.FogExp2(0x091b20, 0.09);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(-7, 5, 10);
    this.camera.lookAt(0, 1.5, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.4;

    this.objs = {};
    this.lights = {};
    this.flash = 0;
    this.idleBob = 0;
    this.idleSway = 0;
    this.cameraDrift = 0;
    this.clock = new THREE.Clock();
    this.selectedId = null;

    this._materials();
    this._buildLights();
    this._build();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _materials() {
    MAT.abyss = new THREE.MeshStandardMaterial({ color: 0x091b20, roughness: 0.9, metalness: 0.05 });
    MAT.teal = new THREE.MeshStandardMaterial({ color: 0x164047, roughness: 0.8, metalness: 0.1 });
    MAT.copper = new THREE.MeshStandardMaterial({ color: 0xb87955, roughness: 0.6, metalness: 0.7 });
    MAT.copperGlow = new THREE.MeshStandardMaterial({ color: 0xb87955, emissive: 0x5a3c2a, emissiveIntensity: 2, roughness: 0.4, metalness: 0.6 });
    MAT.pearl = new THREE.MeshStandardMaterial({ color: 0xe8e0ce, roughness: 0.4, metalness: 0.2 });
    MAT.mint = new THREE.MeshStandardMaterial({ color: 0xa6d8c5, emissive: 0x4a8a6b, emissiveIntensity: 3, roughness: 0.3 });
    MAT.mintGlow = new THREE.MeshBasicMaterial({ color: 0xa6d8c5 });
    MAT.gold = new THREE.MeshStandardMaterial({ color: 0xd4af70, roughness: 0.3, metalness: 0.9 });
    MAT.slate = new THREE.MeshStandardMaterial({ color: 0x65777a, roughness: 0.8, metalness: 0.1 });
    MAT.water = new THREE.MeshStandardMaterial({ color: 0x0b2a33, transparent: true, opacity: 0.4, roughness: 0.1, metalness: 0.1 });
    MAT.relayDamaged = new THREE.MeshStandardMaterial({ color: 0x3d2a1f, emissive: 0x1a0a05, emissiveIntensity: 1, roughness: 0.8 });
    MAT.relayRestored = new THREE.MeshStandardMaterial({ color: 0xa6d8c5, emissive: 0x5ab08a, emissiveIntensity: 4, roughness: 0.3 });
    MAT.chamberSealed = new THREE.MeshStandardMaterial({ color: 0x164047, emissive: 0x0a1a1a, emissiveIntensity: 0.5, roughness: 0.4 });
    MAT.chamberOpen = new THREE.MeshStandardMaterial({ color: 0xa6d8c5, emissive: 0x4a8a6b, emissiveIntensity: 3, roughness: 0.3 });
    MAT.conduitDark = new THREE.MeshStandardMaterial({ color: 0x2a3a3a, roughness: 0.5, metalness: 0.6 });
    MAT.conduitActive = new THREE.MeshStandardMaterial({ color: 0xb87955, emissive: 0x5a3c2a, emissiveIntensity: 3, roughness: 0.3, metalness: 0.8 });
    MAT.archivist = new THREE.MeshStandardMaterial({ color: 0xe8e0ce, roughness: 0.5, metalness: 0.1 });
    MAT.archivistDark = new THREE.MeshStandardMaterial({ color: 0x1a2426, roughness: 0.6, metalness: 0.3 });
  }

  _add(id, mesh) { this.scene.add(mesh); this.objs[id] = mesh; return mesh; }

  _buildLights() {
    const amb = new THREE.AmbientLight(0xffffff, 0.15);
    this.scene.add(amb);

    const key = new THREE.DirectionalLight(0x8fd8d0, 0.6);
    key.position.set(-10, 15, 8);
    key.castShadow = true;
    key.shadow.camera.left = -14; key.shadow.camera.right = 14;
    key.shadow.camera.top = 14; key.shadow.camera.bottom = -14;
    key.shadow.mapSize.width = 2048; key.shadow.mapSize.height = 2048;
    key.shadow.bias = -0.0005;
    this.scene.add(key);

    const fill = new THREE.DirectionalLight(0x7a5a4a, 0.25);
    fill.position.set(10, 8, -6);
    this.scene.add(fill);

    const biolume = new THREE.PointLight(0xa6d8c5, 40, 20);
    biolume.position.set(0, 4, 0);
    this.scene.add(biolume);
    this.lights.biolume = biolume;

    const copperGlow = new THREE.PointLight(0xb87955, 30, 12);
    copperGlow.position.set(0, 2, 0);
    this.scene.add(copperGlow);
    this.lights.copperGlow = copperGlow;

    // Bioluminescent orbs around the room
    for (const [x, y, z] of [[-8, 2, -6], [8, 2, -6], [-6, 3, 2], [6, 3, 2]]) {
      const orb = new THREE.PointLight(0xa6d8c5, 15, 6);
      orb.position.set(x, y, z);
      this.scene.add(orb);
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(0.12, 12, 12),
        new THREE.MeshBasicMaterial({ color: 0xa6d8c5 })
      );
      mesh.position.set(x, y, z);
      this.scene.add(mesh);
      this.objs[`orb_${x}_${y}_${z}`] = mesh;
    }
  }

  _build() {
    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(50, 50), MAT.abyss);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._add('floor', floor);

    // Subtle grid on floor
    const grid = new THREE.GridHelper(50, 25, 0x164047, 0x0a1414);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Memory relays (3 damaged)
    for (const [id, pos] of [['memory_relay_01', POS_RELAY_01], ['memory_relay_02', POS_RELAY_02], ['memory_relay_03', POS_RELAY_03]]) {
      const relay = new THREE.Group();
      relay.position.copy(pos);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.9, 16), MAT.relayDamaged);
      base.position.y = 0.45;
      base.castShadow = true;
      base.receiveShadow = true;
      relay.add(base);
      const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.3, 0), MAT.relayDamaged);
      crystal.position.y = 0.95;
      crystal.castShadow = true;
      relay.add(crystal);
      this.objs[`${id}_crystal`] = crystal;
      this.objs[`${id}_base`] = base;
      this._add(id, relay);
    }

    // Energy conduits (dark initially)
    for (const [id, pos] of [['energy_conduit_01', new THREE.Vector3(-6.5, 0.4, -2)], ['energy_conduit_02', new THREE.Vector3(0, 0.4, -2)], ['energy_conduit_03', new THREE.Vector3(6.5, 0.4, -2)]]) {
      const conduit = new THREE.Group();
      conduit.position.copy(pos);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.18, 2.4, 12), MAT.conduitDark);
      pipe.rotation.z = Math.PI / 2;
      pipe.position.y = 1.6;
      pipe.castShadow = true;
      conduit.add(pipe);
      const core = new THREE.Mesh(new THREE.SphereGeometry(0.22, 12, 12), MAT.conduitDark);
      core.position.y = 0.4;
      conduit.add(core);
      this.objs[`${id}_core`] = core;
      this._add(id, conduit);
    }

    // Central chamber (sealed, dark teal)
    const chamber = new THREE.Group();
    chamber.position.copy(POS_CHAMBER);
    const chamberBody = new THREE.Mesh(new THREE.BoxGeometry(3.2, 2.6, 3.2), MAT.chamberSealed);
    chamberBody.position.y = 1.3;
    chamberBody.castShadow = true;
    chamberBody.receiveShadow = true;
    chamber.add(chamberBody);
    const chamberDoor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 2.2, 0.4), MAT.copper);
    chamberDoor.position.set(0, 1.3, 1.81);
    chamberDoor.castShadow = true;
    chamber.add(chamberDoor);
    this.objs.chamberDoor = chamberDoor;
    this.objs.chamberBody = chamberBody;
    this._add('central_chamber', chamber);

    // Archivist character
    const archivist = new THREE.Group();
    archivist.position.copy(POS_ARCHIVIST);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 1, 16), MAT.archivistDark);
    body.position.y = 0.5;
    body.castShadow = true;
    archivist.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 16), MAT.archivist);
    head.position.y = 1.1;
    head.castShadow = true;
    archivist.add(head);
    const mantle = new THREE.Mesh(new THREE.ConeGeometry(0.5, 0.7, 16), MAT.archivistDark);
    mantle.position.y = 0.15;
    mantle.rotation.x = Math.PI / 2;
    archivist.add(mantle);
    const light = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), MAT.mintGlow);
    light.position.set(0, 1.25, 0.22);
    archivist.add(light);
    this.objs.archivistLight = light;
    this._add('archivist', archivist);

    // Memory chamber (sealed)
    const memChamber = new THREE.Group();
    memChamber.position.set(0, 0, 6);
    const mBody = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.2, 2.6), MAT.chamberSealed);
    mBody.position.y = 1.1;
    mBody.castShadow = true;
    mBody.receiveShadow = true;
    memChamber.add(mBody);
    const mDoor = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.8, 0.4), MAT.copper);
    mDoor.position.set(0, 1.1, 1.51);
    mDoor.castShadow = true;
    memChamber.add(mDoor);
    this._add('memory_chamber', memChamber);

    // Walls
    const back = new THREE.Mesh(new THREE.BoxGeometry(22, 5.5, 0.6), MAT.teal);
    back.position.set(0, 2.75, -10);
    back.receiveShadow = true;
    this.scene.add(back);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 20), MAT.teal);
    l.position.set(-11, 2.75, 0);
    l.rotation.y = Math.PI / 2;
    l.receiveShadow = true;
    this.scene.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.6, 5.5, 20), MAT.teal);
    r.position.set(11, 2.75, 0);
    r.rotation.y = Math.PI / 2;
    r.receiveShadow = true;
    this.scene.add(r);

    // Ceiling arches
    for (const x of [-6, 0, 6]) {
      const arch = new THREE.Group();
      arch.position.set(x, 5, 0);
      const beam = new THREE.Mesh(new THREE.BoxGeometry(0.5, 1, 0.5), MAT.copper);
      beam.position.y = 0.5;
      arch.add(beam);
      const curve = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 2, 12), MAT.copper);
      curve.rotation.z = Math.PI / 2;
      curve.position.y = 1;
      arch.add(curve);
      this.scene.add(arch);
    }

    // Floating particles / marine snow
    const snowGeo = new THREE.BufferGeometry();
    const snowPos = [];
    for (let i = 0; i < 250; i++) {
      snowPos.push((Math.random() - 0.5) * 40, Math.random() * 12, (Math.random() - 0.5) * 40);
    }
    snowGeo.setAttribute('position', new THREE.Float32BufferAttribute(snowPos, 3));
    const snowMat = new THREE.PointsMaterial({ color: 0xa6d8c5, size: 0.06, transparent: true, opacity: 0.4 });
    const snow = new THREE.Points(snowGeo, snowMat);
    this.scene.add(snow);
    this.objs.snow = snow;
  }

  _resize() {
    const w = this.canvas.clientWidth; const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setSelected(id) {
    this.selectedId = id;
  }

  update(dt, state) {
    this.flash += dt * 1.5;

    // Update relay crystals based on restored state
    for (const i of [1, 2, 3]) {
      const id = `memory_relay_0${i}`;
      const restored = state[`relay0${i}Restored`] === true;
      const crystal = this.objs[`${id}_crystal`];
      const base = this.objs[`${id}_base`];
      if (crystal) {
        crystal.material = restored ? MAT.relayRestored : MAT.relayDamaged;
        const pulse = 1 + 0.15 * Math.sin(this.flash * (restored ? 3 : 1));
        crystal.scale.setScalar(pulse);
        crystal.material.emissiveIntensity = restored ? 4 + 2 * Math.abs(Math.sin(this.flash * 2)) : 1;
      }
      if (base) base.material = restored ? MAT.copperGlow : MAT.relayDamaged;
    }

    // Conduits active when relay restored
    for (const i of [1, 2, 3]) {
      const id = `energy_conduit_0${i}`;
      const active = state[`conduit0${i}Active`] === true;
      const core = this.objs[`${id}_core`];
      if (core) {
        core.material = active ? MAT.conduitActive : MAT.conduitDark;
        core.material.emissiveIntensity = active ? 3 + 2 * Math.abs(Math.sin(this.flash * 2)) : 0;
      }
    }

    // Chamber state
    const open = state.chamberOpen === true;
    this.objs.chamberBody.material = open ? MAT.chamberOpen : MAT.chamberSealed;
    const doorOpen = open ? -1.5 : 0;
    const targetDoor = open ? 1.57 : 0;
    this.objs.chamberDoor.rotation.y += (targetDoor - this.objs.chamberDoor.rotation.y) * dt * 3;
    this.objs.chamberDoor.position.z = 1.81 + Math.sin(this.objs.chamberDoor.rotation.y) * 0.9;

    // Archivist idle float
    this.idleBob += dt * 1.5;
    this.idleSway += dt * 1;
    const arch = this.objs.archivist;
    arch.position.y = 0.85 + Math.sin(this.idleBob) * 0.04;
    arch.rotation.y = Math.sin(this.idleSway) * 0.1;
    const light = this.objs.archivistLight;
    if (light) light.material.emissiveIntensity = 3 + Math.abs(Math.sin(this.flash * 2));

    // Copper glow pulse when chamber open
    if (open) {
      this.lights.copperGlow.intensity = 30 + 20 * Math.abs(Math.sin(this.flash * 3));
    } else {
      this.lights.copperGlow.intensity = 5;
    }

    // Snow drift
    if (this.objs.snow) {
      const time = this.clock.getElapsedTime();
      const positions = this.objs.snow.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] -= dt * 0.15;
        positions[i - 1] += Math.sin(time + positions[i]) * dt * 0.05;
        if (positions[i] < -1) positions[i] = 12;
      }
      this.objs.snow.geometry.attributes.position.needsUpdate = true;
    }

    // Camera idle drift
    if (!this.selectedId) {
      this.cameraDrift += dt * 0.35;
      const driftX = Math.sin(this.cameraDrift * 0.6) * 0.4;
      const driftZ = Math.cos(this.cameraDrift * 0.45) * 0.4;
      this.camera.position.set(-7 + driftX, 5, 10 + driftZ);
      this.camera.lookAt(driftX * 0.3, 1.5, driftZ * 0.3);
    }
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
  }
}
