package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.SensorMetric;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.SensorModel;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.MetricCode;
import com.tcp.cleanmanagement.enums.TimeSource;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.ZoneType;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.SensorMetricRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.math.BigDecimal;

@Component
@ConditionalOnProperty(name = "app.seed-demo-data", havingValue = "true", matchIfMissing = false)
@RequiredArgsConstructor
public class DummyDataInitializer implements CommandLineRunner {

    private final ZoneRepository zoneRepository;
    private final SensorRepository sensorRepository;
    private final SensorDataRawRepository sensorDataRawRepository;
    private final SensorMetricRepository sensorMetricRepository;

    @Override
    @Transactional
    public void run(String... args) throws Exception {
        if (zoneRepository.count() == 0) {
            Zone zone1 = Zone.builder()
                    .name("Gangnam Station Exit 1 Public Toilet")
                    .address("101 Teheran-ro, Gangnam-gu, Seoul")
                    .latitude(37.4979)
                    .longitude(127.0276)
                    .zoneType(ZoneType.TOILET)
                    .isOurSolution(true)
                    .pleasantThreshold(50.0f)
                    .build();

            Zone zone2 = Zone.builder()
                    .name("Yeoksam Station Exit 3 Smoking Area")
                    .address("152 Teheran-ro, Gangnam-gu, Seoul")
                    .latitude(37.5006)
                    .longitude(127.0364)
                    .zoneType(ZoneType.SMOKING)
                    .isOurSolution(true)
                    .pleasantThreshold(200.0f)
                    .build();

            zoneRepository.save(zone1);
            zoneRepository.save(zone2);

            Sensor sensor1 = Sensor.builder().zone(zone1).sensorType(SensorType.GAS).sensorModel(SensorModel.MQ135).status(SensorStatus.ACTIVE).build();
            Sensor sensor2 = Sensor.builder().zone(zone2).sensorType(SensorType.GAS).sensorModel(SensorModel.MQ7).status(SensorStatus.ACTIVE).build();
            Sensor sensor3 = Sensor.builder().zone(zone1).sensorType(SensorType.TEMP_HUMID).sensorModel(SensorModel.DHT22).status(SensorStatus.ACTIVE).build();
            sensorRepository.save(sensor1);
            sensorRepository.save(sensor2);
            sensorRepository.save(sensor3);

            saveGasReading(sensor1, "10");
            saveGasReading(sensor2, "300");
            saveTempHumidReading(sensor3, "24.5", "55.0");

            System.out.println("[DummyDataInitializer] Dummy Zones, Sensors, and Data generated.");
        }
    }

    private void saveGasReading(Sensor sensor, String value) {
        SensorMetric metric = sensorMetricRepository.save(SensorMetric.builder()
                .sensor(sensor).metricCode(MetricCode.GAS).unitCode("UNVERIFIED").build());
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        sensorDataRawRepository.save(SensorDataRaw.builder()
                .metric(metric).sampleKey("dummy-initial-data-" + sensor.getId())
                .measuredValue(new BigDecimal(value))
                .measuredAt(now).receivedAt(now).timeSource(TimeSource.SERVER).build());
    }

    private void saveTempHumidReading(Sensor sensor, String temp, String humid) {
        LocalDateTime now = LocalDateTime.now(ZoneOffset.UTC);
        SensorMetric tempMetric = sensorMetricRepository.save(SensorMetric.builder()
                .sensor(sensor).metricCode(MetricCode.TEMPERATURE).unitCode("CELSIUS").build());
        sensorDataRawRepository.save(SensorDataRaw.builder()
                .metric(tempMetric).sampleKey("dummy-init-temp-" + sensor.getId())
                .measuredValue(new BigDecimal(temp))
                .measuredAt(now).receivedAt(now).timeSource(TimeSource.SERVER).build());

        SensorMetric humidMetric = sensorMetricRepository.save(SensorMetric.builder()
                .sensor(sensor).metricCode(MetricCode.HUMIDITY).unitCode("PERCENT").build());
        sensorDataRawRepository.save(SensorDataRaw.builder()
                .metric(humidMetric).sampleKey("dummy-init-humid-" + sensor.getId())
                .measuredValue(new BigDecimal(humid))
                .measuredAt(now).receivedAt(now).timeSource(TimeSource.SERVER).build());
    }
}
