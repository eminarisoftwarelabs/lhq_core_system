import io
import json
import tempfile
from pathlib import Path

from django.core.management import CommandError, call_command
from django.test import SimpleTestCase, TestCase

from academics.cambridge import TopicsFormatError, js_to_json_text, map_level, parse_catalog, parse_topics
from academics.models import LessonPlan, Level, Subject, Topic

FIXTURE = Path(__file__).parent / 'fixtures' / 'cambridge_topics_sample.json'


class MapLevelTests(SimpleTestCase):
    def test_file_level_names_map_to_the_seeded_levels(self):
        cases = {
            'Primary': 'Primary (Year 6)',
            'Primary (Year 6)': 'Primary (Year 6)',
            'Lower Secondary': 'Lower Secondary (Years 7 to 9)',
            'Lower Secondary (Years 7-9)': 'Lower Secondary (Years 7 to 9)',
            'Checkpoint': 'Lower Secondary (Years 7 to 9)',
            'IGCSE': 'IGCSE',
            'Cambridge IGCSE': 'IGCSE',
            'A Level': 'A Level',
            'A-Level': 'A Level',
            'AS & A Level': 'A Level',
            'AS and A Levels': 'A Level',
            # The Quotes & Invoices tool's own level names.
            'Year 6 · Primary Checkpoint': 'Primary (Year 6)',
            'Year 8': 'Lower Secondary (Years 7 to 9)',
            'Year 9 · Checkpoint': 'Lower Secondary (Years 7 to 9)',
            'Year 10 · IGCSE': 'IGCSE',
            'Year 11': 'IGCSE',
            'Year 12 · AS Level': 'A Level',
            'Year 13 · A Level': 'A Level',
        }
        for file_level, expected in cases.items():
            with self.subTest(file_level=file_level):
                self.assertEqual(map_level(file_level), expected)

    def test_unknown_level_maps_to_nothing(self):
        self.assertIsNone(map_level('University'))
        self.assertIsNone(map_level('Year 4'))  # no level the centre teaches


class ParseTopicsTests(SimpleTestCase):
    def test_group_marker_starts_a_chapter_for_the_plain_strings_after_it(self):
        rows, _ = parse_topics([{'group': 'Number'}, 'Counting', 'Powers', {'group': 'Geometry'}, 'Angles'], 'x')
        self.assertEqual([(r.chapter, r.name) for r in rows], [('Number', 'Counting'), ('Number', 'Powers'), ('Geometry', 'Angles')])

    def test_strings_before_any_group_have_no_chapter(self):
        rows, _ = parse_topics(['Scientific enquiry'], 'x')
        self.assertEqual(rows[0].chapter, '')

    def test_sub_entries_carry_number_and_extended_flag(self):
        rows, _ = parse_topics(
            [{'t': 'Number', 'sub': [{'n': '1.1', 't': 'Types'}, {'n': '1.17', 't': 'Growth', 'ext': True}]}], 'x'
        )
        self.assertEqual(
            [(r.chapter, r.number, r.name, r.extended_only) for r in rows],
            [('Number', '1.1', 'Types', False), ('Number', '1.17', 'Growth', True)],
        )

    def test_order_runs_across_the_whole_subject(self):
        rows, _ = parse_topics([{'group': 'A'}, 'one', {'t': 'B', 'sub': [{'n': '2', 't': 'two'}]}, 'three'], 'x')
        self.assertEqual([r.order for r in rows], [1, 2, 3])
        # A plain string after a {t, sub} chapter stays in that chapter.
        self.assertEqual(rows[2].chapter, 'B')

    def test_duplicate_in_the_same_chapter_is_kept_once_and_counted(self):
        rows, duplicates = parse_topics([{'group': 'Bio'}, 'Cells', 'Cells', {'group': 'Chem'}, 'Cells'], 'x')
        self.assertEqual([(r.chapter, r.name) for r in rows], [('Bio', 'Cells'), ('Chem', 'Cells')])
        self.assertEqual(duplicates, 1)

    def test_malformed_entries_raise_with_where_they_are(self):
        for bad in ([42], [{'what': 'x'}], [''], [{'t': 'Ch', 'sub': 'no'}], [{'t': 'Ch', 'sub': [{'n': '1'}]}]):
            with self.subTest(bad=bad), self.assertRaises(TopicsFormatError) as ctx:
                parse_topics(bad, 'IGCSE / Physics')
            self.assertIn('IGCSE / Physics', str(ctx.exception))


class ParseCatalogTests(SimpleTestCase):
    def test_fixture_parses_into_every_level(self):
        catalog = parse_catalog(json.loads(FIXTURE.read_text()))
        self.assertEqual(
            {r.level for r in catalog},
            {'Primary (Year 6)', 'Lower Secondary (Years 7 to 9)', 'IGCSE', 'A Level'},
        )

    def test_has_paper_only_for_the_igcse_core_and_extended_subjects(self):
        catalog = {(r.level, r.name): r for r in parse_catalog(json.loads(FIXTURE.read_text()))}
        self.assertTrue(catalog[('IGCSE', 'Mathematics')].has_paper)
        self.assertTrue(catalog[('IGCSE', 'Physics')].has_paper)
        self.assertFalse(catalog[('IGCSE', 'Geography')].has_paper)
        self.assertFalse(catalog[('A Level', 'Physics')].has_paper)
        self.assertFalse(catalog[('Primary (Year 6)', 'Mathematics')].has_paper)

    def test_unknown_level_names_are_all_listed(self):
        with self.assertRaises(TopicsFormatError) as ctx:
            parse_catalog({'IGCSE': {}, 'Degree': {}, 'Nursery': {}})
        self.assertIn('Degree, Nursery', str(ctx.exception))


class JsToJsonTests(SimpleTestCase):
    def test_strips_the_window_prefix_and_trailing_semicolon(self):
        text = js_to_json_text('window.TOPICS = {"IGCSE": {}};\n')
        self.assertEqual(json.loads(text), {'IGCSE': {}})

    def test_skips_comments_before_the_assignment(self):
        # The real topics.js opens with a /* ... */ header comment.
        js = '/* Topic checklists.\n   Edit with care. */\n// generated\nwindow.TOPICS = {"A Level": {}};'
        self.assertEqual(json.loads(js_to_json_text(js)), {'A Level': {}})

    def test_rejects_js_that_is_not_plain_json(self):
        with self.assertRaises(TopicsFormatError):
            js_to_json_text("window.TOPICS = {IGCSE: {}, }")


def seed(path=FIXTURE, **kwargs):
    out = io.StringIO()
    call_command('seed_cambridge_topics', file=path, stdout=out, **kwargs)
    return out.getvalue()


class SeedCambridgeTopicsCommandTests(TestCase):
    def test_loads_all_four_levels_with_chapters_numbers_and_extended_flags(self):
        seed()
        for level in Level.objects.all():
            self.assertTrue(Subject.objects.filter(level=level).exists(), level.name)

        maths = Subject.objects.get(level__name='IGCSE', name='Mathematics')
        self.assertEqual((maths.code, maths.has_paper), ('0580', True))
        rows = list(maths.topics.values_list('chapter', 'number', 'name', 'extended_only'))
        self.assertEqual(
            rows,
            [
                ('Number', '1.1', 'Types of number', False),
                ('Number', '1.17', 'Exponential growth and decay', True),
                ('Algebra and graphs', '2.1', 'Introduction to algebra', False),
                ('Algebra and graphs', '2.12', 'Differentiation', True),
            ],
        )
        primary = Subject.objects.get(level__name='Primary (Year 6)', name='Mathematics')
        self.assertEqual(list(primary.topics.values_list('chapter', flat=True)), ['Number', 'Number', 'Geometry'])

    def test_running_twice_adds_nothing(self):
        seed()
        counts = (Level.objects.count(), Subject.objects.count(), Topic.objects.count())
        output = seed()
        self.assertEqual((Level.objects.count(), Subject.objects.count(), Topic.objects.count()), counts)
        self.assertIn('0 subjects created', output)
        self.assertIn('0 topics created', output)

    def test_a_changed_file_updates_in_place_and_keeps_removed_topics(self):
        seed()
        maths = Subject.objects.get(level__name='IGCSE', name='Mathematics')
        planned = maths.topics.get(name='Differentiation')
        LessonPlan.objects.create(subject=maths, week_start='2026-10-05', topic=planned)

        data = json.loads(FIXTURE.read_text())
        number = data['IGCSE']['Mathematics']['topics'][0]['sub']
        number[0]['ext'] = True  # flag changed
        del data['IGCSE']['Mathematics']['topics'][1]  # Differentiation's chapter removed
        with tempfile.TemporaryDirectory() as tmp:
            changed = Path(tmp) / 'topics.json'
            changed.write_text(json.dumps(data))
            output = seed(changed)

        self.assertTrue(maths.topics.get(name='Types of number').extended_only)
        self.assertTrue(Topic.objects.filter(pk=planned.pk).exists())
        self.assertIn('2 topics in the database are no longer in the file (kept)', output)

    def test_existing_subject_from_seed_dummy_data_is_reused_not_duplicated(self):
        Subject.objects.create(level=Level.objects.get(name='IGCSE'), name='Physics')
        seed()
        self.assertEqual(Subject.objects.filter(level__name='IGCSE', name='Physics').count(), 1)
        self.assertEqual(Subject.objects.get(level__name='IGCSE', name='Physics').code, '0625')

    def test_missing_file_explains_how_to_create_it(self):
        with self.assertRaises(CommandError) as ctx:
            seed(Path('/nonexistent/topics.json'))
        self.assertIn('--from-js', str(ctx.exception))

    def test_bad_file_fails_without_writing_anything(self):
        with tempfile.TemporaryDirectory() as tmp:
            bad = Path(tmp) / 'topics.json'
            bad.write_text(json.dumps({'IGCSE': {'Physics': {'topics': [42]}}}))
            with self.assertRaises(CommandError):
                seed(bad)
        self.assertFalse(Subject.objects.exists())

    def test_from_js_converts_then_loads(self):
        with tempfile.TemporaryDirectory() as tmp:
            js = Path(tmp) / 'topics.js'
            js.write_text('window.TOPICS = ' + FIXTURE.read_text() + ';')
            out_json = Path(tmp) / 'out' / 'cambridge_topics.json'
            seed(out_json, from_js=js)
            self.assertEqual(json.loads(out_json.read_text()), json.loads(FIXTURE.read_text()))
        self.assertTrue(Subject.objects.filter(level__name='A Level', name='Physics').exists())
