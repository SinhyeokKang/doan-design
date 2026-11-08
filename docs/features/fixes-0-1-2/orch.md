# fixes-0-1-2 — orch

- 계획: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md)
- 시작 hash: `45f62006` (origin/develop)
- 통합 브랜치: `feat/fixes-0-1-2` → PR base `develop`. 머지는 lead 세션이 한다.
- Run: `run_c8b7029c252d`. 워커: Claude만(사용자 지시). `/agent-eval`은 conductor가 직접 돌린다(Claude Code·Codex, 설계상 예외).

## 결정 기록

- 모든 제품 결정은 spec·design에서 사용자가 승인했다. T0 초안은 사용자가 앱에서 확정했다(`bbb43f94`, `45f62006`).
- conductor 판단 — 워커는 `/ship bypass`의 1–7단계까지 하고 postmortem·문서 갱신·전체 verify·push는 하지 않는다. 근거: tasks의 마무리(T9–T13)가 conductor 몫이다. postmortem 후보는 handoff에 적는다.
- conductor 판단 — 실제 앱 GUI probe(design-sync, B3 PoC)는 워커가 conductor에게 `ask`로 차례를 받아 하나씩 돌린다. 근거: AGENTS 'GUI probe를 워커 사이에 조율한다'.
- conductor 판단 — `app/src/renderer/styles.css`는 B3(b)만 고친다. B1·B2가 필요하면 handoff의 미룬 항목으로 남긴다. 근거: 병렬 배치의 파일 겹침 금지.
- conductor 판단 — B3는 PoC(T5)부터 한다. (b)면 이어서 끝까지, (a)면 PoC 결과만 넘기고 멈춘 뒤 B2 통합 후 새 Task로 이어 간다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 업데이트 화면 | T1, T2 | `SettingsAbout.tsx`, `UpdateHeaderButton.tsx`, `AgentUsageButton.tsx`, 새 공용 훅, `app/src/main/update/view.ts`와 각 테스트 | 없음 | Opus high (요청 번호 경합, 공유 no-drag 카운터, live region; 틀리면 창이 끌린다) | typecheck, lint, test, design-sync | 진행 중 (`ctx_38778b4ec995`) |
| B2 문제 상태 | T3, T4 | `folderState.ts`, `app/src/main/index.ts`(reveal), `problemView.ts`, `ProblemOverlay.tsx`, `App.tsx`, `homeCards.ts`, `ProjectOverview.tsx`, `ShellSidebar.tsx`, `projectSettingsRules.ts`와 각 테스트 | 없음 | Opus high (main·renderer 여러 곳, 신뢰할 수 없는 텍스트, `.doan/` 경로 예외) | typecheck, lint, test, design-sync | 진행 중 (`ctx_9db7ec500246`) |
| B3 Look Up | T5, T6, T7a | (b) `chipField.ts`, `styles.css`, `editMenu.ts`(`lookUpLabel`의 U+200B, conductor 승인); (a) `editMenu.ts`, `app/src/main/index.ts` | (a)면 B2 통합 | Opus medium (실제 앱 PoC 판단, 구현은 작다) | design 4 결과 줄, typecheck, lint, test | 진행 중 (`ctx_44894e5d7158`) |
| B4 테스트 | T7 | `thumbnails.test.ts`, `quickOpen.test.ts` | 없음 | Sonnet medium (테스트 두 개, 측정 절차가 정해져 있다) | 부하 재현 기록, 같은 부하 3번 통과 | 진행 중 (`ctx_90a6e3e65daa`) |
| B5 프리셋 | T8 | `cli/internal/designskill/` 아래만 | 없음 | Sonnet medium (정해진 문안 교체) | `go test ./...`, `designSkills.test.ts` | 완료 `2cc71d8f`, 리뷰 대기 (`ctx_ed0308e2853b`) |
| 리뷰 | 배치마다 `/code-review` | 읽기만 | 각 배치 완료 | Sonnet high(B4·B5 묶음), Opus high(B1, B2, B3) | 🔴 0 | 대기 |
| 마무리 (conductor) | T9–T13 | `docs/`, `orch.md`, 통합 커밋 | 모든 배치 통합 | — | tasks T9–T13 검증 | 대기 |

## 겹침과 순서

- B1 ∥ B2 ∥ B4 ∥ B5 ∥ B3(PoC). 서로 겹치는 파일이 없다. B3(a)만 `app/src/main/index.ts`가 B2와 겹친다.
- `UpdateHeaderButton.tsx`와 `AgentUsageButton.tsx`는 B1만, `App.tsx`는 B2만 고친다.

## 리뷰·검증 기록

- B3 PoC(T5): (b)로 메뉴 이름이 맞는다. 사전 창 글은 macOS의 1회성 찾아보기 안내가 가려 확인하지 못했다. '계속'을 누르면 실제 macOS 사용자 설정이 바뀌므로 누르지 않았다(conductor 판단). 미검증으로 남기고 보고 때 사용자 확인 항목으로 올린다.
- B5: handoff와 diff가 design 6 문안과 같다. `go test`, `go vet`, `designSkills` 통과(워커 보고).
