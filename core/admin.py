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
    Organization,
    Subscription,
    OrganizationMembership,
    PaymentSession,
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


@admin.register(Organization)
class OrganizationAdmin(admin.ModelAdmin):
    list_display = ('name', 'created_at')


@admin.register(Subscription)
class SubscriptionAdmin(admin.ModelAdmin):
    list_display = ('organization', 'plan', 'status', 'max_managers', 'max_employees', 'updated_at')
    list_filter = ('plan', 'status')


@admin.register(OrganizationMembership)
class OrganizationMembershipAdmin(admin.ModelAdmin):
    list_display = ('user', 'organization', 'created_at')
    search_fields = ('user__username', 'organization__name')


@admin.register(PaymentSession)
class PaymentSessionAdmin(admin.ModelAdmin):
    list_display = ('session_id', 'plan', 'status', 'provider', 'amount', 'email', 'created_at')
    list_filter = ('status', 'provider', 'plan')
    search_fields = ('session_id', 'email')
