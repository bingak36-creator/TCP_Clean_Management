package com.tcp.cleanmanagement.service;

import com.tcp.cleanmanagement.controller.AiPredictionController;
import com.tcp.cleanmanagement.dto.SensorDataRequest;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.job.AiPredictionJob;
import com.tcp.cleanmanagement.repository.AiPredictionRepository;
import jakarta.persistence.EntityManager;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest(properties = {"restroom-ai.enabled=true",
        "spring.datasource.url=jdbc:h2:mem:ai_real_models;MODE=MySQL;DB_CLOSE_DELAY=-1"})
class AiRealModelPipelineTest {
    @Autowired EntityManager em;
    @Autowired PlatformTransactionManager manager;
    @Autowired IotDataService ingestion;
    @Autowired AiPredictionJob job;
    @Autowired AiPredictionRepository predictions;
    @Autowired AiPredictionController controller;
    @Autowired AiModelClient model;

    @Test
    void actualStoredSensorPacketIsJudgedByTheBundledPythonModels() {
        var tx = new TransactionTemplate(manager);
        Long gasId = tx.execute(status -> {
            Zone zone = Zone.builder().name("Real AI model smoke test").zoneType(ZoneType.TOILET).build();
            em.persist(zone);
            Sensor temperature = Sensor.builder().zone(zone).sensorType(SensorType.TEMP_HUMID)
                    .sensorModel(SensorModel.DHT22).status(SensorStatus.ACTIVE).build();
            Sensor gas = Sensor.builder().zone(zone).sensorType(SensorType.GAS)
                    .sensorModel(SensorModel.MQ135).status(SensorStatus.ACTIVE).build();
            em.persist(temperature); em.persist(gas);
            OffsetDateTime at = OffsetDateTime.now(ZoneOffset.UTC).minusSeconds(5);
            save(temperature.getId(), at, reading(MetricCode.TEMPERATURE, "24"), reading(MetricCode.HUMIDITY, "91"));
            save(gas.getId(), at, reading(MetricCode.GAS, "400"));
            return gas.getId();
        });
        assertEquals(true, model.status().get("loaded"));
        assertEquals(1, predictions.count());
        job.processPending();
        var request=new org.springframework.mock.web.MockHttpServletRequest();
        request.setAttribute(com.tcp.cleanmanagement.security.AuthPrincipal.ATTRIBUTE,new com.tcp.cleanmanagement.security.AuthPrincipal(1L,"test-developer",Role.DEVELOPER,List.of()));
        org.springframework.web.context.request.RequestContextHolder.setRequestAttributes(new org.springframework.web.context.request.ServletRequestAttributes(request));
        AiPredictionController.Prediction result;
        try {result=controller.latest(gasId);}finally{org.springframework.web.context.request.RequestContextHolder.resetRequestAttributes();}
        assertEquals("COMPLETE", result.status());
        assertEquals("environment-v3-indoor-22-mixed", result.judgement().modelVersion());
        assertFalse(result.judgement().ready().get("environment"));
        assertEquals("준비 중", result.level());
        assertTrue(result.judgement().alerts().isEmpty());
        assertTrue(result.judgement().unavailable().containsKey("smoking"));
    }

    private void save(Long id, OffsetDateTime at, SensorDataRequest.Reading... values) {
        var request = new SensorDataRequest(); request.setSampleKey("real-model-packet");
        request.setMeasuredAt(at); request.setReadings(List.of(values)); ingestion.saveSensorData(id, request);
    }
    private SensorDataRequest.Reading reading(MetricCode code, String value) {
        var reading = new SensorDataRequest.Reading(); reading.setMetricCode(code);
        reading.setMeasuredValue(new BigDecimal(value)); return reading;
    }
}
