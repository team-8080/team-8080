const express = require('express');
const mysql = require('mysql2');
const cors = require('cors');
require('dotenv').config();

// ★ AI 기능 및 모니터링 라우터 모듈 불러오기
const { registerAiChatRoutes } = require('./aiChat');
const { registerMedicineAiRoutes } = require('./medicineAi');
const { registerMonitorRoutes } = require('./monitor'); // 방금 만든 모니터링 파일

const app = express();
// 포트 설정 (맨 아래에서 한 번만 listen 하도록 통일)
const port = process.env.PORT || 3000;

app.use(cors());
// ★ AI 약 식별: 사진 base64 가 커서 기본 100kb 제한으로는 부족 → 25mb 로 상향
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
registerMonitorRoutes(app, db); // ★ 모니터링 라우터 실행!

// 기본 서버 확인 라우트
app.get('/', (req, res) => {
  res.send('스마트 약통 서버가 정상 작동 중입니다!');
});

// 1. 회원가입 API
app.post('/api/signup', (req, res) => {
  const { uid, userId, password, name, phone, role } = req.body; 
  const query = 'INSERT INTO users (uid, userId, password, name, phone, role) VALUES (?, ?, ?, ?, ?, ?)';
  db.query(query, [uid, userId, password, name, phone, role], (err, result) => {
    if (err) return res.status(500).json({ message: 'DB 저장 실패', error: err.message });
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
  // ★ 중요: 프론트에서 실제 UID가 필요하므로 uid를 컬럼에 추가했습니다.
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
    console.log("❌ 데이터 부족: protectorId나 seniorId가 없습니다.");
    return res.status(400).json({ message: '데이터가 부족합니다.' });
  }

  // 1단계: 기존 관계 삭제
  const deleteQuery = 'DELETE FROM relations WHERE seniorId = ?';
  console.log("2️⃣ [삭제 진행 중...] seniorId:", seniorId);

  db.query(deleteQuery, [seniorId], (err, deleteResult) => {
    if (err) {
      console.error("❌ 1단계 삭제 중 에러 발생:", err);
      return res.status(500).json({ message: '기존 관계 삭제 실패', error: err.message });
    }

    console.log("3️⃣ [삭제 완료] 새 관계 등록 시작...");

    // 2단계: 새로운 관계 저장
    const insertQuery = 'INSERT INTO relations (protectorId, seniorId, relationType) VALUES (?, ?, ?)';
    db.query(insertQuery, [protectorId, seniorId, relationType], (err, result) => {
      if (err) {
        console.error("❌ 2단계 등록 중 에러 발생:", err);
        return res.status(500).json({ message: '관계 저장 실패', error: err.message });
      }
      
      console.log("4️⃣ [등록 완료] 모든 작업 성공!");
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
      // 등록된 어르신이 있음!
      res.status(200).json({ hasSenior: true, seniorId: results[0].seniorId });
    } else {
      // 아직 등록된 어르신이 없음
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

// 6. 약 등록 API
app.post('/api/medicines/add', (req, res) => {
  const { seniorId, medicineName, pillboxNumber, dosage, alarmTime } = req.body;
  
  const sql = `INSERT INTO medicines_settings (seniorId, medicineName, pillboxNumber, dosage, alarmTime) 
               VALUES (?, ?, ?, ?, ?)`;
  
  db.query(sql, [seniorId, medicineName, pillboxNumber, dosage, alarmTime], (err, result) => {
    if (err) {
      console.error("❌ 약 등록 에러:", err);
      return res.status(500).json({ message: "DB 저장에 실패했습니다." });
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
  
  console.log("======================================");
  console.log("🔍 [요청 들어옴] 약 목록 조회 대상 UID:", seniorId);
  console.log("======================================");
  
  const sql = `SELECT id, medicineName, pillboxNumber, alarmTime 
               FROM medicines_settings 
               WHERE seniorId = ? 
               ORDER BY alarmTime ASC`;
               
  db.query(sql, [seniorId], (err, results) => {
    if (err) {
      console.error("❌ DB 조회 에러 발생:", err);
      return res.status(500).json({ message: "DB 조회 실패" });
    }
    
    console.log("📦 [DB 조회 결과] 가져온 데이터 개수:", results.length);
    console.log("======================================");
    
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
    console.log("🗑️ 약 삭제 완료! 약 ID:", id);
    res.status(200).json({ message: "삭제 완료" });
  });
});

// ==========================================
// 🌟 여기서부터 복붙해서 덮어씌워 주세요! 🌟
// ==========================================

// 9. 어르신 복약 완료 기록 저장 API
app.post('/api/medicines/intake', (req, res) => {
  const { scheduleId, intakeStatus, userPk } = req.body;

  // 1. 파이어베이스 UID로 진짜 유저 번호(id)와 연결된 기기 번호 찾기
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
    let deviceUid = userRows[0].deviceUid; // 진짜 약통이 있다면 그 번호를 씁니다.

    // 🌟 핵심: 기록을 저장하는 함수
    const saveIntakeLog = (finalDeviceUid) => {
      const insertSql = `
        INSERT INTO pillbox_intake_logs 
        (scheduleId, userPk, deviceUid, intakeStatus, mode, checkedAt)
        VALUES (?, ?, ?, ?, 'user_check', NOW())
      `;
      db.query(insertSql, [scheduleId, realUserId, finalDeviceUid, intakeStatus], (insertErr) => {
        if (insertErr) {
          console.error("❌ 복약 기록 저장 실패:", insertErr);
          return res.status(500).json({ message: "기록 저장 실패", error: insertErr.message });
        }
        console.log(`✅ [복약 완료 DB 저장 성공] 일정ID: ${scheduleId}`);
        res.status(200).json({ message: "성공적으로 기록되었습니다!" });
      });
    };

    // 2. 기기가 없다면? -> DB에 가상의 약통(앱 연동)을 하나 만들어 줍니다!
    if (!deviceUid) {
      // 해당 유저 전용 가상 기기 ID 생성
      deviceUid = `VIRTUAL_APP_${realUserId}`; 
      
      const insertDeviceSql = `
        INSERT IGNORE INTO pillbox_devices (userPk, deviceUid, deviceName, connected) 
        VALUES (?, ?, '스마트폰 앱 (가상)', 1)
      `;
      
      db.query(insertDeviceSql, [realUserId, deviceUid], (devErr) => {
        if (devErr) console.error("가상 기기 생성 에러 (무시 가능):", devErr);
        // 가상 기기를 만든 후 복약 기록 저장!
        saveIntakeLog(deviceUid);
      });
    } else {
      // 기기가 이미 있다면 바로 저장!
      saveIntakeLog(deviceUid);
    }
  });
});

// 서버 실행
app.listen(port, '0.0.0.0', () => {
  console.log(`🚀 서버가 모든 네트워크 인터페이스(0.0.0.0) 포트 ${port}에서 대기 중입니다!`);
});