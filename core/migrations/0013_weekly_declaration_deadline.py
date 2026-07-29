from datetime import time

from django.db import migrations, models


def forwards_convert_deadline(apps, schema_editor):
    ScheduleSettings = apps.get_model('core', 'ScheduleSettings')
    for row in ScheduleSettings.objects.all():
        old = getattr(row, 'declaration_deadline', None)
        if old is None:
            continue
        row.declaration_close_weekday = old.weekday()
        row.declaration_close_time = time(23, 59)
        row.save(update_fields=['declaration_close_weekday', 'declaration_close_time'])


def backwards_noop(apps, schema_editor):
    pass


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0012_organization_subscription'),
    ]

    operations = [
        migrations.AddField(
            model_name='schedulesettings',
            name='declaration_close_weekday',
            field=models.PositiveSmallIntegerField(
                blank=True,
                help_text='Dzień tygodnia zamknięcia okna deklaracji (0=poniedziałek … 6=niedziela). Puste = bez limitu.',
                null=True,
            ),
        ),
        migrations.AddField(
            model_name='schedulesettings',
            name='declaration_close_time',
            field=models.TimeField(
                blank=True,
                help_text='Godzina zamknięcia w wybranym dniu (np. 23:59).',
                null=True,
            ),
        ),
        migrations.RunPython(forwards_convert_deadline, backwards_noop),
        migrations.RemoveField(
            model_name='schedulesettings',
            name='declaration_deadline',
        ),
    ]
