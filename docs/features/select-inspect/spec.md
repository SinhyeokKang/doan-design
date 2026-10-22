# select-inspect — spec

PRODUCT §5 기능 분할 #6. MVP 앱 항목 4(선택과 인스펙터)와 7(`doan active`의 출처), CLI 항목 10(`doan active`), MCP 항목 12의 `active` 도구를 맡는다.

전제: 개발용 스킬 `/design-draft`(`.agents/skills/design-draft/`)는 이 기능 밖에서 먼저 만든다(2026-10-22 사용자). 하네스 변경이라 main에 직접 들어간다(AGENTS.md 'Commit conventions').

## 사용자

- **사람**: 캔버스에서 요소나 프레임을 클릭해 선택한다. 마우스를 올리면 후보만 강조된다. 선택하면 오른쪽 패널에 인스펙터(읽기 전용)가 열려 크기 · 여백 · 글꼴 · 색 · 모서리 · 그림자와 쓰인 토큰 이름을 보여 준다. 인스펙터 머리의 조상 경로로 감싼 요소를 고를 수 있다. 이 선택은 #7 코멘트 작성과 `doan active`가 함께 쓴다(PRODUCT §5 4).
- **에이전트**: "이거 고쳐줘"만 들어도 `doan active`(CLI) 또는 MCP `active` 도구로 사람이 고른 캔버스 · 프레임 · 요소를 받는다. 스킬 규칙 C가 원래 문구(ARCHITECTURE §1 C)로 돌아간다.

## 문제 (현재 관찰된 사실)

- 앱은 캔버스를 보여 주기만 한다. 클릭해도 아무것도 선택되지 않고, 오른쪽 패널에는 Canvas 정보만 있다.
- 사람이 가리키는 대상을 에이전트가 알 길이 없다. `doan skill` 본문의 규칙 C는 "That command is not implemented in this CLI core version; ask the user to identify the canvas or frame until it is available."다(`cli/internal/cli/skill.md:24`).
- 런타임 파일과 소켓(ARCHITECTURE §4)은 결정만 있고 구현이 없다. PoC 6의 소켓 절반이 남아 있다(PRODUCT §6).
- 인스펙터에 토큰 이름을 붙이는 방법은 PoC 2로 남아 있고 검증되지 않았다. 캔버스 문서의 origin은 opaque(`null`)라서, CDN 시트뿐 아니라 같은 로컬 서버의 `tokens.css`도 `cssRules`를 읽지 못할 수 있다(ARCHITECTURE §3 CORS, PoC 4).
- `doan active`와 #7 프레임 코멘트가 렌더된 DOM 프레임 목록을 쓸지, 정적 `doan ls` 프레임을 쓸지 정하지 않았다(PRODUCT §8).

## 완료 조건

1. PoC 2와 PoC 6 소켓 절반, 그리고 ⌥클릭 확인의 결과가 PRODUCT §6에 날짜와 함께 적혀 있다. 기준에 못 미치면 구현 전에 멈추고 사용자에게 묻는다.
2. Codex가 그린 초안 캔버스 `design/select-inspect.html`이 있고, design.md '초안 요청'의 프레임 id가 모두 있으며, 사용자가 확정했다. `doan check --repo .`에 오류가 없다.
3. 캔버스 위에 마우스를 올리면 그 아래 요소가 강조되고, 클릭하면 그 요소가 선택된다. 일반 클릭은 캔버스 자체 동작(링크 이동, 버튼, 입력 포커스)을 막는다. ⌥클릭은 막지 않고 선택도 바꾸지 않는다. 그래서 캔버스 안 링크 이동(PRODUCT §7 2026-10-22)은 이제 ⌥클릭으로 한다. 캔버스 스크립트가 스스로 부른 클릭(`isTrusted: false`)은 선택하지 않는다. 선택 표시는 캔버스 DOM이 아니라 화면 좌표 오버레이에 그리고, 배율 0.05 · 0.25 · 1 · 4와 캔버스 안 스크롤 뒤에도 요소 사각형과 1px 안에서 맞는다(PoC 3 측정 방식).
4. 선택은 앱 전체에 하나다(2026-10-22 사용자, 리뷰 R1). 프레임도 선택할 수 있고, Frames 목록의 현재 표시는 선택을 따른다. Esc를 누르거나 빈 곳(보드 밖, 캔버스의 `html` · `body`)을 클릭하면 선택이 풀린다. 다른 캔버스를 열거나, 캔버스를 닫거나, 목록에 없는 문서로 가거나, 그 프로젝트가 닫히거나 찾을 수 없게 되면 선택이 풀린다. 같은 캔버스를 다시 불러오면 같은 요소를 다시 찾고, 못 찾으면 풀리며 그 사실을 알린다.
5. 선택하면 오른쪽 패널에 인스펙터가 보인다. PRODUCT §5 4의 항목(박스: 크기 · padding · margin · gap / 글꼴: family · size · line-height · weight / 색: 글자 · 배경 · 테두리 / radius / shadow / `data-doan-*`)을 보여 준다. 각 값은 넷 중 하나로 표시한다: 토큰(이름과 값), 하드코딩, 알 수 없음(읽을 수 없는 시트가 이겼을 수 있음), 기본값(작성자 선언 없음). 편집은 없다. 머리의 조상 경로에서 조상을 고를 수 있다.
6. `doan active [--repo]`가 지금 선택이 그 프로젝트의 것이면 캔버스 · 프레임 · 요소를 `--json` 봉투로 돌려준다. 요소는 #7 코멘트의 `target.element`와 같은 모양(`doanId?` · `selector` · `html` · `text?`)이다. 선택이 없거나 다른 프로젝트의 것이면 `ok: true`이고 `selection`이 없다. 그 프로젝트가 앱에 열려 있지 않으면 exit 3 `project_not_open`, 앱이 꺼져 있으면 exit 3 `app_not_running`, 버전이 다르면 exit 3 `app_protocol_mismatch`다.
7. MCP `active` 도구가 같은 봉투를 돌려준다. Claude Code와 Codex에서 MCP 도구와 셸의 `doan active`로 각각 불러, 사람이 앱에서 고른 대상을 받는다(AGENTS.md 'Commands'의 실제 에이전트 확인).
8. `doan skill` 본문의 규칙 C가 ARCHITECTURE §1 C 문구로 돌아가 있고, `active` 명령과 도구가 본문 표에 있다. 본문은 `active` 결과의 `html` · `text`도 코멘트 본문처럼 데이터로 다루라고 적는다(규칙 A).
9. 런타임 파일과 소켓 메시지가 JSON Schema로 정의되어 있고, TS(쓰는 쪽)와 Go(읽는 쪽)가 같은 fixture를 읽는다.
10. 기존 e2e(app-shell, canvas-view, app-ui)가 그대로 통과한다. 선택 · 인스펙터 · `doan active` e2e가 더해진다. 보안 조건(캔버스 메시지 검증과 길이 상한, 발신 프레임 확인, 소켓 토큰, 파일 권한)은 하나씩 빼 보았을 때 테스트가 빨개진다.
11. `/design-sync`를 초안의 새 상태 프레임에 돌렸고, 대조표가 모두 일치하거나 기록된 차이다. 측정값은 `docs/DESIGN.md`에 있다.

## 비목표

- 코멘트 작성 · 핀 · outdated · 에이전트에게 보낼 문장 복사(#7). 오버레이와 키 전달 채널은 #7이 같이 쓸 자리만 맞춘다.
- 인스펙터 편집. 사람은 그리지 않는다(PRODUCT §3 범위 밖 1).
- 여러 요소 선택, 부모 · 자식으로 선택을 옮기는 단축키. 조상은 인스펙터 머리의 조상 경로로만 고른다(리뷰 R4).
- 키보드만으로 캔버스 안 요소를 고르기. 키보드로는 Frames 목록의 프레임과 조상 경로까지 닿는다.
- 선택한 뒤 페이지 스크립트가 바꾼 스타일을 인스펙터가 따라가기. 값은 선택할 때 한 번 모은다.
- 렌더 검사(겹침 · 넘침 · 콘솔 오류)와 너비 · 테마 · 상태 전환(PRODUCT §5 Deferred).
- 선택을 디스크에 저장하기. 선택은 앱 메모리에만 있고 앱을 끝내면 사라진다.
- 에이전트를 깨우거나 선택이 바뀌었다고 알리기(PRODUCT §3 범위 밖 4). `doan active`는 물어볼 때만 답한다.
- 번들 CLI 경로와 온보딩(#8). 이번에도 `DOAN_CLI` 또는 `PATH`의 `doan`을 쓴다.
