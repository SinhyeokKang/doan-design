# doan-design-skills — tasks

작성일: 2026-10-27. 백엔드만 구현한다. A1의 스킬 선정은 2026-10-28 사용자 요청으로 완료 처리했다. 구현 검증과 원본 전체 대조·배포 고지 준비는 아직 수행하지 않았다. 아래 새 CLI 명령은 구현 대상이며 현재 실행 가능한 명령으로 오해하지 않는다. 검증 명령은 AGENTS.md Commands의 공통 명령을 사용한다.

## A. 계약·레퍼런스·fixture

- [x] A1. 공개 스킬 목록과 역할·연계 방향 선정 (2026-10-28 사용자 요청으로 완료 처리). [spec §3](./spec.md#3-프리셋과-매핑)에 공개 20개, 통합·제외 4개, CLI init과 스킬 init의 구분, 디자인 시스템 문서·확인용 캔버스와 스킬 간 참조를 기록했다.
  - 완료 범위: 선정과 문서 정리이다. 원본 전체 대조, 고지 준비, 구현·검증까지 완료했다는 뜻은 아니다. 구현 시 A1-R에서 다시 검토한다.
- [ ] A1-R. 구현 시작 시 선정안을 재검토하고 고정 원본의 24개 명령, 41개 reference 문서, 4개 역할 문서를 대조한다. 각 소스의 반영 위치·미반영 사유, license/notice·플랫폼 파생 출처·변경 고지를 준비한다. 디자인 시스템 스킬의 표시 이름·ID, 확정된 캔버스명 `design-system`과 경로 `.doan/canvases/design-system.html`의 반영·갱신 규칙, CLI init의 발견 안내 위치·출력 계약을 확인한다.
  - 검증: 원본 누락 0개, 공개·통합·제외 사유와 반영 위치, 필요한 고지를 확인한다. 공개 카탈로그와 원본 대응표를 구별한다. A2의 fixture와 이후 카탈로그 테스트는 재검토한 목록을 사용한다.
- [ ] A2. 카탈로그·단건·오류 공용 fixture와 Go/TS 소비 계약을 정한다. CLI envelope는 v1을 유지한다. 기존 가이드와 새 조회 결과의 완전성 마커를 구별한다.
  - 검증: `go test ./...`와 `npm --prefix app test`에서 같은 fixture를 읽는 테스트가 구현 전 실패하고, result/envelope의 차이를 검증한다.

── commit: `test: define design preset catalog contracts` ──

## B. 정적 프리셋과 순수 함수

- [ ] B1. 사용자 범위·요청 우선순위와 도안 규약을 유지하는 Markdown을 작성하고 CLI에 포함한다. 원본 엔진 명령·요청과 무관한 자동 handoff·강제 subagent·상주 live loop를 제거하거나 도안 작업 지침으로 바꾼다. 필요한 스킬 간 참조·연계와 디자인 시스템 문서·캔버스 작성 지침은 포함한다. 사용자에게 원본 전체 기능 이식으로 설명하지 않는다.
  - 검증: `go test ./...`에서 전체 ID·출처·본문·참조·마커 검사와 원본 의존 placeholder 검사가 통과한다. A1-R 대조표와 수동 의미 검토로 내용 누락을 확인한다.
- [ ] B2. 목록 투영, 단건 조회, 가이드의 짧은 목록 생성, 앱 결과 해석을 순수 함수로 구현한다. 목록에는 전체 본문을 넣지 않는다.
  - 검증: `go test ./...`와 `npm --prefix app test`에서 정상·unknown/empty ID·명령 미지원·unknown envelope v·잘못된 result·실행 오류·안정 순서·목록/본문 분리 사례가 통과한다.
- [ ] B3. 자연어 매핑 지침과 앱 대화의 고정 가이드 안내를 작성한다. 요청 원문과 앵커의 비신뢰 경계를 유지하고 별도 분류 모델은 호출하지 않는다.
  - 검증: `npm --prefix app test`에서 원문 보존·앵커·입력 제한·기존 전송 거부 회귀가 통과한다. 의미 매핑은 E2의 실제 에이전트 평가로 검증한다.

── commit: `feat: bundle Doan design presets and routing guidance` ──

## C. CLI·MCP·설치

- [ ] C1. `design-skill [id]` 목록/단건 명령, 도움말, `doan skill`의 발견 안내와 MCP `design_skill`을 연결한다. 읽기 전용·repo 불필요·동일 envelope를 유지한다.
  - 검증: `go test ./...`와 `go vet ./...`에서 CLI/MCP parity, 잘못된 인자, 앱이 꺼진 환경, 비프로젝트 cwd, 본문 완전성, readOnly annotation이 통과한다.
- [ ] C2. 기존 `doan` stub 설명을 확장하고 기존 온보딩/Connections 설치 경로에서 제공한다. 새 전역 스킬·설치기·원격 다운로드는 만들지 않는다. CLI init 안내에서 디자인 시작 스킬을 발견하도록 연결하되 CLI가 스킬이나 모델을 실행하지 않게 한다.
  - 검증: `npm --prefix app test`에서 신규·기존·수정된 stub, 동일/별도 실제 경로, symlink 부모, 경쟁 파일 생성·승인 후 변경 회귀가 통과한다.

── commit: `feat: expose design presets through CLI MCP and installed skill` ──

## D. 앱 백엔드

- [ ] D1. main/preload에 목록·단건 읽기 API와 타입을 연결한다. 실제 bundled CLI를 정본으로 사용하고 신뢰된 main-window 호출만 허용한다. 시간 초과·실패·잘못된 응답을 빈 성공으로 반환하지 않는다.
  - 검증: `npm --prefix app run typecheck`와 `npm --prefix app test`에서 design의 오류 코드별 fixture와 유효한 CLI 실패 보존, API 성공·실패·호출자 거부가 통과하고 conversation 이벤트·Start/Send 구조가 그대로이다.
- [ ] D2. 임시 환경의 실제 Electron에서 preload 조회와 호출자 경계를 짧게 확인하고 자체 프로세스를 정리한다. 화면 코드는 작성하지 않는다.
  - 검증: `npm --prefix app run build`, `node --test 'app/runtime/*.test.ts'`와 `/runtime-test`의 격리 probe 근거로 목록·단건 일치 및 실제 사용자 상태 보존을 확인한다. 임시 probe 실행 명령은 command undecided — needs user confirmation이며 runtime-test 준비 시 확정한다.
- [ ] D3. `buzz-restyle`이 사용할 API·오류·예제와 스킬 선택 후 기존 대화에 연결하는 지점을 문서화한다. UI의 목록·검색·선택·전송 조작은 후속 feature에 남긴다.
  - 검증: 수동 계약 대조로 CLI/MCP/preload가 같은 카탈로그를 사용하고 renderer 변경이 없는지 확인한다. 전용 문서 검증은 command undecided — needs user confirmation이다.

── commit: `feat: expose design preset reads to the app` ──

## E. 패키지·실제 에이전트·통합

- [ ] E1. 버전이 맞는 packaged CLI와 앱에 카탈로그·지침·고지가 포함되는지 확인한다. 실제 HOME을 바꾸지 않는 설치 환경에서 발견 경로를 검증한다. 현재 eval runner는 최신 stub을 복사하므로 이전 릴리스 stub과 새 CLI의 실제 가이드→프리셋 조회는 별도 격리 확인으로 남긴다.
  - 검증: `npm --prefix app run package` 후 격리 실행에서 앱 없이 목록/본문을 조회하고, 패키지 경로 조회가 다른 PATH 버전으로 대체되지 않는다. 자동 검사는 기존 `npm --prefix app test`·`go test ./...`에 포함한다.
- [ ] E2. agent-eval 시나리오를 추가한다: 이름을 알려주지 않은 발견, 명시 선택, CLI 초기 셋업에서 init 발견·필요한 디자인 시스템 스킬 연계·기존 시스템 재사용·문서와 캔버스 근거 일치, 자연어 일치, 부정, 미일치, 복합 요청, 검토만 요청, 대상 밖 변경 금지, 빈 design 디렉터리에서 생성. 대표 발견·본문 조회는 shell 전용과 MCP 전용(`mcp: true`, `shellCli: false`)으로 각각 배치한다. 두 조회 경로 모두 불가·본문 조회 거부에서 미적용과 연결 안내도 확인한다. 실제 명령 실행과 문서 인용을 구분한다.
  - 검증: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test`, `node eval/run.ts --scenarios <이번에 등록한 ids> --agents claude,codex --round <이름>`에서 fixture와 두 에이전트의 필수 사례가 통과해야 한다. 사례별 허용 선택·필수 조회·미일치 시 본문 미조회·금지 수정을 checks/rubric으로 판정한다. 자동 검사 실패나 judge partial/fail은 해당 완료 조건을 미완료로 남긴다. 모든 결과와 미검증 범위를 USABILITY-EVAL에 기록한다.
- [ ] E3. `/code-review` 후 필요한 수정을 하고 shared gate를 실행한다. eval 변경이 있으므로 `--eval`을 포함한다. 무관한 runtime probe를 반복하지 않는다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs --eval` PASS, 변경 범위 runtime·agent-eval 근거와 남은 실패가 보고서에 일치한다.

── commit: `test: verify design preset discovery and natural language routing` ──

## Z. 승격·인계

- [ ] Z1. PRODUCT §5·§7에 백엔드 범위와 2026-10-27 사용자 결정·이유를, ARCHITECTURE §5·§6·§7·§12에 목록/단건·설치·앱 조회 계약을 영어로 승격한다. PoC의 제한된 결과도 PRODUCT §6에 남긴다. 새 소스 위치는 DIRECTORY, 실제 에이전트 결과는 USABILITY-EVAL에 반영한다. UI 미완료와 후속 소유자를 PRODUCT 및 buzz-restyle 문서에 남긴 뒤 이 feature 디렉터리를 삭제한다.
  - 검증: 문서의 API·결과·상태를 구현·검증 근거와 수동 대조한다. 이번 완료 조건은 백엔드에 한정되고 사용자 UI 완료로 표시하지 않는다. 전용 문서 검증은 command undecided — needs user confirmation이다.

── commit: 문서별 `docs: document design preset backend` / `docs(feature): hand off design preset UI to buzz-restyle` / `docs(feature): complete doan-design-skills` ──

다음 단계는 `/feature-review`이다. 이번 feature는 UI가 없으므로 `/design-draft` 없이 `/tdd`로 이어진다. 구현은 `/ship` 또는 `/orchestrate`의 feature branch에서 진행한다.
