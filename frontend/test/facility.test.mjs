import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {facilityPayload,SENSOR_TYPES} from '../src/domain/facility.js';
import {buildRestroomsFromBackend,filterZoneRecords} from '../src/domain/monitoring.js';
test('sensor options match the actual server enum, not measurement codes',async()=>{
  const source=await readFile(new URL('../../backend/src/main/java/com/tcp/cleanmanagement/enums/SensorType.java',import.meta.url),'utf8');
  const values=source.match(/enum SensorType \{([^}]+)\}/)[1].split(',').map(value=>value.trim());
  assert.deepEqual(SENSOR_TYPES.map(item=>item.value).sort(),values.sort());
});
test('blank coordinates stay absent and zero remains real',()=>{
  assert.equal(facilityPayload({name:'a',latitude:'',longitude:''}).zone.latitude,null);
  assert.equal(facilityPayload({name:'a',latitude:0,longitude:0}).zone.latitude,0);
});
test('incomplete, out-of-range and partially numeric coordinates fail',()=>{
  for(const coords of [{latitude:1},{latitude:91,longitude:0},{latitude:0,longitude:181},{latitude:'37garbage',longitude:127}])
    assert.throws(()=>facilityPayload({name:'a',...coords}));
});
test('a zone with no cleaning history never invents a recent cleaning or assigned worker',()=>{
  const row=buildRestroomsFromBackend([{zoneId:1,name:'test',status:'NO_DATA',lastCleanedWorker:'past worker'}])[0];
  assert.equal(row.lastCleanedHours,null);assert.equal(row.cleanWorker,'담당자 미지정');assert.equal(row.assignedWorkerId,null);
});
test('valid server cleaning timestamps determine actual elapsed hours',()=>{
  const time=new Date(Date.now()-3*3600000).toISOString();
  assert.equal(buildRestroomsFromBackend([{zoneId:1,name:'test',lastCleanedAt:time}])[0].lastCleanedHours,3);
});

test('facility metadata is explicit and blank edit coordinates remain absent',()=>{
  const payload=facilityPayload({name:'a',floor:'B1F',gender:'여',latitude:'',longitude:''});
  assert.equal(payload.zone.floor,'B1F');assert.equal(payload.zone.gender,'여');assert.equal(payload.zone.latitude,null);
  const row=buildRestroomsFromBackend([{zoneId:1,name:'여의도',floor:'B1F',gender:'여'}])[0];
  assert.equal(row.floor,'B1F');assert.equal(row.gender,'여');
});
test('unknown facilities never acquire a fake floor, gender or address',()=>{
  const row=buildRestroomsFromBackend([{zoneId:1,name:'여의도 센터'}])[0];
  assert.equal(row.floor,'미등록');assert.equal(row.gender,'미등록');assert.equal(row.address,'');
});
test('zone record authorization uses immutable IDs even when names match',()=>{
  const rows=[{zoneId:1,restroomName:'same'},{zoneId:2,restroomName:'same'},{restroomName:'same'}];
  assert.deepEqual(filterZoneRecords(rows,id=>id===2),[rows[1]]);
});

test('facility summaries cannot borrow another zone device or cleaning time by name',()=>{
  const rows=buildRestroomsFromBackend([{zoneId:2,name:'same AA:BB:CC:DD:EE:FF'}],
    [{zoneId:1,macAddress:'AA:BB:CC:DD:EE:FF',temperatureC:99},{zoneId:2,macAddress:'11:22:33:44:55:66',temperatureC:22}],[],
    [{zoneId:1,restroomName:'same AA:BB:CC:DD:EE:FF',createdAt:new Date().toISOString()}]);
  assert.equal(rows[0].temp,22);assert.equal(rows[0].macAddress,'11:22:33:44:55:66');assert.equal(rows[0].lastCleanedHours,null);
});
test('legacy basement labels keep their actual floor when metadata is absent',()=>{
  assert.equal(buildRestroomsFromBackend([{zoneId:1,name:'본관 B1F 화장실'}])[0].floor,'B1F');
  assert.equal(buildRestroomsFromBackend([{zoneId:1,name:'본관 지하 2층 화장실'}])[0].floor,'B2F');
});
