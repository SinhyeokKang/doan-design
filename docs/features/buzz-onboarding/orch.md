# buzz-onboarding — orch

체인 [chain-261028](../chain-261028/chain.md)의 링크 2이다. 원본 계획은 [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md)이고, 이 파일은 배치 분할·결정·진행만 기록한다.

- 시작 hash: main `9ebfff6`(2026-10-29)
- 통합 브랜치: `feat-buzz-onboarding`(Orca worktree `buzz-onboarding-orch`)
- 지휘자: Claude Code(Opus 5.5)
- 상시 권한(체인 파일): 이 링크의 PR을 main에 병합한다. Codex 작업자를 쓸 수 있다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| D1 | 같은 이름의 옛 로컬 브랜치 `feat-buzz-onboarding`(0d3ff70, main의 조상)을 쓰던 `/private/tmp/doan-buzz-onboarding-draft` worktree를 detach하고, 브랜치를 main `9ebfff6`으로 다시 맞췄다. 그 worktree의 추적 안 된 파일은 그대로 두었다 | 사용자 결정(2026-10-29) |
| D2 | F5: PRODUCT §3 Out of scope 3, §5 항목 0, §7(네 줄)에 온보딩 결정을 기록했다. §2·§5 본문과 §3 Out of scope 6의 승격은 V3에서 한다 | tasks F5 범위 |
| D3 | F6: `version_incompatible` 행과 버전 원인의 check 동작을 design 상태 대응 표에 반영했다. 두 버전 행은 초안에 tile을 추가하지 않고 'doan tools check failed' tile 형식을 쓰며, 문구는 design에 적었다 | 사용자 결정(2026-10-29) |
| D4 | V1b(b)의 실제 userData 사용은 `onboarding start`·`status`까지만 허가한다. 로그인·프로젝트 선택·complete는 하지 않고, 실행 전후로 실제 userData의 `runtime.json`·`onboarding.json`·`folders.json`을 비교해 보고한 뒤 앱을 종료한다 | 사용자 결정(2026-10-29) |
| D5 | `/agent-eval`은 새 온보딩 시나리오를 추가해 실행한다(pass/fail fixture, `verify.mjs --eval`, `node eval/run.ts --self-test` PASS 포함) | 사용자 결정(2026-10-29) |
| D6 | B2를 두 Task로 나눈다. U1은 기존 agent-auth preload만으로 되는 Welcome·Agent 단계를 M과 병렬로 만들고, U2는 M 통합 뒤 Project 단계 연결·고아 채널 제거·`onboardingClosed` 재정의·design-sync를 한다 | 지휘자 판단 — preload·main은 M이 소유하므로 U1이 그 파일을 건드리지 않아야 병렬이 된다 |
| D7 | design-sync(V1의 대조 부분)는 renderer를 소유한 U가 U2 끝에 한다. 나머지 V1·V1b·V1c는 보고만 하는 V 작업자가 하고 결함은 소유 작업자에게 돌린다 | orchestrate: 지휘자·검증 작업자는 배치 코드를 고치지 않는다 |
| D8 | T1에서 출하 화면의 같은 값(셸 56px, font-weight 600)을 새 토큰으로 바꾸는 것은 computed가 같은 곳만 한다 | tasks T1 그대로, 지휘자 판단 |
| D9 | 실인증 로그인 승인은 지휘자가 ego-lite로 처리한다 | 체인 파일 운영 메모 |
| D10 | C의 CLI 계약: 사용자나 앱이 해결해야 하는 온보딩 거절·작업 실패는 새 exit 5, 호출 입력 오류는 2, 앱 미실행·프로토콜 불일치(v2 요청에 대한 구 앱의 v1 `bad_request` 포함)·앱 실행 실패·`session_stale`은 3, 내부 오류는 1이다. transport op 이름은 MCP 도구 접미사와 같다. status는 작업의 failed·cancelled 상태를 실패 envelope으로 바꾸지 않는다. clone `--destination`은 최종 폴더(절대 경로, 없어야 함)이다. ARCHITECTURE §12 승격은 V3 | 지휘자 판단 — design이 숫자를 A0에 맡겼고, 새 분류가 있어야 internal_error·앱 미실행과 구분된다 |
| D11 | v2 fixture는 tasks A0의 공유 디렉터리 대신 `schema/fixtures/app-socket-v2/{request,response}/{valid,invalid}/`에 둔다 | 지휘자 판단 — 공유 디렉터리면 v1 전용 리더(`active_test.go`, `eval/lib/socket.test.ts`)가 깨지고, 스키마별 디렉터리 이름 규칙에도 맞는다 |
| D12 | Install·Update 안내 URL은 공급자 공식 설치 문서이고 Install과 Update가 같은 URL이다(design 'Install·Update 안내 URL') | 사용자 결정(2026-10-29) — tasks F4가 정한다고 했지만 기록이 없었다 |
| D13 | P가 제안한 초안 밖 문구를 확정하고 미지 버전 완료 표식 문구를 더했다. design 표와 초안이 다른 문구는 초안을 따른다 | 사용자 결정(2026-10-29) |
| D14 | `onboarding start`가 여는 번들의 신뢰는 'CLI의 실제 경로를 담은 .app(구조·Info.plist bundle id·그 안의 실행 파일)'이고 진본 확인이 아니다. 서명 검사는 하지 않는다. 온보딩에서는 빈 `DOAN_RUNTIME`도 명시로 보고 자동 실행하지 않는다(`active`는 그대로) | 지휘자 판단(G 리뷰) — 앱이 서명되지 않았고, 그 번들을 통제하는 사람은 이미 사용자가 실행하는 것을 통제한다 |
| D15 | 온보딩 세션 revision은 세션·프로젝트·작업이 바뀔 때만 오른다. 인증 변화는 agent-auth의 revision과 `agent-auth:changed`로 읽는다(U2는 둘 다 구독). `cancel`은 `sign_in`·`project_clone`만 취소하고 다른 kind는 대상을 그대로 돌려준다. 가이드 문구는 V3에서 고친다 | 지휘자 판단(M B0 리뷰 ⚪) — agent-auth는 로그인만 취소할 수 있고, 두 revision은 design에서 이미 분리돼 있다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| C | A0 | `schema/app-socket.v2.schema.json`(새), `schema/embed.go`, `schema/fixtures/app-socket/**`의 v2 파일, `schema/fixtures/cli-envelope`의 온보딩 fixture(필요하면), `app/src/formats/{types,validate}.ts`와 테스트, `cli/internal/formats/**` | 없음 | Claude Opus high — 두 언어가 같이 읽는 공개 계약이고 오류·종료 코드 매핑이 틀리면 M·G가 함께 틀린다 | `verify.mjs` | 통합 `b1c101e`..`4fce40b`, 2회차 |
| P | A1, A2 | 새 순수 모듈: `app/src/main/onboarding/` 아래 완료 표식·remote 파싱 모듈과 fixture, `app/src/renderer/` 아래 scene 모듈과 공용 공급자 view-model 모듈, 각 테스트 | 없음 | Claude Opus high — 상태 대응 표 전체와 경합 규칙을 판정하는 순수 함수라 판단이 많다 | `verify.mjs` | 통합 `9b04be1`..`7d808a2`, 2회차 |
| T | T1 | `app/src/renderer/tokens.css`, 값이 같은 출하 renderer CSS, `.doan/canvases/buzz-onboarding.html`, `docs/DESIGN.md` 토큰 절 | 없음 | Codex `gpt-6.1-sol` high — 기계적 치환이지만 렌더링 비교 단계가 많다 | `verify.mjs`, `doan check --repo .`, computed 비교 | 통합 `eaa534d`·`ea53233`, 1회차 |
| M | B0 → B1 | `app/src/main/**`(P의 새 모듈은 import만), `app/src/preload/**`, `app/src/main/agentAuth/` 연결부 | C, P | Claude Opus high — 소켓 인증·소유권·프로세스 그룹·경합 파일 생성이라 보안·동시성이 무겁다. B1은 같은 터미널의 다음 Task | `verify.mjs` | 진행 중 |
| G | B3 | `cli/**`(`cli/internal/formats/**` 제외), `cli/internal/cli/skill.md` | C | Claude Opus high — bundle 신뢰·자동 실행·비밀 비노출 판단 | `verify.mjs` | 통합 `036b4ae`..`41fb7f2`, 2회차 |
| U | U1(B2 일부) → U2(B2 나머지 + design-sync) | U1: `app/src/renderer/**`(P의 새 모듈은 import만), `app/src/renderer/ds/controls.css`. U2: 위에 더해 고아 채널 제거를 위한 `app/src/main/index.ts`·`app/src/main/onboarding/machine.ts`·`app/src/preload/**`·`app/src/setup/**`, `docs/DESIGN.md` 측정값, `.scratch/design-sync/` | U1: T, P. U2: M | Claude Opus high — 포커스·중첩 모달·경합 표시와 승인 디자인 대조 | `verify.mjs`, U2는 `/design-sync` | 진행 중 |
| E | D5 시나리오 | `eval/scenarios/**`의 새 시나리오와 fixture, eval 가짜 앱의 v2 응답(`eval/lib/socket.ts`와 테스트) | G | Claude Opus medium — 시나리오 판정 기준 설계 | `verify.mjs --eval`, `node eval/run.ts --self-test` | 통합(11 커밋, 끝 `300e3e3`), 2회차 |
| V | V1(design-sync 제외), V1b, V1c | 보고만 한다. `.scratch/` 근거 | 모든 구현 통합 | Claude Opus high — 실제 인증·clone·패키지 앱 probe와 사용자 상태 보호 | `/runtime-test` | 대기 |
| 지휘자 | V2, V3 | 통합 커밋, 정본 승격, feature 디렉터리 삭제 | 전부 | — | 통합 HEAD `verify.mjs --eval`, `/agent-eval` | 대기 |

독립 리뷰(`/code-review`, 보고만): C·M·G·E는 Codex `gpt-6-astra` medium, P·U·T는 Claude Opus high(T는 medium). 구현과 다른 계열을 섞는다(체인 파일 허가, 사용자 메모 2026-10-26).

## 순서와 겹침

1. 1차 병렬: C · P · T. 서로 파일이 겹치지 않는다.
2. 2차 병렬: M(C·P 통합 뒤) · G(C 통합 뒤) · U1(T·P 통합 뒤). M은 main/preload, G는 Go, U1은 renderer만 고친다.
3. 3차: U2(M 통합 뒤) · E(G 통합 뒤).
4. 4차: V. 그 뒤 지휘자 V2·V3, PR, 병합.

- 2차 이후 schema·fixture를 바꿔야 하면 M·G·U·E는 직접 고치지 않고 지휘자에게 묻는다. 지휘자는 C 소유 Task로 보낸다.
- U1이 Project 단계의 새 preload를 필요로 하면 그 부분은 남기고 handoff의 '미룬 항목'에 적는다(U2에서 한다).

## 진행 기록

- 2026-10-29: intake. F5·F6 완료(6ece8b6, e4f104b). 결정 D1–D9.
- 2026-10-29: Orca run `run_de7751ceafb2`. 1차 시작: C `ctx_e377b2cff060`(worktree bo-C), P `ctx_8678d52aca34`(bo-P), T `ctx_3f34e0858b03`(bo-T). launch.effective가 요청과 같다.
- 2026-10-29: T 완료(3e853c0, ea585c0). 독립 리뷰 Claude Opus medium `ctx_587c9b006c9b`: 🔴 0·🟡 0·⚪ 3(조치 불필요). 통합 `eaa534d`·`ea53233`. 렌더링 비교 14개 상태·요소 2,674개 불일치 0. 작업자 release, worktree bo-T는 Orca로 제거했고 근거는 `.scratch/evidence/T/`에 복사했다.
- 2026-10-29: C 완료(5d69875, f37b5a2, 8030b4d, `verify.mjs` PASS). 독립 리뷰 Codex `gpt-6-astra` medium `ctx_eebfb4a3eb21` 진행 중. C 작업자는 수정 라운드를 위해 retain했다. C handoff 지적에 따라 E 소유에 `eval/lib/socket.ts`를 더했다.
- 2026-10-29: C 리뷰 🔴 0·🟡 2(clone 정리 진행 표시 없음, 응답 op와 operation kind 불일치 허용). 수정 1회차 `ctx_7ee9a4bb5644`(24ee38a, b7b23d5): `cancelling: true`를 running sign_in·project_clone에만 허용하고 op와 kind를 묶었다. 지휘자가 diff를 확인하고 통합했다(`b1c101e`..`4fce40b`). C 작업자 release, worktree bo-C 제거, handoff는 `.scratch/orch/handoff-C.md`. G 시작 `ctx_895fd457ef6f`(bo-G).
- 2026-10-29: P 완료(d7f7f7b, 1277829, c7bcfea, `verify.mjs` PASS). 결정 D12·D13.
- 2026-10-29: G 완료(1f1e9fd..da67bb0, `verify.mjs` PASS). 독립 리뷰 Codex `gpt-6-astra` medium 진행 중. G 작업자 retain.
- 2026-10-29: G 리뷰 🔴 2(status 응답의 토큰 누출, MacOS 상위 링크로 번들 경계 우회)·🟡 1(빈 `DOAN_RUNTIME`). 수정 1회차 `ctx_4ab6946bf036`. 결정 D14.
- 2026-10-29: P 리뷰 🔴 0·🟡 3(끊긴 `.git` 링크를 불일치로 판정, 지원하지 않는 config를 완전한 정보로 취급, 다른 sessionId를 최신으로 수용)·⚪ 4. 수정 1회차를 보냈다. Copilot 비용 문구는 spec에 따라 비용이 드는 모든 check 옆에 보이게 한다(지휘자 판단).
- 2026-10-29: G 수정 1회차(d26677b, da5f28c) 뒤 Codex `gpt-6-astra` medium 재리뷰 `ctx_1491a1dff70c`: 차단 항목 없음. 앱이 보내는 임의 메시지의 비밀 정리는 M의 책임으로 남는다(V1에서 확인). 통합 `036b4ae`..`41fb7f2`. G 작업자 release, bo-G 제거, handoff는 `.scratch/orch/handoff-G.md`.
- 2026-10-29: P 수정 1회차(89f19fb). 지휘자가 diff를 확인하고 통합했다(`9b04be1`..`7d808a2`). 통합 HEAD `7d808a2`(T+C+G+P) `verify.mjs` PASS. P 작업자 release, bo-P 제거. `src/main/watch.test.ts`가 간헐적으로 실패한다(리뷰어와 P 작업자가 각각 한 번 봤고 재실행에서 통과). 이번 범위 밖이며 마지막 보고에 적는다.
- 2026-10-29: 2차 시작: M `ctx_5c516c33e38c`(bo-M, B0), U1 `ctx_53734ce9f3a3`(bo-U1).
- 2026-10-29: D12 정정 — Codex URL은 `developers.openai.com/codex/cli`가 308로 이동하는 `learn.chatgpt.com/docs/codex/cli`이고 출하된 `INSTALL_URLS`와 같다. U1 질문에 따라 cursor·copilot 대상은 M이 B1에서 `ExternalTarget`·`INSTALL_URLS`에 더하고, U1의 cursor·copilot 호출은 U2로 미룬다. M의 B0 질문: B0만으로는 `project_inspect`를 임시로 거절하고 B1에서 없앤다(M은 B1 뒤에만 통합).
- 2026-10-29: GUI 슬롯을 U1에 줬다(짧은 격리 probe).
- 2026-10-29: E 완료(5d76493..bc87582). 리뷰 Codex `gpt-6-astra` medium: 🔴 0·🟡 4(CLI가 거절한 시도를 검사하지 않음, 변경 안내 순서를 강제하지 않음, 가짜 앱의 로그인 중 공급자 상태 모순, 요청 로그를 보존하지 않음). 수정 1회차를 보냈다.
- 2026-10-29: M B0 완료(d557d7f..686fe09, `verify.mjs` PASS). B0 리뷰 Codex `gpt-6-astra` medium `ctx_526b510a3e2f` 진행 중. 같은 터미널에 B1 Task를 보냈다. B0 리뷰 수정은 B1 뒤 별도 Task로 보낸다.
- 2026-10-29: M B0 리뷰 🔴 0·🟡 3(requestId 중복 실행 가능성, status의 revision과 작업 상태 불일치, check 실패를 성공으로 판정)·⚪ 2. B1 뒤 수정 Task로 보낸다.
- 2026-10-29: E 수정 1회차(affe6f9..c8fa066). 지휘자 확인 뒤 통합했다(끝 `300e3e3`). 변경 안내 순서는 판정자만 본다(결정적 검사 없음). E 작업자 release, bo-E 제거, handoff `.scratch/orch/handoff-E.md`.
- 2026-10-29: U1 완료(60e4943, 5429599, e6ab797, `verify.mjs` PASS, 격리 GUI probe 통과, 실제 상태 보존). GUI 슬롯 반환. 독립 리뷰 Claude Opus high 시작. U 작업자 retain(U2용). `src/main/onboarding/machine.test.ts`도 한 번 간헐 실패했다(watch.test.ts와 함께 마지막 보고에 적는다).
