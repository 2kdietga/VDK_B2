from django.urls import path

from . import views


urlpatterns = [
    path("", views.index, name="dashboard"),
    path("api/state/", views.api_state, name="api_state"),
    path("api/gesture/", views.api_gesture, name="api_gesture"),
    path("api/dashboard-state/", views.api_dashboard_state, name="api_dashboard_state"),
]

