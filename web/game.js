"use strict";

const DEFAULT_WIDTH = 900;
let WIDTH = DEFAULT_WIDTH;
const HEIGHT = 620;
const FIELD_TOP = 90;
const FIELD_BOTTOM = HEIGHT - 24;
const PORTAL_LOCATIONS = [
  [0.28, 0.28],
  [0.5, 0.24],
  [0.72, 0.42],
  [0.28, 0.68],
  [0.5, 0.74],
  [0.72, 0.68],
];
const MENU_BUTTON_WIDTH = 460;
const CRYSTAL_GOAL = 8;
const CRYSTALS_ON_MAP = 6;
const PLAYER_SPEED = 245;
const DRONE_SPEED = 82;
const DASH_DURATION = 0.18;
const DASH_COOLDOWN = 1.1;
const DRONE_SPAWN_INTERVAL = 18;
const DRONE_WARNING_TIME = 3;
const POWERUP_TYPES = ["magnet", "slow", "boost"];
const POWERUP_DURATIONS = Object.freeze({
  magnet: 8,
  slow: 5,
  boost: 6,
});
const SAVE_COUNT = 3;
const LOCAL_LEADERBOARD_KEY = "kosmische-koerier-leaderboard-v2";
const LEGACY_LOCAL_LEADERBOARD_KEY = "kosmische-koerier-leaderboard";
const LOCAL_LEADERBOARD_SIZE = 10;
const canvas = document.querySelector("#game");
const context = canvas.getContext("2d");
const joystick = document.querySelector("#joystick");
const joystickKnob = document.querySelector(".joystick-knob");
const dashButton = document.querySelector(".dash-button");
const pauseButton = document.querySelector("#pause-button");
const saveButton = document.querySelector("#save-button");
const fullscreenButton = document.querySelector("#fullscreen-button");
const fullscreenStatus = document.querySelector("#fullscreen-status");
const nextLevelButton = document.querySelector("#next-level-button");
const isInstalledApp =
  matchMedia("(display-mode: fullscreen)").matches
  || matchMedia("(display-mode: standalone)").matches
  || window.navigator.standalone === true;
if (isInstalledApp) {
  document.documentElement.classList.add("installed-app");
}
const pressedKeys = new Set();
let joystickPointerId = null;
let joystickInput = { x: 0, y: 0 };
const stars = Array.from({ length: 100 }, () => ({
  x: Math.random() * WIDTH,
  y: FIELD_TOP + Math.random() * (HEIGHT - FIELD_TOP),
  radius: Math.random() < 0.82 ? 1 : 2,
}));
const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
canvas.width = WIDTH * pixelRatio;
canvas.height = HEIGHT * pixelRatio;
context.scale(pixelRatio, pixelRatio);

let notice = "";
let saveSlots = Array(SAVE_COUNT).fill(null);
let localScores = [];
let fullscreenStatusTimeout = null;

function distance(x1, y1, x2, y2) {
  return Math.hypot(x2 - x1, y2 - y1);
}

function isFinitePair(value) {
  return Array.isArray(value)
    && value.length === 2
    && value.every((coordinate) =>
      typeof coordinate === "number" && Number.isFinite(coordinate)
    );
}

class GameState {
  constructor() {
    this.reset();
  }

  reset() {
    this.level = 1;
    this.player = [WIDTH / 2, HEIGHT / 2];
    this.playerDirection = [1, 0];
    this.walls = this.levelWalls();
    this.crystals = [];
    this.drones = [];
    this.collected = 0;
    this.totalCrystals = 0;
    this.health = 3;
    this.shieldCharges = 0;
    this.shieldPickup = null;
    this.powerups = [];
    this.magnetTime = 0;
    this.slowTime = 0;
    this.boostTime = 0;
    this.elapsed = 0;
    this.pendingDroneSpawn = null;
    this.droneArrowSpawn = null;
    this.droneArrowTime = 0;
    this.invulnerable = 0;
    this.dashCooldown = 0;
    this.dashTime = 0;
    this.screen = "playing";
    this.resultRecorded = false;
    this.spawnCrystals(this.crystalSpawnCount);
    this.spawnDrone();
    this.spawnShieldPickup();
    this.spawnPowerups();
  }

  get crystalGoal() {
    return this.level * CRYSTAL_GOAL;
  }

  get crystalSpawnCount() {
    return Math.ceil(CRYSTALS_ON_MAP * 1.1 ** (this.level - 1));
  }

  get portal() {
    const firstLocation = (this.level - 1) % PORTAL_LOCATIONS.length;
    for (let offset = 0; offset < PORTAL_LOCATIONS.length; offset += 1) {
      const location = PORTAL_LOCATIONS[
        (firstLocation + offset) % PORTAL_LOCATIONS.length
      ];
      const position = [
        WIDTH * location[0],
        FIELD_TOP + (FIELD_BOTTOM - FIELD_TOP) * location[1],
      ];
      if (!this.overlapsWall(...position, 28)) {
        return position;
      }
    }
    return [WIDTH * 0.75, FIELD_TOP + 80];
  }

  levelWalls(level = this.level) {
    if (level % 4 !== 0) {
      return [];
    }
    const offset = (WIDTH - DEFAULT_WIDTH) / 2;
    return [
      [280 + offset, 180, 310 + offset, 350],
      [570 + offset, 340, 600 + offset, 510],
    ];
  }

  overlapsWall(x, y, radius, walls = this.walls) {
    return walls.some(([left, top, right, bottom]) =>
      left - radius <= x && x <= right + radius
      && top - radius <= y && y <= bottom + radius
    );
  }

  segmentHitsWall(start, end, radius) {
    for (const [wallLeft, wallTop, wallRight, wallBottom] of this.walls) {
      const left = wallLeft - radius - 1;
      const top = wallTop - radius - 1;
      const right = wallRight + radius + 1;
      const bottom = wallBottom + radius + 1;
      let minimumT = 0;
      let maximumT = 1;
      const axes = [
        [start[0], end[0] - start[0], left, right],
        [start[1], end[1] - start[1], top, bottom],
      ];
      for (const [origin, delta, minimum, maximum] of axes) {
        if (delta === 0) {
          if (origin < minimum || origin > maximum) {
            minimumT = 1;
            maximumT = 0;
            break;
          }
        } else {
          const first = (minimum - origin) / delta;
          const second = (maximum - origin) / delta;
          minimumT = Math.max(minimumT, Math.min(first, second));
          maximumT = Math.min(maximumT, Math.max(first, second));
          if (minimumT > maximumT) {
            break;
          }
        }
      }
      if (minimumT <= maximumT) {
        return true;
      }
    }
    return false;
  }

  droneTarget(index) {
    const count = this.drones.length;
    const cycle = Math.max(2.4, count * 1.25);
    const attackPhase = (this.elapsed - index * cycle / count) % cycle;
    const radius = attackPhase < 0.8 ? 22 : 42;
    const angle = 2 * Math.PI * index / count + this.elapsed * 0.3;
    return [
      Math.min(Math.max(this.player[0] + Math.cos(angle) * radius, 20), WIDTH - 20),
      Math.min(
        Math.max(this.player[1] + Math.sin(angle) * radius, FIELD_TOP - 10),
        FIELD_BOTTOM + 10,
      ),
    ];
  }

  droneWaypoint(drone, target = this.player) {
    if (!this.segmentHitsWall(drone, target, 14)) {
      return target;
    }
    const waypoints = [drone, target];
    const margin = 18;
    for (const [left, top, right, bottom] of this.walls) {
      waypoints.push(
        [left - margin, top - margin],
        [left - margin, bottom + margin],
        [right + margin, top - margin],
        [right + margin, bottom + margin],
      );
    }

    const costs = Array(waypoints.length).fill(Infinity);
    const previous = Array(waypoints.length).fill(null);
    const remaining = new Set(waypoints.map((_, index) => index));
    costs[0] = 0;
    while (remaining.size) {
      let current = null;
      for (const index of remaining) {
        if (current === null || costs[index] < costs[current]) {
          current = index;
        }
      }
      if (current === null || !Number.isFinite(costs[current])) {
        break;
      }
      remaining.delete(current);
      if (current === 1) {
        break;
      }
      for (const neighbor of remaining) {
        if (this.segmentHitsWall(waypoints[current], waypoints[neighbor], 14)) {
          continue;
        }
        const candidate = costs[current] + distance(
          waypoints[current][0], waypoints[current][1],
          waypoints[neighbor][0], waypoints[neighbor][1],
        );
        if (candidate < costs[neighbor]) {
          costs[neighbor] = candidate;
          previous[neighbor] = current;
        }
      }
    }
    if (previous[1] === null) {
      return target;
    }
    const route = [1];
    while (route[route.length - 1] !== 0) {
      route.push(previous[route[route.length - 1]]);
    }
    route.reverse();
    return waypoints[route[1]];
  }

  spawnCrystals(amount = 1) {
    for (let count = 0; count < amount; count += 1) {
      for (let attempt = 0; attempt < 100; attempt += 1) {
        const x = 48 + Math.floor(Math.random() * (WIDTH - 96));
        const y = FIELD_TOP + 28
          + Math.floor(Math.random() * (FIELD_BOTTOM - FIELD_TOP - 56));
        if (
          distance(x, y, ...this.player) > 105
          && distance(x, y, ...this.portal) > 90
          && !this.overlapsWall(x, y, 12)
        ) {
          this.crystals.push([x, y]);
          break;
        }
      }
    }
  }

  findPickupPosition() {
    for (let attempt = 0; attempt < 100; attempt += 1) {
      const x = 48 + Math.floor(Math.random() * (WIDTH - 96));
      const y = FIELD_TOP + 28
        + Math.floor(Math.random() * (FIELD_BOTTOM - FIELD_TOP - 56));
      if (
        distance(x, y, ...this.player) > 130
        && distance(x, y, ...this.portal) > 110
        && this.crystals.every((crystal) => distance(x, y, ...crystal) > 40)
        && this.drones.every((drone) => distance(x, y, ...drone) > 48)
        && (!this.shieldPickup || distance(x, y, ...this.shieldPickup) > 44)
        && this.powerups.every((pickup) =>
          distance(x, y, ...pickup.position) > 44
        )
        && !this.overlapsWall(x, y, 12)
      ) {
        return [x, y];
      }
    }
    return null;
  }

  spawnShieldPickup() {
    this.shieldPickup = null;
    this.shieldPickup = this.findPickupPosition();
  }

  spawnPowerups() {
    this.powerups = [];
    for (const type of POWERUP_TYPES) {
      const position = this.findPickupPosition();
      if (position) {
        this.powerups.push({ type, position });
      }
    }
  }

  activatePowerup(type) {
    if (type === "magnet") {
      this.magnetTime = POWERUP_DURATIONS.magnet;
    } else if (type === "slow") {
      this.slowTime = POWERUP_DURATIONS.slow;
    } else if (type === "boost") {
      this.boostTime = POWERUP_DURATIONS.boost;
    }
  }

  randomDroneSpawn() {
    const side = ["left", "right", "top", "bottom"][
      Math.floor(Math.random() * 4)
    ];
    let position;
    if (side === "left") {
      position = [20, FIELD_TOP + Math.random() * (FIELD_BOTTOM - FIELD_TOP)];
    } else if (side === "right") {
      position = [
        WIDTH - 20,
        FIELD_TOP + Math.random() * (FIELD_BOTTOM - FIELD_TOP),
      ];
    } else if (side === "top") {
      position = [20 + Math.random() * (WIDTH - 40), FIELD_TOP - 10];
    } else {
      position = [20 + Math.random() * (WIDTH - 40), FIELD_BOTTOM + 10];
    }
    return { side, position };
  }

  spawnDrone(spawn = this.randomDroneSpawn()) {
    this.drones.push(spawn.position);
  }

  nextLevel() {
    this.level += 1;
    this.player = [WIDTH / 2, HEIGHT / 2];
    this.playerDirection = [1, 0];
    this.walls = this.levelWalls();
    this.crystals = [];
    this.drones = [];
    this.collected = 0;
    this.elapsed = 0;
    this.powerups = [];
    this.magnetTime = 0;
    this.slowTime = 0;
    this.boostTime = 0;
    this.pendingDroneSpawn = null;
    this.droneArrowSpawn = null;
    this.droneArrowTime = 0;
    this.invulnerable = 0;
    this.dashCooldown = 0;
    this.dashTime = 0;
    this.shieldCharges = 0;
    this.screen = "playing";
    this.resultRecorded = false;
    this.spawnCrystals(this.crystalSpawnCount);
    this.spawnDrone();
    this.spawnShieldPickup();
    this.spawnPowerups();
  }

  step(dt, directions, dash, joystickDirection = null) {
    if (this.screen !== "playing") {
      return;
    }
    dt = Math.min(dt, 0.05);
    this.elapsed += dt;
    this.droneArrowTime = Math.max(0, this.droneArrowTime - dt);
    if (this.droneArrowTime === 0) {
      this.droneArrowSpawn = null;
    }
    this.invulnerable = Math.max(0, this.invulnerable - dt);
    this.dashCooldown = Math.max(0, this.dashCooldown - dt);
    this.dashTime = Math.max(0, this.dashTime - dt);
    this.magnetTime = Math.max(0, this.magnetTime - dt);
    this.slowTime = Math.max(0, this.slowTime - dt);
    this.boostTime = Math.max(0, this.boostTime - dt);
    if (dash && this.dashCooldown === 0) {
      this.dashTime = DASH_DURATION;
      this.dashCooldown = DASH_COOLDOWN;
    }

    let dx = Number(directions.has("right")) - Number(directions.has("left"));
    let dy = Number(directions.has("down")) - Number(directions.has("up"));
    let movementScale = 1;
    if (joystickDirection) {
      const joystickStrength = Math.hypot(joystickDirection.x, joystickDirection.y);
      if (joystickStrength > 0) {
        dx = joystickDirection.x;
        dy = joystickDirection.y;
        movementScale = Math.min(joystickStrength, 1);
      }
    }
    if (dx || dy) {
      const magnitude = Math.hypot(dx, dy);
      this.playerDirection = [dx / magnitude, dy / magnitude];
      const speedMultiplier = Math.min(
        (this.dashTime ? 2.35 : 1) * (this.boostTime ? 1.4 : 1),
        2.7,
      );
      const speed = PLAYER_SPEED * speedMultiplier * movementScale;
      const moveX = dx / magnitude * speed * dt;
      const moveY = dy / magnitude * speed * dt;
      if (!this.overlapsWall(this.player[0] + moveX, this.player[1], 20)) {
        this.player[0] += moveX;
      }
      if (!this.overlapsWall(this.player[0], this.player[1] + moveY, 20)) {
        this.player[1] += moveY;
      }
    }
    this.player[0] = Math.min(Math.max(22, this.player[0]), WIDTH - 22);
    this.player[1] = Math.min(
      Math.max(FIELD_TOP + 12, this.player[1]),
      FIELD_BOTTOM - 12,
    );

    if (this.magnetTime > 0) {
      for (const crystal of this.crystals) {
        const dx = this.player[0] - crystal[0];
        const dy = this.player[1] - crystal[1];
        const crystalDistance = Math.hypot(dx, dy);
        if (
          crystalDistance > 27
          && crystalDistance < 190
          && !this.segmentHitsWall(crystal, this.player, 12)
        ) {
          const pullDistance = Math.min(280 * dt, crystalDistance - 26);
          crystal[0] += dx / crystalDistance * pullDistance;
          crystal[1] += dy / crystalDistance * pullDistance;
        }
      }
    }
    for (const crystal of [...this.crystals]) {
      if (distance(...this.player, ...crystal) < 27) {
        this.crystals.splice(this.crystals.indexOf(crystal), 1);
        this.collected += 1;
        this.totalCrystals += 1;
        this.spawnCrystals();
      }
    }
    for (const pickup of [...this.powerups]) {
      if (distance(...this.player, ...pickup.position) < 29) {
        this.powerups.splice(this.powerups.indexOf(pickup), 1);
        this.activatePowerup(pickup.type);
      }
    }
    if (
      this.shieldPickup
      && this.shieldCharges === 0
      && distance(...this.player, ...this.shieldPickup) < 27
    ) {
      this.shieldCharges = 1;
      this.shieldPickup = null;
    }

    for (let index = 0; index < this.drones.length; index += 1) {
      const drone = this.drones[index];
      let target = this.droneTarget(index);
      if (this.overlapsWall(...target, 14)) {
        target = this.player;
      }
      const [waypointX, waypointY] = this.droneWaypoint(drone, target);
      let steerX = waypointX - drone[0];
      let steerY = waypointY - drone[1];
      for (let otherIndex = 0; otherIndex < this.drones.length; otherIndex += 1) {
        if (otherIndex === index) {
          continue;
        }
        const other = this.drones[otherIndex];
        let awayX = drone[0] - other[0];
        let awayY = drone[1] - other[1];
        const separation = Math.hypot(awayX, awayY);
        if (separation >= 36) {
          continue;
        }
        if (separation === 0) {
          const angle = 2 * Math.PI * index / this.drones.length;
          awayX = Math.cos(angle);
          awayY = Math.sin(angle);
        } else {
          awayX /= separation;
          awayY /= separation;
        }
        const strength = (36 - separation) * 3;
        steerX += awayX * strength;
        steerY += awayY * strength;
      }
      const steeringLength = Math.max(Math.hypot(steerX, steerY), 1);
      const droneSpeed = DRONE_SPEED * (this.slowTime > 0 ? 0.35 : 1);
      const movement = Math.min(droneSpeed * dt, steeringLength);
      const moveX = steerX / steeringLength * movement;
      const moveY = steerY / steeringLength * movement;
      if (!this.overlapsWall(drone[0] + moveX, drone[1], 14)) {
        drone[0] += moveX;
      }
      if (!this.overlapsWall(drone[0], drone[1] + moveY, 14)) {
        drone[1] += moveY;
      }
      const playerSeparation = Math.max(
        distance(...this.player, ...drone),
        1,
      );
      if (playerSeparation < 26 && this.invulnerable === 0) {
        if (this.shieldCharges) {
          this.shieldCharges = 0;
          this.invulnerable = 0.8;
        } else {
          this.health -= 1;
          this.invulnerable = 1.2;
        }
        const pushX = this.player[0]
          + (this.player[0] - drone[0]) / playerSeparation * 38;
        const pushY = this.player[1]
          + (this.player[1] - drone[1]) / playerSeparation * 38;
        if (!this.overlapsWall(pushX, this.player[1], 20)) {
          this.player[0] = Math.min(Math.max(30, pushX), WIDTH - 30);
        }
        if (!this.overlapsWall(this.player[0], pushY, 20)) {
          this.player[1] = Math.min(
            Math.max(FIELD_TOP + 20, pushY),
            FIELD_BOTTOM - 20,
          );
        }
        if (this.health <= 0) {
          this.screen = "over";
        }
        break;
      }
    }
    if (
      this.elapsed >= DRONE_SPAWN_INTERVAL - DRONE_WARNING_TIME
      && this.drones.length < 5
      && !this.pendingDroneSpawn
    ) {
      this.pendingDroneSpawn = this.randomDroneSpawn();
    }
    if (this.elapsed >= DRONE_SPAWN_INTERVAL && this.drones.length < 5) {
      const incomingDrone = this.pendingDroneSpawn ?? this.randomDroneSpawn();
      this.elapsed = 0;
      this.pendingDroneSpawn = null;
      this.droneArrowSpawn = {
        side: incomingDrone.side,
        position: incomingDrone.position.slice(),
      };
      this.droneArrowTime = DRONE_WARNING_TIME;
      this.spawnDrone(incomingDrone);
    }
    if (
      this.collected >= this.crystalGoal
      && distance(...this.player, ...this.portal) < 42
    ) {
      this.screen = "won";
    }
  }

  toJSON() {
    return {
      level: this.level,
      width: WIDTH,
      player: this.player,
      playerDirection: this.playerDirection,
      crystals: this.crystals,
      drones: this.drones,
      collected: this.collected,
      totalCrystals: this.totalCrystals,
      health: this.health,
      shieldCharges: this.shieldCharges,
      shieldPickup: this.shieldPickup,
      powerups: this.powerups,
      magnetTime: this.magnetTime,
      slowTime: this.slowTime,
      boostTime: this.boostTime,
      elapsed: this.elapsed,
      invulnerable: this.invulnerable,
      dashCooldown: this.dashCooldown,
      dashTime: this.dashTime,
    };
  }

  load(data) {
    if (!data || typeof data !== "object" || Array.isArray(data)) {
      throw new Error("Ongeldige spelgegevens.");
    }
    if (!Number.isInteger(data.level) || data.level < 1) {
      throw new Error("Het opgeslagen level is ongeldig.");
    }
    if (!Number.isInteger(data.collected) || data.collected < 0) {
      throw new Error("De opgeslagen kristaltelling is ongeldig.");
    }
    const minimumTotalCrystals =
      CRYSTAL_GOAL * data.level * (data.level - 1) / 2 + data.collected;
    const totalCrystals = data.totalCrystals ?? minimumTotalCrystals;
    if (
      !Number.isInteger(totalCrystals)
      || totalCrystals < minimumTotalCrystals
    ) {
      throw new Error("Het totaal aantal opgeslagen kristallen is ongeldig.");
    }
    if (!Number.isInteger(data.health) || data.health < 1 || data.health > 3) {
      throw new Error("Het opgeslagen aantal levens is ongeldig.");
    }
    const savedWidth = data.width ?? DEFAULT_WIDTH;
    if (
      typeof savedWidth !== "number"
      || !Number.isFinite(savedWidth)
      || savedWidth < DEFAULT_WIDTH
      || savedWidth > 10000
    ) {
      throw new Error("De opgeslagen speelveld-breedte is ongeldig.");
    }
    const positionScale = WIDTH / savedWidth;
    const shieldCharges = data.shieldCharges ?? 0;
    if (!Number.isInteger(shieldCharges) || shieldCharges < 0 || shieldCharges > 1) {
      throw new Error("De opgeslagen schildlading is ongeldig.");
    }
    const walls = this.levelWalls(data.level);
    const validatePosition = (value, label, radius = 0) => {
      if (!isFinitePair(value)) {
        throw new Error(`Ongeldige positie voor ${label}.`);
      }
      const point = value.slice();
      point[0] *= positionScale;
      if (this.overlapsWall(point[0], point[1], radius, walls)) {
        throw new Error(`De opgeslagen positie van ${label} ligt in een muur.`);
      }
      return point;
    };
    const player = validatePosition(data.player, "speler", 20);
    const direction = validatePosition(data.playerDirection, "richting");
    const directionLength = Math.hypot(...direction);
    if (directionLength === 0) {
      throw new Error("De opgeslagen richting is ongeldig.");
    }
    const playerDirection = direction.map((value) => value / directionLength);
    if (
      player[0] < 22 || player[0] > WIDTH - 22
      || player[1] < FIELD_TOP + 12 || player[1] > FIELD_BOTTOM - 12
    ) {
      throw new Error("De opgeslagen speler staat buiten het speelveld.");
    }
    if (!Array.isArray(data.crystals) || data.crystals.length > 100) {
      throw new Error("De opgeslagen kristallen zijn ongeldig.");
    }
    if (!Array.isArray(data.drones) || data.drones.length > 5) {
      throw new Error("De opgeslagen drones zijn ongeldig.");
    }
    const savedPowerups = data.powerups ?? [];
    if (
      !Array.isArray(savedPowerups)
      || savedPowerups.length > POWERUP_TYPES.length
    ) {
      throw new Error("De opgeslagen power-ups zijn ongeldig.");
    }
    const crystals = data.crystals.map((point) =>
      validatePosition(point, "kristal", 12)
    );
    const drones = data.drones.map((point) =>
      validatePosition(point, "drone", 14)
    );
    const shieldPickup = data.shieldPickup == null
      ? null
      : validatePosition(data.shieldPickup, "schild", 12);
    const powerups = savedPowerups.map((pickup) => {
      if (
        !pickup
        || typeof pickup !== "object"
        || Array.isArray(pickup)
        || !POWERUP_TYPES.includes(pickup.type)
      ) {
        throw new Error("Een opgeslagen power-up is ongeldig.");
      }
      return {
        type: pickup.type,
        position: validatePosition(pickup.position, `power-up ${pickup.type}`, 12),
      };
    });
    if (new Set(powerups.map((pickup) => pickup.type)).size !== powerups.length) {
      throw new Error("De opgeslagen power-ups bevatten dubbele items.");
    }
    for (const point of [
      ...crystals,
      ...drones,
      ...(shieldPickup ? [shieldPickup] : []),
      ...powerups.map((pickup) => pickup.position),
    ]) {
      if (point[0] < 0 || point[0] > WIDTH || point[1] < 0 || point[1] > HEIGHT) {
        throw new Error("Een opgeslagen object staat buiten het speelveld.");
      }
    }
    const timer = (name, maximum = Infinity, fallback) => {
      const value = data[name] ?? fallback;
      if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > maximum) {
        throw new Error(`De opgeslagen tijd (${name}) is ongeldig.`);
      }
      return value;
    };
    const elapsed = timer("elapsed");
    const invulnerable = timer("invulnerable", 1.2);
    const dashCooldown = timer("dashCooldown", DASH_COOLDOWN);
    const dashTime = timer("dashTime", DASH_DURATION);
    const magnetTime = timer("magnetTime", POWERUP_DURATIONS.magnet, 0);
    const slowTime = timer("slowTime", POWERUP_DURATIONS.slow, 0);
    const boostTime = timer("boostTime", POWERUP_DURATIONS.boost, 0);

    Object.assign(this, {
      level: data.level,
      walls,
      player,
      playerDirection,
      crystals,
      drones,
      collected: data.collected,
      totalCrystals,
      health: data.health,
      shieldCharges,
      shieldPickup,
      powerups,
      magnetTime,
      slowTime,
      boostTime,
      elapsed,
      pendingDroneSpawn: null,
      droneArrowSpawn: null,
      droneArrowTime: 0,
      invulnerable,
      dashCooldown,
      dashTime,
      resultRecorded: false,
      screen: "playing",
    });
  }
}

let state = new GameState();
state.screen = "menu";

function readSaveSlots() {
  for (let index = 0; index < SAVE_COUNT; index += 1) {
    try {
      const raw = localStorage.getItem(`kosmische-koerier-slot-${index + 1}`);
      saveSlots[index] = raw ? JSON.parse(raw) : null;
      if (
        saveSlots[index] !== null
        && (typeof saveSlots[index] !== "object" || Array.isArray(saveSlots[index]))
      ) {
        throw new Error("Ongeldige opslag.");
      }
    } catch (error) {
      saveSlots[index] = null;
      notice = `Slot ${index + 1} kon niet worden gelezen: ${error.message}`;
    }
  }
}

function readLocalScores() {
  try {
    const raw = localStorage.getItem(LOCAL_LEADERBOARD_KEY);
    const legacyRaw = raw === null
      ? localStorage.getItem(LEGACY_LOCAL_LEADERBOARD_KEY)
      : null;
    const isLegacy = raw === null && legacyRaw !== null;
    const storedRaw = raw === null ? legacyRaw : raw;
    if (storedRaw === null) {
      localScores = [];
      return;
    }
    const entries = JSON.parse(storedRaw);
    if (!Array.isArray(entries) || entries.length > LOCAL_LEADERBOARD_SIZE) {
      throw new Error("De lokale ranglijst is ongeldig.");
    }
    let needsMigration = isLegacy;
    localScores = entries.map((entry) => {
      if (
        !entry
        || !Number.isInteger(entry.score)
        || entry.score < 0
        || !Number.isInteger(entry.level)
        || entry.level < 1
        || !Number.isInteger(entry.crystals)
        || entry.crystals < 0
        || typeof entry.completed !== "boolean"
      ) {
        throw new Error("Een score in de lokale ranglijst is ongeldig.");
      }
      const alreadyUsesCrystalScoring = entry.score === entry.crystals * 100;
      const crystals = alreadyUsesCrystalScoring
        ? entry.crystals
        : CRYSTAL_GOAL * entry.level * (entry.level - 1) / 2
          + entry.crystals;
      const score = crystals * 100;
      if (
        entry.duration !== undefined
        || entry.date !== undefined
        || entry.score !== score
        || isLegacy
      ) {
        needsMigration = true;
      }
      return {
        score,
        level: entry.level,
        crystals,
        completed: entry.completed,
      };
    });
    localScores.sort((first, second) =>
      second.score - first.score
      || second.level - first.level
    );
    if (needsMigration) {
      localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(localScores));
      if (isLegacy) {
        localStorage.removeItem(LEGACY_LOCAL_LEADERBOARD_KEY);
      }
    }
  } catch (error) {
    localScores = [];
    notice = `Lokale ranglijst kon niet worden gelezen: ${error.message}`;
  }
}

function recordLocalScore() {
  if (
    state.resultRecorded
    || !["over", "won"].includes(state.screen)
  ) {
    return;
  }
  state.resultRecorded = true;
  const completed = state.screen === "won";
  const crystals = state.totalCrystals;
  const score = crystals * 100;
  const entry = {
    score,
    level: state.level,
    crystals,
    completed,
  };
  const sortedScores = [...localScores, entry].sort((first, second) =>
    second.score - first.score
    || second.level - first.level
  ).slice(0, LOCAL_LEADERBOARD_SIZE);
  try {
    localStorage.setItem(LOCAL_LEADERBOARD_KEY, JSON.stringify(sortedScores));
    localScores = sortedScores;
    notice = "Prestatie opgeslagen in de lokale ranglijst.";
  } catch (error) {
    notice = `Score opslaan is mislukt: ${error.message}`;
  }
}

function startGame() {
  state.reset();
  notice = "";
  clearMovementInput();
}

function loadSlot(index) {
  const data = saveSlots[index];
  if (!data) {
    notice = `Slot ${index + 1} is leeg.`;
    return;
  }
  try {
    state.load(data);
    notice = "";
    clearMovementInput();
  } catch (error) {
    notice = `Slot ${index + 1} kon niet worden geladen: ${error.message}`;
  }
}

function saveSlot(index) {
  try {
    const snapshot = state.toJSON();
    localStorage.setItem(
      `kosmische-koerier-slot-${index + 1}`,
      JSON.stringify(snapshot),
    );
    saveSlots[index] = snapshot;
    notice = `Spel opgeslagen in slot ${index + 1}.`;
    state.screen = "paused";
  } catch (error) {
    notice = `Opslaan is mislukt: ${error.message}`;
    state.screen = "paused";
  }
}

function onKeyDown(event) {
  const key = event.key.toLowerCase();
  if (["arrowleft", "arrowright", "arrowup", "arrowdown", " "].includes(key)) {
    event.preventDefault();
  }
  if (state.screen === "leaderboard") {
    if (["escape", "enter", "l"].includes(key)) {
      state.screen = "menu";
    }
    return;
  }
  if (state.screen === "menu") {
    if (["enter", "n"].includes(key)) {
      startGame();
    } else if (["1", "2", "3"].includes(key)) {
      loadSlot(Number(key) - 1);
    } else if (key === "l") {
      state.screen = "leaderboard";
    }
    return;
  }
  if (state.screen === "saving") {
    if (["1", "2", "3"].includes(key)) {
      saveSlot(Number(key) - 1);
    } else if (key === "escape" || key === "p") {
      state.screen = "paused";
      clearMovementInput();
    }
    return;
  }
  if (state.screen === "paused") {
    if (key === "p" || key === "escape") {
      state.screen = "playing";
      clearMovementInput();
    } else if (key === "s") {
      state.screen = "saving";
      clearMovementInput();
    }
    return;
  }
  if (state.screen === "over" || state.screen === "won") {
    if (state.screen === "over" && ["escape", "m"].includes(key)) {
      state.screen = "menu";
      clearMovementInput();
    } else if (key === "enter") {
      if (state.screen === "over") {
        startGame();
      } else {
        state.nextLevel();
      }
    }
    return;
  }
  const directionKeys = {
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
  };
  if (directionKeys[key]) {
    pressedKeys.add(directionKeys[key]);
  } else if (key === " ") {
    pressedKeys.add("dash");
  } else if (key === "p" || key === "escape") {
    state.screen = "paused";
    clearMovementInput();
  }
}

function onKeyUp(event) {
  const key = event.key.toLowerCase();
  const directionKeys = {
    arrowleft: "left",
    a: "left",
    arrowright: "right",
    d: "right",
    arrowup: "up",
    w: "up",
    arrowdown: "down",
    s: "down",
    " ": "dash",
  };
  if (directionKeys[key]) {
    pressedKeys.delete(directionKeys[key]);
  }
}

function canvasPoint(event) {
  const bounds = canvas.getBoundingClientRect();
  return [
    (event.clientX - bounds.left) * WIDTH / bounds.width,
    (event.clientY - bounds.top) * HEIGHT / bounds.height,
  ];
}

function onCanvasClick(event) {
  const [x, y] = canvasPoint(event);
  const buttonLeft = (WIDTH - MENU_BUTTON_WIDTH) / 2;
  if (state.screen === "menu") {
    if (
      x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
      && y >= 310 && y <= 352
    ) {
      startGame();
      return;
    }
    if (
      x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
      && y >= 356 && y <= 398
    ) {
      state.screen = "leaderboard";
      return;
    }
    for (let index = 0; index < SAVE_COUNT; index += 1) {
      const top = 402 + index * 46;
      if (
        x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
        && y >= top && y <= top + 42
      ) {
        loadSlot(index);
        return;
      }
    }
  } else if (
    state.screen === "leaderboard"
    && x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
    && y >= 556 && y <= 598
  ) {
    state.screen = "menu";
  } else if (
    state.screen === "over"
    && x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
    && y >= 390 && y <= 432
  ) {
    state.screen = "menu";
    clearMovementInput();
  } else if (state.screen === "saving") {
    for (let index = 0; index < SAVE_COUNT; index += 1) {
      const top = 365 + index * 47;
      if (
        x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
        && y >= top && y <= top + 40
      ) {
        saveSlot(index);
        return;
      }
    }
    if (
      x >= buttonLeft && x <= buttonLeft + MENU_BUTTON_WIDTH
      && y >= 510 && y <= 550
    ) {
      state.screen = "paused";
    }
  }
}

function clearJoystick() {
  joystickPointerId = null;
  joystickInput = { x: 0, y: 0 };
  joystickKnob.style.left = "50%";
  joystickKnob.style.top = "50%";
}

function clearMovementInput() {
  pressedKeys.clear();
  clearJoystick();
}

function moveJoystick(event) {
  const bounds = joystick.getBoundingClientRect();
  const maxRadius = bounds.width / 2 - joystickKnob.offsetWidth / 2 - 8;
  let offsetX = event.clientX - (bounds.left + bounds.width / 2);
  let offsetY = event.clientY - (bounds.top + bounds.height / 2);
  const length = Math.hypot(offsetX, offsetY);
  if (length > maxRadius) {
    offsetX = offsetX / length * maxRadius;
    offsetY = offsetY / length * maxRadius;
  }
  joystickKnob.style.left = `calc(50% + ${offsetX}px)`;
  joystickKnob.style.top = `calc(50% + ${offsetY}px)`;
  const strength = Math.hypot(offsetX, offsetY) / maxRadius;
  joystickInput = strength < 0.12
    ? { x: 0, y: 0 }
    : { x: offsetX / maxRadius, y: offsetY / maxRadius };
}

function syncTouchButtons() {
  const canPlay = state.screen === "playing";
  dashButton.disabled = !canPlay;
  pauseButton.disabled = !["playing", "paused", "saving"].includes(state.screen);
  saveButton.disabled = !["playing", "paused"].includes(state.screen);
  nextLevelButton.hidden = state.screen !== "won";
  nextLevelButton.textContent = `ENTER: LEVEL ${state.level + 1}`;
  pauseButton.textContent = state.screen === "paused"
    ? "VERDER"
    : state.screen === "saving"
      ? "TERUG"
      : "PAUZE";
}

function updateFullscreenButton() {
  const isFullscreen = Boolean(document.fullscreenElement);
  const label = isFullscreen
    ? "Volledig scherm verlaten"
    : "Volledig scherm inschakelen";
  fullscreenButton.setAttribute("aria-label", label);
  fullscreenButton.title = label;
  fullscreenButton.setAttribute("aria-pressed", String(isFullscreen));
}

function showFullscreenError(error) {
  console.error("De fullscreen-weergave kon niet worden aangepast.", error);
  fullscreenStatus.textContent = "Volledig scherm is niet beschikbaar op dit apparaat.";
  fullscreenStatus.hidden = false;
  window.clearTimeout(fullscreenStatusTimeout);
  fullscreenStatusTimeout = window.setTimeout(() => {
    fullscreenStatus.hidden = true;
  }, 4000);
}

async function toggleFullscreen() {
  fullscreenStatus.hidden = true;
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    const root = document.documentElement;
    if (typeof root.requestFullscreen !== "function") {
      throw new Error("Deze browser ondersteunt fullscreen niet.");
    }
    await root.requestFullscreen({ navigationUI: "hide" });
  } catch (error) {
    showFullscreenError(error);
  }
}

function positionLandscapeControls() {
  const bounds = canvas.getBoundingClientRect();
  if (!bounds.width || !bounds.height) {
    return;
  }
  const scale = bounds.height / HEIGHT;
  document.documentElement.style.setProperty(
    "--landscape-actions-top",
    `${bounds.top + FIELD_TOP * scale - 29}px`,
  );
  document.documentElement.style.setProperty(
    "--landscape-actions-right",
    `${window.innerWidth - bounds.right + 8}px`,
  );
}

function resizeGameCanvas() {
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  if (!viewportWidth || !viewportHeight) {
    return;
  }
  const isLandscape = matchMedia("(orientation: landscape)").matches
    && (
      matchMedia("(any-pointer: coarse)").matches
      || viewportWidth <= 1200
    );
  const nextWidth = isLandscape
    ? Math.max(DEFAULT_WIDTH, HEIGHT * viewportWidth / viewportHeight)
    : DEFAULT_WIDTH;
  if (Math.abs(nextWidth - WIDTH) >= 0.1) {
    const scaleX = nextWidth / WIDTH;
    WIDTH = nextWidth;
    for (const star of stars) {
      star.x *= scaleX;
    }

    const scalePosition = (position) => {
      if (position) {
        position[0] *= scaleX;
      }
    };
    scalePosition(state.player);
    state.playerDirection[0] *= scaleX;
    const directionLength = Math.hypot(...state.playerDirection);
    state.playerDirection = state.playerDirection.map((value) =>
      value / directionLength
    );
    state.crystals.forEach(scalePosition);
    state.drones.forEach(scalePosition);
    scalePosition(state.shieldPickup);
    state.powerups.forEach(({ position }) => scalePosition(position));
    scalePosition(state.pendingDroneSpawn?.position);
    scalePosition(state.droneArrowSpawn?.position);
    state.walls = state.levelWalls();

    canvas.width = Math.round(WIDTH * pixelRatio);
    canvas.height = HEIGHT * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
  }
  positionLandscapeControls();
}

function drawText(text, x, y, size, color, weight = "normal", align = "center") {
  context.fillStyle = color;
  context.font = `${weight} ${size}px "Segoe UI", Arial, sans-serif`;
  context.textAlign = align;
  context.textBaseline = "middle";
  context.fillText(text, x, y);
}

function roundedRect(x, y, width, height, radius, fill, stroke) {
  context.beginPath();
  context.roundRect(x, y, width, height, radius);
  context.fillStyle = fill;
  context.fill();
  if (stroke) {
    context.strokeStyle = stroke;
    context.lineWidth = 1;
    context.stroke();
  }
}

function drawStars() {
  context.fillStyle = "#080d1b";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  for (const star of stars) {
    context.globalAlpha = star.radius === 1 ? 0.55 : 0.85;
    context.fillStyle = "#8293bd";
    context.beginPath();
    context.arc(star.x, star.y, star.radius, 0, Math.PI * 2);
    context.fill();
  }
  context.globalAlpha = 1;
}

function drawButton(y, label, active = false) {
  const buttonLeft = (WIDTH - MENU_BUTTON_WIDTH) / 2;
  roundedRect(
    buttonLeft, y, MENU_BUTTON_WIDTH, 42, 8,
    active ? "#173c48" : "#151f36",
    active ? "#75e6d1" : "#39445f",
  );
  drawText(label, WIDTH / 2, y + 21, 14, active ? "#75e6d1" : "#edf0fa", "700");
}

function drawMenu() {
  drawStars();
  drawText("KOSMISCHE", WIDTH / 2, 78, 22, "#75e6d1", "700");
  drawText("KOERIER", WIDTH / 2, 128, 46, "#f3f5ff", "700");
  drawText("Een klein avontuur tussen de sterren", WIDTH / 2, 178, 15, "#aab5d0");
  drawText("Verzamel kristallen en bereik de PORTAAL", WIDTH / 2, 218, 16, "#edf0fa", "700");
  drawText("WASD / pijltjes bewegen  •  SPATIE dash  •  P pauze", WIDTH / 2, 248, 12, "#aab5d0");
  drawText("Blauw schild vangt één drone-aanval op", WIDTH / 2, 275, 11, "#63c7ff");
  drawText(
    "Paars = magneet  •  cyaan = tijdveld  •  oranje = boost",
    WIDTH / 2, 291, 10, "#c2cbe0",
  );
  drawButton(310, "NIEUW SPEL  (ENTER / N)", true);
  drawButton(356, "LOKALE TOPSCORES  (L)");
  for (let index = 0; index < SAVE_COUNT; index += 1) {
    const slot = saveSlots[index];
    const label = slot
      ? `LAAD SLOT ${index + 1}  •  LEVEL ${slot.level ?? "?"}  •  ${slot.collected ?? "?"} KRISTALLEN`
      : `LAAD SLOT ${index + 1}  •  LEEG`;
    drawButton(402 + index * 46, label);
  }
  drawText("Klik op een slot of druk op 1, 2 of 3 om te laden.", WIDTH / 2, 560, 11, "#73809d");
  if (notice) {
    drawText(notice, WIDTH / 2, 602, 10, "#ffb5bd");
  }
}

function drawLocalLeaderboard() {
  drawStars();
  drawText("LOKALE TOPSCORES", WIDTH / 2, 106, 28, "#75e6d1", "700");
  drawText("Alleen opgeslagen op dit apparaat", WIDTH / 2, 148, 14, "#aab5d0");
  drawText(
    "100 punten per kristal, ook uit eerder behaalde levels",
    WIDTH / 2, 178, 11, "#73809d",
  );
  const left = (WIDTH - MENU_BUTTON_WIDTH) / 2;
  const right = left + MENU_BUTTON_WIDTH;
  drawText("RANG  •  LEVEL  •  TOTAAL KRISTALLEN", left + 10, 214, 10, "#aab5d0", "700", "left");
  drawText("SCORE", right - 10, 214, 10, "#aab5d0", "700", "right");

  if (localScores.length === 0) {
    drawText("Speel een ronde om je eerste score te zetten.", WIDTH / 2, 330, 14, "#edf0fa");
  } else {
    localScores.forEach((entry, index) => {
      const y = 244 + index * 30;
      roundedRect(left, y - 12, MENU_BUTTON_WIDTH, 25, 5, "#10182b", "#293653");
      drawText(
        `${String(index + 1).padStart(2, "0")}  •  LEVEL ${entry.level}  •  ${entry.crystals} KRISTALLEN${entry.completed ? "  •  GEHAALD" : ""}`,
        left + 10, y, 10, index === 0 ? "#f2d47b" : "#edf0fa", "700", "left",
      );
      drawText(String(entry.score), right - 10, y, 11, "#75e6d1", "700", "right");
    });
  }
  if (notice) {
    drawText(notice, WIDTH / 2, 535, 10, "#ffb5bd");
  }
  drawButton(556, "TERUG  (ESC / ENTER / L)");
  drawText("Deze scores worden niet online gedeeld.", WIDTH / 2, 610, 10, "#73809d");
}

function drawPortal() {
  const [x, y] = state.portal;
  const active = state.collected >= state.crystalGoal;
  context.save();
  context.shadowBlur = active ? 16 : 0;
  context.shadowColor = "#75e6d1";
  context.strokeStyle = active ? "#75e6d1" : "#39445f";
  context.lineWidth = 3;
  context.beginPath();
  context.arc(x, y, 26 + Math.sin(state.elapsed * 3) * 2, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = 1;
  context.beginPath();
  context.arc(x, y, 17, 0, Math.PI * 2);
  context.stroke();
  context.restore();
  drawText("PORTAAL", x, y + 39, 9, active ? "#75e6d1" : "#68728b", "700");
}

function drawCrystal(x, y) {
  context.beginPath();
  context.moveTo(x, y - 10);
  context.lineTo(x + 8, y);
  context.lineTo(x, y + 10);
  context.lineTo(x - 8, y);
  context.closePath();
  context.fillStyle = "#f2d47b";
  context.strokeStyle = "#fff0bd";
  context.fill();
  context.stroke();
  context.fillStyle = "#fff9dd";
  context.beginPath();
  context.arc(x, y, 2, 0, Math.PI * 2);
  context.fill();
}

function drawShieldPickup(x, y) {
  context.strokeStyle = "#63c7ff";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 15 + Math.sin(state.elapsed * 4) * 2, 0, Math.PI * 2);
  context.stroke();
  context.beginPath();
  context.moveTo(x, y - 10);
  context.lineTo(x + 8, y - 4);
  context.lineTo(x + 6, y + 6);
  context.lineTo(x, y + 11);
  context.lineTo(x - 6, y + 6);
  context.lineTo(x - 8, y - 4);
  context.closePath();
  context.fillStyle = "#3ba8e8";
  context.fill();
  context.strokeStyle = "#c4efff";
  context.stroke();
}

function drawPowerup(pickup) {
  const [x, y] = pickup.position;
  const colors = {
    magnet: "#c084fc",
    slow: "#65d9ff",
    boost: "#ffb45c",
  };
  const symbols = { magnet: "M", slow: "T", boost: "+" };
  const color = colors[pickup.type];
  context.save();
  context.shadowColor = color;
  context.shadowBlur = 12;
  context.strokeStyle = color;
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 14 + Math.sin(state.elapsed * 5) * 2, 0, Math.PI * 2);
  context.stroke();
  context.fillStyle = color;
  context.beginPath();
  context.arc(x, y, 9, 0, Math.PI * 2);
  context.fill();
  context.restore();
  drawText(symbols[pickup.type], x, y, 11, "#080d1b", "700");
}

function drawDrone(x, y) {
  context.fillStyle = "#d94f73";
  context.strokeStyle = "#ff96a9";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 14, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  context.fillStyle = "#fff0f2";
  context.beginPath();
  context.arc(x - 3, y - 2, 2, 0, Math.PI * 2);
  context.arc(x + 4, y - 2, 2, 0, Math.PI * 2);
  context.fill();
}

function drawPlayer() {
  const [x, y] = state.player;
  if (state.invulnerable > 0 && Math.floor(state.invulnerable * 12) % 2) {
    return;
  }
  context.fillStyle = "#1e4656";
  context.strokeStyle = "#75e6d1";
  context.lineWidth = 2;
  context.beginPath();
  context.arc(x, y, 20, 0, Math.PI * 2);
  context.fill();
  context.stroke();
  if (state.shieldCharges) {
    context.strokeStyle = "#63c7ff";
    context.beginPath();
    context.arc(x, y, 25, 0, Math.PI * 2);
    context.stroke();
  }
  const activeEffectColor = state.magnetTime > 0
    ? "#c084fc"
    : state.slowTime > 0
      ? "#65d9ff"
      : state.boostTime > 0
        ? "#ffb45c"
        : null;
  if (activeEffectColor) {
    context.strokeStyle = activeEffectColor;
    context.setLineDash([4, 4]);
    context.beginPath();
    context.arc(x, y, 31, 0, Math.PI * 2);
    context.stroke();
    context.setLineDash([]);
  }
  context.save();
  context.translate(x, y);
  context.rotate(Math.atan2(state.playerDirection[1], state.playerDirection[0]));
  if (state.dashTime) {
    context.strokeStyle = "#75e6d1";
    context.lineWidth = 3;
    context.beginPath();
    context.moveTo(-20, 0);
    context.lineTo(-38, 0);
    context.stroke();
  }
  context.beginPath();
  context.moveTo(15, 0);
  context.lineTo(-8, -11);
  context.lineTo(-4, 0);
  context.lineTo(-8, 11);
  context.closePath();
  context.fillStyle = "#f3f5ff";
  context.strokeStyle = "#b6fff1";
  context.fill();
  context.stroke();
  context.restore();
}

function drawDroneArrow(spawn) {
  const [spawnX, spawnY] = spawn.position;
  const positions = {
    left: [spawnX + 18, spawnY, 0],
    right: [spawnX - 18, spawnY, Math.PI],
    top: [spawnX, spawnY + 18, Math.PI / 2],
    bottom: [spawnX, spawnY - 18, -Math.PI / 2],
  };
  const [x, y, angle] = positions[spawn.side];
  context.save();
  context.translate(x, y);
  context.rotate(angle);
  context.shadowColor = "#ff405b";
  context.shadowBlur = 12;
  context.fillStyle = "#ff405b";
  context.strokeStyle = "#fff0f2";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(24, 0);
  context.lineTo(7, -13);
  context.lineTo(7, -5);
  context.lineTo(-18, -5);
  context.lineTo(-18, 5);
  context.lineTo(7, 5);
  context.lineTo(7, 13);
  context.closePath();
  context.fill();
  context.stroke();
  context.restore();
}

function drawArena() {
  drawStars();
  context.fillStyle = "#10182b";
  context.fillRect(0, 0, WIDTH, FIELD_TOP);
  context.strokeStyle = "#273553";
  context.lineWidth = 2;
  context.beginPath();
  context.moveTo(0, FIELD_TOP);
  context.lineTo(WIDTH, FIELD_TOP);
  context.stroke();

  drawText("KOSMISCHE KOERIER", 25, 30, 14, "#75e6d1", "700", "left");
  drawText(
    `KRISTALLEN   ${Math.min(state.collected, state.crystalGoal)} / ${state.crystalGoal}`,
    WIDTH - 25, 30, 14, "#f2d47b", "700", "right",
  );
  drawText(`LEVEL ${state.level}`, WIDTH / 2, 62, 10, "#aab5d0", "700");
  drawText("LEVENS", 25, 62, 10, "#aab5d0", "700", "left");
  for (let index = 0; index < 3; index += 1) {
    const x = 89 + index * 22;
    context.beginPath();
    context.moveTo(x, 54);
    context.lineTo(x - 8, 63);
    context.lineTo(x, 72);
    context.lineTo(x + 8, 63);
    context.closePath();
    context.fillStyle = index < state.health ? "#ff718f" : "#30374b";
    context.fill();
  }
  drawText("DASH", 165, 63, 9, "#aab5d0", "700");
  const dashProgress = 1 - Math.min(state.dashCooldown / DASH_COOLDOWN, 1);
  roundedRect(190, 56, 80, 13, 3, "#202a40", "#526481");
  if (dashProgress > 0) {
    roundedRect(
      191, 57, 78 * dashProgress, 11, 2,
      dashProgress >= 1 ? "#75e6d1" : "#687da8",
    );
  }
  const shieldColor = state.shieldCharges ? "#75e6d1" : "#39445f";
  context.fillStyle = shieldColor;
  context.strokeStyle = "#aab5d0";
  context.beginPath();
  context.moveTo(288, 54);
  context.lineTo(296, 57);
  context.lineTo(295, 66);
  context.lineTo(288, 71);
  context.lineTo(281, 66);
  context.lineTo(280, 57);
  context.closePath();
  context.fill();
  context.stroke();
  drawText("SCHILD", 304, 63, 9, shieldColor, "700", "left");
  const activePowerups = [
    state.magnetTime > 0 && `MAGNEET ${Math.ceil(state.magnetTime)}s`,
    state.slowTime > 0 && `TIJDVELD ${Math.ceil(state.slowTime)}s`,
    state.boostTime > 0 && `BOOST ${Math.ceil(state.boostTime)}s`,
  ].filter(Boolean);
  if (activePowerups.length) {
    drawText(activePowerups.join("  •  "), WIDTH / 2, 80, 9, "#e5d4ff", "700");
  }

  for (const [left, top, right, bottom] of state.walls) {
    roundedRect(left, top, right - left, bottom - top, 4, "#293654", "#526481");
  }
  drawPortal();
  for (const [x, y] of state.crystals) {
    drawCrystal(x, y);
  }
  if (state.shieldPickup) {
    drawShieldPickup(...state.shieldPickup);
  }
  state.powerups.forEach(drawPowerup);
  for (const [x, y] of state.drones) {
    drawDrone(x, y);
  }
  drawPlayer();

  const droneWarning = state.elapsed >= DRONE_SPAWN_INTERVAL - DRONE_WARNING_TIME
    && state.elapsed < DRONE_SPAWN_INTERVAL
    && state.drones.length < 5;
  if (droneWarning) {
    const secondsLeft = Math.ceil(DRONE_SPAWN_INTERVAL - state.elapsed);
    drawText(
      `DRONE NADERT OVER ${secondsLeft} SECONDEN!`,
      WIDTH / 2, FIELD_TOP + 17, 11, "#ff718f", "700",
    );
  }
  if (state.collected >= state.crystalGoal) {
    drawText(
      "PORTAAL GEACTIVEERD - bereik de cirkel!",
      WIDTH / 2, FIELD_TOP + (droneWarning ? 38 : 17), 11, "#75e6d1", "700",
    );
  }
  const arrowSpawn = state.droneArrowTime > 0
    ? state.droneArrowSpawn
    : state.pendingDroneSpawn;
  if (arrowSpawn) {
    drawDroneArrow(arrowSpawn);
  }
}

function drawOverlay(title, subtitle) {
  context.fillStyle = "#050914aa";
  context.fillRect(0, 0, WIDTH, HEIGHT);
  drawText(title, WIDTH / 2, HEIGHT / 2 - 25, 34, "#f3f5ff", "700");
  const lines = subtitle.split("\n");
  lines.forEach((line, index) =>
    drawText(line, WIDTH / 2, HEIGHT / 2 + 20 + index * 24, 14, "#aab5d0")
  );
}

function drawSavingMenu() {
  drawOverlay(
    "SPEL OPSLAAN",
    "Kies een slot om op te slaan (bestaande gegevens worden overschreven).",
  );
  for (let index = 0; index < SAVE_COUNT; index += 1) {
    const slot = saveSlots[index];
    const label = slot
      ? `SLOT ${index + 1}  •  HUIDIG LEVEL ${slot.level ?? "?"}`
      : `SLOT ${index + 1}  •  LEEG`;
    drawButton(365 + index * 47, label);
  }
  drawText("Druk op 1, 2 of 3  •  ESC om terug te gaan", WIDTH / 2, 530, 11, "#aab5d0");
}

function draw() {
  if (state.screen === "menu") {
    drawMenu();
    return;
  }
  if (state.screen === "leaderboard") {
    drawLocalLeaderboard();
    return;
  }
  drawArena();
  if (state.screen === "saving") {
    drawSavingMenu();
  } else if (state.screen === "paused") {
    drawOverlay(
      "PAUZE",
      `${notice ? `${notice}\n` : ""}S • opslaan   P / ESC • verder spelen`,
    );
  } else if (state.screen === "won") {
    drawOverlay(
      `LEVEL ${state.level} VOLTOOID!`,
      `Druk op ENTER voor level ${state.level + 1}`,
    );
  } else if (state.screen === "over") {
    drawOverlay(
      "GAME OVER",
      "ENTER • opnieuw proberen\nESC / M • hoofdmenu",
    );
    drawButton(390, "HOOFDMENU  (KLIK / ESC / M)");
  }
}

function frame(timestamp) {
  const dt = frame.lastTime === undefined
    ? 0
    : Math.min((timestamp - frame.lastTime) / 1000, 0.05);
  frame.lastTime = timestamp;
  state.step(dt, pressedKeys, pressedKeys.has("dash"), joystickInput);
  recordLocalScore();
  syncTouchButtons();
  draw();
  requestAnimationFrame(frame);
}

window.addEventListener("keydown", onKeyDown);
window.addEventListener("keyup", onKeyUp);
window.addEventListener("blur", clearMovementInput);
window.addEventListener("resize", resizeGameCanvas);
window.addEventListener("orientationchange", resizeGameCanvas);
window.addEventListener("pageshow", resizeGameCanvas);
window.addEventListener("load", resizeGameCanvas);
document.addEventListener("fullscreenchange", updateFullscreenButton);
canvas.addEventListener("click", onCanvasClick);
joystick.addEventListener("pointerdown", (event) => {
  event.preventDefault();
  joystickPointerId = event.pointerId;
  joystick.setPointerCapture(event.pointerId);
  moveJoystick(event);
});
joystick.addEventListener("pointermove", (event) => {
  if (event.pointerId === joystickPointerId) {
    event.preventDefault();
    moveJoystick(event);
  }
});
const releaseJoystick = (event) => {
  if (event.pointerId === joystickPointerId) {
    clearJoystick();
  }
};
joystick.addEventListener("pointerup", releaseJoystick);
joystick.addEventListener("pointercancel", releaseJoystick);
joystick.addEventListener("lostpointercapture", releaseJoystick);
document.querySelectorAll(".touch-controls [data-key]").forEach((button) => {
  const key = button.dataset.key;
  button.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    pressedKeys.add(key);
    button.setPointerCapture(event.pointerId);
  });
  const release = (event) => {
    event.preventDefault();
    pressedKeys.delete(key);
  };
  button.addEventListener("pointerup", release);
  button.addEventListener("pointercancel", release);
  button.addEventListener("lostpointercapture", release);
});
pauseButton.addEventListener("click", () => {
  if (state.screen === "playing") {
    state.screen = "paused";
    clearMovementInput();
  } else if (state.screen === "paused") {
    state.screen = "playing";
    notice = "";
  } else if (state.screen === "saving") {
    state.screen = "paused";
  }
});
saveButton.addEventListener("click", () => {
  if (state.screen === "playing" || state.screen === "paused") {
    state.screen = "saving";
    clearMovementInput();
  }
});
fullscreenButton.addEventListener("click", toggleFullscreen);
nextLevelButton.addEventListener("click", () => {
  if (state.screen === "won") {
    state.nextLevel();
    clearMovementInput();
  }
});
readSaveSlots();
readLocalScores();
updateFullscreenButton();
resizeGameCanvas();
requestAnimationFrame(frame);

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("De offlinecache kon niet worden gestart.", error);
    });
  });
}
