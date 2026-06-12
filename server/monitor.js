// server/monitor.js
function registerMonitorRoutes(app, db) {
  const pool = db.promise ? db.promise() : db;

  // 보호자용 어르신 복약 현황 조회 API
  app.get('/api/monitor/:protectorUid', async (req, res) => {
    const { protectorUid } = req.params;
    
    try {
      // 1. relations 테이블에서 보호자와 연결된 어르신 찾기
      // 2. 해당 어르신의 medicines_settings (약 일정) 가져오기
      // 3. 오늘 날짜의 pillbox_intake_logs (복용 기록) 매칭하기
      const [rows] = await pool.query(`
        SELECT 
          m.id AS scheduleId,
          m.medicineName,
          m.alarmTime,
          m.pillboxNumber,
          l.intakeStatus,
          l.checkedAt
        FROM relations r
        JOIN medicines_settings m ON r.seniorId = m.seniorId
        LEFT JOIN pillbox_intake_logs l 
          ON m.id = l.scheduleId 
          AND DATE(l.checkedAt) = CURDATE()
        WHERE r.protectorId = ?
        ORDER BY m.alarmTime ASC
      `, [protectorUid]);

      res.status(200).json(rows);
    } catch (error) {
      console.error('❌ 모니터링 조회 에러:', error);
      res.status(500).json({ message: "상태 조회 실패", error: error.message });
    }
  });
}

module.exports = { registerMonitorRoutes };