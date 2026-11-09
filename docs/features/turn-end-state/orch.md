# turn-end-state — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261109](../chain-261109/chain.md) 링크 1. 상시 권한은 chain 파일을 따른다.
- 시작 hash: `12b61d52` (origin/develop)
- 통합 branch: `feat/turn-end-state` → PR은 develop으로. merge는 lead가 한다.

## 결정 기록

- worker 모델: conductor 판단 — 아래 batch 표. 모두 Claude다.
- Codex: chain이 허락했다(두 링크, 한도 없음). 링크 시작 때 확인한 남은 양은 5시간 창 90% 사용(초기화 2026-11-13 01:53 UTC)이었다. batch 도중 끊길 위험이 커서 이 링크에서는 쓰지 않는다. 쓰게 되면 이 절에 범위를 적는다.
- 로그인: chain '로그인' 절 — `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 `--user-data-dir`로 다시 쓰고, 망가뜨릴 수 있는 probe는 사본을 쓴다. sign-out하지 않는다. tasks T0·T6의 "sign-out과 profile 삭제"를 대신한다.
- 정지 지점: T0이 H0·H3·H4나 다른 원인으로 판정하면 conductor가 멈추고 사용자에게 묻는다(design §13, chain 인계 기록 2).
- `/design-draft` 없음(design §12).
- T6 runtime-test는 T0의 계측과 script를 다시 쓰므로 P worker에게 새 Task로 준다. T7 승격은 conductor가 한다.

## Batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | T0 PoC, 뒤에 T6 | `docs/features/turn-end-state/design.md` §4.1, `.scratch/turn-end-state/`, `.scratch/runtime-test/turn-end-state/`. 계측 patch는 commit하지 않는다 | 없음(T6은 M·R·S 통합 뒤) | Claude Opus high — 원인 판정과 실제 앱 측정이라 판단이 많고 틀리면 T4 방향이 틀린다 | T0: H0–H5 판정이나 다른 원인과 증거. T6: tasks T6 항목별 기준 | 대기 |
| M | T1 | `types.ts`, `transport.ts`, `acp.ts`(필드 이동), 그 테스트와 `stage.test.ts` | 없음 | Claude Opus high — per-call 집합을 모든 반환 경로에서 비우는 일(POSTMORTEM 2026-11-06 함정) | `npm --prefix app test`, typecheck, verify.mjs | 대기 |
| R | T2 → T5 | `turnStatus.ts`, `threadItems.ts`, `composerRules.ts`, `dockedRules.ts`, `ConversationThread.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `useProjectSkills.ts`와 그 테스트 | 없음 | Claude Opus high — render 순서·focus·event/stage 분리 render 판단 | test, typecheck, lint, verify.mjs | 대기 |
| S | T3, 뒤에 T4 | `service.ts`, `service.test.ts`, `runners.ts`, `runners.test.ts`, `process.ts`, `process.test.ts` | T3 없음. T4는 P의 T0 판정(H1·H2·H5) | Claude Opus high — lifecycle·reservation 불변식, 동시성 | test, verify.mjs | 대기 |
| 리뷰 | batch마다 `/code-review` | 보고만 | 각 batch 완료 | Claude Opus high (diff 난도에 따라 Sonnet high) | 🔴 0 | 대기 |
| T7 | 승격과 정리 | PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, `docs/features/turn-end-state/` 삭제 | 모든 batch 통합 | conductor | 문장-코드 대조, verify.mjs | 대기 |

### tasks 항목 대응

T0·T6 → P, T1 → M, T2·T5 → R, T3·T4 → S, T7 → conductor. 주인 없는 항목 없음.

## 파일 겹침과 순서

- M·R·S·P의 파일은 겹치지 않으므로 넷 다 나란히 시작한다. P의 계측 patch는 `service.ts`·`runners.ts`를 건드리지만 commit하지 않고 P worktree 안에만 둔다.
- S의 T4는 T0 판정을 기다린다. S에게는 T3을 끝내고 T4를 '미룬 항목'으로 적게 한 뒤, 판정이 나오면 새 Task로 보낸다.
- T6은 M·R·S가 통합된 `feat/turn-end-state`에서 한다.

## 리뷰·통합 기록

(진행하며 적는다)
