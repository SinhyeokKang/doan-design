# turn-end-state — orch

- 원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- chain: [chain-261109](../chain-261109/chain.md) 링크 1. 상시 권한은 chain 파일을 따른다.
- 시작 hash: `12b61d52` (origin/develop)
- 통합 branch: `feat/turn-end-state` → PR은 develop으로. merge는 lead가 한다.

## 결정 기록

- worker 모델: conductor 판단 — 아래 batch 표. 모두 Claude다.
- Codex: chain이 허락했다(두 링크, 한도 없음). 링크 시작 때 확인한 남은 양은 5시간 창 90% 사용(초기화 2026-11-13 01:53 UTC)이었다. batch 도중 끊길 위험이 커서 이 링크에서는 쓰지 않는다. 쓰게 되면 이 절에 범위를 적는다.
- 로그인: chain '로그인' 절 — `/Users/sinhyeokkang/code/doan-design/.scratch/provider-profile/userData`를 `--user-data-dir`로 다시 쓰고, 망가뜨릴 수 있는 probe는 사본을 쓴다. sign-out하지 않는다. tasks T0·T6의 "sign-out과 profile 삭제"를 대신한다.
- P의 로그인: 사본은 Claude가 로그아웃 상태였다(Keychain 항목이 CLAUDE_CONFIG_DIR 경로로 묶임). conductor 판단 — chain이 공유 userData 재사용을 허락하므로 원본을 쓰고, folders.json·ui-state.json을 백업·복원한다. T0 동안 다른 probe는 그 userData를 쓰지 않는다.
- 정지 지점: T0이 H0·H3·H4나 다른 원인으로 판정하면 conductor가 멈추고 사용자에게 묻는다(design §13, chain 인계 기록 2).
- `/design-draft` 없음(design §12).
- T0 판정 H0 → 정지 지점에서 사용자 결정: **T4 취소, 원인만 기록**(T7 BACKLOG P3 줄). S worker에게 T4를 보내지 않는다. T6 (c)도 하지 않는다.
- 계정 전환: 이전 conductor 세션이 토큰 한도로 멈춰 다른 계정의 새 세션이 같은 worktree에서 이어받았다. 이전 계정 worker 7개(P·M·R·S·M 리뷰·S 리뷰·S 수정 1)는 모두 settled였고 재개할 일이 없어 해제했다(남은 프로세스 없음 확인). 이후 worker는 새 계정 profile로 띄운다.
- T6 runtime-test는 T0의 계측과 script를 다시 쓰므로 P worker에게 새 Task로 준다. T7 승격은 conductor가 한다.

## Batch

| batch | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 gate | 상태 |
|---|---|---|---|---|---|---|
| P | T0 PoC, 뒤에 T6 | `docs/features/turn-end-state/design.md` §4.1, `.scratch/turn-end-state/`, `.scratch/runtime-test/turn-end-state/`. 계측 patch는 commit하지 않는다 | 없음(T6은 M·R·S 통합 뒤) | Claude Opus high — 원인 판정과 실제 앱 측정이라 판단이 많고 틀리면 T4 방향이 틀린다 | T0: H0–H5 판정이나 다른 원인과 증거. T6: tasks T6 항목별 기준 | 대기 |
| M | T1 | `types.ts`, `transport.ts`, `acp.ts`(필드 이동), 그 테스트와 `stage.test.ts`, `dispatcher.test.ts`(테스트만, worker 질문에 conductor가 허락) | 없음 | Claude Opus high — per-call 집합을 모든 반환 경로에서 비우는 일(POSTMORTEM 2026-11-06 함정) | `npm --prefix app test`, typecheck, verify.mjs | 대기 |
| R | T2 → T5 | `turnStatus.ts`, `threadItems.ts`, `composerRules.ts`, `dockedRules.ts`, `ConversationThread.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `DockedComposer.tsx`, `useProjectSkills.ts`와 그 테스트 | 없음 | Claude Opus high — render 순서·focus·event/stage 분리 render 판단 | test, typecheck, lint, verify.mjs | 대기 |
| S | T3 (T4 취소) | `service.ts`, `service.test.ts`, `runners.ts`, `runners.test.ts`, `process.ts`, `process.test.ts` | T3 없음. T4는 P의 T0 판정(H1·H2·H5) | Claude Opus high — lifecycle·reservation 불변식, 동시성 | test, verify.mjs | 대기 |
| 리뷰 | batch마다 `/code-review` | 보고만 | 각 batch 완료 | Claude Opus high (diff 난도에 따라 Sonnet high) | 🔴 0 | 대기 |
| L | lead의 추가 변경: Claude 사용 한도 턴을 `rate_limited`로 분류 | `transport.ts`, `transport.test.ts`, `stage.test.ts`, `fixtures/` | 없음 | Claude Sonnet high — 분류 규칙 하나와 테스트, 구조화 신호 확인이 필요해 high | test, typecheck, lint, verify.mjs | 진행 |
| A | lead의 추가 변경: 이전 sign-in의 대화에 새 거절 코드 `account_changed` | `agentAuth/*`, `prepare.ts`, `ipc.ts`, `models.ts`, `types.ts`, renderer `dockedRules.ts`·`canvasConversation.ts`·두 host·`DockedComposer.tsx` 등과 테스트. `transport.ts`는 L 소유라 제외 | 없음 | Claude Opus high — IPC 계약 추가와 두 host의 거절 흐름 | test, typecheck, lint, verify.mjs, runtime-test | 진행 |
| T7 | 승격과 정리 | PRODUCT, ARCHITECTURE, DESIGN, BACKLOG, `docs/features/turn-end-state/` 삭제 | 모든 batch 통합 | conductor | 문장-코드 대조, verify.mjs | 대기 |

### tasks 항목 대응

T0·T6 → P, T1 → M, T2·T5 → R, T3·T4 → S, T7 → conductor. 주인 없는 항목 없음.

## 파일 겹침과 순서

- M·R·S·P의 파일은 겹치지 않으므로 넷 다 나란히 시작한다. P의 계측 patch는 `service.ts`·`runners.ts`를 건드리지만 commit하지 않고 P worktree 안에만 둔다.
- S의 T4는 T0 판정을 기다린다. S에게는 T3을 끝내고 T4를 '미룬 항목'으로 적게 한 뒤, 판정이 나오면 새 Task로 보낸다.
- T6은 M·R·S가 통합된 `feat/turn-end-state`에서 한다.

## 리뷰·통합 기록

(진행하며 적는다)

- **M**: `46f9df51` → 통합 `958b7257`. 리뷰(Sonnet high) 🔴 0 · 🟡 1. 🟡: 시작만 하고 `item/completed`가 오지 않는 Codex 도구 item(`codex-home.json` 녹화)이 턴 끝까지 `running`에 남아 뒤의 general을 막는다. conductor 판단 — design §2.2대로 받아들이고, T6에서 실제 Codex가 시작한 명령 item을 늘 닫는지 본다. tasks.md T1의 "`codexHome` 사례 포함" 문구와는 다르다. `requesting` general이 `running`을 보지 않는 점(note 1)도 T6에서 실제 frame으로 본다. M·리뷰 worker 해제.
- **S**: `357cc74d`. 리뷰(Opus high) 🔴 0 · 🟡 1 — Codex server 재사용 예외의 `!failedPersistence`(`service.ts:419`)를 고정하는 테스트가 없다. 수정 라운드 1(테스트 추가)을 새 worker(Sonnet high, 같은 worktree)에 맡겼다. 끝난 worker terminal은 Orca가 agent로 알아보지 못해(`agent_unconfigured`) 다시 쓰지 못했고 해제했다. T4도 새 worker로 보낸다.
- **R**: `8f9fa8f7`(T2 `bc7d321c`, T5 `23dd3c4d`, refactor). 리뷰(Opus high) 🔴 0 · 🟡 1 · ⚪ 5. 🟡: host가 `withSending`을 붙인 목록으로 `threadTurn`을 불러, 도구가 도는 중 Send now 메시지가 있으면 status가 general이 되고 행이 멈춘다(spec D1.1 위반, 이 batch의 회귀). conductor 판단 — spec D1.1·design §2.1대로 status도 `withSending` 전 목록으로 판단한다. 그 결과 Send now 중 indicator가 "<Provider> is working" 대신 도는 도구 이름을 말하게 되는데, indicator가 현재 단계를 말한다는 PRODUCT §5 item 3과 맞으므로 받아들인다. ⚪1(`dockedRules.ts` 주석)도 함께 고치고 나머지 ⚪는 두었다. 수정 라운드 1을 새 worker(Opus high, 같은 worktree)에 맡겼다. 리뷰 worker 해제.
- **S 수정 1**: `0a3b8bae`(테스트만). 재리뷰(Sonnet high — 테스트 하나의 mutation 확인이라 가볍다) 🔴 0 · 🟡 0, mutation을 리뷰어가 직접 재현했다. 통합 `87bf8015`·`8060e3ec`. 리뷰 worker 해제.
- **R 수정 1**: `013c1481`. 재리뷰(Sonnet high) 🔴 0 · 🟡 0 · ⚪ 3. ⚪2: Send now 중 마지막이 streaming 답변이면 indicator가 "replying"이 된다. conductor 판단 — 그대로 둔다(현재 단계를 말한다는 규칙과 같음). 통합 `6d360cd0`·`46d3ae1b`·`31bb822d`·`2c53b98d`. 리뷰 worker 해제.
- **L**: lead가 같은 PR에 넣으라고 준 추가 변경이다. 실제 앱 대화 `38523521…` seq 4517–4518에서 주간 한도 턴이 `turn.failed` `unknown`으로 기록됐다. Claude transcript에서 한도 응답은 `assistant`에 `error: "rate_limit"`, `model: "<synthetic>"`으로 남는다. 구조화 신호를 우선하라는 brief로 새 worker(`tes-L`)를 띄웠다. 계정 전환 뒤 전송 거절(2번 문제)은 범위 밖이다(lead가 조사).
- **A**: lead가 같은 PR에 넣으라고 준 두 번째 추가 변경이다. 사용자 결정은 계정 불일치에 새 거절 코드를 두는 것이다(IPC 계약 추가, ARCHITECTURE 반영). conductor 판단:
  - 코드: `account_changed`. `judgeConnection`의 `account_mismatch`·`account_unverifiable`·`workspace_mismatch`·`profile_mismatch`를 묶는다. 넷 다 대화가 다른 sign-in의 것이라는 뜻이다. 다른 `session_unavailable` 원인과 나머지 거절 코드·문구는 그대로다.
  - 문구: "This conversation belongs to an earlier <Provider> sign-in and can’t continue with the account signed in now." 버튼은 기존 terminal session 거절의 "Start a new conversation"을 쓰고 Retry는 없다. 캔버스 패널과 Home·Overview docked composer 모두 같다.
  - runtime-test: 두 번째 계정 대신 공유 userData의 probe 대화 owner `accountId`를 바꿔 실제 거절 경로를 본다(백업·복원, sign-out 없음).
  - PRODUCT·ARCHITECTURE는 T7에서 conductor가 고친다.
- **T6 Claude 계정**: 공유 userData의 Claude 계정(b2b_product_group)이 주간 한도에 걸려 Claude 턴이 모두 1초 안에 실패했다(11-11 14:00 KST 초기화). 사용자 결정: 그 userData에서 Claude를 sign out하고 다른 계정으로 로그인한다(chain '로그인'의 sign-out 금지 예외). T6 worker가 userData를 놓으면 사용자가 앱에서 바꾼다. 이전 계정의 probe 대화는 batch A의 실제 두 계정 확인에 쓴다.
- **L**: TransportState에 `claudeFailure?` 필드를 더하려고 `types.ts` 편집을 물었고 conductor가 그 필드 하나만 허락했다(A와 같은 파일이라 hunk를 떨어뜨림). renderer의 `rate_limited` 문구는 A가 맡는다(문구가 A 소유 파일에 있다).
- **lead 문구 결정**: `rate_limited`는 "usage limit" 문구로, `account_changed`는 lead가 정한 notice 문구로 바꾼다(`.scratch/orch/update-A1.md`). 사실과 맞지 않으면 문구를 바꾸지 않고 lead에게 알린다. A에게 네 원인마다 둘째 문장("sign in to that account again")이 맞는지 확인하게 했다.

