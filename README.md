![:8080 Banner](https://capsule-render.vercel.app/api?type=waving&color=timeGradient&height=250&section=header&text=:8080&fontSize=140&fontColor=ffffff)


<div align="center">
  <h1>💊 지켜약 (Jikyeoyak)</h1>
  <p><b>AI 기반 IoT 스마트 약통 연동 맞춤 케어 서비스</b></p>
  <br>
</div>

---

## 📢 1. 프로젝트 개요 (Overview)

**'지켜약'**은 고령화 시대에 어르신들의 낮은 복약 순응도 문제를 해결하기 위해 기획된 올인원 시니어 케어 플랫폼입니다. AI와 IoT 기술을 융합하여 안전한 복약 케어를 구현하는 것이 핵심입니다.

### 🚨 기획 배경
* **만성질환 유병률 증가:** 성인 기준 고혈압 30.7%, 당뇨병 14.8% (2024 국민건강통계)
* **심각성:** 복약순응도 저하 관련 연간 사망자 12.5만 명 발생 (CDC)
* **경제적 손실:** 복약 미준수로 인한 의료비 낭비 14.0% (영국)

### 🎯 목표 및 기대효과
* **목표:** 스마트 약통으로 복약 누락을 방지하고, AI 상담 및 보호자 연동 케어 제공
* **기대효과:** 어르신의 복약 순응도 향상, 건강 증진 도모 및 보호자의 돌봄 부담 경감

---

## ✨ 2. 핵심 기능 (Key Features)

<div align="center">
  <img src="./image_b4345f.png" alt="지켜약 핵심 기능 구성도" width="800" />
</div>
<br>

지켜약은 **보호자**와 **어르신**의 사용 환경을 분리하여 맞춤형 UI 및 양방향 케어 기능을 제공합니다.

### 👨‍👩‍👧‍👦 사용자별 맞춤 기능
* **보호자 화면:** 어르신 약 원격 등록/검색/삭제, 실시간 복약 모니터링, 알람 수신, 약통 설정, TTS 메시지 전송 기능
* **어르신 화면:** 직관적인 복약 확인 및 알람 수신, AI 건강 상담, TTS 음성 수신 지원

### 🚀 특화 기술
* **📸 비전 AI 기반 약품 식별:** Gemini API를 활용하여 촬영된 알약의 모양, 색상, 식별표시를 분석하고 마스터 DB와 대조하여 약품 자동 식별 및 등록 지원
* **💬 AI 복약 상담 (Chatbot):** 어르신을 위한 일상 대화 및 복약 알림 도우미 역할을 수행하며, 상담 내용을 요약하여 보호자에게 전달
* **📡 IoT 스마트 약통 실시간 연동:** 센서(조도, 무게 등)를 통해 약통 개폐 상태를 실시간으로 감지하여 앱에 연동 (가상 기기 연동 처리로 앱 단독 사용도 지원)

---

## 💡 3. 경쟁 서비스 분석 (Competitive Analysis)

기존 복약 알림 시스템의 한계를 극복하고, 자동화된 맞춤 관리를 제공합니다.

| 비교 항목 | 기존 시스템 (복약복약 등) | **지켜약 (Jikyeoyak)** |
| :--- | :--- | :--- |
| **복약 확인** | 수동 입력 | **센서 자동인식** |
| **알림 방식** | 단순 알림 | **단계적 대응 시스템** |
| **데이터 활용** | 기록 중심 | **분석 기반 관리** |
| **편의성** | 낮음 | **AI 자동화 (높음)** |
| **보호자 기능** | 제한적 | **실시간 양방향 관리 지원** |
| **접근성** | 낮음 | **어르신 맞춤형 (높음)** |

---

## 🛠 4. 기술 스택 (Tech Stack)

### Frontend (App)
* **Framework:** React Native (Expo)
* **Push Notification:** Expo Notifications

### Backend & AI
* **Framework & Server:** Node.js, Express, FastAPI, AWS EC2
* **Database:** MySQL, Firebase
* **AI & Vision:** Google Generative AI (Gemini API), TensorFlow, YOLOv8

### Hardware (IoT)
* **Embedded:** Arduino, Bluetooth
* **Sensors:** 실시간 개폐 감지 센서 (조도, 무게 센서 등)

---

## 📊 5. 시스템 아키텍처 및 DB 설계 (ERD)

<details>
<summary><b>데이터베이스 ERD 보기 (클릭하여 펼치기)</b></summary>
<br>

```mermaid
erDiagram
    users ||--o{ medicines_settings : "uid -> seniorId"
    users ||--o{ chat_sessions : "userId -> user_id"
    users ||--o{ chat_messages : "uid -> userUid"
    users ||--o{ chat_summaries : "uid -> userUid"
    users ||--o{ pillbox_devices : "id -> userPk"
    users ||--o{ pillbox_status_logs : "id -> userPk"
    users ||--o{ pillbox_intake_logs : "id -> userPk"
    users ||--o{ medicine_identifications : "uid -> userUid"
    users ||--o{ relations : "uid -> protectorId/seniorId"
    pillbox_devices ||--o{ pillbox_status_logs : "deviceUid -> deviceUid"
    pillbox_devices ||--o{ pillbox_intake_logs : "deviceUid -> deviceUid"
    medicines_settings ||--o{ pillbox_intake_logs : "id -> scheduleId"
