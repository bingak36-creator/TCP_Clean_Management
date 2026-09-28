#!/usr/bin/env python3
"""Exercise the proposal on an isolated, disposable MySQL 8.0 instance."""
import datetime
import pathlib
import subprocess
import time
import uuid

ROOT = pathlib.Path(__file__).resolve().parent
NAME = "tcp-erd-check-" + uuid.uuid4().hex[:10]
results = []


def command(args, **kwargs):
    return subprocess.run(args, text=True, capture_output=True, timeout=300, **kwargs)


def sql(statement):
    return command(["docker", "exec", "-i", NAME, "mysql", "--default-character-set=utf8mb4",
                    "--batch", "--skip-column-names", "-uroot", "erd_review"], input=statement)


def ok(name, statement, expected=None):
    result = sql(statement)
    if result.returncode or (expected is not None and result.stdout.strip() != expected):
        raise AssertionError(f"{name}: {result.stderr or result.stdout}")
    results.append((name, "PASS"))


def rejected(name, statement, error):
    result = sql(statement)
    if result.returncode == 0 or f"ERROR {error}" not in result.stderr:
        raise AssertionError(f"{name}: expected MySQL {error}; {result.stderr or result.stdout}")
    results.append((name, f"PASS — {error}"))


def main():
    version = "unavailable"
    failure = None
    try:
        start = command(["docker", "run", "--detach", "--rm", "--name", NAME,
                         "--label", "tcp.erd.validation=true", "--network", "none",
                         "--tmpfs", "/var/lib/mysql:rw", "-e", "MYSQL_ALLOW_EMPTY_PASSWORD=yes",
                         "-e", "MYSQL_DATABASE=erd_review", "mysql:8.0"])
        if start.returncode:
            raise RuntimeError(start.stderr)
        for _ in range(60):
            probe = sql("SELECT VERSION();")
            if probe.returncode == 0:
                version = probe.stdout.strip()
                break
            time.sleep(1)
        else:
            raise RuntimeError("MySQL did not become ready within 60 seconds")
        ok("DDL: all tables created", ROOT.joinpath("schema.sql").read_text())
        ok("11 tables", "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema='erd_review';", "11")
        ok("13 foreign keys", "SELECT COUNT(*) FROM information_schema.referential_constraints WHERE constraint_schema='erd_review';", "13")
        ok("Fixture: users, zones, sensors, metrics", """
INSERT INTO users(id,username,password_hash,role) VALUES (1,'admin-a','test-hash','ADMIN'),(2,'admin-b','test-hash','ADMIN');
INSERT INTO zones(id,name,address,latitude,longitude,zone_type) VALUES (1,'A','Seoul',37.5,127,'TOILET'),(2,'B','Seoul',37.6,127,'SMOKING');
INSERT INTO sensors(id,zone_id,device_key,sensor_type) VALUES (1,1,'test-temp','TEMP_HUMID'),(2,1,'test-gas','GAS');
INSERT INTO sensor_metrics(id,sensor_id,metric_code,unit_code) VALUES (1,1,'TEMPERATURE','CELSIUS'),(2,1,'HUMIDITY','PERCENT'),(3,2,'GAS','UNVERIFIED');
INSERT INTO zone_permissions(user_id,zone_id) VALUES (1,1);
INSERT INTO user_devices(id,user_id,installation_id,platform,fcm_token) VALUES (1,1,'install-a','ANDROID','test-token-a');
"""
        )
        rejected("Duplicate permission", "INSERT INTO zone_permissions(user_id,zone_id) VALUES(1,1);", 1062)
        rejected("Required permission FK", "INSERT INTO zone_permissions(user_id,zone_id) VALUES(NULL,1);", 1048)
        rejected("Unknown zone FK", "INSERT INTO zone_permissions(user_id,zone_id) VALUES(1,999);", 1452)
        rejected("Duplicate FCM token", "INSERT INTO user_devices(user_id,installation_id,platform,fcm_token) VALUES(2,'install-b','IOS','test-token-a');", 1062)
        rejected("Active device needs a token", "INSERT INTO user_devices(user_id,installation_id,platform) VALUES(1,'install-c','WEB');", 3819)
        rejected("Latitude range", "UPDATE zones SET latitude=91 WHERE id=1;", 3819)
        rejected("Duplicate metric", "INSERT INTO sensor_metrics(sensor_id,metric_code,unit_code) VALUES(1,'TEMPERATURE','CELSIUS');", 1062)
        rejected("Metric unit mismatch", "UPDATE sensor_metrics SET unit_code='PERCENT' WHERE id=1;", 3819)
        rejected("Unverified GAS thresholds", "UPDATE sensor_metrics SET pleasant_threshold=10,needs_ventilation_threshold=20 WHERE id=3;", 3819)
        ok("Verified GAS thresholds", "UPDATE sensor_metrics SET unit_code='ADC',pleasant_threshold=10,needs_ventilation_threshold=20 WHERE id=3;")
        rejected("Threshold order", "UPDATE sensor_metrics SET pleasant_threshold=30 WHERE id=3;", 3819)
        ok("One packet with two metrics", """
INSERT INTO sensor_data_raw(id,metric_id,sample_key,measured_value,measured_at,time_source) VALUES
(1,1,'packet-a',-1.25,'2026-09-28 00:01:00','DEVICE'),(2,2,'packet-a',45,'2026-09-28 00:01:00','DEVICE');
"""
        )
        rejected("Duplicate metric packet", "INSERT INTO sensor_data_raw(metric_id,sample_key,measured_value,measured_at,time_source) VALUES(1,'packet-a',-1.25,'2026-09-28 00:01:00','DEVICE');", 1062)
        ok("Decimal value preserved", "SELECT measured_value FROM sensor_data_raw WHERE id=1;", "-1.250000")
        ok("Hourly and daily buckets coexist", """
INSERT INTO sensor_data_aggregated(metric_id,granularity,bucket_start,sample_count,sum_value,avg_value,min_value,max_value) VALUES
(1,'HOUR','2026-09-28 00:00:00',1,10,10,10,10),
(1,'HOUR','2026-09-28 01:00:00',3,90,30,30,30),
(1,'DAY','2026-09-28 00:00:00',4,100,25,10,30);
"""
        )
        rejected("Duplicate aggregate bucket", "INSERT INTO sensor_data_aggregated(metric_id,granularity,bucket_start,sample_count,sum_value,avg_value,min_value,max_value) VALUES(1,'HOUR','2026-09-28 00:00:00',1,10,10,10,10);", 1062)
        rejected("Misaligned bucket", "UPDATE sensor_data_aggregated SET bucket_start='2026-09-28 00:15:00' WHERE id=1;", 3819)
        rejected("Zero sample count", "UPDATE sensor_data_aggregated SET sample_count=0 WHERE id=1;", 3819)
        rejected("Invalid aggregate range", "UPDATE sensor_data_aggregated SET avg_value=100 WHERE id=1;", 3819)
        ok("Weighted daily mean: 25 rather than 20", "SELECT CAST(SUM(sum_value)/SUM(sample_count) AS DECIMAL(10,2)) FROM sensor_data_aggregated WHERE granularity='HOUR';", "25.00")
        alert = """INSERT INTO alerts(id,zone_id,trigger_reading_id,alert_type,message,detector_version,evidence,first_detected_at,last_detected_at)
VALUES({id},1,1,'FREEZE','test freeze','threshold-v1',JSON_OBJECT('metric_code','TEMPERATURE','unit_code','CELSIUS','measured_value',-1.25,'threshold',0),'2026-09-28 00:01:00','2026-09-28 00:01:00');"""
        ok("Initial unresolved alert", alert.format(id=1))
        rejected("Only one open zone/type alert", alert.format(id=2), 1062)
        rejected("Resolved alert needs timestamp", "UPDATE alerts SET status='RESOLVED' WHERE id=1;", 3819)
        rejected("Evidence must be object", "UPDATE alerts SET evidence=JSON_ARRAY(1,2) WHERE id=1;", 3819)
        ok("Resolve and allow recurrence", "UPDATE alerts SET status='RESOLVED',resolved_at='2026-09-28 01:00:00' WHERE id=1;" + alert.format(id=2))
        ok("Multiple resolved histories allowed", "UPDATE alerts SET status='RESOLVED',resolved_at='2026-09-28 02:00:00' WHERE id=2;" + alert.format(id=3))
        ok("Deleting raw preserves alert evidence", "DELETE FROM sensor_data_raw WHERE id=1; SELECT CONCAT(trigger_reading_id IS NULL,':',JSON_UNQUOTE(JSON_EXTRACT(evidence,'$.metric_code'))) FROM alerts WHERE id=1;", "1:TEMPERATURE")
        rejected("Historical zone cannot be deleted", "DELETE FROM zones WHERE id=1;", 1451)
        ok("Action with existing administrator", "INSERT INTO action_logs(alert_id,admin_id,action_type,action_detail,request_key) VALUES(1,1,'RESOLVE','Checked on site','resolve-1');")
        rejected("Duplicate action request", "INSERT INTO action_logs(alert_id,admin_id,action_type,action_detail,request_key) VALUES(1,1,'RESOLVE','Checked','resolve-1');", 1062)
        rejected("Nonexistent administrator", "INSERT INTO action_logs(alert_id,admin_id,action_type,action_detail,request_key) VALUES(1,999,'NOTE','Checked','note-1');", 1452)
        rejected("Empty action detail", "INSERT INTO action_logs(alert_id,admin_id,action_type,action_detail,request_key) VALUES(1,1,'NOTE','   ','note-2');", 3819)
        ok("Notification outbox row", "INSERT INTO notification_deliveries(id,alert_id,user_device_id) VALUES(1,3,1);")
        rejected("Duplicate alert/device delivery", "INSERT INTO notification_deliveries(alert_id,user_device_id) VALUES(3,1);", 1062)
        rejected("SENT requires sent_at", "UPDATE notification_deliveries SET status='SENT' WHERE id=1;", 3819)
        rejected("SENDING requires lease", "UPDATE notification_deliveries SET status='SENDING' WHERE id=1;", 3819)
        ok("Claim and complete notification", "UPDATE notification_deliveries SET status='SENDING',lease_token='worker-a',locked_until='2026-09-28 01:00:00',attempt_count=1 WHERE id=1; UPDATE notification_deliveries SET status='SENT',sent_at='2026-09-28 00:59:00',lease_token=NULL,locked_until=NULL WHERE id=1 AND lease_token='worker-a'; SELECT status FROM notification_deliveries WHERE id=1;", "SENT")
    except Exception as exc:
        failure = str(exc)
        results.append(("Validation error", "FAIL: " + failure))
    finally:
        command(["docker", "rm", "--force", NAME])
    now = datetime.datetime.now(datetime.timezone.utc).isoformat(timespec="seconds")
    report = ["# ERD 검증 결과", "", f"- 실행 시각: {now}", f"- DB: MySQL {version}",
              "- 환경: network=none, 포트 공개 없음, tmpfs 데이터 디렉터리, 검증 후 컨테이너 제거",
              f"- 결과: {len(results)}개 확인, {'실패 있음' if failure else '전체 통과'}", "",
              "| 확인 항목 | 결과 |", "| --- | --- |"]
    report.extend(f"| {name} | {status.replace('|', '/')} |" for name, status in results)
    report += ["", "이 검증은 목표 DDL의 생성·제약 동작을 확인한다. 기존 Spring 애플리케이션과의 통합, 인증·권한 검사, FCM 실제 전송, 마이그레이션 및 부하 테스트는 포함하지 않는다.", ""]
    ROOT.joinpath("validation.md").write_text("\n".join(report))
    print("\n".join(f"{state}: {name}" for name, state in results))
    if failure:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
