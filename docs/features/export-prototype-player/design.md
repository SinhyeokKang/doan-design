# 보드에서 재생하고 현재 프레임을 다시 내보내기

## 기준과 구성

보드의 선택은 [PRODUCT §5 항목 4](../../PRODUCT.md), 재생 버튼·서랍·창은 같은 문서의 항목 2와 3이 기준이다. 보드와 재생기 치수·조작부는 [캔버스](../../design/canvas.md)와 [프로토타입](../../design/prototype.md)을 따른다. 앱에 해당 동작이 이미 있으면 앱과 일반 Export에 같은 입력을 주고 결과를 대조한다. 파일을 편집하는 앱과 달리 브라우저는 받은 HTML에 담긴 시점의 캔버스를 사용한다. 별도 서버나 로컬 앱 연결을 추가하지 않는다.

변경 대상은 다음과 같다.

- Go의 일반 Export 조립부(`cli/internal/export/assemble.go`)
- 내장 뷰어(`cli/internal/export/viewer/`)의 기존 파일과, 재생 페이지용으로 새로 두는 HTML·JS·CSS
- `app/scripts/viewerInspect.mjs`의 새 생성 entry와 그 테스트

생성된 뷰어 코드는 손으로 고치지 않는다. 앱 TS 소스를 바꾼 뒤 `node app/scripts/viewerInspect.mjs`로 다시 만든다. 캔버스 형식, CLI 응답, 소켓, JSON Schema와 버전, 에이전트 스킬, doan check 규칙은 그대로다. 기존 [ARCHITECTURE §1 규약 14·15와 §3 Exported canvas and viewer](../../ARCHITECTURE.md)를 적용한다.

## 선택과 재생 진입점

- **접힌 인스펙터의 Select를 바꾼다.** 지금 PRODUCT §5 항목 3은 인스펙터가 접혀 있으면 선택과 호버가 없고 Select가 캔버스의 필드·버튼·스크롤을 그대로 둔다고 정한다. 이 기능 뒤에는 접힌 상태에서도 Select가 선택한다. 캔버스를 직접 조작하려면 Option 클릭을 쓴다. Select 도구 툴팁에 “Select — Option-click (Alt-click) to use the canvas’s buttons and fields”를 넣어 접힌 상태에서도 이 조작을 알린다. 승격할 때 PRODUCT의 해당 문단을 다시 쓴다.
- Select는 인스펙터 표시 여부와 독립적으로 작동한다. 클릭·⌘ 클릭·Esc의 선택 경로, 잘린 요소의 호버·윤곽선, 텍스트 드래그, Option 클릭 통과를 앱과 대조한다. Hand로 바꾸면 선택을 지우고, Space 임시 이동은 선택을 보존한다. 접혔거나 너비가 부족해 숨은 인스펙터에서는 스타일을 수집하지 않는다.
- ARCHITECTURE §3이 정한 빈 sibling iframe과 무효화 epoch는 지금 "Select가 검사할 수 있을 때"만 둔다. 앞으로는 인스펙터가 접혔거나 Yield로 숨은 상태에서도 유지한다. 행 없이 선택만 돌려주는 응답에도 첫 검사 ack를 유지한다([11월 회고](../../postmortem/2026-11.md) “Export viewer tests sent input before the canvas inspector opened”).
- **크기 버블과 Option 거리 측정은 일반 Export에 새로 넣는 구성요소다.** 지금 뷰어 오버레이에는 선택·호버 마크만 있고, ARCHITECTURE §3은 측정을 'Left out'으로 적는다. 앱의 `app/src/renderer/sizeBubble.ts`, `bubbleItems.ts`(Add to message 제외), `measure.ts`를 생성 번들로 가져온다. 버블은 `aria-hidden`인 `#inspect-marks` 밖에 둔다. 그래야 버블의 Play가 포커스를 받을 수 있다. 승격할 때 ARCHITECTURE의 'Left out'과 PRODUCT §5 항목 3을 고친다.
- 크기 버블의 Play는 재생 가능한 프레임 자체를 선택했을 때만 크기 앞에 놓는다. 키보드 포커스가 버블의 Play에 있는데 선택이 바뀌어 Play만 사라지면 포커스를 툴바의 Play prototype으로 옮긴다. Show inspector는 앱 규칙에 따라 노출한다.
- 툴바의 Play prototype은 항상 같은 버튼이고, 앱의 판정 순서를 재사용한다. 캔버스 준비 전이나 재생할 프레임이 없으면 이유를 제공한다. 프레임 자체나 재생 가능한 상위 프레임이 대상이면 바로 재생한다. 대상이 없거나 선택한 마크가 잘못됐으면 재생 서랍을 연다. 포인터로 누른 툴바 버튼은 포커스를 가져가지 않는다([11월 회고](../../postmortem/2026-11.md) “A click on an export viewer tool left focus on it, so Space pressed the tool instead of panning”). Enter·Space·방향키·Esc와 포커스 복귀도 테스트한다.
- 보드의 프레임 서랍에는 앱과 같은 프로토타입 마크와 Viewing을 표시한다. 이 서랍에서 행을 고르면 보드가 이동한다. 툴바의 재생 서랍에서 행을 고르면 보드의 선택을 유지한 채 재생한다. 재생 서랍은 링크 그룹, 문서 순서, Playing 행과 키보드 탐색을 앱과 공유한다.
- 앱의 재생 판정을 따른다. 처음 1,000개 프레임, 유효한 마크, 비어 있지 않은 고유 ID와 200 UTF-16 단위 한계를 포함한다. 실행 중 재생 후보와 파일에서 별도로 내보낼 수 있는 후보를 구별한다. 스크립트가 파싱이나 load 중에 만든 프레임도 앱과 같은 조건에서 재생할 수 있다. 하지만 파일 원문에 없는 프레임은 별도 내보내기를 거절하고, 파일 원문에 그 프레임이 없다고 설명한다.
- 판정에 필요한 값은 뷰어의 `layout` 메시지로 받는다. 지금 그 메시지의 각 프레임에는 `id·x·y·width·height·title`만 있다. 앱 `canvasMessage.ts`처럼 `prototype`, `parent`, `cut`, `gotos`를 더한다. 수정할 곳은 `measure.js`의 보고, `lib.js` `parseLayout`의 상한 검증이고, `exportViewer.test.ts`로 앱 사본과 대조해 고정한다.

## 브라우저 재생기

### 창과 경계

- 신뢰할 수 있는 뷰어 버튼의 사용자 입력으로 창을 열고, 원래 파일의 보드와 재생 화면을 독립시킨다.
- 보드의 캔버스 iframe에는 팝업·같은 출처 접근 권한을 추가하지 않는다. 사용자가 승인한 새 창을 여는 주체는 뷰어다.
- 재생창 안에서 캔버스를 담는 iframe은 기존 단독 프로토타입 파일과 같은 `allow-scripts allow-forms` sandbox를 쓰고, `allow-same-origin`은 붙이지 않는다. PoC에서 고른 창 생성 방식이 보드의 출처를 물려받더라도 캔버스가 그 출처에 닿지 못하게 하기 위해서다. 그 iframe의 첫 스크립트는 `isolate.js`를 그대로 쓴다. 그래서 srcdoc 회귀 규칙([11월 회고](../../postmortem/2026-11.md) “The canvas export viewer kept the srcdoc navigation bugs the prototype page had already fixed”)을 그대로 따른다.
- **경계 불변식.** 이 셋을 어기면 캔버스 스크립트가 보드와 같은 출처의 문맥으로 빠져나간다.
  - 프레임 id·title·goto처럼 캔버스에서 온 문자열은 `textContent`나 속성 API로만 쓰고, 마크업 문자열에 넣지 않는다. 이 값은 캔버스 스크립트가 위조할 수 있는 `layout` 메시지에서 온다.
  - 보드는 재생창에 함수나 객체를 넘기지 않고 문자열만 넘긴다.
  - 재생창 스크립트는 재생창 자신의 realm에서 실행한다.
- 재생창 이름은 보드를 열 때마다 고유하게 만든다. 그래서 보드를 새로고침하거나 다시 열면 새 재생창을 쓰고, 동시에 연 Export 파일 두 개는 서로의 재생창을 차지하지 않는다.
- 재생에 필요한 자료는 창을 여는 시점에 함께 넘긴다. 그래서 자료를 받기 전에 보드가 닫히는 상태는 없다. 재생창은 보드가 닫힌 뒤에도 자체 자료로 입력, 링크 이동, 현재 프레임 내보내기를 처리한다.
- iframe에서 올라온 메시지는 현재 창·현재 프레임에서 온 것인지 확인한다. 클릭 한 번에 창 하나만 열고, 재생창을 닫고 다시 열 수 있게 한다.
- 재생창을 닫았을 때 보드가 남아 있으면 버블의 Play에 포커스를 돌려준다. 그 버튼이 사라졌으면 툴바의 Play prototype으로 돌려준다.
- 재생창의 탭·창 제목은 앱과 단독 파일처럼 “<frame title or id> — Prototype”이다. 링크로 이동하면 제목도 바뀐다.

### 재생과 기록

- 보드 파일을 새로 열면 Fit으로 시작한다. 같은 보드에서 재생창을 닫았다 다시 열면 직전에 선택한 Fit·Responsive 모드를 유지하고, Back·Forward 기록은 비운다.
- 마크의 뷰포트와 미디어 쿼리를 유지하며 필요할 때만 축소한다. Responsive는 창 크기로 다시 배치한다. 모드를 바꿔도 입력·모달·스크롤은 보존한다. 브라우저가 요청한 외부 창 크기나 포커스를 허용하지 않아도 내부 프레임 크기와 조작은 지킨다.
- 같은 보드에서는 재생창 하나를 재사용한다. 같은 프레임을 다시 요청하면 창을 앞으로 가져온다. 다른 프레임이면 처음부터 재생한다. 창을 앞으로 가져오지 못했거나 가져왔는지 알 수 없으면, 보드 오른쪽 아래 공유 토스트에 “The prototype is already playing in another window.”를 표시한다.
- 창 안의 링크가 자기 자신을 가리키면 다시 시작한다.
- 기록은 단독 프로토타입 파일과 같다. 이동마다 브라우저 기록 항목을 남겨 헤더의 Back·Forward와 ⌘[·주소창 Back이 같은 결과를 낸다. 브라우저 자체의 새로고침(⌘R)은 화면의 프레임을 다시 시작하고, 빈 창이나 오류 페이지가 되지 않는다. 이 조건을 지키는 창 생성 방식을 PoC에서 고른다.
- 자기 press로 기록의 끝에 닿은 Back·Forward는 native `disabled`가 아니라 `aria-disabled`와 클릭 가드로 막는다. 그래야 포커스를 잃지 않는다([10월 회고](../../postmortem/2026-10.md) “The onboarding wizard lost keys and clicks to focus and modal stacking”, 2026-11-17 export viewer zoom 재발).
- 서랍의 Playing 표시, 키보드 포커스, 로딩·실패·Retry·Close는 앱의 재생 상태를 기준으로 검증한다. 문구와 상태가 브라우저에서 달라지는 경우는 아래 '브라우저 상태와 문구'를 따른다.
- 앱에서 재생과 탐색에 쓰는 헤더, 좁은 창에서의 줄바꿈, 단축키와 접근 가능한 이름을 유지한다. 파일에 포함된 자료만으로 재생하며, 원래 저장소의 변경을 감시한다고 표시하지 않는다.
- 재생창은 응답하지만 프레임이 시작한 지 10초가 지나도 응답하지 않으면 시작 실패를 표시한다. Retry는 새 iframe에서 같은 프레임을 처음부터 연다. 재생 대상을 바꿀 때마다 새 iframe을 만들고, 현재 실행의 응답만 적용한다.
- Electron의 프로세스 강제 종료와 마지막 화면 캡처는 브라우저 검증 범위에서 제외한다.

### 현재 프레임 내보내기

- Export prototype은 클릭한 순간의 프레임과 그 링크 그룹을 대상으로 한다. 기존 단독 프로토타입 파일의 시작 프레임, 제목, 링크 범위, 캔버스 원문 포함 안내와 거절 규칙을 재사용한다. 저장은 브라우저에 맡기고, 브라우저가 저장 완료를 알려주지 않으므로 다운로드 요청을 디스크 기록 성공으로 표시하지 않는다.
- **조립 규칙은 Go만 갖는다.** Go는 매 프레임마다 완성 파일을 미리 복제하지 않는다. 대신 다음 조각을 미리 렌더해 일반 Export에 담는다.
  - 단독 파일 템플릿을 채운 앞뒤 문자열
  - 프레임별로 이스케이프한 NAME과 start 값
  - 그룹별로 이스케이프한 frames JSON
  - 캔버스 원문에서 measure 스크립트의 위치와 길이
- 브라우저 JS는 조각을 이어 붙이기만 하고, 이스케이프 규칙을 다시 구현하지 않는다. 캔버스 원문은 보드 iframe의 `srcdoc` 한 벌을 쓰며, measure 스크립트 자리를 `isolate.js`로 바꾼다. 이때 JS에 필요한 srcdoc 속성 이스케이프 함수 하나는 Go의 이스케이프와 대조하는 테스트로 고정한다.
- 단독 파일 데이터는 JSON 문자열로 담는다. JSON 인코딩이 `<`를 이스케이프하므로 `</script>`가 안전하다.
- “같은 결과”는 다음과 같이 판정한다. LF만 쓰는 유효한 UTF-8 fixture는 `doan export --frame <id> --prototype`의 결과와 바이트가 같아야 한다. 그 밖의 입력은 HTML 파서가 CRLF·NUL·잘못된 UTF-8을 정규화하므로 파싱 결과가 같아야 한다.
- 파일 이름은 앱 저장 패널의 기본값 `<canvas file stem>-<frame id>.html`을 따른다. Go가 stem을 담고 JS가 조합한다.
- 크기 한계 50 MiB는 조립한 일반 Export 페이지 전체로 판정한다. 단독 파일은 일반 Export보다 항상 작으므로 브라우저 쪽 크기 거절은 없다. 새로 담는 조각·재생 페이지·생성 번들로 늘어난 바이트는 측정해 승격할 때 ARCHITECTURE §3 'Size limit'에 기록한다.
- 큰 파일을 조립하기 전에 한 프레임을 양보해 진행 토스트가 그려지게 한다. 진행 토스트는 다운로드를 요청하는 즉시 끝낸다.

## 순수 판정과 선행 실험

1. 앱의 순수 판정을 `viewerInspect.mjs`의 새 entry로 생성해 뷰어가 쓴다. 손으로 복사하지 않는다. 대상은 다음과 같다.
   - `app/src/main/prototype/playability.ts`, `links.ts`, `history.ts`, `fit.ts`
   - `app/src/renderer/frameDrawerList.ts`의 `groupDrawer`
   - 크기 버블과 거리 측정의 `sizeBubble.ts`, `bubbleItems.ts`, `measure.ts`
   런타임 판정은 생성 번들이라 앱과 코드가 같다. 생성 결과는 `--check`로 앱 소스와 어긋나지 않았는지 확인한다.
2. 파일 원문 기준의 그룹·시작점·거절 사유는 Go가 구한다. 이 결과를 `schema/fixtures/prototype-mark`와 `schema/fixtures/prototype-links`로 TS 판정과 대조한다.
3. 같은 프레임과 그룹으로 브라우저 JS가 이어 붙인 결과와 `doan export --frame <id> --prototype`의 결과를 위의 “같은 결과” 기준으로 비교한다. 두 파일은 각각 원래 뷰어 없이 열어 확인한다.
4. 선행 PoC는 실제 file URL을 Chromium·WebKit으로 열어 다음을 확인한다.
   - 새 창 열기·재사용·닫기
   - 보드를 새로고침한 뒤의 Play, Export 파일 두 개를 동시에 연 상태의 재생
   - 차단과 재시도
   - 창 내부의 격리된 재생
   - 창 생성 방식: `about:blank`에 문서 쓰기, `blob:` URL 등의 후보마다 ⌘R과 주소창 Back의 결과, 주소창 표시, 보드 realm이 사라진 뒤의 동작
   - 독립 HTML 다운로드와 오프라인 재개방
   - `a[download]`의 브라우저별 파일 이름 문자 치환과 길이 절단(ID 최대 200자)
   창 생성 방식, 창 통신, 사용자 입력을 인정하는 방식은 이 결과로 정한다. 복제한 테스트 DOM만으로 이 항목을 통과 처리하지 않는다.

## 회귀 근거와 시안

- [11월 회고](../../postmortem/2026-11.md)의 “Export viewer tests sent input before the canvas inspector opened”는 호스트 버튼을 누른 시점과 iframe이 입력을 처리하는 시점이 달랐던 사례다. 보드와 재생창 모두 준비 완료 뒤 조작하는 테스트와, 준비 메시지를 늦춘 첫 입력 테스트를 함께 둔다.
- 같은 회고의 다음 세 건을 기준으로 취소된 링크, 이동 직전의 링크, 같은 문서 해시와 History 동작을 두 엔진에서 확인한다.
  - “The exported prototype followed links the canvas had cancelled, because its own cancel hid the canvas's”
  - “An exported prototype lost a followed link when the frame navigated before the viewer read the goto”
  - “The canvas export viewer kept the srcdoc navigation bugs the prototype page had already fixed”
- 같은 회고의 “An eval check that compared a prototype export only with a regenerated one accepted the canvas viewer”에 따라, 생성 결과끼리 비교하는 검사에 더해 원래 뷰어 없이 다운로드한 파일의 첫 화면과 실제 링크 이동을 검증한다.

시안은 기존 Export 화면을 확장하는 새 파일 `.doan/canvases/export-prototype-player.html`에 그린다. 캔버스 ID는 `export-prototype-player`다. 상태는 `board-selection`(버블·툴바), `frame-drawer`(프로토타입 마크), `play-drawer`(그룹·Playing), `player-fit`, `player-responsive`, `player-narrow`, `play-blocked`, `player-failure`, `export-result`다. 앱과 같은 조작부에는 기존 토큰과 배치를 사용하고, 브라우저 고유의 안내는 영문으로 그린다. 적용한 디자인 프리셋은 shape이다.

### 브라우저 상태와 문구

받는 사람은 Doan과 에이전트를 쓰지 않는다. 그래서 앱 문구의 Doan·agent는 파일(shared file)이나 보낸 사람(sender)으로 바꾼다. 앱 문구는 PRODUCT §5 항목 2 'Prototype window'에 있다.

| 앱 상태 | 브라우저 | 브라우저 문구와 조작 |
|---|---|---|
| Loading prototype(300 ms 뒤) | 있음 | 앱과 같다 |
| Couldn’t open this prototype(캔버스를 읽지 못함, 창을 시작하지 못함) | 없음 | 자료를 창을 여는 시점에 함께 넘기므로 생기지 않는다 |
| Couldn’t start this prototype(10초 무응답) | 있음 | “Couldn’t start this prototype” / “The frame didn’t finish loading within 10 seconds. Retry, or ask the sender for an updated file.” Retry·Close. Details는 없다 |
| Frame unavailable·Prototype unavailable | 시작 실패로 묶음 | 스크립트가 만든 프레임을 새 iframe에서 찾지 못하거나 마크가 사라진 경우다. “Couldn’t start this prototype” / “This frame isn’t in the shared file. Retry, or ask the sender for an updated file.” Retry·Close |
| 소스 변경으로 인한 재로드, “Another frame started playing first” | 없음 | 파일이 바뀌지 않고 재생창이 하나뿐이라 생기지 않는다 |
| 재생 서랍이 빔 | 있음 | “No frames in this canvas are marked for prototyping.” 에이전트 문장은 뺀다 |
| 재생할 수 없는 프레임으로 가는 링크 | 있음 | 재생창 오른쪽 아래 토스트에 “Can’t go to “<id>”. Ask the sender to fix this link and send an updated file.”를 표시한다. 값이 200 UTF-16 단위를 넘으면 “Can’t go to this link’s frame. Ask the sender to fix this link and send an updated file.”이다 |
| Export를 쓸 수 없음: “Can’t read this canvas.” | 없음 | 파일에 담긴 자료만 쓴다 |
| Export를 쓸 수 없음: “Export isn’t available while this prototype can’t play.” | 있음 | 앱과 같다 |
| Exporting | 있음 | 1초 뒤 “Exporting “<frame>””. 다운로드를 요청하면 즉시 끝난다 |
| Exported | 바뀜 | “Download requested for “<frame>” and 1 linked frame. The file also contains the rest of the canvas. If nothing downloads, allow downloads for this file and try again.” 연결된 프레임 수는 클릭한 대상에 맞추고(“2 linked frames”), 0개면 “Download requested for “<frame>”.”로 시작한다. 앱의 인터넷 자원 문장은 앱과 같은 조건에서 덧붙인다 |
| Couldn’t export: 스크립트가 만든 프레임 | 바뀜 | “Couldn’t export “<frame>”. This frame isn’t in the canvas file. Ask the sender for an updated file.” |
| Couldn’t export: 원문에 마크가 없음 | 바뀜 | “Couldn’t export “<frame>”. It isn’t marked for prototyping in the canvas file. Ask the sender for an updated file.” |

브라우저에만 있는 표시는 다음과 같다.

- 팝업이 차단되면 보드 오른쪽 아래 공유 토스트(`role="status"`)에 “Your browser blocked the prototype window. Allow pop-ups, then press Play again.”을 표시한다. 같은 버튼으로 재시도한다. 다음 Play가 성공하면 토스트를 없앤다. 포커스는 누른 Play에 그대로 둔다. 재생 서랍의 행으로 열다가 차단되면 서랍을 닫고 툴바의 Play prototype으로 포커스를 돌린다.
- 재생 중인 프레임을 다시 열 때 창을 앞으로 가져오지 못하면 “The prototype is already playing in another window.”를 표시한다(위 '재생과 기록').
- 브라우저가 창 버튼을 제공하므로 재생기 헤더는 왼쪽 16px에서 Back으로 시작한다. 프레임 이름 양옆에는 40px씩 남기고, 이름에 120px를 확보할 수 없으면 두 번째 줄로 옮긴다.
