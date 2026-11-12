from django.shortcuts import get_object_or_404
from rest_framework import serializers
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from api.models import Barangay, Sitio
from api.permissions import module_required


@api_view(["GET"])
@permission_classes([IsAuthenticated])
@module_required("sanitation")
def sanitation_sitio_list(request):
    try:
        barangay_id = serializers.IntegerField(min_value=1).run_validation(request.query_params.get("barangay_id"))
    except serializers.ValidationError as error:
        raise serializers.ValidationError({"barangay_id": error.detail})
    barangay = get_object_or_404(Barangay, pk=barangay_id, is_active=True)
    rows = Sitio.objects.filter(barangay=barangay, is_active=True).values("id", "name", "barangay_id", "is_active")
    return Response({"barangay_id": barangay.pk, "rows": list(rows)})
