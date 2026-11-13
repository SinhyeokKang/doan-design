# multi-handoff — orch

- 원천: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 초안 `.doan/canvases/multi-handoff.html`(사용자 확인 완료).
- 체인: [chain-261113-3](../chain-261113-3/chain.md) 링크 1b. 링크 1a `prototype-responsive`와 병렬로 돈다(겹치는 코드·테스트·초안 없음, lead 확인).
- 시작 해시: `808252b4`(origin/develop). 통합 브랜치: `feat/multi-handoff`(lead가 만들었다).
- conductor: Claude Code(Opus). Codex 워커 허용(체인 '상시 권한').

## 결정 기록

- design D1–D5는 사용자 확인을 마쳤다. 새로 물을 제품·범위 결정은 intake 시점에 없다.
- conductor 판단 — `/design-sync`: tasks에는 없지만 design '드래프트 요청'이 "`/design-sync`가 네 프레임을 비교한다"고 적으므로 렌더러 배치 C에 넣는다. 근거: AGENTS.md 'Workflow' `/design-sync`.
- conductor 판단 — 문구: `HANDOFF_GUIDANCE`는 spec 완료 조건 6의 뜻대로 워커가 clarify preset으로 다듬는다. 줄·토스트 문구는 spec·D3·D4에 정해져 있어 그대로 쓴다.
- conductor 판단 — 배치 분할: 렌더러는 `main/conversation/types.ts`와 `handoff.ts`의 타입을 import하므로, 형식과 순수 함수(A1)를 먼저 통합한 뒤 렌더러(C)를 시작한다. 프롬프트·CLI·eval(B)은 main·렌더러와 파일이 겹치지 않아 처음부터 병렬로 돌린다.

## Codex 사용

- 시작 때 주간 한도(`window_minutes: 10080`) 26% 사용(Orca CODEX_HOME 최신 rollout, 2026-11-13 23:13).
- 쓴 범위: 배치 B 구현(gpt-6-astra medium), A·C 리뷰(gpt-6-astra medium). 바뀌면 여기에 적는다.

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A1 | 1, 2 | `app/src/main/conversation/{types,store,handoff}.ts`와 테스트, `app/src/preload/index.ts`(알림 타입만) | 없음 | Claude Opus high — 이벤트 형식과 판정 함수가 이후 모든 배치의 계약이다 | tasks 1·2 검증 명령, typecheck | 대기 |
| A2 | 3, 5 | `app/src/main/conversation/{state,summary,service}.ts`와 테스트, `project.ts`, `app/src/main/runtime.ts`, `app/src/main/index.ts` | A1(같은 워커의 후속 Task) | Claude Opus high — 순차 시작, 취소, 타이머 수명이 얽힌 동시성 작업이고 POSTMORTEM 2026-10-27 회귀 위험이 있다 | tasks 3·5 검증 명령, typecheck | 대기 |
| B | 4, 7, 8 | `app/src/main/conversation/prompt.ts`와 테스트, `cli/internal/cli/handoff_rules*.go`, `eval/**` | 없음 | Codex gpt-6-astra medium — 문구와 시나리오 판단이 필요하지만 다른 배치와 독립이다 | tasks 4·7·8 검증 명령 | 대기 |
| C | 6, `/design-sync` | `app/src/renderer/**`(threadItems, handoffView, ConversationThread, App 등), `app/src/renderer/tokens.css`, `docs/DESIGN.md` 측정값 | A1 통합 | Claude Opus high — App.tsx 알림 흐름과 실제 앱 측정이 필요하다 | task 6 검증 명령, `/design-sync` 네 프레임 | 대기 |
| R-A | A1+A2 리뷰 | 보고만 | A2 | Codex gpt-6-astra medium — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| R-B | B 리뷰 | 보고만 | B | Claude Opus high — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| R-C | C 리뷰 | 보고만 | C | Codex gpt-6-astra medium — 다른 계열의 독립 리뷰 | `/code-review` 보고 | 대기 |
| 통합 | 9 | 없음(conductor) | A·B·C 통합 | — | `verify.mjs --eval`, `/runtime-test`(Claude Code, Codex Ask first) | 대기 |
| E | 10 | `docs/USABILITY-EVAL.md` | 통합 | 통합 시점에 정한다 | `/agent-eval` R10·R11 | 대기 |
| 문서 | 11 | PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, 이 디렉터리 삭제 | E | 통합 시점에 정한다 | tasks 11 검증 명령 | 대기 |

## 파일 겹침과 순서

- A1 → A2는 같은 워커가 이어서 한다(같은 worktree).
- B는 A와 병렬이다. `prompt.ts`는 B만 고치고, Send now 조건(`service.ts`)은 A2가 고친다.
- C는 A1을 통합한 뒤 시작하고 A2와 병렬이다. C는 `app/src/main/**`를 고치지 않는다. 다중 알림 전달(`index.ts`)은 A2 몫이고, C는 A1이 정한 알림 타입에 맞춰 렌더러를 만든다.
- GUI(`/design-sync`, `/runtime-test`)는 lead를 거쳐 링크 1a와 시간을 맞춘다.

## 진행 기록
- Run `run_521b91a76b33`. A1: dispatch `ctx_57c60097df90`, worktree `mh-main`(Claude Opus high). B: dispatch `ctx_cc2233bfd8b5`, worktree `mh-eval`(Codex gpt-6-astra medium). 둘 다 `c627a774`에서 시작했다.
- B 완료(`6fb9645b`, `94871718`). 워커 보고: 앱 프롬프트 테스트, eval 309개, Go test·vet, typecheck, R10·R11 self-test 통과. 처음 eval 실행에서 R8d pass fixture 실패가 있었으나 다른 suite와 겹쳐 돌린 탓이었고 단독 실행에서는 재현되지 않았다. task 10 회차에 R8d·R9b·R10 프롬프트를 같은 id 안에서 바꿨다고 적어야 한다.
- R-B 시작: dispatch `ctx_26f7cd73ccb1`, worktree `mh-eval`(Claude Opus high).
- A1 완료(`5d9cbb1c`, `95fd518c`) → `feat/multi-handoff`에 `3df9e116`, `a7690623`로 통합했다(C의 시작점이 필요해 리뷰 전에 넣었다. 리뷰는 A2와 함께 R-A에서 한다). 워커 보고: storeIndex·storeRecovery 127개, handoff 29개, typecheck·lint 통과. 계획과 다른 점: preload 알림 타입은 App.tsx와 같이 바꿔야 해서 C로 넘겼고, `service.ts`에 A2가 지울 임시 가드(`if (turn?.request) return "already_requested"`)가 있다. 다중 알림 타입은 `HandoffMultiNotice { root, source, targets[] }`, 구분은 `"targets" in notice`.
- A2 시작: 같은 워커의 후속 Task, dispatch `ctx_ea9e665df54d`(worktree `mh-main`). C 시작: dispatch `ctx_d88267568353`, worktree `mh-renderer`(Claude Opus high, `12d358e0`에서). C는 preload의 `onConversationHandoff` 리스너 타입도 맡는다.
- R-B 완료: 🔴 0, 🟡 2, ⚪ 4(`mh-eval/.scratch/review-RB.md`). conductor 판단: 🟡1(R11 헬퍼가 요청 하나 누락을 실패 셋으로 보고)은 고친다. 🟡2(핸드오프 두 번을 `&&`·`;`로 잇는 호출)는 Codex prefix rule이 그 형태에 맞는지 근거가 없으므로, 안내에 "각각 따로 실행"을 넣고 rubric에 채점 줄을 더한다. ⚪3(안내의 범위 중복)은 같이 정리하고, ⚪1(CLI next step 문구)은 design 문구대로 둔다. 수정 Task: dispatch `ctx_d92857aae6bc`.
- B 수정 1회차 완료(`0f274e59`, `42bd7125`): eval 310개, 프롬프트 23개, typecheck, R10·R11 self-test 통과. R11 fail fixture는 `handoff_each_canvas_once` 하나만 실패한다. B 전체를 `de87a6e1`, `19a75741`, `6d3e07c8`, `0a5d5499`로 통합했다. 워커가 POSTMORTEM 후보(단일 원인 음성 사례는 실패 id 집합을 정확히 고정한다)를 넘겼다. 문서 단계에서 적을지 정한다.
- A2 완료(`384d273f`, `1cf76247`): state·summary 61개, service.handoff·turnEnd·runtime.handoff 102개, typecheck·lint 통과. 계획과 다른 점: `missedWaits`를 턴 id로 키잉(다음 턴이 먼저 끝날 수 있다), 시작된 대화가 이미 끝났으면 큐를 소스로 보냄(회귀 테스트 추가), 누락 판정은 마감에서만, `index.ts`는 바꿀 필요가 없었다. R-A 시작: dispatch `ctx_e25af1c4bbcf`(Codex gpt-6-astra medium, worktree `mh-main`).
- C가 task 6을 `83839b80`으로 커밋했고, lead의 GUI go를 받아 `/design-sync`를 돌리고 있다.
- R-A 완료: 🔴 0, 🟡 3, ⚪ 2(`mh-main/.scratch/review-RA.md`). conductor 판단: RA-1(시작된 대화의 첫 턴이 이미 끝났으면 큐를 소스로 보내는 A2의 예외)은 D2와 다르므로 되돌린다. 큐를 새 대화로 옮기고 그 대화의 일반 턴 종료 큐 처리를 적용한다. RA-2(prepare 뒤 runner 열기 전 재검사)와 RA-3(누락·quit 경계 테스트)은 고친다. RA-4(새 캔버스를 판정 전에 이름 바꾸면 누락 줄이 없음)는 spec 완료 조건 7 밖이라 바꾸지 않고 한계로 적는다. 수정 Task: dispatch `ctx_4bc646d42a9d`.
- C 완료(`83839b80`, `2a590b9d`): task 6 테스트 173개, 앱 전체 11323개, typecheck·lint·build 통과. `/design-sync` 네 프레임 PASS(78쌍, 미분류 차이 0, 구현 수정 없음). 실제 앱에서 하지 못한 것: 실제 공급자 턴, 누락 줄 Open, hover·pressed, 다크 모드, forced colors. R-C 시작(Codex gpt-6-astra medium, worktree `mh-renderer`). design-sync 6단계의 독립 리뷰도 R-C가 맡는다.
- A 수정 1회차 완료(`b4b426fe`): RA-1은 소스 fallback을 없애고 큐를 새 대화로 옮긴 뒤 `ended()`의 큐 규칙을 적용한다(done이면 전송, failed·stopped면 초안). RA-2는 prepare 직후 재검사한다. RA-3은 경계 테스트 다섯 개를 더했다. A 테스트 326개, 넓은 범위 1929개, typecheck·lint 통과. R-A 2회차 확인 시작(dispatch `ctx_30eeac7927a4`).
- R-C 완료: 🔴 0, 🟡 1, ⚪ 2(`mh-renderer/.scratch/review-RC.md`). 코드 결함은 없다. 🟡: 드래프트 캡처 PNG 셋이 투명하고 pending도 대상 프레임을 담지 않아 이미지 대조를 못 했다. design-sync 판정은 findings. C에 재캡처(GUI 조율)와 ⚪ 두 건(칩 행 재분류, focus를 미검증 목록에)을 보냈다.
- C 코드(`83839b80`, `2a590b9d`)를 `b926c3bb`, `69101557`로 통합했다(R-C 코드 결함 0). 통합 HEAD typecheck 통과. 드래프트 재캡처는 링크 1a가 GUI를 쓰고 있어 lead의 go를 기다린다.
- R-A 2회차: 🔴 1, 🟡 1, ⚪ 1. RA-3은 해결, RA-4는 한계로 닫았다. 🔴 R2-1: prepare 뒤 검사가 원래 턴·요청을 식별하지 않아, 취소된 이전 턴의 시작이 새 턴의 같은 경로 요청을 빌려 옛 텍스트로 대화를 시작할 수 있다. 🟡 R2-2: 이미 끝난 대상이 보관된 경우에도 옮긴 큐를 정상 done으로 보고 복원 전송할 수 있다. ⚪ R2-3: interrupted·rate_limited 분기 테스트가 없다. A에 2회차 수정을 보냈다.
- C 수정 1회차 완료(`61cf2dc4` → `4503ea72` 통합): 드래프트 PNG 네 장 재캡처(conductor가 resolved 드래프트·구현 이미지를 직접 열어 같은 구조임을 확인), 칩 행 재분류, DESIGN.md에 focus 미검증 추가. 재측정 PASS(78쌍, 미분류 0). GUI done을 lead에 보냈다.
- R-C 2회차: 기존 Codex dispatch 재개가 `agent-update-prompt`로 실패했다(`ctx_e01949147080`). 같은 모델로 새로 띄웠다(`ctx_dd06d29296a1`).
- R-C 2회차: 🔴 0, 🟡 0, ⚪ 0. design-sync 판정 pass(네 프레임, 표 129행이 JSON과 일치). 남은 미검증: 실제 공급자 턴, 실제 앱의 누락 줄 Open, 대기 중 단일 알림 뒤 다중 알림, Open의 hover·pressed·focus, 다크 모드, forced colors.
- A 수정 2회차 완료(`050c7f24`): HandoffStart에 요청한 turnId를 싣고 prepare 뒤와 수락 직전에 같은 턴·starting 요청·current 소스를 확인한다. 대상이 current가 아니거나 닫혔거나 기록에 실패했으면 옮긴 큐를 대상의 초안으로 돌린다. interrupted·rate_limited 테스트 추가. A 테스트 331개, 넓은 범위 1934개, typecheck·lint 통과. R-A 3회차 확인 시작.
- R-A 3회차: 🔴 0, 🟡 2, ⚪ 1. R2-1·R2-3 해결. 🟡 R3-1: 삭제된 대상에 옮긴 큐를 초안으로 다시 써서 되살린다. conductor 판단: 삭제된 대상이면 그 id 아래에는 아무것도 쓰지 않고, 큐를 소스 대화의 초안으로 돌린다(자동 전송 없음, 사람의 글을 잃지 않는다). 🟡 R3-2: 자동 flush의 예약된 전송이 그 사이 보관된 대상에 들어갈 수 있다(기능 이전부터 있던 틈이다). flush 경로 안에서 최소로 고친다. ⚪ R3-3: openRunner를 붙잡은 턴 교체 회귀. A에 3회차 수정을 보냈다.
- A 수정 3회차 완료(`e7c0ba45`): 삭제된 대상이면 큐를 소스의 초안으로 돌린다. 자동 flush는 같은 live·hold가 그대로일 때만 보내고, 대화가 current가 아니면 큐를 돌려준다. openRunner를 붙잡은 턴 교체 회귀를 더했다. A 테스트 335개, 넓은 범위 1938개, typecheck·lint 통과. 워커가 flush 틈(기능 이전부터 있음)을 POSTMORTEM 후보로 넘겼다. R-A 4회차 시작(`ctx_fc3bec09eaef`).
- R-A 4회차: 🔴 0, 🟡 0, ⚪ 1(기존 flush 틈의 POSTMORTEM 기록은 문서 단계에서 한다). A 전체를 `06b07990`, `1acb3d69`, `d51e712f`, `55afb11a`, `1a5b6601`로 통합했다.
- 통합 HEAD `1a5b6601`에서 `verify.mjs --eval` PASS(verify-tests, runtime-support, go-test, go-vet, typecheck, lint, app-test, eval-tests, eval-self-test, build).
- 실제 앱 확인(RT) 시작: dispatch `ctx_c0adb1f8520e`(Claude Opus high, conductor worktree). lead의 GUI go를 받았다. conductor 판단: Keychain 항목이 프로필 경로로 키잉되어 복사본에서는 로그인이 사라지므로, 공유 프로필을 제자리에서 쓰고 상태 파일을 `.scratch/`에 백업했다가 종료 뒤 복원한다(체인 '로그인'의 재사용 규칙, 로그아웃 없음).
- RT 완료(task 9): Claude Code와 Codex(Ask first) 각각 세 시나리오(소스 페이지에 머묾, Home에 있음, 핸드오프 하나와 누락 하나)를 실제 턴으로 돌렸다. 새 대화 2개, 소스 줄 2개와 “Open a.html”/“Open b.html”, 화면 이동 없음, Home에서 요약 토스트 하나와 그 Open, Codex 승인 두 번, edit로 만든 요청 없는 캔버스의 누락 줄과 그 Open이 모두 통과했다. 제품 결함은 없다. codex-stay의 "핸드오프된 대화의 첫 턴 완료" 체크는 프로브 버그(대화마다 요청 id가 겹침)로 실패했고, 고친 뒤 away·missed에서는 통과했다. stay는 다시 돌리지 않았다. Cursor·Antigravity·Copilot은 확인하지 않았다. 실제 상태 변화 없음, 공유 프로필은 복원했고 두 공급자 모두 connected다. 증거는 `.scratch/runtime-test/multi-handoff/`에 있다.
