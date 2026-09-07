from django.db import migrations

SCHOOL_NAMES = [
    'Bishop Mackenzie International School',
    'St Andrews International High School',
    'Kamuzu Academy',
    'International School of Lilongwe',
    'Marist International School',
    'Robert Laws Secondary School',
]


def seed_forward(apps, schema_editor):
    School = apps.get_model('academics', 'School')
    School.objects.bulk_create([School(name=name) for name in SCHOOL_NAMES])


def seed_backward(apps, schema_editor):
    School = apps.get_model('academics', 'School')
    School.objects.filter(name__in=SCHOOL_NAMES).delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0003_school'),
    ]

    operations = [
        migrations.RunPython(seed_forward, seed_backward),
    ]
