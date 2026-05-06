from django.urls import path
from django.urls import path

from .views import (
    health_check,
    bootstrap_data,
    reference_tables,
    arrival_monitoring_data,
    booking_management_data,
    tourist_record_list,
    tourist_record_detail,
    dashboard_data,
    reports_data,
    resort_list,
    resort_detail,
    feedback_list,
    feedback_detail,
    settings_data,

    sanitation_bootstrap_data,
    sanitation_business_type_list,
    sanitation_dashboard_data,
    sanitation_establishment_detail,
    sanitation_establishment_list,
    sanitation_inspection_detail,
    sanitation_inspection_list,
    sanitation_permit_data,
    sanitation_report_data,
    sanitation_submission_data,

    household_bootstrap_data,
    household_dashboard_data,
    household_record_detail,
    household_record_list,
)

urlpatterns = [
    path('health/', health_check),
    path('bootstrap/', bootstrap_data),
    
    #Tourism Routes
    path('reference-tables/', reference_tables),
    path('booking-management/', booking_management_data),
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

    #Sanitations Routes
    path("sanitation/bootstrap/", sanitation_bootstrap_data),
    path("sanitation/dashboard/", sanitation_dashboard_data),
    path("sanitation/business-types/", sanitation_business_type_list),
    path("sanitation/establishments/", sanitation_establishment_list),
    path("sanitation/establishments/<int:establishment_id>/", sanitation_establishment_detail),
    path("sanitation/inspections/", sanitation_inspection_list),
    path("sanitation/inspections/<int:inspection_id>/", sanitation_inspection_detail),
    path("sanitation/permits/", sanitation_permit_data),
    path("sanitation/submissions/", sanitation_submission_data),
    path("sanitation/reports/", sanitation_report_data),

    #Household Routes
    path("households/bootstrap/", household_bootstrap_data),
    path("households/dashboard/", household_dashboard_data),
    path("households/records/", household_record_list),
    path("households/records/<int:household_id>/", household_record_detail),
]
        
