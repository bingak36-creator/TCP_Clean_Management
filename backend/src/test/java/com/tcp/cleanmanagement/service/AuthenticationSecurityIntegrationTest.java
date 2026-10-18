package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
    "spring.datasource.url=jdbc:h2:mem:auth_security;MODE=MySQL;DB_CLOSE_DELAY=-1",
    "iot.direct.api-key=integration-device-key-with-32-characters"})
class AuthenticationSecurityIntegrationTest {
    private static final String KEY = "integration-device-key-with-32-characters";
    private static final String PASSWORD = "integration-password";
    private static final String HASHED_PASSWORD = new PasswordService().encode(PASSWORD);
    @Autowired Environment env;
    @Autowired JsonMapper mapper;
    @Autowired UserRepository users;
    @Autowired AuthSessionRepository sessions;
    @Autowired SensorDataRawRepository raw;
    @Autowired ZoneRepository zones;
    @Autowired DeviceSetService sets;
    @Autowired DeviceCredentialService deviceCredentials;
    private String deviceKey;
    @Autowired ZonePermissionRepository permissions;
    @Autowired DeviceCredentialRepository deviceRows;
    @Autowired ActionLogRepository actions;
    @Autowired AlertRepository alerts;
    @Autowired DailyChecklistRepository checklists;
    @Autowired SystemSettingRepository settingsRows;
    @Autowired WorkerRepository workers;
    @Autowired CleaningRecordRepository records;
    @Autowired IotDataService ingestion;

    @Autowired PasswordService passwords;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    private User user;
    private final HttpClient client = HttpClient.newHttpClient();

    @BeforeEach
    void setup() {
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            for (String entity : List.of("DeviceCredential", "CleaningRecord", "DailyChecklist", "SystemSetting", "Worker",
                "AiPrediction", "ActionLog", "Alert", "SensorDataRaw", "SensorDataAggregated",
                "SensorMetric", "UpstashDevice", "DeviceSetHistory", "Sensor", "DeviceSet",
                "ZonePermission", "AuthSession", "User", "Zone")) {
                em.createQuery("DELETE FROM " + entity).executeUpdate();
            }
        });
        users.saveAndFlush(User.builder().username("another-account").password(HASHED_PASSWORD).role(Role.DEVELOPER).build());
        user = users.saveAndFlush(User.builder().username("developer-name-with-admin-role")
            .password(HASHED_PASSWORD).role(Role.ADMIN).build());
    }

    @Test
    void rejectsMissingForgedAndWellFormedButUnissuedTokens() throws Exception {
        for (String token : List.of("", "anything", "admin-token", "mock-jwt-token-DEVELOPER", "A".repeat(43))) {
            Map<String, String> headers = token.isEmpty() ? Map.of() : bearer(token);
            for (String path : List.of("/api/auth/me", "/api/admin/alerts", "/api/admin/ai/status")) {
                var response = request("GET", path, null, headers);
                assertEquals(401, response.statusCode(), path + " " + response.body());
            }
        }
        assertEquals(0, sessions.count());
    }

    @Test
    void unknownLoginNeverCreatesOrPromotesAnAccount() throws Exception {
        long count = users.count();
        for (String name : List.of("developer", "admin", "cleaner", "new-user")) {
            assertEquals(401, login(name, PASSWORD).statusCode());
        }
        assertEquals(401, login(user.getUsername(), "incorrect-password").statusCode());
        assertEquals(count, users.count());
        assertEquals(0, sessions.count());
    }

    @Test
    void sessionUsesRealDatabaseIdentityAndStoresOnlyTokenDigest() throws Exception {
        var login = login(user.getUsername(), PASSWORD);
        assertEquals(200, login.statusCode(), login.body());
        assertEquals("no-store", login.headers().firstValue("Cache-Control").orElseThrow());
        var body = mapper.readTree(login.body());
        String token = body.path("token").asText();
        assertEquals(43, token.length());
        assertTrue(OffsetDateTime.parse(body.path("expiresAt").asText()).isAfter(OffsetDateTime.now()));
        assertEquals(user.getId().longValue(), body.path("id").asLong());
        assertEquals("ADMIN", body.path("role").asText());
        assertFalse(sessions.existsById(token));
        assertTrue(sessions.existsById(AuthService.hash(token)));
        var me = request("GET", "/api/auth/me", null, bearer(token));
        assertEquals(200, me.statusCode());
        assertEquals(user.getId().longValue(), mapper.readTree(me.body()).path("id").asLong());
        assertEquals(user.getUsername(), mapper.readTree(me.body()).path("username").asText());
        assertEquals("ADMIN", mapper.readTree(me.body()).path("role").asText());
        assertFalse(me.body().contains("password"));
        assertFalse(me.body().contains(token));
        new TransactionTemplate(manager).executeWithoutResult(status -> {
            var account = em.find(User.class, user.getId()); account.setRole(Role.DEVELOPER);
        });
        assertEquals("DEVELOPER", mapper.readTree(request("GET", "/api/auth/me", null, bearer(token)).body()).path("role").asText());
    }

    @Test
    void expiredSessionCannotReadOrMutateManagementData() throws Exception {
        String token = token();
        new TransactionTemplate(manager).executeWithoutResult(status -> em.createQuery(
            "UPDATE AuthSession s SET s.expiresAt = :past WHERE s.tokenHash = :hash")
            .setParameter("past", LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1))
            .setParameter("hash", AuthService.hash(token)).executeUpdate());
        assertEquals(401, request("GET", "/api/auth/me", null, bearer(token)).statusCode());
        assertEquals(401, request("POST", "/api/dev/zones", zoneBody(), bearer(token)).statusCode());
        assertEquals(0, zones.count());
    }

    @Test
    void logoutRevokesOnlyThatSession() throws Exception {
        String first = token(), second = token();
        assertNotEquals(first, second);
        assertEquals(204, request("POST", "/api/auth/logout", null, bearer(first)).statusCode());
        assertEquals(401, request("GET", "/api/auth/me", null, bearer(first)).statusCode());
        assertEquals(200, request("GET", "/api/auth/me", null, bearer(second)).statusCode());
        assertEquals(1, sessions.count());
    }

    @Test
    void allDevAndAdminManagementAliasesRequireAuthenticationBeforeMutation() throws Exception {
        for (String prefix : List.of("/api/dev", "/api/admin")) {
            assertEquals(401, request("POST", prefix + "/zones", zoneBody(), Map.of()).statusCode());
            assertEquals(401, request("POST", prefix + "/sensors", Map.of("zoneId", 1, "sensorType", "GAS"), Map.of()).statusCode());
            assertEquals(401, request("PUT", prefix + "/zones/1", zoneBody(), Map.of()).statusCode());
            assertEquals(401, request("PATCH", prefix + "/zones/1/toggle-active", null, Map.of()).statusCode());
            assertEquals(401, request("DELETE", prefix + "/zones/1", null, Map.of()).statusCode());
        }
        assertEquals(0, zones.count());
        var valid = request("POST", "/api/dev/zones", zoneBody(), bearer(devToken()));
        assertEquals(200, valid.statusCode(), valid.body());
        assertEquals(1, zones.count());
    }

    @Test
    void legacyPasswordIsUpgradedOnlyAfterSuccessfulAuthentication() throws Exception {
        var legacy = users.saveAndFlush(User.builder().username("legacy").password("legacy-password").role(Role.ADMIN).build());
        assertEquals(401, login("legacy", "wrong").statusCode());
        assertEquals("legacy-password", users.findById(legacy.getId()).orElseThrow().getPassword());
        assertEquals(200, login("legacy", "legacy-password").statusCode());
        String encoded = users.findById(legacy.getId()).orElseThrow().getPassword();
        assertTrue(passwords.isEncoded(encoded));
        assertTrue(passwords.matches("legacy-password", encoded));
        assertEquals(Role.ADMIN, users.findById(legacy.getId()).orElseThrow().getRole());
    }

    @Test
    void publicMacAndUserSessionCannotReplaceDeviceKey() throws Exception {
        long sensorId = fixture();
        for (Map<String, String> headers : List.of(Map.<String,String>of(), Map.of("X-Device-Key", "wrong"), bearer(token()))) {
            assertEquals(401, request("GET", "/api/iot/device-sets/by-mac/02:11:22:33:44:55", null, headers).statusCode());
            for (String path : List.of("/api/iot/sensors/" + sensorId + "/data", "/api/iot/" + sensorId + "/data")) {
                assertEquals(401, request("POST", path, packet("auth-test", "02:11:22:33:44:55"), headers).statusCode());
            }
        }
        assertEquals(0, raw.count());
    }

    @Test
    void registeredDeviceWithKeyCanConfigureAndSendBothAliasesWithoutDuplicates() throws Exception {
        long id = fixture(); Map<String,String> headers = Map.of("X-Device-Key", deviceKey,"X-Device-Mac","02:11:22:33:44:55");
        assertEquals(200, request("GET", "/api/iot/device-sets/by-mac/02:11:22:33:44:55", null, headers).statusCode());
        for (String path : List.of("/api/iot/sensors/" + id + "/data", "/api/iot/" + id + "/data")) {
            var response = request("POST", path, packet("shared-packet", "02:11:22:33:44:55"), headers);
            assertEquals(201, response.statusCode(), response.body());
        }
        assertEquals(1, raw.count());
        assertEquals(403, request("POST", "/api/iot/" + id + "/data", packet("other-device", "02:99:99:99:99:99"), headers).statusCode());
        assertEquals(403, request("GET", "/api/iot/device-sets/by-mac/02:99:99:99:99:99", null, headers).statusCode());
        assertEquals(1, raw.count());
    }

    @Test
    void alternatePathsCannotBypassDeviceOrManagementAuthentication() throws Exception {
        long id = fixture();
        for (String path : List.of("/api//iot/sensors/" + id + "/data", "/api/iot//sensors/" + id + "/data",
                "/api/iot/sensors/" + id + ";x=y/data", "/api/iot/" + id + "/data/")) {
            int status = request("POST", path, packet("bypass", "02:11:22:33:44:55"), Map.of()).statusCode();
            assertTrue(Set.of(400, 401, 404).contains(status), path + " returned " + status);
        }
        for (String path : List.of("/api//dev/zones", "/api/dev;test=1/zones")) {
            int status = request("POST", path, zoneBody(), Map.of()).statusCode();
            assertTrue(Set.of(400, 401, 404).contains(status), path + " returned " + status);
        }
        assertEquals(0, raw.count());
        assertEquals(1, zones.count());
    }

    @Test
    void corsPreflightStillWorksWithoutCredentials() throws Exception {
        var response = request("OPTIONS", "/api/dev/zones", null, Map.of("Origin", "http://localhost:5173",
            "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "authorization,content-type"));
        assertEquals(200, response.statusCode(), response.body());
        assertTrue(response.headers().firstValue("Access-Control-Allow-Headers").orElseThrow().toLowerCase().contains("authorization"));
        var foreign = request("OPTIONS", "/api/dev/zones", null, Map.of("Origin", "https://attacker.example",
            "Access-Control-Request-Method", "POST", "Access-Control-Request-Headers", "authorization,content-type"));
        assertEquals(403, foreign.statusCode());
        assertTrue(foreign.headers().firstValue("Access-Control-Allow-Origin").isEmpty());
    }

    @Test void managersCannotUseDeveloperFunctionsOrAnotherZone() throws Exception {
        long sensor=fixture();long zone=zones.findAll().get(0).getId();grant(user,zone);
        long other=newZone("other").getId();String admin=token();
        assertEquals(403,request("POST","/api/dev/zones",zoneBody(),bearer(admin)).statusCode());
        assertEquals(403,request("POST","/api/dev/sensors",Map.of("zoneId",zone,"sensorType","GAS"),bearer(admin)).statusCode());
        assertEquals(403,request("PUT","/api/admin/settings",Map.of("offline_timeout_seconds","120"),bearer(admin)).statusCode());
        assertEquals(403,request("GET","/api/admin/users",null,bearer(admin)).statusCode());
        assertEquals(403,request("POST","/api/admin/device-credentials/02:11:22:33:44:55/rotate",null,bearer(admin)).statusCode());
        assertEquals(403,request("PUT","/api/dev/zones/"+other,Map.of("pleasantThreshold",100),bearer(admin)).statusCode());
        assertEquals(200,request("PUT","/api/dev/zones/"+zone,Map.of("pleasantThreshold",100,"needsVentilationThreshold",600),bearer(admin)).statusCode());
        assertEquals(1,mapper.readTree(request("GET","/api/admin/zones",null,bearer(admin)).body()).size());
        assertEquals(1,mapper.readTree(request("GET","/api/iot/devices",null,bearer(admin)).body()).size());
        permissions.deleteAll();
        assertEquals(403,request("GET","/api/iot/devices/02:11:22:33:44:55/history",null,bearer(admin)).statusCode());
    }

    @Test void auditActorsComeFromSessionAndBatchActionsStayWithinAssignedZones() throws Exception {
        long own=newZone("own").getId(),other=newZone("other").getId();grant(user,own);
        var first=alerts.saveAndFlush(Alert.builder().zone(zones.getReferenceById(own)).alertType(AlertType.FREEZE).status(AlertStatus.UNRESOLVED).build());
        var second=alerts.saveAndFlush(Alert.builder().zone(zones.getReferenceById(other)).alertType(AlertType.FREEZE).status(AlertStatus.UNRESOLVED).build());
        String admin=token();
        assertEquals(403,request("POST","/api/admin/alerts/"+second.getId()+"/actions",Map.of("adminId",9999,"actionDetail","forged"),bearer(admin)).statusCode());
        assertEquals(1,mapper.readTree(request("GET","/api/admin/alerts",null,bearer(admin)).body()).size());
        assertEquals(200,request("POST","/api/admin/alerts/batch-actions",Map.of("adminId",9999,"actionDetail","confirmed"),bearer(admin)).statusCode());
        assertEquals(AlertStatus.RESOLVED,alerts.findById(first.getId()).orElseThrow().getStatus());
        assertEquals(AlertStatus.UNRESOLVED,alerts.findById(second.getId()).orElseThrow().getStatus());
        var actor=new TransactionTemplate(manager).execute(status->actions.findAll().get(0).getAdmin().getId());assertEquals(user.getId(),actor);
        assertEquals(200,request("POST","/api/admin/checklists/toggle",Map.of("zoneId",own,"itemKey","floor","isCompleted",true,"completedBy",9999),bearer(admin)).statusCode());
        assertEquals(user.getId(),checklists.findAll().get(0).getCompletedBy());
    }

    @Test void cleanerAccessIsScopedAndCannotChangeManagementSettings() throws Exception {
        long own=newZone("own").getId(),other=newZone("other").getId();
        var cleaner=users.saveAndFlush(User.builder().username("cleaner-user").password(HASHED_PASSWORD).role(Role.CLEANER).build());grant(cleaner,own);
        String session=mapper.readTree(login("cleaner-user",PASSWORD).body()).path("token").asText();
        var body=new HashMap<String,Object>(Map.of("zoneId",own,"restroomName","supplied name","worker","impersonated","type","청소","memo","test","id",12345));
        var response=request("POST","/api/admin/cleaning-records",body,bearer(session));assertEquals(201,response.statusCode(),response.body());
        var saved=mapper.readTree(response.body());assertEquals("cleaner-user",saved.path("worker").asText());assertEquals(cleaner.getId().longValue(),saved.path("createdBy").asLong());assertNotEquals(12345,saved.path("id").asLong());
        body.put("zoneId",other);assertEquals(403,request("POST","/api/admin/cleaning-records",body,bearer(session)).statusCode());
        assertEquals(403,request("GET","/api/admin/checklists?zoneId="+other,null,bearer(session)).statusCode());
        assertEquals(403,request("POST","/api/admin/alerts/batch-actions",Map.of("actionDetail","test"),bearer(session)).statusCode());
        assertEquals(403,request("PUT","/api/admin/settings",Map.of("offline_timeout_seconds","30"),bearer(session)).statusCode());
    }

    @Test void operationalInformationIsPrivateWhilePublicSummaryRemainsAccessible() throws Exception {
        fixture();
        for(String path:List.of("/api/iot/devices","/api/iot/devices/02:11:22:33:44:55/history","/api/iot/upstash/status"))assertEquals(401,request("GET",path,null,Map.of()).statusCode());
        var publicView=request("GET","/api/public/zones",null,Map.of());assertEquals(200,publicView.statusCode());assertFalse(publicView.body().contains("macAddress"));assertFalse(publicView.body().contains("sensorIds"));
    }

    @Test void rotatingAndRevokingDeviceKeysInvalidateOnlyThatDevice() throws Exception {
        long id=fixture();String mac="02:11:22:33:44:55",old=deviceKey;
        String dev=devToken();var issued=request("POST","/api/admin/device-credentials/"+mac+"/rotate",null,bearer(dev));assertEquals(200,issued.statusCode());assertEquals("no-store",issued.headers().firstValue("cache-control").orElseThrow());
        String key=mapper.readTree(issued.body()).path("key").asText();assertNotEquals(old,key);assertEquals(AuthService.hash(key),deviceRows.findById(mac).orElseThrow().getKeyHash());
        assertEquals(401,request("POST","/api/iot/"+id+"/data",packet("old",mac),deviceHeaders(mac,old)).statusCode());
        assertEquals(401,request("POST","/api/iot/"+id+"/data",packet("wrong-device",mac),deviceHeaders("02:99:99:99:99:99",key)).statusCode());
        assertEquals(201,request("POST","/api/iot/"+id+"/data",packet("new",mac),deviceHeaders(mac,key)).statusCode());
        assertEquals(204,request("DELETE","/api/admin/device-credentials/"+mac,null,bearer(dev)).statusCode());
        assertEquals(401,request("POST","/api/iot/"+id+"/data",packet("revoked",mac),deviceHeaders(mac,key)).statusCode());assertEquals(1,raw.count());
    }

    @Test void officialPacketsAppearInAuthenticatedSnapshotsAndHistory() throws Exception {
        long gas=fixture();String mac="02:11:22:33:44:55";var headers=deviceHeaders(mac,deviceKey);String dev=devToken();
        long dht=sets.configurationFor(mac).getSensorIds().get(SensorModel.DHT22);
        Map<String,Object> values=Map.of("sampleKey","one-packet","macAddress",mac,"readings",List.of(Map.of("metricCode","TEMPERATURE","measuredValue",24),Map.of("metricCode","HUMIDITY","measuredValue",60)));
        assertEquals(201,request("POST","/api/iot/"+dht+"/data",values,headers).statusCode());
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",packet("one-packet",mac),headers).statusCode());
        var snapshot=mapper.readTree(request("GET","/api/iot/devices",null,bearer(dev)).body()).get(0);assertEquals(24,snapshot.path("temperatureC").asInt());assertEquals(400,snapshot.path("mq135Adc").asInt());assertEquals("sensor_api",snapshot.path("ingestSource").asText());
        var history=mapper.readTree(request("GET","/api/iot/devices/"+mac+"/history",null,bearer(dev)).body());assertEquals(1,history.size());assertEquals(60,history.get(0).path("humidityPercent").asInt());
        var full=Map.of("source","esp32_direct","mac_address",mac,"sample_key","full-packet","measured_at",OffsetDateTime.now(ZoneOffset.UTC).toString(),"dht_ok",true,"temperature_c",25,"humidity_percent",55,"mq135_adc",300,"mq7_adc",200);
        var saved=request("POST","/api/iot/esp32",full,headers);assertEquals(201,saved.statusCode(),saved.body());
        assertEquals(1,zones.count());assertEquals(1,sets.list().size());
        history=mapper.readTree(request("GET","/api/iot/devices/"+mac+"/history",null,bearer(dev)).body());assertEquals(2,history.size());assertEquals(200,history.get(1).path("mq7Adc").asInt());assertEquals(7,raw.count());
    }

    @Test void settingsAreValidatedAtomicallyAndActorCannotBeForged() throws Exception {
        String dev=devToken();
        assertEquals(400,request("PUT","/api/admin/settings",Map.of("polling_interval_seconds","15","offline_timeout_seconds","-1"),bearer(dev)).statusCode());assertEquals(0,settingsRows.count());
        assertEquals(400,request("PUT","/api/admin/settings",Map.of("device_key","pretend-key"),bearer(dev)).statusCode());assertEquals(0,settingsRows.count());
        assertEquals(400,request("PUT","/api/admin/settings",Map.of("temp_warning_threshold","40"),bearer(dev)).statusCode());
        assertEquals(200,request("PUT","/api/admin/settings?adminId=9999",Map.of("polling_interval_seconds","15","offline_timeout_seconds","120"),bearer(dev)).statusCode());
        assertEquals(users.findByUsername("another-account").orElseThrow().getId(),settingsRows.findById("offline_timeout_seconds").orElseThrow().getUpdatedBy());
    }

    @Test void invalidSensorTimesRangesAndZoneConfigurationAreRejected() throws Exception {
        long id=fixture();String mac="02:11:22:33:44:55";var headers=deviceHeaders(mac,deviceKey);
        var invalid=new HashMap<String,Object>(packet("invalid",mac));invalid.put("readings",List.of(Map.of("metricCode","GAS","measuredValue",-1)));
        assertEquals(400,request("POST","/api/iot/"+id+"/data",invalid,headers).statusCode());
        invalid.put("readings",List.of(Map.of("metricCode","GAS","measuredValue",4096)));assertEquals(400,request("POST","/api/iot/"+id+"/data",invalid,headers).statusCode());
        invalid.put("readings",List.of(Map.of("metricCode","GAS","measuredValue",400)));invalid.put("measuredAt",OffsetDateTime.now().plusDays(1).toString());assertEquals(400,request("POST","/api/iot/"+id+"/data",invalid,headers).statusCode());assertEquals(0,raw.count());
        var zone=new HashMap<String,Object>(zoneBody());zone.put("latitude",91);assertEquals(400,request("POST","/api/dev/zones",zone,bearer(devToken())).statusCode());
        assertEquals(400,request("PUT","/api/dev/zones/"+zones.findAll().get(0).getId(),Map.of("pleasantThreshold",600,"needsVentilationThreshold",300),bearer(devToken())).statusCode());
    }

    @Test void checklistConcurrentFirstWritesAreIdempotentAndRejectBadDates() throws Exception {
        long zone=newZone("checklist").getId();String dev=devToken();
        var body=new HashMap<String,Object>(Map.of("zoneId",zone,"itemKey","floor","date","2026-10-17","isCompleted",true));
        body.put("date","not-a-date");assertEquals(400,request("POST","/api/admin/checklists/toggle",body,bearer(dev)).statusCode());body.put("date","2026-10-17");
        var pool=java.util.concurrent.Executors.newFixedThreadPool(8);
        try{var jobs=new ArrayList<java.util.concurrent.Future<Integer>>();for(int i=0;i<20;i++)jobs.add(pool.submit(()->request("POST","/api/admin/checklists/toggle",body,bearer(dev)).statusCode()));for(var job:jobs)assertEquals(200,job.get());}finally{pool.shutdownNow();}
        assertEquals(1,checklists.count());assertTrue(checklists.findAll().get(0).isCompleted());
        body.put("isCompleted",false);assertEquals(200,request("POST","/api/admin/checklists/toggle",body,bearer(dev)).statusCode());assertNull(checklists.findAll().get(0).getCompletedAt());
        assertTrue(mapper.readTree(request("GET","/api/admin/checklists?zoneId="+newZone("empty").getId()+"&date=2026-10-17",null,bearer(dev)).body()).isEmpty());
    }

    @Test void inactiveZonesRejectIngestionAndPublicStatusIsNeverHardcodedNormal() throws Exception {
        long gas=fixture();String mac="02:11:22:33:44:55";var headers=deviceHeaders(mac,deviceKey);long zone=zones.findAll().get(0).getId();String dev=devToken();
        assertEquals("NO_DATA",mapper.readTree(request("GET","/api/public/zones/"+zone+"/status",null,Map.of()).body()).path("status").asText());
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",packet("one",mac),headers).statusCode());
        assertEquals("WARN",mapper.readTree(request("GET","/api/public/zones/"+zone+"/status",null,Map.of()).body()).path("status").asText());
        new TransactionTemplate(manager).executeWithoutResult(status->em.createQuery("UPDATE SensorDataRaw r SET r.measuredAt=:past").setParameter("past",LocalDateTime.now(ZoneOffset.UTC).minusMinutes(10)).executeUpdate());
        assertEquals("STALE",mapper.readTree(request("GET","/api/public/zones/"+zone+"/status",null,Map.of()).body()).path("status").asText());
        assertEquals(200,request("PATCH","/api/dev/zones/"+zone+"/toggle-active",null,bearer(dev)).statusCode());
        assertEquals(409,request("POST","/api/iot/"+gas+"/data",packet("disabled",mac),headers).statusCode());
        assertTrue(mapper.readTree(request("GET","/api/public/zones",null,Map.of()).body()).isEmpty());
        assertEquals("INACTIVE",mapper.readTree(request("GET","/api/public/zones/"+zone+"/status",null,Map.of()).body()).path("status").asText());
    }

    @Test void gasRuleAlertsStartOnlyAfterCalibrationAndRecoverBelowPleasantLevel() throws Exception {
        long gas=fixture();String mac="02:11:22:33:44:55";var headers=deviceHeaders(mac,deviceKey);String dev=devToken();
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",packet("uncalibrated",mac),headers).statusCode());
        org.awaitility.Awaitility.await().during(Duration.ofMillis(300)).atMost(Duration.ofSeconds(2)).untilAsserted(()->assertEquals(0,alerts.count()));
        String path="/api/dev/sensors/"+gas+"/gas-calibration";
        assertEquals(400,request("PUT",path,Map.of("unitCode","UNVERIFIED","pleasantThreshold",100,"needsVentilationThreshold",300),bearer(dev)).statusCode());
        assertEquals(400,request("PUT",path,Map.of("unitCode","PPM","pleasantThreshold",300,"needsVentilationThreshold",100),bearer(dev)).statusCode());
        assertEquals(200,request("PUT",path,Map.of("unitCode","PPM","pleasantThreshold",100,"needsVentilationThreshold",300),bearer(dev)).statusCode());
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",packet("smoke",mac),headers).statusCode());
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertEquals(1,alerts.count()));
        assertEquals(AlertType.SMOKING,alerts.findAll().get(0).getAlertType());
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",Map.of("macAddress",mac,"sampleKey","between","readings",List.of(Map.of("metricCode","GAS","measuredValue",200))),headers).statusCode());
        org.awaitility.Awaitility.await().during(Duration.ofMillis(300)).atMost(Duration.ofSeconds(2)).untilAsserted(()->assertEquals(AlertStatus.UNRESOLVED,alerts.findAll().get(0).getStatus()));
        assertEquals(201,request("POST","/api/iot/"+gas+"/data",Map.of("macAddress",mac,"sampleKey","clean","readings",List.of(Map.of("metricCode","GAS","measuredValue",50))),headers).statusCode());
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertEquals(AlertStatus.RESOLVED,alerts.findAll().get(0).getStatus()));
    }

    @Test void deletingZoneInUseIsAConflictNotAServerError() throws Exception {
        fixture();long used=zones.findAll().stream().filter(z->z.getName().equals("secured-device-zone")).findFirst().orElseThrow().getId();long empty=newZone("unused").getId();String dev=devToken();
        var inUse=request("DELETE","/api/dev/zones/"+used,null,bearer(dev));
        assertEquals(409,inUse.statusCode(),inUse.body());assertTrue(zones.existsById(used));
        assertEquals(204,request("DELETE","/api/dev/zones/"+empty,null,bearer(dev)).statusCode());assertFalse(zones.existsById(empty));
    }

    @Test void incidentStormsAreSuppressedAndRecoveryDoesNotInventAHumanActor() throws Exception {
        fixture();String mac="02:11:22:33:44:55";long id=sets.configurationFor(mac).getSensorIds().get(SensorModel.DHT22);var headers=deviceHeaders(mac,deviceKey);
        for(int i=0;i<4;i++)assertEquals(201,request("POST","/api/iot/"+id+"/data",Map.of("macAddress",mac,"sampleKey","freeze-"+i,"readings",List.of(Map.of("metricCode","TEMPERATURE","measuredValue",-5))),headers).statusCode());
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertEquals(1,alerts.count()));
        assertEquals(201,request("POST","/api/iot/"+id+"/data",Map.of("macAddress",mac,"sampleKey","recovered","readings",List.of(Map.of("metricCode","TEMPERATURE","measuredValue",5))),headers).statusCode());
        org.awaitility.Awaitility.await().atMost(Duration.ofSeconds(5)).untilAsserted(()->assertEquals(AlertStatus.RESOLVED,alerts.findAll().get(0).getStatus()));
        assertEquals("RECOVERY",alerts.findAll().get(0).getResolutionSource());assertEquals(0,actions.count());
        assertEquals(201,request("POST","/api/iot/"+id+"/data",Map.of("macAddress",mac,"sampleKey","repeat","readings",List.of(Map.of("metricCode","TEMPERATURE","measuredValue",-5))),headers).statusCode());
        org.awaitility.Awaitility.await().during(Duration.ofMillis(300)).atMost(Duration.ofSeconds(2)).untilAsserted(()->assertEquals(1,alerts.count()));
    }

    @Test void bulkThresholdFailureAndDispatchFailureRollBackAllChanges() throws Exception {
        long own=newZone("own").getId();String dev=devToken();
        var threshold=Map.of("zoneIds",List.of(own,999999),"pleasantThreshold",100,"needsVentilationThreshold",200,"globalSettings",Map.of("polling_interval_seconds","15"));
        assertEquals(404,request("PUT","/api/admin/zone-thresholds",threshold,bearer(dev)).statusCode());
        assertEquals(0,settingsRows.count());assertNull(zones.findById(own).orElseThrow().getPleasantThreshold());
        var first=workers.saveAndFlush(Worker.builder().name("available").phone("").assignedZoneId(own).status("AVAILABLE").build());
        var second=workers.saveAndFlush(Worker.builder().name("off-duty").phone("").assignedZoneId(own).status("OFF_DUTY").build());
        var dispatch=Map.of("workerIds",List.of(first.getId(),second.getId()),"zoneIds",List.of(own),"type","점검","urgency","NORMAL","memo","test");
        assertEquals(409,request("POST","/api/admin/dispatches",dispatch,bearer(dev)).statusCode());assertEquals("AVAILABLE",workers.findById(first.getId()).orElseThrow().getStatus());assertEquals(0,records.count());
    }

    @Test void developerProvisioningAndPermissionChangesUseRealRolesImmediately() throws Exception {
        long own=newZone("own").getId(),other=newZone("other").getId();String developer=devToken();
        var created=request("POST","/api/admin/users",Map.of("username","new-cleaner","password",PASSWORD,"role","CLEANER","zoneIds",List.of(own)),bearer(developer));
        assertEquals(201,created.statusCode(),created.body());assertFalse(created.body().contains("password"));
        long id=mapper.readTree(created.body()).path("id").asLong();String session=mapper.readTree(login("new-cleaner",PASSWORD).body()).path("token").asText();
        assertEquals(200,request("GET","/api/admin/checklists?zoneId="+own,null,bearer(session)).statusCode());
        assertEquals(200,request("PUT","/api/admin/users/"+id+"/access",Map.of("role","CLEANER","zoneIds",List.of(other)),bearer(developer)).statusCode());
        assertEquals(403,request("GET","/api/admin/checklists?zoneId="+own,null,bearer(session)).statusCode());
        assertEquals(200,request("GET","/api/admin/checklists?zoneId="+other,null,bearer(session)).statusCode());
        long self=users.findByUsername("another-account").orElseThrow().getId();
        assertEquals(409,request("PUT","/api/admin/users/"+self+"/access",Map.of("role","ADMIN","zoneIds",List.of()),bearer(developer)).statusCode());
    }
    @Test void replacingMacRevokesThePreviousDeviceCredential() throws Exception {
        fixture();String old="02:11:22:33:44:55",previousKey=deviceKey;long set=sets.configurationFor(old).getDeviceSetId();
        assertEquals(200,request("PATCH","/api/admin/device-sets/"+set,Map.of("macAddress","02:99:99:99:99:99"),bearer(devToken())).statusCode());
        assertFalse(deviceRows.findById(old).orElseThrow().isEnabled());
        assertEquals(401,request("GET","/api/iot/device-sets/by-mac/"+old,null,deviceHeaders(old,previousKey)).statusCode());
    }

    private Zone newZone(String name){return zones.saveAndFlush(Zone.builder().name(name).zoneType(ZoneType.TOILET).build());}
    private void grant(User who,long zone){permissions.saveAndFlush(ZonePermission.builder().user(who).zone(zones.getReferenceById(zone)).build());}
    private Map<String,String> deviceHeaders(String mac,String key){return Map.of("X-Device-Mac",mac,"X-Device-Key",key);}

    private long fixture() {
        Zone zone = zones.saveAndFlush(Zone.builder().name("secured-device-zone").zoneType(ZoneType.TOILET).build());
        DeviceSetRequest input = new DeviceSetRequest();
        input.setZoneId(zone.getId()); input.setSetCode("SECURED-SET");
        input.setMacAddress("02:11:22:33:44:55"); input.setInstallationLabel("test");
        long sensor=sets.register(input).getSensorIds().get(SensorModel.MQ135);
        deviceKey=deviceCredentials.rotate("02:11:22:33:44:55",user.getId()).key();
        return sensor;
    }
    private Map<String,Object> zoneBody() {
        return Map.of("name", "secured-zone", "zoneType", "TOILET", "latitude", 35.1, "longitude", 129.1);
    }
    private Map<String,Object> packet(String key, String mac) {
        return Map.of("sampleKey", key, "macAddress", mac,
            "readings", List.of(Map.of("metricCode", "GAS", "measuredValue", 400)));
    }
    private Map<String,String> bearer(String token) { return Map.of("Authorization", "Bearer " + token); }
    private HttpResponse<String> login(String name, String password) throws Exception {
        return request("POST", "/api/auth/login", Map.of("username", name, "password", password), Map.of());
    }
    private String devToken() throws Exception { return mapper.readTree(login("another-account",PASSWORD).body()).path("token").asText(); }
    private String token() throws Exception {
        var response = login(user.getUsername(), PASSWORD);
        assertEquals(200, response.statusCode(), response.body());
        return mapper.readTree(response.body()).path("token").asText();
    }
    private HttpResponse<String> request(String method, String path, Object body, Map<String,String> headers) throws Exception {
        var builder = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + env.getProperty("local.server.port") + path))
            .header("Content-Type", "application/json");
        headers.forEach(builder::header);
        builder.method(method, body == null ? HttpRequest.BodyPublishers.noBody()
            : HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)));
        return client.send(builder.build(), HttpResponse.BodyHandlers.ofString());
    }
}
