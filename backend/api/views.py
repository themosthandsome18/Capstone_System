from django.shortcuts import render
from rest_framework.decorators import api_view
from rest_framework.response import Response

@api_view(['GET'])
def dashboard_data(request):
    data = {
        "total_arrivals": 12550,
        "monthly_visits": 3200,
        "top_destinations": 15,
        "satisfaction": 4.6,
        "line_chart": [
            {"day": "Mon", "value": 300},
            {"day": "Tue", "value": 450},
            {"day": "Wed", "value": 200},
            {"day": "Thu", "value": 400},
            {"day": "Fri", "value": 650}
        ],
        "bar_chart": [
            {"name": "1", "value": 50},
            {"name": "2", "value": 100}
        ],
        "pie_chart": [
            {"name": "A", "value": 80},
            {"name": "B", "value": 20}
        ]
    }
    return Response(data)