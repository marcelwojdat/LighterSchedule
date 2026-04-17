from django.urls import path, include
from django.contrib import admin
from rest_framework.routers import DefaultRouter
from core.views import TaskTypeViewSet, WorkDayViewSet, SwapRequestViewSet

router = DefaultRouter()

router.register(r'task-types', TaskTypeViewSet)
router.register(r'workdays', WorkDayViewSet)
router.register(r'swaps', SwapRequestViewSet) 

urlpatterns = [
    path('admin/', admin.site.urls),
    path('api/', include(router.urls)),
]