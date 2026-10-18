package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.controller.AiPredictionController;
import com.tcp.cleanmanagement.dto.*;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.job.AiPredictionJob;
import com.tcp.cleanmanagement.repository.*;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.*;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.env.Environment;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;
import java.math.BigDecimal;
import java.net.URI;
import java.net.http.*;
import java.time.*;
import java.util.*;
import java.util.concurrent.atomic.AtomicInteger;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "restroom-ai.enabled=true",
        "spring.datasource.url=jdbc:h2:mem:ai_pipeline;MODE=MySQL;DB_CLOSE_DELAY=-1"})
class AiPredictionIntegrationTest {
    @Autowired DeviceSetService sets;
    @Autowired IotDataService ingestion;
    @Autowired UpstashImportService direct;
    @Autowired AiPredictionRepository predictions;
    @Autowired SensorDataRawRepository raw;
    @Autowired AlertRepository alerts;
    @Autowired AiPredictionJob job;
    @Autowired AiPredictionController controller;
    @Autowired AdminAlertService adminAlerts;
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @Autowired Environment environment;
    @Autowired JsonMapper mapper;
    @Autowired UserRepository users;
    @Autowired AuthService auth;
    @Autowired PasswordService passwords;
    @Autowired ZonePermissionRepository permissions;
    @Autowired ZoneRepository zones;
    @MockitoBean AiModelClient model;
    private TransactionTemplate tx;
    private static final AtomicInteger SERIAL = new AtomicInteger();
    private static final String VERSION = "environment-v3-indoor-22-mixed";

    @BeforeEach
    void setup() {
        tx = new TransactionTemplate(manager);
        tx.executeWithoutResult(status -> {
            for (String entity : List.of("AiPrediction", "ActionLog", "Alert", "SensorDataRaw",
                    "SensorDataAggregated", "SensorMetric", "UpstashDevice", "DeviceSetHistory",
                    "Sensor", "DeviceSet", "ZonePermission", "Zone")) em.createQuery("DELETE FROM " + entity).executeUpdate();
        });
        reset(model);
        when(model.status()).thenReturn(Map.of("loaded", true, "sessionId", "first"));
        when(model.predict(any())).thenAnswer(inv -> judgement(inv.getArgument(0), false));
    }

    private String loginToken() {
        users.findByUsername("ai-session").orElseGet(() -> users.saveAndFlush(User.builder()
                .username("ai-session").password(passwords.encode("integration-password")).role(Role.ADMIN).build()));
        var user=users.findByUsername("ai-session").orElseThrow();
        for(var zone:zones.findAll()) if(permissions.findByUserId(user.getId()).stream().noneMatch(p->p.getZone().getId().equals(zone.getId())))
            permissions.saveAndFlush(ZonePermission.builder().user(user).zone(zone).build());
        LoginRequest request = new LoginRequest();
        request.setUsername("ai-session"); request.setPassword("integration-password");
        return auth.login(request).getToken();
    }

    @Test
    void committedSeparatePacketsProduceAStoredPredictionAndHttpResponse() throws Exception {
        Fixture set = fixture(); String key = "packet-main";
        send(set.temperature(), key, set.at(), reading(MetricCode.TEMPERATURE, "24"), reading(MetricCode.HUMIDITY, "91"));
        send(set.gas(), key, set.at(), reading(MetricCode.GAS, "400"));
        assertEquals(AiPredictionStatus.PENDING, only().getStatus());
        job.processPending();
        var result = only();
        assertEquals(AiPredictionStatus.COMPLETE, result.getStatus());
        assertEquals(0, result.getHumidity().compareTo(new BigDecimal("91")));
        assertEquals("DHT22", result.getSensorModel());
        assertEquals("준비 중", result.getLevel());
        assertEquals(0, alerts.count());
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                + environment.getProperty("local.server.port") + "/api/admin/ai/sensors/" + set.gas() + "/latest"))
                .header("Authorization", "Bearer " + loginToken()).GET().build();
        var response = HttpClient.newHttpClient().send(request, HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        var body = mapper.readTree(response.body());
        assertEquals("COMPLETE", body.path("status").asText());
        assertEquals(VERSION, body.path("judgement").path("model_version").asText());
        assertFalse(body.path("judgement").path("ready").path("environment").asBoolean());
    }

    @Test
    void gasWaitsForItsOwnPacketWithoutInventingTemperature() {
        Fixture set = fixture();
        send(set.gas(), "late-temperature", set.at(), reading(MetricCode.GAS, "400"));
        job.processPending();
        assertEquals(AiPredictionStatus.PENDING, only().getStatus());
        assertNull(only().getTemperature());
        verify(model, never()).predict(any());
        send(set.temperature(), "late-temperature", set.at(), reading(MetricCode.TEMPERATURE, "25"), reading(MetricCode.HUMIDITY, "60"));
        due(); job.processPending();
        assertEquals(AiPredictionStatus.COMPLETE, only().getStatus());
        assertEquals(0, only().getTemperature().compareTo(new BigDecimal("25")));
    }

    @Test
    void doesNotMixDevicesEvenWhenSampleKeysAreEqual() {
        Fixture first = fixture(), second = fixture();
        send(first.temperature(), "shared-key", first.at(), reading(MetricCode.TEMPERATURE, "20"), reading(MetricCode.HUMIDITY, "30"));
        send(second.gas(), "shared-key", second.at(), reading(MetricCode.GAS, "500"));
        job.processPending();
        assertEquals(AiPredictionStatus.PENDING, only().getStatus());
        send(second.temperature(), "shared-key", second.at(), reading(MetricCode.TEMPERATURE, "28"), reading(MetricCode.HUMIDITY, "75"));
        due(); job.processPending();
        assertEquals(0, only().getTemperature().compareTo(new BigDecimal("28")));
        assertEquals(0, only().getHumidity().compareTo(new BigDecimal("75")));
    }

    @Test
    void laterPacketWaitsForEarlierIncompletePacketFromTheSameSensor() {
        Fixture set = fixture();
        send(set.gas(), "early-incomplete", set.at(), reading(MetricCode.GAS, "400"));
        fullPacket(set, "later-complete", set.at().plusSeconds(5));
        job.processPending();
        verify(model, never()).predict(any());
        assertEquals(2, predictions.countByStatus(AiPredictionStatus.PENDING));
        send(set.temperature(), "early-incomplete", set.at(), reading(MetricCode.TEMPERATURE, "24"), reading(MetricCode.HUMIDITY, "55"));
        due(); job.processPending();
        assertEquals(2, predictions.countByStatus(AiPredictionStatus.COMPLETE));
        var captured = ArgumentCaptor.forClass(AiObservation.class);
        verify(model, times(2)).predict(captured.capture());
        assertTrue(OffsetDateTime.parse(captured.getAllValues().get(0).measuredAt())
                .isBefore(OffsetDateTime.parse(captured.getAllValues().get(1).measuredAt())));
    }

    @Test
    void duplicateSensorPacketCreatesOneInferenceJob() {
        Fixture set = fixture(); fullPacket(set, "retry-key", set.at());
        job.processPending();
        send(set.gas(), "retry-key", set.at(), reading(MetricCode.GAS, "400"));
        job.processPending();
        assertEquals(1, predictions.count());
        verify(model, times(1)).predict(any());
    }

    @Test
    void modelFailurePreservesSourceRowsAndRetriesTheSameJob() {
        Fixture set = fixture(); fullPacket(set, "recover", set.at());
        doThrow(new IllegalStateException("offline"))
                .doAnswer(inv -> judgement(inv.getArgument(0), false)).when(model).predict(any());
        job.processPending();
        assertEquals(AiPredictionStatus.RETRY, only().getStatus());
        assertEquals(3, raw.count());
        assertEquals(0, alerts.count());
        due(); job.processPending();
        assertEquals(AiPredictionStatus.COMPLETE, only().getStatus());
        assertEquals(2, only().getAttempts());
        assertEquals(3, raw.count());
    }

    @Test
    void readyPredictionsCreateOneUnresolvedAiIncidentWithModelMetadata() {
        doAnswer(inv -> judgement(inv.getArgument(0), true)).when(model).predict(any());
        Fixture set = fixture(); fullPacket(set, "risk-one", set.at()); job.processPending();
        fullPacket(set, "risk-two", set.at().plusSeconds(5)); job.processPending();
        assertEquals(2, predictions.count());
        assertEquals(1, alerts.count());
        var alert = adminAlerts.getUnresolvedAlerts().get(0);
        assertEquals(AlertType.LEAK, alert.getAlertType());
        assertEquals("AI", alert.getDetectionSource());
        assertEquals("긴급", alert.getLevel());
        assertEquals(VERSION, alert.getModelVersion());
    }

    @Test
    void rollbackDoesNotLeaveAnInferenceJob() {
        Fixture set = fixture();
        tx.executeWithoutResult(status -> {
            send(set.gas(), "rollback", set.at(), reading(MetricCode.GAS, "400"));
            status.setRollbackOnly();
        });
        assertEquals(0, raw.count());
        assertEquals(0, predictions.count());
        verify(model, never()).predict(any());
    }

    @Test
    void newWorkerSessionRestoresHistoryWithoutRecreatingAlerts() {
        doAnswer(inv -> judgement(inv.getArgument(0), true)).when(model).predict(any());
        Fixture set = fixture(); fullPacket(set, "before-restart", set.at()); job.processPending();
        String firstId = only().getId().toString();
        clearInvocations(model);
        when(model.status()).thenReturn(Map.of("loaded", true, "sessionId", "restarted"));
        fullPacket(set, "after-restart", set.at().plusSeconds(5)); job.processPending();
        var captured = ArgumentCaptor.forClass(AiObservation.class);
        verify(model, times(2)).predict(captured.capture());
        assertEquals(firstId, captured.getAllValues().get(0).id());
        assertNotEquals(firstId, captured.getAllValues().get(1).id());
        assertEquals(1, alerts.count());
    }

    @Test
    void mq7CannotBeFedToTheMq135FacilityModel() {
        Fixture set = fixture();
        send(set.mq7(), "mq7-only", set.at(), reading(MetricCode.GAS, "300"));
        job.processPending();
        assertEquals(0, predictions.count());
        verify(model, never()).predict(any());
    }

    @Test
    void invalidAdcIsRecordedAsUnavailableWithoutInference() {
        Fixture set = fixture();
        send(set.temperature(), "invalid-adc", set.at(), reading(MetricCode.TEMPERATURE, "24"), reading(MetricCode.HUMIDITY, "55"));
        send(set.gas(), "invalid-adc", set.at(), reading(MetricCode.GAS, "0"));
        job.processPending();
        assertEquals(AiPredictionStatus.SKIPPED, only().getStatus());
        assertTrue(only().getError().contains("ADC"));
        verify(model, never()).predict(any());
    }

    @Test
    void directEsp32ArchiveAlsoEnqueuesAndPairsItsOwnSensors() {
        String payload = "{\"source\":\"esp32_direct\",\"mac_address\":\"02:10:20:30:40:50\","
                + "\"sample_key\":\"direct-ai\",\"measured_at\":\"" + OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5) + "\","
                + "\"dht_ok\":true,\"temperature_c\":24,\"humidity_percent\":55,\"mq135_adc\":400}";
        assertTrue(direct.receiveDirectSample(payload));
        job.processPending();
        assertEquals(AiPredictionStatus.COMPLETE, only().getStatus());
        assertEquals("mac:02:10:20:30:40:50", only().getDeviceId());
        assertEquals(3, raw.count());
    }

    @Test
    void missingPacketTimesOutWithoutInventedMeasurements() {
        Fixture set = fixture();
        send(set.gas(), "never-complete", set.at(), reading(MetricCode.GAS, "400"));
        tx.executeWithoutResult(status -> {
            var row = predictions.findAll().get(0);
            row.setQueuedAt(LocalDateTime.now(ZoneOffset.UTC).minusMinutes(10));
        });
        job.processPending();
        assertEquals(AiPredictionStatus.SKIPPED, only().getStatus());
        assertNull(only().getTemperature());
        assertNull(only().getResultJson());
        verify(model, never()).predict(any());
    }

    @Test
    void retryUsesItsSnapshotAfterRawReadingsWereRemoved() {
        Fixture set = fixture(); fullPacket(set, "expired-raw", set.at());
        doThrow(new IllegalStateException("offline"))
                .doAnswer(inv -> judgement(inv.getArgument(0), false)).when(model).predict(any());
        job.processPending();
        assertEquals(AiPredictionStatus.RETRY, only().getStatus());
        tx.executeWithoutResult(status -> raw.deleteAllInBatch());
        due(); job.processPending();
        assertEquals(AiPredictionStatus.COMPLETE, only().getStatus());
        assertEquals(0, only().getTemperature().compareTo(new BigDecimal("24")));
    }

    @Test
    void persistentModelFailureEndsAfterBoundedRetriesSoLaterPacketsProceed() {
        Fixture set = fixture();
        fullPacket(set, "poison", set.at().minusSeconds(5)); fullPacket(set, "after", set.at());
        RuntimeException[] failures = new RuntimeException[10];
        java.util.Arrays.fill(failures, new IllegalStateException("model crashes on this input"));
        doThrow(failures).doAnswer(inv -> judgement(inv.getArgument(0), false)).when(model).predict(any());
        for (int i = 0; i < 11; i++) { due(); job.processPending(); }
        var rows = predictions.findAll();
        var poison = rows.stream().filter(r -> r.getSampleKey().equals("poison")).findFirst().orElseThrow();
        var after = rows.stream().filter(r -> r.getSampleKey().equals("after")).findFirst().orElseThrow();
        assertEquals(AiPredictionStatus.SKIPPED, poison.getStatus());
        assertEquals(10, poison.getAttempts());
        assertEquals(AiPredictionStatus.COMPLETE, after.getStatus());
    }

    @Test
    void zoneManagerSeesOwnPredictionsEvenWhenOtherZonesAreNewer() throws Exception {
        Fixture own = fixture(); fullPacket(own, "own-zone", own.at().minusSeconds(30));
        String token = loginToken(); // grants only the zones that exist now
        Fixture other = fixture(); fullPacket(other, "other-1", other.at()); fullPacket(other, "other-2", other.at().plusSeconds(1));
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create("http://127.0.0.1:"
                + environment.getProperty("local.server.port") + "/api/admin/ai/predictions?limit=1"))
                .header("Authorization", "Bearer " + token).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(200, response.statusCode());
        var body = mapper.readTree(response.body());
        assertEquals(1, body.size());
        assertEquals("own-zone", body.get(0).path("sampleKey").asText());
    }

    @Test
    void predictionApiRejectsInvalidLimitAndMissingAuthorization() throws Exception {
        String base = "http://127.0.0.1:" + environment.getProperty("local.server.port");
        var client = HttpClient.newHttpClient();
        var unauthorized = client.send(HttpRequest.newBuilder(URI.create(base + "/api/admin/ai/status")).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(401, unauthorized.statusCode());
        var invalid = client.send(HttpRequest.newBuilder(URI.create(base + "/api/admin/ai/predictions?limit=0"))
                .header("Authorization", "Bearer " + loginToken()).GET().build(), HttpResponse.BodyHandlers.ofString());
        assertEquals(400, invalid.statusCode());
    }

    private AiJudgement judgement(AiObservation input, boolean ready) {
        return new AiJudgement(input.deviceId(), input.measuredAt(), ready ? "긴급" : "준비 중",
                ready ? "누수 의심" : "MQ135 예열 중", VERSION, Map.of("environment", ready),
                null, Map.of("smoking", "MQ-7 heater information unavailable"),
                ready ? List.of(new AiJudgement.AiAlert("LEAK", "긴급", "누수 의심")) : List.of());
    }
    private Fixture fixture() {
        Long zone = tx.execute(status -> {
            Zone entity = Zone.builder().name("AI test zone").zoneType(ZoneType.TOILET).isOurSolution(true).build();
            em.persist(entity); return entity.getId();
        });
        int serial = SERIAL.incrementAndGet();
        DeviceSetRequest request = new DeviceSetRequest(); request.setSetCode("AI-" + UUID.randomUUID());
        request.setMacAddress(String.format("02:00:00:00:00:%02X", serial)); request.setZoneId(zone);
        request.setInstallationLabel("AI fixture");
        var ids = sets.register(request).getSensorIds();
        return new Fixture(ids.get(SensorModel.DHT22), ids.get(SensorModel.MQ135), ids.get(SensorModel.MQ7),
                OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(20));
    }
    private void fullPacket(Fixture set, String key, OffsetDateTime at) {
        send(set.temperature(), key, at, reading(MetricCode.TEMPERATURE, "24"), reading(MetricCode.HUMIDITY, "55"));
        send(set.gas(), key, at, reading(MetricCode.GAS, "400"));
    }
    private void send(Long sensor, String key, OffsetDateTime at, SensorDataRequest.Reading... values) {
        SensorDataRequest packet = new SensorDataRequest(); packet.setSampleKey(key); packet.setMeasuredAt(at);
        // The registered test station puts its MAC on the packet, as the official firmware does.
        packet.setMacAddress(tx.execute(status -> em.find(Sensor.class, sensor).getDeviceSet().getMacAddress()));
        packet.setReadings(List.of(values)); ingestion.saveSensorData(sensor, packet);
    }
    private SensorDataRequest.Reading reading(MetricCode code, String value) {
        var reading = new SensorDataRequest.Reading(); reading.setMetricCode(code); reading.setMeasuredValue(new BigDecimal(value)); return reading;
    }
    private AiPrediction only() { assertEquals(1, predictions.count()); return predictions.findAll().get(0); }
    private void due() { tx.executeWithoutResult(status -> predictions.findAll().forEach(row -> row.setNextAttemptAt(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(1)))); }
    private record Fixture(Long temperature, Long gas, Long mq7, OffsetDateTime at) {}
}
