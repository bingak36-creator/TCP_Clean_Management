import test from 'node:test';
import assert from 'node:assert/strict';
import {completeCleaning,applyCleaningRecord,emptyChecklist,createChecklistCoordinator,businessDate} from '../src/domain/operations.js';

test('failed cleaning save never changes measurements, status or records',async()=>{
  const row={id:1,gas:950,status:'DANGER',temp:40,humidity:90,lastCleanedHours:5};let commits=0;
  await assert.rejects(()=>completeCleaning({save:async()=>{throw new Error('offline');},request:{zoneId:1},commit:()=>{commits++;}}),/offline/);
  assert.equal(commits,0);assert.equal(row.gas,950);assert.equal(row.status,'DANGER');
});
test('successful cleaning changes only cleaning metadata after server confirmation',async()=>{
  const row={id:1,gas:950,status:'DANGER',temp:40,humidity:90,lastCleanedHours:5};let result;
  await completeCleaning({save:async()=>({id:12,worker:'registered-user',createdAt:'2026-10-17T10:00:00Z'}),request:{zoneId:1},commit:(log,zone)=>{assert.equal(zone,1);result=applyCleaningRecord(row,log.worker);}});
  assert.equal(result.gas,950);assert.equal(result.status,'DANGER');assert.equal(result.temp,40);assert.equal(result.humidity,90);assert.equal(result.lastCleanedHours,0);assert.equal(result.cleanWorker,'registered-user');
});
test('changing to an empty zone resets every checklist item',async()=>{
  const coordinator=createChecklistCoordinator();let state;
  await coordinator.load('zone-a',async()=>[{itemKey:'floor',completed:true}],value=>state=value);assert.equal(state.floor,true);
  await coordinator.load('zone-b',async()=>[],value=>state=value);assert.deepEqual(state,emptyChecklist());
});
test('late responses from a previous zone cannot overwrite the current checklist',async()=>{
  const coordinator=createChecklistCoordinator();let state,finishOld;
  const old=coordinator.load('a',()=>new Promise(resolve=>finishOld=resolve),value=>state=value);
  await coordinator.load('b',async()=>[{itemKey:'sink',completed:true}],value=>state=value);
  finishOld([{itemKey:'floor',completed:true}]);await old;assert.equal(state.floor,false);assert.equal(state.sink,true);
});
test('leaving and re-entering the same zone invalidates old write generations',async()=>{
  const coordinator=createChecklistCoordinator();await coordinator.load('a',async()=>[],()=>{});const old=coordinator.generation();
  coordinator.cancel('a');await coordinator.load('b',async()=>[],()=>{});await coordinator.load('a',async()=>[],()=>{});
  assert.equal(coordinator.isCurrent('a',old),false);
});
test('business date follows Seoul midnight instead of UTC midnight',()=>{assert.equal(businessDate(new Date('2026-10-17T15:01:00Z')),'2026-10-18');});

test('individual and bulk checklist writes cannot overlap',async()=>{
  const c=createChecklistCoordinator();let finish,calls=0;
  await c.load('a',async()=>[],()=>{});
  const first=c.write('a',()=>new Promise(resolve=>finish=resolve),()=>{calls++;});
  await Promise.resolve();
  assert.equal(await c.write('a',async()=>{throw new Error('must not start');},()=>{}),false);
  finish({completed:true});assert.equal(await first,true);assert.equal(calls,1);
});
test('re-entering a zone waits for its pending save before fetching',async()=>{
  const c=createChecklistCoordinator();let finish,fetches=0,state;
  await c.load('a',async()=>[],value=>state=value);
  const old=c.write('a',()=>new Promise(resolve=>finish=resolve),()=>{throw new Error('stale response must not commit');});
  await Promise.resolve();c.cancel('a');
  await c.load('b',async()=>[],value=>state=value);
  const returned=c.load('a',async()=>{fetches++;return [{itemKey:'floor',completed:true}];},value=>state=value);
  assert.equal(fetches,0);finish({completed:true});await old;await returned;
  assert.equal(fetches,1);assert.equal(state.floor,true);
});
test('failed checklist write releases the scope without committing',async()=>{
  const c=createChecklistCoordinator();await c.load('a',async()=>[],()=>{});let commits=0;
  await assert.rejects(()=>c.write('a',async()=>{throw new Error('save failed');},()=>commits++),/save failed/);
  assert.equal(commits,0);assert.equal(await c.write('a',async()=>true,()=>commits++),true);assert.equal(commits,1);
});
