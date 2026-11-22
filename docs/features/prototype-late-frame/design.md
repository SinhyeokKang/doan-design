# prototype-late-frame — design

## 영향 받는 구성 요소

- **app (Electron + TS)**
  - `app/src/main/prototypeScript.ts`: `load` handler 직후(`finish(true)` 자리)와 `readyState === "complete"`로 주입된 경로에서, 재생할 수 있는 frame이 없으면 2초 유예로 들어간다.
    - 유예 중에는 `MutationObserver`가 document를 본다(`childList`, `subtree`, 그리고 `attributes` 중 `data-doan-frame`·`data-doan-prototype`). 변경이 몰려도 한 task에 한 번만 판정한다.
    - 판정 결과가 `ready`이면 바로 보고한다.
    - 2초 timer가 끝나면 그때의 `find(true)` 결과를 보고한다.
    - 보고하면 observer를 끊고 timer를 지운다.
    - DOMContentLoaded 판정과 `load` 뒤 FramesMessage는 바꾸지 않는다.
  - 파일 머리 주석(6–11행)의 판정 시점 설명을 고친다.
  - main(`windowState.ts`, `controller.ts`, `requests.ts`)과 renderer host(`host.ts`, `PrototypeWindow.tsx`)는 바꾸지 않는다. 보고는 run마다 한 번이고, 유예 중 phase는 `loading`이다.
    - 그동안 300ms 뒤 "Loading prototype" 덮개가 뜨고, 이전 run은 inert로 그 아래에 남는다(`PrototypeWindow.tsx` 278–284행, `host.ts` 49행).
- **export viewer (CLI에 embed된 JS)**
  - `cli/internal/export/viewer/viewerApp.js`는 `node app/scripts/viewerInspect.mjs`가 app TS에서 생성한다(`prototypeScriptSource`도 포함한다). 그래서 다시 생성하면 player의 run script에 유예가 들어간다.
  - `cli/internal/export/viewer/isolate.js`: player의 frame 격리와 link 이동은 이 파일의 `playing`에 달려 있다(`isolate.js` 71–73, 184–195행). run script만 유예를 받으면, 늦게 찾은 frame에서 run script는 `ready`를 보내지만 isolate.js는 이미 `missing`으로 끝나 link가 동작하지 않는다. 그래서 isolate.js의 `finish`에도 같은 2초 유예와 판정 규칙을 넣고, 182–183행 주석을 고친다.
  - `cli/internal/export/viewer/player.js`: 바꾸지 않는다. 보고가 run마다 한 번인 것은 그대로다.
  - export digest: viewer asset이 바뀌면 `cli/internal/export/output_test.go`의 고정 digest가 바뀐다. `go test ./cli/internal/export/`가 알려 주는 새 값으로 갱신한다. 같은 파일을 바꾸는 다른 PR과 겹치면 나중에 merge되는 쪽이 다시 맞춘다.
- **CLI (Go)·skills·formats**: Go 코드 변경 없음. guide(`cli/internal/cli/skill.md`)에는 판정 시점 문장이 없다(확인함).

## 순수 함수로 분리할 부분 (`/tdd` 대상)

주입 script와 isolate.js는 import할 수 없는 자립 script라, 함수로 떼지 않고 script 단위로 시간을 제어해 테스트한다.

- `prototypeScript`: `app/src/main/prototypeScript.test.ts`는 `node:vm` 위의 fake document를 쓴다. 지금 fake의 `setTimeout`은 delay를 무시하고 한꺼번에 비우고, `MutationObserver`가 없다. 테스트를 쓰기 전에 harness에 두 가지를 넣는다.
  - delay를 지키는 fake timer.
  - 변경을 기록해 두었다가 알리는 fake `MutationObserver`.

  확인할 경우:
  - `load` 뒤 2초 안에 생긴 frame은 `ready` 하나만 보낸다.
  - 2초 안에 생긴 표시 없는 frame에 2초 안에 표시가 붙으면 `ready`.
  - 2초 끝까지 없으면 `missing` 하나, 표시가 없으면 `unmarked` 하나, 중복이면 `duplicate` 하나.
  - target이 아닌 frame만 생기면 2초 끝에 `missing`.
  - 보고한 뒤에 생긴 frame에는 아무것도 보내지 않는다(observer와 timer 해제).
  - DOMContentLoaded나 `load` 직후에 찾은 경우의 메시지 순서(RunMessage, FramesMessage)는 그대로다.
  - `readyState === "complete"` 주입 경로에도 유예가 적용된다.
- `isolate.js`: 테스트는 `app/src/main/exportViewer.test.ts`에 있다("plain browser scripts… held to the app's behaviour"). 같은 경우를 확인하고, 늦게 찾은 frame에서 link 클릭이 goto를 보내는지 확인한다.
- 두 script의 2초 literal이 같다는 것을 test로 고정한다(POSTMORTEM 2026-10: 주입 script가 되풀이한 상수는 주석만으로 묶지 않는다).

## 형식 변경

없다. RunMessage의 모양과 run마다 한 번이라는 횟수는 그대로다. JSON Schema 대상도 아니다(ARCHITECTURE §11).

## 규칙 영향

- ARCHITECTURE §1 convention 14의 "a frame a script creates while the document parses or in its `load` handlers can play, one created later cannot"가 바뀐다. 새 문장: `load` handler가 끝난 뒤 2초 안에 재생할 수 있게 된 frame도 재생한다.
- §3 'Prototype window' 'Rendering in place'의 "It finds the frame at DOMContentLoaded, else after the `load` handlers"와 export 'Isolation'의 "as the app's prototype window finds it"도 같이 고친다.
- §3 'Reports'의 "posts one result"는 그대로 맞다.
- `doan check` 규칙은 추가하지 않는다.
- PRODUCT §5 item 2 'Prototype window' 상태 문단(PRODUCT.md:333)에서 이 변경으로 틀려지는 문장은 없다. Loading, Frame unavailable, "stops running"이 모두 그대로다. tasks 6에서 다시 확인한다.

## 결정 영향

- sandbox iframe·serving 범위(§3 'Canvas rendering')는 그대로다. 주입 script는 지금처럼 run의 문서 안에서만 동작한다.
- POSTMORTEM 2026-11의 deferred decision(문서가 떠날 수 있으면 `beforeunload`에서도 결정한다): 앱의 prototype window는 canvas 문서의 navigation을 모두 거절한다(`prototypeFrame.ts`). 그래서 유예 중에 문서가 떠나는 일이 없다. export player에서는 문서가 떠날 수 있다. 하지만 player는 현재 iframe window의 메시지만 받는다(`event.source` 검사, `player.js` 583행 근처). 그래서 떠난 문서가 늦게 보낸 보고는 버려지고, 새 문서가 다시 판정한다. 떠날 때 따로 결정할 필요가 없다는 것을 exportViewer test로 확인한다.
- POSTMORTEM 2026-11-01(viewport box는 frame 안에서 잰 값을 쓰지 않는다): 늦게 `ready`가 와도 box는 mark로만 정해지므로 영향이 없다.
- 비용: observer는 최대 2초 동안만 살아 있고 보고하면 끊는다.

## PoC 의존

없다. 유예 중에는 phase가 `loading`이라 iframe과 message 경로가 지금 그대로 살아 있다. 이 점은 리뷰에서 `host.ts`의 `layersForView`·`currentRun`으로 확인했다.
