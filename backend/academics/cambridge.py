"""Parsing Wanangwa's Cambridge topics file into rows for the catalog.

The file (academics/data/cambridge_topics.json) is topics.js with its
`window.TOPICS =` prefix stripped:

    { level: { subject: { code, years, skills?, topics: [...] } } }

`topics` mixes three kinds of entry, read in order:
    {"group": "Number"}               starts a new chapter
    "Counting and sequences"          a topic in the current chapter
    {"t": "Number", "sub": [...]}     a chapter with numbered topics, each
                                      {"n": "1.17", "t": "...", "ext": true}
                                      (ext = Extended only)

Pure functions only (no database), so the format rules are tested on
their own; the management command does the writing."""

import json
import re
from dataclasses import dataclass, field

# (level, subject) pairs with separate Core and Extended papers.
# Compared case-insensitively.
SUBJECTS_WITH_PAPER = {
    ('IGCSE', 'mathematics'),
    ('IGCSE', 'biology'),
    ('IGCSE', 'chemistry'),
    ('IGCSE', 'physics'),
    ('IGCSE', 'combined science'),
}

# Ordered: the first pattern that matches a file level key wins. "lower
# secondary" must be tested before a bare "secondary" could ever match.
LEVEL_PATTERNS = [
    (re.compile(r'\bprimary\b|\byear\s*6\b', re.I), 'Primary (Year 6)'),
    (re.compile(r'lower\s*secondary|checkpoint|years?\s*7', re.I), 'Lower Secondary (Years 7 to 9)'),
    (re.compile(r'igcse', re.I), 'IGCSE'),
    (re.compile(r'\b(as\s*(and|&)\s*)?a[\s-]*levels?\b|\bas[\s-]*levels?\b', re.I), 'A Level'),
]

# Leading /* block */ and // line comments, then the assignment. The real
# topics.js opens with a header comment.
JS_PREFIX = re.compile(r'^(?:\s*(?:/\*.*?\*/|//[^\n]*))*\s*window\.TOPICS\s*=\s*', re.S)


class TopicsFormatError(ValueError):
    pass


@dataclass
class TopicRow:
    chapter: str
    number: str
    name: str
    extended_only: bool
    order: int


@dataclass
class SubjectRow:
    level: str
    name: str
    code: str
    has_paper: bool
    topics: list = field(default_factory=list)
    duplicates_skipped: int = 0


def js_to_json_text(js_text):
    """topics.js -> JSON text: strips `window.TOPICS =` and a trailing `;`."""
    body = JS_PREFIX.sub('', js_text, count=1).strip()
    if body.endswith(';'):
        body = body[:-1].rstrip()
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise TopicsFormatError(f'topics.js is not plain JSON after the prefix: {exc}') from exc
    return json.dumps(data, indent=2, ensure_ascii=False) + '\n'


# Fallback when no name pattern matches: the school year in the key, as in
# the Quotes & Invoices tool's own level names ("Year 8", "Year 11").
LEVEL_BY_YEAR = {
    6: 'Primary (Year 6)',
    7: 'Lower Secondary (Years 7 to 9)',
    8: 'Lower Secondary (Years 7 to 9)',
    9: 'Lower Secondary (Years 7 to 9)',
    10: 'IGCSE',
    11: 'IGCSE',
    12: 'A Level',
    13: 'A Level',
}
YEAR_IN_KEY = re.compile(r'\byears?\s*(\d{1,2})\b', re.I)


def map_level(file_level):
    for pattern, level_name in LEVEL_PATTERNS:
        if pattern.search(file_level):
            return level_name
    year = YEAR_IN_KEY.search(file_level)
    if year:
        return LEVEL_BY_YEAR.get(int(year.group(1)))
    return None


def _text(value, where):
    if not isinstance(value, str) or not value.strip():
        raise TopicsFormatError(f'{where}: expected a non-empty string, got {value!r}.')
    return value.strip()


def parse_topics(entries, where):
    """One subject's `topics` array -> (TopicRow list, duplicates skipped).
    A topic listed twice in the same chapter is kept once (first wins)."""
    if not isinstance(entries, list):
        raise TopicsFormatError(f'{where}: "topics" must be a list.')
    rows = []
    seen = set()
    duplicates = 0
    chapter = ''

    def add(chap, number, name, ext):
        nonlocal duplicates
        key = (chap, name)
        if key in seen:
            duplicates += 1
            return
        seen.add(key)
        rows.append(TopicRow(chapter=chap, number=number, name=name, extended_only=ext, order=len(rows) + 1))

    for i, entry in enumerate(entries):
        at = f'{where}, topics[{i}]'
        if isinstance(entry, str):
            add(chapter, '', _text(entry, at), False)
        elif isinstance(entry, dict) and 'group' in entry:
            chapter = _text(entry['group'], at)
        elif isinstance(entry, dict) and 'sub' in entry:
            chapter = _text(entry.get('t'), f'{at}.t')
            if not isinstance(entry['sub'], list):
                raise TopicsFormatError(f'{at}: "sub" must be a list.')
            for j, sub in enumerate(entry['sub']):
                sub_at = f'{at}.sub[{j}]'
                if isinstance(sub, str):
                    add(chapter, '', _text(sub, sub_at), False)
                elif isinstance(sub, dict):
                    number = sub.get('n', '')
                    add(
                        chapter,
                        str(number).strip() if number is not None else '',
                        _text(sub.get('t'), f'{sub_at}.t'),
                        bool(sub.get('ext', False)),
                    )
                else:
                    raise TopicsFormatError(f'{sub_at}: expected a string or {{n, t, ext}}, got {sub!r}.')
        else:
            raise TopicsFormatError(f'{at}: unrecognised entry {entry!r}.')
    return rows, duplicates


def parse_catalog(data):
    """Whole file -> list of SubjectRow. Raises TopicsFormatError naming
    the first problem, including any level key that maps to no Level."""
    if not isinstance(data, dict) or not data:
        raise TopicsFormatError('Expected an object of levels at the top of the file.')
    unknown = [key for key in data if map_level(key) is None]
    if unknown:
        raise TopicsFormatError(f'No Level matches these level names in the file: {", ".join(unknown)}.')

    subjects = []
    for file_level, by_subject in data.items():
        level = map_level(file_level)
        if not isinstance(by_subject, dict):
            raise TopicsFormatError(f'{file_level}: expected an object of subjects.')
        for subject_name, body in by_subject.items():
            where = f'{file_level} / {subject_name}'
            name = _text(subject_name, where)
            if not isinstance(body, dict):
                raise TopicsFormatError(f'{where}: expected an object with "topics".')
            topics, duplicates = parse_topics(body.get('topics', []), where)
            code = body.get('code') or ''
            subjects.append(
                SubjectRow(
                    level=level,
                    name=name,
                    code=str(code).strip(),
                    has_paper=(level, name.lower()) in SUBJECTS_WITH_PAPER,
                    topics=topics,
                    duplicates_skipped=duplicates,
                )
            )
    return subjects
