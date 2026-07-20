from .models import EmployeeProfile


def ensure_user_profile(user):
    """Return EmployeeProfile for user, creating a default one if missing."""
    if user is None or not getattr(user, 'is_authenticated', False):
        return None

    profile, _created = EmployeeProfile.objects.get_or_create(user=user)
    return profile
