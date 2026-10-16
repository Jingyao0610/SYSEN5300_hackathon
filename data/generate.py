"""Generate explicitly SYNTHETIC dispatch data; Python standard library only."""
import argparse
import csv
from datetime import datetime, timedelta
from pathlib import Path
import random
from zoneinfo import ZoneInfo

COLUMNS = ['incident_id', 'zone', 'priority', 'dispatched_at', 'on_scene_at']
SEED = 5300
NY = ZoneInfo('America/New_York')

def regular():
    rng = random.Random(SEED)
    stable, shifted = [], []
    for day in range(30):
        for zone in ('A', 'B'):
            for priority in ('P1', 'P2'):
                for i in range(100):
                    dispatched = datetime(2026, 9, 1, 8, tzinfo=NY) + timedelta(days=day, seconds=rng.randrange(12*3600))
                    u, ontime, late = rng.random(), rng.randint(60, 600), rng.randint(601, 1800)
                    row = dict(zip(COLUMNS, [f'SYN-{day+1:02}-{zone}-{priority}-{i:03}', zone, priority, dispatched.isoformat(), '']))
                    for rows, probability in ((stable, .15), (shifted, .35 if day >= 20 and zone == 'A' and priority == 'P1' else .15)):
                        rows.append(dict(row, on_scene_at=(dispatched + timedelta(seconds=late if u < probability else ontime)).isoformat()))
    return stable, shifted

def edges():
    rows = []
    def add(id_, zone, start, end, priority='P1'):
        rows.append(dict(zip(COLUMNS, [id_, zone, priority, start, end])))
    # Deterministic groups exercise sample-size policies without random expectations.
    for zone, count, late_count in [('EDGE',100,10), ('ZERO',50,0), ('ONE',50,50), ('SHORT',50,5)]:
        for day in range(20 if zone != 'SHORT' else 19):
            for i in range(count):
                start = datetime(2026,9,1,9,tzinfo=NY)+timedelta(days=day,seconds=i)
                add(f'SYN-{zone}-{day}-{i}',zone,start.isoformat(),(start+timedelta(minutes=11 if i < late_count else 9)).isoformat())
    for zone,count in [('EDGE',49),('ZERO',1),('ONE',1),('SHORT',1),('NEW',1)]:
        for i in range(count):
            add(f'SYN-monitor-{zone}-{i}',zone,'2026-09-21T09:00:00-04:00','2026-09-21T09:11:00-04:00')
    add('SYN-equal','BOUNDARY','2026-09-21T09:00:00-04:00','2026-09-21T09:10:00-04:00')
    add('SYN-plus-second','BOUNDARY','2026-09-21T09:00:00-04:00','2026-09-21T09:10:01-04:00')
    add('SYN-midnight','BOUNDARY','2026-09-30T23:55:00-04:00','2026-10-01T00:05:00-04:00')
    add('SYN-cutoff','BOUNDARY','2026-09-21T00:00:00-04:00','2026-09-21T00:10:00-04:00')
    for id_,start,end in [
        ('SYN-missing-arrival','2026-09-21T09:00:00-04:00',''),
        ('SYN-reversed','2026-09-21T09:00:00-04:00','2026-09-21T08:59:00-04:00'),
        ('SYN-malformed','not-a-time','2026-09-21T09:10:00-04:00'),
        ('SYN-naive','2026-09-21T09:00:00','2026-09-21T09:10:00-04:00'),
        ('SYN-future','2026-10-02T09:00:00-04:00','2026-10-02T09:10:00-04:00'),
        ('SYN-missing-dispatch','','2026-09-21T09:10:00-04:00'),
        ('SYN-duplicate','2026-09-21T09:00:00-04:00','2026-09-21T09:10:00-04:00'),
        ('SYN-duplicate','2026-09-21T10:00:00-04:00','2026-09-21T10:10:00-04:00'),
        ('','2026-09-21T09:00:00-04:00','2026-09-21T09:10:00-04:00')]:
        add(id_,'EDGE',start,end)
    add('SYN-empty-zone','','2026-09-21T09:00:00-04:00','2026-09-21T09:10:00-04:00')
    add('SYN-empty-priority','EDGE','2026-09-21T09:00:00-04:00','2026-09-21T09:10:00-04:00', '')
    for i in range(100):
        add(f'SYN-current-{i}','EDGE','2026-10-01T09:00:00-04:00',f'2026-10-01T09:{11 if i < 20 else 9:02}:00-04:00')
    return rows

def generate(folder):
    folder.mkdir(parents=True,exist_ok=True)
    stable,shifted=regular()
    for name,rows in [('stable',stable),('zone_shift',shifted),('edge_cases',edges())]:
        with (folder/f'{name}.csv').open('w',newline='',encoding='utf-8') as f:
            writer=csv.DictWriter(f,fieldnames=COLUMNS,lineterminator='\n'); writer.writeheader(); writer.writerows(rows)
        print(f'{name}.csv: {len(rows)} SYNTHETIC rows')

if __name__ == '__main__':
    parser=argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output-dir',type=Path,default=Path(__file__).resolve().parent)
    generate(parser.parse_args().output_dir)
