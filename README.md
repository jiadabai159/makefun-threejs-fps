# SABLE YARD — a three.js tactical FPS

[![make.fun](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/c/threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/jiadabai159/makefun-threejs-fps/rank.svg)](https://make.fun/c/threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/jiadabai159/makefun-threejs-fps/reward.svg)](https://make.fun/c/threejs-fps-02)

A round-based, Counter-Strike-style tactical FPS in three.js, made for the
[make.fun threejs-fps-02 bounty](https://make.fun/c/threejs-fps-02). One player,
four bot defenders, two bomb sites, money and a buy menu between rounds.

Play it: serve `game/` with any static server (`node serve.ts`, then open
http://localhost:8080). No build step, no network requests, desktop Chrome
with WebGL 2.

- **Rounds:** eliminate the defenders, or plant the bomb at site A or B and
  defend it until it blows. First to 5 rounds takes the match.
- **Money:** earn cash for kills and round wins, spend it in the buy menu —
  rifles, SMGs, a sniper, armour and a grenade.
- **Gunplay:** headshots hurt more, recoil and spread punish firing on the
  move, crouching and stopping to aim pay off.
- **Bots:** hold sites, patrol lanes, react to what they see and hear, and
  move to defuse a planted bomb.
