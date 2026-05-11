from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="dashboard"),
    path("game/", views.game, name="game"),
    path("api/state/", views.api_state, name="api_state"),
    path("api/device-command/", views.api_device_command, name="api_device_command"),
    path("api/gesture/", views.api_gesture, name="api_gesture"),
    path("api/input/", views.api_input, name="api_input"),
    path("api/dashboard-state/", views.api_dashboard_state, name="api_dashboard_state"),
]
