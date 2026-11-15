# prototype-link-export — spec

상위 feature [prototype-frame-links](../prototype-frame-links/spec.md)의 하위 3이다. 프로토타입 내보내기가 연결된 프레임 묶음 전체를 한 파일에 담고, 내보낸 파일이 브라우저에서 연결을 따라 프레임을 바꾼다. 하위 1(`prototype-link-convention`)의 묶음 계산과 하위 2(`prototype-link-play`)의 연결 동작 위에 선다. 상위 문서의 공통 결정을 따르고, 상위 문서는 고치지 않는다.

## 사용자

- **보내는 사람**: 프로토타입 창에서 Export로 흐름 전체를 한 파일로 저장해 보낸다. 토스트로 몇 개 프레임이 함께 들어갔는지 안다.
- **받는 사람**: 브라우저에서 연결을 눌러 화면을 오가고, 브라우저 Back과 Forward로 돌아간다.
- **에이전트**: `doan export --frame <id> --prototype`으로 같은 파일을 만들고, 응답의 새 필드로 함께 든 프레임 수를 사람에게 알린다.

## 문제

- 내보낸 프로토타입 파일은 프레임 하나만 재생한다. `isolate.js`가 `const FRAME = <json>;` 하나로 그 프레임만 남기고, 다른 요소를 영구히 숨긴다(`cli/internal/export/viewer/isolate.js:61-84`). 그래서 하위 2가 병합된 뒤에는 연결이 창에서는 동작하고 파일에서는 아무 일도 하지 않는다.
- `isolate.js`는 `#` hash 링크 말고 모든 링크 클릭에 `preventDefault()`를 부른다(`:44-57`).

## 완료 조건

1. 창의 Export와 `doan export --frame <id> --prototype`이 같은 파일을 만든다.
   - 파일은 그 프레임이 속한 묶음(하위 1 `LinkGroups`)의 모든 프레임을 담고, `<id>` 프레임에서 시작한다.
   - 연결 없는 프레임이면 지금처럼 그 프레임 하나다.
   - 명령의 인자, 오류 코드, 기존 응답 필드는 바뀌지 않는다.
   - `--json` 응답에 함께 든 프레임 수 필드를 더한다(사용자 결정). 이름은 design.md가 정한다.
2. 프로토타입 창의 Export 성공 토스트가 연결 프레임 수를 말한다. 예: "Exported “<frame>” and 2 linked frames." 연결이 없으면 지금 문구다. 문구는 구현 때 사용자가 확인한다.
3. 파일 이름은 지금과 같다(`<canvas file stem>-<frame id>.html`, 시작 프레임).
4. 내보낸 파일에서 연결은 하위 2 완료 조건 1–5와 같이 판단한다.
   - 클릭을 만드는 모든 입력이 해당한다(`element.click()` 포함).
   - 캔버스 스크립트의 `preventDefault()`는 이동을 막는다. `stopPropagation()`·`stopImmediatePropagation()`은 막지 않는다. 파일 자신(`isolate.js`)이 링크에 부르는 `preventDefault()`는 세지 않으므로, `<a href>`에 단 연결도 이동한다.
   - 눌린 요소에서 가장 가까운 연결 하나만 따른다. shadow root 안과 중첩 iframe 안은 세지 않는다.
   - 연결은 재생 중인 프레임 안에 있어야 한다.
   - 자기 프레임으로 가는 연결은 처음부터 다시 시작한다. hash 기록은 남기지 않는다.
   - 값이 200 UTF-16 단위를 넘거나 대상이 재생할 수 없으면 아무 일도 하지 않는다. 파일에는 토스트가 없다.
   - 대상은 새로 시작한다.
5. 이동은 바깥 페이지의 hash에 기록된다.
   - hash 형식은 `#<encodeURIComponent(id)>`이고 공개 계약이다. 받는 사람이 북마크할 수 있다.
   - 처음 열 때와 hash가 바뀔 때 같은 규칙으로 프레임을 고른다. hash가 비었거나, 디코딩에 실패하거나, 묶음 밖이면 시작 프레임이다. 처음 열 때 주소를 지금 프레임의 hash로 맞추되 기록을 늘리지 않는다.
   - 브라우저 Back과 Forward가 프레임을 따라가고, 돌아간 프레임도 새로 시작한다. Back을 한 번 누르면 한 프레임 돌아가고, 첫 프레임을 지나면 파일을 떠난다.
   - 새로고침하면 보고 있던 프레임에서 다시 시작한다.
   - 파일에 헤더나 버튼은 더하지 않는다.
6. 이동하는 동안에는 이전 프레임을 보인 채 둔다(사용자 결정). 새 프레임이 준비되거나 10초가 지나면 바뀐다. 이전 프레임의 입력과 메시지는 버린다.
7. 이동하면 다음이 따라간다.
   - 탭 제목과 iframe의 `title`이 새 프레임을 따른다. 시작 프레임의 정적 `<title>`과 `<noscript>` 문구는 지금 모양 그대로다(X2가 이 표지를 확인한다).
   - 이동할 때 포커스가 iframe 안에 있었으면, 새 iframe이 준비된 뒤 그 iframe이 포커스를 받는다.
8. 로딩 실패 문구("This prototype’s frame didn’t load…")와 10초 시한은 이동한 프레임마다 다시 적용된다.
9. 파일 크기 한도(50 MiB)와 오프라인 동작은 지금과 같다. 캔버스는 한 번만 담는다.
10. 캔버스 export(viewer)의 출력은 바이트 그대로다(`TestExportOutputIsPinned`, `TestAssembleOutputIsPinned`). 프로토타입 export는 바이트가 바뀌지만 연결 없는 프레임의 동작은 그대로다. `TestAssemblePrototypeOutputIsPinned`와 관련 테스트는 의도적으로 갱신한다.
11. 정적 판단과 live 판단의 차이를 문서에 적는다.
    - 파일의 묶음은 Go가 파일만 보고 계산한다. 그래서 스크립트가 단 연결은 창에서는 이동하고 파일에서는 이동하지 않을 수 있다.
    - 창 서랍의 1,000개 한도와 달리 파일은 묶음을 끊지 않는다.
12. iframe 안의 hash 링크와 `pushState`가 남기는 기록이 프레임 이동 기록과 섞이는 것은 브라우저 동작으로 받아들인다. PoC에서 관찰한 동작을 ARCHITECTURE 'Prototype page'의 한계에 적는다.
13. 가이드에 "plays only that frame" 문장이 없다. 하위 2가 고친다(사용자 결정). 이 하위는 문장이 없는지만 확인한다.
14. `/agent-eval` X2가 통과한다. CLI 출력에 필드가 더해지므로 돌린다. X2 seed에는 연결이 없고, rubric의 "only the phone frame plays"도 여전히 맞으므로 새 id는 필요 없다.

## 하지 않는 것

- 파일 안의 프레임 목록, 헤더, Back 버튼(상위 결정 7).
- 묶음 여럿을 한 파일에 담는 것. 끊긴 묶음은 따로 내보낸다.
- 캔버스 export viewer(`viewer/shell.js`)에서의 연결.
- 프로토타입 창의 연결 동작. 하위 2가 한다.
- 가이드 문장 변경. 하위 2가 한다.
- Safari 결과로 병합을 막는 것. 사용자가 한 번 확인하고, 문제가 있으면 그때 정한다.
