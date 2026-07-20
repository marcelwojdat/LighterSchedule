from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0007_workday_note'),
    ]

    operations = [
        migrations.CreateModel(
            name='ShiftTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=80)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ['name'],
            },
        ),
        migrations.CreateModel(
            name='ShiftTemplateHours',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('weekday', models.PositiveSmallIntegerField(help_text='0=poniedziałek … 6=niedziela (jak date.weekday()).')),
                ('start_time', models.TimeField()),
                ('end_time', models.TimeField()),
                ('template', models.ForeignKey(on_delete=django.db.models.deletion.CASCADE, related_name='hours', to='core.shifttemplate')),
            ],
            options={
                'ordering': ['weekday'],
                'unique_together': {('template', 'weekday')},
            },
        ),
        migrations.AddField(
            model_name='workday',
            name='shift_template',
            field=models.ForeignKey(
                blank=True,
                null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='workdays',
                to='core.shifttemplate',
            ),
        ),
    ]
