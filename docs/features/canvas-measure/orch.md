# 캔버스 거리 측정 — orch

- 계획 원본: [tasks.md](./tasks.md), [spec.md](./spec.md), [design.md](./design.md)
- 시작 해시: `98039c62e` (origin/develop)
- 통합 브랜치: `feat/canvas-measure` (lead가 develop에서 만들었다)
- task 1·2는 develop에 이미 커밋되어 있다. 이번 run은 task 3부터다.

## 결정 기록

- 초안 확정(task 2 검증): design.md '초안' 절의 기록을 사용자에게 다시 물었고, 사용자가 확정했다고 답했다(lead 요청).
- 배치 나누기: task 3–6을 한 배치(A)로, task 7을 같은 워커의 후속 Task로 보낸다 — conductor 판단. 근거: 3–6이 모두 `CanvasController.ts`·`canvasScript.ts`와 그 테스트를 고치고, 7의 `/design-sync` 수정도 같은 파일을 고친다. 병렬로 나눌 수 있는 파일 경계가 없다.
- task 8(문서 승격과 정리)은 conductor가 통합 뒤 직접 한다 — 문서 신선도 커밋은 conductor 몫이다(`/orchestrate` §4·§5).
- 모델 경계: Claude 워커만 쓴다(lead 지시).
- 점선 연장선 범위(워커 질문): 캡처 04·16을 직접 확인했다. 변 차이 점선은 대상의 가까운 변에서 선택의 먼 변까지다. 사례 16에는 짧은 점선(y=330, x 265→270)이 있다. design.md를 고쳤다(621120700) — conductor 판단, 근거는 캡처.
- 리뷰 A(🔴 0, 🟡 2, ⚪ 6): 🟡1 ⌥ + 휠·pinch에서 측정이 사라지는 문제는 ⌥ 중 휠이 대상을 유지하게 고친다 — conductor 판단, 근거는 spec 11. 🟡2 테스트가 feature 문서의 절·사례 번호를 인용하는 문제는 기하 설명으로 바꾼다 — conductor 판단, 근거는 AGENTS.md 'Commit conventions'.
- task 8 grep 기준: 초안 파일 이름은 남으므로 `docs/features/canvas-measure`로 좁혔다 — conductor 판단.
- 맞닿은 두 요소(간격 0): conductor가 Figma Touch 프레임(사례 27)에서 세 쌍을 양방향으로 관찰했다. 여섯 경우 모두 선과 라벨이 없고 측정 중 외곽선만 나왔다. 사용자가 Figma대로 하기로 결정했다(spec 6-1, design.md '맞닿은 두 대상'). 캡처는 develop 체크아웃의 `.scratch/canvas-measure/touch-*.png`다.
- task 7에 리뷰 ⚪2·⚪4(메뉴·대화상자 열림·닫힘, reload 뒤 복귀)와 맞닿음 확인을 더했다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | task 3–6 | `app/src/renderer/measure.ts`(새 파일)·`measure.test.ts`, `selection.ts`·`selection.test.ts`, `app/src/main/canvasScript.ts`·`canvasScript.test.ts`, `app/src/renderer/CanvasController.ts`·`CanvasController.test.ts`, `styles.css` | 없음 | Opus high — Alt 상태의 단일 근거와 selection/hover seq 순서는 2026-10 postmortem 두 건이 걸린 동시성 영역이다 | task별 검증(tasks.md) + `node .agents/skills/verify/scripts/verify.mjs` | 진행 중 (run `run_c6df40ac0eaf`, dispatch `ctx_7aa2de3628be`, worktree `canvas-measure-a`) |
| A-7 | task 7 | A와 같다 + `.scratch/canvas-measure/`, `docs/design/canvas.md`, `docs/DESIGN.md` 색인 | A 통합 | Opus high — 실제 앱 computed style 비교와 입력 경로 재현 | task 7 검증 | 대기 |
| 리뷰 | A 리뷰 | 보고만 | A 완료 | Opus high — 같은 동시성 영역 | `/code-review` 🔴 0 | 1차 완료(🔴 0 🟡 2), A 수정 라운드 진행 중 |
| C | task 8 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/design/canvas.md`, `docs/BACKLOG.md`, `docs/features/canvas-measure/` 삭제 | A-7 | conductor | task 8 검증 | 대기 |

## 파일 겹침과 순서

A → 리뷰 → (수정 라운드) → 통합 → A-7 → 통합 → C. 모두 직렬이다. 병렬로 도는 배치는 없다.
