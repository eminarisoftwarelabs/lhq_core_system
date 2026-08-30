from django.db import migrations


def copy_forward(apps, schema_editor):
    """Copies every accounts.Subject row into the new academics.Subject
    table, preserving id (so nothing that already FKs to a Subject by id
    breaks) and tutor assignment. Runs before accounts_subject is dropped
    (accounts/migrations/0003_delete_subject depends on this migration)."""
    OldSubject = apps.get_model('accounts', 'Subject')
    NewSubject = apps.get_model('academics', 'Subject')

    NewSubject.objects.bulk_create(
        [
            NewSubject(id=old.id, name=old.name, tutor_id=old.tutor_id, is_active=True)
            for old in OldSubject.objects.all()
        ]
    )


def copy_backward(apps, schema_editor):
    OldSubject = apps.get_model('accounts', 'Subject')
    NewSubject = apps.get_model('academics', 'Subject')

    OldSubject.objects.bulk_create(
        [
            OldSubject(id=new.id, name=new.name, tutor_id=new.tutor_id)
            for new in NewSubject.objects.all()
        ]
    )
    NewSubject.objects.all().delete()


class Migration(migrations.Migration):

    dependencies = [
        ('academics', '0001_initial'),
        ('accounts', '0002_user_must_change_password'),
    ]

    operations = [
        migrations.RunPython(copy_forward, copy_backward),
    ]
