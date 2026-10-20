from rest_framework.permissions import BasePermission


def is_manager(user):
    if not user or not user.is_authenticated:
        return False
    profile = getattr(user, 'profile', None)
    return bool(profile and profile.is_manager)


class IsManager(BasePermission):
    message = 'Ta operacja jest dostępna tylko dla kierownika.'

    def has_permission(self, request, view):
        return is_manager(request.user)
