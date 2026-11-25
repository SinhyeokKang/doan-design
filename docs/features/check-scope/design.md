# 검사 범위 — design

## 영향 범위

- **CLI (Go)**:
  - `cli/internal/cli/check.go`의 `Check`: 위치 인자를 받고 범위를 푼다.
  - `cli/internal/check/`: `Input.Scope`와 `Run`의 범위 처리.
  - `cli/internal/cli/run.go`: usage(`check [<path>...]`)와 텍스트 요약 줄.
- **안내**:
  - `cli/internal/cli/skill.md`: 가이드 E와 명령 설명 줄.
  - `cli/internal/designskill/presets/`: `doan check`를 통과시키라는 모든 문장(19개 파일). "make `doan check` pass", "passes `doan check`", "`doan check` passes", "A passing `doan check`" 등의 표현을 포함한다.
- **app**: `app/src/main/conversation/prompt.ts`의 턴 프롬프트 문장(80, 100행 부근 "After making changes, run doan check."). 앱은 `doan check`를 실행하지 않고 그 결과를 읽지도 않는다.
- **eval**:
  - 새 시나리오와 그 fixture.
  - `eval/lib/transcript.ts` `shapeAccepted`에 `check` 항목을 둔다.
  - 기존 시나리오 검사 약 25개가 `ctx.doan(["check"])`를 인자 없이 부르고 `result.findings`와 `summary`를 읽는다. 인자 없는 출력이 같으므로 영향이 없다.
- **포맷**:
  - CLI 응답의 모양은 그대로다(`{findings, summary: {canvases, errors, warnings}}`, ARCHITECTURE §12). `cli-envelope.v1` 스키마와 `v`는 바뀌지 않는다. `sessions.v1`도 그대로다.
  - 프리셋 본문이 바뀌므로 `schema/fixtures/cli-envelope/design-skill/get-clarify.json`을 다시 만든다. `TestFixturesMatchCatalog`와 `app/src/main/designSkills.test.ts`가 이 fixture를 읽는다.

## 범위 판정

지금 `check.Run`은 캔버스를 경로 순서로 돌며 결과를 낸다. 공유 CSS의 결과는 `[path, code, detail]` 키로 한 번만 낸다(`check.go`의 `cssSeen`). 그래서 결과를 다 만든 뒤에 거르면 안 된다.

- 공유 CSS의 `undefined_token`과 `ambiguous_custom_url`은 경로 순서상 먼저 온 캔버스가 차지한다. 그 캔버스가 범위 밖이면 범위 안 캔버스의 결과는 이미 중복으로 지워졌다.
- `Finding.Canvas`는 캔버스 경로가 아니라 id이고, id는 겹칠 수 있다. 그래서 결과를 캔버스로 되돌려 맞출 수 없다.

규칙:

- **`check.Input.Scope`**: 범위 안 캔버스 경로의 집합이다. `nil`이면 전체다.
- **`Run`**:
  1. id 수(`counts`)는 모든 캔버스로 센다.
  2. 범위 밖 캔버스는 `duplicate_canvas_id`만 낸다. 그것도 id가 범위 안 캔버스의 id와 같을 때만 낸다. 그 밖에는 건너뛴다.
  3. `unparsable_canvas`는 범위 안 경로만 낸다.
  4. `no_canvases`와 `canvas_extension_case`는 범위가 있으면 내지 않는다.
  5. 설정 결과는 언제나 낸다.
  - 이렇게 하면 `cssSeen`과 `seen`의 중복 제거가 범위 안 캔버스끼리만 일어난다. `@import` 사슬로 닿는 CSS도 `Reach[c.Path]`에 간접 참조로 들어 있으므로 덮인다.
- **`Summarize`**는 바꾸지 않는다. 호출하는 쪽이 범위가 있으면 범위 안 캔버스 수를, 없으면 지금처럼 검사한 파일 수를 넘긴다.
- **설정 경로**는 `Scope = nil`로 두어 인자 없는 실행과 같은 결과를 낸다. 텍스트 요약 줄만 범위 형태다.

## 경로와 범위 풀기

`checkInput`이 저장소를 다 읽은 뒤에 인자를 맞춘다. 검증과 검사 사이에 파일이 바뀌는 경쟁이 없고, 나열된 캔버스와 같은 목록을 쓴다.

- **종류 가리기**(경로 문자열만 보는 순수 함수):
  - `.html`로 끝나면 캔버스다(대소문자 판정은 맞추기에서 한다).
  - 소문자 `.css`로 끝나면 CSS다.
  - 저장소의 `.doan/config.json`이면 설정이다.
  - 그 밖의 경로, 디렉터리, 저장소 밖 경로, 빈 인자는 `usage_error`다.
- **캔버스 맞추기**: `export.MatchListed(root, listed, arg)`로 나열된 캔버스와 맞춘다. 이 함수가 하위 폴더, `ds/`, NFC/NFD 표기와 루트 별칭을 다룬다. 맞는 것이 없으면 `canvas_not_found`(exit 2)이고, `nextSteps`는 "Run `doan ls --json` and pass a path it lists"다. 점 파일, 심볼릭 링크, `.HTML`은 나열되지 않으므로 여기서 거절된다. 이름을 넘긴 캔버스가 파싱되지 않으면 범위 안에 들고 `unparsable_canvas`(error)를 받는다.
- **CSS 풀기**: 인자를 실제 경로로 풀고(심볼릭 링크와 루트 별칭, 없는 파일은 가장 가까운 기존 조상까지), `in.Reach`에서 그 실제 경로에 닿는 캔버스를 모은다.
  - 지운 CSS는 `Reach`에 `State`가 Missing인 참조로만 남는다. 그런데 CSS 파일 안의 `@import`가 가리키는 지운 파일은 `Reach`에 들지 않는다(`check.go` visit: 간접이면서 Missing이면 돌아간다). 그래서 지운 CSS의 범위는 캔버스가 직접 링크하거나 `<style>`에서 import하던 경우만이다.
  - 모인 캔버스가 없으면 `usage_error` "No canvas links or imports <path>"다.
- **합치기**: 인자마다 푼 캔버스 집합의 합집합이 `Scope`다. 여러 표기로 넘긴 같은 파일은 한 번이다. 설정이 하나라도 있으면 `Scope = nil`이다.
- **순서**: 저장소 오류(`repo_not_found`, `invalid_config`, `unsupported_version`) → 종류 가리기의 `usage_error` → `checkInput`(읽을 수 없는 캔버스는 지금처럼 `internal_error`) → 맞추기와 풀기의 `canvas_not_found`/`usage_error` → `Run`.
- **세션 기록**: `recordSessions`는 결과를 읽지 않고 검사한 파일만 읽는다. 경로 오류로 끝나면 기록하지 않는다. 그러려면 `defer recordSessions`를 맞추기와 풀기가 성공한 뒤에 건다.

## 텍스트 출력

- 범위가 없으면 지금처럼 "<n> canvases checked"다.
- 범위가 있으면 "<n> canvases in scope (<m> checked)"이고, 그 뒤는 지금 형식이다.
- JSON 모양은 그대로다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- **`check.Run`의 `Scope` 처리**: fixture `Input`으로 표 테스트를 쓴다.
  - 범위 밖 캔버스의 오류가 빠진다.
  - id가 겹치는 경우:
    - 세 파일이 id를 함께 쓰고 그중 하나가 범위 안이면, 세 파일 모두 `duplicate_canvas_id`를 받는다.
    - 두 파일 모두 범위 안이면, 각각 한 번씩 받는다.
  - 공유 CSS:
    - 공유 CSS의 결과는 범위 안 캔버스 기준으로 한 번 나온다. 범위 밖 캔버스만 닿으면 나오지 않는다.
    - 공유 CSS의 `undefined_token`은 범위 안 캔버스가 그 토큰을 정의하지 않을 때만 나온다. 경로 순서상 먼저 오는 범위 밖 캔버스 때문에 사라지지 않는다.
  - `@import` 사슬로 닿는 CSS의 결과가 나온다.
  - 파싱되지 않는 범위 안 캔버스는 `unparsable_canvas`를 받는다.
  - 범위가 있으면 `no_canvases`와 `canvas_extension_case`를 내지 않는다. 설정 결과는 언제나 나온다.
  - `Scope == nil`이면 기존 결과와 같다.
- **인자 풀기 `checkScope(root, in, listed, args)`**: `cli/internal/cli/` 표 테스트.
  - 맞추는 경로: 상대 경로, 절대 경로, 루트 별칭, 같은 파일의 여러 표기, 하위 폴더 캔버스, `ds/` 캔버스, NFD 파일에 대한 NFC 인자.
  - `canvas_not_found`: 점 파일, `.HTML`, 심볼릭 링크 캔버스, 없는 캔버스.
  - CSS가 닿는 캔버스: 직접 링크, `@import` 사슬, 심볼릭 링크로 넘긴 CSS, 지운 CSS(직접 링크), 닿는 캔버스가 없는 CSS(`usage_error`).
  - 설정은 `nil` 범위가 된다.
  - `usage_error`: `.md`, `.js`, `.CSS`, 디렉터리, 저장소 밖 경로, 다른 worktree의 절대 경로.

## 형식, 규약, 결정에 미치는 영향

- **형식**: CLI 응답의 모양은 바뀌지 않는다. 인자가 있을 때의 값(결과의 범위와 `summary` 값)과 텍스트 요약 줄만 바뀐다. JSON Schema와 `v`는 그대로다. 프리셋 fixture는 본문이 바뀌어 다시 만든다.
- **규약(ARCHITECTURE §1)**:
  - 검사 규칙은 그대로다.
  - "`doan check` takes no arguments and checks the whole repo"는 바뀐다. 언제나 전체를 검사하고, 경로를 주면 그 범위만 보고하며, exit 코드도 그 범위로 정한다.
  - 에이전트 규칙 E도 바뀐다.
  - §1 39행의 하위 폴더 캔버스 문장(`work`와 `open`은 건너뛴다)에 `check`는 하위 폴더 캔버스도 받는다고 적는다.
- **결정**: 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다. `doan check`가 정적 검사만 한다는 결정(PRODUCT §5 item 11)도 그대로다.
- **사람이 보는 것**: 인자 없는 출력이 같다. 앱의 "run `doan check`" 안내 문구도 그대로다. 앱 대화의 턴 프롬프트 문장은 바뀐다.
- **승인 규칙**: Codex의 `prefix_rule(["doan","check"])`는 인자가 붙어도 맞는다. Claude Code에는 `check` 허용 규칙이 없어서 지금처럼 사람이 승인한다. 사람이 `Bash(doan check --json)`처럼 정확한 명령을 저장해 두었다면, 경로가 다른 실행마다 다시 묻는다. eval에서 이 점을 본다.

## PoC 의존

- 없다. 판정과 풀기는 기존 `checkInput`이 이미 모으는 정보(`Canvases`, `Unparsable`, `Reach`)와 기존 `export.MatchListed`로 한다.

## postmortem에서 가져온 주의점

- 2026-10 "`doan check` returned zero errors and warnings without saying that it checked zero canvases"(USABILITY-EVAL U-003): 그래서 `summary.canvases`와 `no_canvases`가 생겼다. 범위가 있을 때 범위 안 캔버스가 0이 되는 경우를 없앤다. 나열되지 않은 캔버스는 `canvas_not_found`이고, 닿는 캔버스가 없는 CSS는 `usage_error`다.
- 2026-11 "`doan check` warned `ambiguous_custom_url` … a shared stylesheet in another folder": 공유 CSS의 결과는 그 CSS에 닿는 캔버스 기준으로 판정해야 한다. 범위를 `Run` 안에서 처리하는 이유다.

## 읽은 design preset

- 없다. UI 흐름이 없다. 프리셋은 문구만 바꾼다.
