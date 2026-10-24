# app-setup — 설정 창, 온보딩 보완, 첫 프롬프트

> UX 감사(2026-10-24, main `9afc487`) 재설계 세 기능 중 세 번째다. `projects-home`이 만든 홈 위에 연결 상태와 남은 설정 표시를 올리므로, `projects-home`이 main에 들어간 뒤 구현한다. `design-nav`와는 캔버스가 0개인 작업공간의 중앙만 겹친다. 둘 중 나중에 main에 들어가는 쪽이 그 통합을 맡는다.

## 사용자

- **사람**: 설정 창, 온보딩, 첫 프롬프트가 바뀐다.
- **에이전트**:
  - 설치 메뉴 이름이 바뀐다. 그래서 `app_not_running.nextSteps`와 가이드에서 "Set Up doan…" 메뉴를 가리키는 문장을 Settings로 고친다.
  - CLI 명령 `doan config`와 같은 기능의 MCP 도구 `config`가 새로 생긴다(Q2).
    - 읽기(옵션 없음)는 현재 `tokenCss`·`serve`를 돌려준다.
    - 쓰기는 `--token-css <path>`, `--clear-token-css`, `--add-serve <path>`, `--remove-serve <path>`다.
  - 가이드에는 `init`처럼 "사람이 요청했을 때만 쓴다"는 항목을 더한다.

## 문제 (관찰한 사실)

- **O1. 가치를 보기 전에 기계 설정부터 요구한다.** 첫 실행은 앱을 덮는 4단계 마법사다. 1·2단계가 CLI 링크, PATH, `~/.zshrc`, MCP, user scope, `CLAUDE_CONFIG_DIR`, Skill link다(a-first-run/01~04). 결과보다 수단을 먼저 읽게 된다.
- **O2. 막힌 상태에서 갈 길이 없다.**
  - 에이전트가 하나도 없으면 "Not installed" 두 줄뿐이다. 설치 안내가 없고, Continue는 그대로 눌린다(e-onboard-skip/01).
  - 프로젝트 없이 4단계에 오면 "Open a project first."로 끝나고 버튼이 없다(e-onboard-skip/02).
- **O3. 마법사를 닫으면 남은 설정이 사라진다.** 어떻게 닫든 다시 열리지 않는다. 건너뛰고 닫은 사용자의 빈 앱에는 연결이 안 됐다는 표시가 없다(e-onboard-skip/03).
- **O4. 첫 프롬프트를 앱에서 완성할 수 없다.**
  - `<what you want to design>` 자리표시자가 든 고정 문장을 복사해서 에이전트 창에서 고쳐야 한다(a-first-run/09).
  - 보낸 뒤에는 기다린다는 표시가 없고, 캔버스가 도착해도 알리거나 열어주지 않는다(a-first-run/11·13).
- **S1. 설정 화면이 없다.** 설치 상태를 보거나 바꾸는 길은 앱 메뉴 "Set Up doan…" 하나이고, 누르면 첫 실행 마법사가 1단계부터 열린다(c-projects/13). 메인 창 어디에도 연결 상태가 없다.
- **S2. 설치가 깨져도 알리지 않고, 마법사는 원인을 잘못 짚는다.**
  - CLI 링크가 끊어져도 메인 창은 정상처럼 보인다(c-projects/12).
  - 마법사는 끊어진 링크를 "Needs replacement / Points to another copy"로 표시한다(c-projects/13).
- **S3. 프로젝트 설정은 처음 한 번만 고를 수 있다.** 이미 설정된 프로젝트의 token CSS를 보거나 바꾸는 UI가 없다. `serve`는 앱 어디에도 없다.

## 사용자와 합의한 결정

### 감사 Q&A (2026-10-24)

5. **설정**
   - Settings(⌘,)에 결과 중심의 Connections를 둔다.
   - 홈에 연결 상태를 작게 표시하고, 깨지면 배너를 띄운다.
   - 프로젝트 설정은 Project settings에 둔다.
   - 마법사는 첫 실행에만 쓴다.
6. **온보딩**
   - 4단계 마법사는 유지한다.
   - 문구를 결과 중심으로 바꾸고, 막힌 곳에 버튼을 둔다.
   - 마법사를 닫은 뒤 남은 설정은 홈에 보인다.
11. **첫 프롬프트**: 마법사 4단계와 빈 작업공간이 같은 컴포넌트를 쓴다.
    - 입력란에 적으면 문장이 완성된다.
    - Copy 뒤에는 기다리는 중임을 보이고, 첫 캔버스가 생기면 자동으로 연다.
    - 입력은 앱 밖으로 보내지 않는다.

### `/feature` 확인 질문 (2026-10-24)

- **Q1**: Settings는 별도 창이다(macOS 관례).
- **Q2**: token CSS 변경은 새 CLI 명령을 앱이 부르고, 그 명령을 MCP 도구와 가이드에도 노출한다.

### `/feature-review` (2026-10-25)

- **R4**: Settings 창은 별도 진입점 `settings.html`과 전용 preload를 쓴다. 빌드 설정 변경을 받아들인다.
- **R5**: serve도 Project settings에서 추가·삭제할 수 있다. 추가할 때 확인을 거친다.
- 나머지는 일괄 승인했고, 아래 완료 조건에 반영했다.

## 완료 조건

### Settings 창

- 앱 메뉴의 Settings…(⌘,)로 연다. 이미 열려 있으면 앞으로 가져온다. 마법사가 열려 있는 동안 이 메뉴 항목은 비활성이다.
- 창 제목은 현재 탭 이름(Connections / Projects)이다. 마지막 탭을 기억한다. 최소화·확대 버튼은 없다.
- 이 창을 닫아도(⌘W) 메인 창과 앱 상태는 그대로다. ⌘Q는 두 창을 함께 닫는다.

### Connections

- doan 명령·Claude Code·Codex를 한 줄씩 보인다. 상태는 아래 다섯 가지 중 하나다.
  - `Connected`
  - `Needs attention` — 아래 경우가 여기에 든다.
    - 끊어진 링크
    - 다른 대상을 가리키는 링크
    - 막힌 경로
    - 다른 명령의 MCP 등록
    - 다른 내용의 스킬
    - Applications 밖에서 실행됨(translocated → "Move doan to Applications")
  - `Not connected`
  - `Not installed`
  - `Couldn't check`(이유와 Check Again)
- 줄마다 필요한 동작만 있다: Fix·Connect·Install 링크·Check Again. 경로와 설정 파일 위치는 줄을 펼쳐야 보인다.
- 끊어진 CLI 링크(대상이 없음)는 "Link is broken"으로 진단한다. "Points to another copy"는 대상이 존재하는 다른 doan일 때만 쓴다.
- Fix는 확인 대화상자를 거쳐 링크를 이 앱의 CLI로 다시 만든다. 쓰기 규칙은 지금과 같다(만든 적 없는 것은 확인 없이 덮어쓰지 않음, 쓰기 직전 재확인).
- 설정 동작은 한 번에 하나만 돈다. 메인 창의 마법사와 Settings 창이 같은 동작을 동시에 돌리지 않는다.

### 홈 표시

- 홈 상단에 연결 요약 칩 세 개가 있다. 접근 이름은 텍스트다(예: "Claude Code: Connected"). 첫 읽기 전에는 "Checking…"이다. 칩을 누르면 Settings 창의 Connections 탭이 열린다.
- `Needs attention`인 줄이 있으면 홈 위쪽에 배너가 뜬다.
  - 문구는 결과를 먼저 말한다. 예: "The doan command link is broken, so agents can't reach doan."
  - 버튼은 Fix…(Settings의 해당 줄을 펼쳐 엶)와 Check Again이다.
- "Finish setting up doan" 카드가 보이는 조건: 마법사를 닫았고(`onboarding.json` 있음), 아래 중 하나가 남았을 때다. 모두 끝나면 사라진다.

  | 남은 항목 | 버튼 |
  |---|---|
  | doan 명령이 Not connected | Settings › Connections |
  | Connected 에이전트가 없고 Not connected·Not installed만 있음 | Settings › Connections |
  | 저장된 프로젝트가 없음 | Add Project… |

  - Needs attention은 이 카드가 아니라 배너가 맡는다.

### 마법사

- 첫 실행에만 자동으로 열린다. 메뉴 "Set Up doan…"은 없애고 Settings…로 바꾼다.
- 2단계: 실행 파일이 없는 에이전트 줄에 "Install Claude Code ↗"·"Install Codex ↗"을 둔다(기본 브라우저). 둘 다 없으면 "doan works through Claude Code or Codex. Install one, then choose Check Again."을 보인다.
- 3단계: Open Project…는 단일 선택 대화상자를 쓴다. 그다음은 `projects-home`의 판정을 따른다.
  - 고른 폴더가 저장소를 담은 폴더면 체크 목록에서 하나만 고르게 한다.
  - 저장소가 아니면 확인을 거친다.
  - 설정 안 된 저장소면 지금의 설정 폼을 보인다.
- 4단계: 프로젝트 없이 오면 Add Project… 버튼이 있다.
- 각 단계의 제목과 설명은 `/design-draft` 초안의 문구와 같다(`/design-sync`로 확인).

### 첫 프롬프트

마법사 4단계와 캔버스가 0개인 작업공간이 같은 컴포넌트를 쓴다.

- 입력란 placeholder는 명사구 예시다(예: "a sign-in screen with SSO"). 입력하면 `Use the doan skill to make a design canvas in <repo> for <입력>.` 문장이 완성되어 보인다.
- 입력이 비면 Copy가 비활성이다. 입력은 한 줄, 500자 이하이고, 제어 문자를 받지 않는다.
- Copy가 성공하면(클립보드 쓰기 완료 후) "Waiting for a canvas in design/…"를 보인다.
  - Copy가 실패하면 기존 실패 문구와 Retry copy를 보인다.
  - 기다리는 동안 입력을 고쳐도 대기는 취소되지 않는다.
- 도착 판정은 "Copy 시점에 없던 캔버스 경로가 생김"이다(이미 캔버스가 있는 프로젝트도 동작한다). 도착했을 때 보이는 것은 사용자가 있는 화면에 따라 다르다.
  - 그 작업공간에 있으면 가장 최근 mtime의 새 캔버스를 연다.
  - 다른 화면에 있으면 "New canvas in <project>" 토스트에 Open을 보인다.
  - 마법사가 열려 있으면 마법사 안에 "Canvas ready: <title>"과 Open을 보인다. Open은 마법사를 닫고 캔버스를 연다.
- 대기 중에 그 프로젝트를 제거하면 대기가 취소된다. 앱이 숨겨져 있는 동안 도착하면 토스트를 보인다.

### Projects 탭

- 저장된 프로젝트를 홈과 같이 저장소별로 묶어 보인다. 줄은 워크트리마다 하나다. 홈 카드 줄 메뉴의 Project settings는 이 탭을 그 줄로 연다.
- 문제 상태 줄을 고르면 상태 칩과 홈의 같은 동작을 보인다. 설정 항목은 보이지 않는다.
- 홈에서 프로젝트가 제거되면 목록에서도 바로 빠진다. 고른 줄이 빠지면 첫 줄이 선택된다.
- 정상 줄을 고르면 아래가 보인다: 루트 경로, token CSS(경로 또는 None), serve 목록.
- token CSS
  - Change…는 파일을 고른 뒤 `doan config --json --repo <root> --token-css <absolute>`를 부른다.
  - Clear는 `--clear-token-css`를 부른다.
- serve
  - Add…는 파일 또는 폴더를 고른다.
  - 확인 대화상자 "Canvases in this project will be able to read <path>."를 거쳐 `--add-serve`를 부른다.
  - 각 항목의 Remove는 `--remove-serve`를 부른다.
- 성공하면 "Saved"를 보이고, 그 프로젝트의 열린 캔버스는 다시 불러온다. 지금의 served 변경 감시가 처리한다.
- CLI 오류가 나면(저장소 밖 경로, 없는 파일, 깨진 config, CLI 없음·타임아웃) CLI 메시지를 보이고 config를 바꾸지 않는다.

### `doan config` (CLI·MCP)

- `doan init`과 같은 경로 검증을 쓴다: 저장소 안, 디스크 표기, token CSS는 일반 파일, serve는 존재하는 파일·디렉터리이고 루트와 `.doan/` 밖.
- 깨진 config는 덮어쓰지 않는다. 바꾸지 않는 필드는 보존한다. 바뀐 것이 없으면 파일을 다시 쓰지 않는다.
- 결과는 `{repo, tokenCss?, serve, changed}`다.
- MCP 도구 `config`는 같은 결과를 돌려주는 쓰기 도구다(`readOnlyHint` 없음, 승인 필요).

### 안내 문구와 확인 방법

- 가이드와 `app_not_running.nextSteps`의 "Set Up doan…" 문장을 Settings로 고친다. 그 뒤 `/agent-eval`이 회귀 없이 통과한다(AGENTS.md 규칙).
- 위 동작은 단위 테스트, `go test ./...`, `npm --prefix app run e2e`(실제 사용자 상태 불변)로 확인한다.

## 비목표

- 마법사 단계 구성 변경(4단계 유지가 사용자 결정이다)
- 셸 rc 파일 편집, `/usr/local/bin` 설치, 제거(uninstall) 흐름(PRODUCT §5 app 0의 Not included 유지)
- 첫 프롬프트를 에이전트에 직접 보내기(PRODUCT §3 Out of scope 4 — 에이전트를 깨우지 않음)
- 앱 업데이트·라이선스 등 다른 설정 섹션(#9 `dist`)
- 홈과 프로젝트 관리 → `projects-home`. 트리·검색·복원 → `design-nav`.
