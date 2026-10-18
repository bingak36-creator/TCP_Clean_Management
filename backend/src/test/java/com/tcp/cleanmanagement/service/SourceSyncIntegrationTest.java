package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.DeviceSetRequest;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.LocalDateTime;
import java.util.*;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties =
        "spring.datasource.url=jdbc:h2:mem:source_sync;MODE=MySQL;DB_CLOSE_DELAY=-1")
class SourceSyncIntegrationTest {
    @Autowired Environment environment;
    @Autowired JsonMapper mapper;
    @Autowired PlatformTransactionManager transactions;
    @Autowired EntityManager em;
    @Autowired DeviceSetService sets;
    @Autowired ZoneRepository zones;
    @Autowired SensorRepository sensors;
    @Autowired SensorMetricRepository metrics;
    @Autowired SensorDataRawRepository raw;
    @Autowired AiPredictionRepository predictions;
    @Autowired AlertRepository alerts;
    @Autowired UserRepository users;
    @Autowired AuthService auth;
    @Autowired PasswordService passwords;
    private String token;
    @Autowired ActionLogRepository actions;

    @BeforeEach
    void clearIsolatedDatabase() {
        new TransactionTemplate(transactions).executeWithoutResult(status -> {
            for (String entity : List.of("DeviceCredential", "CleaningRecord", "DailyChecklist", "SystemSetting", "Worker",
                    "AiPrediction", "ActionLog", "Alert", "SensorDataRaw", "SensorDataAggregated",
                    "SensorMetric", "UpstashDevice", "DeviceSetHistory", "Sensor", "DeviceSet",
                    "ZonePermission", "AuthSession", "User", "Zone")) {
                em.createQuery("DELETE FROM " + entity).executeUpdate();
            }
        });
        users.saveAndFlush(User.builder().username("sync-session").password(passwords.encode("integration-password"))
                .role(Role.DEVELOPER).build());
        com.tcp.cleanmanagement.dto.LoginRequest login = new com.tcp.cleanmanagement.dto.LoginRequest();
        login.setUsername("sync-session"); login.setPassword("integration-password");
        token = auth.login(login).getToken();
    }

    @Test
    void storesZoneCoordinatesThresholdsActivationAndIndependentSensors() throws Exception {
        long id = json("/api/dev/zones", "POST", Map.of("name", "sync-zone", "address", "test address",
                "latitude", 35.1234, "longitude", 129.4567, "zoneType", "TOILET",
                "isOurSolution", true), 200).asLong();
        JsonNode zone = json("/api/public/zones", "GET", null, 200).get(0);
        assertEquals(id, zone.path("zoneId").asLong());
        assertEquals(35.1234, zone.path("latitude").asDouble());
        assertEquals(129.4567, zone.path("longitude").asDouble());
        assertTrue(zone.path("isActive").asBoolean());
        assertFalse(json("/api/dev/zones/" + id + "/toggle-active", "PATCH", null, 200).asBoolean());
        json("/api/dev/zones/" + id, "PUT", Map.of("pleasantThreshold", 321,
                "needsVentilationThreshold", 654), 200);
        assertEquals(321f, zones.findById(id).orElseThrow().getPleasantThreshold());
        long sensor = json("/api/dev/sensors", "POST", Map.of("zoneId", id,
                "sensorType", "TEMP_HUMID"), 200).asLong();
        assertEquals(SensorType.TEMP_HUMID, sensors.findById(sensor).orElseThrow().getSensorType());
        assertTrue(json("/api/public/zones", "GET", null, 200).isEmpty());
        assertFalse(json("/api/admin/zones", "GET", null, 200).get(0).path("isActive").asBoolean());
    }

    @Test
    void savesCleaningRecordsAndWorkerStatusAcrossRequests() throws Exception {
        long zone = zone().getId();
        long worker = json("/api/admin/workers", "POST", Map.of("name", "sync-worker", "phone", "01000000000",
                "assignedZoneId", zone, "role", "CLEANER"), 201).path("id").asLong();
        json("/api/admin/workers/" + worker + "/status", "PATCH", Map.of("status", "DISPATCHED"), 200);
        JsonNode listed = json("/api/admin/workers?status=DISPATCHED", "GET", null, 200);
        assertEquals(1, listed.size());
        assertEquals(worker, listed.get(0).path("id").asLong());
        json("/api/admin/cleaning-records", "POST", Map.of("zoneId", zone, "restroomName", "sync-zone",
                "worker", "sync-worker", "type", "정기 청소", "memo", "검증 기록"), 201);
        JsonNode records = json("/api/admin/cleaning-records?zoneId=" + zone, "GET", null, 200);
        assertEquals(1, records.size());
        assertEquals("검증 기록", records.get(0).path("memo").asText());
        assertFalse(records.get(0).path("createdAt").isNull());
        assertEquals(204, request("/api/admin/workers/" + worker, "DELETE", null).statusCode());
        assertTrue(json("/api/admin/workers", "GET", null, 200).isEmpty());
    }

    @Test
    void persistsSystemSettingsAcrossRequests() throws Exception {
        json("/api/admin/settings", "PUT", Map.of("offline_timeout_seconds", "120",
                "polling_interval_seconds", "15"), 200);
        JsonNode settings = json("/api/admin/settings", "GET", null, 200);
        assertEquals("120", settings.path("offline_timeout_seconds").asText());
        assertEquals("15", settings.path("polling_interval_seconds").asText());
        assertEquals("400", settings.path("gas_warning_threshold").asText());
    }

    @Test
    void keepsChecklistItemsSeparatedByZoneAndDateAndAcceptsExplicitFalse() throws Exception {
        long first = zone().getId(), second = zone().getId();
        Map<String, Object> body = new HashMap<>(Map.of("zoneId", first, "date", "2026-10-17",
                "itemKey", "floor", "isCompleted", true));
        json("/api/admin/checklists/toggle", "POST", body, 200);
        JsonNode items = json("/api/admin/checklists?zoneId=" + first + "&date=2026-10-17", "GET", null, 200);
        assertEquals(1, items.size());
        assertTrue(items.get(0).path("completed").asBoolean());
        assertTrue(json("/api/admin/checklists?zoneId=" + second + "&date=2026-10-17", "GET", null, 200).isEmpty());
        assertTrue(json("/api/admin/checklists?zoneId=" + first + "&date=2026-10-18", "GET", null, 200).isEmpty());
        body.put("isCompleted", false);
        JsonNode updated = json("/api/admin/checklists/toggle", "POST", body, 200);
        assertEquals(first, updated.path("zoneId").asLong(), updated.toString());
        assertEquals("2026-10-17", updated.path("checkDate").asText(), updated.toString());
        assertEquals(items.get(0).path("id").asLong(), updated.path("id").asLong(), updated.toString());
        items = json("/api/admin/checklists?zoneId=" + first + "&date=2026-10-17", "GET", null, 200);
        assertEquals(1, items.size());
        assertFalse(items.get(0).path("completed").asBoolean());
    }

    @Test
    void batchResolutionKeepsAiMetadataAndWritesActionLogs() throws Exception {
        Zone zone = zone();
        User admin = users.saveAndFlush(User.builder().username("sync-admin").password("test")
                .role(Role.ADMIN).build());
        Alert ai = alerts.saveAndFlush(Alert.builder().zone(zone).alertType(AlertType.LEAK)
                .status(AlertStatus.UNRESOLVED).detectionSource("AI").modelVersion("test-v1")
                .level("긴급").build());
        alerts.saveAndFlush(Alert.builder().zone(zone).alertType(AlertType.FREEZE)
                .status(AlertStatus.UNRESOLVED).build());
        JsonNode list = json("/api/admin/alerts", "GET", null, 200);
        boolean found = false;
        for (JsonNode item : list) {
            if (item.path("alertId").asLong() == ai.getId()) {
                found = true;
                assertEquals("AI", item.path("detectionSource").asText());
                assertEquals("test-v1", item.path("modelVersion").asText());
            }
        }
        assertTrue(found);
        assertEquals(200, request("/api/admin/alerts/batch-actions", "POST",
                Map.of("adminId", admin.getId(), "actionDetail", "일괄 확인")).statusCode());
        assertTrue(json("/api/admin/alerts", "GET", null, 200).isEmpty());
        assertEquals(2, actions.count());
        assertEquals(AlertStatus.RESOLVED, alerts.findById(ai.getId()).orElseThrow().getStatus());
    }

    @Test
    void deletesUnusedDeviceSetAndDetachesItsSensors() throws Exception {
        var registered = register();
        assertEquals(204, request("/api/admin/device-sets/" + registered.deviceSetId(), "DELETE", null).statusCode());
        assertTrue(json("/api/admin/device-sets", "GET", null, 200).isEmpty());
        for (Long id : registered.sensorIds()) {
            assertNull(sensors.findById(id).orElseThrow().getDeviceSet());
        }
    }

    @Test
    void rejectsDeletingReferencedInstallationsIncludingAiAfterRawExpiry() {
        for (String kind : List.of("raw", "alert", "ai")) {
            var registered = register();
            Sensor sensor = sensors.findById(registered.gasId()).orElseThrow();
            DeviceSetHistory history = new TransactionTemplate(transactions).execute(status ->
                    em.createQuery("SELECT h FROM DeviceSetHistory h WHERE h.deviceSet.id = :id", DeviceSetHistory.class)
                            .setParameter("id", registered.deviceSetId()).getSingleResult());
            LocalDateTime now = LocalDateTime.now();
            if (kind.equals("raw")) {
                SensorMetric metric = metrics.saveAndFlush(SensorMetric.builder().sensor(sensor)
                        .metricCode(MetricCode.GAS).unitCode("ADC").build());
                raw.saveAndFlush(SensorDataRaw.builder().metric(metric).deviceSetHistory(history)
                        .sampleKey("retained").measuredValue(new BigDecimal("400"))
                        .measuredAt(now).receivedAt(now).timeSource(TimeSource.SERVER).build());
            } else if (kind.equals("alert")) {
                alerts.saveAndFlush(Alert.builder().sensor(sensor).zone(sensor.getZone())
                        .deviceSetHistory(history).alertType(AlertType.LEAK).status(AlertStatus.UNRESOLVED).build());
            } else {
                predictions.saveAndFlush(AiPrediction.builder().id(900000L).sensor(sensor).zone(sensor.getZone())
                        .deviceSetHistory(history).sampleKey("archived-ai").gasValue(new BigDecimal("400"))
                        .measuredAt(now).queuedAt(now).nextAttemptAt(now).status(AiPredictionStatus.COMPLETE).build());
            }
            assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                    () -> sets.delete(registered.deviceSetId())).getStatusCode());
            assertEquals(1, sets.history(registered.deviceSetId()).size());
            assertEquals(3, sensors.findByDeviceSetIdOrderByIdAsc(registered.deviceSetId()).size());
        }
        assertEquals(1, raw.count());
        assertEquals(1, alerts.count());
        assertEquals(1, predictions.count());
    }

    @Autowired DeviceCredentialService credentials;
    @Autowired DiscoveredDeviceService discovery;
    @Autowired DeviceSetRepository deviceSets;
    @Test void discoveryAcceptsUnverifiedHintsWithoutEnrollingOrExposingConfiguration() throws Exception {
        String mac="02:00:00:00:AA:01";
        discovery.remove(mac);
        assertEquals(202,deviceRequest("/api/iot/discovery",null,null,Map.of("macAddress",mac,"latitude",37.5,"longitude",127.1)).statusCode());
        JsonNode row=json("/api/admin/discovered-devices","GET",null,200).get(0);
        assertEquals(mac,row.path("macAddress").asText());assertEquals(37.5,row.path("latitude").asDouble());
        assertEquals(0,deviceSets.count());
        assertEquals(401,deviceRequest("/api/iot/device-sets/by-mac/"+mac,null,null,null).statusCode());
        assertEquals(400,deviceRequest("/api/iot/discovery",null,null,Map.of("macAddress",mac,"latitude",91,"longitude",127)).statusCode());
        assertEquals(400,deviceRequest("/api/iot/discovery",null,null,Map.of("macAddress","not-a-mac")).statusCode());
        assertEquals(204,request("/api/admin/discovered-devices/"+mac,"DELETE",null).statusCode());
        assertTrue(json("/api/admin/discovered-devices","GET",null,200).isEmpty());
    }
    @Test void gpsRequiresTheDeviceKeyAndMatchingMacAndValidatesCoordinates() throws Exception {
        var registered=register();var set=deviceSets.findById(registered.deviceSetId()).orElseThrow();
        String mac=set.getMacAddress(),path="/api/iot/device-sets/by-mac/"+mac+"/location";
        String key=credentials.rotate(mac,users.findByUsername("sync-session").orElseThrow().getId()).key();
        assertEquals(401,deviceRequest(path,null,null,Map.of("latitude",37.5,"longitude",127)).statusCode());
        assertEquals(403,deviceRequest("/api/iot/device-sets/by-mac/02:00:00:00:00:99/location",mac,key,Map.of("latitude",37.5,"longitude",127)).statusCode());
        assertEquals(400,deviceRequest(path,mac,key,Map.of("latitude",37.5,"longitude",181)).statusCode());
        assertEquals(200,deviceRequest(path,mac,key,Map.of("latitude",0,"longitude",0)).statusCode());
        Zone zone=zones.findById(set.getZone().getId()).orElseThrow();assertEquals(0,zone.getLatitude());assertEquals(0,zone.getLongitude());
        assertEquals(0,predictions.count());assertEquals(0,raw.count());
    }
    @Test void workerMovesAndRenamesPersistOnBothSidesAndDeleteClearsAssignment() throws Exception {
        Long a=zone().getId(),b=zone().getId();
        long worker=json("/api/admin/workers","POST",Map.of("name","first","assignedZoneId",a),201).path("id").asLong();
        assertEquals(worker,zones.findById(a).orElseThrow().getAssignedWorkerId());
        json("/api/admin/zones/"+b+"/worker","PATCH",Map.of("workerId",worker),200);
        assertNull(zones.findById(a).orElseThrow().getAssignedWorkerId());
        json("/api/admin/workers/"+worker,"PUT",Map.of("name","renamed","assignedZoneId",b,"status","AVAILABLE"),200);
        assertEquals("renamed",zones.findById(b).orElseThrow().getAssignedWorkerName());
        assertEquals(worker,json("/api/admin/zones","GET",null,200).valueStream().filter(r->r.path("zoneId").asLong()==b).findFirst().orElseThrow().path("assignedWorkerId").asLong());
        assertEquals(204,request("/api/admin/workers/"+worker,"DELETE",null).statusCode());
        assertNull(zones.findById(b).orElseThrow().getAssignedWorkerId());
    }
    @Test void sensorManagementCannotReassignAnInstalledSensorOrDeleteItsIdentity() throws Exception {
        var installed=register();Long other=zone().getId();
        assertEquals(409,request("/api/dev/sensors/"+installed.gasId(),"PATCH",Map.of("zoneId",other)).statusCode());
        assertEquals(409,request("/api/dev/sensors/"+installed.gasId(),"DELETE",null).statusCode());
        json("/api/dev/sensors/"+installed.gasId(),"PATCH",Map.of("status","INACTIVE"),200);
        assertEquals(SensorStatus.INACTIVE,sensors.findById(installed.gasId()).orElseThrow().getStatus());
        assertEquals(400,request("/api/dev/sensors/"+installed.gasId(),"PATCH",Map.of("status","ONLINE")).statusCode());
        assertTrue(json("/api/dev/sensors","GET",null,200).size()>=3);
    }
    @Test void changingAnAccountPasswordRevokesOldSessionsAndRejectsWeakDefaults() throws Exception {
        long id=json("/api/admin/users","POST",Map.of("username","editable","password","strong-password-before","role","CLEANER","zoneIds",List.of()),201).path("id").asLong();
        var login=new com.tcp.cleanmanagement.dto.LoginRequest();login.setUsername("editable");login.setPassword("strong-password-before");
        String old=auth.login(login).getToken();
        assertEquals("editable",auth.authenticate("Bearer "+old).username());
        assertEquals(400,request("/api/admin/users/"+id,"PUT",Map.of("username","editable","password","1234","role","CLEANER","zoneIds",List.of())).statusCode());
        json("/api/admin/users/"+id,"PUT",Map.of("username","renamed-user","password","strong-password-after","role","ADMIN","zoneIds",List.of()),200);
        assertThrows(ResponseStatusException.class,()->auth.authenticate("Bearer "+old));
        assertFalse(users.findById(id).orElseThrow().getPassword().contains("strong-password-after"));
        assertEquals(204,request("/api/admin/users/"+id,"DELETE",null).statusCode());
        assertTrue(users.findById(id).isEmpty());
    }
    @Test void invalidBatchChecklistRollsBackEveryItemAndNeverTrustsSuppliedActor() throws Exception {
        Long id=zone().getId();var items=new LinkedHashMap<String,Boolean>();items.put("floor",true);items.put("unknown",true);
        assertEquals(400,request("/api/admin/checklists/batch","POST",Map.of("zoneId",id,"date","2026-10-18","items",items,"completedBy",99999)).statusCode());
        assertTrue(json("/api/admin/checklists?zoneId="+id+"&date=2026-10-18","GET",null,200).isEmpty());
        JsonNode rows=json("/api/admin/checklists/batch","POST",Map.of("zoneId",id,"date","2026-10-18","items",Map.of("floor",true),"completedBy",99999),200);
        assertEquals(users.findByUsername("sync-session").orElseThrow().getId(),rows.get(0).path("completedBy").asLong());
    }
    @Test void cleanerCannotUseGlobalEnrollmentOrAccountManagement() throws Exception {
        users.saveAndFlush(User.builder().username("scoped-cleaner").password(passwords.encode("strong-cleaner-password")).role(Role.CLEANER).build());
        var login=new com.tcp.cleanmanagement.dto.LoginRequest();login.setUsername("scoped-cleaner");login.setPassword("strong-cleaner-password");
        token=auth.login(login).getToken();
        assertEquals(403,request("/api/admin/discovered-devices","GET",null).statusCode());
        assertEquals(403,request("/api/admin/users","GET",null).statusCode());
        assertTrue(json("/api/dev/sensors","GET",null,200).isEmpty());
    }
    @Autowired IotDataService collector;
    @Autowired PublicZoneService publicZones;
    @Autowired SensorViewService views;
    @Autowired UpstashImportService cloud;
    @Autowired UpstashDeviceRepository cloudDevices;
    @Autowired WorkerRepository workerRows;
    @Test void doorSensorUsesMagTypeAndContactMetric() throws Exception {
        Long id=zone().getId();
        long sensor=json("/api/dev/sensors","POST",Map.of("zoneId",id,"sensorType","MAG"),200).asLong();
        var request=readingRequest("door-one",null,java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC),MetricCode.CONTACT,"1");
        collector.saveSensorData(sensor,request);
        assertTrue(metrics.findBySensorIdAndMetricCode(sensor,MetricCode.CONTACT).isPresent());assertEquals(1,raw.count());
    }
    @Test void facilityCreateRollsBackItsZoneAndWorkerWhenMacConflicts() throws Exception {
        var existing=register();String mac=deviceSets.findById(existing.deviceSetId()).orElseThrow().getMacAddress();
        long count=zones.count();
        long worker=json("/api/admin/workers","POST",Map.of("name","rollback-worker"),201).path("id").asLong();
        assertEquals(409,request("/api/dev/facilities","POST",Map.of("zone",Map.of("name","must-rollback","zoneType","TOILET","assignedWorkerId",worker),"device",Map.of("macAddress",mac))).statusCode());
        assertEquals(count,zones.count());assertNull(workerRows.findById(worker).orElseThrow().getAssignedZoneId());
        assertEquals(400,request("/api/dev/facilities","POST",Map.of("zone",Map.of("name","invalid","zoneType","TOILET"),"device",Map.of("macAddress","invalid"))).statusCode());
        assertEquals(count,zones.count());
    }
    @Test void facilityUpdateRollsBackNamesAssignmentsAndMacOnFailure() throws Exception {
        var first=register();var second=register();
        var set=deviceSets.findById(first.deviceSetId()).orElseThrow();Long id=set.getZone().getId();
        String name=zones.findById(id).orElseThrow().getName();
        long worker=json("/api/admin/workers","POST",Map.of("name","original","assignedZoneId",id),201).path("id").asLong();
        String other=deviceSets.findById(second.deviceSetId()).orElseThrow().getMacAddress();
        assertEquals(409,request("/api/dev/facilities/"+id,"PUT",Map.of("zone",Map.of("name","must-rollback"),"device",Map.of("deviceSetId",set.getId(),"macAddress",other))).statusCode());
        assertEquals(name,zones.findById(id).orElseThrow().getName());assertEquals(worker,zones.findById(id).orElseThrow().getAssignedWorkerId());
        assertEquals(id,workerRows.findById(worker).orElseThrow().getAssignedZoneId());
    }
    @Test void inactiveSensorsAndPreviousInstallationsNeverAppearAsCurrentNormalData() throws Exception {
        var item=register();var set=deviceSets.findById(item.deviceSetId()).orElseThrow();String mac=set.getMacAddress();Long original=set.getZone().getId();
        var now=java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC);
        collector.saveSensorData(item.gasId(),readingRequest("original",mac,now,MetricCode.GAS,"100"));
        assertEquals(100,views.snapshots("mysql").get(0).mq135Adc().intValue());
        json("/api/dev/sensors/"+item.gasId(),"PATCH",Map.of("status","INACTIVE"),200);
        assertNull(views.snapshots("mysql").get(0).mq135Adc());
        assertEquals("NO_DATA",publicZones.getZoneStatus(original).getStatus());
        json("/api/dev/sensors/"+item.gasId(),"PATCH",Map.of("status","ACTIVE"),200);
        var label=new com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest();label.setInstallationLabel("same installation");sets.update(item.deviceSetId(),label);
        assertEquals(100,views.snapshots("mysql").get(0).mq135Adc().intValue());
        Long target=zone().getId();var move=new com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest();move.setZoneId(target);sets.update(item.deviceSetId(),move);
        assertNull(views.snapshots("mysql").get(0).measuredAt());
        assertEquals("NO_DATA",publicZones.getZoneStatus(target).getStatus());
        assertThrows(ResponseStatusException.class,()->collector.saveSensorData(item.gasId(),readingRequest("late-old-packet",mac,now.minusMinutes(5),MetricCode.GAS,"900")));
        assertEquals(1,raw.count());
        move.setZoneId(original);sets.update(item.deviceSetId(),move);
        assertNull(views.snapshots("mysql").get(0).measuredAt());
    }
    @Test void historyAfterRelocationCannotExposeThePreviousZonesReadings() throws Exception {
        var item=register();var set=deviceSets.findById(item.deviceSetId()).orElseThrow();String mac=set.getMacAddress();
        collector.saveSensorData(item.gasId(),readingRequest("private-old-zone",mac,java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC),MetricCode.GAS,"111"));
        Long target=zone().getId();var move=new com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest();move.setZoneId(target);sets.update(item.deviceSetId(),move);
        collector.saveSensorData(item.gasId(),readingRequest("new-zone",mac,java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC),MetricCode.GAS,"222"));
        assertEquals(2,views.history(mac,"mysql",1,200).size());
        long manager=json("/api/admin/users","POST",Map.of("username","new-zone-manager","password","manager-strong-password","role","ADMIN","zoneIds",List.of(target)),201).path("id").asLong();
        var login=new com.tcp.cleanmanagement.dto.LoginRequest();login.setUsername("new-zone-manager");login.setPassword("manager-strong-password");token=auth.login(login).getToken();
        var rows=json("/api/iot/devices/"+mac+"/history?hours=1","GET",null,200);
        assertEquals(1,rows.size());assertEquals("new-zone",rows.get(0).path("sampleKey").asText());
    }
    @Test void importedDeviceAdoptsExistingSensorsAndRetiresItsPreviousMac() {
        String mac="02:11:22:33:44:66";var measured=java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).withNano(0);
        String payload="{\"source\":\"esp32_direct\",\"mac_address\":\""+mac+"\",\"sample_key\":\"legacy-original\",\"measured_at\":\""+measured+"\",\"dht_ok\":true,\"temperature_c\":23,\"humidity_percent\":50,\"mq135_adc\":123}";
        cloud.importSample(mac,measured.toEpochSecond(),payload);
        var imported=cloudDevices.findById(mac).orElseThrow();
        Long temp=imported.getTemperatureHumiditySensor().getId(),gas=imported.getGasSensor().getId(),zone=imported.getZone().getId();
        DeviceSetRequest input=new DeviceSetRequest();input.setMacAddress(mac);input.setSetCode("ADOPT");input.setZoneId(zone);input.setInstallationLabel("adopt");
        var result=sets.register(input);
        assertEquals(temp,result.getSensorIds().get(SensorModel.DHT22));assertEquals(gas,result.getSensorIds().get(SensorModel.MQ135));
        var change=new com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest();change.setMacAddress("02:11:22:33:44:77");sets.update(result.getDeviceSetId(),change);
        assertThrows(ResponseStatusException.class,()->credentials.rotate(mac,users.findByUsername("sync-session").orElseThrow().getId()));
        assertThrows(ResponseStatusException.class,()->cloud.checkpoint(mac));
        assertTrue(views.snapshots("mysql").stream().noneMatch(row->row.macAddress().equals(mac)));
        assertEquals(3,raw.count());
    }
    @Test void nanosecondPacketRetriesRemainIdempotentAtDatabasePrecision() {
        var item=register();var set=deviceSets.findById(item.deviceSetId()).orElseThrow();
        for(int nano:List.of(123456789,999999700)) {
            var at=java.time.OffsetDateTime.now(java.time.ZoneOffset.UTC).withNano(nano);
            var request=readingRequest("precise-"+nano,set.getMacAddress(),at,MetricCode.GAS,"123");
            collector.saveSensorData(item.gasId(),request);collector.saveSensorData(item.gasId(),request);
        }
        assertEquals(2,raw.count());
    }
    @Test void facilityMetadataAndBlankLocationSurviveAFullSave() throws Exception {
        long id=json("/api/dev/facilities","POST",Map.of("zone",Map.of("name","metadata","zoneType","TOILET","floor","B1F","gender","여","address","actual address")),200).asLong();
        var stored=zones.findById(id).orElseThrow();
        assertEquals("B1F",stored.getFloor());assertEquals("여",stored.getGender());assertNull(stored.getLatitude());assertNull(stored.getLongitude());
        JsonNode row=json("/api/admin/zones","GET",null,200).get(0);
        assertEquals("B1F",row.path("floor").asText());assertEquals("여",row.path("gender").asText());assertEquals("actual address",row.path("address").asText());
        json("/api/dev/facilities/"+id,"PUT",Map.of("zone",Map.of("name","updated","floor","2F","gender","공용","address","new address")),200);
        stored=zones.findById(id).orElseThrow();assertEquals("2F",stored.getFloor());assertEquals("공용",stored.getGender());assertNull(stored.getLatitude());
    }
    private com.tcp.cleanmanagement.dto.SensorDataRequest readingRequest(String key,String mac,java.time.OffsetDateTime at,MetricCode code,String value) {
        var request=new com.tcp.cleanmanagement.dto.SensorDataRequest();request.setMacAddress(mac);request.setSampleKey(key);request.setMeasuredAt(at);
        var reading=new com.tcp.cleanmanagement.dto.SensorDataRequest.Reading();reading.setMetricCode(code);reading.setMeasuredValue(new BigDecimal(value));
        request.setReadings(List.of(reading));return request;
    }

    private HttpResponse<String> deviceRequest(String path,String mac,String key,Object body) throws Exception {
        var builder=HttpRequest.newBuilder(URI.create("http://127.0.0.1:"+environment.getProperty("local.server.port")+path))
            .header("Content-Type","application/json");
        if(mac!=null)builder.header("X-Device-Mac",mac);if(key!=null)builder.header("X-Device-Key",key);
        builder.method(body==null?"GET":"POST",body==null?HttpRequest.BodyPublishers.noBody():HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return HttpClient.newHttpClient().send(builder.build(),HttpResponse.BodyHandlers.ofString());
    }

    private Zone zone() {
        return zones.saveAndFlush(Zone.builder().name("sync-" + UUID.randomUUID())
                .zoneType(ZoneType.TOILET).isOurSolution(true).build());
    }

    private record Registered(long deviceSetId, long gasId, Collection<Long> sensorIds) {}

    private Registered register() {
        DeviceSetRequest input = new DeviceSetRequest();
        String hex = UUID.randomUUID().toString().replace("-", "");
        input.setSetCode("SYNC-" + hex);
        input.setMacAddress("02:" + hex.substring(0, 2) + ":" + hex.substring(2, 4) + ":"
                + hex.substring(4, 6) + ":" + hex.substring(6, 8) + ":" + hex.substring(8, 10));
        input.setZoneId(zone().getId());
        input.setInstallationLabel("sync-test");
        var result = sets.register(input);
        return new Registered(result.getDeviceSetId(), result.getSensorIds().get(SensorModel.MQ135),
                result.getSensorIds().values());
    }

    private HttpResponse<String> request(String path, String method, Object body) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                + environment.getProperty("local.server.port") + path))
                .header("Authorization", "Bearer " + token).header("Content-Type", "application/json");
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
                : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return HttpClient.newHttpClient().send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }

    private JsonNode json(String path, String method, Object body, int expected) throws Exception {
        var response = request(path, method, body);
        assertEquals(expected, response.statusCode(), response.body());
        return mapper.readTree(response.body());
    }
}
