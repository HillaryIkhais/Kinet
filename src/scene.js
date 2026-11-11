import * as THREE from 'three';

const POS_IN = new THREE.Vector3(3.6, 0.6, 0);
const POS_OUT = new THREE.Vector3(-2.6, 0.6, 0);

const MAT = {};
const makeColor = (hex) => new THREE.Color(hex);

export class FactoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = makeColor(0x0b0d0b);
    this.scene.fog = new THREE.FogExp2(0x0b0d0b, 0.18);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.1, 120);
    this.camera.position.set(-6.4, 5.2, 8.2);
    this.camera.lookAt(0, 1.0, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    this.objs = {};
    this.lights = {};
    this.rollerAngle = 0;
    this.beltBlocks = [];
    this.flash = 0;
    this.workerPos = POS_OUT.clone();
    this.idleBob = 0;
    this.doorAngle = 0;
    this.clock = new THREE.Clock();
    this.selectedId = null;

    this._materials();
    this._buildLights();
    this._build();
    // Defer initial resize until the canvas is laid out in the DOM.
    requestAnimationFrame(() => this._resize());
    window.addEventListener('resize', () => this._resize());
  }

  _materials() {
    const graphite = 0x1a1d1a, steel = 0x4a514e, rust = 0x8a5a3b;
    MAT.floor = new THREE.MeshStandardMaterial({ color: 0x222621, roughness: 0.85, metalness: 0.15 });
    MAT.floorGrid = new THREE.MeshStandardMaterial({ color: 0x333a34, roughness: 1, metalness: 0 });
    MAT.conveyor = new THREE.MeshStandardMaterial({ color: graphite, roughness: 0.55, metalness: 0.7 });
    MAT.belt = new THREE.MeshStandardMaterial({ color: 0x121512, roughness: 0.45, metalness: 0.6 });
    MAT.roller = new THREE.MeshStandardMaterial({ color: steel, roughness: 0.4, metalness: 0.8 });
    MAT.danger = new THREE.MeshStandardMaterial({ color: 0x8b2a1a, emissive: 0x4a140e, emissiveIntensity: 1.2, roughness: 0.7 });
    MAT.dangerEdge = new THREE.MeshBasicMaterial({ color: 0xffb74d });
    MAT.workerBody = new THREE.MeshStandardMaterial({ color: 0x1f4e79, roughness: 0.55, metalness: 0.2 });
    MAT.workerHead = new THREE.MeshStandardMaterial({ color: 0xe8e1d1, roughness: 0.7 });
    MAT.warning = new THREE.MeshStandardMaterial({ color: 0xe6a23c, emissive: 0x7a4a00, emissiveIntensity: 0.9, roughness: 0.3 });
    MAT.panel = new THREE.MeshStandardMaterial({ color: 0x2c312d, roughness: 0.5, metalness: 0.5 });
    MAT.panelDoor = new THREE.MeshStandardMaterial({ color: 0x3d443f, roughness: 0.55, metalness: 0.4 });
    MAT.wall = new THREE.MeshStandardMaterial({ color: 0x2a2f2b, roughness: 0.9, metalness: 0.1 });
    MAT.lightPole = new THREE.MeshStandardMaterial({ color: steel, roughness: 0.3, metalness: 0.8 });
    MAT.annot = new THREE.MeshBasicMaterial({ color: 0xe6a23c });
  }

  _add(id, mesh) { this.scene.add(mesh); this.objs[id] = mesh; return mesh; }

  _buildLights() {
    const amb = new THREE.AmbientLight(0xffffff, 0.35);
    this.scene.add(amb);

    const dir = new THREE.DirectionalLight(0xffffff, 0.9);
    dir.position.set(-8, 14, 6);
    dir.castShadow = true;
    dir.shadow.camera.left = -11; dir.shadow.camera.right = 11;
    dir.shadow.camera.top = 11; dir.shadow.camera.bottom = -11;
    dir.shadow.mapSize.width = 2048; dir.shadow.mapSize.height = 2048;
    dir.shadow.bias = -0.0005;
    this.scene.add(dir);
    this.lights.sun = dir;

    // overhead industrial banks
    const bank1 = new THREE.RectAreaLight(0xffffff, 120, 6, 4);
    bank1.position.set(-3, 5.2, -1); bank1.lookAt(0, 0, 0);
    this.scene.add(bank1);
    const bank2 = new THREE.RectAreaLight(0xffffff, 120, 6, 4);
    bank2.position.set(3, 5.2, 1); bank2.lookAt(0, 0, 0);
    this.scene.add(bank2);
    try { require('three/addons/RectAreaLightUniformsLib.js'); } catch (e) {}

    this.lights.warningPoint = new THREE.PointLight(0xe6a23c, 0, 14);
    this.lights.warningPoint.position.set(0, 2.7, 0);
    this.scene.add(this.lights.warningPoint);

    const hazardGlow = new THREE.PointLight(0xff3b1f, 0, 9);
    hazardGlow.position.set(3.6, 0.05, 0);
    this.scene.add(hazardGlow);
    this.lights.hazardGlow = hazardGlow;
  }

  _build() {
    // Floor with grid
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(30, 30), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._add('floor', floor);

    const grid = new THREE.GridHelper(30, 30, 0x3d423d, 0x1f2420);
    grid.position.y = 0.01;
    this.scene.add(grid);

    // Danger zone (pulsing boundary)
    const dz = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 3.2), MAT.danger);
    dz.rotation.x = -Math.PI / 2;
    dz.position.set(3.6, 0.04, 0);
    dz.receiveShadow = true;
    this._add('danger_zone', dz);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1.55, 1.62, 64), MAT.dangerEdge);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(3.6, 0.05, 0);
    this.scene.add(edge);
    this.objs.dangerEdge = edge;

    // Conveyor
    const conv = new THREE.Group();
    conv.position.set(0, 0.55, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.2, 0.55, 2.2), MAT.conveyor);
    base.castShadow = true; base.receiveShadow = true;
    conv.add(base);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(5.7, 0.57, 1.7), MAT.belt);
    belt.position.y = 0.285;
    belt.castShadow = true; belt.receiveShadow = true;
    conv.add(belt);
    const rollGeo = new THREE.CylinderGeometry(0.15, 0.15, 1.8, 16);
    for (const x of [-2.4, 2.4]) {
      const r = new THREE.Mesh(rollGeo, MAT.roller);
      r.position.set(x, 0.285, 0);
      r.rotation.z = Math.PI / 2;
      r.castShadow = true;
      conv.add(r);
      this.objs[`roller_${x}`] = r;
    }
    for (let i = 0; i < 7; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.11, 0.55), new THREE.MeshStandardMaterial({ color: 0x5b645f, roughness: 0.6 }));
      b.position.set(-2.55 + i * 0.95, 0.595, 0);
      b.castShadow = true;
      conv.add(b);
      this.beltBlocks.push({ mesh: b, x: b.position.x, dir: 1, speed: 1.1 + i * 0.12 });
    }
    this._add('conveyor_01', conv);

    // Worker
    const worker = new THREE.Group();
    worker.position.set(-2.6, 0.6, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.75, 14), MAT.workerBody);
    body.position.y = 0.42; body.castShadow = true;
    worker.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.18, 14, 14), MAT.workerHead);
    head.position.y = 0.86; head.castShadow = true;
    worker.add(head);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), MAT.workerBody);
    armL.position.set(-0.31, 0.35, 0); armL.rotation.z = 0.5; armL.castShadow = true; worker.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.5, 10), MAT.workerBody);
    armR.position.set(0.31, 0.35, 0); armR.rotation.z = -0.5; armR.castShadow = true; worker.add(armR);
    this._add('worker', worker);

    // Warning light
    const wl = new THREE.Group();
    wl.position.set(0, 2.7, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 2.3, 10), MAT.lightPole);
    pole.position.y = -1.15; pole.castShadow = true;
    wl.add(pole);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 16), MAT.warning);
    globe.position.y = 1.05; globe.castShadow = true;
    wl.add(globe);
    this.objs.warningGlobe = globe;
    this._add('warning_light_01', wl);

    // Maintenance panel
    const panel = new THREE.Group();
    panel.position.set(0, 1.65, -2.45);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.7, 1.3, 0.4), MAT.panel);
    box.position.z = 0.2; box.castShadow = true; box.receiveShadow = true;
    panel.add(box);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.4, 1.1, 0.41), MAT.panelDoor);
    door.position.set(-0.22, 0, 0.415);
    door.castShadow = true;
    panel.add(door);
    this.objs.panelDoor = door;
    this.doorHinge = new THREE.Group();
    this.doorHinge.position.set(-0.22, 0, 0.415);
    this.doorHinge.add(door);
    panel.add(this.doorHinge);
    this._add('maintenance_panel_01', panel);

    // Walls
    const back = new THREE.Mesh(new THREE.BoxGeometry(16, 4.5, 0.45), MAT.wall);
    back.position.set(0, 2.25, -5.5); back.receiveShadow = true; this.scene.add(back);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 12), MAT.wall);
    l.position.set(-8, 2.25, 0); l.rotation.y = Math.PI / 2; l.receiveShadow = true; this.scene.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.45, 4.5, 12), MAT.wall);
    r.position.set(8, 2.25, 0); r.rotation.y = Math.PI / 2; r.receiveShadow = true; this.scene.add(r);

    // Ceiling fixtures
    for (const x of [-4, 0, 4]) {
      const fix = new THREE.Group();
      fix.position.set(x, 4.9, -1);
      const cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.35, 10), MAT.lightPole);
      cyl.position.y = -0.175; fix.add(cyl);
      const shade = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 0.5, 12), new THREE.MeshStandardMaterial({ color: 0x2a2f2b }));
      shade.position.y = -0.525; fix.add(shade);
      this.scene.add(fix);
    }
  }

  _resize() {
    const w = this.canvas.clientWidth; const h = this.canvas.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setSelected(id) {
    this.selectedId = id;
    // clear previous emissive outlines
    this.objs.conveyor_01 && this.objs.conveyor_01.traverse((m) => { if (m.isMesh) m.material.emissive.set(0x000000); });
    if (id === 'conveyor_01') this.objs.conveyor_01.traverse((m) => { if (m.isMesh) m.material.emissive.set(0x4a3a10); });
  }

  update(dt, state) {
    const running = state.conveyorRunning === true;
    if (running) {
      this.rollerAngle += dt * 4.2;
      for (const k of Object.keys(this.objs)) if (k.startsWith('roller_')) this.objs[k].rotation.z = this.rollerAngle;
      for (const b of this.beltBlocks) {
        b.x += dt * b.speed * b.dir;
        if (b.x > 2.6) b.x = -2.6;
        b.mesh.position.x = b.x;
      }
    } else {
      this.rollerAngle *= 0.94;
      for (const k of Object.keys(this.objs)) if (k.startsWith('roller_')) this.objs[k].rotation.z = this.rollerAngle;
    }

    // Worker movement + idle bob
    const target = state.workerInDangerZone === true ? POS_IN : POS_OUT;
    this.workerPos.lerp(target, dt * 2.5);
    this.idleBob += dt * 2.2;
    const w = this.objs.worker;
    w.position.set(this.workerPos.x, 0.6 + Math.sin(this.idleBob) * 0.03, this.workerPos.z);
    w.lookAt(0, 0.6, 0);

    // Danger zone pulse + glow when occupied
    const occupied = state.workerInDangerZone === true;
    const pulse = 1 + 0.15 * Math.sin(this.flash * 3);
    const dz = this.objs.danger_zone; if (dz) dz.scale.setScalar(pulse);
    const edge = this.objs.dangerEdge; if (edge) edge.scale.setScalar(pulse);
    const hazardIntensity = occupied ? 1.2 + 0.6 * Math.abs(Math.sin(this.flash * 4)) : 0.15;
    this.lights.hazardGlow.intensity = hazardIntensity;
    this.objs.danger_zone.material.emissiveIntensity = hazardIntensity * 0.9;
    this.flash += dt * 2;

    // Warning flash
    const active = state.warningActive === true;
    this.flash += dt * 0; // already incremented above; use separate
    const wIntensity = active ? 0.9 + 0.7 * Math.abs(Math.sin(this.flash)) : 0;
    const g = this.objs.warning_light_01; if (g) g.children[1].material.emissiveIntensity = wIntensity * 2;
    if (this.lights.warningPoint) this.lights.warningPoint.intensity = wIntensity * 5;

    // Maintenance panel door
    const open = state.maintenancePanelOpen === true;
    const targetDoor = open ? -1.5 : 0;
    this.doorAngle += (targetDoor - this.doorAngle) * dt * 2.5;
    this.doorHinge.rotation.y = this.doorAngle;
  }

  render() {
    this.renderer.render(this.scene, this.camera);
  }

  dispose() {
    window.removeEventListener('resize', this._resize);
    this.renderer.dispose();
  }
}
