# prototype-link-play — spec

상위 feature [prototype-frame-links](../prototype-frame-links/spec.md)의 하위 2다. 프로토타입 창에서 `data-doan-goto` 연결을 눌러 프레임을 옮기고, 프레임 서랍을 묶음별로 보이고, main 창 툴바 Play를 바꾸고, 에이전트가 연결을 쓰게 가이드를 바꾼다. 하위 1(`prototype-link-convention`)의 규약, 규칙, '재생 가능한 프레임' 정의, 묶음 계산 위에 선다. 상위 문서의 공통 결정을 따르고, 상위 문서는 고치지 않는다.

## 사용자

- **사람**:
  - 프로토타입 창에서 연결을 눌러 여러 화면을 오간다.
  - 프레임 서랍에서 연결된 프레임을 묶음으로 본다.
  - main 창에서는 프레임을 고르지 않고도 툴바 Play로 프로토타입을 연다.
- **에이전트**: 가이드에서 `data-doan-goto`를 배워 화면 사이의 이동을 쓰고, `doan check`로 확인한다.

## 문제

- PRODUCT §5 item 2 'Prototype window'가 "frames do not link to each other"라고 정했다. 다른 프레임은 프레임 서랍으로만 고른다.
- 툴바 Play는 Select에서 마크된 프레임 자체를 골랐을 때만 동작한다(PRODUCT §5 item 2 'Play controls', `app/src/main/prototype/playability.ts`). 프로토타입을 열려면 먼저 그 프레임을 찾아 골라야 한다.
- 가이드가 연결을 모르므로 에이전트가 쓰지 않는다.

## 완료 조건

### 프로토타입 창의 연결

1. 재생 중인 프레임 안에서 `data-doan-goto`가 있는 요소나 그 안의 요소에 클릭이 일어나면 창이 대상 프레임으로 바뀐다. 사람의 클릭, Enter·Space처럼 클릭을 만드는 입력, 캔버스 스크립트의 `element.click()`이 모두 해당한다(사용자 결정).
   - 대상은 새로 시작한다.
   - 창은 대상의 마크 크기에 맞춘다(프레임 서랍으로 고를 때와 같다). 이동이 창을 앞으로 가져오거나 숨긴 앱을 보이지는 않는다.
   - 이동은 Back과 Forward 기록에 남는다.
   - 클릭 때 포커스가 프레임 안에 있었으면, 새 프레임이 준비된 뒤 그 프레임이 포커스를 받는다. 실패하거나 잃으면 지금 상태 화면의 포커스 규칙을 따른다.
   - 스크린리더에는 새 프레임 이름을 한 번 알린다.
2. 캔버스 스크립트가 그 클릭에 `preventDefault()`를 부르면 이동하지 않는다. 스크립트가 `stopPropagation()`이나 `stopImmediatePropagation()`만 불러도 이동은 된다.
3. 요소가 여러 연결 안에 있으면 눌린 요소에서 가장 가까운 연결 하나만 따른다. shadow root 안과 프레임 안의 iframe 안은 세지 않는다(하위 1의 정적 규칙과 같다).
4. 자기 프레임으로 가는 연결은 그 프레임을 처음부터 다시 시작한다. Back과 Forward 기록에는 남기지 않는다(Reload prototype과 같다).
5. 대상이 재생할 수 없으면 이동하지 않고 창에 토스트를 보인다. 재생할 수 없는 경우는 하위 1 정의대로다(빈 값, 프레임 없음, id 공유, id 200 UTF-16 초과, 마크 없음 또는 틀림, 1,000번째 뒤의 프레임).
   - 문구: "Can’t go to “<id>”. Ask your agent to fix this link." 초안에서 확정한다.
   - 토스트는 슬롯 하나를 바꿔 쓰므로 연달아 눌러도 하나만 보인다.
   - export 진행이나 결과 토스트가 보이는 동안에는 띄우지 않는다.
   - 로딩 중이거나 실패·잃음 상태에서 누른 연결은 아무 일도 하지 않고 토스트도 없다.
6. 이동한 뒤 다음이 새 프레임을 따른다.
   - 창 제목
   - 프레임 서랍의 "Playing" 행
   - 대화 패널이 메시지에 붙이는 "재생 중인 프레임" 칩
   대화 패널의 대화는 바뀌지 않는다(같은 캔버스).

### 프레임 서랍(프로토타입 창)

세 서랍(main 창 헤더, 프로토타입 창, 툴바)은 지금 있는 행을 같은 표시로 보인다(사용자 결정). 글자 "Viewing"·"Playing" 대신 14px lucide Eye 아이콘(metadata 잉크)을 두고, 그 단어는 스크린리더용 글자로 남긴다. `aria-current="location"`은 그대로다. main 창 서랍의 "Prototype" 캡션은 글자 그대로다.


7. 프레임 서랍이 재생 가능한 프레임을 묶음별로 보인다(하위 1의 `linkGroups`).
   - 서랍은 연결된 묶음(프레임 둘 이상)을 먼저 첫 프레임의 문서 순서로 보이고, 그 뒤에 연결 없는 프레임 전부를 문서 순서로 한데 보인다(사용자 결정). 서랍 표시 규칙이고, 하위 1의 묶음 계산은 그대로다. 묶음 안의 순서는 문서 순서다.
   - 묶음마다 `role="group"`이다. 접근성 이름은 연결된 묶음이 "<첫 프레임> and N more", 연결 없는 프레임들이 "Frames without links"다.
   - 시각적 구분선은 `aria-hidden`이고 묶음 사이에만 있다. 묶음이 하나뿐이면 구분선이 없다.
   - 화살표, Home·End, 타입어헤드는 묶음을 넘어 보이는 순서대로 움직인다. 열 때의 포커스는 지금과 같다(Playing 행, 없으면 첫 행).
   - 모양과 재생 중인 묶음 표시는 초안에서 정한다.
   - 1,000번째 뒤의 프레임은 목록에 없다(지금 한계와 같다).

### main 창 툴바 Play

8. 툴바 Play는 다음처럼 동작한다(사용자 결정). 위의 행부터 판단한다.

   | 조건 | 결과 |
   |---|---|
   | 캔버스를 보일 수 없거나 아직 읽는 중 | 비활성. 이유: "Play isn’t available while the canvas can’t be shown." |
   | pick 중 | 비활성. 이유: pick을 끝내라는 문구 |
   | capture 중 | 비활성. 이유: capture를 끝내라는 문구 |
   | 재생 가능한 프레임이 없음 | 비활성. 이유: "No frames in this canvas are marked for prototyping." |
   | 재생 가능한 프레임 자체를 골랐음 | 그 프레임을 재생 |
   | 요소나 마크 없는 프레임을 골랐고, 그것을 감싼 재생 가능한 프레임이 있음 | 가장 안쪽 프레임을 재생 |
   | 그 밖(선택 없음, 감싼 프로토타입이 없음, 고른 프레임의 마크가 깨짐) | 툴바 버튼에서 프레임 서랍이 열림 |

   - Hand도 Select와 같다.
   - 툴바 서랍은 완료 조건 7의 서랍과 같은 본문이다(재생 가능한 프레임만, 묶음별).
   - 서랍에서 고르면 재생만 한다. main 창의 선택, 보기, `doan active`는 바뀌지 않는다.
   - 프로토타입 창이 이 캔버스의 프레임을 재생 중이면 툴바 서랍에서도 그 행이 Playing이고 탭 자리를 가진다. 아니면 Playing이 없고 첫 행이 탭 자리를 가진다(사용자 결정).
   - 1,000번째 뒤의 프레임은 서랍에 없다.
   - 문구는 초안에서 확정한다.
9. 툴바 버튼의 접근성 이름은 늘 "Play prototype"이다. 툴팁과 접근성 설명만 상태마다 바뀐다.
   - 재생: `Play “<frame>”`
   - 서랍: "Choose a prototype to play". 고른 프레임에 마크가 있지만 재생할 수 없으면(마크가 틀림, id 공유, id 200 UTF-16 초과) `“<frame>” can’t play. Choose a prototype to play.`(사용자 결정). 마크가 없는 프레임은 이 문구를 쓰지 않는다.
   - 비활성: 위 이유
   - 서랍 상태에서는 `aria-haspopup`과 `aria-expanded`가 있고, 다른 상태에서는 없다. 버튼은 상태가 바뀌어도 같은 요소다.
10. 툴바 서랍이 열려 있는 동안 키는 다음처럼 동작한다.
    - 수식키 없는 인쇄 가능한 키는 모두 서랍이 소비한다. v, h가 도구를 바꾸지 않는다.
    - Esc는 서랍만 닫고 포커스를 툴바 Play로 돌린다. 선택 단계나 도구는 바뀌지 않는다.
    - 고른 뒤 프로토타입 창이 닫히면 포커스 규칙은 지금 Play와 같다(`closedFocusTarget`).
11. 크기 버블의 Play는 재생 가능한 프레임 자체를 골랐을 때 Select와 Hand에서 보인다(사용자 결정). pick과 capture 중에는 없다. 요소 선택에서는 나오지 않는다.

### 에이전트

12. 가이드(`doan skill`)가 `data-doan-goto`의 쓰는 법과 `goto_*` 규칙 이름을 짧게 설명하고, 출력 예산(21,600 B) 안에 든다. 문구와 줄일 곳은 이 하위를 시작할 때의 가이드(체인 `chain-261114-2` 링크 3 병합 뒤)에서 design.md '가이드 예산'의 표를 보고 사용자가 확인한다.
13. `/agent-eval` 새 시나리오 W9가 "세 화면을 연결"하는 쓰기를 잰다. 기존 시나리오도 함께 도는 전체 라운드다(사용자 결정). 결과는 `docs/USABILITY-EVAL.md`에 적는다.

### 문서

14. 승격할 때 다음을 고친다.
    - PRODUCT §5 item 2
      - 'Prototype window' 첫 문단: "frames do not link to each other"
      - 'Content'
      - 'Header'의 Back·Forward 문장과 서랍 문장("lists … in document order")
      - 'Play controls'(새 판단 표, 기존 비활성 이유 네 개, 버블 조건)
      - 'Conversation panel'의 'Playing frame'·'Independence'의 이동 경로 목록
    - PRODUCT §5 item 3 'Frame drawer'의 "which makes the toolbar's Play prototype available"와 Viewing 표시(Eye 아이콘)
    - ARCHITECTURE §1 convention 15의 클릭 동작 문장(하위 1이 넘긴 것)
    - ARCHITECTURE §3 'Prototype window'의 `goto` 메시지, 검증, 위조 문장("A forgery can only …"에 같은 캔버스의 재생 가능한 프레임으로의 이동을 더함)
    - ARCHITECTURE §3 보드 `layout`의 `gotos`·`parent`와 한도
    - DESIGN.md

## 하지 않는 것

- 내보내기와 내보낸 파일의 전환. 하위 3이 한다.
- main 창 캔버스 페이지에서 연결을 표시하거나 따라가는 것.
- 전환 애니메이션, 오버레이, 프레임 사이의 상태 전달(상위 '하지 않는 것').
- main 창 헤더의 프레임 서랍(PRODUCT §5 item 3 'Frame drawer')의 동작 변경. 그 서랍은 모든 프레임을 그대로 보이고, 바뀌는 것은 Viewing 표시를 Eye 아이콘으로 바꾸는 것뿐이다.
- `doan open --prototype` 변경. 지정한 프레임에서 시작하고, 그 뒤의 이동은 연결로 한다.
- 1,000개 한도 변경.
