from django.urls import path
from .views import dashboard_data

urlpatterns = [
    path('dashboard/', dashboard_data),
]