"""Kosmische Koerier - een klein, speelbaar ruimte-avontuur.

Start met: py kosmische_koerier.py
Besturing: WASD/pijltjes bewegen, spatie is een korte dash, P pauzeert.
"""

import json
import math
import random
import tkinter as tk
from pathlib import Path


WIDTH = 900
HEIGHT = 620
FIELD_TOP = 90
FIELD_BOTTOM = HEIGHT - 24
CRYSTAL_GOAL = 8
CRYSTALS_ON_MAP = 6
PLAYER_SPEED = 245
DRONE_SPEED = 82
DASH_DURATION = 0.18
DASH_COOLDOWN = 1.1
DRONE_SPAWN_INTERVAL = 18
DRONE_WARNING_TIME = 3


def distance(x1, y1, x2, y2):
    return math.hypot(x2 - x1, y2 - y1)


class GameState:
    """Game-regels los van het venster, zodat beweging en botsingen testbaar zijn."""

    def __init__(self, rng=None):
        self.rng = rng or random.Random()
        self.reset()

    def reset(self):
        self.level = 1
        self.player = [WIDTH / 2, HEIGHT / 2]
        self.player_direction = [1, 0]
        self.walls = self._level_walls()
        self.crystals = []
        self.drones = []
        self.collected = 0
        self.health = 3
        self.shield_charges = 0
        self.shield_pickup = None
        self.elapsed = 0.0
        self.invulnerable = 0.0
        self.dash_cooldown = 0.0
        self.dash_time = 0.0
        self.screen = "playing"
        self._spawn_crystals(self.crystal_spawn_count)
        self._spawn_drone()
        self._spawn_shield_pickup()

    @property
    def crystal_goal(self):
        return self.level * CRYSTAL_GOAL

    @property
    def crystal_spawn_count(self):
        return math.ceil(CRYSTALS_ON_MAP * 1.1 ** (self.level - 1))

    @property
    def portal(self):
        return WIDTH - 76, FIELD_BOTTOM - 64

    def _level_walls(self, level=None):
        if (self.level if level is None else level) % 4:
            return []
        return [
            (280, 180, 310, 350),
            (570, 340, 600, 510),
        ]

    def _overlaps_wall(self, x, y, radius):
        return any(
            left - radius <= x <= right + radius
            and top - radius <= y <= bottom + radius
            for left, top, right, bottom in self.walls
        )

    def _segment_hits_wall(self, start, end, radius):
        for left, top, right, bottom in self.walls:
            left -= radius + 1
            top -= radius + 1
            right += radius + 1
            bottom += radius + 1
            minimum_t, maximum_t = 0.0, 1.0
            for origin, delta, minimum, maximum in (
                (start[0], end[0] - start[0], left, right),
                (start[1], end[1] - start[1], top, bottom),
            ):
                if delta == 0:
                    if not minimum <= origin <= maximum:
                        minimum_t = 1.0
                        maximum_t = 0.0
                        break
                else:
                    first = (minimum - origin) / delta
                    second = (maximum - origin) / delta
                    minimum_t = max(minimum_t, min(first, second))
                    maximum_t = min(maximum_t, max(first, second))
                    if minimum_t > maximum_t:
                        break
            if minimum_t <= maximum_t:
                return True
        return False

    def _drone_target(self, index):
        count = len(self.drones)
        cycle = max(2.4, count * 1.25)
        attack_phase = (self.elapsed - index * cycle / count) % cycle
        radius = 22 if attack_phase < 0.8 else 42
        angle = 2 * math.pi * index / count + self.elapsed * 0.3
        x = self.player[0] + math.cos(angle) * radius
        y = self.player[1] + math.sin(angle) * radius
        return (
            min(max(x, 20), WIDTH - 20),
            min(max(y, FIELD_TOP - 10), FIELD_BOTTOM + 10),
        )

    def _drone_waypoint(self, drone, target=None):
        target = tuple(self.player) if target is None else tuple(target)
        start = tuple(drone)
        if not self._segment_hits_wall(start, target, 14):
            return target

        waypoints = [start, target]
        margin = 18
        for left, top, right, bottom in self.walls:
            waypoints.extend((
                (left - margin, top - margin),
                (left - margin, bottom + margin),
                (right + margin, top - margin),
                (right + margin, bottom + margin),
            ))

        costs = [math.inf] * len(waypoints)
        previous = [None] * len(waypoints)
        remaining = set(range(len(waypoints)))
        costs[0] = 0.0
        while remaining:
            current = min(remaining, key=lambda index: costs[index])
            if math.isinf(costs[current]):
                break
            remaining.remove(current)
            if current == 1:
                break
            for neighbor in remaining:
                if self._segment_hits_wall(
                    waypoints[current], waypoints[neighbor], 14
                ):
                    continue
                candidate = costs[current] + distance(
                    *waypoints[current], *waypoints[neighbor]
                )
                if candidate < costs[neighbor]:
                    costs[neighbor] = candidate
                    previous[neighbor] = current

        if previous[1] is None:
            return target
        route = [1]
        while route[-1] != 0:
            route.append(previous[route[-1]])
        route.reverse()
        return waypoints[route[1]]

    def to_dict(self):
        return {
            "level": self.level,
            "player": self.player,
            "player_direction": self.player_direction,
            "crystals": self.crystals,
            "drones": self.drones,
            "collected": self.collected,
            "health": self.health,
            "shield_charges": self.shield_charges,
            "shield_pickup": self.shield_pickup,
            "elapsed": self.elapsed,
            "invulnerable": self.invulnerable,
            "dash_cooldown": self.dash_cooldown,
            "dash_time": self.dash_time,
        }

    def load_dict(self, data):
        if not isinstance(data, dict):
            raise ValueError("De opgeslagen spelgegevens zijn ongeldig.")

        level = data.get("level")
        collected = data.get("collected")
        health = data.get("health")
        shield_charges = data.get("shield_charges", 0)
        if type(level) is not int or level < 1:
            raise ValueError("Het opgeslagen level is ongeldig.")
        if type(collected) is not int or collected < 0:
            raise ValueError("De opgeslagen kristaltelling is ongeldig.")
        if type(health) is not int or not 1 <= health <= 3:
            raise ValueError("Het opgeslagen aantal levens is ongeldig.")
        if type(shield_charges) is not int or not 0 <= shield_charges <= 1:
            raise ValueError("De opgeslagen schildlading is ongeldig.")

        walls = self._level_walls(level)

        def position(value, name, radius=0):
            if (
                not isinstance(value, list)
                or len(value) != 2
                or any(
                    isinstance(coordinate, bool)
                    or not isinstance(coordinate, (int, float))
                    or not math.isfinite(coordinate)
                    for coordinate in value
                )
            ):
                raise ValueError(f"De opgeslagen positie ({name}) is ongeldig.")
            point = [float(value[0]), float(value[1])]
            if self._position_overlaps_walls(point, walls, radius):
                raise ValueError(f"De opgeslagen positie ({name}) ligt in een muur.")
            return point

        player = position(data.get("player"), "speler", 20)
        direction = position(data.get("player_direction"), "richting")
        direction_length = math.hypot(*direction)
        if direction_length == 0:
            raise ValueError("De opgeslagen speelrichting is ongeldig.")
        direction = [value / direction_length for value in direction]

        crystals_data = data.get("crystals")
        drones_data = data.get("drones")
        if not isinstance(crystals_data, list) or len(crystals_data) > 100:
            raise ValueError("De opgeslagen kristallen zijn ongeldig.")
        if not isinstance(drones_data, list) or len(drones_data) > 5:
            raise ValueError("De opgeslagen drones zijn ongeldig.")
        crystals = [
            position(crystal, "kristal", 12) for crystal in crystals_data
        ]
        drones = [
            position(drone, "drone", 14) for drone in drones_data
        ]
        shield_pickup_data = data.get("shield_pickup")
        shield_pickup = (
            None
            if shield_pickup_data is None
            else position(shield_pickup_data, "schild", 12)
        )
        if not (
            22 <= player[0] <= WIDTH - 22
            and FIELD_TOP + 12 <= player[1] <= FIELD_BOTTOM - 12
        ):
            raise ValueError("De opgeslagen speler staat buiten het speelveld.")
        world_objects = crystals + drones
        if shield_pickup is not None:
            world_objects.append(shield_pickup)
        if any(not 0 <= x <= WIDTH or not 0 <= y <= HEIGHT for x, y in world_objects):
            raise ValueError("Een opgeslagen object staat buiten het speelveld.")

        timers = {}
        for name, maximum in (
            ("elapsed", None),
            ("invulnerable", 1.2),
            ("dash_cooldown", DASH_COOLDOWN),
            ("dash_time", DASH_DURATION),
        ):
            value = data.get(name)
            if (
                isinstance(value, bool)
                or not isinstance(value, (int, float))
                or not math.isfinite(value)
                or value < 0
                or (maximum is not None and value > maximum)
            ):
                raise ValueError(f"De opgeslagen tijd ({name}) is ongeldig.")
            timers[name] = float(value)

        self.level = level
        self.walls = walls
        self.player = player
        self.player_direction = direction
        self.crystals = crystals
        self.drones = drones
        self.collected = collected
        self.health = health
        self.shield_charges = shield_charges
        self.shield_pickup = shield_pickup
        self.elapsed = timers["elapsed"]
        self.invulnerable = timers["invulnerable"]
        self.dash_cooldown = timers["dash_cooldown"]
        self.dash_time = timers["dash_time"]
        self.screen = "playing"

    @staticmethod
    def _position_overlaps_walls(point, walls, radius):
        return any(
            left - radius <= point[0] <= right + radius
            and top - radius <= point[1] <= bottom + radius
            for left, top, right, bottom in walls
        )

    def next_level(self):
        self.level += 1
        self.player = [WIDTH / 2, HEIGHT / 2]
        self.player_direction = [1, 0]
        self.walls = self._level_walls()
        self.crystals = []
        self.drones = []
        self.collected = 0
        self.elapsed = 0.0
        self.invulnerable = 0.0
        self.dash_cooldown = 0.0
        self.dash_time = 0.0
        self.shield_charges = 0
        self.shield_pickup = None
        self.screen = "playing"
        self._spawn_crystals(self.crystal_spawn_count)
        self._spawn_drone()
        self._spawn_shield_pickup()

    def _spawn_crystals(self, amount=1):
        for _ in range(amount):
            for attempt in range(100):
                x = self.rng.randint(48, WIDTH - 48)
                y = self.rng.randint(FIELD_TOP + 28, FIELD_BOTTOM - 28)
                if (
                    distance(x, y, *self.player) > 105
                    and distance(x, y, *self.portal) > 90
                    and not self._overlaps_wall(x, y, 12)
                ):
                    self.crystals.append([x, y])
                    break

    def _spawn_shield_pickup(self):
        self.shield_pickup = None
        for _ in range(100):
            x = self.rng.randint(48, WIDTH - 48)
            y = self.rng.randint(FIELD_TOP + 28, FIELD_BOTTOM - 28)
            if (
                distance(x, y, *self.player) > 130
                and distance(x, y, *self.portal) > 110
                and all(distance(x, y, *crystal) > 40 for crystal in self.crystals)
                and not self._overlaps_wall(x, y, 12)
            ):
                self.shield_pickup = [x, y]
                return

    def _spawn_drone(self):
        side = self.rng.choice(("left", "right", "top", "bottom"))
        if side == "left":
            position = [20, self.rng.randint(FIELD_TOP, FIELD_BOTTOM)]
        elif side == "right":
            position = [WIDTH - 20, self.rng.randint(FIELD_TOP, FIELD_BOTTOM)]
        elif side == "top":
            position = [self.rng.randint(20, WIDTH - 20), FIELD_TOP - 10]
        else:
            position = [self.rng.randint(20, WIDTH - 20), FIELD_BOTTOM + 10]
        self.drones.append(position)

    def step(self, dt, directions, dash=False):
        if self.screen != "playing":
            return

        dt = min(dt, 0.05)
        self.elapsed += dt
        self.invulnerable = max(0.0, self.invulnerable - dt)
        self.dash_cooldown = max(0.0, self.dash_cooldown - dt)
        self.dash_time = max(0.0, self.dash_time - dt)

        if dash and self.dash_cooldown == 0:
            self.dash_time = DASH_DURATION
            self.dash_cooldown = DASH_COOLDOWN

        dx = int("right" in directions) - int("left" in directions)
        dy = int("down" in directions) - int("up" in directions)
        if dx or dy:
            magnitude = math.hypot(dx, dy)
            self.player_direction = [dx / magnitude, dy / magnitude]
            speed = PLAYER_SPEED * (2.35 if self.dash_time else 1)
            move_x = dx / magnitude * speed * dt
            move_y = dy / magnitude * speed * dt
            if not self._overlaps_wall(self.player[0] + move_x, self.player[1], 20):
                self.player[0] += move_x
            if not self._overlaps_wall(self.player[0], self.player[1] + move_y, 20):
                self.player[1] += move_y
        self.player[0] = min(max(22, self.player[0]), WIDTH - 22)
        self.player[1] = min(max(FIELD_TOP + 12, self.player[1]), FIELD_BOTTOM - 12)

        for crystal in self.crystals[:]:
            if distance(*self.player, *crystal) < 27:
                self.crystals.remove(crystal)
                self.collected += 1
                self._spawn_crystals()

        if (
            self.shield_pickup is not None
            and self.shield_charges == 0
            and distance(*self.player, *self.shield_pickup) < 27
        ):
            self.shield_charges = 1
            self.shield_pickup = None

        for index, drone in enumerate(self.drones):
            target = self._drone_target(index)
            if self._overlaps_wall(*target, 14):
                target = tuple(self.player)
            waypoint_x, waypoint_y = self._drone_waypoint(drone, target)
            steer_x = waypoint_x - drone[0]
            steer_y = waypoint_y - drone[1]
            for other_index, other in enumerate(self.drones):
                if other_index == index:
                    continue
                away_x = drone[0] - other[0]
                away_y = drone[1] - other[1]
                separation = math.hypot(away_x, away_y)
                if separation >= 36:
                    continue
                if separation == 0:
                    angle = 2 * math.pi * index / len(self.drones)
                    away_x, away_y = math.cos(angle), math.sin(angle)
                else:
                    away_x /= separation
                    away_y /= separation
                strength = (36 - separation) * 3
                steer_x += away_x * strength
                steer_y += away_y * strength

            steering_length = max(math.hypot(steer_x, steer_y), 1)
            movement = min(DRONE_SPEED * dt, steering_length)
            move_x = steer_x / steering_length * movement
            move_y = steer_y / steering_length * movement
            if not self._overlaps_wall(drone[0] + move_x, drone[1], 14):
                drone[0] += move_x
            if not self._overlaps_wall(drone[0], drone[1] + move_y, 14):
                drone[1] += move_y
            player_separation = max(distance(*self.player, *drone), 1)
            if player_separation < 26 and self.invulnerable == 0:
                if self.shield_charges:
                    self.shield_charges = 0
                    self.invulnerable = 0.8
                else:
                    self.health -= 1
                    self.invulnerable = 1.2
                push_x = self.player[0] + (self.player[0] - drone[0]) / player_separation * 38
                push_y = self.player[1] + (self.player[1] - drone[1]) / player_separation * 38
                if not self._overlaps_wall(push_x, self.player[1], 20):
                    self.player[0] = min(max(30, push_x), WIDTH - 30)
                if not self._overlaps_wall(self.player[0], push_y, 20):
                    self.player[1] = min(max(FIELD_TOP + 20, push_y), FIELD_BOTTOM - 20)
                if self.health <= 0:
                    self.screen = "over"
                break

        if self.elapsed >= DRONE_SPAWN_INTERVAL and len(self.drones) < 5:
            self.elapsed = 0
            self._spawn_drone()

        if self.collected >= self.crystal_goal and distance(*self.player, *self.portal) < 42:
            self.screen = "won"


class KosmischeKoerier:
    def __init__(self, root):
        self.root = root
        self.root.title("Kosmische Koerier")
        self.root.resizable(False, False)
        self.canvas = tk.Canvas(
            root, width=WIDTH, height=HEIGHT, bg="#080d1b", highlightthickness=0
        )
        self.canvas.pack()
        self.state = GameState()
        self.state.screen = "menu"
        self.save_path = Path.home() / ".kosmische_koerier_saves.json"
        self.save_slots = [None, None, None]
        self.notice = ""
        self.save_slots = self._read_save_slots()
        self.keys = set()
        self.last_time = None
        self.stars = [
            (random.randrange(WIDTH), random.randrange(FIELD_TOP, HEIGHT), random.choice((1, 1, 2)))
            for _ in range(100)
        ]
        self.root.bind("<KeyPress>", self.on_key_down)
        self.root.bind("<KeyRelease>", self.on_key_up)
        self.root.bind("<FocusOut>", self.on_focus_out)
        self.canvas.bind("<Button-1>", self.on_click)
        self.draw_menu()
        self.tick()

    def _read_save_slots(self):
        if not self.save_path.exists():
            return [None, None, None]
        try:
            data = json.loads(self.save_path.read_text(encoding="utf-8"))
            slots = data.get("slots") if isinstance(data, dict) else None
            if (
                not isinstance(slots, list)
                or len(slots) != 3
                or any(slot is not None and not isinstance(slot, dict) for slot in slots)
            ):
                raise ValueError("Het opslagbestand bevat niet drie geldige slots.")
            return slots
        except (OSError, ValueError) as error:
            self.notice = f"Opslagbestand kon niet worden gelezen: {error}"
            return [None, None, None]

    def save_slot(self, index):
        slots = self.save_slots[:]
        slots[index] = self.state.to_dict()
        try:
            self.save_path.parent.mkdir(parents=True, exist_ok=True)
            self.save_path.write_text(
                json.dumps({"slots": slots}, indent=2),
                encoding="utf-8",
            )
        except OSError as error:
            self.notice = f"Opslaan is mislukt: {error}"
            self.state.screen = "paused"
            return
        self.save_slots = slots
        self.notice = f"Spel opgeslagen in slot {index + 1}."
        self.state.screen = "paused"

    def load_slot(self, index):
        data = self.save_slots[index]
        if data is None:
            self.notice = f"Slot {index + 1} is leeg."
            return
        try:
            self.state.load_dict(data)
        except ValueError as error:
            self.notice = f"Slot {index + 1} kon niet worden geladen: {error}"
            return
        self.notice = ""
        self.last_time = None

    def on_click(self, event):
        if self.state.screen == "menu":
            if 220 <= event.x <= 680 and 390 <= event.y <= 430:
                self.start_game()
                return
            for index, top in enumerate((440, 486, 532)):
                if 220 <= event.x <= 680 and top <= event.y <= top + 42:
                    self.load_slot(index)
                    return
        elif self.state.screen == "saving":
            for index, top in enumerate((365, 412, 459)):
                if 220 <= event.x <= 680 and top <= event.y <= top + 40:
                    self.save_slot(index)
                    return
            if 220 <= event.x <= 680 and 510 <= event.y <= 550:
                self.state.screen = "paused"

    def on_key_down(self, event):
        key = event.keysym.lower()
        if self.state.screen == "menu":
            if key in ("return", "kp_enter", "n"):
                self.start_game()
            elif key in ("1", "2", "3"):
                self.load_slot(int(key) - 1)
            return
        if self.state.screen == "saving":
            if key in ("1", "2", "3"):
                self.save_slot(int(key) - 1)
            elif key in ("escape", "p"):
                self.state.screen = "paused"
            return
        if self.state.screen == "paused":
            if key in ("p", "escape"):
                self.state.screen = "playing"
            elif key == "s":
                self.state.screen = "saving"
            return
        if self.state.screen in ("over", "won"):
            if key in ("return", "kp_enter"):
                if self.state.screen == "over":
                    self.start_game()
                else:
                    self.state.next_level()
            return

        if key in ("left", "a"):
            self.keys.add("left")
        elif key in ("right", "d"):
            self.keys.add("right")
        elif key in ("up", "w"):
            self.keys.add("up")
        elif key in ("down", "s"):
            self.keys.add("down")
        elif key == "space":
            self.keys.add("dash")
        elif key in ("p", "escape"):
            if self.state.screen == "playing":
                self.state.screen = "paused"

    def on_key_up(self, event):
        key = event.keysym.lower()
        aliases = {
            "left": "left", "a": "left",
            "right": "right", "d": "right",
            "up": "up", "w": "up",
            "down": "down", "s": "down",
            "space": "dash",
        }
        if key in aliases:
            self.keys.discard(aliases[key])

    def on_focus_out(self, _event):
        self.keys.clear()

    def start_game(self):
        self.state.reset()
        self.last_time = None
        self.notice = ""

    def tick(self):
        now = self.root.tk.call("clock", "milliseconds") / 1000
        dt = 0 if self.last_time is None else now - self.last_time
        self.last_time = now
        if self.state.screen == "playing":
            self.state.step(dt, self.keys, dash="dash" in self.keys)
        self.draw()
        self.root.after(16, self.tick)

    def draw(self):
        self.canvas.delete("all")
        self.draw_stars()
        if self.state.screen == "menu":
            self.draw_menu()
        elif self.state.screen == "saving":
            self.draw_arena()
            self.draw_save_menu()
        elif self.state.screen in ("over", "won"):
            self.draw_arena()
            self.draw_end_screen()
        else:
            self.draw_arena()
            if self.state.screen == "paused":
                subtitle = "S • opslaan   P / ESC • verder spelen"
                if self.notice:
                    subtitle = f"{self.notice}\n{subtitle}"
                self.draw_overlay("PAUZE", subtitle)

    def draw_stars(self):
        for x, y, radius in self.stars:
            self.canvas.create_oval(
                x - radius, y - radius, x + radius, y + radius,
                fill="#34415e", outline="",
            )

    def draw_menu(self):
        self.canvas.create_text(
            WIDTH / 2, 135, text="KOSMISCHE", fill="#75e6d1",
            font=("Segoe UI", 22, "bold"), anchor="s",
        )
        self.canvas.create_text(
            WIDTH / 2, 197, text="KOERIER", fill="#f3f5ff",
            font=("Segoe UI", 48, "bold"), anchor="s",
        )
        self.canvas.create_text(
            WIDTH / 2, 247, text="Een klein avontuur tussen de sterren",
            fill="#aab5d0", font=("Segoe UI", 15),
        )
        self.canvas.create_text(
            WIDTH / 2, 295,
            text="Verzamel 8 sterrenkristallen en bereik de PORTAAL",
            fill="#edf0fa", font=("Segoe UI", 16, "bold"),
        )
        self.canvas.create_text(
            WIDTH / 2, 335,
            text=(
                "WASD / pijltjes • bewegen    SPATIE • dash    P / ESC • pauze\n"
                "Blauw schildkristal vangt één drone-aanval op"
            ),
            fill="#aab5d0", font=("Segoe UI", 13), justify="center",
        )
        self.canvas.create_rectangle(
            220, 390, 680, 430, fill="#173c48", outline="#75e6d1", width=2
        )
        self.canvas.create_text(
            WIDTH / 2, 410, text="NIEUW SPEL  (ENTER / N)",
            fill="#75e6d1", font=("Segoe UI", 14, "bold"),
        )
        for index, top in enumerate((440, 486, 532)):
            slot = self.save_slots[index]
            if slot is None:
                label = f"LAAD SLOT {index + 1}  •  LEEG"
            else:
                label = (
                    f"LAAD SLOT {index + 1}  •  LEVEL {slot.get('level', '?')}  •  "
                    f"{slot.get('collected', '?')} KRISTALLEN"
                )
            self.canvas.create_rectangle(
                220, top, 680, top + 42,
                fill="#151f36", outline="#39445f", width=1,
            )
            self.canvas.create_text(
                WIDTH / 2, top + 21, text=label,
                fill="#edf0fa" if slot is not None else "#73809d",
                font=("Segoe UI", 12, "bold"),
            )
        self.canvas.create_text(
            WIDTH / 2, 590, text="Klik op een slot of druk op 1, 2 of 3 om te laden.",
            fill="#73809d", font=("Segoe UI", 10),
        )
        if self.notice:
            self.canvas.create_text(
                WIDTH / 2, 610, text=self.notice,
                fill="#ffb5bd", font=("Segoe UI", 9),
            )

    def draw_save_menu(self):
        self.draw_overlay(
            "SPEL OPSLAAN",
            "Kies een slot om op te slaan (bestaande gegevens worden overschreven).",
        )
        for index, top in enumerate((365, 412, 459)):
            slot = self.save_slots[index]
            label = f"SLOT {index + 1}  •  LEEG" if slot is None else (
                f"SLOT {index + 1}  •  HUIDIG LEVEL {slot.get('level', '?')}"
            )
            self.canvas.create_rectangle(
                220, top, 680, top + 40,
                fill="#151f36", outline="#75e6d1", width=1,
            )
            self.canvas.create_text(
                WIDTH / 2, top + 20, text=label,
                fill="#edf0fa", font=("Segoe UI", 12, "bold"),
            )
        self.canvas.create_text(
            WIDTH / 2, 530, text="Druk op 1, 2 of 3 • ESC om terug te gaan",
            fill="#aab5d0", font=("Segoe UI", 11),
        )

    def draw_arena(self):
        self.canvas.create_rectangle(
            0, 0, WIDTH, FIELD_TOP, fill="#10182b", outline=""
        )
        self.canvas.create_line(
            0, FIELD_TOP, WIDTH, FIELD_TOP, fill="#273553", width=2
        )
        self.canvas.create_text(
            25, 30, text="KOSMISCHE KOERIER", anchor="w",
            fill="#75e6d1", font=("Segoe UI", 14, "bold"),
        )
        self.canvas.create_text(
            WIDTH - 25, 30,
            text=f"KRISTALLEN   {min(self.state.collected, self.state.crystal_goal)} / {self.state.crystal_goal}",
            anchor="e", fill="#f2d47b", font=("Segoe UI", 14, "bold"),
        )
        self.canvas.create_text(
            WIDTH / 2, 62, text=f"LEVEL {self.state.level}",
            fill="#aab5d0", font=("Segoe UI", 10, "bold"),
        )
        self.canvas.create_text(
            25, 62, text="LEVENS", anchor="w",
            fill="#aab5d0", font=("Segoe UI", 10, "bold"),
        )
        for i in range(3):
            color = "#ff718f" if i < self.state.health else "#30374b"
            x = 89 + i * 22
            self.canvas.create_polygon(
                x, 54, x - 8, 63, x, 72, x + 8, 63, fill=color, outline=""
            )
        self.canvas.create_text(
            165, 63, text="DASH", fill="#aab5d0",
            font=("Segoe UI", 9, "bold"),
        )
        dash_progress = 1 - min(self.state.dash_cooldown / DASH_COOLDOWN, 1)
        self.canvas.create_rectangle(
            190, 56, 270, 69, fill="#202a40", outline="#526481", width=1
        )
        self.canvas.create_rectangle(
            191, 57, 191 + 78 * dash_progress, 68,
            fill="#75e6d1" if dash_progress >= 1 else "#687da8",
            outline="",
        )
        shield_color = "#75e6d1" if self.state.shield_charges else "#39445f"
        self.canvas.create_polygon(
            288, 54, 296, 57, 295, 66, 288, 71, 281, 66, 280, 57,
            fill=shield_color, outline="#aab5d0", width=1,
        )
        self.canvas.create_text(
            304, 63, text="SCHILD", anchor="w", fill=shield_color,
            font=("Segoe UI", 9, "bold"),
        )
        for left, top, right, bottom in self.state.walls:
            self.canvas.create_rectangle(
                left, top, right, bottom,
                fill="#293654", outline="#526481", width=2,
            )
        self.draw_portal()
        for x, y in self.state.crystals:
            self.canvas.create_polygon(
                x, y - 10, x + 8, y, x, y + 10, x - 8, y,
                fill="#f2d47b", outline="#fff0bd", width=1,
            )
            self.canvas.create_oval(x - 2, y - 2, x + 2, y + 2, fill="#fff9dd", outline="")
        if self.state.shield_pickup is not None:
            x, y = self.state.shield_pickup
            self.canvas.create_oval(
                x - 15, y - 15, x + 15, y + 15,
                outline="#63c7ff", width=2,
            )
            self.canvas.create_polygon(
                x, y - 10, x + 8, y - 4, x + 6, y + 6,
                x, y + 11, x - 6, y + 6, x - 8, y - 4,
                fill="#3ba8e8", outline="#c4efff", width=1,
            )
        for x, y in self.state.drones:
            self.canvas.create_oval(
                x - 14, y - 14, x + 14, y + 14,
                fill="#d94f73", outline="#ff96a9", width=2,
            )
            self.canvas.create_oval(x - 5, y - 4, x - 1, y, fill="#fff0f2", outline="")
            self.canvas.create_oval(x + 2, y - 4, x + 6, y, fill="#fff0f2", outline="")
        self.draw_player()
        drone_warning = (
            self.state.elapsed >= DRONE_SPAWN_INTERVAL - DRONE_WARNING_TIME
            and self.state.elapsed < DRONE_SPAWN_INTERVAL
            and len(self.state.drones) < 5
        )
        if drone_warning:
            seconds_left = math.ceil(DRONE_SPAWN_INTERVAL - self.state.elapsed)
            self.canvas.create_text(
                WIDTH / 2, FIELD_TOP + 17,
                text=f"DRONE NADERT OVER {seconds_left} SECONDEN!",
                fill="#ff718f", font=("Segoe UI", 11, "bold"),
            )
        if self.state.collected >= self.state.crystal_goal:
            self.canvas.create_text(
                WIDTH / 2, FIELD_TOP + (38 if drone_warning else 17),
                text="PORTAAL GEACTIVEERD - bereik de cirkel!",
                fill="#75e6d1", font=("Segoe UI", 11, "bold"),
            )

    def draw_portal(self):
        x, y = self.state.portal
        color = "#75e6d1" if self.state.collected >= self.state.crystal_goal else "#39445f"
        glow = "#c8fff5" if self.state.collected >= self.state.crystal_goal else "#68728b"
        self.canvas.create_oval(x - 26, y - 26, x + 26, y + 26, outline=color, width=3)
        self.canvas.create_oval(x - 17, y - 17, x + 17, y + 17, outline=glow, width=1)
        self.canvas.create_text(x, y + 39, text="PORTAAL", fill=color, font=("Segoe UI", 8, "bold"))

    def draw_player(self):
        x, y = self.state.player
        if self.state.invulnerable > 0 and int(self.state.invulnerable * 12) % 2:
            return
        self.canvas.create_oval(
            x - 20, y - 20, x + 20, y + 20, fill="#1e4656", outline="#75e6d1", width=2
        )
        if self.state.shield_charges:
            self.canvas.create_oval(
                x - 25, y - 25, x + 25, y + 25,
                outline="#63c7ff", width=2,
            )
        direction_x, direction_y = self.state.player_direction
        perpendicular_x, perpendicular_y = -direction_y, direction_x
        arrow_shape = ((15, 0), (-8, -11), (-4, 0), (-8, 11))
        arrow_points = tuple(
            coordinate
            for forward, side in arrow_shape
            for coordinate in (
                x + direction_x * forward + perpendicular_x * side,
                y + direction_y * forward + perpendicular_y * side,
            )
        )
        self.canvas.create_polygon(
            *arrow_points,
            fill="#f3f5ff", outline="#b6fff1", width=1,
        )
        if self.state.dash_time:
            self.canvas.create_line(
                x - direction_x * 20, y - direction_y * 20,
                x - direction_x * 38, y - direction_y * 38,
                fill="#75e6d1", width=3
            )

    def draw_overlay(self, title, subtitle):
        self.canvas.create_rectangle(0, 0, WIDTH, HEIGHT, fill="#050914", stipple="gray50", outline="")
        self.canvas.create_text(
            WIDTH / 2, HEIGHT / 2 - 25, text=title,
            fill="#f3f5ff", font=("Segoe UI", 34, "bold"),
        )
        self.canvas.create_text(
            WIDTH / 2, HEIGHT / 2 + 28, text=subtitle,
            fill="#aab5d0", font=("Segoe UI", 14),
        )

    def draw_end_screen(self):
        if self.state.screen == "won":
            self.draw_overlay(
                f"LEVEL {self.state.level} VOLTOOID!",
                f"Druk op ENTER voor level {self.state.level + 1}",
            )
        else:
            self.draw_overlay("GAME OVER", "Druk op ENTER om het opnieuw te proberen")


def main():
    root = tk.Tk()
    KosmischeKoerier(root)
    root.mainloop()


if __name__ == "__main__":
    main()
