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

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| A | A1·A2·A3 | `app/src/main/conversation/{sessions,prepare,io}.ts`, `app/src/main/agentAuth/{facts,state,types}.ts`, 새 버전·handshake 판정 모듈, 관련 테스트, `conversation/fixtures/README.md` | — | Claude Opus medium — 파일이 많고 뒤집히는 테스트가 있지만 규칙은 design에 정해져 있다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| A-rev | A 독립 리뷰 | 보고만 | A | Codex `gpt-6-astra` medium — 다른 계열의 판단 리뷰(체인 권한) | `/code-review` | 대기 |
| B | B1 | `app/src/main/conversation/{service,runners,acpRunner}.ts`, `app/src/main/agentAuth/{ipc,state,types}.ts`, `app/src/main/index.ts`, 관련 테스트 | A 통합 | Claude Opus high — 기록·`changed()` 발행·예약 해제 순서가 얽힌 동시성 연결 | `npm --prefix app test`, `node .agents/skills/verify/scripts/verify.mjs` | 대기 |
| B-rev | B 독립 리뷰 | 보고만 | B | Codex `gpt-6-astra` medium — 다른 계열의 판단 리뷰(체인 권한) | `/code-review` | 대기 |
| R | B2 `/runtime-test` | `.scratch/`만 | B 통합 | Claude Opus medium — 실인증 probe의 타이밍 문제 이력이 있다(chain 운영 메모) | 공급자마다 새 대화 `turn.done`, Claude(legacy)·Codex 재개 `turn.done`, readiness cause가 `version_*` 아님 | 대기 |
| C | C1·C2 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/POSTMORTEM.md`, `docs/features/agent-cli-versions/` | R | 지휘자 | 문서 대조 | 대기 |

- F1·F2는 끝났다(커밋 `b4b70d8`·`772c83f`).
- 통합 HEAD gate: `node .agents/skills/verify/scripts/verify.mjs`(eval 변경 없음 → `--eval` 없음). 앱 동작 확인은 R이 맡는다.
- 모델 교차: A-rev·B-rev에 Codex를 쓴다(체인 상시 권한).

## 진행 기록

- 2026-10-28 intake: 결정 O1–O5.
