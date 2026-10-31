# design-system-canvases — spec

PRODUCT §6 'Open questions'의 "Design-system canvases" 항목을 feature로 만든다. design-system 캔버스(토큰과 컴포넌트, 그 규칙)를 `.doan/ds/`에 모으고, 그 위치를 곧 캔버스 유형으로 삼는다. `document` preset이 이 캔버스들을 처음 만들고 유지한다. 예시는 이 repo의 `.doan/canvases/notice.html`(컴포넌트 하나, 프레임 3개)과 `buzz-ds.html`(시스템 전체, 프레임 21개)이다.

## 사용자

- **에이전트**(외부 세션과 앱 대화): `document` preset을 읽고 `.doan/ds/`에 토큰 그룹별·컴포넌트별 캔버스를 만든다. 다시 요청받으면 코드와 어긋난 캔버스만 고친다. `doan ls`·`doan check`는 `.doan/ds/` 캔버스도 다른 캔버스와 똑같이 다룬다. 다른 preset(`polish`, `colorize` 등)은 `.doan/ds/`에서 design system을 찾는다.
- **사람**(앱): sidebar에서 워크트리의 화면 초안 아래 'Design system' 묶음으로 design-system 캔버스를 따로 본다. 열기, 코멘트, 선택, inspector는 다른 캔버스와 같다. Home은 `.doan/ds/`가 비어 있을 때만 `document`를 추천한다.

## 문제 (관찰한 사실)

- design-system 캔버스를 다른 캔버스와 구별할 수 없다. `buzz-ds.html`·`notice.html`은 화면 초안과 같은 `.doan/canvases/`에 섞여 있고, sidebar는 캔버스를 이름순 한 줄로 늘어놓는다(PRODUCT §5 item 1).
- `document` preset은 시스템 전체를 캔버스 하나(`.doan/canvases/design-system.html`)에 그린다. 컴포넌트가 늘수록 한 파일이 커진다(`buzz-ds.html` 111,537 B, 프레임 21개). 반면 `notice.html`은 컴포넌트 하나를 한 캔버스에 담아 16,613 B다.
- Home의 추천 규칙은 design system이 있는지를 캔버스 id나 파일 이름 `design-system` 하나로 판단한다(`app/src/renderer/homeComposer.ts` `isDesignSystem`). 다른 이름으로 나눈 design system은 알아보지 못한다.
- `polish`·`colorize`·`onboard`·`adapt`·`bolder`·`distill`·`extract`·`document` preset 본문이 `.doan/canvases/design-system.html` 한 경로만 가리킨다.

## 완료 조건

1. `.doan/ds/` 아래 `.html` 파일 하나가 캔버스 하나다. `doan ls`가 `.doan/canvases/`와 `.doan/ds/`의 캔버스를 한 목록으로 path byte 순서대로 돌려준다. 결과 모양은 바뀌지 않는다(새 필드 없음).
2. 앱 기본 서빙 범위(`doan ls` `result.scope`)에 `.doan/ds/`가 들어간다. `.doan/ds/` 캔버스가 링크한 `.doan/ds/` 안의 CSS에 `css_not_served`가 나오지 않는다. `doan config --add-serve .doan/ds`도 `.doan/canvases`처럼 받아들인다.
3. 캔버스 id와 프레임 규칙, `doan check`의 모든 규칙이 두 디렉터리에 똑같이 적용된다. 두 디렉터리 사이의 id 중복은 `duplicate_canvas_id`다. `no_canvases`는 두 디렉터리 모두 비었을 때만 나온다.
4. 앱이 `.doan/ds/`를 감시한다. 그 안의 캔버스 HTML이 바뀌면 그 캔버스 행의 `rev`만 오르고, 다른 파일이 바뀌면 `servedRev`가 오른다(`.doan/canvases/`와 같은 규칙). `.doan/ds/`를 지웠다가 다시 만들어도 감시가 이어진다.
5. sidebar는 펼친 프로젝트에서 선택한 워크트리의 `.doan/canvases/` 캔버스 행 다음에 'Design system' 묶음과 그 안의 `.doan/ds/` 캔버스 행을 보인다. 행의 동작(열기, 코멘트 수, 상태 slot, 읽기 오류, 화살표 키, typeahead)은 기존 캔버스 행과 같다. 화면은 확정한 초안을 따른다.
6. Home 추천: '캔버스 없음'과 `critique`·`polish` 대상은 `.doan/canvases/` 캔버스만 센다. `document`는 `.doan/ds/`에 캔버스가 없을 때 추천한다.
7. 썸네일, Quick Open, 캔버스 이동 추적, 앱 대화의 캔버스 연결(conversation 저장 검증과 activity의 `insideDesign`)이 `.doan/ds/` 캔버스에서도 `.doan/canvases/` 캔버스와 똑같이 동작한다. 캔버스가 사라졌을 때의 toast는 그 캔버스가 있던 디렉터리 이름을 말한다.
8. `document` preset이 `.doan/ds/`에 토큰 그룹별·컴포넌트별 캔버스를 만들기를 기본으로 제안한다. 프로젝트가 이미 다르게 정리해 두었으면 그 구성을 따른다. `.doan/canvases/design-system.html`이 있으면 그것을 기존 design system으로 읽고, 사용자의 동의 없이 옮기지 않는다. 다른 preset 본문은 design system을 `.doan/ds/`에서 찾는다. guide와 preset 출력은 출력 예산 테스트 안에 있다.
9. 이 repo: `notice.html`이 `.doan/ds/notice.html`로 옮겨지고(id 그대로), `buzz-ds.html`은 확장한 `document` preset으로 `.doan/ds/`의 여러 캔버스로 나뉜다. `doan check --repo .`에 이번 변경으로 생긴 error가 없고, DESIGN.md의 참조가 새 경로와 프레임을 가리킨다.
10. `/agent-eval` 라운드에서 design system을 새로 만들기, 이미 있는 것 재사용하기, 코드 변경 뒤 유지하기 시나리오를 Claude Code와 Codex가 통과하고, 이 변경으로 생긴 새 issue 행이 없다.

## 비목표

- **Project Overview**: `.doan/ds/` 섹션의 제목, 순서, design-system 캔버스만 있을 때의 빈 상태는 buzz-restyle의 `buzz-project`(#7)가 정한다(2026-10-31 user). 그때까지 Overview는 기존 폴더별 묶음 규칙대로 `.doan/ds` 섹션을 보이고, design-system 캔버스만 있는 프로젝트에서는 FirstPrompt가 나오지 않는다.
- **캔버스 유형 meta나 `ls` 필드**: 위치가 곧 유형이다(2026-10-31 user). `doan:kind` meta, `kind` 필드, 유형 전용 `doan check` 규칙을 두지 않는다.
- **새 preset·CLI 명령**: `document`를 확장한다(2026-10-31 user). catalog 20개와 순서, `doan init`은 그대로다. `doan init`은 `.doan/ds/`를 만들지 않는다.
- **자동 유지**: 코드가 바뀌었다고 Doan이 에이전트를 깨우거나 drift를 알리지 않는다(PRODUCT §3 Out of scope 4). 유지는 사람이 요청할 때 `document`가 한다.
- **자동 이동**: 기존 `.doan/canvases/design-system.html`을 CLI나 앱이 옮기지 않는다(ARCHITECTURE §1 'no automatic migration').
- **분할 강제**: 토큰 그룹별·컴포넌트별 분할은 preset의 기본 제안이다. `doan check`는 캔버스 구성을 검사하지 않는다(PRODUCT §3 Out of scope 2).
- 규칙 문서(`DESIGN.md` 등)의 위치와 내용 규칙은 바꾸지 않는다. 계속 `.doan/` 밖에 둔다.
- FirstPrompt 도착 판정과 Home 대화의 캔버스 연결 규칙(`doan ls` 행 기준)은 바꾸지 않는다. `.doan/ds/`에 새로 생긴 캔버스도 도착으로 센다.
