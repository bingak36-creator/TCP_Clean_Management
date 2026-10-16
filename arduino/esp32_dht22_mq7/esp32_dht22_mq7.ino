#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_random.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <Ticker.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// =============================================================================
// [1. 핀 번호 및 주요 동작 설정]
// =============================================================================
const int LED_PIN = 2;          // ESP32 내장 LED (GPIO2)
const int FORCE_SETUP_PIN = 0;  // BOOT 버튼 (GPIO0)

const uint8_t DHT_PIN = 4;        // DHT 온습도 센서 데이터 핀 (GPIO4)
const uint8_t MQ135_ADC_PIN = 34; // MQ-135 아날로그 핀 (ADC1_CH6)
const uint8_t MQ7_ADC_PIN = 35;   // MQ-7 아날로그 핀 (ADC1_CH7)

const bool POST_TO_SERVER = true;
const bool READ_MQ135 = true;    // MQ-135 활성화
const bool READ_MQ7 = true;      // MQ-7 센서 활성화 스위치 (활성화됨)

const unsigned long SEND_INTERVAL_MS = 5000; // 센서 데이터 전송 주기 (5초)

// =============================================================================
// [2. 전역 상태 및 인스턴스]
// =============================================================================
Preferences preferences;
Ticker ticker;

// 전송 대상 모드: "SERVER" (기존 스프링부트) 또는 "SUPABASE" (클라우드 DB 직접 전송)
String destMode = "SERVER";

// [모드 1] 스프링부트 서버 설정 (설정 포털 192.168.4.1 에서 입력받아 영구 저장, 기본값: 프로젝트 ngrok 도메인)
String serverIp = "spearmint-remover-proximity.ngrok-free.dev";
String serverPort = "443";

// [모드 2] 수파베이스 클라우드 DB 설정 (설정 포털 192.168.4.1 에서 입력받아 영구 저장)
String supabaseUrl = "";
String supabaseKey = "";

unsigned long TEMP_HUMID_SENSOR_ID = 0;
unsigned long MQ135_SENSOR_ID = 0;
unsigned long MQ7_SENSOR_ID = 0;

// 실제 ESP32에 연결된 물리 센서 모델 (DHT11 사용 시 11, DHT22 사용 시 22)
const uint8_t PHYSICAL_DHT_TYPE = 11;
uint8_t configuredDhtType = PHYSICAL_DHT_TYPE;
DHT dht(DHT_PIN, DHT11);

String deviceMac;
String deviceSetCode;
bool deviceConfigurationLoaded = false;
unsigned long lastSendAt = 0;
uint32_t bootNonce = 0;
uint32_t sampleSequence = 0;

// 일시적 통신 실패 시 재전송을 위한 보류 버퍼 (백엔드 sampleKey 멱등성 보장 활용)
String pendingTempHumidPayload = "";
String pendingMq135Payload = "";
String pendingMq7Payload = "";

// BOOT 버튼 폴링 감지용 변수
unsigned long btnPressStartTime = 0;
bool btnLastState = HIGH;
unsigned long lastClickTime = 0;
int clickCount = 0;

void tickLed() {
  digitalWrite(LED_PIN, !digitalRead(LED_PIN));
}

// =============================================================================
// [3. 유틸리티 및 통신 함수]
// =============================================================================

// 서버 주소 반환 (RFC 표준 포트 규격 및 ngrok / Cloudflare HTTPS 자동 처리, 후행 슬래시 제거)
String getServerUrl() {
  String clean = serverIp;
  clean.trim();
  while (clean.endsWith("/")) {
    clean.remove(clean.length() - 1);
  }
  if (clean.length() == 0) return "";
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  if (serverPort == "443" || clean.indexOf(".ngrok") != -1 || clean.indexOf(".trycloudflare.com") != -1) {
    return "https://" + clean;
  } else if (serverPort == "80" || serverPort.length() == 0) {
    return "http://" + clean;
  } else {
    return "http://" + clean + ":" + serverPort;
  }
}

// 통합 HTTP 요청 헬퍼 (ngrok 우회 헤더 포함, C++ 객체 생명주기 및 메모리 누수 방지 보장)
int sendHttpRequest(const String &method, const String &url, const String &payload, String &responseBody) {
  if (WiFi.status() != WL_CONNECTED) return -1;
  int statusCode = -1;

  if (url.startsWith("https://")) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure();
    secureClient.setTimeout(8000);
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    if (!http.begin(secureClient, url)) return -1;
    http.addHeader("ngrok-skip-browser-warning", "true");
    if (method == "POST") {
      http.addHeader("Content-Type", "application/json");
      statusCode = http.POST(payload);
    } else {
      statusCode = http.GET();
    }
    responseBody = statusCode > 0 ? http.getString() : "";
    http.end();
  } else {
    WiFiClient client;
    client.setTimeout(8000);
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_STRICT_FOLLOW_REDIRECTS);
    if (!http.begin(client, url)) return -1;
    http.addHeader("ngrok-skip-browser-warning", "true");
    if (method == "POST") {
      http.addHeader("Content-Type", "application/json");
      statusCode = http.POST(payload);
    } else {
      statusCode = http.GET();
    }
    responseBody = statusCode > 0 ? http.getString() : "";
    http.end();
  }

  return statusCode;
}

// 수파베이스 전용 HTTPS REST API 직접 전송 함수
bool postToSupabase(const String &payload) {
  if (WiFi.status() != WL_CONNECTED || supabaseUrl.length() == 0 || supabaseKey.length() == 0) return false;

  String url = supabaseUrl;
  if (!url.endsWith("/")) url += "/";
  url += "rest/v1/sensor_logs";

  WiFiClientSecure secureClient;
  secureClient.setInsecure();
  secureClient.setTimeout(8000);

  HTTPClient http;
  http.setTimeout(8000);
  if (!http.begin(secureClient, url)) return false;

  http.addHeader("Content-Type", "application/json");
  http.addHeader("apikey", supabaseKey);
  http.addHeader("Authorization", "Bearer " + supabaseKey);
  http.addHeader("Prefer", "return=minimal"); // 전송 성공 시 응답 바디 생략 (대역폭/메모리 절감)

  int statusCode = http.POST(payload);
  String resp = statusCode > 0 ? http.getString() : "";
  http.end();

  Serial.printf("[SUPABASE] 전송 -> %d, %s\n", statusCode, payload.c_str());
  if (statusCode != 201 && resp.length() > 0) {
    Serial.printf("[SUPABASE] 응답/오류: %s\n", resp.c_str());
  }
  return (statusCode == 201 || statusCode == 200 || statusCode == 204);
}

// Wi-Fi 재연결 보장
void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;
  WiFi.setTxPower(WIFI_POWER_8_5dBm);
  WiFi.reconnect();
  for (int attempt = 0; attempt < 20 && WiFi.status() != WL_CONNECTED; ++attempt) {
    delay(500);
  }
}

// =============================================================================
// [4. 스프링부트 서버 통신 함수]
// =============================================================================

// 서버에서 MAC 주소 기반 기기 세트 및 센서 ID 설정 조회
bool fetchDeviceConfiguration() {
  if (WiFi.status() != WL_CONNECTED || serverIp.length() == 0) return false;

  const String url = getServerUrl() + "/api/iot/device-sets/by-mac/" + deviceMac;
  Serial.printf("[CONFIG] 기기 설정 조회: %s\n", url.c_str());

  String body;
  int status = sendHttpRequest("GET", url, "", body);
  if (status != 200) {
    Serial.printf("[CONFIG] 서버 응답 오류 -> %d (서버에 MAC %s 등록 확인 필요)\n",
                  status, deviceMac.c_str());
    return false;
  }

  JsonDocument doc;
  if (deserializeJson(doc, body)) {
    Serial.println("[CONFIG] JSON 파싱 오류");
    return false;
  }

  // 온습도 센서 ID 조회 (서버 DB 모델 키: DHT22 또는 DHT11)
  unsigned long dhtId = 0;
  String serverDhtModel = "DHT22";
  if (doc["sensorIds"]["DHT22"].is<unsigned long>()) {
    dhtId = doc["sensorIds"]["DHT22"].as<unsigned long>();
    serverDhtModel = "DHT22";
  } else if (doc["sensorIds"]["DHT11"].is<unsigned long>()) {
    dhtId = doc["sensorIds"]["DHT11"].as<unsigned long>();
    serverDhtModel = "DHT11";
  }

  if (dhtId == 0 || !doc["sensorIds"]["MQ135"].is<unsigned long>()) {
    Serial.println("[CONFIG] 필수 센서 ID(DHT 또는 MQ135) 누락");
    return false;
  }

  // 서버 DB 모델 라벨과 무관하게, 보드에 실제 장착된 물리 센서(PHYSICAL_DHT_TYPE = 11) 프로토콜 적용
  configuredDhtType = PHYSICAL_DHT_TYPE;
  dht = DHT(DHT_PIN, configuredDhtType == 11 ? DHT11 : DHT22);
  dht.begin();

  TEMP_HUMID_SENSOR_ID = dhtId;
  MQ135_SENSOR_ID = doc["sensorIds"]["MQ135"].as<unsigned long>();
  MQ7_SENSOR_ID = doc["sensorIds"]["MQ7"].is<unsigned long>() ? doc["sensorIds"]["MQ7"].as<unsigned long>() : 0;
  deviceSetCode = doc["setCode"].as<String>();
  deviceConfigurationLoaded = true;
  lastSendAt = millis();

  Serial.printf("[CONFIG] 연동 완료 [세트: %s] 온습도(ID:%lu, 서버모델:%s, 물리작동:DHT%d), MQ135=%lu, MQ7=%lu (MQ-7:%s)\n",
                deviceSetCode.c_str(), TEMP_HUMID_SENSOR_ID, serverDhtModel.c_str(),
                configuredDhtType, MQ135_SENSOR_ID, MQ7_SENSOR_ID, READ_MQ7 ? "ON" : "OFF");
  return true;
}

// 센서 측정 데이터 서버 전송
bool postReading(unsigned long sensorId, const String &payload) {
  if (WiFi.status() != WL_CONNECTED || serverIp.length() == 0) return false;

  const String url = getServerUrl() + "/api/iot/sensors/" + String(sensorId) + "/data";
  String resp;
  int status = sendHttpRequest("POST", url, payload, resp);

  Serial.printf("[HTTP] 센서 %lu 전송 -> %d, %s\n", sensorId, status, payload.c_str());
  if (status != 201 && resp.length() > 0) {
    Serial.printf("[HTTP] 오류 내용: %s\n", resp.c_str());
  }
  return status == 201;
}

// =============================================================================
// [5. WiFiManager 포털 관리 (라디오 버튼 듀얼 모드 지원)]
// =============================================================================
void setupConfigPortal(bool forcePortal) {
  WiFiManager wm;
  wm.setConnectTimeout(20);

  // 1) 전송 모드 선택 UI (라디오 버튼 + 실시간 Show/Hide 토글 자바스크립트)
  String modeHtml =
    "<script>"
    "function toggleMode(val) {"
    "  document.getElementById('dest_mode').value = val;"
    "  var s = document.getElementById('sec_srv');"
    "  var u = document.getElementById('sec_supa');"
    "  if (s) s.style.display = (val === 'SERVER' ? 'block' : 'none');"
    "  if (u) u.style.display = (val === 'SUPABASE' ? 'block' : 'none');"
    "}"
    "</script>"
    "<br/><div style='background:#f1f5f9;padding:12px;border-radius:8px;margin-bottom:12px;'>"
    "<label style='font-weight:bold;color:#1e293b;font-size:15px;'>[전송 대상 모드 선택]</label><br/>"
    "<div style='margin-top:8px;'>"
    "<input type='radio' id='m_srv' name='dest_mode_radio' value='SERVER' " +
    String(destMode == "SERVER" ? "checked" : "") +
    " onchange=\"toggleMode('SERVER');\">"
    "<label for='m_srv' style='color:#334155;font-weight:600;'> 1. 스프링부트 서버 (기존 방식)</label><br/>"
    "<input type='radio' id='m_supa' name='dest_mode_radio' value='SUPABASE' " +
    String(destMode == "SUPABASE" ? "checked" : "") +
    " onchange=\"toggleMode('SUPABASE');\">"
    "<label for='m_supa' style='color:#059669;font-weight:600;'> 2. 수파베이스 클라우드 DB 직접 전송</label>"
    "</div></div>";

  WiFiManagerParameter custom_mode_html(modeHtml.c_str());
  WiFiManagerParameter custom_dest_mode("dest_mode", "전송모드", destMode.c_str(), 16, "style='display:none;'");

  // 스프링부트 입력 영역 (선택 시에만 노출)
  String srvStart = "<div id='sec_srv' style='display:" + String(destMode == "SERVER" ? "block" : "none") + ";'>"
                    "<hr style='margin:14px 0;'/><label style='font-weight:bold;color:#1e293b;'>[1. 스프링부트 서버 설정]</label>";
  WiFiManagerParameter custom_srv_start(srvStart.c_str());
  WiFiManagerParameter custom_server_ip("server_ip", "서버 호스트/IP (예: xxxx.ngrok-free.dev 또는 192.168.0.10)", serverIp.c_str(), 80);
  WiFiManagerParameter custom_server_port("server_port", "서버 포트 (443, 80, 8080)", serverPort.c_str(), 6);
  WiFiManagerParameter custom_srv_end("</div>");

  // 수파베이스 입력 영역 (선택 시에만 노출)
  String supaStart = "<div id='sec_supa' style='display:" + String(destMode == "SUPABASE" ? "block" : "none") + ";'>"
                     "<hr style='margin:14px 0;'/><label style='font-weight:bold;color:#059669;'>[2. 수파베이스 클라우드 설정]</label>";
  WiFiManagerParameter custom_supa_start(supaStart.c_str());
  WiFiManagerParameter custom_supa_url("supa_url", "Supabase Project URL", supabaseUrl.c_str(), 90);
  WiFiManagerParameter custom_supa_key("supa_key", "Supabase Publishable Key", supabaseKey.c_str(), 90);
  WiFiManagerParameter custom_supa_end("</div>");

  wm.addParameter(&custom_mode_html);
  wm.addParameter(&custom_dest_mode);
  wm.addParameter(&custom_srv_start);
  wm.addParameter(&custom_server_ip);
  wm.addParameter(&custom_server_port);
  wm.addParameter(&custom_srv_end);
  wm.addParameter(&custom_supa_start);
  wm.addParameter(&custom_supa_url);
  wm.addParameter(&custom_supa_key);
  wm.addParameter(&custom_supa_end);

  auto saveCallback = [&]() {
    String newMode = custom_dest_mode.getValue();
    newMode.trim();
    if (newMode == "SERVER" || newMode == "SUPABASE") {
      destMode = newMode;
      preferences.putString("destMode", destMode);
    }

    String newIp = custom_server_ip.getValue();
    String newPort = custom_server_port.getValue();
    newIp.trim();
    newPort.trim();
    if (newIp.length() > 0) {
      serverIp = newIp;
      serverPort = (newPort.length() > 0) ? newPort : "443";
      preferences.putString("serverIp", serverIp);
      preferences.putString("serverPort", serverPort);
    }

    String newSupaUrl = custom_supa_url.getValue();
    String newSupaKey = custom_supa_key.getValue();
    newSupaUrl.trim();
    newSupaKey.trim();
    if (newSupaUrl.length() > 0) {
      supabaseUrl = newSupaUrl;
      preferences.putString("supaUrl", supabaseUrl);
    }
    if (newSupaKey.length() > 0) {
      supabaseKey = newSupaKey;
      preferences.putString("supaKey", supabaseKey);
    }

    Serial.printf("[SETUP] 설정 저장: 모드=%s, 서버=%s:%s, 수파베이스=%s\n",
                  destMode.c_str(), serverIp.c_str(), serverPort.c_str(), supabaseUrl.c_str());
  };
  wm.setSaveConfigCallback(saveCallback);

  if (forcePortal) {
    ticker.attach(0.2, tickLed);
    Serial.println("\n========================================================");
    Serial.println("[SETUP] AP 설정 모드 실행 (SSID: ESP32_Setup, PW: 12345678)");
    Serial.println("[SETUP] 접속 후 브라우저(192.168.4.1)에서 [Configure WiFi]를 누르세요.");
    Serial.println("========================================================\n");
    wm.setConfigPortalTimeout(0);
    wm.startConfigPortal("ESP32_Setup", "12345678");
    saveCallback();
    ticker.detach();
    Serial.println("[SETUP] 설정 저장 완료. 기기를 재부팅합니다...");
    delay(1000);
    ESP.restart();
  } else {
    Serial.println("[INIT] 저장된 Wi-Fi로 접속 시도 중...");
    wm.setConfigPortalTimeout(120);
    if (!wm.autoConnect("ESP32_Setup", "12345678")) {
      Serial.println("[INIT] Wi-Fi 연결 실패 또는 타임아웃. AP 설정 모드로 전환합니다.");
      delay(1000);
      setupConfigPortal(true);
      return;
    }
    saveCallback();
  }

  ticker.detach();
  digitalWrite(LED_PIN, HIGH); // 정상 연결 시 LED 점등 유지
}

// BOOT 버튼 폴링 감지 (3초 길게 누름 또는 3회 연속 클릭 시 즉시 포털 진입)
void checkBootButton() {
  int currentState = digitalRead(FORCE_SETUP_PIN);

  if (currentState == LOW) {
    if (btnLastState == HIGH) {
      btnPressStartTime = millis();
    } else if (millis() - btnPressStartTime >= 3000) {
      Serial.println("\n[BOOT] 버튼 3초 누름 감지! 설정 포털을 엽니다.");
      btnPressStartTime = millis();
      btnLastState = HIGH;
      clickCount = 0;
      setupConfigPortal(true);
      return;
    }
  } else {
    if (btnLastState == LOW) {
      unsigned long pressDuration = millis() - btnPressStartTime;
      if (pressDuration >= 30 && pressDuration < 1500) {
        unsigned long now = millis();
        if (now - lastClickTime <= 600) {
          clickCount++;
        } else {
          clickCount = 1;
        }
        lastClickTime = now;

        if (clickCount >= 3) {
          Serial.println("\n[BOOT] 버튼 3회 클릭 감지! 설정 포털을 엽니다.");
          clickCount = 0;
          btnLastState = HIGH;
          setupConfigPortal(true);
          return;
        }
      }
    }
    if (clickCount > 0 && (millis() - lastClickTime > 800)) {
      clickCount = 0;
    }
  }

  btnLastState = currentState;
}

// =============================================================================
// [6. Arduino setup & loop]
// =============================================================================
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0); // 브라운아웃(순간 전압 강하) 감지기 비활성화
  Serial.begin(115200);
  delay(500);

  pinMode(LED_PIN, OUTPUT);
  pinMode(FORCE_SETUP_PIN, INPUT_PULLUP);
  pinMode(DHT_PIN, INPUT_PULLUP);

  analogReadResolution(12);
  analogSetPinAttenuation(MQ135_ADC_PIN, ADC_11db);
  if (READ_MQ7) {
    analogSetPinAttenuation(MQ7_ADC_PIN, ADC_11db);
  }

  WiFi.mode(WIFI_STA);
  WiFi.setTxPower(WIFI_POWER_8_5dBm); // 전력 소모 및 전압 강하 방지 (피크 350mA -> 120mA 절감)

  dht.begin();

  Serial.printf("Sensors initialized: DHT (GPIO%u), MQ-135 (GPIO%u), MQ-7 (GPIO%u, active:%s)\n",
                DHT_PIN, MQ135_ADC_PIN, MQ7_ADC_PIN, READ_MQ7 ? "YES" : "NO");

  preferences.begin("app-config", false);
  destMode = preferences.getString("destMode", "SERVER");
  serverIp = preferences.getString("serverIp", serverIp);
  serverPort = preferences.getString("serverPort", serverPort);
  supabaseUrl = preferences.getString("supaUrl", "");
  supabaseKey = preferences.getString("supaKey", "");

  Serial.printf("[CONFIG] 동작 모드: '%s'\n", destMode.c_str());
  if (destMode == "SUPABASE") {
    Serial.printf("[CONFIG] 저장된 수파베이스: '%s' (키 길이: %u)\n", supabaseUrl.c_str(), supabaseKey.length());
  } else {
    Serial.printf("[CONFIG] 저장된 서버: '%s:%s' (URL: %s)\n", serverIp.c_str(), serverPort.c_str(), getServerUrl().c_str());
  }

  // 모드별 필수 설정 누락 시 또는 BOOT 버튼 누른 채 부팅 시 즉시 설정 포털 실행
  bool needsConfig = (digitalRead(FORCE_SETUP_PIN) == LOW);
  if (destMode == "SUPABASE") {
    if (supabaseUrl.length() == 0 || supabaseKey.length() == 0) needsConfig = true;
  } else {
    if (serverIp.length() == 0) needsConfig = true;
  }

  bootNonce = esp_random();
  setupConfigPortal(needsConfig);

  deviceMac = WiFi.macAddress();
  Serial.printf("[INIT] Wi-Fi 연결 완료! IP: %s, MAC: %s\n",
                WiFi.localIP().toString().c_str(), deviceMac.c_str());
  Serial.printf("[INIT] 최종 활성 전송 모드: %s\n", destMode.c_str());
}

void loop() {
  // 1. BOOT 버튼 감지
  checkBootButton();

  // 2. [서버 모드]일 때만 기기 설정 최초 1회 로드
  if (destMode == "SERVER" && POST_TO_SERVER && !deviceConfigurationLoaded) {
    connectWifi();
    if (!fetchDeviceConfiguration()) {
      delay(2000);
      return;
    }
  }

  // 3. 주기별 데이터 전송 (5초 간격)
  if (millis() - lastSendAt < SEND_INTERVAL_MS) {
    delay(50); // FreeRTOS 태스크 스케줄러에 CPU 양보
    return;
  }
  lastSendAt = millis();

  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  const String sampleKey = deviceMac + ":" + String(bootNonce, HEX) +
                           ":" + String(sampleSequence++);

  // 1) 온습도 센서 측정 (DHT 공식 라이브러리)
  float humidity = dht.readHumidity();
  float temperature = dht.readTemperature();
  bool dhtOk = !isnan(temperature) && !isnan(humidity);

  if (!dhtOk) {
    // 혹시 DHT22/11 모델 불일치일 경우 대체 인스턴스로 감지 시도
    uint8_t altType = (configuredDhtType == 22) ? 11 : 22;
    DHT altDht(DHT_PIN, altType == 11 ? DHT11 : DHT22);
    altDht.begin();
    delay(100);
    float altH = altDht.readHumidity();
    float altT = altDht.readTemperature();
    if (!isnan(altT) && !isnan(altH)) {
      temperature = altT;
      humidity = altH;
      dhtOk = true;
      configuredDhtType = altType;
      dht = altDht;
    }
  }

  if (dhtOk) {
    Serial.printf("[SENSOR] DHT%d: %.1f °C, %.1f %%RH\n", configuredDhtType, temperature, humidity);
  } else {
    Serial.printf("[SENSOR] DHT%d 읽기 실패 (센서 결선 또는 응답 없음)\n", configuredDhtType);
  }

  // 2) 가스 센서 측정
  int mq135Raw = 0;
  if (READ_MQ135) {
    mq135Raw = analogRead(MQ135_ADC_PIN);
    Serial.printf("[SENSOR] MQ-135 ADC raw: %d\n", mq135Raw);
  }
  int mq7Raw = 0;
  if (READ_MQ7) {
    mq7Raw = analogRead(MQ7_ADC_PIN);
    Serial.printf("[SENSOR] MQ-7 ADC raw: %d\n", mq7Raw);
  }

  // 3) 모드에 따른 분기 전송
  if (destMode == "SUPABASE") {
    // =========================================================================
    // [모드 2] 수파베이스 클라우드 DB 직접 전송 (24시간 무중단)
    // =========================================================================
    String tempStr = dhtOk ? String(temperature, 1) : "null";
    String humStr = dhtOk ? String(humidity, 1) : "null";
    String payload = "{\"mac_address\":\"" + deviceMac + "\"" +
                     ",\"temperature\":" + tempStr +
                     ",\"humidity\":" + humStr +
                     ",\"mq135_raw\":" + String(mq135Raw) +
                     ",\"mq7_raw\":" + String(mq7Raw) +
                     ",\"sample_key\":\"" + sampleKey + "\"}";
    postToSupabase(payload);
  } else {
    // =========================================================================
    // [모드 1] 스프링부트 백엔드 서버 전송 (기존 방식)
    // =========================================================================
    if (POST_TO_SERVER) {
      if (dhtOk && TEMP_HUMID_SENSOR_ID != 0 && pendingTempHumidPayload.length() == 0) {
        pendingTempHumidPayload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                                  "\",\"readings\":[{\"metricCode\":\"TEMPERATURE\",\"measuredValue\":" +
                                  String(temperature, 1) + "},{\"metricCode\":\"HUMIDITY\",\"measuredValue\":" +
                                  String(humidity, 1) + "}]}";
      }
      if (READ_MQ135 && MQ135_SENSOR_ID != 0 && pendingMq135Payload.length() == 0) {
        pendingMq135Payload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                              "\",\"readings\":[{\"metricCode\":\"GAS\",\"measuredValue\":" +
                              String(mq135Raw) + "}]}";
      }
      if (READ_MQ7 && MQ7_SENSOR_ID != 0 && pendingMq7Payload.length() == 0) {
        pendingMq7Payload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                            "\",\"readings\":[{\"metricCode\":\"GAS\",\"measuredValue\":" +
                            String(mq7Raw) + ",\"heaterPhaseValid\":true}]}";
      }

      if (pendingTempHumidPayload.length() > 0 && postReading(TEMP_HUMID_SENSOR_ID, pendingTempHumidPayload)) {
        pendingTempHumidPayload = "";
      }
      if (pendingMq135Payload.length() > 0 && postReading(MQ135_SENSOR_ID, pendingMq135Payload)) {
        pendingMq135Payload = "";
      }
      if (pendingMq7Payload.length() > 0 && postReading(MQ7_SENSOR_ID, pendingMq7Payload)) {
        pendingMq7Payload = "";
      }
    }
  }
}
