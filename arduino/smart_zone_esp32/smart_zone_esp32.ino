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

Preferences preferences;
Ticker ticker;

// 전역 객체로 선언하여 언제든 설정 창을 띄울 수 있게 합니다.
WiFiManager wm;
// 도메인 주소가 들어갈 수 있도록 글자 수를 80자로 넉넉히 설정
WiFiManagerParameter custom_server_ip("serverIp", "Server Host or IP (ex: xxxx.ngrok-free.app)", "", 80);
WiFiManagerParameter custom_server_port("serverPort", "Server Port (default: 443)", "443", 6);

// 기본 외부 접속 주소 (ngrok 도메인 기본값 적용)
String serverIp = "spearmint-remover-proximity.ngrok-free.dev";
String serverPort = "443";

const int LED_PIN = 2; // 대부분의 ESP32 보드에 내장된 파란색 LED 핀 번호
const int FORCE_SETUP_PIN = 0; // ESP32 보드의 BOOT 버튼 핀

void tick() {
  // LED 상태를 반전시켜 깜빡이게 만듭니다.
  int state = digitalRead(LED_PIN);
  digitalWrite(LED_PIN, !state);
}

// 센서 ID (서버에서 MAC 주소 기반으로 발급받음)
unsigned long TEMP_HUMID_SENSOR_ID = 0;
unsigned long MQ135_SENSOR_ID = 0;
unsigned long MQ7_SENSOR_ID = 0; // 나중에 MQ-7 센서 사용 시 할당될 ID

const bool POST_TO_SERVER = true;  
const bool READ_MQ135 = true; // MQ-135 활성화
const bool READ_MQ7 = false;  // [MQ-7 센서 스위치] 나중에 사용할 때 true로 변경하세요!

const uint8_t DHT_PIN = 4;
const uint8_t MQ135_ADC_PIN = 34;  
const uint8_t MQ7_ADC_PIN = 35; // MQ-7 센서 아날로그 핀
const unsigned long SEND_INTERVAL_MS = 5000;

// DHT11 온습도 센서 설정
DHT dht(DHT_PIN, DHT11);

String deviceMac;
String deviceSetCode;
bool deviceConfigurationLoaded = false;
unsigned long lastAttemptAt = 0;
uint32_t bootNonce = 0;
uint32_t sampleSequence = 0;
String pendingTempHumidPayload;
String pendingMq135Payload;
String pendingMq7Payload;

bool shouldSaveConfig = false;
void saveConfigCallback() {
  shouldSaveConfig = true;
}

// 서버 주소 반환 (도메인 또는 IP, HTTP/HTTPS 및 ngrok/Cloudflare 자동 판별)
String getServerUrl() {
  String clean = serverIp;
  clean.trim();
  while (clean.endsWith("/")) {
    clean.remove(clean.length() - 1);
  }
  if (clean.startsWith("http://") || clean.startsWith("https://")) {
    return clean;
  }
  // ngrok 및 Cloudflare 터널, 포트 443은 HTTPS 사용
  if (serverPort == "443" || clean.indexOf(".trycloudflare.com") != -1 || clean.indexOf(".ngrok") != -1) {
    return "https://" + clean;
  }
  return "http://" + clean + ":" + serverPort;
}

void connectWifi() {
  if (WiFi.status() == WL_CONNECTED) return;

  WiFi.begin(); // 저장된 와이파이 정보로 재연결 시도
  Serial.print("Connecting to Wi-Fi");
  for (int attempt = 0; attempt < 20 && WiFi.status() != WL_CONNECTED; ++attempt) {
    delay(500);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());
  }
}

bool fetchDeviceConfiguration() {
  if (WiFi.status() != WL_CONNECTED) return false;
  
  const String url = getServerUrl() + "/api/iot/device-sets/by-mac/" + deviceMac;
  HTTPClient http;
  http.setTimeout(8000);
  int status = -1;
  String body = "";

  if (url.startsWith("https://")) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure(); // 외부 HTTPS 접속 지원 (인증서 검증 생략)
    if (!http.begin(secureClient, url)) return false;
    http.addHeader("ngrok-skip-browser-warning", "true");
    status = http.GET();
    body = status > 0 ? http.getString() : "";
    http.end();
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) return false;
    http.addHeader("ngrok-skip-browser-warning", "true");
    status = http.GET();
    body = status > 0 ? http.getString() : "";
    http.end();
  }

  if (status != 200) {
    Serial.printf("Set configuration -> %d. Target: %s (Register ESP32 MAC %s on the server)\n",
                  status, url.c_str(), deviceMac.c_str());
    return false;
  }
  if (body.length() > 2048) {
    Serial.println("Set configuration is too large");
    return false;
  }
  JsonDocument config;
  const DeserializationError error = deserializeJson(config, body);
  if (error) {
    Serial.printf("Invalid set configuration JSON: %s\n", error.c_str());
    return false;
  }

  // 온습도 센서 ID 추출 (DHT11 또는 DHT22 키 지원)
  unsigned long dhtId = 0;
  if (config["sensorIds"]["DHT11"].is<unsigned long>()) {
    dhtId = config["sensorIds"]["DHT11"].as<unsigned long>();
  } else if (config["sensorIds"]["DHT22"].is<unsigned long>()) {
    dhtId = config["sensorIds"]["DHT22"].as<unsigned long>();
  }

  if (dhtId == 0 || !config["sensorIds"]["MQ135"].is<unsigned long>()) {
    Serial.println("Set configuration is missing sensor IDs (DHT or MQ135)");
    return false;
  }

  const unsigned long mq135Id = config["sensorIds"]["MQ135"].as<unsigned long>();

  // MQ-7 ID가 서버 설정에 포함되어 있으면 함께 저장
  unsigned long mq7Id = 0;
  if (config["sensorIds"]["MQ7"].is<unsigned long>()) {
    mq7Id = config["sensorIds"]["MQ7"].as<unsigned long>();
  }

  const String configuredMac = config["macAddress"].as<String>();
  const String setCode = config["setCode"].as<String>();
  if (!configuredMac.equalsIgnoreCase(deviceMac) || setCode.length() == 0 ||
      dhtId == 0 || mq135Id == 0 || dhtId == mq135Id) {
    Serial.println("Set configuration contains invalid or duplicate sensor IDs");
    return false;
  }

  TEMP_HUMID_SENSOR_ID = dhtId;
  MQ135_SENSOR_ID = mq135Id;
  MQ7_SENSOR_ID = mq7Id;
  deviceSetCode = setCode;
  deviceConfigurationLoaded = true;
  Serial.printf("[성공] 기기 연동 완료! Set %s: DHT11=%lu, MQ135=%lu, MQ7=%lu (MQ-7 Active: %s)\n",
                deviceSetCode.c_str(), TEMP_HUMID_SENSOR_ID, MQ135_SENSOR_ID, MQ7_SENSOR_ID,
                READ_MQ7 ? "YES" : "NO");
  return true;
}

void setup() {
  Serial.begin(115200);
  
  pinMode(LED_PIN, OUTPUT);
  pinMode(FORCE_SETUP_PIN, INPUT_PULLUP); // BOOT 버튼 핀을 입력으로 설정
  
  // 와이파이 연결(또는 설정 대기) 상태임을 알리기 위해 파란색 LED를 0.2초 간격으로 빠르게 깜빡임
  ticker.attach(0.2, tick);

  dht.begin();
  analogReadResolution(12);
  analogSetPinAttenuation(MQ135_ADC_PIN, ADC_11db);
  if (READ_MQ7) {
    analogSetPinAttenuation(MQ7_ADC_PIN, ADC_11db);
  }
  WiFi.mode(WIFI_STA);
  Serial.printf("Sensors initialized: DHT11 (GPIO%u), MQ-135 (GPIO%u), MQ-7 (GPIO%u, active:%s)\n",
                DHT_PIN, MQ135_ADC_PIN, MQ7_ADC_PIN, READ_MQ7 ? "YES" : "NO");
  
  // 기기 메모리에 저장되어 있던 서버 주소를 불러옵니다.
  preferences.begin("app-config", false);
  serverIp = preferences.getString("serverIp", serverIp);
  serverPort = preferences.getString("serverPort", serverPort);

  if (POST_TO_SERVER) {
    bootNonce = esp_random();
    
    custom_server_ip.setValue(serverIp.c_str(), 80);
    custom_server_port.setValue(serverPort.c_str(), 6);

    wm.addParameter(&custom_server_ip);
    wm.addParameter(&custom_server_port);
    wm.setSaveConfigCallback(saveConfigCallback);

    // 보안: 아무나 이 임시 와이파이에 접속해서 설정을 바꾸지 못하도록 비밀번호(12345678) 설정
    if (!wm.autoConnect("ESP32_Setup", "12345678")) {
      Serial.println("Failed to connect and hit timeout");
      delay(3000);
      ESP.restart(); // 연결 실패시 기기 재부팅 후 재시도
    }

    // 와이파이에 성공적으로 연결됨!
    Serial.print("ESP32 IP: ");
    Serial.println(WiFi.localIP());

    // 스마트폰을 통해 사용자가 새 주소를 입력했다면 메모리에 저장
    if (shouldSaveConfig) {
      serverIp = custom_server_ip.getValue();
      serverPort = custom_server_port.getValue();
      preferences.putString("serverIp", serverIp);
      preferences.putString("serverPort", serverPort);
      Serial.println("Saved new Server configuration");
      shouldSaveConfig = false;
    }

    // 통신 준비가 완료되었음을 알리기 위해 깜빡임을 멈추고 LED를 계속 켜둡니다.
    ticker.detach();
    digitalWrite(LED_PIN, HIGH);

    deviceMac = WiFi.macAddress();
    Serial.printf("ESP32 station MAC: %s\n", deviceMac.c_str());
    Serial.printf("Target Server: %s\n", getServerUrl().c_str());
    fetchDeviceConfiguration();
  } else {
    deviceMac = WiFi.macAddress();
    Serial.printf("ESP32 station MAC: %s\n", deviceMac.c_str());
    ticker.detach();
    digitalWrite(LED_PIN, LOW);
  }
}

bool postReading(unsigned long sensorId, const String &payload) {
  const String url = getServerUrl() + "/api/iot/sensors/" +
                     String(sensorId) + "/data";
  HTTPClient http;
  http.setTimeout(8000);
  int status = -1;

  if (url.startsWith("https://")) {
    WiFiClientSecure secureClient;
    secureClient.setInsecure();
    if (!http.begin(secureClient, url)) {
      Serial.println("HTTPS connection setup failed");
      return false;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "true");
    status = http.POST(payload);
    Serial.printf("POST sensor %lu -> %d, %s\n", sensorId, status, payload.c_str());
    if (status != 201) Serial.println(http.getString());
    http.end();
  } else {
    WiFiClient client;
    if (!http.begin(client, url)) {
      Serial.println("HTTP connection setup failed");
      return false;
    }
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "true");
    status = http.POST(payload);
    Serial.printf("POST sensor %lu -> %d, %s\n", sensorId, status, payload.c_str());
    if (status != 201) Serial.println(http.getString());
    http.end();
  }
  return status == 201;
}

void loop() {
  // --- BOOT 버튼을 3초간 누르면 강제로 설정 창(AP 모드) 열기 ---
  static unsigned long buttonPressTime = 0;
  if (digitalRead(FORCE_SETUP_PIN) == LOW) { // 버튼이 눌렸을 때
    if (buttonPressTime == 0) {
      buttonPressTime = millis();
    } else if (millis() - buttonPressTime > 3000) { // 3초 경과
      Serial.println("BOOT button held for 3s. Starting Config Portal!");
      ticker.attach(0.2, tick); // 다시 빠르게 깜빡임 시작 (설정 모드 진입 알림)
      
      // AP 모드 강제 실행
      wm.startConfigPortal("ESP32_Setup", "12345678");
      
      // 설정이 끝난 후 바뀐 값이 있다면 메모리에 덮어쓰기
      if (shouldSaveConfig) {
        serverIp = custom_server_ip.getValue();
        serverPort = custom_server_port.getValue();
        preferences.putString("serverIp", serverIp);
        preferences.putString("serverPort", serverPort);
        Serial.println("Saved new Server configuration from portal");
        shouldSaveConfig = false;
        
        delay(1000);
        ESP.restart();
      }
      
      ticker.detach();
      digitalWrite(LED_PIN, HIGH);
      buttonPressTime = 0;
    }
  } else {
    buttonPressTime = 0;
  }

  if (millis() - lastAttemptAt < SEND_INTERVAL_MS) return;
  lastAttemptAt = millis();

  String sampleKey;
  if (POST_TO_SERVER) {
    connectWifi();
    if (!deviceConfigurationLoaded) fetchDeviceConfiguration();
    sampleKey = deviceMac + ":" + String(bootNonce, HEX) +
                ":" + String(sampleSequence++);
  }

  // 1. DHT11 온습도 측정
  const float humidity = dht.readHumidity();
  const float temperature = dht.readTemperature();
  if (isnan(temperature) || isnan(humidity)) {
    Serial.println("DHT11 read failed");
  } else {
    Serial.printf("DHT11: %.1f C, %.1f %%RH\n", temperature, humidity);
    if (POST_TO_SERVER && TEMP_HUMID_SENSOR_ID != 0 &&
        pendingTempHumidPayload.length() == 0) {
      pendingTempHumidPayload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                                "\",\"readings\":[{\"metricCode\":\"TEMPERATURE\",\"measuredValue\":" +
                                String(temperature, 1) +
                                "},{\"metricCode\":\"HUMIDITY\",\"measuredValue\":" +
                                String(humidity, 1) + "}]}";
    }
  }

  // 2. MQ-135 공기질/가스 센서 측정
  if (READ_MQ135) {
    const int raw = analogRead(MQ135_ADC_PIN);
    Serial.printf("MQ-135 ADC raw: %d\n", raw);
    if (POST_TO_SERVER && MQ135_SENSOR_ID != 0 &&
        pendingMq135Payload.length() == 0) {
      pendingMq135Payload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                            "\",\"readings\":[{\"metricCode\":\"GAS\",\"measuredValue\":" +
                            String(raw) + "}]}";
    }
  }

  // 3. MQ-7 일산화탄소 센서 측정 (READ_MQ7 = true 설정 시 동작)
  if (READ_MQ7) {
    const int raw = analogRead(MQ7_ADC_PIN);
    Serial.printf("MQ-7 ADC raw: %d\n", raw);
    if (POST_TO_SERVER && MQ7_SENSOR_ID != 0 &&
        pendingMq7Payload.length() == 0) {
      pendingMq7Payload = "{\"macAddress\":\"" + deviceMac + "\",\"sampleKey\":\"" + sampleKey +
                          "\",\"readings\":[{\"metricCode\":\"GAS\",\"measuredValue\":" +
                          String(raw) + "}]}";
    }
  }

  // 데이터 서버 전송
  if (!POST_TO_SERVER) return;
  connectWifi();
  if (WiFi.status() != WL_CONNECTED) return;

  if (pendingTempHumidPayload.length() > 0 &&
      postReading(TEMP_HUMID_SENSOR_ID, pendingTempHumidPayload)) {
    pendingTempHumidPayload = "";
  }
  if (pendingMq135Payload.length() > 0 &&
      postReading(MQ135_SENSOR_ID, pendingMq135Payload)) {
    pendingMq135Payload = "";
  }
  if (READ_MQ7 && pendingMq7Payload.length() > 0 &&
      postReading(MQ7_SENSOR_ID, pendingMq7Payload)) {
    pendingMq7Payload = "";
  }
}
