# onboard — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| CLI 저장소 경로 (`cli/internal/repo/`) | 새 helper가 저장소 안 절대 경로를 실제 root 기준 상대 경로(디스크 표기)로 바꾼다. `Resolve`는 그대로 둔다 |
| CLI `doan init` (`cli/internal/cli/init.go`) | `--token-css`가 절대 경로면 새 helper를 먼저 거친 뒤, 기존 스키마 검사 · `Resolve`를 탄다 |
| `doan mcp` (`cli/internal/cli/mcp.go`) | `init` 도구의 `tokenCss` 설명 문구만 바뀐다("relative to the repository" → 저장소 안 상대 또는 절대). 동작은 `cli.Run`을 같이 쓰므로 자동으로 따라온다 |
| skill 본문 (`cli/internal/cli/skill.md`) | 실사용 관찰에 따라 전반을 고친다(2026-10-24 사용자). `--token-css` 설명을 고친다. 끝 표시줄 규칙은 그대로 둔다 |
| skill 스텁 (`app/src/main/onboarding/SKILL.md`, 새 파일) | 수백 단어짜리 발견용 스텁이다. `doan skill`을, 셸이 없으면 MCP `skill` 도구를 부르라고만 한다. main이 Vite `?raw`로 가져오므로, 개발 빌드와 패키지가 같은 내용을 쓰고 리소스 경로를 찾을 필요가 없다 |
| 앱 main — CLI 찾기 (`app/src/main/cli.ts`) | `DOAN_CLI` → 패키지된 앱이면 `process.resourcesPath/bin/doan` → (개발 빌드만) `PATH`의 `doan` |
| 앱 main — 폴더 (`shell.ts`, `cli.ts`) | 위로 다시 묻기, 재루팅. 3단계 `doan init` 실행 |
| 앱 main — 온보딩 (`app/src/main/onboarding/`, 새 디렉터리) | 셸 탐지, 링크 · 스텁 · MCP 상태 읽기와 동작, `onboarding.json`, 순수 함수(`states.ts`)와 테스트, PoC 7 출력 fixture(`fixtures/`) |
| 앱 main — 메뉴 (`index.ts`) | `{ role: "appMenu" }`를 직접 정의한 앱 메뉴로 바꾸고, About 다음에 "Set Up doan…"을 둔다(단축키 없음) |
| 앱 preload · IPC | 온보딩 상태 읽기, 단계 실행(enum만 받음), 3단계 init, 토큰 CSS 파일 선택, 첫 문장 · PATH 한 줄 복사(main이 문자열을 만든다) |
| 앱 renderer | 마법사(`Onboarding.tsx`), 프로젝트 설정 대화상자(`ProjectSetupDialog.tsx`), 사이드바 행의 [Set Up…] · [Copy first prompt], 순수 함수 `onboardingView.ts`. 생김새는 초안을 따른다 |
| 패키지 빌드 (새 설정) | electron-builder `--dir`. `go build`한 CLI를 `extraResources`의 `bin/doan`으로 싣는다. `app/package.json`에 `version` `0.1.0`, `productName` `doan`, appId `design.doan.app`(2026-10-24 사용자) |
| e2e (`app/e2e/`) | 실행 helper가 온보딩을 격리한다(아래 '테스트 격리'). `runtime.ts`의 `doan init` 힌트 단언을 바꾼다 |
| `design/` | 초안 캔버스 `design/onboard.html`(`/design-draft`) |
| 형식(`schema/`) | 바뀌지 않는다 |

## 흐름

1. **CLI 찾기**: `cliCommand(env, packaged, resourcesPath)`는 다음 순서로 고른다.
   - `DOAN_CLI`가 있으면 그 경로를 쓴다.
   - 없으면, 패키지된 앱은 번들 경로를 쓴다.
   - 그 밖에는 `doan`을 쓴다.

   패키지된 앱은 `PATH`로 내려가지 않는다. 다른 버전의 `doan`이 PATH에 있어도 앱과 CLI의 계약(`init` · `ls` 결과)이 어긋나지 않게 하기 위해서다.
2. **패키지 빌드**: `npm --prefix app run package`는 다음 순서로 돈다.
   1. 저장소 루트에서 `GOOS=darwin GOARCH=arm64 go build -ldflags "-X …/cli.Version=<app/package.json version>" -o <빌드 디렉터리>/bin/doan ./cli/cmd/doan`
   2. `electron-vite build`
   3. `CSC_IDENTITY_AUTO_DISCOVERY=false electron-builder --mac dir --arm64`(`mac.identity: null`, 서명 없음, electron-builder 26.18.0 — PoC 7d)

   결과는 `app/dist/`(무시 목록에 추가)의 `mac-arm64/doan.app`이다. electron-builder를 고른 이유: ARCHITECTURE §9가 정한 `electron-updater`가 electron-builder의 `app-update.yml` 형식을 읽는다. Orca 번들에도 같은 형식의 `Contents/Resources/app-update.yml`(`provider: github`)이 있다(2026-10-24 로컬 번들 확인). 버전은 정확히 고정한다(`app/.npmrc`). 서명 · 공증 · dmg 대상은 #9가 더한다.
3. **마법사 진입과 닫기**:
   - 열기: main이 시작할 때 `<userData>/onboarding.json`이 없거나 읽을 수 없으면, 창을 보이면서 마법사를 연다.
   - 닫기: 사람이 마법사를 닫으면(Close · Escape · 마지막 단계의 Done) main이 `{}`를 쓴다(임시 파일 + rename). 판정은 파일이 있는지 없는지뿐이고, `folders.json`처럼 버전 · 스키마가 없는 머신 로컬 파일이다(ARCHITECTURE §11).
   - 쓰지 않는 경우: Cmd+Q로 끝내면 쓰지 않는다.
   - 다시 열기: 앱 메뉴 "Set Up doan…"으로 연다. 창이 숨어 있으면 먼저 보인다.
   - 상태 읽기: 마법사는 열릴 때와 [Check Again]을 누를 때, 그리고 동작이 하나 끝날 때마다 상태를 다시 읽는다. 읽기 요청에는 ID를 붙여 늦게 온 응답을 버린다.
4. **마법사 형태 (2026-10-24 사용자: 네 단계 마법사)**: 기존 창 하나 안에서 전체를 덮는 `role="dialog"`(이름 "Set Up doan")로 띄운다. 별도 창을 만들지 않는 이유는 둘이다.
   - 창을 하나만 만든다는 결정이 있다(ARCHITECTURE §7 Window lifecycle).
   - IPC 발신자 검사가 앱 창의 main frame만 받는다.

   단계는 1 CLI → 2 Agents → 3 Project → 4 First prompt이다. 1~3단계 하단에는 [Skip]과 [Continue]가, 4단계에는 [Done] 하나가 있다(2026-10-24 사용자, 초안 확정). 1 · 2단계 하단 왼쪽에는 "Step N of 4"와 [Check Again]이 있다. 상단 단계 표시기는 완료한 단계를 번호 대신 체크로 보이고, 건너뛴 단계는 번호 그대로 둔다. 표시기를 눌러 단계로 이동할 수 있다(2026-10-24 사용자). 키보드와 창 규칙:
   - 포커스와 Tab: 열면 제목에 포커스가 간다. Tab은 마법사 안에서만 돈다.
   - Escape: 마법사를 닫는다. 동작이 실행 중일 때는 비활성이다. Escape는 전파를 막아 캔버스 선택 해제로 내려가지 않게 한다.
   - 닫은 뒤 포커스: 직전 포커스로 돌아간다. 첫 실행이었으면 사이드바로 간다.
   - Cmd+W: 마법사를 연 채로 창만 숨긴다.

   마법사는 화면 전환이 아니다. 그래서 comment draft 가드를 거치지 않는다. draft와 선택은 그대로 남는다.
5. **1단계 — CLI 링크**: 대상은 `~/.local/bin/doan`이고, 링크 값은 `cliCommand()` 결과가 절대 경로일 때 그 경로다(`DOAN_CLI` 또는 번들, 2026-10-24 사용자). 그래서 개발 빌드와 e2e도 임시 HOME에서 1 · 2단계를 끝까지 확인할 수 있다. `PATH`의 `doan`만 있는 개발 빌드에서는 1단계가 비활성이고, 그 이유("This build has no bundled CLI. Set DOAN_CLI.")를 인라인으로 보인다. 상태는 다음과 같다.
   - `missing`: 대상이 없다. "Install"을 누르면 `~/.local/bin`을 만들고, 임시 링크를 만든 뒤 rename한다.
   - `ours`: 기대 대상을 가리키는 심볼릭 링크다. 완료로 본다.
   - `link-other`: 다른 곳을 가리키는 심볼릭 링크다(다른 앱 사본, 깨진 링크 포함). "Points to another copy: `<경로>`"를 보이고, 확인을 받으면 바꾼다.
   - `blocked`: 링크가 아닌 파일이나 디렉터리다. `~/.local/bin` 자체가 파일이거나 링크인 경우도 여기에 든다. 건드리지 않고 "`<path>` is in use by something else. Move or delete it, then Check Again."을 보인다.
   - 번들 경로가 `/AppTranslocation/` 아래면 링크를 만들지 않고 "Move doan to Applications, then open it again."을 보인다.
   - PATH 확인: 로그인 셸의 `PATH`(흐름 7)에 `~/.local/bin`이 없으면 `export PATH="$HOME/.local/bin:$PATH"` 한 줄과 함께 "Add this line to `<rc 파일>`, open a new terminal, then choose Check Again."을 보인다. rc 파일 이름은 셸 이름으로 고른다(zsh → `~/.zshrc`, bash → `~/.bash_profile`). zsh · bash가 아닌 셸에는 명령 한 줄 없이 "Add ~/.local/bin to PATH in your shell configuration, then choose Check Again."만 보인다(PoC 7a: fish는 설치되어 있지 않아 확인하지 못했다).
6. **2단계 — 에이전트 연결 (2026-10-24 사용자: 행마다 Connect)**: 화면 구성은 다음과 같다.
   - 공유 행 "Skill": `~/.agents/skills/doan`의 상태를 보인다. Codex와 Claude Code가 함께 쓰므로 한 줄이다.
   - 에이전트 행(Claude Code, Codex): 감지 결과와 MCP 상태를 보인다. Claude Code 행에는 스킬 링크 상태도 보인다. MCP 상태 옆에는 등록할 설정 위치(기본 위치 또는 `CLAUDE_CONFIG_DIR` · `CODEX_HOME`)를 보인다.

   [Connect]는 감지된 행에만 있다. 누르면 필요한 것만 스텁 → (Claude) 링크 → MCP 순서로 실행하고, 처음 실패한 곳에서 멈춘다. 실행하는 동안 그 행의 버튼은 비활성이다. 성공하면 "Connected. Start a new <agent> session to use doan."을 보인다. 교체가 필요한 항목은 그 지점에서 확인 대화상자를 띄운다. 항목별 규칙은 다음과 같다.
   - 스텁: `~/.agents/skills/doan`과 그 안의 `SKILL.md`를 둘 다 lstat한다.
     - `missing`: 디렉터리가 없다.
     - `ours`: `SKILL.md`가 일반 파일이고 내용이 번들 스텁과 같다.
     - `differs`: `SKILL.md`가 일반 파일이고 내용이 다르다.
     - `blocked`: 디렉터리나 `SKILL.md`가 링크이거나 종류가 다르다.

     `differs`는 확인("Your edits to SKILL.md will be replaced.")을 받은 뒤 같은 디렉터리의 임시 파일에 쓰고 rename한다. 디렉터리 안의 다른 파일은 지우지 않는다. `~/.agents/skills`가 없으면 만든다.
   - Claude Code 링크: `<claude 설정 디렉터리>/skills/doan` → `~/.agents/skills/doan`으로 가는 상대 링크다. 기본 위치는 `~/.claude/skills/doan` → `../../.agents/skills/doan`(Orca와 같은 상대 링크, 2026-10-24 이 머신의 `~/.claude/skills/orca-cli`를 확인했다). `CLAUDE_CONFIG_DIR`이 있으면 링크 위치는 `$CLAUDE_CONFIG_DIR/skills/doan`이고, 링크 값은 그 `skills` 디렉터리 기준으로 계산한다. `../../`를 고정하지 않는다(PoC 7b). 상태 분류와 쓰기 방식은 1단계 링크와 같다. Claude Code가 상대 링크 스킬을 찾는다는 근거는 PoC 7b의 지휘 세션 관찰이다. 격리된 `doan` 스킬 호출은 확인하지 못했다(PRODUCT §6).
   - Codex는 `~/.agents/skills`를 읽는다고 가정한다. 이 가정은 PoC 7b에서 실제로 확인하고, 실패하면 멈추고 사용자에게 묻는다.
   - MCP:
     - 상태: `missing`, `ours`, `other`, `unknown`이다. `ours`는 사용자 범위이고 command가 1단계 링크의 절대 경로, args가 `["mcp"]`인 경우다. `other`는 같은 이름에 다른 명령인 경우, `unknown`은 읽을 수 없는 경우다.
     - 상태 읽기(PoC 7c): Claude Code는 `claude mcp get`이 health-check로 서버를 실제로 띄우므로(`get` · `list` 모두 서버 실행 1회) 화면 상태에는 쓰지 않는다. 고른 설정 파일(`$CLAUDE_CONFIG_DIR/.claude.json` 또는 `~/.claude.json`)의 `mcpServers.doan`을 읽기 전용으로 파싱한다. Codex는 `codex mcp get doan --json`(`transport.command` · `transport.args`)으로 읽고, 범위는 고른 설정 위치(`$CODEX_HOME` 또는 `~/.codex`)로 정한다. 두 에이전트 모두 등록이 없으면 `get`이 exit 1이므로, 알려진 '없음' 출력과 실패를 구분한다(fixture).
     - `missing`이면 `claude mcp add --scope user doan -- <링크 절대 경로> mcp` 또는 `codex mcp add doan -- <링크 절대 경로> mcp`를 실행한다.
     - `other`는 확인을 받은 뒤 바꾼다. 바꾸기 전에 읽은 원래 등록 내용을 보관하고, 실패하면 그 내용을 보인다. Codex는 `codex mcp add`가 같은 이름을 덮어쓰므로 제거 없이 추가만 한다(PoC 7c). Claude는 `claude mcp remove --scope user doan` 뒤에 추가한다.
     - `unknown`이면 MCP 추가 · 제거를 비활성으로 두고 [Check Again]만 보인다. 그 행의 [Connect]는 스텁 · (Claude) 링크까지만 실행하고 MCP에서 멈춰 "Couldn't check"와 이유를 보인다(2026-10-24 사용자).
     - 설정 파일에 직접 쓰지 않는다(2026-10-24 사용자).
   - MCP 명령 경로를 번들 경로가 아니라 1단계 링크로 둔 이유: 앱을 옮기면 "Set Up doan…"에서 링크 하나만 다시 걸면 된다. 그래서 1단계가 `ours`가 아니면 MCP 항목은 비활성이고, 그 이유를 인라인으로 보인다.
7. **셸 탐지와 에이전트 CLI 실행**: Finder나 Dock에서 띄운 앱의 `PATH`는 사용자 셸의 `PATH`와 다르다. 이 머신의 `codex`는 `#!/usr/bin/env node` 스크립트라, 실행 파일 경로만 알아서는 `node`를 찾지 못한다.
   - 셸 실행: 앱은 `$SHELL`(없으면 `os.userInfo().shell`)을 로그인 모드로 한 번 실행한다. nonce 표시줄 사이에 `PATH`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`만 출력하게 한다. zsh는 `-lic`로 실행한다(PoC 7a: `-lc`는 `.zshrc`의 PATH 추가를 놓쳤다. `-lic`는 82.6 ms, 잡음 없음). bash도 `-lic`, 그 밖의 셸은 `-lc`로 실행한다(bash와 그 밖의 셸은 PoC에서 확인하지 않았다).
   - 실행 파일 찾기: 셸의 `command -v`를 쓰지 않는다(zsh는 alias면 정의를 낸다). Node 쪽에서 그 `PATH`를 훑어 찾는다.
   - 끝내기: 끝 nonce를 읽거나 `exit` 이벤트가 오면 끝낸다. `close` 이벤트를 기다리지 않는 이유는, 셸이 띄운 데몬이 stdout을 물고 있을 수 있기 때문이다. 시간 제한을 넘으면 SIGKILL을 보내고, 호출자는 한 번만 정리한다.
   - 결과 구분: "Not installed"(PATH에 없음)와 "Couldn't check"(시간 초과, 셸 없음, 실행 실패, 이유를 보인다)를 구분한다.
   - 에이전트 CLI 실행: 셸에서 얻은 `PATH`, `CLAUDE_CONFIG_DIR`, `CODEX_HOME`을 넣은 환경으로, stdin은 무시하고 시간 제한을 걸어 실행한다. 실행 파일이 ENOENT이면 "Couldn't run <agent> at <path>. Check Again."을 보인다.
   - 시간 제한 값은 PoC 7a · 7c에서 잰 값을 바탕으로 task 7에서 숫자로 정한다.
   - 설정 화면을 여는 것만으로는 상태 읽기 명령만 돈다. 쓰기는 사람이 버튼을 눌렀을 때만 한다.
8. **3단계 — 프로젝트 설정**: 마법사의 Project 단계에는 [Open Project…]가 있다. 이 버튼은 기존 폴더 선택 시트와 같은 방식이다. 고른 폴더가 이미 설정되어 있으면 "Already set up"을 보이고 4단계로 간다. 설정되지 않았으면 같은 단계 안에 프로젝트 설정 폼을 보인다. 사이드바 "Not initialized" 행의 [Set Up…]도 같은 폼을 대화상자로 연다(2026-10-24 사용자). 폼은 다음과 같다.
   - 구성: 토큰 CSS 필드(기본 "None"과 [Choose…])와 만들어질 변경 목록(`design/`, `.doan/config.json`, `.gitattributes`에 한 줄)을 보인다. "None"이면 "Without token CSS, doan check won't flag hardcoded colors."를 함께 보인다. 주 버튼은 [Set Up Project]다.
   - [Choose…]: 메인 창에 붙은 시트로 연다. `filters: css`이고, 시작 위치는 그 폴더다.
   - [Set Up Project] 처리 순서:
     1. main이 받은 폴더가 저장된 폴더이고 지금 `uninitialized`인지 확인한다.
     2. `runLs({cwd})`로 위로 다시 묻는다(흐름 9).
     3. 위쪽 저장소가 없을 때만 `doan init --json --repo <저장된 폴더> [--token-css <절대 경로>]`를 실행한다.
   - 결과 처리: `initOutcome(CliRun)`이 봉투를 해석한다.
     - `ok`이면 성공이다. 이미 설정되어 있던 `initialized: false`도 성공으로 본다. 그 폴더를 다시 읽는다.
     - 실패하면 `error.message`와 앱 안내("Choose a CSS file inside <project>." 등)를 보인다. CLI의 `nextSteps`는 CLI 플래그를 가리키므로 보이지 않는다.
     - 시간 초과와 실행 실패는 `cliError`로 구분한다.
   - 폼이 열린 동안 대상 행이 `uninitialized`가 아니게 되면(재루팅, 터미널 init, 폴더 사라짐) 대화상자를 닫고 그 행에 포커스를 둔다.
   - 저장소 밖 파일인지는 CLI가 판정한다. TS는 경로를 검사하지 않는다(POSTMORTEM 2026-10-22).
   - init이 성공해 그 행을 다시 읽어도 열린 캔버스와 draft는 건드리지 않는다.
9. **위로 다시 묻기 (2026-10-24 사용자: 읽기 때 + init 직전)**: shell의 `refresh`가 `uninitialized`를 받았을 때만 `runLs(cli, {cwd: path})`를 한 번 더 실행한다(시작 · Reopen). init IPC도 실행 직전에 같은 확인을 한다. `readFolder`의 시그니처는 그대로 둔다(`authorizeComments`도 쓰기 때문이다).
   - 위쪽 저장소가 있을 때: 결과가 `ok`이고 `root`가 `path`와 다르면 재루팅한다. 같은 자리에서 `close(old)`를 하고 `add(root)`를 한다. 미초기화 폴더에는 열린 캔버스 · 초안 · 서버 key가 없으므로 닫아도 잃을 것이 없다. 같은 `root`가 이미 있으면 뒤의 것을 지우고 `folders.json` 순서는 유지한다. 포커스가 옛 행에 있었으면 그 루트 행으로 옮긴다.
   - init 직전에 재루팅되면: 대화상자를 닫고 "This folder is inside <root>, which is already set up."을 보인다.
   - 위쪽 저장소의 설정이 깨졌을 때: 그 오류를 원래 폴더의 상태로 보이고, 저장 경로는 바꾸지 않는다(app-shell 결정 '실패하는 저장소의 하위 폴더는 저장하지 않는다'와 같은 이유).
10. **4단계 — 첫 문장**: 내용과 위치는 다음과 같다.
    - 마법사의 First prompt 단계는 3단계에서 연 프로젝트의 문장을 보인다. 프로젝트를 열지 않았으면 "Open a project first."를 보인다.
    - 사이드바의 "No canvases" 행에는 [Copy first prompt]가 있다. 전체 문장은 툴팁으로 보인다. 첫 캔버스가 생기면 watcher가 행을 바꾸므로 버튼이 사라진다.
    - 문장은 영어이고 저장소 절대 경로를 넣는다. 초안 문구(확정은 초안 확인 때): `Use the doan skill to make a design canvas in <repo> for <what you want to design>.`
    - 버튼 옆에 "Replace <…> before sending."을 보인다.

    복사는 comments-ui의 복사와 같은 main 경로(클립보드 Promise를 기다린 뒤 성공)를 쓰고, 상태 문구는 `Copy → Copying… → Copied / Retry copy`다. 문자열은 main이 `firstSentence(root)`로 만든다.
11. **"Not initialized" 문구**: 행 문구는 "Set up this project to add design/ and .doan/." + [Set Up…]이다. [Set Up…]은 Reopen과 같은 recovery 영역에 둬서 Tab으로 닿게 한다. 열린 캔버스 메시지는 "The project <name> is not initialized. Choose Set Up… in the sidebar."다. 승격할 때 PRODUCT §7 2026-10-22 status chips 줄의 문구도 바꾼다.
12. **IPC 경계**: 각 IPC는 다음만 받는다.
    - 온보딩 단계 실행: `{step, agent?, expected}`. `step`과 `agent`는 enum이고, `expected`는 화면에서 본 상태와 readlink 값이다. 경로와 명령은 main이 계산한다. 설정 동작은 main에서 한 번에 하나씩만 실행한다.
    - init: 저장된 폴더 식별자와 토큰 CSS 선택 결과. 선택 결과는 main이 연 파일 선택 창의 결과를 main이 보관해 두고, renderer는 선택 ID로만 가리킨다.
    - 복사: `{kind: "firstPrompt", root}`나 `{kind: "pathLine"}`. 임의 문자열은 받지 않는다.

    발신 프레임 확인은 기존 IPC와 같다. 이것은 ARCHITECTURE §7 Comment preload contract의 "임의 IPC 채널을 노출하지 않는다"와 같은 원칙이다.
13. **skill 본문 고치기 (실사용 관찰, 2026-10-24 사용자)**: 관찰 환경과 진행 방식은 다음과 같다.
    - 환경: 3단계를 마친(토큰 CSS 있음) 빈 git 임시 저장소를 쓴다. 패키지된 CLI를 PATH 맨 앞에 둔다. 스텁은 저장소 단위 위치(Claude `.claude/skills/doan`, Codex `.agents/skills/doan`)에 둬서 전역 설정을 건드리지 않는다.
    - 실행: 실제 Claude Code(`claude -p`, `--allowedTools`는 Bash와 파일 편집)와 Codex(`codex exec`)에 첫 문장만 준다.
    - 반영: 막힌 곳을 기록하고 본문을 고친 뒤 다시 돌린다. 최대 3회차까지 한다.
    - 허락: Claude 세션에서 `codex exec`를 부르는 것은 모델 경계를 넘는다(AGENTS.md). 회차 묶음 단위로 사용자 허락을 받는다.
    - 성격: 사람이 지켜보는 수동 관찰이다. 에이전트 세션 기록이 남으므로 자동 검증의 '실제 상태 불변' 대상에서 뺀다.

## 테스트 격리

- 모든 자동 실행(단위 테스트, e2e, PoC)은 다음 환경을 쓴다.
  - 임시 HOME, 임시 userData
  - `SHELL=<임시 가짜 셸 스크립트>`: 탐지 출력을 통제한다. 임시 HOME에서도 실제 로그인 셸은 `/etc/paths.d`로 `/opt/homebrew/bin`의 실제 codex를 찾기 때문이다.
  - `CLAUDE_CONFIG_DIR` · `CODEX_HOME`: 지우거나 임시 경로로 덮는다. 실행 세션에서 상속되기 때문이다.

  쓴 환경 변수는 결과에 기록한다.
- e2e 실행 helper(`runtime.ts`, `comments-ui.ts`, `anchors.ts`)는 위 환경을 주고, 온보딩을 다루지 않는 단계에서는 임시 userData에 `onboarding.json`을 미리 쓴다.
- 기존 단언 `runtime.ts:374`(`/doan init/`)는 흐름 11의 새 문구로 바꾼다. AGENTS.md의 수동 dev 명령에는 HOME 격리 주의를 덧붙인다. `/design-sync` 측정 스크립트는 `.scratch/`에 있어 커밋되지 않으므로, 다음 실행부터 같은 helper를 쓰라고 `/design-sync`의 기준인 `app/e2e/runtime.ts`에 둔다.
- 실제 상태 비교는 spec 완료 조건 12의 키 단위 목록을 쓴다. 디렉터리 전체 해시는 쓰지 않는다. `~/.claude`와 `~/.codex`는 세션 중에도 바뀌어 판정할 수 없기 때문이다. 링크는 readFile이 아니라 lstat · readlink로 본다. 깨진 링크가 "없음"으로 뭉개지지 않게 하기 위해서다.

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

- Go `repo` 새 helper(가칭 `InsideRelative(root, abs)`): 절대 경로를 `EvalSymlinks`로 풀고, 디스크 표기의 실제 root 기준 상대 경로를 돌려준다. 결과는 `Inside`/`Outside`/`Missing`이다. 경계 사례는 다음과 같다.
  - 저장소 안 절대 경로, 다른 대소문자, root와 토큰의 다른 접두(`/var` ↔ `/private/var`), `--repo` 쪽 대소문자 차이
  - 절대 경로 안의 `..`, 저장소 root 자체
  - 실제로 있는 저장소 밖 파일, 링크로 밖을 가리키는 경로, 없는 절대 경로, `ENOTDIR`, 링크 고리
- TS (`app/src/main/onboarding/states.ts`, `app/src/main/cli.ts`, `app/src/main/folderState.ts`):
  - `cliCommand(env, packaged, resourcesPath)`
  - `linkState(lstat, readlink, expected)` → `missing | ours | link-other | blocked`(부모가 파일인 경우 포함)
  - `stubState(dirLstat, fileLstat, content, bundled)` → `missing | ours | differs | blocked`
  - `mcpState(agent, output, expected)` → `missing | ours | other | unknown`. PoC 7c의 실제 출력을 `app/src/main/onboarding/fixtures/`에 넣어 쓴다. fixture는 격리된 설정에서만 만든다. 그래야 사용자의 다른 MCP 서버 URL · env가 공개 예정 저장소에 들어가지 않는다.
  - `parseShellProbe(stdout, nonce)` → `{path, claudeConfigDir?, codexHome?} | 실패 이유`
  - `findOnPath(PATH, name, exists)`
  - `pathIncludes(PATH, dir)`, `rcFileFor(shell)`, `isTranslocated(path)`
  - `mcpAddArgs(agent, command)` / `mcpRemoveArgs(agent)`(Claude는 `--scope user`)
  - `initArgs(folder, tokenCss | null)`, `initOutcome(CliRun)`
  - `reconcileFolders(stored, path, upwardResult)` → 새 목록과 포커스 대상
  - `firstSentence(root)`
- TS renderer (`app/src/renderer/onboardingView.ts`): `wizardView(상태들)` → 단계별 표시 문구, 가능한 동작, 인라인 비활성 이유. 내부 상태 이름이 화면 문구로 새지 않게 여기서 바꾼다.

## 형식 변경

- JSON Schema 변경은 없고, `v`도 그대로다.
- `doan init`의 `result` 모양은 그대로다. ARCHITECTURE §12 산문에 "`--token-css`는 저장소 안 절대 경로도 받는다"를 더한다. MCP `init` 도구 설명도 같이 바꾼다.
- `onboarding.json`은 머신 로컬이고 공유 형식이 아니다(`folders.json`과 같은 취급).

## 규칙 영향

- ARCHITECTURE §1 캔버스 규칙과 `doan check` 규칙은 바뀌지 않는다. skill 본문의 규칙 설명은 관찰에 따라 문장이 바뀔 수 있다. 규칙 자체를 바꿔야 하면 따로 묻는다.

## 결정 영향

- **git 조작 없음 · 토큰 처리 없음**: 그대로다. 온보딩은 git을 실행하지 않고 GitHub 토큰을 읽지 않는다. 다만 관찰용 임시 저장소의 `git init`은 개발 절차이고 제품 동작이 아니다.
- **새로 생기는 것 — 앱이 저장소 밖에 쓴다**: 지금까지 앱은 저장소 파일과 userData만 썼다. 이 기능부터는 사람이 누른 단계에 한해 다음을 한다.
  - `~/.local/bin/doan`, `~/.agents/skills/doan/SKILL.md`, `~/.claude/skills/doan`(또는 `$CLAUDE_CONFIG_DIR/skills/doan`)에 쓴다.
  - 에이전트 CLI를 실행해 그 에이전트의 사용자 설정을 바꾼다.

  경계는 셋이다.
  - doan이 만들지 않은 것은 덮어쓰지 않는다.
  - 바꿀 때는 확인을 받고, main이 쓰기 직전에 다시 판정한다.
  - 지우거나 바꾸는 동작은 심볼릭 링크 교체, `SKILL.md` 한 파일 교체, 같은 이름의 MCP 등록 교체뿐이다.
- **샌드박스 · 서빙 범위 · CSP**: 바뀌지 않는다. 마법사는 앱 renderer 안에 있고 캔버스 iframe과 무관하다.
- **앱–CLI 계약**: 3단계는 PRODUCT §7(2026-10-21) 결정대로 번들 `doan init --json`을 실행한다. 위로 다시 묻기도 CLI의 `ls`를 쓴다.
- **중첩 저장소**: CLI는 여전히 중첩 저장소를 만들 수 있다(cli-core Q10). 앱 UI는 위쪽 저장소가 있으면 init하지 않는다.

## POSTMORTEM에서 가져온 함정

- 2026-10-22 "Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently": 위로 다시 묻기와 3단계 경로 판정은 CLI에 묻는다. 확인 명령 `grep -rnE '"\.doan"|config\.json' app/src | grep -v test`의 결과는 watcher만이어야 한다.
- 2026-10-21 "Filesystem APIs did not match 'missing' and 'same file' as the product means them"과 그 Recurrence: 다음을 테스트한다.
  - 링크 · 스텁 상태와 `--token-css` 절대 경로: `ENOTDIR`, 깨진 링크, 다른 대소문자, 링크 고리
  - 쓰기 대상의 깨진 링크
  - root 표기 차이
- 2026-10-21 "A character device is not necessarily a terminal": 앱이 실행하는 `doan init`과 에이전트 CLI는 stdin을 무시하고, `doan init`에는 `--json`을 준다.
- 2026-10-23 "A utility-process kill request left its caller pending": 셸 탐지와 에이전트 CLI 실행은 시간 제한 뒤 호출자를 반드시 한 번 정리한다.
- 2026-10-23 "Comment copy reported success before the clipboard committed": 첫 문장과 PATH 한 줄 복사도 같은 기다리는 경로를 쓴다.
- 2026-10-23 "Re-hovering a dismissed tooltip did not reopen it": 첫 문장 툴팁을 e2e에서 읽을 때는 `hoverTooltip`을 쓴다. 비활성 이유는 툴팁이 아니라 인라인 문구로 둔다.

## PoC 의존

PRODUCT §6 표에 PoC 7을 더하고, 이 기능의 첫 게이트로 둔다. 기준을 넘지 못하는 항목이 있으면 멈추고 사용자에게 묻는다. 모든 항목은 '테스트 격리'의 환경에서 돈다.

| 항목 | 통과 기준 |
|---|---|
| 7a 셸 탐지 | Dock에서 띄운 것과 같은 최소 환경(`env -i HOME=… SHELL=…`)에서 로그인 셸을 한 번 실행한다. nonce 사이의 출력에서 PATH(`~/.local/bin`, `/opt/homebrew/bin` 포함)와 두 설정 변수를 얻는다. `-i`가 필요한지, 잡음 출력, fish의 경우, 걸린 시간을 기록한다 |
| 7b 스킬 위치 | 임시 HOME(과 임시 `CLAUDE_CONFIG_DIR`)에서 확인한다. `~/.agents/skills/doan/SKILL.md`만 둔 상태에서 Codex가 그 스킬을 찾는다. `<claude 설정 디렉터리>/skills/doan` 상대 링크로 Claude Code가 찾는다 |
| 7c MCP 등록 | 7a의 최소 환경 + 셸 PATH로, stdin을 무시하고 실행한다. 두 에이전트에서 MCP 추가 · 읽기 · 제거가 된다. 확인할 것: 읽기 출력에서 범위 · command · args를 구분할 수 있다; 읽기 명령이 설정 바이트를 바꾸지 않는다; `claude mcp get`의 health-check 부작용과 시간; `codex mcp add`가 같은 이름을 덮어쓰는가 |
| 7d 패키지 | electron-builder `--dir` arm64 서명 없는 `.app`이 이 머신에서 뜨고 `process.resourcesPath/bin/doan`을 실행한다(electron-builder는 `.scratch/` 안에만 설치한다) |

7b · 7c의 Codex 실행은 Claude 세션에서 모델 경계를 넘으므로, 실행 전에 사용자 허락을 받는다.

## 초안 요청 (`/design-draft`, `design/onboard.html`)

확정(2026-10-24 사용자): Astra와 Opus가 같은 요청으로 각각 그린 초안 중 Opus 초안을 기준으로 삼고, Astra 초안의 셸별 PATH 안내 타일(zsh · bash · 그 밖의 셸)을 옮겨 넣는다. Opus 초안이 문서에 없어 정한 문구(단계 제목 · 리드, 대화상자 제목, 상태어 "Not on PATH" · "Failed" · "Registering…", 재루팅 안내를 루트 행 아래 힌트로 두는 것 등)는 "proposal" 표시와 함께 초안의 결정으로 받아들인다.

`/feature-review` 뒤, `/tdd` 전에 그린다. canvas id는 `onboard`다. 프레임 id와 그릴 상태는 다음과 같다.

| 프레임 id | 상태 |
|---|---|
| `wizard-cli` | `missing`, `ours`, `link-other`, `blocked`, Translocation, PATH 없음(rc 파일 이름과 복사할 한 줄), 개발 빌드 비활성, Checking…, Couldn't check |
| `wizard-agents` | 공유 Skill 행(`missing` · `ours` · `differs` · `blocked`). 에이전트 행: Found · Not installed · Couldn't check, MCP `missing` · `ours` · `other` · `unknown`, 1단계 미완료로 비활성, 실행 중, 부분 실패, Connected(새 세션 안내), 설정 위치 표시 |
| `wizard-project` | [Open Project…] 전, Already set up, 설정 폼(None · 파일 선택 후 · 실행 중 · CLI 오류 · 위쪽 저장소로 재루팅 안내) |
| `wizard-prompt` | 프로젝트 없음, 첫 문장과 Copy · Copying… · Copied · Retry copy |
| `confirm-replace` | 링크 · 스텁 · MCP 교체 확인(현재와 새 대상을 둘 다 보인다. 기본 포커스는 Cancel, 확인 버튼에는 구체적인 동사) |
| `sidebar-setup` | "Not initialized" 행의 새 문구와 [Set Up…], 열린 캔버스의 새 메시지 |
| `project-setup-dialog` | 사이드바에서 연 설정 폼 대화상자(`wizard-project` 폼과 같은 상태) |
| `sidebar-first-prompt` | "No canvases" 행의 [Copy first prompt]와 툴팁, 복사 상태 |
