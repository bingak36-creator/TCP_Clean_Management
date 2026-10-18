import test from 'node:test';
import assert from 'node:assert/strict';
import {parseUtcDate,getKstDateString} from '../src/domain/time.js';
for(const input of ['2026-10-18T01:02:03','2026-10-18 01:02:03','2026-10-18T01:02:03Z','2026-10-18T10:02:03+09:00']) {
  test('UTC parsing preserves the same instant: '+input,()=>assert.equal(parseUtcDate(input).toISOString(),'2026-10-18T01:02:03.000Z'));
}
test('date parsing preserves null and valid Date values',()=>{assert.equal(parseUtcDate(null),null);const date=new Date('2026-10-18T01:02:03Z');assert.equal(parseUtcDate(date),date);});
test('Korean business day changes at Seoul midnight',()=>assert.equal(getKstDateString(new Date('2026-10-17T15:00:00Z')),'2026-10-18'));

test('invalid server timestamps remain unknown',()=>{for(const value of ['bad','2026-99-99',new Date(NaN),NaN])assert.equal(parseUtcDate(value),null);});
test('epoch zero is a valid timestamp',()=>assert.equal(parseUtcDate(0).toISOString(),'1970-01-01T00:00:00.000Z'));
