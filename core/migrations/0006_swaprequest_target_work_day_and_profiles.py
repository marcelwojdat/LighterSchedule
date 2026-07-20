from django.conf import settings
from django.db import migrations, models
import django.db.models.deletion


def ensure_profiles(apps, schema_editor):
    User = apps.get_model(settings.AUTH_USER_MODEL)
    EmployeeProfile = apps.get_model('core', 'EmployeeProfile')
    for user in User.objects.all():
        EmployeeProfile.objects.get_or_create(user_id=user.id)


class Migration(migrations.Migration):

    dependencies = [
        migrations.swappable_dependency(settings.AUTH_USER_MODEL),
        ('core', '0005_seed_task_types'),
    ]

    operations = [
        migrations.AddField(
            model_name='swaprequest',
            name='target_work_day',
            field=models.ForeignKey(
                blank=True,
                help_text='Jeśli ustawione — dwustronna zamiana dwóch zmian; w przeciwnym razie przekazanie jednej zmiany.',
                null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='incoming_swaps',
                to='core.workday',
            ),
        ),
        migrations.AlterField(
            model_name='swaprequest',
            name='work_day',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.CASCADE,
                related_name='outgoing_swaps',
                to='core.workday',
            ),
        ),
        migrations.RunPython(ensure_profiles, migrations.RunPython.noop),
    ]
