from rest_framework.permissions import BasePermission

from .utils import ensure_user_profile


def is_manager(user):
    if not user or not user.is_authenticated:
        return False
    profile = ensure_user_profile(user)
    return bool(profile and profile.is_manager)


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return is_manager(request.user)
