import json

from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt
from django.views.decorators.http import require_GET, require_http_methods

from .state import extract_gesture, get_state, set_dashboard_state, set_gesture


def index(request):
    return render(request, "dashboard/index.html")


@require_GET
def api_state(request):
    return JsonResponse(get_state())


@csrf_exempt
@require_http_methods(["POST"])
def api_gesture(request):
    data = _read_json(request)
    gesture = (
        extract_gesture(data)
        or extract_gesture(request.POST.get("gesture"))
        or extract_gesture(request.body)
    )
    state = set_gesture(gesture)

    if state is None:
        return JsonResponse(
            {
                "error": "Gesture khong hop le. Dung: len, xuong, trai, phai, dung_yen.",
                "received": gesture,
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
