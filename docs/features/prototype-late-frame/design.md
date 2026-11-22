# prototype-late-frame — design

## 영향 받는 구성 요소

- **app (Electron + TS)**
  - `app/src/main/prototypeScript.ts`: `load` 직후 찾지 못했을 때 2초 유예와 그 뒤의 관찰을 추가한다. 관찰은 `MutationObserver`(document, `childList`·`subtree`·`attributes` 중 `data-doan-frame`)로 하고, 변경이 몰려도 한 task에 한 번만 `find`를 돌린다. target을 찾으면 observer를 끊는다.
  - `app/src/main/prototype/ipc.ts`: `RunMessage`·`prototype:result` 주석의 "once per run"을 바꾼다. 한 run은 결과를 한 번 보내고, 그 결과가 `missing`이면 `ready`를 한 번 더 보낼 수 있다.
  - `app/src/main/prototype/windowState.ts` `report()`: 지금은 `phase === "loading"`일 때만 받는다. 같은 gen이고 phase가 `frame-unavailable`이며 마지막 lost 상태가 `missing`일 때 `ready`도 받아 `ready`로 바꾼다. lost 상태를 구분하려면 state에 마지막 lost 상태를 담는다(`duplicate`도 `frame-unavailable`이라 phase만으로는 구분할 수 없다).
  - `app/src/renderer/prototype/host.ts`·`PrototypeWindow.tsx`: host가 같은 gen의 두 번째 결과도 main에 전달하는지 확인하고, 막혀 있으면 연다. 10초 timer는 loading phase에만 걸리므로 바꾸지 않는다.
  - controller의 still 처리: lost에서 ready로 돌아갈 때 still과 덮개가 지금의 "같은 frame이 돌아오면 다시 재생" 경로와 같게 동작하는지 tests로 확인한다.
- **export viewer (CLI에 embed된 JS)**
  - `cli/internal/export/viewer/viewerApp.js`는 app TS에서 생성한 bundle이라 주입 script 변경을 그대로 받는다. `node app/scripts/viewerInspect.mjs`로 다시 생성한다.
  - `cli/internal/export/viewer/player.js`: 파일에 없는 frame은 실행 전에 거절하므로 늦게 생기는 경우는 드물다. 그래도 `missing` 뒤에 오는 `ready`를 무시할지 받을지 정하고 tests로 고정한다. 앱과 같게 받는 쪽이 자연스럽다.
  - `cli/internal/export/viewer/isolate.js`: 판정은 바꾸지 않는다(비목표). "as the app's prototype window finds it" 주석은 사실과 달라지므로 고친다.
- **CLI (Go)·skills·formats**: 변경 없음.

## 순수 함수로 분리할 부분 (`/tdd` 대상)

- `windowState.report()`: `missing` 뒤의 `ready` 수락, `duplicate`·`unmarked`·`invalid`·`ready` 뒤의 두 번째 결과 거절, 다른 gen 거절.
- `prototypeScript`: jsdom에서 시간을 제어해 다음을 확인한다.
  - `load` 뒤 2초 안에 생긴 frame은 `missing` 없이 `ready` 한 번만 보낸다.
  - 2초 뒤에는 `missing`, 그 뒤에 frame이 생기면 `ready`.
  - `load` 전에 찾은 경우의 메시지 순서는 그대로다.
  - target이 아닌 frame이 생기면 아무것도 보내지 않는다.
  - 찾은 뒤에는 observer를 끊는다.
- export player의 결과 처리(`player.js`의 해당 함수): `missing` 뒤의 `ready`.

## 형식 변경

없다. `RunMessage`의 모양은 그대로이고, 같은 gen에서 보낼 수 있는 횟수만 바뀐다. 이 메시지는 window 내부 IPC라 JSON Schema 대상이 아니다(ARCHITECTURE §11).

## 규칙 영향

ARCHITECTURE §1 convention 14의 "a frame a script creates while the document parses or in its `load` handlers can play, one created later cannot" 문장이 바뀐다. 새 규칙: window는 `load` handler 뒤에도 frame을 찾는다. 2초 안에 생기면 그대로 재생하고, 그 뒤에 생기면 Frame unavailable을 보여 준 다음 재생으로 바꾼다. `doan check` 규칙은 추가하지 않는다. guide에 같은 문장이 있으면 함께 고친다(마지막 task).

## 결정 영향

- sandbox iframe·serving 범위(§3 'Canvas rendering')는 그대로다. 주입 script는 지금처럼 run의 문서 안에서만 동작한다.
- POSTMORTEM 2026-11 "a script in a canvas document that defers a decision to a later task must decide in `beforeunload` too when the document may navigate away": 2초 유예도 다음 task로 미루는 결정이다. 다만 문서가 떠나면 run의 iframe이 사라지고, host는 현재 iframe의 window만 받는다. 그래서 떠난 문서의 늦은 `missing`은 버려진다. 유예 중에 문서가 떠나면 아무것도 보내지 않는 것이 맞는지 tests로 확인한다.
- POSTMORTEM 2026-10 "injected scripts repeated message caps tied only by comments": 유예 시간 2초는 주입 script 안의 literal이다. main 쪽에 같은 값이 필요하지 않으므로 상수를 공유하지 않는다. 다만 10초 init timer보다 짧아야 한다는 조건은 test로 고정한다.
- POSTMORTEM 2026-11-01(viewport box는 frame 안에서 잰 값을 쓰지 않는다): 늦게 `ready`가 와도 box는 mark로만 정해지므로 영향이 없다.

## PoC 의존

없다. `load` 뒤에 생기는 frame은 board가 이미 보여 주고 있고, lost run의 iframe이 살아 있다는 것은 `report()`의 lost 분기에 kill effect가 없다는 점에서 확인했다.
