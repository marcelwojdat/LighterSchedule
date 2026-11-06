"""
Brute-force protection for the authentication endpoints.

Two layers: a per-IP request rate (DRF throttles, rates in settings.REST_FRAMEWORK)
and a per-account lockout after repeated failed logins, which also stops attacks
spread over many IP addresses.
"""
import hashlib

from django.core.cache import cache
from rest_framework import status
from rest_framework.exceptions import AuthenticationFailed
from rest_framework.response import Response
from rest_framework.throttling import AnonRateThrottle, UserRateThrottle
from rest_framework_simplejwt.views import TokenObtainPairView

MAX_FAILED_LOGINS = 10
LOCKOUT_SECONDS = 15 * 60
LOCKOUT_MESSAGE = 'Zbyt wiele nieudanych prób logowania. Spróbuj ponownie za 15 minut.'


class LoginRateThrottle(AnonRateThrottle):
    scope = 'login'


class RegisterRateThrottle(AnonRateThrottle):
    scope = 'register'


class PasswordChangeRateThrottle(UserRateThrottle):
    scope = 'password_change'


def _failed_logins_key(username):
    digest = hashlib.sha256(username.strip().lower().encode()).hexdigest()
    return f'failed-logins:{digest}'


class LoginView(TokenObtainPairView):
    """JWT login, limited per IP and locked per account after MAX_FAILED_LOGINS failures."""

    throttle_classes = [LoginRateThrottle]

    def post(self, request, *args, **kwargs):
        username = str(request.data.get('username') or '')
        key = _failed_logins_key(username)
        if username and cache.get(key, 0) >= MAX_FAILED_LOGINS:
            return Response({'detail': LOCKOUT_MESSAGE}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        try:
            response = super().post(request, *args, **kwargs)
        except AuthenticationFailed:
            if username:
                # The window starts at the first failure; incr keeps that expiry.
                cache.add(key, 0, LOCKOUT_SECONDS)
                cache.incr(key)
            raise

        cache.delete(key)
        return response
