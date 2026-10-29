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
| D16 | 이 창이 시작한 로그인이 창에 포커스가 있을 때 ready가 되면 포커스를 옮기지 않고 role=status로 한 번 알린다(포커스가 없으면 기존대로 복귀 때 알리고 Continue로 옮긴다). Antigravity 주소가 16,384자를 넘으면 Submit을 막고 "This address is too long to submit."를 보인다 | 지휘자 판단(U1 리뷰) — 처음 ready를 알린다는 상태 대응 표 규칙을 지키되 포커스 이동은 복귀 때만 한다 |
| D17 | clone은 사용자 SSH 설정(`core.sshCommand`, `~/.ssh/config`)을 덮어쓰지 않는다. `GIT_SSH_COMMAND` BatchMode 대신 제어 터미널 없는 프로세스 그룹, `GIT_TERMINAL_PROMPT=0`, `SSH_ASKPASS_REQUIRE=never`로 비대화식을 보장하고 호스트 키 검사는 유지한다(design의 'SSH BatchMode'를 바꾼다, V3 승격) | 사용자 결정(2026-10-29) — BatchMode 환경 변수가 회사용 키 같은 사용자 설정을 덮어써 접근이 실패했다 |
| D18 | clone 기본 위치는 가장 최근 등록 프로젝트의 부모 폴더/<repo>, 등록 프로젝트가 없으면 ~/<repo>이고 Change로 부모 폴더를 바꾼다. 등록 프로젝트가 있으면 'Open a local folder' 위에 'Your projects' 캡션과 'Multiple local checkouts' 형식의 radio 행을 보이고, 고르면 검사 뒤 선택한다. 둘 다 초안 밖이라 DESIGN.md에 차이로 기록한다 | 사용자 결정(2026-10-29) |
| D19 | clone의 게시 경계는 목적지로의 rename이다. 그 뒤의 취소는 실행 중 작업을 그대로 돌려주고 등록·초기화는 계속한다 | 지휘자 판단(M 재리뷰 🟡2) — 그 뒤에 취소하려면 이미 최종 위치에 놓인 폴더를 지워야 한다 |
| D20 | URL 화면에서 고른 기존 폴더('Choose existing folder', 'Use existing folder')도 그 URL의 remote와 일치하는지 확인한다. path 검사에 선택적 url을 더한다(socket v2 schema·CLI `--url`·main). 새 배치 R이 맡는다 | 사용자 결정(2026-10-29) — spec이 요구하고, 다른 리포 폴더를 잘못 연결하는 것을 막는다 |
| D21 | URL 화면에서 닿는 폴더 행동(오류 notice의 복구 버튼 포함)은 모두 url을 함께 보낸다. 설치·업데이트 페이지에서 돌아오면 Copilot도 readiness 원인이 `cli_missing`이나 `version_*`일 때만 `checkAgentAuth`를 부른다(이때 check는 도구 사실만 다시 읽거나 연결이 없어 요청을 쓰지 않는다, `agentAuth/ipc.ts` `check`). U2는 R 통합 뒤에 그 위로 다시 맞춰 통합한다 | 지휘자 판단(U2 리뷰) — D20을 두 번 클릭으로 우회할 수 없게 하고, 설치 뒤 Copilot이 재시작 전까지 Install에 머무는 것을 막는다 |
| D22 | Codex 교체 로그인은 새 staging 프로필에서 실행한다. 성공하면 연결의 프로필을 바꾸고 옛 프로필을 로그아웃·삭제하며, 취소·실패하면 staging만 지우고 기존 연결을 유지한다(ARCHITECTURE §7 프로필 경로 승격은 V3) | 사용자 결정(2026-10-29) — Codex 0.164.0 `codex login`이 시작하자마자 기존 로그인을 원격 폐기·삭제한다(A의 소스 확인, `codex-rs/cli/src/login.rs`) |
| D23 | 'Multiple local checkouts'와 'Your projects' 행은 'Already on your Mac'처럼 선택 가능한 `doan-panel` 카드로 둔다. checkout 목록은 프로젝트 썸네일 대신 `GitBranch` 아이콘과 브랜치 이름(없으면 폴더 이름)·경로를 보인다(ShellSidebar worktree 행과 같은 형식). 'Your projects'는 썸네일을 유지한다. 초안과의 차이로 DESIGN.md에 기록한다 | 사용자 결정(2026-10-29) — 같은 로컬 폴더가 개수에 따라 다른 모양으로 보였고, worktree는 프로젝트가 아니라 같은 리포의 checkout이다 |
| D24 | 자동 포커스 복구는 파일을 쓰거나 동의하는 버튼('Set up and continue', clone 시작, 'Stop and …' 확인)에 떨어지지 않고 제목이나 notice로 간다. 초기화 동의는 버튼이 보인 inspectionId·경로에 묶인 토큰으로만 보낸다 | 지휘자 판단(V 재현 안 된 동의 없는 초기화 1건) — 무심코 누른 키가 동의가 되지 않게 한다 |
| D25 | GitHub URL이 로컬 checkout·worktree 여러 개와 맞으면 목록을 보이지 않고 하나를 자동으로 고른다: 설정이 필요 없는 것 → 본 checkout → 최근 등록 순. 'Already on your Mac' 카드 하나로 보이고 Choose another folder는 남는다. worktree 전환은 AppShell 프로젝트 카드의 'Worktrees' 메뉴에서 한다. CLI/MCP는 그대로 모든 후보를 돌려준다 | 사용자 결정(2026-10-29) — 후보는 모두 이미 등록된 프로젝트라 선택은 홈을 여는 checkout만 정하고, LNB에서 바꿀 수 있다 |
| D26 | clone 목적지가 doan 프로젝트 안이면 "This location is inside the doan project <name>. Choose a location outside it."와 Change location을 보인다. 폴더 검사 중에는 "Checking this folder"를 보인다. 'Edit repository URL' 뒤 포커스는 URL 입력칸이다 | 지휘자 판단(V 최종 확인 메모) — 원인을 말하지 않는 문구와 아직 쓰지 않는데 설정 중이라는 문구를 바로잡는다 |
| D27 | `.doan/canvases/buzz-onboarding.html`을 출하된 구현 기준으로 다시 그린다. 상태마다 1238×780 전체 창 프레임 하나를 두고 tile 격자는 없앤다 | 사용자 요청(2026-10-29) — 확정 디자인을 상태별로 1:1로 보고 대조한다 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| C | A0 | `schema/app-socket.v2.schema.json`(새), `schema/embed.go`, `schema/fixtures/app-socket/**`의 v2 파일, `schema/fixtures/cli-envelope`의 온보딩 fixture(필요하면), `app/src/formats/{types,validate}.ts`와 테스트, `cli/internal/formats/**` | 없음 | Claude Opus high — 두 언어가 같이 읽는 공개 계약이고 오류·종료 코드 매핑이 틀리면 M·G가 함께 틀린다 | `verify.mjs` | 통합 `b1c101e`..`4fce40b`, 2회차 |
| P | A1, A2 | 새 순수 모듈: `app/src/main/onboarding/` 아래 완료 표식·remote 파싱 모듈과 fixture, `app/src/renderer/` 아래 scene 모듈과 공용 공급자 view-model 모듈, 각 테스트 | 없음 | Claude Opus high — 상태 대응 표 전체와 경합 규칙을 판정하는 순수 함수라 판단이 많다 | `verify.mjs` | 통합 `9b04be1`..`7d808a2`, 2회차 |
| T | T1 | `app/src/renderer/tokens.css`, 값이 같은 출하 renderer CSS, `.doan/canvases/buzz-onboarding.html`, `docs/DESIGN.md` 토큰 절 | 없음 | Codex `gpt-6.1-sol` high — 기계적 치환이지만 렌더링 비교 단계가 많다 | `verify.mjs`, `doan check --repo .`, computed 비교 | 통합 `eaa534d`·`ea53233`, 1회차 |
| M | B0 → B1 | `app/src/main/**`(P의 새 모듈은 import만), `app/src/preload/**`, `app/src/main/agentAuth/` 연결부 | C, P | Claude Opus high — 소켓 인증·소유권·프로세스 그룹·경합 파일 생성이라 보안·동시성이 무겁다. B1은 같은 터미널의 다음 Task | `verify.mjs` | 통합(21 커밋), 수정 3회 |
| G | B3 | `cli/**`(`cli/internal/formats/**` 제외), `cli/internal/cli/skill.md` | C | Claude Opus high — bundle 신뢰·자동 실행·비밀 비노출 판단 | `verify.mjs` | 통합 `036b4ae`..`41fb7f2`, 2회차 |
| U | U1(B2 일부) → U2(B2 나머지 + design-sync) | U1: `app/src/renderer/**`(P의 새 모듈은 import만), `app/src/renderer/ds/controls.css`. U2: 위에 더해 고아 채널 제거를 위한 `app/src/main/index.ts`·`app/src/main/onboarding/machine.ts`·`app/src/preload/**`·`app/src/setup/**`, `docs/DESIGN.md` 측정값, `.scratch/design-sync/` | U1: T, P. U2: M | Claude Opus high — 포커스·중첩 모달·경합 표시와 승인 디자인 대조 | `verify.mjs`, U2는 `/design-sync` | 통합(U1 5 + U2 18 커밋, 끝 `dfc868a`), U1 2회차·U2 2회차 |
| E | D5 시나리오 | `eval/scenarios/**`의 새 시나리오와 fixture, eval 가짜 앱의 v2 응답(`eval/lib/socket.ts`와 테스트) | G | Claude Opus medium — 시나리오 판정 기준 설계 | `verify.mjs --eval`, `node eval/run.ts --self-test` | 통합(11 커밋, 끝 `300e3e3`), 2회차 |
| R | D20 remote 확인 | `schema/**`(v2 path+url), `app/src/formats/**`, `cli/internal/formats/**`, `cli/internal/cli/onboarding*.go`·MCP·`skill.md`, `app/src/main/onboarding/{service,projects}.ts` | C·M·G 통합 | Claude Opus high — 공개 계약 변경과 remote 판정 | `verify.mjs` | 통합(4 커밋), 1회차 |
| A | V 결함 2(교체 로그인 취소가 연결을 잃음) | `app/src/main/agentAuth/**`(필요하면 `onboarding/service.ts`), `docs/POSTMORTEM.md` | G2 | agent-eval 결과 수정(온보딩 sandbox 안내, 변경 안내 순서, 가짜 앱 파일 생성) | `cli/internal/cli/**`(`skill.md` 포함), `eval/lib/socket.ts`와 테스트 | eval 라운드 | Claude Opus medium — 가이드 문구와 runner 보정 | `verify.mjs --eval` | 진행 중 |
| V | Claude Opus high — 사용자 자격 증명 손실 버그의 원인 조사 | `verify.mjs` | 통합(13 커밋, 끝 `e253b42`), 3회차 |
| V | V1(design-sync 제외), V1b, V1c | 보고만 한다. `.scratch/` 근거 | 모든 구현 통합 | Claude Opus high — 실제 인증·clone·패키지 앱 probe와 사용자 상태 보호 | `/runtime-test` | 완료(재확인 포함) |
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
- 2026-10-29: 통합 HEAD(T+C+G+P+E) `verify.mjs --eval` PASS(9단계).
- 2026-10-29: U1 리뷰 Claude Opus high: 🔴 0·🟡 3(CLI가 시작한 로그인 링크를 renderer도 엶, 비활성·제거 뒤 포커스가 body로 감, 붙여넣기 모달 수명과 잘림)·⚪ 7. 수정 1회차를 보냈다. Codex loopback 링크 자동 열기 문제는 M 수정 brief에 더했다. 결정 D16.
- 2026-10-29: U1 수정 1회차(2c7473e, f6dfdd9, `verify.mjs` PASS). 지휘자 확인 뒤 U1을 통합했다(5 커밋). 포커스 이동은 단위 테스트로만 확인했고 실제 앱 확인은 U2 design-sync에서 한다. ⚪4(reload 뒤 소유 attempt id 소실)·⚪5(설치 줄에 공급자 이름 없음)는 U2로 넘긴다. U 작업자는 M 통합을 기다린다.
- 2026-10-29: M B1 완료(bb2f0f0..4d0736c, `verify.mjs` PASS, 실제 Go CLI→socket→shell probe). 결정 D17. M에 B0 리뷰 수정 + Codex loopback + D17을 한 Task로 보내고, B1 독립 리뷰(Codex)를 병렬로 띄운다.
- 2026-10-29: M B1 리뷰 Codex `gpt-6-astra` medium: 🔴 0·🟡 5(취소 뒤 clone 게시, symlink 목적지 오판, 오래된 검사로 clone 실행, quit 접수 뒤 완료 저장 가능, 정리 실패 경로 소실). 수정 brief는 B0 수정 Task 뒤에 보낸다. 정리 실패 경로는 schema를 바꾸지 않고 오류 메시지에 담는다(지휘자 판단).
- 2026-10-29: M B0 수정(0deb748, fb1e8a5, f82a7e1, `verify.mjs` PASS): requestId 세션 전체 유지, status 순서, check 결과, Codex loopback 건너뜀, D17 반영. B1 리뷰 수정 Task를 보냈다. ARCHITECTURE §7에 AuthManager.check 결과 추가를 V3에서 적는다.
- 2026-10-29: M B1 수정(f6606e2, 97b47fe, e30081f, `verify.mjs` PASS). M을 통합했다(19 커밋, 끝 `3609a0a`). 수정 범위 재리뷰 Codex `gpt-6-astra` medium을 병렬로 띄웠다. M 작업자는 재리뷰 수정을 위해 유지한다. U2 시작(같은 U 터미널, bo-U1을 통합 HEAD로 맞춤).
- 2026-10-29: 통합 HEAD `3609a0a`(M 포함) `verify.mjs --eval` PASS. U2 질문에 결정 D18.
- 2026-10-29: M 수정 재리뷰: 🔴 0·🟡 3(목적지 claim 제거 실패를 cancelled로 숨김, 등록 전 취소 경계, leftover 조회 오류를 삭제로 간주). 🟡2는 D19로 수용했고 1·3은 수정 3회차로 보냈다.
- 2026-10-29: M 수정 3회차(c88eaf8, eaea354, `verify.mjs` PASS)를 지휘자 확인 뒤 통합했다. M 작업자 release. bo-M worktree는 V 결과로 M 수정이 필요할 수 있어 마지막까지 남긴다.
- 2026-10-29: U2 질문으로 결정 D20, 배치 R 시작(bo-M을 통합 HEAD로 맞춤). U2는 url을 보내는 쪽을 맡는다.
- 2026-10-29: R이 `app/src/main/index.ts` 한 줄(inspectPath에 repo 전달)을 고치도록 허락했다. U2가 그 위로 다시 맞춘다.
- 2026-10-29: U2 완료(6a9c397..88a0c59, `verify.mjs` PASS, GUI 슬롯 반환). design-sync 10개 프레임·47 tile, 차이 302→25(DESIGN.md 기록). 독립 리뷰 Claude Opus high 시작. U 작업자 retain(R 위로 다시 맞추기와 리뷰 수정).
- 2026-10-29: R 완료(c56176a..74425e6, `verify.mjs` PASS). 독립 리뷰 Codex `gpt-6-astra` medium 시작. E의 가짜 앱은 path+url을 repository_unreachable로 처리한다(평가 시나리오에서 쓰지 않으면 영향 없음, V3에 기록).
- 2026-10-29: U2 리뷰 Claude Opus high: 🔴 0·🟡 3(URL 화면 복구 버튼이 url 없이 폴더 선택, main의 no_ready_agent 거절이 ready 뒤에도 남음, R 전 path+url 거절)·⚪ 8. design-sync 차이 25개는 근거가 있고 마크업 측정은 표시돼 있다. 결정 D21.
- 2026-10-29: R 리뷰 Codex `gpt-6-astra` medium: 🔴 0·🟡 0. R을 통합했다. R 작업자·리뷰어 release. U2 수정 Task를 보냈다(R 위로 rebase, cast 제거, 🟡 3, D21).
- 2026-10-29: U2 수정(R 위로 rebase, 6828709..b152f53)을 통합했다(끝 `dfc868a`). 통합 HEAD `verify.mjs --eval` PASS. design-sync 측정은 rebase 전(960020b)이고 그 뒤 변경은 동작 수정이다. V 시작(bo-V, GUI 슬롯 보유).
- 2026-10-29: V 완료(`ctx_08d593134cb3`): V1(design-sync 제외)·V1b(a)(b)·V1c를 패키지 앱에서 실행, 대부분 통과. 결함 2건: (1) clone 취소 화면에서 URL을 바꿀 수 없어 갇힘 → U에 수정 Task, (2) CLI로 시작한 교체 로그인을 취소하면 모든 공급자가 unverified가 되고 Codex 자격 증명이 지워짐 → 새 배치 A. 홈 포커스·홈 체크리스트 관찰은 buzz-home 인계(V3). 미검증: dev 빌드, 실제 Cmd+W·포커스·폴더 시트 Escape, stop 대화상자, Claude 10초 훅 실패, 긴 프로젝트 경로·최소 창 크기(Agent 외). Keychain은 기준선으로 돌아왔고 36e67382 갱신만 허용 부작용이다. V 작업자는 재확인을 위해 retain.
- 2026-10-29: U가 V 결함 1을 고쳤다(e545f93, e015cc5): 취소·실패한 clone 화면에 'Edit repository URL'을 추가하고 Back은 URL 입력으로 돌아간다. 통합했다. V가 다시 확인한다.
- 2026-10-29: A 완료(7 커밋, `verify.mjs` PASS, POSTMORTEM 포함). 원인: Codex 0.164.0 `codex login`이 로그인 서버 시작 전에 `logout_with_revoke`를 부른다. 독립 리뷰 Codex `gpt-6-astra` medium 시작.
- 2026-10-29: A 리뷰 Codex `gpt-6-astra` medium: 🔴 1(vault commit 뒤 정리 실패 시 옛 연결이 새 자격 증명 위에 verified로 남음)·🟡 2(staging 로그아웃 실패를 무시하고 삭제, 중단된 staging·retired 프로필 복구 없음). 수정 1회차를 보냈다.
- 2026-10-29: A 재리뷰: 🔴 0·🟡 2(연결이 없는데 기본 프로필 정리를 영구히 건너뜀, 기록 저장 실패 뒤 미기록 프로필 생성). 수정 2회차를 보냈다.
- 2026-10-29: A 수정 2회차(a1c95c6, 6f4ddea, f317086)를 지휘자 확인 뒤 통합했다(끝 `e253b42`). 통합 HEAD `verify.mjs --eval` PASS. A 작업자 release. V에 재확인 Task를 보냈다(결함 1·2, D22, staged Codex 중 종료 뒤 sweep).
- 2026-10-29: V 재확인(`e253b42` 패키지 앱): 결함 1과 D22 전 항목 통과. CLI 교체 취소·Claude/Codex 교체 실패에서 다섯 연결·자격 증명·vault 유지, Codex 교체 성공 시 새 프로필로 전환하고 옛 프로필·Keychain 항목 정리, 대화 turn.done까지 확인, staged 교체 중 SIGKILL 뒤 재시작 sweep이 live 프로필을 건드리지 않고 정리. 잔여 결함 1건(URL 접근 오류 화면의 Retry가 고친 URL을 무시) → U에 수정. 관찰: 앱 SIGKILL 뒤 고아 codex login 프로세스가 남음(무해), 기본 Claude Code-credentials mdat 변경 원인 미상(다른 Claude 세션 실행 중, 항목 유지). Keychain은 doan 항목 모두 제거. V 작업자 release.
- 2026-10-29: 사용자 요청으로 리포 링크 실제 앱 probe(D20 remote 일치·불일치, 여러 checkout, 'Use existing folder', 잘못된 URL, Retry 수정)를 U 잔여 수정 통합 뒤 V에 보낸다. `/agent-eval` 라운드 `buzz-onboarding-261029` 진행 중(통합 HEAD `0564054` 패키지).
- 2026-10-29: U 잔여 수정(8b92a0b, 959e1b0: Retry가 고친 URL을 검사) 통합. 리포 링크 probe V 시작.
- 2026-10-29: 리포 링크 probe(`4fce45d` 패키지 앱) 5개 항목 통과: D20/D21 일치·불일치·읽기 실패(UI·CLI), 오류 notice 복구도 url 전송, 세 checkout 선택, 'Use existing folder' remote 확인, 잘못된 URL inline 거절, Retry가 고친 URL 사용. 재현 안 된 1건: clone 화면에서 일치하는 미초기화 폴더를 고르자 'Set up and continue' 클릭 없이 초기화·등록됐다(3회 반복은 정상). D23 뒤 U에 조사를 보낸다. Keychain 기준선 일치. GUI 슬롯을 U에 넘겼다.
- 2026-10-29: D23 통합(18cc21d..3ecf656, 마크업 측정은 초안 chosen 카드와 일치, 실제 흐름 확인은 V). U에 동의 없는 초기화 조사 Task를 보냈다.
- 2026-10-29: U 조사(837f4c0..fd91ffa): 동의 없이 initialize를 보내는 경로는 찾지 못했고, 동의를 inspectionId·경로에 묶인 토큰으로 바꿨다. 통합. 남은 의심(포커스 복구가 'Set up and continue'에 감)은 D24로 U에 보냈다.
- 2026-10-29: `/agent-eval` 라운드 `buzz-onboarding-261029`(`0564054`, Claude Code 2.1.312·Codex 0.164.0): 기존 시나리오는 이전과 같다(R1b·R2 Codex는 알려진 실패, H3·R6 Codex는 판정자만 partial). O1 두 에이전트 fail, O2 Codex fail. 원인: Codex sandbox가 socket을 막는데 온보딩 안내에 sandbox·MCP 안내가 없음, Claude가 변경 계획을 select 뒤에 보고, 가짜 앱이 초기화 파일을 만들지 않음(runner 결함). 실제 상태 점검의 Keychain 차이는 실제 Codex가 사용자 설정의 `malmoi` MCP 자격 증명을 갱신한 것(02:10:51Z, doan 무관). 배치 G2 시작 `ctx_f6d415a0a0b0`. 수정 뒤 O1·O2를 다시 잰다.
- 2026-10-29: D24 통합(00fba93, c97b81e → `fdd9d8d`). V 최종 확인(D23 카드, 동의 시나리오 재시도, D24 포커스) 시작.
- 2026-10-29: G2 통합(eb341c7..3aa40fb → `7b58596`). O1·O2 재측정 라운드 `buzz-onboarding-261029-o` 시작. 결정 D25를 U에 보냈고 V에 부탁한 checkout 스크린샷은 취소했다.
- 2026-10-29: O1·O2 재측정(`buzz-onboarding-261029-o`, `7b58596`): O2-Claude pass, O1-Claude fail(이미 허락했는데 다시 물음 — G2 지시가 과했음), Codex O1·O2 fail(가이드대로 sandbox 안내 후 멈춤, MCP 없는 시나리오라 통과 불가). 실제 상태 변화 없음. G3: 가이드 동의 규칙 보정, Codex O1·O2를 R2처럼 알려진 조건으로 표시(MCP 변형 시나리오는 후속).
- 2026-10-29: D25 통합(d705a03..55ac9e0): URL 후보가 여럿이면 자동 선택(설정 불필요 → 본 checkout → 최근 등록), 본 checkout은 창의 folder-list git 정보로 판별(git 실행·schema 변경 없음). URL checkout 목록과 D23 브랜치 행 제거, 'Your projects'는 카드 유지.
- 2026-10-29: V 최종 확인(`fdd9d8d`): D23 'Your projects' 카드 통과, 동의 시나리오 7회(키 섞은 4회 포함) 모두 setup 화면에서 멈춤, D24 포커스 통과. 미검증: stop 확인 대화상자(ready Claude 행에서 진입 경로 없음). Keychain 기준선 일치. D26으로 U에 작은 수정을 보냈다. V release.
- 2026-10-29: O1·O2 Claude 재측정(`buzz-onboarding-261029-o2`, `020a76c`) 둘 다 pass, 실제 상태 변화 없음. V3 정본 승격을 배치 D(Opus high, bo-D)에 맡겼다(DESIGN.md·feature 디렉터리 삭제 제외).
- 2026-10-29: D26 통합(bf2e665..7254806, 등록된 프로젝트 안이면 이름을 넣은 문구, 미등록이면 기존 문구 유지). V D25·D26 확인 시작.
- 2026-10-29: 사용자 요청으로 초안 재작성 배치 DR(Opus high, bo-DR) 시작. 결정 D27.
