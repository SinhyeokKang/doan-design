# design-nav — 설계

## 디자인 레퍼런스

- Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본 레퍼런스로 삼는다. 2026-10-22 테마 결정의 출처다.
- 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스(Claude Design, Orca, ego-browser, Storybook 등)도 직접 확인한다(사용자 허용 2026-10-25).
- 사이드바 트리, 개요(카드 격자) 페이지, 빠른 열기의 초안을 그릴 때 해당 화면을 확인하고, 가져온 것을 초안에 출처와 함께 적는다. 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | 작업공간 `Sidebar`를 폴더 트리로 바꾼다. Overview 행을 두고, 캔버스 행 아래에 프레임을 매달며, 별도 Frames 섹션은 없앤다. 새 컴포넌트는 `ProjectOverview`(개요 페이지)와 `QuickOpen`(⌘K)이다. `CanvasController.jump`는 선택하지 않는 이동이 된다. `pick-frame` 대신 화면 이동과 강조를 하고, 현재 프레임을 추적한다. `projects-home`의 루트별 메모리를 `ui-state.json`과 연결한다. |
| 앱 main | `view.ts`의 `CanvasRow`에 `doan ls`의 정적 `frames`(id, title — 1,000개 상한)를 담는다. 새 모듈은 `thumbnails.ts`(숨김 창·캐시)와 `uiState.ts`(`ui-state.json`)다. Go 메뉴에 Quick Open…(⌘K)을 더한다. IPC: `thumbnails:get`, `thumbnails:changed` 이벤트, `ui-state:get`, `ui-state:save`. 렌더러 CSP에 `img-src 'self' blob:`를 더한다. |
| 주입 스크립트(`canvasScript.ts`) | 바꾸지 않는다. 현재 프레임과 강조는 이미 받는 `layout.frames`(문서 좌표)와 보기 변환으로 계산한다. |
| CLI·MCP·스킬·공유 형식 | 바뀌지 않는다. |

## 사이드바 트리

- **입력**: 현재 루트의 `CanvasRow[]`(`doan ls` 순서)다. `design/` 아래 경로를 `/`로 나눠 폴더 노드를 만든다.
- **순서**: 같은 부모 아래에서는 폴더가 먼저, 캔버스가 나중이다. 각각 표시 이름을 `Intl.Collator("en", {numeric: true, sensitivity: "base"})`로 정렬한다.
  - 이 정렬은 renderer 표시에서만 한다. CLI 순서는 바꾸지 않는다.
  - 정렬 키는 표시 이름이다(POSTMORTEM 2026-10-21 "Sorting file names…").
- **표시 이름**: `<title>`의 앞뒤 공백을 정리해 쓴다. 비어 있으면 파일 이름에서 `.html`을 뗀다.
- **프레임 행**: 표시는 `<번호> <제목 또는 id>`다.
  - 열린 캔버스는 렌더링된 `layout.frames`를 쓴다(canvas-view Q2 유지).
  - 닫힌 캔버스는 `doan ls`의 정적 `frames`를 쓴다. 정적 목록에는 상한이 없으므로 main이 1,000개에서 자르고 `truncated`를 표시한다.
  - 빈 id와 중복 id는 트리 키로 쓰지 않는다. 키는 문서 순서 index다.
- **펼침 상태**: 캔버스 행은 기본으로 접혀 있고, 열린 캔버스는 자동으로 펼친다. 폴더와 캔버스의 펼침 상태는 루트별로 기억하고 `ui-state.json`에 저장한다.
- **키보드**: 지금 트리 규칙을 유지한다(↑↓ 포커스, ←→ 접기·펼치기, Home/End). 행 종류별 동작은 아래와 같다.

  | 행 | 클릭 / Enter | Space / 기본 동작(더블클릭) |
  |---|---|---|
  | Overview | 개요로 감 | 같음 |
  | 폴더 | 펼침·접기 | 같음 |
  | 캔버스 | 캔버스 열기(이미 열려 있으면 아무것도 하지 않음) | 같음 |
  | 프레임(열린 캔버스) | 이동(선택 없음) | Select(선택, 가드) |
  | 프레임(닫힌 캔버스) | 열고 이동 | 비활성 |

- **행 액션 자리**: 행에 마우스를 올리거나 포커스가 있으면 오른쪽에 나타난다. 지금은 프레임 행의 Select 하나다. 다음 감사 차례가 같은 자리에 코멘트 동작을 넣을 수 있도록 컴포넌트를 "액션 목록"으로 받게 만든다.
- **타입어헤드**: 친 글자를 500ms 동안 이어 붙인 버퍼로 맞춘다. 현재 행 다음의 보이는 행 중 접두가 맞는 첫 행에 포커스를 준다. 프레임 행은 번호를 뺀 이름으로 맞춘다(WAI-ARIA APG Tree View).
- **현재 위치와 선택 표시**
  - 보고 있는 프레임에는 `aria-current="location"`과 시각 표시를 준다.
  - 선택된 프레임(또는 선택된 요소를 감싼 프레임)에는 별도 표시를 주고, 접근 이름에 "selected in canvas"를 더한다. `aria-selected`는 트리 포커스 의미와 겹쳐서 쓰지 않는다.
  - 자동 스크롤은 트리에 포커스와 마우스가 없을 때만 한다.

## 개요 페이지

- **보이는 조건**: 작업공간에서 캔버스가 열려 있지 않고 캔버스가 1개 이상일 때 중앙에 보인다. 오른쪽 패널은 지금의 "No canvas open" 상태 그대로다.
- **카드**: 폴더별 섹션에 캔버스 카드 격자를 둔다. 카드 내용은 다음과 같다.
  - 썸네일
  - 표시 이름, 파일 이름
  - 프레임 수(정적)
  - 최근 변경(`projects-home`의 `CanvasRow.mtimeMs`)
  - 열린 코멘트(0보다 클 때)
  - 파싱할 수 없는 캔버스(`id`가 없음)의 카드는 "Can't read this canvas — run doan check"를 보인다.
- **카드 조작**: 누르면 캔버스를 연다. 카드는 Tab으로 이동하고 Enter로 연다.
- **캔버스가 0개일 때**: 중앙에 "No canvases in design/ yet"와 기존 Copy first prompt 버튼을 둔다. `app-setup`의 `FirstPrompt`가 이 자리를 대신한다. 둘 중 나중에 main에 들어가는 기능이 통합 작업을 맡는다.
- **열린 캔버스가 목록에서 사라질 때**: 개요로 돌아가 토스트를 띄운다. 지금 결정 "a canvas gone from the list clears the view"를 바꾸는 것이다.

## 썸네일

### 방식 (Q1, PoC 0 통과가 전제)

- main이 `BrowserWindow({show: false})` 하나를 필요할 때 만든다. 개요가 처음 썸네일을 요청할 때이므로 메인 창보다 늦다.
  - preload는 없고, `sandbox: true`, `contextIsolation: true`다.
  - 같은 세션을 쓰므로 권한 거부와 다운로드 취소가 그대로 걸린다. 새 창과 `<webview>` 열기, 창 자체의 탐색은 막는다.
  - 대안 `webPreferences.offscreen: true`는 PoC에서 비교하고 결과로 고른다.
- 호스트 페이지는 `loadURL("data:text/html,…")`이다. 그 안에 CSP meta(`default-src 'none'; frame-src http://127.0.0.1:*; style-src 'unsafe-inline'`)와 iframe 하나만 둔다. 빌드 진입점은 더하지 않는다.
- 캔버스마다 새 `sandbox="allow-scripts"` iframe을 만든다. 크기는 폭 = `doan:width`, 높이 = 폭 × 10 / 16(첫 화면 16:10)이다.
  - 주입 스크립트는 넣지 않고 높이도 재지 않는다.
  - iframe `load` 뒤 500ms 지연, 또는 8초 제한 중 먼저 오는 쪽에서 `webContents.capturePage`로 iframe 영역을 찍는다. 결과를 가로 480px PNG로 줄인다.
  - `doan:width`가 없거나 파싱할 수 없는 캔버스는 찍지 않는다.
- 숨김 창의 iframe 탐색도 `will-frame-navigate` 게이트를 똑같이 적용한다(같은 폴더 키 안에서만).
- 이 창은 앱의 창 수명 규칙에 들어가지 않는다.
  - `activate`, Close Window, Settings 창 허용 목록, `window-all-closed` 판단에서 뺀다.
  - 앱 창이 숨겨지면 큐를 멈추고, 앱이 끝날 때 함께 닫는다.
- 앱 창 IPC는 이 창을 발신자로 받지 않는다. preload가 없으므로 이 창은 IPC를 보낼 수도 없다. `app-setup`이 발신자 검사를 허용 목록으로 바꿀 때도 이 창은 목록에 없다.

### 전달과 캐시

- `thumbnails:get {root, path}`(저장 목록의 루트, 목록에 있는 캔버스)는 PNG 바이트를 돌려준다. renderer가 `URL.createObjectURL(new Blob(…))`로 보여준다. CSP에 `img-src 'self' blob:`를 더한다(ARCHITECTURE §7 CSP 결정 갱신).
- 캐시 파일: `<userData>/thumbnails/<sha256(root + "\n" + path)>.png`와 같은 이름의 `.json` 메타(`mtimeMs`, `size`, 앱 버전).
- 무효화는 폴더 단위다. 그 폴더의 served 변경(`servedRev`가 오름)이 오면, 메타의 mtime·size가 현재 파일과 다른 썸네일을 다시 만든다. token CSS처럼 캔버스 파일이 아닌 served 파일이 바뀌면 그 폴더의 모든 썸네일이 stale이다.
- 정리: 프로젝트를 제거하거나 앱을 시작할 때, 저장 목록과 캔버스 목록에 없는 캐시 파일을 지운다.
- 큐: 하나씩 처리한다. 개요에 보이는 카드(IntersectionObserver)를 먼저 처리하고, 실패하면 "Preview unavailable"을 보인다.

## 빠른 열기 (⌘K)

- **색인**: 저장된 모든 루트의 `list` 항목에서 캔버스(표시 이름, 파일 이름, 경로, id)와 정적 프레임(제목, id, 1,000개 상한)을 모은다.
  - 열린 캔버스는 렌더링 프레임으로 대신한다.
  - `loading`과 문제 상태 항목은 뺀다.
  - 폴더 목록이 갱신되면 다시 만든다.
- **매칭**(순수 함수)
  - 소문자로 바꾸고 공백으로 나눈 토큰이 모두 들어 있어야 한다.
  - 점수는 접두 일치 > 단어 시작 일치 > 부분 일치 순이다.
  - 같은 점수면 현재 루트 → 같은 저장소(`git.common`)의 다른 워크트리 → 다른 저장소 순이다.
  - 최대 50개를 보인다.
- **빈 쿼리**: 작업공간에서는 현재 프로젝트의 캔버스를, 홈에서는 모든 캔버스를 저장 순서대로 보인다.
- **결과 행**: `# Card declined — Billing & plans › 4 · acme-web · main`. 결과가 없으면 "No canvases or frames match".
- **고르기**
  1. 대상 루트가 로드된 작업공간이 아니면 그 작업공간으로 간다(초안 가드).
  2. 대상 캔버스가 이미 열려 있으면 jump만 한다(선택 유지). 아니면 캔버스를 연다(가드, 선택 해제).
  3. 프레임이면 첫 `layout` 뒤 문서 순서의 첫 일치 id로 이동한다. 없으면 맨 위를 보이고 토스트를 띄운다.
- **열기와 닫기**: 모달 대화상자다. Esc로 닫으면 연 요소로 포커스가 돌아간다. 다른 모달이 열려 있으면 메뉴 항목이 비활성이다(`projects-home`의 메뉴 활성 표에 행 추가).

## 프레임 이동과 현재 프레임

- `jump`는 `pick-frame`을 보내지 않는다. 지금처럼 `measure` 후 다음 `layout`의 프레임 사각형으로 화면을 옮긴다(32px 여백, 배율 상한 1).
- 오버레이에 프레임 테두리 강조를 1.2초 그린다. `prefers-reduced-motion`이면 사라지는 애니메이션 없이 1.2초 동안 정적으로 표시한다.
- 선택, 오른쪽 패널, `selection:set`은 그대로이고, 코멘트 초안 가드도 거치지 않는다.
- Select는 지금의 `pick-frame` 경로(선택, 초안 가드 transition, `selection:set`)를 그대로 쓴다.
- 현재 프레임(순수 함수 `currentFrame`)은 아래 순서로 정한다. 보기 변환이나 `layout`이 바뀔 때마다 다시 계산한다.
  1. 화면 중심 점을 포함한 프레임(여럿이면 문서 순서상 마지막 — 가장 안쪽)
  2. 없으면 화면 중심에서 프레임 사각형까지 거리가 가장 짧은 프레임
  3. 프레임이 없으면 null

## 재실행 복원

- **파일**: `<userData>/ui-state.json`. 기기 로컬이고 스키마가 없다(ARCHITECTURE §11). 모양은 아래와 같다.

  ```
  {
    screen: "home" | "workspace",
    root?,
    canvas?,
    view?: {scale, x, y},
    expanded: {[root]: string[]},
    lastByRoot: {[root]: {canvas, view}}
  }
  ```

  - `lastByRoot`는 `projects-home`의 루트별 메모리를 저장한 것이다.
- **쓰기**: `ui-state:save`는 renderer가 보낸 값을 main이 `parseUiState`로 검증한 뒤 쓴다. 저장 목록에 없는 루트는 버리고, 64 KiB를 넘으면 거부한다. 임시 파일 + rename으로 쓰고, 500ms 디바운스해 마지막 값만 쓴다.
- **읽기 실패**: 홈에서 시작하고, 다음 쓰기가 덮어쓴다(`folders.json`과 같은 정책).
- **시작할 때(`restorePlan`)**
  - `screen`이 home이면 홈이다. 이때 숨겨진 작업공간은 로드하지 않는다.
  - `root`가 저장 목록에 있으면 그 항목이 `loading`을 벗어날 때까지 기다린다. 10초가 지나면 홈으로 간다.
    - `list`면 그 작업공간을 연다.
    - 문제 상태면 그 작업공간을 상태 줄과 함께 연다(`projects-home` 규칙).
  - `canvas`가 목록에 있으면 열고, 첫 `layout` 뒤 `view`를 적용한다(배율은 0.05–4로 자른다). 없으면 개요를 열고 토스트를 띄운다.
  - 선택은 저장하지도 복원하지도 않는다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `buildCanvasTree(rows) → TreeNode[]`: 폴더 분리, 정렬, 표시 이름, 중첩 경로
- `canvasLabel(row)`, `frameLabel(frame, index)`, `typeaheadKey(node)`
- `typeaheadNext(visibleKeys, currentIndex, buffer) → index | null`
- `rowAction(node, openCanvas) → {primary, secondary}`: 위 행 동작 표
- `capFrames(frames) → {frames, truncated}`
- `searchIndex(entries, rendered?)`, `searchMatch(index, query, currentRoot, commonOf) → Result[]`
- `pickTarget(result, loadedRoot, openCanvas) → switch | open | jump`
- `currentFrame(frames, view, viewport) → index | null`
- `parseUiState(text) → UiState | null`, `restorePlan(uiState, entries) → plan`
- `thumbnailKey(root, path)`, `thumbnailStale(meta, stat, appVersion)`, `thumbnailGarbage(cacheNames, liveKeys)`
- `thumbnailQueue` 리듀서: 우선순위, 하나씩, 실패, 일시정지

## 형식 변경

- 공유 형식은 바뀌지 않는다.
- `CanvasRow`(IPC 타입)에 `frames: {id, title?}[]`와 `framesTruncated?`를 더한다. `frames`는 `doan ls` 출력에 이미 있는 필드다.
- 새 기기 로컬 파일 `ui-state.json`과 `thumbnails/` 캐시가 생긴다. 스키마는 없다.

## 컨벤션 영향

없다. 프레임 번호는 문서 순서에서 앱이 매긴다.

## 결정 영향

- **대체되는 결정**
  - 2026-10-22 canvas-view 기본값 "view kept in memory only" → 재실행 복원
  - 2026-10-22 display names "a canvas is its path relative to `design/`" → 제목 우선(작업공간 상단 바의 캔버스 이름 포함)
  - canvas-view Q5의 별도 Frames 목록 → 캔버스 아래 중첩
  - select-inspect "Frames current state follows selection"(2026-10-23 Q2/R3 승격)과 ARCHITECTURE §3 'Selection lifetime'의 "Frames current state means the selected frame…" → 현재 표시는 보고 있는 프레임을 따르고, 선택된 프레임은 별도로 표시한다
  - 프레임 점프의 `pick-frame`(선택) → 선택 없는 이동(Select는 남음)
  - 2026-10-22 "Opening a canvas from the sidebar clears the selection even if it is already open" → 이미 열린 캔버스를 다시 고르면 아무것도 하지 않거나 jump만 한다
  - 2026-10-22 "a canvas gone from the list … clears the view" → 개요로 돌아가 알린다
  - ARCHITECTURE §7 CSP `default-src 'self'` → 렌더러에 `img-src 'self' blob:` 추가(썸네일)
- **보안 경계**: 썸네일 숨김 창은 렌더링 결정을 그대로 따른다(로컬 서버, 토큰 경로, sandbox iframe, 권한 거부, 탐색 게이트, 폴더 키 비밀). 주입 스크립트와 preload 없이 화면만 찍는다.
- **PRODUCT §5 Deferred 'Screenshots'**: 이 썸네일은 사람의 탐색용 미리보기다. 에이전트용 스크린샷이나 ref 비교가 아니며, CLI·MCP로 노출하지 않는다.

## POSTMORTEM에서 가져올 함정

- **2026-10-21 "Sorting file names does not sort the ids derived from them"**: 표시 이름이라는 논리 키로 정렬한다. `foo`/`foo-bar`, `step-2`/`step-10`을 테스트에 넣는다.
- **2026-10-22 "A canvas link to a document without the canvas script left a dead board"**: 썸네일 창에서 스크립트가 없거나 CSP에 막히거나 `load`가 끝나지 않는 문서도 8초 제한으로 끝나야 한다.
- **2026-10-22 "The fresh-iframe rule survived its mutation…"**: 썸네일 창도 캔버스마다 새 iframe을 만든다. 변이(mutation)로 확인한다.
- **2026-10-23 "A preceding canvas tooltip was cached as a project path"**: 트리 툴팁을 e2e에서 읽을 때 `hoverTooltip`을 쓴다.
- **2026-10-23 "Draft guards changed existing transition timing"**: jump는 가드를 거치지 않고, Select와 다른 캔버스 열기는 거친다. 둘 다 e2e로 확인한다.

## PoC 의존

- **썸네일 숨김 창 캡처(새 PoC, tasks 0)**
- 통과 기준: 아래 캔버스마다 첫 화면 영역이 빈 곳 없이 찍힌다.
  - 정상, 100vh, 스크립트를 CSP로 막은 캔버스
  - 외부 폰트(온라인·오프라인)
  - 높이 20,000px
  - `doan:width` 2400·3840(화면보다 넓음)
  - `load`가 끝나지 않는 캔버스(8초 제한으로 끝남)
- 함께 기록할 것
  - `show: false`와 `offscreen: true`의 비교
  - 캔버스당 시간 중앙값
  - 캔버스 50개를 연속으로 찍을 때의 메모리 증가량
  - 감사에서 본 "아래쪽이 그려지지 않는 현상"의 재현 여부
- 결과는 날짜와 함께 PRODUCT §6에 바로 기록한다. 실패하면 사용자 확인 후 "열어 본 캔버스만 앱 창에서 캡처"로 간다.

## 확인 질문 답

- **Q1**(2026-10-24 사용자): 썸네일은 숨김 창 렌더링으로 만들고, PoC를 먼저 한다(추천안).
- **Q2**(2026-10-24 사용자): 트리의 프레임 행에 Select 동작을 둔다. 추천안(코멘트 루프 차례로 미룸) 대신 이 안을 골랐다.
- **리뷰 일괄 승인**(2026-10-25): 행 동작 표, 같은 캔버스 jump, 선택 표시, Overview 행, 썸네일 전달·호스트·높이·무효화·정리, `currentFrame` 규칙, 복원 검증·대기, 상태 문구를 반영했다.
