from datetime import time
from decimal import Decimal

from django.contrib.auth.models import User
from django.db import models
from django.utils import timezone


class Weekday(models.IntegerChoices):
    """Same numbering as Python's date.weekday() (0 = Monday)."""

    MONDAY = 0, 'Poniedziałek'
    TUESDAY = 1, 'Wtorek'
    WEDNESDAY = 2, 'Środa'
    THURSDAY = 3, 'Czwartek'
    FRIDAY = 4, 'Piątek'
    SATURDAY = 5, 'Sobota'
    SUNDAY = 6, 'Niedziela'


class Organization(models.Model):
    """A company using the app. Every piece of data belongs to exactly one organization."""

    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class EmployeeProfile(models.Model):
    """App-specific user data. The single source of truth for organization membership."""

    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='members',
    )
    is_manager = models.BooleanField(default=False)
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=Decimal('0.00'))

    def __str__(self):
        return f'{self.user.username} @ {self.organization.name}'


class ScheduleSettings(models.Model):
    """Per-organization scheduling rules (weekly declaration deadline)."""

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='schedule_settings',
    )
    declaration_close_weekday = models.PositiveSmallIntegerField(
        null=True,
        blank=True,
        choices=Weekday.choices,
        help_text='Dzień tygodnia zamknięcia okna deklaracji. Puste = bez limitu.',
    )
    declaration_close_time = models.TimeField(
        null=True,
        blank=True,
        help_text='Godzina zamknięcia w wybranym dniu (np. 23:59).',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ustawienia grafiku'
        verbose_name_plural = 'Ustawienia grafiku'

    def __str__(self):
        return f'Ustawienia grafiku: {self.organization.name}'

    @classmethod
    def for_organization(cls, organization):
        settings_obj, _created = cls.objects.get_or_create(organization=organization)
        return settings_obj

    def save(self, *args, **kwargs):
        # Close time only makes sense together with a close weekday.
        if self.declaration_close_weekday is None:
            self.declaration_close_time = None
        elif self.declaration_close_time is None:
            self.declaration_close_time = time(23, 59)
        super().save(*args, **kwargs)


class TaskType(models.Model):
    """Role an employee performs during a shift (e.g. Kasa, Magazyn)."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='task_types',
    )
    name = models.CharField(max_length=50)

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_task_type_name_per_org',
            ),
        ]

    def __str__(self):
        return self.name


class RejectionReasonTemplate(models.Model):
    """Reusable rejection notes shown to managers as quick-pick chips."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='rejection_reasons',
    )
    text = models.CharField(max_length=255)
    sort_order = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sort_order', 'text']
        verbose_name = 'Szablon powodu odrzucenia'
        verbose_name_plural = 'Szablony powodów odrzucenia'
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'text'],
                name='unique_rejection_reason_per_org',
            ),
        ]

    def __str__(self):
        return self.text


class ShiftTemplate(models.Model):
    """Named shift (e.g. Poranna) with its own hours for each weekday."""

    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='shift_templates',
    )
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)
    max_slots = models.PositiveSmallIntegerField(
        default=1,
        help_text='Maksymalna liczba zatwierdzonych osób na tę zmianę w jednym dniu.',
    )

    class Meta:
        ordering = ['name']
        constraints = [
            models.UniqueConstraint(
                fields=['organization', 'name'],
                name='unique_shift_template_name_per_org',
            ),
        ]

    def __str__(self):
        return self.name

    def hours_for_date(self, work_date):
        """Return the ShiftTemplateHours for the weekday of work_date, or None."""
        return self.hours.filter(weekday=work_date.weekday()).first()


class ShiftTemplateHours(models.Model):
    template = models.ForeignKey(ShiftTemplate, on_delete=models.CASCADE, related_name='hours')
    weekday = models.PositiveSmallIntegerField(choices=Weekday.choices)
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        ordering = ['weekday']
        constraints = [
            models.UniqueConstraint(
                fields=['template', 'weekday'],
                name='unique_hours_per_template_weekday',
            ),
        ]

    def __str__(self):
        return f'{self.template.name} / {self.get_weekday_display()}: {self.start_time}-{self.end_time}'


class WorkDay(models.Model):
    """A single shift of one employee. Organization is derived from the employee's profile."""

    class Status(models.TextChoices):
        PROPOSED = 'proposed', 'Proposed'
        APPROVED = 'approved', 'Approved'
        REJECTED = 'rejected', 'Rejected'

    employee = models.ForeignKey(User, on_delete=models.CASCADE, related_name='workdays')
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    role = models.ForeignKey(TaskType, on_delete=models.SET_NULL, null=True, blank=True)
    shift_template = models.ForeignKey(
        ShiftTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workdays',
    )
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PROPOSED)
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
    # Hourly rate frozen at creation, so later raises don't change past payroll.
    rate_at_time = models.DecimalField(max_digits=10, decimal_places=2, editable=False, null=True)

    class Meta:
        constraints = [
            models.UniqueConstraint(
                fields=['employee', 'date'],
                name='unique_workday_per_employee_date',
            ),
        ]

    def __str__(self):
        return f'{self.date} - {self.employee.username} ({self.role}) [{self.status}]'

    def save(self, *args, **kwargs):
        if self.rate_at_time is None and self.employee_id:
            self.rate_at_time = self.employee.profile.hourly_rate
        super().save(*args, **kwargs)


class SwapRequest(models.Model):
    """
    Shift swap between employees.

    With target_work_day set it is a two-way swap; otherwise work_day is handed over.
    """

    work_day = models.ForeignKey(WorkDay, on_delete=models.CASCADE, related_name='outgoing_swaps')
    target_work_day = models.ForeignKey(
        WorkDay,
        on_delete=models.CASCADE,
        null=True,
        blank=True,
        related_name='incoming_swaps',
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
            return f'Zamiana {self.work_day.date} <-> {self.target_work_day.date}'
        return f'Przekazanie {self.work_day.date} od {self.requested_by}'
