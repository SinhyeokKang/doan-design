# design-nav — 작업 순서

## 선행 조건과 앞선 단계

- 선행 조건: `projects-home`이 main에 병합되어 있다(작업공간, 공통 토스트, Go 메뉴, 메뉴 활성 표, `CanvasRow.mtimeMs`, 루트별 메모리).
- 앞선 단계: `/feature-review`(완료 2026-10-25) → `/design-draft` → 사용자가 앱에서 초안 확인 → 아래 작업.
- `/design-draft`가 `design/design-nav.html`에 그릴 것
  - Overview 행이 있는 작업공간 트리(폴더·캔버스·프레임 행, 행 액션 자리, 현재·선택 표시)
  - 개요 페이지(썸네일 3상태, 파싱 실패 카드, 0개 상태)
  - ⌘K(빈 쿼리, 결과, 결과 없음)
  - 프레임 강조, 토스트 문구
- 초안은 Codex와 Claude가 같은 요청으로 각자 그린다.
  - Codex 워커는 공정성을 위해 `gpt-6-astra` reasoning high로 띄운다.
  - 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분이 있으면 고른 초안에 붙인다. 고른 근거와 가져온 부분을 초안 노트에 적는다.
  - 사용자 요구(2026-10-25)이며, 이 단계에 한해 모델 경계를 넘어도 된다.
- 레퍼런스: Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본으로 본다. 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스도 직접 확인한다. 참고한 화면과 파일을 초안 노트에 출처로 적는다.

## PoC

0. 썸네일 숨김 창 캡처 PoC(`.scratch/design-nav/poc-thumb/`). design.md 'PoC 의존'의 기준을 따른다.
   - 확인: 결과를 날짜와 함께 `docs/PRODUCT.md` §6에 바로 기록하고 커밋한다(`docs(product): thumbnail capture PoC`). 기록할 것은 아래와 같다.
     - 기준별 통과·실패
     - `show:false`와 `offscreen` 비교
     - 시간 중앙값, 메모리
     - 아래쪽 미렌더 현상의 재현 여부
   - 실패하면 사용자에게 Q1의 대안을 확인받고 멈춘다.

## 순수 함수

1. `buildCanvasTree`, `canvasLabel`, `frameLabel`, `typeaheadKey`, `typeaheadNext`, `rowAction`, `capFrames`
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우:
     - 중첩 폴더, 제목 없음·공백 제목
     - 정렬: `foo`/`foo-bar`, `step-2`/`step-10`
     - 타입어헤드: 순환, 번호 제외
     - 행 동작 표 5종
     - 빈·중복 프레임 id(index 키), 200자 초과 id·title
     - 1,000개 상한과 `truncated`
2. `searchIndex`, `searchMatch`, `pickTarget`
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우:
     - 토큰 AND, 점수 순서
     - 결과 순서: 현재 루트 → 같은 `common` → 다른 저장소
     - 50개 상한, 빈 쿼리(홈·작업공간)
     - loading·문제 상태 제외
     - 같은 캔버스 jump / 다른 캔버스 open / 다른 루트 switch
     - 규모: 캔버스 1,000개 × 프레임 50개 색인에서 검색 한 번이 50ms 이하(vitest 안에서 측정)
3. `currentFrame`, `parseUiState`, `restorePlan`, `thumbnailKey`, `thumbnailStale`, `thumbnailGarbage`, `thumbnailQueue`
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우:
     - 현재 프레임: 중심 포함(중첩이면 안쪽) → 최소 거리 → null
     - `ui-state.json`: 깨짐 → 홈, 64 KiB 초과 거부, 저장 목록에 없는 루트 버림
     - 복원: home 화면 복원, loading 대기 10초 → 홈, 사라진 캔버스 → 개요, 사라진 루트 → 홈, 배율 자르기
     - 썸네일: mtime·크기·버전 변경 → stale, 고아 캐시 목록
     - 큐: 우선순위, 일시정지

— 커밋 경계 A: `feat(app): pure helpers for design tree, quick open and restore`

## main (I/O)

4. 정적 frames 전달과 상한, `uiState.ts`, IPC `ui-state:get`/`ui-state:save`, Go 메뉴 Quick Open…(⌘K)과 메뉴 활성 표의 행 추가, `app/e2e/real-state.ts` 확장
   - `uiState.ts`: main 검증, 임시 파일 + rename, 디바운스
   - real-state 확장: 실제 userData의 `ui-state.json`과 `thumbnails/` 비교
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우:
     - 임시 파일 + rename
     - 디바운스로 마지막 값만 씀
     - 읽기 실패 → null
     - 검증 거부
     - 메뉴 항목 이름·가속키 고정
   - 확인: `npm --prefix app run typecheck` 통과. e2e 출력에 두 경로의 real-state가 unchanged로 나온다.
5. `thumbnails.ts`: 숨김 창, `data:` 호스트, 세션 정책, 탐색 게이트, 캔버스마다 새 iframe, 8초 제한, 캐시·무효화·정리, IPC `thumbnails:get`·`thumbnails:changed`, CSP `img-src 'self' blob:`
   - 기존 e2e 손보기: 창을 열거할 때 메인 창 참조로 고른다. `onboarding.ts`의 `getAllWindows().length === 1`과 `[0]`, `comments-ui.ts`의 `[0]`을 공통 헬퍼로 바꾼다.
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우:
     - 큐·캐시·정리
     - 숨김 창이 `activate`·Close Window·`window-all-closed`에 영향이 없음
     - 숨김 창이 IPC 발신자로 거부됨
     - 앱 창이 숨겨지면 큐가 멈추고 다시 보이면 재개함
     - 8초 제한 → 실패 표시
     - token CSS 변경 → 폴더 전체 stale
   - 확인: e2e에서 `app.evaluate`로 `thumbnails:get`이 만든 캐시 파일과, 캔버스를 고친 뒤 새로 만든 파일을 확인한다.

— 커밋 경계 B: `feat(app): static frames, ui state persistence and canvas thumbnails in main`

## UI

6. 작업공간 사이드바 트리
   - 포함: Overview 행, 폴더 노드, 제목 우선, 프레임 중첩, 행 동작 표, 행 액션 자리, 현재·선택 표시, 0보다 클 때만 코멘트 배지, 타입어헤드, 자동 스크롤 조건
   - 별도 Frames 섹션을 없앤다. 작업공간 상단 바의 캔버스 이름을 제목으로 바꾼다.
   - 확인: `npm --prefix app test`(Sidebar). `npm --prefix app run e2e`는 기존 단계를 새 트리 역할·이름으로 바꾼 뒤 runtime.ts 전체의 최종 `runtime-test: PASS`, exit 0이어야 한다.
7. `CanvasController.jump` 바꾸기: 선택 없는 이동 + 강조(reduced-motion 포함), 현재 프레임 추적. Select(Space·기본 동작·액션 버튼)는 기존 `pick-frame` 경로를 쓴다.
   - 확인: `npm --prefix app test`(CanvasController) — jump 뒤에는 `selection:set` 호출이 없고, Select 뒤에는 있다.
   - 확인: e2e에서 다음을 본다.
     - 초안이 있을 때 프레임 이동은 대화상자 없이 초안을 유지한다. Select와 다른 캔버스 열기는 가드를 띄운다.
     - `doan active` 결과는 jump 전후로 같고, Select 뒤에는 그 프레임이다.
     - 같은 캔버스를 다시 고르면 선택이 유지된다.
8. `ProjectOverview`: 썸네일 3상태, 파싱 실패 카드, 0개 상태, 열린 캔버스 삭제 → 개요 + 토스트, 카드가 사라지면 포커스 이동
   - 확인: e2e에서 다음을 본다.
     - 캔버스를 닫은 작업공간에 카드가 폴더별로 보이고, 카드 클릭으로 열린다.
     - 0개 작업공간에는 빈 상태와 Copy first prompt가 있다.
     - `doan:width`가 없는 카드에는 안내 문구가 있다.
     - 열린 캔버스 파일을 지우면 개요와 토스트가 나온다.
     - 보이는 카드가 먼저 처리된다(첫 썸네일의 대상이 보이는 카드).
9. `QuickOpen`: 홈·작업공간, 빈 쿼리, 결과 없음, 다른 작업공간 전환, 렌더링되지 않은 프레임 안내, 포커스 복귀, 모달 중 비활성
   - 확인: e2e에서 메뉴 Quick Open…으로 연다(Playwright 키는 네이티브 가속키에 닿지 않음 — PRODUCT §6 PoC 1 항목 4). 확인할 것:
     - "card decl" → 다른 워크트리 결과 → 가드 → 해당 작업공간과 프레임
     - 홈에서 열기
     - 1,000개 밖의 정적 프레임 → 안내 토스트
     - 중복 id → 첫 번째
     - Esc → 포커스 복귀
10. 재실행 복원 적용(첫 `layout` 뒤 보기 적용, 루트별 메모리 저장)
    - 확인: e2e에서 앱을 실제로 닫았다 다시 켜서 다음을 본다.
      - 캔버스를 열고 줌·이동한 뒤 다시 켜면 같은 캔버스와 보기가 나오고, 선택은 없다.
      - 홈에서 끄면 홈으로 다시 켜진다.
      - 캔버스 파일을 지운 뒤 다시 켜면 개요와 토스트가 나온다.
      - 프로젝트 폴더를 지운 뒤 다시 켜면 홈이 나온다.
      - `ui-state.json`을 깨뜨리면 홈에서 시작한다.
11. `/design-sync`: `design/design-nav.html`과 구현을 비교하고 `docs/DESIGN.md`에 기록한다.
    - 확인: 비교 표에 남은 불일치가 없거나 문서화되어 있다. 이어서 `npm --prefix app run e2e`의 최종 `runtime-test: PASS`, exit 0.
12. (`app-setup`이 먼저 main에 들어가 있으면) 통합: 0개 작업공간의 빈 상태를 `FirstPrompt`로 바꾸고, 창 선택 e2e 헬퍼를 Settings 창과 함께 정리한다.
    - 확인: e2e PASS, exit 0.

— 커밋 경계 C: `feat(app): design tree, overview, quick open and restore`

## 마무리

13. `/runtime-test`, `/code-review`, `/refactor`(회귀를 고쳤으면 `/postmortem`). typecheck·test·e2e 통과.
14. 승격: 영어로 옮기고 `docs/features/design-nav/`를 지운다.
    - `docs/PRODUCT.md`: §5 앱 항목 1·3, 기능 분할 표, §7 결정 로그(결정 7~10, Q1·Q2, 리뷰 일괄 승인, Codex·Claude 초안 비교 방식, design.md '결정 영향'의 대체 목록)
    - `docs/ARCHITECTURE.md`: §3 프레임 이동·선택 표시·썸네일 창(Selection lifetime 문장 교체 포함), §7 CSP·`ui-state.json`·메뉴, §11 기기 로컬 파일 목록
    - 새 모듈(`thumbnails.ts`, `uiState.ts`)에 맞춰 `docs/DIRECTORY.md` 갱신이 필요한지 확인한다.
    - 확인: `grep -nE '^\| 2026-.*(design-nav|Quick Open|thumbnail)' docs/PRODUCT.md`에 결정 행이 있다. `grep -n 'ui-state.json' docs/ARCHITECTURE.md`가 걸린다. 폴더가 없다.

— 커밋 경계 D: `docs: promote design-nav decisions`
