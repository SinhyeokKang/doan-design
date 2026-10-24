# design-nav — 작업 순서

선행 조건: `projects-home`이 main에 병합되어 있다.
앞선 단계: `/feature-review` → `/design-draft`(작업공간 트리, 개요 페이지, ⌘K, 프레임 강조를 `design/design-nav.html`에 그림) → 사용자가 앱에서 초안 확인 → 아래 작업.

`/design-draft`는 Sorcerer(github.com/gbrasil720/sorcerer, MIT)의 목록·내비게이션 화면을 저장소에서 직접 확인해 참고하고, 참고한 화면과 파일을 초안 노트에 출처로 적는다(사용자 요청 2026-10-24).

## PoC

0. 썸네일 숨김 렌더링 캡처 PoC(`.scratch/design-nav/poc-thumb/`).
   - 확인: design.md 'PoC 의존'의 통과 기준 5종 결과와 시간·메모리를 기록한다. 결과는 날짜와 함께 `docs/PRODUCT.md` §6에 옮길 메모로 남긴다(실제 옮기는 것은 마지막 승격 작업). 실패하면 사용자에게 Q1의 대안을 확인받고 멈춘다.

## 순수 함수

1. `buildCanvasTree`, `canvasLabel`, `frameLabel`, `typeaheadNext`.
   - 확인: `npm --prefix app test` — 중첩 폴더, 제목 없음·공백 제목, `foo`/`foo-bar`, `step-2`/`step-10` 정렬, 타입어헤드 순환이 녹색.
2. `searchIndex`, `searchMatch`.
   - 확인: `npm --prefix app test` — 토큰 AND, 점수 순서, 현재 루트 → 같은 저장소 → 다른 저장소 순서, 50개 상한이 녹색.
3. `currentFrame`, `parseUiState`, `restorePlan`, `thumbnailKey`, `thumbnailStale`, `thumbnailQueue`.
   - 확인: `npm --prefix app test` — 깨진 `ui-state.json`은 홈, 사라진 캔버스는 개요, 사라진 루트는 홈, 배율 자르기, mtime·크기·버전이 바뀌면 stale이 녹색.

— 커밋 경계 A: `feat(app): pure helpers for design tree, quick open and restore`

## main (I/O)

4. `CanvasRow.frames`(정적), `uiState.ts`(읽기·임시 파일 쓰기·디바운스), IPC `ui-state:get`/`ui-state:save`, 메뉴 Quick Open…(⌘K).
   - 확인: `npm --prefix app test` + `npm --prefix app run typecheck`.
5. `thumbnails.ts`: 숨김 창, 세션 정책, 탐색 게이트, 캔버스마다 새 iframe, 8초 제한, 캐시와 무효화, IPC `thumbnails:get`·`thumbnails:changed`.
   - 확인: `npm --prefix app test`(큐·캐시 단위) + e2e 단계에서 썸네일 파일 생성과 캔버스 수정 후 갱신 확인. 숨김 창이 앱 IPC 발신자로 거부되는 테스트 녹색.

— 커밋 경계 B: `feat(app): static frames, ui state persistence and canvas thumbnails in main`

## UI

6. 작업공간 사이드바 트리(폴더 노드, 제목 우선, 프레임 중첩, 0이 아닐 때만 코멘트 배지, 타입어헤드). 별도 Frames 섹션을 없앤다.
   - 확인: `npm --prefix app test`(Sidebar) + `npm --prefix app run e2e` 기존 단계를 새 트리 역할·이름으로 바꾼 뒤 PASS.
7. `CanvasController.jump`를 선택 없는 이동 + 강조로 바꾸고 현재 프레임을 추적한다. 프레임 행의 Select 동작(버튼·더블클릭)은 기존 `pick-frame` 선택 경로를 쓴다.
   - 확인: `npm --prefix app test`(CanvasController) — jump 뒤 `selection:set` 호출 없음, Select 뒤에는 있음. e2e — 초안이 있을 때 프레임 이동은 초안 대화상자를 띄우지 않고 초안이 유지됨, Select는 초안 대화상자를 띄움, `doan active` 결과가 jump 전후로 같고 Select 뒤에는 그 프레임.
8. `ProjectOverview`(개요 페이지, 썸네일 자리표시자 → 이미지), 폴더 노드 클릭 → 섹션 스크롤.
   - 확인: e2e — 캔버스를 닫은 작업공간에 카드가 폴더별로 보이고, 카드 클릭으로 캔버스가 열림.
9. `QuickOpen`(⌘K, 홈·작업공간), 다른 작업공간으로 전환 후 캔버스·프레임 이동, 렌더링 목록에 없는 프레임 안내.
   - 확인: e2e — 메뉴 Quick Open…으로 열어(Playwright 키는 네이티브 가속키에 닿지 않음 — PRODUCT §6 PoC 1 항목 4) "card decl" 입력 → 다른 워크트리 결과 선택 → 해당 작업공간과 프레임이 보임.
10. 재실행 복원 적용(첫 `layout` 뒤 보기 적용).
    - 확인: e2e — 캔버스를 열고 줌·이동한 뒤 앱을 닫았다 다시 켜면 같은 캔버스와 보기가 보이고 선택은 없음. `ui-state.json`을 깨뜨리면 홈에서 시작.
11. `/design-sync`: `design/design-nav.html`과 구현을 비교하고 `docs/DESIGN.md`에 기록한다.
    - 확인: 비교 표에 남은 불일치가 없거나 문서화되어 있음. 이어서 `npm --prefix app run e2e`가 최종 `runtime-test: PASS`와 exit 0.

— 커밋 경계 C: `feat(app): design tree, overview, quick open and restore`

## 마무리

12. `/runtime-test`, `/code-review`, `/refactor`. typecheck·test·e2e 통과.
13. 승격: `docs/PRODUCT.md`(§5 앱 항목 1·3, §6에 썸네일 PoC 결과, 기능 분할 표, §7에 결정 7~10과 대체된 결정)와 `docs/ARCHITECTURE.md`(§3 프레임 이동·썸네일 창, §7 `ui-state.json`·메뉴, §11 기기 로컬 파일 목록)에 영어로 옮기고 `docs/features/design-nav/`를 지운다.
    - 확인: `grep -n 'design-nav' docs/PRODUCT.md docs/ARCHITECTURE.md`에 날짜가 붙은 항목이 있고, 폴더가 없음.

— 커밋 경계 D: `docs: promote design-nav decisions`
