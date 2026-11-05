# context-window-ring — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261105](../chain-261105/chain.md)의 링크 3(마지막 링크)이다.

- 시작 hash: `37591b9a`(main, 링크 3 시작 기록)
- 통합 브랜치: `feat/context-window-ring`
- 지휘자: Claude Code, worktree `/Users/sinhyeok/orca/workspaces/doan-design/context-window-ring-orch`

## 결정 기록

- P1–P6은 다시 하지 않는다(tasks 'P 결과', 결정 3·4 그대로). 지휘자 판단 — chain.md '링크 2 시작 때 사용자와 함께 할 일'.
- 링크 2의 runner 변경 재확인(지휘자, 2026-11-06, 코드로 확인): `openClaude`는 terminal 뒤에도 `prompt_suggestion`을 읽지만, `context.usage`는 `finish()`가 terminal과 같은 events 목록에서 terminal 바로 앞에 낸다. terminal 뒤 frame은 `normalizeClaude`가 `state.terminal`로 버리므로 suggestion 생성 호출의 usage는 값에 들어가지 않는다. 새 control request가 없어 `TURN_USAGE_MS`·`EXIT_WAIT_MS`·`endSuggestion` 경로의 시간은 바뀌지 않는다. 그래서 P 결과는 그대로 유효하다. 실제 앱에서 턴 끝 직후 send가 거절되지 않는지는 E2가 확인한다.
- 다음 턴은 빈 context 상태로 시작한다(design §1). steer로 이어진 후속 턴은 마지막 값 하나다(tasks A1).
- `types.ts`의 `EventPayload` 한 줄은 M과 R이 같은 글자로 더한다(아래 '파일 겹침'). 지휘자 판단 — R이 M을 기다리지 않게 하려고.
- `/design-sync`(E1)는 M·R 통합 뒤 새 배치 S가 한다. 구현을 고칠 수 있어야 해서 지휘자가 하지 않는다.
- E2 `/runtime-test`는 지휘자가 공용 프로필로 한다(chain.md 링크 2 인계 5). S의 GUI probe와 겹치지 않게 S 뒤에 한다.

## Codex 사용

링크 시작 때 Orca Codex 계정의 최신 rollout `rate_limits`(window 10080)는 87% 사용, 13% 남음, 리셋 2026-11-11 15:55 KST. 모델 목록에 `gpt-6-astra`·`gpt-6.1-sol`이 있다. 남은 양이 적어 Codex는 M의 독립 리뷰 한 건(Astra medium)에만 쓴다. capacity 오류면 같은 모델로 세 번까지 재시도한 뒤 Claude Opus medium으로 바꾼다(사용자 규칙).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | gate | 상태 |
|---|---|---|---|---|---|---|
| M | A1, A2, B1 | `app/src/main/conversation/` (`transport.ts`, `acp.ts`, `types.ts`, `store.ts`, `runners.ts`, `service.ts`, `acpRunner.ts`와 그 테스트, `fixtures/`) | 없음 | Claude Opus high — 세 provider의 턴 끝 불변식(terminal 하나, Stop·crash 경로, Codex turnId 검사)이 틀리면 대화 기록이 깨진다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 통합(`3ce49aa0`…`6840f19a`, 6커밋), 2회 |
| M 리뷰 | M의 diff | 보고만 | M | Codex Astra medium — 다른 계열의 독립 시각, 판단 위주 | `/code-review` | 🔴0 🟡0 ⚪2(고침) |
| R | A3, C1, C2 | `app/src/renderer/` (`ProgressRing.tsx`, `ContextRing.tsx`, `contextWindow.ts`, `AgentUsageButton.tsx`, `agentUsageView.ts`, `DockedComposer.tsx`, `CanvasConversationPanel.tsx`, `ProjectOverview.tsx`, `styles.css`와 그 테스트), `types.ts`는 `EventPayload` 한 줄만 | 없음 | Claude Opus medium — design이 마크업·기하·글을 거의 정했고, 사용량 링 추출에서 no-drag effect를 지키는 판단이 남는다 | `npm --prefix app test`, `typecheck`, `build` | 통합(`59d4ac9c`·`a2c9b34d`·`d5d301b2`), 1회 |
| R 리뷰 | R의 diff | 보고만 | R | Claude Opus medium — UI·접근성 diff, Codex 남은 양 아낌 | `/code-review` | 🔴0 🟡0 ⚪3 |
| S | E1 | R이 만든 renderer 파일·`styles.css`의 수정, `docs/DESIGN.md` | M·R 통합 | Claude Opus medium — 계산값 측정과 작은 수정 | `/design-sync` 보고, `npm --prefix app test` | 진행(`cwr-s`) |
| 지휘자 | E2, E3, Z1 | `orch.md`, PRODUCT·ARCHITECTURE·BACKLOG·README·DESIGN 승격 | S 통합 | — | `/runtime-test`, `verify.mjs` | 대기 |

tasks의 체크 항목: P1–P6(완료), D0(초안 확정, 완료), A1·A2·B1 → M, A3·C1·C2 → R, E1 → S, E2·E3·Z1 → 지휘자. 주인 없는 항목 없음.

## 파일 겹침과 순서

- M과 R은 병렬이다. 겹치는 파일은 `app/src/main/conversation/types.ts` 하나이고, 둘 다 `EventPayload`의 `| { type: "turn.done" }` 줄 바로 앞에 `  | { type: "context.usage"; used: number; size: number }` 한 줄만 같은 글자로 더한다. M은 그 줄의 앞뒤 세 줄 안에 다른 줄을 더하지 않는다. 같은 변경이므로 cherry-pick이 충돌 없이 합쳐진다.
- S는 M·R 통합 뒤 `feat/context-window-ring`에서 새 child worktree로 시작한다.
- E2는 S 통합 뒤, E3는 마지막 통합 HEAD에서.

## 진행 기록

- R: 작업자 보고 — 앱 테스트·typecheck·build·`verify.mjs` exit 0. design과 다른 점: `ProgressRing`이 `r`·`stroke`와 span props를 더 받음, `ringDanger` export, `contextRing`이 `value`(링, 100에서 자름)도 돌려줌, 토큰 수 버림(초안 예시와 같음). 독립 리뷰가 모두 받아들일 만하다고 판정했다.
- R 리뷰 ⚪(지휘자 판단: 고치지 않음): (1) renderer는 `size` 0을 거르지 않고 M의 store 검사에 기댐 → M 리뷰에서 store 읽기와 live 경로 둘 다 확인한다. (2) tooltip이 열린 동안 Radix `aria-describedby`가 `aria-description`보다 앞섬 — 정보 손실 없음. (3) 쓰지 않는 `ProgressRingProps` export — 동작 영향 없음.
- M: 작업자 보고 — typecheck·앱 테스트·`verify.mjs` exit 0. design과 다른 점: Claude의 `<synthetic>` 모델 frame은 호출이 아니므로 마지막 실제 호출 값을 바꾸지 않음, 잘못된 값은 버리고 그 턴의 앞선 유효 값을 남김, Claude cache 필드가 없거나 null이면 0. Codex Astra medium 리뷰: 🔴0 🟡0. ⚪2(store 테스트 임시 디렉터리 정리, 지워질 feature 문서의 P 번호를 가리키는 주석·fixture 출처)를 M이 고쳤다(`185f483f`·`ae21fb70`·`5e782cc1`). R 리뷰가 넘긴 `size` 0 검사는 리뷰가 store 읽기와 live 경로 둘 다 확인했다. Codex 사용: 리뷰 1건, capacity 오류 없음.
- 통합 HEAD `6840f19a` `/verify`: app-test에서 `src/main/watch.test.ts` '.doan/ds/ deleted and created again' 1건 실패(파일 감시 타이밍, 이 run의 변경과 무관). 그 파일만 3번 다시 돌려 3/3 통과했다. 그때 이 머신에서 PoC 앱과 작업자들이 함께 돌고 있었다. 마지막 통합 HEAD에서 `/verify`를 다시 돌린다.
- 지휘자 판단: 링크 3을 기다리는 사이에 사용자 요청으로 canvas-handoff P1·P2와 work-update P1을 공용 프로필로 돌렸다(결과는 각 tasks 'P 결과', main `d4ac4cbd`·`4d3368c6`). PoC 앱은 닫았고 `folders.json`을 되돌렸다. 이 링크의 코드와는 무관하다.
