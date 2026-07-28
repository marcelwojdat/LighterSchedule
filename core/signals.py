from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

from .models import EmployeeProfile
from .subscription import ensure_user_membership


@receiver(post_save, sender=User)
def create_employee_profile(sender, instance, created, **kwargs):
    if created:
        EmployeeProfile.objects.get_or_create(user=instance)
        ensure_user_membership(instance)
