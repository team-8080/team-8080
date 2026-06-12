// server/aiChat.js
// AI 건강 상담 + 채팅 요약 기능을 담당하는 라우터 모듈
// index.js 에서 require 하여 app, db 를 넘겨받아 사용합니다.

const { GoogleGenerativeAI } = require('@google/generative-ai');
const cron = require('node-cron');

// Gemini 클라이언트 초기화 (.env 의 GEMINI_API_KEY 사용)
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-2.5-flash';

// 서버 시작 시 키가 제대로 로드됐는지 확인 (실제 키 값은 노출 안 함)
console.log(
  '🔑 GEMINI_API_KEY 로드 상태:',
  process.env.GEMINI_API_KEY
    ? `설정됨 (길이 ${process.env.GEMINI_API_KEY.length}, 앞 4자리 ${process.env.GEMINI_API_KEY.slice(0, 4)})`
    : '❌ 없음 (undefined)'
);

// AI 건강 상담사의 역할/규칙을 정의하는 시스템 프롬프트
const SYSTEM_PROMPT = `당신은 노인과 보호자를 돕는 '스마트 약통' 앱의 AI 건강 상담사입니다.
다음 규칙을 반드시 지키세요.
1. 사용자가 증상을 이야기하면, 그 증상과 관련될 수 있는 유사한 병명 3가지를 제시하세요.
   각 병명마다 "왜 그렇게 추정하는지" 근거(어떤 증상이 그 병과 연결되는지)를 함께 설명하세요.
2. 약에 대해 질문하면 당신이 정확히 아는 정보만 제공하세요.
   확실하지 않거나 모르는 약이면 "정확한 정보를 알지 못합니다"라고 솔직하게 답하세요. 추측하지 마세요.
3. 당신은 의사가 아니므로 진단이 아닌 참고용 정보임을 밝히고, 증상이 심하면 병원 방문을 권하세요.
4. 어르신도 이해하기 쉽게 짧고 친절한 한국어로 답하세요.`;

// 요약 생성에 사용하는 프롬프트
const SUMMARY_PROMPT = '이 대화내역을 보고 15줄 이내의 요약본을 정리해줘';

function registerAiChatRoutes(app, db) {
  // db.promise() 로 async/await 사용
  const pool = db.promise ? db.promise() : db;

  // ---------------------------------------------------------------
  // 1) AI 건강 상담 메시지 전송 API
  //    프론트에서 { userUid, message } 를 보내면
  //    - 사용자 메시지를 DB 저장
  //    - 그날까지의 대화를 컨텍스트로 Gemini 호출
  //    - AI 답변을 DB 저장 후 반환
  // ---------------------------------------------------------------
  app.post('/api/ai/chat', async (req, res) => {
    const { userUid, message } = req.body;
    if (!userUid || !message) {
      return res.status(400).json({ message: 'userUid와 message가 필요합니다.' });
    }

    try {
      console.log('🟢 [AI chat] 요청 도착:', userUid, '| 메시지:', message);

      // (1) 사용자 메시지 저장
      await pool.query(
        'INSERT INTO chat_messages (userUid, role, content) VALUES (?, ?, ?)',
        [userUid, 'user', message]
      );
      console.log('🟢 [AI chat] 1단계 사용자 메시지 저장 완료');

      // (2) 오늘 나눈 최근 대화 불러와 컨텍스트 구성 (최근 20턴)
      const [rows] = await pool.query(
        `SELECT role, content FROM chat_messages
         WHERE userUid = ? AND DATE(createdAt) = CURDATE()
         ORDER BY createdAt ASC
         LIMIT 40`,
        [userUid]
      );
      console.log('🟢 [AI chat] 2단계 대화 조회 완료, 행 수:', rows.length);

      // Gemini 형식으로 변환 (role: user / model)
      const history = rows.slice(0, -1).map((r) => ({
        role: r.role,
        parts: [{ text: r.content }],
      }));

      const model = genAI.getGenerativeModel({
        model: MODEL_NAME,
        systemInstruction: SYSTEM_PROMPT,
      });

      console.log('🟢 [AI chat] 3단계 Gemini 호출 시작 (모델:', MODEL_NAME, ')');
      const chat = model.startChat({ history });
      const result = await chat.sendMessage(message);
      const aiText = result.response.text();
      console.log('🟢 [AI chat] 4단계 Gemini 응답 수신 완료');

      // (3) AI 답변 저장
      await pool.query(
        'INSERT INTO chat_messages (userUid, role, content) VALUES (?, ?, ?)',
        [userUid, 'model', aiText]
      );

      res.status(200).json({ reply: aiText });
    } catch (err) {
      // 에러 전체를 확실하게 출력 (message가 비어도 stack은 남도록)
      console.error('❌❌❌ AI 상담 처리 에러 발생 ❌❌❌');
      console.error('에러 이름:', err?.name);
      console.error('에러 메시지:', err?.message);
      console.error('전체 에러:', err);
      res.status(500).json({ message: 'AI 응답 실패', error: err?.message || String(err) });
    }
  });

  // ---------------------------------------------------------------
  // 2) 특정 날짜의 대화 기록 불러오기 (채팅방 재진입 시 이어보기용)
  // ---------------------------------------------------------------
  app.get('/api/ai/chat/:userUid', async (req, res) => {
    const { userUid } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT role, content, createdAt FROM chat_messages
         WHERE userUid = ? AND DATE(createdAt) = CURDATE()
         ORDER BY createdAt ASC`,
        [userUid]
      );
      res.status(200).json({ messages: rows });
    } catch (err) {
      console.error('❌ 대화 기록 조회 에러:', err);
      res.status(500).json({ message: '조회 실패', error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // 3) 상담 요약 목록 조회 API ('상담 기록 보기' 팝업용, 최신순)
  // ---------------------------------------------------------------
  app.get('/api/ai/summaries/:userUid', async (req, res) => {
    const { userUid } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT summaryDate, summaryText, createdAt FROM chat_summaries
         WHERE userUid = ?
         ORDER BY summaryDate DESC`,
        [userUid]
      );
      res.status(200).json({ summaries: rows });
    } catch (err) {
      console.error('❌ 요약 목록 조회 에러:', err);
      res.status(500).json({ message: '조회 실패', error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // 4) 하루치 요약 생성 로직 (스케줄러 + 수동 호출 공용 함수)
  //    targetDate 미지정 시 오늘 날짜 기준
  // ---------------------------------------------------------------
  async function summarizeUserDay(userUid, dateStr) {
    // 해당 날짜의 모든 대화 불러오기
    const [rows] = await pool.query(
      `SELECT role, content FROM chat_messages
       WHERE userUid = ? AND DATE(createdAt) = ?
       ORDER BY createdAt ASC`,
      [userUid, dateStr]
    );
    if (rows.length === 0) return null; // 대화 없으면 요약 안 함

    // 대화를 한 덩어리 텍스트로 합치기
    const conversation = rows
      .map((r) => `${r.role === 'user' ? '사용자' : 'AI'}: ${r.content}`)
      .join('\n');

    const model = genAI.getGenerativeModel({ model: MODEL_NAME });
    const result = await model.generateContent(
      `${SUMMARY_PROMPT}\n\n[대화 내역]\n${conversation}`
    );
    const summaryText = result.response.text();

    // 같은 날 요약이 이미 있으면 갱신 (UNIQUE 키 활용)
    await pool.query(
      `INSERT INTO chat_summaries (userUid, summaryDate, summaryText)
       VALUES (?, ?, ?)
       ON DUPLICATE KEY UPDATE summaryText = VALUES(summaryText), createdAt = CURRENT_TIMESTAMP`,
      [userUid, dateStr, summaryText]
    );
    return summaryText;
  }

  // 수동 요약 트리거 (테스트용 / 즉시 요약하고 싶을 때)
  app.post('/api/ai/summarize', async (req, res) => {
    const { userUid, date } = req.body;
    const dateStr = date || new Date().toISOString().slice(0, 10);
    try {
      const summary = await summarizeUserDay(userUid, dateStr);
      if (!summary) {
        return res.status(200).json({ message: '요약할 대화가 없습니다.' });
      }
      res.status(200).json({ summary });
    } catch (err) {
      console.error('❌ 수동 요약 에러:', err);
      res.status(500).json({ message: '요약 실패', error: err.message });
    }
  });

  // ---------------------------------------------------------------
  // 5) 매일 23:59(윈도우/서버 로컬 시간 기준)에 자동 요약 실행
  //    그날 대화한 모든 사용자를 찾아 각각 요약 저장
  // ---------------------------------------------------------------
  cron.schedule('59 23 * * *', async () => {
    const today = new Date().toISOString().slice(0, 10);
    console.log(`🕛 [${today}] 일일 상담 요약 시작`);
    try {
      const [users] = await pool.query(
        `SELECT DISTINCT userUid FROM chat_messages WHERE DATE(createdAt) = CURDATE()`
      );
      for (const u of users) {
        try {
          await summarizeUserDay(u.userUid, today);
          console.log(`  ✅ ${u.userUid} 요약 완료`);
        } catch (e) {
          console.error(`  ❌ ${u.userUid} 요약 실패:`, e.message);
        }
      }
      console.log('🕛 일일 상담 요약 종료');
    } catch (err) {
      console.error('❌ 일일 요약 스케줄러 에러:', err);
    }
  });
}

module.exports = { registerAiChatRoutes };