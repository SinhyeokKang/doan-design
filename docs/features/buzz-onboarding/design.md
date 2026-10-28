# buzz-onboarding — design

작성: 2026-10-27. 갱신: 2026-10-28. 시각 디자인은 사용자 승인과 HTML 렌더링 검증을 마쳤다. feature-review의 두 제품 결정을 반영하고 동작·복구 계약을 정리했다. agent-auth의 실제 구현 계약 인수 전에는 구현하지 않는다.

## 구성과 의존성

`agent-auth`의 상태 read/event revision, signIn/cancel/signOut, 소유 창·attemptId·종료 정리, 비밀 없는 readiness를 인수한다. agent-auth는 2026-10-28 main에 병합됐고 실제 계약은 [ARCHITECTURE §7 'Agent authentication'](../../ARCHITECTURE.md#agent-authentication-2026-10-28-agent-auth)에 있다. 온보딩이 처리할 항목은 아래 [agent-auth 인계](#agent-auth-인계-2026-10-28)에 모았다. UI가 자체 OAuth listener·토큰 파일·Keychain을 만들지 않는다.

- `app/src/renderer/Onboarding.tsx`, `onboardingView.ts`: Welcome과 두 설정 단계, 상태별 문구·버튼·포커스.
- `app/src/main/index.ts`, `app/src/preload/index.ts`: 첫 실행 수명·완료·프로젝트 선택 인계. 인증은 선행 feature의 채널을 재사용한다.
- `app/src/main/onboarding/machine.ts`: 기존 완료 표식과 외부 설치 기능을 구분한다. Settings의 machine 사용을 보존한다.
- `app/src/main/addProjects.ts`, `shell.ts`, `view.ts`: 기존 프로젝트 등록·canonical root·초기화·목록 재읽기를 재사용한다. URL 조회·clone은 이번 feature의 main I/O 범위이다.
- `ProjectSetupDialog.tsx`, `ConnectionRows.tsx`, `FirstPrompt.tsx`의 다른 화면 소비자는 보존한다. 온보딩 로그인에 외부 MCP 상태를 재사용하지 않는다.

### agent-auth 인계 (2026-10-28)

구현된 agent-auth 계약 중 온보딩이 처리해야 하는 사실만 모았다. 이 목록은 설계를 바꾸지 않는다. 이 문서의 기존 가정과 다른 점은 이어지는 `/feature-review`에서 대조한다. 정본은 [ARCHITECTURE §7 'Agent authentication'](../../ARCHITECTURE.md#agent-authentication-2026-10-28-agent-auth)와 [PRODUCT §3 In scope 7](../../PRODUCT.md#3-scope)이다.

- API: 주 창 `window.doan`과 Settings `window.doanSettings`에 같은 계정 메서드가 있다. `readAgentAuth`, `onAgentAuth`(revision이 더 큰 snapshot만 전달), `checkAgentAuth`, `signInAgent(provider, {stop?})`, `signOutAgent(provider, {stop?})`, `cancelAgentSignIn`, `submitAgentSignInCode`, `openAgentSignInLink`, `onAgentSignInPrompt`이다. 채널은 `agent-auth:read|check|sign-in|cancel|submit-code|open-link|sign-out`, 이벤트는 `agent-auth:changed|prompt`이다. `readAgentAuth`가 `null`이면 인증 저장소를 읽지 못한 상태이고 다른 인증 호출은 모두 거부된다.
- 복구 동작: 다음 행동은 공급자 상태의 `readiness.action`(install·update·retry·wait·signOut·signIn·reauth·repair)으로 정한다. 대화 오류 `not_logged_in`은 원인을 구분하지 않는다. 버튼 후보는 `actions`(signIn·cancel·retry·reauth·signOut)이다.
- ready 판정: `readiness.ready`는 저장된 연결의 확인(verified)·지원 버전·도구 준비를 요구하고, 계정 ID는 요구하지 않는다. Codex·Antigravity는 계정 ID가 없다. 앱을 다시 시작하면 저장된 연결은 첫 실행이나 `check` 전까지 `unverified`(action retry)이며 ready가 아니다.
- Copilot: `check`와 재시작 뒤 Retry가 모델 요청 1회를 쓴다. 자동 확인은 없고, 요청을 끝낸 첫 실행이 연결을 검증한다. 문구에서 이 비용을 알려야 한다.
- 로그아웃 실패: `signOutFailed`가 저장되면 재시작 뒤에도 그 공급자의 실행과 새 로그인이 막힌다(readiness `sign_out_failed` → signOut). 다른 실패와 구분되는 문구가 필요하다.
- 실행 중 대화: 그 공급자의 대화가 실행 중이면 로그인 교체와 로그아웃이 `stop_required`를 돌려준다. 사용자가 중단을 확인하면 `stop: true`로 다시 보낸다. Codex는 턴이 끝난 뒤 대기 중인 app-server도 실행 중으로 센다.
- 동시 진행: 로그인·로그아웃은 모든 공급자를 통틀어 하나만 진행한다. 다른 공급자의 로그인 중에 시작하면 `busy`이다.
- 링크: 로그인 링크는 시도를 시작한 창에만 `prompt` 이벤트로 온다. 링크는 `openAgentSignInLink`로 열고, 실패는 `open_failed`이다. Codex는 링크 2개를 보내며 열기는 마지막 링크를 연다. Cursor·Copilot 로그인 CLI는 OS 기본 브라우저를 스스로도 연다. Antigravity는 브라우저가 로컬 주소에 닿지 못하면 브라우저가 멈춘 주소를 `submitAgentSignInCode`로 붙여넣을 수 있다. Antigravity 첫 로그인은 서버를 내려받느라 링크가 약 20초 뒤에 오고, 내려받기 실패는 `cli_install_failed`이다.
- 창 수명: 시도를 시작한 창이 닫히면 시도가 취소된다. 주 창 닫기는 hide라서 시도가 유지된다. reload 뒤에도 같은 창이 취소와 링크 열기를 할 수 있다.
- Claude: 조직 UUID가 없는 연결은 phase가 connected여도 readiness가 reauth이다. 레포 설정의 API 키 때문에 실행이 거부되면 대화 오류는 `credential_override`이다.
- 미검증: 실제 토큰 만료와 갱신은 관찰하지 못했다.

## 확정된 흐름과 상태 수명

Welcome → Agent → Project → Home이다. 에이전트와 프로젝트가 각각 최소 하나 필요하며 Skip·첫 프롬프트·완료 축하 단계를 추가하지 않는다. 다섯 공급자는 Claude Code, Codex, Cursor, Antigravity, GitHub Copilot 순서이다. 플랫폼별 계정은 하나다.

브라우저 인증 중 상태는 agent-auth가 소유한다. 연결됨과 실행 준비됨을 구분한다. 2026-10-28 사용자 확정: 최소 한 공급자가 agent-auth의 ready일 때만 Agent 진행과 온보딩 완료를 허용한다. 로그인·보안 저장·계정 식별·지원 실행 버전·도구 준비가 필요하며 실제 모델 요청이나 유료 구독은 확인하지 않는다. renderer 읽기와 이벤트는 revision으로 합치며, 화면·프로젝트 선택이 바뀐 뒤 도착한 이전 검사 결과는 폐기한다. 취소는 해당 창이 시작한 인증 시도만 대상으로 한다.

프로젝트 초기화 성공 응답만으로 홈에 보내지 않고 main의 정상 프로젝트 재읽기와 등록 결과를 확인한다. canonical root를 홈의 선택 컨텍스트로 넘기며 대화·Canvas는 자동 생성하지 않는다. 홈 UI는 buzz-home 담당이다. 중간 종료는 완료로 기록하지 않는다.

## 승인된 GitHub URL 범위

2026-10-27 사용자는 기존 로컬 리포 재사용과, 없을 때 기존 Git/gh 인증을 이용한 clone을 승인했다. 별도 GitHub OAuth·토큰 보관·저장소 목록은 만들지 않는다.

URL 정규화와 실제 폴더 identity를 분리한다. GitHub HTTPS/SSH 표기가 같은 owner/repo를 가리키는지 순수 함수로 판정하고 remote 조회·접근 확인은 main에서 한다. credential 포함 URL·비허용 host·지원하지 않는 문법은 오류다. 허용 문법과 실행 경계는 아래 GitHub 실행 계약을 따른다.

검색 범위는 등록 프로젝트와 사용자가 직접 고른 폴더이다. 전체 HOME 검색·이름만으로 경로 추정·remote 변경·자동 pull은 하지 않는다. 여러 checkout/worktree는 경로를 보여 주고 하나를 고르게 한다. URL 경로에서 기존 폴더를 사용할 때 접근 가능 여부와 remote 일치를 재확인한다. 직접 로컬 폴더를 선택한 경로에는 GitHub remote를 요구하지 않는다.

접근 실패는 URL을 유지한다. `gh auth login`으로 계정·권한을 확인하도록 안내하되 만료·저장소 부재를 단정하지 않는다. Choose local folder는 왼쪽, Retry는 오른쪽에 둔다.

## 재실행과 완료 — 2026-10-28 사용자 확정

미완료 상태로 앱을 종료한 뒤 재실행하면 Welcome부터 시작한다. 저장된 연결과 등록 프로젝트는 삭제하지 않는다. Agent에서는 인증/readiness를 재조회하고 Project에서는 저장된 등록 목록을 다시 보여 주고 선택받는다. 중간 선택 root를 별도 저장하지 않으며 선택 뒤 접근·설정·등록 상태를 다시 확인한다. 저장되지 않은 URL 입력이나 진행 중 프로세스를 복원하는 기능은 만들지 않는다.

기존 `{}`는 단순 닫힘 표식이므로 새 완료 증거로 사용하지 않는다. 새 앱 로컬 완료 기록은 `{v: 1, completed: true, projectRoot: <canonical root>}`로 한다. 중간 scene·URL·토큰은 저장하지 않는다. 기존 객체·손상·미지 버전은 완료로 인정하지 않으며, 알려진 기존 표식만 새 완료 성공 시 교체한다. 손상된 파일은 완료 요청에서 원본을 별도 백업으로 보존한 뒤 새 기록을 쓴다. 백업 실패 시 원본을 유지하고 저장 실패로 반환한다. 미지 버전은 덮어쓰지 않고 호환되는 앱으로 열라는 안내를 반환한다. 동일한 실패에 Retry만 반복시키지 않는다. 완료 저장용 임시 파일과 rename은 기존 machine의 방식을 재사용한다.

완료 요청은 main에서 현재 ready와 선택 root를 재확인한다. 정상 프로젝트 재읽기 → 중복 없는 등록 → 완료 기록 저장 → 홈 선택 인계 순서이다. 기록 저장 실패는 Project에 남고 정상 등록된 프로젝트를 유지한다. Retry는 현재 상태를 재확인한 뒤 미완료 저장·인계만 이어간다. 이미 성공한 clone·초기화·등록을 다시 수행하지 않는다. 원자적 완료 기록 교체가 완료 시점이다. 그 직전에도 취소 여부와 ready/root를 재확인한다. 그 전에 종료가 접수되면 완료 기록을 쓰지 않으며, 그 뒤 홈 인계 전에 종료되면 이미 완료됐으므로 다음 실행은 홈이다. 성공한 새 완료 기록으로 다음 실행에서는 온보딩을 반복하지 않는다. 이후 인증 만료는 일반 연결 상태로 처리한다.

## 이동·취소·포커스 계약

| 동작 | 결과 |
|---|---|
| Back·완료 단계 스테퍼 | 이전 단계로 이동하며 저장된 연결과 프로젝트 선택을 유지한다. 소유 인증 시도가 있으면 agent-auth 취소 응답과 최신 상태를 반영한다. UI가 저장된 연결을 임의로 로그아웃하지 않는다. |
| 인증 대기·저장 중 Cancel | 소유 attempt의 cancel만 호출한다. 이미 저장된 성공과 취소가 경합하면 backend의 최신 상태를 표시한다. 늦은 성공을 UI가 독자적으로 연결로 승격하지 않는다. |
| 실행 준비 중 Back | 이전 단계로 이동하고 저장된 인증을 유지한다. 준비 작업의 수명과 정리는 agent-auth 소유 계약을 따른다. 복귀 때 상태를 다시 읽는다. |
| clone 중 Cancel | 소유 프로세스 그룹 종료와 정리를 기다린다. 정리 중 새 clone·위치 변경을 막고, 정리 완료 뒤 재시도를 허용한다. |
| 초기화·완료 저장 중 | 중복 제출·Back을 막는다. 결과 이후 포커스를 유효한 복구/이동 액션으로 옮긴다. |
| 자식 폴더 대화상자 Escape | 자식만 닫고 호출 버튼으로 포커스를 돌린다. |
| 최상위 Escape | 미완료 온보딩을 닫거나 홈으로 보내지 않는다. |
| Cmd+W·신호등 닫기 | 기존 AppShell대로 창을 숨기고 같은 세션·입력을 유지한다. 완료 기록을 쓰지 않는다. 실제 창 파괴와 구분한다. |
| Cmd+Q·실제 창 종료 | 소유 인증/clone 작업을 취소·정리한다. 중간 종료는 완료로 저장하지 않는다. 재실행은 Welcome이다. |

단계 전환은 제목으로 포커스를 옮긴 뒤 Tab으로 컨트롤에 진입하게 한다. 현재 포커스 버튼이 비활성화/제거되면 해당 상태의 안내 또는 첫 사용 가능한 복구 버튼으로 옮긴다. 오류는 role=alert, 로딩은 role=status로 한 번 알리고 스피너는 aria-hidden이다. 폴더 선택 취소와 자식 오류는 호출 위치로 복귀한다.

외부 브라우저·설치 페이지·터미널에서 앱으로 복귀하면 연결과 readiness를 다시 읽는다. 입력·선택은 유지한다. 복귀 자체가 clone이나 GitHub 조회를 자동 실행하지는 않는다. 저장소 접근은 Retry, 인증은 최신 backend 이벤트/조회 결과로 갱신하며 모든 읽기에는 revision·선택 세대를 적용한다.

## GitHub 조회·clone 실행 계약

GitHub.com의 owner/repository 루트 URL을 받는다: `https://github.com/owner/repository[.git]`, `git@github.com:owner/repository[.git]`, `ssh://git@github.com/owner/repository[.git]`. 마지막 slash는 허용한다. 임의 host·port·credential·query·fragment·추가 경로와 옵션처럼 해석될 문자열은 거부한다. 입력을 셸 문자열로 조합하지 않고 검증한 인수 배열로 실행한다.

등록 프로젝트의 remote들을 읽어 같은 GitHub identity인지 확인하며, canonical root 기준으로 후보를 중복 제거한다. remote 일치가 여러 개여도 하나의 폴더 후보이다. 여러 checkout은 사용자 선택을 받는다. git remote 조회 실패를 불일치로 단정하지 않는다. 사용자가 직접 고른 폴더의 동일성·접근은 실행 직전 다시 확인한다.

Git의 기존 credential helper·SSH 설정을 이용하고 Git/gh 토큰을 직접 읽거나 저장하지 않는다. gh가 구성한 Git credential helper도 기존 인증으로 사용한다. 신규 GitHub OAuth·gh 로그인 실행·Copilot 토큰 재사용은 하지 않는다. 실행 중 터미널/askpass 입력을 기다리지 않도록 비대화식으로 호출한다. SSH는 BatchMode이며 호스트 키 검사를 끄지 않는다. 인증·권한·네트워크 등의 stderr 원문에서 비밀을 노출하지 않고 접근 실패 안내로 반환한다.

조회 성공은 clone 성공을 보장하지 않는다. 실제 clone 시 인증과 목적지를 다시 검사한다. 사용자가 정한 부모 디렉터리 아래에 이 작업만 소유하는 임시 디렉터리를 배타적으로 만들고 그 안에서 clone한다. 최종 목적지가 이미 있거나 경쟁 생성되면 덮어쓰지 않고 충돌로 반환한다. 기존 폴더 사용은 별도 재사용 경로로 보내 접근·remote를 확인한다.

작업 ID·소유 창·입력 세대·소유 프로세스 그룹·임시 경로를 main에서 관리한다. 취소 뒤 프로세스와 후손 종료가 확인되기 전에는 새 작업을 받지 않는다. 정리는 이번 작업이 배타적으로 만든 임시 경로만 대상으로 하며 원래 있던 폴더를 삭제하지 않는다. 정리 실패는 실패 경로와 다시 시도할 안내를 남기고 성공으로 숨기지 않는다. 앱 재시작 뒤 소유권을 증명할 수 없는 잔존 폴더는 자동 삭제하지 않고 충돌로 다룬다. 이름만 같다는 이유로 삭제하거나 이어받지 않는다.

## 로컬 선택·초기화 연결

기존 `onboarding:open-project`의 stored/choose/confirm/refused/cancelled와 단일 선택 후보 흐름을 재사용한다. 상위 폴더에서 여러 Git 리포를 발견하면 하나를 고르게 하며 부모를 자동 등록하지 않는다. 비리포 폴더는 기존 확인·초기화 경로를 따른다. 취소는 이전 선택을 보존하고 새 선택을 확정하지 않는다.

기존 초기화의 canonical root·상위 프로젝트 재확인·설정 손상 거부를 유지한다. Token CSS 선택을 온보딩에 추가하지 않고 기존 프로젝트 설정에 남긴다. 성공 응답 후 정상 재읽기와 등록까지 확인한다. 실패 재시도는 이미 존재하는 정상 설정을 재사용하고 다른 파일을 덮어쓰지 않는다.

## 포맷과 순수 함수

공유 canvas/comment/config/runtime/sessions 포맷은 유지한다. 사용자 승인으로 온보딩 CLI/MCP 명령과 app-socket v2 요청/응답을 추가하며 기존 active의 v1 계약은 유지한다. 장치 로컬 완료 포맷은 위 계약대로 TS fixture와 읽기·원자적 쓰기·손상·이행 실패 계약을 먼저 작성한다. 신규 socket v2와 CLI/MCP 계약은 아래 공유 schema·TS/Go fixture를 먼저 작성한다.

순수 함수 대상은 scene 전이·진행 가능 여부, revision 합치기, 프로젝트 선택 세대, URL/remote identity, canonical root 중복·후보 판정, 비밀 없는 상태 문구·버튼·aria 상태, 기존 완료 표식 이행이다. 인증 비밀은 agent-auth에 남는다. 기존 프로젝트 설정 손상은 덮어쓰지 않는다.

완료 때 PRODUCT의 Git 작업 제외와 ARCHITECTURE에 온보딩 clone만 예외로 승격한다. 토큰 CSS·serve·iframe sandbox·append-only 이벤트 규칙은 유지한다.

## 승인된 디자인 기준 — 2026-10-28

이 절과 `.doan/canvases/buzz-onboarding.html`이 현재 시각 기준이다. 시도했다가 철회한 translucent 버튼/입력창, 본문 전체 panel 래핑, 이전 문구·타원·패딩 값은 구현하지 않는다. 사용자는 디자인 확인 → HTML 검증 → feature-review 순서를 지정했고, 2026-10-28 현재 디자인을 승인했다.

- 캔버스는 저장소 루트 `.doan/canvases/buzz-onboarding.html`, id `buzz-onboarding`, 너비 2560px이다. 기존 `.doan/canvases/onboard.html`은 수정하지 않는다.
- 프레임: `welcome`, `agents`, `agents-connected`, `project`, `project-local`, `repository-found`, `repository-clone`, `repository-error`, `auth-states`, `project-states`. 기본 창은 1238×780, 상태 표는 1238×900이다. 상태 표에는 33개 labelled tile이 있다. 홈은 그리지 않는다.
- `tokens.css`, `ds/index.css`, 기존 `app/src/renderer/public/fonts/geist/Geist.woff2` 원본을 직접 사용한다. 사용자 승인 serving 범위로 원본 DS와 폰트를 참조하며 사본을 만들지 않는다.
- 기존 `doan-button`, `doan-input`, `doan-panel`, `doan-notice`, `doan-alert-icon`, `doan-spinner`, `doan-scroll`을 재사용한다. 새 시각 옵션은 기존 프리미티브에 반영한다.
- Welcome: doan 워드마크 아래 “A place for your next idea.” / “Bring it to life on canvas.”를 한 블록 안에서 줄바꿈한다. 가운데 정렬, 24px·행간 1.1·400·자간 -0.3px이다. 워드마크와 문장 간격 24px, 문장과 버튼 간격 40px이다.
- Get started는 콘텐츠 너비의 prominent 버튼이다. 승인된 새 `lg` 옵션은 높이 48px, 폰트 16px/24px, 패딩 12px/32px이다. 기존 기본 40px·sm 32px은 유지한다. 현재 lg는 초안에만 있으며 구현 시 공용 controls에 추가한다.
- 그라디언트는 Welcome에만 있다. accent 기반 radial-gradient는 ellipse 50% 125% at 50% 112%, 전체 opacity .85이다. `onboarding-grain.svg` alpha mask로 투명도를 분산하며 검정 입자를 색상으로 얹지 않는다. 애니메이션은 없다(2026-10-28 사용자: 마스크째 움직이는 모션 제거).
- 나머지 화면은 `buzz-shell.html`과 같은 wallpaper fixture와 surface-panel 55%·blur(32px) saturate(.8) 재질로 표현한다. 외곽 여백은 없다. 앱 구현은 기존 native vibrancy="sidebar"를 재사용한다. HTML은 시각 근사이며 native 재질 측정값이 아니다. reduced-transparency에서는 불투명 배경이다.
- 크롬은 56px이다. AppShell 형태의 캡슐을 Agent·Project 스테퍼로 재사용한다. 현재 단계는 흰 pill·aria-current, 완료 단계는 체크·돌아가기, 진행 불가는 disabled이다. Welcome에는 스테퍼가 없다.
- 모든 화면 타이틀과 캡션은 가운데 정렬한다. 행·폼은 왼쪽 정렬이다. 버튼·입력창은 기존 불투명 subtle/surface-inset을 유지한다. Back은 arrow-left, 다음 이동은 arrow-right를 쓴다. 제출 액션은 오른쪽에 배치한다.
- Sign in은 prominent이다. 연결되면 같은 버튼을 disabled로 유지하고 이름 아래 `Connected · 계정 식별자`를 전체 표시한다. 긴 계정은 줄바꿈하며 별도 Connected 배지는 없다. 초안 계정은 예시다.
- 공급자 로고는 로컬 자산이며 출처는 `.doan/assets/provider-logos/README.md`에 있다. Codex는 OpenAI 공식 조직 마크를 쓴다.
- 프로젝트·공급자 카드: 제목 14px/20px·500, 설명 12px/20px·text-metadata, 제목/설명 간격 2px, 콘텐츠 gap 12px, 패딩 16px, 최소 높이 72px이다. 썸네일은 32px 슬롯 안 28px이다.
- 프로젝트 썸네일은 ShellSidebar의 projectHue 이름 해시·8색·첫 Unicode 글자 대문자 규칙을 쓴다. 배경은 identity 색 14%와 surface-panel, 글자는 identity 색 65%와 text-standard를 혼합한다. 글자 17px·600, 모서리 7px이다. 이 색 규칙은 구현 시 사이드 네비에도 공통 적용한다.
- 오류·설치 필요·재인증 안내는 동일한 `doan-notice error doan-panel`이다. 흰 surface-panel·shadow-panel·text-standard, 아이콘은 텍스트 색 상속, 패딩 상하 12px·좌우 16px이다. 제목/본문 간격은 4px이다.
- 로딩 9개 상태도 같은 notice/panel 재질·패딩을 쓰고 아이콘 자리에 기존 spinner를 배치한다. `role="status"`이며 오류는 `role="alert"`이다. 아이콘은 공용 alert-icon의 첫 줄 정렬을 따른다.
- 문구 끝에 말줄임표를 붙이지 않는다. 폴더 선택·로딩·버튼도 동일하다.

## 상태 인계

인증 상태 표: 브라우저 대기, 중단, 미설치, 재인증, 긴 계정, 상태 읽기 실패, 상태 확인 중, 저장 중/실패, 미지원 버전, 다른 로그인 진행 중, 브라우저 열기 실패, 실행 준비 중/실패.

프로젝트 상태 표: 여러 checkout, clone 중, 초기 설정, remote 불일치, 폴더 사라짐, 목적지 충돌, URL 오류, 설정 실패, URL 조회 중/수정, clone 실패/취소/정리, 프로젝트 준비 중, 완료 저장 중/실패, 에이전트 만료, 설정 읽기 실패, Git 미설치.

새 URL은 이전 조회 결과를 무효화한다. 기존 리포 발견·clone 화면에는 URL 수정 액션이 있다. 목적지 충돌에는 위치 변경과 기존 폴더 사용을 표시한다. 각 액션의 비동기 처리는 위 이동·취소·완료 계약을 따른다. 정적 HTML 버튼을 실제 인증/파일 작업의 동작 증거로 사용하지 않는다.

## HTML 검증 근거 — 2026-10-28

격리된 doan Electron의 실제 캔버스 iframe에서 10개 프레임·33개 tile·28개 notice·9개 spinner를 측정했다. 가로 넘침과 중복 data-doan-id가 없었고 모든 로고와 Geist가 로드됐다. notice 패딩은 12px/16px, Welcome CTA 높이는 48px였다. 일반 8개 프레임은 세로 스크롤 없이 맞았고 두 상태 표는 마지막 tile까지 스크롤할 수 있었다.

같은 도안 서버 URL을 별도 검증 창에서도 열어 Welcome·연결됨·리포 접근 오류·두 상태 표의 스크린샷을 확인했다. 기본 캔버스의 확대/축소 변환 때문에 잘못 잘린 첫 캡처는 근거로 쓰지 않았다. 검증 창·임시 HOME·userData를 정리하고 실제 사용자 설정의 보존을 확인했다.

근거: `.scratch/buzz-onboarding/verify-render.mjs`, `render-report.json`, `scroll-report.json`, `render.log`, PNG 파일. 임시 근거는 커밋하지 않는다. `doan check`의 이 캔버스 finding은 0개이며 저장소의 기존 `.doan/assets/mock.css` 색상 경고 12개는 별개다. 열린 캔버스 코멘트는 없다.

이 결과는 HTML 표시 검증이다. 실제 OAuth·clone·취소·완료 저장·키보드 수명과 native vibrancy는 구현 후 V1에서 확인한다.

## 레퍼런스 확인

부모 [디자인 문서](../buzz-restyle/design.md)의 기준은 `block/buzz-app` 커밋 `c40dfdf4c81aabe759f3a4329c3e77f854746a59`이다. 확인 대상은 `src/features/identity/OnboardingScreen.tsx`, `IdentitySetup.module.css` 및 디자인 시스템 문서이다. 지정된 로컬 clone이 없어 2026-10-27 사용자 지시로 `/Users/sinhyeok/code/buzz-app`에 clone했다. clone HEAD는 `ec1b9acc5ff99fac3bcea106935fb0224bb7b51e`이며 checkout을 바꾸지 않고 기준 커밋의 두 파일을 `git show`로 읽었다. 설치·빌드·실행은 하지 않았다.

확인한 원본 구조: 전체 창 landing → 3.5rem titlebar → 최대 40rem content → 가운데 brand와 최대 27.5rem actions. setup은 최대 32rem이다. 이는 소스 CSS 값이며 실측 결과가 아니다. 도안에서는 기존 모달·포커스 계약에 이 표면을 적용하고 신호등 자리를 보존한다. 워드마크·배경의 최종 선택은 사용자 확인 후 기록한다.

## 회고와 예방

[POSTMORTEM](../../POSTMORTEM.md)의 관련 원문:

- **An older install failure replaced newer feedback** (2026-10-25): “bind feedback to the latest operation as well as the live component”. 인증·URL 검사·설치 안내의 역순 응답을 검사한다.
- **The setup menu discarded an open wizard session** (2026-10-24): “verify visibility changes separately from session creation.” Cmd+W 뒤 복귀가 새 세션을 만들지 않게 한다.
- **The onboarding wizard lost keys and clicks to focus and modal stacking** (2026-10-24): “do not assume focus stays inside after a control disables itself”. 중첩 폴더 선택·오류·비활성 버튼 뒤 키보드 복구를 실제 앱에서 확인한다.
- **Init published success before merge setup could fail** (2026-10-25): “stage the complete config, finish attributes, then publish”. 설정 응답과 정상 목록 반영을 모두 확인한 뒤 완료로 표시한다.
- **Setup writes to missing targets could overwrite a competitor** (2026-10-24): “create missing targets exclusively and keep rename only for confirmed replacements”. 신규 경로 생성의 경쟁과 외부 파일 보존을 검증한다.


## CLI·MCP 온보딩 — 2026-10-28 추가 승인

이 절은 기존 화면 전용 계획을 확장한다. 앱은 그대로 Welcome·Agent·Project·Home을 표시한다. CLI/MCP도 같은 main 온보딩 서비스를 호출하며 OAuth·Git·완료 저장을 Go나 MCP 서버에 재구현하지 않는다. 기존 renderer main-window/Settings sender 제한은 풀지 않고 인증된 socket 어댑터를 별도로 연결한다.

### 설치 직후 진입

가이드에는 설치 위치에 맞는 `<Doan.app>/Contents/Resources/bin/doan onboarding start --json`과 같은 번들 CLI 진입을 안내한다. 예시는 경로에 공백이 있으면 전체 executable 경로를 따옴표로 감싼다. PATH 등록·MCP 등록·skill 설치·프로젝트 설정은 필요 없다. CLI help/skill도 프로젝트 없이 읽을 수 있다. MCP가 이미 등록돼 있다면 onboarding_start부터 동일하게 사용한다. 외부 에이전트 설정을 자동 변경하는 새 단계는 추가하지 않는다.

start는 먼저 지정 runtime을 확인한다. 앱이 실행 중이면 숨겨진 기존 창도 표시하고 같은 온보딩 세션을 반환한다. 입력을 초기화하지 않는다. 명시적 DOAN_RUNTIME이 없고 앱이 꺼져 있을 때만 CLI 실제 경로에서 검증한 소속 .app을 한 번 visible launch하고 최대 15초 동안 runtime 준비를 확인한다. 이 15초는 bootstrap 제한이며 OAuth/clone 시간 제한이 아니다. 독립/개발 CLI는 다른 설치본을 검색하지 않고 앱 실행 안내를 반환한다. 명시적 DOAN_RUNTIME의 누락·손상·접속 실패, 권한 거부·프로토콜 불일치를 기본 앱 실행으로 우회하지 않는다. 기존 active는 자동 실행하지 않는다.

### 고정 명령·도구

다음은 구현 예정 인터페이스이며 현재 CLI에 존재하지 않는다. 모든 명령은 --json으로 기존 공개 envelope `{v:1,ok,result|error}`를 사용한다. transport의 v2와 공개 envelope의 v1은 별개다. repo 자동 탐색을 하지 않고 필요한 경로는 명시적 절대 경로로 받는다.

| CLI | MCP | 의미 |
|---|---|---|
| `doan onboarding start` | `onboarding_start` | 앱/온보딩 세션 확보. 기존 세션을 재사용하고 sessionId·현재 revision·상태 반환 |
| `doan onboarding status --session <id> [--operation <id>]` | `onboarding_status` | 연결/readiness·프로젝트·진행 작업·완료/실패 조회. OAuth·clone 완료를 기다리지 않음 |
| `doan onboarding sign-in --session <id> --provider <id> --request <id>` | `onboarding_sign_in` | 지원 5개 공급자 중 하나의 로그인 요청. main이 시스템 브라우저를 열고 operationId 반환 |
| `doan onboarding cancel --session <id> --operation <id> --request <id>` | `onboarding_cancel` | 지정된 현재 세션 작업만 취소. 계정 로그아웃이나 모든 프로세스 종료가 아님 |
| `doan onboarding project inspect --session <id> (--path <absolute>|--url <github-url> [--destination <absolute>]) --request <id>` | `onboarding_project_inspect` | 경로·리포 검사, 후보·필요 초기화 변경 계획·검사 ID 반환. GitHub 조회는 operation으로 진행 |
| `doan onboarding project select --session <id> --inspection <id> --path <absolute> [--initialize] --request <id>` | `onboarding_project_select` | 최신 검사 후보를 선택. 초기화가 필요한 경우 --initialize로 계획된 설정 생성을 명시하며 기본값으로 파일을 만들지 않음 |
| `doan onboarding project clone --session <id> --inspection <id> --destination <absolute> --request <id>` | `onboarding_project_clone` | 목적지까지 검사한 inspection의 리포를 해당 위치에 clone. 목적지/초기화 계획을 확인하고 명시적으로 요청함 |
| `doan onboarding complete --session <id> --request <id>` | `onboarding_complete` | 현재 ready·선택 root·정상 재읽기·등록·완료 저장 검증 후 홈 인계 |

작업이 필요한 응답은 accepted와 operationId를 반환한다. 상태는 pending/running/awaiting_user/succeeded/failed/cancelled로 구분하고, 사용자 브라우저 승인이 필요하다는 사실만 알린다. callback 인증 코드·OAuth 원문·소켓 토큰·credential 경로·stderr 원문은 반환하지 않는다. 브라우저 다시 열기는 앱의 승인된 인증 UI를 사용한다. 계정 표시 이름과 프로젝트 경로는 기능에 필요한 비밀 없는 DTO로만 반환한다.

CLI가 native folder picker를 기다리지는 않는다. inspect에서 미설정 폴더의 `.doan/config.json`·`.doan/canvases/`·`.gitattributes` 변경 계획을 반환하고 select --initialize 또는 clone 요청으로 사용자의 setup 의도를 명시한다. 검사 후 root/URL/목적지가 바뀌면 stale로 거부해 재검사한다. clone 후 초기화도 같은 main 경로로 처리하며 임의 tokenCss·serve·실행 파일·config 경로를 인수로 받지 않는다.

### 동일 상태·소유권·재시도

main 온보딩 세션이 작업을 소유한다. CLI 프로세스 종료·MCP 연결 해제·status 소켓 종료는 작업 취소가 아니다. UI와 인증된 로컬 CLI/MCP는 같은 사용자의 같은 온보딩 세션을 조작할 수 있고, 지정 operationId를 통해 해당 세션 작업을 취소할 수 있다. 서로 다른 세션의 취소는 거부한다. agent-auth의 기존 소유 창/attempt 검사를 우회하지 않고 main 세션 어댑터가 동일 소유 창의 인증 요청으로 위임한다. 이 인터페이스로 Settings나 다른 대화 소유 작업을 취소하지 않는다.

로그인 쓰기와 프로젝트 변경은 기존 잠금·generation을 공유한다. UI 변경도 revision을 올려 오래된 CLI 검사 결과를 무효화한다. 요청별 requestId는 현재 session에서 중복 제거한다. 같은 ID·같은 인수 재전송은 원래 operation/결과를 반환하고, 같은 ID·다른 인수는 거부한다. 클라이언트는 응답 유실을 새 ID로 맹목 재실행하지 않고 같은 ID로 재조회한다. 앱 재시작은 새 sessionId이며 예전 operation은 stale/not-found이다. 영구 작업 큐나 clone 자동 재개는 만들지 않는다.

앱 종료는 기존처럼 소유 인증·clone을 정리한다. 완료 이후 상태 조회는 완료를 반환하며 start가 완료된 사용자를 자동 재온보딩시키지 않는다. 미완료 재시작은 사용자 결정대로 Welcome이다. agent는 start/status로 상태를 읽고 준비된 단계를 명시적으로 진행할 수 있다.

### socket과 공유 schema

현 `app/src/main/runtime.ts`와 `cli/internal/cli/active.go`는 active 전용 root 필수·연결당 요청 하나·2초·64KiB 계약이다. 기존 v1 active는 그대로 둔다. 신규 onboarding은 별도 `schema/app-socket.v2.schema.json`의 v2 operation 분기로 정의한다. status/sign-in은 프로젝트가 없어도 실행되며 기존 active의 열린 root 검사를 삭제하지 않는다.

runtime.v1의 socket/token 구조·0600 파일·0700 socket 디렉터리·인증 선행은 유지한다. v2는 고정 operation별 입력/응답·오류 DTO를 정의하고 unknown field/version/operation을 거부한다. start는 sessionId/requestId 없이 호출하고, status는 sessionId만 필수이며 나머지 쓰기·검사 요청은 sessionId와 requestId를 요구한다. 토큰 인증 전에 계정/경로/작업 상태를 반환하지 않는다. v2 요청에 구 앱이 v1 bad_request를 반환하면 신규 CLI가 app_protocol_mismatch로 분류하며 v1 active/파일 명령은 유지한다.

OAuth·clone·Git 조회는 main 작업으로 시작하고 빠르게 ID를 돌려준다. 소켓 응답 안에서 작업 종료를 기다리지 않고 기존 짧은 제한을 유지한다. 허용 operation만 서비스에 연결하며 임의 IPC·셸 명령은 허용하지 않는다.

구현 경로: 기존 `cli/internal/cli/{run,mcp,active}.go`의 파싱/전송·가이드, `app/src/main/runtime.ts`, main 온보딩 서비스, preload 상태 구독, `app/src/formats/{types,validate}.ts`, `cli/internal/formats/`의 검증. 새 schema와 `schema/fixtures/app-socket-v2/{valid,invalid}/`는 계획된 신규 파일이다. TS/Go가 동일 fixture를 검증해야 한다. 오류는 인증 실패·busy·stale·cancelled·프로토콜 불일치·앱 실행 실패·프로젝트/완료 저장 실패를 구분하고 CLI 종료 코드와 MCP isError의 매핑을 명세/fixture로 고정한다.
