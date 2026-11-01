# agent-account-identity — tasks

순서는 PoC → 순수 함수 → main → 실제 앱 → 검증 → 승격이다. UI 문구·화면이 바뀌지 않아 초안(`/design-draft`)은 없다. 커밋 경계는 `── commit ──`. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓰고, 없으면 "command undecided — needs user confirmation"으로 적는다. 의존성은 더하지 않는다.

## P. PoC

- [x] P1. Codex 조회 시간 하한: `.scratch/account-identity/codex-account-read.mjs`에 시간 측정을 더해, app-server 시작부터 `account/read` 응답까지를 격리된 빈 `CODEX_HOME`으로 5회 잰다(로그인 상태가 아니어서 하한이다). 서명된 프로필의 측정은 R1에서 한다.
  - 판정: 최대가 2.5초 미만이면 5초 예산을 유지한다. 넘으면 design §2 '시간 예산'을 다시 정하고 코디네이터에게 알린다.
  - 검증: command undecided — needs user confirmation(`node .scratch/account-identity/codex-account-read.mjs <temp CODEX_HOME>`). 결과(중앙값·최대, 날짜, 버전)를 design §1에 적는다.

── commit: `docs(feature): agent-account-identity Codex lookup timing` ──

## T. 순수 함수

- [x] T1. `app/src/main/agentAuth/identity.ts`의 `codexAccountEmail`, `googleRefreshRequest`, `googleAccessToken`, `googleEmail`, `withIdentity`(design §2 '순수 함수' 표). 테스트는 `app/src/main/agentAuth/identity.test.ts`.
  - 경우: chatgpt·apiKey·amazonBedrock·`account: null`; 빈·512자 초과·`\0` 이메일; 파일이 JSON 객체가 아님(배열, `null`, 문자열); `token_uri` 다름(`http:`, 다른 호스트, 다른 경로, 끝 `/`); `scopes`가 배열이 아님·`userinfo.email` 없음; 필드 빠짐·숫자; form 인코딩(`+`, `&`, `=`가 든 secret); `access_token` 없음; 응답에 `refresh_token` 있음 → `refreshTokenReturned: true`; `email_verified: false`; `withIdentity`의 `found: null` + `previous` 있음·`previous: null`, `id`/`workspace`/`displayName`은 상태 계정의 것.
  - 검증: `npm --prefix app test`.

── commit: `feat(agent-auth): account identity parsers` ──

## M. main

- [x] M1. 조회 단계(design §2 '조회 단계'):
  - `providers.ts`: `ProviderAuth.identity`(Codex `"codex-app-server"`, Antigravity `"google-userinfo"`, 나머지 `null`), `label` export.
  - `manager.ts`: `AuthManagerOptions.fetch`; attempt별 `AbortController`를 `stop()`이 abort; provider별 5초 예산; Codex `rpcExec`(`launch(..., profile)`, `processes` 등록, `CodexDispatcher`, `experimentalApi: true`); Antigravity는 hold 안에서 파일만 읽고 요청은 `drop` 뒤(로그인은 seal·scrub 전); `signInFlow`는 `previous = null`, `check`는 적용 시점의 상태 계정; 조회 뒤 취소 재확인; 응답의 `refresh_token`은 값 없는 경고만.
  - `agentAuthView.ts`의 `detail` 주석을 고친다.
  - 테스트(`app/src/main/agentAuth/manager.test.ts`, 가짜 spawn·fetch, 필요한 곳은 fake timers):
    - 로그인 커밋 메타데이터에 이메일이 저장된다. Codex 교체 로그인은 staging 프로필 `CODEX_HOME`으로 조회한다.
    - check가 상태 계정 이메일을 채우고 `writeMetadata`를 부르지 않는다(재시작 뒤 이메일 없는 저장 연결).
    - 첫 check 성공 → 두 번째 check 조회 실패 → 이메일이 남는다. 교체 로그인 조회 실패 → 이전 이메일이 붙지 않는다.
    - 실패 경우마다 로그인 성공·check `ok`: Codex app-server 무응답(5초 뒤 프로세스 정리), spawn 실패·조기 종료, token 400 `invalid_grant`, userinfo 401, 5xx, `fetch` reject, working copy 없음·JSON 아님, `token_uri` 다름(이때 `fetch`를 부르지 않음).
    - 응답 없는 `fetch` 중 로그인 취소 → 곧바로 `Cancelled`. 그 중 `quit()`이 5초 안에 끝나고 금고가 비지 않는다.
    - check 조회 중 sign-out이 check를 대체 → 늦은 결과는 `stale`이고 상태가 바뀌지 않는다.
    - access token 문자열이 상태·메타데이터·`console.error`/`console.warn` 인자에 없다. 응답의 `refresh_token`으로 파일을 쓰지 않는다.
    - Claude·Cursor·Copilot의 check·sign-in과 Copilot `runConfirmed`는 추가 spawn·fetch가 없고 계정이 status 결과 그대로다.
  - `rg -n 'writeMetadata' app/src/main/agentAuth/manager.ts`로 커밋 뒤에 조회가 없음을 확인한다(POSTMORTEM 2026-10-29, 읽기 전용 확인).
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.

── commit: `feat(agent-auth): show Codex and Antigravity account email` ──

## R. 실제 앱

- [x] R1. `/runtime-test`: 서명된 Doan 프로필 `/Users/sinhyeok/code/doan-design/.scratch/provider-profile/userData`(백업 `userData.bak-173237`)로 이 worktree의 dev 앱을 띄운다(`DOAN_CLI=<go build로 만든 절대 경로> npm --prefix app run dev -- -- --user-data-dir=<그 userData>`, 실제 HOME). 로그인·로그아웃은 하지 않는다.
  - **실행 전 코디네이터 승인**: 실제 HOME과 키체인(`Codex Auth`, `doan Safe Storage`)을 쓰고 대화상자가 뜰 수 있다. 실행 전 `pgrep -fl 'provider-profile/userData'`가 비어 있음을 확인하고, `agent-auth/metadata.json`의 sha256과 `profiles/` 목록을 기록한다.
  - 단계: (1) 앱을 띄우고 Settings > Agents를 연다 → Codex·Antigravity가 "not checked"에서 자동 check 뒤 이메일로 바뀌고, 그 사이 사라졌다 다시 나타나지 않는다. 조회 시간을 main 로그 시각으로 잰다. (2) 앱을 끄고 다시 띄워 Settings > Agents를 연다 → Antigravity 자동 check가 다시 `connected`이고 이메일이 보인다. (3) Codex·Antigravity 새 대화 한 턴씩 → `turn.done`. (4) main 로그에 "Google returned a refresh token" 경고가 있었는지 기록한다(값은 기록하지 않음).
  - 통과 기준: 두 이메일 표시, 두 번째 Antigravity check `connected`, 두 턴 완료, `metadata.json` sha256이 실행 전과 같음, 로그에 `ya29.`가 없음, 실행 뒤 `pgrep`이 비어 있음. Codex 프로필에 새로 생긴 파일을 기록한다.
  - 검증: command undecided — needs user confirmation(`node .scratch/runtime-test/agent-account-identity/<probe>.mjs`, `app/runtime/` 지원 사용). 결과를 design §1과 §3 'PoC 의존'에 적는다. 조회가 5초 예산을 넘으면 코디네이터에게 알린다.

── commit: `docs(feature): agent-account-identity runtime results` ──

## V. 검증

- [ ] V1. `/verify`. R1에서 코드가 바뀌었으면 그 뒤에 다시 돌린다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`.

## Z. 승격

- [ ] Z1. 승격과 삭제(문서별 커밋):
  - ARCHITECTURE §7 'Agent authentication':
    - 'Account identity' 줄을 현재 규칙으로: Codex email from app-server `account/read`, Antigravity email from Google userinfo, 두 provider 모두 `id: null`. "without a stable ID the shown account follows the latest check"를 "the last successful lookup"으로.
    - 'GitHub token exception'처럼 이름 붙은 'Antigravity identity exception' 문단(design §3).
    - 조회 단계 규칙: 5초 예산, abort, Antigravity 요청은 hold 밖, 실패는 결과를 바꾸지 않음, check 결과는 저장하지 않음.
    - 'Known limits': 프록시 미적용, userinfo·refresh 관찰 범위, 같은 `CODEX_HOME`의 여러 app-server가 토큰을 갱신할 때의 위험, 실행 중 재로그인 뒤 이전 이메일, 첫 조회 실패 시 그 앱 세션 동안 빈 줄.
    - 커밋: `docs(architecture): account identity for Codex and Antigravity`.
  - PRODUCT 'Open questions': (a) Antigravity `sub`를 안정 계정 ID로 쓸지(재개 범위와 "조회 불가" 상태), (b) 사람 단위 Codex ID가 필요해지면 `auth.json`을 금고 working copy로 둘지(design §3 'Codex 저장 방식'의 비용과 함께). PRODUCT §5 항목 0 Agent step 문장은 그대로 맞으므로 고치지 않는다.
    - 커밋: `docs(product): open questions on agent account ids`.
  - `docs/features/agent-account-identity/`를 지운다.
    - 커밋: `docs(feature): remove agent-account-identity`.
  - 검증: `rg -n 'expose none' docs/ARCHITECTURE.md`와 `rg -n 'agent-account-identity' docs`가 비어 있다(읽기 전용 확인).
