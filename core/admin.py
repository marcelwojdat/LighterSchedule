from django.contrib import admin
from .models import (
    EmployeeProfile,
    TaskType,
    WorkDay,
    SwapRequest,
    ShiftTemplate,
    ShiftTemplateHours,
    ScheduleSettings,
)


class ShiftTemplateHoursInline(admin.TabularInline):
    model = ShiftTemplateHours
    extra = 1


@admin.register(ShiftTemplate)
class ShiftTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'is_active', 'max_slots')
    inlines = [ShiftTemplateHoursInline]


admin.site.register(EmployeeProfile)
admin.site.register(TaskType)
admin.site.register(WorkDay)
admin.site.register(SwapRequest)


@admin.register(ScheduleSettings)
class ScheduleSettingsAdmin(admin.ModelAdmin):
    list_display = ('declaration_deadline', 'updated_at')
