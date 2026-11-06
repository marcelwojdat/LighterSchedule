"""Creates the database cache table that holds login throttling and lockout counters (settings.CACHES)."""
from django.core.management import call_command
from django.db import migrations


def create_cache_table(apps, schema_editor):
    # Idempotent, and a no-op when CACHES does not use the database backend (e.g. in tests).
    call_command('createcachetable', database=schema_editor.connection.alias, verbosity=0)


class Migration(migrations.Migration):

    dependencies = [
        ('core', '0001_initial'),
    ]

    operations = [
        migrations.RunPython(create_cache_table, migrations.RunPython.noop),
    ]
