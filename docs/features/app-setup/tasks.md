# app-setup — 작업 순서

선행 조건: `projects-home`이 main에 병합되어 있다(홈, 추가 흐름).
앞선 단계: `/feature-review` → `/design-draft`(Settings, 홈 연결 요약·배너·Finish 카드, 바뀐 마법사 문구와 막힘 버튼, FirstPrompt, Project settings를 `design/app-setup.html`에 그림) → 사용자가 앱에서 초안 확인 → 아래 작업.

`/design-draft`는 Sorcerer(github.com/gbrasil720/sorcerer, MIT)의 설정·셋업 화면을 저장소에서 직접 확인해 참고하고, 참고한 화면과 파일을 초안 노트에 출처로 적는다(사용자 요청 2026-10-24).

## 순수 함수

1. `linkState`의 `dangling`, `connectionSummary`, `homeAlerts`.
   - 확인: `npm --prefix app test` — 대상이 없는 링크는 `dangling`, 대상이 있는 다른 doan은 `link-other`, 표의 상태 조합, 배너와 Finish 카드 조건이 녹색. 기존 링크된 설정 디렉터리 회귀 테스트도 녹색.
2. `promptSentence`, `firstPromptReducer`, `arrival`, 마법사 뷰 분기(설치 링크, Add Project).
   - 확인: `npm --prefix app test` — 빈 입력, 줄바꿈·제어 문자 거부, 500자, 끝 마침표 하나, 0→1 도착 감지, 루트 제거 시 취소가 녹색.

— 커밋 경계 A: `feat(app): pure helpers for connection status and first prompt`

## CLI·MCP·가이드

3. `doan config [--token-css <path|none>]`: 옵션이 없으면 읽기, 있으면 쓰기. `doan init`의 token CSS 검증을 재사용하고, `serve`를 보존하며, 임시 파일 + rename으로 쓴다. 결과 모양을 ARCHITECTURE §12에 적을 메모로 남긴다.
   - 확인: `go test ./...` + `go vet ./...` — 저장소 밖 경로 `usage_error`, 절대 경로 → 저장소 기준 상대 경로, 대소문자 디스크 표기, `none`이면 `tokenCss` 제거, `serve` 보존, 깨진 config는 덮어쓰지 않음, config 없음은 `repo_not_found`가 녹색.
4. MCP 도구 `config`(쓰기, `readOnlyHint` 없음), 가이드 명령 목록·MCP 표·"요청받았을 때만" 문장, `app_not_running.nextSteps`와 가이드의 "Set Up doan…" 문장을 Settings로 고친다.
   - 확인: `go test ./...` — MCP 도구 목록과 annotation 테스트, 도구 결과가 CLI 결과와 같음, 가이드 끝 표시(end marker) 유지가 녹색.
4b. `/agent-eval`(`npm --prefix app run package` 후 `node eval/run.ts`). 필요하면 "요청 없이 config를 바꾸지 않음" 시나리오를 새 id로 더한다(`node eval/run.ts --self-test` PASS 먼저).
   - 확인: 기존 시나리오에 새로운 실패가 없고, 새 시나리오가 있으면 통과. 라운드를 `docs/USABILITY-EVAL.md`에 기록.

— 커밋 경계 B: `feat(cli): doan config for token css` · `feat(mcp): config tool` · `docs(skill): config and Settings guidance`

## main (I/O)

5a. Settings 창: 단일 인스턴스, 닫으면 파괴, 창별 IPC 허용 목록(`senderAllowed`), 두 번째 renderer·preload 진입점(electron-vite 설정 변경은 diff를 사용자에게 보여주고 확인받은 뒤 적용), 두 창으로의 상태 이벤트.
   - 확인: `npm --prefix app test` — Settings 창에서 캔버스·코멘트·폴더 채널 호출이 거부되고 설정 채널은 허용됨, ⌘, 두 번이 창 하나. `npm --prefix app run build` 통과.
5. `setup:status` IPC와 갱신 이벤트(시작, 포커스 60초 스로틀, 설정 동작 후). 메뉴: "Set Up doan…" 삭제, Settings…(⌘,) 추가. 고정 URL `openExternal`. `onboarding:first-prompt`가 `{root, subject}`를 받도록 바꾼다. Project settings 읽기·쓰기는 `doan config --json`을 부른다(파일 선택은 지금의 `chooseTokenCss`처럼 main이 들고 renderer에는 ID만).
   - 확인: `npm --prefix app test` — 발신자 검사, 열거형이 아닌 URL 요청 거부, subject 검증, 저장 목록에 없는 root 거부가 녹색. `npm --prefix app run typecheck` 통과.

— 커밋 경계 C: `feat(app): settings window, setup status and first prompt subject in main`

## UI

6. Settings 창 UI(Connections, Projects 탭), 메인 창 홈 연결 요약·배너·Finish 카드.
   - 확인: e2e(Playwright `_electron`에서 두 번째 창은 `app.waitForEvent("window")`로 잡음) — 끊어진 CLI 링크를 미리 만든 임시 HOME에서 홈에 배너가 보이고, Settings 창에 "Link is broken"이 보이며, Fix → 확인 → Connected로 바뀌고 메인 창 배너가 사라짐. Settings 창을 닫아도 메인 창이 남음. 에이전트가 없으면 Finish 카드가 보임. real-state 불변.
7. 마법사 변경(문구, 설치 링크, 3단계 추가 흐름, 4단계 Add Project)과 `FirstPrompt`(마법사 4단계·빈 작업공간).
   - 확인: e2e(`app/e2e/onboarding.ts` 갱신) — 에이전트 없음 → 설치 링크(openExternal 스텁으로 URL 확인), 프로젝트 없는 4단계 → Add Project…, 입력 → 문장 미리보기 → Copy(클립보드 완료 후) → Waiting → `design/`에 캔버스 파일 쓰기 → 자동으로 열림. 다른 화면에 있으면 토스트. 기존 온보딩 단계(포커스, Escape, 확인 대화상자)도 PASS.
8. `/design-sync`: `design/app-setup.html`과 구현을 비교하고 `docs/DESIGN.md` Onboarding 절을 갱신한다.
   - 확인: 비교 표에 남은 불일치가 없거나 문서화되어 있음. `npm --prefix app run e2e`가 최종 `runtime-test: PASS`와 exit 0.

— 커밋 경계 D: `feat(app): settings screen, setup alerts and first prompt composer`

## 마무리

9. `/runtime-test`, `/code-review`, `/refactor`, `/agent-eval`(가이드·CLI 메시지가 바뀌었으므로). typecheck·test·e2e·`go test ./...` 통과.
10. 승격: `docs/PRODUCT.md`(§5 앱 항목 0, 기능 분할 표, §7에 결정 5·6·11과 대체된 결정)와 `docs/ARCHITECTURE.md`(§5 Unavailable tools 문장·MCP 도구 표의 `config`, §6 가이드 변경, §7 Onboarding·메뉴·창별 IPC·Settings 창, §12 `doan config`)에 영어로 옮기고 `docs/features/app-setup/`을 지운다. `docs/USABILITY-EVAL.md`에 `/agent-eval` 라운드를 기록한다.
    - 확인: `grep -n 'app-setup' docs/PRODUCT.md docs/ARCHITECTURE.md`에 날짜가 붙은 항목이 있고, 폴더가 없음.

— 커밋 경계 E: `docs: promote app-setup decisions`
