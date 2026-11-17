"""
One-time links for setting a password (invites for accounts created by a manager).

The token is Django's password-reset token: an HMAC over the user's id, password hash,
last login and a timestamp. Nothing is stored; setting the password changes the hash,
so the link stops working by itself. Lifetime: settings.PASSWORD_RESET_TIMEOUT.
"""
from django.conf import settings
from django.contrib.auth.models import User
from django.contrib.auth.tokens import default_token_generator
from django.utils.encoding import force_bytes, force_str
from django.utils.http import urlsafe_base64_decode, urlsafe_base64_encode


def make_set_password_link(user):
    uid = urlsafe_base64_encode(force_bytes(user.pk))
    token = default_token_generator.make_token(user)
    return f'{settings.FRONTEND_URL}/set-password/{uid}/{token}'


def user_for_token(uid, token):
    """The active user the link belongs to, or None for a forged, used or expired link."""
    if not (isinstance(uid, str) and isinstance(token, str)):
        return None
    try:
        pk = int(force_str(urlsafe_base64_decode(uid)))
    except (TypeError, ValueError, OverflowError):
        return None
    user = User.objects.filter(pk=pk, is_active=True).first()
    if user is None or not default_token_generator.check_token(user, token):
        return None
    return user
