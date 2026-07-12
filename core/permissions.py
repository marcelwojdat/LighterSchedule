from rest_framework.permissions import BasePermission


def is_manager(user):
    return (
        user.is_authenticated
        and hasattr(user, 'profile')
        and user.profile.is_manager
    )


class IsManager(BasePermission):
    def has_permission(self, request, view):
        return is_manager(request.user)
