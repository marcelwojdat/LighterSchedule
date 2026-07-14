from rest_framework import serializers
from django.contrib.auth.models import User
from django.utils import timezone
from .models import TaskType, WorkDay, SwapRequest
from .permissions import is_manager
from datetime import datetime


class UserSerializer(serializers.ModelSerializer):
    hourly_rate = serializers.SerializerMethodField()
    is_manager = serializers.SerializerMethodField()
    email = serializers.EmailField(read_only=True)

    class Meta:
        model = User
        fields = [
            'id', 'username', 'first_name', 'last_name', 'email',
            'hourly_rate', 'is_manager',
        ]

    def get_hourly_rate(self, obj):
        if hasattr(obj, 'profile'):
            return obj.profile.hourly_rate
        return None

    def get_is_manager(self, obj):
        if hasattr(obj, 'profile'):
            return obj.profile.is_manager
        return False


class UserProfileUpdateSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['first_name', 'last_name', 'email']


class TaskTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskType
        fields = '__all__'


class WorkDaySerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.username')
    role_name = serializers.ReadOnlyField(source='role.name')
    approved_by_name = serializers.ReadOnlyField(source='approved_by.username')
    total_hours = serializers.SerializerMethodField()
    earnings = serializers.SerializerMethodField()
    employee = serializers.PrimaryKeyRelatedField(
        queryset=User.objects.all(),
        required=False,
        default=serializers.CurrentUserDefault(),
    )

    class Meta:
        model = WorkDay
        fields = [
            'id', 'employee', 'employee_name', 'date',
            'start_time', 'end_time', 'role', 'role_name',
            'status', 'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'rate_at_time', 'total_hours', 'earnings',
        ]
        read_only_fields = ['status', 'approved_by', 'approved_at', 'rejection_reason', 'rate_at_time']
        extra_kwargs = {
            'employee': {'required': False},
        }

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

        if not is_manager(user):
            if employee and employee != user:
                raise serializers.ValidationError({'employee': 'Nie możesz zarządzać grafikiem innego pracownika.'})
            attrs['employee'] = user

        return attrs


class SwapRequestSerializer(serializers.ModelSerializer):
    work_day_details = WorkDaySerializer(source='work_day', read_only=True)
    requested_by_name = serializers.ReadOnlyField(source='requested_by.username')
    target_user_name = serializers.ReadOnlyField(source='target_user.username')
    status = serializers.SerializerMethodField()

    class Meta:
        model = SwapRequest
        fields = [
            'id', 'work_day', 'work_day_details', 'requested_by', 'requested_by_name',
            'target_user', 'target_user_name', 'accepted_by_target', 'approved_by_manager',
            'is_rejected', 'rejection_reason', 'status', 'created_at',
        ]
        read_only_fields = [
            'requested_by', 'accepted_by_target', 'approved_by_manager',
            'is_rejected', 'rejection_reason', 'status', 'created_at',
        ]

    def get_status(self, obj):
        if obj.is_rejected:
            return 'rejected'
        if obj.approved_by_manager:
            return 'approved'
        if obj.accepted_by_target:
            return 'pending_manager'
        return 'pending_target'

    def validate(self, attrs):
        request = self.context.get('request')
        if not request or not request.user.is_authenticated:
            return attrs

        work_day = attrs.get('work_day')
        target_user = attrs.get('target_user')
        user = request.user

        if is_manager(user):
            raise serializers.ValidationError('Kierownik nie może tworzyć próśb o zamianę.')

        if work_day.employee != user:
            raise serializers.ValidationError({'work_day': 'Możesz oddać tylko własną zmianę.'})

        if work_day.status != WorkDay.Status.APPROVED:
            raise serializers.ValidationError({'work_day': 'Można zamieniać tylko zatwierdzone zmiany.'})

        if work_day.date < timezone.now().date():
            raise serializers.ValidationError({'work_day': 'Nie można zamieniać przeszłych zmian.'})

        if target_user == user:
            raise serializers.ValidationError({'target_user': 'Nie możesz wysłać prośby do siebie.'})

        if hasattr(target_user, 'profile') and target_user.profile.is_manager:
            raise serializers.ValidationError({'target_user': 'Nie można wysłać prośby do kierownika.'})

        active_swap_exists = SwapRequest.objects.filter(
            work_day=work_day,
            is_rejected=False,
            approved_by_manager=False,
        ).exists()
        if active_swap_exists:
            raise serializers.ValidationError({'work_day': 'Dla tej zmiany istnieje już aktywna prośba.'})

        if WorkDay.objects.filter(employee=target_user, date=work_day.date).exists():
            raise serializers.ValidationError({
                'target_user': 'Wybrany pracownik ma już wpis w grafiku na ten dzień.',
            })

        return attrs
