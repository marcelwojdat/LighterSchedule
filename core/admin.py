from django.contrib import admin
from .models import (
    EmployeeProfile,
    TaskType,
    WorkDay,
    SwapRequest,
    ShiftTemplate,
    ShiftTemplateHours,
    ScheduleSettings,
    RejectionReasonTemplate,
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


@admin.register(RejectionReasonTemplate)
class RejectionReasonTemplateAdmin(admin.ModelAdmin):
    list_display = ('text', 'sort_order', 'is_active', 'last_used_at')
    list_filter = ('is_active',)
    search_fields = ('text',)


@admin.register(ScheduleSettings)
class ScheduleSettingsAdmin(admin.ModelAdmin):
    list_display = ('declaration_deadline', 'updated_at')
