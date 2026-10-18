#include <Arduino.h>
#include <ArduinoJson.h>
#include <DHT.h>
#include <HTTPClient.h>
#include <LittleFS.h>
#include <time.h>
#include "DurableQueue.h"
#include <WiFi.h>
#include <WiFiClientSecure.h>
#include <esp_random.h>
#include <Preferences.h>
#include <WiFiManager.h>
#include <Ticker.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

#if __has_include("device_config.h")
#include "device_config.h"
#endif
#ifndef TCP_SERVER_ROOT_CA
#define TCP_SERVER_ROOT_CA ""
#endif
#ifndef TCP_ALLOW_LAN_HTTP
#define TCP_ALLOW_LAN_HTTP false
#endif
#ifndef TCP_SUPABASE_ROOT_CA
#define TCP_SUPABASE_ROOT_CA ""
#endif


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

// [모드 1] 스프링부트 서버 설정 (설정 포털 192.168.4.1 에서 입력받아 영구 저장)
// 기본 호스트를 비워 두면 첫 부팅 시 포털이 열린다. 공인 HTTP 주소는 sendHttpRequest가 거부하므로 HTTPS(443)가 기본이다.
String serverIp = "";
String serverPort = "443";
String deviceApiKey = "";
String gpsLat = "", gpsLng = "";
bool gpsSent = true;
unsigned long lastLocationAttempt = 0, lastDiscoveryAttempt = 0;
bool validGps(const String &latText,const String &lngText) {
  char *latEnd=nullptr,*lngEnd=nullptr;
  double lat=strtod(latText.c_str(),&latEnd),lng=strtod(lngText.c_str(),&lngEnd);
  return latText.length()>0 && lngText.length()>0 && latEnd && lngEnd && *latEnd==0 && *lngEnd==0
    && isfinite(lat) && isfinite(lng) && lat>=-90 && lat<=90 && lng>=-180 && lng<=180;
}


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

// Persistent packet queue: an acknowledged sensor is removed only after an atomic update.
class FlashQueueStorage : public tcpqueue::Storage {
public:
  std::vector<std::string> files() override {
    std::vector<std::string> result;File directory=LittleFS.open("/q");
    if(!directory || !directory.isDirectory())return result;
    File file=directory.openNextFile();
    while(file){String path=file.path();if(!file.isDirectory() && path.endsWith(".pkt"))result.emplace_back(path.c_str());file=directory.openNextFile();}
    return result;
  }
  bool read(const std::string &name,std::string &value) override {
    File file=LittleFS.open(name.c_str(),"r");if(!file || file.size()>16384)return false;
    value.clear();value.reserve(file.size());while(file.available())value.push_back((char)file.read());file.close();return true;
  }
  bool atomicWrite(const std::string &name,const std::string &value) override {
    std::string temp=name+".tmp";File file=LittleFS.open(temp.c_str(),"w");if(!file)return false;
    size_t written=file.write((const uint8_t*)value.data(),value.size());file.flush();file.close();
    return written==value.size() && LittleFS.rename(temp.c_str(),name.c_str());
  }
  bool remove(const std::string &name) override {return LittleFS.remove(name.c_str());}
  size_t usedBytes() override {return LittleFS.usedBytes();}
};
FlashQueueStorage flashQueueStorage;
tcpqueue::DurableQueue packetQueue(flashQueueStorage);
bool queueReady=false;
unsigned long nextQueueAttempt=0;
unsigned long lastConfigAttempt=0;

void initializeQueue(){
  queueReady=LittleFS.begin(false);
  // Only an unused partition may be initialized automatically. Never format a known queue on mount failure.
  if(!queueReady && !preferences.getBool("queueInit",false)){
    queueReady=LittleFS.format() && LittleFS.begin(false);
  }
  if(!queueReady){Serial.println("[QUEUE] 저장소 오류: 자동 포맷하지 않습니다. 측정을 중단합니다.");return;}
  preferences.putBool("queueInit",true);LittleFS.mkdir("/q");
  File directory=LittleFS.open("/q");File file=directory.openNextFile();std::vector<std::string> temporary;
  while(file){String path=file.path();if(path.endsWith(".tmp"))temporary.emplace_back(path.c_str());file=directory.openNextFile();}
  for(const auto &temp:temporary){
    std::string target=temp.substr(0,temp.size()-4),value;std::vector<tcpqueue::Reading> rows;
    if(!LittleFS.exists(target.c_str()) && flashQueueStorage.read(temp,value) && tcpqueue::DurableQueue::decode(value,rows))LittleFS.rename(temp.c_str(),target.c_str());
    else if(LittleFS.exists(target.c_str()))LittleFS.remove(temp.c_str());
  }
}

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
  const bool discovery = url == getServerUrl() + "/api/iot/discovery";
  if (WiFi.status() != WL_CONNECTED || (!discovery && deviceApiKey.length() == 0) || deviceMac.length() == 0) return -1;
  // Never send credentials over public HTTP. LAN HTTP requires an explicit build option.
  if (!url.startsWith("https://")) {
    String host = url.startsWith("http://") ? url.substring(7) : "";
    int end = host.indexOf('/'); if (end >= 0) host = host.substring(0, end);
    end = host.indexOf(':'); if (end >= 0) host = host.substring(0, end);
    IPAddress ip;
    bool privateIp = ip.fromString(host) && (ip[0] == 10
      || (ip[0] == 172 && ip[1] >= 16 && ip[1] <= 31)
      || (ip[0] == 192 && ip[1] == 168));
    if (!TCP_ALLOW_LAN_HTTP || !privateIp) {
      Serial.println("[AUTH] 서버 전송에는 HTTPS와 신뢰할 CA가 필요합니다.");
      return -1;
    }
  }
  int statusCode = -1;

  if (url.startsWith("https://")) {
    WiFiClientSecure secureClient;
    if (strlen(TCP_SERVER_ROOT_CA) == 0) {
      Serial.println("[AUTH] device_config.h에 서버 CA를 설정하세요.");
      return -1;
    }
    secureClient.setCACert(TCP_SERVER_ROOT_CA);
    secureClient.setTimeout(8000);
    HTTPClient http;
    http.setTimeout(8000);
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(secureClient, url)) return -1;
    http.addHeader("ngrok-skip-browser-warning", "true");
    if(!discovery) {
      http.addHeader("X-Device-Key", deviceApiKey);
      http.addHeader("X-Device-Mac", deviceMac);
    }
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
    http.setFollowRedirects(HTTPC_DISABLE_FOLLOW_REDIRECTS);
    if (!http.begin(client, url)) return -1;
    http.addHeader("ngrok-skip-browser-warning", "true");
    if(!discovery) {
      http.addHeader("X-Device-Key", deviceApiKey);
      http.addHeader("X-Device-Mac", deviceMac);
    }
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

  // The anon key must never travel over an unverified TLS connection.
  if (strlen(TCP_SUPABASE_ROOT_CA) == 0) {
    Serial.println("[AUTH] device_config.h에 TCP_SUPABASE_ROOT_CA를 설정하세요.");
    return false;
  }
  WiFiClientSecure secureClient;
  secureClient.setCACert(TCP_SUPABASE_ROOT_CA);
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
  static unsigned long previous=0;
  if(WiFi.status()==WL_CONNECTED || millis()-previous<30000)return;
  previous=millis();WiFi.reconnect();
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
  preferences.putULong("tempId",TEMP_HUMID_SENSOR_ID);
  preferences.putULong("mq135Id",MQ135_SENSOR_ID);
  preferences.putULong("mq7Id",MQ7_SENSOR_ID);
  lastSendAt = millis();

  Serial.printf("[CONFIG] 연동 완료 [세트: %s] 온습도(ID:%lu, 서버모델:%s, 물리작동:DHT%d), MQ135=%lu, MQ7=%lu (MQ-7:%s)\n",
                deviceSetCode.c_str(), TEMP_HUMID_SENSOR_ID, serverDhtModel.c_str(),
                configuredDhtType, MQ135_SENSOR_ID, MQ7_SENSOR_ID, READ_MQ7 ? "ON" : "OFF");
  return true;
}

// 센서 측정 데이터 서버 전송
tcpqueue::SendResult postReading(unsigned long sensorId, const String &payload) {
  if (WiFi.status() != WL_CONNECTED || serverIp.length() == 0) return tcpqueue::SendResult::Retry;

  const String url = getServerUrl() + "/api/iot/sensors/" + String(sensorId) + "/data";
  String resp;
  int status = sendHttpRequest("POST", url, payload, resp);

  Serial.printf("[HTTP] 센서 %lu 전송 -> %d, %s\n", sensorId, status, payload.c_str());
  if (status != 201 && resp.length() > 0) {
    Serial.printf("[HTTP] 오류 내용: %s\n", resp.c_str());
  }
  if (status == 200 || status == 201) return tcpqueue::SendResult::Sent;
  // 연결 실패·설정 오류(-1), 키 문제(401), 서버 과부하는 패킷 잘못이 아니므로 보존 후 재시도
  if (status <= 0 || status == 401 || status == 408 || status == 429 || status >= 500) return tcpqueue::SendResult::Retry;
  // 403/404: 서버의 센서 배정이 바뀜 → 새 측정부터 최신 센서 ID를 쓰도록 설정을 다시 조회
  if (status == 403 || status == 404) deviceConfigurationLoaded = false;
  Serial.printf("[QUEUE] 서버가 측정값을 영구 거부(%d): 이 측정값을 폐기하고 다음 패킷을 전송합니다.\n", status);
  return tcpqueue::SendResult::Reject;
}

bool sendDeviceLocationToServer() {
  if(gpsSent || !validGps(gpsLat,gpsLng) || !deviceConfigurationLoaded)return true;
  const String payload=String("{\"latitude\":")+gpsLat+",\"longitude\":"+gpsLng+"}";
  String response;
  int status=sendHttpRequest("POST",getServerUrl()+"/api/iot/device-sets/by-mac/"+deviceMac+"/location",payload,response);
  if(status==200 || status==201){gpsSent=true;preferences.putBool("gpsSent",true);return true;}
  return false;
}
void announceUnregisteredDevice() {
  if(deviceConfigurationLoaded || WiFi.status()!=WL_CONNECTED || millis()-lastDiscoveryAttempt<30000)return;
  lastDiscoveryAttempt=millis();
  JsonDocument doc;doc["macAddress"]=deviceMac;
  if(validGps(gpsLat,gpsLng)){doc["latitude"]=gpsLat.toDouble();doc["longitude"]=gpsLng.toDouble();}
  String payload,response;serializeJson(doc,payload);
  sendHttpRequest("POST",getServerUrl()+"/api/iot/discovery",payload,response);
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
  WiFiManagerParameter custom_device_key("device_key", "장치 인증 키 (빈 값: 기존 키 유지)", "", 128, "type='password' autocomplete='new-password'");
  WiFiManagerParameter custom_srv_end("</div>");

  // 수파베이스 입력 영역 (선택 시에만 노출)
  String supaStart = "<div id='sec_supa' style='display:" + String(destMode == "SUPABASE" ? "block" : "none") + ";'>"
                     "<hr style='margin:14px 0;'/><label style='font-weight:bold;color:#059669;'>[2. 수파베이스 클라우드 설정]</label>";
  WiFiManagerParameter custom_supa_start(supaStart.c_str());
  WiFiManagerParameter custom_supa_url("supa_url", "Supabase Project URL", supabaseUrl.c_str(), 90);
  WiFiManagerParameter custom_supa_key("supa_key", "Supabase Publishable Key", supabaseKey.c_str(), 90);
  WiFiManagerParameter custom_supa_end("</div>");

  // 3) 설치 위치 GPS 설정 UI (스마트폰 GPS 자동 수신 버튼 및 수동 입력 지원)
  String gpsHtml =
    "<hr style='margin:14px 0;'/>"
    "<div style='background:#f0f9ff;padding:12px;border-radius:8px;margin-bottom:12px;border:1px solid #bae6fd;'>"
    "<label style='font-weight:bold;color:#0369a1;font-size:15px;'>[3. 기기 설치 위치 (스마트폰 GPS 연동)]</label><br/>"
    "<div style='margin-top:8px;'>"
    "<button type='button' id='btn_gps' onclick='fetchPhoneGps()' "
    "style='background:#0284c7;color:#fff;padding:10px 12px;border:none;border-radius:6px;cursor:pointer;font-weight:bold;width:100%;font-size:14px;'>"
    "📍 스마트폰 현재 GPS 좌표 가져오기</button>"
    "<div id='gps_msg' style='margin-top:6px;font-size:12px;color:#475569;'>버튼을 누르면 스마트폰의 위도/경도가 자동 입력됩니다.</div>"
    "</div></div>"
    "<script>"
    "function fetchPhoneGps() {"
    "  var msg = document.getElementById('gps_msg');"
    "  if (!navigator.geolocation) {"
    "    if (msg) msg.innerHTML = '<span style=\"color:#dc2626;\">⚠️ 브라우저가 위치 기능을 지원하지 않거나 보안상 차단되었습니다. 직접 입력해주세요.</span>';"
    "    alert('브라우저가 위치 기능을 지원하지 않거나 차단되었습니다. 아래에 직접 입력해주세요.');"
    "    return;"
    "  }"
    "  if (msg) msg.innerHTML = '⏳ 위치(GPS) 신호 수신 중... 잠시만 기다려주세요.';"
    "  navigator.geolocation.getCurrentPosition("
    "    function(pos) {"
    "      var lat = pos.coords.latitude.toFixed(6);"
    "      var lng = pos.coords.longitude.toFixed(6);"
    "      var elLat = document.getElementById('gps_lat');"
    "      var elLng = document.getElementById('gps_lng');"
    "      if (elLat) elLat.value = lat;"
    "      if (elLng) elLng.value = lng;"
    "      if (msg) msg.innerHTML = '<span style=\"color:#16a34a;font-weight:bold;\">✅ 위치 수신 완료 (위도: ' + lat + ', 경도: ' + lng + ')</span>';"
    "      alert('GPS 좌표 수신 성공!\\n위도: ' + lat + '\\n경도: ' + lng);"
    "    },"
    "    function(err) {"
    "      var errTxt = '위치 수신 실패 (코드: ' + err.code + ')';"
    "      if (err.code === 1) errTxt = '브라우저 권한 거부 또는 HTTP 보안 제한(HTTPS 필요)으로 차단되었습니다.';"
    "      else if (err.code === 2) errTxt = '위치 신호를 잡을 수 없습니다.';"
    "      else if (err.code === 3) errTxt = '위치 수신 시간 초과';"
    "      if (msg) msg.innerHTML = '<span style=\"color:#dc2626;\">⚠️ ' + errTxt + '<br/>아래 입력란에 직접 입력해주세요.</span>';"
    "      alert('GPS 수신 불가: ' + errTxt + '\\n아래 입력란에 위도/경도를 직접 입력해주세요.');"
    "    },"
    "    { enableHighAccuracy: true, timeout: 8000, maximumAge: 0 }"
    "  );"
    "}"
    "</script>";

  WiFiManagerParameter custom_gps_html(gpsHtml.c_str());
  WiFiManagerParameter custom_gps_lat("gps_lat", "설치 위도 (Latitude, 예: 37.5665)", gpsLat.c_str(), 20);
  WiFiManagerParameter custom_gps_lng("gps_lng", "설치 경도 (Longitude, 예: 126.9780)", gpsLng.c_str(), 20);

  wm.addParameter(&custom_mode_html);
  wm.addParameter(&custom_dest_mode);
  wm.addParameter(&custom_srv_start);
  wm.addParameter(&custom_server_ip);
  wm.addParameter(&custom_server_port);
  wm.addParameter(&custom_device_key);
  wm.addParameter(&custom_srv_end);
  wm.addParameter(&custom_supa_start);
  wm.addParameter(&custom_supa_url);
  wm.addParameter(&custom_supa_key);
  wm.addParameter(&custom_supa_end);
  wm.addParameter(&custom_gps_html);
  wm.addParameter(&custom_gps_lat);
  wm.addParameter(&custom_gps_lng);

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
      if((newIp!=serverIp || (newPort.length()>0 && newPort!=serverPort)) && validGps(gpsLat,gpsLng)) {
        gpsSent=false;preferences.putBool("gpsSent",false);
      }
      serverIp = newIp;
      serverPort = (newPort.length() > 0) ? newPort : "443";
      preferences.putString("serverIp", serverIp);
      preferences.putString("serverPort", serverPort);
    }

    String newDeviceKey = custom_device_key.getValue();
    newDeviceKey.trim();
    if (newDeviceKey.length() > 0) {
      deviceApiKey = newDeviceKey;
      preferences.putString("deviceKey", deviceApiKey);
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

    String newLat=custom_gps_lat.getValue(),newLng=custom_gps_lng.getValue();
    newLat.trim();newLng.trim();
    if(validGps(newLat,newLng)) {
      newLat=String(newLat.toDouble(),6);newLng=String(newLng.toDouble(),6);
      if(newLat!=gpsLat || newLng!=gpsLng) {
        gpsLat=newLat;gpsLng=newLng;gpsSent=false;
        preferences.putString("gpsLat",gpsLat);preferences.putString("gpsLng",gpsLng);preferences.putBool("gpsSent",false);
      }
    } else if(newLat.length()>0 || newLng.length()>0)Serial.println("[GPS] 유효하지 않은 좌표: 기존 설정을 유지합니다.");
    Serial.printf("[SETUP] 설정 저장: 모드=%s, 서버=%s:%s, 수파베이스=%s\n",
                  destMode.c_str(), serverIp.c_str(), serverPort.c_str(), supabaseUrl.c_str());
  };
  wm.setSaveConfigCallback(saveCallback);

  char portalPassword[17];
  snprintf(portalPassword, sizeof(portalPassword), "%08lx%08lx",
           (unsigned long)esp_random(), (unsigned long)esp_random());
  Serial.printf("[SETUP] AP: ESP32_Setup, 일회용 비밀번호: %s\n", portalPassword);

  if (forcePortal) {
    ticker.attach(0.2, tickLed);
    Serial.println("\n========================================================");
    Serial.println("[SETUP] AP 설정 모드 실행 (SSID: ESP32_Setup, 비밀번호: 시리얼 로그 참조)");
    Serial.println("[SETUP] 접속 후 브라우저(192.168.4.1)에서 [Configure WiFi]를 누르세요.");
    Serial.println("========================================================\n");
    wm.setConfigPortalTimeout(0);
    wm.startConfigPortal("ESP32_Setup", portalPassword);
    saveCallback();
    ticker.detach();
    Serial.println("[SETUP] 설정 저장 완료. 기기를 재부팅합니다...");
    delay(1000);
    ESP.restart();
  } else {
    Serial.println("[INIT] 저장된 Wi-Fi로 접속 시도 중...");
    wm.setConfigPortalTimeout(120);
    if (!wm.autoConnect("ESP32_Setup", portalPassword)) {
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
  deviceApiKey = preferences.getString("deviceKey", "");
  gpsLat=preferences.getString("gpsLat","");gpsLng=preferences.getString("gpsLng","");
  gpsSent=preferences.getBool("gpsSent",true);
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
    if (serverIp.length() == 0) needsConfig = true; // A keyless device may announce itself, but cannot upload measurements.
  }

  TEMP_HUMID_SENSOR_ID=preferences.getULong("tempId",0);
  MQ135_SENSOR_ID=preferences.getULong("mq135Id",0);
  MQ7_SENSOR_ID=preferences.getULong("mq7Id",0);
  bootNonce = esp_random();
  setupConfigPortal(needsConfig);

  configTime(0, 0, "pool.ntp.org", "time.google.com");
  deviceMac = WiFi.macAddress();
  if(destMode=="SERVER") initializeQueue();
  Serial.printf("[INIT] Wi-Fi 연결 완료! IP: %s, MAC: %s\n",
                WiFi.localIP().toString().c_str(), deviceMac.c_str());
  Serial.printf("[INIT] 최종 활성 전송 모드: %s\n", destMode.c_str());
}

void loop() {
  // 1. BOOT 버튼 감지
  checkBootButton();

  connectWifi();
  if(destMode=="SERVER" && POST_TO_SERVER){
    announceUnregisteredDevice();
    if(!gpsSent && millis()-lastLocationAttempt>=30000) {
      lastLocationAttempt=millis();sendDeviceLocationToServer();
    }
    if(!deviceConfigurationLoaded && WiFi.status()==WL_CONNECTED && millis()-lastConfigAttempt>=10000){
      lastConfigAttempt=millis();fetchDeviceConfiguration();
    }
    if(queueReady && WiFi.status()==WL_CONNECTED && (long)(millis()-nextQueueAttempt)>=0){
      nextQueueAttempt=millis()+3000;
      bool sent=packetQueue.drainOne([](unsigned long id,const std::string &payload){return postReading(id,String(payload.c_str()));});
      if(!sent){Serial.println("[QUEUE] 전송 또는 저장 확인 실패: 패킷을 유지하고 재시도합니다.");nextQueueAttempt=millis()+10000;}
    }
  }
  if(millis()-lastSendAt<SEND_INTERVAL_MS){delay(50);return;}
  lastSendAt=millis();
  if(destMode=="SERVER" && (!queueReady || !packetQueue.hasCapacity() || MQ135_SENSOR_ID==0)){
    Serial.println("[QUEUE] 설정 또는 저장 공간 부족: 미확인 데이터를 보존하고 새 측정을 대기합니다.");return;
  }
  time_t measuredTime=time(nullptr);
  if(destMode=="SERVER" && measuredTime<1700000000){Serial.println("[CLOCK] 측정 시각 동기화 대기");return;}
  char isoTime[24];struct tm utcTime;gmtime_r(&measuredTime,&utcTime);strftime(isoTime,sizeof(isoTime),"%Y-%m-%dT%H:%M:%SZ",&utcTime);

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
      std::vector<tcpqueue::Reading> rows;
      String common="{\"macAddress\":\""+deviceMac+"\",\"sampleKey\":\""+sampleKey+"\",\"measuredAt\":\""+String(isoTime)+"\",\"readings\":[";
      if(dhtOk && TEMP_HUMID_SENSOR_ID){
        String payload=common+"{\"metricCode\":\"TEMPERATURE\",\"measuredValue\":"+String(temperature,1)+"},{\"metricCode\":\"HUMIDITY\",\"measuredValue\":"+String(humidity,1)+"}]}";
        rows.push_back({TEMP_HUMID_SENSOR_ID,payload.c_str()});
      }
      if(READ_MQ135 && MQ135_SENSOR_ID){String payload=common+"{\"metricCode\":\"GAS\",\"measuredValue\":"+String(mq135Raw)+"}]}";rows.push_back({MQ135_SENSOR_ID,payload.c_str()});}
      if(READ_MQ7 && MQ7_SENSOR_ID){String payload=common+"{\"metricCode\":\"GAS\",\"measuredValue\":"+String(mq7Raw)+"}]}";rows.push_back({MQ7_SENSOR_ID,payload.c_str()});}
      char fileId[48];snprintf(fileId,sizeof(fileId),"%010lu-%08lx-%08lx",(unsigned long)measuredTime,(unsigned long)bootNonce,(unsigned long)sampleSequence);
      if(!packetQueue.enqueue(fileId,rows))Serial.println("[QUEUE] 패킷 저장 실패: 전송하지 않았습니다.");

    }
  }
}
