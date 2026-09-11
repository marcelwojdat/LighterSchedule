from django import forms
from .models import Organization, EmployeeProfile

class OrganizationForm(forms.ModelForm):
    class Meta:
        model = Organization
        fields = ['name', 'description']

class EmployeeForm(forms.ModelForm):
    class Meta:
        model = EmployeeProfile
        fields = ['user', 'organization', 'hourly_rate', 'is_active']

    def clean(self):
        cleaned_data = super().clean()
        user = cleaned_data.get('user')
        organization = cleaned_data.get('organization')

        if not user or not organization:
            raise forms.ValidationError("Określenie firmy i użytkownika jest wymagane.")

        return cleaned_data