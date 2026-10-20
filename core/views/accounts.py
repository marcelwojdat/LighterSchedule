"""Sign-up and the signed-in user's own account."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

from ..serializers import RegistrationSerializer, UserProfileUpdateSerializer, UserSerializer
from .common import error_response


@api_view(['POST'])
@permission_classes([AllowAny])
def register_user(request):
    """Sign-up creates a new organization with the registering user as its manager."""
    serializer = RegistrationSerializer(data=request.data)
    serializer.is_valid(raise_exception=True)
    serializer.save()
    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


@api_view(['GET', 'PATCH'])
@permission_classes([IsAuthenticated])
def current_user(request):
    if request.method == 'PATCH':
        serializer = UserProfileUpdateSerializer(request.user, data=request.data, partial=True)
        serializer.is_valid(raise_exception=True)
        serializer.save()
    return Response(UserSerializer(request.user).data)


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def change_password(request):
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not current_password or not new_password:
        return error_response('Podaj obecne i nowe hasło.')
    if not request.user.check_password(current_password):
        return error_response('Obecne hasło jest nieprawidłowe.')
    try:
        validate_password(new_password, user=request.user)
    except DjangoValidationError as exc:
        return error_response(' '.join(exc.messages))

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])
    return Response({'message': 'Hasło zostało zmienione.'})
