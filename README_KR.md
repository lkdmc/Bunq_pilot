# bunq Spending Tracker

bunq 계좌의 거래 내역을 자동으로 분류하고, Claude AI(Finn)가 지출 분석·예측·조언을 제공하는 풀스택 뱅킹 앱입니다.

## 아키텍처

```
frontend/          React + Vite + Tailwind (포트 5173)
backend/           FastAPI + SQLite (포트 8000)
  ├── main.py          API 서버, 웹훅 수신, Claude AI 연동
  ├── bunq_client.py   bunq SDK로 잔액·거래 조회
  ├── seed_data.py     더미 데이터 시딩 (웹훅 직접 호출)
  └── seed_real.py     실제 bunq 샌드박스 API로 시딩
```

## 사전 준비

- Python 3.10+
- Node.js 18+
- [Anthropic API 키](https://console.anthropic.com/) — Finn AI 채팅·영수증 분석에 필요
- [bunq 샌드박스 API 키](https://www.bunq.com/developer/) — 잔액 조회·실시간 웹훅에 필요

## 1. 환경 변수 설정

```bash
cp env.example backend/.env
```

`backend/.env` 파일을 열어 값을 채웁니다:

```env
ANTHROPIC_API_KEY=sk-ant-...          # 필수: Finn AI 기능 전체
BUNQ_API_KEY=sandbox_...              # 선택: 실시간 잔액/거래 조회

# send_transactions.py 사용 시에만 필요 (수동 서명 방식)
BUNQ_SESSION_TOKEN=your_session_token
BUNQ_USER_ID=your_user_id
BUNQ_MONETARY_ACCOUNT_ID=your_monetary_account_id
BUNQ_PRIVATE_KEY_PATH=private.pem
```

> `BUNQ_API_KEY`가 없어도 더미 데이터(seed_data.py)로 앱을 실행할 수 있습니다.

## 2. 의존성 설치

**백엔드**
```bash
cd backend
pip install -r requirements.txt
```

**프론트엔드**
```bash
cd frontend
npm install
```

## 3. 앱 실행

프로젝트 루트에서 백엔드와 프론트엔드를 동시에 실행합니다:

```bash
chmod +x start.sh
./start.sh
```

또는 각각 별도 터미널에서:

```bash
# 터미널 1 — 백엔드
cd backend
uvicorn main:app --reload --port 8000

# 터미널 2 — 프론트엔드
cd frontend
npm run dev
```

실행 후 접속:
- **React 앱** → http://localhost:5173
- **백엔드 디버그 대시보드** → http://localhost:8000
- **API 문서** → http://localhost:8000/docs

## 4. 거래 데이터 채우기

앱을 처음 실행하면 거래 내역이 비어 있습니다. 아래 방법으로 데이터를 채우세요.

### 방법 A — 실제 bunq 샌드박스 (약 6분 소요)

`BUNQ_API_KEY`가 설정된 상태에서:

```bash
cd backend
python seed_real.py
```

실제 bunq 샌드박스 API를 통해 결제를 생성하고, bunq가 웹훅으로 서버에 콜백을 보냅니다.  
이 방식을 사용하려면 먼저 웹훅을 등록해야 합니다 (아래 5번 참고).

## 5. 실시간 웹훅 설정 (선택)

실제 bunq 거래가 실시간으로 반영되도록 하려면 ngrok으로 로컬 서버를 외부에 노출한 뒤 웹훅을 등록합니다.

```bash
ngrok http 8000
# 출력된 https://xxxx.ngrok-free.app URL 복사
```

bunq 포털(또는 Postman)에서 웹훅 등록:

```
POST /v1/user/{user_id}/monetary-account/{monetary_account_id}/notification-filter-url
```

```json
{
  "notification_filters": [
    {"category": "PAYMENT", "notification_target": "https://xxxx.ngrok-free.app/webhook"},
    {"category": "MUTATION", "notification_target": "https://xxxx.ngrok-free.app/webhook"}
  ]
}
```

## 주요 기능

| 탭 | 설명 |
|---|---|
| **Home** | 계좌 잔액, 최근 거래 목록, 영수증 스캔 |
| **Subs** | AI가 자동 감지한 정기 구독 목록 및 연간 비용 |
| **Forecast** | 이달 말 잔액 예측, 예산 설정, 월별 지출 추이 차트 |
| **Finn AI** | Claude 기반 채팅형 재무 어시스턴트 |
| **Receipt** | 영수증 이미지 업로드 → 항목별 분류 및 절약 조언 |

## 백엔드 페이지 (디버그용)

| URL | 설명 |
|---|---|
| `http://localhost:8000/` | 실시간 대시보드 (5초마다 자동 새로고침) |
| `http://localhost:8000/report-page/2026/4` | 특정 월 지출 리포트 |
| `http://localhost:8000/advice` | AI 절약 팁 |
| `http://localhost:8000/docs` | FastAPI Swagger UI |

## 추가 스크립트

```bash
# 수동 서명 방식으로 30건 테스트 거래 전송 (BUNQ_SESSION_TOKEN 등 필요)
cd backend
python send_transactions.py
```

```bash
# counterparty가 'Sugar Daddy'로 저장된 기존 거래의 merchant명 재추출 (1회성 마이그레이션)
curl -X POST http://localhost:8000/api/admin/fix-counterparties
```
