from datetime import timedelta

from django.core.management.base import BaseCommand

from academics.scheduling import generation, times


class Command(BaseCommand):
    help = (
        'Create the scheduled sessions of every active student subject from its weekly slots, '
        'up to N weeks ahead (default 4). Idempotent: safe to run daily.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--weeks', type=int, default=4, help='How many weeks ahead to generate (default 4).')

    def handle(self, *args, **options):
        weeks = max(1, options['weeks'])
        until = times.today() + timedelta(weeks=weeks)
        created = generation.generate_sessions(until=until)
        self.stdout.write(self.style.SUCCESS(f'Created {created} session(s) up to {until.isoformat()}.'))
