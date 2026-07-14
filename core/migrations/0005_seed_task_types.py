from django.db import migrations


def seed_task_types(apps, schema_editor):
    TaskType = apps.get_model('core', 'TaskType')
    for name in ['Kasa', 'Magazyn', 'Obsługa']:
        TaskType.objects.get_or_create(name=name)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0004_swaprequest_created_at_swaprequest_is_rejected_and_more'),
    ]

    operations = [
        migrations.RunPython(seed_task_types, migrations.RunPython.noop),
    ]
