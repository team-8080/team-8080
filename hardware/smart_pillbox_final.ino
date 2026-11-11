#include <ArduinoJson.h>

// ==================================================
// 스마트 약통 최종 통합 코드
// Board: Seeed XIAO ESP32C3
// ArduinoJson v6
// USB Serial: 115200 / JSON Lines (한 줄에 JSON 하나, 끝에 \n)
// ==================================================

// 1. 핀 설정 - 기존 유지
#define BUTTON_PIN D6
#define BUZZER_PIN D5

#define SENSOR_1_PIN D0
#define SENSOR_2_PIN D2
#define SENSOR_3_PIN D1

#define LED_GREEN_PIN D9
#define LED_YELLOW_PIN D8
#define LED_RED_PIN D7

// 2. 기본 설정
const char* DEVICE_UID = "ESP32_001";

const int SENSOR_THRESHOLD = 3500;
const int SAMPLE_COUNT = 20;
const int SAMPLE_DELAY_MS = 20;

const unsigned long ALARM_TOTAL_TIME = 20000;
const unsigned long MEASURE_TIME = 10000;
const unsigned long BLINK_INTERVAL = 300;

const unsigned long POWER_OFF_TIME = 3000;
const unsigned long DOUBLE_CLICK_TIME = 600;

bool systemPower = false;
bool connectedState = true; // 테스트용
bool isMeasuring = false;

int batteryPercent = 82; // 테스트용

// 복약 일정 (약통 칸마다 1개씩, 총 3개 저장)
// 배열 인덱스 0~2 = 약통 1~3번 칸
const int SLOT_COUNT = 3;

int scheduleIds[SLOT_COUNT] = {-1, -1, -1};
String medicineNames[SLOT_COUNT] = {"", "", ""};
String dosages[SLOT_COUNT] = {"", "", ""};
String alarmTimes[SLOT_COUNT] = {"", "", ""};
bool alarmFired[SLOT_COUNT] = {false, false, false}; // 해당 알람 분에 이미 울렸는지

// 수동 측정(버튼 더블클릭/웹 기본값)에 쓰는 칸 번호
// = 가장 최근에 일정이 등록된 칸 (기존 동작 유지)
int pillboxNumber = 1;

// 시간 동기화
bool timeSynced = false;
unsigned long syncedMinute = 0;
unsigned long syncMillis = 0;

// 알림 상태
bool alarmActive = false;
unsigned long alarmStartTime = 0;
bool alarmMeasured = false;
bool buzzerOn = false;
int activeAlarmScheduleId = -1;
int activeAlarmSlot = 1;

// 버튼 상태
bool lastButtonState = HIGH;
unsigned long buttonPressStart = 0;
unsigned long lastClickTime = 0;
int clickCount = 0;

String lastBatteryColor = "";

// Serial 수신 버퍼
char serialBuffer[512];
size_t serialIndex = 0;
bool serialOverflow = false;

// ==================================================
// 3. setup
// ==================================================
void setup() {
  Serial.begin(115200);
  delay(1000);

  pinMode(BUTTON_PIN, INPUT_PULLUP);
  pinMode(BUZZER_PIN, OUTPUT);

  pinMode(SENSOR_1_PIN, INPUT);
  pinMode(SENSOR_2_PIN, INPUT);
  pinMode(SENSOR_3_PIN, INPUT);

  pinMode(LED_GREEN_PIN, OUTPUT);
  pinMode(LED_YELLOW_PIN, OUTPUT);
  pinMode(LED_RED_PIN, OUTPUT);

  allOff();

  Serial.println("[SYSTEM] SMART PILLBOX READY");
}

// ==================================================
// 4. loop
// ==================================================
void loop() {
  handleButton();
  handleSerialJson();

  if (alarmActive) {
    updateAlarmMode();
  }

  if (systemPower && !isMeasuring && !alarmActive) {
    showBatteryStatus();
    checkAlarmSchedule();
  }
}

// ==================================================
// 5. 물리 버튼 (기존 동작 유지)
// OFF: 짧게 눌렀다 떼면 ON
// ON: 3초 이상 누르면 OFF
// ON: 더블클릭하면 수동 측정
// ==================================================
void handleButton() {
  bool state = digitalRead(BUTTON_PIN);

  if (lastButtonState == HIGH && state == LOW) {
    buttonPressStart = millis();
  }

  if (lastButtonState == LOW && state == HIGH) {
    unsigned long duration = millis() - buttonPressStart;

    if (!systemPower) {
      clickCount = 0;
      powerOn();
    }
    else if (duration >= POWER_OFF_TIME) {
      clickCount = 0;
      powerOff();
    }
    else {
      if (clickCount == 0) {
        clickCount = 1;
        lastClickTime = millis();
      }
      else if (millis() - lastClickTime <= DOUBLE_CLICK_TIME) {
        clickCount = 0;

        if (!isMeasuring && !alarmActive) {
          runUserCheckMode(pillboxNumber);
        } else {
          Serial.println("[WARN] DEVICE_BUSY");
        }
      }
    }
  }

  if (clickCount == 1 &&
      millis() - lastClickTime > DOUBLE_CLICK_TIME) {
    clickCount = 0;
  }

  lastButtonState = state;
}

// ==================================================
// 6. USB Serial JSON 수신
// JSON 한 줄 단위 처리 (논블로킹)
// ==================================================
void handleSerialJson() {
  while (Serial.available() > 0) {
    char c = Serial.read();

    if (c == '\n') {
      if (!serialOverflow && serialIndex > 0) {
        serialBuffer[serialIndex] = '\0';
        processJson(serialBuffer);
      }

      serialIndex = 0;
      serialOverflow = false;
    }
    else if (c != '\r') {
      if (!serialOverflow) {
        if (serialIndex < sizeof(serialBuffer) - 1) {
          serialBuffer[serialIndex++] = c;
        } else {
          serialOverflow = true;
          Serial.println("[WARN] JSON_TOO_LONG");
        }
      }
    }
  }
}

// ==================================================
// 7. JSON 명령 및 복약 일정 처리
// ==================================================
void processJson(const char* input) {
  StaticJsonDocument<512> doc;

  DeserializationError error =
    deserializeJson(doc, input);

  if (error) {
    Serial.println("[WARN] JSON_PARSE_ERROR");
    return;
  }

  // 명령 JSON
  if (doc.containsKey("command")) {
    String command = doc["command"].as<String>();

    // 시간 동기화
    if (command == "set_time") {
      String value = doc["currentTime"].as<String>();

      if (setCurrentTime(value)) {
        Serial.println("[TIME] SYNC_OK");
      } else {
        Serial.println("[WARN] INVALID_TIME");
      }
    }

    // 테스트용 배터리 설정
    else if (command == "set_battery") {
      if (!doc["batteryPercent"].is<int>()) {
        Serial.println("[WARN] INVALID_BATTERY");
        return;
      }

      batteryPercent =
        constrain(doc["batteryPercent"].as<int>(), 0, 100);

      lastBatteryColor = "";
      Serial.println("[BATTERY] UPDATED");
    }

    // 일정 삭제 (시연 초기화용)
    // {"command":"clear_schedule","pillboxNumber":1} → 해당 칸만
    // {"command":"clear_schedule"}                  → 전체
    else if (command == "clear_schedule") {
      if (doc.containsKey("pillboxNumber")) {
        int slot = doc["pillboxNumber"].as<int>();

        if (slot < 1 || slot > SLOT_COUNT) {
          Serial.println("[WARN] INVALID_PILLBOX");
          return;
        }

        clearSchedule(slot - 1);
      } else {
        for (int i = 0; i < SLOT_COUNT; i++) clearSchedule(i);
      }

      Serial.println("[SCHEDULE] CLEARED");
    }

    // 기기 상세 페이지 요청
    else if (command == "device_status") {
      if (!checkDeviceUid(doc)) return;
      sendDeviceStatusJson();
    }

    // 웹 수동 측정 요청
    else if (command == "measure") {
      if (!checkDeviceUid(doc)) return;

      String mode = doc["mode"].as<String>();

      if (mode != "user_check") {
        Serial.println("[WARN] INVALID_MODE");
        sendErrorJson("measure", "invalid_mode");
        return;
      }

      if (!systemPower) {
        Serial.println("[WARN] POWER_OFF");
        sendErrorJson("measure", "power_off");
        return;
      }

      if (isMeasuring || alarmActive) {
        Serial.println("[WARN] DEVICE_BUSY");
        sendErrorJson("measure", "busy");
        return;
      }

      int requestedSlot = pillboxNumber;

      if (doc.containsKey("pillboxNumber")) {
        requestedSlot = doc["pillboxNumber"].as<int>();
      }

      if (requestedSlot < 1 || requestedSlot > 3) {
        Serial.println("[WARN] INVALID_PILLBOX");
        sendErrorJson("measure", "invalid_pillbox");
        return;
      }

      runUserCheckMode(requestedSlot);
    }

    return;
  }

  // 복약 일정 JSON 수신
  if (doc.containsKey("scheduleId")) {
    int newId = doc["scheduleId"].as<int>();
    int newSlot = doc["pillboxNumber"].as<int>();
    String newTime = doc["alarmTime"].as<String>();

    int hh, mm;

    if (newId <= 0 ||
        newSlot < 1 || newSlot > 3 ||
        !parseTime(newTime, hh, mm)) {
      Serial.println("[WARN] INVALID_SCHEDULE");
      return;
    }

    int idx = newSlot - 1;

    // 같은 칸의 일정이 바뀌면 "이미 울림" 기록 초기화
    // (같은 일정을 다시 받은 경우에는 유지해서 중복 알림 방지)
    if (scheduleIds[idx] != newId ||
        alarmTimes[idx] != newTime) {
      alarmFired[idx] = false;
    }

    scheduleIds[idx] = newId;
    medicineNames[idx] = doc["medicineName"].as<String>();
    dosages[idx] = doc["dosage"].as<String>();
    alarmTimes[idx] = newTime;

    pillboxNumber = newSlot;   // 수동 측정 기본 칸

    Serial.print("[SCHEDULE] RECEIVED SLOT ");
    Serial.print(newSlot);
    Serial.print(" ");
    Serial.println(newTime);
  }
}

// ==================================================
// 8. 기기 UID 확인
// ==================================================
bool checkDeviceUid(JsonDocument& doc) {
  if (!doc.containsKey("deviceUid")) {
    // 기존 명령 형식도 허용
    return true;
  }

  String uid = doc["deviceUid"].as<String>();

  if (uid != DEVICE_UID) {
    Serial.println("[WARN] DEVICE_UID_MISMATCH");
    return false;
  }

  return true;
}

// ==================================================
// 9. 시간 동기화
// ==================================================
bool parseTime(String value, int &hour, int &minute) {
  if (value.length() != 5 || value.charAt(2) != ':')
    return false;

  for (int i = 0; i < 5; i++) {
    if (i == 2) continue;

    if (value.charAt(i) < '0' ||
        value.charAt(i) > '9') {
      return false;
    }
  }

  hour = value.substring(0, 2).toInt();
  minute = value.substring(3, 5).toInt();

  return hour >= 0 && hour <= 23 &&
         minute >= 0 && minute <= 59;
}

bool setCurrentTime(String value) {
  int hh, mm;

  if (!parseTime(value, hh, mm))
    return false;

  syncedMinute = hh * 60UL + mm;
  syncMillis = millis();
  timeSynced = true;

  return true;
}

unsigned long getCurrentMinute() {
  return syncedMinute +
         (millis() - syncMillis) / 60000UL;
}

String getCurrentTime() {
  if (!timeSynced) return "";

  unsigned long minuteOfDay =
    getCurrentMinute() % 1440UL;

  int hh = minuteOfDay / 60;
  int mm = minuteOfDay % 60;

  char buffer[6];
  snprintf(buffer, sizeof(buffer),
           "%02d:%02d", hh, mm);

  return String(buffer);
}

// ==================================================
// 10. 복약 일정 확인
// ==================================================
void checkAlarmSchedule() {
  if (!timeSynced) return;

  String now = getCurrentTime();

  for (int i = 0; i < SLOT_COUNT; i++) {
    if (scheduleIds[i] <= 0 || alarmTimes[i].length() == 0) continue;

    // 알람 시각을 벗어나면 "울린 기록" 초기화
    if (now != alarmTimes[i]) {
      alarmFired[i] = false;
      continue;
    }

    if (alarmFired[i]) continue;

    // 다른 칸 알림이 진행 중이면 시작하지 않고 다음 loop에서 재시도
    // (같은 분 안에 끝나면 이어서 울림)
    startAlarmMode(i);

    if (alarmActive) {
      alarmFired[i] = true;
      return;   // 한 번에 한 칸만 시작
    }
  }
}

void clearSchedule(int idx) {
  scheduleIds[idx] = -1;
  medicineNames[idx] = "";
  dosages[idx] = "";
  alarmTimes[idx] = "";
  alarmFired[idx] = false;
}

// ==================================================
// 11. 전원 ON/OFF
// ==================================================
void beepPowerOn() {
  tone(BUZZER_PIN, 2000);
  delay(120);
  noTone(BUZZER_PIN);

  delay(80);

  tone(BUZZER_PIN, 2000);
  delay(120);
  noTone(BUZZER_PIN);
}

void beepPowerOff() {
  tone(BUZZER_PIN, 1500);
  delay(600);
  noTone(BUZZER_PIN);
}

void powerOn() {
  systemPower = true;

  Serial.println("[SYSTEM] POWER_ON");

  beepPowerOn();

  lastBatteryColor = "";
  showBatteryStatus();
}

// 재부팅(ESP.restart) 없이 상태만 OFF로 전환
// → 시간 동기화, 복약 일정, 배터리 값이 그대로 유지됨
void powerOff() {
  // 진행 중인 알림/측정 정리
  alarmActive = false;
  alarmMeasured = false;
  isMeasuring = false;
  buzzerOn = false;
  clickCount = 0;

  noTone(BUZZER_PIN);
  delay(20);

  beepPowerOff();
  allOff();

  systemPower = false;
  lastBatteryColor = "";

  Serial.println("[SYSTEM] POWER_OFF");
}

// ==================================================
// 12. 배터리 LED
// ==================================================
void showBatteryStatus() {
  String color = "";

  if (batteryPercent >= 80) {
    color = "GREEN";

    digitalWrite(LED_GREEN_PIN, HIGH);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, LOW);
  }
  else if (batteryPercent >= 40) {
    color = "YELLOW";

    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_YELLOW_PIN, HIGH);
    digitalWrite(LED_RED_PIN, LOW);
  }
  else {
    color = "RED";

    digitalWrite(LED_GREEN_PIN, LOW);
    digitalWrite(LED_YELLOW_PIN, LOW);
    digitalWrite(LED_RED_PIN, HIGH);
  }

  if (color != lastBatteryColor) {
    lastBatteryColor = color;

    Serial.print("[BATTERY] ");
    Serial.print(batteryPercent);
    Serial.print("% ");
    Serial.println(color);
  }
}

// ==================================================
// 13. 복약 알림 시작
// ==================================================
void startAlarmMode(int idx) {
  if (!systemPower) return;
  if (isMeasuring || alarmActive) return;

  activeAlarmScheduleId = scheduleIds[idx];
  activeAlarmSlot = idx + 1;

  alarmActive = true;
  isMeasuring = true;
  alarmMeasured = false;
  alarmStartTime = millis();
  buzzerOn = false;

  Serial.println("[MODE] ALARM_START");
}

// ==================================================
// 14. 복약 알림
// 20초 알림, 10초 후 센서 측정
// ==================================================
void updateAlarmMode() {
  if (!alarmActive) return;

  unsigned long elapsed =
    millis() - alarmStartTime;

  if (elapsed >= ALARM_TOTAL_TIME) {
    noTone(BUZZER_PIN);
    buzzerOn = false;

    allOff();

    alarmActive = false;
    isMeasuring = false;
    lastBatteryColor = "";

    Serial.println("[MODE] ALARM_END");
    return;
  }

  if (!alarmMeasured && elapsed >= MEASURE_TIME) {
    noTone(BUZZER_PIN);

    int avg = readSensorAverage(activeAlarmSlot);
    bool detected = judgeMedicine(avg);

    printSensorResult(avg, detected);

    sendResultJson(
      "alarm",
      activeAlarmSlot,
      avg,
      detected,
      activeAlarmScheduleId
    );

    alarmMeasured = true;
    buzzerOn = false;
    return;
  }

  bool ledState =
    ((elapsed / BLINK_INTERVAL) % 2 == 0);

  digitalWrite(LED_GREEN_PIN, ledState);
  digitalWrite(LED_YELLOW_PIN, ledState);
  digitalWrite(LED_RED_PIN, ledState);

  if (ledState && !buzzerOn) {
    tone(BUZZER_PIN, 2000);
    buzzerOn = true;
  }
  else if (!ledState && buzzerOn) {
    noTone(BUZZER_PIN);
    buzzerOn = false;
  }
}

// ==================================================
// 15. 수동 측정
// 물리 버튼과 웹 명령 공통 사용
// ==================================================
void runUserCheckMode(int slotNumber) {
  if (!systemPower) return;
  if (isMeasuring || alarmActive) return;
  if (slotNumber < 1 || slotNumber > 3) return;

  isMeasuring = true;

  Serial.println("[MODE] USER_CHECK_START");

  int avg = readSensorAverage(slotNumber);
  bool detected = judgeMedicine(avg);

  printSensorResult(avg, detected);

  sendResultJson(
    "user_check",
    slotNumber,
    avg,
    detected,
    -1
  );

  isMeasuring = false;
  lastBatteryColor = "";
}

// ==================================================
// 16. 센서 평균값 측정
// ==================================================
int readSensorAverage(int slotNumber) {
  int sensorPin;

  if (slotNumber == 1) {
    sensorPin = SENSOR_1_PIN;
  }
  else if (slotNumber == 2) {
    sensorPin = SENSOR_2_PIN;
  }
  else if (slotNumber == 3) {
    sensorPin = SENSOR_3_PIN;
  }
  else {
    return -1;
  }

  long sum = 0;

  for (int i = 0; i < SAMPLE_COUNT; i++) {
    sum += analogRead(sensorPin);
    delay(SAMPLE_DELAY_MS);
  }

  return sum / SAMPLE_COUNT;
}

// ==================================================
// 17. 약 유무 판단
// ==================================================
bool judgeMedicine(int averageValue) {
  return averageValue < SENSOR_THRESHOLD;
}

String getIntakeStatus(bool medicineDetected) {
  return medicineDetected ? "not_taken" : "taken";
}

// ==================================================
// 18. 센서 결과 로그
// ==================================================
void printSensorResult(int avg, bool detected) {
  Serial.print("[SENSOR] SAMPLE_COUNT: ");
  Serial.println(SAMPLE_COUNT);

  Serial.print("[SENSOR] AVERAGE: ");
  Serial.println(avg);

  Serial.print("[RESULT] MEDICINE: ");
  Serial.println(detected ? "YES" : "NO");

  Serial.print("[RESULT] INTAKE: ");
  Serial.println(
    detected ? "not_taken" : "taken"
  );
}

// ==================================================
// 19. 측정 결과 JSON
// 자동: scheduleId = 실제 일정 ID
// 수동: scheduleId = null
// ==================================================
void sendResultJson(
  String mode,
  int slotNumber,
  int sensorAverage,
  bool medicineDetected,
  int resultScheduleId
) {
  StaticJsonDocument<512> doc;

  doc["deviceUid"] = DEVICE_UID;

  if (mode == "alarm" && resultScheduleId > 0) {
    doc["scheduleId"] = resultScheduleId;
  } else {
    doc["scheduleId"] = nullptr;
  }

  doc["pillboxNumber"] = slotNumber;
  doc["power"] = systemPower;
  doc["mode"] = mode;
  doc["batteryPercent"] = batteryPercent;
  doc["connected"] = connectedState;
  doc["sensorAverage"] = sensorAverage;
  doc["medicineDetected"] = medicineDetected;
  // intakeStatus는 보내지 않음 → 백엔드가 medicineDetected로 변환
  //   true  (약 있음) → not_taken
  //   false (약 없음) → taken

  serializeJson(doc, Serial);
  Serial.println();
}

// ==================================================
// 20. 기기 상태 JSON
// ==================================================
void sendDeviceStatusJson() {
  StaticJsonDocument<256> doc;

  doc["deviceUid"] = DEVICE_UID;
  doc["batteryPercent"] = batteryPercent;
  doc["power"] = systemPower;
  doc["connected"] = connectedState;

  serializeJson(doc, Serial);
  Serial.println();
}

// ==================================================
// 21. 에러 JSON (명령 실패 시 백엔드에 알림)
// reason: power_off / busy / invalid_pillbox / invalid_mode
// ==================================================
void sendErrorJson(const char* command, const char* reason) {
  StaticJsonDocument<192> doc;

  doc["type"] = "error";
  doc["deviceUid"] = DEVICE_UID;
  doc["command"] = command;
  doc["reason"] = reason;

  serializeJson(doc, Serial);
  Serial.println();
}

// ==================================================
// 22. 전체 OFF
// ==================================================
void allOff() {
  digitalWrite(LED_GREEN_PIN, LOW);
  digitalWrite(LED_YELLOW_PIN, LOW);
  digitalWrite(LED_RED_PIN, LOW);

  noTone(BUZZER_PIN);
  digitalWrite(BUZZER_PIN, LOW);
}
