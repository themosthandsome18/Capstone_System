from django.urls import path
from .views import (
    arrival_monitoring_data,
    bootstrap_data,
    dashboard_data,
    feedback_detail,
    feedback_list,
    health_check,
    reference_tables,
    reports_data,
    resort_detail,
    resort_list,
    settings_data,
    tourist_record_detail,
    tourist_record_list,
)

urlpatterns = [
    path('health/', health_check),
    path('bootstrap/', bootstrap_data),
    path('reference-tables/', reference_tables),
    path('arrival-monitoring/', arrival_monitoring_data),
    path('dashboard/', dashboard_data),
    path('reports/', reports_data),
    path('resorts/', resort_list),
    path('resorts/<int:resort_id>/', resort_detail),
    path('feedback/', feedback_list),
    path('feedback/<int:feedback_id>/', feedback_detail),
    path('settings/', settings_data),
    path('tourist-records/', tourist_record_list),
    path('tourist-records/<str:survey_id>/', tourist_record_detail),
]
