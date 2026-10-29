#!/usr/bin/env python3
"""Lightweight validation for agent-authored Paper Palace import files."""
import json, sys
from datetime import datetime

def date(value):
    assert isinstance(value, str) and datetime.fromisoformat(value.replace('Z', '+00:00')).tzinfo, 'Expected timezone-aware ISO datetime'

def validate(data):
    assert data['version'] == 1
    assert isinstance(data['papers'], list) and isinstance(data['edges'], list)
    date(data['updatedAt'])
    ids = set()
    for p in data['papers']:
        assert p['id'] not in ids, 'Duplicate paper ID'
        ids.add(p['id'])
        for k in ('id','arxivId','title','abstract','published','notes'): assert isinstance(p[k],str), k
        for k in ('authors','categories','tags'): assert isinstance(p[k],list) and all(isinstance(v,str) for v in p[k]), k
        assert p['status'] in ('unread','reading','read')
        date(p['addedAt']); date(p['updatedAt'])
        assert 'analysisMeta' in p
        if p['analysis'] is not None:
            a=p['analysis']; assert isinstance(a['positioning'],str)
            assert isinstance(a['tags'],list) and isinstance(a['limitations'],list)
            for k in ('motivation','coreConcept','method','experimentalSetup','results'):
                assert isinstance(a['sections'][k],list) and len(a['sections'][k])<=6
                for item in a['sections'][k]:
                    assert isinstance(item['text'],str) and len(item['text'])<=2400
                    assert isinstance(item['citations'],list)
                    for c in item['citations']: assert isinstance(c['blockId'],str) and isinstance(c['quote'],str)
    for e in data['edges']:
        assert e['source'] in ids and e['target'] in ids and e['source']!=e['target']
        assert e['origin'] in ('manual','suggested')
        for k in ('id','label','note'): assert isinstance(e[k],str)
        date(e['updatedAt'])
    assert isinstance(data['deleted'],dict)
    for value in data['deleted'].values(): date(value)

if __name__=='__main__':
    try:
        with open(sys.argv[1],encoding='utf-8') as f: validate(json.load(f))
        print('Paper Palace library structure is valid.')
    except (AssertionError,KeyError,ValueError,IndexError,OSError,TypeError) as e:
        print(f'Invalid library: {e}',file=sys.stderr); sys.exit(1)
