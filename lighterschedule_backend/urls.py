from django.urls import path, include
from django.contrib import admin
from rest_framework.routers import DefaultRouter
from core.views import (
    TaskTypeViewSet,
    ShiftTemplateViewSet,
    WorkDayViewSet,
    SwapRequestViewSet,
    UserViewSet,
    register_user,
    registration_status,
    current_user,
    change_password,
    team_stats,
    notifications,
    payroll_report,
)
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

router = DefaultRouter()

router.register(r'users', UserViewSet)
router.register(r'task-types', TaskTypeViewSet)
router.register(r'shift-templates', ShiftTemplateViewSet)
router.register(r'workdays', WorkDayViewSet)
router.register(r'swaps', SwapRequestViewSet) 

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/register/', register_user, name='register'),
    path('api/register/status/', registration_status, name='registration_status'),
    path('api/me/', current_user, name='current_user'),
    path('api/me/change-password/', change_password, name='change_password'),
    path('api/stats/', team_stats, name='team_stats'),
    path('api/stats/payroll.pdf', payroll_report, name='payroll_report'),
    path('api/notifications/', notifications, name='notifications'),
    path('api/', include(router.urls)),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]