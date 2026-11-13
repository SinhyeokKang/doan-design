# prototype-cli-export — spec

BACKLOG.md 'Undecided'의 두 항목(CLI에서 프로토타입 열기, 프로토타입 내보내기)을 사용자 결정에 따라 한 기능으로 묶는다. 둘 다 프로토타입 표시(ARCHITECTURE §1 convention 14)와 프로토타입 창(PRODUCT §5 item 2 'Prototype window'), 기존 Export(item 3 'Export and viewer', item 12)를 넓힌다. (결정 N)은 아래 '결정'의 번호다.

## 사용자

- **에이전트**(CLI와 skill을 쓰는 쪽): "이 프레임을 프로토타입으로 열어 줘"에 `doan open <canvas> --frame <id> --prototype`으로, "이 프로토타입을 파일로 보내 줘"에 `doan export <canvas> --frame <id> --prototype -o <file>`로 답한다 (결정 3).
- **사람**(앱에서 보고 가리키는 쪽): 프로토타입 창 헤더의 Export 버튼으로, 재생 중인 프레임만 보이는 HTML 파일 하나를 저장하고 직접 보낸다.
- **파일을 받는 사람**(Doan도 저장소도 없는 리뷰어나 이해관계자, PRODUCT §2): 받은 파일을 브라우저로 열어 그 프레임 하나를 브라우저 창 크기로 써 본다. 창 크기를 바꾸면 프레임이 다시 배치된다.

## 문제

- 에이전트는 프레임에 `data-doan-prototype` 표시를 달 수 있지만(ARCHITECTURE §1 convention 14), 프로토타입 창을 여는 길은 메인 창의 Play prototype(툴바, 크기 말풍선)과 프로토타입 창의 frame drawer, Back/Forward뿐이다. `doan open`은 메인 창을 캔버스와 프레임으로 옮기기만 한다(PRODUCT §5 item 10). PRODUCT §3 In scope 1(Show)은 표시한 프레임을 창에서 재생한다고 하고 In scope 3(Deliver)은 에이전트가 CLI로 일한다고 하지만, "이걸 프로토타입으로 열어 줘"에 에이전트가 쓸 도구가 없다.
- 프로토타입을 Doan 밖으로 보낼 방법이 없다. PRODUCT §1 problem 5와 §3 In scope 8(Export)은 저장소 밖 사람에게 초안을 보이는 길로 Export를 두지만, PRODUCT §5 item 2 'Prototype window'는 "nothing is exported or hosted"라고 정한다. 기존 Export는 캔버스 전체를 viewer(보드, frame drawer, 줌)로 내보내므로, 받는 사람이 한 프레임만 단독으로 써 볼 수 없다.
- 프레임만 잘라 내면 프레임 밖의 공유 CSS·스크립트가 깨질 수 있다. 프로토타입 창도 같은 이유로 문서 전체를 두고 프레임 밖을 숨긴다(ARCHITECTURE §3 'Prototype window' 'Rendering in place': 복사본은 listener와 조상 selector를 잃는다).

## 동작

### A. CLI에서 프로토타입 열기

- `doan open <canvas path> --frame <id> --prototype`은 표시된 그 프레임을 프로토타입 창에서 재생한다. 메인 창은 옮기지 않는다 (결정 2).
- 판정은 CLI가 캔버스 파일을 정적으로 읽어서 한다. 프레임이 없거나 ID가 겹치면 `frame_not_found`, 표시가 없거나 문법에 맞지 않으면 `not_prototype`로 앱에 묻지 않고 끝난다(둘 다 exit 2). 스크립트가 만드는 프레임은 CLI로 열 수 없다 (결정 10). 파싱하지 못하거나 50 MiB를 넘는 캔버스는 `canvas_unreadable`(exit 2)이고, `doan:width`는 보지 않는다(재생에는 보드 폭이 필요 없다).
- 앱이 받으면 메인 창의 Play와 같은 재생이다: 창을 열거나 재사용하고, 그 프레임의 표시 크기로 맞추고, 새로 시작하고, 앞으로 가져온다. 이미 그 프레임을 재생 중이면 창만 앞으로 가져온다. Back/Forward 기록에 남는다.
- 앱이 꺼져 있으면 `doan open`처럼 번들 CLI가 앱을 한 번 열고 기다린다(ARCHITECTURE §4 'Bootstrap'). 아직 시작 중이면 몇 초 다시 묻고 `busy`로 끝난다.
- 첫 실행(first run)과 buddy 화면이 열려 있으면 `busy`("Finish Doan’s first run, then try again.")로 거절한다. 메인 창의 잠긴 페이지와 dialog는 막지 않는다. 프로토타입 창은 메인 창과 따로 움직이기 때문이다(PRODUCT §5 item 2 'Independence'). 이 점은 링크와 `doan open`이 같은 규칙을 따른다는 PRODUCT §5 item 3 'Deep links'의 문장과 다르므로 승격 때 그 문장을 고친다.
- 성공 응답은 앱이 재생을 시작했다는 뜻이다. 프레임이 실제로 준비됐다는 뜻은 아니다(실행 문서의 판정과 10초 시간 제한은 창의 상태 화면이 보여 준다).
- `doan open`은 여전히 옮기고 보여 주기만 한다. 쓰지 않고, 보내지 않고, 대화를 시작하지 않는다(PRODUCT §3 Out of scope 4, §5 item 3 'Deep links').
- `doan://` 링크에는 이 형태를 더하지 않는다 (결정 8).

### B. 프로토타입 내보내기

- **파일 내용**: 기존 Export와 같은 파이프라인으로 캔버스 전체와 필요한 저장소 파일을 넣은 HTML 파일 하나를 쓴다. 포함·거절 규칙(서빙 범위, 50 MiB, `<base href>`, SVG `<use>`, custom property `url()`)은 그대로다. 파일은 다른 프레임과 메모도 담고 화면에서만 숨긴다. 성공 토스트와 guide가 이 사실을 알린다 (결정 4).
- **보이는 방식**: 브라우저에서 열면 그 프레임만 보인다. 캔버스 iframe이 브라우저 viewport 전체를 채우고, 프레임은 그 viewport를 채운다. 표시 크기(`<w>x<h>`)는 파일의 크기를 정하지 않는다. 브라우저 창 크기를 바꾸면 프레임이 그 폭으로 다시 배치된다 (결정 5). 그 밖의 viewer chrome(header, frame drawer, 줌, 도구)은 없다 (결정 6). 탭 제목은 "<frame title or id> — Prototype"이고 표시 크기는 넣지 않는다.
- **불러오는 동안**: 프레임을 격리하기 전에는 캔버스 전체가 보일 수 있으므로, 페이지는 iframe을 숨긴 채 시작한다. 격리가 끝났다는 응답이 오면 보인다. 프레임이 없다는 응답이 오거나 10초가 지나면 iframe은 숨긴 채로 두고 아래 '프레임이 불러와지지 않을 때'의 줄만 보인다. 10초가 지난 뒤에 격리가 끝났다는 응답이 오면 줄을 지우고 프레임을 보인다.
- **스크립트와 이동**: 캔버스의 스크립트가 돈다. 다른 페이지로 가는 링크 클릭과 기본 form 제출은 아무 일도 하지 않고, 같은 페이지 링크(`#`으로 시작하는 `href`), `history.pushState`, `preventDefault()`를 부르는 submit handler는 동작한다(프로토타입 창과 같다). 스크립트의 `location` 변경과 `form.submit()`은 브라우저에서 막지 못한다. PoC(tasks 1)가 더 찾는 실패는 여기와 design.md '알려진 한계'에 더한다.
- **JavaScript 없이**(Quick Look, 메일 미리보기): 프레임 대신 "Open this file in a web browser to play this prototype." 한 줄을 보인다.
- **프레임이 불러와지지 않을 때**(프레임이 없다는 응답, 또는 10초 안에 응답 없음): 캔버스는 보이지 않고 "This prototype’s frame didn’t load. Ask the sender to fix the canvas, then export it again." 한 줄만 보인다.
- **앱**: Export 버튼은 프로토타입 창 헤더의 오른쪽 무리에서 Fit·Responsive 토글 바로 다음에 들어간다 (결정 7). 툴바 줄은 없다. 헤더는 왼쪽 [Back, Forward, Reload prototype], 가운데 프레임 이름, 오른쪽 [Fit·Responsive 토글, Export prototype, 대화 버튼]이고, 헤더 배치와 토글은 `prototype-responsive`가 만든다.
  - 모습은 헤더의 다른 아이콘 버튼과 같다: 32 px chrome 아이콘 버튼, 16 px Download 아이콘. 접근 이름과 tooltip은 "Export prototype"이고, tooltip은 다른 헤더 tooltip처럼 버튼 4 아래에 뜬다. 쓸 수 없을 때는 캔버스 툴바의 Play prototype·Export처럼 `aria-disabled`로 포커스를 받고, 이유를 tooltip과 sr-only 설명으로 보인다.
  - 키보드: Export는 자기 Tab 정지를 갖고, 쓸 수 없을 때도 Tab으로 닿는다(`aria-disabled`). 첫 view 전(`disabled`)에만 닿지 않는다. Tab 순서는 Back, Forward, Reload, 프레임 이름(그려질 때), 토글(Tab 정지 하나), Export, 대화 버튼, 프레임 콘텐츠다.
  - 포인터로 Export를 눌러도 포커스는 옮겨 가지 않는다(PRODUCT 'Header'). 저장 패널이 닫히면 포커스는 누르기 전 자리로 돌아온다. 키보드로 눌렀으면 Export다.
  - 저장 패널의 기본 이름은 `<canvas file stem>-<frame id>.html`이다. 결과는 프로토타입 창 안의 토스트로 알리고, 성공 토스트에는 Show in Finder가 있다.
  - 창 하나에서 한 번에 하나만 내보낸다. 내보내는 동안 버튼은 "Exporting"으로 쓸 수 없고, 누른 프레임으로 끝까지 가며, 결과 토스트는 그 프레임 이름을 쓴다. 그 사이 창이 닫히면 파일은 쓰이고 결과는 보이지 않는다.
  - 누른 순간의 프레임(root, 캔버스 경로, 프레임)이 main이 받을 때의 프레임과 다르면 내보내지 않고 거절 토스트를 보인다.
  - 메인 창 툴바와 사이드바 행 메뉴의 Export는 바뀌지 않는다 (결정 9).
- **CLI**: `doan export <canvas path> --frame <id> --prototype -o <file> [--force]`. 프레임 판정은 A와 같은 정적 판정이고 같은 코드(`frame_not_found`, `not_prototype`)를 쓴다. 읽을 수 없는 캔버스는 지금처럼 `export_refused`다. 결과에 `prototype: true`가 더해진다(`doan open`과 같은 모양).
- PRODUCT §5 item 2의 "nothing is exported or hosted"는 "nothing is hosted"로 바뀌고 Export를 가리킨다 (결정 9).

## 완료 조건

- `doan open <canvas> --frame <marked id> --prototype --json`이 실행 중인 앱에서 프로토타입 창을 그 프레임으로 열고 `{opened: true, frame: "found", prototype: true}`를 돌려준다. 메인 창의 캔버스, 선택, 뷰는 바뀌지 않는다.
- 같은 명령을 다시 보내면 새 창이나 새 실행 없이 창만 앞으로 온다. 다른 표시 프레임을 보내면 같은 창에서 바뀌고, Back으로 앞 프레임에 돌아간다.
- 표시가 없는 프레임, 없는 프레임, ID가 겹치는 프레임, 문법이 틀린 표시는 앱에 연결하지 않고 각각 `not_prototype`, `frame_not_found`, `frame_not_found`, `not_prototype`(exit 2)로 끝난다. 파싱하지 못하거나 50 MiB를 넘는 캔버스는 `canvas_unreadable`(exit 2)이다. `--prototype`만 있고 `--frame`이 없으면 `usage_error`이고, export에 `--frame`만 주어도 `usage_error`다(결정 3).
- 앱이 첫 실행 중이거나 buddy 화면을 보이고 있으면 `busy`(exit 5)이고 창이 열리지 않는다.
- 앱이 없을 때, `DOAN_RUNTIME`이 설정되지 않았으면 번들 CLI가 앱을 한 번 열고, 설정됐지만 비어 있으면 열지 않는다(ARCHITECTURE §4 'DOAN_RUNTIME', 'Bootstrap').
- 새 버전 요청을 모르는 이전 앱에 보내면 `app_protocol_mismatch`(exit 3)이다 (결정 1).
- `doan export <canvas> --frame <id> --prototype -o x.html`이 쓴 파일을 Chromium과 Safari(Playwright WebKit으로 확인)에서 열면:
  - 그 프레임만 브라우저 viewport 전체를 채워 보이고, 창 크기를 바꾸면 프레임이 다시 배치된다.
  - 캔버스 스크립트가 돌고, 다른 페이지 링크와 기본 form 제출은 페이지를 떠나지 않는다.
  - 파일만 네트워크 없이 열어도 저장소 자산이 보인다.
  - 탭 제목이 "<frame title or id> — Prototype"이다.
  - JavaScript를 끄면 안내 한 줄만 보이고 캔버스는 보이지 않는다.
  - 격리 전에도, 프레임이 없거나 10초 안에 응답이 없을 때도 캔버스 전체가 보이지 않는다.
- 결과 JSON에 `prototype: true`가 있고, 같은 캔버스를 `--prototype` 없이 내보낸 파일은 바이트 단위로 지금과 같다(`TestExportOutputIsPinned`, `TestAssembleOutputIsPinned`가 그대로 통과).
- 프로토타입 창의 Export가 저장 패널을 `<canvas file stem>-<frame id>.html` 이름으로 열고, 고른 파일로 위 CLI 명령을 실행하고, 결과 토스트를 그 창에 보인다. 성공 토스트는 "파일에 캔버스 전체가 들어 있다"는 문장과 Show in Finder를 담고, Show in Finder가 그 파일을 Finder에서 보인다. 패널을 취소하면 아무 일도 없다.
- 읽기 실패, 프레임 없음, 표시 없음 상태에서는 Export가 이유와 함께 쓸 수 없는 상태다. 스크립트가 만든 프레임을 재생 중일 때 Export는 `frame_not_found` 토스트로 끝난다(결정 10).
- guide의 `doan export` 줄이 파일에 캔버스 전체가 들어 있다고 말한다(`skill_test.go`).
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
- 프로토타입 대화 버튼(형제 기능 `prototype-conversation`)과 헤더 배치·모드 토글 자체(`prototype-responsive`). Export의 자리와 키보드만 맞춘다 (결정 7).

## 결정 (사용자 확인)

1. **app-socket 형식**: 새 버전 v6(요청 `{v:6, token, root, path, frame, mark}`, 응답 `{v:6, ok, played}`). 이전 앱은 v1 거절로 답하므로 CLI가 따로 처리하지 않아도 `app_protocol_mismatch`가 되고, 메인 창 이동과 다른 준비·거절 규칙이 v4 스키마에 섞이지 않는다.
2. **`doan open --prototype`일 때 메인 창**: 프로토타입 창만 연다. 메인 창의 캔버스, 선택, 뷰는 바뀌지 않는다(PRODUCT §5 item 2 'Independence').
3. **CLI 플래그**: 두 명령 모두 `--frame <id> --prototype`. `--prototype`에는 `--frame`이 필요하고, export에서 `--frame`만 주면 `usage_error`다.
4. **파일에 남는 다른 프레임**: 캔버스 전체를 넣고 화면에서만 숨긴다. 성공 토스트와 guide가 파일에 캔버스 전체가 들어 있다고 알린다. 다른 프레임을 지우지 않는 이유는 공유 CSS·스크립트가 깨질 수 있기 때문이다.
5. **브라우저에서의 크기**: 프레임이 브라우저 viewport 전체를 채운다. 표시 크기 상자도, 비율 축소도 없다.
6. **파일의 chrome**: 없다. 다시 시작은 브라우저 새로고침이 한다.
7. **Export의 자리**: 프로토타입 창 헤더 오른쪽 무리에서 Fit·Responsive 토글 다음의 32 px 아이콘 버튼이다. 헤더는 왼쪽 [Back, Forward, Reload prototype], 가운데 프레임 이름, 오른쪽 [토글, Export prototype, 대화 버튼]이다. 헤더 배치와 토글은 `prototype-responsive`가 만들고, 이 기능은 Export 버튼만 더한다.
8. **`doan://` 링크 형태**: 이번에는 더하지 않는다.
9. **내보내는 곳**: 프로토타입 창 헤더의 Export와 CLI뿐이다. PRODUCT §5 item 2의 문구는 "nothing is hosted"가 되고 헤더의 Export를 가리킨다. 메인 창 툴바와 행 메뉴는 바뀌지 않는다.
10. **프레임 판정 위치**: CLI가 캔버스 파일을 정적으로 판정한다. 스크립트가 만드는 프레임은 CLI로 열거나 내보낼 수 없고, 그런 프레임을 재생 중인 창의 Export도 거절된다. export는 앱 없이 돌아야 하므로 정적 판정이 필요하고, open도 같은 규칙을 쓰면 에이전트가 두 명령에서 같은 오류를 만난다.
11. **검증 명령**: 내보낸 파일의 브라우저 확인은 `node .scratch/prototype-export-poc/probe.mjs [<exported file>]` 하나로 한다. Playwright Chromium과 WebKit을 쓰고, 인자가 없으면 PoC 페이지(tasks 1), 있으면 실제 출력 파일(tasks 9·10)을 연다. 모든 확인이 통과할 때만 exit 0이다.
12. **`open --prototype`의 읽을 수 없는 캔버스**: 새 코드 `canvas_unreadable`을 쓰고 `doan:width`는 보지 않는다. export는 `export_refused`를 그대로 쓴다.
13. **export 결과 모양**: `prototype: true`.
14. **오래된 클릭**: 누른 순간의 target(root, 경로, 프레임)을 지금 target과 비교하고, 다르면 거절 토스트를 보인다.
15. **내보내는 중의 변경**: 창 하나에서 한 번에 하나만 내보낸다. 버튼은 "Exporting"으로 남고, 누른 프레임으로 끝까지 가며, 결과 토스트는 그 프레임 이름을 쓴다. 창이 닫히면 파일은 쓰이고 결과는 보이지 않는다.
16. **파일을 불러오는 동안**: 바깥 페이지는 iframe을 숨긴 채 시작하고, `ready`를 받으면 보인다. `missing`을 받거나 10초가 지나면 iframe을 숨긴 채 안내 줄만 보인다. 10초 뒤에 `ready`가 오면 줄을 지우고 iframe을 보인다. 격리되지 않은 캔버스 전체(다른 프레임과 메모)를 받는 사람에게 드러내지 않기 위해서다.
17. **헤더 폭**: Export는 헤더 오른쪽 무리를 32와 간격 4만큼 넓힌다(R 68 → 104). 프레임 이름 캡슐이 첫째 줄에 있을지 헤더 둘째 줄로 내려갈지는 `prototype-responsive`의 규칙이 R로 정한다. R 104에서 캡슐은 창 폭 408부터 첫째 줄에 있고, 그보다 좁으면 둘째 줄로 내려가 헤더가 100이 된다. 그래서 이 기능이 합쳐지면 390×844의 창 맞춤은 406 × 952다.
18. **탭 제목**: 표시 크기를 넣지 않는다.
