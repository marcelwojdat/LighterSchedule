from rest_framework import serializers
from django.contrib.auth.models import User
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

    class Meta:
        model = WorkDay
        fields = [
            'id', 'employee', 'employee_name', 'date',
            'start_time', 'end_time', 'role', 'role_name',
            'status', 'approved_by', 'approved_by_name', 'approved_at',
            'rejection_reason', 'rate_at_time', 'total_hours', 'earnings',
        ]
        read_only_fields = ['status', 'approved_by', 'approved_at', 'rejection_reason', 'rate_at_time']

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
            attrs.pop('employee', None)

        return attrs


class SwapRequestSerializer(serializers.ModelSerializer):
    work_day_details = WorkDaySerializer(source='work_day', read_only=True)
    requested_by_name = serializers.ReadOnlyField(source='requested_by.username')
    target_user_name = serializers.ReadOnlyField(source='target_user.username')

    class Meta:
        model = SwapRequest
        fields = '__all__'
