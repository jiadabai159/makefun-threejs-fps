// The FOX defence: four bots that patrol the yard on waypoint routes, hold the bomb
// sites, investigate gunfire, and fight back. Each bot is a body with a torso and a head
// (a head shot does double damage), a gun, and a small state machine. They see the player
// only with a real line of sight, hear shots, and after a plant they converge on the spike
// to defuse it. When one dies it falls, and the round ends when the last one falls.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { WAYPOINTS } from './world.js';

const HEALTH = 100;
const FALL_SECONDS = 0.45;
const PATROL_SPEED = 3.1;
const FIGHT_SPEED = 4.3;
const SEE_RANGE = 38;
const HEAR_RANGE = 26;
const SHOT_GAP = 0.22;
const BOT_DAMAGE = 6;
const BURST_SHOTS = 4;
const DEFUSE_SECONDS = 5;

const NAMES = ['Rook', 'Vex', 'Moss', 'Ivy'];
const HOMES = [
  { waypoint: 10, hold: 10 },
  { waypoint: 14, hold: 14 },
  { waypoint: 12, hold: 12 },
  { waypoint: 7, hold: 7 },
];

export function createBots(scene, world, playerState, callbacks) {
  // The player state and callbacks are wired in after construction (main.js creates the
  // player after the bots), so they live in one mutable holder the closures read.
  const wiring = { playerState, callbacks };
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.hairline), roughness: 0.65, metalness: 0.05 });
  const headMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), roughness: 0.45, metalness: 0.1 });
  const legMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.surface), roughness: 0.85 });
  const torsoGeometry = new THREE.BoxGeometry(0.56, 0.8, 0.32);
  const headGeometry = new THREE.SphereGeometry(0.16, 16, 12);
  const legGeometry = new THREE.BoxGeometry(0.2, 0.62, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.55);

  const bots = [];
  const hitMeshes = [];
  const raycaster = new THREE.Raycaster();
  raycaster.far = 60;
  const losFrom = new THREE.Vector3();
  const losDir = new THREE.Vector3();
  let now = 0;

  for (let index = 0; index < 4; index += 1) {
    const home = WAYPOINTS[HOMES[index].waypoint];
    const group = new THREE.Group();
    group.position.set(home[0], 0, home[1]);

    const legL = new THREE.Mesh(legGeometry, legMaterial);
    legL.position.set(-0.14, 0.31, 0);
    const legR = new THREE.Mesh(legGeometry, legMaterial);
    legR.position.set(0.14, 0.31, 0);
    const torso = new THREE.Mesh(torsoGeometry, bodyMaterial);
    torso.position.y = 1.02;
    torso.userData.part = 'torso';
    const head = new THREE.Mesh(headGeometry, headMaterial);
    head.position.y = 1.56;
    head.userData.part = 'head';
    const gun = new THREE.Mesh(gunGeometry, legMaterial);
    gun.position.set(0.2, 1.05, -0.2);
    group.add(legL, legR, torso, head, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = true;
      }
    });
    scene.add(group);

    const bot = {
      group, torso, head, gun, legL, legR,
      name: NAMES[index],
      health: HEALTH, alive: true, fall: 0,
      state: 'hold', waypoint: HOMES[index].waypoint, hold: HOMES[index].hold,
      yaw: Math.PI, target: null, seeTimer: 0, shotTimer: 0,
      defuse: 0, walkPhase: Math.random() * 6, burst: 0, acquireAt: -10,
      velocity: new THREE.Vector3(),
    };
    torso.userData.bot = bot;
    head.userData.bot = bot;
    hitMeshes.push(torso, head);
    bots.push(bot);
  }

  // True line of sight: a ray from the bot's head to the player's chest, blocked by any
  // world surface. Checked on a timer, not every frame.
  function canSee(bot) {
    const player = wiring.playerState;
    if (!player || !player.alive) return false;
    losFrom.set(bot.group.position.x, 1.5, bot.group.position.z);
    losDir.set(
      player.position.x - losFrom.x,
      player.position.y + 1.2 - losFrom.y,
      player.position.z - losFrom.z,
    );
    const distance = losDir.length();
    if (distance > SEE_RANGE) return false;
    losDir.normalize();
    raycaster.set(losFrom, losDir);
    const hit = raycaster.intersectObjects(world.shootables, false)[0];
    return !hit || hit.distance > distance;
  }

  function nearestWaypoint(x, z) {
    let best = 0;
    let bestDistance = Infinity;
    for (let i = 0; i < WAYPOINTS.length; i += 1) {
      const dx = WAYPOINTS[i][0] - x;
      const dz = WAYPOINTS[i][1] - z;
      const d = dx * dx + dz * dz;
      if (d < bestDistance) {
        bestDistance = d;
        best = i;
      }
    }
    return best;
  }

  // Walk toward a point through the waypoint graph: head for the nearest waypoint, then
  // step along the list toward the goal waypoint. Bots never cut across the map.
  function walkToward(bot, x, z, speed, dt) {
    const goal = nearestWaypoint(x, z);
    let target = WAYPOINTS[goal];
    const dx = target[0] - bot.group.position.x;
    const dz = target[1] - bot.group.position.z;
    const distance = Math.hypot(dx, dz);
    if (distance < 0.6 && goal !== bot.waypoint) {
      bot.waypoint = goal;
      return true;
    }
    if (distance > 0.15) {
      const stepLength = Math.min(distance, speed * dt);
      bot.velocity.set((dx / distance) * speed, 0, (dz / distance) * speed);
      bot.group.position.x += (dx / distance) * stepLength;
      bot.group.position.z += (dz / distance) * stepLength;
      bot.yaw = Math.atan2(dx, dz);
      bot.walkPhase += dt * 9;
      const swing = Math.sin(bot.walkPhase) * 0.35;
      bot.legL.rotation.x = swing;
      bot.legR.rotation.x = -swing;
      // Keep bots out of walls with the shared mover's overlap test.
      if (world.overlaps(bot.group.position.x, 0, bot.group.position.z, 0.4, 1.7, 0.02)) {
        bot.group.position.x -= (dx / distance) * stepLength;
        bot.group.position.z -= (dz / distance) * stepLength;
      }
    }
    return false;
  }

  function damage(mesh, amount) {
    const bot = mesh.userData.bot;
    if (!bot || !bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      if (bot.state !== 'engage') bot.acquireAt = now;
      bot.state = 'engage';
      return false;
    }
    bot.alive = false;
    bot.fall = 0;
    bot.state = 'dead';
    return true;
  }

  function step(dt, time, spike) {
    now = time;
    for (const bot of bots) {
      if (!bot.alive) {
        bot.fall = Math.min(1, bot.fall + dt / FALL_SECONDS);
        bot.group.rotation.x = -bot.fall * 1.5;
        bot.group.position.y = -bot.fall * 0.1;
        continue;
      }
      bot.seeTimer -= dt;
      if (bot.seeTimer <= 0) {
        bot.seeTimer = 0.15;
        if (canSee(bot)) {
          if (bot.state !== 'engage') bot.acquireAt = now;
          bot.state = 'engage';
          bot.target = { x: wiring.playerState.position.x, z: wiring.playerState.position.z };
        } else if (bot.state === 'engage') {
          bot.state = 'investigate';
        }
      }

      if (bot.state === 'engage' && wiring.playerState && wiring.playerState.alive) {
        const dx = wiring.playerState.position.x - bot.group.position.x;
        const dz = wiring.playerState.position.z - bot.group.position.z;
        const distance = Math.hypot(dx, dz);
        bot.yaw = Math.atan2(dx, dz);
        // Strafe a little while firing, and close in when far away.
        if (distance > 14) walkToward(bot, wiring.playerState.position.x, wiring.playerState.position.z, FIGHT_SPEED, dt);
        else {
          bot.group.position.x += Math.sin(now * 1.3 + bot.walkPhase) * 0.6 * dt;
          bot.group.position.z += Math.cos(now * 1.1 + bot.walkPhase) * 0.6 * dt;
        }
        bot.shotTimer -= dt;
        if (bot.shotTimer <= 0 && distance < SEE_RANGE) {
          if (bot.burst >= BURST_SHOTS) {
            // Burst done: hold fire for a beat so the player can reposition.
            bot.burst = 0;
            bot.shotTimer = 1.2 + Math.random() * 0.8;
          } else {
            bot.shotTimer = SHOT_GAP;
            bot.burst += 1;
            // Hit chance falls with distance and with the player's speed: a still
            // target far away is easier than a sprinting one up close. A bot that
            // just spotted the player needs a moment to aim, so its first shots
            // are wild.
            const playerSpeed = Math.hypot(wiring.playerState.velocity.x, wiring.playerState.velocity.z);
            let chance = Math.max(0.1, 0.45 - distance * 0.011 - playerSpeed * 0.03);
            if (now - bot.acquireAt < 0.6) chance *= 0.4;
            if (Math.random() < chance) {
              wiring.callbacks.onBotShot(bot, BOT_DAMAGE);
            } else {
              wiring.callbacks.onBotShot(bot, 0);
            }
          }
        }
      } else if (bot.state === 'investigate' && bot.target) {
        if (walkToward(bot, bot.target.x, bot.target.z, PATROL_SPEED + 0.6, dt)) {
          bot.state = 'hold';
        }
      } else if (spike) {
        // After a plant, converge on the spike and defuse it.
        const dx = spike.x - bot.group.position.x;
        const dz = spike.z - bot.group.position.z;
        if (Math.hypot(dx, dz) > 1.6) {
          walkToward(bot, spike.x, spike.z, FIGHT_SPEED, dt);
          bot.defuse = 0;
        } else {
          bot.defuse += dt;
          if (bot.defuse >= DEFUSE_SECONDS) wiring.callbacks.onDefuse(bot);
        }
      } else {
        // Hold the site, scanning slowly; drift between nearby waypoints.
        const hold = WAYPOINTS[bot.hold];
        const dx = hold[0] - bot.group.position.x;
        const dz = hold[1] - bot.group.position.z;
        if (Math.hypot(dx, dz) > 0.5) walkToward(bot, hold[0], hold[1], PATROL_SPEED, dt);
        else bot.yaw += Math.sin(now * 0.5 + bot.walkPhase) * 0.4 * dt;
      }
      bot.group.rotation.y = bot.yaw;
    }
  }

  return {
    bots,
    hitMeshes,
    damage,
    step,
    wire(playerStateValue, callbacksValue) {
      wiring.playerState = playerStateValue;
      wiring.callbacks = callbacksValue;
    },
    aliveBots() {
      return bots.filter((bot) => bot.alive);
    },
    aliveCount() {
      return bots.filter((bot) => bot.alive).length;
    },
    hearShot(x, z) {
      for (const bot of bots) {
        if (!bot.alive) continue;
        const dx = bot.group.position.x - x;
        const dz = bot.group.position.z - z;
        if (dx * dx + dz * dz < HEAR_RANGE * HEAR_RANGE && bot.state !== 'engage') {
          bot.state = 'investigate';
          bot.target = { x, z };
        }
      }
    },
    aimPoint(index) {
      const bot = bots[index % bots.length];
      return new THREE.Vector3(bot.group.position.x, 1.1, bot.group.position.z);
    },
    reset() {
      for (let index = 0; index < bots.length; index += 1) {
        const bot = bots[index];
        const home = WAYPOINTS[HOMES[index].waypoint];
        bot.alive = true;
        bot.health = HEALTH;
        bot.fall = 0;
        bot.state = 'hold';
        bot.waypoint = HOMES[index].waypoint;
        bot.hold = HOMES[index].hold;
        bot.defuse = 0;
        bot.shotTimer = 0;
        bot.group.position.set(home[0], 0, home[1]);
        bot.group.rotation.set(0, Math.PI, 0);
        bot.yaw = Math.PI;
      }
    },
  };
}
