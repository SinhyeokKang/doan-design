# prototype-link-export — design

조사 근거는 상위 [design.md](../prototype-frame-links/design.md) '조사' '내보내기'에 있다. 줄 번호는 2026-11-14 develop 기준이다.

## 바뀌는 곳

- CLI(Go)
  - `cli/internal/cli/export.go`(76–124행 근처)
    - 시작 프레임은 지금처럼 `canvas.PrototypeTarget`로 판단한다.
    - 묶음은 하위 1의 `LinkGroups`에서 얻는다. 시작 프레임이 든 묶음 하나다. 시작 프레임은 재생 가능하므로 정확히 한 묶음에 든다.
    - 제목은 `model.Frames`에서 id로 찾는다. 재생 가능한 id는 하나뿐이라 모호하지 않다.
    - 200 UTF-16 단위를 넘는 id나 공유된 id는 노드에서 빠지므로 새 오류 경로가 없다.
    - 결과에 프레임 수 필드를 더한다. 이름은 `linkedFrames`(시작 프레임 제외 수)를 제안한다. 구현 때 §12 표기에 맞춰 확정한다.
  - `cli/internal/export/assemble.go` `AssemblePrototype`(91–124행): `Proto`가 시작 프레임과 묶음(`[]{ID, Title}`)을 가진다.
  - `cli/internal/export/viewer/isolate.js`, `prototype.js`, `prototype.html`, `prototype.css`: 프레임 전환.
- 앱
  - 창의 Export는 CLI를 부르므로(`cli.ts:63-67`) 내보내기 경로는 바뀌지 않는다.
  - `ExportTarget`(`prototype/ipc.ts:231-235`)과 `exportTargetMatches`는 시작 프레임 하나를 비교하는 그대로다.
  - 성공 토스트만 바뀐다(`canvasRowMessages.ts` `exportToast`, `canvasExport.ts` `interpretExport`가 새 필드를 읽음).
- 테스트
  - `app/src/main/exportViewer.test.ts`(1161–1510행): 드리프트와 동작
  - Go export 테스트: `TestAssemblePrototypeOutputIsPinned`, `TestAssemblePrototypeSrcdocIsTheCanvasWithTheIsolationScriptInItsHead`, `TestExportPrototypeWritesThePrototypePage`, `TestExportPrototypeTooLargeAfterEncoding`
- 문서(승격)
  - PRODUCT
    - §1 In scope 8 "plays only that frame"
    - §5 item 2 'Prototype window' 첫 문단 "saves the playing frame"과 'Export'의 "exports the frame playing at the click" 및 토스트
    - §5 item 3 'Export and viewer'의 'Prototype file' "shows only that frame"과 "a browser reload restarts it"
    - §5 item 12 "the file plays only that marked frame"
  - ARCHITECTURE
    - §1 convention 15의 export 문장(정적 판단, 1,000 한도 없음)
    - §3 'Prototype window' 'Export'
    - 'Exported canvas and viewer' 'Prototype page'(전환, hash 계약, 한계)
    - §12 `doan export` 결과 필드
  - README.md:148 "a file that plays only that frame"
  - USABILITY-EVAL.md(X2)

## 프레임 전환 방식

같은 문서 안에서 프레임을 바꾸지 않는다. 지금 격리는 형제 요소를 영구히 숨기고, 결정이 "새로 시작"이기 때문이다. 이동마다 iframe을 새로 만든다.

- **캔버스 보관**
  - Go가 isolate 스크립트를 head 맨 앞에 넣은 srcdoc 전체를 한 번 만든다. 지금 `assemble.go`와 같다.
  - 지금 srcdoc 이스케이프(`fillPage`, `&`와 `"`만)를 그대로 써서, 그 값을 보이지 않는 요소의 `data-` 속성에 넣는다. 바깥 JS는 `getAttribute`로 한 번 읽는다.
  - 크기와 할당이 지금과 같고, 캔버스는 바이트 단위로 한 번만 담긴다.
  - JSON 문자열은 `< > &`를 6바이트로 바꾸고 사본을 만든다. `<template>`은 doctype과 `html`·`head`·`body` 속성을 잃고 내용을 정리한다. 그래서 둘 다 쓰지 않는다.
- **시작 프레임 전달**
  - `isolate.js`는 `const FRAME = window.name;`으로 읽는다. 바깥 JS는 iframe의 `name`만 설정한다.
  - `measureOffset` 같은 Go 바이트 위치를 JS에서 쓰지 않고, `prototype.js` 안에서 `</script`를 이어 붙이지도 않는다.
  - sandbox iframe(opaque origin)에서 `window.name`이 읽히는지는 PoC에서 확인한다. 안 되면 Go가 넣을 자리 앞과 뒤를 두 문자열로 내보낸다.
- **iframe 만들기**: 이동마다 새 iframe을 만든다.
  - `sandbox="allow-scripts allow-forms"` → `name` → `srcdoc` 순서로 설정한 뒤 문서에 붙인다. sandbox 플래그는 이동이 시작될 때 정해지므로, 붙인 뒤 설정하면 첫 문서가 sandbox 없이 로드될 수 있다.
  - `srcdoc`만 바꾸는 방식은 쓰지 않는다. 같은 iframe은 WindowProxy가 같아서 `event.source`로 이전 문서의 메시지를 거를 수 없다. 또 iframe 기록 항목이 하나 더 생긴다.
  - 새 iframe은 준비될 때까지 숨긴 채 이전 iframe 위에 둔다. 이전 iframe은 `inert`로 입력을 막는다. ready나 시한이 되면 바꾸고 이전 것을 지운다.
  - 메시지는 현재 iframe의 창이고 origin이 `"null"`인 것만 받는다.
- **연결 판단**(`isolate.js`): 하위 2의 주입 스크립트와 같다.
  - capture 단계에서 기록하고, `closest("[data-doan-goto]")`로 찾고, 재생 중인 프레임 안인지 본다.
  - `setTimeout(0)` 뒤 `defaultPrevented`를 본다.
  - `isolate.js`의 링크 처리(`:44-57`)가 부르는 `preventDefault()`는 세지 않는다. 링크 처리가 `preventDefault` 직전의 `defaultPrevented` 값을 이벤트별로 기록하고, 연결 판단은 그 값을 쓴다. 연결을 따를 때는 `#` 링크의 `location.hash = href`(:54)도 건너뛴다.
  - 이동할 때 `{type:"doan-prototype", goto:<값>}`를 바깥에 보낸다.
- **바깥 페이지 상태**(`prototype.js`): `shown`(지금 보이는 프레임)과 프레임별 `phase`를 둔다.
  - `resolveHash(hash, group, start)`: 빈 hash, 디코딩 실패(`decodeURIComponent` 예외), 묶음 밖이면 `start`다. 처음 열 때와 `hashchange`가 같은 함수를 쓴다.
  - 처음 열 때: `resolveHash`로 고르고, `location.replace("#" + encodeURIComponent(id))`로 주소를 맞춘다(기록이 늘지 않음).
  - goto: 현재 iframe에서 왔고 그 프레임이 `ready`일 때 첫 하나만 받는다. 값이 묶음에 있으면 처리한다.
    - 자기 프레임이면 hash를 바꾸지 않고 새로 띄운다.
    - 다른 프레임이면 `location.hash`만 바꾼다. 띄우는 것은 `hashchange`가 한다.
  - `hashchange`: `resolveHash` 결과가 `shown`과 다를 때만 새로 띄운다. 그래서 이동마다 한 번만 뜬다.
  - 시한: 프레임마다 타이머를 새로 두고, 이전 타이머는 지운다.
  - 제목: 이동할 때 `document.title`과 iframe `title`을 그 프레임의 이름으로 바꾼다. 형식은 지금 `{{NAME}} — Prototype`과 같다. hash를 바꾼 직후에 바꿔서 Back 길게 누르기 메뉴에 맞는 이름이 나오게 한다.
  - 포커스: 이동할 때 포커스가 iframe 안에 있었으면 새 iframe이 ready가 된 뒤 `focus()`한다.
- **묶음 정보**(id, 제목)는 바깥 페이지에 JSON으로 넣는다. 크기는 프레임 수에 비례해 작다.
- **iframe 안 기록**: 캔버스의 `#` 링크와 `pushState` 래퍼는 iframe 안에 기록을 쌓는다. 그 iframe을 지운 뒤 Back이 그 항목을 거치면 한 번 눌러도 화면이 그대로일 수 있다. 브라우저 동작으로 받아들이고(사용자 결정), PoC에서 관찰해 ARCHITECTURE 'Prototype page'의 한계에 적는다.
- **드리프트**: `isolate.js`의 연결 판단은 하위 2가 export하는 클릭 판정 표로 고정한다. 지금 `exportViewer.test.ts`의 isolate 하네스는 `FakeElement` 대역이라 `closest`, capture/bubble 순서, `defaultPrevented`가 없다. 하위 2의 표가 도는 것과 같은 DOM 환경을 쓴다.

## PoC 관찰(작업 1)

2026-11-15, `node .scratch/prototype-link-export/poc.mjs`. Playwright 1.64.1의 Chromium(headless shell 1248)과 WebKit 2370에서, `file://`과 로컬 http 서버 둘 다로 열었다. 세 번 돌려 세 번 모두 exit 0이었다. 손으로 만든 세 프레임 파일은 위 '프레임 전환 방식'을 그대로 따른다(캔버스는 `data-` 속성 하나, iframe은 `sandbox` → `name` → `srcdoc` 순서로 설정한 뒤 붙임, 첫 열기는 `location.replace`).

- **기록**: 처음 열 때 `location.replace("#a")`는 기록을 늘리지 않는다. 연결로 A→B, B→C를 한 번씩 이동하면 `history.length`가 1씩 는다. 이전 iframe은 새 iframe의 ready에서 지워서, 이동 뒤 iframe은 늘 하나다.
- **Back과 Forward**: C에서 Back은 B, 다시 Back은 A이고, 둘 다 iframe을 새로 만든다. A에서 Forward는 B다. A에서 Back은 파일을 떠나 앞 페이지로 간다.
- **`window.name`**: sandbox iframe(opaque origin, `allow-same-origin` 없음)의 문서가 `window.name`으로 시작 프레임 id를 읽는다. 대안(두 문자열)은 필요 없다.
- **이전 iframe의 메시지**: A의 문서가 B로 가는 연결 뒤 10 ms마다 `goto`와 가짜 `ready`를 보내는 동안 B를 늦게 준비시켰다. 메시지 62개가 모두 `event.source` 비교에서 버려졌고, 아무 이동도 일어나지 않았다. iframe을 지운 뒤에는 그 문서의 타이머가 더 돌지 않았다.
- **iframe 안 기록(관찰만)**: B에서 `#` 링크(`location.hash`)와 `pushState`를 한 번씩 한 뒤 C로 이동하면 `history.length`는 4→7이다. 그 뒤 Back은 다음과 같다.
  - B가 준비를 늦게 보고할 때(세 번 모두 같음): Back 1은 B, Back 2·3은 화면이 그대로, Back 4는 A다. iframe 안에서 생긴 항목 하나마다 눈에 보이지 않는 Back이 한 번씩 든다.
  - B가 바로 준비를 보고했던 첫 실행: Back 3에서 C가 다시 나오고 `history.length`가 7→5로 줄었다. WebKit은 Back 4에서도 C였다. 지운 iframe의 기록 항목을 브라우저가 언제 정리하는지에 따라 결과가 달라진다.
  - 둘 다 브라우저 동작으로 받아들인다(위 'iframe 안 기록', 사용자 결정). 승격할 때 ARCHITECTURE 'Prototype page' 한계에 "iframe 안 `#` 링크와 `pushState`가 남긴 항목은 Back을 눈에 보이는 변화 없이 소비하거나, 순서를 예측할 수 없게 만든다"로 적는다.

## PoC 2 관찰(취소 판정 재설계)

2026-11-15, `node .scratch/prototype-link-export/poc2/poc.mjs`. 리뷰가 `<a href>`에 단 연결의 취소 누락을 거듭 찾아(자기 취소 뒤에는 캔버스의 취소를 구별할 수 없다), 사용자가 "자기 취소를 없앤다"를 골랐다. 같은 브라우저 조합(Chromium·WebKit, `file://`·http)에서 마우스, Enter, `element.click()`으로 시험했다.

- **`window.stop()`(실패)**: 기본 동작을 막지 않고, 0 ms 타이머에서 캔버스가 취소하지 않았으면 `window.stop()`으로 탐색을 중단하고 goto를 보냈다. `file://`은 모두 통과했지만 Chromium http에서 `#sec`·`other.html` 링크의 탐색이 타이머보다 먼저 커밋되어 iframe이 다른 문서로 바뀌었다(세 번 실행에서 1–4건, 경합). Navigation API는 이 opaque origin iframe에서 `navigate`를 내지 않아 막을 수 없었다.
- **href 떼기(채택)**: capture 리스너가 그 클릭에만 window 리스너를 하나 붙인다. 이 리스너는 bubble 단계에서 클릭 전에 등록된 캔버스 리스너 뒤에 돌고, 그때 가장 가까운 `<a>`·`<area>`의 `href`를 떼어 둔다. 브라우저의 활성화 동작은 따라갈 곳이 없으므로 탐색하지 않는다. 0 ms 타이머가 `href`를 되돌리고, 캔버스가 남긴 최종 `defaultPrevented`로 판단한다. isolate.js는 연결 클릭에 `preventDefault()`를 부르지 않는다. 그래서 취소 판정이 앱의 창과 같아진다.
  - 세 번 실행해 92개 경우가 모두 통과했다. 검사한 것: 연결이 goto를 보내고 iframe 문서와 바깥 페이지가 그대로인지(`#sec`, `other.html`, 느린 http URL), 캔버스 취소가 이동과 탐색을 모두 막는지(미리 저장한 native `preventDefault`, 클릭 중 설정한 `onclick`의 `return false`, `Object.preventExtensions` 뒤 취소), passive 리스너의 `preventDefault`가 취소로 세어지지 않는지, 클릭 중 href를 더해도 goto가 오는지(`element.click()`·마우스).
  - 실패 4건은 모두 href 없는 `<a>`에 Enter를 누른 경우다. 그런 링크는 포커스와 클릭을 받지 않으므로 앱의 창과 같은 브라우저 동작이고, 결함이 아니다.
  - 남는 한계: 클릭 중에 캔버스가 붙인 리스너 중 우리 리스너 뒤에 도는 것은 href가 떼어진 링크를 본다. href를 지켜보는 `MutationObserver`는 떼고 되돌리는 변화를 본다. 캔버스가 window bubble 전에 전파를 멈추면 href가 남아 지금처럼 탐색이 일어나고, 연결은 따라간다(새 iframe이 바꾼다).

## 순수 함수(`/tdd` 대상)

1. Go: 묶음과 시작 프레임으로 `Proto`를 만든다. 연결 없는 프레임은 한 프레임이고, 1,000개를 넘는 묶음도 끊지 않는다. 결과 필드도 함께 다룬다.
2. `prototype.js`
   - `resolveHash`: 빈 hash, `#%E0`, `#`·`%`·공백·비ASCII·200 UTF-16 id, `a%20b`와 `a b` 구분, 묶음 밖
   - goto 수락: 현재 iframe, `ready`, 첫 하나, 묶음 안·밖, 자기 프레임
   - `hashchange`와 `shown`
   - 프레임별 `nextPhase`·`phaseView`와 시한
   - 제목
3. `isolate.js` 연결 판단: 하위 2의 표 전부, `isolate.js` 자신의 `preventDefault` 제외, `<a href="#">` 위 연결.

## POSTMORTEM에서 가져온 함정

- 2026-11-14 'An eval check that compared a prototype export only with a regenerated one accepted the canvas viewer': X2는 기준 파일을 같은 CLI로 다시 만들어 비교하므로 viewer가 바뀌어도 통과한다. 그래서 이 하위의 테스트가 파일 모양을 직접 고정한다. 고정할 것은 프로토타입 페이지 표지, 묶음 JSON, 시작 프레임, 정적 `<title>`, `<noscript>`다.
- 2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`': 캔버스를 `<template>`에 넣지 않는 이유 중 하나다. `</script`·`<template/>`·`</template>`가 든 캔버스를 테스트한다.

## 영향

- 형식: `doan export --json` 결과에 필드 하나를 더한다. 기존 필드는 그대로다(§12). 내보낸 파일의 모양이 바뀐다(ARCHITECTURE 'Prototype page'). hash 형식은 공개 계약이다.
- 규약: 하위 1의 convention 15에 export 문장을 더한다.
- 구조 결정: 파일은 오프라인, 단일 파일, sandbox iframe(allow-same-origin 없음) 그대로다. 내보내기가 아무것도 올리지 않는다(PRODUCT §3 Out of scope 5).
- 성공 토스트 "The file also contains the rest of the canvas."의 뒷부분은 묶음을 담은 뒤에도 사실이므로 그대로 둔다.
- PoC 의존: 다음은 Chromium과 WebKit에서 시험한 적이 없다. 첫 작업에서 확인한다.
  - iframe을 다시 만들면서 바깥 hash로 브라우저 기록을 남기는 방식
  - sandbox iframe의 `window.name`
  - iframe 안 기록의 섞임
- `/agent-eval`: CLI 출력이 바뀌므로 X2를 돌린다. 가이드는 하위 2가 바꾼다.
