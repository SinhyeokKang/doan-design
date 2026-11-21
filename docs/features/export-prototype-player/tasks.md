# 구현 순서와 검증

각 단계는 앞 단계의 검증 결과를 이어받는다. 최신 develop에서 시작한다. 앱 기준과 비교할 때 같은 캔버스에 재생 가능한 프레임, 중첩 프레임, 링크, 일반 입력, 잘못된 마크, 스크립트로 생긴 프레임을 넣는다.

실제 파일 검증은 다음 방법으로 한다.

- **테스트 파일 만들기**: `go build -o <tmp>/doan ./cli/cmd/doan`으로 CLI를 만들고, 저장소 밖 임시 저장소에서 그 CLI로 `doan export`를 실행한다.
- **브라우저 확인**: 명령은 아직 정하지 않았다. `.scratch/export-prototype-player/`의 임시 Playwright 스크립트로 Chromium·WebKit에서 연다.
- **앱 쪽 비교**: `/runtime-test`로 격리한 앱에서 확인한다.

| 순서 | 작업과 커밋 경계 | 검증 |
|---|---|---|
| 1 | 브라우저 PoC. 일반 Export 파일 하나로 새 창을 열어 격리된 프레임을 재생하고, 연결된 단독 HTML을 저장한다. 실험물은 .scratch에 둔다. | 저장소 밖 임시 디렉터리에서 Chromium·WebKit으로 실제 파일을 열고 다음을 기록한다.<br>- 팝업 허용·차단·재시도, 창 재사용, 다운로드한 파일의 오프라인 링크 이동<br>- 보드를 새로고침한 뒤 Play가 새 창을 여는지, 동시에 연 파일 A·B가 서로의 재생창을 차지하지 않는지<br>- 창 생성 방식 후보마다 ⌘R·주소창 Back의 결과, 주소창 표시, 보드를 닫은 뒤의 동작<br>- `a[download]`의 파일 이름 문자 치환과 길이 절단<br>- 보드 탭을 닫은 뒤 재생창에서 입력하고, 링크로 다른 프레임으로 이동하고, 그 프레임을 내려받아 열 수 있는지<br>브라우저별 차이나 미검증 항목은 구현 전에 보고한다. |
| 2 | 시안 확정. feature-review 후 design.md에 지정한 보드·서랍·재생·복구 상태를 그린다. | 설치된 CLI로 `doan check --repo . --json`과 `doan ls --repo . --json`을 실행한 뒤, 사용자가 앱에서 시안을 확인한다. |
| 3 | TDD. 기존 마크·링크 fixture에 선택과 재생 대상, 서랍 그룹, 기록·모드, 내보내기 거절 사례를 연결하고 앱 결과와 Export 결과를 비교한다. 공개 스키마 변경은 없다. 테스트를 먼저 커밋한다. | `go test ./...`와 `npm --prefix app test`에서 의도한 새 단언이 실패하고 기존 앱 기준은 통과하는지 확인한다. 새 단언에는 다음이 들어간다.<br>- 생성 entry의 판정이 앱과 같다<br>- `schema/fixtures/prototype-mark`·`prototype-links`로 Go↔TS 그룹을 대조한다<br>- 재생창 iframe의 sandbox가 정확히 `allow-scripts allow-forms`이다<br>- design.md '브라우저 상태와 문구'의 문구가 원문 그대로다<br>- 브라우저에서 이어 붙인 단독 파일이 CLI 결과와 “같은 결과”다 |
| 4 | 일반 Export 조립. 원본 리소스는 한 번만 담는다. 보드·재생기·개별 Export가 필요한 정적 프레임·링크 정보와, design.md '현재 프레임 내보내기'의 미리 렌더한 조각을 담는다. 이 단계에서 조립 변경을 커밋한다. | `go test ./...`로 다음을 확인한다.<br>- CLI 출력 계약, 일반·단독 파일 구분, 50 MiB 경계(조립한 페이지 전체 기준)<br>- 링크 그룹, 중복·긴 ID, 이스케이프, 기존 단독 파일 호환<br>- 단독 파일 템플릿 조각이 일반 Export에 정확히 한 번 들어간다<br>- 프레임별 NAME·start와 그룹별 frames JSON 이스케이프가 `AssemblePrototype`와 같다<br>`TestAssembleOutputIsPinned`의 digest는 출력이 바뀌는 만큼만 갱신한다. 늘어난 바이트를 측정해 기록한다. |
| 5 | Select와 보드의 재생 진입점. 인스펙터에서 선택을 분리하고, 크기 버블·거리 측정과 앱의 툴바, 서랍, 마크, 포커스 동작을 연결한다. `layout` 메시지에 `prototype`·`parent`·`cut`·`gotos`를 더한다. 한 커밋 단위다. | `node app/scripts/viewerInspect.mjs`로 생성 번들을 다시 만들고 `node app/scripts/viewerInspect.mjs --check`가 통과하는지 확인한다. 이어서 `npm --prefix app test`를 실행하고, 실제 파일에서 다음을 확인한다.<br>- 인스펙터가 접힌·열린·너비 부족 상태에서 클릭, 중첩 선택, Option 거리 측정, 텍스트 드래그, 키보드·포인터, 서랍의 Fit과 Play 차이<br>- 접힌 상태 Select 툴팁의 Option 클릭 안내<br>- 캔버스 준비 전과 빈 캔버스에서 Play prototype이 사유를 보인다<br>- 잘못된 마크를 선택하면 재생 서랍이 열린다<br>- Hand로 바꾸면 선택이 지워지고 Space는 선택을 보존한다<br>- 1,001번째 프레임을 선택했을 때 툴바 Play prototype의 대상과 사유<br>- 항목을 선택하고 인스펙터를 연 뒤 창을 655px로 줄이면 열이 숨고, 656px로 넓히면 같은 선택으로 열이 다시 보인다<br>아래 보드 입력 검증도 수행한다. |
| 6 | 브라우저 재생창. 창 열기·재사용과 분리된 프레임 렌더링, Fit·Responsive, 링크·서랍·기록·Reload, 실패·재시도와 포커스를 구현해 커밋한다. | `npm --prefix app test`와 같은 fixture의 앱·브라우저 비교로 다음을 확인한다.<br>- 뷰포트 치수, 모드를 바꾼 뒤 입력 보존, 프레임 변경 후 초기화, 자기 링크 재시작, 링크 취소, 팝업 차단 후 보드 상태 보존<br>- 보드를 새로고침한 뒤 Play는 새 창을 열고, 동시에 연 파일 A·B는 서로의 재생창을 차지하지 않는다<br>- 재생 iframe의 첫 스크립트가 `isolate.js`이고, 실제 파일에서 캔버스 스크립트가 `parent`·`opener` 쪽 DOM에 접근하지 못한다<br>- 마크업이 든 프레임 title이 재생창에 텍스트로만 보인다<br>- 탭 제목이 “<frame> — Prototype”이고 링크로 이동하면 바뀐다<br>아래 재생창 검증도 수행한다. |
| 7 | 현재 프로토타입 내보내기. 클릭 시점의 프레임·링크 그룹으로 독립 파일을 내려받게 한다. 성공·거절·진행 안내와 함께 커밋한다. | `go test ./...`와 `npm --prefix app test`를 실행한다. Chromium·WebKit에서 실제 받은 파일을 빈 폴더로 옮기고, 원래 뷰어를 닫은 채 열어 다음을 검증한다.<br>- 시작 프레임·링크·브라우저 기록. 파일 안에서는 시작 프레임과 연결된 그룹 안에서만 이동한다<br>- 받은 파일의 `doan-prototype` JSON의 `start`와 `frames`가 같은 캔버스의 CLI 결과와 같다<br>- 원문에 유효하게 표시된 단독 프레임은 내보내기에 성공하고, 그 프레임 하나를 재생한다<br>- 스크립트로만 생긴 프레임과 원문에 마크가 없는 프레임은 내보내기를 거절하고 보낸 사람에게 수정본을 요청하도록 안내한다<br>- 다운로드 토스트 문구가 연결된 프레임 0·1·여러 개에서 맞다. 다운로드 요청을 디스크 저장 성공으로 표시하지 않는다<br>아래 링크 그룹 경계도 확인한다. |
| 8 | `/design-sync`. 시안 `export-prototype-player.html`의 상태 9개와 구현을 실제 브라우저와 앱에서 computed style로 비교하고 맞춘다. | 보드, 서랍, `player-fit`·`player-responsive`·`player-narrow`, 실패, 차단·다운로드 토스트, 헤더 치수(왼쪽 16px Back, 이름 양옆 40px, 120px 미만이면 둘째 줄)를 측정한다. 측정값을 `docs/design/canvas.md`와 `docs/design/prototype.md`에 기록한다. |
| 9 | 통합 검증. 두 브라우저의 일반 Export와 앱이 만드는 단독 Export에서 같은 시나리오를 재생하고 증거를 남긴다. | `node .agents/skills/verify/scripts/verify.mjs`와 짧은 실제 앱·파일 검증을 수행한다. 실제 macOS Safari에서 다음을 확인해야 통과한다.<br>- 팝업 차단을 해제한 뒤 Play로 재시도한다<br>- 보드 탭을 닫은 뒤 재생창에서 입력하고, 링크로 이동하고, Export prototype을 누른다<br>- 현재 프레임을 내려받고, 받은 파일을 오프라인에서 다시 열어 시작 프레임과 링크 이동을 확인한다<br>Playwright WebKit 결과는 따로 기록한다. 마지막 통합 전에 `/agent-eval`을 수행한다. 가이드·CLI 출력·검사 규칙을 바꾸는 PR에서도 저장소 규칙에 따라 수행한다. |
| 10 | 구현된 동작을 영문 PRODUCT·ARCHITECTURE와 해당 DESIGN 절에 반영하고 이 기능 디렉터리를 삭제한다. 각 기준 문서는 따로 커밋한다. | 다음 문단을 다시 쓴다.<br>- PRODUCT §2: 받는 사람이 보고 값을 확인하는 데 더해 재생도 한다<br>- PRODUCT §3 In scope 8: 프로토타입 파일 진입점에 일반 Export 재생기를 더한다<br>- PRODUCT §3 Out of scope 2: 마크가 재생창에서 재생된다는 문장<br>- PRODUCT §5 항목 3: 접힌 상태의 Select, 툴바의 Play prototype, 크기 버블과 거리 측정, 재생기와 브라우저 문구<br>- ARCHITECTURE §3 'Exported canvas and viewer': 'Left out'의 measurement, sibling iframe 규칙, 생성 entry, 경계 불변식<br>- ARCHITECTURE §3 'Size limit': 늘어난 바이트<br>Playwright WebKit과 실제 Safari의 차이, 브라우저 검증에서 뺀 항목은 `docs/BACKLOG.md`에 남긴다. README의 Export 기능 설명을 구현과 대조하고, 새 디렉터리가 생겼으면 `docs/DIRECTORY.md`를 갱신한다. 공개 문서·가이드의 설명을 구현과 대조하고, 문서 링크와 기능 디렉터리 삭제를 확인한다. |

## 단계별 추가 검증

- **5단계 · 보드 입력** — 준비 신호를 늦춘 실제 파일에서 Select의 첫 클릭이 프레임을 한 번만 선택하는지 확인한다. 버블의 Play에 키보드 포커스가 있을 때 선택을 바꿔 Play만 사라지게 하면 툴바의 Play prototype이 포커스를 받는다. 포인터로 누른 툴바 버튼은 포커스를 가져가지 않아 Space가 이동으로 동작한다.
- **6단계 · 창 재사용과 포커스** — 재생 중인 프레임에 값을 입력한 뒤 보드에서 같은 프레임을 다시 열면 값이 남는다. 창을 앞으로 가져오지 못하면 보드 토스트 “The prototype is already playing in another window.”가 보인다. 재생창을 닫았을 때 보드에 버블 Play가 있으면 그 버튼이, 없으면 툴바 Play가 포커스를 받는다. Responsive를 선택하고 다른 프레임으로 이동한 뒤 재생창을 닫았다 열면 Responsive가 유지되고 Back·Forward가 비활성이다. 보드 파일을 새로 열면 첫 재생은 Fit이다.
- **6단계 · 기록** — 헤더 Back·Forward와 ⌘[·주소창 Back이 같은 프레임으로 이동한다. ⌘R은 화면의 프레임을 다시 시작하고 빈 창이 되지 않는다. 키보드로 기록의 끝까지 누른 Back·Forward는 포커스를 유지하고 `aria-disabled`가 된다.
- **6단계 · 차단** — 팝업이 차단되면 보드 오른쪽 아래에 차단 토스트가 보이고, 포커스는 누른 Play에 남는다. 재생 서랍의 행으로 열다 차단되면 서랍이 닫히고 툴바 Play prototype이 포커스를 받는다. 차단을 해제하고 Play가 성공하면 토스트가 사라진다.
- **6단계 · 링크와 준비** — 두 엔진에서 다음을 확인한다.
  - 캔버스가 취소한 링크는 이동하지 않는다
  - 이동 직전에 누른 링크(`<a href>` 안의 goto)도 이동한다
  - 같은 문서 해시 이동과 History API가 동작한다
  - Reload가 기록을 만들지 않는다
  재생창에서도 준비 신호를 늦춘 첫 입력이 한 번만 처리되는지 확인한다.
- **6단계 · 스크립트 프레임** — 파싱·load 중에 스크립트가 만든 프레임은 재생되고, load 뒤에 생긴 프레임은 재생 후보가 아니다. 재생 중 새 iframe에서 그 프레임을 찾지 못하면 “This frame isn’t in the shared file.” 시작 실패가 보인다.
- **6단계 · 지연과 실패** — A에서 B로 옮긴 뒤 A의 늦은 응답이 도착해도 제목, Playing 행, 내보낼 대상은 B다. 실제 로컬 HTML에서 재생창은 계속 응답하고 프레임만 10초간 응답하지 않으면 “The frame didn’t finish loading within 10 seconds. Retry, or ask the sender for an updated file.”과 Retry·Close가 보이고 Details는 없다. Retry를 누르면 새 iframe에서 같은 프레임이 처음부터 열린다. 깨진 링크를 누르면 “Can’t go to “<id>”. Ask the sender to fix this link and send an updated file.”이 보이고, 200 UTF-16 단위를 넘는 값에서는 ID를 뺀 문구가 보인다.
- **7단계 · 링크 그룹 경계** — 원문에 유효하게 기록된 첫 프레임과 1,001번째 프레임을 연결한다. 1,001번째 프레임은 재생창 서랍에 나타나지 않는다. 첫 프레임을 단독 HTML로 내려받아 열면 링크로 1,001번째 프레임까지 이동할 수 있다.
