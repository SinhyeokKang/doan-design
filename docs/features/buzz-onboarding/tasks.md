# buzz-onboarding — tasks

작성: 2026-10-27. feature 초안이며 구현 지시가 아니다. agent-auth가 완료됐다고 가정해 설계하되 실제 구현 착수 전 선행 계약을 확인한다.

## F. 디자인 초안 → 사용자 확인 → feature-review

- [x] F1. GitHub clone·로컬 재사용·필수 ready/프로젝트·미완료 재실행 Welcome·최종 디자인을 확정하고 세 문서에 반영했다. 저장된 연결/프로젝트는 유지한다.
  - 검증: spec의 미결정 항목이 해소되고 PRODUCT §3과 충돌하는 승인 사항마다 마지막 승격 작업이 있다. 문서 대조이며 코드 명령은 없다.
- [x] F2. 로컬 Buzz clone의 기준 커밋·온보딩 원본을 확인하고 `/feature-review`로 product·tech·QA·UX 계약을 검토한다.
  - 검증: AGENTS의 `git -C ~/code/buzz-app rev-parse HEAD`와 `git -C ~/code/buzz-app show <sha>:<path>`로 원본을 확인한다. 리뷰 질문과 반영 결과를 문서에 남긴다.
- [x] F3. 사용자 지시에 따라 현재 트리의 루트 `design/`에 초안을 그리고 feature-review 전에 확인받았다(2026-10-28). 10개 프레임·33개 상태와 최신 시각 기준은 design에 정리했다.
  - 검증: 격리된 `DOAN_RUNTIME`으로 `go run ./cli/cmd/doan check --json --repo .`의 새 오류/경고가 없고 `go run ./cli/cmd/doan ls --json --repo .`의 frame 목록이 요청과 일치한다. 사용자 확인과 HTML 렌더링 검증을 마쳤다. 실제 기능 동작 검증은 V1 대상이다.

── commit: `docs(feature): define buzz-onboarding flow and approved draft contract` ──

## A. 계약·fixture·순수 함수

- [ ] A0. onboarding app-socket v2 입력/응답 schema와 TS/Go 공유 fixture를 먼저 작성한다. 기존 runtime.v1·active v1은 유지하고 신규 operation만 추가한다. CLI envelope·종료 코드·MCP isError 매핑과 지원 operation 목록을 고정한다.
  - 검증: `/tdd`, `go test ./...`, `npm --prefix app test`로 동일 valid/invalid fixture를 양쪽에서 확인한다. 미등록 프로젝트 없는 시작, 잘못된 토큰·버전·operation·session·request·경로, 기존 active 호환을 검증한다. 토큰 인증 실패 시 계정/경로/작업 상태가 출력되지 않아야 한다.


- [ ] A1. 실제 agent-auth main/preload 계약을 인수하고, 완료 표식 v1/프로젝트 인계 계약의 TS fixture를 작성한다. 기존 {}·미완료 재실행 Welcome·정상 새 완료·손상·미지 버전·실패 저장을 구분한다. 저장된 연결과 등록 프로젝트가 유지되는지 확인한다.
  - 검증: `/tdd`와 `npm --prefix app test`로 변경 계약의 실패를 먼저 확인한다. 인증 선행 기능이 없으면 구현을 시작하지 않는다. 기존 {}가 새 완료로 통과하지 않고, 정상 새 완료만 첫 실행을 종료하는지 판정한다.
- [ ] A2. scene 전이·진행 판정·revision 합치기·선택 세대·문구와 승인된 URL/리포 identity 순수 함수를 구현한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 역순 완료·빈 값·긴 값·중복 root·여러 checkout·잘못된 URL을 확인한다. connected지만 준비 중/실패이면 진행을 막고, 한 공급자가 ready이면 진행을 허용한다. 프로젝트 단계에서 유일한 ready 연결이 만료되면 완료를 막으며, 다른 ready 연결이 남으면 그 조건을 충족한 것으로 판정한다. 실제 요청·유료 구독 검증은 추가하지 않는다.

── commit: `feat(onboarding): define first-run state and project selection contracts` ──

## B. main I/O·CLI/MCP·화면

- [ ] B0. 앱과 로컬 CLI/MCP가 공유하는 main 온보딩 서비스와 고정 socket v2 어댑터를 연결한다. 기존 renderer sender 제한과 agent-auth 소유권을 유지한다. 장기 작업은 operationId를 즉시 반환하고 status로 읽는다.
  - 검증: `go test ./...`, `npm --prefix app test`로 프로젝트 없는 status/sign-in, 요청 인증, UI/CLI 동일 revision, requestId 중복 재전송, 같은 ID/다른 인수 거부, 앱 재시작 후 stale session, 명시적 작업 취소를 확인한다. CLI/MCP 연결 종료로 main 작업이 취소되면 실패다. 2초 socket 제한 안에서 OAuth/clone 종료를 기다리지 않아야 한다.


- [ ] B1. 승인된 프로젝트 선택·재사용·초기화·완료 저장·홈 인계를 연결한다. 승인된 clone의 소유 프로세스·취소·경로 충돌·로컬 인증 실패·부분 결과 처리를 구현한다.
  - 검증: `npm --prefix app test`로 폴더 사라짐·권한 오류·중복 등록·remote 불일치·초기화 실패·늦은 목록 반영·main frame 권한을 검증한다. clone 취소 직후 늦은 성공, 프로세스 후손 종료 전 재시도 거부, cleanup 실패, 목적지 경쟁 생성, 기존 파일 보존, 비대화식 인증 실패, URL 변경 후 오래된 응답 폐기를 각각 검증한다. 등록 성공 뒤 완료 저장 실패에서는 홈에 가지 않고, Retry가 clone/초기화/등록을 중복하지 않는지 확인한다.
- [ ] B2. Welcome·로그인·프로젝트 화면을 승인된 초안대로 구현한다. 공용 버튼에 lg(48px)를 추가하고, 12px/16px notice·로딩 spinner·Back arrow·말줄임표 없는 문구를 적용한다. 썸네일의 연한 배경·진한 글자 색 규칙은 ShellSidebar와 공유한다. 버튼·입력창의 translucent 변형과 본문 전체 panel 래핑은 구현하지 않는다. agent-auth API를 소비하고 기존 온보딩의 외부 설치·첫 프롬프트 단계를 제거한다. 다른 화면의 공유 기능은 보존한다.
  - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`로 인증 성공/취소/실패·뒤로·종료·구독 해제·홈 프로젝트 인계와 Settings/FirstPrompt 소비자 회귀를 확인한다. V1에서 33개 상태, lg와 기존 버튼 크기, notice/spinner 정렬, 8색 썸네일과 사이드바 가독성을 승인 HTML과 대조한다.

- [ ] B3. design의 고정 onboarding CLI 명령과 MCP 도구, help·doan guide·설치 진입 안내를 구현한다. start만 앱 자동 실행을 담당한다. PATH/MCP/skill/프로젝트 초기화 없는 번들 CLI에서 시작할 수 있어야 한다. select 초기화는 검사 계획과 명시적 --initialize를 요구한다.
  - 검증: `go test ./...`, `go vet ./...`, `npm --prefix app test`로 명령/도구 인수·출력 일치, 신뢰한 소속 bundle만 visible launch, 15초 bootstrap 상한, 명시적 DOAN_RUNTIME 실패 시 기본 앱 fallback 금지, 기존 active 앱 미실행 동작 유지, stdout/stderr/MCP 비밀 비노출을 확인한다. 초기화/clone은 사용자가 요청한 명시 경로와 최신 검사만 실행하며 임의 IPC/실행 파일을 받지 않는다.

── commit: `feat(onboarding): connect shared setup through UI CLI and MCP` ──

## V. 실제 앱과 승격

- [ ] V1. `/runtime-test`로 변경된 온보딩을 격리한 Electron에서 확인하고 `/design-sync`로 승인 프레임을 대조한다.
  - 검증: AGENTS의 격리된 dev/패키지 실행과 `npm --prefix app run package`로 첫 실행·창 숨김/복귀·재시작·브라우저 복귀·중첩 모달·긴 값·최소 창 크기·키보드·홈 인계를 확인한다. 미완료 재시작은 Welcome이며 연결/프로젝트는 남아야 한다. Cmd+W 복귀는 같은 세션·입력이고 완료 표식이 없어야 한다. 최상위 Escape는 필수 단계를 우회하지 않고, 자식 Escape는 자식만 닫고 호출 버튼에 포커스를 돌려야 한다. 실제 지연 응답으로 disabled를 거친 뒤 포커스와 최신 상태만 반영되는지 확인한다. 측정은 `node .scratch/design-sync/<screen>/measure.mjs`로 남긴다. 새 영구 e2e suite는 만들지 않는다.
- [ ] V1b. 격리된 패키지에서 앱 미실행·PATH/MCP/skill 미등록·프로젝트 미설정 상태의 번들 CLI bootstrap과 등록된 MCP의 동일 main 소비를 확인한다.
  - 검증: `npm --prefix app run package` 후 AGENTS의 임시 HOME/SHELL/userData/인증 저장소와 `DOAN_RUNTIME` 격리로 짧은 probe를 수행한다. CLI 시작 → visible 앱, UI와 status 동일 결과, UI 취소 → poll 반영, CLI 종료 후 main 작업 유지, 앱 종료 정리, 같은 요청 재전송 무중복, ready/프로젝트/완료 저장 성공 후 홈 진입을 확인한다. OAuth 사용자 승인은 시스템 브라우저에서 진행하며 에이전트에게 인증 원문을 주지 않는다. 실제 계정 저장소 보존은 agent-auth의 공급자별 범위로 확인한다.
- [ ] V2. `/code-review` 후 수정 사항과 해당 회고를 반영하고 통합 gate를 실행한다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과. 이번 범위는 CLI/MCP 출력·가이드·도구 metadata를 변경하므로 마지막 통합의 `/agent-eval`이 필수다. 기존 고정 시나리오와 새 온보딩 명령 읽기/사용 검증을 구분해 기록하며, 인증과 clone의 실제 통합 증거를 언어 모델의 추측으로 대체하지 않는다. 미검증을 통과로 기록하지 않는다.
- [ ] V3. PRODUCT §3·§5·§7과 ARCHITECTURE의 온보딩·IPC·저장 계약, DESIGN의 온보딩 측정값을 승격한다. 승인된 Git 작업 예외·CLI/MCP 온보딩의 로컬 socket 권한·schema v2·bootstrap과 사용자 흐름 변경을 날짜·이유와 함께 기록한다. 필요하면 DIRECTORY와 doan skill의 새 명령 매핑도 갱신한다. buzz-home에 프로젝트 선택 인계를 남기고 이 feature 디렉터리를 삭제한다.
  - 검증: 정본·구현·승인 디자인·runtime 근거를 대조한다. 부모 buzz-restyle과 기존 디자인 이력은 보존하고 해당 자식의 완료만 기록한다.

── commit: `docs(onboarding): promote verified first-run flow and measurements` ──


2026-10-28: 사용자가 디자인을 승인했고 HTML 표시 검증을 통과했다. F3 → F1 계약 확정·F2 리뷰 순서로 진행했고 CLI/MCP 범위를 추가 반영하고 네 관점 리뷰와 최종 문서 대조를 마쳤다. 구현 착수는 아직 아니다. 승인된 GitHub clone·필수 연결/프로젝트·최종 디자인을 다시 결정하지 않는다. V3에는 공통 썸네일 색 규칙과 Shell 측정값 갱신도 포함한다.
