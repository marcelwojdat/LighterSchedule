from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0009_shifttemplate_max_slots'),
    ]

    operations = [
        migrations.CreateModel(
            name='ScheduleSettings',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('declaration_deadline', models.DateField(
                    blank=True,
                    help_text='Pracownicy mogą składać i edytować deklaracje do tego dnia włącznie. Puste = bez limitu.',
                    null=True,
                )),
                ('updated_at', models.DateTimeField(auto_now=True)),
            ],
            options={
                'verbose_name': 'Ustawienia grafiku',
                'verbose_name_plural': 'Ustawienia grafiku',
            },
        ),
    ]
