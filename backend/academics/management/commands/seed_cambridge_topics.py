import json
from pathlib import Path

from django.core.management.base import BaseCommand, CommandError
from django.db import transaction

from academics.cambridge import TopicsFormatError, js_to_json_text, parse_catalog
from academics.models import SEEDED_LEVELS, Level, Subject, Topic

DEFAULT_PATH = Path(__file__).resolve().parents[2] / 'data' / 'cambridge_topics.json'


class Command(BaseCommand):
    help = (
        'Loads the Cambridge subject catalog and topic lists from '
        'academics/data/cambridge_topics.json. Idempotent: a second run '
        'creates nothing new. Never deletes a subject or topic missing from '
        'the file (lesson plans may point at it); it reports them instead.'
    )

    def add_arguments(self, parser):
        parser.add_argument('--file', type=Path, default=DEFAULT_PATH, help='JSON file to load.')
        parser.add_argument(
            '--from-js',
            type=Path,
            help='Convert this topics.js (window.TOPICS = {...}) into --file first, then load it.',
        )

    def handle(self, *args, **options):
        path = options['file']
        if options['from_js']:
            self._convert(options['from_js'], path)

        if not path.exists():
            raise CommandError(
                f'{path} not found. Create it from topics.js with: '
                'uv run python manage.py seed_cambridge_topics --from-js /path/to/topics.js'
            )
        try:
            data = json.loads(path.read_text(encoding='utf-8'))
            catalog = parse_catalog(data)
        except json.JSONDecodeError as exc:
            raise CommandError(f'{path} is not valid JSON: {exc}') from exc
        except TopicsFormatError as exc:
            raise CommandError(str(exc)) from exc

        with transaction.atomic():
            stats = self._load(catalog)

        self.stdout.write(
            self.style.SUCCESS(
                f"Cambridge topics: {stats['subjects_created']} subjects created, "
                f"{stats['subjects_updated']} updated; {stats['topics_created']} topics created, "
                f"{stats['topics_updated']} updated, {stats['topics_unchanged']} unchanged."
            )
        )
        for level, count in stats['by_level'].items():
            self.stdout.write(f'  {level}: {count} subjects')
        if stats['duplicates']:
            self.stdout.write(self.style.WARNING(f"  Skipped {stats['duplicates']} topics listed twice in a chapter."))
        if stats['stale']:
            self.stdout.write(
                self.style.WARNING(f"  {stats['stale']} topics in the database are no longer in the file (kept).")
            )

    def _convert(self, js_path, json_path):
        if not js_path.exists():
            raise CommandError(f'{js_path} not found.')
        try:
            text = js_to_json_text(js_path.read_text(encoding='utf-8'))
        except TopicsFormatError as exc:
            raise CommandError(str(exc)) from exc
        json_path.parent.mkdir(parents=True, exist_ok=True)
        json_path.write_text(text, encoding='utf-8')
        self.stdout.write(f'Wrote {json_path}')

    def _levels(self):
        levels = {}
        for order, (name, year_groups) in enumerate(SEEDED_LEVELS, start=1):
            level, _ = Level.objects.get_or_create(name=name, defaults={'order': order, 'year_groups': year_groups})
            levels[name] = level
        return levels

    def _load(self, catalog):
        levels = self._levels()
        stats = {
            'subjects_created': 0,
            'subjects_updated': 0,
            'topics_created': 0,
            'topics_updated': 0,
            'topics_unchanged': 0,
            'duplicates': 0,
            'stale': 0,
            'by_level': {name: 0 for name in levels},
        }
        for row in catalog:
            subject, created = Subject.objects.get_or_create(
                level=levels[row.level], name=row.name, defaults={'code': row.code, 'has_paper': row.has_paper}
            )
            if created:
                stats['subjects_created'] += 1
            elif (subject.code, subject.has_paper) != (row.code, row.has_paper):
                subject.code, subject.has_paper = row.code, row.has_paper
                subject.save(update_fields=['code', 'has_paper'])
                stats['subjects_updated'] += 1
            stats['by_level'][row.level] += 1
            stats['duplicates'] += row.duplicates_skipped

            existing = {(t.chapter, t.name): t for t in subject.topics.all()}
            for topic_row in row.topics:
                wanted = {
                    'number': topic_row.number,
                    'extended_only': topic_row.extended_only,
                    'order': topic_row.order,
                }
                topic = existing.pop((topic_row.chapter, topic_row.name), None)
                if topic is None:
                    Topic.objects.create(subject=subject, chapter=topic_row.chapter, name=topic_row.name, **wanted)
                    stats['topics_created'] += 1
                elif any(getattr(topic, k) != v for k, v in wanted.items()):
                    for k, v in wanted.items():
                        setattr(topic, k, v)
                    topic.save(update_fields=list(wanted))
                    stats['topics_updated'] += 1
                else:
                    stats['topics_unchanged'] += 1
            stats['stale'] += len(existing)
        return stats
