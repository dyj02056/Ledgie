# Ledgie

영수증 사진이나 카드 문자를 올리면 에이전트가 가게·금액·분류를 뽑아 저장하고, 채팅으로 월별 지출을 물어볼 수 있는 가계부.
Next.js 16 · Neon(Postgres) · Better Auth · Vercel AI SDK.

## 실행

```powershell
npm install
copy .env.example .env.local   # 값을 채운다
npm run migrate                # 스키마와 RLS 적용
npm run dev
```

로컬에서 Neon 없이 확인하려면 Docker로 Postgres를 띄우고 `.env.local`의 두 연결 문자열을 그 DB로 맞추면 된다.

```powershell
docker run -d --name ledgie-pg -e POSTGRES_PASSWORD=dev -e POSTGRES_DB=ledgie -p 54329:5432 postgres:17
```

## 구조

- `db/migrations` — 인증 테이블, 앱 테이블, RLS. `npm run migrate`가 번호 순서대로 한 번씩 적용한다.
- `lib/db.ts` — `withUser(userId, fn)`: 트랜잭션 안에서 `app.user_id`를 심고 쿼리한다. 정책은 이 값으로 본인 행만 허용한다.
- `lib/agent` — 입력 분류(`classify`), 모델 선택(`model`), 도구(`tools`). 에이전트 루프와 SSE는 AI SDK가 처리한다.
- `app/api/chat/route.ts` — 로그인 확인, 일일 호출 상한, 스트리밍, 토큰·지연 기록.
- `app/(app)` — 장부, 영수증 목록, 사용량.

## 데이터 보안 규칙

- 앱은 `app_user` 역할로만 접속한다. 이 역할은 RLS를 우회하지 못한다. `DATABASE_URL_OWNER`는 마이그레이션과 인증 모듈 전용이다.
- 모든 앱 테이블은 `force row level security`이고 정책은 `user_id = current_setting('app.user_id')`이다.
- 카드·계좌번호를 저장하는 컬럼은 없다.
- API 키는 서버 환경변수에만 둔다.

## 모델 전환

`LLM_PROVIDER=ollama`(개발) 또는 `anthropic`(운영). 이미지 입력은 비전 모델이 있을 때만 받는다.
(`OLLAMA_VISION_MODEL` 또는 `ANTHROPIC_VISION_MODEL`)

## 테스트

```powershell
npm test                              # RLS 교차 접근, 스키마·분류, 합계 일치
npx tsx scripts/eval-extract.mts      # 서버를 띄운 뒤 영수증 20건 추출 정확도 측정
```

## 알려진 한계

- 분류기는 규칙 기반이다. 오분류율이 높아지면 소형 모델로 바꾼다.
- 이미지 원본은 저장하지 않는다. 필요해지면 Vercel Blob 비공개 저장소를 추가한다.
- 장부 갱신은 응답이 끝난 뒤 새로고침 방식이다(Realtime 구독 없음).
