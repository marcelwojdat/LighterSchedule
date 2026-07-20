from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class EmployeeProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    is_manager = models.BooleanField(default=False)

    def __str__(self):
        return self.user.username

class TaskType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

class WorkDay(models.Model):
    class Status(models.TextChoices):
        PROPOSED = 'proposed', 'Proposed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    employee = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    role = models.ForeignKey(TaskType, on_delete=models.SET_NULL, null=True, blank=True)
    status = models.CharField(
        max_length=20,
        choices=Status.choices,
        default=Status.PROPOSED,
    )
    approved_by = models.ForeignKey(
        User,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='approved_workdays',
    )
    approved_at = models.DateTimeField(null=True, blank=True)
    rejection_reason = models.CharField(max_length=255, blank=True, default='')
    note = models.CharField(
        max_length=500,
        blank=True,
        default='',
        help_text='Opcjonalna notatka pracownika (np. wcześniejsze wyjście).',
    )

    rate_at_time = models.DecimalField(max_digits=10, decimal_places=2, editable=False, null=True)

    class Meta:
        unique_together = ('employee', 'date')

    def save(self, *args, **kwargs):
        if not self.rate_at_time and self.employee_id:
            from .utils import ensure_user_profile

            profile = ensure_user_profile(self.employee)
            self.rate_at_time = profile.hourly_rate if profile else 0
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.date} - {self.employee.username} ({self.role}) [{self.status}]"

class SwapRequest(models.Model):
    work_day = models.ForeignKey(WorkDay, on_delete=models.CASCADE, related_name='outgoing_swaps')
    target_work_day = models.ForeignKey(
        WorkDay,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='incoming_swaps',
        help_text='Jeśli ustawione — dwustronna zamiana dwóch zmian; w przeciwnym razie przekazanie jednej zmiany.',
    )
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_swaps')
    target_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_swaps')

    accepted_by_target = models.BooleanField(default=False)
    approved_by_manager = models.BooleanField(default=False)
    is_rejected = models.BooleanField(default=False)
    rejection_reason = models.CharField(max_length=255, blank=True, default='')
    created_at = models.DateTimeField(default=timezone.now)

    def __str__(self):
        if self.target_work_day_id:
            return f"Zamiana {self.work_day.date} <-> {self.target_work_day.date}"
        return f"Zamiana {self.work_day.date} od {self.requested_by}"