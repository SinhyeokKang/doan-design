# monorepo-services — spec

여러 서비스가 있는 모노레포를 추가할 때, 앱이 저장소의 workspace 설정을 읽어 서비스 후보를 보이고, 사람이 고른 서비스마다 저장소 최상위 `.doan/` 안에 `.doan/services/<id>/{canvases,ds,assets}`를 만든다. Doan root는 저장소 최상위 하나이고, 서비스는 그 root 안의 구역이다.

사람의 요청(원문): "여러 서비스가 존재하는 모노레포. 구조를 읽고, 서비스별 디렉토리 만들어주기 // e.g. project-1/service-1/assets, ds, canvses"

## 사용자

- **사람(앱 사용자)**: 모노레포를 첫 실행의 Project 단계나 Add Projects 페이지에서 고르고, 앱이 보인 서비스 후보 중 몇 개를 골라 셋업한다. 이미 셋업된 프로젝트에서는 Project Settings에서 서비스를 더하거나 뺀다. 사이드바는 그 프로젝트의 캔버스를 서비스별로 묶어 보인다. 에이전트와 대화할 필요가 없다.
- **에이전트**: `doan ls`가 서비스 목록과 서비스 캔버스를 돌려주고, guide가 서비스의 캔버스·design system·assets를 어디에 쓰고 어떻게 링크하는지 알려 준다. 어느 서비스의 일인지는 사람의 말, 열린 캔버스의 폴더, cwd가 서비스 경로 안인지로 정하고, 모르면 묻는다. 공유 token CSS는 지금처럼 저장소 상대 경로로 링크한다.

## 문제 (관찰된 사실)

- 저장소 최상위 폴더를 고르면 앱은 그 폴더를 Doan root 하나로 셋업한다(`app/src/main/onboarding/projects.ts` `inspectFolder`). 모노레포의 서비스 구조는 읽지 않고, Doan에는 서비스라는 구역이 없다. 서비스별로 캔버스·design system·assets를 나눌 자리도, 에이전트에게 어디에 쓸지 알려 주는 규칙도 없다.
- 서비스 디렉터리마다 Doan root를 따로 두면 서비스 root 밖의 공유 token CSS(예: `packages/ui/tokens.css`)를 쓸 수 없다. root 밖 경로는 `token_css_not_found`·`path_outside_repo`가 되고(ARCHITECTURE §1 'doan check rules'), config는 `..`를 거부한다(`schema/config.v1.schema.json`).
- 캔버스 나열·서빙 범위·watcher·경로 규칙은 `.doan/canvases/`·`.doan/ds/`·`.doan/assets/` 세 디렉터리만 안다(`cli/internal/repo/files.go`, `scope.go`, `app/src/main/watch.ts`, `app/src/formats/canvasPath.ts`). `doan work start`·`doan open`·`doan://` 링크는 그중에서도 바로 아래 파일만 받는다(`schema/app-socket.v3.schema.json`·`v4`의 `^\.doan/(canvases|ds)/[^/]+\.html$`).

## 이미 정한 것 (사용자 결정)

1. **배치: 저장소 최상위 `.doan/` 하나, 그 안에 서비스 먼저인 폴더 `.doan/services/<id>/{canvases,ds,assets}`.** (사람) 서비스에 속하지 않은 캔버스·design system·assets는 지금처럼 `.doan/canvases/`·`.doan/ds/`·`.doan/assets/`에 둔다. root가 저장소 최상위로 남으므로 공유 token CSS가 지금처럼 동작한다. 사람의 예 "project-1/service-1/assets, ds, canvases"와 같은 모양이다.
   - 고르지 않은 안: 서비스 디렉터리마다 Doan root(`services/web/.doan/`), 종류 먼저(`.doan/canvases/<id>/` 등).
   - 이 결정으로 계획이 다뤄야 하는 것: 캔버스 나열과 `doan ls`, 서빙 범위와 export 경계, 서비스별 token CSS로 하는 `doan check` 판단, 댓글 경로, watcher, `canvasPath.ts`와 그 사용처, `work`·`open`·링크의 경로 규칙, 이전 CLI·앱의 동작(design §2–§4).
2. **누가 하나: 앱이 제안하고 사람이 고른다.** (사람) 앱이 workspace 설정을 읽어 서비스 후보를 보이고, 사람이 고르면 앱이 셋업한다. 에이전트 대화는 필요 없다. 서비스와 라이브러리를 구분하지 않는다. 고르지 않은 안: guide에 에이전트 절차를 넣는 것.
3. **후보 찾기: 작은 adapter 묶음과 대체 검색.** (사람) adapter는 member 패턴을 돌려준다: `package.json` workspaces, `pnpm-workspace.yaml`, `go.work`, Cargo `[workspace] members`, uv `[tool.uv.workspace]`, Gradle `include`, Maven `<modules>`. 그리고 깊이 1–3에서 manifest 파일을 찾는 대체 검색이 있다. 모델로 후보를 고르는 것은 비목표다.

## 완료 조건

결정 1–3(위)과 design.md '결정 (사람)' 4–16을 따른 조건이다.

1. 첫 실행 Project 단계나 Add Projects에서 창이 시작한 inspection으로 셋업되지 않은 폴더를 골랐고 지금 흐름이라면 그 폴더 자체의 셋업을 제안할 때, 앱은 서비스 후보를 찾는다. CLI(`doan onboarding project inspect`/`select`)가 이끄는 첫 실행에는 서비스 목록이 없다. 후보가 있으면 셋업 패널에 서비스 목록을 함께 보인다. 각 줄은 id, 저장소 상대 경로, 찾은 출처를 보이고, 처음에는 아무것도 체크되지 않는다.
2. 셋업하면 지금의 `doan init` 결과에 더해, 고른 서비스마다 `.doan/services/<id>/canvases/`·`ds/`·`assets/`가 생기고 `.doan/config.json`(v2)에 서비스(`id`, `path`)가 적힌다. 서비스를 고르지 않으면 지금과 같은 셋업(v1)이다.
3. 셋업된 프로젝트의 Project Settings에 Services 구역이 있다. 서비스와 경로, 서비스 token CSS를 보이고, workspace에서 서비스를 더할 수 있다. 서비스 폴더에 캔버스가 없을 때만 뺄 수 있다. 사이드바 project menu의 Set Up(`ProjectSetupDialog.tsx`)은 지금처럼 셋업하고 서비스를 더하지 않는다.
4. `doan ls`는 서비스 목록과 `.doan/services/<id>/canvases/`·`ds/` 아래 캔버스를 다른 캔버스와 함께 나열한다. 서비스 `ds/` 아래 캔버스는 design-system 캔버스다. config에 없는 `.doan/services/<x>/`는 나열하지 않고 `serve`에 적어도 서빙하지 않으며, `doan check`가 경고한다. 디스크의 폴더 이름이 config id와 대소문자까지 같을 때만 서비스 폴더다.
5. 서빙 범위에는 config에 있는 서비스의 `canvases/`·`ds/`·`assets/`와 서비스 token CSS가 들어간다. 링크된(symlink) `.doan/services`, 서비스 폴더, 그 하위 기본 디렉터리는 서빙하지 않는다. export는 이 범위를 경계로 서비스 캔버스를 다른 캔버스처럼 내보낸다.
6. 서비스마다 token CSS를 따로 정할 수 있고, 정하지 않은 서비스는 프로젝트 token CSS를 쓴다. `doan check`의 `hardcoded_color`와 `token_css_not_found`는 서비스 캔버스에 그 서비스의 token CSS를 쓴다.
7. 댓글 파일은 `.doan/comments/<canvas id>.jsonl` 그대로다. 캔버스 id는 서비스를 넘어 저장소 전체에서 유일하고, `orphan_comment_file`은 서비스 캔버스까지 보고 판단한다.
8. 앱은 서비스 캔버스의 변경을 지금 캔버스처럼 감지해 사이드바와 열린 캔버스를 갱신하고, 서비스 assets 변경을 서빙 변경으로 다룬다.
9. `doan work start`·`doan open`·`doan://` 링크는 `.doan/canvases/`·`.doan/ds/`와 서비스의 `canvases/`·`ds/` 아래 캔버스를 하위 폴더까지 받는다(design 결정 16). Move to Trash, Export, 썸네일, 대화의 캔버스 바인딩, Quick Open, composer 제안도 서비스 캔버스를 다룬다.
10. 서비스가 있는 프로젝트의 사이드바는 서비스마다 group 하나와 공유 group 하나를 보이고, group 안에서 design-system 캔버스가 먼저 온다. 서비스 group과 공유 group의 닫힘도 지금 두 group처럼 저장되고 앱을 다시 열어도 남는다. 서비스가 없는 프로젝트는 지금 그대로다.
11. guide는 서비스 폴더, 서비스 캔버스에서의 상대 링크, 서비스를 정하는 방법을 알려 준다. `/agent-eval`의 서비스 배치 scenario에서 Claude Code와 Codex가 서비스 캔버스를 그 서비스 폴더에 쓰고 `doan check`를 통과한다.
12. 서비스가 없는 config는 v1 그대로이고 파일 바이트가 바뀌지 않는다. 서비스가 있으면 v2이며, 이전 CLI는 그 프로젝트의 모든 저장소 명령을 `unsupported_version`으로 거절하고 v2 config를 덮어쓰지 않는다. 이전 앱은 그 프로젝트를 Config error로 보인다. 같은 기기에서 앱을 이전 버전으로 내리면, 서비스 캔버스에 묶인 대화가 하나라도 있는 동안 그 기기의 대화 기록 전체를 읽지 못한다. 앱을 다시 올리면 돌아온다. 사람이 이 비용을 받아들였다(design 결정 6).
13. 이미 셋업된 프로젝트에 서비스를 더해도 기존 캔버스는 옮겨지지 않고 공유 group에 남는다.
14. 후보 찾기는 고른 폴더의 설정 파일만 읽는다. 패턴 조각은 그대로의 이름이나 `*`·`?`·`[...]`만 펼치고 `**`는 펼치지 않는다. adapter가 아무 member도 내지 않으면 깊이 1–3에서 manifest가 있는 디렉터리를 찾는다. 숨은 디렉터리, `node_modules` 같은 빌드·의존성 디렉터리, 심볼릭 링크를 지나는 경로, 고른 폴더 자신은 후보가 아니다. 읽지 못한 설정 파일과 펼치지 않은 패턴은 개수와 이유로 보인다. 후보는 최대 200개이며, 넘으면 잘렸다고 보인다.
15. `doan onboarding project inspect`/`select`(app-socket v2)의 결과 모양과 동작은 바뀌지 않는다. 앱은 git 명령을 실행하지 않는다.

## 바뀌는 PRODUCT·ARCHITECTURE 결정

승격 task에서 현재 규칙으로 고쳐 쓴다.

- PRODUCT §5 item 0: 첫 실행 Project 단계의 서비스 목록, Project Settings Services.
- PRODUCT §5 item 1: Add Projects 서비스 목록, 사이드바 서비스 group(지금 "Design system (`.doan/ds/`) before Canvases (`.doan/canvases/`)" 문장), Canvas row menu의 "`.doan/canvases/` or `.doan/ds/`" 경계, composer 제안의 "`.doan/canvases/`만 화면 초안" 문장.
- PRODUCT §5 item 8–11: `config`의 서비스, `ls`의 서비스, `work`·`open`의 경로, check의 새 경고. item 9의 명령 목록에 새 공개 명령 `doan detect-services`.
- ARCHITECTURE §1 'Project directory'와 Canvas conventions 1·7, `doan check` 규칙 표. §3 서빙 범위·export 경계·config v2. §4 v3·v4 경로. §6 guide. §7 'Canvas row menu IPC'·'Deep links'·conversation 바인딩·'Settings IPC'(config bridge의 서비스 쓰기와 새 channel, `senderAllowed.ts`). §11 fixtures. §12 `init`(그대로)·`config`·`ls`·`detect-services`. §13 Listing·Watching. ui-state의 사이드바 group 닫힘 id.
- DESIGN.md: 사이드바 서비스 group, 서비스 목록 화면, Services 구역.

## 비목표

- 서비스 디렉터리마다 Doan root, 종류 먼저 배치(결정 1에서 고르지 않음).
- guide의 셋업 절차(결정 2, 완료 조건 15).
- 모델(연결된 에이전트)에게 후보를 고르게 하는 것(결정 3). BACKLOG 후보로 design에 적는다.
- 서비스와 라이브러리를 구분하는 것.
- 기존 캔버스를 서비스 폴더로 옮기는 것과 그때의 상대 링크 고치기, 서비스를 뺄 때 폴더를 지우거나 옮기는 것.
- 서비스별 댓글 디렉터리.
- GitHub URL clone 흐름의 서비스 목록. clone은 지금처럼 셋업하고, 서비스는 Project Settings에서 더한다.
- 사이드바 project menu의 Set Up(Not set up worktree에서 여는 `ProjectSetupDialog.tsx`)의 서비스 목록. 지금처럼 셋업하고, 서비스는 프로젝트 설정이 모인 Project Settings에서 더한다.
- CLI(`doan onboarding`)가 이끄는 첫 실행의 서비스 목록. 창과 에이전트가 한 상태를 보도록(PRODUCT §5 item 0) 그때는 목록을 보이지 않고, 서비스는 Project Settings에서 더한다.
- 서비스별 `serve` 경로. `serve`는 프로젝트 하나에 하나다.
- Home·Overview composer에서 서비스를 고르는 것, 서비스별 suggested prompt.
- 서비스 id 바꾸기. 바꾸려면 사람이나 에이전트가 폴더를 옮기고 config를 고친다.
- 이전 CLI·앱이 서비스가 있는 프로젝트를 읽게 하는 것(완료 조건 12).
