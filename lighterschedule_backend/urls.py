from django.contrib import admin
from django.urls import include, path
from rest_framework.routers import DefaultRouter
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

from core.views import (
    RejectionReasonTemplateViewSet,
    ShiftTemplateViewSet,
    SwapRequestViewSet,
    TaskTypeViewSet,
    UserViewSet,
    WorkDayViewSet,
    change_password,
    current_user,
    notifications,
    payroll_report,
    register_user,
    registration_status,
    schedule_holes,
    schedule_settings,
    team_stats,
)

router = DefaultRouter()
router.register(r'users', UserViewSet)
router.register(r'task-types', TaskTypeViewSet)
router.register(r'shift-templates', ShiftTemplateViewSet)
router.register(r'rejection-reasons', RejectionReasonTemplateViewSet)
router.register(r'workdays', WorkDayViewSet)
router.register(r'swaps', SwapRequestViewSet)

urlpatterns = [
    path('admin/', admin.site.urls),

    # Authentication
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
    path('api/register/', register_user, name='register'),
    path('api/register/status/', registration_status, name='registration_status'),

    # Current user
    path('api/me/', current_user, name='current_user'),
    path('api/me/change-password/', change_password, name='change_password'),

    # Manager reports and schedule configuration
    path('api/stats/', team_stats, name='team_stats'),
    path('api/stats/payroll.pdf', payroll_report, name='payroll_report'),
    path('api/schedule-holes/', schedule_holes, name='schedule_holes'),
    path('api/schedule-settings/', schedule_settings, name='schedule_settings'),
    path('api/notifications/', notifications, name='notifications'),

    path('api/', include(router.urls)),
]
