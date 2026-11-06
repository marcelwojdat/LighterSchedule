"""Health probe used by the deploy script: the app answers, reaches the database, and says which release runs."""
import os

from django.db import DatabaseError, connection
from rest_framework import status
from rest_framework.decorators import api_view, authentication_classes, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response


@api_view(['GET'])
@authentication_classes([])
@permission_classes([AllowAny])
# Throttle counters live in the database cache, and a health probe must not depend on what it checks.
# The view takes no input and does constant, tiny work, so there is nothing to brute-force.
@throttle_classes([])
def health(request):
    """deploy.sh polls this after starting a release and rolls back unless that exact version reports ok."""
    version = os.environ.get('APP_VERSION', 'dev')
    try:
        with connection.cursor() as cursor:
            cursor.execute('SELECT 1')
    except DatabaseError:
        return Response({'status': 'error', 'version': version}, status=status.HTTP_503_SERVICE_UNAVAILABLE)
    return Response({'status': 'ok', 'version': version})
