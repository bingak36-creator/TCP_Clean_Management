#!/usr/bin/env python3
"""Render SQL-backed ERD assets. Standard library + Pillow; no CDN or browser dependency."""
import html
import json
import os
import pathlib
import re
from PIL import Image, ImageDraw, ImageFont

ROOT = pathlib.Path(__file__).resolve().parent
SQL = ROOT.joinpath('schema.sql').read_text()
TABLES = {}
RELATIONS = set()
for match in re.finditer(r'CREATE TABLE (\w+) \(\n(.*?)\n\) ENGINE', SQL, re.S):
    name, body = match.groups()
    columns, constraints, fks = [], [], {}
    for line in body.splitlines():
        line = line.strip().rstrip(',')
        column = re.match(r'([a-z][a-z_0-9]*) (.+)', line)
        if column:
            col, definition = column.groups()
            datatype = re.split(r' NOT NULL| NULL| GENERATED| DEFAULT', definition)[0]
            columns.append({'name': col, 'type': datatype, 'nullable': 'NOT NULL' not in definition and col != 'id', 'definition': definition})
        else:
            constraints.append(line)
        fk = re.search(r'FOREIGN KEY \((\w+)\) REFERENCES (\w+)\(id\)', line)
        if fk:
            column, parent = fk.groups()
            fks[column] = parent
            RELATIONS.add((parent, name))
    for col in columns:
        col['key'] = 'PK' if col['name'] == 'id' else 'FK' if col['name'] in fks else ''
    TABLES[name] = {'columns': columns, 'constraints': constraints, 'fks': fks}

# Positions, short descriptions and representative fields for the overview.
META = {
    'users': (40,130,'계정 · 역할 · 비밀번호 해시','access',['id','username','password_hash','role','is_active']),
    'zone_permissions': (450,130,'사용자 ↔ 관리 구역','access',['id','user_id','zone_id','created_at']),
    'zones': (860,130,'시설 · 위치 · 운영 상태','facility',['id','name','zone_type','latitude','longitude']),
    'sensors': (1270,130,'설치 장치 · 수신 상태','measure',['id','zone_id','device_key','sensor_type','last_seen_at']),
    'user_devices': (40,500,'NEW · 사용자별 앱 설치 / 푸시 토큰','access',['id','user_id','installation_id','fcm_token','is_active']),
    'action_logs': (450,500,'현장 메모 · 해결 조치 이력','response',['id','alert_id','admin_id','action_type','request_key']),
    'alerts': (860,500,'이상 감지 사건 · 최초 판단 근거','response',['id','zone_id','trigger_reading_id','status','evidence','detector_version']),
    'sensor_metrics': (1270,500,'NEW · 측정 항목 / 단위 / 임계치','measure',['id','sensor_id','metric_code','unit_code','pleasant_threshold','needs_ventilation_threshold']),
    'notification_deliveries': (40,870,'NEW · 기기별 발송 / 실패 / 재시도','response',['id','alert_id','user_device_id','status','attempt_count','next_attempt_at']),
    'sensor_data_raw': (860,870,'항목별 측정값 · 재전송 중복 방지','measure',['id','metric_id','sample_key','measured_value','measured_at','received_at']),
    'sensor_data_aggregated': (1270,870,'시간 / 일 집계 · 표본 수 / 합계','measure',['id','metric_id','granularity','bucket_start','sample_count','sum_value'])
}
EDGES = [
 ('users','zone_permissions',[(370,220),(450,220)],(390,203),(422,203),False),
 ('zones','zone_permissions',[(860,220),(780,220)],(840,203),(808,203),False),
 ('zones','sensors',[(1190,220),(1270,220)],(1210,203),(1240,203),False),
 ('users','user_devices',[(205,400),(205,500)],(226,421),(233,480),False),
 ('zones','alerts',[(1025,400),(1025,500)],(1047,421),(1054,480),False),
 ('sensors','sensor_metrics',[(1435,400),(1435,500)],(1457,421),(1464,480),False),
 ('users','action_logs',[(370,315),(410,315),(410,620),(450,620)],(390,295),(422,646),False),
 ('alerts','action_logs',[(860,620),(780,620)],(840,602),(808,602),False),
 ('sensor_metrics','sensor_data_raw',[(1270,650),(1230,650),(1230,950),(1190,950)],(1250,630),(1204,930),False),
 ('sensor_metrics','sensor_data_aggregated',[(1435,770),(1435,870)],(1457,791),(1464,850),False),
 ('user_devices','notification_deliveries',[(205,770),(205,870)],(226,791),(233,850),False),
 ('alerts','notification_deliveries',[(860,715),(810,715),(810,820),(410,820),(410,1000),(370,1000)],(838,695),(395,980),False),
 ('sensor_data_raw','alerts',[(1025,870),(1025,770)],(1060,850),(1054,793),True),
]
assert set(META) == set(TABLES), 'SQL tables and visual metadata differ'
assert {(a,b) for a,b,*_ in EDGES} == RELATIONS, 'Missing or extra visual relationship'
assert len(EDGES) == len(RELATIONS) == 13
for name, meta in META.items():
    available = {c['name'] for c in TABLES[name]['columns']}
    assert set(meta[4]) <= available, f'Invalid overview column in {name}'

W,H,S = 1640,1200,2
INK, MUTED, BORDER, LINE = '#142231','#435568','#9BAABD','#526B83'
COLORS = {'access':'#E9F3EF','facility':'#EAF0F7','measure':'#E9F1FC','response':'#FBF0DE'}
font_candidates = [os.environ.get('ERD_FONT',''), '/System/Library/Fonts/AppleSDGothicNeo.ttc', '/usr/share/fonts/opentype/noto/NotoSansCJK-Regular.ttc', '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf']
font_path = next((p for p in font_candidates if p and pathlib.Path(p).exists()), None)
if font_path is None:
    raise RuntimeError('Set ERD_FONT to a font file supporting Korean.')
image = Image.new('RGB',(W*S,H*S),'white')
draw = ImageDraw.Draw(image)
svg = [f'<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}" role="img" aria-labelledby="erd-title erd-desc">', '<title id="erd-title">TCP Clean Management ERD v2</title>', '<desc id="erd-desc">제안 스키마: 11개 테이블, 13개 외래 키 관계. 전체 컬럼은 HTML 상세 보기와 SQL 참조.</desc>', '<rect width="100%" height="100%" fill="#FFFFFF"/>']

def font(size): return ImageFont.truetype(font_path,round(size*S))
def scale(items): return tuple(round(v*S) for v in items)
def text(x,y,value,size=19,color=INK,anchor='start'):
    width=draw.textlength(value,font=font(size))/S
    dx=x if anchor=='start' else x-width/2 if anchor=='middle' else x-width
    draw.text((round(dx*S),round(y*S)),value,font=font(size),fill=color,anchor='lt')
    svg.append(f'<text x="{x}" y="{y+size*.82}" font-family="Arial, Apple SD Gothic Neo, sans-serif" font-size="{size}" font-weight="400" fill="{color}" text-anchor="{anchor}">{html.escape(value)}</text>')
    return width

def rect(x,y,w,h,fill,stroke=None,r=0):
    draw.rounded_rectangle(scale((x,y,x+w,y+h)),radius=r*S,fill=fill,outline=stroke,width=2*S)
    svg.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" fill="{fill}" stroke="{stroke or "none"}" stroke-width="1.5"/>')

def line(points,dashed=False):
    if dashed:
        for (x1,y1),(x2,y2) in zip(points,points[1:]):
            distance=((x2-x1)**2+(y2-y1)**2)**.5
            for a in range(0,round(distance),12):
                b=min(a+7,distance)
                draw.line([scale((x1+(x2-x1)*a/distance,y1+(y2-y1)*a/distance)),scale((x1+(x2-x1)*b/distance,y1+(y2-y1)*b/distance))],fill=LINE,width=2*S)
    else:
        draw.line([scale(p) for p in points],fill=LINE,width=2*S,joint='curve')
    data=' '.join(f'{x},{y}' for x,y in points)
    dash=' stroke-dasharray="7 5"' if dashed else ''
    svg.append(f'<polyline points="{data}" fill="none" stroke="{LINE}" stroke-width="2" stroke-linejoin="round"{dash}/>')

text(40,30,'TCP Clean Management · ERD v2',30)
text(40,77,'개선 설계  ·  11개 테이블 / 13개 관계  ·  PK 기본 키 / FK 외래 키  ·  1 ↔ 0..N',18,MUTED)
for parent,child,points,pl,cl,dashed in EDGES:
    line(points,dashed)
    text(*pl,'0..1' if dashed else '1',16,LINE,'middle')
    text(*cl,'0..N',16,LINE,'middle')
for name,(x,y,subtitle,group,fields) in META.items():
    svg.append(f'<g class="entity" data-table="{name}" role="button" tabindex="0" aria-label="{name} 전체 컬럼 보기">')
    rect(x,y,330,270,'#FFFFFF',BORDER,10)
    rect(x+1,y+1,328,67,COLORS[group],None,9)
    title_size=21
    while draw.textlength(name.upper(),font=font(title_size))/S > 302:
        title_size-=1
    text(x+14,y+13,name.upper(),title_size)
    text(x+14,y+43,subtitle,15,MUTED)
    colmap={c['name']:c for c in TABLES[name]['columns']}
    for i,field in enumerate(fields):
        yy=y+82+i*24
        size=17 if len(field)>24 else 18
        key=colmap[field]['key']
        available=258 if key else 300
        assert draw.textlength(field,font=font(size))/S <= available, f'Clipped field: {name}.{field}'
        text(x+16,yy,field,size)
        if key: text(x+312,yy,key,15,'#195770','end')
    text(x+16,y+245,f'전체 {len(TABLES[name]["columns"])}개 컬럼',14,MUTED)
    svg.append('</g>')
text(40,1170,'주요 컬럼 중심의 관계도 · 점선: 원본 삭제 시 NULL · 상세 화면에서 테이블 선택 가능',16,MUTED)
svg.append('</svg>')
svg_text='\n'.join(svg)
ROOT.joinpath('erd-overview.svg').write_text(svg_text)
image.save(ROOT/'erd-overview.png',optimize=True)

mmd=['%% Proposed schema v2. Full column list from schema.sql.', 'erDiagram']
for name,table in TABLES.items():
    mmd.append(f'    {name.upper()} {{')
    for c in table['columns']:
        dtype=c['type'].split('(')[0].lower()
        suffix=f' {c["key"]}' if c['key'] else ''
        comment=' "generated"' if 'GENERATED' in c['definition'] else ' "nullable"' if c['nullable'] else ''
        mmd.append(f'        {dtype} {c["name"]}{suffix}{comment}')
    mmd.append('    }')
for child,table in TABLES.items():
    for col,parent in table['fks'].items():
        nullable=next(c['nullable'] for c in table['columns'] if c['name']==col)
        mmd.append(f'    {parent.upper()} {"|o" if nullable else "||"}..o{{ {child.upper()} : "{col}"')
ROOT.joinpath('schema.mmd').write_text('\n'.join(mmd)+'\n')

payload=json.dumps(TABLES,ensure_ascii=False).replace('<','\\u003c')
page='''<!doctype html>
<html lang="ko"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>TCP Clean Management · ERD v2</title>
<style>
:root{color-scheme:light;font-family:Arial,"Apple SD Gothic Neo",sans-serif;background:#f4f6f8;color:#142231}*{box-sizing:border-box}body{margin:0}main{max-width:1700px;margin:auto;padding:28px}h1{font-size:26px;margin:0 0 8px;font-weight:600}p{margin:8px 0;color:#435568;line-height:1.6}a{color:#175883}button,select{font:inherit;background:#fff;color:#142231;border:1px solid #8b9bac;border-radius:6px;padding:9px 14px;cursor:pointer}button:hover{background:#eaf0f7}button:focus-visible,select:focus-visible,.entity:focus-visible{outline:3px solid #2367af;outline-offset:3px}.toolbar{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:20px 0 12px}.toolbar label{margin-left:auto}.diagram{background:#fff;border:1px solid #c2cbd5;border-radius:8px;overflow:auto;max-height:78vh}.diagram svg{display:block;width:100%;height:auto;max-width:none}.entity{cursor:pointer}.entity:hover>rect:first-of-type,.entity:focus>rect:first-of-type{stroke:#1c65a5;stroke-width:3}.links{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px}dialog{color:#142231;background:#fff;border:1px solid #8194a8;border-radius:12px;width:min(920px,94vw);max-height:88vh;padding:24px}dialog::backdrop{background:#17263477}.dialog-head{display:flex;justify-content:space-between;align-items:center;gap:16px}h2{font-size:22px;overflow-wrap:anywhere}h3{font-size:16px}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;border-bottom:1px solid #dce3ea;padding:10px 8px;overflow-wrap:anywhere}th{color:#435568;background:#f0f4f8}.table-wrap{overflow:auto}code{font-size:13px;overflow-wrap:anywhere}li{margin:10px 0;line-height:1.5}.badge{display:inline-block;background:#e6f1ed;color:#21573c;border-radius:4px;padding:3px 7px;font-size:13px}.info{font-size:14px}@media(max-width:600px){main{padding:16px}.toolbar label{margin-left:0}h1{font-size:22px}dialog{padding:16px}}
</style></head><body><main>
<h1>TCP Clean Management · ERD v2 <span class="badge">개선 제안</span></h1>
<p>계정과 구역 권한 → 센서별 측정과 집계 → 이상 감지·현장 조치·푸시 발송</p>
<p class="info">현재 코드의 8개 테이블을 11개로 개선한 목표 설계입니다. 테이블을 누르면 전체 컬럼과 제약을 확인할 수 있습니다.</p>
<div class="toolbar"><button id="fit" type="button">화면에 맞춤</button><button id="actual" type="button">원본 크기</button><label for="zoom">확대 <select id="zoom"><option value="fit">화면에 맞춤</option value="0.75">75%</option><option value="1">100%</option><option value="1.25">125%</option><option value="1.5">150%</option></select></label></div>
<div class="diagram" id="diagram">SVG_CONTENT</div>
<div class="links"><a href="README.md">설계 이유·이전 계획</a><a href="schema.sql">MySQL SQL</a><a href="erd-overview.png">PNG</a><a href="erd-overview.svg">SVG</a><a href="schema.mmd">Mermaid 원본</a><a href="validation.md">검증 결과</a></div>
<p class="info">신규: user_devices · sensor_metrics · notification_deliveries. 점선 참조는 원본 측정값 삭제 후에도 알림 근거를 보존합니다.</p>
</main><dialog id="detail"><div class="dialog-head"><h2 id="detail-title"></h2><button id="close" type="button">닫기</button></div><div class="table-wrap"><table><thead><tr><th>컬럼</th><th>자료형</th><th>키</th><th>NULL</th></tr></thead><tbody id="detail-rows"></tbody></table></div><h3>인덱스 · 외래 키 · CHECK</h3><ul id="detail-constraints"></ul></dialog>
<script>
const tables=TABLE_DATA;
const diagram=document.getElementById('diagram');
const graphic=diagram.querySelector('svg');
const zoom=document.getElementById('zoom');
const dialog=document.getElementById('detail');
function setZoom(value){zoom.value=value;graphic.style.width=value==='fit'?'100%':`${1640*Number(value)}px`;}
zoom.addEventListener('change',()=>setZoom(zoom.value));
document.getElementById('fit').addEventListener('click',()=>setZoom('fit'));
document.getElementById('actual').addEventListener('click',()=>setZoom('1'));
function showTable(name){const table=tables[name];document.getElementById('detail-title').textContent=name.toUpperCase();const rows=document.getElementById('detail-rows');rows.replaceChildren();for(const col of table.columns){const row=document.createElement('tr');for(const value of [col.name,col.type,col.key||'—',col.definition.includes('GENERATED')?'계산값':col.nullable?'허용':'불가']){const cell=document.createElement('td');cell.textContent=value;row.append(cell);}rows.append(row);}const constraints=document.getElementById('detail-constraints');constraints.replaceChildren();for(const value of table.constraints){const li=document.createElement('li');const code=document.createElement('code');code.textContent=value;li.append(code);constraints.append(li);}dialog.showModal();}
for(const node of diagram.querySelectorAll('[data-table]')){node.addEventListener('click',()=>showTable(node.dataset.table));node.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();showTable(node.dataset.table);}});}
document.getElementById('close').addEventListener('click',()=>dialog.close());
if(window.innerWidth<700)setZoom('0.75');
</script></body></html>'''
page=page.replace('SVG_CONTENT',svg_text.replace('role="img"','role="group"')).replace('TABLE_DATA',payload)
ROOT.joinpath('index.html').write_text(page)
print(f'Generated PNG, SVG, HTML and Mermaid: {len(TABLES)} tables / {len(RELATIONS)} foreign keys')
