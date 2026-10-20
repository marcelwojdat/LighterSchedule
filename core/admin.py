from django.contrib import admin
from django.contrib.auth.admin import UserAdmin as BaseUserAdmin
from django.contrib.auth.models import User

from .models import (
    EmployeeProfile,
    Organization,
    RejectionReasonTemplate,
    ScheduleSettings,
    ShiftTemplate,
    ShiftTemplateHours,
    SwapRequest,
    TaskType,
    WorkDay,
)


class EmployeeProfileInline(admin.StackedInline):
    model = EmployeeProfile
    can_delete = False


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')
    search_fields = ('name',)


@admin.register(EmployeeProfile)
class EmployeeProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'is_manager', 'hourly_rate')
    list_filter = ('organization', 'is_manager')
    list_select_related = ('user', 'organization')
    search_fields = ('user__username', 'user__first_name', 'user__last_name')


@admin.register(ScheduleSettings)
class ScheduleSettingsAdmin(admin.ModelAdmin):
    list_display = ('organization', 'declaration_close_weekday', 'declaration_close_time', 'updated_at')
    list_select_related = ('organization',)


@admin.register(TaskType)
class TaskTypeAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization')
    list_filter = ('organization',)
    list_select_related = ('organization',)


@admin.register(RejectionReasonTemplate)
class RejectionReasonTemplateAdmin(admin.ModelAdmin):
    list_display = ('text', 'organization', 'sort_order', 'is_active', 'last_used_at')
    list_filter = ('organization', 'is_active')
    list_select_related = ('organization',)
    search_fields = ('text',)


class ShiftTemplateHoursInline(admin.TabularInline):
    model = ShiftTemplateHours
    extra = 1


@admin.register(ShiftTemplate)
class ShiftTemplateAdmin(admin.ModelAdmin):
    list_display = ('name', 'organization', 'is_active', 'max_slots')
    list_filter = ('organization', 'is_active')
    list_select_related = ('organization',)
    inlines = [ShiftTemplateHoursInline]


@admin.register(WorkDay)
class WorkDayAdmin(admin.ModelAdmin):
    list_display = ('date', 'employee', 'start_time', 'end_time', 'shift_template', 'status')
    list_filter = ('status', 'employee__profile__organization')
    list_select_related = ('employee', 'shift_template')
    search_fields = ('employee__username',)
    date_hierarchy = 'date'


@admin.register(SwapRequest)
class SwapRequestAdmin(admin.ModelAdmin):
    list_display = ('work_day', 'requested_by', 'target_user', 'accepted_by_target', 'approved_by_manager', 'is_rejected')
    list_filter = ('is_rejected', 'approved_by_manager', 'requested_by__profile__organization')
    list_select_related = ('work_day__employee', 'requested_by', 'target_user')


class UserAdmin(BaseUserAdmin):
    inlines = (EmployeeProfileInline,)
    list_display = ('username', 'email', 'first_name', 'last_name', 'is_staff')
    list_filter = BaseUserAdmin.list_filter + ('profile__organization',)


admin.site.unregister(User)
admin.site.register(User, UserAdmin)
