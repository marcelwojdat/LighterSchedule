from django.db import migrations, models


DEFAULT_REASONS = [
    (10, 'Za dużo osób'),
    (20, 'Inna zmiana'),
    (30, 'Brak potrzeby w tym dniu'),
    (40, 'Proszę wybrać inne godziny'),
]


def seed_rejection_reasons(apps, schema_editor):
    RejectionReasonTemplate = apps.get_model('core', 'RejectionReasonTemplate')
    for sort_order, text in DEFAULT_REASONS:
        RejectionReasonTemplate.objects.get_or_create(
            text=text,
            defaults={'sort_order': sort_order, 'is_active': True},
        )


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0010_schedulesettings'),
    ]

    operations = [
        migrations.CreateModel(
            name='RejectionReasonTemplate',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('text', models.CharField(max_length=255, unique=True)),
                ('sort_order', models.PositiveSmallIntegerField(default=100)),
                ('is_active', models.BooleanField(default=True)),
                ('last_used_at', models.DateTimeField(blank=True, null=True)),
            ],
            options={
                'verbose_name': 'Szablon powodu odrzucenia',
                'verbose_name_plural': 'Szablony powodów odrzucenia',
                'ordering': ['sort_order', 'text'],
            },
        ),
        migrations.RunPython(seed_rejection_reasons, migrations.RunPython.noop),
    ]
