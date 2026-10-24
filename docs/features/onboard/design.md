# onboard — design

## 영향받는 구성 요소

| 구성 요소 | 바뀌는 것 |
|---|---|
| CLI `doan init` (`cli/internal/cli/init.go`) | `--token-css`가 저장소 안 절대 경로를 받는다. 기존 `repo.Resolve`로 저장소 기준 상대 경로(디스크 표기)로 바꿔 저장한다 |
| skill 본문 (`cli/internal/cli/skill.md`) | 실사용 관찰 결과에 따라 전반을 고친다(2026-10-24 사용자). 끝 표시줄 규칙은 그대로 둔다 |
| skill 스텁 (새 파일, 앱 리소스) | 수백 단어짜리 발견용 `SKILL.md`. 본문은 싣지 않고 `doan skill`을 부르라고만 한다 |
| 앱 main — CLI 찾기 (`app/src/main/cli.ts`) | `DOAN_CLI` → 패키지된 앱이면 `process.resourcesPath/bin/doan` → (개발 빌드만) `PATH`의 `doan` |
| 앱 main — 폴더 (`shell.ts`, `cli.ts`) | `repo_not_found`이면 위로 다시 묻기, 저장 경로 바꾸기 · 합치기. 3단계 `doan init` 실행 |
| 앱 main — 머신 설정 (새 모듈) | 상태 읽기(링크 · 스텁 · MCP · 에이전트 감지 · PATH)와 동작(링크 · 스텁 쓰기 · MCP 등록). `onboarding.json` |
| 앱 preload · IPC | 설정 상태 읽기, 단계 실행, 3단계 init, 토큰 CSS 파일 선택, 첫 문장 복사 |
| 앱 renderer | 설정 화면, "Not initialized" 행의 설정 동작과 대화상자, 캔버스 없는 프로젝트의 첫 문장. 생김새는 초안을 따른다 |
| 앱 메뉴 | 앱 메뉴에 "Set Up Doan…" |
| 패키지 빌드 (새 설정) | electron-builder로 `--dir` 빌드, `go build`한 CLI를 `extraResources`의 `bin/doan`으로 싣는다 |
| `design/` | 초안 캔버스 `design/onboard.html`(`/design-draft`) |
| `doan mcp` · 형식(`schema/`) | 바뀌지 않는다 |

## 흐름

1. **CLI 찾기**: `cliCommand(env, packaged, resourcesPath)`는 `DOAN_CLI`가 있으면 그것을, 패키지된 앱이면 번들 경로를, 아니면 `doan`을 돌려준다. 패키지된 앱은 `PATH`로 내려가지 않는다. 다른 버전의 `doan`이 PATH에 있어도 앱과 CLI의 계약(`init` · `ls` 결과)이 어긋나지 않게 하기 위해서다.
2. **패키지 빌드**: `npm --prefix app run package`가 ① `go build -ldflags "-X …/cli.Version=<app/package.json version>" -o <빌드 디렉터리>/bin/doan ./cli/cmd/doan`, ② `electron-vite build`, ③ `electron-builder --mac dir --arm64`(서명 없음) 순으로 돈다. 결과는 `app/dist/`(무시 목록에 추가)다. electron-builder를 고른 이유: ARCHITECTURE §9가 정한 `electron-updater`가 electron-builder의 `app-update.yml` 형식을 읽는다. Orca 번들에도 같은 형식의 `Contents/Resources/app-update.yml`(`provider: github`)이 있다(2026-10-24 로컬 번들 확인). 버전은 정확히 고정한다(`app/.npmrc`). 서명 · 공증 · dmg 대상은 #9가 더한다.
3. **설정 화면 진입**: main이 시작할 때 `<userData>/onboarding.json`이 없거나 읽을 수 없으면 창이 설정 화면을 연다. 사람이 설정 화면을 닫으면(모든 단계 완료든 건너뛰기든) main이 `{"v":1}`을 쓴다. `folders.json`처럼 머신 로컬 파일이고 공유 형식이 아니라 스키마를 두지 않는다(ARCHITECTURE §11). 앱 메뉴 "Set Up Doan…"은 언제든 다시 연다. 설정 화면은 열릴 때마다 상태를 새로 읽는다.
4. **1단계 — CLI 링크**: 대상은 `~/.local/bin/doan`, 링크 값은 번들 CLI의 절대 경로다. 상태는 다음과 같다.
   - `missing`: 없다 → "Install" 시 `~/.local/bin`을 만들고 링크를 만든다.
   - `ours`: 이 번들의 CLI를 가리키는 심볼릭 링크다 → 완료.
   - `link-other`: 다른 곳을 가리키는 심볼릭 링크(다른 앱 사본, 깨진 링크 포함)다 → 현재 대상을 보이고, 확인을 받으면 바꾼다.
   - `blocked`: 링크가 아닌 파일이나 디렉터리다 → 건드리지 않고 경로를 보인다.
   - PATH 확인: 사용자 로그인 셸의 `PATH`(아래 7)에 `~/.local/bin`이 없으면 `export PATH="$HOME/.local/bin:$PATH"` 한 줄을 복사하게 보인다. fish처럼 문법이 다른 셸에서 무엇을 보일지는 PoC에서 정한다.
   - 개발 빌드(패키지되지 않은 앱)에는 번들 CLI가 없다. 1단계는 사용할 수 없다고 표시하고 링크를 만들지 않는다.
5. **2단계 — 에이전트 연결**: 에이전트마다 "감지됨 / 없음"을 보이고, 감지된 것만 고를 수 있다.
   - 스텁: `~/.agents/skills/doan/SKILL.md`에 쓴다. 디렉터리가 없으면 `missing`, 있고 `SKILL.md` 내용이 번들 스텁과 같으면 `ours`, 다르면 `differs`다. `differs`는 확인을 받은 뒤 `SKILL.md` 파일 하나만 바꿔 쓴다. 디렉터리 안의 다른 파일은 지우지 않는다. 심볼릭 링크이거나 디렉터리가 아니면 `blocked`다.
   - Claude Code 링크: `~/.claude/skills/doan` → `../../.agents/skills/doan`(Orca와 같은 상대 링크, 2026-10-24 이 머신의 `~/.claude/skills/orca-cli` 확인). 상태 분류는 1단계 링크와 같다.
   - Codex는 `~/.agents/skills`를 읽는다고 가정한다. 이 가정은 PoC 7에서 실제로 확인한다. 실패하면 멈추고 사용자에게 묻는다.
   - MCP: 등록 전에 에이전트의 CLI로 `doan` 이름의 등록을 읽는다(정확한 하위 명령과 출력 형식은 PoC 7에서 정한다). 상태는 `missing`, `ours`(command가 `~/.local/bin/doan`의 절대 경로이고 args가 `["mcp"]`), `other`(같은 이름, 다른 명령)다. `missing`이면 `claude mcp add --scope user doan -- <절대 경로> mcp`, `codex mcp add doan -- <절대 경로> mcp`를 실행한다. `other`는 확인을 받은 뒤 같은 에이전트 CLI의 제거 명령 → 추가 명령 순서로 바꾼다. 설정 파일을 직접 고치지 않는다(2026-10-24 사용자).
   - MCP 명령 경로를 번들 경로가 아니라 1단계 링크로 둔 이유: 앱을 옮기면 "Set Up Doan…"에서 링크 하나만 다시 걸면 된다. 그래서 1단계가 `ours`가 아니면 MCP 등록은 비활성이고, 그 이유를 보인다.
6. **에이전트 CLI 실행**: 기존 `runCli`와 같은 방식(stdin 무시, 시간 제한, 시간 초과 시 SIGKILL 후 바로 정리)으로 실행한다. 실행 파일은 7에서 찾은 절대 경로다. 사람이 버튼을 누를 때만 실행한다. 설정 화면을 여는 것만으로는 상태 읽기 명령만 돈다.
7. **에이전트 감지와 PATH**: Finder나 Dock에서 띄운 앱의 `PATH`는 사용자 셸의 `PATH`와 다르다. 앱이 `$SHELL`을 로그인 모드로 한 번 실행해 `PATH`와 `command -v claude`, `command -v codex` 결과를 받는다. `-i`를 붙여 `.zshrc`까지 읽을지, 출력에 섞이는 잡음을 어떻게 구분할지(예: 구분 표시줄)는 PoC 7에서 이 머신으로 확인해 정한다. 이 셸 실행에도 시간 제한을 둔다.
8. **3단계 — 저장소 설정**: "Not initialized" 행의 "Set Up…"이 대화상자를 연다. "Choose Token CSS…"(파일 선택 창, 시작 위치는 그 폴더)나 "No token CSS"를 고른다. main이 `doan init --json --repo <저장된 폴더> [--token-css <절대 경로>]`를 실행하고, 결과 봉투가 `ok`이면 그 폴더를 다시 읽는다. `ok`가 아니면 봉투의 `error.message`와 `nextSteps`를 대화상자에 보이고 다시 고르게 한다. 저장소 밖 파일 판정은 CLI가 한다. TS는 경로를 검사하지 않는다(POSTMORTEM 2026-10-22). 이 설정 동작은 9의 위로 다시 묻기를 거친 뒤에도 `repo_not_found`인 폴더에만 보인다.
9. **위로 다시 묻기 (2026-10-24 사용자)**: `readFolder`가 `--repo <path>`로 `repo_not_found`를 받으면, `runLs(cli, {cwd: path})`를 한 번 더 실행한다. 결과가 `ok`이고 `root`가 `path`와 다르면 `{kind: "rooted", root, listing}`을 돌려준다. shell은 저장된 폴더를 `root`로 바꾸고, 같은 `root`가 이미 있으면 뒤의 것을 지운다(`folders.json` 순서 유지). 이것은 사람이 폴더를 처음 열 때 쓰는 경로(`{cwd}`)를 그대로 다시 쓰는 것이다. 탐색 규칙은 Go에만 있다. 위쪽 저장소가 깨진 설정이면 그 오류를 원래 폴더의 상태로 보인다. 저장 경로는 바꾸지 않는다(app-shell 결정 '실패하는 저장소의 하위 폴더는 저장하지 않는다'와 같은 이유).
10. **4단계 — 첫 문장**: 캔버스가 0개인 프로젝트를 열면 캔버스 영역 빈 상태에 첫 문장과 "Copy"를 보인다. 문장은 영어이고 저장소 절대 경로를 넣는다. 초안 문구(확정은 초안 확인 때): `Use the doan skill to make a design canvas in <repo> for <what you want to design>.` 꺾쇠 자리는 사람이 고쳐 쓴다. 복사는 comments-ui의 복사와 같은 main 경로(클립보드 Promise를 기다린 뒤 성공)를 쓴다.
11. **skill 본문 고치기 (실사용 관찰)**: 패키지된 CLI를 PATH 맨 앞에 둔 임시 저장소에서 실제 Claude Code와 Codex에 첫 문장을 준다. 스텁은 저장소 단위 위치(Claude `.claude/skills/doan`, Codex `.agents/skills/doan`)에 둬서 전역 설정을 건드리지 않는다. 막힌 곳(설정 안 된 저장소, 토큰 CSS 연결, `doan:width`, frame 표시, check 오류 해석 등)을 기록하고 본문을 고친다. 고친 뒤 같은 관찰을 반복한다. Claude 세션에서 `codex exec`를 부르는 것은 모델 경계를 넘으므로 매번 사용자 허락이 필요하다(AGENTS.md).

## 순수 함수로 떼어 낼 부분 (`/tdd` 대상)

- Go: `doan init`의 토큰 경로 정규화(절대 → 저장소 기준, 디스크 표기). 기존 `repo.Resolve`를 쓰므로 새 함수 없이 `Init` 테스트로 고정한다. 경계 사례: 저장소 안 절대 경로, 다른 대소문자 표기, 저장소 루트 자체, 저장소 밖 절대 경로, 심볼릭 링크로 밖을 가리키는 경로, 존재하지 않는 절대 경로.
- TS `cliCommand(env, packaged, resourcesPath)`.
- TS `linkState(lstat 결과, readlink 결과, 기대 대상)` → `missing | ours | link-other | blocked`. CLI 링크와 Claude 스킬 링크가 함께 쓴다.
- TS `stubState(lstat 결과, 내용, 번들 스텁)` → `missing | ours | differs | blocked`.
- TS `mcpState(에이전트 CLI 출력, 기대 command)` → `missing | ours | other | unknown`. 출력 형식은 PoC 7에서 기록한 실제 출력을 fixture로 쓴다.
- TS `parseShellProbe(stdout)` → `{path, claude?, codex?}`. 잡음 섞인 출력, 명령 없음, 빈 출력.
- TS `pathIncludes(PATH, dir)`. 끝 슬래시, 빈 항목, `~` 미확장 항목.
- TS `mcpAddArgs(agent, command)` / `mcpRemoveArgs(agent)`.
- TS `initArgs(folder, tokenCss | null)`.
- TS `reconcileFolder(stored 목록, 원래 경로, 위로 다시 묻기 결과)` → 새 목록. 같은 루트 합치기, 순서 유지, 실패 시 그대로.
- TS `setupView(상태들)` → 단계별 표시(상태 문구, 가능한 동작, 비활성 이유). 1단계 미완료 시 MCP 비활성, 개발 빌드 1단계 비활성.
- TS `firstSentence(root)`.

## 형식 변경

- JSON Schema 변경 없음. `v`도 그대로다.
- `doan init`의 `result` 모양은 그대로다. ARCHITECTURE §12 산문에 "`--token-css`는 저장소 안 절대 경로도 받는다"를 더한다.
- `onboarding.json`은 머신 로컬이고 공유 형식이 아니다(`folders.json`과 같은 취급).

## 규칙 영향

- ARCHITECTURE §1 캔버스 규칙과 `doan check` 규칙은 바뀌지 않는다. skill 본문의 규칙 설명은 관찰에 따라 문장이 바뀔 수 있지만, 규칙 자체를 바꾸려면 따로 묻는다.

## 결정 영향

- **git 조작 없음 · 토큰 처리 없음**: 그대로다. 온보딩은 git을 실행하지 않고 GitHub 토큰을 읽지 않는다.
- **새로 생기는 것 — 앱이 저장소 밖에 쓴다**: 지금까지 앱은 저장소 파일과 userData만 썼다. 이 기능부터 사람이 누른 단계에 한해 `~/.local/bin/doan`, `~/.agents/skills/doan/SKILL.md`, `~/.claude/skills/doan`에 쓰고, 에이전트 CLI를 실행해 그 에이전트의 사용자 설정을 바꾼다. 경계: doan이 만들지 않은 것은 덮어쓰지 않고, 바꿀 때는 확인을 받는다. 지우는 동작은 심볼릭 링크 교체와 같은 이름의 MCP 등록 교체뿐이다.
- **샌드박스 · 서빙 범위 · CSP**: 바뀌지 않는다. 설정 화면은 앱 renderer 안에 있고 캔버스 iframe과 무관하다.
- **앱–CLI 계약**: 3단계는 PRODUCT §7(2026-10-21) 결정대로 번들 `doan init --json`을 실행한다. 위로 다시 묻기도 CLI의 `ls`를 쓴다.

## POSTMORTEM에서 가져온 함정

- 2026-10-22 "Guessing the repo root in TS after a failed CLI run re-created a discovery rule differently": 위로 다시 묻기와 3단계 경로 판정은 CLI에 묻는다. 확인: `grep -rnE '"\.doan"|config\.json' app/src | grep -v test` 결과는 watcher만이어야 한다.
- 2026-10-21 "Filesystem APIs did not match 'missing' and 'same file' as the product means them": 링크 · 스텁 상태와 `--token-css` 절대 경로에서 `ENOTDIR`, 깨진 링크, 다른 대소문자, 링크 고리를 테스트한다.
- 2026-10-21 "A character device is not necessarily a terminal": 앱이 실행하는 `doan init`과 에이전트 CLI는 stdin을 무시하고, `doan init`에는 `--json`을 준다. 대화형 질문을 기다리며 멈추면 안 된다.
- 2026-10-23 "A utility-process kill request left its caller pending": 셸 탐지와 에이전트 CLI 실행은 시간 제한 뒤 호출자를 반드시 한 번 정리한다.
- 2026-10-23 "Comment copy reported success before the clipboard committed": 첫 문장과 PATH 한 줄 복사도 같은 기다리는 경로를 쓴다.

## PoC 의존

PRODUCT §6에 PoC 7을 더하고, 이 기능의 첫 게이트로 둔다. 기준을 못 넘는 항목이 있으면 멈추고 사용자에게 묻는다.

| 항목 | 통과 기준 |
|---|---|
| 7a 셸 탐지 | Dock에서 띄운 것과 같은 최소 환경(`env -i HOME=… SHELL=…`)에서 로그인 셸 실행으로 이 머신의 `claude` · `codex` 경로와 `~/.local/bin`이 든 PATH를 얻는다. 잡음 출력과 구분할 수 있다 |
| 7b 스킬 위치 | 임시 HOME에서 `~/.agents/skills/doan/SKILL.md`만 두었을 때 Codex가 그 스킬을 찾고, `~/.claude/skills/doan` 상대 링크로 Claude Code가 찾는다 |
| 7c MCP 등록 | stdin을 무시한 비대화형 실행으로 두 에이전트의 MCP 추가 · 읽기 · 제거가 된다. 읽기 출력에서 command와 args를 구분할 수 있다. 실제 사용자 설정은 앞뒤 비교로 바뀌지 않았음을 확인한다(임시 HOME 또는 설정 디렉터리 변수) |
| 7d 패키지 | electron-builder `--dir` arm64 서명 없는 `.app`이 이 머신에서 뜨고, `process.resourcesPath/bin/doan`을 실행한다 |

7b · 7c의 Codex 실행은 Claude 세션에서 모델 경계를 넘는다. 실행 전에 사용자 허락을 받는다.

## 초안 요청 (`/design-draft`, `design/onboard.html`)

`/feature-review` 뒤, `/tdd` 전에 그린다. 그려야 할 상태:

- 설정 화면: 1단계 `missing` · `ours` · `link-other` · `blocked` · PATH 없음(복사 한 줄) · 개발 빌드 비활성. 2단계 에이전트 감지됨 · 없음, 스텁 · 링크 · MCP의 `missing` · `ours` · `differs`/`other` · `blocked`, 1단계 미완료로 MCP 비활성, 실행 중, 실패 메시지. 건너뛰기와 닫기.
- 교체 확인 대화상자(링크, 스텁, MCP).
- "Not initialized" 행의 "Set Up…"과 3단계 대화상자: 토큰 CSS 선택 전 · 선택 후 · "No token CSS" · 실행 중 · CLI 오류(`message`와 `nextSteps`).
- 캔버스 없는 프로젝트의 첫 문장과 복사, 복사 성공 · 실패.
