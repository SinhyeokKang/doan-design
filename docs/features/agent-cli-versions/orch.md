# agent-cli-versions — orch

체인 [chain-261028](../chain-261028/chain.md)의 링크 1. 계획은 [tasks](./tasks.md), 근거는 [spec](./spec.md)·[design](./design.md)이다.

- 시작 hash: `f884c73`(main). 통합 브랜치: `feat-agent-cli-versions`.
- 지휘자: Claude Code(Opus). 체인 권한으로 이 PR을 main에 병합하고, Codex 작업자를 쓸 수 있다.

## 결정 기록

| # | 결정 | 근거 |
|---|---|---|
| O1 | B2는 실제 HOME에서 한다. 격리 userData·`DOAN_RUNTIME`을 쓰고 setup 쓰기 단계는 없다. doan이 만든 Keychain 항목은 만들고 지운 목록을 보고한다 | 2026-10-28 사용자. tasks B2의 "격리 HOME"을 대체한다. 격리 HOME에서는 Codex keyring이 기본 keychain을 찾지 못했다(PRODUCT §6) |
| O2 | B2에서 ego-lite 로그인 승인(지휘자), Copilot 요청 비용, legacy external Claude·Codex가 실제 `~/.claude`·`~/.codex`에 `/tmp` 저장소 세션 기록을 남기는 것을 승인한다 | 2026-10-28 사용자 |
| O3 | `/agent-eval`은 생략한다. guide·CLI/MCP 출력·`doan check`·MCP 설명·skill stub과 에이전트 버전이 바뀌지 않는다 | 2026-10-28 사용자 |
| O4 | A·B를 직렬로 나눈다. 두 묶음이 `prepare.ts`·`facts.ts`·`state.ts`·`types.ts`를 함께 고친다 | 지휘자 판단 — 파일 겹침(orchestrate §0.4) |
| O5 | C1·C2는 지휘자가 쓴다 | 지휘자 판단 — orchestrate §5 승격은 지휘자 몫 |
| O6 | 새 세션 Codex `initialize`의 JSON-RPC 오류라도 기존 분류가 `not_logged_in`·`rate_limited`·`session_in_use`·`credential_override`이면 기록하지 않는다. RPC 오류인지는 dispatcher가 요청에 대응하는 응답에서 남긴 증거로 판단하고, 메시지 문자열로 판단하지 않는다 | 지휘자 판단 — spec 완료 조건 4(프로토콜 형식 위반만 증거). A 리뷰 🟡·⚪1 |
| O7 | 새 세션 Codex `initialize` 결과가 객체가 아니면 기록한 뒤 실행을 거부한다. 오류는 기존 실패 경로와 `transportError` 매핑을 쓰고 새 코드를 만들지 않는다 | 지휘자 판단 — spec 완료 조건 3과 design 표(이 증거의 오류 코드는 `transportError` 매핑). B 리뷰 🟡1 |
| O8 | 버전 원인일 때 check 분기는 `version_unsupported`·`version_unknown`·`version_incompatible` 모두에 적용한다 | 지휘자 판단 — design '버전 원인'. 지금은 renderer 호출처가 없다. B 리뷰가 받아들임 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | A1·A2·A3 | `app/src/main/conversation/{sessions,prepare,io}.ts`, `app/src/main/agentAuth/{facts,state,types}.ts`, 새 버전·handshake 판정 모듈, 관련 테스트, `conversation/fixtures/README.md` | — | Claude Opus medium — 파일이 많고 뒤집히는 테스트가 있지만 규칙은 design에 정해져 있다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합 `79e8c14`·`c518a97`(1라운드) |
| A-rev | A 독립 리뷰 | 보고만 | A | Codex `gpt-6-astra` medium — 다른 계열의 판단 리뷰(체인 권한) | `/code-review` | 완료: 🔴0·🟡1·⚪2. 🟡·⚪1은 O6으로 B에, ⚪2(legacy 버전 없는 재개 테스트)도 B에 넘김 |
| B | B1 | `app/src/main/conversation/{service,runners,acpRunner}.ts`, `app/src/main/agentAuth/{ipc,state,types}.ts`, `app/src/main/index.ts`, 관련 테스트 | A 통합 | Claude Opus high — 기록·`changed()` 발행·예약 해제 순서가 얽힌 동시성 연결 | `npm --prefix app test`, `node .agents/skills/verify/scripts/verify.mjs` | 수정 1라운드 진행 중(`acv-b`, Opus medium) |
| B-rev | B 독립 리뷰 | 보고만 | B | Codex `gpt-6-astra` medium — 다른 계열의 판단 리뷰(체인 권한) | `/code-review` | 완료: 🔴0·🟡2·⚪1. 🟡1은 O7, 🟡2(preload check 응답 타입)와 ⚪1(시간 초과·legacy Claude 테스트)은 수정 1라운드로 |
| R | B2 `/runtime-test` | `.scratch/`만 | B 통합 | Claude Opus medium — 실인증 probe의 타이밍 문제 이력이 있다(chain 운영 메모) | 공급자마다 새 대화 `turn.done`, Claude(legacy)·Codex 재개 `turn.done`, readiness cause가 `version_*` 아님 | 대기 |
| C | C1·C2 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/POSTMORTEM.md`, `docs/features/agent-cli-versions/` | R | 지휘자 | 문서 대조 | 대기 |

- F1·F2는 끝났다(커밋 `b4b70d8`·`772c83f`).
- 통합 HEAD gate: `node .agents/skills/verify/scripts/verify.mjs`(eval 변경 없음 → `--eval` 없음). 앱 동작 확인은 R이 맡는다.
- 모델 교차: A-rev·B-rev에 Codex를 쓴다(체인 상시 권한).

## 진행 기록

- 2026-10-28 intake: 결정 O1–O5.
- 2026-10-29 A 완료: 작업자 보고 앱 테스트 3712개·typecheck·`verify.mjs` 통과. 리뷰어가 테스트·typecheck를 다시 돌려 통과를 확인했다. cherry-pick한 트리는 작업자 HEAD `6712123`과 `app/`이 같다. 작업자 계획 차이: `conversation/types.ts`의 `AvailabilityFacts.sdkVersion` 제거, `ACP_VERSIONS`를 `MINIMUM_VERSIONS`로 합침, fixture README는 실제 출처 버전을 적음. 증거: `.scratch/orch/handoff-A.md`, `.scratch/orch/review-A.md`.
- 2026-10-29 B 시작: Opus high, 결정 O6과 A 리뷰 지적을 브리프에 넣었다.
- 2026-10-29 B 1차 완료(`95e6094`·`33bd452`): 작업자 보고 테스트 3734개·typecheck·`verify.mjs` 통과. 리뷰어가 테스트·typecheck를 다시 돌려 통과를 확인했다. 증거: `.scratch/orch/handoff-B.md`, `.scratch/orch/review-B.md`.
