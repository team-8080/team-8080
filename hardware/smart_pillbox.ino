#include <ArduinoJson.h>

// ==================================================
// 스마트 약통 최종 프로토타입 코드 (non-blocking)
// Board: Seeed XIAO ESP32C3
// 통신: USB Serial JSON
// ArduinoJson: v6 (StaticJsonDocument)
// ==================================================

// ------------------------------
// 1. 핀 설정
// ------------------------------
#define BUTTON_PIN      D6
#define BUZZER_PIN      D5

#define SENSOR_1_PIN    D0
#define SENSOR_2_PIN    D2
#define SENSOR_3_PIN    D1

#define LED_GREEN_PIN   D9
#define LED_YELLOW_PIN  D8
#define LED_RED_PIN     D7

// ------------------------------
// 2. 기본 설정
// ------------------------------
const char* DEVICE_UID = "ESP32_001";

const int SENSOR_THRESHOLD = 3500;
const int SAMPLE_COUNT = 20;
const int SAMPLE_DELAY_MS = 20;

const unsigned long ALARM_TOTAL_TIME = 20000;   // 알림 20초
const unsigned long MEASURE_TIME     = 10000;   // 알림 시작 후 10초에 측정
const unsigned long BLINK_INTERVAL   = 300;     // LED/부저 점멸 주기(ms)

bool systemPower = false;
// 통신 상태: Serial 프로토타입에서는 항상 연결된 것으로 간주(단순화).
// 추후 BLE/네트워크 전환 시 실제 연결 상태로 갱신할 것.
bool connectedState = true;
bool isMeasuring = false;

int batteryPercent = 82;

// 복약 일정 정보
int scheduleId = -1;
int pillboxNumber = 1;
String medicineName = "";
String dosage = "";
String alarmTime = "";

// 테스트용 현재 시간
String currentTime = "";
String lastAppliedTime = "";   // set_time 중복 적용 방지용

bool alarmExecuted = false;

// ------------------------------
// 알림 상태머신 변수
// ------------------------------
bool alarmActive = false;          // 알림(점멸+부저) 진행 중
unsigned long alarmStartTime = 0;  // 알림 시작 시각
bool alarmMeasured = false;        // 이번 알림에서 측정 완료 여부
bool buzzerOn = false;             // 현재 부저 상태(점멸 토글 추적)

// 버튼 처리
bool lastButtonState = HIGH;
unsigned long buttonPressStart = 0;
unsigned long lastClickTime = 0;
int clickCount = 0;

const unsigned long POWER_ON_TIME = 1000;
const unsigned long POWER_OFF_TIME = 3000;
const unsigned long DOUBLE_CLICK_TIME = 600;   // 자연스러운 더블클릭 간격으로 확장

String lastBatteryColor = "";

// ==================================================
// 3. setup
// ==================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUTTON_PIN, INPUT_PULLUP);

  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_YELLOW_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);

  pinMode(SENSOR_1_PIN, INPUT);
  pinMode(SENSOR_2_PIN, INPUT);
  pinMode(SENSOR_3_PIN, INPUT);

  allOff();

  Serial.println("[SYSTEM] SMART PILLBOX 준비완료");
}

// ==================================================
// 4. loop  (블로킹 없음)
// ==================================================
void loop() {
  handleButton();
  handleSerialJson();

  // 알림 진행 중이면 상태머신을 매 루프마다 갱신
  if (alarmActive) {
    updateAlarmMode();
  }

  // 전원 ON + 알림/측정 중이 아닐 때만 배터리 표시
  if (systemPower && !isMeasuring && !alarmActive) {
    showBatteryStatus();

    if (alarmTime.length() > 0 && currentTime.length() > 0) {
      if (alarmTime == currentTime && !alarmExecuted) {
        startAlarmMode();
        alarmExecuted = true;
      }
    }
  }
}

// ==================================================
// 5. 버튼 기능
// 전원 OFF 상태: 한 번 누름 = 전원 ON
// 전원 ON  상태: 3초 누름 = 전원 OFF / 빠르게 2회 클릭 = 수동 측정
// ==================================================
void handleButton() {
  bool buttonState = digitalRead(BUTTON_PIN);

  // 눌림 시작
  if (lastButtonState == HIGH && buttonState == LOW) {
    buttonPressStart = millis();
  }

  // 뗌
  if (lastButtonState == LOW && buttonState == HIGH) {
    unsigned long pressDuration = millis() - buttonPressStart;

    // 전원 OFF 상태: 한 번만 눌렀다 떼면 ON
    if (!systemPower) {
      powerOn();
    }
    // 전원 ON 상태: 3초 이상 = OFF
    else if (pressDuration >= POWER_OFF_TIME) {
      powerOff();
    }
    // 전원 ON 상태: 짧은 클릭 → 더블클릭(수동 측정) 카운트
    else if (pressDuration < POWER_OFF_TIME) {
      if (clickCount == 0) {
        clickCount = 1;
        lastClickTime = millis();
      } else if (clickCount == 1 && (millis() - lastClickTime <= DOUBLE_CLICK_TIME)) {
        clickCount = 0;

        if (!isMeasuring && !alarmActive) {
          runUserCheckMode();
        } else {
          Serial.println("[경고] 작업중 - 수동측정 무시됨");
        }
      }
    }
  }

  // 더블클릭 윈도우 만료 시 카운트 리셋
  if (clickCount == 1 && (millis() - lastClickTime > DOUBLE_CLICK_TIME)) {
    clickCount = 0;
  }

  lastButtonState = buttonState;
}

// ==================================================
// 6. Serial JSON 수신
// JSON 끝에는 반드시 개행 문자(\n)가 있어야 함
// ==================================================
void handleSerialJson() {
  if (!Serial.available()) return;

  String input = Serial.readStringUntil('\n');
  input.trim();

  if (input.length() == 0) return;

  StaticJsonDocument<512> doc;
  DeserializationError error = deserializeJson(doc, input);

  if (error) {
    Serial.println("[JSON] 파싱 오류");
    return;
  }

  // ------------------------------
  // 명령 JSON 처리
  // ------------------------------
  if (doc.containsKey("command")) {
    String command = doc["command"].as<String>();

    if (command == "set_time") {
      String newTime = doc["currentTime"].as<String>();
      currentTime = newTime;

      // 같은 시각 재전송 시에는 alarmExecuted를 리셋하지 않음(재실행 방지)
      if (newTime != lastAppliedTime) {
        alarmExecuted = false;
        lastAppliedTime = newTime;
      }

      Serial.print("[시간] 현재 시간 설정됨: ");
      Serial.println(currentTime);
    }

    else if (command == "set_battery") {
      batteryPercent = doc["batteryPercent"];
      Serial.print("[배터리] 설정: ");
      Serial.print(batteryPercent);
      Serial.println("%");
      lastBatteryColor = "";
    }

    else if (command == "device_status") {
      sendDeviceStatusJson();
    }

    else if (command == "measure") {
      String mode = doc["mode"].as<String>();

      if (mode == "user_check") {
        if (!isMeasuring && !alarmActive) {
          runUserCheckMode();
        } else {
          Serial.println("[경고] 작업중 - 명령 무시됨");
        }
      }
    }

    return;
  }

  // ------------------------------
  // 복약 일정 JSON 처리
  // 백엔드 → ESP32
  // ------------------------------
  if (doc.containsKey("scheduleId")) {
    scheduleId = doc["scheduleId"];
    medicineName = doc["medicineName"].as<String>();
    pillboxNumber = doc["pillboxNumber"];
    dosage = doc["dosage"].as<String>();
    alarmTime = doc["alarmTime"].as<String>();

    alarmExecuted = false;

    Serial.println("[JSON] 복약 일정 수신됨");
    Serial.print("[일정] ID: ");
    Serial.println(scheduleId);
    Serial.print("[일정] 약 이름: ");
    Serial.println(medicineName);
    Serial.print("[일정] 약통 번호: ");
    Serial.println(pillboxNumber);
    Serial.print("[일정] 용량: ");
    Serial.println(dosage);
    Serial.print("[일정] 알람 시각: ");
    Serial.println(alarmTime);
  }
}

// ==================================================
// 7. 전원 ON / OFF
// ==================================================
// ON  : 짧게 두 번 (삑삑)
// OFF : 길게 한 번 (삐----, 낮은 음)
void beepPowerOn() {
  tone(BUZZER_PIN, 2000); delay(120); noTone(BUZZER_PIN);
  delay(80);
  tone(BUZZER_PIN, 2000); delay(120); noTone(BUZZER_PIN);
}

void beepPowerOff() {
  tone(BUZZER_PIN, 1500); delay(600); noTone(BUZZER_PIN);
}

void powerOn() {
  systemPower = true;
  Serial.println("[시스템] 전원 켜짐");

  beepPowerOn();

  lastBatteryColor = "";   // 켤 때 배터리 색 다시 출력
  showBatteryStatus();
}

void powerOff() {
  // 진행 중인 알림/부저를 먼저 확실히 정리한다.
  // (알림 tone()이 켜진 상태에서 OFF 비프 tone()을 겹쳐 부르면
  //  부저 PWM 채널이 꼬일 수 있으므로 순서가 중요)
  alarmActive = false;
  isMeasuring = false;
  buzzerOn = false;
  noTone(BUZZER_PIN);
  delay(20);

  // OFF 비프음 (길게 한 번)
  beepPowerOff();

  allOff();
  Serial.println("[시스템] 전원 꺼짐");
  Serial.flush();          // 종료 로그가 끊기지 않도록 전송 완료 대기
  delay(100);

  // 보드를 재부팅하여 완전한 초기 상태로 되돌린다.
  // 재부팅 후 setup()이 다시 실행되며 [SYSTEM] SMART PILLBOX READY 가 출력된다.
  ESP.restart();
}

// ==================================================
// 8. 배터리 LED 표시
// ==================================================
void showBatteryStatus() {
  String color = "";

  if (batteryPercent >= 80) {
    color = "초록";
    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, LOW);
  }
  else if (batteryPercent >= 40) {
    color = "노랑";
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_YELLOW_PIN, HIGH);
    digitalWrite(LED_RED_PIN, LOW);
  }
  else {
    color = "빨강";
    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, HIGH);
  }

  if (color != lastBatteryColor) {
    lastBatteryColor = color;

    Serial.print("[배터리] ");
    Serial.print(batteryPercent);
    Serial.print("% - ");
    Serial.println(color);
  }
}

// ==================================================
// 9. 복약 알림 모드 (non-blocking 상태머신)
// alarm 모드: 알림 20초 + 시작 후 10초에 1회 측정
// ==================================================
void startAlarmMode() {
  if (!systemPower) return;
  if (isMeasuring || alarmActive) return;

  alarmActive = true;
  isMeasuring = true;          // 알림 구간 전체를 "측정 진행 중"으로 표시
  alarmMeasured = false;
  alarmStartTime = millis();
  buzzerOn = false;

  Serial.println("[모드] 복약 알림 모드 시작");
}

// loop()에서 매번 호출됨
void updateAlarmMode() {
  if (!alarmActive) return;

  unsigned long elapsed = millis() - alarmStartTime;

  // ----- 알림 종료 -----
  if (elapsed >= ALARM_TOTAL_TIME) {
    noTone(BUZZER_PIN);
    buzzerOn = false;
    allOff();

    alarmActive = false;
    isMeasuring = false;
    lastBatteryColor = "";   // 종료 후 배터리 표시 복귀
    return;
  }

  // ----- 10초 시점 측정 (1회) -----
  if (!alarmMeasured && elapsed >= MEASURE_TIME) {
    // 측정 정확도를 위해 측정 동안 부저 정지
    noTone(BUZZER_PIN);

    int avg = readSensorAverage(pillboxNumber);
    bool medicineDetected = judgeMedicine(avg);

    printSensorResult(avg, medicineDetected);
    sendResultJson("alarm", avg, medicineDetected);

    alarmMeasured = true;
    buzzerOn = false;   // 점멸 위상 재동기화
    return;             // 이번 루프는 측정으로 종료
  }

  // ----- LED/부저 점멸 -----
  bool ledState = ((elapsed / BLINK_INTERVAL) % 2 == 0);

  digitalWrite(LED_GREEN_PIN, ledState);
  digitalWrite(LED_YELLOW_PIN, ledState);
  digitalWrite(LED_RED_PIN, ledState);

  if (ledState && !buzzerOn) {
    tone(BUZZER_PIN, 2000);
    buzzerOn = true;
  } else if (!ledState && buzzerOn) {
    noTone(BUZZER_PIN);
    buzzerOn = false;
  }
}

// ==================================================
// 10. 사용자 수동 측정 모드 (user_check)
// 버튼 더블클릭 또는 command measure로 실행
// 단발 측정이라 짧게 블로킹해도 무방
// ==================================================
void runUserCheckMode() {
  if (!systemPower) return;
  if (isMeasuring || alarmActive) return;

  isMeasuring = true;

  Serial.println("[모드] 수동 측정 모드 시작");

  int avg = readSensorAverage(pillboxNumber);
  bool medicineDetected = judgeMedicine(avg);

  printSensorResult(avg, medicineDetected);
  sendResultJson("user_check", avg, medicineDetected);

  isMeasuring = false;
  lastBatteryColor = "";   // 측정 후 배터리 표시 복귀
}

// ==================================================
// 11. 센서 평균값 측정
// 20ms 간격으로 20회 측정 후 평균 계산
// ==================================================
int readSensorAverage(int slotNumber) {
  int sensorPin = SENSOR_1_PIN;

  if (slotNumber == 1) sensorPin = SENSOR_1_PIN;
  else if (slotNumber == 2) sensorPin = SENSOR_2_PIN;
  else if (slotNumber == 3) sensorPin = SENSOR_3_PIN;
  else {
    Serial.println("[경고] 잘못된 약통 번호 - 기본 센서 1 사용");
    sensorPin = SENSOR_1_PIN;
  }

  long sum = 0;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    int value = analogRead(sensorPin);
    sum += value;
    delay(SAMPLE_DELAY_MS);
  }

  return sum / SAMPLE_COUNT;
}

// ==================================================
// 12. 약 유무 판단
// 평균값 < 3500  → 약 있음
// 평균값 >= 3500 → 약 없음
// ==================================================
bool judgeMedicine(int averageValue) {
  return averageValue < SENSOR_THRESHOLD;
}

// ==================================================
// 13. medicineDetected → intakeStatus 변환
// medicineDetected = true  → 약 있음 → not_taken
// medicineDetected = false → 약 없음 → taken
// ==================================================
String getIntakeStatus(bool medicineDetected) {
  if (medicineDetected) {
    return "not_taken";
  } else {
    return "taken";
  }
}

// ==================================================
// 14. 센서 결과 출력
// ==================================================
void printSensorResult(int avg, bool medicineDetected) {
  Serial.print("[센서] 샘플 개수 : ");
  Serial.println(SAMPLE_COUNT);

  Serial.print("[센서] 평균값 : ");
  Serial.println(avg);

  Serial.print("[결과] 약 유무 : ");
  Serial.println(medicineDetected ? "있음" : "없음");

  Serial.print("[결과] 복약 상태 : ");
  Serial.println(medicineDetected ? "미복용" : "복용");
}

// ==================================================
// 15. 측정 결과 JSON 생성
// ESP32 → 백엔드
// 2번 pillbox_devices 업데이트 / 3번 status_logs / 4번 intake_logs
// ==================================================
void sendResultJson(String mode, int sensorAverage, bool medicineDetected) {
  StaticJsonDocument<512> doc;

  if (scheduleId > 0 && mode == "alarm") {
    doc["scheduleId"] = scheduleId;
  }

  doc["deviceUid"] = DEVICE_UID;
  doc["pillboxNumber"] = pillboxNumber;
  doc["power"] = systemPower;
  doc["mode"] = mode;
  doc["batteryPercent"] = batteryPercent;
  doc["connected"] = connectedState;
  doc["sensorAverage"] = sensorAverage;
  doc["medicineDetected"] = medicineDetected;
  doc["intakeStatus"] = getIntakeStatus(medicineDetected);

  Serial.print("[결과_JSON] ");
  serializeJson(doc, Serial);
  Serial.println();
}

// ==================================================
// 16. 기기 상태 JSON 생성 (기기 상세 페이지용)
// 2번 pillbox_devices 업데이트
// ==================================================
void sendDeviceStatusJson() {
  StaticJsonDocument<256> doc;

  doc["deviceUid"] = DEVICE_UID;
  doc["batteryPercent"] = batteryPercent;
  doc["power"] = systemPower;
  doc["connected"] = connectedState;

  Serial.print("[기기_상태_JSON] ");
  serializeJson(doc, Serial);
  Serial.println();
}

// ==================================================
// 17. 전체 OFF
// ==================================================
void allOff() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_YELLOW_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);

  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
}
