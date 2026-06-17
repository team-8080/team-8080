![:8080 Banner](https://capsule-render.vercel.app/api?type=waving&color=timeGradient&height=250&section=header&text=:8080&fontSize=140&fontColor=ffffff)


# 💊 지켜약 (Jikyeoyak)
> **AI 기반 IoT 스마트 약통 연동 맞춤 케어 서비스**

## 📢 프로젝트 개요
**'지켜약'**은 고령화 시대에 어르신들의 낮은 복약 순응도 문제를 해결하기 위해 기획된 올인원 시니어 케어 플랫폼입니다. 
보호자와 어르신을 앱으로 연결하고, 하드웨어(스마트 약통)와 비전 AI 기술을 융합하여 안전하고 정확한 복약 습관을 형성할 수 있도록 돕습니다.

### 🎯 기획 배경
- 성인 기준 고혈압(30.7%), 당뇨병(14.8%) 유병률 증가에 따른 만성질환 관리 필요성 대두
- 복약 누락 및 미준수로 인한 의료비 낭비와 건강 악화 방지

---

## ✨ 핵심 기능 (Key Features)

### 1. 👨‍👩‍👧‍👦 보호자-어르신 맞춤형 UI 및 양방향 케어
- **권한 분리:** 보호자용 화면과 어르신용 화면의 UI/UX를 분리하여 사용성 극대화
- **간편 원격 등록:** 보호자가 어르신의 약 목록과 알람 시간을 앱에서 대신 설정 가능
- **복약 모니터링:** 어르신의 복약 여부, 약통 배터리 상태 등을 보호자 앱에서 실시간 조회 가능

### 2. 📸 비전 AI 기반 약품 식별
- 구글 **Gemini 2.5 Flash API**를 활용하여 촬영된 알약의 모양, 색상, 식별표시(각인) 분석
- 마스터 DB와 대조하여 가장 일치하는 약품 후보 3가지를 제공하여 오남용 방지

### 3. 💬 AI 복약 상담 및 요약 (Chatbot)
- 일상 대화 및 가벼운 복약 알림 도우미 역할을 수행하는 챗봇 기능
- 매일 23:59에 하루 동안의 대화를 요약하여 DB에 저장, 보호자가 어르신의 컨디션을 파악할 수 있도록 지원

### 4. 📡 IoT 스마트 약통 실시간 연동
- 센서를 통해 약통이 열리고 닫히는 동작을 실시간으로 감지
- 기기 미연동 사용자를 위한 **가상 기기(Virtual Device) 연동 처리**를 통해 앱 단독 사용 지원

---

## 🛠 기술 스택 (Tech Stack)

### Frontend (App)
- **Framework:** React Native (Expo)
- **Push Notification:** Expo Notifications

### Hardware (IoT)
- **Sensors:** 조도/무게 센서 등 (실시간 약통 감지)

### Backend & AI
- **Framework & DB:** Node.js, Express, MySQL, Firebase
- **AI:** Google Generative AI (Gemini Vision & Text)

---

## 📊 시스템 아키텍처 및 DB 설계 (ERD)

<details>
<summary><b>데이터베이스 ERD 보기 (클릭)</b></summary>
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
