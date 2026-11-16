from django.db import migrations, models

# Kept here rather than imported from academics.models: a migration must
# keep producing the same rows even if the model constant changes later.
LEVELS = [
    ('Primary (Year 6)', 1, [6]),
    ('Lower Secondary (Years 7 to 9)', 2, [7, 8, 9]),
    ('IGCSE', 3, [10, 11]),
    ('A Level', 4, [12, 13]),
]


def seed_levels(apps, schema_editor):
    Level = apps.get_model('academics', 'Level')
    for name, order, year_groups in LEVELS:
        Level.objects.get_or_create(name=name, defaults={'order': order, 'year_groups': year_groups})


def unseed_levels(apps, schema_editor):
    Level = apps.get_model('academics', 'Level')
    Level.objects.filter(name__in=[name for name, _order, _groups in LEVELS]).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0005_lesson_plan'),
    ]

    operations = [
        migrations.CreateModel(
            name='Level',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('name', models.CharField(max_length=100, unique=True)),
                ('order', models.PositiveSmallIntegerField(default=0)),
                ('year_groups', models.JSONField(blank=True, default=list)),
                ('is_active', models.BooleanField(default=True)),
            ],
            options={
                'ordering': ['order', 'name'],
            },
        ),
        migrations.RunPython(seed_levels, unseed_levels),
    ]
