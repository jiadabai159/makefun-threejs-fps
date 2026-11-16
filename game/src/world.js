// SABLE YARD: a 36 x 28 m dusk industrial yard, built from boxes. Every box is a collider
// for players and bots and a surface a bullet stops on. Two bomb sites (A west, B east),
// three lanes between them (A-long along the west wall, mid through the pillar yard, the
// B tunnel of stacked containers), and a stepped platform over the north end. Plain
// geometry only, no models and no textures; the palette carries the look.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

// Waypoints the bots patrol and fight over: [x, z, label]. Edges are implicit — a bot walks
// to the nearest waypoint, then along the list toward its goal, so routes emerge from the
// graph instead of being scripted per bot.
export const WAYPOINTS = [
  [-15.5, 11.5, 'spawn'],
  [-8, 11.5, 'spawn-mid'],
  [0, 11.5, 'spawn-mid'],
  [8, 11.5, 'spawn-mid'],
  [15.5, 11.5, 'spawn'],
  [-15.5, 0, 'a-long'],
  [-8, 0, 'mid-west'],
  [0, 0, 'mid'],
  [8, 0, 'mid-east'],
  [15.5, 0, 'b-tunnel'],
  [-15.5, -11.5, 'a-site'],
  [-8, -11.5, 'a-approach'],
  [0, -11.5, 'north'],
  [8, -11.5, 'b-approach'],
  [15.5, -11.5, 'b-site'],
  [-12, -6, 'a-cover'],
  [12, -6, 'b-cover'],
  [0, 6, 'mid-cover'],
];

export const SITES = {
  A: { x: -14.5, z: -10.5, radius: 3.2 },
  B: { x: 14.5, z: -10.5, radius: 3.2 },
};

export function createWorld(scene) {
  const group = new THREE.Group();
  scene.add(group);

  const materials = {};
  for (const name of Object.keys(PALETTE)) {
    materials[name] = new THREE.MeshStandardMaterial({
      color: new THREE.Color(PALETTE[name]),
      roughness: name === 'accent' ? 0.6 : 0.92,
      metalness: 0.03,
    });
  }

  const colliders = [];
  const shootables = [];

  function box(width, height, depth, x, y, z, material) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(width, height, depth), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Floor and perimeter walls, 4.6 m high, open to a dusk sky.
  box(36.4, 0.4, 28.4, 0, -0.2, 0, 'canvas');
  box(0.4, 4.6, 28.4, -18.2, 2.3, 0, 'surface');
  box(0.4, 4.6, 28.4, 18.2, 2.3, 0, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, -14.2, 'surface');
  box(36.4, 4.6, 0.4, 0, 2.3, 14.2, 'surface');

  // Bomb-site plates, flush with the floor so they read at a glance.
  box(5.4, 0.08, 5.4, SITES.A.x, 0.04, SITES.A.z, 'accent');
  box(5.4, 0.08, 5.4, SITES.B.x, 0.04, SITES.B.z, 'muted');

  // Mid: a pillar yard splitting the centre lane, crates to crouch behind.
  box(1.4, 3.4, 1.4, 0, 1.7, 2, 'hairline');
  box(1.4, 3.4, 1.4, -5, 1.7, 5, 'hairline');
  box(1.4, 3.4, 1.4, 5, 1.7, 5, 'hairline');
  box(3.2, 1.1, 1.2, -3, 0.55, -2, 'hairline');
  box(3.2, 1.1, 1.2, 3, 0.55, -2, 'hairline');
  box(1.2, 1.1, 3.2, 0, 0.55, 7.5, 'hairline');

  // A-long: a container row along the west wall with a gap to slip through.
  box(2.4, 2.4, 2.4, -15, 1.2, 4, 'surface');
  box(2.4, 2.4, 2.4, -15, 1.2, 1.4, 'surface');
  box(2.4, 2.4, 2.4, -15, 1.2, -4.5, 'surface');
  box(1.6, 0.8, 1.6, -11.5, 0.4, -6.5, 'hairline');
  box(1.6, 0.8, 1.6, -11.5, 0.4, 7.5, 'hairline');

  // B tunnel: stacked containers forming a covered route on the east side.
  box(2.4, 2.4, 2.4, 15, 1.2, 4, 'surface');
  box(2.4, 2.4, 2.4, 15, 1.2, 1.4, 'surface');
  box(2.4, 2.4, 2.4, 15, 3.6, 2.7, 'hairline');
  box(2.4, 2.4, 2.4, 15, 1.2, -4.5, 'surface');
  box(1.6, 0.8, 1.6, 11.5, 0.4, -6.5, 'hairline');
  box(1.6, 0.8, 1.6, 11.5, 0.4, 7.5, 'hairline');

  // North end: a stepped platform over the sites, two steps up, sightlines over the yard.
  box(6.0, 0.5, 1.6, -3, 0.25, -12.6, 'surface');
  box(6.0, 0.5, 1.6, -3, 0.75, -13.2, 'surface');
  box(6.0, 0.5, 1.6, 3, 0.25, -12.6, 'surface');
  box(6.0, 0.5, 1.6, 3, 0.75, -13.2, 'surface');
  box(1.0, 1.7, 1.0, -10.5, 0.85, 11.5, 'hairline');
  box(1.0, 1.7, 1.0, 10.5, 0.85, 11.5, 'hairline');

  // Light: a low orange dusk key from the west, a cool fill from the east, dim sky.
  const sky = new THREE.HemisphereLight(new THREE.Color(PALETTE.surface), new THREE.Color(PALETTE.canvas), 0.9);
  scene.add(sky);
  const key = new THREE.DirectionalLight(new THREE.Color(0xffb37a), 2.4);
  key.position.set(-14, 16, 8);
  key.target.position.set(2, 0, -4);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -22;
  key.shadow.camera.right = 22;
  key.shadow.camera.top = 20;
  key.shadow.camera.bottom = -20;
  key.shadow.camera.far = 60;
  key.shadow.bias = -0.0006;
  scene.add(key, key.target);
  const fill = new THREE.DirectionalLight(new THREE.Color(PALETTE.muted), 0.5);
  fill.position.set(12, 10, 12);
  scene.add(fill);

  // A shared axis-separated box mover: anything that walks (player, bots) resolves against
  // the same colliders, so a wall never swallows a walker. Returns the ground height hit.
  const probe = new THREE.Box3();
  function overlaps(x, y, z, radius, height, lift) {
    probe.min.set(x - radius, y + lift, z - radius);
    probe.max.set(x + radius, y + height - lift, z + radius);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }
  function moveBox(position, velocity, dt, radius, height) {
    const nextX = position.x + velocity.x * dt;
    if (!overlaps(nextX, position.y, position.z, radius, height, 0.04)) position.x = nextX;
    else velocity.x = 0;
    const nextZ = position.z + velocity.z * dt;
    if (!overlaps(position.x, position.y, nextZ, radius, height, 0.04)) position.z = nextZ;
    else velocity.z = 0;
    position.y += velocity.y * dt;
    let grounded = false;
    const hit = overlaps(position.x, position.y, position.z, radius, height, 0);
    if (hit && velocity.y <= 0) {
      position.y = hit.max.y;
      velocity.y = 0;
      grounded = true;
    } else if (hit) {
      position.y = hit.min.y - height;
      velocity.y = 0;
    }
    if (position.y < 0) {
      position.y = 0;
      velocity.y = 0;
      grounded = true;
    }
    return grounded;
  }

  return { colliders, shootables, group, moveBox, overlaps };
}
