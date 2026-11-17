"""Sign-up and the signed-in user's own account."""
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes, throttle_classes
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response
from rest_framework_simplejwt.token_blacklist.models import BlacklistedToken, OutstandingToken
from rest_framework_simplejwt.tokens import RefreshToken

from ..invites import user_for_token
from ..serializers import RegistrationSerializer, UserProfileUpdateSerializer, UserSerializer
from ..throttling import PasswordChangeRateThrottle, RegisterRateThrottle, SetPasswordRateThrottle
from .common import error_response

INVALID_LINK_MESSAGE = 'Link jest nieprawidłowy, został już użyty albo wygasł. Poproś kierownika o nowy.'


def _revoke_sessions(user):
    for token in OutstandingToken.objects.filter(user=user):
        BlacklistedToken.objects.get_or_create(token=token)


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([RegisterRateThrottle])
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
@throttle_classes([PasswordChangeRateThrottle])
def change_password(request):
    current_password = request.data.get('current_password')
    new_password = request.data.get('new_password')

    if not (isinstance(current_password, str) and isinstance(new_password, str)) or not current_password or not new_password:
        return error_response('Podaj obecne i nowe hasło.')
    if not request.user.check_password(current_password):
        return error_response('Obecne hasło jest nieprawidłowe.')
    try:
        validate_password(new_password, user=request.user)
    except DjangoValidationError as exc:
        return error_response(' '.join(exc.messages))

    request.user.set_password(new_password)
    request.user.save(update_fields=['password'])

    # Sign out every other device (a stolen session dies with the old password),
    # and hand this device a fresh pair so it stays signed in.
    _revoke_sessions(request.user)
    refresh = RefreshToken.for_user(request.user)
    return Response({
        'message': 'Hasło zostało zmienione. Wylogowano Cię na pozostałych urządzeniach.',
        'access': str(refresh.access_token),
        'refresh': str(refresh),
    })


@api_view(['POST'])
@permission_classes([AllowAny])
@throttle_classes([SetPasswordRateThrottle])
def set_password(request):
    """Set the password from a one-time link ({uid, token, password}); the link dies with it."""
    user = user_for_token(request.data.get('uid'), request.data.get('token'))
    if user is None:
        return error_response(INVALID_LINK_MESSAGE)
    password = request.data.get('password')
    if not isinstance(password, str) or not password:
        return error_response('Podaj nowe hasło.')
    try:
        validate_password(password, user=user)
    except DjangoValidationError as exc:
        return error_response(' '.join(exc.messages))

    user.set_password(password)
    user.save(update_fields=['password'])
    # Whoever held a session before (e.g. a forgotten password case) is signed out.
    _revoke_sessions(user)
    return Response({
        'message': 'Hasło zostało ustawione. Możesz się zalogować.',
        'username': user.username,
    })
