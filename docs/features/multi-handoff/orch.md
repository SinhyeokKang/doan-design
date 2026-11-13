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
