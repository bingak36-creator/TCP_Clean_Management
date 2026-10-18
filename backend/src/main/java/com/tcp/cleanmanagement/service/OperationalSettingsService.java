package com.tcp.cleanmanagement.service;
import com.tcp.cleanmanagement.entity.SystemSetting;
import com.tcp.cleanmanagement.repository.SystemSettingRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import java.util.*;
@Service @RequiredArgsConstructor
public class OperationalSettingsService {
    private final SystemSettingRepository settings;
    private static final Map<String,String> DEFAULTS=Map.ofEntries(
        Map.entry("temp_warning_threshold","28"),Map.entry("temp_danger_threshold","35"),
        Map.entry("humidity_warning_threshold","70"),Map.entry("humidity_danger_threshold","85"),
        Map.entry("gas_warning_threshold","400"),Map.entry("gas_danger_threshold","700"),
        Map.entry("offline_timeout_seconds","90"),Map.entry("polling_interval_seconds","30"),
        Map.entry("clean_warning_interval_hours","4"),Map.entry("alert_cooldown_seconds","300"));
    private static final Map<String,double[]> BOUNDS=Map.ofEntries(
        Map.entry("temp_warning_threshold",new double[]{-40,80}),Map.entry("temp_danger_threshold",new double[]{-40,80}),
        Map.entry("humidity_warning_threshold",new double[]{0,100}),Map.entry("humidity_danger_threshold",new double[]{0,100}),
        Map.entry("gas_warning_threshold",new double[]{0,4095}),Map.entry("gas_danger_threshold",new double[]{0,4095}),
        Map.entry("offline_timeout_seconds",new double[]{15,86400}),Map.entry("polling_interval_seconds",new double[]{5,300}),
        Map.entry("clean_warning_interval_hours",new double[]{1,168}),Map.entry("alert_cooldown_seconds",new double[]{30,86400}));
    @Transactional(readOnly=true)
    public Map<String,String> all() {
        Map<String,String> result=new LinkedHashMap<>(DEFAULTS);
        for(var item:settings.findAll()) if(valid(item.getSettingKey(),item.getSettingValue())) {
            String key=item.getSettingKey();double value=Double.parseDouble(item.getSettingValue());
            result.put(key,key.endsWith("seconds")||key.endsWith("hours")?Long.toString((long)value):item.getSettingValue());
        }
        for(String metric:List.of("temp","humidity","gas")) if(Double.parseDouble(result.get(metric+"_warning_threshold"))>=Double.parseDouble(result.get(metric+"_danger_threshold"))) {
            result.put(metric+"_warning_threshold",DEFAULTS.get(metric+"_warning_threshold"));result.put(metric+"_danger_threshold",DEFAULTS.get(metric+"_danger_threshold"));
        }
        return result;
    }
    public double number(String key) { return Double.parseDouble(all().get(key)); }
    public int offlineSeconds() { return (int)number("offline_timeout_seconds"); }
    @Transactional
    public Map<String,String> update(Map<String,String> changes,Long actor) {
        if(changes==null || changes.isEmpty()) throw bad();
        // Validate the entire request before changing a single row.
        for(var entry:changes.entrySet()) {
            double[] range=BOUNDS.get(entry.getKey());
            if(range==null || entry.getValue()==null) throw bad();
            double value;
            try { value=Double.parseDouble(entry.getValue()); } catch(RuntimeException error) { throw bad(); }
            if(!Double.isFinite(value) || value<range[0] || value>range[1]) throw bad();
            if((entry.getKey().endsWith("seconds") || entry.getKey().endsWith("hours")) && value!=Math.rint(value)) throw bad();
        }
        Map<String,String> effective=new HashMap<>(all()); effective.putAll(changes);
        for(String metric:List.of("temp","humidity","gas"))
            if(Double.parseDouble(effective.get(metric+"_warning_threshold"))>=Double.parseDouble(effective.get(metric+"_danger_threshold"))) throw bad();
        changes.forEach((key,value)-> {
            var item=settings.findById(key).orElseGet(()->SystemSetting.builder().settingKey(key).build());
            item.setSettingValue(value); item.setUpdatedBy(actor); settings.save(item);
        });
        return all();
    }
    private boolean valid(String key,String raw){
        double[] range=BOUNDS.get(key);if(range==null || raw==null)return false;
        try{double value=Double.parseDouble(raw);return Double.isFinite(value) && value>=range[0] && value<=range[1] && (!(key.endsWith("seconds")||key.endsWith("hours")) || value==Math.rint(value));}catch(RuntimeException error){return false;}
    }
    private ResponseStatusException bad(){return new ResponseStatusException(HttpStatus.BAD_REQUEST,"Unsupported setting or value outside allowed range");}
}
