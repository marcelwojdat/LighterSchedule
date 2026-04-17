from django.urls import path, include
from django.contrib import admin
from rest_framework.routers import DefaultRouter
from core.views import TaskTypeViewSet, WorkDayViewSet, SwapRequestViewSet, register_user
from rest_framework_simplejwt.views import TokenObtainPairView, TokenRefreshView

router = DefaultRouter()

router.register(r'task-types', TaskTypeViewSet)
router.register(r'workdays', WorkDayViewSet)
router.register(r'swaps', SwapRequestViewSet) 

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/register/', register_user, name='register'),
    path('api/', include(router.urls)),
    path('api/token/', TokenObtainPairView.as_view(), name='token_obtain_pair'),
    path('api/token/refresh/', TokenRefreshView.as_view(), name='token_refresh'),
]