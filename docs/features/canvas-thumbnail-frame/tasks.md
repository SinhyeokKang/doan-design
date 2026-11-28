# 캔버스 썸네일 프레임 — tasks

순서: PoC → 순수 함수 → 캡처 → 실기 확인 → 승격. `[commit]`은 커밋 경계다. `/agent-eval`은 필요 없다.

## T1. PoC

- design.md 'PoC'의 후보 A를 `.scratch/canvas-thumbnail-frame/`의 일회성 probe로 격리된 실제 앱에서 확인한다.
- 검증: 동작 여부, 지연, 좁은 프레임 해상도, 캐시 무효화 관찰이 `.scratch/`에 있고, 고른 방법과 이유가 design.md 'PoC 결과'에 적혀 있다.
- `[commit]` design.md

## T2. 순수 함수

- `thumbnailRect`, 캡처 배율(design.md '순수 함수').
- 검증: `npm --prefix app test`에서 표 테스트가 먼저 실패(red)를 보이고 나서 통과한다. 경우: 프레임 있음/없음, 첫 프레임이 중첩 프레임 안(최상위를 고름), 화면보다 키 큰 프레임, 폭 390·1440 프레임, 0 × 0 프레임.
- `[commit]` `test:` → `feat:`

## T3. 캡처

- `thumbnailWindow.ts`(측정과 사각형), 필요하면 `thumbnails.ts`·`thumbnailCache.ts`.
- 검증: `thumbnailWindow.test.ts`, `thumbnails.test.ts`, `thumbnailCache.test.ts`가 통과하고 새 경우(프레임 사각형 캡처, 측정 실패 시 첫 화면, 캔버스가 사각형을 속여도 그 캔버스만 영향)를 담는다. `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`가 통과한다.
- `[commit]` `test:` → `feat:`

## T4. 실기 확인

- `/runtime-test`: 소개 글 + 프레임 캔버스, 프레임 없는 캔버스, 390 px 폰 프레임 캔버스를 격리된 앱에 두고 Overview 행(48 × 48), canvas card 배너와 160 × 100, Quick Open 썸네일을 확인한다.
- 검증: 항목마다 기대값과 스크린샷이 `.scratch/`에 있다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
- `[commit]` 필요하면 `fix:`·`test:`

## T5. 승격과 정리

- ARCHITECTURE §3 'Capture document'를 새 규칙으로, PRODUCT에 썸네일 문장을 더한다(design.md '형식, 규약, 결정에 미치는 영향').
- BACKLOG: T4에서 확인하지 못한 항목.
- `docs/features/canvas-thumbnail-frame/`를 지운다.
- 검증: ARCHITECTURE에 "the thumbnail is the first screen at `doan:width`"가 새 규칙으로 바뀌어 있고 기능 디렉터리가 없다(문서를 읽어 확인한다).
- `[commit]` 문서마다: `docs(ARCHITECTURE): …`, `docs(PRODUCT): …`, `docs(BACKLOG): …`, `docs(feature): remove canvas-thumbnail-frame after promotion`
