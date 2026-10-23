# comments-ui — 설계

기준과 사용자 결정은 [spec.md](./spec.md)를 따른다. 제품 UI 문구는 영어, 이 기능 문서는 한국어다. 아래 함수·IPC 이름은 구현 계획이며 현재 제공되는 API가 아니다.

## 1. 구성과 기존 결정

| 구성 | 변경 |
|---|---|
| app main | 코멘트 파일 읽기·검증·append, git 작성자 조회, canvasHash, clipboard, sender 검증 |
| preload | 읽기·변경·복사의 좁은 API와 변경 알림 |
| renderer | 패널 목록·작성기·상태 전환·초안 이동 보호·핀 표시 |
| 주입 스크립트 / CanvasController | 여러 코멘트 대상의 위치 조회와 재측정. 기존 selection/hover 채널 보존 |
| formats | 기존 comment-event.v1·foldText 재사용. 새 경계 사례 fixture만 추가 |
| CLI / MCP / 배포 skill | 읽기·resolve 계약 유지. 앱 기록을 읽는 round trip 검사만 추가 |

comment-event, runtime, app-socket, CLI envelope의 버전과 필드는 바꾸지 않는다. 저장된 target은 생성 후 불변이다. canvasHash는 생성 때만 기록한다. 앱 읽기·쓰기와 CLI가 같은 파일을 동시에 바꾸는 경우의 전역 트랜잭션이나 잠금은 추가하지 않는다. 쓰기 직전 재검사 이후의 외부 경쟁과 머신 간 시계 차이는 기존 append/fold 모델의 한계로 남는다. 규약·doan check 규칙·서빙 범위·sandbox·git 작업 금지·에이전트 권한도 유지한다. git config의 읽기만 기존 예외대로 허용한다. PRODUCT·ARCHITECTURE의 반영은 마지막 승격 작업에서 한다.

## 2. 패널과 입력 흐름

- 오른쪽 패널의 선택 대상 컨텍스트는 Inspector와 Comments를 함께 표시한다. 현재 280px 폭과 앱 공통 토큰을 기준으로 초안을 만든다. 상세 배치·높이·버튼 크기는 `/design-draft` 확인 후 확정한다.
- `Selection` / `Canvas` 범위를 전환한다(Q1). Canvas 목록은 현재 캔버스의 모든 대상 코멘트를 포함한다. 전체 캔버스에 새로 남기는 작성기는 대상 `Canvas`를 명시한다. 목록 필터와 작성 대상은 같은 개념으로 취급하지 않는다.
- 기본 상태 필터는 Open, Resolved로 전환 가능하다. 각 상태에서 fold의 `(createdAt, comment)` 순서를 유지한다. 프레임 선택 목록은 그 프레임 자체에 붙은 코멘트이며 자식 요소 것은 전체 목록에서 찾는다.
- 카드에 작성자·시간·본문·대상·상태·Outdated·위치 없음과 관련 동작을 표시한다. 삭제는 별도 확인 후 delete 이벤트를 남긴다. 상태 전환은 저장 성공 후 확정한다.
- 본문은 공백뿐이면 저장을 막되, 유효한 본문의 줄바꿈과 앞뒤 공백은 보존한다. 기존 파일의 whitespace-only body는 스키마상 유효할 수 있으므로 임의로 삭제·정규화하지 않는다.
- 작성 시작 시 `{root, canvas path/id, document generation, target snapshot, loaded canvas hash}`를 고정한다. 다른 대상 선택·캔버스/프로젝트 이동·목록의 다른 대상 열기 전에 Q3 확인을 거친다. 저장은 원래 대상에 성공해야 이동하며, 버리기는 초안을 없앤 뒤 이동, 계속 작성은 이동 취소다.
- 외부 파일 변경·대상 소멸처럼 막을 수 없는 전환은 초안과 원래 대상 표시를 남기고 저장을 비활성화한다. 재확인 없이 새 대상에 옮겨 붙이지 않는다. 창 숨김은 초안을 유지하며 일반 앱 종료는 미저장 확인을 거친다. 강제 종료 복구는 비목표다.
- 해결·재열기·본문 수정 중 외부 변경이 오면 최신 fold와 요청 시점 상태를 비교한다. 충돌 시 조용히 덮어쓰지 않고 최신 상태와 보존된 입력을 보여준다. 삭제된 코멘트에 쓰기를 성공으로 표시하지 않는다.

## 3. 읽기·쓰기와 IPC 경계

- 열린 프로젝트와 canvas 목록은 기존 Go `doan ls` 결과를 권위로 사용한다. main이 그 목록의 정확한 path/id 일치와 유일성을 검사한다. repo 탐색·HTML meta parsing을 TS에 복제하지 않는다.
- 앱 읽기는 main에서 JSONL을 읽고 TS `foldText`를 호출해 open과 resolved를 모두 제공한다. CLI에 `--all`이나 사람 쓰기 명령을 추가하지 않는다.
- 기존 디렉터리와 파일은 symlink를 따르지 않고 regular file인지 검사한다. 새 파일은 ARCHITECTURE §1의 `^[a-z0-9]+(-[a-z0-9]+)*$`를 통과한 유일한 canvas id에서만 생성한다. 경로 구분자·`..`·NUL·case-only 충돌을 거부하고 기존 파일 이름과 id를 정확히 비교한다. macOS의 case-insensitive 경로를 논리 id 일치로 간주하지 않는다.
- `.doan/comments/`가 없으면 초기화된 프로젝트 아래에서만 만든다. dangling symlink나 디렉터리 교체 경쟁으로 외부 파일에 쓰지 않도록 open 시점에 보호하고 fd로 검사한다. 기존 파일을 truncate/replace하지 않는다. 안전한 open이 불가능하면 오류를 반환한다.
- main이 git config user.name/user.email을 해당 저장소 cwd에서 shell 없이 조회한다. 이름 없음은 Q4 안내, 실행 실패는 별도 오류다. 이름이 없으면 생성뿐 아니라 모든 이벤트 쓰기를 막는다. 앱은 git config를 쓰지 않는다.
- id·at·by·canvasHash는 main이 생성한다. renderer가 지정한 작성자·시간·파일 경로·hash를 신뢰하지 않는다. UUIDv4, UTC 밀리초, 파일의 허용된 이벤트 중 최대 at와 현재 시각의 max+1ms 규칙을 적용한다.
- 열린 문서 hash는 현재 선택이 보고한 값이 아니라 main의 서빙 응답과 문서 세대를 연결해 확보한다. 파일 변경 알림 뒤에 디스크를 읽은 hash만으로 이전 DOM의 버전을 추정하지 않는다. 구체적인 응답/hash 연결은 task 0에서 검증한다.
- create 시 열린 문서와 디스크 파일 hash가 일치하는지 확인한다. 쓰기 직전 문서가 바뀌면 stale 결과로 돌려보내고 초안을 보존한다. 파일 bytes를 읽는 도중 변경되는 경우도 오류/재확인으로 처리하며 DOM과 다른 시점의 hash를 조용히 결합하지 않는다.
- app 내 파일별 쓰기는 직렬화하고 매번 최신 파일을 다시 읽는다. 이벤트를 공유 schema로 검증한 뒤 UTF-8 JSONL을 한 번의 O_APPEND write로 추가한다. 기존 마지막 바이트가 LF가 아니면 LF를 앞에 붙인다. short write·권한 실패·닫기 실패를 성공으로 표시하지 않는다.
- 기록 후 응답이 끊긴 경우를 대비해 논리 요청에 event id를 유지하고 재시도 전 파일에서 확인한다. id가 다른 새 create를 자동 재전송해 중복을 만들지 않는다. 읽기·재시도와 기록 여부가 불명확한 상태를 UI에 구별한다.
- IPC는 예를 들어 `comments:list`, `comments:mutate`, `comments:copy`로 제한한다. 요청은 root/canvas identity와 의도·body/comment id·선행 상태만 허용한다. main app frame 외 sender, 닫힌 프로젝트, 잘못된 shape/unknown field는 거부한다. iframe 메시지는 위치 데이터만 전달하고 디스크 쓰기 권한이 없다.
- 응답은 성공 데이터 또는 사용자에게 표시 가능한 오류다. canvas/document/request id를 돌려받아 오래된 읽기·쓰기 응답이 현재 패널을 바꾸지 않게 한다. 저장 완료 여부와 현재 선택 여부를 분리한다.
- 날짜 패턴은 맞지만 달력상 불가능한 최대 at의 기존 문제는 새 형식 변경 없이 해당 파일의 쓰기 오류로 처리한다. 유효한 기존 코멘트 읽기는 유지한다. 원래 PRODUCT §8의 미결 문제를 이 기능에서 임의로 닫지 않는다.

## 4. 대상·핀·Outdated

- 요소: 문서 내 doan-id가 유일하면 사용하고, 아니면 저장된 selector가 정확히 한 요소를 가리킬 때만 사용한다. selector 예외·복수 매치·사라짐은 위치 없음이다(Q2). 프레임은 렌더 DOM의 정확하고 유일한 frame id로 찾는다. 요소 재탐색 실패를 프레임 코멘트로 바꾸지 않는다.
- HTML·text는 화면에서 plain text 참고 정보로만 사용한다. hash 변경은 Outdated, 위치 조회 실패는 위치 없음이며 두 상태를 별도로 계산한다. hash를 계산할 수 없으면 ‘최신’으로 간주하지 않는다.
- 열린 코멘트만 대상별 그룹으로 묶는다(Q5). 현재 같은 DOM 요소로 확인된 코멘트를 한 핀에 모으고 개수를 표시한다. 위치 없는 코멘트는 핀을 만들지 않는다. 캔버스 코멘트도 패널에만 둔다.
- 핀은 대상 rect의 오른쪽 위를 기준으로 screen-space overlay에 둔다. 화면 밖·클립된 대상에 가짜 가장자리 핀을 만들지 않는다. 가까운 다른 대상은 하나로 합치지 않으며 목록 접근을 항상 제공한다. 실제 겹침·작은 화면·긴 개수·키보드 상태는 초안으로 확인한다.
- 핀 클릭은 해당 그룹의 코멘트를 열고 실제 대상을 선택한다. 댓글 작성 초안이 있으면 먼저 Q3를 적용한다. 캔버스 클릭으로 이벤트가 전파되지 않게 한다. 핀 외 overlay는 기존 pointer-events 동작을 유지한다. 포커스된 핀이 사라지면 대응 목록 또는 Comments 제목으로 포커스를 이동한다.
- 위치 조회는 새 독립 request/generation 채널을 쓴다. selection seq와 hoverSeq를 올리거나 재사용하지 않는다. 소스 window·opaque origin·href·문서 generation·현재 viewport·유한 rect를 검사한다. 옛 iframe의 응답을 적용하지 않는다.
- 여러 대상을 한 번에 조회하고 scroll/resize/mutation/load 이후 rAF 단위로 재측정한다. 현재 선택·Inspector 요청을 바꾸지 않는다. 조회 대상을 제한해야 한다면 잘린 수와 목록 접근을 표시하며 조용히 누락하지 않는다. 정확한 성능 한도는 task 0의 실측으로 정한다.
- native 이벤트 전후의 selection이 이미 바뀌고 나서 확인창만 띄우지 않도록 전환을 실제로 보류하는 경로가 필요하다. 원래 클릭 대상과 현재 document를 다시 검증한 뒤 승인된 전환을 적용한다.

## 5. 변경 감지와 복사

- shell의 현재 servedRev와 별개로 코멘트 invalidation을 전달한다. 파일의 본문·상태·경고가 바뀌면 개수가 같아도 다시 읽는다. 코멘트 변경만으로 servedRev를 올리거나 iframe을 교체하지 않는다.
- 읽기 중 새 변경이 오면 최신 읽기만 publish한다. 프로젝트/캔버스 전환은 구독과 요청을 무효화한다. 현재 편집 body는 외부 업데이트로 덮어쓰지 않는다.
- 복사 범위는 Q6대로 단일 comment id 또는 현재 캔버스의 open id 목록이다. 목록 버튼은 열린 코멘트가 없으면 비활성화한다. 본문을 실행 지시로 덧붙이지 않고 id로 읽도록 안내한다.
- 영어 문장에 저장소 절대 경로·canvas id·comment id를 JSON 문자열 등 명확한 데이터 표현으로 넣는다. shell 명령을 조립하지 않는다. ‘이 범위의 코멘트를 CLI/MCP로 읽고, 요청 범위에서 반영한 뒤 해당 id만 해결하라’는 뜻을 담는다. 단일 resolved 코멘트는 기존 open-only 도구에 보이지 않으므로 재열기 전 복사를 비활성화하고 이유를 표시한다.
- 클립보드는 main에서 시스템 API로 기록한다. 성공 후 Copied, 실패 시 오류를 표시한다. 앱은 자동 전송·에이전트 실행·전역 MCP 변경을 하지 않는다.

## 6. 순수 함수 — /tdd 진입점

| 책임 | 입력 → 출력 | 필수 경계 |
|---|---|---|
| 목록 projection | fold 결과·scope·status·선택 식별자 → 카드·개수·상태 | 위치 없음, 동일 id/다른 root, 프레임과 자식 구분 |
| target matching | 저장 anchor·렌더 후보 → 유일 target 또는 missing | 중복 id, invalid selector, 0/복수 매치 |
| event preparation | 의도·최신 fold·작성자·now·UUID·hash → 검증할 이벤트/오류 | 삭제·충돌·공백 본문·불가능 날짜·LF |
| draft transition | 초안·원래 대상·이동 의도·사용자 응답 → 보류/저장/이동 | 저장 실패, 외부 소멸, 오래된 완료 |
| pin projection | 그룹·rect·scale·pan·viewport → 화면 위치·가시성 | 저배율, 내부 스크롤, 겹침, finite bounds |
| outdated | 생성 hash·현재 hash 상태 → same/outdated/unknown | target missing과 독립 |
| copy text | 검증된 root/canvas/id 목록 → 영어 문장 | 따옴표·개행·한글·shell 메타문자, 빈 목록 |

함수 이름·파일 분할은 구현 전에 인터페이스로 고정하되 범용 프레임워크를 만들지 않는다. DOM 조회·파일·Git·clipboard는 위 순수 계산의 바깥에 둔다.

## 7. 회고에서 가져온 검사

출처: `docs/POSTMORTEM.md`의 다음 항목. 인용은 해당 문서 원문이다.

- 2026-10-21 fold: “state the exact character set / numeric range in design”. 기존 foldText를 재사용하고 BOM·CR·Unicode·중복 이벤트 fixture를 양 언어에서 실행한다.
- 2026-10-21 파일 시스템: “a dangling symlink at each write target”. 새 writer에 symlink·대소문자·비정규 파일·디렉터리 교체 실패 검사를 둔다.
- 2026-10-22 디자인: “also pair children that carry text, background, or spacing”. 핀 숫자·작성자 이니셜·상태 배지·본문·버튼·오류를 각각 측정한다.
- 2026-10-23 순서 경쟁: “keep selection and hover/modifier counters independent”. 코멘트 조회가 대기 중인 선택 응답을 버리지 않는 교차 순서 검사를 둔다.
- 2026-10-22 watcher: 삭제된 디렉터리 watcher가 끊기는 회고를 따라 comments 디렉터리 생성·교체·삭제 후 재등장도 검증한다.

## 8. PoC와 초안 게이트

PRODUCT §6의 기존 rendering·IPC·union merge 전제는 통과했다. 다만 이 기능의 다중 anchor 성능과 주입 클릭을 초안 확인 전까지 보류하는 입력 경로는 아직 검증하지 않았다. task 0에서 기존 기능 회귀 없이 가능한지 확인하고, 불가능하면 코딩을 진행하기 전에 설계를 다시 결정한다.

초안은 `/feature-review` 뒤 `design/comments-ui.html`에 별도 `/design-draft`로 만든다. 이 `/feature`는 초안 HTML이나 앱 코드를 쓰지 않는다. 필수 상태: 선택 대상/전체 목록, 캔버스 작성, Open/Resolved, 빈 목록, 작성/수정, 저장 중/실패, 삭제 확인, 미저장 이동 확인, 이름 미설정, 위치 없음, Outdated와 둘의 동시 표시, 읽기 실패/부분 경고, 긴 본문/작성자/복사 문장, 핀 그룹·겹침·포커스. 초안에 없는 상태는 design-sync에서 검증했다고 보고하지 않는다.
