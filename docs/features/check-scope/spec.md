# 검사 범위 — spec

`doan check`에 캔버스 경로를 넘기면 그 캔버스에 관한 결과만 돌려준다. 인자가 없으면 지금처럼 저장소 전체를 보고한다.

## 사용자

- **에이전트**: 캔버스를 편집한 뒤 `doan check`를 돌리는 Claude Code, Codex 등이다. 자기가 편집한 캔버스의 결과만 받고, 그 결과로 통과 여부를 판단한다.
- **사람**: 직접 바뀌는 화면은 없다. 터미널에서 `doan check`를 인자 없이 돌리면 지금과 같은 전체 결과를 본다. 앱은 `doan check`를 돌리지 않는다. 앱이 보여 주는 "run `doan check`" 안내 문구는 그대로다.

## 문제

- `doan check`는 인자를 받지 않는다(`usage_error: check takes no positional arguments`). 언제나 저장소의 모든 캔버스를 검사하고, 모든 결과를 돌려준다(ARCHITECTURE §1 '`doan check` rules').
- 안내(가이드 E, `cli/internal/cli/skill.md`)와 디자인 프리셋은 "After editing, make `doan check` pass"라고 시킨다. 2026-11-25에 이 저장소에서 돌린 결과는 다음과 같다:
  - 147개 캔버스를 검사해 경고 43개가 나왔다. 43개 모두 공유 파일 `.doan/assets/mock.css`의 `hardcoded_color`다. 에이전트는 무엇을 편집하든 매번 같은 경고를 받는다. JSON으로 약 6KB, 텍스트로 약 7.6KB다.
  - 다른 캔버스에 오류가 하나라도 있으면 exit 4가 된다. 그러면 에이전트는 "통과시켜라"를 지키려고 자기 작업과 관계없는 캔버스를 고치거나, 실패를 안고 끝낸다.
- 저장소 전체를 보는 규칙은 있다(`duplicate_canvas_id`: 캔버스 id는 저장소 전체에서 유일해야 한다). 그래서 검사는 전체를 해야 하고, 보고만 좁혀야 한다.

## 완료 조건

1. `doan check <캔버스 경로>...`는 저장소 전체를 검사하되, 다음 결과만 돌려준다.
   - 넘긴 캔버스 파일의 결과
   - 넘긴 캔버스와 id가 겹치는 다른 캔버스의 `duplicate_canvas_id`
   - 넘긴 캔버스가 닿는 CSS 파일의 결과. 그 캔버스에 대해 판정한 것이다(design.md '범위 판정').
   - 저장소 설정의 결과(`.doan/config.json`: `token_css_not_found`, `serve_withheld`). 모든 캔버스에 걸리기 때문이다.
2. exit 코드는 돌려준 결과로만 정한다. 돌려준 결과에 오류가 있으면 4이고, 없으면 0이다. 다른 캔버스의 오류는 exit에 영향을 주지 않는다.
3. `summary`의 모양은 그대로(`{canvases, errors, warnings}`)이고, 값은 범위 안에서 센다. `canvases`는 넘긴 캔버스 수, `errors`와 `warnings`는 돌려준 결과의 수다.
4. 인자 없는 `doan check`의 출력, exit 코드, 세션 연결 기록은 지금과 바이트 단위로 같다.
5. 경로 규칙은 `doan work`와 같다(ARCHITECTURE §4 'Work signals over app-socket v3' 'Paths'). `.doan/canvases/*.html` 또는 `.doan/ds/*.html`이어야 하고, 저장소 상대 경로와 저장소 안의 절대 경로 모두 받는다.
   - 규칙에 맞지 않는 경로는 `usage_error`(exit 2)다.
   - 없는 파일은 `canvas_not_found`(exit 2)다.
   - 같은 캔버스를 두 번 넘기면 한 번으로 친다.
6. 셸 `doan check`의 세션 연결 기록은 인자가 있어도 지금처럼 검사한 모든 캔버스를 대상으로 한다(ARCHITECTURE §4 'Shell check session associations').
7. 안내와 프리셋이 편집한 캔버스 경로를 넘기라고 가르친다.
   - 가이드 E는 "After editing, make `doan check <edited canvas paths> --json` pass"로 바뀐다.
   - 명령 설명(`doan check --json` 줄)에 두 형태(경로 있음/없음)를 적는다.
   - 프리셋의 "make `doan check` pass"도 같은 형태로 바꾼다.
8. `/agent-eval`이 통과한다. 에이전트가 편집한 캔버스 경로를 넘겨 `doan check`를 돌리고, 기존 시나리오의 검사가 회귀하지 않는다.

## 비목표

- 프레임 단위 검사. 규칙 대부분이 캔버스 단위라서(`doan:width`, 캔버스 안의 `data-doan-id` 중복, `goto` 대상, 토큰이 닿는 범위), 프레임으로 좁히면 오류를 놓칠 수 있다.
- 여러 저장소를 한 번에 검사하기. CLI는 저장소 하나를 기준으로 돈다(`--repo`).
- 검사 속도. 범위를 줘도 전체를 검사한다.
- 숨긴 결과의 개수나 목록을 따로 알려 주는 필드. 전체가 필요하면 인자 없이 돌린다.
- 새 검사 규칙, 기존 규칙의 수준(error/warning) 변경, `mock.css`의 `hardcoded_color` 정리.
- 앱 변경. 앱은 `doan check`를 돌리지 않는다.
