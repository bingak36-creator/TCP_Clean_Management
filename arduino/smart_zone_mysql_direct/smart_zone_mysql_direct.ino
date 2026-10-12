#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHTesp.h>
#include <HTTPClient.h>
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <WiFiManager.h>
#include <esp_random.h>
#include <time.h>
#include "device_config.h"

// ESP32 -> authenticated HTTP API -> MySQL. No Upstash client or DB password.
constexpr uint8_t DHT_PIN = 4;
constexpr uint8_t MQ135_PIN = 34;
constexpr uint8_t FORCE_SETUP_PIN = 0;
constexpr unsigned long SEND_INTERVAL_MS = 30000;
constexpr unsigned long RETRY_INTERVAL_MS = 10000;
DHTesp dht;
WiFiManager wm;
String deviceMac;
String pendingSample;
String pendingKey;
uint32_t bootNonce;
uint32_t sequence = 0;
uint32_t lastAttemptAt = 0;
bool firstAttempt = true;

bool clockReady() { return time(nullptr) >= 1700000000; }

bool sendWithClient(WiFiClient &client, const String &url) {
  HTTPClient http;
  http.setTimeout(10000);
  http.setConnectTimeout(8000);
  http.setReuse(false);
  if (!http.begin(client, url)) return false;
  http.addHeader("Content-Type", "application/json");
  http.addHeader("X-Device-Key", DEVICE_API_KEY);
  const int status = http.POST(pendingSample);
  const String body = status > 0 ? http.getString() : "";
  http.end();
  if (status != 200 && status != 201) {
    Serial.printf("POST MySQL API -> %d; retaining sample for retry\n", status);
    return false;
  }
  JsonDocument reply;
  if (deserializeJson(reply, body) || !reply["stored"].as<bool>() ||
      reply["destination"].as<String>() != "mysql" || reply["sampleKey"].as<String>() != pendingKey) {
    Serial.println("MySQL API did not acknowledge this sample; retrying");
    return false;
  }
  Serial.printf("POST MySQL API -> %d; confirmed=%s\n", status, pendingKey.c_str());
  Serial.println(pendingSample);
  return true;
}

bool postToMySqlApi() {
  const String url = String(BACKEND_BASE_URL) + "/api/iot/esp32";
  if (url.startsWith("https://")) {
    if (strlen(BACKEND_ROOT_CA) == 0) {
      Serial.println("HTTPS requires BACKEND_ROOT_CA; upload paused");
      return false;
    }
    WiFiClientSecure client;
    client.setCACert(BACKEND_ROOT_CA);
    client.setHandshakeTimeout(12);
    return sendWithClient(client, url);
  }
  if (!url.startsWith("http://")) return false;
  WiFiClient client;
  return sendWithClient(client, url);
}

void setup() {
  Serial.begin(115200);
  pinMode(2, OUTPUT);
  pinMode(FORCE_SETUP_PIN, INPUT_PULLUP);
  dht.setup(DHT_PIN, DHTesp::DHT11);
  analogReadResolution(12);
  analogSetPinAttenuation(MQ135_PIN, ADC_11db);
  WiFi.mode(WIFI_STA);
  wm.setConnectTimeout(20);
  wm.setConfigPortalTimeout(180);
  if (!wm.autoConnect("ESP32_Setup", "12345678")) {
    Serial.println("Wi-Fi setup timed out; restarting");
    delay(1000);
    ESP.restart();
  }
  deviceMac = WiFi.macAddress();
  bootNonce = esp_random();
  Serial.printf("ESP32 MAC: %s\n", deviceMac.c_str());
  Serial.printf("MySQL API destination: %s\n", BACKEND_BASE_URL);
  Serial.println("DHT11 GPIO4 / MQ-135 GPIO34; MQ-7 disabled");
  configTime(0, 0, "pool.ntp.org", "time.google.com", "time.cloudflare.com");
  for (int attempt = 0; attempt < 30 && !clockReady(); ++attempt) delay(500);
  digitalWrite(2, HIGH);
}

void loop() {
  delay(10);
  static uint32_t pressedAt = 0;
  if (digitalRead(FORCE_SETUP_PIN) == LOW) {
    if (pressedAt == 0) pressedAt = millis();
    else if (millis() - pressedAt > 3000) {
      wm.startConfigPortal("ESP32_Setup", "12345678");
      ESP.restart();
    }
  } else pressedAt = 0;
  const uint32_t interval = pendingSample.isEmpty() ? SEND_INTERVAL_MS : RETRY_INTERVAL_MS;
  if (!firstAttempt && millis() - lastAttemptAt < interval) return;
  firstAttempt = false;
  lastAttemptAt = millis();
  if (WiFi.status() != WL_CONNECTED) { WiFi.reconnect(); return; }
  if (!clockReady()) { Serial.println("Waiting for network time"); return; }
  if (pendingSample.isEmpty()) {
    TempAndHumidity measured = dht.getTempAndHumidity();
    const time_t capturedAt = time(nullptr);
    struct tm utc;
    gmtime_r(&capturedAt, &utc);
    char iso[25];
    strftime(iso, sizeof(iso), "%Y-%m-%dT%H:%M:%SZ", &utc);
    pendingKey = deviceMac + ":" + String(bootNonce, HEX) + ":" + String(sequence++);
    JsonDocument sample;
    sample["source"] = "esp32_direct";
    sample["mac_address"] = deviceMac;
    sample["sample_key"] = pendingKey;
    sample["measured_at"] = iso;
    sample["uptime_ms"] = millis();
    sample["dht_ok"] = !isnan(measured.temperature) && !isnan(measured.humidity);
    if (sample["dht_ok"].as<bool>()) {
      sample["temperature_c"] = measured.temperature;
      sample["humidity_percent"] = measured.humidity;
    } else {
      sample["temperature_c"] = nullptr;
      sample["humidity_percent"] = nullptr;
    }
    sample["mq135_adc"] = analogRead(MQ135_PIN);
    serializeJson(sample, pendingSample);
  }
  if (postToMySqlApi()) { pendingSample = ""; pendingKey = ""; }
}
