# prototype-link-export — design

조사 근거는 상위 [design.md](../prototype-frame-links/design.md) '조사' '내보내기'에 있다. 줄 번호는 2026-11-14 develop 기준이다.

## 바뀌는 곳

- CLI(Go)
  - `cli/internal/cli/export.go`(76–105행 근처): `canvas.PrototypeTarget`로 시작 프레임을 판단한다(지금과 같음). 그다음 하위 1의 `LinkGroups`로 묶음을 얻어 `export.Proto`에 넘긴다.
  - `cli/internal/export/assemble.go` `AssemblePrototype`(78–124행): `Proto`가 시작 프레임과 묶음(`[]{ID, Title}`)을 가진다.
  - `cli/internal/export/viewer/isolate.js`, `prototype.js`, `prototype.html`: 프레임 전환.
- 앱: 창의 Export는 CLI를 부르므로(`cli.ts:63-67`) 코드가 바뀌지 않는다. `ExportTarget`(`prototype/ipc.ts:231-235`)과 `exportTargetMatches`는 시작 프레임 하나를 비교하는 그대로다.
- 테스트: `app/src/main/exportViewer.test.ts`(1161–1510행: `isolate.js`와 `prototypeScript.ts`의 격리 시트·KEEP 목록 드리프트, 동작 테스트), Go export 고정 테스트.
- 문서(승격): PRODUCT §1 In scope 8과 §5 item 3 'Export and viewer', ARCHITECTURE §3 'Prototype window' 'Export'와 'Exported canvas and viewer' 'Prototype page', §12.

## 프레임 전환 방식

지금 격리는 형제 요소를 영구히 숨기므로 같은 문서 안에서 프레임을 바꿀 수 없다. 또 "새로 시작"이 결정이므로, 이동마다 iframe을 다시 만든다.

- 바깥 페이지(`prototype.js`)가 캔버스 HTML을 한 번만 가진다. 지금은 `srcdoc` 속성에 들어 있다. 이것을 바깥 페이지의 비활성 `<template>`이나 JSON 문자열로 옮긴다.
- 이동할 때 새 iframe(`sandbox="allow-scripts allow-forms"`, 지금과 같음)을 만들고, 그 `srcdoc`를 `const FRAME = <id>;` + `isolate.js` + 캔버스 HTML로 채운다. 지금 `assemble.go`가 head 맨 앞에 넣는 방식과 같다.
- `isolate.js`는 하위 2의 주입 스크립트처럼 연결 클릭을 판단한다: capture 기록, `setTimeout(0)` 뒤 `defaultPrevented`, 가장 가까운 연결, 재생 중인 프레임 안. 이동할 때 `{type:"doan-prototype", goto:<값>}`를 바깥에 보낸다.
- 바깥 페이지는 다음 차례로 처리한다.
  - 메시지를 받는다. 지금처럼 iframe의 창이고 origin이 `"null"`인 메시지만 받는다.
  - 값이 묶음에 있는지 확인한다.
  - `location.hash`를 `#<인코딩한 id>`로 바꾸고 새 iframe을 띄운다.
  - `hashchange`에서 묶음 안의 프레임이면 그 프레임을 새로 띄운다. 그래서 브라우저 Back과 Forward가 동작한다.
  - 같은 프레임이면 hash를 바꾸지 않고 새로 띄운다.
- 처음 열 때: hash가 묶음 안 프레임이면 그 프레임, 아니면 시작 프레임이다.
- 묶음 정보(id, 제목)는 바깥 페이지에 JSON으로 넣는다. 캔버스는 한 번만 담으므로 크기는 거의 늘지 않는다.
- iframe을 다시 만드는 대신 `srcdoc`만 바꿔도 같은 효과일 수 있다. 구현이 정하되 "새로 시작"과 이전 iframe의 메시지 무시를 지킨다. 메시지는 현재 iframe의 창에서 온 것만 받는다.
- **드리프트**: `isolate.js`의 연결 판단과 하위 2의 `prototypeScript.ts` 판단이 같아야 한다. `exportViewer.test.ts`의 드리프트 테스트에 연결 판단 경우를 더한다(하위 1 fixture `placements` 재사용).

## 순수 함수(`/tdd` 대상)

1. Go: 묶음과 시작 프레임으로 `Proto`를 만드는 부분, 연결 없는 프레임은 한 프레임.
2. `prototype.js`의 상태 전이:
   - `nextPhase`·`phaseView`를 프레임마다 다시 시작한다.
   - hash를 해석한다. 인코딩, 묶음 밖, 빈 hash를 다룬다.
   - 이동을 판단한다. 묶음 안, 밖, 같은 프레임을 다룬다.
   - 메시지를 받아들인다. 이전 iframe의 메시지는 버린다.
3. `isolate.js`의 연결 판단(fixture 비교).

## POSTMORTEM에서 가져온 함정

- 2026-11-14 'An eval check that compared a prototype export only with a regenerated one accepted the canvas viewer': X2가 기준 파일을 같은 CLI로 다시 만들어 비교하므로, viewer가 바뀌어도 통과한다. 그래서 이 하위의 테스트가 파일 모양(프로토타입 페이지 표지, 묶음 JSON, 시작 프레임)을 직접 고정한다.
- 2026-11-09 'Export inlined the wrong file after a nested self-closing `<template/>`': 캔버스 HTML을 바깥 페이지의 `<template>`에 넣는다면, 캔버스 안의 `</template>`나 `<template/>`가 바깥 템플릿을 일찍 닫을 수 있다. JSON 문자열(스크립트 안 `</script` 이스케이프)로 넣는 쪽이 안전하다. 어느 쪽이든 그 경우를 테스트한다.

## 영향

- 형식: CLI 응답(`doan export --json`)은 그대로다. 내보낸 파일의 모양이 바뀐다(ARCHITECTURE 'Prototype page').
- 규약: 없음.
- 구조 결정: 파일은 오프라인, 단일 파일, sandbox iframe 그대로다. 내보내기가 아무것도 올리지 않는다(PRODUCT §3 Out of scope 5).
- PoC 의존: `srcdoc` iframe을 다시 만들면서 바깥 페이지 hash로 브라우저 기록을 남기는 방식은 Chrome과 Safari에서 시험한 적이 없다. 첫 작업에서 짧게 확인한다(로컬 파일 `file://`과 웹 서버 두 경우).
- `/agent-eval`: 가이드와 CLI 출력, `doan check`가 바뀌지 않는다. X2를 한 번 돌려 통과를 확인한다(완료 조건 10).
