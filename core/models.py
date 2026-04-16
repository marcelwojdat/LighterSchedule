from django.db import models
from django.contrib.auth.models import User

class EmployeeProfile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    hourly_rate = models.DecimalField(max_digits=10, decimal_places=2, default=0.0)
    is_manager = models.BooleanField(default=False)

    def __str__(self):
        return self.user.username

class TaskType(models.Model):
    name = models.CharField(max_length=50, unique=True)

    def __str__(self):
        return self.name

class WorkDay(models.Model):
    employee = models.ForeignKey(User, on_delete=models.CASCADE)
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    role = models.ForeignKey(TaskType, on_delete=models.SET_NULL, null=True, blank=True)
    
    rate_at_time = models.DecimalField(max_digits=10, decimal_places=2, editable=False, null=True)

    def save(self, *args, **kwargs):
        if not self.rate_at_time:
            self.rate_at_time = self.employee.profile.hourly_rate
        super().save(*args, **kwargs)

    def __str__(self):
        return f"{self.date} - {self.employee.username} ({self.role})"

class SwapRequest(models.Model):
    work_day = models.ForeignKey(WorkDay, on_delete=models.CASCADE)
    requested_by = models.ForeignKey(User, on_delete=models.CASCADE, related_name='sent_swaps')
    target_user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='received_swaps')
    
    accepted_by_target = models.BooleanField(default=False)
    approved_by_manager = models.BooleanField(default=False)

    def __str__(self):
        return f"Zamiana {self.work_day.date} od {self.requested_by}"