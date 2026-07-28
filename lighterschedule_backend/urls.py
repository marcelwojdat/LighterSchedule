from django.urls import path, include
from django.contrib import admin
from rest_framework.routers import DefaultRouter
from core.views import (
    TaskTypeViewSet,
    ShiftTemplateViewSet,
    RejectionReasonTemplateViewSet,
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
    schedule_settings,
    schedule_holes,
    subscription_info,
    payment_session_create,
    payment_webhook,
)
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

router = DefaultRouter()

router.register(r'users', UserViewSet)
router.register(r'task-types', TaskTypeViewSet)
router.register(r'shift-templates', ShiftTemplateViewSet)
router.register(r'rejection-reasons', RejectionReasonTemplateViewSet)
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
    path('api/schedule-holes/', schedule_holes, name='schedule-holes'),
    path('api/schedule-settings/', schedule_settings, name='schedule_settings'),
    path('api/subscription/', subscription_info, name='subscription'),
    path('api/payments/session/', payment_session_create, name='payment-session'),
    path('api/payments/webhook/', payment_webhook, name='payment-webhook'),
    path('api/', include(router.urls)),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]
