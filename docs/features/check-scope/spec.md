# 검사 범위 — spec

`doan check`에 편집한 파일 경로를 넘기면, CLI가 그 파일이 영향을 주는 캔버스로 범위를 정하고 그 결과만 돌려준다. 인자가 없으면 지금처럼 저장소 전체를 보고한다.

## 사용자

- **에이전트**: 캔버스나 CSS를 편집한 뒤 `doan check`를 돌리는 Claude Code, Codex 등이다. 편집한 파일을 그대로 넘기고, 그 파일이 영향을 주는 캔버스의 결과만 받는다. 범위를 고르는 판단은 하지 않는다.
- **사람**: 직접 바뀌는 화면은 없다. 터미널에서 `doan check`를 인자 없이 돌리면 지금과 같은 전체 결과를 본다. 앱은 `doan check`를 돌리지 않는다. 앱이 보여 주는 "run `doan check`" 안내 문구는 그대로다.

## 문제

- `doan check`는 인자를 받지 않는다(`usage_error: check takes no positional arguments`). 언제나 저장소의 모든 캔버스를 검사하고, 모든 결과를 돌려준다(ARCHITECTURE §1 '`doan check` rules').
- 안내(가이드 E, `cli/internal/cli/skill.md`)와 디자인 프리셋은 "After editing, make `doan check` pass"라고 시킨다. 2026-11-25에 이 저장소에서 돌린 결과는 다음과 같다:
  - 147개 캔버스를 검사해 경고 43개가 나왔다. 43개 모두 공유 파일 `.doan/assets/mock.css`의 `hardcoded_color`다. 에이전트는 무엇을 편집하든 매번 같은 경고를 받는다. JSON으로 약 6KB, 텍스트로 약 7.6KB다.
  - 다른 캔버스에 오류가 하나라도 있으면 exit 4가 된다. 그러면 에이전트는 "통과시켜라"를 지키려고 자기 작업과 관계없는 캔버스를 고치거나, 실패를 안고 끝낸다.
- 저장소 전체를 보는 규칙은 있다(`duplicate_canvas_id`: 캔버스 id는 저장소 전체에서 유일해야 한다). 그래서 검사는 전체를 해야 하고, 보고만 좁혀야 한다.

## 확정한 결정 (사용자)

- 단계는 두 가지다. 인자가 없으면 저장소 전체, 경로를 주면 그 경로가 정하는 범위다. 프레임 단위와 여러 저장소 단위는 만들지 않는다.
- 에이전트에게 범위를 고르게 하지 않는다. 에이전트는 편집한 파일을 넘기고, 범위는 CLI가 파일 종류로 정한다. 공유 CSS를 고쳤을 때 그 CSS에 닿는 다른 캔버스까지 보게 하기 위해서다.
- 인자 없는 전체 검사는 사람이 전체 점검을 부탁할 때 쓴다.
- 다른 캔버스를 읽을 수 없으면 지금처럼 명령 전체가 실패한다.
- 디자인 프리셋의 "make `doan check` pass"도 바꾼다.
- 숨긴 결과의 수는 알리지 않는다.

## 완료 조건

1. `doan check <경로>...`는 언제나 저장소 전체를 검사하고, 경로가 정하는 범위의 결과만 돌려준다. 범위는 넘긴 경로마다 다음 캔버스를 모은 합집합이다.
   - 캔버스(`.doan/canvases/*.html`, `.doan/ds/*.html`): 그 캔버스
   - CSS 파일(`.css`, 저장소 안): 그 CSS에 닿는 모든 캔버스. 직접 링크와 `@import`로 닿는 것을 포함한다.
   - `.doan/config.json`: 저장소의 모든 캔버스
2. 범위가 있을 때 돌려주는 결과:
   - 범위 안 캔버스 파일의 결과
   - 범위 안 캔버스와 id가 겹치는 다른 캔버스의 `duplicate_canvas_id`
   - 범위 안 캔버스가 닿는 CSS 파일의 결과. 그 캔버스를 기준으로 판정한다(design.md '범위 판정').
   - 저장소 설정의 결과(`.doan/config.json`: `token_css_not_found`, `serve_withheld`). 모든 캔버스에 걸리기 때문이다.
3. exit 코드는 돌려준 결과로만 정한다. 돌려준 결과에 오류가 있으면 4이고, 없으면 0이다. 범위 밖 캔버스의 오류는 exit에 영향을 주지 않는다.
4. `summary`의 모양은 그대로(`{canvases, errors, warnings}`)다. 값은 범위 안에서 센다: `canvases`는 범위 안 캔버스 수, `errors`와 `warnings`는 돌려준 결과의 수다. 어떤 캔버스도 닿지 않는 CSS만 넘기면 `canvases`는 0이고, 결과는 설정 결과뿐이다.
5. 인자 없는 `doan check`의 출력, exit 코드, 세션 연결 기록은 지금과 바이트 단위로 같다.
6. 경로 규칙:
   - 캔버스는 `doan work`와 같은 규칙을 따른다(ARCHITECTURE §4 'Work signals over app-socket v3' 'Paths').
   - CSS와 설정은 저장소 상대 경로나 저장소 안의 절대 경로로 받는다.
   - 세 종류에 들지 않거나 저장소 밖인 경로는 `usage_error`(exit 2)다.
   - 없는 캔버스는 `canvas_not_found`(exit 2)다. 오타를 잡기 위해서다.
   - 없는 CSS는 받는다. 범위는 그 경로를 링크하거나 import하던 캔버스다. 공유 CSS를 지운 뒤 깨진 캔버스를 보게 하기 위해서다.
   - 같은 경로를 두 번 넘기면 한 번으로 친다.
7. 셸 `doan check`의 세션 연결 기록은 인자가 있어도 지금처럼 검사한 모든 캔버스를 대상으로 한다(ARCHITECTURE §4 'Shell check session associations').
8. 안내와 프리셋은 편집한 파일 경로를 넘기라고 가르친다.
   - 가이드 E: "After editing, make `doan check <edited canvas, CSS and config paths> --json` pass."
   - 명령 설명 줄: 경로를 주면 그 파일이 영향을 주는 캔버스만 보고하고, 인자가 없으면 저장소 전체를 보고한다. 인자 없는 형태는 사람이 전체 점검을 부탁할 때 쓴다.
   - 프리셋의 "make `doan check` pass"도 같은 형태로 바꾼다.
9. `/agent-eval`이 통과한다. 에이전트가 편집한 파일 경로를 넘겨 `doan check`를 돌리고, 기존 시나리오의 검사가 회귀하지 않는다.

## 비목표

- 프레임 단위 검사. 규칙 대부분이 캔버스 단위라서(`doan:width`, 캔버스 안의 `data-doan-id` 중복, `goto` 대상, 토큰이 닿는 범위), 프레임으로 좁히면 오류를 놓칠 수 있다.
- 여러 저장소를 한 번에 검사하기. CLI는 저장소 하나를 기준으로 돈다(`--repo`).
- 검사 속도. 범위를 줘도 전체를 검사한다.
- 숨긴 결과의 개수나 목록을 따로 알려 주는 필드. 전체가 필요하면 인자 없이 돌린다.
- 새 검사 규칙, 기존 규칙의 수준(error/warning) 변경, `mock.css`의 `hardcoded_color` 정리.
- 앱 변경. 앱은 `doan check`를 돌리지 않는다.
