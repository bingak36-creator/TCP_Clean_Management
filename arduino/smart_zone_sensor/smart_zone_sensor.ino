/*
 * =================================================================================
 * [스마트 클린 공간 모니터링 시스템] 아두이노 / ESP32 센서 데이터 전송 스케치
 * =================================================================================
 * 기능: 온습도(DHT) 및 가스 센서(MQ-2) 측정값을 Wi-Fi를 통해 Spring Boot 백엔드로 전송
 * =================================================================================
 */

#include <WiFi.h>         // ESP32용 (ESP8266 보드 사용 시 #include <ESP8266WiFi.h> 로 변경)
#include <HTTPClient.h>   // HTTP 통신 라이브러리
#include <WiFiClientSecure.h>

// 1. 와이파이 설정 (스마트폰 핫스팟 또는 2.4GHz 공유기 권장)
const char* ssid     = "YOUR_WIFI_SSID";       // 와이파이 이름 입력
const char* password = "YOUR_WIFI_PASSWORD";   // 와이파이 비밀번호 입력

// 2. 백엔드 서버 주소 설정 (발급받은 ngrok 주소)
// 주의: 주소 끝에 /api/iot/data 가 꼭 붙어야 합니다.
const char* serverUrl = "https://spearmint-remover-proximity.ngrok-free.dev /api/iot/data";

// 3. 센서 핀 번호 및 기본 설정
#define GAS_SENSOR_PIN 34    // MQ-2 가스 센서 아날로그 핀 (ESP32 아날로그 핀 예시: GPIO 34 / 아두이노는 A0)
const int SENSOR_ID = 1;     // 백엔드 DB에 등록된 센서 ID (기본값: 1번 센서)

void setup() {
  Serial.begin(115200);
  delay(1000);
  
  Serial.println("\n[시스템 시작] Wi-Fi 연결을 시도합니다...");
  WiFi.begin(ssid, password);
  
  int retryCount = 0;
  while (WiFi.status() != WL_CONNECTED && retryCount < 20) {
    delay(500);
    Serial.print(".");
    retryCount++;
  }
  
  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[성공] Wi-Fi가 성공적으로 연결되었습니다!");
    Serial.print("할당받은 IP 주소: ");
    Serial.println(WiFi.localIP());
  } else {
    Serial.println("\n[경고] Wi-Fi 연결에 실패했습니다. SSID와 비밀번호를 확인해주세요.");
  }
}

void loop() {
  if (WiFi.status() == WL_CONNECTED) {
    // -------------------------------------------------------------
    // 1. 센서 값 읽기
    // -------------------------------------------------------------
    // 가스 센서 아날로그 값 읽기 (0 ~ 4095 또는 0 ~ 1023)
    int rawGas = analogRead(GAS_SENSOR_PIN);
    float gasLevel = (float)rawGas;
    
    // 온습도 센서가 아직 연결되지 않은 경우를 위한 가상 온도/습도 (실제 DHT 연결 시 dht.readTemperature() 사용)
    float temperature = 24.0;
    float humidity = 45.0;

    Serial.println("----------------------------------------------");
    Serial.printf("[센서 측정] 가스: %.1f ppm | 온도: %.1f ℃ | 습도: %.1f %%\n", gasLevel, temperature, humidity);

    // -------------------------------------------------------------
    // 2. 백엔드로 보낼 JSON 데이터 패킷 조립
    // value1: 온도 또는 가스값 / value2: 습도값
    // -------------------------------------------------------------
    String jsonPayload = "{";
    jsonPayload += "\"sensorId\":" + String(SENSOR_ID) + ",";
    jsonPayload += "\"value1\":" + String(gasLevel) + ",";
    jsonPayload += "\"value2\":" + String(temperature);
    jsonPayload += "}";

    // -------------------------------------------------------------
    // 3. HTTP POST 요청 전송
    // -------------------------------------------------------------
    HTTPClient http;
    http.begin(serverUrl);
    http.addHeader("Content-Type", "application/json");
    http.addHeader("ngrok-skip-browser-warning", "true"); // ngrok 안내 페이지 우회 헤더

    int httpResponseCode = http.POST(jsonPayload);

    if (httpResponseCode > 0) {
      Serial.printf("[백엔드 전송 성공] 응답 코드: %d\n", httpResponseCode);
      String responseBody = http.getString();
      Serial.println("서버 응답 내용: " + responseBody);
    } else {
      Serial.printf("[백엔드 전송 실패] 오류 코드: %s\n", http.errorToString(httpResponseCode).c_str());
    }
    http.end();

  } else {
    Serial.println("[Wi-Fi 끊김] Wi-Fi 재연결 시도 중...");
    WiFi.reconnect();
  }

  // 5초 간격으로 주기적 전송 (시연 시 반응성을 높이기 위해 5초 권장)
  delay(5000);
}
