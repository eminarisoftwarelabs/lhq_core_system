"""Reshape Subject into a level-scoped catalog entry and Topic into a
syllabus line (Feature 1: tutors and subjects).

Clean start by design: every pre-v2 subject, topic and tutor link was test
data, so there is no data migration. Rather than silently deleting rows,
this refuses to run while old subjects exist and says how to reset."""

from django.db import migrations, models
import django.db.models.deletion

RESET_HELP = (
    'This database still has subjects from before the v2 subject catalog. '
    'All of that is test data and is not migrated. Reset your local database '
    '(see the task-1-tutors-subjects PR: delete db.sqlite3 or drop and recreate '
    'the Postgres database), then run migrate, seed_cambridge_topics and '
    'seed_dummy_data again.'
)


def refuse_if_old_subjects(apps, schema_editor):
    Subject = apps.get_model('academics', 'Subject')
    if Subject.objects.exists():
        raise RuntimeError(RESET_HELP)


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0006_level'),
    ]

    operations = [
        migrations.RunPython(refuse_if_old_subjects, migrations.RunPython.noop),
        migrations.RemoveField(model_name='subject', name='tutor'),
        migrations.AddField(
            model_name='subject',
            name='level',
            field=models.ForeignKey(
                null=True, on_delete=django.db.models.deletion.PROTECT, related_name='subjects', to='academics.level'
            ),
        ),
        migrations.AlterField(
            model_name='subject',
            name='level',
            field=models.ForeignKey(
                on_delete=django.db.models.deletion.PROTECT, related_name='subjects', to='academics.level'
            ),
        ),
        migrations.AddField(model_name='subject', name='code', field=models.CharField(blank=True, max_length=20)),
        migrations.AddField(model_name='subject', name='has_paper', field=models.BooleanField(default=False)),
        migrations.AlterModelOptions(name='subject', options={'ordering': ['level__order', 'name']}),
        migrations.AddConstraint(
            model_name='subject',
            constraint=models.UniqueConstraint(fields=('level', 'name'), name='unique_subject_name_per_level'),
        ),
        migrations.AddField(model_name='topic', name='chapter', field=models.CharField(blank=True, max_length=150)),
        migrations.AddField(model_name='topic', name='number', field=models.CharField(blank=True, max_length=20)),
        migrations.AddField(model_name='topic', name='extended_only', field=models.BooleanField(default=False)),
        migrations.AddField(model_name='topic', name='order', field=models.PositiveIntegerField(default=0)),
        migrations.AlterField(model_name='topic', name='name', field=models.CharField(max_length=255)),
        migrations.AlterModelOptions(name='topic', options={'ordering': ['subject', 'order', 'id']}),
        migrations.AddConstraint(
            model_name='topic',
            constraint=models.UniqueConstraint(
                fields=('subject', 'chapter', 'name'), name='unique_topic_per_subject_chapter'
            ),
        ),
    ]
