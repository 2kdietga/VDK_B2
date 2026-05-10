import json
from threading import Lock
from time import time

from django.conf import settings


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

_lock = Lock()
STATE_FILE = settings.BASE_DIR / "gesture_state.json"
DEFAULT_STATE = {
    "gesture": GESTURE_STOP,
    "active_control": "led",
    "control_mode": "gesture",
    "led": 50,
    "motor": 50,
    "command_version": 0,
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
        for key in ("gesture", "dir", "direction"):
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
        for key in ("gesture", "dir", "direction"):
            gesture = normalize_gesture(data.get(key))
            if gesture is not None:
                return gesture

        sequence = data.get("sequence")
        if isinstance(sequence, list) and sequence:
            return normalize_gesture(sequence[0])

    if isinstance(data, list) and data:
        return normalize_gesture(data[0])

    return None


def set_gesture(value):
    gesture = extract_gesture(value)
    if gesture is None:
        return None

    with _lock:
        state = _load_state()
        state["gesture"] = gesture
        state["esp32_last_seen"] = time()
        state["updated_at"] = time()
        return _save_state(state)


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
        state["esp32_online"] = bool(last_seen and now - last_seen <= 10)
        if not state["esp32_online"] and state.get("gesture") != GESTURE_STOP:
            state["gesture"] = GESTURE_STOP
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
        "esp32_last_seen": float(state.get("esp32_last_seen") or 0),
        "updated_at": float(state.get("updated_at", time())),
    }

    with STATE_FILE.open("w", encoding="utf-8") as file:
        json.dump(clean_state, file)

    return dict(clean_state)
