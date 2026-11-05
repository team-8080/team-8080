const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

// 시리얼 통신 라이브러리 불러오기
const { SerialPort } = require('serialport');
const { ReadlineParser } = require('@serialport/parser-readline');

// ★ AI 기능 및 모니터링 라우터 모듈 불러오기
const { registerAiChatRoutes } = require('./aiChat');
const { registerMedicineAiRoutes } = require('./medicineAi');
const { registerMonitorRoutes } = require('./monitor'); 

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
// ★ AI 약 식별: 사진 base64 가 커서 25mb 로 상향
app.use(express.json({ limit: '25mb' }));
app.use(express.urlencoded({ limit: '25mb', extended: true }));

// MySQL DB 연결 설정
const db = mysql.createConnection({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASS,
  database: process.env.DB_NAME
});

db.connect((err) => {
  if (err) {
    console.error('❌ MySQL 연결 실패:', err);
    return;
  }
  console.log('✅ MySQL 데이터베이스 연결 성공!');
});

registerAiChatRoutes(app, db);
registerMedicineAiRoutes(app, db);
registerMonitorRoutes(app, db);

// ==========================================
// 🔌 USB Serial 통신 인터페이스 (ESP32 대기 & 가상 모드)
// ==========================================
const SERIAL_PORT_PATH = 'COM4'; // 실제 기기 연결 시 해당 포트 확인
const BAUD_RATE = 115200;
let portInstance = null;

// 아두이노로 현재 PC 시간 동기화 명령 전송 함수
function syncHardwareTime() {
  if (!portInstance || !portInstance.isOpen) return;

  const now = new Date();
  const hh = String(now.getHours()).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');
  const timePayload = JSON.stringify({
    command: 'set_time',
    currentTime: `${hh}:${mm}`
  }) + '\n';

  portInstance.write(timePayload, (err) => {
    if (err) console.error('❌ 시간 동기화 전송 실패:', err);
    else console.log(`⏰ [ESP32 시간 동기화 완료]: ${hh}:${mm}`);
  });
}

try {
  portInstance = new SerialPort({ path: SERIAL_PORT_PATH, baudRate: BAUD_RATE, autoOpen: false });
  portInstance.open((err) => {
    if (err) {
      console.log('💡 [하드웨어 가상 모드]: ESP32 미연결 상태입니다. 내장 시뮬레이터로 자동 동작합니다.');
    } else {
      console.log(`🔌 [Serial 연결 성공]: ${SERIAL_PORT_PATH} (115200 bps)`);
      
      // ESP32 부팅 딜레이(약 1.5초) 후 PC 현재 시간 자동 동기화
      setTimeout(syncHardwareTime, 1500);

      const parser = portInstance.pipe(new ReadlineParser({ delimiter: '\n' }));
      parser.on('data', (line) => {
        const trimmed = line.trim();
        // { 로 시작하지 않는 텍스트 로그([SYSTEM], [BATTERY] 등)는 단순 콘솔 출력
        if (!trimmed.startsWith('{')) {
          console.log('📟 [ESP32 로그]:', trimmed);
          return;
        }

        try {
          const data = JSON.parse(trimmed);
          
          // 하드웨어 에러 메시지 수신 처리 (예: 전원 꺼짐, 측정 중 등)
          if (data.type === 'error') {
            console.warn(`⚠️ [ESP32 오류 응답]: 명령(${data.command}) 실패 사유: ${data.reason}`);
            return;
          }

          console.log('📥 [ESP32 하드웨어 수신 JSON]:', data);
          processHardwareData(data);
        } catch (e) {
          console.error('❌ JSON 파싱 에러:', trimmed);
        }
      });
    }
  });
} catch (e) {
  console.log('💡 [하드웨어 가상 인터페이스 대기]');
}

// ==========================================
// ⚙️ 하드웨어 데이터 수신 및 DB 동기화 파이프라인
// ==========================================
function processHardwareData(data) {
  // Case 1: 기기 단순 상태 JSON 수신 시
  if (data.batteryPercent !== undefined && !data.mode) {
    const updateDevQuery = `
      UPDATE pillbox_devices 
      SET batteryLevel = ?, connected = ?, lastConnectedAt = NOW()
      WHERE deviceUid = ? OR id = 1
    `;
    db.query(updateDevQuery, [data.batteryPercent, data.connected ? 1 : 0, data.deviceUid || 'ESP32_001']);
    return;
  }

  // Case 2: 센서 측정 결과 JSON 수신 시 (자동 알람 or 수동 점검)
  if (data.mode) {
    const {
      deviceUid = 'ESP32_001',
      scheduleId = null,
      pillboxNumber = 1,
      batteryPercent = 82,
      connected = true,
      sensorAverage = 2870,
      medicineDetected = false,
      mode
    } = data;

    // deviceUid를 통해 userPk 식별
    const findUserQuery = `SELECT userPk FROM pillbox_devices WHERE deviceUid = ? LIMIT 1`;
    db.query(findUserQuery, [deviceUid], (err, rows) => {
      const userPk = (rows && rows.length > 0) ? rows[0].userPk : 1;

      // 1) pillbox_devices 최신 상태 갱신
      const updateDev = `
        UPDATE pillbox_devices 
        SET batteryLevel = ?, connected = ?, lastConnectedAt = NOW()
        WHERE deviceUid = ? OR id = 1
      `;
      db.query(updateDev, [batteryPercent, connected ? 1 : 0, deviceUid]);

      // 2) pillbox_status_logs 센서 원본 로그 기록
      const insertStatus = `
        INSERT INTO pillbox_status_logs 
        (deviceUid, pillboxNumber, sensorAverage, medicineDetected, mode, createdAt)
        VALUES (?, ?, ?, ?, ?, NOW())
      `;
      db.query(insertStatus, [deviceUid, pillboxNumber, sensorAverage, medicineDetected ? 1 : 0, mode]);

      // 3) pillbox_intake_logs 복약 이력 누적 (약 없음 = taken, 약 있음 = not_taken)
      const intakeStatus = medicineDetected ? 'not_taken' : 'taken';
      const insertIntake = `
        INSERT INTO pillbox_intake_logs 
        (scheduleId, userPk, deviceUid, pillboxNumber, intakeStatus, mode, checkedAt)
        VALUES (?, ?, ?, ?, ?, ?, NOW())
      `;
      db.query(insertIntake, [scheduleId, userPk, deviceUid, pillboxNumber, intakeStatus, mode], (logErr) => {
        if (logErr) console.error('❌ intake_logs 저장 실패:', logErr);
        else console.log(`🎯 [DB 갱신 완료] ${pillboxNumber}번 칸 / 복약판정: ${intakeStatus} (${mode})`);
      });
    });
  }
}

// ==========================================
// 🚀 기본 API 라우트
// ==========================================
app.get('/', (req, res) => {
  res.send('스마트 약통 서버가 정상 작동 중입니다!');
});

// 1. 회원가입 API
app.post('/api/signup', (req, res) => {
  const { uid, userId, password, name, phone, role } = req.body; 
  
  // ★ 앱에서 어떤 데이터가 넘어왔는지 터미널에 출력
  console.log("👉 [회원가입 요청 도착]:", req.body); 

  const query = 'INSERT INTO users (uid, userId, password, name, phone, role) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [uid, userId, password, name, phone, role], (err, result) => {
    if (err) {
      // ★ DB 저장 실패 시 터미널에 진짜 에러 원인을 빨간 글씨로 출력!
      console.error('❌ [DB 저장 에러 상세내용]:', err); 
      return res.status(500).json({ message: 'DB 저장 실패', error: err.message });
    }
    console.log("✅ [회원가입 성공]:", userId);
    res.status(201).json({ message: '회원가입 성공!' });
  });
});

// 2. 로그인 API
app.post('/api/login', (req, res) => {
  const { userId, password } = req.body;
  const query = 'SELECT * FROM users WHERE userId = ? AND password = ?';
  db.query(query, [userId, password], (err, results) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (results.length > 0) res.status(200).json({ message: '로그인 성공', user: results[0] });
    else res.status(401).json({ message: '아이디 또는 비밀번호가 틀렸습니다.' });
  });
});

// 3. 전화번호로 사용자 검색 API
app.get('/api/users/search/:phone', (req, res) => {
  const phone = req.params.phone;
  const query = 'SELECT uid, userId, name, role, phone FROM users WHERE phone = ?';
  db.query(query, [phone], (err, results) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (results.length > 0) res.status(200).json(results[0]);
    else res.status(404).json({ message: '사용자를 찾을 수 없음' });
  });
});

// 4. 보호자-환자 관계 등록 API
app.post('/api/relation', (req, res) => {
  const { protectorId, seniorId, relationType } = req.body;
  
  console.log("1️⃣ [관계 등록 시작] 데이터 확인:", { protectorId, seniorId, relationType });

  if (!protectorId || !seniorId) {
    return res.status(400).json({ message: '데이터가 부족합니다.' });
  }

  const deleteQuery = 'DELETE FROM relations WHERE seniorId = ?';
  db.query(deleteQuery, [seniorId], (err, deleteResult) => {
    if (err) {
      return res.status(500).json({ message: '기존 관계 삭제 실패', error: err.message });
    }

    const insertQuery = 'INSERT INTO relations (protectorId, seniorId, relationType) VALUES (?, ?, ?)';
    db.query(insertQuery, [protectorId, seniorId, relationType], (err, result) => {
      if (err) {
        return res.status(500).json({ message: '관계 저장 실패', error: err.message });
      }
      return res.status(201).json({ message: '관계 등록이 완료되었습니다.' });
    });
  });
});

// 4-1. 보호자에게 등록된 어르신이 있는지 확인하는 API
app.get('/api/relation/check/:protectorId', (req, res) => {
  const { protectorId } = req.params;
  const query = 'SELECT * FROM relations WHERE protectorId = ?';
  db.query(query, [protectorId], (err, results) => {
    if (err) return res.status(500).json({ message: '서버 오류' });
    if (results.length > 0) {
      res.status(200).json({ hasSenior: true, seniorId: results[0].seniorId });
    } else {
      res.status(200).json({ hasSenior: false });
    }
  });
});

// 5. 어르신 ID로 보호자 전화번호 조회 API
app.get('/api/protector-phone/:seniorId', (req, res) => {
  const { seniorId } = req.params;
  const query = `
    SELECT u.phone 
    FROM users u
    JOIN relations r ON u.uid = r.protectorId
    WHERE r.seniorId = ?
  `;
  db.query(query, [seniorId], (err, results) => {
    if (err) return res.status(500).json({ message: '서버 오류', error: err.message });
    if (results.length > 0) res.status(200).json({ phoneNumber: results[0].phone });
    else res.status(404).json({ message: '연결된 보호자 번호가 없습니다.' });
  });
});

// ==========================================
// 6. 약 등록 API 수정 보강 (시간 동기화 병행)
// ==========================================
app.post('/api/medicines/add', (req, res) => {
  const { seniorId, medicineName, pillboxNumber, dosage, alarmTime } = req.body;
  
  const sql = `INSERT INTO medicines_settings (seniorId, medicineName, pillboxNumber, dosage, alarmTime) 
               VALUES (?, ?, ?, ?, ?)`;
  
  db.query(sql, [seniorId, medicineName, pillboxNumber, dosage, alarmTime], (err, result) => {
    if (err) {
      console.error("❌ 약 등록 에러:", err);
      return res.status(500).json({ message: "DB 저장에 실패했습니다." });
    }
    
    // ESP32 하드웨어로 복약 일정 JSON 전송 (정확히 HH:mm 5글자 보장)
    const formattedTime = (alarmTime || '09:00').trim().substring(0, 5);
    const schedulePayload = {
      scheduleId: result.insertId,
      medicineName,
      pillboxNumber: Number(pillboxNumber),
      dosage: dosage || '1알',
      alarmTime: formattedTime
    };
    const payloadString = JSON.stringify(schedulePayload) + '\n';

    if (portInstance && portInstance.isOpen) {
      // 약 등록 시 현재 시간도 함께 재동기화 후 일정 전송
      syncHardwareTime();
      portInstance.write(payloadString);
      console.log('📤 [ESP32 일정 전달]:', payloadString.trim());
    } else {
      console.log('💡 [가상 모드] ESP32로 전송될 일정 JSON 규격:', payloadString.trim());
    }

    console.log("💊 약 등록 완료! 대상 어르신:", seniorId);
    res.status(200).json({ 
      message: "약 등록 성공!", 
      medicineId: result.insertId 
    });
  });
});

// 7. 약 목록 조회 API
app.get('/api/medicines/list/:seniorId', (req, res) => {
  const { seniorId } = req.params;
  const sql = `SELECT id, medicineName, pillboxNumber, alarmTime 
               FROM medicines_settings 
               WHERE seniorId = ? 
               ORDER BY alarmTime ASC`;
               
  db.query(sql, [seniorId], (err, results) => {
    if (err) {
      console.error("❌ DB 조회 에러 발생:", err);
      return res.status(500).json({ message: "DB 조회 실패" });
    }
    res.status(200).json(results);
  });
});

// 8. 약 삭제 API
app.delete('/api/medicines/:id', (req, res) => {
  const { id } = req.params;
  const sql = "DELETE FROM medicines_settings WHERE id = ?";
  db.query(sql, [id], (err, result) => {
    if (err) {
      console.error("❌ 약 삭제 에러:", err);
      return res.status(500).json({ message: "DB 삭제 실패" });
    }
    res.status(200).json({ message: "삭제 완료" });
  });
});

// 9. 어르신 복약 완료 기록 저장 API
app.post('/api/medicines/intake', (req, res) => {
  const { scheduleId, intakeStatus, userPk } = req.body;

  const findUserSql = `
    SELECT u.id as realUserId, d.deviceUid 
    FROM users u
    LEFT JOIN pillbox_devices d ON u.id = d.userPk
    WHERE u.uid = ? 
    LIMIT 1
  `;

  db.query(findUserSql, [userPk], (err, userRows) => {
    if (err) return res.status(500).json({ message: "유저 조회 실패", error: err.message });
    if (userRows.length === 0) return res.status(404).json({ message: "유저를 찾을 수 없습니다." });

    const realUserId = userRows[0].realUserId;
    let deviceUid = userRows[0].deviceUid || 'ESP32_001';

    const insertSql = `
      INSERT INTO pillbox_intake_logs 
      (scheduleId, userPk, deviceUid, intakeStatus, mode, checkedAt)
      VALUES (?, ?, ?, ?, 'user_check', NOW())
    `;
    db.query(insertSql, [scheduleId, realUserId, deviceUid, intakeStatus], (insertErr) => {
      if (insertErr) {
        console.error("❌ 복약 기록 저장 실패:", insertErr);
        return res.status(500).json({ message: "기록 저장 실패", error: insertErr.message });
      }
      res.status(200).json({ message: "성공적으로 기록되었습니다!" });
    });
  });
});

// 10. 주간 복약 통계 API
app.get('/api/stats/weekly/:userPk', (req, res) => {
  const { userPk } = req.params;
  const findUserSql = `SELECT id FROM users WHERE id = ? OR uid = ? LIMIT 1`;

  db.query(findUserSql, [userPk, userPk], (userErr, userRows) => {
    if (userErr || userRows.length === 0) {
      return res.status(200).json({
        labels: ['월', '화', '수', '목', '금', '토', '일'],
        takenCount: [0, 0, 0, 0, 0, 0, 0],
        notTakenCount: [0, 0, 0, 0, 0, 0, 0],
        totalTaken: 0,
        totalNotTaken: 0
      });
    }

    const realUserPk = userRows[0].id;

    const query = `
      SELECT 
        DATE_FORMAT(checkedAt, '%Y-%m-%d') AS date,
        SUM(CASE WHEN intakeStatus = 'taken' THEN 1 ELSE 0 END) AS takenCount,
        SUM(CASE WHEN intakeStatus = 'not_taken' THEN 1 ELSE 0 END) AS notTakenCount
      FROM pillbox_intake_logs
      WHERE userPk = ? 
        AND checkedAt >= DATE_SUB(NOW(), INTERVAL 7 DAY)
      GROUP BY DATE(checkedAt)
      ORDER BY DATE(checkedAt) ASC;
    `;

    db.query(query, [realUserPk], (err, results) => {
      if (err) return res.status(500).json({ message: "DB 통계 조회 실패" });

      const labels = ['월', '화', '수', '목', '금', '토', '일'];
      const takenCount = [0, 0, 0, 0, 0, 0, 0];
      const notTakenCount = [0, 0, 0, 0, 0, 0, 0];
      let totalTaken = 0;
      let totalNotTaken = 0;

      results.forEach(row => {
        const dayIndex = new Date(row.date).getDay();
        const convertedIndex = dayIndex === 0 ? 6 : dayIndex - 1;
        takenCount[convertedIndex] = Number(row.takenCount);
        notTakenCount[convertedIndex] = Number(row.notTakenCount);
        totalTaken += Number(row.takenCount);
        totalNotTaken += Number(row.notTakenCount);
      });

      res.status(200).json({ labels, takenCount, notTakenCount, totalTaken, totalNotTaken });
    });
  });
});

// 11. 월간 복약 통계 API (최근 4주간 주차별 집계)
app.get('/api/stats/monthly/:userPk', (req, res) => {
  const { userPk } = req.params;
  const findUserSql = `SELECT id FROM users WHERE id = ? OR uid = ? LIMIT 1`;

  db.query(findUserSql, [userPk, userPk], (userErr, userRows) => {
    if (userErr || userRows.length === 0) {
      return res.status(200).json({
        labels: ['1주차', '2주차', '3주차', '4주차'],
        takenCount: [0, 0, 0, 0],
        totalTaken: 0,
        totalNotTaken: 0
      });
    }

    const realUserPk = userRows[0].id;

    const query = `
      SELECT 
        FLOOR(DATEDIFF(NOW(), checkedAt) / 7) AS weekIndex,
        SUM(CASE WHEN intakeStatus = 'taken' THEN 1 ELSE 0 END) AS takenCount,
        SUM(CASE WHEN intakeStatus = 'not_taken' THEN 1 ELSE 0 END) AS notTakenCount
      FROM pillbox_intake_logs
      WHERE userPk = ? 
        AND checkedAt >= DATE_SUB(NOW(), INTERVAL 28 DAY)
      GROUP BY weekIndex
      ORDER BY weekIndex DESC;
    `;

    db.query(query, [realUserPk], (err, results) => {
      if (err) return res.status(500).json({ message: "월간 통계 조회 실패" });

      const labels = ['1주차', '2주차', '3주차', '4주차'];
      const takenCount = [0, 0, 0, 0];
      let totalTaken = 0;
      let totalNotTaken = 0;

      results.forEach(row => {
        const index = 3 - Number(row.weekIndex);
        if (index >= 0 && index < 4) {
          takenCount[index] = Number(row.takenCount);
        }
        totalTaken += Number(row.takenCount);
        totalNotTaken += Number(row.notTakenCount);
      });

      res.status(200).json({ labels, takenCount, totalTaken, totalNotTaken });
    });
  });
});

// 12. 기기 상세 정보 조회 API (배터리 및 최근 센서 로그 결합)
app.get('/api/device/details/:userPk', (req, res) => {
  const { userPk } = req.params;

  const query = `
    SELECT 
      d.deviceUid, d.deviceName, d.batteryLevel, d.connected,
      s.sensorAverage AS lastSensorAvg,
      s.medicineDetected AS lastDetected,
      s.pillboxNumber AS lastSlot,
      s.createdAt AS lastMeasuredAt
    FROM pillbox_devices d
    LEFT JOIN (
      SELECT * FROM pillbox_status_logs 
      ORDER BY id DESC LIMIT 1
    ) s ON 1=1
    WHERE d.userPk = ? OR d.id = 1
    LIMIT 1;
  `;

  db.query(query, [userPk], (err, rows) => {
    if (err || !rows || rows.length === 0) {
      return res.status(200).json({
        deviceUid: 'ESP32_001',
        deviceName: '어르신 스마트 약통',
        batteryLevel: 82,
        connected: 1,
        lastSensorAvg: 2870,
        lastDetected: 1,
        lastSlot: 1,
        lastMeasuredAt: new Date()
      });
    }
    res.status(200).json(rows[0]);
  });
});

// 13. 기기 수동 측정 명령 요청 API (문서 규격 command: "measure")
app.post('/api/device/measure', (req, res) => {
  const { deviceUid = 'ESP32_001', pillboxNumber = 1 } = req.body;

  const commandPayload = {
    deviceUid,
    mode: 'user_check',
    command: 'measure',
    pillboxNumber: Number(pillboxNumber)
  };

  const payloadString = JSON.stringify(commandPayload) + '\n';

  // 실제 시리얼 포트가 열려 있으면 하드웨어로 송신
  if (portInstance && portInstance.isOpen) {
    portInstance.write(payloadString, (err) => {
      if (err) return res.status(500).json({ success: false, message: '시리얼 전송 에러' });
      console.log('📤 [ESP32 Serial 송신]:', payloadString.trim());
      return res.status(200).json({ success: true, message: '기기로 측정 명령을 전송했습니다.' });
    });
  } else {
    // 하드웨어 미연결 시: 센서 20회 측정 딜레이(1.5초) 후 시뮬레이션 데이터 자동 생성
    console.log(`📡 [하드웨어 시뮬레이션] ${pillboxNumber}번 칸 센서 20회 측정 중...`);

    setTimeout(() => {
      // 3500 기준 센서값 시뮬레이션 (약 있음: 3500 미만)
      const mockSensorAvg = Math.floor(Math.random() * 1500) + 2500; 
      const isDetected = mockSensorAvg < 3500; 

      const mockHardwareResult = {
        deviceUid,
        scheduleId: null,
        pillboxNumber: Number(pillboxNumber),
        power: true,
        mode: 'user_check',
        batteryPercent: 82,
        connected: true,
        sensorAverage: mockSensorAvg,
        medicineDetected: isDetected
      };

      console.log('📥 [가상 하드웨어 응답]:', mockHardwareResult);
      processHardwareData(mockHardwareResult);
    }, 1500);

    return res.status(200).json({ 
      success: true, 
      message: `${pillboxNumber}번 칸 측정이 시작되었습니다. (1.5초 후 갱신)` 
    });
  }
});

// 14. 기기 테스트 API (LED / 부저)
app.post('/api/device/test', (req, res) => {
  const { deviceUid, testType } = req.body;
  console.log(`🤖 [기기 테스트 요청] 기기ID: ${deviceUid}, 테스트: ${testType}`);
  res.status(200).json({
    success: true,
    message: `${testType === 'led' ? 'LED' : '부저'} 테스트 신호를 전송했습니다!`
  });
});

// 앱에서 하드웨어 제어 신호를 받을 API 라우터
app.post('/api/hardware/control', (req, res) => {
  const { deviceUid, target, state } = req.body;
  console.log(`📱 [앱 요청 수신]: ${target}를 ${state} 상태로 변경`);

  // 시리얼 포트(COM4)가 열려있을 때만 아두이노로 데이터 전송
  if (portInstance && portInstance.isOpen) {
    // 예: {"command":"led","state":"on"} 형태로 줄바꿈(\n)을 포함해 전송
    const commandString = JSON.stringify({ command: target, state: state }) + '\n';
    
    portInstance.write(commandString, (err) => {
      if (err) {
        console.error('시리얼 전송 에러:', err);
        return res.status(500).json({ success: false, error: '시리얼 전송 실패' });
      }
      res.json({ success: true, message: '기기로 명령을 전송했습니다.' });
    });
  } else {
    res.status(500).json({ success: false, error: '하드웨어(COM4)가 연결되어 있지 않습니다.' });
  }
});

// 서버 실행
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 서버가 모든 네트워크 인터페이스(0.0.0.0) 포트 ${port}에서 대기 중입니다!`);
});