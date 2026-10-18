package com.tcp.cleanmanagement;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import java.sql.*;
import java.util.*;
import static org.junit.jupiter.api.Assertions.*;
@EnabledIfEnvironmentVariable(named="TCP_MYSQL_TEST_URL",matches=".+")
class MySqlMigrationTest {
    private final String base=System.getenv("TCP_MYSQL_TEST_URL");
    private final String user=System.getenv().getOrDefault("TCP_MYSQL_TEST_USER","root");
    private final String password=System.getenv().getOrDefault("TCP_MYSQL_TEST_PASSWORD","");
    private final List<String> created=new ArrayList<>();
    private String database() throws Exception {
        String name="tcp_migration_"+UUID.randomUUID().toString().replace("-","");
        try(var connection=DriverManager.getConnection(base,user,password);var statement=connection.createStatement()){statement.execute("CREATE DATABASE "+name+" CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci");}
        created.add(name);return name;
    }
    private String url(String name){return base+name+"?useSSL=false&allowPublicKeyRetrieval=true&serverTimezone=UTC";}
    private Flyway migration(String name){return Flyway.configure().dataSource(url(name),user,password).locations("classpath:db/migration").cleanDisabled(true).load();}
    private void execute(String name,String sql) throws Exception {try(var connection=DriverManager.getConnection(url(name),user,password);var statement=connection.createStatement()){statement.execute(sql);}}
    private long scalar(String name,String sql) throws Exception {try(var connection=DriverManager.getConnection(url(name),user,password);var statement=connection.createStatement();var rows=statement.executeQuery(sql)){rows.next();return rows.getLong(1);}}
    @AfterEach void cleanup() throws Exception {try(var connection=DriverManager.getConnection(base,user,password);var statement=connection.createStatement()){for(String name:created)statement.execute("DROP DATABASE "+name);}}
    @Test void freshDatabaseMigratesAndTheApplicationValidatesActualMysqlSchema() throws Exception {
        String name=database();assertEquals(4,migration(name).migrate().migrationsExecuted);migration(name).validate();assertEquals(0,migration(name).migrate().migrationsExecuted);
        try(var context=new SpringApplicationBuilder(CleanManagementApplication.class).web(WebApplicationType.NONE).run(
            "--spring.datasource.url="+url(name),"--spring.datasource.username="+user,"--spring.datasource.password="+password,
            "--spring.datasource.driver-class-name=com.mysql.cj.jdbc.Driver","--spring.jpa.properties.hibernate.dialect=org.hibernate.dialect.MySQLDialect",
            "--spring.jpa.hibernate.ddl-auto=validate","--spring.flyway.enabled=true","--app.scheduling.enabled=false","--restroom-ai.enabled=false",
            "--app.seed-demo-data=false","--app.rate-limit.store=memory","--app.auth.bootstrap-username=","--app.auth.bootstrap-password=")){
            assertTrue(context.isActive());
        }
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='sensor_data_raw' AND index_name='ix_raw_device_packet' AND seq_in_index=1"));
    }
    @Test void legacyUpgradePreservesMeasurementsAccountsAndInstallationIdentity() throws Exception {
        String name=database();Flyway.configure().dataSource(url(name),user,password).target("1").load().migrate();
        execute(name,"INSERT INTO users(id,username,password,role,created_at,updated_at) VALUES(1,'legacy','preserved-password','ADMIN',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO zones(id,name,zone_type,is_active,created_at,updated_at) VALUES(1,'preserved-zone','TOILET',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO device_sets(id,set_code,mac_address,zone_id,installation_label,created_at,updated_at) VALUES(1,'LEGACY','02:11:22:33:44:55',1,'preserved',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO sensors(id,sensor_type,sensor_model,status,zone_id,device_set_id,created_at,updated_at) VALUES(1,'GAS','MQ135','ACTIVE',1,1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO sensor_metrics(id,sensor_id,metric_code,unit_code,created_at,updated_at) VALUES(1,1,'GAS','ADC',UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO sensor_data_raw(id,metric_id,sample_key,measured_value,measured_at,received_at,time_source) VALUES(1,1,'retained',321,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6),'DEVICE')");
        execute(name,"INSERT INTO zone_permissions(user_id,zone_id,created_at) VALUES(1,1,UTC_TIMESTAMP(6)),(1,1,UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO system_settings(setting_key,setting_value,updated_at) VALUES('device_key','old-ui-value',UTC_TIMESTAMP(6))");
        assertEquals(3,migration(name).migrate().migrationsExecuted);migration(name).validate();
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM sensor_data_raw WHERE measured_value=321 AND device_mac='02:11:22:33:44:55'"));
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM users WHERE username='legacy' AND password='preserved-password' AND role='ADMIN'"));
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM zone_permissions"));assertEquals(0,scalar(name,"SELECT COUNT(*) FROM system_settings WHERE setting_key='device_key'"));
    }
    @Test void versionThreePreservesExistingWorkerAssignmentsAndAllowsInactiveSensors() throws Exception {
        String name=database();Flyway.configure().dataSource(url(name),user,password).target("2").load().migrate();
        execute(name,"INSERT INTO zones(id,name,zone_type,is_active,created_at,updated_at) VALUES(1,'assigned-zone','TOILET',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        execute(name,"INSERT INTO workers(id,name,phone,role,status,assigned_zone_id,created_at,updated_at) VALUES(1,'preserved-worker','','CLEANER','AVAILABLE',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        assertEquals(2,migration(name).migrate().migrationsExecuted);migration(name).validate();
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM zones WHERE assigned_worker_id=1 AND assigned_worker_name='preserved-worker'"));
        execute(name,"INSERT INTO sensors(id,sensor_type,status,zone_id,created_at,updated_at) VALUES(1,'GAS','INACTIVE',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM sensors WHERE status='INACTIVE'"));
    }
    @Test void versionFourPreservesUnknownMetadataInsteadOfGuessing() throws Exception {
        String name=database();Flyway.configure().dataSource(url(name),user,password).target("3").load().migrate();
        execute(name,"INSERT INTO zones(id,name,zone_type,is_active,created_at,updated_at) VALUES(1,'unknown-floor','TOILET',1,UTC_TIMESTAMP(6),UTC_TIMESTAMP(6))");
        assertEquals(1,migration(name).migrate().migrationsExecuted);
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM zones WHERE id=1 AND floor IS NULL AND gender IS NULL"));
    }
    @Test void checksumMismatchStopsValidationInsteadOfSilentlyRepairing() throws Exception {
        String name=database();var flyway=migration(name);flyway.migrate();
        execute(name,"UPDATE flyway_schema_history SET checksum=checksum+1 WHERE version='2'");
        assertThrows(org.flywaydb.core.api.exception.FlywayValidateException.class,flyway::validate);
    }
    @Test void unknownNonemptyDatabaseIsNeverAutomaticallyBaselined() throws Exception {
        String name=database();execute(name,"CREATE TABLE unrelated(id BIGINT PRIMARY KEY)");
        assertThrows(org.flywaydb.core.api.FlywayException.class,()->migration(name).migrate());
        assertEquals(1,scalar(name,"SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name='unrelated'"));
    }
}
