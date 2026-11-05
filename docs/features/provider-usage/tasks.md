# provider-usage — tasks

순서: PoC → UI 초안 → 순수 함수 → main 조회·캐시·IPC → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정할 점'에 있다.

## P. PoC

모두 사람의 승인, 로그인한 Doan 연결, 일회성 스크립트 `.scratch/provider-usage/`가 필요하다. 실제 HOME의 Keychain과 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 쓴다. 이는 AGENTS.md의 HOME 격리 규칙의 예외이고, 사람이 승인했다(agent-questions orch.md 결정 1). 정리는 E2 뒤 공용 프로필 정리와 함께 한다. 결과(버전, 응답 모양, 공통 기준 (i)–(iv)의 판정, 프로필·vault 전후 비교, 날짜)는 이 파일 아래 'P 결과'에 적고, 개인 정보를 지운 응답을 A1의 fixture 재료로 남긴다.

- [ ] U1. Claude usage control request(design 'PoC 의존' U1).
  - 검증: command undecided — needs user confirmation(Doan 연결 프로필의 SDK 세션과 실제 계정 조회). 'P 결과'에 U1 (a)–(d)와 공통 기준 (i)–(iv)의 판정이 모두 있다.
- [ ] U2. Codex `account/rateLimits/read`(U2).
  - 검증: command undecided — needs user confirmation. 'P 결과'에 U2 (a)–(c)와 공통 기준의 판정, 0.158.0·0.166.0 각각의 응답이 있다.
- [ ] U3. Copilot `--headless --stdio` `account.getQuota`(U3).
  - 검증: command undecided — needs user confirmation. 'P 결과'에 U3 (a)–(d)와 공통 기준의 판정, 또는 막힘과 이유가 있다.
- [ ] U4. Antigravity 설치본 `agy -p /usage`(U4). Keychain 대화상자가 뜨면 바로 중단한다.
  - 검증: command undecided — needs user confirmation. 'P 결과'에 U4 (a)–(c)와 공통 기준의 판정, 또는 막힘과 이유가 있다.
- [ ] U5. Cursor credential과 usage 엔드포인트 하나(U5).
  - 검증: command undecided — needs user confirmation. 'P 결과'에 U5 (a)–(e), 고른 엔드포인트와 헤더, 공통 기준의 판정, 또는 막힘과 이유가 있다.
- [ ] U6. (사람의 결정) U3–U5 결과로 Copilot·Antigravity·Cursor를 구현에 넣을지 정한다(design 결정할 점 1). 빼는 provider는 `not_supported`로 두고 spec·design·이 파일의 A1·B1·C1에서 그 부분을 지운다.
  - 검증: 결정을 design '결정할 점'에 적고 바뀐 spec·design·tasks를 커밋한다.

### P 결과

(PoC 뒤 적는다.)

── commit: `docs(feature): record provider-usage PoC results` ──

## D. UI 초안

- [x] D0. `/design-draft`로 `.doan/canvases/provider-usage.html`을 그린다. 프레임:
  - 링 버튼의 세 자리(사람이 헤더 오른쪽 끝을 골랐다)(셸 오른쪽 아래 세로, 헤더 오른쪽 끝 가로, 셸 오른쪽 아래 가로) 비교. 각 자리의 충돌(toast, docked composer Send, drag region, 좁은 앱 창, provider 0 → 1)을 함께 그린다.
  - 화면마다(workspace, Home, Settings, Add Projects) 버튼의 위치.
  - 링 상태: 값 있음, 한도에 닿음, 처음 읽는 중, unavailable, 쓸 수 없는 연결, 무제한. provider 1개와 5개, 좁은 앱 창에서 접힌 링.
  - popover: 한도 창별 막대와 글, "Updated …"·"Updating…", 이유별 한 줄 문구(design §4), 열린 동안 provider가 빠지거나 생기는 경우.
  - 사람이 자리와 링 색 규칙을 고르고 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 main HEAD에서 낸 finding 목록과 같은 목록을 내고, 설치된 `doan ls --repo . --json`에 새 캔버스가 있다. 사람의 확인.
  - 결과: frame `place-stack`, `place-header`, `place-row`, `ring-states`, `popover`, `popover-live`. `doan check` 13건(main과 같음), 폭 2640. 로고 경로를 `.doan/assets/provider-logos/`로 고쳤다. 사람이 자리를 헤더 오른쪽 끝으로 골랐다(design 결정할 점 10). 링 색과 그리며 정한 나머지는 아래 '초안 확인'에 남는다.

### 초안 확인(남은 것)

그리며 정한 것으로 사람의 확인이 필요하다: 링 색(Neutral / Bands 70·90), 좁은 앱 창의 링 접기 규칙을 둘지(헤더에서 960×600에도 다섯 개가 들어감), 문구 "Reset · updating"·"Updated just now", popover 제목 "Agent usage", 이유 줄 모양(read_failed 오류, blocked 경고, 나머지 subtle), 한도 보고 없는 100%는 "100% used"만, 링 track 색의 component constant를 새 token으로 올릴지.

── commit: `docs(design): draft provider usage` ──

## A. 순수 함수

- [ ] A1. `UsageReading`·`UsageEntry` 타입(type-only, renderer가 import), `claudeUsage`, `codexUsage`, U6에서 넣은 provider의 파서. fixture `app/src/main/agentAuth/fixtures/<provider>-usage.json`과 `README.md`의 출처.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green: fixture 입력, null·빠진 한도 창, `rate_limits_available: false`, 상한 밖 비율 자르기, 모르는 모양 `read_failed`, `rateLimitReachedType` → `limited`, Copilot 모두 무제한 → `unlimited`·빈 `windows`, `Method not found`·모르는 control request → `not_supported`, `rendererImports.test.ts` 통과.
- [ ] A2. `ringValue`, `usageText`, `shouldRead`, 버튼 설명 글, `UsageStore`의 지우기.
  - 검증: `npm --prefix app test` —
    - `ringValue`: 지난 한도 창 제외, 빈 `windows`·`unlimited`·unavailable·`blocked` → null.
    - `usageText`: 분·시간·일, 한도에 닿음, 지난 시각, `resetsAt` 없음.
    - `shouldRead`: 앱 시작·sign-in·턴 끝·popover 열기, 5분 간격, popover 열기의 예외(지난 한도 창, 마지막 실패), 진행 중 조회, 앱 창이 보이지 않을 때, 쓸 수 없는 연결, legacy external 턴은 계기가 아님, 앱 재시작 뒤 빈 캐시.
    - `UsageStore`: `connectionId`가 바뀌면 지움, 조회 시작 뒤 `connectionId`가 바뀐 결과는 버림.
    - 설명 글: 다섯 provider가 고정 순서로, unavailable·한도에 닿음 포함.

── commit: `feat: read provider usage responses` ──

## B. main 조회·캐시·IPC

- [ ] B1. provider별 조회(design §1): 앱 시작·sign-in·popover용 새 프로세스(Claude 빈 작업 폴더 `cwd`와 `skipBehaviors`, Codex app-server, U6에서 넣은 provider)와 턴 끝의 살아 있는 runner 재사용(Claude 열린 `Query`, Codex app-server). lease 용도(design §2, POSTMORTEM 2026-10-30), sign-out의 `stopRuns`에 묶기, `initialize` 답부터 세는 시간 제한과 `initialize` 상한, 같은 provider 조회 합치기, Cursor는 엔드포인트 하나·host 고정·리다이렉트 거부·응답 상한·토큰 갱신 없음.
  - 검증: `npm --prefix app test` — fake executable(credential 없음)과 fake HTTP로 각 조회의 성공·실패·시간 초과·`initialize` 없음, 계기 두 번이 프로세스 하나와 같은 결과를 받음, 조회 중 sign-out이 `stop_required`를 묻지 않고 조회 프로세스를 멈춤, 조회가 대화 시작을 막지 않음, 턴 끝 조회가 새 프로세스를 띄우지 않음, Cursor 리다이렉트·다른 host 거부, Cursor 토큰이 반환값·로그·오류 글에 없음(`not.toContain`).
- [ ] B2. `UsageStore`(메모리만), `connectionId` 키와 늦은 결과 버리기, 쓸 수 없는 연결의 `blocked`, 턴 끝 계기(Doan 연결 대화만), IPC `agent-usage:read`(`senderAllowed.ts` `mainOnly`)·`agent-usage:changed`, main의 앱 창 표시 판단.
  - 검증: `npm --prefix app test` — sign-in·sign-out·교체 뒤 이전 값 없음, 디스크에 쓰지 않음, 다른 sender 거절, `agent-usage:changed`와 `agent-usage:read` 응답과 `UsageStore` 내용에 connection ID·프로필 경로·계정 ID·Cursor 토큰이 없음(`not.toContain`), 앱 창이 숨겨지면 읽지 않음. `npm --prefix app run typecheck`.

── commit: `feat: read agent account usage in main` ──

## C. UI

- [ ] C1. 링 버튼과 popover(헤더 오른쪽 끝, 모든 화면, no-drag), preload 호출.
  - 검증: `npm --prefix app test` — 링 값과 빈 링, 고정 순서, 버튼 이름 고정과 설명 글, `aria-haspopup`·`aria-expanded`, 클릭·Space·Return으로 열기, Esc·바깥 클릭으로 닫고 버튼으로 포커스 복귀, 이유별 문구, "Updating…" 중 이전 값 유지, 상대 시간 1분 갱신, 열린 동안 provider가 빠지고 생김, 마지막 provider가 빠지면 닫고 `.shell-modes`의 현재 탭으로 포커스, 연결이 없을 때 버튼 없음. `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat: show agent usage rings` ──

## E. 실제 앱 확인

- [ ] E1. `/design-sync`로 링과 popover를 초안과 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.
- [ ] E2. `/runtime-test`: 공용 프로필로 연결한 provider마다 링 값이 PoC 값과 같은지, 턴 뒤 갱신(새 프로세스 없음), 5분 간격과 popover 열기의 예외, sign-out 뒤 링 사라짐, unavailable provider, 쓸 수 없는 연결의 문구. 사람의 승인을 받는다.
  - 검증: `/runtime-test` 보고(스크린샷). 사람 상태(프로필, vault, Keychain 항목)가 확인 전과 같은지 보고에 적는다.
- [ ] E3. 공통 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill stub·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT: §3 In scope 7 'Agent authentication'의 하위 항목으로 사용량 표시를 더한다(결정할 점 9). §5에 링 버튼의 자리와 동작, 모든 화면, popover, 읽는 때, 이유별 문구, provider별 지원 범위.
  - ARCHITECTURE §7 'Agent authentication': 사용량 조회 경로(provider별, 턴 끝 재사용), lease 용도와 `stopRuns`, `connectionId` 키의 메모리 캐시, 응답으로 정하는 `not_supported`, Cursor usage 토큰 예외(Antigravity identity 예외와 같은 형식), 설치된 `agy`만 씀.
  - BACKLOG.md: 사용량 항목을 지우고, 구현하지 않은 provider와 막힌 PoC를 적는다.
  - 그리고 `docs/features/provider-usage/`를 지운다.
  - 검증: `grep -n 'account/rateLimits/read' docs/ARCHITECTURE.md`에 줄이 있다, `grep -n 'Agent usage' docs/PRODUCT.md`에 줄이 있다, `grep -n 'remaining usage or rate limits' docs/BACKLOG.md`에 줄이 없다, `docs/features/provider-usage/`가 없다.

── commit: `docs(product): agent usage rings` / `docs(architecture): agent usage reads` / `docs(backlog): settle agent usage` / `docs(feature): remove provider-usage docs` ──
