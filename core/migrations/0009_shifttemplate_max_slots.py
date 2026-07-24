from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0008_shifttemplate'),
    ]

    operations = [
        migrations.AddField(
            model_name='shifttemplate',
            name='max_slots',
            field=models.PositiveSmallIntegerField(
                default=1,
                help_text='Maksymalna liczba zatwierdzonych osób na tę zmianę w jednym dniu.',
            ),
        ),
    ]
