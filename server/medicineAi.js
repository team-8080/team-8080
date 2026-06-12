// server/medicineAi.js
// AI 약 등록/검색(약 식별) 기능을 담당하는 라우터 모듈
// - 약의 앞면/뒷면 사진(또는 수동 입력값)에서 모양/색상/식별표시/분할면을 추출
// - 약품 마스터(medicine_master)와 대조해 가장 유사한 약 3가지를 반환
// - 식별 이력을 medicine_identifications 에 저장
//
// index.js 에서 require 후 registerMedicineAiRoutes(app, db) 로 등록합니다.

const { GoogleGenerativeAI } = require('@google/generative-ai');

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const MODEL_NAME = 'gemini-2.5-flash';

// 사진에서 약의 외형 특징만 JSON 으로 뽑아내도록 지시하는 프롬프트
const EXTRACT_PROMPT = `당신은 의약품 낱알 식별 보조 도구입니다.
주어진 약(알약) 사진(앞면/뒷면)을 보고 외형 특징만 추출하세요.
반드시 아래 JSON 형식 한 개만 출력하고, 그 외의 설명·마크다운·코드블록은 절대 쓰지 마세요.

{
  "shape": "모양 (원형/타원형/장방형/캡슐/기타 중 하나, 모르면 빈 문자열)",
  "color": "색상 (예: 흰색, 노란색, 분홍색. 모르면 빈 문자열)",
  "imprint": "식별표시/각인 문자나 숫자 (없거나 안 보이면 빈 문자열)",
  "scoreLine": "분할선 (없음/1자/십자 중 하나, 모르면 빈 문자열)"
}`;

// 추출된 특징 + 마스터 목록을 주고 가장 유사한 3가지를 고르게 하는 프롬프트
function buildMatchPrompt(features, masterList) {
  return `아래는 사용자가 촬영(또는 입력)한 약의 외형 특징입니다.
[특징]
모양: ${features.shape || '미상'}
색상: ${features.color || '미상'}
식별표시: ${features.imprint || '미상'}
분할선: ${features.scoreLine || '미상'}

아래는 약품 마스터 목록(id, 약이름, 모양, 색상, 식별표시, 분할선, 효능)입니다.
[약품 목록]
${masterList
  .map(
    (m) =>
      `- id:${m.id} | ${m.medicineName} | ${m.shape} | ${m.color} | ${m.imprint} | ${m.scoreLine} | ${m.efficacy}`
  )
  .join('\n')}

위 특징과 가장 유사한 약 후보 3가지를 약품 목록 안에서만 골라주세요.
반드시 아래 JSON 배열 한 개만 출력하고, 그 외의 설명·마크다운·코드블록은 절대 쓰지 마세요.
가장 유사한 순서대로 정렬하세요.

[
  {
    "masterId": 약품목록의 id 숫자,
    "medicineName": "약 이름",
    "efficacy": "효능 한 줄",
    "reason": "이 약으로 추정한 근거를 한 문장으로 (어떤 특징이 일치하는지)"
  }
]`;
}

// 모델이 코드블록(```json ... ```)으로 감싸 보내는 경우까지 안전하게 파싱
function safeJsonParse(text, fallback) {
  try {
    const cleaned = text
      .replace(/```json/gi, '')
      .replace(/```/g, '')
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.error('⚠️ JSON 파싱 실패, 원문:', text);
    return fallback;
  }
}

function registerMedicineAiRoutes(app, db) {
  const pool = db.promise ? db.promise() : db;

  // ---------------------------------------------------------------
  // 약 식별 API (AI 등록 / AI 검색 공용)
  //   body: {
  //     userUid: string,
  //     mode: 'register' | 'search',
  //     frontImageBase64?: string,   // 앞면 사진 (data 부분만, 헤더 제외)
  //     backImageBase64?:  string,   // 뒷면 사진
  //     manual?: { shape, color, imprint, scoreLine }  // 수동 검색용
  //   }
  //   return: { features, candidates: [...3개] }
  // ---------------------------------------------------------------
  app.post('/api/medicine/identify', async (req, res) => {
    const { userUid, mode, frontImageBase64, backImageBase64, manual } = req.body;

    if (!userUid || !mode) {
      return res.status(400).json({ message: 'userUid 와 mode 가 필요합니다.' });
    }

    try {
      let features = { shape: '', color: '', imprint: '', scoreLine: '' };

      // (1) 특징 추출 단계
      if (manual && (manual.shape || manual.color || manual.imprint || manual.scoreLine)) {
        // 수동 입력값을 그대로 특징으로 사용
        features = {
          shape: manual.shape || '',
          color: manual.color || '',
          imprint: manual.imprint || '',
          scoreLine: manual.scoreLine || '',
        };
        console.log('🟢 [identify] 수동 입력 특징 사용:', features);
      } else if (frontImageBase64) {
        // 사진에서 Gemini Vision 으로 특징 추출
        const visionModel = genAI.getGenerativeModel({ model: MODEL_NAME });

        const imageParts = [
          { inlineData: { mimeType: 'image/jpeg', data: frontImageBase64 } },
        ];
        if (backImageBase64) {
          imageParts.push({
            inlineData: { mimeType: 'image/jpeg', data: backImageBase64 },
          });
        }

        console.log('🟢 [identify] Gemini Vision 특징 추출 시작');
        const extractResult = await visionModel.generateContent([
          EXTRACT_PROMPT,
          ...imageParts,
        ]);
        const extractText = extractResult.response.text();
        features = safeJsonParse(extractText, features);
        console.log('🟢 [identify] 추출된 특징:', features);
      } else {
        return res
          .status(400)
          .json({ message: '사진(frontImageBase64) 또는 수동 입력(manual)이 필요합니다.' });
      }

      // (2) 약품 마스터 불러오기
      const [masterList] = await pool.query(
        `SELECT id, medicineName, shape, color, imprint, scoreLine, efficacy
         FROM medicine_master`
      );

      if (masterList.length === 0) {
        return res
          .status(200)
          .json({ features, candidates: [], message: '약품 마스터 데이터가 비어있습니다.' });
      }

      // (3) Gemini 로 후보 3가지 매칭
      const matchModel = genAI.getGenerativeModel({ model: MODEL_NAME });
      console.log('🟢 [identify] Gemini 후보 매칭 시작');
      const matchResult = await matchModel.generateContent(
        buildMatchPrompt(features, masterList)
      );
      const matchText = matchResult.response.text();
      let candidates = safeJsonParse(matchText, []);

      // 안전장치: 배열이 아니거나 3개 초과면 보정
      if (!Array.isArray(candidates)) candidates = [];
      candidates = candidates.slice(0, 3);
      console.log('🟢 [identify] 후보:', candidates.map((c) => c.medicineName));

      // (4) 식별 이력 저장
      await pool.query(
        `INSERT INTO medicine_identifications
           (userUid, mode, shape, color, imprint, scoreLine, candidates)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          userUid,
          mode,
          features.shape,
          features.color,
          features.imprint,
          features.scoreLine,
          JSON.stringify(candidates),
        ]
      );

      res.status(200).json({ features, candidates });
    } catch (err) {
      console.error('❌❌❌ 약 식별 처리 에러 ❌❌❌');
      console.error('에러 메시지:', err?.message);
      console.error('전체 에러:', err);
      res
        .status(500)
        .json({ message: 'AI 약 식별 실패', error: err?.message || String(err) });
    }
  });

  // ---------------------------------------------------------------
  // (선택) 약 식별 이력 조회 API
  // ---------------------------------------------------------------
  app.get('/api/medicine/identify/history/:userUid', async (req, res) => {
    const { userUid } = req.params;
    try {
      const [rows] = await pool.query(
        `SELECT mode, shape, color, imprint, scoreLine, candidates, createdAt
         FROM medicine_identifications
         WHERE userUid = ?
         ORDER BY createdAt DESC
         LIMIT 50`,
        [userUid]
      );
      res.status(200).json({ history: rows });
    } catch (err) {
      console.error('❌ 식별 이력 조회 에러:', err);
      res.status(500).json({ message: '조회 실패', error: err.message });
    }
  });
}

module.exports = { registerMedicineAiRoutes };
