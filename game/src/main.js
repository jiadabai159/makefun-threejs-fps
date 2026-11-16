// SABLE YARD: boot and the one loop — a fixed 60 Hz simulation feeding a render at the
// display's rate. Rounds, economy, the spike, grenades and the bots all live here; the
// modules own their own state and main.js wires them together.
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture, renders
// it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld, SITES } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createWeapon, ARSENAL, GRENADE, ARMOR } from './weapon.js';
import { createBots } from './bots.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const ROUND_SECONDS = 100;
const DETONATE_SECONDS = 25;
const PLANT_SECONDS = 3;
const WIN_ROUNDS = 5;
const WIN_MONEY = 325;
const LOSS_MONEY = 190;
const KILL_MONEY = 300;
const PLANT_MONEY = 300;
const START_MONEY = 800;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(seed);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 20, 52);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 140);
scene.add(camera);

const world = createWorld(scene);
const audio = createAudio();
const bots = createBots(scene, world, null, null); // player wired below via callbacks object
const weapon = createWeapon(camera);
const hud = createHud();
const player = createPlayer(world);
const input = createInput(renderer.domElement, onLockChange);
const raycaster = new THREE.Raycaster();
raycaster.far = 90;
const shootables = world.shootables.concat(bots.hitMeshes);
const direction = new THREE.Vector3();
const spikeMesh = new THREE.Group();
const spikeLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 8);

// Spike model: a small orange case with a blinking light, hidden until planted.
{
  const caseMesh = new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.24, 0.34),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.5, metalness: 0.3 }),
  );
  caseMesh.position.y = 0.12;
  const blink = new THREE.Mesh(
    new THREE.SphereGeometry(0.05, 8, 8),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent) }),
  );
  blink.position.y = 0.3;
  spikeMesh.add(caseMesh, blink, spikeLight);
  spikeLight.position.y = 0.5;
  spikeMesh.visible = false;
  scene.add(spikeMesh);
}

// Tracer pool: one fading line per bot shot, reused so the loop makes no new objects.
const tracers = [];
for (let i = 0; i < 8; i += 1) {
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const material = new THREE.LineBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0 });
  const line = new THREE.Line(geometry, material);
  line.frustumCulled = false;
  scene.add(line);
  tracers.push({ line, life: 0 });
}
let tracerIndex = 0;
function fireTracer(from, to) {
  const tracer = tracers[tracerIndex];
  tracerIndex = (tracerIndex + 1) % tracers.length;
  const positions = tracer.line.geometry.attributes.position.array;
  positions[0] = from.x;
  positions[1] = from.y;
  positions[2] = from.z;
  positions[3] = to.x;
  positions[4] = to.y;
  positions[5] = to.z;
  tracer.line.geometry.attributes.position.needsUpdate = true;
  tracer.line.material.opacity = 0.7;
  tracer.life = 0.14;
}

// Grenades in flight: one mesh each, ballistic, fuse then area damage.
const grenades = [];
const grenadeGeometry = new THREE.SphereGeometry(0.09, 10, 8);
const grenadeMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.4, metalness: 0.4 });
function throwGrenade() {
  if (weapon.state.grenades <= 0) return;
  weapon.state.grenades -= 1;
  camera.getWorldDirection(direction);
  const mesh = new THREE.Mesh(grenadeGeometry, grenadeMaterial);
  mesh.castShadow = true;
  mesh.position.copy(camera.position);
  scene.add(mesh);
  grenades.push({
    mesh,
    velocity: new THREE.Vector3(direction.x * 13, direction.y * 13 + 3.5, direction.z * 13),
    fuse: GRENADE.fuse,
  });
  audio.grenadeThrow();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
}
function explodeGrenade(grenade) {
  scene.remove(grenade.mesh);
  const origin = grenade.mesh.position.clone();
  audio.explosion();
  const flash = new THREE.PointLight(new THREE.Color(PALETTE.accent), 60, 18);
  flash.position.copy(origin);
  scene.add(flash);
  setTimeout(() => scene.remove(flash), 250);
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const distance = bot.group.position.distanceTo(origin);
    if (distance > GRENADE.radius) continue;
    const amount = Math.round(GRENADE.maxDamage * (1 - distance / GRENADE.radius));
    if (bots.damage(bot.torso, amount)) onBotKilled(bot, 'Frag Grenade');
    else hud.hitMarker(false);
  }
  const playerDistance = player.state.position.distanceTo(origin);
  if (playerDistance < GRENADE.radius && player.state.alive) {
    const amount = Math.round((GRENADE.maxDamage * (1 - playerDistance / GRENADE.radius)) / 2);
    player.damage(amount);
    audio.hurt();
  }
}

// ---- Match state: one object, everything the rounds read and write. ----
const game = {
  phase: 'menu', // menu | buy | playing | roundEnd | matchEnd
  paused: false,
  round: 1,
  roundsWon: 0,
  roundsLost: 0,
  money: START_MONEY,
  kills: 0,
  timer: ROUND_SECONDS,
  plantProgress: 0,
  plantSite: null,
  spike: null, // {x, z, site, detonateIn}
  spikeDetonated: false,
  elapsed: 0,
  roundEndAt: 0,
};
const ammoStore = {};
function resetAmmoStore() {
  for (const kind of Object.keys(ARSENAL)) {
    ammoStore[kind] = { mag: ARSENAL[kind].mag, reserve: ARSENAL[kind].reserve };
  }
}
resetAmmoStore();

const body = player.state;
const markerHoldMs = shot ? 4000 : 90;
let frozen = false;
let accumulator = 0;
let lastTime = performance.now();
let plantBeepAt = 0;

// Re-wire the bots now that the player exists: the createBots call above got nulls for
// the player state and callbacks, so wire them in through the shared holder.
bots.wire(body, {
  onBotShot(bot, damage) {
    if (shot) return;
    const from = new THREE.Vector3(bot.group.position.x, 1.4, bot.group.position.z);
    const to = new THREE.Vector3(body.position.x, body.position.y + 1.2, body.position.z);
    fireTracer(from, to);
    audio.enemyShot();
    if (damage > 0 && player.state.alive) {
      player.damage(damage);
      audio.hurt();
    }
  },
  onDefuse() {
    endRound(false, 'Spike defused by FOX.');
  },
});

function syncCamera() {
  camera.position.set(body.position.x, body.position.y + body.eye, body.position.z);
  camera.rotation.set(body.pitch, body.yaw, 0, 'YXZ');
}

function aimAt(point) {
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
  syncCamera();
}

function shoot(spread) {
  if (!weapon.takeRound()) {
    audio.dry();
    return false;
  }
  camera.getWorldDirection(direction);
  direction.x += (random() * 2 - 1) * spread;
  direction.y += (random() * 2 - 1) * spread;
  direction.z += (random() * 2 - 1) * spread;
  direction.normalize();
  scene.updateMatrixWorld(true);
  raycaster.set(camera.position, direction);
  const hit = raycaster.intersectObjects(shootables, false)[0];
  if (hit && hit.object.userData.bot) {
    const isHead = hit.object.userData.part === 'head';
    const def = weapon.def();
    const killed = bots.damage(hit.object, isHead ? def.headDamage : def.damage);
    if (killed) onBotKilled(hit.object.userData.bot, def.name);
    else hud.hitMarker(false, markerHoldMs);
  }
  bots.hearShot(body.position.x, body.position.z);
  weapon.pullTrigger();
  player.recoil(0.009 + random() * 0.004, (random() * 2 - 1) * 0.004);
  audio.shot();
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  return true;
}

function onBotKilled(bot, byName) {
  game.kills += 1;
  game.money += KILL_MONEY;
  hud.setMoney(game.money);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.hitMarker(true, markerHoldMs);
  hud.feedLine(`You ▸ ${bot.name} — ${byName} · +$${KILL_MONEY}`);
  audio.kill();
  if (bots.aliveCount() === 0 && game.phase === 'playing') endRound(true, 'All FOX defenders down.');
}

function siteNearPlayer() {
  for (const name of Object.keys(SITES)) {
    const site = SITES[name];
    const dx = body.position.x - site.x;
    const dz = body.position.z - site.z;
    if (dx * dx + dz * dz < site.radius * site.radius) return name;
  }
  return null;
}

function plantSpike(siteName) {
  const site = SITES[siteName];
  game.spike = { x: site.x, z: site.z, site: siteName, detonateIn: DETONATE_SECONDS };
  game.spikeDetonated = false;
  game.money += PLANT_MONEY;
  hud.setMoney(game.money);
  hud.feedLine(`Spike planted at Site ${siteName} · +$${PLANT_MONEY}`);
  hud.showBanner('SPIKE PLANTED', `Detonation in ${DETONATE_SECONDS}s — hold the site.`, 2600);
  audio.plant();
  spikeMesh.position.set(site.x, 0, site.z);
  spikeMesh.visible = true;
}

function endRound(won, reason) {
  if (game.phase !== 'playing') return;
  game.phase = 'roundEnd';
  game.roundEndAt = game.elapsed;
  if (won) {
    game.roundsWon += 1;
    game.money += WIN_MONEY;
    audio.roundWin();
  } else {
    game.roundsLost += 1;
    game.money += LOSS_MONEY;
    audio.roundLose();
  }
  hud.setMoney(game.money);
  hud.setRounds(game.roundsWon, game.roundsLost, WIN_ROUNDS);
  hud.setPlant(0, '');
  spikeMesh.visible = false;
  game.spike = null;
  if (document.pointerLockElement) document.exitPointerLock();
  const matchOver = game.roundsWon >= WIN_ROUNDS || game.roundsLost >= WIN_ROUNDS || game.round >= 9;
  if (matchOver) {
    game.phase = 'matchEnd';
    hud.showOverlay(game.roundsWon > game.roundsLost ? 'matchWin' : 'matchLose');
  } else {
    hud.showOverlay(won ? 'roundWin' : 'roundLose', `${reason} Round ${game.round} — ${game.roundsWon} : ${game.roundsLost}.`);
  }
}

function buyItems() {
  const items = [];
  for (const kind of ['carbine', 'smg', 'dmr', 'pistol']) {
    const def = ARSENAL[kind];
    items.push({
      id: kind, name: def.name, price: def.price, owned: weapon.owned[kind],
      detail: `${def.auto ? 'Auto' : 'Semi'} · ${def.damage} dmg · ${def.mag} rounds`,
    });
  }
  items.push({
    id: 'grenade', name: GRENADE.name, price: GRENADE.price, owned: weapon.state.grenades >= 2,
    detail: `Up to ${GRENADE.maxDamage} damage, ${GRENADE.radius} m radius`,
  });
  items.push({
    id: 'armor', name: ARMOR.name, price: ARMOR.price, owned: player.state.armor > 0,
    detail: `Absorbs half of every hit, ${ARMOR.points} points`,
  });
  return items;
}

function showBuyMenu() {
  hud.showBuy(buyItems(), game.money, (id) => {
    if (id === 'grenade') {
      if (game.money < GRENADE.price || weapon.state.grenades >= 2) return;
      game.money -= GRENADE.price;
      weapon.state.grenades += 1;
    } else if (id === 'armor') {
      if (game.money < ARMOR.price || player.state.armor > 0) return;
      game.money -= ARMOR.price;
      player.state.armor = ARMOR.points;
    } else {
      const def = ARSENAL[id];
      if (weapon.owned[id]) {
        switchWeapon(id);
      } else {
        if (game.money < def.price) return;
        game.money -= def.price;
        weapon.buy(id);
        ammoStore[id] = { mag: def.mag, reserve: def.reserve };
      }
    }
    audio.buy();
    hud.setMoney(game.money);
    hud.setHealth(player.state.health, player.state.armor);
    showBuyMenu();
  }, () => {
    startRound();
  });
}

function switchWeapon(kind) {
  ammoStore[weapon.state.kind] = { mag: weapon.state.mag, reserve: weapon.state.reserve };
  if (weapon.equip(kind)) {
    const stored = ammoStore[kind];
    weapon.state.mag = stored.mag;
    weapon.state.reserve = stored.reserve;
    hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  }
}

function startRound() {
  hud.hideBuy();
  hud.hideOverlay();
  game.phase = 'playing';
  game.paused = false;
  game.timer = ROUND_SECONDS;
  game.plantProgress = 0;
  game.plantSite = null;
  game.spike = null;
  game.spikeDetonated = false;
  spikeMesh.visible = false;
  resetAmmoStore();
  weapon.state.grenades = weapon.state.grenades; // grenades carry between rounds
  player.respawn(0, 11.5, 0);
  bots.reset();
  weapon.refill();
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setTimer(ROUND_SECONDS);
  hud.setRounds(game.roundsWon, game.roundsLost, WIN_ROUNDS);
  hud.setMoney(game.money);
  audio.unlock();
  if (!shot) input.requestLock();
}

function nextRound() {
  game.round += 1;
  game.phase = 'buy';
  showBuyMenu();
}

function restartMatch() {
  game.round = 1;
  game.roundsWon = 0;
  game.roundsLost = 0;
  game.money = START_MONEY;
  game.kills = 0;
  weapon.resetShop();
  resetAmmoStore();
  player.state.armor = 0;
  game.phase = 'buy';
  hud.setRounds(0, 0, WIN_ROUNDS);
  hud.setMoney(START_MONEY);
  showBuyMenu();
}

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    game.paused = false;
    hud.hideOverlay();
    hud.hideBuy();
    if (game.phase === 'menu') {
      game.phase = 'buy';
      showBuyMenu();
    }
  } else if (game.phase === 'playing' && !game.paused) {
    game.paused = true;
    hud.showOverlay('paused');
  }
}

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (game.phase === 'menu') {
    game.phase = 'buy';
    showBuyMenu();
  } else if (game.paused) {
    input.requestLock();
  } else if (game.phase === 'roundEnd') {
    nextRound();
  } else if (game.phase === 'matchEnd') {
    restartMatch();
  }
});

function step(dt) {
  game.elapsed += dt;
  if (game.phase !== 'playing' || game.paused) return;
  game.timer -= dt;
  player.step(dt, input.state.keys);
  weapon.step(dt);
  bots.step(dt, game.elapsed, game.spike);

  // Weapon switching.
  for (const kind of Object.keys(ARSENAL)) {
    if (input.state.keys.has(ARSENAL[kind].key)) switchWeapon(kind);
  }
  if (input.state.keys.has('KeyG')) {
    throwGrenade();
    input.state.keys.delete('KeyG');
  }

  // Grenades in flight.
  for (let i = grenades.length - 1; i >= 0; i -= 1) {
    const grenade = grenades[i];
    grenade.fuse -= dt;
    grenade.velocity.y -= 14 * dt;
    grenade.mesh.position.addScaledVector(grenade.velocity, dt);
    if (grenade.mesh.position.y < 0.09) {
      grenade.mesh.position.y = 0.09;
      grenade.velocity.multiplyScalar(0.4);
      grenade.velocity.y = Math.abs(grenade.velocity.y) * 0.3;
    }
    if (grenade.fuse <= 0) {
      grenades.splice(i, 1);
      explodeGrenade(grenade);
    }
  }

  // Spike countdown and beeps.
  if (game.spike) {
    game.spike.detonateIn -= dt;
    spikeLight.intensity = 6 + Math.sin(game.elapsed * 8) * 5;
    if (game.spike.detonateIn <= 10 && game.elapsed - plantBeepAt >= 1) {
      plantBeepAt = game.elapsed;
      audio.beep();
    }
    if (game.spike.detonateIn <= 0) {
      game.spikeDetonated = true;
      audio.explosion();
      endRound(true, 'Spike detonated.');
    }
  }

  // Planting: hold E inside a site.
  const site = siteNearPlayer();
  if (site && !game.spike && input.state.keys.has('KeyE')) {
    if (game.plantSite !== site) {
      game.plantSite = site;
      game.plantProgress = 0;
    }
    game.plantProgress += dt / PLANT_SECONDS;
    hud.setPlant(game.plantProgress, `Planting spike at Site ${site}…`);
    if (game.plantProgress >= 1) {
      hud.setPlant(0, '');
      plantSpike(site);
    }
  } else {
    game.plantProgress = 0;
    game.plantSite = null;
    hud.setPlant(0, '');
  }

  // Firing and reload.
  if (input.state.firing && weapon.ready()) {
    const def = weapon.def();
    if (def.auto || !input.state.firedOnce) shoot(weapon.spread(player.groundSpeed()));
    input.state.firedOnce = true;
  } else if (!input.state.firing) {
    input.state.firedOnce = false;
  }
  if (input.state.keys.has('KeyR') && weapon.reload()) audio.reload();

  // Tracers fade.
  for (const tracer of tracers) {
    if (tracer.life > 0) {
      tracer.life -= dt;
      tracer.line.material.opacity = Math.max(0, tracer.life * 5);
    }
  }

  // Death and time.
  if (!player.state.alive) endRound(false, 'You were eliminated.');
  else if (game.timer <= 0 && !game.spike) endRound(false, 'Time expired — the spike was never planted.');

  hud.setHealth(player.state.health, player.state.armor);
  hud.setTimer(Math.max(0, Math.ceil(game.timer)));
}

function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - lastTime) / 1000, 0.1);
  lastTime = now;
  if (!frozen) {
    const look = input.takeLook();
    player.look(look.x, look.y);
    accumulator += dt;
    let steps = 0;
    while (accumulator >= FIXED_STEP && steps < 5) {
      step(FIXED_STEP);
      accumulator -= FIXED_STEP;
      steps += 1;
    }
    if (accumulator > FIXED_STEP * 5) accumulator = 0;
    syncCamera();
  }
  renderer.render(scene, camera);
}

function settle(steps) {
  for (let index = 0; index < steps; index += 1) step(FIXED_STEP);
}

function runShot(name) {
  hud.hideOverlay();
  hud.hideBuy();
  body.pitch = 0;
  body.yaw = 0;
  if (name === 'play' || name === 'end') {
    game.phase = 'playing';
    body.position.set(0, 0, 8);
    settle(20);
    if (name === 'play') {
      aimAt(bots.aimPoint(0));
      for (let round = 0; round < 3; round += 1) {
        shoot(0);
        if (round < 2) settle(8);
      }
      settle(12);
      aimAt(bots.aimPoint(1));
      shoot(0);
      settle(1);
    } else {
      for (const bot of bots.bots) bots.damage(bot.torso, 1000);
      game.kills = 4;
      game.money = START_MONEY + 4 * KILL_MONEY + WIN_MONEY;
      game.roundsWon = 1;
      hud.setMoney(game.money);
      hud.setRounds(1, 0, WIN_ROUNDS);
      hud.showOverlay('roundWin', 'Spike detonated at Site A. You take the round.');
      settle(40);
    }
  } else {
    body.position.set(0.6, 0, 11.5);
    settle(20);
    aimAt(new THREE.Vector3(0, 1.5, -6));
    hud.showOverlay('start', 0);
  }
  player.state.health = 100;
  hud.setHealth(100, player.state.armor);
  hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
  hud.setMoney(game.money);
  paintTwiceThenReady();
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera();
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

syncCamera();
hud.setAmmo(weapon.state.mag, weapon.state.reserve, weapon.def().name);
hud.setHealth(100, 0);
hud.setMoney(START_MONEY);
hud.setTimer(ROUND_SECONDS);
hud.setRounds(0, 0, WIN_ROUNDS);

// Debug and playtest API: the shoot script drives the game through this, and a human
// never sees it. start() advances menu -> buy -> playing, exactly like the play button.
window.__game = {
  game,
  player,
  bots,
  start() {
    if (game.phase === 'menu') {
      game.phase = 'buy';
      showBuyMenu();
    } else if (game.phase === 'buy') {
      startRound();
    } else if (game.phase === 'roundEnd') {
      nextRound();
    } else if (game.phase === 'matchEnd') {
      restartMatch();
    }
  },
  aimAtBot(index) {
    aimAt(bots.aimPoint(index));
  },
  fire() {
    shoot(0);
  },
};

if (shot) runShot(shot);
else requestAnimationFrame(frame);
