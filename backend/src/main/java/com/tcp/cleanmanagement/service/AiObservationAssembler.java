package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.dto.AiObservation;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Component;
import java.math.BigDecimal;
import java.time.ZoneOffset;
import java.util.*;

@Component
@RequiredArgsConstructor
public class AiObservationAssembler {
    private final SensorRepository sensors;
    private final SensorDataRawRepository readings;
    private final UpstashDeviceRepository upstashDevices;

    public Assembly assemble(AiPrediction prediction) {
        if(Boolean.FALSE.equals(prediction.getZone().getIsActive()) || Boolean.FALSE.equals(prediction.getSensor().getZone().getIsActive())) return Assembly.skip("Zone is inactive");
        // Retries reuse the accepted immutable input, even if raw retention or installation metadata changed.
        if (prediction.getAttempts() > 0 && prediction.getDeviceId() != null && prediction.getSensorModel() != null
                && prediction.getTemperature() != null && prediction.getHumidity() != null) {
            return new Assembly(new AiObservation(prediction.getId().toString(), prediction.getDeviceId(),
                    prediction.getMeasuredAt().atOffset(ZoneOffset.UTC).toString(), prediction.getTemperature(),
                    prediction.getHumidity(), prediction.getGasValue(), prediction.getSensorModel()), null, false);
        }
        Sensor gasSensor = prediction.getSensor();
        if (gasSensor.getStatus() != SensorStatus.ACTIVE) return Assembly.skip("Gas sensor is not active");
        List<Sensor> temperatureSensors;
        String device;
        if (gasSensor.getDeviceSet() != null) {
            if (gasSensor.getSensorModel() != SensorModel.MQ135) return Assembly.skip("MQ135 ADC input is required");
            temperatureSensors = sensors.findByDeviceSetIdOrderByIdAsc(gasSensor.getDeviceSet().getId()).stream()
                    .filter(s -> s.getSensorType() == SensorType.TEMP_HUMID && s.getStatus() == SensorStatus.ACTIVE).toList();
            device = "set:" + gasSensor.getDeviceSet().getId() + ":installation:"
                    + (prediction.getDeviceSetHistory() == null ? "legacy" : prediction.getDeviceSetHistory().getId());
        } else {
            var imported = upstashDevices.findByGasSensorId(gasSensor.getId());
            if (imported.isPresent()) {
                temperatureSensors = List.of(imported.get().getTemperatureHumiditySensor());
                device = "mac:" + imported.get().getMacAddress();
            } else {
                if (gasSensor.getSensorModel() != SensorModel.MQ135) return Assembly.skip("Register the gas sensor as MQ135 before AI inference");
                temperatureSensors = sensors.findByZoneIdOrderByIdAsc(prediction.getZone().getId()).stream()
                        .filter(s -> s.getSensorType() == SensorType.TEMP_HUMID && s.getStatus() == SensorStatus.ACTIVE).toList();
                device = "sensor:" + gasSensor.getId() + ":zone:" + prediction.getZone().getId();
            }
        }
        if (temperatureSensors.size() != 1) return Assembly.skip("Exactly one paired temperature/humidity sensor is required");
        Sensor temperatureSensor = temperatureSensors.get(0);
        var temperature = readings.findByMetricSensorIdAndMetricMetricCodeAndSampleKey(
                temperatureSensor.getId(), MetricCode.TEMPERATURE, prediction.getSampleKey());
        var humidity = readings.findByMetricSensorIdAndMetricMetricCodeAndSampleKey(
                temperatureSensor.getId(), MetricCode.HUMIDITY, prediction.getSampleKey());
        if (temperature.isEmpty() || humidity.isEmpty()) return Assembly.waitFor("Waiting for temperature and humidity with the same sampleKey");
        Long historyId = historyId(prediction.getDeviceSetHistory());
        if (!Objects.equals(historyId, historyId(temperature.get().getDeviceSetHistory()))
                || !Objects.equals(historyId, historyId(humidity.get().getDeviceSetHistory()))) {
            return Assembly.skip("Packet readings belong to different installations");
        }
        BigDecimal gas = prediction.getGasValue();
        if (gas.signum() <= 0 || gas.compareTo(BigDecimal.valueOf(4095)) >= 0) {
            return Assembly.skip("MQ135 must contain a valid raw 12-bit ADC value (0 < value < 4095)");
        }
        // Only the raw ADC contract used for training is accepted, never ppm/ppb concentrations.
        var metric = readings.findById(prediction.getId()).map(SensorDataRaw::getMetric);
        if (metric.isPresent() && !Set.of("UNVERIFIED", "ADC", "ADC_RAW").contains(metric.get().getUnitCode())) {
            return Assembly.skip("AI requires MQ135 raw ADC units");
        }
        String model = temperatureSensor.getSensorModel() == SensorModel.DHT22 ? "DHT22" : "DHT11";
        return new Assembly(new AiObservation(prediction.getId().toString(), device,
                prediction.getMeasuredAt().atOffset(ZoneOffset.UTC).toString(),
                temperature.get().getMeasuredValue(), humidity.get().getMeasuredValue(), gas, model), null, false);
    }

    private Long historyId(DeviceSetHistory history) { return history == null ? null : history.getId(); }
    public record Assembly(AiObservation input, String reason, boolean waiting) {
        static Assembly waitFor(String reason) { return new Assembly(null, reason, true); }
        static Assembly skip(String reason) { return new Assembly(null, reason, false); }
    }
}
