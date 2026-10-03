package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.DeviceSetRequest;
import com.tcp.cleanmanagement.dto.DeviceSetResponse;
import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.dto.DeviceSetUpdateRequest;
import com.tcp.cleanmanagement.dto.AlertResponse;
import com.tcp.cleanmanagement.entity.Alert;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.ZoneType;
import com.tcp.cleanmanagement.enums.AlertType;
import com.tcp.cleanmanagement.enums.AlertStatus;
import com.tcp.cleanmanagement.event.SensorDataSavedEvent;
import com.tcp.cleanmanagement.repository.AlertRepository;
import jakarta.persistence.EntityManager;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.HttpStatus;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.math.BigDecimal;
import java.util.EnumMap;
import java.util.Map;
import java.util.UUID;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@Transactional
class DeviceSetIntegrationTest {
    @Autowired DeviceSetService sets;
    @Autowired IotDataService ingestion;
    @Autowired ZoneRepository zones;
    @Autowired SensorRepository sensors;
    @Autowired SensorMetricRepository metrics;
    @Autowired SensorDataRawRepository raw;
    @Autowired AlertRepository alerts;
    @Autowired AdminAlertService adminAlerts;
    @Autowired EntityManager entityManager;

    @Test
    void movingAndReplacingBoardPreservesSensorIdsReadingsAndOriginalAlertLocation() {
        Zone originalZone = zone();
        Zone newZone = zone();
        DeviceSetResponse original = sets.register(registration(originalZone, "entrance"));
        Long dhtId = original.getSensorIds().get(SensorModel.DHT22);
        SensorDataRequest before = packet(original.getMacAddress(), "before-move", "-1");
        before.getReadings().get(0).setMetricCode(MetricCode.TEMPERATURE);
        ingestion.saveSensorData(dhtId, before);
        Long metricId = metrics.findBySensorIdAndMetricCode(dhtId, MetricCode.TEMPERATURE).orElseThrow().getId();
        SensorDataRaw originalData = raw.findByMetricIdAndSampleKey(metricId, "before-move").orElseThrow();
        Long originalHistoryId = originalData.getDeviceSetHistory().getId();
        Long originalDataId = originalData.getId();

        DeviceSetUpdateRequest update = new DeviceSetUpdateRequest();
        update.setZoneId(newZone.getId());
        update.setMacAddress(registration(newZone, "replacement").getMacAddress().toLowerCase());
        update.setInstallationLabel("  washbasin  ");
        DeviceSetResponse moved = sets.update(original.getDeviceSetId(), update);
        assertEquals(original.getSensorIds(), moved.getSensorIds());
        assertEquals(original.getSetCode(), moved.getSetCode());
        assertEquals("washbasin", moved.getInstallationLabel());
        assertEquals(newZone.getId(), moved.getZoneId());
        assertEquals(update.getMacAddress().toUpperCase(), moved.getMacAddress());
        for (Sensor sensor : sensors.findByDeviceSetIdOrderByIdAsc(moved.getDeviceSetId())) {
            assertEquals(newZone.getId(), sensor.getZone().getId());
        }
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> sets.configurationFor(original.getMacAddress())).getStatusCode());
        assertEquals(original.getSensorIds(), sets.configurationFor(moved.getMacAddress()).getSensorIds());
        assertEquals(HttpStatus.FORBIDDEN, assertThrows(ResponseStatusException.class,
                () -> ingestion.saveSensorData(dhtId, before)).getStatusCode());

        // A resend via the replacement board retains the original row and its installation.
        before.setMacAddress(moved.getMacAddress());
        ingestion.saveSensorData(dhtId, before);
        SensorDataRequest after = packet(moved.getMacAddress(), "after-move", "20");
        after.getReadings().get(0).setMetricCode(MetricCode.TEMPERATURE);
        ingestion.saveSensorData(dhtId, after);
        entityManager.flush();
        entityManager.clear();
        SensorDataRaw retained = raw.findById(originalDataId).orElseThrow();
        assertEquals(originalHistoryId, retained.getDeviceSetHistory().getId());
        assertEquals(originalZone.getId(), retained.getDeviceSetHistory().getZone().getId());
        assertEquals("entrance", retained.getDeviceSetHistory().getInstallationLabel());
        SensorDataRaw latest = raw.findByMetricIdAndSampleKey(metricId, "after-move").orElseThrow();
        assertEquals(newZone.getId(), latest.getDeviceSetHistory().getZone().getId());
        assertNotEquals(originalHistoryId, latest.getDeviceSetHistory().getId());

        // Simulate delayed async analysis of a reading accepted before the move.
        new AnalyticsService(raw, alerts).handleSensorDataSaved(new SensorDataSavedEvent(originalDataId));
        AlertResponse alert = adminAlerts.getUnresolvedAlerts().stream()
                .filter(value -> dhtId.equals(value.getSensorId())).findFirst().orElseThrow();
        assertEquals(originalZone.getId(), alert.getZoneId());
        assertEquals(originalZone.getName(), alert.getZoneName());
        assertEquals("entrance", alert.getInstallationLabel());
        assertEquals(originalHistoryId, alert.getDeviceSetHistoryId());

        var history = sets.history(moved.getDeviceSetId());
        assertEquals(2, history.size());
        assertEquals(newZone.getId(), history.get(0).getZoneId());
        assertEquals(original.getMacAddress(), history.get(1).getMacAddress());
    }

    @Test
    void partialUpdateKeepsOtherFieldsAndRepeatedUpdateDoesNotAddHistory() {
        DeviceSetResponse original = sets.register(registration(zone(), "entrance"));
        DeviceSetUpdateRequest update = new DeviceSetUpdateRequest();
        update.setInstallationLabel("washbasin");
        DeviceSetResponse changed = sets.update(original.getDeviceSetId(), update);
        assertEquals(original.getZoneId(), changed.getZoneId());
        assertEquals(original.getMacAddress(), changed.getMacAddress());
        assertEquals(original.getSensorIds(), changed.getSensorIds());
        update.setMacAddress(original.getMacAddress().toLowerCase());
        sets.update(original.getDeviceSetId(), update);
        assertEquals(2, sets.history(original.getDeviceSetId()).size());
    }

    @Test
    void rejectsDuplicateMacMissingZoneAndInvalidUpdatesWithoutChangingTheSet() {
        Zone zone = zone();
        DeviceSetResponse first = sets.register(registration(zone, "entrance"));
        DeviceSetResponse second = sets.register(registration(zone, "washbasin"));
        DeviceSetUpdateRequest update = new DeviceSetUpdateRequest();
        update.setMacAddress(second.getMacAddress());
        update.setInstallationLabel("should not change");
        assertEquals(HttpStatus.CONFLICT, assertThrows(ResponseStatusException.class,
                () -> sets.update(first.getDeviceSetId(), update)).getStatusCode());
        update.setMacAddress(null);
        update.setZoneId(Long.MAX_VALUE);
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> sets.update(first.getDeviceSetId(), update)).getStatusCode());
        update.setZoneId(null);
        update.setInstallationLabel("   ");
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> sets.update(first.getDeviceSetId(), update)).getStatusCode());
        assertEquals(HttpStatus.BAD_REQUEST, assertThrows(ResponseStatusException.class,
                () -> sets.update(first.getDeviceSetId(), new DeviceSetUpdateRequest())).getStatusCode());
        update.setInstallationLabel("valid");
        assertEquals(HttpStatus.NOT_FOUND, assertThrows(ResponseStatusException.class,
                () -> sets.update(Long.MAX_VALUE, update)).getStatusCode());
        assertEquals("entrance", sets.configurationFor(first.getMacAddress()).getInstallationLabel());
        assertEquals(1, sets.history(first.getDeviceSetId()).size());
    }

    @Test
    void twoSetsInOneToiletStoreIndependentValuesAndRejectCrossSetUploads() {
        Zone zone = zone();
        DeviceSetResponse first = sets.register(registration(zone, "entrance"));
        DeviceSetResponse second = sets.register(registration(zone, "washbasin"));
        Long firstMq7 = first.getSensorIds().get(SensorModel.MQ7);
        Long secondMq7 = second.getSensorIds().get(SensorModel.MQ7);
        assertNotEquals(firstMq7, secondMq7);

        SensorDataRequest firstPacket = packet(first.getMacAddress(), "same-packet", "111");
        ingestion.saveSensorData(firstMq7, firstPacket);
        ingestion.saveSensorData(secondMq7, packet(second.getMacAddress(), "same-packet", "222"));
        ingestion.saveSensorData(firstMq7, firstPacket);
        raw.flush();

        Long firstMetric = metrics.findBySensorIdAndMetricCode(firstMq7, MetricCode.GAS).orElseThrow().getId();
        Long secondMetric = metrics.findBySensorIdAndMetricCode(secondMq7, MetricCode.GAS).orElseThrow().getId();
        assertEquals(0, raw.findByMetricIdAndSampleKey(firstMetric, "same-packet").orElseThrow()
                .getMeasuredValue().compareTo(new BigDecimal("111")));
        assertEquals(0, raw.findByMetricIdAndSampleKey(secondMetric, "same-packet").orElseThrow()
                .getMeasuredValue().compareTo(new BigDecimal("222")));
        assertEquals(1, raw.findAll().stream().filter(value -> value.getMetric().getId().equals(firstMetric)).count());

        long before = raw.count();
        ResponseStatusException mismatch = assertThrows(ResponseStatusException.class,
                () -> ingestion.saveSensorData(secondMq7, packet(first.getMacAddress(), "wrong-set", "333")));
        assertEquals(HttpStatus.FORBIDDEN, mismatch.getStatusCode());
        assertEquals(before, raw.count());
    }

    @Test
    void attachingExistingSensorsPreservesTheirIdsAndReadingsAndCanBeRetried() {
        Zone zone = zone();
        Map<SensorModel, Long> ids = new EnumMap<>(SensorModel.class);
        for (SensorModel model : SensorModel.values()) {
            Sensor sensor = sensors.saveAndFlush(Sensor.builder().zone(zone)
                    .sensorType(model.sensorType()).status(SensorStatus.ACTIVE).build());
            ids.put(model, sensor.getId());
        }
        ingestion.saveSensorData(ids.get(SensorModel.MQ7), packet(null, "before-registration", "456"));
        Long metricId = metrics.findBySensorIdAndMetricCode(ids.get(SensorModel.MQ7), MetricCode.GAS)
                .orElseThrow().getId();
        Alert legacyAlert = alerts.saveAndFlush(Alert.builder().zone(zone)
                .sensor(sensors.findById(ids.get(SensorModel.MQ7)).orElseThrow())
                .alertType(AlertType.SMOKING).status(AlertStatus.UNRESOLVED).build());

        DeviceSetRequest request = registration(zone, "existing set");
        request.setExistingSensorIds(ids);
        DeviceSetResponse registered = sets.register(request);
        DeviceSetResponse retried = sets.register(request);
        assertEquals(ids, registered.getSensorIds());
        assertEquals(registered.getDeviceSetId(), retried.getDeviceSetId());
        assertEquals(3, sensors.findByDeviceSetIdOrderByIdAsc(registered.getDeviceSetId()).size());
        assertTrue(raw.findByMetricIdAndSampleKey(metricId, "before-registration").isPresent());
        assertEquals(ids, sets.configurationFor(request.getMacAddress().toLowerCase()).getSensorIds());

        entityManager.refresh(legacyAlert);
        SensorDataRaw previousReading = raw.findByMetricIdAndSampleKey(metricId, "before-registration").orElseThrow();
        entityManager.refresh(previousReading);
        assertNotNull(previousReading.getDeviceSetHistory());
        assertEquals(registered.getDeviceSetId(), previousReading.getDeviceSetHistory().getDeviceSet().getId());
        assertEquals(previousReading.getDeviceSetHistory().getId(), legacyAlert.getDeviceSetHistory().getId());

        // Existing firmware identifies its ESP32 through the MAC prefix in sampleKey.
        ingestion.saveSensorData(ids.get(SensorModel.MQ7),
                packet(null, registered.getMacAddress() + ":boot:1", "457"));
        assertTrue(raw.findByMetricIdAndSampleKey(metricId, registered.getMacAddress() + ":boot:1").isPresent());
    }

    @Test
    void registrationCannotStealSensorsAlreadyOwnedByAnotherSet() {
        Zone zone = zone();
        DeviceSetResponse first = sets.register(registration(zone, "first"));
        DeviceSetRequest second = registration(zone, "second");
        second.setExistingSensorIds(first.getSensorIds());
        ResponseStatusException conflict = assertThrows(ResponseStatusException.class, () -> sets.register(second));
        assertEquals(HttpStatus.CONFLICT, conflict.getStatusCode());
        assertEquals(first.getSensorIds(), sets.configurationFor(first.getMacAddress()).getSensorIds());
    }

    private Zone zone() {
        return zones.saveAndFlush(Zone.builder().name("set-test-" + UUID.randomUUID())
                .zoneType(ZoneType.TOILET).isOurSolution(true).build());
    }

    private DeviceSetRequest registration(Zone zone, String label) {
        String hex = UUID.randomUUID().toString().replace("-", "");
        DeviceSetRequest request = new DeviceSetRequest();
        request.setSetCode("TEST-" + UUID.randomUUID());
        request.setMacAddress("02:" + hex.substring(0, 2) + ":" + hex.substring(2, 4) + ":"
                + hex.substring(4, 6) + ":" + hex.substring(6, 8) + ":" + hex.substring(8, 10));
        request.setZoneId(zone.getId());
        request.setInstallationLabel(label);
        return request;
    }

    private SensorDataRequest packet(String mac, String key, String value) {
        SensorDataRequest.Reading reading = new SensorDataRequest.Reading();
        reading.setMetricCode(MetricCode.GAS);
        reading.setMeasuredValue(new BigDecimal(value));
        SensorDataRequest request = new SensorDataRequest();
        request.setMacAddress(mac);
        request.setSampleKey(key);
        request.setReadings(java.util.List.of(reading));
        return request;
    }
}
