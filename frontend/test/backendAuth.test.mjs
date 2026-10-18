import { after, before, beforeEach, test } from 'node:test';
import assert from 'node:assert/strict';

let api;
let responseStatus=200;
const storage = new Map();
const requests = [];
const originalFetch = globalThis.fetch;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis,"localStorage");
before(async () => {
  Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:key=>storage.get(key)??null}});
  globalThis.fetch = async (url, options) => {
    requests.push({ url, ...options });
    return { ok: responseStatus<400, status: responseStatus, json: async () => 42 };
  };
  api = await import('../src/api/backendApi.js');
});
beforeEach(() => { storage.clear(); requests.length = 0; responseStatus=200; });
after(async () => {
  globalThis.fetch = originalFetch;
  if (originalStorage === undefined) delete globalThis.localStorage;
  else Object.defineProperty(globalThis,'localStorage',originalStorage);
});

test('missing session never fabricates an admin credential or accepts a legacy storage key', () => {
  assert.equal(api.getAuthHeaders().Authorization, undefined);
  storage.set('token', 'legacy-admin-token');
  assert.equal(api.getAuthHeaders().Authorization, undefined);
});

for (const [name, invoke, method] of [
  ['create zone', () => api.createBackendZone({ name: 'test' }), 'POST'],
  ['delete zone', () => api.deleteBackendZone(42), 'DELETE'],
  ['toggle zone', () => api.toggleZoneActiveApi(42), 'PATCH'],
  ['update thresholds', () => api.updateZoneThresholdsApi(42, { pleasantThreshold: 100 }), 'PUT'],
  ['create sensor', () => api.createBackendSensor({ zoneId: 42, sensorType: 'GAS' }), 'POST']
]) {
  test(`${name} sends the current server session`, async () => {
    storage.set('tcp_auth_token', 'issued-session');
    await invoke();
    assert.equal(requests.length, 1);
    assert.equal(requests[0].method, method);
    assert.equal(requests[0].headers.Authorization, 'Bearer issued-session');
    assert.match(requests[0].url, /\/api\/dev\//);
  });
}

for(const [name,invoke] of [
 ['alerts',()=>api.fetchAdminAlertsApi()],['workers',()=>api.fetchWorkersApi()],['settings',()=>api.fetchSystemSettingsApi()],
 ['cleaning records',()=>api.fetchCleaningRecordsApi()],['checklists',()=>api.fetchDailyChecklistApi(42)],['device sets',()=>api.fetchDeviceSetsApi()],['upstash status',()=>api.fetchUpstashStatusApi()]
]) test(`${name} lookup failure is not disguised as empty data`,async()=>{responseStatus=503;await assert.rejects(invoke,/503/);});
test('private device metadata uses the current bearer token',async()=>{storage.set('tcp_auth_token','issued-session');await api.fetchUpstashStatusApi();assert.equal(requests[0].headers.Authorization,'Bearer issued-session');});

for(const [name,invoke] of [
 ['sensor list',()=>api.fetchSensorsApi()],['user list',()=>api.fetchUsersApi()],['device discovery',()=>api.fetchDiscoveredDevicesApi()]
]) test(name+' failure is surfaced',async()=>{responseStatus=503;await assert.rejects(invoke,/503/);});
test('alert lifecycle query and checklist batch preserve server identity',async()=>{
  storage.set('tcp_auth_token','issued-session');
  await api.fetchAdminAlertsApi('ALL');
  assert.match(requests[0].url,/status=ALL/);
  await api.batchUpdateDailyChecklistApi({zoneId:42,date:'2026-10-18',items:{floor:true},completedBy:999});
  assert.equal(JSON.parse(requests[1].body).completedBy,undefined);
  assert.equal(requests[1].headers.Authorization,'Bearer issued-session');
});

test('invalid MAC never creates a partial facility',async()=>{
  await assert.rejects(()=>api.createBackendZone({name:'bad',deviceId:'invalid'}),/MAC/);
  assert.equal(requests.length,0);
});
test('facility creation sends one atomic request with normalized identity',async()=>{
  await api.createBackendZone({name:'valid',deviceId:'aa-bb-cc-dd-ee-ff',latitude:0,longitude:0});
  assert.equal(requests.length,1);assert.match(requests[0].url,/facilities$/);
  const payload=JSON.parse(requests[0].body);
  assert.equal(payload.device.macAddress,'AA:BB:CC:DD:EE:FF');
  assert.equal(payload.zone.latitude,0);
});
test('facility editing uses one transaction endpoint',async()=>{
  await api.updateFacilityApi(42,{zone:{name:'updated'},device:null});
  assert.equal(requests.length,1);assert.equal(requests[0].method,'PUT');assert.match(requests[0].url,/facilities\/42$/);
});
