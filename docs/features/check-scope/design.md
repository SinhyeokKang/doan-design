# 검사 범위 — design

## 영향 범위

- **CLI (Go)**:
  - `cli/internal/cli/check.go`의 `Check`: 위치 인자를 받는다.
  - `cli/internal/check/`: `Input`에 범위를 더하고, `Run`이 범위 밖 캔버스의 결과를 내지 않게 한다.
- **안내**: `cli/internal/cli/skill.md`의 가이드 E(편집한 캔버스, CSS, 설정 경로를 넘긴다)와 명령 설명 줄(인자 없는 형태는 사람이 전체 점검을 부탁할 때), 그리고 "make `doan check` pass"를 쓰는 디자인 프리셋(`cli/internal/designskill/presets/` 10개 파일).
- **eval**: `eval/lib/transcript.ts`가 명령 인자 모양을 CLI와 맞춰 둔다(`transcript.test.ts`). `check`의 위치 인자가 생기므로 그 표를 고친다.
- **app**: 바뀌지 않는다. 앱은 `doan check`를 실행하지 않는다.
- **포맷**: CLI 응답의 모양은 그대로다(`{findings, summary: {canvases, errors, warnings}}`, ARCHITECTURE §12). `cli-envelope.v1` 스키마와 `v`는 바뀌지 않는다. `sessions.v1`도 그대로다.

## 범위 판정

지금 `check.Run`은 캔버스를 차례로 돌며 결과를 내고, 공유 CSS의 결과는 `[path, code, detail]` 키로 한 번만 낸다(`check.go`의 `cssSeen`). 그래서 결과를 다 만든 뒤에 거르면 안 된다. 공유 CSS의 결과가 범위 밖 캔버스 이름으로 먼저 나와 중복 제거되면, 범위 안 캔버스의 결과가 사라진다. 특히 `undefined_token`은 캔버스마다 정의가 다르므로 캔버스별로 판정해야 한다.

- **범위를 먼저 캔버스 집합으로 푼다(`check.ScopeCanvases`).** 넘긴 경로를 종류별로 캔버스 집합으로 바꾼다.
  - 캔버스 경로는 그 캔버스 하나가 된다.
  - CSS 경로는 `in.Reach`에서 그 파일에 닿는 모든 캔버스가 된다. 직접 링크와 `@import` 사슬을 모두 포함하고, 심볼릭 링크는 `RealPath`로 맞춘다. 없는 CSS는 `State`가 Missing인 참조가 그 경로를 가리키는 캔버스가 된다.
  - `.doan/config.json`은 모든 캔버스가 된다.
  - 합집합이 `check.Input.Scope`가 된다. `nil`이면 전체이고, 빈 집합이면 범위 안 캔버스가 없다.
- **`Run`은 모든 캔버스를 읽는다.** id 중복 같은 저장소 전체 상태 때문이다. 다만 범위 밖 캔버스에 대해서는 그 캔버스 자신의 결과도, 그 캔버스가 닿는 CSS의 결과도 내지 않는다. 그래서 중복 제거도 범위 안 캔버스끼리만 일어난다.
- **범위가 있을 때 내는 결과**:
  - 범위 안 캔버스 파일의 모든 결과(`unparsable_canvas` 포함).
  - 범위 안 캔버스가 닿는 CSS 파일의 결과(`local_css_not_found`, `css_not_served`, `hardcoded_color`, `external_url`, `viewport_height_*`, `ambiguous_custom_url`, 공유 CSS의 `undefined_token`). 그 캔버스를 기준으로 판정한다.
  - `duplicate_canvas_id`: 범위 안 캔버스의 id를 함께 쓰는 모든 파일의 결과. 범위 밖 파일의 것도 낸다. 에이전트가 어느 파일과 겹쳤는지 알아야 하기 때문이다.
  - 설정 결과(`token_css_not_found`, `serve_withheld`)는 언제나 낸다.
  - 내지 않는 것: 범위 밖 캔버스의 결과, `no_canvases`(범위가 있으면 캔버스가 있다), 범위 밖 `canvas_extension_case`.
- **`Summarize`**: `canvases`는 범위가 있으면 범위 안 캔버스 수(0일 수 있다), 없으면 지금처럼 검사한 파일 수다. `errors`와 `warnings`는 돌려준 결과로 센다.

## 경로

- 인자마다 종류를 가린다.
  - `.doan/canvases/*.html` 또는 `.doan/ds/*.html`이면 캔버스다. `workTarget`(`cli/internal/cli/work_rules.go`)으로 정규화하고, 심볼릭 링크와 루트 별칭은 `doan work`와 같이 처리한다. 파일이 없으면 `canvas_not_found`(exit 2)다. `doan open`과 같은 코드이고, 오타를 잡는다.
  - 소문자 `.css`로 끝나고 저장소 안이면 CSS다. `@import`의 `.css` 판정과 같은 소문자 규칙이다. 파일이 없어도 받는다.
  - 저장소의 `.doan/config.json`이면 설정이다.
  - 그 밖의 경로(저장소 밖, 다른 확장자, 디렉터리)는 `usage_error`(exit 2)다. 메시지는 받는 세 종류를 말한다.
- 판정은 검사를 시작하기 전에 한다. 같은 경로가 여러 번 오면 집합으로 줄인다.
- 다른 캔버스를 읽을 수 없으면 지금처럼 명령 전체가 `internal_error`(exit 1)다. 그 캔버스의 id를 모르면 id 중복을 판정할 수 없기 때문이다.

## 순수 함수로 뺄 부분 (`/tdd` 대상)

- `check.Run(in)`에 `in.Scope`가 있을 때의 결과(위 '범위 판정'): fixture `Input`으로 표 테스트를 쓴다.
  - 범위 밖 캔버스의 오류가 빠진다.
  - 범위 안 캔버스와 id가 겹치면 두 파일의 `duplicate_canvas_id`가 모두 나온다.
  - 공유 CSS의 `hardcoded_color`가 범위 안 캔버스 기준으로 한 번 나온다. 범위 밖 캔버스만 그 CSS에 닿으면 나오지 않는다.
  - 공유 CSS의 `undefined_token`은 범위 안 캔버스가 그 토큰을 정의하지 않을 때만 나온다. 범위 밖 캔버스가 먼저 판정되어 중복 제거로 사라지는 경우가 없다.
  - 설정 결과는 범위와 관계없이 나온다.
  - `Scope == nil`이면 지금 결과와 같다(기존 테스트 전부).
- `check.ScopeCanvases`: 경로 종류별로 캔버스 집합을 푼다.
  - 캔버스 하나
  - CSS에 직접 닿는 캔버스와 `@import`로 닿는 캔버스
  - 심볼릭 링크로 닿는 캔버스
  - 없는 CSS를 가리키던 캔버스
  - 어떤 캔버스도 닿지 않는 CSS(빈 집합)
  - 설정(전체)
  - 여러 경로의 합집합
- `check.Summarize`의 범위 판정: `canvases` 값(0 포함).
- `Check`의 인자 처리(종류 판정, 경로 정규화, 중복 제거, `usage_error`와 `canvas_not_found`): `cli/internal/cli/` 테스트.

## 형식, 규약, 결정에 미치는 영향

- **형식**: CLI 응답의 모양은 바뀌지 않는다. 바뀌는 것은 인자가 있을 때의 값(결과의 범위와 `summary` 값)뿐이다. JSON Schema와 `v`는 바뀌지 않고, 새 fixture가 필요하지 않다. TS 쪽에는 `check` 결과를 읽는 코드가 없다.
- **규약(ARCHITECTURE §1)**: 검사 규칙은 그대로다. "`doan check` takes no arguments and checks the whole repo"라는 문장이 바뀐다: 언제나 전체를 검사하고, 경로를 주면 그 범위만 보고한다. 에이전트 규칙 E(§1)도 바뀐다.
- **결정**: 서빙 범위, sandbox iframe, GitHub 토큰, git 명령과는 관계가 없다. `doan check`는 정적 검사만 한다(PRODUCT §5 item 11). 이 결정도 그대로다.
- **사람이 보는 것**: 인자 없는 출력이 바이트 단위로 같으므로, 터미널에서 돌리는 사람과 앱의 "run `doan check`" 안내는 그대로다.

## PoC 의존

- 없다. 판정은 기존 `checkInput`이 이미 모으는 정보(`Reach`, `CSS`, 캔버스 id)로 할 수 있다.

## postmortem에서 가져온 주의점

- 2026-10 "`doan check` returned zero errors and warnings without saying that it checked zero canvases"(USABILITY-EVAL U-003): 그래서 `summary.canvases`와 `no_canvases`가 생겼다. 범위가 있으면 `canvases`가 범위 안 캔버스 수다. 어떤 캔버스도 닿지 않는 CSS만 넘기면 0이 될 수 있으므로, 안내의 "0: none written yet"은 인자 없는 형태에만 적용된다고 적는다. 없는 캔버스를 넘기면 `canvas_not_found`로 실패한다.
- 2026-11 "`doan check` warned `ambiguous_custom_url` … a shared stylesheet in another folder": 공유 CSS의 결과는 그 CSS에 닿는 캔버스 기준으로 판정해야 한다. 범위 판정이 공유 CSS를 캔버스별로 다루는 이유다.
- 2026-10 transcript 파서 회귀(`eval/lib/transcript.ts`): eval이 명령 인자 모양을 CLI와 맞춰 두므로, 위치 인자를 더하면 `transcript.test.ts`의 대조가 실패한다. eval 쪽 표를 함께 고친다.

## 읽은 design preset

- 없다. UI 흐름이 없다. 프리셋은 문구만 바꾼다.
