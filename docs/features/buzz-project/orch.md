# buzz-project — orch

원본: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 이 문서는 배치 배정과 진행만 적는다.

- 시작 해시: `d13b2adf`(main)
- 통합 브랜치: `feat-buzz-project`
- 지휘: Claude Code(Opus 5.5)

## 결정 기록

1. **모델 경계**: 사용자가 이 세션에 Codex 워커를 허용했다("Codex 워커 사용 가능"). 구현은 Claude가 주로 맡고, Codex는 독립 리뷰(gpt-6-astra medium)와 기계적인 제거 배치(gpt-6.1-sol high)에 쓴다. 지휘자 판단 — 근거: 사용자 메모리의 워커 배합 원칙.
2. **X를 R보다 먼저, T와 병렬로**: tasks.md는 T → R → X 순서지만, X는 R이 다시 쓰는 `ProjectOverview.tsx`·`RightPanel.tsx`·`App.tsx`의 카드·Feedback·FirstPrompt 경로를 지운다. 먼저 지우면 R이 죽은 코드를 피해 가며 쓰지 않아도 된다. 중간 커밋에서 Overview가 잠시 비는 것은 통합 브랜치 안의 일이라 받아들인다. 지휘자 판단 — 근거: 파일 겹침과 재작업 비용.
3. **T1의 `App.tsx` 부분은 RM으로**: `savedUiState`(App.tsx)와 root 제거 때 정리는 X와 같은 파일이라 RM이 맡는다. TB는 `app/src/restore/uiState.ts`의 타입·파싱과 순수 함수만 맡는다. 지휘자 판단 — 근거: 같은 파일 병렬 금지.
4. **R을 RM(R1·R3·R4) → RL(R2)로 나눠 직렬로 돌린다**: R 전체를 한 워커에 두면 너무 길다. 둘 다 `styles.css`(CSS는 이 파일에만 둔다, POSTMORTEM 2026-10-25)와 `RightPanel.tsx`를 고치므로 병렬로 돌리지 않는다. RM이 Overview 골격과 오른쪽 패널 자리를 만들고, RL이 목록 컴포넌트를 만들어 그 자리에 붙인다(열기·`markSeen` 연결 포함). 지휘자 판단 — 근거: 같은 파일 병렬 금지.
5. **썸네일 모듈 이동은 XB**: 카드를 지우면서 `thumbnailView`·`ThumbnailRequests`·`useThumbnails`를 자기 모듈로 옮겨 남긴다(design §1). RL이 그 모듈을 쓴다.
6. **ID 변경 알림 새 문구**: XB가 Doan `clarify` 프리셋을 읽고 정한다. 지휘자가 리뷰에서 확인한다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 | 상태 |
|---|---|---|---|---|---|---|
| TB | T1(uiState.ts 부분), T2 | `app/src/restore/uiState.ts`와 테스트, 새 순수 함수 모듈과 테스트(`app/src/renderer/overviewConversation.ts` 등 새 파일) | 없음 | Claude Opus medium — 선택 규칙의 경우가 많지만 순수 함수라 깨질 범위가 좁다 | `npm --prefix app test`, typecheck | 대기 |
| XB | X1 | design §1 삭제 목록(renderer·main·preload), `CommentsPanel` ID 변경 알림, 썸네일 모듈 이동, `ProjectOverview.tsx`·`RightPanel.tsx`·`App.tsx`의 해당 부분 | 없음 | Codex gpt-6.1-sol high — 범위는 넓지만 판단보다 단계가 많은 제거 | test, typecheck, build, tasks X1 grep | 대기 |
| RL | R2 | 새 오른쪽 목록 컴포넌트와 테스트, `RightPanel.tsx`·`App.tsx`의 연결, `styles.css`의 목록 클래스 | RM | Claude Opus medium — 키보드·접근성·썸네일 규칙이 있는 독립 컴포넌트 | test, typecheck | 대기 |
| RM | T1(App.tsx 부분), R1, R3, R4 | `ProjectOverview.tsx`, `RightPanel.tsx`, `App.tsx`, `homeRun.ts`, main 메뉴, `styles.css` | TB, XB | Claude Opus high — 비동기 목록·승격·진입점·포커스가 얽혀 틀리면 대화를 잃는다 | test, typecheck | 대기 |
| DS | V1 | 측정 스크립트(`.scratch/`), 대조로 고칠 renderer·CSS, `docs/DESIGN.md` | RL | Claude Opus high — 실제 앱 측정과 수정 판단 | `node .scratch/design-sync/<screen>/measure.mjs` | 대기 |
| RT | V2 | `.scratch/runtime-test/buzz-project/`만(보고 전용) | DS | Claude Opus medium — 정해진 probe 실행 | `verify.mjs` 뒤 `/runtime-test` probe | 대기 |
| ZB | Z1–Z4 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`(DS가 쓴 뒤), 부모 `buzz-restyle/` spec·tasks, 이 디렉터리 삭제 | RT | Claude Opus medium — 현재 규칙으로 고쳐 쓰는 판단 | tasks Z1–Z4 grep | 대기 |

리뷰: 구현 배치(TB, XB, RL, RM, DS)마다 독립 리뷰 워커가 `/code-review`를 한다. 기본은 Codex gpt-6-astra medium이고, XB(Codex 구현)는 Claude Opus medium이 리뷰한다.

## 겹침과 순서

- 1파: TB ∥ XB. 겹치는 파일 없음.
- 2파: RM → RL(`styles.css`·`RightPanel.tsx`·`App.tsx`가 겹쳐 직렬). RL은 RM의 리뷰·수정이 끝나 통합된 뒤 시작한다(수정이 같은 파일을 고친다).
- 3파: DS → RT(GUI probe가 겹치지 않게 직렬).
- 4파: ZB.

## 진행 기록
