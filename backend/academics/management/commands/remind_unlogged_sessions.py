from django.core.management.base import BaseCommand

from academics.scheduling import reminders


class Command(BaseCommand):
    help = (
        'Notify each tutor about the sessions they have not logged yet and still can. '
        'Run at the end of the day. Safe to run more than once: an identical reminder is not repeated the same day.'
    )

    def handle(self, *args, **options):
        sent = reminders.remind_unlogged_sessions()
        self.stdout.write(self.style.SUCCESS(f'Reminded {sent} tutor(s).'))
