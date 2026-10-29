# doan-design-skills — tasks

작성일: 2026-10-27. 2026-10-29 feature-review 반영. 백엔드만 구현한다. A1의 프리셋 선정은 2026-10-28 사용자 요청으로 완료 처리했다. 구현 검증과 원본 전체 대조·배포 고지 준비는 아직 수행하지 않았다. 아래 새 CLI 명령은 구현 대상이며 현재 실행 가능한 명령으로 오해하지 않는다. 검증 명령은 AGENTS.md Commands의 공통 명령을 사용한다.

## A. 계약·레퍼런스·fixture

- [ ] A0. `.scratch/design-tools-poc/`의 2026-10-27 실험 결과와 그 한계를 날짜와 함께 PRODUCT §6에 기록한다. `.scratch/`는 커밋되지 않으므로 구현 전에 남긴다. 범위는 [design §7](./design.md#7-검증과-후속-ui-인계) 첫 문단이다.
  - 검증: PRODUCT §6에 날짜·실행자·확인한 항목·확인하지 않은 항목이 있는지 수동 대조한다. 전용 문서 검증은 command undecided — needs user confirmation이다.
- [x] A1. 공개 프리셋 목록과 역할·연계 방향 선정 (2026-10-28 사용자 요청으로 완료 처리). [spec §3](./spec.md#3-프리셋과-매핑)에 공개 20개, 통합·제외 4개, CLI `doan init`과 `context` 프리셋의 구분(2026-10-29 ID 변경), 디자인 시스템 문서·확인용 캔버스와 프리셋 간 참조를 기록했다.
  - 완료 범위: 선정과 문서 정리이다. 원본 전체 대조, 고지 준비, 구현·검증까지 완료했다는 뜻은 아니다. 구현 시 A1-R에서 다시 검토한다.
- [ ] A1-R. 구현 시작 시 선정안을 재검토하고 고정 원본의 24개 명령, 41개 reference 문서, 4개 역할 문서를 대조표로 만든다. 각 소스의 반영 위치·미반영 사유를 적는다. Impeccable `LICENSE`·`NOTICE.md`, iOS/Android 지침의 ehmo MIT 고지, 변경 고지를 CLI에 넣을 형태로 준비한다. `document`의 표시 이름, `design-system` 캔버스와 규칙 문서 규칙([spec §3.1·§3.2](./spec.md#32-초기-진입과-스킬-연계--2026-10-28))을 확인한다.
  - 검증: 대조표에 원본 69개 소스가 모두 있고 반영 위치 또는 미반영 사유가 빈 행이 0개이다. 공개 카탈로그와 원본 대응표를 구별한다. A2의 fixture와 이후 카탈로그 테스트는 재검토한 목록을 사용한다.
- [ ] A2. 카탈로그·단건·오류 공용 fixture와 Go/TS 소비 계약을 정한다. CLI envelope는 v1을 유지한다. 기존 가이드와 새 조회 결과의 완전성 마커를 구별한다. 앱 실패는 `request_refused`와 `cli_error`(reason `unavailable`·`timeout`·`invalid_response`·`failed`)이다([design §2](./design.md#앱용-api)).
  - 검증: `go test ./...`와 `npm --prefix app test`에서 같은 fixture를 읽는 테스트가 구현 전 실패하고, result/envelope의 차이를 검증한다.

── commit: `test: define design preset catalog contracts` ──

## B. 정적 프리셋과 순수 함수

- [ ] B1a. 카탈로그 구조, validator, 고지 파일, 대표 프리셋 1~2개(`clarify`와 `context`)를 작성하고 CLI에 포함한다.
  - 검증: `go test ./...`에서 다음 실패 사례가 각각 실패로 판정된다: 중복 ID, ID 문법 위반, 카탈로그에 있으나 Markdown이 없는 항목, Markdown이 있으나 카탈로그에 없는 파일, 출처 누락, 완전성 마커 누락, 원본 placeholder·미해결 상대 경로. 고지 파일이 바이너리에 포함된다.
- [ ] B1b. 나머지 18개 프리셋 본문을 작성한다. 원본 엔진 명령, 요청과 무관한 자동 handoff, 강제 subagent, 상주 live loop는 제거하거나 도안 작업 지침으로 바꾼다. 필요한 프리셋 간 참조·연계와 디자인 시스템 문서·캔버스 작성 지침(규칙 문서 위치, 요청 밖 프레임·ID 보존, Token CSS 변수 참조)은 포함한다. 사용자에게 원본 전체 기능 이식으로 설명하지 않는다.
  - 검증: `go test ./...`에서 B1a validator가 20개 전체에 통과한다. A1-R 대조표에서 반영 위치가 빈 행이 0개이다. 본문에서 원본 엔진 명령 grep 결과가 0건이다(패턴은 A1-R 대조표에서 정한다).
- [ ] B2. 목록 투영, 단건 조회, 가이드의 짧은 목록 생성, 앱 결과 해석을 순수 함수로 구현한다. 목록에는 전체 본문을 넣지 않는다.
  - 검증: `go test ./...`와 `npm --prefix app test`에서 다음 사례가 통과한다: 정상, 빈 ID, 알 수 없는 ID, 문법 밖 ID(`../clarify`, `clarify.md`, `a/b`, `CLARIFY`), 공개하지 않는 원본 이름(`craft`, `live`, `overdrive`, `optimize`, `init`), 명령 미지원, 알 수 없는 envelope v, 잘못된 result, 완전성 마커 없는 본문, 실행 오류, 안정 순서, 목록/본문 분리. 앱 해석은 실패를 빈 성공으로 바꾸지 않는다.
- [ ] B3. 자연어 매핑 지침과 앱 대화의 고정 가이드 안내를 작성한다. 앱 대화 안내는 bundled CLI shell만 쓰고, 조회 실패 시 MCP나 Settings > Connections를 안내하지 않는다. 연결 복구 안내는 사용자가 프리셋을 명시한 경우에만 한다. 요청 원문과 앵커의 비신뢰 경계를 유지하고 별도 분류 모델은 호출하지 않는다.
  - 검증: `npm --prefix app test`에서 원문 보존·앵커·입력 제한·기존 전송 거부 회귀가 통과하고, 다섯 공급자의 `turnPrompt`에 같은 안내가 들어간다. 의미 매핑은 E2의 실제 에이전트 평가로 검증한다.

── commit: `feat: bundle Doan design presets and routing guidance` ──

## C. CLI·MCP·설치

- [ ] C1. `design-skill [id]` 목록/단건 명령, 도움말, `doan skill`의 발견 안내와 MCP `design_skill`을 연결한다. 읽기 전용·repo 불필요·동일 envelope를 유지한다. `doan init`과 MCP `init` 성공 결과의 `nextSteps`에 `context` 프리셋과 조회 명령을 추가한다. `init` result는 바꾸지 않는다.
  - 검증: `go test ./...`와 `go vet ./...`에서 다음이 통과한다: CLI/MCP parity, `id`가 `--` 뒤 위치 인자로 전달됨, 잘못된 인자, 앱이 꺼진 환경, 비프로젝트 cwd, 본문 완전성, readOnly annotation, MCP tools/list가 18개이고 이름·`design_skill` description이 고정됨, `init` 성공 `nextSteps`의 CLI/MCP 일치.
- [ ] C2. `app/src/main/onboarding/SKILL.md` stub 본문을 확장한다. 두 설치 경로에서 같은 bytes가 쓰인다: Settings > Connections의 전역 stub(`onboarding/machine.ts`)과 agent-auth의 profile stub(`agentAuth/providers.ts`). 새 전역 스킬·설치기·원격 다운로드는 만들지 않는다. 기존 사용자의 전역 stub이 `differs`로 판정되어 교체 경고가 뜨는 것은 수용한 결과이다([design §3](./design.md#3-발견설치자연어-매핑)).
  - 검증: `npm --prefix app test`에서 다음 회귀가 통과한다: 신규 stub, `c994913` bytes의 이전 stub이 `differs`로 판정됨, 수정된 stub, 동일/별도 실제 경로, symlink 부모, 경쟁 파일 생성·승인 후 변경, profile stub이 실행마다 새 bytes로 쓰임.

── commit: `feat: expose design presets through CLI MCP and installed skill` ──

## D. 앱 백엔드

- [ ] D1. main/preload에 목록·단건 읽기 API와 타입을 연결한다. 실제 bundled CLI를 정본으로 사용하고 신뢰된 main-window 호출만 허용한다. 시간 초과·실패·잘못된 응답을 빈 성공으로 반환하지 않는다.
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`에서 `request_refused`와 `cli_error` reason별 fixture, 유효한 CLI 실패 보존, API 성공·실패·호출자 거부가 통과하고 conversation 이벤트·Start/Send 구조가 그대로이다.
- [ ] D2. 임시 환경의 실제 Electron에서 preload 조회와 호출자 경계를 짧게 확인하고 자체 프로세스를 정리한다. 화면 코드는 작성하지 않는다.
  - 검증: `npm --prefix app run build`, `node --test 'app/runtime/*.test.ts'`와 `/runtime-test`의 격리 probe 근거로 목록·단건 일치 및 실제 사용자 상태 보존을 확인한다. 임시 probe 실행 명령은 command undecided — needs user confirmation이며 runtime-test 준비 시 확정한다.
- [ ] D3. 앱 대화의 다섯 공급자(Claude Code·Codex·Cursor·Antigravity·GitHub Copilot) 각각에서, 격리된 실제 앱의 대화가 가이드 안내로 프리셋을 발견하고 bundled CLI로 본문을 조회하는지 짧게 확인한다. 조회 실패 시 MCP·Connections 안내 없이 미적용과 원인만 알리는지도 한 공급자에서 확인한다.
  - 검증: `/runtime-test` 격리 probe에서 공급자별 조회 호출 근거와 응답을 기록한다. 공급자 sign-in이 필요하므로 계정 사용은 실행 전에 사용자에게 확인한다. probe 실행 명령은 command undecided — needs user confirmation이다.
- [ ] D4. `buzz-home`이 사용할 API·오류·예제와 프리셋 선택 후 기존 대화에 연결하는 지점을 ARCHITECTURE §7에 쓸 형태로 정리하고, `docs/features/buzz-restyle/tasks.md` C3 줄의 인계를 갱신한다. UI의 목록·검색·선택·전송 조작은 후속 feature에 남긴다.
  - 검증: ARCHITECTURE §7 초안에 `designSkills.list/get`, `request_refused`·`cli_error` reason 네 가지, 구버전 판별 규칙, 목록·단건 예제, 전송 전 매핑 미리보기 없음이 모두 있다. renderer 변경이 없다(`git diff --stat -- app/src/renderer`가 비어 있다).

── commit: `feat: expose design preset reads to the app` ──

## E. 패키지·실제 에이전트·통합

- [ ] E1. 버전이 맞는 packaged CLI와 앱에 카탈로그·지침·고지가 포함되는지 확인한다. 격리한 `HOME`·`SHELL`·`CLAUDE_CONFIG_DIR`·`CODEX_HOME`에서 발견 경로를 검증한다. `c994913` stub과 새 CLI의 가이드→프리셋 조회, 새 stub과 `design-skill`이 없는 오래된 CLI의 `usage_error`→미적용 안내를 각각 확인한다.
  - 검증: `npm --prefix app run package` 후 `app/dist/mac-arm64/doan.app/Contents/Resources/bin/doan`으로 앱 없이 목록/본문을 조회하고, 패키지 경로 조회가 다른 PATH 버전으로 대체되지 않는다(POSTMORTEM 2026-10-24 runner 우회). 격리 실행 명령은 command undecided — needs user confirmation이다. 자동 검사는 기존 `npm --prefix app test`·`go test ./...`에 포함한다.
- [ ] E2a. eval runner를 확장한다: 프리셋 매핑용 focus 값(`eval/lib/scenario.ts`), `doan active`에 고정된 judge 호출 근거를 프리셋 조회 호출(`design-skill`, MCP `design_skill`)까지 일반화(`eval/lib/judge.ts`). 특정 도구만 거부하는 장치는 만들지 않는다.
  - 검증: `node --test 'eval/**/*.test.ts'`에서 새 focus와 호출 근거 추출 테스트가 통과하고, 실제 명령 실행과 문서 인용을 구분한다. 가장 긴 본문을 조회한 fixture에서도 judge 입력 상한(ARCHITECTURE §14) 안에 조회 호출 근거가 남는다.
- [ ] E2b. 발견·경로 시나리오: 이름을 알려주지 않은 발견, 명시 선택, shell 전용과 MCP 전용(`mcp: true`, `shellCli: false`) 각각, 두 경로 모두 불가에서 미적용과 연결 안내.
- [ ] E2c. 매핑 시나리오: 자연어 일치, 부정, 미일치(본문 미조회), 복합 요청, 검토만 요청, 대상 밖 변경 금지, `.doan/canvases/`가 비었거나 `.doan/`이 없는 repo에서 생성.
- [ ] E2d. 초기 셋업 연계 시나리오: `doan init` `nextSteps`에서 `context` 발견, 필요한 `document` 연계, 기존 디자인 시스템 재사용, 규칙 문서와 `design-system` 캔버스의 근거 일치, 요청 밖 변경 없음.
  - E2b–E2d 검증: 각 묶음마다 `node eval/run.ts --self-test --scenarios <해당 ids>`와 `node eval/run.ts --scenarios <해당 ids> --agents claude,codex --round <이름>`를 따로 실행한다. 사례별 허용 선택·필수 조회·미일치 시 본문 미조회·금지 수정을 checks/rubric으로 판정한다. 자동 검사 실패나 judge partial/fail은 해당 완료 조건을 미완료로 남긴다. 목록/단건 UTF-8 크기, 실제 조회 횟수, 모든 결과와 미검증 범위를 USABILITY-EVAL에 기록한다.
- [ ] E3. `/code-review` 후 필요한 수정을 하고 shared gate를 실행한다. eval 변경이 있으므로 `--eval`을 포함한다. 무관한 runtime probe를 반복하지 않는다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` PASS, 변경 범위 runtime·agent-eval 근거와 남은 실패가 보고서에 일치한다.

── commit: `test: verify design preset discovery and natural language routing` ──

## Z. 승격·인계

- [ ] Z1. 다음을 영어로 승격한다.
  - PRODUCT: §5 item 13의 "Planned design presets"를 구현 상태로 갱신하고 `init` 프리셋 표기를 `context`로 바꾼다. §5 Feature split 표에 `doan-design-skills` 행을 추가한다. §7에 2026-10-27·10-28·10-29 사용자 결정과 이유를 남긴다(백엔드 범위, 20개 선정, `context` ID, `design-system` 캔버스 경로와 갱신 규칙, 규칙 문서 위치, Impeccable 각색 배포와 고지, stub 교체 경고 수용, `doan init` `nextSteps`, `buzz-home` 인계).
  - ARCHITECTURE: §5(`design_skill`, 18개), §6(가이드·stub·두 설치 경로), §7(preload API·오류·앱 대화 안내), §11(공용 fixture 위치), §12(`design-skill` result, `doan init` `nextSteps`), §14(새 focus·호출 근거·시나리오).
  - 새 소스 위치는 DIRECTORY, 실제 에이전트 결과는 USABILITY-EVAL에 반영한다. UI 미완료와 후속 소유자(`buzz-home`)를 PRODUCT와 buzz-restyle 문서에 남긴 뒤 이 feature 디렉터리를 삭제한다.
  - 검증: 문서의 API·결과·상태를 구현·검증 근거와 수동 대조한다. 이번 완료 조건은 백엔드에 한정되고 사용자 UI 완료로 표시하지 않는다. 전용 문서 검증은 command undecided — needs user confirmation이다.

── commit: 문서별 `docs: document design preset backend` / `docs(feature): hand off design preset UI to buzz-home` / `docs(feature): complete doan-design-skills` ──

다음 단계는 `/tdd`이다. 이번 feature는 UI가 없으므로 `/design-draft`를 실행하지 않는다. 구현은 `/ship` 또는 `/orchestrate`의 feature branch에서 진행한다.
