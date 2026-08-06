from django.db import migrations


def rename_default_organization(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    Organization.objects.filter(name='LighterSchedule').update(name='ProstyGrafik')


def revert_default_organization(apps, schema_editor):
    Organization = apps.get_model('core', 'Organization')
    Organization.objects.filter(name='ProstyGrafik').update(name='LighterSchedule')


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0014_paymentsession_session_id_length'),
    ]

    operations = [
        migrations.RunPython(rename_default_organization, revert_default_organization),
    ]
