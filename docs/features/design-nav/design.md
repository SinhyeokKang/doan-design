# design-nav — 설계

## 디자인 레퍼런스

Sorcerer(github.com/gbrasil720/sorcerer, MIT)는 2026-10-22 테마 결정의 레퍼런스다. 사이드바 트리, 개요(카드 격자) 페이지, 빠른 열기의 초안을 그릴 때 이 저장소의 목록·내비게이션 화면을 직접 확인해 참고하고, 가져온 것을 초안에 출처와 함께 적는다. 이 문서를 쓰는 시점에는 아직 확인하지 않았다.

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| 앱 renderer | 작업공간 `Sidebar`를 폴더 트리로 바꾼다(캔버스 행 아래에 프레임을 매닮). 기존 별도 Frames 섹션은 없앤다. 새 컴포넌트: `ProjectOverview`(개요 페이지), `QuickOpen`(⌘K). `CanvasController.jump`는 선택하지 않는 이동으로 바뀌고(`pick-frame` 대신 화면 이동 + 강조), 현재 프레임 추적을 더한다. 복원 상태를 저장·적용한다. |
| 앱 main | `view.ts`의 `CanvasRow`에 `doan ls`의 정적 `frames`(id, title)를 담는다. 새 모듈 `thumbnails.ts`(숨김 렌더링·캐시)와 `uiState.ts`(`ui-state.json` 읽기·쓰기). 메뉴에 Quick Open…(⌘K)을 추가한다. IPC: `thumbnails:get`, `thumbnails:changed` 이벤트, `ui-state:get`, `ui-state:save`. |
| 주입 스크립트(`canvasScript.ts`) | 바뀌지 않는 것이 목표다. 현재 프레임 추적과 강조는 이미 받는 `layout.frames`(문서 좌표)와 렌더러의 보기 변환으로 계산한다. |
| CLI·MCP·스킬·공유 형식 | 바뀌지 않는다. |

## 사이드바 트리

- 입력은 현재 루트의 `CanvasRow[]`(`doan ls` 순서)다. `design/` 아래 경로를 `/`로 나눠 폴더 노드를 만든다.
- 같은 부모 아래 순서: 폴더가 먼저, 다음이 캔버스다. 각각 표시 이름을 `Intl.Collator("en", {numeric: true, sensitivity: "base"})`로 정렬한다. CLI 순서는 바꾸지 않고 renderer 표시에서만 정렬한다. 정렬 키는 표시 이름이고, 파일 이름에서 파생한 id로 정렬하지 않는다(POSTMORTEM 2026-10-21 "Sorting file names…").
- 캔버스 표시 이름은 `<title>`(앞뒤 공백 정리)이고, 없거나 비면 파일 이름에서 `.html`을 뗀 것이다. 보조 표시는 파일 이름이고, 툴팁은 `design/` 기준 경로다.
- 프레임 행: `<번호> <제목 또는 id>`.
  - 열린 캔버스는 렌더링된 `layout.frames`를 쓴다(canvas-view Q2 유지). 1,000개 상한과 "1,000+" 표시도 그대로다.
  - 닫힌 캔버스는 `doan ls`의 정적 `frames`를 쓴다. 정적 목록과 렌더링 목록은 다를 수 있다(스크립트로 그린 프레임 등, PRODUCT §8 닫힌 질문). 캔버스를 열면 렌더링 목록으로 바뀐다.
- 캔버스 행은 기본으로 접혀 있다. 열린 캔버스는 자동으로 펼친다. 폴더와 캔버스의 펼침 상태는 루트별로 기억한다(재실행 복원 참조).
- 열린 코멘트 수는 0보다 클 때만 배지로 표시한다.
- 키보드는 지금 트리 규칙(↑↓, ←→, Home/End, Enter·Space)을 유지한다. 타입어헤드를 더한다: 글자를 치면 500ms 안에 친 글자를 이어 붙인 버퍼로, 현재 다음의 보이는 행 중 표시 이름이 그 버퍼로 시작하는 첫 행에 포커스를 준다(WAI-ARIA APG Tree View).

## 개요 페이지

- 작업공간에서 캔버스가 열려 있지 않으면 중앙에 보인다. 오른쪽 패널은 지금의 "No canvas open" 상태 그대로다(오른쪽 패널 재설계는 다음 차례).
- 폴더별 섹션에 캔버스 카드 격자를 둔다. 카드에는 썸네일, 표시 이름, 파일 이름, 프레임 수(정적), 최근 변경 시각(`projects-home`의 mtime), 열린 코멘트(0보다 클 때)가 있다.
- 카드를 누르면 캔버스를 연다. 지금 사이드바에서 여는 것과 같은 내비게이션이다.
- 사이드바의 폴더 노드를 누르면 개요 페이지의 해당 섹션으로 스크롤한다(캔버스가 열려 있으면 먼저 개요로 돌아간다).
- 작업공간 상단 바의 프로젝트 이름을 누르면 개요로 간다.

## 썸네일

- 방식(확인 질문 Q1의 추천안): main이 화면에 보이지 않는 `BrowserWindow`(`show: false`)를 하나 만든다.
  - 이 창은 앱 창과 같은 세션 정책(권한 거부, 다운로드 취소, 창·`<webview>` 열기 차단)과 같은 iframe 탐색 게이트를 따른다.
  - 내부 호스트 페이지가 `sandbox="allow-scripts"` iframe으로 캔버스 URL을 띄운다. 주입 스크립트는 넣지 않는다.
  - `doan:width` 폭으로 렌더링하고, 문서 높이를 측정해 첫 화면(폭 기준 16:10 영역)을 `webContents.capturePage`로 찍는다. 결과를 가로 480px PNG로 줄인다.
- 캐시: `<userData>/thumbnails/<sha256(root + "\n" + path)>.png`와 메타(`mtimeMs`, `size`, 앱 버전). 메타가 현재 파일과 다르면 다시 만든다. 파일 변경 감시(지금의 served 변경)가 해당 캔버스의 썸네일을 무효화한다.
- 큐: 한 번에 하나씩, 개요 페이지에 보이는 카드를 먼저 처리한다. 캔버스 하나에 8초 제한을 두고, 실패하면 자리표시자를 유지한다. 앱 창이 숨겨지면 멈춘다.
- 서버 키: 숨김 창은 그 폴더의 기존 서빙 URL을 그대로 쓴다. 폴더 키를 다른 폴더의 캔버스에 넘기지 않는다는 규칙(ARCHITECTURE §3 folder-key secrecy)을 지킨다. 숨김 창 하나가 여러 폴더의 캔버스를 차례로 띄우므로, 캔버스마다 iframe을 새로 만든다(이전 문서가 다음 키를 알 수 없게).
- PoC가 먼저다: 감사에서 축소한 OOPIF 캔버스의 아래쪽이 그려지지 않는 현상을 실제 창과 `capturePage` 모두에서 봤다(`.scratch/ux-audit/shots/dbg-real2/real-window.png`). 숨김 창 캡처가 이 문제를 피하는지, 시간과 메모리는 얼마인지 PoC로 확인한다(tasks 0).

## 빠른 열기 (⌘K)

- 색인: 저장된 모든 루트의 `list` 항목에서 캔버스(표시 이름, 파일 이름, 경로, id)와 정적 프레임(제목, id)을 모은다. 열린 캔버스는 렌더링 프레임으로 대신한다. 폴더 목록이 갱신되면 다시 만든다.
- 매칭(순수 함수): 소문자로 바꾸고 공백으로 나눈 토큰이 모두 들어 있어야 한다. 점수는 접두 일치 > 단어 시작 일치 > 부분 일치 순이다. 현재 루트가 먼저이고, 같은 저장소의 다른 워크트리, 다른 저장소 순이다. 최대 50개를 보인다.
- 결과 행: `# Card declined — Billing & plans › 4 · acme-web · main`.
- 고르면 대상 루트가 현재 작업공간이 아닌 경우 그 작업공간으로 전환한다(초안 가드 적용). 그다음 캔버스를 열고, 프레임이면 첫 `layout` 뒤 id로 프레임을 찾아 이동한다. 렌더링 목록에 그 id가 없으면 캔버스 맨 위를 보이고 "This frame is not in the rendered canvas"를 잠깐 표시한다. 같은 id가 여럿이면 문서 순서의 첫 번째로 간다.
- 홈에서도 같은 대화상자가 열린다.

## 프레임 이동과 현재 프레임

- `jump`는 더 이상 `pick-frame`을 보내지 않는다. 지금처럼 `measure` 후 다음 `layout`의 프레임 사각형으로 화면을 옮기고(32px 여백, 배율 상한 1), 오버레이에 프레임 테두리 강조를 1.2초 그린다. 선택, 오른쪽 패널, `selection:set`은 그대로다.
- 그래서 jump는 코멘트 초안 가드를 거치지 않는다. 선택이 바뀌지 않기 때문이다(지금은 `transition()`을 거침).
- 현재 프레임: 보기 변환이나 `layout`이 바뀔 때마다 화면 중심에 가장 가까운 프레임(중심이 화면 안에 있는 프레임 중 거리가 최소)을 계산해 트리의 `aria-current`에 반영한다. 선택된 요소 하위 행(지금의 `↳ tag · id`)은 선택이 있을 때 그 요소를 감싼 프레임 아래에 그대로 보인다.

## 재실행 복원

- `<userData>/ui-state.json`(기기 로컬, 스키마 없음 — ARCHITECTURE §11). 모양: `{screen: "home" | "workspace", root?, canvas?, view?: {scale, x, y}, expanded: {[root]: string[]}}`. 임시 파일 + rename으로 쓰고, 500ms 디바운스한다. 읽을 수 없으면 홈에서 시작하고 다음 쓰기가 덮어쓴다(`folders.json`과 같은 정책).
- 시작할 때:
  - `root`가 저장 목록에 있고 `list`면 그 작업공간을 연다.
  - `canvas`가 목록에 있으면 열고, 첫 `layout` 뒤 `view`를 적용한다(배율은 0.05–4로 자른다). 없으면 개요 페이지를 연다.
  - `root`가 없으면 홈으로 간다.
  - 선택은 저장하지도 복원하지도 않는다.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `buildCanvasTree(rows) → TreeNode[]` (폴더 분리, 정렬, 표시 이름, 중첩 경로 `a/b/c.html`)
- `canvasLabel(row)`, `frameLabel(frame, index)` (번호·제목·id 규칙)
- `typeaheadNext(visibleLabels, currentIndex, buffer) → index | null`
- `searchIndex(entries, rendered?)`, `searchMatch(index, query, currentRoot, repoOf) → Result[]`
- `currentFrame(frames, view, viewport) → index | null`
- `parseUiState(text) → UiState | null`, `restorePlan(uiState, entries) → {screen, root?, canvas?, view?}`
- `thumbnailKey(root, path)`, `thumbnailStale(meta, stat, appVersion) → boolean`
- `thumbnailQueue` 리듀서(우선순위, 하나씩, 실패 표시)

## 형식 변경

공유 형식은 바뀌지 않는다. `CanvasRow`(IPC 타입)에 `frames: {id, title?}[]`를 더한다. `doan ls` 출력에는 이미 있는 필드다. 새 기기 로컬 파일이 둘 생긴다: `ui-state.json`과 `thumbnails/` 캐시. 둘 다 스키마가 없다.

## 컨벤션 영향

없다. 프레임 번호는 문서 순서에서 앱이 매긴다. 캔버스에 새 속성을 요구하지 않는다.

## 결정 영향

- **대체되는 결정**:
  - 2026-10-22 canvas-view 기본값 "view kept in memory only" → 재실행 복원
  - 2026-10-22 display names "a canvas is its path relative to `design/`" → 제목 우선
  - canvas-view Q5의 별도 Frames 목록 → 캔버스 아래 중첩(`projects-home`이 사이드바를 나눈 데 이어)
  - select-inspect "Frames current state follows selection"(2026-10-23 Q2/R3 승격) → 현재 표시는 보고 있는 프레임을 따른다. 선택된 요소 하위 행은 유지한다.
  - 프레임 점프가 프레임을 선택하던 동작(`pick-frame`) → 선택 없는 이동
- **프레임을 선택하는 길은 트리에 남긴다**(사용자 결정 Q2): 프레임 행에 Select 버튼(행에 마우스를 올리거나 포커스가 있을 때 보임)을 두고, 더블클릭도 같은 동작이다. Select는 지금의 `pick-frame` 경로(선택, 초안 가드 transition, `selection:set`)를 그대로 쓴다. 한 번 클릭은 이동만 한다. 코멘트 루프 재설계 때 다시 바뀔 수 있다.
- **보안 경계**: 썸네일 숨김 창은 렌더링 결정(로컬 서버, 토큰 경로, sandbox iframe, 권한 거부, 탐색 게이트)을 그대로 따른다. 주입 스크립트 없이 화면만 찍는다. 앱 창의 IPC 핸들러는 숨김 창을 발신자로 받지 않는다(`fromWindow`는 앱 창만 허용).
- **PRODUCT §5 Deferred 'Screenshots'**: 이 썸네일은 사람의 탐색용 미리보기이고, 에이전트용 스크린샷이나 ref 비교가 아니다. 에이전트에게 노출하지 않는다(CLI·MCP 없음).

## POSTMORTEM에서 가져올 함정

- **2026-10-21 "Sorting file names does not sort the ids derived from them"**: 정렬은 표시 이름이라는 논리 키로 명시해서 한다. 접두가 겹치는 이름(`foo`, `foo-bar`)과 숫자(`step-2`, `step-10`)를 정렬 테스트에 넣는다.
- **2026-10-22 "A canvas link to a document without the canvas script left a dead board"**: 썸네일 창에서 스크립트가 없는 문서나 CSP에 막힌 문서도 시간 제한으로 끝나야 한다. 자리표시자로 남는 경로를 테스트한다.
- **2026-10-22 "The fresh-iframe rule survived its mutation…"**: 썸네일 창에서도 캔버스마다 새 iframe을 만든다. 이 규칙을 변이(mutation)로 확인한다.
- **2026-10-23 "A preceding canvas tooltip was cached as a project path"**: 트리 툴팁을 e2e에서 읽을 때 `hoverTooltip`과 포인터 치우기 절차를 쓴다.
- **2026-10-23 "Draft guards changed existing transition timing"**: jump가 transition을 거치지 않게 바뀌므로, 초안이 있을 때 프레임 이동이 초안을 건드리지 않음을 e2e로 확인한다.

## PoC 의존

- 썸네일 숨김 렌더링 캡처(새 PoC). 통과 기준: 정상 캔버스, 100vh 캔버스, CSP로 스크립트를 막은 캔버스, 외부 폰트 캔버스, 높이 20,000px 캔버스에서 각각 첫 화면 영역이 빈 곳 없이 찍힌다. 캔버스당 시간 중앙값, 숨김 창의 메모리 증가량, 아래쪽이 그려지지 않는 현상의 재현 여부를 기록한다. 실패하면 확인 질문 Q1의 대안(열어 본 캔버스만 앱 창에서 캡처)으로 간다.

## 확인 질문 답 (2026-10-24 사용자)

- **Q1**: 썸네일은 숨김 창 렌더링으로 만들고, PoC를 먼저 한다(추천안). PoC가 실패하면 "열어 본 캔버스만 앱 창에서 캡처"로 가기 전에 사용자에게 확인받는다.
- **Q2**: 트리의 프레임 행에 Select 동작(버튼·더블클릭)을 둔다. 추천안(코멘트 루프 차례로 미룸) 대신 이 안을 골랐다.
