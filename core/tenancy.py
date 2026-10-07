"""
Multi-tenancy: every request only sees data of the requesting user's organization.

Isolation is enforced in get_queryset(), so objects of other organizations
behave as if they did not exist (404 instead of 403, nothing leaks).
"""

from django.contrib.auth.models import User
from rest_framework.exceptions import PermissionDenied


def get_user_organization(user):
    """Return the organization of the user. The only place that answers this question."""
    profile = getattr(user, 'profile', None)
    if profile is None:
        raise PermissionDenied('Konto nie jest przypisane do żadnej firmy.')
    return profile.organization


def organization_users(organization):
    """All users belonging to the organization."""
    return User.objects.filter(profile__organization=organization)


class OrganizationScopedMixin:
    """
    Limit a ViewSet's queryset to the requesting user's organization.

    Set organization_lookup when the model reaches its organization through
    a relation, e.g. 'employee__profile__organization' for WorkDay.
    Subclasses overriding get_queryset() must start from super().get_queryset().
    """

    organization_lookup = 'organization'

    def get_organization(self):
        return get_user_organization(self.request.user)

    def get_queryset(self):
        queryset = super().get_queryset()
        return queryset.filter(**{self.organization_lookup: self.get_organization()})


class OrganizationOwnedMixin(OrganizationScopedMixin):
    """For models with a direct `organization` FK: also assign it on create."""

    def perform_create(self, serializer):
        # Taken from the account, never from request data.
        serializer.save(organization=self.get_organization())
