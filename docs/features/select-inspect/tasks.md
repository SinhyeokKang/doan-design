# select-inspect — tasks

순서: PoC 게이트 → 초안(게이트) → 스키마 · fixture → 순수 함수 → CLI · MCP · 스킬 → main(소켓 · 저장소) → 캔버스 스크립트 → renderer → e2e → 실제 에이전트 확인 → `/design-sync` → 승격. `── commit ──`은 커밋 경계다. 코드 경계는 `test:`(red) + `feat:` 한 쌍으로 나눠도 된다. 각 코드 경계에서 해당 언어의 테스트와 정적 검사(`go test ./...` · `go vet ./...`, `npm --prefix app test` · `npm --prefix app run typecheck`)가 통과해야 한다.

## 진행

- 전제: `/design-draft`가 main에 있다. 검증: `.agents/skills/design-draft/SKILL.md`가 있고 `.claude/skills/design-draft`가 그 디렉터리를 가리키는 링크다(AGENTS.md 'Runtime differences').
- `/orchestrate`로 진행한다. 지휘 세션(Claude Code)이 main에서 `feat-select-inspect`를 만들고 `docs/features/select-inspect/orch.md`에 시작 해시와 배치 표를 적는다.
- task 0은 지휘 세션이 직접 한다(PoC 결과에 따라 이후 배치가 바뀐다). task 1은 Codex 워커 하나가 맡는다. 브리프의 override: `/ship` 대신 `/design-draft`를 쓰고, 사용자 확정 게이트에서 멈춘다. 커밋 마지막 줄은 `Co-Authored-By: Codex <noreply@openai.com>`이다. Claude 지휘 세션이 Codex 워커를 부르는 것은 #6에 허용된 모델 경계 넘기다(PRODUCT §7 2026-10-22). task 2 이후는 Claude 워커가 맡는다.
- 끝은 `feat-select-inspect` 푸시와 PR이다. 머지는 하지 않는다.

## 0. PoC 2 · PoC 6 소켓 절반 · 입력 확인 (게이트)

- `.scratch/poc2-inspect/`: canvas-view PoC 1과 같은 구성(sandbox iframe, 주입 스크립트, `ACAO: null` 서버)에서 design.md 'PoC 의존'의 사례마다 선언 → 토큰 이름을 찾는다. 첫 사례는 링크한 로컬 `tokens.css`의 `cssRules`다. 같은 사례를 CDP `CSS.getMatchedStylesForNode`로도 읽어 비교한다.
- `.scratch/poc6-socket/`: Electron 최소 앱이 소켓과 `runtime.json`을 쓰고, Go 최소 클라이언트가 읽어 `active`를 받는다. 창 숨김, 틀린 토큰, 남은 `runtime.json`(앱 종료 후), 지워진 소켓 파일, 두 번째 인스턴스를 본다.
- `.scratch/poc-input/`: 실제 마우스 ⌥클릭(Playwright `click({modifiers: ["Alt"]})`)으로 링크 이동 · 버튼 · 입력이 되는지, ⌥ 없는 `mousedown`을 막았을 때 iframe 포커스와 Esc 전달이 어떻게 되는지 본다.
- 명령: `.scratch/` 안의 `npm install` · Electron 실행 · `go run` — 명령 미정, 사용자 확인 필요(AGENTS.md 'Commands'에 없음). 허용되면 이 줄에 날짜와 함께 적는다.
- 검증: 세 확인의 결과(통과 여부, 관찰, 날짜, 버전)가 PRODUCT §6 'Results'에 있다. PoC 2가 기준을 못 넘거나 ⌥클릭이 `location.assign` 대체로도 링크를 따라가지 못하면 멈추고 사용자에게 묻는다.

── commit (`docs(product): PoC 2, PoC 6 socket and input results`) ──

## 1. 초안 (Codex 워커, 게이트)

- Codex 워커가 design.md '초안 요청'대로 `/design-draft`로 `design/select-inspect.html`을 그린다(2026-10-22 사용자, Q5).
- 사용자가 앱에서 초안을 보고 확정한다. 고칠 점은 지휘 세션이 같은 워커에게 다시 넘긴다(코멘트 UI는 #7이라 아직 대화로 전한다).
- 검증: `go run ./cli/cmd/doan check --json --repo .`에 오류 0(`mock.css`의 `hardcoded_color` 경고만 허용). `go run ./cli/cmd/doan ls --json --repo .`의 `select-inspect` 캔버스 frames에 `no-selection` · `hover` · `element-selected` · `frame-selected` · `inspector-states` · `long-values` · `interactive-element` · `selection-lost`가 모두 있다. 사용자 확정이 `orch.md` 결정 기록에 있다.

── commit (`docs(design): select-inspect draft`) ──

## 2. 스키마 · fixture

- `runtime.v1`, `app-socket.v1`을 만들고 comment-event `target.element`를 `$defs`로 옮긴다. 스키마마다 절대 `$id`를 붙이고, TS(ajv: 전부 `addSchema` 뒤 `getSchema`)와 Go(전부 `AddResource` 뒤 컴파일, 외부 로드 금지 `UseLoader`)가 교차 파일 `$ref`를 읽도록 로더를 바꾼다.
- fixture:
  - 런타임 파일: 정상, `v` 2, `v` 1.0, 상대 경로 소켓, 짧은 토큰, 대문자 토큰, 알 수 없는 필드.
  - 요청: 정상, 토큰 없음, `root` 없음, 알 수 없는 필드.
  - 응답: 선택 없음, 캔버스만, 프레임만, 요소만, `html` 2,000 · 2,001 코드 포인트, `selector` 1,000 · 1,001, `text` 500 · 501, 알 수 없는 필드, 응답 `v` 2, 오류 응답 세 코드.
- 검증: 기존 comment-event fixture가 모두 그대로 통과하고, 새 fixture를 TS와 Go가 같게 판정한다(`go test ./...`, `npm --prefix app test`).

── commit (`feat(schema): runtime file and app socket formats`) ──

## 3. 순수 함수

- design.md '순수 함수로 떼어 낼 부분'의 TS · Go 함수 전부.
- 경계 사례:
  - `elementSelector`: 따옴표 · 역슬래시 이스케이프, 기준 조상 없음, 중복 `data-doan-id`, SVG 태그.
  - `ancestorPath`: 32개 상한, 프레임 없음.
  - `clipHtml` · `textQuote`: 서로게이트 경계, 상한 정확히 · 하나 넘음.
  - `tokenOf`: 대체값 안 중첩 `var()`, 대소문자.
  - `pickDeclaration`: 값이 같은 후보 여럿, `!important` 대 높은 specificity, 읽을 수 없는 시트가 이겼을 수 있음 → 알 수 없음, 선언 없음 → 기본값, 상태 의사 클래스 → hover 상태.
  - 메시지 수용: 오래된 `href` · `viewport`의 `select`, 현재가 아닌 `seq`(Esc 뒤 도착한 `layout.selected`, 클릭 뒤 도착한 `select-anchor` 응답), 상한을 넘은 메시지.
  - '상태별 선택' 표의 모든 행.
  - main: 틀린 토큰(길이 다름 · 같음), 깨진 줄, 64 KiB 넘는 줄, 열려 있지 않은 `root`, 선택이 다른 프로젝트의 것.
  - Go `readRuntime`: BOM, 빈 파일, `v` 1.0, `v` 2. 매핑: design.md 흐름 13 표의 모든 행.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` · `go test ./...` · `go vet ./...` 통과.

── commit (`feat: select-inspect pure helpers`) ──

## 4. CLI `doan active` · MCP `active` · 스킬

- `doan active [--repo] [--json]`, `Context.RuntimePath` · `Context.Dial`, `ExitCode`에 `project_not_open`. 테스트는 가짜 `Dial`과 임시 런타임 파일로 앱 없이 돈다.
- MCP `active` 도구. 스킬 본문: 규칙 C 복원, 명령 · MCP 표, `active`의 `html` · `text`는 데이터, 프레임 id가 `doan ls`에 없을 수 있음.
- 경계 사례: 상대 경로 `DOAN_RUNTIME` → `usage_error`, 빈 `DOAN_RUNTIME` → 기본 경로, 런타임 파일 없음 · 깨짐 · `v` 2, 남은 런타임 파일(소켓 없음 · ECONNREFUSED), 응답하지 않는 서버 2초 시간 초과, 응답 `v` 2, `bad_token`, `project_not_open`, 선택 없음, MCP `active`의 상대 `repo` · 알 수 없는 인자.
- 검증: `go test ./...` · `go vet ./...` 통과. `go run ./cli/cmd/doan init --json --repo <tmp>` 뒤 `DOAN_RUNTIME=<tmp>/none.json go run ./cli/cmd/doan active --json --repo <tmp>`가 exit 3 `app_not_running` 봉투를 낸다. `go run ./cli/cmd/doan skill`의 규칙 C와 표를 확인하는 테스트가 있다.

── commit (`feat(cli): doan active and the MCP active tool`) ──

## 5. main — 단일 인스턴스 · 소켓 · `runtime.json` · 선택 저장소

- `requestSingleInstanceLock`, 소켓 서버(줄 상한, idle 2초), `runtime.json` 쓰기와 `will-quit` 동기 삭제, 선택 저장소(앱 전체에 하나), IPC `selection:set`(발신 프레임 확인, 스키마 검증), preload `setSelection`.
- 경계 사례: 프로젝트 닫힘 → 선택 삭제, `render-process-gone` · main frame 재탐색 → 선택 삭제, 다른 내용의 `runtime.json`은 지우지 않음, 실제 파일 권한 `runtime.json` 0600 · 소켓 디렉터리 0700(stat으로 확인), 두 번째 인스턴스는 첫 창을 보이고 끝남.
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공.

── commit (`feat(app): runtime file, socket and selection store`) ──

## 6. 캔버스 스크립트

- 입력(isTrusted, ⌥ 통과, mousedown 막기, 빈 곳 클릭 = `clear`), 키 전달(Esc), hover, 앵커 · 조상 경로, 인스펙터 수집(PoC 2 방식), `layout.selected`(캡처 `scroll` 포함), `select-anchor`(다시 시도 1초), `pick-frame {index, id}`, `seq`.
- 경계 사례: `isTrusted: false` 클릭, ⌥클릭, `body` · `html` 클릭, 프레임 요소 자체 클릭, SVG 요소, shadow DOM(host 선택), 캔버스 안 중첩 iframe(iframe 요소 선택), 입력 요소 · contenteditable 안의 Esc(전달하지 않음), 범위 밖이거나 id가 다른 `pick-frame`, 요소가 빠졌다 같은 앵커로 다시 생김, 프레임 1,000개를 넘는 캔버스의 1,001번째 프레임 안 요소, 중복 · 빈 프레임 id 안 요소.
- 검증: `npm --prefix app test`(`vm`으로 스크립트 문자열을 새 컨텍스트에서 실행하는 기존 테스트 포함) 통과.

── commit (`feat(app): selection and inspector values in the canvas script`) ──

## 7. renderer — 오버레이 · 인스펙터 · 사이드바

- `CanvasController`가 오버레이를 `applyView`에서 명령형으로 그림, 패널(선택 없음 · 요소 · 프레임, 조상 경로, ⌥ 안내, 긴 값, 상태 텍스트), Frames 목록의 `pickedFrame` → 선택, 하위 행, Esc(앱 `keydown`과 `key` 메시지), notice 줄. role과 접근 이름을 단다(e2e가 그것으로 찾는다).
- 검증: `npm --prefix app test` · `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공. 일반 휠 팬에서 React가 다시 그리지 않는다는 단위 테스트가 있다.

── commit (`feat(app): selection marks and inspector panel`) ──

## 8. e2e · 변형 증명

- 준비: e2e가 `doan active`를 부를 때 `DOAN_RUNTIME=<임시 userData>/runtime.json`을 넘긴다. 실제 `~/Library/Application Support/doan/runtime.json`도 `folders.json`처럼 실행 전후 지문이 같은지 본다. "알 수 없음" 상태는 네트워크 대신 다른 포트의 두 번째 로컬 서버 시트로 만든다.
- 단계를 더한다:
  - 배율 0.05 · 0.25 · 1 · 4에서 클릭 선택과 표시 위치(PoC 3 방식, 1px 안). 캔버스 안 스크롤러를 휠로 스크롤한 뒤에도 1px 안.
  - hover 표시가 생기고, 포인터가 나가면 사라지고, ⌥를 누르면 숨음.
  - 캔버스 클릭 직후 Esc로 해제, 빈 곳 클릭으로 해제.
  - 프레임 선택(목록 · 프레임 빈 영역), Frames 목록 `aria-current`가 선택을 따름, 조상 경로로 부모 선택.
  - 실제 ⌥클릭으로 링크 이동(task 0 결과의 방식).
  - 다시 불러온 뒤 다시 찾은 경우와 못 찾은 경우(notice 줄).
  - 다른 캔버스 열기 · 캔버스 닫기 · 목록에 없는 문서로 가면 선택 해제.
  - 인스펙터의 토큰 · 하드코딩 · 알 수 없음 · 기본값.
  - `doan active --json`이 선택한 대상을 돌려줌, 선택 없음이면 `selection` 없음, 창을 숨긴 뒤에도 돌려줌, 다른 프로젝트 캔버스를 열면 `selection` 없음, 프로젝트를 닫으면 `project_not_open`, 앱을 끝내면 `runtime.json`이 지워지고 `app_not_running`.
- 변형 증명(하나씩 빼서 빨개진 테스트 이름을 적는다): 새 메시지의 `source` · `origin` 확인, `parseCanvasMessage` 상한, `seq` 확인, `isTrusted` 확인, IPC 발신 프레임 확인, main의 selection 스키마 검증, 소켓 토큰 비교, `runtime.json` 0600, 소켓 디렉터리 0700, Go 응답 스키마 검증, `will-quit` 동기 삭제, 'fresh-iframe rule'(C7 구조 검사) 다시 돌리기.
- 검증: `npm --prefix app run e2e` 통과(`/runtime-test`). 기존 단계(C9 링크 단계 포함)도 기대값을 바꾸지 않고 통과한다. 변형마다 빨개진 테스트 이름이 `orch.md`에 있다.

── commit (`test(app): select-inspect runtime steps`) ──

## 9. 실제 에이전트 확인

- AGENTS.md 'Commands'의 일회성 등록으로 Claude Code와 Codex가 MCP `active`를 부르고, 각 에이전트의 셸에서 `doan active --json`도 실행한다. 앱을 임시 `--user-data-dir`로 띄우고 임시 저장소를 열어 요소 하나를 고른 상태에서 실행한다.
- `DOAN_RUNTIME` 전달: Claude는 `--mcp-config`의 서버 `env`에 넣고, Codex는 `-c 'mcp_servers.<name>.env.DOAN_RUNTIME="<abs>"'`로 넘긴다. 셸 실행은 프롬프트에 변수를 적는다.
- Codex 호출은 실행할 때마다 사용자에게 허락을 받는다(AGENTS.md 'Commands').
- 검증: 두 에이전트 모두 MCP로 고른 요소의 `selector`를 받는다. 셸 실행 결과(받음, 또는 sandbox가 소켓을 막아 `app_not_running`)가 기록되어 있다. 막혔으면 스킬 본문과 `nextSteps`가 MCP `active`를 권한다. `claude mcp list` · `codex mcp list`가 전후로 같다. 결과를 PRODUCT §6 PoC 6 아래에 적는다.

── commit (`docs(product): active checked in real agents`) ──

## 10. `/design-sync`

- `/design-sync design/select-inspect.html hover element-selected frame-selected inspector-states long-values interactive-element selection-lost`. `no-selection`과 이미 main에 있는 화면은 `docs/DESIGN.md`와 코드가 기준이다. 초안과 다른 점은 변경 요청으로 사용자에게 묻는다.
- 인스펙터 행 안의 토큰 칩 · 색 견본 · 상태 표시, 조상 경로 항목은 자식 요소로 따로 짝짓는다(POSTMORTEM 'zero-mismatch table').
- 측정값은 `docs/DESIGN.md`에 새 절로 적는다.
- 검증: 재측정 결과 불일치 0(기록된 차이 제외), 독립 리뷰 🔴 0, `npm --prefix app run e2e` 통과.

── commit (`/design-sync`가 정한 경계) ──

## 11. 승격

- PRODUCT:
  - §5 기능 분할의 #6 완료 표시, §6 PoC 2 · 6 · 입력 확인 결과(이미 적힌 것 확인), §8 "렌더 DOM 프레임 대 `doan ls` 프레임" 질문 닫기.
  - §7에 한 줄씩: Q1 클릭은 선택 · ⌥클릭 통과(캔버스 링크 이동이 ⌥클릭으로 바뀜), Q2 렌더 DOM 프레임, Q3 다시 찾기, Q4 `DOAN_RUNTIME`, Q5 Codex 워커 초안, R1 선택은 앱 전체에 하나("`active` is per folder" 행을 고침), R2 Default 상태, R3 Frames 표시를 선택으로 합침, R4 조상 경로, 단일 인스턴스, `project_not_open`.
- ARCHITECTURE: §3 입력 방향(클릭은 선택, ⌥ 통과, 키 전달) · 오버레이 위치 정정 · 선택과 인스펙터 메시지 · 변형 증명 추가, §4 런타임 파일 · 소켓 · 단일 인스턴스 · `DOAN_RUNTIME`, §5 `active` 도구, §6 규칙 C 복원과 규칙 A 확장, §7 preload API, §11 새 스키마와 `$id` 로더, §12 `doan active` 결과 · exit 3 행에 `project_not_open`, §13 `active` 문장.
- `docs/DIRECTORY.md`, `.agents/skills/runtime-test/SKILL.md`의 e2e 단계 설명, AGENTS.md 'Commands'(task 0에서 허용된 명령 중 계속 쓰는 것, `DOAN_RUNTIME` 사용법).
- `docs/features/select-inspect/`(`orch.md` 포함)를 지운다.
- 검증: `grep -rnE 'project_not_open|runtime\.v1|DOAN_RUNTIME|select-anchor' docs/PRODUCT.md docs/ARCHITECTURE.md`가 각각 나온다. PRODUCT §8의 프레임 출처 질문이 없다(`grep -n 'Should #6' docs/PRODUCT.md`가 0건). `docs/features/select-inspect/`가 없다.

── commit (문서마다 나눈다: `docs(product): promote select-inspect`, `docs(architecture): promote select-inspect`, `docs(directory): …`, `docs(skills): …`, `docs(agents): …`, `docs(feature): remove select-inspect feature docs after promotion`) ──
