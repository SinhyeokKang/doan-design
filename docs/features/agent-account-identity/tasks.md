# agent-account-identity — tasks

순서는 PoC → 순수 함수 → main → 실제 앱 → 승격이다. UI 문구·화면이 바뀌지 않아 초안(`/design-draft`)은 없다. 커밋 경계는 `── commit ──`. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다. 의존성은 더하지 않는다.

## P. PoC

- [ ] P1. Codex 조회 시간: 격리 환경에서 `.scratch/account-identity/codex-account-read.mjs`에 시간 측정을 더해, app-server 시작부터 `account/read` 응답까지를 빈 `CODEX_HOME`으로 5회 잰다. 10초 제한(design §2 '실패')이 넉넉한지 본다. 서명된 프로필의 측정은 R1에서 한다.
  - 검증: command undecided — needs user confirmation(`.scratch/` 스크립트를 `node`로 실행). 결과(중앙값·최대, 날짜, 버전)를 design §1에 적는다.

── commit: `docs(feature): agent-account-identity Codex lookup timing` ──

## T. 순수 함수

- [ ] T1. `identity.ts`의 `codexAccountEmail`, `googleRefreshRequest`, `googleAccessToken`, `googleEmail`, `withIdentity`, `skipCodexIdentity`(design §2 '순수 함수' 표).
  - 경우: chatgpt·apiKey·amazonBedrock·`account: null`, 빈·512자 초과·`\0` 이메일, `token_uri` 다름(`http:`, 다른 호스트, 경로 다름), scope 없음, 필드 빠짐·숫자, `access_token` 없음, `email_verified: false`, 조회 결과 `null`이면 이전 표시 필드 유지·`id`/`workspace`는 상태 계정의 것.
  - 검증: `npm --prefix app test`.

── commit: `feat(agent-auth): account identity parsers` ──

## M. main

- [ ] M1. `providers.ts`에 provider별 조회 정의(Codex app-server, Antigravity Google, 나머지 없음), `manager.ts`의 `signInFlow`(statusRun 뒤, seal·scrub 전)와 `check`(hold 안, statusRun 뒤)에 조회 단계. Codex 조회 프로세스는 attempt 프로세스 집합에 넣고, `running`·`leased`면 건너뛴다. Antigravity는 working copy를 읽고 전역 `fetch`에 요청마다 10초 제한. 실패는 결과를 바꾸지 않고 provider와 원인 종류만 로그.
  - 테스트(`manager.test.ts`, 가짜 spawn·fetch): 로그인 커밋 메타데이터에 이메일 저장, check가 상태 계정 이메일 갱신, 조회 실패 시 로그인 성공·check 이전 이메일 유지, 조회 중 취소는 `Cancelled`, Codex 실행 중 조회 프로세스를 띄우지 않음, access token이 상태·메타데이터·로그 인자에 없음, `token_uri`가 다르면 fetch를 부르지 않음, 응답의 `refresh_token`으로 파일을 쓰지 않음.
  - `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts`로 커밋 뒤에 조회가 없음을 확인한다(POSTMORTEM 2026-10-29).
  - `agentAuthView.ts`의 `detail` 주석을 고친다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(agent-auth): show Codex and Antigravity account email` ──

- [ ] M2. `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`.

## R. 실제 앱

- [ ] R1. `/runtime-test`: 서명된 Doan 프로필(`.scratch/provider-profile/userData`)로 앱을 띄워 Settings > Agents에서 Codex·Antigravity Retry → 이메일 표시를 확인한다. 이어서 Antigravity Retry를 한 번 더(서버 토큰이 계속 쓰이는지), Antigravity·Codex 새 대화 한 턴, Codex 조회 시간 측정. Antigravity token 응답에 `refresh_token` 키가 있었는지 로그로 기록한다(값은 기록하지 않음).
  - **실행 전 코디네이터 승인**: 실제 HOME과 키체인(`Codex Auth`, `doan Safe Storage`)을 쓰고 대화상자가 뜰 수 있다. 로그인·로그아웃은 하지 않는다.
  - 검증: `/runtime-test` 절차(`app/runtime/` 지원, `.scratch/runtime-test/` 프로브). 결과를 design §1과 §3 'PoC 의존'에 적는다.

── commit: `docs(feature): agent-account-identity runtime results` ──

## Z. 승격

- [ ] Z1. 승격과 삭제:
  - ARCHITECTURE §7 'Agent authentication': 'Account identity' 줄을 현재 규칙으로 고친다(Codex email from app-server `account/read`, Antigravity email from Google userinfo, 두 provider 모두 `id: null`). 경계 확장(design §3)을 같은 절에 적는다: 저장된 provider OAuth 클라이언트로 읽기 전용 신원 조회, 메모리 전용 access token, `token_uri` 고정, 실패는 결과를 바꾸지 않음, Codex는 실행 중 건너뜀, check 결과는 저장하지 않음. 'Known limits'에 프록시 미적용과 userinfo·refresh 관찰 범위를 적는다.
  - PRODUCT 'Open questions': Antigravity `sub`를 안정 계정 ID로 쓸지(재개 범위와 "조회 불가" 상태, design §3).
  - PRODUCT §5 항목 0 Agent step 문장은 그대로 맞으므로 고치지 않는다.
  - `docs/features/agent-account-identity/`를 지운다.
  - 검증: `rg -n 'expose none' docs/ARCHITECTURE.md`가 비어 있고, `rg -n 'agent-account-identity' docs`가 비어 있다.

── commit: `docs(architecture): account identity for Codex and Antigravity` (PRODUCT·ARCHITECTURE·삭제는 문서별로 나눈다) ──
