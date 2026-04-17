from rest_framework import viewsets, permissions
from django.db import models
from django.db.models import Q
from .models import TaskType, WorkDay, SwapRequest
from .serializers import TaskTypeSerializer, WorkDaySerializer, SwapRequestSerializer

class TaskTypeViewSet(viewsets.ModelViewSet):
    queryset = TaskType.objects.all()
    serializer_class = TaskTypeSerializer

class WorkDayViewSet(viewsets.ModelViewSet):
    queryset = WorkDay.objects.all()
    serializer_class = WorkDaySerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return 0
        
        if hasattr(user, 'profile') and user.profile.is_manager:
            return WorkDay.objects.all()
        return WorkDay.objects.filter(employee=user)

class SwapRequestViewSet(viewsets.ModelViewSet):
    queryset = SwapRequest.objects.all()
    serializer_class = SwapRequestSerializer

    def get_queryset(self):
        user = self.request.user
        if not user.is_authenticated:
            return SwapRequest.objects.all()
            
        return SwapRequest.objects.filter(Q(requested_by=user) | Q(target_user=user))