from datetime import datetime
from decimal import Decimal

from django.contrib.auth.models import User
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError as DjangoValidationError
from django.db import transaction
from django.utils import timezone
from rest_framework import serializers

from .models import (
    EmployeeProfile,
    Organization,
    RejectionReasonTemplate,
    ScheduleSettings,
    ShiftTemplate,
    ShiftTemplateHours,
    SwapRequest,
    TaskType,
    Weekday,
    WorkDay,
)
from .permissions import is_manager
from .tenancy import OrganizationPrimaryKeyRelatedField, get_user_organization
from .utils import (
    assert_shift_slot_available,
    declaration_close_label,
    declaration_deadline_passed,
    get_shift_slots_info,
)


class OrganizationUniqueFieldMixin:
    """
    Validate that `unique_field` is unique within the requesting user's organization.

    DRF cannot check the model's UniqueConstraint itself, because `organization`
    is not a serializer field (it is assigned by the view).
    """

    unique_field = 'name'
    unique_error = 'Taka nazwa już istnieje.'

    def validate(self, attrs):
        value = attrs.get(self.unique_field)
        if value is not None:
            organization = get_user_organization(self.context['request'].user)
            duplicates = self.Meta.model.objects.filter(
                organization=organization,
                **{self.unique_field: value},
            )
            if self.instance is not None:
                duplicates = duplicates.exclude(pk=self.instance.pk)
            if duplicates.exists():
                raise serializers.ValidationError({self.unique_field: self.unique_error})
        return super().validate(attrs)


# --- Users -------------------------------------------------------------------

class UserSerializer(serializers.ModelSerializer):
    hourly_rate = serializers.DecimalField(
        source='profile.hourly_rate', max_digits=10, decimal_places=2, read_only=True,
    )
    is_manager = serializers.BooleanField(source='profile.is_manager', read_only=True)
    email = serializers.EmailField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email',
            'hourly_rate', 'is_manager', 'is_active',
        ]


class AccountCreateSerializer(serializers.Serializer):
    """Shared fields and validation for creating a user account."""

    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()

    def validate_username(self, value):
        if User.objects.filter(username=value).exists():
            raise serializers.ValidationError('Użytkownik o tym loginie już istnieje.')
        return value

    def validate_email(self, value):
        email = value.lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Konto z tym adresem e-mail już istnieje.')
        return email

    def validate_password(self, value):
        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class ManagerUserCreateSerializer(AccountCreateSerializer):
    """Manager adds an employee (or another manager) to their own organization."""

    is_manager = serializers.BooleanField(default=False)
    hourly_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, min_value=0, default=Decimal('0.00'),
    )

    @transaction.atomic
    def create(self, validated_data):
        organization = get_user_organization(self.context['request'].user)
        is_manager_flag = validated_data.pop('is_manager')
        hourly_rate = validated_data.pop('hourly_rate')

        user = User.objects.create_user(**validated_data)
        EmployeeProfile.objects.create(
            user=user,
            organization=organization,
            is_manager=is_manager_flag,
            hourly_rate=hourly_rate,
        )
        return user


class RegistrationSerializer(AccountCreateSerializer):
    """Public sign-up: creates a new organization with the user as its first manager."""

    DEFAULT_TASK_TYPES = ('Kasa', 'Magazyn', 'Obsługa')

    organization_name = serializers.CharField(max_length=120)

    @transaction.atomic
    def create(self, validated_data):
        organization = Organization.objects.create(name=validated_data.pop('organization_name'))
        user = User.objects.create_user(**validated_data)
        EmployeeProfile.objects.create(user=user, organization=organization, is_manager=True)
        ScheduleSettings.objects.create(organization=organization)
        TaskType.objects.bulk_create(
            TaskType(organization=organization, name=name) for name in self.DEFAULT_TASK_TYPES
        )
        return user


class ProfileUpdateSerializer(serializers.Serializer):
    """Fields a manager may change on an employee's account."""

    hourly_rate = serializers.DecimalField(max_digits=10, decimal_places=2, min_value=0, required=False)
    is_manager = serializers.BooleanField(required=False)
    is_active = serializers.BooleanField(required=False)

    def validate(self, attrs):
        if not attrs:
            raise serializers.ValidationError('Podaj hourly_rate, is_manager lub is_active.')
        return attrs


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']


# --- Organization configuration ----------------------------------------------

class ScheduleSettingsSerializer(serializers.ModelSerializer):
    # Normalization of weekday/time pairs lives in ScheduleSettings.save().
    declarations_closed = serializers.SerializerMethodField()
    declaration_close_label = serializers.SerializerMethodField()

    class Meta:
        model = ScheduleSettings
        fields = [
            'declaration_close_weekday',
            'declaration_close_time',
            'declaration_close_label',
            'declarations_closed',
            'updated_at',
        ]
        read_only_fields = ['updated_at']

    def get_declarations_closed(self, obj):
        return declaration_deadline_passed(obj)

    def get_declaration_close_label(self, obj):
        return declaration_close_label(obj)


class TaskTypeSerializer(OrganizationUniqueFieldMixin, serializers.ModelSerializer):
    unique_error = 'Typ zadania o tej nazwie już istnieje.'

    class Meta:
        model = TaskType
        fields = ['id', 'name']


class RejectionReasonTemplateSerializer(OrganizationUniqueFieldMixin, serializers.ModelSerializer):
    unique_field = 'text'
    unique_error = 'Taki szablon już istnieje.'

    class Meta:
        model = RejectionReasonTemplate
        fields = ['id', 'text', 'sort_order', 'is_active', 'last_used_at']
        read_only_fields = ['last_used_at']

    def validate_text(self, value):
        cleaned = (value or '').strip()
        if not cleaned:
            raise serializers.ValidationError('Podaj treść szablonu.')
        return cleaned


class ShiftTemplateHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.CharField(source='get_weekday_display', read_only=True)

    class Meta:
        model = ShiftTemplateHours
        fields = ['id', 'weekday', 'weekday_label', 'start_time', 'end_time']
        read_only_fields = ['id']


class ShiftTemplateSerializer(OrganizationUniqueFieldMixin, serializers.ModelSerializer):
    """
    Shift template with its weekday hours.

    Pass `filter_date` in the serializer context to get hours and slot usage for that day.
    """

    unique_error = 'Zmiana o tej nazwie już istnieje.'

    hours = ShiftTemplateHoursSerializer(many=True)
    max_slots = serializers.IntegerField(min_value=1, default=1)
    resolved_start = serializers.SerializerMethodField()
    resolved_end = serializers.SerializerMethodField()
    slots_filled = serializers.SerializerMethodField()
    slots_remaining = serializers.SerializerMethodField()
    is_full = serializers.SerializerMethodField()
    slot_holders = serializers.SerializerMethodField()

    class Meta:
        model = ShiftTemplate
        fields = [
            'id', 'name', 'is_active', 'max_slots', 'hours',
            'resolved_start', 'resolved_end',
            'slots_filled', 'slots_remaining', 'is_full', 'slot_holders',
        ]

    def _filter_date(self):
        return self.context.get('filter_date')

    def _hours_for_filter_date(self, obj):
        work_date = self._filter_date()
        return obj.hours_for_date(work_date) if work_date else None

    def _slots_info(self, obj):
        return get_shift_slots_info(obj, self._filter_date()) or {}

    def get_resolved_start(self, obj):
        hours = self._hours_for_filter_date(obj)
        return hours.start_time.strftime('%H:%M:%S') if hours else None

    def get_resolved_end(self, obj):
        hours = self._hours_for_filter_date(obj)
        return hours.end_time.strftime('%H:%M:%S') if hours else None

    def get_slots_filled(self, obj):
        return self._slots_info(obj).get('filled')

    def get_slots_remaining(self, obj):
        info = self._slots_info(obj)
        return max(0, info['max_slots'] - info['filled']) if info else None

    def get_is_full(self, obj):
        return self._slots_info(obj).get('is_full')

    def get_slot_holders(self, obj):
        return self._slots_info(obj).get('holders')

    def validate_hours(self, value):
        if not value:
            raise serializers.ValidationError('Dodaj godziny przynajmniej dla jednego dnia tygodnia.')
        weekdays = [item['weekday'] for item in value]
        if len(weekdays) != len(set(weekdays)):
            raise serializers.ValidationError('Każdy dzień tygodnia może mieć tylko jeden zakres godzin.')
        for item in value:
            if item['start_time'] >= item['end_time']:
                raise serializers.ValidationError(
                    f"Godzina końcowa musi być później niż początkowa ({Weekday(item['weekday']).label})."
                )
        return value

    @transaction.atomic
    def create(self, validated_data):
        hours_data = validated_data.pop('hours')
        template = ShiftTemplate.objects.create(**validated_data)
        self._replace_hours(template, hours_data)
        return template

    @transaction.atomic
    def update(self, instance, validated_data):
        hours_data = validated_data.pop('hours', None)
        instance = super().update(instance, validated_data)
        if hours_data is not None:
            instance.hours.all().delete()
            self._replace_hours(instance, hours_data)
        return instance

    @staticmethod
    def _replace_hours(template, hours_data):
        ShiftTemplateHours.objects.bulk_create(
            ShiftTemplateHours(template=template, **item) for item in hours_data
        )


# --- Schedule ----------------------------------------------------------------

class WorkDaySerializer(serializers.ModelSerializer):
    employee = OrganizationPrimaryKeyRelatedField(
        organization_lookup='profile__organization',
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )
    role = OrganizationPrimaryKeyRelatedField(
        queryset=TaskType.objects.all(),
        required=False,
        allow_null=True,
    )
    shift_template = OrganizationPrimaryKeyRelatedField(
        queryset=ShiftTemplate.objects.all(),
        required=False,
        allow_null=True,
    )
    start_time = serializers.TimeField(required=False)
    end_time = serializers.TimeField(required=False)
    employee_name = serializers.ReadOnlyField(source='employee.username')
    role_name = serializers.ReadOnlyField(source='role.name', default=None)
    shift_template_name = serializers.ReadOnlyField(source='shift_template.name', default=None)
    approved_by_name = serializers.ReadOnlyField(source='approved_by.username', default=None)
    shift_slots = serializers.SerializerMethodField()
    total_hours = serializers.SerializerMethodField()
    earnings = serializers.SerializerMethodField()

    class Meta:
        model = WorkDay
        fields = [
            'id', 'employee', 'employee_name', 'date',
            'start_time', 'end_time', 'role', 'role_name',
            'shift_template', 'shift_template_name', 'shift_slots',
            'status', 'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'note', 'rate_at_time', 'total_hours', 'earnings',
        ]
        read_only_fields = ['status', 'approved_by', 'approved_at', 'rejection_reason', 'rate_at_time']
        extra_kwargs = {
            'note': {'required': False, 'allow_blank': True},
        }

    def get_shift_slots(self, obj):
        return get_shift_slots_info(obj.shift_template, obj.date)

    def get_total_hours(self, obj):
        duration = datetime.combine(obj.date, obj.end_time) - datetime.combine(obj.date, obj.start_time)
        return round(duration.total_seconds() / 3600, 2)

    def get_earnings(self, obj):
        if not obj.rate_at_time:
            return 0
        hours = Decimal(str(self.get_total_hours(obj)))
        return round(hours * obj.rate_at_time, 2)

    def _current(self, attrs, field):
        """Value from the request, falling back to the instance being updated."""
        if field in attrs:
            return attrs[field]
        return getattr(self.instance, field, None)

    @staticmethod
    def _template_hours(template, work_date):
        if work_date is None:
            raise serializers.ValidationError({'date': 'Podaj datę.'})
        hours = template.hours_for_date(work_date)
        if hours is None:
            raise serializers.ValidationError({
                'shift_template': 'Ta zmiana nie jest dostępna w wybranym dniu tygodnia.',
            })
        return hours

    def _apply_employee_rules(self, attrs, user, template, work_date):
        """Employees only edit their own schedule and must pick an active template if any exist."""
        employee = self._current(attrs, 'employee')
        if employee and employee != user:
            raise serializers.ValidationError({'employee': 'Nie możesz zarządzać grafikiem innego pracownika.'})
        attrs['employee'] = user

        organization = get_user_organization(user)
        templates_configured = ShiftTemplate.objects.filter(organization=organization, is_active=True).exists()
        if templates_configured and template is None:
            raise serializers.ValidationError({
                'shift_template': 'Wybierz zdefiniowaną zmianę (np. poranna / późniejsza).',
            })
        if template is None:
            return
        if not template.is_active:
            raise serializers.ValidationError({'shift_template': 'Ta zmiana jest nieaktywna.'})

        # Employees always get the template's hours; they cannot type their own.
        hours = self._template_hours(template, work_date)
        attrs['start_time'] = hours.start_time
        attrs['end_time'] = hours.end_time

    def _apply_manager_rules(self, attrs, template, work_date):
        """Managers may set custom hours; missing ones are filled from the template."""
        has_custom_hours = attrs.get('start_time') is not None and attrs.get('end_time') is not None
        if template is None or work_date is None or has_custom_hours:
            return
        hours = self._template_hours(template, work_date)
        attrs['start_time'] = hours.start_time
        attrs['end_time'] = hours.end_time

    def _validate_slot_capacity(self, user, template, work_date):
        if template is None or work_date is None:
            return
        # Employees can't propose for a full shift; managers can't overfill approved slots.
        occupies_slot = (
            not is_manager(user)
            or self.instance is None
            or self.instance.status == WorkDay.Status.APPROVED
        )
        if not occupies_slot:
            return
        exclude_id = self.instance.pk if self.instance else None
        try:
            assert_shift_slot_available(template, work_date, exclude_workday_id=exclude_id)
        except ValueError as exc:
            raise serializers.ValidationError({'shift_template': str(exc)})

    def validate(self, attrs):
        user = self.context['request'].user
        template = self._current(attrs, 'shift_template')
        work_date = self._current(attrs, 'date')

        if is_manager(user):
            self._apply_manager_rules(attrs, template, work_date)
        else:
            self._apply_employee_rules(attrs, user, template, work_date)

        start_time = self._current(attrs, 'start_time')
        end_time = self._current(attrs, 'end_time')
        if start_time is None or end_time is None:
            raise serializers.ValidationError({'start_time': 'Podaj godziny lub wybierz szablon zmiany.'})
        if start_time >= end_time:
            raise serializers.ValidationError({'end_time': 'Godzina końcowa musi być później niż początkowa.'})

        self._validate_slot_capacity(user, template, work_date)
        return attrs


class SwapRequestSerializer(serializers.ModelSerializer):
    work_day = OrganizationPrimaryKeyRelatedField(
        organization_lookup='employee__profile__organization',
        queryset=WorkDay.objects.all(),
    )
    target_work_day = OrganizationPrimaryKeyRelatedField(
        organization_lookup='employee__profile__organization',
        queryset=WorkDay.objects.all(),
        required=False,
        allow_null=True,
    )
    target_user = OrganizationPrimaryKeyRelatedField(
        organization_lookup='profile__organization',
        queryset=User.objects.all(),
    )
    work_day_details = WorkDaySerializer(source='work_day', read_only=True)
    target_work_day_details = WorkDaySerializer(source='target_work_day', read_only=True)
    requested_by_name = serializers.ReadOnlyField(source='requested_by.username')
    target_user_name = serializers.ReadOnlyField(source='target_user.username')
    status = serializers.SerializerMethodField()
    is_two_way = serializers.SerializerMethodField()

    class Meta:
        model = SwapRequest
        fields = [
            'id', 'work_day', 'work_day_details',
            'target_work_day', 'target_work_day_details',
            'requested_by', 'requested_by_name',
            'target_user', 'target_user_name',
            'accepted_by_target', 'approved_by_manager',
            'is_rejected', 'rejection_reason', 'status', 'is_two_way', 'created_at',
        ]
        read_only_fields = [
            'requested_by', 'accepted_by_target', 'approved_by_manager',
            'is_rejected', 'rejection_reason', 'created_at',
        ]

    def get_status(self, obj):
        if obj.is_rejected:
            return 'rejected'
        if obj.approved_by_manager:
            return 'approved'
        if obj.accepted_by_target:
            return 'pending_manager'
        return 'pending_target'

    def get_is_two_way(self, obj):
        return obj.target_work_day_id is not None

    @staticmethod
    def _validate_swappable(work_day, field):
        if work_day.status != WorkDay.Status.APPROVED:
            raise serializers.ValidationError({field: 'Można zamieniać tylko zatwierdzone zmiany.'})
        if work_day.date < timezone.localdate():
            raise serializers.ValidationError({field: 'Nie można zamieniać przeszłych zmian.'})

    @staticmethod
    def _validate_two_way(user, work_day, target_user, target_work_day):
        if target_work_day.employee_id != target_user.id:
            raise serializers.ValidationError({
                'target_work_day': 'Wybrana zmiana musi należeć do wskazanego kolegi.',
            })
        if target_work_day.pk == work_day.pk:
            raise serializers.ValidationError({'target_work_day': 'Wybierz inną zmianę do wymiany.'})

        # After the swap each person takes the other's day, so both must be free then.
        if WorkDay.objects.filter(employee=user, date=target_work_day.date).exclude(pk=work_day.pk).exists():
            raise serializers.ValidationError({
                'target_work_day': 'Masz już wpis w grafiku w dniu zmiany kolegi.',
            })
        if WorkDay.objects.filter(employee=target_user, date=work_day.date).exclude(pk=target_work_day.pk).exists():
            raise serializers.ValidationError({
                'target_work_day': 'Kolega ma już inny wpis w dniu Twojej zmiany.',
            })

    def validate(self, attrs):
        user = self.context['request'].user
        work_day = attrs['work_day']
        target_user = attrs['target_user']
        target_work_day = attrs.get('target_work_day')

        if is_manager(user):
            raise serializers.ValidationError('Kierownik nie może tworzyć próśb o zamianę.')
        if work_day.employee != user:
            raise serializers.ValidationError({'work_day': 'Możesz oddać tylko własną zmianę.'})
        self._validate_swappable(work_day, 'work_day')

        if target_user == user:
            raise serializers.ValidationError({'target_user': 'Nie możesz wysłać prośby do siebie.'})
        if is_manager(target_user):
            raise serializers.ValidationError({'target_user': 'Nie można wysłać prośby do kierownika.'})

        active_swap_exists = SwapRequest.objects.filter(
            work_day=work_day,
            is_rejected=False,
            approved_by_manager=False,
        ).exists()
        if active_swap_exists:
            raise serializers.ValidationError({'work_day': 'Dla tej zmiany istnieje już aktywna prośba.'})

        if target_work_day is not None:
            self._validate_swappable(target_work_day, 'target_work_day')
            self._validate_two_way(user, work_day, target_user, target_work_day)
        elif WorkDay.objects.filter(employee=target_user, date=work_day.date).exists():
            raise serializers.ValidationError({
                'target_user': 'Wybrany pracownik ma już wpis w grafiku na ten dzień. '
                               'Wybierz jego zmianę, aby wykonać dwustronną zamianę.',
            })

        return attrs
