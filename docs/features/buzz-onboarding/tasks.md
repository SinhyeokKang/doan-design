# buzz-onboarding — tasks

작성: 2026-10-27. feature 초안이며 구현 지시가 아니다. agent-auth는 2026-10-28 main에 병합됐다(PR #33). 구현 착수 전에 F4–F6을 마친다.

실행 순서는 직렬이다(2026-10-28 사용자): 선행 feature `agent-cli-versions`의 `/orchestrate` → main 병합 → 이 feature의 `/orchestrate` → main 병합. F4·F5는 `agent-cli-versions` 진행 중에 끝낼 수 있다. 이 feature의 `/orchestrate`는 F6을 확인한 뒤 시작하고, A부터 V까지를 한 run에서 배치로 나눈다.

## F. 디자인 초안 → 사용자 확인 → feature-review

- [x] F1. GitHub clone·로컬 재사용·필수 ready/프로젝트·미완료 재실행 Welcome·최종 디자인을 확정하고 세 문서에 반영했다. 저장된 연결/프로젝트는 유지한다.
  - 검증: spec의 미결정 항목이 해소되고 PRODUCT §3과 충돌하는 승인 사항마다 마지막 승격 작업이 있다. 문서 대조이며 코드 명령은 없다.
- [x] F2. 로컬 Buzz clone의 기준 커밋·온보딩 원본을 확인하고 `/feature-review`로 product·tech·QA·UX 계약을 검토한다.
  - 검증: AGENTS의 `git -C ~/code/buzz-app rev-parse HEAD`와 `git -C ~/code/buzz-app show <sha>:<path>`로 원본을 확인한다. 리뷰 질문과 반영 결과를 문서에 남긴다.
- [x] F3. 사용자 지시에 따라 현재 트리의 루트 `.doan/canvases/`에 초안을 그리고 feature-review 전에 확인받았다(2026-10-28). 10개 프레임·33개 상태와 최신 시각 기준은 design에 정리했다.
  - 검증: 격리된 `DOAN_RUNTIME`으로 `go run ./cli/cmd/doan check --json --repo .`의 새 오류/경고가 없고 `go run ./cli/cmd/doan ls --json --repo .`의 frame 목록이 요청과 일치한다. 사용자 확인과 HTML 렌더링 검증을 마쳤다. 실제 기능 동작 검증은 V1 대상이다.

- [x] F4. `/design-draft`로 초안을 보완하고 사용자 확인을 받는다(2026-10-28 확정). design의 상태 대응 표에 있는 상태를 tile로 추가한다: Install·Update, 링크 준비 중(Antigravity 내려받기 포함), Cursor·Copilot 탭 안내, unverified·Retry와 Copilot 비용, 로그아웃 실패, 재인증 원인별, stop 확인 대화상자, Antigravity 주소 붙여넣기 모달, 계정 표시값 없는 연결, 인증 저장소 읽기 실패, 'No agent is ready'. 백엔드에 없는 '저장 중'·'실행 준비 중' tile은 지운다. 다섯 공급자의 Install·Update 안내 URL을 정한다. 기존 승인 상태는 바꾸지 않는다.
  - 검증: 격리된 `DOAN_RUNTIME`으로 `go run ./cli/cmd/doan check --json --repo .`의 새 finding이 0개이고 `go run ./cli/cmd/doan ls --json --repo .`의 frame·tile 목록이 상태 대응 표와 일치한다. 사용자 확인 기록을 design에 남긴다.
- [ ] F5. 사용자 결정을 PRODUCT에 기록하는 task다(이 리뷰는 PRODUCT를 직접 고치지 않는다). §7에 2026-10-27 온보딩 clone 예외, 2026-10-28 CLI/MCP 온보딩, ready 1개 이상 필수·Skip 없음·미완료 재실행 Welcome, 2026-10-28 재검토 결정(design '재검토' 절 중 제품 판단)을 날짜·이유와 함께 추가한다. §3 Out of scope의 'GitHub cloning deferred'에 '사용자의 기존 Git credential로 하는 온보딩 clone은 buzz-onboarding이 담당한다'를 덧붙이고, §5의 'skills·MCP 설치, 모든 단계 Skip' 서술을 현재 흐름과 구분한다. 구현 착수 전에 한다.
  - 검증: PRODUCT §3·§5·§7과 spec·design의 결정이 서로 모순되지 않는지 문서로 대조한다. 코드 명령은 없다.
- [ ] F6. 선행 feature `agent-cli-versions`(확인된 최소 버전 + 실행 시 호환 검사, 2026-10-28 사용자)가 main에 병합됐는지 확인하고, 그 결과 readiness cause·action으로 Install·Update 조건과 상태 대응 표를 갱신한다.
  - 검증: 병합된 ARCHITECTURE §7 'Versions'와 design 상태 대응 표의 `version_*` 행을 대조한다. 병합 전이면 이 feature의 `/orchestrate`를 시작하지 않는다.

── commit: `docs(feature): define buzz-onboarding flow and approved draft contract` ──

## A. 계약·fixture·순수 함수

- [ ] A0. onboarding app-socket v2 입력/응답 schema와 TS/Go 공유 fixture를 먼저 작성한다. 기존 runtime.v1·active v1은 유지하고 신규 operation만 추가한다. CLI envelope·종료 코드·MCP isError 매핑과 지원 operation 목록(`check` 포함)을 고정한다. fixture는 기존 `schema/fixtures/app-socket/{request,response}/{valid,invalid}/` 구조에 v2 파일로 추가한다. status 응답에는 계정 email·표시 이름이 없어야 한다.
  - 검증: `/tdd`, `go test ./...`, `npm --prefix app test`로 동일 valid/invalid fixture를 양쪽에서 확인한다. 미등록 프로젝트 없는 시작, 잘못된 토큰·버전·operation·session·request·경로, 기존 active 호환을 검증한다. 토큰 인증 실패 시 계정/경로/작업 상태가 출력되지 않아야 한다.


- [ ] A1. 병합된 agent-auth main/preload 계약([ARCHITECTURE §7](../../ARCHITECTURE.md#agent-authentication-2026-10-28-agent-auth), 처리 항목은 [design의 agent-auth 인계](./design.md#agent-auth-인계-2026-10-28))을 인수하고, 완료 표식 v1/프로젝트 인계 계약의 TS fixture를 작성한다. 기존 {}·미완료 재실행 Welcome·정상 새 완료·손상·미지 버전·실패 저장을 구분한다. 저장된 연결과 등록 프로젝트가 유지되는지 확인한다.
  - 검증: `/tdd`와 `npm --prefix app test`로 변경 계약의 실패를 먼저 확인한다. 인계 목록을 코드와 대조한다: `app/src/main/agentAuth/`, 두 preload의 9개 인증 메서드, `app/src/main/agentAuth/fixtures/`의 metadata v1 fixture를 재사용한다. 기존 {}가 새 완료로 통과하지 않고, 정상 새 완료만 첫 실행을 종료하는지 판정한다.
- [ ] A2. scene 전이·진행 판정·온보딩 세션 revision·선택 세대·URL/리포 identity·`.git/config` remote 파싱 순수 함수와, 공용 renderer 모듈의 공급자 view-model(design 상태 대응 표 전체)을 구현한다. 진행 판정은 `readiness.ready`만 쓰고 readiness를 다시 판정하지 않는다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 역순 완료·빈 값·긴 값·중복 root·여러 checkout·잘못된 URL을 확인한다. 상태 대응 표의 모든 행(readiness action 8종, reply reason 8종, error code 전부, `readAgentAuth` `null`, 계정 표시값 없음·email만 있음)을 fixture로 판정한다. connected지만 ready가 아니면 진행을 막고, 한 공급자가 ready이면 진행을 허용한다. `.git/config`의 include·worktree commondir·여러 remote를 판정한다. 프로젝트 단계에서 유일한 ready 연결이 만료되면 완료를 막으며, 다른 ready 연결이 남으면 그 조건을 충족한 것으로 판정한다. 실제 요청·유료 구독 검증은 추가하지 않는다.

── commit: `feat(onboarding): define first-run state and project selection contracts` ──

## B. main I/O·CLI/MCP·화면

- [ ] B0. 앱과 로컬 CLI/MCP가 공유하는 main 온보딩 서비스와 고정 socket v2 어댑터를 연결한다. 기존 renderer sender 제한과 agent-auth 소유권을 유지한다. CLI/MCP 로그인의 소유자는 주 창 `webContents.id`이고, main `onPrompt`에 tap을 추가하며, operationId→attemptId map으로 자기 시도만 취소한다. 완료 뒤에도 쓰기 작업을 연다(사용자 결정). 장기 작업은 operationId를 즉시 반환하고 status로 읽는다.
  - 검증: `go test ./...`, `npm --prefix app test`로 프로젝트 없는 status/sign-in, 요청 인증, UI/CLI 동일 revision, requestId 중복 재전송, 같은 ID/다른 인수 거부, 앱 재시작 후 stale session, 명시적 작업 취소를 확인한다. CLI/MCP 연결 종료로 main 작업이 취소되면 실패다. 2초 socket 제한 안에서 OAuth/clone 종료를 기다리지 않아야 한다. CLI cancel이 같은 주 창 소유의 다른 로그인을 취소하지 못하는지, Copilot `check`가 명시 플래그 없이 거부되는지, `stop_required`·`busy`가 그대로 반환되는지, 완료 뒤 start/status가 완료를 반환하고 다시 온보딩시키지 않는지, 구 앱의 v1 `bad_request`가 `app_protocol_mismatch`로 분류되는지 확인한다.


- [ ] B1. 승인된 프로젝트 선택·재사용·초기화·완료 저장·홈 인계를 연결한다. 등록은 선택 시점이고 complete는 등록 확인만 한다. remote는 git을 실행하지 않고 `.git/config`로 읽는다. 승인된 clone의 소유 프로세스·취소·경로 충돌·로컬 인증 실패·부분 결과 처리를 구현한다.
  - 검증: `npm --prefix app test`로 폴더 사라짐·권한 오류·중복 등록·remote 불일치·초기화 실패·늦은 목록 반영·main frame 권한을 검증한다. clone 취소 직후 늦은 성공, 프로세스 후손 종료 전 재시도 거부, cleanup 실패, 목적지 경쟁 생성, 기존 파일 보존, 비대화식 인증 실패, URL 변경 후 오래된 응답 폐기를 각각 검증한다. 등록 성공 뒤 완료 저장 실패에서는 홈에 가지 않고, Retry가 clone/초기화/등록을 중복하지 않는지 확인한다. remote 확인 경로에서 git 프로세스가 생기지 않는지 확인한다.
- [ ] T1. UI 작업 전에 design의 새 토큰 6개(`--size-chrome`, `--size-control-lg`, `--space-10`, `--space-12`, `--type-weight-semibold`, `--size-row`)를 `app/src/renderer/tokens.css`에 추가한다. 출하된 화면에서 값이 같은 곳(셸 56px, font-weight 600)을 새 토큰으로 바꿀지는 computed가 같을 때만 한다. 시안 `.doan/canvases/buzz-onboarding.html`의 해당 하드코딩 값을 새 토큰으로 바꾼다. B2는 이 토큰을 쓴다.
  - 검증: `npm --prefix app test`(ds `checks.test.ts` 포함)와 `npm --prefix app run typecheck` 통과. 시안과 바꾼 출하 화면의 모든 요소 computed가 바꾸기 전과 같은지 렌더링 비교로 확인한다(회전하는 spinner의 박스는 제외). `go run ./cli/cmd/doan check --json --repo .`의 새 finding이 0개이다. DESIGN.md의 토큰 절에 새 토큰을 기록한다.
- [ ] B2. Welcome·로그인·프로젝트 화면을 승인된 초안대로 구현한다. 공용 버튼에 lg(48px)를 추가하고, 12px/16px notice·로딩 spinner·Back arrow·말줄임표 없는 문구를 적용한다. 썸네일의 연한 배경·진한 글자 색 규칙은 ShellSidebar와 공유한다. 버튼·입력창의 translucent 변형과 본문 전체 panel 래핑은 구현하지 않는다. agent-auth API를 공용 view-model과 stop 확인 대화상자로 소비하고, 기존 온보딩의 외부 설치·첫 프롬프트 단계와 고아 채널(`onboarding:read|run|answer|close`, `markClosed`, `wizardSession`)을 제거한다. `onboardingClosed`는 새 완료 v1로 다시 정의한다. 다른 화면의 공유 기능은 보존한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 인증 성공/취소/실패·뒤로·종료·구독 해제·홈 프로젝트 인계와 Settings/FirstPrompt 소비자 회귀를 확인한다. `checkAgentAuth('copilot')`는 사용자 Retry에서만 호출되고, 단계 진입·창 focus·이벤트 수신에서는 Copilot에 `readAgentAuth`만 호출되는지 판정한다. Copilot 외 공급자의 자동 check, Claude·Codex·Antigravity만 링크 자동 열기, Continue가 소유 시도를 취소하는지, Antigravity 붙여넣기 모달의 Escape·포커스 복귀, `not_owner`·`busy`·`stop_required` 표시, 첫 ready의 role=status와 Continue 포커스를 확인한다. V1에서 33개 상태, lg와 기존 버튼 크기, notice/spinner 정렬, 8색 썸네일과 사이드바 가독성을 승인 HTML과 대조한다.

- [ ] B3. design의 고정 onboarding CLI 명령과 MCP 도구, help·`doan skill`(MCP `skill` 도구)·설치 진입 안내와 doan skill의 새 명령 매핑을 구현한다. start만 앱 자동 실행을 담당한다. PATH/MCP/skill/프로젝트 초기화 없는 번들 CLI에서 시작할 수 있어야 한다. select 초기화는 검사 계획과 명시적 --initialize를 요구한다.
  - 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`로 명령/도구 인수·출력 일치, 신뢰한 소속 bundle만 visible launch, 15초 bootstrap 상한, 명시적 DOAN_RUNTIME 실패 시 기본 앱 fallback 금지, 기존 active 앱 미실행 동작 유지, stdout/stderr/MCP 비밀 비노출을 확인한다. 초기화/clone은 사용자가 요청한 명시 경로와 최신 검사만 실행하며 임의 IPC/실행 파일을 받지 않는다.

── commit: `feat(onboarding): connect shared setup through UI CLI and MCP` ──

## V. 실제 앱과 승격

- [ ] V1. `/runtime-test`로 변경된 온보딩을 격리한 Electron에서 확인하고 `/design-sync`로 승인 프레임을 대조한다.
  - 검증: AGENTS의 격리된 dev/패키지 실행과 `npm --prefix app run package`로 첫 실행·창 숨김/복귀·재시작·브라우저 복귀·중첩 모달·긴 값·최소 창 크기·키보드·홈 인계를 확인한다. 미완료 재시작은 Welcome이며 연결/프로젝트는 남아야 한다. Cmd+W 복귀는 같은 세션·입력이고 완료 표식이 없어야 한다. 최상위 Escape는 필수 단계를 우회하지 않고, 자식 Escape는 자식만 닫고 호출 버튼에 포커스를 돌려야 한다. 실제 지연 응답으로 disabled를 거친 뒤 포커스와 최신 상태만 반영되는지 확인한다. 패키지 앱에서 취소·실패 이벤트 직후 즉시(50ms 간격) 같은·다른 공급자로 다시 로그인해 `busy` 구간을 기록한다. 기존 `{}`와 등록 프로젝트가 있는 업그레이드 사용자의 Welcome·목록 재선택을 확인한다. 실제 인증 환경은 agent-auth D1과 같다: 실제 HOME, 격리 userData·`DOAN_RUNTIME`, setup 쓰기 단계 없음. doan이 만든 Keychain 항목은 만들고 지운 목록을 보고하고, 임시 userData를 지우기 전에 각 공급자를 로그아웃한다. 다섯 공급자 모두 온보딩 UI로 로그인하고 공급자별로 열린 브라우저 탭 수를 기록한다. 외부 자격 증명 metadata를 전후로 비교하고 허용 부작용(`~/.codex/tmp/arg0-macos/`, cursor-agent `.running`)을 명시한다. 측정은 `node .scratch/design-sync/<screen>/measure.mjs`로 남긴다. 새 영구 e2e suite는 만들지 않는다.
- [ ] V1b. 패키지 앱에서 번들 CLI와 MCP가 같은 main 온보딩 서비스를 쓰는지 확인한다. (a) 세션 작업: 실제 HOME과 격리 userData·`DOAN_RUNTIME`(V1과 같은 조건)으로 진행한다. (b) bootstrap 자동 실행: 명시적 `DOAN_RUNTIME`이 있으면 자동 실행이 금지되므로 `DOAN_RUNTIME` 없이 해야 하고 실제 userData에 닿는다. 실행 전에 사용자 승인을 받는다.
  - 검증: `npm --prefix app run package` 후 짧은 probe를 수행한다. MCP는 모델 없이 `doan mcp`에 stdio JSON-RPC로 호출하고, AGENTS 'Real-agent MCP check'의 Claude 경로로 실제 에이전트 확인을 1회 한다(Codex는 모델 경계를 넘으므로 사용자 허락 없이는 쓰지 않는다). CLI 시작 → visible 앱, UI와 status 동일 결과, UI 취소 → poll 반영, CLI 종료 후 main 작업 유지, 앱 종료 정리, 같은 요청 재전송 무중복, ready/프로젝트/완료 저장 성공 후 홈 진입을 확인한다. OAuth 사용자 승인은 시스템 브라우저에서 진행하며 에이전트에게 인증 원문을 주지 않는다. CLI로 시작한 로그인의 공급자별 동작(Claude 훅 링크와 10초 실패, Codex 링크 2개 중 마지막, Cursor·Copilot 자체 브라우저, Antigravity 약 20초 대기)과 주 창을 숨긴 상태의 CLI 로그인, UI에서 시작한 작업을 CLI가 취소한 결과의 UI 반영을 기록한다. 실제 계정 저장소 보존은 agent-auth의 공급자별 범위로 확인한다.
- [ ] V1c. 실제 clone을 짧은 probe로 확인한다.
  - 검증: 공개 HTTPS 리포를 임시 부모 경로에 clone(성공), 없는 리포·private 리포는 terminal/askpass를 기다리지 않고 접근 실패, clone 중 취소 → 프로세스 그룹 종료와 임시 경로 정리, 목적지 충돌, SSH BatchMode를 확인한다. Git 미설치는 PATH로 재현하고 macOS `/usr/bin/git` shim의 CLT 설치 창을 띄우지 않는다.
- [ ] V2. `/code-review` 후 수정 사항과 해당 회고를 반영하고 통합 gate를 실행한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 이번 범위는 CLI/MCP 출력·가이드·도구 metadata를 변경하므로 마지막 통합의 `/agent-eval`이 필수다. eval은 명시적 `DOAN_RUNTIME`을 설정하므로(`eval/lib/workspace.ts`) `onboarding start`는 앱을 자동 실행하지 않고 실패하는 것이 기대 결과다. `eval/scenarios/`에 시나리오를 추가하면 pass/fail fixture, `node .agents/skills/verify/scripts/verify.mjs --eval`, `node eval/run.ts --self-test`의 PASS를 함께 요구한다. 기존 고정 시나리오와 새 온보딩 명령 읽기/사용 검증을 구분해 기록하며, 인증과 clone의 실제 통합 증거를 언어 모델의 추측으로 대체하지 않는다. 미검증을 통과로 기록하지 않는다.
- [ ] V3. PRODUCT §3·§5·§7과 ARCHITECTURE의 온보딩·IPC·저장 계약, DESIGN의 온보딩 측정값을 승격한다. 승인된 Git 작업 예외·CLI/MCP 온보딩의 로컬 socket 권한·schema v2·bootstrap과 사용자 흐름 변경을 날짜·이유와 함께 기록한다. 필요하면 DIRECTORY도 갱신한다. PRODUCT §2·§5의 'Onboarding installs skills and MCP'·'Not yet built: onboarding' 서술을 갱신한다. `docs/features/buzz-restyle/tasks.md`의 C2를 체크하고 C3(buzz-home)에 프로젝트 선택 인계를 남긴 뒤 이 feature 디렉터리를 삭제한다.
  - 검증: 정본·구현·승인 디자인·runtime 근거를 대조한다. 부모 buzz-restyle과 기존 디자인 이력은 보존하고 해당 자식의 완료만 기록한다.

── commit: `docs(onboarding): promote verified first-run flow and measurements` ──


2026-10-28(agent-auth 병합 뒤): 네 관점 feature-review를 다시 했고 결정은 design의 [재검토 절](./design.md#agent-auth-병합-뒤-재검토-2026-10-28)에 있다. F4–F6이 구현의 선행 조건이다.

2026-10-28: 사용자가 디자인을 승인했고 HTML 표시 검증을 통과했다. F3 → F1 계약 확정·F2 리뷰 순서로 진행했고 CLI/MCP 범위를 추가 반영하고 네 관점 리뷰와 최종 문서 대조를 마쳤다. 구현 착수는 아직 아니다. 승인된 GitHub clone·필수 연결/프로젝트·최종 디자인을 다시 결정하지 않는다. V3에는 공통 썸네일 색 규칙과 Shell 측정값 갱신도 포함한다.
