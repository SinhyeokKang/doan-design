# doan-naming — design

## 1. 영향받는 구성 요소

| 구성 요소 | 변경 |
|---|---|
| app renderer | 사람이 읽는 문구(화면, 온보딩 Welcome, 토스트, 오류, aria 이름)의 `doan` → `Doan`. 문구를 단언하는 테스트 갱신 |
| app main | 사람에게 보이는 문구(대화상자, 메뉴, 알림, renderer로 보내는 오류 문구). `app.setName("doan")`은 userData 경로를 정하므로 그대로 두고, 메뉴 막대·About의 앱 이름은 번들 이름(`productName`)을 따라 'Doan'이 된다. 정식 이름은 이미 쓰던 창 제목에만 남는다 |
| 패키지 설정 | `app/package.json`의 `productName`과 `build.productName`을 `Doan`으로 바꿔 `Doan.app`을 만든다(사용자 요청 2026-10-30). `name`(`doan-app`)과 `appId`는 그대로 |
| CLI(Go) | 사람이 읽는 메시지·`nextSteps`·`--help`의 제품 이름. 명령어 예시(`doan init` 등)는 그대로 |
| MCP | 도구 설명 문장의 제품 이름(예: "List Doan design presets…"는 이미 Doan). 서버·도구 이름은 그대로 |
| 가이드·스텁 | `cli/internal/cli/skill.md`와 스킬 스텁의 산문 `doan` → `Doan`. 명령어·경로는 그대로 |
| 문서 | README, `docs/*.md`, AGENTS.md(번들 경로 명령), feature 문서의 산문 |
| 초안 캔버스 | `.doan/canvases/*.html`의 예시 문구(예: `/Applications/doan.app`)는 과거 초안이다. 정본은 구현이므로 바꾸지 않고 survey에 '둠(초안 기록)'으로 남긴다 |
| eval | `eval/` 러너가 번들 경로 `doan.app`을 쓰면 `Doan.app`으로 고친다. 시나리오의 기대 문구가 제품 이름을 단언하면 갱신 |

## 1a. 표기 규칙 (2026-10-30 user)

- `doan`으로 쓰던 사람이 읽는 문구 → `Doan`.
- `doan design`·`Doan Design`으로 쓰던 곳 → `Doan Design`.
- 정식 이름을 쓰지 않던 곳에 `Doan Design`을 새로 넣지 않는다.
- 명령어·경로·식별자는 소문자 그대로(spec '결정').

## 2. 순수 함수 (`/tdd` 대상)

- `brandCandidates(text)` (TS, `app/src/shared/` 또는 앱 테스트 유틸): 문자열에서 제품 이름 출현을 찾아 `{index, form: "doan"|"Doan", kind: "prose"|"command"|"path"|"identifier"}`로 분류한다. 규칙:
  - command: 바로 뒤에 알려진 하위 명령(`check`, `ls`, `init`, `mcp`, `skill`, `design-skill`, `active`, `onboarding`, `connections`, `comment`, `version` 등)이나 플래그가 오거나 백틱 안에 있다.
  - path: `/`, `.` 접두(`.doan/`, `doan.app`, `bin/doan`)나 `~/` 경로 안.
  - identifier: `doan:`, `doan-`, `data-doan`, `window.doan`, `design.doan`, 대문자 없이 코드 토큰으로 쓰인 경우.
  - 나머지는 prose이고, prose의 `doan`은 위반이다.
- Go 쪽 같은 규칙의 `brandCandidates`(테스트 전용 헬퍼, `cli/internal/cli/`): CLI 메시지와 가이드를 검사한다. 두 구현은 같은 fixture(`schema/fixtures/brand/cases.json`)를 읽어 결과가 같은지 확인한다.
- survey 스크립트(`.scratch/doan-naming/survey.mjs`)는 같은 분류를 저장소 전체에 돌려 `survey.md`의 초안 표를 만든다. 사람이 각 줄의 바꿈/둠을 확인한다.

## 3. 회귀 검사

- 앱: renderer·main의 문자열 리터럴(테스트 제외)에서 prose `doan`이 0건인지 검사하는 테스트(기존 `ds/checks.test.ts`처럼 소스를 읽는 검사).
- Go: CLI가 내는 메시지(오류 envelope `message`·`nextSteps`, `--help`, 가이드 본문)에서 prose `doan`이 0건인지 검사하는 테스트. 가이드는 `doan skill` 출력 전체를 검사한다.
- 의도적 예외는 분류기가 command/path/identifier로 판정해야 하며, 판정이 안 되는 예외가 필요하면 검사에 명시적 허용 목록을 두고 survey에 이유를 적는다.

## 4. 형식·컨벤션·결정 영향

- **형식**: JSON Schema(ARCHITECTURE §11) 변경 없음. CLI envelope `v`는 1 그대로다. `message`·`nextSteps` 문자열은 계약이 아니라 사람이 읽는 문구지만, 공유 fixture(`schema/fixtures/cli-envelope/`)에 들어 있으면 TS·Go가 같은 fixture를 읽으므로 fixture를 함께 고친다. 새 fixture: 분류기 사례.
- **컨벤션**: ARCHITECTURE §1과 `doan check` 규칙 변경 없음.
- **결정**: ARCHITECTURE §7 'app name'(`app.setName("doan")`, userData 경로)은 유지한다. 바뀌는 것은 번들 이름(`Doan.app`)과 표시 이름이다. 패키지 설정 변경은 사용자 요청(2026-10-30)이다.
- **번들 이름 변경의 영향**:
  - 기본 APFS(대소문자 무시)에서는 `/Applications/doan.app`과 `/Applications/Doan.app`이 같은 경로다. 기존 CLI 링크(`~/.local/bin/doan` → `…/doan.app/Contents/Resources/bin/doan`)와 MCP 등록 경로는 계속 해석된다.
  - 대소문자를 구분하는 볼륨에서는 기존 링크가 깨질 수 있다. Settings > Connections의 기존 진단(링크 대상 불일치 → 수정 제안)이 처리하는지 실제 앱에서 확인한다.
  - 실행 파일 이름이 `Contents/MacOS/Doan`으로 바뀐다. 이 경로를 쓰는 곳(AGENTS.md 명령, `app/runtime/` 지원 코드, eval 러너, 테스트)을 survey에 넣고 고친다. 번들 안 CLI 경로 `Contents/Resources/bin/doan`은 그대로다.
- **가이드 출력 예산**: 가이드는 `skillOutputBudget`(21,600 bytes)까지 30 bytes 남았다(ARCHITECTURE §6 'Output budget'). `doan` → `Doan`은 바이트 수가 같다. 가이드에는 'Doan Design'을 쓰지 않는다. `/Applications/doan.app` 번들 안내가 `Doan.app`이 되어도 바이트 수는 같다.
- **agent-eval**: 가이드·스텁·CLI 메시지가 바뀌므로 AGENTS.md 규칙대로 `/agent-eval`을 돌린다.

## 5. 함정 (POSTMORTEM)

- 2026-10-29 출력 예산: Codex가 출력 중간을 잘라도 끝 표식은 남는다. 가이드 길이가 늘지 않게 한다(위 4).
- 대소문자만 다른 파일 이름의 macOS 해석 충돌(buzz-home BU3, 2026-10-29): 번들·파일 이름을 대소문자만 바꿀 때 git과 대소문자 무시 파일 시스템에서 이름 변경이 반영되지 않을 수 있다. 저장소 안 파일 이름은 이번에 바꾸지 않는다. 빌드 산출물 `app/dist/`는 ignore 대상이라 이전 `doan.app`이 남아 있으면 지운 뒤 빌드한다.
