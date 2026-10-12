package com.tcp.cleanmanagement.config;

import com.tcp.cleanmanagement.entity.Sensor;
import com.tcp.cleanmanagement.entity.SensorDataRaw;
import com.tcp.cleanmanagement.entity.Zone;
import com.tcp.cleanmanagement.enums.SensorStatus;
import com.tcp.cleanmanagement.enums.SensorType;
import com.tcp.cleanmanagement.enums.ZoneType;
import com.tcp.cleanmanagement.repository.SensorDataRawRepository;
import com.tcp.cleanmanagement.repository.SensorRepository;
import com.tcp.cleanmanagement.repository.ZoneRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.boot.CommandLineRunner;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDateTime;

@Component
@RequiredArgsConstructor
public class DummyDataInitializer implements CommandLineRunner {

    private final ZoneRepository zoneRepository;
    private final SensorRepository sensorRepository;
    private final SensorDataRawRepository sensorDataRawRepository;

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

            Sensor sensor1 = Sensor.builder().zone(zone1).sensorType(SensorType.GAS).status(SensorStatus.ACTIVE).build();
            Sensor sensor2 = Sensor.builder().zone(zone2).sensorType(SensorType.GAS).status(SensorStatus.ACTIVE).build();
            Sensor sensor3 = Sensor.builder().zone(zone1).sensorType(SensorType.TEMP_HUMID).status(SensorStatus.ACTIVE).build();
            sensorRepository.save(sensor1);
            sensorRepository.save(sensor2);
            sensorRepository.save(sensor3);

            SensorDataRaw data1 = SensorDataRaw.builder()
                    .sensor(sensor1)
                    .value1(10.0f) // Gas (low)
                    .measuredAt(LocalDateTime.now())
                    .build();
            
            SensorDataRaw data2 = SensorDataRaw.builder()
                    .sensor(sensor2)
                    .value1(300.0f) // Gas (high)
                    .measuredAt(LocalDateTime.now())
                    .build();

            sensorDataRawRepository.save(data1);
            sensorDataRawRepository.save(data2);
            
            System.out.println("[DummyDataInitializer] Dummy Zones, Sensors, and Data generated.");
        }
    }
}
