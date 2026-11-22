# prototype-late-frame — spec

## 사용자

- **사람**: 앱의 board에서 frame을 고르고 toolbar의 Play prototype이나 size bubble의 Play로 prototype window를 연다. board에서 보이고 Play가 켜진 frame은 prototype window에서도 재생되어야 한다.
- **agent**: 바뀌는 것이 없다. `doan open --prototype`과 `doan export --prototype`은 지금처럼 파일을 기준으로 판정한다(ARCHITECTURE §1 convention 14).

## 문제

- board는 canvas 문서를 계속 지켜보며 live layout을 갱신한다. 그래서 `load` handler가 끝난 뒤에 script가 만든 frame(예: `fetch`를 기다린 뒤 그리는 canvas)도 layout에 나타나고, 표시가 유효하면 Play가 켜진다.
- prototype window의 주입 script(`app/src/main/prototypeScript.ts`)는 DOMContentLoaded에, 그때 없으면 `load` handler가 끝난 직후에 한 번만 frame을 찾는다. 그 뒤에 생긴 frame은 `missing`으로 보고되어 "Frame unavailable"이 뜬다.
- 결과적으로 board가 재생할 수 있다고 보여 준 frame이 재생되지 않는다(BACKLOG Known defects).

## 완료 조건

- `load` handler가 끝났을 때 target frame이 없으면, 주입 script는 바로 `missing`을 보내지 않고 최대 2초 동안 문서를 지켜본다. 그동안 target frame이 생기면 그 frame을 `ready`로 보고하고 재생한다. window는 "Loading prototype" 상태를 유지한다.
- 2초가 지나도 frame이 없으면 지금처럼 `missing`을 보내 "Frame unavailable"을 보여 준다.
- `missing`을 보낸 뒤에도 script는 같은 run이 살아 있는 동안 문서를 계속 지켜보고, target frame이 생기면 `ready`를 보낸다. main은 같은 gen에서 `missing` 다음에 오는 `ready`를 받아 window를 재생 상태로 바꾼다. window는 앞으로 나오지 않는다(PRODUCT §5 item 2 'Prototype window'의 복원 규칙과 같다).
- `duplicate`·`unmarked`·`invalid`는 지금처럼 처음 보고된 상태로 끝난다. 이 상태들 뒤에는 `ready`가 오지 않는다.
- `load` 전에 frame을 찾는 경우(DOMContentLoaded 또는 `load` 직후)의 동작과 보고 시점은 바뀌지 않는다.
- host의 10초 init timer는 그대로다. 문서가 10초 안에 아무것도 보고하지 않으면 지금처럼 "Couldn’t start this prototype"이 뜬다.
- 같은 주입 script를 bundle로 쓰는 export viewer의 player(`cli/internal/export/viewer/viewerApp.js`, `player.js`)가 `missing` 뒤의 `ready`를 받아도 잘못된 상태에 빠지지 않는다. 동작은 tests로 고정한다.
- 위 동작이 각각 unit test로 고정되고, 실제 앱에서 `load` 뒤 500ms에 frame을 만드는 canvas와 3초 뒤에 만드는 canvas로 짧게 확인한다.

## 비목표

- CLI의 `doan open --prototype`·`doan export --prototype`이 script가 만든 frame을 재생하게 하는 것. 이 둘은 파일 기준 판정을 유지한다.
- export viewer와 prototype file(`cli/internal/export/viewer/isolate.js`)의 판정 범위를 넓히는 것. 두 곳 모두 파일에 있는 frame만 재생한다(ARCHITECTURE §1 convention 15, §3 'Exported canvas and viewer').
- prototype window의 frame drawer가 run 도중 새로 생긴 frame을 계속 반영하는 것. drawer는 지금처럼 결과 보고와 `load` 직후 보고 때의 목록을 쓴다. 늦게 생긴 target이 `ready`로 보고되면 그때 목록으로 갱신된다.
- board에서 Play를 막는 방식. 이 방식은 채택하지 않았다.
