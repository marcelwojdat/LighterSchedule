from django.contrib import admin
from .models import EmployeeProfile, TaskType, WorkDay, SwapRequest

admin.site.register(EmployeeProfile)
admin.site.register(TaskType)
admin.site.register(WorkDay)
admin.site.register(SwapRequest)