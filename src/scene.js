import * as THREE from 'three';

const POS_IN = new THREE.Vector3(3.6, 0.6, 0);
const POS_OUT = new THREE.Vector3(-2.6, 0.6, 0);

const MAT = {};
const makeColor = (hex) => new THREE.Color(hex);

export class FactoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = makeColor(0xe9eef6);
    this.scene.fog = new THREE.Fog(0xe9eef6, 6, 24);

    this.camera = new THREE.PerspectiveCamera(55, 1, 0.1, 100);
    this.camera.position.set(-5.2, 5.6, 7.6);
    this.camera.lookAt(0, 0.9, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.objs = {};
    this.lights = {};
    this.rollerAngle = 0;
    this.beltBlocks = [];
    this.flash = 0;
    this.workerPos = POS_OUT.clone();
    this.clock = new THREE.Clock();

    this._materials();
    this._build();
    this._resize();
    window.addEventListener('resize', () => this._resize());
  }

  _materials() {
    MAT.floor = new THREE.MeshStandardMaterial({ color: 0x9aa5b1, roughness: 0.8 });
    MAT.conveyorBase = new THREE.MeshStandardMaterial({ color: 0x3d4451, roughness: 0.6 });
    MAT.belt = new THREE.MeshStandardMaterial({ color: 0x2a2f38, roughness: 0.4 });
    MAT.roller = new THREE.MeshStandardMaterial({ color: 0x8a93a0, metalness: 0.6, roughness: 0.3 });
    MAT.danger = new THREE.MeshStandardMaterial({ color: 0xef4444, emissive: 0x5b1a1a, emissiveIntensity: 0.6, roughness: 0.6 });
    MAT.workerBody = new THREE.MeshStandardMaterial({ color: 0x2563eb, roughness: 0.5 });
    MAT.workerHead = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.6 });
    MAT.warning = new THREE.MeshStandardMaterial({ color: 0xf59e0b, emissive: 0x7a3a00, emissiveIntensity: 0.5, roughness: 0.3 });
    MAT.panel = new THREE.MeshStandardMaterial({ color: 0xe2e8f0, roughness: 0.5 });
    MAT.panelDoor = new THREE.MeshStandardMaterial({ color: 0xcbd5e1, roughness: 0.5 });
    MAT.wall = new THREE.MeshStandardMaterial({ color: 0xb9c2cf, roughness: 0.8 });
    MAT.lightPole = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.4 });
  }

  _add(id, mesh) {
    this.scene.add(mesh);
    this.objs[id] = mesh;
    return mesh;
  }

  _build() {
    // Lights
    const amb = new THREE.AmbientLight(0xffffff, 0.55);
    this.scene.add(amb);
    const dir = new THREE.DirectionalLight(0xffffff, 1.1);
    dir.position.set(-6, 10, 6);
    dir.castShadow = true;
    dir.shadow.camera.left = -9; dir.shadow.camera.right = 9;
    dir.shadow.camera.top = 9; dir.shadow.camera.bottom = -9;
    dir.shadow.mapSize.width = 1024; dir.shadow.mapSize.height = 1024;
    this.scene.add(dir);
    this.lights.warningPoint = new THREE.PointLight(0xf59e0b, 0, 10);
    this.lights.warningPoint.position.set(0, 2.6, 0);
    this.scene.add(this.lights.warningPoint);

    // Floor
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(24, 24), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._add('floor', floor);

    // Danger zone
    const dz = new THREE.Mesh(new THREE.PlaneGeometry(3, 3), MAT.danger);
    dz.rotation.x = -Math.PI / 2;
    dz.position.set(3.6, 0.03, 0);
    dz.receiveShadow = true;
    this._add('danger_zone', dz);

    // Conveyor
    const conv = new THREE.Group();
    conv.position.set(0, 0.55, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6, 0.5, 2), MAT.conveyorBase);
    base.castShadow = true; base.receiveShadow = true;
    conv.add(base);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.52, 1.6), MAT.belt);
    belt.position.y = 0.26;
    belt.castShadow = true; belt.receiveShadow = true;
    conv.add(belt);
    // rollers
    const rollGeo = new THREE.CylinderGeometry(0.14, 0.14, 1.7, 12);
    for (const x of [-2.3, 2.3]) {
      const r = new THREE.Mesh(rollGeo, MAT.roller);
      r.position.set(x, 0.26, 0);
      r.rotation.z = Math.PI / 2;
      r.castShadow = true;
      conv.add(r);
      this.objs[`roller_${x}`] = r;
    }
    // belt blocks
    for (let i = 0; i < 6; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.1, 0.5), new THREE.MeshStandardMaterial({ color: 0x64748b }));
      b.position.set(-2.5 + i * 1.0, 0.56, 0);
      b.castShadow = true;
      conv.add(b);
      this.beltBlocks.push({ mesh: b, x: b.position.x, dir: 1, speed: 1.2 + i * 0.15 });
    }
    this._add('conveyor_01', conv);

    // Worker
    const worker = new THREE.Group();
    worker.position.set(-2.6, 0.6, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.22, 0.7, 12), MAT.workerBody);
    body.position.y = 0.35; body.castShadow = true;
    worker.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.17, 12, 12), MAT.workerHead);
    head.position.y = 0.78; head.castShadow = true;
    worker.add(head);
    this._add('worker', worker);

    // Warning light
    const wl = new THREE.Group();
    wl.position.set(0, 2.6, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.2, 8), MAT.lightPole);
    pole.position.y = -1.1; pole.castShadow = true;
    wl.add(pole);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.16, 14, 14), MAT.warning);
    globe.position.y = 1.0; globe.castShadow = true;
    wl.add(globe);
    this.objs.warningGlobe = globe;
    this._add('warning_light_01', wl);

    // Maintenance panel (wall mounted)
    const panel = new THREE.Group();
    panel.position.set(0, 1.6, -2.4);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, 0.35), MAT.panel);
    box.position.z = 0.18; box.castShadow = true; box.receiveShadow = true;
    panel.add(box);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.0, 0.36), MAT.panelDoor);
    door.position.set(-0.18, 0, 0.37);
    door.castShadow = true;
    panel.add(door);
    this.objs.panelDoor = door;
    this.doorHinge = new THREE.Group();
    this.doorHinge.position.set(-0.18, 0, 0.37);
    this.doorHinge.add(door);
    panel.add(this.doorHinge);
    this._add('maintenance_panel_01', panel);

    // Walls
    const back = new THREE.Mesh(new THREE.BoxGeometry(14, 4, 0.4), MAT.wall);
    back.position.set(0, 2, -5); back.receiveShadow = true; this.scene.add(back);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 10), MAT.wall);
    l.position.set(-7, 2, 0); l.rotation.y = Math.PI / 2; l.receiveShadow = true; this.scene.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.4, 4, 10), MAT.wall);
    r.position.set(7, 2, 0); r.rotation.y = Math.PI / 2; r.receiveShadow = true; this.scene.add(r);

    // Ceiling light
    const ceiling = new THREE.PointLight(0xffffff, 0.8, 20);
    ceiling.position.set(0, 4.5, 0);
    this.scene.add(ceiling);
  }

  _resize() {
    const w = this.canvas.clientWidth;
    const h = this.canvas.clientHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  update(dt, state) {
    // Conveyor animation
    const running = state.conveyorRunning === true;
    if (running) {
      this.rollerAngle += dt * 4;
      for (const k of Object.keys(this.objs)) {
        if (k.startsWith('roller_')) this.objs[k].rotation.z = this.rollerAngle;
      }
      for (const b of this.beltBlocks) {
        b.x += dt * b.speed * b.dir;
        if (b.x > 2.5) { b.x = -2.5; }
        b.mesh.position.x = b.x;
      }
    }

    // Worker target from state
    const target = state.workerInDangerZone === true ? POS_IN : POS_OUT;
    this.workerPos.lerp(target, dt * 3);
    const w = this.objs.worker;
    w.position.copy(this.workerPos);
    w.position.y = 0.6;
    w.lookAt(0, 0.6, 0);

    // Warning flash
    const active = state.warningActive === true;
    this.flash += dt * 7;
    const intens = active ? 0.5 + 0.5 * Math.abs(Math.sin(this.flash)) : 0;
    const g = this.objs.warning_light_01;
    g.children[1].material.emissiveIntensity = intens * 2;
    if (this.lights.warningPoint) this.lights.warningPoint.intensity = intens * 4;

    // Maintenance panel door
    const open = state.maintenancePanelOpen === true;
    const targetDoor = open ? -1.4 : 0;
    this.doorAngle += (targetDoor - this.doorAngle) * dt * 3;
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
