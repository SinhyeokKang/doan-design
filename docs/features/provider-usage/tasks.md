# provider-usage — tasks

순서: PoC → UI 초안 → 순수 함수 → main 조회·캐시·IPC → UI → 실제 앱 확인 → 문서 승격. 결정은 design '결정할 점'에 있다.

## P. PoC

모두 사람의 승인, 로그인한 Doan 연결(실제 HOME의 Keychain, 공용 프로필 `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`), 일회성 스크립트 `.scratch/provider-usage/`가 필요하다. 결과(버전, 응답 모양, 모델 요청 여부, 프로필 전후 비교, 날짜)는 이 파일 아래 'P 결과'에 적고, 개인 정보를 지운 응답을 B의 fixture 재료로 남긴다.

- [ ] U1. Claude usage control request(design 'PoC 의존' U1).
  - 검증: AGENTS.md 'Commands'에 해당 명령이 없다 — command undecided, needs user confirmation(Doan 연결 프로필의 SDK 세션과 실제 계정 조회). 결과를 'P 결과'에 적는다.
- [ ] U2. Codex `account/rateLimits/read`(U2). 0.158.0 후보는 `npm install --prefix .scratch/provider-usage/clis/codex-0.158.0`처럼 따로 설치한다(cli-minimum-versions와 같은 방식).
  - 검증: command undecided, needs user confirmation. 결과를 'P 결과'에 적는다.
- [ ] U3. Copilot `--headless --stdio` `account.getQuota`(U3).
  - 검증: command undecided, needs user confirmation. 결과 또는 막힘을 'P 결과'에 적는다.
- [ ] U4. Antigravity 설치본 `agy -p /usage`(U4).
  - 검증: command undecided, needs user confirmation. 결과 또는 막힘을 'P 결과'에 적는다.
- [ ] U5. Cursor credential과 usage 웹 API(U5).
  - 검증: command undecided, needs user confirmation. 결과 또는 막힘을 'P 결과'에 적는다.
- [ ] U6. (사람의 결정) U3–U5 결과로 Copilot·Antigravity·Cursor를 구현에 넣을지 정한다(design 결정할 점 1). 빼는 provider는 `not_supported`로 두고 spec·design·이 파일의 B·C에서 그 부분을 지운다.
  - 검증: 결정을 design '결정할 점'에 적고 바뀐 spec·design·tasks를 커밋한다.

### P 결과

(PoC 뒤 적는다.)

── commit: `docs(feature): record provider-usage PoC results` ──

## D. UI 초안

- [ ] D0. `/design-draft`로 `.doan/canvases/provider-usage.html`을 그린다. 프레임: 링 버튼의 세 자리(셸 오른쪽 아래 세로, 헤더 오른쪽 끝 가로, 셸 오른쪽 아래 가로) 비교, 링의 상태(값 있음, 높은 사용량, unavailable, 읽는 중), provider 1개·5개, popover(창별 막대와 리셋 시각, unavailable 줄, 마지막 읽은 시각), 좁은 창. 사람이 자리와 링 색 규칙을 고르고 앱에서 확인한다.
  - 검증: 설치된 `doan check --repo .`가 base와 같은 finding만 낸다, 사람의 확인.

── commit: `docs(design): draft provider usage` ──

## A. 순수 함수

- [ ] A1. `UsageReading` 타입(type-only, renderer가 import), `claudeUsage`, `codexUsage`, 그리고 U6에서 넣은 provider의 파서(`copilotUsage`, `agyUsage`, `cursorUsage`). fixture `app/src/main/agentAuth/fixtures/*-usage.json`과 `README.md`의 출처.
  - 검증: `npm --prefix app test` — 새 테스트 먼저 red, 구현 뒤 green: fixture 입력, null·빠진 창, `rate_limits_available: false`, 상한 밖 비율 자르기, 모르는 모양 `read_failed`, `rendererImports.test.ts` 통과.
- [ ] A2. `ringValue`, `usageText`, `shouldRead`, 링 버튼 이름.
  - 검증: `npm --prefix app test` — `shouldRead`: 앱 시작·sign-in·턴 끝·popover 열기, 5분 간격, 진행 중 조회, 창이 보이지 않을 때; `usageText`: 분·시간·일, 지난 시각, `resetsAt` 없음.

── commit: `feat: read provider usage responses` ──

## B. main 조회·캐시·IPC

- [ ] B1. provider별 조회(design §1): Claude SDK 세션, Codex app-server, U6에서 넣은 provider. lease 용도(design §2, POSTMORTEM 2026-10-30), `initialize` 답부터 세는 시간 제한, 같은 provider 조회 합치기.
  - 검증: `npm --prefix app test` — fake executable(credential 없음)로 각 조회의 성공·실패·시간 초과, 조회 중 sign-out이 `stop_required`를 묻지 않음, 조회가 대화 시작을 막지 않음, Cursor 토큰이 반환값·로그·오류 글에 없음(`not.toContain`).
- [ ] B2. `UsageStore`(메모리만), 연결 revision에 따른 지우기, 턴 끝 계기, IPC `agent-usage:read`·`agent-usage:changed`(main window only).
  - 검증: `npm --prefix app test` — sign-in·sign-out·교체 뒤 이전 값 없음, 디스크에 쓰지 않음, 다른 sender 거절, 창에 connection ID·프로필 경로·계정 ID가 가지 않음. `npm --prefix app run typecheck`.

── commit: `feat: read agent account usage in main` ──

## C. UI

- [ ] C1. 링 버튼과 popover(D0에서 고른 자리), preload 호출, 창이 보일 때만 읽기 요청.
  - 검증: `npm --prefix app test`(링 값과 빈 링, 연결 순서, 버튼 이름, popover 키보드·Esc·포커스 복귀, unavailable 줄, 연결이 없을 때 버튼 없음), `npm --prefix app run typecheck`, `npm --prefix app run build`.

── commit: `feat: show agent usage rings` ──

## E. 실제 앱 확인

- [ ] E1. `/design-sync`로 링과 popover를 초안과 맞추고 DESIGN.md에 측정값을 적는다.
  - 검증: `/design-sync` 보고의 측정 일치.
- [ ] E2. `/runtime-test`: 공용 프로필로 연결한 provider마다 링 값이 PoC 값과 같은지, 턴 뒤 갱신, 5분 간격, sign-out 뒤 링 사라짐, unavailable provider. 사람의 승인을 받는다.
  - 검증: `/runtime-test` 보고(스크린샷). 사람 상태가 확인 전과 같은지 보고에 적는다.
- [ ] E3. 공통 gate.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` exit 0.

`/agent-eval`은 생략한다. guide·CLI 출력·skill stub·`doan check` 규칙이 바뀌지 않는다.

## Z. 승격과 정리

- [ ] Z1. 결론을 현재 규칙으로 옮긴다(영문). 근거는 커밋 메시지에 둔다.
  - PRODUCT §5: 링 버튼의 자리와 동작, popover, 읽는 때, unavailable 문구, provider별 지원 범위. §3 In scope 7에 사용량 표시를 더한다.
  - ARCHITECTURE §7 'Agent authentication': 사용량 조회 경로(provider별), lease 용도, 메모리만 쓰는 캐시, Cursor usage 토큰 예외(Antigravity identity 예외와 같은 형식), 설치된 `agy`만 씀.
  - BACKLOG.md: 사용량 항목을 지우고, 구현하지 않은 provider와 막힌 PoC를 적는다.
  - 그리고 `docs/features/provider-usage/`를 지운다.
  - 검증: `grep -n -i 'usage' docs/ARCHITECTURE.md`에 조회 경로 줄이 있다, `grep -n -i 'usage' docs/PRODUCT.md`에 링 규칙이 있다, BACKLOG에 "remaining usage" 줄이 없다, `docs/features/provider-usage/`가 없다.

── commit: `docs(product): agent usage rings` / `docs(architecture): agent usage reads` / `docs(backlog): settle agent usage` / `docs(feature): remove provider-usage docs` ──
