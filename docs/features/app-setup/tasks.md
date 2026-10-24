# app-setup — 작업 순서

## 선행 조건과 앞선 단계

- **선행 조건**: `projects-home`이 main에 병합되어 있다. 그 기능의 홈, 추가 판정, `groupProjects`, 공통 토스트, 메뉴 활성 표를 쓴다.
- **앞선 단계**: `/feature-review`(완료 2026-10-25) → `/design-draft` → 사용자가 앱에서 초안 확인 → 아래 작업.
- **초안 범위**: `/design-draft`는 `design/app-setup.html`에 다음을 그린다.
  - Settings 창(두 탭, 줄 5상태, 펼친 줄, 확인)
  - 홈 연결 칩·배너·Finish 카드
  - 바뀐 마법사 문구, 설치 링크, Canvas ready
  - FirstPrompt(입력, 미리보기, Waiting, 실패)
  - Projects 탭(정상·문제 상태, serve 추가 확인)
- **초안 작업 방식**: Codex와 Claude가 같은 요청으로 각자 초안을 그린다(사용자 요구 2026-10-25, 이 단계에 한해 모델 경계를 넘어도 된다).
  - Codex 워커는 공정성을 위해 `gpt-6-astra` reasoning high로 띄운다.
  - 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분이 있으면 고른 초안에 붙인다. 고른 근거와 가져온 부분을 초안 노트에 적는다.
- **레퍼런스**: Sorcerer(github.com/gbrasil720/sorcerer, MIT)를 기본으로 본다. 필요하면 AGENTS.md가 꼽은 레퍼런스 서비스도 직접 확인한다. 참고한 화면과 파일을 초안 노트에 출처로 적는다.

## 순수 함수

1. `linkState`의 `dangling`, `connectionSummary`, `senderAllowed`, `setupLock`, `homeAlerts`, `menuState` 확장.
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우는 아래와 같다.
     - 대상이 없는 링크는 `dangling`이고, 대상이 있는 다른 doan은 `link-other`다.
     - 상태 표의 5열 조합(translocated, Couldn't check 포함).
     - 허용 목록 표 전체. 썸네일 숨김 창 같은 미등록 창은 거부한다.
     - 쓰기 하나·확인 소유 창·`busy`.
     - 배너와 Finish 카드 조건이 겹치지 않는다.
     - 마법사가 열리면 Settings가 비활성이고, Settings에 포커스가 있으면 메인 전용 항목이 비활성이다.
     - 기존 링크된 설정 디렉터리 회귀 테스트(같은 대상·다른 대상)도 녹색이다.
2. `promptSentence`, `firstPromptReducer`, `arrival`, 마법사 뷰 분기(설치 링크, Add Project, Canvas ready).
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우는 아래와 같다.
     - 빈 입력.
     - 줄바꿈·제어 문자 거부, 500자.
     - 끝 마침표는 하나만 남긴다.
     - 이미 캔버스가 있는 프로젝트에서 새 경로가 생기면 도착이다.
     - 새 경로가 여럿이면 mtime이 가장 큰 것을 연다.
     - 루트를 제거하면 취소되고, 입력을 고쳐도 대기는 유지된다.

— 커밋 경계 A1: `feat(app): pure helpers for connection status, window permissions and first prompt`

3. Go `applyConfigOps`.
   - 확인: `go test ./...`가 녹색이다. 다룰 경우는 아래와 같다.
     - token CSS 설정·해제, serve 추가·제거.
     - 같은 값이면 `changed:false`, 상충 옵션.
     - 다른 필드 보존, 키 순서·직렬화가 init과 같다.

— 커밋 경계 A2: `feat(cli): pure config operations`

## CLI·MCP·가이드

4. `doan config` 명령: 읽기, 쓰기, 저장소 찾기, 경로 해석, 오류, 임시 파일 + rename, `changed:false`면 쓰지 않음. 결과 모양을 ARCHITECTURE §12에 적을 메모로 남긴다.
   - 확인: `go test ./...` + `go vet ./...`가 녹색이다. 다룰 경우는 아래와 같다.
     - 상대 경로는 cwd 기준이고, 절대 경로는 저장소 기준 상대 경로로 바꾼다. 대소문자는 디스크 표기를 따른다.
     - `usage_error`가 되는 입력: 저장소 밖, 없는 파일, 디렉터리인 token CSS, 저장소 밖을 가리키는 심볼릭 링크, 루트·`.doan/` 안의 serve.
     - config가 없으면 `repo_not_found`, 깨진 config는 그 코드로 실패하고 덮어쓰지 않는다.
     - 읽기만 하면 mtime이 그대로다.
     - 한 디렉터리에 연달아 두 번 쓴 결과가 순서대로 반영된다.
5. MCP 도구 `config`(쓰기, `readOnlyHint` 없음)를 더한다. 가이드의 명령 목록·MCP 표에 넣고 "요청받았을 때만" 문장을 둔다. `app_not_running.nextSteps`와 가이드의 "Set Up doan…" 문장을 Settings로 고친다.
   - 확인: `go test ./...`가 녹색이다. 다룰 경우는 아래와 같다.
     - MCP 도구 목록과 annotation 테스트.
     - 도구 결과가 CLI 결과와 같다.
     - 가이드 끝 표시(end marker)가 유지된다.
     - 고정 문자열 테스트를 갱신한다: `cli/internal/cli/active_test.go`의 nextSteps 문장.
6. `/agent-eval`(`npm --prefix app run package` 후 `node eval/run.ts`). 필요하면 "요청 없이 config를 바꾸지 않음" 시나리오를 새 id로 더한다. 그 경우 `node eval/run.ts --self-test`의 `self-test PASS`를 먼저 확인한다.
   - 확인: 기존 시나리오에 새로운 실패가 없고, 새 시나리오가 있으면 통과한다. 라운드를 `docs/USABILITY-EVAL.md`에 기록한다.

— 커밋 경계 B: 작업 4 `feat(cli): doan config`, 작업 5 `feat(mcp): config tool and Settings guidance`, 작업 6 `docs(eval): record app-setup round`. 가이드가 가리키는 Settings 메뉴는 커밋 경계 C에서 생기므로, B와 C는 같은 PR로 나간다.

## main (I/O)

7. Settings 창.
   - 단일 인스턴스이고, 닫으면 파괴한다.
   - 진입점 `settings.html`과 전용 preload를 둔다. electron-vite 설정과 페이지별 CSP는 바꾸기 전에 diff를 사용자에게 보여주고 확인받는다.
   - 창별 IPC 허용 목록, 창별 설정 세션·읽기 토큰, 앱 전체 쓰기 잠금·확인 소유 창.
   - 두 창으로 상태 이벤트를 보낸다.
   - 메뉴: "Set Up doan…"을 지우고 Settings…(⌘,)를 더한다. 화면·창 포커스별로 활성 상태를 정한다.
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우는 아래와 같다.
     - Settings 창에서 캔버스·코멘트·폴더 채널을 부르면 거부되고, 설정 채널은 허용된다.
     - ⌘,를 두 번 눌러도 창은 하나다.
     - 마법사와 Settings가 동시에 쓰려 하면 하나가 `busy`다.
     - 고정 문자열 테스트를 갱신한다: `app/src/main/index.test.ts`의 메뉴 항목.
   - 확인: `npm --prefix app run build` 통과.
8. 연결 요약 IPC와 갱신(시작, 포커스 60초 스로틀, Settings 열기, 동작 후, Check Again). 고정 URL `openExternal`. 첫 프롬프트 문장·복사가 `{root, subject}`를 받는다. Projects 목록 구독. `config:read`·`config:choose`·`config:write`는 `doan config --json`을 부르고, choice는 (root, epoch)에 묶이며 시트는 Settings 창에 붙는다.
   - 확인: `npm --prefix app test`가 녹색이다. 다룰 경우는 아래와 같다.
     - 열거형이 아닌 URL 요청은 거부된다.
     - subject 검증.
     - 저장 목록에 없는 root, 발급하지 않은 `choiceId`, 마지막 읽기에 없는 `removeServe` 경로는 거부된다.
     - `doan config`가 없거나 타임아웃이거나 config가 깨졌으면 오류를 표시하고 config는 그대로다.
     - 읽는 중에는 이전 결과가 유지된다.
     - 스로틀은 가짜 시계로 확인한다.
   - 확인: `npm --prefix app run typecheck` 통과.

— 커밋 경계 C: `feat(app): settings window, setup status, config bridge and first prompt subject in main`

## UI

9. Settings 창 UI(Connections, Projects 탭, serve 추가 확인)와 메인 창 홈의 연결 칩·배너·Finish 카드.
   - e2e 준비: Settings 창은 URL(`settings.html`)로 골라 잡는다. 썸네일 숨김 창과 헷갈리지 않게 하려는 것이다. 창 선택 헬퍼는 `design-nav`가 먼저 들어왔다면 그것을 쓰고, 아니면 여기서 만든다.
   - 메뉴와 Close Window는 `menu(app, …)`로 부른다.
   - 확인: e2e로 아래를 본다.
     - 끊어진 CLI 링크를 미리 만든 임시 HOME에서 홈에 배너가 보인다. Settings 창에는 "Link is broken"이 보이고, Fix → 확인 → Connected로 바뀌며, 메인 창 배너가 사라진다.
     - `onboarding.json`이 있고 에이전트가 없으면 Finish 카드가 보인다.
     - 칩을 누르면 Connections 탭이 열린다.
     - 줄 메뉴 Project settings를 누르면 Projects 탭의 그 줄이 열린다.
     - token CSS를 바꾸면 "Saved"가 보이고 열린 캔버스가 다시 불러와진다.
     - serve를 추가하면 확인 대화상자를 거쳐 목록에 반영된다.
     - 저장소 밖 파일을 고르면 CLI 오류가 보이고 config는 그대로다.
     - Settings 창에서 ⌘W를 누르면 그 창만 닫히고, ⌘Q를 누르면 두 창이 모두 닫힌다.
     - real-state는 바뀌지 않는다.
10. 마법사 변경(문구, 설치 링크, 3단계 단일 선택 판정, 4단계 Add Project·Canvas ready)과 `FirstPrompt`(마법사 4단계·0개 작업공간). `design-nav`가 먼저 들어왔다면 0개 작업공간의 빈 상태를 `FirstPrompt`로 통합한다.
    - `app/e2e/onboarding.ts`를 재구성한다. 메뉴 "Set Up doan…"으로 다시 열던 `reopen()` 8곳은, `onboarding.json`을 지우고 앱을 다시 켜는 방식으로 바꾼다. "숨긴 창에서 메뉴로 다시 열면 같은 세션" 검증은 메뉴가 없어지므로 지운다고 기록한다.
    - 확인: e2e로 아래를 본다.
      - 에이전트가 없으면 설치 링크가 보인다(openExternal 스텁으로 URL 확인).
      - 프로젝트 없이 4단계에 오면 Add Project…가 보인다.
      - 3단계에서 저장소를 담은 폴더를 고르면 체크 목록에서 하나만 고를 수 있다.
      - 입력 → 미리보기 → Copy → Waiting → `design/`에 캔버스 파일 쓰기 → 자동으로 열린다. Copy는 `clipboardGate`로 쓰기 완료 뒤에만 Waiting으로 넘어가는지 확인하고, 클립보드는 저장했다가 복원한다.
      - 이미 캔버스가 있는 프로젝트에서도 새 캔버스를 감지한다.
      - 다른 화면에 있으면 토스트가 뜬다.
      - 마법사가 열려 있으면 Canvas ready가 뜨고, Open을 누르면 마법사가 닫히고 캔버스가 열린다.
      - 앱이 숨겨진 동안 도착하면 토스트가 뜬다.
      - 대기 중에 프로젝트를 제거하면 대기가 취소된다.
      - 기존 온보딩 단계(포커스, Escape, 확인 대화상자)도 PASS다.
11. `/design-sync`: `design/app-setup.html`과 구현을 비교하고 `docs/DESIGN.md` Onboarding 절을 갱신한다.
    - 확인: 비교 표에 남은 불일치가 없거나 문서화되어 있다. 그다음 `npm --prefix app run e2e`가 최종 `runtime-test: PASS`와 exit 0으로 끝난다.

— 커밋 경계 D: `feat(app): settings window UI, setup alerts and first prompt composer`

## 마무리

12. `/runtime-test`, `/code-review`, `/refactor`. 회귀를 고쳤으면 `/postmortem`도 돌린다. 6 이후 가이드나 CLI 메시지가 다시 바뀌었으면 `/agent-eval`을 한 번 더 돌린다.
    - 확인: typecheck·test·e2e·`go test ./...` 통과.
13. 승격: 영어로 옮기고 `docs/features/app-setup/`을 지운다.
    - `docs/PRODUCT.md`: §5 앱 항목 0, 기능 분할 표, §7 결정 로그. 결정 로그에는 결정 5·6·11, Q1·Q2, R4·R5, Codex·Claude 초안 비교 방식, design.md '결정 영향'의 대체 목록을 넣는다.
    - `docs/ARCHITECTURE.md`: §5(Unavailable tools 문장, MCP 도구 표의 `config`), §6(가이드 변경), §7(Settings 창, 창별 IPC, 세션, 메뉴, CSP, Onboarding), §12(`doan config`).
    - 확인: `grep -nE '^\| 2026-.*(app-setup|Settings)' docs/PRODUCT.md`에 결정 행이 있다. `grep -n 'doan config' docs/ARCHITECTURE.md`가 결과를 낸다. 폴더가 없다.

— 커밋 경계 E: `docs: promote app-setup decisions`
