# work-update — orch

원본: [spec](./spec.md)·[design](./design.md)·[tasks](./tasks.md). 체인: [chain-261106](../chain-261106/chain.md) 링크 1.

- 시작 hash: `0197eaa1`(main, `/feature-review` 반영 뒤)
- 통합 branch: `feat/work-update`(지휘자 worktree `work-update-orch`)
- 지휘자: Claude Code(Opus). 작업자는 Claude, 리뷰는 주로 Codex(체인 '상시 권한', 사람: "Codex 써 좀. Link 1에서라도", "주로 리뷰 시켜").

## 결정 기록

- 시작 점검의 답(리뷰 실행, 초안 확정, Z1 명령, 멈춤 조건은 지휘자 판단, 실제 HOME probe와 `/agent-eval` 승인, 로그인 정리 없음)은 체인 파일 '시작 점검 승인'에 있다.
- `/feature-review`의 합의는 `0197eaa1`에 반영했다(늦은 `update` 한계, 새 frame 따라가기, 들어올 때·출처가 바뀔 때 따라가지 않음, 출처로 사람의 이동 구별, 220 ms는 id가 바뀔 때만, 확대율 유지, 답 기다림의 멈춘 모양, W5 기준 3회 중 2회, E2는 R1 뒤).
- D1(초안)은 끝났다. 사람이 확정했다(design §9). 이 run에서는 batch가 없다. 지휘자의 판단이다.
- R과 M 사이의 계약은 지휘자가 정한다(지휘자 판단, 두 batch를 동시에 돌리기 위해). `WorkItem`에 `frame?: string`, `note?: string`, `touched: number`, `turn: string`(터미널 작업 턴 식별자)을 더한다. 대화 작업 내용은 `app/src/main/conversationWork.ts`가 `ConversationWork { conversationId: string; root: string; path: string; frame?: string; note?: string; touched: number; turnId: string }`로 내보낸다. preload는 기존 `getWork`·`onWorkChanged`처럼 `getConversationWork(): Promise<ConversationWork[]>`와 `onConversationWorkChanged(listener): () => void`를 둔다. IPC 이름은 `conversation-work:get`, `conversation-work:changed`이다.
- Codex 사용: 리뷰 worker(`gpt-6-astra` medium)만 쓴다. 주간 한도 89%는 이미 썼다(사람). G0·E1의 `/agent-eval` Codex 실행도 같은 한도를 쓴다. 한도에 걸리면 그 부분을 미검증으로 적는다.

## batch

| batch | 항목 | 파일 소유 | 선행 | model·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| C1 | S1 | `schema/app-socket.v3.schema.json`, `schema/fixtures/app-socket-v3/`, `app/src/formats/{types.ts,validate*.ts}`, `cli/internal/formats/` | — | Claude Opus high: TS·Go가 함께 읽는 공용 형식이라 틀리면 두 쪽이 다 깨진다 | `go test ./...`, `npm --prefix app test` | 통합 `5d695c82` |
| C2 | A1, B1, G0, E1 | `cli/internal/cli/{work.go,work_rules.go,run.go,work_test.go,skill.md,skill_test.go}`, `eval/scenarios/W5/`, `eval/lib/socket.ts`, `docs/USABILITY-EVAL.md`, `docs/BACKLOG.md`(guide 예산 줄) | C1(같은 작업자, follow-up Task) | Claude Opus high: guide를 줄일 때 뜻을 지켜야 하고(POSTMORTEM 2026-10-29), eval 시나리오 판단이 필요하다 | `go test ./...`, `go vet ./...`, `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W5`, `/agent-eval` round 둘 | 진행 중 |
| M | A2, A3, A4, B2, B3 | `app/src/main/{workState.ts,conversationWork.ts,runtime.ts,index.ts,senderAllowed.ts}`, `app/src/preload/index.ts`, `app/src/main/conversation/{service.ts,environment.ts}`, `app/src/main/agentAuth/environment.ts`, 각 테스트 | C1 통합(`WorkRequest`·schema) | Claude Opus high: 대화 턴 수명과 늦은 이벤트(POSTMORTEM 2026-10-27), IPC 경계 | `npm --prefix app test`, `npm --prefix app run typecheck` | 진행 중 |
| P | B4 | `app/src/main/agentSetup/{plan.ts,notice.ts}`, `app/src/main/agentAuth/{providers.ts,storage.ts}`, 각 테스트 | — | Claude Sonnet high: 범위가 좁고 테스트가 정해졌다. 다만 사람의 설정 파일을 덮으면 안 되므로 high | `npm --prefix app test`, typecheck | 통합 `9de89d96`·`e8452b3a`, 리뷰 V1 중 |
| R | A5, A5b, A6, U1, U2 / 이후 U3, E2 | `app/src/renderer/`(`agentIndicator.ts`, `CanvasAgent.tsx`, `CanvasController.ts`, `viewport.ts`, `App.tsx`, `styles.css`, 새 모듈), 각 테스트; U3에서 `docs/DESIGN.md` | live 배선(App.tsx 구독, 새 `WorkItem` 필드)은 M 통합 뒤(미룬 항목) | Claude Opus high: 따라가기와 사람의 이동을 가르는 규칙이 가장 많은 판단을 요구한다 | `npm --prefix app test`, typecheck, U3는 `/design-sync` | 진행 중 |
| V-* | batch마다 `/code-review` | 읽기만 | 해당 batch 완료 | Codex `gpt-6-astra` medium: 사람의 요청(리뷰는 Codex), 다른 모델 계열의 시선 | 보고만 | 대기 |
| 지휘자 | R1, R2, Z1 | `orch.md`, 통합 커밋, 문서 승격 | 모든 batch 통합 | — | `/runtime-test`, `verify.mjs --eval`, `/doc-check` 범위 확인 | 대기 |

## 병렬·직렬

- 지금 함께 시작: C1, P, R. 파일이 겹치지 않는다.
- C1을 통합한 뒤: M을 시작하고, 같은 C 작업자에게 C2를 보낸다.
- R의 live 배선과 E2·U3는 M과 C2를 통합한 뒤 follow-up Task로 보낸다. E2는 R1 뒤에 한다.
- 겹침: `docs/BACKLOG.md`는 C2(guide 예산)와 Z1(지휘자)이 고친다. 시점이 다르다. `docs/DESIGN.md`는 U3만 고친다.

## 진행 기록

- 2026-11-06 C1·P·R 시작(worktree `wu-c`, `wu-p`, `wu-r`). Run `run_f3db49a38834`.
- C1 완료(`67ce8387` → 통합 `5d695c82`). 새 valid fixture 5개가 schema를 바꾸기 전 Go·TS에서 red였다. 작업자의 메모 두 가지: note 패턴이 C1 제어 문자와 U+2028/2029도 거절하므로 A1의 `--note` 검사도 같은 집합을 써야 한다. M이 들어오기 전까지 main `applyWork`는 `update`를 `start`로 다룬다.
- P 완료(`4267f23d`·`bad575ff` → 통합 `9de89d96`·`e8452b3a`). red 먼저(agentSetup 13, agentAuth 9). Codex rule은 `<userData>/agent-auth/profiles/codex/rules/doan.rules`에 놓인다(R1 (b)에서 app-server가 읽는지 본다).
- 통합 HEAD `e8452b3a`: `go test ./...` 통과, `npm --prefix app run typecheck` 통과, `npm --prefix app test` 7963 통과.
- M 시작(`wu-m`), C2를 C 작업자에게 follow-up으로 보냄, V1(C1+P 리뷰, Codex `gpt-6-astra` medium, `wu-v1`) 시작.
- C2 순서 변경(지휘자 승인): Codex 한도 때문에 G0 Claude round → E1 구현 → E1 round(claude,codex ×3) → G0 Codex round를 마지막에 남은 한도로. 돌리지 못한 Codex 실행은 '돌리지 않음'으로 적는다.
