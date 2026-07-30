# Generated manually for Stripe session id length

from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0013_weekly_declaration_deadline'),
    ]

    operations = [
        migrations.AlterField(
            model_name='paymentsession',
            name='session_id',
            field=models.CharField(max_length=128, unique=True),
        ),
    ]
