from django.db import migrations


def approve_existing_workdays(apps, schema_editor):
    WorkDay = apps.get_model('core', 'WorkDay')
    WorkDay.objects.filter(status='proposed').update(status='approved')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0002_workday_approved_at_workday_approved_by_and_more'),
    ]

    operations = [
        migrations.RunPython(approve_existing_workdays, migrations.RunPython.noop),
    ]
