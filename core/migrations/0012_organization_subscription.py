from django.db import migrations, models
import django.db.models.deletion


def bootstrap_default_org(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    Subscription = apps.get_model('core', 'Subscription')
    OrganizationMembership = apps.get_model('core', 'OrganizationMembership')
    User = apps.get_model('auth', 'User')
    EmployeeProfile = apps.get_model('core', 'EmployeeProfile')

    org, _ = Organization.objects.get_or_create(
        pk=1,
        defaults={'name': 'LighterSchedule'},
    )

    managers = 0
    employees = 0
    for user in User.objects.all():
        profile = EmployeeProfile.objects.filter(user_id=user.id).first()
        if user.is_active and profile and profile.is_manager:
            managers += 1
        elif user.is_active:
            employees += 1

    # Pick the smallest plan that fits existing seats; otherwise Extended with room.
    if managers <= 1 and employees <= 10:
        plan = 'basic'
        max_managers, max_employees = 1, 10
    else:
        plan = 'extended'
        max_managers, max_employees = max(2, managers), max(100, employees)

    Subscription.objects.get_or_create(
        organization=org,
        defaults={
            'plan': plan,
            'status': 'trial',
            'max_managers': max_managers,
            'max_employees': max_employees,
        },
    )

    for user in User.objects.all():
        OrganizationMembership.objects.get_or_create(
            user=user,
            defaults={'organization': org},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('auth', '0012_alter_user_first_name_max_length'),
        ('core', '0011_rejectionreasontemplate'),
    ]

    operations = [
        migrations.CreateModel(
            name='Organization',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=120)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='Subscription',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('plan', models.CharField(choices=[('basic', 'Basic'), ('extended', 'Extended')], default='basic', max_length=20)),
                ('status', models.CharField(choices=[('trial', 'Trial'), ('active', 'Active'), ('past_due', 'Past due'), ('canceled', 'Canceled')], default='trial', max_length=20)),
                ('max_managers', models.PositiveSmallIntegerField(default=1)),
                ('max_employees', models.PositiveSmallIntegerField(default=10)),
                ('external_payment_id', models.CharField(blank=True, default='', max_length=120)),
                ('updated_at', models.DateTimeField(auto_now=True)),
                ('organization', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='subscription', to='core.organization')),
            ],
        ),
        migrations.CreateModel(
            name='OrganizationMembership',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('organization', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='memberships', to='core.organization')),
                ('user', models.OneToOneField(on_delete=django.db.models.deletion.CASCADE, related_name='membership', to='auth.user')),
            ],
            options={
                'unique_together': {('organization', 'user')},
            },
        ),
        migrations.CreateModel(
            name='PaymentSession',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('session_id', models.CharField(max_length=64, unique=True)),
                ('provider', models.CharField(default='mock', max_length=32)),
                ('plan', models.CharField(choices=[('basic', 'Basic'), ('extended', 'Extended')], max_length=20)),
                ('status', models.CharField(choices=[('pending', 'Pending'), ('paid', 'Paid'), ('failed', 'Failed'), ('canceled', 'Canceled')], default='pending', max_length=20)),
                ('amount', models.DecimalField(decimal_places=2, max_digits=8)),
                ('currency', models.CharField(default='PLN', max_length=3)),
                ('email', models.EmailField(max_length=254)),
                ('company_or_name', models.CharField(max_length=120)),
                ('nip', models.CharField(blank=True, default='', max_length=20)),
                ('payment_method', models.CharField(blank=True, default='', max_length=20)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
                ('paid_at', models.DateTimeField(blank=True, null=True)),
                ('organization', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.CASCADE, related_name='payment_sessions', to='core.organization')),
            ],
        ),
        migrations.RunPython(bootstrap_default_org, migrations.RunPython.noop),
    ]
