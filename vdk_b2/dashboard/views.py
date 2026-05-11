import json

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .state import extract_device_input, get_state, set_dashboard_state, set_device_input


def index(request):
    return render(request, "dashboard/index.html")


def game(request):
    return render(request, "dashboard/game.html")


@require_GET
def api_state(request):
    return JsonResponse(get_state())


@require_GET
def api_device_command(request):
    state = get_state()
    current_version = int(state.get("command_version", 0))
    last_version = _read_int(request.GET.get("last_version"), default=-1)
    changed = last_version < current_version

    payload = {
        "changed": changed,
        "command_version": current_version,
        "poll_interval_ms": int(getattr(settings, "ESP32_COMMAND_POLL_INTERVAL_MS", 150)),
    }

    if changed:
        payload.update(
            {
                "led": int(state.get("led", 0)),
                "motor": int(state.get("motor", 0)),
            }
        )

    return JsonResponse(payload)


@csrf_exempt
@require_http_methods(["POST"])
def api_gesture(request):
    data = _read_json(request)
    payload = (
        data
        or request.POST.get("gesture")
        or request.body
    )
    device_input = extract_device_input(payload)
    state = set_device_input(payload)

    if state is None:
        return JsonResponse(
            {
                "error": "Payload khong hop le.",
                "received": device_input,
            },
            status=400,
        )

    return JsonResponse(state)


@csrf_exempt
@require_http_methods(["POST"])
def api_input(request):
    data = _read_json(request)
    device_input = extract_device_input(data)
    state = set_device_input(data)

    if state is None:
        return JsonResponse(
            {
                "error": "Input khong hop le.",
                "received": device_input,
            },
            status=400,
        )

    return JsonResponse(state)


@csrf_exempt
@require_http_methods(["POST"])
def api_dashboard_state(request):
    data = _read_json(request)
    return JsonResponse(set_dashboard_state(data))


def _read_json(request):
    if not request.body:
        return {}

    try:
        return json.loads(request.body.decode("utf-8"))
    except (UnicodeDecodeError, json.JSONDecodeError):
        return {}


def _read_int(value, default=0):
    try:
        return int(value)
    except (TypeError, ValueError):
        return default
