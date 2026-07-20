from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
from .models import TaskType, WorkDay, SwapRequest, ShiftTemplate, ShiftTemplateHours
from .permissions import is_manager
from .utils import ensure_user_profile
from datetime import datetime, date as date_cls


WEEKDAY_LABELS = (
    'Poniedziałek', 'Wtorek', 'Środa', 'Czwartek', 'Piątek', 'Sobota', 'Niedziela',
)

class UserSerializer(serializers.ModelSerializer):
    hourly_rate = serializers.SerializerMethodField()
    is_manager = serializers.SerializerMethodField()
    email = serializers.EmailField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email',
            'hourly_rate', 'is_manager', 'is_active',
        ]

    def get_hourly_rate(self, obj):
        profile = ensure_user_profile(obj)
        return profile.hourly_rate if profile else None

    def get_is_manager(self, obj):
        profile = ensure_user_profile(obj)
        return bool(profile and profile.is_manager)


class ManagerUserCreateSerializer(serializers.Serializer):
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(write_only=True, min_length=8)
    first_name = serializers.CharField(max_length=150)
    last_name = serializers.CharField(max_length=150)
    email = serializers.EmailField()
    is_manager = serializers.BooleanField(default=False)
    hourly_rate = serializers.DecimalField(
        max_digits=10, decimal_places=2, required=False, default=0,
    )

    def validate_username(self, value):
        username = value.strip()
        if User.objects.filter(username=username).exists():
            raise serializers.ValidationError('Użytkownik o tym loginie już istnieje.')
        return username

    def validate_email(self, value):
        email = value.strip().lower()
        if User.objects.filter(email__iexact=email).exists():
            raise serializers.ValidationError('Konto z tym adresem e-mail już istnieje.')
        return email

    def validate_password(self, value):
        from django.contrib.auth.password_validation import validate_password
        from django.core.exceptions import ValidationError as DjangoValidationError

        try:
            validate_password(value)
        except DjangoValidationError as exc:
            raise serializers.ValidationError(list(exc.messages))
        return value

    def create(self, validated_data):
        is_manager_flag = validated_data.pop('is_manager', False)
        hourly_rate = validated_data.pop('hourly_rate', 0)
        user = User.objects.create_user(**validated_data)
        profile = ensure_user_profile(user)
        profile.is_manager = is_manager_flag
        profile.hourly_rate = hourly_rate
        profile.save()
        return user

    def to_representation(self, instance):
        return UserSerializer(instance, context=self.context).data


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']


class TaskTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskType
        fields = '__all__'


class ShiftTemplateHoursSerializer(serializers.ModelSerializer):
    weekday_label = serializers.SerializerMethodField()

    class Meta:
        model = ShiftTemplateHours
        fields = ['id', 'weekday', 'weekday_label', 'start_time', 'end_time']
        read_only_fields = ['id', 'weekday_label']

    def get_weekday_label(self, obj):
        if 0 <= obj.weekday <= 6:
            return WEEKDAY_LABELS[obj.weekday]
        return str(obj.weekday)


class ShiftTemplateSerializer(serializers.ModelSerializer):
    hours = ShiftTemplateHoursSerializer(many=True)
    resolved_start = serializers.SerializerMethodField()
    resolved_end = serializers.SerializerMethodField()

    class Meta:
        model = ShiftTemplate
        fields = [
            'id', 'name', 'is_active', 'hours',
            'resolved_start', 'resolved_end',
        ]

    def _filter_date(self):
        raw = self.context.get('filter_date')
        if isinstance(raw, date_cls):
            return raw
        return None

    def get_resolved_start(self, obj):
        work_date = self._filter_date()
        if not work_date:
            return None
        entry = obj.hours_for_date(work_date)
        return entry.start_time.strftime('%H:%M:%S') if entry else None

    def get_resolved_end(self, obj):
        work_date = self._filter_date()
        if not work_date:
            return None
        entry = obj.hours_for_date(work_date)
        return entry.end_time.strftime('%H:%M:%S') if entry else None

    def validate_hours(self, value):
        if not value:
            raise serializers.ValidationError('Dodaj godziny przynajmniej dla jednego dnia tygodnia.')
        weekdays = [item.get('weekday') for item in value]
        if any(w is None or w < 0 or w > 6 for w in weekdays):
            raise serializers.ValidationError('Dzień tygodnia musi być liczbą 0–6.')
        if len(weekdays) != len(set(weekdays)):
            raise serializers.ValidationError('Każdy dzień tygodnia może mieć tylko jeden zakres godzin.')
        for item in value:
            if item['start_time'] >= item['end_time']:
                raise serializers.ValidationError(
                    f"Godzina końcowa musi być później niż początkowa ({WEEKDAY_LABELS[item['weekday']]})."
                )
        return value

    def create(self, validated_data):
        hours_data = validated_data.pop('hours')
        template = ShiftTemplate.objects.create(**validated_data)
        ShiftTemplateHours.objects.bulk_create([
            ShiftTemplateHours(template=template, **item) for item in hours_data
        ])
        return template

    def update(self, instance, validated_data):
        hours_data = validated_data.pop('hours', None)
        instance.name = validated_data.get('name', instance.name)
        instance.is_active = validated_data.get('is_active', instance.is_active)
        instance.save()

        if hours_data is not None:
            instance.hours.all().delete()
            ShiftTemplateHours.objects.bulk_create([
                ShiftTemplateHours(template=instance, **item) for item in hours_data
            ])
        return instance


class WorkDaySerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.username')
    role_name = serializers.SerializerMethodField()
    shift_template_name = serializers.SerializerMethodField()
    approved_by_name = serializers.SerializerMethodField()
    total_hours = serializers.SerializerMethodField()
    earnings = serializers.SerializerMethodField()
    employee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )
    role = serializers.PrimaryKeyRelatedField(
        queryset=TaskType.objects.all(),
        required=False,
        allow_null=True,
    )
    shift_template = serializers.PrimaryKeyRelatedField(
        queryset=ShiftTemplate.objects.all(),
        required=False,
        allow_null=True,
    )
    start_time = serializers.TimeField(required=False)
    end_time = serializers.TimeField(required=False)

    class Meta:
        model = WorkDay
        fields = [
            'id', 'employee', 'employee_name', 'date',
            'start_time', 'end_time', 'role', 'role_name',
            'shift_template', 'shift_template_name',
            'status', 'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'note', 'rate_at_time', 'total_hours', 'earnings',
        ]
        read_only_fields = ['status', 'approved_by', 'approved_at', 'rejection_reason', 'rate_at_time']
        extra_kwargs = {
            'employee': {'required': False},
            'note': {'required': False, 'allow_blank': True},
        }

    def get_role_name(self, obj):
        return obj.role.name if obj.role_id else None

    def get_shift_template_name(self, obj):
        return obj.shift_template.name if obj.shift_template_id else None

    def get_approved_by_name(self, obj):
        return obj.approved_by.username if obj.approved_by_id else None

    def get_total_hours(self, obj):
        tdelta = datetime.combine(obj.date, obj.end_time) - datetime.combine(obj.date, obj.start_time)
        return round(tdelta.total_seconds() / 3600, 2)

    def get_earnings(self, obj):
        hours = self.get_total_hours(obj)
        if obj.rate_at_time:
            return round(hours * float(obj.rate_at_time), 2)
        return 0

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return attrs

        user = request.user
        employee = attrs.get('employee', getattr(self.instance, 'employee', None))
        manager = is_manager(user)

        if not manager:
            if employee and employee != user:
                raise serializers.ValidationError({'employee': 'Nie możesz zarządzać grafikiem innego pracownika.'})
            attrs['employee'] = user

        work_date = attrs.get('date', getattr(self.instance, 'date', None))
        if 'shift_template' in attrs:
            template = attrs.get('shift_template')
        else:
            template = getattr(self.instance, 'shift_template', None) if self.instance else None

        if not manager:
            templates_configured = ShiftTemplate.objects.filter(is_active=True).exists()
            if templates_configured:
                if template is None:
                    raise serializers.ValidationError({
                        'shift_template': 'Wybierz zdefiniowaną zmianę (np. poranna / późniejsza).',
                    })
                if not template.is_active:
                    raise serializers.ValidationError({'shift_template': 'Ta zmiana jest nieaktywna.'})
                if not work_date:
                    raise serializers.ValidationError({'date': 'Podaj datę.'})
                hours = template.hours_for_date(work_date)
                if not hours:
                    raise serializers.ValidationError({
                        'shift_template': 'Ta zmiana nie jest dostępna w wybranym dniu tygodnia.',
                    })
                attrs['start_time'] = hours.start_time
                attrs['end_time'] = hours.end_time
                attrs['shift_template'] = template
            elif template is not None:
                if not work_date:
                    raise serializers.ValidationError({'date': 'Podaj datę.'})
                hours = template.hours_for_date(work_date)
                if not hours:
                    raise serializers.ValidationError({
                        'shift_template': 'Ta zmiana nie jest dostępna w wybranym dniu tygodnia.',
                    })
                attrs['start_time'] = hours.start_time
                attrs['end_time'] = hours.end_time
        elif template is not None and work_date:
            has_start = 'start_time' in attrs and attrs.get('start_time') is not None
            has_end = 'end_time' in attrs and attrs.get('end_time') is not None
            if not (has_start and has_end):
                hours = template.hours_for_date(work_date)
                if not hours:
                    raise serializers.ValidationError({
                        'shift_template': 'Ta zmiana nie ma godzin na ten dzień tygodnia.',
                    })
                attrs['start_time'] = hours.start_time
                attrs['end_time'] = hours.end_time

        start_time = attrs.get('start_time', getattr(self.instance, 'start_time', None))
        end_time = attrs.get('end_time', getattr(self.instance, 'end_time', None))
        if start_time is None or end_time is None:
            raise serializers.ValidationError({
                'start_time': 'Podaj godziny lub wybierz szablon zmiany.',
            })
        if start_time >= end_time:
            raise serializers.ValidationError({
                'end_time': 'Godzina końcowa musi być później niż początkowa.',
            })

        return attrs


class SwapRequestSerializer(serializers.ModelSerializer):
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
            'is_rejected', 'rejection_reason', 'status', 'is_two_way', 'created_at',
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
        return bool(obj.target_work_day_id)

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return attrs

        work_day = attrs.get('work_day')
        target_user = attrs.get('target_user')
        target_work_day = attrs.get('target_work_day')
        user = request.user
        today = timezone.now().date()

        if is_manager(user):
            raise serializers.ValidationError('Kierownik nie może tworzyć próśb o zamianę.')

        if work_day.employee != user:
            raise serializers.ValidationError({'work_day': 'Możesz oddać tylko własną zmianę.'})

        if work_day.status != WorkDay.Status.APPROVED:
            raise serializers.ValidationError({'work_day': 'Można zamieniać tylko zatwierdzone zmiany.'})

        if work_day.date < today:
            raise serializers.ValidationError({'work_day': 'Nie można zamieniać przeszłych zmian.'})

        if target_user == user:
            raise serializers.ValidationError({'target_user': 'Nie możesz wysłać prośby do siebie.'})

        ensure_user_profile(target_user)
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
            if target_work_day.employee_id != target_user.id:
                raise serializers.ValidationError({
                    'target_work_day': 'Wybrana zmiana musi należeć do wskazanego kolegi.',
                })
            if target_work_day.status != WorkDay.Status.APPROVED:
                raise serializers.ValidationError({
                    'target_work_day': 'Można zamieniać tylko zatwierdzone zmiany.',
                })
            if target_work_day.date < today:
                raise serializers.ValidationError({
                    'target_work_day': 'Nie można zamieniać przeszłych zmian.',
                })
            if target_work_day.id == work_day.id:
                raise serializers.ValidationError({
                    'target_work_day': 'Wybierz inną zmianę do wymiany.',
                })

            # After swap, requester takes target's day — requester must be free that day
            # (unless it's the same date as their own outgoing day, which is rare).
            conflict_requester = WorkDay.objects.filter(
                employee=user,
                date=target_work_day.date,
            ).exclude(pk=work_day.pk).exists()
            if conflict_requester:
                raise serializers.ValidationError({
                    'target_work_day': 'Masz już wpis w grafiku w dniu zmiany kolegi.',
                })

            conflict_target = WorkDay.objects.filter(
                employee=target_user,
                date=work_day.date,
            ).exclude(pk=target_work_day.pk).exists()
            if conflict_target:
                raise serializers.ValidationError({
                    'target_work_day': 'Kolega ma już inny wpis w dniu Twojej zmiany.',
                })
        else:
            if WorkDay.objects.filter(employee=target_user, date=work_day.date).exists():
                raise serializers.ValidationError({
                    'target_user': 'Wybrany pracownik ma już wpis w grafiku na ten dzień. '
                                   'Wybierz jego zmianę, aby wykonać dwustronną zamianę.',
                })

        return attrs
