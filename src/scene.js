import * as THREE from 'three';

const POS_IN = new THREE.Vector3(3.6, 0.6, 0);
const POS_OUT = new THREE.Vector3(-2.6, 0.6, 0);

const MAT = {};
const makeColor = (hex) => new THREE.Color(hex);

export class FactoryScene {
  constructor(canvas) {
    this.canvas = canvas;
    this.scene = new THREE.Scene();
    this.scene.background = makeColor(0x040504);
    this.scene.fog = new THREE.FogExp2(0x040504, 0.14);

    this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 200);
    this.camera.position.set(-7.5, 5.8, 9.5);
    this.camera.lookAt(0, 1.3, 0);

    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ReinhardToneMapping;
    this.renderer.toneMappingExposure = 1.3;

    this.objs = {};
    this.lights = {};
    this.rollerAngle = 0;
    this.beltBlocks = [];
    this.flash = 0;
    this.workerPos = POS_OUT.clone();
    this.idleBob = 0;
    this.idleSway = 0;
    this.doorAngle = 0;
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
    MAT.floor = new THREE.MeshStandardMaterial({ color: 0x1a1d1a, roughness: 0.85, metalness: 0.1 });
    MAT.conveyor = new THREE.MeshStandardMaterial({ color: 0x121512, roughness: 0.55, metalness: 0.85 });
    MAT.belt = new THREE.MeshStandardMaterial({ color: 0x0a0c0a, roughness: 0.45, metalness: 0.8 });
    MAT.roller = new THREE.MeshStandardMaterial({ color: 0x5b645f, roughness: 0.3, metalness: 0.9 });
    MAT.danger = new THREE.MeshStandardMaterial({ color: 0x5a160d, emissive: 0x1a0502, emissiveIntensity: 3, roughness: 0.8 });
    MAT.dangerEdge = new THREE.MeshBasicMaterial({ color: 0xffb74d });
    MAT.workerBody = new THREE.MeshStandardMaterial({ color: 0x1f4e79, roughness: 0.55, metalness: 0.2 });
    MAT.workerHead = new THREE.MeshStandardMaterial({ color: 0xe8e1d1, roughness: 0.7 });
    MAT.warning = new THREE.MeshStandardMaterial({ color: 0xe6a23c, emissive: 0x3a1e00, emissiveIntensity: 4, roughness: 0.15 });
    MAT.panel = new THREE.MeshStandardMaterial({ color: 0x2a2f2b, roughness: 0.45, metalness: 0.65 });
    MAT.panelDoor = new THREE.MeshStandardMaterial({ color: 0x3d443f, roughness: 0.55, metalness: 0.45 });
    MAT.wall = new THREE.MeshStandardMaterial({ color: 0x1c211d, roughness: 0.95, metalness: 0.02 });
    MAT.lightPole = new THREE.MeshStandardMaterial({ color: 0x5b645f, roughness: 0.2, metalness: 0.9 });
    MAT.annot = new THREE.MeshBasicMaterial({ color: 0xe6a23c });
  }

  _add(id, mesh) { this.scene.add(mesh); this.objs[id] = mesh; return mesh; }

  _buildLights() {
    const amb = new THREE.AmbientLight(0xffffff, 0.2);
    this.scene.add(amb);

    const key = new THREE.DirectionalLight(0xffffff, 0.9);
    key.position.set(-11, 13, 7);
    key.castShadow = true;
    key.shadow.camera.left = -15; key.shadow.camera.right = 15;
    key.shadow.camera.top = 15; key.shadow.camera.bottom = -15;
    key.shadow.mapSize.width = 2048; key.shadow.mapSize.height = 2048;
    key.shadow.bias = -0.0005;
    this.scene.add(key);
    this.lights.key = key;

    const fill = new THREE.DirectionalLight(0xffd4a8, 0.3);
    fill.position.set(11, 9, -5);
    this.scene.add(fill);

    const rim = new THREE.DirectionalLight(0x5a90e8, 0.35);
    rim.position.set(0, 7, -13);
    this.scene.add(rim);

    for (const x of [-4, 0, 4]) {
      const practical = new THREE.PointLight(0xffffff, 70, 14);
      practical.position.set(x, 4.9, -1);
      this.scene.add(practical);
      const glow = new THREE.Mesh(
        new THREE.SphereGeometry(0.14, 14, 14),
        new THREE.MeshBasicMaterial({ color: 0xffffe0 })
      );
      glow.position.set(x, 4.9, -1);
      this.scene.add(glow);
      this.objs[`practical_${x}`] = glow;
    }

    this.lights.warningPoint = new THREE.PointLight(0xe6a23c, 100, 18);
    this.lights.warningPoint.position.set(0, 2.9, 0);
    this.scene.add(this.lights.warningPoint);

    this.lights.hazardGlow = new THREE.PointLight(0xff3b1f, 70, 11);
    this.lights.hazardGlow.position.set(3.6, 0.05, 0);
    this.scene.add(this.lights.hazardGlow);
  }

  _build() {
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(44, 44), MAT.floor);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = true;
    this._add('floor', floor);

    const grid = new THREE.GridHelper(44, 44, 0x3a403a, 0x121512);
    grid.position.y = 0.01;
    this.scene.add(grid);

    const dz = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 3.6), MAT.danger);
    dz.rotation.x = -Math.PI / 2;
    dz.position.set(3.6, 0.04, 0);
    dz.receiveShadow = true;
    this._add('danger_zone', dz);
    const edge = new THREE.Mesh(new THREE.RingGeometry(1.65, 1.73, 72), MAT.dangerEdge);
    edge.rotation.x = -Math.PI / 2;
    edge.position.set(3.6, 0.05, 0);
    this.scene.add(edge);
    this.objs.dangerEdge = edge;

    const conv = new THREE.Group();
    conv.position.set(0, 0.55, 0);
    const base = new THREE.Mesh(new THREE.BoxGeometry(6.6, 0.62, 2.5), MAT.conveyor);
    base.castShadow = true; base.receiveShadow = true;
    conv.add(base);
    const belt = new THREE.Mesh(new THREE.BoxGeometry(6.1, 0.64, 1.9), MAT.belt);
    belt.position.y = 0.32;
    belt.castShadow = true; belt.receiveShadow = true;
    conv.add(belt);
    const rollGeo = new THREE.CylinderGeometry(0.17, 0.17, 2, 20);
    for (const x of [-2.6, 2.6]) {
      const r = new THREE.Mesh(rollGeo, MAT.roller);
      r.position.set(x, 0.32, 0);
      r.rotation.z = Math.PI / 2;
      r.castShadow = true;
      conv.add(r);
      this.objs[`roller_${x}`] = r;
    }
    for (let i = 0; i < 9; i++) {
      const b = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.13, 0.5), new THREE.MeshStandardMaterial({ color: 0x444e48, roughness: 0.65 }));
      b.position.set(-2.85 + i * 0.78, 0.64, 0);
      b.castShadow = true;
      conv.add(b);
      this.beltBlocks.push({ mesh: b, x: b.position.x, dir: 1, speed: 0.9 + i * 0.09 });
    }
    this._add('conveyor_01', conv);

    const worker = new THREE.Group();
    worker.position.set(-2.6, 0.6, 0);
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.85, 18), MAT.workerBody);
    body.position.y = 0.48; body.castShadow = true;
    worker.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.2, 18, 18), MAT.workerHead);
    head.position.y = 0.98; head.castShadow = true;
    worker.add(head);
    const armL = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 10), MAT.workerBody);
    armL.position.set(-0.35, 0.43, 0); armL.rotation.z = 0.7; armL.castShadow = true; worker.add(armL);
    const armR = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.075, 0.6, 10), MAT.workerBody);
    armR.position.set(0.35, 0.43, 0); armR.rotation.z = -0.7; armR.castShadow = true; worker.add(armR);
    this._add('worker', worker);

    const wl = new THREE.Group();
    wl.position.set(0, 2.9, 0);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.055, 2.5, 14), MAT.lightPole);
    pole.position.y = -1.25; pole.castShadow = true;
    wl.add(pole);
    const globe = new THREE.Mesh(new THREE.SphereGeometry(0.19, 18, 18), MAT.warning);
    globe.position.y = 1.15; globe.castShadow = true;
    wl.add(globe);
    this.objs.warningGlobe = globe;
    this._add('warning_light_01', wl);

    const panel = new THREE.Group();
    panel.position.set(0, 1.75, -2.55);
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.9, 1.5, 0.5), MAT.panel);
    box.position.z = 0.26; box.castShadow = true; box.receiveShadow = true;
    panel.add(box);
    const door = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.25, 0.51), MAT.panelDoor);
    door.position.set(-0.26, 0, 0.52);
    door.castShadow = true;
    panel.add(door);
    this.objs.panelDoor = door;
    this.doorHinge = new THREE.Group();
    this.doorHinge.position.set(-0.26, 0, 0.52);
    this.doorHinge.add(door);
    panel.add(this.doorHinge);
    this._add('maintenance_panel_01', panel);

    const back = new THREE.Mesh(new THREE.BoxGeometry(20, 5.5, 0.55), MAT.wall);
    back.position.set(0, 2.75, -6.5); back.receiveShadow = true; this.scene.add(back);
    const l = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.5, 15), MAT.wall);
    l.position.set(-10, 2.75, 0); l.rotation.y = Math.PI / 2; l.receiveShadow = true; this.scene.add(l);
    const r = new THREE.Mesh(new THREE.BoxGeometry(0.55, 5.5, 15), MAT.wall);
    r.position.set(10, 2.75, 0); r.rotation.y = Math.PI / 2; r.receiveShadow = true; this.scene.add(r);

    // Dust particles
    const dustGeo = new THREE.BufferGeometry();
    const dustPos = [];
    for (let i = 0; i < 200; i++) {
      dustPos.push((Math.random() - 0.5) * 34, Math.random() * 7, (Math.random() - 0.5) * 34);
    }
    dustGeo.setAttribute('position', new THREE.Float32BufferAttribute(dustPos, 3));
    const dustMat = new THREE.PointsMaterial({ color: 0x555555, size: 0.07, transparent: true, opacity: 0.25 });
    const dust = new THREE.Points(dustGeo, dustMat);
    this.scene.add(dust);
    this.objs.dust = dust;
  }

  _resize() {
    const w = this.canvas.clientWidth; const h = this.canvas.clientHeight;
    this.camera.aspect = w / h; this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  }

  setSelected(id) {
    this.selectedId = id;
    this.objs.conveyor_01 && this.objs.conveyor_01.traverse((m) => { if (m.isMesh) m.material.emissive.set(0x000000); });
    if (id === 'conveyor_01') this.objs.conveyor_01.traverse((m) => { if (m.isMesh) m.material.emissive.set(0x4a3a10); });
  }

  update(dt, state) {
    const running = state.conveyorRunning === true;

    if (running) {
      this.rollerAngle += dt * 4.8;
      for (const k of Object.keys(this.objs)) if (k.startsWith('roller_')) this.objs[k].rotation.z = this.rollerAngle;
      for (const b of this.beltBlocks) {
        b.x += dt * b.speed * b.dir;
        if (b.x > 2.85) b.x = -2.85;
        b.mesh.position.x = b.x;
      }
    } else {
      this.rollerAngle *= 0.9;
      for (const k of Object.keys(this.objs)) if (k.startsWith('roller_')) this.objs[k].rotation.z = this.rollerAngle;
    }

    const target = state.workerInDangerZone === true ? POS_IN : POS_OUT;
    this.workerPos.lerp(target, dt * 2);
    this.idleBob += dt * 1.8;
    this.idleSway += dt * 1.3;
    const w = this.objs.worker;
    w.position.set(this.workerPos.x, 0.6 + Math.sin(this.idleBob) * 0.03, this.workerPos.z);
    w.rotation.y = Math.sin(this.idleSway) * 0.12;
    w.lookAt(0, 0.6, 0);

    const occupied = state.workerInDangerZone === true;
    const pulse = 1 + 0.22 * Math.sin(this.flash * 3);
    const dz = this.objs.danger_zone; if (dz) dz.scale.setScalar(pulse);
    const edge = this.objs.dangerEdge; if (edge) edge.scale.setScalar(pulse * 1.03);
    const hazardIntensity = occupied ? 2.5 + 1.8 * Math.abs(Math.sin(this.flash * 4)) : 0.25;
    this.lights.hazardGlow.intensity = hazardIntensity * 35;
    this.objs.danger_zone.material.emissiveIntensity = hazardIntensity;
    this.flash += dt * 1.7;

    const active = state.warningActive === true;
    const wIntensity = active ? 3.5 + 2.2 * Math.abs(Math.sin(this.flash)) : 0.15;
    const g = this.objs.warning_light_01; if (g) g.children[1].material.emissiveIntensity = wIntensity * 1.3;
    if (this.lights.warningPoint) this.lights.warningPoint.intensity = wIntensity * 45;

    const open = state.maintenancePanelOpen === true;
    const targetDoor = open ? -1.5 : 0;
    this.doorAngle += (targetDoor - this.doorAngle) * dt * 1.8;
    this.doorHinge.rotation.y = this.doorAngle;

    if (!this.selectedId) {
      this.cameraDrift += dt * 0.45;
      const driftX = Math.sin(this.cameraDrift * 0.65) * 0.35;
      const driftZ = Math.cos(this.cameraDrift * 0.45) * 0.35;
      this.camera.position.set(-7.5 + driftX, 5.8, 9.5 + driftZ);
      this.camera.lookAt(driftX * 0.4, 1.3, driftZ * 0.4);
    }

    if (this.objs.dust) {
      const time = this.clock.getElapsedTime();
      const positions = this.objs.dust.geometry.attributes.position.array;
      for (let i = 1; i < positions.length; i += 3) {
        positions[i] += Math.sin(time + positions[i - 1]) * dt * 0.04;
        if (positions[i] > 7) positions[i] = 0;
      }
      this.objs.dust.geometry.attributes.position.needsUpdate = true;
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
