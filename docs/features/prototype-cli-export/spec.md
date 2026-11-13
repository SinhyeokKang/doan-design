# prototype-cli-export — spec

BACKLOG.md 'Undecided'의 두 항목(CLI에서 프로토타입 열기, 프로토타입 내보내기)을 사용자 결정에 따라 한 기능으로 묶는다. 둘 다 frame-prototype가 만든 프로토타입 창(PRODUCT §5 item 2 'Prototype window')과 기존 Export(item 3 'Export and viewer', item 12)를 넓힌다. (결정 N)은 아래 '결정'의 번호다.

## 사용자

- **에이전트**(CLI와 skill을 쓰는 쪽): "이 프레임을 프로토타입으로 열어 줘"에 `doan open <canvas> --frame <id> --prototype`으로, "이 프로토타입을 파일로 보내 줘"에 `doan export <canvas> --frame <id> --prototype -o <file>`로 답한다 (결정 3).
- **사람**(앱에서 보고 가리키는 쪽): 프로토타입 창 header의 Export 버튼으로, 재생 중인 프레임만 보이는 HTML 파일 하나를 저장하고 직접 보낸다.
- **파일을 받는 사람**(Doan도 저장소도 없는 리뷰어나 이해관계자, PRODUCT §2): 받은 파일을 브라우저로 열어 그 프레임 하나를 표시된 크기로 써 본다.

## 문제

- frame-prototype는 에이전트가 프레임에 `data-doan-prototype` 표시를 달게 하지만(ARCHITECTURE §1 convention 14), 프로토타입 창을 여는 길은 메인 창의 Play prototype(툴바, 크기 말풍선)과 프로토타입 창의 frame drawer, Back/Forward뿐이다. `doan open`은 메인 창을 캔버스와 프레임으로 옮기기만 한다(PRODUCT §5 item 10). 그래서 "이걸 프로토타입으로 열어 줘"에 에이전트가 쓸 도구가 없다.
- 프로토타입을 Doan 밖으로 보낼 방법이 없다. PRODUCT §5 item 2 'Prototype window'는 "nothing is exported or hosted"라고 정한다. 기존 Export는 캔버스 전체를 viewer(보드, frame drawer, 줌)로 내보내므로, 받는 사람이 한 프레임을 표시된 크기로 써 볼 수 없다.
- 프레임만 잘라 내면 프레임 밖의 공유 CSS·스크립트가 깨질 수 있다. 프로토타입 창도 같은 이유로 문서 전체를 두고 프레임 밖을 숨긴다(ARCHITECTURE §3 'Prototype window' 'Rendering in place': 복사본은 listener와 조상 selector를 잃는다).

## 동작 (제안)

### A. CLI에서 프로토타입 열기

- `doan open <canvas path> --frame <id> --prototype`은 표시된 그 프레임을 프로토타입 창에서 재생한다. 메인 창은 옮기지 않는다 (결정 2).
- 판정은 CLI가 캔버스 파일을 정적으로 읽어서 한다. 프레임이 없거나 ID가 겹치면 `frame_not_found`, 표시가 없거나 문법에 맞지 않으면 `not_prototype`로 앱에 묻지 않고 끝난다(둘 다 exit 2). 스크립트가 만드는 프레임은 CLI로 열 수 없다 (결정 10).
- 앱이 받으면 메인 창의 Play와 같은 재생이다: 창을 열거나 재사용하고, 그 프레임의 표시 크기로 맞추고, 새로 시작하고, 앞으로 가져온다. 이미 그 프레임을 재생 중이면 창만 앞으로 가져온다. Back/Forward 기록에 남는다.
- 앱이 꺼져 있으면 `doan open`처럼 번들 CLI가 앱을 한 번 열고 기다린다(ARCHITECTURE §4 'Bootstrap'). 아직 시작 중이면 몇 초 다시 묻고 `busy`로 끝난다.
- 첫 실행(first run)과 buddy 화면이 열려 있으면 `busy`("Finish Doan’s first run, then try again.")로 거절한다. 메인 창의 잠긴 페이지와 dialog는 막지 않는다. 프로토타입 창은 메인 창과 따로 움직이기 때문이다(PRODUCT §5 item 2 'Independence').
- 성공 응답은 앱이 재생을 시작했다는 뜻이다. 프레임이 실제로 준비됐다는 뜻은 아니다(실행 문서의 판정과 10초 시간 제한은 창의 상태 화면이 보여 준다).
- `doan open`은 여전히 옮기고 보여 주기만 한다. 쓰지 않고, 보내지 않고, 대화를 시작하지 않는다(PRODUCT §3 Out of scope 4, §5 item 3 'Deep links').
- `doan://` 링크에 같은 형태를 더할지는 정하지 않는다 (결정 8).

### B. 프로토타입 내보내기

- **파일 내용**: 기존 Export와 같은 파이프라인으로 캔버스 전체와 필요한 저장소 파일을 넣은 HTML 파일 하나를 쓴다. 포함·거절 규칙(서빙 범위, 50 MiB, `<base href>`, SVG `<use>`, custom property `url()`)은 그대로다. 파일은 다른 프레임과 메모도 담고 화면에서만 숨긴다. 성공 토스트와 guide가 이 사실을 알린다 (결정 4).
- **보이는 방식**: 브라우저에서 열면 그 프레임만 보인다. 캔버스 iframe이 브라우저 viewport 전체를 채우고, 프레임은 그 viewport를 채운다. 표시 크기(`<w>x<h>`)는 파일의 크기를 정하지 않는다. 브라우저 창 크기를 바꾸면 프레임이 그 폭으로 다시 배치된다 (결정 5). 그 밖의 viewer chrome(header, frame drawer, 줌, 도구)은 없다 (결정 6). 탭 제목은 "<frame title or id> — Prototype"이다.
- **스크립트와 이동**: 캔버스의 스크립트가 돈다. 다른 페이지로 가는 링크 클릭과 기본 form 제출은 아무 일도 하지 않고, 같은 페이지 링크, `history.pushState`, `preventDefault()`를 부르는 submit handler는 동작한다(프로토타입 창과 같다). 스크립트의 `location` 변경은 브라우저에서 막지 못한다(알려진 차이, design.md).
- **JavaScript 없이**(Quick Look, 메일 미리보기): 프레임 대신 "Open this file in a web browser to play this prototype." 한 줄을 보인다.
- **앱**: 프로토타입 창 header에 Export 버튼("Export prototype")이 생긴다 (결정 7). 저장 패널의 기본 이름은 `<canvas file stem>-<frame id>.html`이다. 결과는 프로토타입 창 안의 토스트로 알리고, 성공 토스트에는 Show in Finder가 있다. 메인 창 툴바와 사이드바 행 메뉴의 Export는 바뀌지 않는다.
- **CLI**: `doan export <canvas path> --frame <id> --prototype -o <file> [--force]`. 프레임 판정은 A와 같은 정적 판정이고 같은 코드(`frame_not_found`, `not_prototype`)를 쓴다. 결과에 `prototype: {frame, size}`가 더해진다.
- PRODUCT §5 item 2의 "nothing is exported or hosted"는 "nothing is hosted"로 바뀌고 Export를 가리킨다 (결정 9).

## 완료 조건

- `doan open <canvas> --frame <marked id> --prototype --json`이 실행 중인 앱에서 프로토타입 창을 그 프레임으로 열고 `{opened: true, frame: "found", prototype: true}`를 돌려준다. 메인 창의 캔버스, 선택, 뷰는 바뀌지 않는다.
- 같은 명령을 다시 보내면 새 창이나 새 실행 없이 창만 앞으로 온다. 다른 표시 프레임을 보내면 같은 창에서 바뀌고, Back으로 앞 프레임에 돌아간다.
- 표시가 없는 프레임, 없는 프레임, ID가 겹치는 프레임, 문법이 틀린 표시는 앱에 연결하지 않고 각각 `not_prototype`, `frame_not_found`, `frame_not_found`, `not_prototype`(exit 2)로 끝난다. `--prototype`만 있고 `--frame`이 없으면 `usage_error`다.
- 앱이 첫 실행 중이면 `busy`(exit 5)이고 창이 열리지 않는다. 앱이 없고 `DOAN_RUNTIME`이 비어 있으면 번들 CLI가 앱을 한 번 연다.
- 새 버전 응답을 모르는 이전 앱에 보내면 `app_protocol_mismatch`(exit 3)이다 (결정 1).
- `doan export <canvas> --frame <id> --prototype -o x.html`이 쓴 파일을 Chromium과 WebKit에서 열면 그 프레임만 브라우저 viewport 전체를 채워 보이고, 창 크기를 바꾸면 프레임이 다시 배치되며, 캔버스 스크립트가 돌며, 다른 페이지 링크와 기본 form 제출은 페이지를 떠나지 않는다. 파일만 열고 네트워크 없이 열어도 저장소 자산이 보인다.
- 같은 캔버스를 `--prototype` 없이 내보낸 파일은 바이트 단위로 지금과 같다(`TestExportOutputIsPinned`, `TestAssembleOutputIsPinned`가 그대로 통과).
- 프로토타입 창의 Export가 저장 패널을 열고, 고른 파일로 위 CLI 명령을 실행하고, 결과 토스트를 그 창에 보인다. 패널을 취소하면 아무 일도 없다. 읽기 실패, 프레임 없음, 표시 없음 상태에서는 Export가 이유와 함께 쓸 수 없는 상태다.
- PRODUCT, ARCHITECTURE, DESIGN, guide(`cli/internal/cli/skill.md`)가 새 동작을 현재 규칙으로 적고, `/agent-eval` 라운드 결과가 USABILITY-EVAL.md에 남는다.

## 비목표

- 여러 프레임을 한 파일에서 오가는 프로토타입(파일 안의 frame drawer, 프레임 사이 링크). 프레임은 서로 링크하지 않는다는 규칙(PRODUCT §5 item 2)이 그대로다.
- 다른 프레임과 메모를 파일에서 빼기(결정 4).
- 메인 창 툴바, 사이드바 행 메뉴, frame drawer에서 프로토타입 내보내기.
- 호스팅, 업로드, 공유 링크(PRODUCT §3 Out of scope 5).
- `doan://` 프로토타입 링크 (결정 8).
- 스크립트가 만드는 프레임을 CLI로 열거나 내보내기 (결정 10).
- guide의 "편집한 캔버스를 열어 줄까요" 제안 줄에 프로토타입 열기를 더하는 것.
- 프로토타입 창의 텍스트 편집 메뉴와 최소 높이(BACKLOG.md의 별도 항목).
- 프로토타입 대화 버튼(형제 기능 `prototype-conversation`). header 배치만 맞춘다 (결정 7).

## 결정 (사용자 확인)

1. **app-socket 형식**: 새 버전 v6(요청 `{v:6, token, root, path, frame, mark}`, 응답 `{v:6, ok, played}`). 이전 앱은 v1 거절로 답하므로 CLI가 따로 처리하지 않아도 `app_protocol_mismatch`가 되고, 메인 창 이동과 다른 준비·거절 규칙이 v4 스키마에 섞이지 않는다.
2. **`doan open --prototype`일 때 메인 창**: 프로토타입 창만 연다. 메인 창의 캔버스, 선택, 뷰는 바뀌지 않는다(PRODUCT §5 item 2 'Independence').
3. **CLI 플래그**: 두 명령 모두 `--frame <id> --prototype`. `--prototype`에는 `--frame`이 필요하고, export에서 `--frame`만 주면 `usage_error`다.
4. **파일에 남는 다른 프레임**: 캔버스 전체를 넣고 화면에서만 숨긴다. 성공 토스트와 guide가 파일에 캔버스 전체가 들어 있다고 알린다. 다른 프레임을 지우지 않는 이유는 공유 CSS·스크립트가 깨질 수 있기 때문이다.
5. **브라우저에서의 크기**: 프레임이 브라우저 viewport 전체를 채운다. 표시 크기 상자도, 비율 축소도 없다.
6. **파일의 chrome**: 없다. 다시 시작은 브라우저 새로고침이 한다.
7. **header 배치**: 오른쪽 끝에 [Export][Conversation], 대화 버튼이 맨 오른쪽이다. `prototype-conversation`과 같은 결정이다.
8. **`doan://` 링크 형태**: 이번에는 더하지 않는다.
9. **내보내는 곳**: 프로토타입 창 header의 Export와 CLI뿐이다. PRODUCT §5 item 2의 문구는 "nothing is hosted"가 되고 header의 Export를 가리킨다. 메인 창 툴바와 행 메뉴는 바뀌지 않는다.
10. **프레임 판정 위치**: CLI가 캔버스 파일을 정적으로 판정한다. 스크립트가 만드는 프레임은 CLI로 열거나 내보낼 수 없고, 그런 프레임을 재생 중인 창의 Export도 거절된다. export는 앱 없이 돌아야 하므로 정적 판정이 필요하고, open도 같은 규칙을 쓰면 에이전트가 두 명령에서 같은 오류를 만난다.
