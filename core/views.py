from rest_framework import viewsets, permissions
from django.db import models
from django.db.models import Q
from .models import TaskType, WorkDay, SwapRequest, EmployeeProfile
from .serializers import TaskTypeSerializer, WorkDaySerializer, SwapRequestSerializer
from rest_framework import status
from rest_framework.response import Response
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import AllowAny
from django.contrib.auth.models import User


@api_view(['POST'])
@permission_classes([AllowAny])

def register_user(request):
    username = request.data.get('username')
    password = request.data.get('password')
    
    if not username or not password:
        return Response({'error': 'Podaj login i hasło'}, status=status.HTTP_400_BAD_REQUEST)
    
    if User.objects.filter(username=username).exists():
        return Response({'error': 'Użytkownik już istnieje'}, status=status.HTTP_400_BAD_REQUEST)

    user = User.objects.create_user(username=username, password=password)
    EmployeeProfile.objects.create(user=user) # Tworzymy profil automatycznie
    
    return Response({'message': 'Zarejestrowano pomyślnie'}, status=status.HTTP_201_CREATED)


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