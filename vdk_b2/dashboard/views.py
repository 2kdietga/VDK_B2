import json

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

