# prototype-late-frame — spec

## 사용자

- **사람**: 앱의 board에서 frame을 고르고 toolbar의 Play prototype이나 size bubble의 Play로 prototype window를 연다. export한 파일을 받은 사람은 export viewer의 board에서 Play로 player를 연다. board에서 보이고 Play가 켜진 frame은 재생되어야 한다.
- **agent**: `doan open --prototype`도 같은 prototype window에서 재생하므로 아래 유예가 똑같이 적용된다. 바뀌지 않는 것은 CLI의 수락 판정이다. `doan open --prototype`과 `doan export --prototype`은 지금처럼 파일을 기준으로 frame을 판정한다(ARCHITECTURE §1 convention 14).

## 문제

- 앱의 board와 export viewer의 board는 canvas 문서를 계속 지켜보며 live layout을 갱신한다. 그래서 `load` handler가 끝난 뒤에 script가 만든 frame(예: `fetch`를 기다린 뒤 그리는 canvas)도 layout에 나타나고, 표시가 유효하면 Play가 켜진다.
- 재생할 문서에 주입하는 script(`app/src/main/prototypeScript.ts`, export viewer에서는 같은 코드의 bundle과 `cli/internal/export/viewer/isolate.js`)는 DOMContentLoaded에, 그때 없으면 `load` handler가 끝난 직후에 한 번만 frame을 찾는다. 그 뒤에 생긴 frame은 `missing`으로 보고된다. 앱에서는 "Frame unavailable", export player에서는 frame이 없다는 문구가 뜬다.
- 결과적으로 board가 재생할 수 있다고 보여 준 frame이 재생되지 않는다(BACKLOG Known defects).

## 완료 조건

- DOMContentLoaded나 `load` handler 직후에 재생할 수 있는 frame을 찾은 경우의 동작과 보고 시점은 바뀌지 않는다. DOMContentLoaded에 id가 맞는 frame이 `duplicate`·`unmarked`·`invalid` 상태로 있으면 지금처럼 그 자리에서 보고한다.
- `load` handler가 끝났을 때 재생할 수 있는 target frame이 없으면, script는 바로 보고하지 않고 최대 2초 동안 문서를 지켜본다. script가 이미 `load`가 끝난 문서에 주입된 경우도 같다.
  - 그동안 target frame이 재생할 수 있는 상태(id가 하나뿐이고 표시가 유효함)가 되면 곧바로 `ready`를 보고하고 재생한다. window는 그동안 "Loading prototype" 상태다.
  - 2초가 끝나면 그 순간의 상태(`missing`·`duplicate`·`unmarked`·`invalid`)를 보고한다. 표시를 나중에 붙이거나 중복이 나중에 풀리는 canvas도 2초 안이면 재생된다.
- 보고는 run마다 한 번이다. 보고한 뒤에는 문서를 지켜보지 않는다. Frame unavailable 뒤의 동작(run을 멈추고 still을 보여 주는 것)은 지금 그대로다.
- host의 10초 init timer는 그대로다. timer는 iframe의 src를 정한 순간부터 재기 때문에, `load`가 8초 넘게 걸리고 frame이 끝내 없으면 지금의 "Frame unavailable" 대신 "Couldn’t start this prototype"이 뜰 수 있다. 이 변화는 받아들인다.
- export viewer의 player도 같은 규칙으로 재생한다. 늦게 찾은 frame에서도 `data-doan-goto` link가 동작한다.
- 2초보다 늦게 생기는 frame은 이번에도 재생되지 않는다. BACKLOG 항목은 이 범위로 줄여서 남긴다.
- 위 동작은 각각 unit test로 고정한다. 실제 앱과 export viewer에서도 짧게 확인한다(tasks 5).

## 비목표

- Frame unavailable을 보여 준 뒤 frame이 생기면 재생으로 바꾸는 복구. host 구조, window 상태, PRODUCT의 "a frame that fails or is lost stops running" 규칙, focus와 화면 읽기 프로그램 알림까지 바꿔야 해서 이번에는 하지 않는다.
- CLI의 `doan open --prototype`·`doan export --prototype`이 script가 만든 frame을 받아들이게 하는 것. 이 둘은 파일 기준 판정을 유지한다.
- prototype window의 frame drawer, link 이동, Back/Forward가 run 도중 새로 생긴 frame을 반영하는 것. drawer와 이동 대상은 지금처럼 RunMessage와 FramesMessage가 실어 온 목록을 쓴다.
- board에서 Play를 막는 방식. 이 방식은 채택하지 않았다.
