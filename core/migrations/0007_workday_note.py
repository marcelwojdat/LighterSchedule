from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0006_swaprequest_target_work_day_and_profiles'),
    ]

    operations = [
        migrations.AddField(
            model_name='workday',
            name='note',
            field=models.CharField(
                blank=True,
                default='',
                help_text='Opcjonalna notatka pracownika (np. wcześniejsze wyjście).',
                max_length=500,
            ),
        ),
    ]
