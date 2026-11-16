// The arsenal: four hitscan weapons plus a frag grenade, each with its own view model,
// numbers and feel. The weapon owns its state; main.js owns the ray and the damage.
// Spread grows with movement and with sustained fire, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const ARSENAL = {
  carbine: {
    name: 'KR-7 Carbine', key: 'Digit1', price: 0, auto: true,
    mag: 30, reserve: 90, gap: 0.096, reload: 1.9,
    damage: 34, headDamage: 100, spreadStill: 0.0022, spreadMoving: 0.028, kick: 0.055,
  },
  smg: {
    name: 'VK-9 Viper', key: 'Digit2', price: 500, auto: true,
    mag: 32, reserve: 96, gap: 0.06, reload: 1.6,
    damage: 22, headDamage: 55, spreadStill: 0.006, spreadMoving: 0.034, kick: 0.04,
  },
  dmr: {
    name: 'LB-77 Longbow', key: 'Digit3', price: 1200, auto: false,
    mag: 5, reserve: 15, gap: 0.9, reload: 2.6,
    damage: 80, headDamage: 200, spreadStill: 0.0004, spreadMoving: 0.05, kick: 0.14,
  },
  pistol: {
    name: 'P9 Sidearm', key: 'Digit4', price: 0, auto: false,
    mag: 12, reserve: 36, gap: 0.18, reload: 1.4,
    damage: 26, headDamage: 65, spreadStill: 0.004, spreadMoving: 0.03, kick: 0.05,
  },
};
export const GRENADE = { name: 'Frag Grenade', price: 300, fuse: 1.2, radius: 6, maxDamage: 110 };
export const ARMOR = { name: 'Kevlar Vest', price: 400, points: 50 };

export function createWeapon(camera) {
  const grip = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.7, metalness: 0.2 });
  const body = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.5, metalness: 0.35 });
  const dark = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.55, metalness: 0.4 });

  // One view model per weapon, swapped on equip; each is a few boxes shaped like its gun.
  const models = {};
  function buildModel(kind) {
    const model = new THREE.Group();
    if (kind === 'carbine') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.1, 0.42), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.045, 0.4), grip);
      barrel.position.set(0, 0.025, -0.38);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.08, 0.22), grip);
      stock.position.set(0, -0.02, 0.3);
      model.add(receiver, barrel, stock);
    } else if (kind === 'smg') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.3), dark);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.04, 0.04, 0.22), grip);
      barrel.position.set(0, 0.02, -0.24);
      const mag = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.16, 0.07), body);
      mag.position.set(0, -0.11, -0.02);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.07, 0.16), grip);
      stock.position.set(0, -0.01, 0.22);
      model.add(receiver, barrel, mag, stock);
    } else if (kind === 'dmr') {
      const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.09, 0.5), body);
      const barrel = new THREE.Mesh(new THREE.BoxGeometry(0.035, 0.035, 0.5), dark);
      barrel.position.set(0, 0.02, -0.48);
      const scope = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.18), grip);
      scope.position.set(0, 0.08, -0.05);
      const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.09, 0.24), grip);
      stock.position.set(0, -0.015, 0.32);
      model.add(receiver, barrel, scope, stock);
    } else {
      const slide = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.05, 0.2), body);
      const gripMesh = new THREE.Mesh(new THREE.BoxGeometry(0.045, 0.12, 0.06), grip);
      gripMesh.position.set(0, -0.08, 0.06);
      model.add(slide, gripMesh);
    }
    model.position.set(0.24, -0.2, -0.42);
    model.visible = false;
    camera.add(model);
    return model;
  }
  for (const kind of Object.keys(ARSENAL)) models[kind] = buildModel(kind);

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.24, 0.24),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.9, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.position.set(0.24, -0.18, -0.95);
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 5);
  flashLight.position.set(0.24, -0.16, -0.6);
  camera.add(flashLight);

  const owned = { carbine: true, pistol: true, smg: false, dmr: false };
  const state = {
    kind: 'carbine', mag: 30, reserve: 90, cooldown: 0, reloadLeft: 0,
    flash: 0, kick: 0, heat: 0, grenades: 0,
  };
  let model = models.carbine;
  model.visible = true;

  function def() {
    return ARSENAL[state.kind];
  }

  function step(dt) {
    state.cooldown = Math.max(0, state.cooldown - dt);
    state.flash = Math.max(0, state.flash - dt);
    state.heat = Math.max(0, state.heat - dt * 0.5);
    state.kick += (0 - state.kick) * Math.min(1, dt * 14);
    model.position.z = -0.42 + state.kick;
    model.rotation.x = state.kick * 2.2;
    flash.visible = state.flash > 0;
    flash.rotation.z = state.flash * 30;
    flashLight.intensity = state.flash > 0 ? 18 : 0;
    if (state.reloadLeft > 0) {
      state.reloadLeft = Math.max(0, state.reloadLeft - dt);
      model.rotation.x = -0.55 * Math.min(1, (def().reload - state.reloadLeft) * 2);
      if (state.reloadLeft === 0) {
        const need = def().mag - state.mag;
        const take = Math.min(need, state.reserve);
        state.mag += take;
        state.reserve -= take;
      }
    }
  }

  return {
    state,
    owned,
    def,
    step,
    current() {
      return state.kind;
    },
    ready() {
      return state.mag > 0 && state.cooldown === 0 && state.reloadLeft === 0;
    },
    pullTrigger() {
      state.cooldown = def().gap;
      state.flash = 0.06;
      state.kick = def().kick;
      state.heat = Math.min(1, state.heat + 0.12);
    },
    takeRound() {
      if (state.mag <= 0) return false;
      state.mag -= 1;
      return true;
    },
    reload() {
      if (state.reloadLeft > 0 || state.mag === def().mag || state.reserve === 0) return false;
      state.reloadLeft = def().reload;
      return true;
    },
    spread(speed) {
      const d = def();
      return d.spreadStill + Math.min(1, speed / 5.4) * d.spreadMoving + state.heat * 0.012;
    },
    refill() {
      const d = def();
      state.mag = d.mag;
      state.reserve = d.reserve;
      state.cooldown = 0;
      state.reloadLeft = 0;
      state.flash = 0;
      state.kick = 0;
      state.heat = 0;
    },
    equip(kind) {
      if (!owned[kind] || kind === state.kind) return false;
      model.visible = false;
      state.kind = kind;
      model = models[kind];
      model.visible = true;
      this.refill();
      return true;
    },
    buy(kind) {
      if (owned[kind]) return false;
      owned[kind] = true;
      return this.equip(kind);
    },
    resetShop() {
      owned.carbine = true;
      owned.pistol = true;
      owned.smg = false;
      owned.dmr = false;
      state.grenades = 0;
      this.equip('carbine');
    },
  };
}
