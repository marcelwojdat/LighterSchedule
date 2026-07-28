from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone

class EmployeeProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    is_manager = models.BooleanField(default=False)

    def __str__(self):
        return self.user.username


class ScheduleSettings(models.Model):
    """Singleton (pk=1) for schedule-wide rules managed by the manager."""
    declaration_deadline = models.DateField(
        null=True,
        blank=True,
        help_text='Pracownicy mogą składać i edytować deklaracje do tego dnia włącznie. Puste = bez limitu.',
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name = 'Ustawienia grafiku'
        verbose_name_plural = 'Ustawienia grafiku'

    def save(self, *args, **kwargs):
        self.pk = 1
        super().save(*args, **kwargs)

    def delete(self, *args, **kwargs):
        pass

    @classmethod
    def load(cls):
        obj, _created = cls.objects.get_or_create(pk=1)
        return obj

    def __str__(self):
        if self.declaration_deadline:
            return f'Deklaracje do {self.declaration_deadline.isoformat()}'
        return 'Ustawienia grafiku (bez deadline)'

class TaskType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name


class RejectionReasonTemplate(models.Model):
    """Reusable rejection notes for managers (quick-pick chips)."""
    text = models.CharField(max_length=255, unique=True)
    sort_order = models.PositiveSmallIntegerField(default=100)
    is_active = models.BooleanField(default=True)
    last_used_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['sort_order', 'text']
        verbose_name = 'Szablon powodu odrzucenia'
        verbose_name_plural = 'Szablony powodów odrzucenia'

    def __str__(self):
        return self.text


class ShiftTemplate(models.Model):
    """Named shift defined by manager (e.g. Poranna), with hours per weekday."""
    name = models.CharField(max_length=80)
    is_active = models.BooleanField(default=True)
    max_slots = models.PositiveSmallIntegerField(
        default=1,
        help_text='Maksymalna liczba zatwierdzonych osób na tę zmianę w jednym dniu.',
    )

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name

    def hours_for_date(self, work_date):
        """Return ShiftTemplateHours for Python weekday (0=Mon … 6=Sun), or None."""
        return self.hours.filter(weekday=work_date.weekday()).first()


class ShiftTemplateHours(models.Model):
    template = models.ForeignKey(ShiftTemplate, on_delete=models.CASCADE, related_name='hours')
    weekday = models.PositiveSmallIntegerField(
        help_text='0=poniedziałek … 6=niedziela (jak date.weekday()).',
    )
    start_time = models.TimeField()
    end_time = models.TimeField()

    class Meta:
        unique_together = ('template', 'weekday')
        ordering = ['weekday']

    def __str__(self):
        return f"{self.template.name} / {self.weekday}: {self.start_time}-{self.end_time}"


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
    shift_template = models.ForeignKey(
        ShiftTemplate,
        on_delete=models.SET_NULL,
        null=True,
        blank=True,
        related_name='workdays',
    )
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


class Organization(models.Model):
    """Tenant / billing account. v1 uses a single default organization."""
    name = models.CharField(max_length=120)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['name']

    def __str__(self):
        return self.name


class Subscription(models.Model):
    class Plan(models.TextChoices):
        BASIC = 'basic', 'Basic'
        EXTENDED = 'extended', 'Extended'

    class Status(models.TextChoices):
        TRIAL = 'trial', 'Trial'
        ACTIVE = 'active', 'Active'
        PAST_DUE = 'past_due', 'Past due'
        CANCELED = 'canceled', 'Canceled'

    organization = models.OneToOneField(
        Organization,
        on_delete=models.CASCADE,
        related_name='subscription',
    )
    plan = models.CharField(max_length=20, choices=Plan.choices, default=Plan.BASIC)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.TRIAL)
    max_managers = models.PositiveSmallIntegerField(default=1)
    max_employees = models.PositiveSmallIntegerField(default=10)
    external_payment_id = models.CharField(max_length=120, blank=True, default='')
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return f'{self.organization.name}: {self.plan} ({self.status})'

    def apply_plan_limits(self):
        from .subscription import PLAN_LIMITS

        limits = PLAN_LIMITS.get(self.plan, PLAN_LIMITS['basic'])
        self.max_managers = limits['managers']
        self.max_employees = limits['employees']


class OrganizationMembership(models.Model):
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='memberships',
    )
    user = models.OneToOneField(
        User,
        on_delete=models.CASCADE,
        related_name='membership',
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        unique_together = ('organization', 'user')

    def __str__(self):
        return f'{self.user.username} @ {self.organization.name}'


class PaymentSession(models.Model):
    class Status(models.TextChoices):
        PENDING = 'pending', 'Pending'
        PAID = 'paid', 'Paid'
        FAILED = 'failed', 'Failed'
        CANCELED = 'canceled', 'Canceled'

    session_id = models.CharField(max_length=64, unique=True)
    provider = models.CharField(max_length=32, default='mock')
    plan = models.CharField(max_length=20, choices=Subscription.Plan.choices)
    status = models.CharField(max_length=20, choices=Status.choices, default=Status.PENDING)
    amount = models.DecimalField(max_digits=8, decimal_places=2)
    currency = models.CharField(max_length=3, default='PLN')
    email = models.EmailField()
    company_or_name = models.CharField(max_length=120)
    nip = models.CharField(max_length=20, blank=True, default='')
    payment_method = models.CharField(max_length=20, blank=True, default='')
    organization = models.ForeignKey(
        Organization,
        on_delete=models.CASCADE,
        related_name='payment_sessions',
        null=True,
        blank=True,
    )
    created_at = models.DateTimeField(auto_now_add=True)
    paid_at = models.DateTimeField(null=True, blank=True)

    def __str__(self):
        return f'{self.session_id} ({self.plan}/{self.status})'
