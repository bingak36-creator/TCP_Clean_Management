package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.*;
import com.tcp.cleanmanagement.enums.*;
import com.tcp.cleanmanagement.repository.*;
import org.junit.jupiter.api.*;
import org.springframework.web.server.ResponseStatusException;
import java.math.BigDecimal;
import java.time.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;
class SensorViewServiceTest {
    private final DeviceSetRepository sets=mock(DeviceSetRepository.class);
    private final UpstashDeviceRepository devices=mock(UpstashDeviceRepository.class);
    private final SensorDataRawRepository readings=mock(SensorDataRawRepository.class);
    private final OperationalSettingsService settings=mock(OperationalSettingsService.class);
    private final SensorViewService service=new SensorViewService(sets,devices,readings,settings);
    private final String mac="AA:BB:CC:DD:EE:FF";
    @BeforeEach void setup(){when(settings.offlineSeconds()).thenReturn(90);}
    private void device(){when(sets.findAllByOrderByIdAsc()).thenReturn(List.of(DeviceSet.builder().macAddress(mac).zone(Zone.builder().id(1L).name("set").build()).build()));}
    private SensorDataRaw row(String key,MetricCode code,String value,int seconds){return SensorDataRaw.builder().deviceMac(mac).sampleKey(key).measuredAt(LocalDateTime.now(ZoneOffset.UTC).minusSeconds(seconds)).receivedAt(LocalDateTime.now(ZoneOffset.UTC))
        .metric(SensorMetric.builder().metricCode(code).sensor(Sensor.builder().sensorModel(code==MetricCode.GAS?SensorModel.MQ135:SensorModel.DHT22).build()).build()).measuredValue(new BigDecimal(value)).build();}
    @Test void canonicalReadingsDriveAnOfficialDeviceSnapshot(){device();when(readings.currentSampleKeys(eq(mac),eq(1L),any(),any())).thenReturn(List.of("one"));when(readings.currentReadings(mac,1L,List.of("one"))).thenReturn(List.of(row("one",MetricCode.GAS,"244",5),row("one",MetricCode.TEMPERATURE,"24",5),row("one",MetricCode.HUMIDITY,"62",5)));
        var result=service.snapshots("mysql").get(0);assertEquals(244,result.mq135Adc().intValue());assertEquals(24,result.temperatureC().intValue());assertFalse(result.stale());assertEquals("sensor_api",result.ingestSource());}
    @Test void zeroGasAndMissingDhtRemainUnchanged(){device();when(readings.currentSampleKeys(eq(mac),eq(1L),any(),any())).thenReturn(List.of("one"));when(readings.currentReadings(mac,1L,List.of("one"))).thenReturn(List.of(row("one",MetricCode.GAS,"0",5)));var result=service.snapshots("mysql").get(0);assertEquals(0,result.mq135Adc().intValue());assertNull(result.temperatureC());assertNull(result.humidityPercent());}
    @Test void absentPacketNeverInventsMeasurements(){device();var result=service.snapshots("mysql").get(0);assertNull(result.measuredAt());assertNull(result.mq135Adc());assertTrue(result.stale());}
    @Test void rejectsOtherSourcesAndUnboundedRequestsBeforeReading(){assertThrows(ResponseStatusException.class,()->service.snapshots("upstash"));assertThrows(ResponseStatusException.class,()->service.history(mac,"mysql",169,1000));assertThrows(ResponseStatusException.class,()->service.history(mac,"mysql",1,1001));verifyNoInteractions(sets,devices,readings);}
    @Test void historyRemainsChronologicalAndMacBound(){device();when(readings.recentSampleKeys(eq(mac),any(),any())).thenReturn(List.of("new","old"));when(readings.findByDeviceMacAndSampleKeyIn(mac,List.of("new","old"))).thenReturn(List.of(row("new",MetricCode.GAS,"300",5),row("old",MetricCode.GAS,"244",30)));assertEquals(List.of("old","new"),service.history(mac.toLowerCase(),"mysql",1,200).stream().map(SensorViewService.Point::sampleKey).toList());verify(readings).findByDeviceMacAndSampleKeyIn(mac,List.of("new","old"));}
    @Test void configuredOfflineWindowIsApplied(){device();when(readings.currentSampleKeys(eq(mac),eq(1L),any(),any())).thenReturn(List.of("old"));when(readings.currentReadings(mac,1L,List.of("old"))).thenReturn(List.of(row("old",MetricCode.GAS,"244",60)));when(settings.offlineSeconds()).thenReturn(15);assertTrue(service.snapshots("mysql").get(0).stale());when(settings.offlineSeconds()).thenReturn(120);assertFalse(service.snapshots("mysql").get(0).stale());}
}
