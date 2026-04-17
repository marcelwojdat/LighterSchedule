from rest_framework import serializers
from django.contrib.auth.models import User
from .models import TaskType, WorkDay, SwapRequest
from datetime import datetime

class UserSerializer(serializers.ModelSerializer):
    class Meta:
        model = User
        fields = ['id', 'username', 'first_name', 'last_name']

class TaskTypeSerializer(serializers.ModelSerializer):
    class Meta:
        model = TaskType
        fields = '__all__'

class WorkDaySerializer(serializers.ModelSerializer):
    employee_name = serializers.ReadOnlyField(source='employee.username')
    role_name = serializers.ReadOnlyField(source='role.name')
    total_hours = serializers.SerializerMethodField()
    earnings = serializers.SerializerMethodField()

    class Meta:
        model = WorkDay
        fields = [
            'id', 'employee', 'employee_name', 'date', 
            'start_time', 'end_time', 'role', 'role_name', 
            'rate_at_time', 'total_hours', 'earnings'
        ]

    def get_total_hours(self, obj):
        tdelta = datetime.combine(obj.date, obj.end_time) - datetime.combine(obj.date, obj.start_time)
        return round(tdelta.total_seconds() / 3600, 2)

    def get_earnings(self, obj):
        hours = self.get_total_hours(obj)
        if obj.rate_at_time:
            return round(hours * float(obj.rate_at_time), 2)
        return 0

class SwapRequestSerializer(serializers.ModelSerializer):
    work_day_details = WorkDaySerializer(source='work_day', read_only=True)
    requested_by_name = serializers.ReadOnlyField(source='requested_by.username')
    target_user_name = serializers.ReadOnlyField(source='target_user.username')

    class Meta:
        model = SwapRequest
        fields = '__all__'