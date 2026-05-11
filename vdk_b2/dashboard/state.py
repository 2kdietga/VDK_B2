import json
from threading import Lock
from time import time

from django.conf import settings

from .network import get_lan_ip


GESTURE_STOP = "dung_yen"
GESTURES = {
    "len": "len",
    "up": "len",
    "xuong": "xuong",
    "down": "xuong",
    "trai": "trai",
    "left": "trai",
    "phai": "phai",
    "right": "phai",
    "dung_yen": GESTURE_STOP,
    "dung yen": GESTURE_STOP,
    "stop": GESTURE_STOP,
    "idle": GESTURE_STOP,
}
MENU_ITEMS = ("game", "mode", "exit")
GAME_MENU_ITEMS = ("continue", "dashboard")
SCREENS = ("dashboard", "game")

_lock = Lock()
STATE_FILE = settings.BASE_DIR / "gesture_state.json"
DEFAULT_STATE = {
    "gesture": GESTURE_STOP,
    "active_control": "led",
    "control_mode": "gesture",
    "led": 50,
    "motor": 50,
    "command_version": 0,
    "btn_menu": False,
    "btn_ok": False,
    "input_version": 0,
    "menu_open": False,
    "menu_index": 0,
    "screen": "dashboard",
    "game_status": "playing",
    "game_player_x": 18,
    "game_enemy_x": 76,
    "game_enemy_hp": 3,
    "game_hp": 5,
    "game_score": 0,
    "game_facing": 1,
    "game_attack": False,
    "game_menu_open": False,
    "game_menu_index": 0,
    "esp32_last_seen": 0,
    "updated_at": time(),
}


def normalize_gesture(value):
    if value is None:
        return None

    key = str(value)
    key = key.replace("\x00", "")
    key = key.strip().strip('"').strip("'")
    key = key.lower().replace("-", "_")
    return GESTURES.get(key)


def extract_gesture(value):
    gesture = normalize_gesture(value)
    if gesture is not None:
        return gesture

    if isinstance(value, dict):
        for key in ("gesture", "dir", "direction", "state"):
            gesture = normalize_gesture(value.get(key))
            if gesture is not None:
                return gesture

        sequence = value.get("sequence")
        if isinstance(sequence, list) and sequence:
            return normalize_gesture(sequence[0])

        return None

    if isinstance(value, list) and value:
        return normalize_gesture(value[0])

    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="ignore")

    if not isinstance(value, str):
        return None

    clean_value = value.replace("\x00", "").strip()
    gesture = normalize_gesture(clean_value)
    if gesture is not None:
        return gesture

    try:
        data = json.loads(clean_value)
    except json.JSONDecodeError:
        return None

    if isinstance(data, dict):
        for key in ("gesture", "dir", "direction", "state"):
            gesture = normalize_gesture(data.get(key))
            if gesture is not None:
                return gesture

        sequence = data.get("sequence")
        if isinstance(sequence, list) and sequence:
            return normalize_gesture(sequence[0])

    if isinstance(data, list) and data:
        return normalize_gesture(data[0])

    return None


def extract_device_input(value):
    data = _decode_payload(value)
    return {
        "gesture": _extract_gesture_from_decoded(data),
        "btn_menu": _extract_bool(data, "btn_menu"),
        "btn_ok": _extract_bool(data, "btn_ok"),
    }


def set_device_input(value):
    device_input = extract_device_input(value)
    if device_input["gesture"] is None and device_input["btn_menu"] is None and device_input["btn_ok"] is None:
        return None

    with _lock:
        state = _load_state()
        action_gesture = device_input["gesture"] or GESTURE_STOP
        if device_input["gesture"] is not None:
            state["gesture"] = device_input["gesture"]
        state["btn_menu"] = bool(device_input["btn_menu"])
        if device_input["btn_ok"] is not None:
            state["btn_ok"] = bool(device_input["btn_ok"])
        state["input_version"] = int(state.get("input_version", 0)) + 1
        state["esp32_last_seen"] = time()
        _apply_device_input(state, action_gesture, state["btn_menu"], state["btn_ok"])
        state["updated_at"] = time()
        return _save_state(state)


def set_gesture(value):
    return set_device_input(value)


def set_dashboard_state(data):
    with _lock:
        state = _load_state()
        previous_led = int(state.get("led", 50))
        previous_motor = int(state.get("motor", 50))

        for key in ("led", "motor"):
            if key in data:
                state[key] = max(0, min(100, int(data[key])))

        if data.get("active_control") in ("led", "motor"):
            state["active_control"] = data["active_control"]

        if data.get("control_mode") in ("gesture", "manual"):
            state["control_mode"] = data["control_mode"]

        if data.get("screen") in SCREENS:
            state["screen"] = data["screen"]

        if int(state.get("led", 50)) != previous_led or int(state.get("motor", 50)) != previous_motor:
            state["command_version"] = int(state.get("command_version", 0)) + 1

        state["updated_at"] = time()
        return _save_state(state)


def get_state():
    with _lock:
        state = _load_state()
        last_seen = float(state.get("esp32_last_seen") or 0)
        now = time()
        state["esp32_ip"] = getattr(settings, "ESP32_IP", "")
        state["esp32_port"] = str(getattr(settings, "ESP32_COMMAND_PORT", 5683))
        state["server_ip"] = get_lan_ip()
        state["server_coap_port"] = "5683"
        state["server_coap_path"] = "gesture"
        state["esp32_online"] = bool(last_seen and now - last_seen <= 10)
        if not state["esp32_online"] and state.get("gesture") != GESTURE_STOP:
            state["gesture"] = GESTURE_STOP
            state["btn_menu"] = False
            state["btn_ok"] = False
            state["updated_at"] = now
            state = _save_state(state)
            state["esp32_online"] = False
        return state


def _load_state():
    if not STATE_FILE.exists():
        return dict(DEFAULT_STATE)

    try:
        with STATE_FILE.open("r", encoding="utf-8") as file:
            state = json.load(file)
    except (OSError, json.JSONDecodeError):
        return dict(DEFAULT_STATE)

    merged = dict(DEFAULT_STATE)
    merged.update(state)
    return merged


def _save_state(state):
    clean_state = {
        "gesture": normalize_gesture(state.get("gesture")) or GESTURE_STOP,
        "active_control": state.get("active_control") if state.get("active_control") in ("led", "motor") else "led",
        "control_mode": state.get("control_mode") if state.get("control_mode") in ("gesture", "manual") else "gesture",
        "led": max(0, min(100, int(state.get("led", 50)))),
        "motor": max(0, min(100, int(state.get("motor", 50)))),
        "command_version": int(state.get("command_version", 0)),
        "btn_menu": bool(state.get("btn_menu", False)),
        "btn_ok": bool(state.get("btn_ok", False)),
        "input_version": int(state.get("input_version", 0)),
        "menu_open": bool(state.get("menu_open", False)),
        "menu_index": max(0, min(len(MENU_ITEMS) - 1, int(state.get("menu_index", 0)))),
        "screen": state.get("screen") if state.get("screen") in SCREENS else "dashboard",
        "game_status": state.get("game_status") if state.get("game_status") in ("playing", "lost") else "playing",
        "game_player_x": max(0, min(92, int(state.get("game_player_x", 18)))),
        "game_enemy_x": max(0, min(92, int(state.get("game_enemy_x", 76)))),
        "game_enemy_hp": max(0, min(5, int(state.get("game_enemy_hp", 3)))),
        "game_hp": max(0, min(5, int(state.get("game_hp", 5)))),
        "game_score": max(0, int(state.get("game_score", 0))),
        "game_facing": 1 if int(state.get("game_facing", 1)) >= 0 else -1,
        "game_attack": bool(state.get("game_attack", False)),
        "game_menu_open": bool(state.get("game_menu_open", False)),
        "game_menu_index": max(0, min(len(GAME_MENU_ITEMS) - 1, int(state.get("game_menu_index", 0)))),
        "esp32_last_seen": float(state.get("esp32_last_seen") or 0),
        "updated_at": float(state.get("updated_at", time())),
    }

    with STATE_FILE.open("w", encoding="utf-8") as file:
        json.dump(clean_state, file)

    return dict(clean_state)


def _decode_payload(value):
    if isinstance(value, dict) or isinstance(value, list):
        return value

    if isinstance(value, (bytes, bytearray)):
        value = value.decode("utf-8", errors="ignore")

    if not isinstance(value, str):
        return value

    clean_value = value.replace("\x00", "").strip()
    try:
        return json.loads(clean_value)
    except json.JSONDecodeError:
        return clean_value


def _extract_gesture_from_decoded(data):
    gesture = normalize_gesture(data)
    if gesture is not None:
        return gesture

    if isinstance(data, dict):
        for key in ("gesture", "dir", "direction", "state"):
            gesture = normalize_gesture(data.get(key))
            if gesture is not None:
                return gesture

        sequence = data.get("sequence")
        if isinstance(sequence, list) and sequence:
            return normalize_gesture(sequence[0])

    if isinstance(data, list) and data:
        return normalize_gesture(data[0])

    return None


def _extract_bool(data, key):
    if not isinstance(data, dict) or key not in data:
        return None

    value = data[key]
    if isinstance(value, bool):
        return value

    if isinstance(value, str):
        return value.strip().lower() in ("1", "true", "yes", "on")

    return bool(value)


def _apply_device_input(state, gesture, btn_menu, btn_ok):
    state["game_attack"] = False

    if btn_menu:
        if state.get("screen") == "game":
            state["game_menu_open"] = True
        else:
            state["menu_open"] = True
            state["menu_index"] = 0
            state["screen"] = "dashboard"
        return

    if state.get("screen") == "game":
        _apply_game_input(state, gesture, btn_ok)
        return

    if state.get("menu_open"):
        if btn_ok:
            _select_menu_item(state)
            return

        if gesture == "len":
            state["menu_index"] = (int(state.get("menu_index", 0)) - 1) % len(MENU_ITEMS)
        elif gesture == "xuong":
            state["menu_index"] = (int(state.get("menu_index", 0)) + 1) % len(MENU_ITEMS)
        return


def _select_menu_item(state):
    selected = MENU_ITEMS[int(state.get("menu_index", 0))]
    if selected == "game":
        state["screen"] = "game"
        state["menu_open"] = False
        _reset_game(state)
    elif selected == "mode":
        state["control_mode"] = "manual" if state.get("control_mode") == "gesture" else "gesture"
        state["menu_open"] = False
    elif selected == "exit":
        state["screen"] = "dashboard"
        state["menu_open"] = False


def _apply_game_input(state, gesture, btn_ok):
    if state.get("game_menu_open"):
        if btn_ok:
            selected = GAME_MENU_ITEMS[int(state.get("game_menu_index", 0))]
            if selected == "continue":
                state["game_menu_open"] = False
            elif selected == "dashboard":
                state["screen"] = "dashboard"
                state["game_menu_open"] = False
            return

        if gesture in ("len", "xuong"):
            state["game_menu_index"] = (int(state.get("game_menu_index", 0)) + 1) % len(GAME_MENU_ITEMS)
        return

    if state.get("game_status") == "lost":
        if btn_ok:
            _reset_game(state)
        return

    if gesture == "trai":
        state["game_facing"] = -1
        state["game_player_x"] = max(0, int(state.get("game_player_x", 18)) - 8)
    elif gesture == "phai":
        state["game_facing"] = 1
        state["game_player_x"] = min(92, int(state.get("game_player_x", 18)) + 8)

    if btn_ok:
        _attack_enemy(state)

    _move_enemy(state)


def _reset_game(state):
    state["game_status"] = "playing"
    state["game_player_x"] = 18
    state["game_enemy_x"] = 76
    state["game_enemy_hp"] = 3
    state["game_hp"] = 5
    state["game_score"] = 0
    state["game_facing"] = 1
    state["game_attack"] = False
    state["game_menu_open"] = False
    state["game_menu_index"] = 0


def _attack_enemy(state):
    state["game_attack"] = True
    player_x = int(state.get("game_player_x", 18))
    enemy_x = int(state.get("game_enemy_x", 76))
    facing = int(state.get("game_facing", 1))
    distance = abs(player_x - enemy_x)
    enemy_is_ahead = (enemy_x - player_x) * facing >= 0

    if distance <= 18 and enemy_is_ahead:
        hp = int(state.get("game_enemy_hp", 3)) - 1
        if hp <= 0:
            score = int(state.get("game_score", 0)) + 1
            state["game_score"] = score
            state["game_enemy_hp"] = 3 + min(2, score // 3)
            state["game_enemy_x"] = 82 if player_x < 50 else 8
        else:
            state["game_enemy_hp"] = hp


def _move_enemy(state):
    player_x = int(state.get("game_player_x", 18))
    enemy_x = int(state.get("game_enemy_x", 76))

    if abs(player_x - enemy_x) > 10:
        state["game_enemy_x"] = enemy_x + (4 if player_x > enemy_x else -4)
        return

    hp = int(state.get("game_hp", 5)) - 1
    state["game_hp"] = max(0, hp)
    if hp <= 0:
        state["game_status"] = "lost"
