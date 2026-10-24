# onboard — spec

이 기능은 PRODUCT §5 기능 #8 `onboard-dist`를 둘로 나눈 앞쪽이다(2026-10-24 사용자). 다루는 범위는 첫 실행 온보딩, 앱 번들 CLI, 그리고 이 둘을 확인할 서명 없는 로컬 패키지 빌드다. 공증 dmg · brew cask · electron-updater · Releases CI는 새 기능 #9 `dist`로 옮긴다. #9는 온보딩 다음에 이어질 앱 전체 사이클 완성도 작업까지 끝낸 뒤로 미룬다(2026-10-24 사용자: "배포 관련은 다 뒤로 미뤄"). 서명 없는 로컬 `.app` 빌드는 이 기능에 남긴다. 배포가 아니라, 온보딩 1단계와 MCP 경로를 실제 앱으로 확인하는 수단이기 때문이다(2026-10-24 사용자).

나눈 이유는 세 가지다.
- 저장소가 비공개라(2026-10-24 `gh repo view` 기준 `PRIVATE`) 공개 Releases에서 업데이트를 받을 수 없다.
- 이 머신에는 Developer ID 서명 인증서가 없다(`security find-identity -v -p codesigning` → 0개).
- 라이선스가 정해지지 않았다.

지금 배포를 하면 검증할 수 없는 작업만 남는다.

## 사용자

- **사람**(앱 사용자): 앱을 처음 띄우면 네 단계 마법사에서 CLI 설치, 에이전트 연결, 첫 저장소 설정, 첫 문장 복사를 끝낸다. 두 번째 저장소부터는 사이드바 프로젝트 행에서 같은 설정과 복사를 한다.
- **에이전트**(Claude Code · Codex): 설치된 skill 스텁을 발견하면 `doan skill`(또는 MCP `skill` 도구)로 본문을 읽는다. 사용자 범위로 등록된 `doan` MCP 서버를 쓴다. 고친 본문만 읽고도 첫 캔버스를 만들어 `doan check`을 통과시킨다.

## 문제 (관찰한 사실, 2026-10-24 main `7c1e78c`)

1. 앱은 CLI를 `DOAN_CLI` 환경 변수에서 찾고, 없으면 `PATH`의 `doan`에서만 찾는다(`app/src/main/cli.ts` `cliCommand`). 앱 번들 안에는 CLI가 없고, 패키지 빌드 설정도 없다. `app/package.json`에는 `build` · `dev` · `e2e` · `test` · `typecheck` 스크립트만 있고 `version` 필드도 없다.
2. skill 스텁을 설치하는 코드가 없다. `doan skill`은 본문을 내지만, 에이전트가 그 명령을 알게 해 줄 `SKILL.md`는 사람이 직접 만들어야 한다.
3. MCP는 사람이 `claude mcp add` · `codex mcp add`를 직접 실행해야 등록된다.
4. `.doan/`이 없는 저장소는 사이드바에 "Not initialized"와 "Run in a terminal: `doan init`"으로만 보인다(`app/src/renderer/projectRow.ts`). 열린 캔버스의 저장소가 초기화 상태를 잃으면 "Run doan init in a terminal."이 뜬다(`CanvasController.ts`). 앱 안에서는 설정할 수 없다.
5. `doan init --token-css`에 저장소 안의 절대 경로를 주면 `usage_error`다. `repo.Resolve`가 절대 경로를 바로 `Outside`로 판정하기 때문이다(PRODUCT §8 열린 질문). 그런데 앱의 파일 선택 창은 절대 경로를 돌려준다.
6. 초기화되지 않은 하위 폴더(`repo/web`)를 열어 둔 채 부모(`repo`)에서 `doan init`을 하면, 앱은 계속 "Not initialized"를 보인다(PRODUCT §8 열린 질문). 원인은 두 가지다.
   - 앱이 이 폴더를 `--repo repo/web`으로 읽는다.
   - `repo/web`의 watcher는 부모에 생긴 `.doan/`을 보지 못한다.

   이번에 앱에 설정 버튼이 생기므로, 그 버튼이 `repo/web` 안에 저장소를 하나 더 만들 수 있다.
7. 캔버스가 없는 프로젝트는 "No canvases"만 보이고, 다음에 할 일을 알려 주지 않는다.
8. 지금 skill 본문은 이미 설정되고 캔버스가 있는 저장소를 전제로 쓰였다. 처음 쓰는 에이전트가 이 본문만 읽고 첫 캔버스를 끝까지 만드는지는 관찰한 적이 없다.

## 완료 조건

1. 앱 이름, 버전, appId가 다음과 같다(2026-10-24 사용자). `npm --prefix app run package`(이 기능에서 만든다)는 서명 없는 `doan.app`(arm64)을 만든다. 그 안의 `Contents/Resources/bin/doan skill --json`은 `result.version`으로 `0.1.0`을 돌려준다.
   - `app/package.json`의 `version`은 `0.1.0`이다.
   - `productName`은 `doan`이다.
   - appId는 `design.doan.app`이다.
2. 앱은 CLI를 다음 순서로 찾는다.
   1. `DOAN_CLI`가 있으면 그 경로를 쓴다.
   2. 없으면, 패키지된 앱은 번들 안의 CLI를 쓰고 `PATH`로 내려가지 않는다.
   3. 개발 빌드는 지금처럼 `PATH`의 `doan`을 쓴다.
3. `onboarding.json`이 없는 userData로 앱을 띄우면, 창 안 전체를 덮는 네 단계 마법사(CLI · 에이전트 · 프로젝트 · 첫 문장)가 열린다(2026-10-24 사용자).
   - 각 단계는 건너뛸 수 있다.
   - 마법사를 닫으면 다음 실행부터는 열리지 않는다. 다 마치고 닫든, 건너뛰고 닫든 같다.
   - Cmd+Q로 앱을 끝내면 마법사를 닫은 것으로 치지 않는다.
   - 앱 메뉴 "Set Up doan…"으로 언제든 다시 연다.
4. 1단계에서는 `~/.local/bin/doan`이 앱이 쓰는 CLI 절대 경로를 가리키는 심볼릭 링크로 생긴다.
   - 앱이 App Translocation 경로에서 실행 중이면 링크를 만들지 않는다. 대신 앱을 응용 프로그램 폴더로 옮기라고 보인다.
   - `~/.local/bin`이 사용자 로그인 셸의 `PATH`에 없으면, 셸 설정 파일 이름과 함께 그 파일에 추가할 한 줄을 복사할 수 있게 보인다. 앱은 셸 설정 파일을 직접 고치지 않는다.
5. 2단계는 Claude Code와 Codex를 행으로 따로 보인다.
   - 감지는 로그인 셸에서 얻은 `PATH`로 한다. 각 행은 "Found at `<경로>`", "Not installed", "Couldn't check(이유)" 중 하나를 보인다.
   - 감지된 에이전트 행에만 [Connect]가 있다. [Connect]는 다음 중 아직 없는 것만 차례로 실행한다.
     1. 공유 스텁 `~/.agents/skills/doan/SKILL.md`를 쓴다.
     2. (Claude Code만) `~/.claude/skills/doan` → `../../.agents/skills/doan` 링크를 만든다.
     3. MCP 사용자 범위 등록을 한다(command는 1단계 링크의 절대 경로, args는 `mcp`).
   - 로그인 셸에 `CLAUDE_CONFIG_DIR` · `CODEX_HOME`이 있으면 그 설정 위치에 등록하고, 등록할 위치를 화면에 보인다.
   - 처음 실패한 항목에서 멈추고 항목별 상태를 보인다.
6. 1 · 2단계의 대상 경로나 MCP 이름에 doan이 만들지 않은 것이 이미 있으면 덮어쓰지 않고, 그 상태와 경로를 보인다. 다음 셋만 확인 대화상자를 거쳐 바꾼다.
   - 심볼릭 링크
   - 내용이 다른 `SKILL.md` 파일
   - 같은 이름의 MCP 등록

   main은 쓰기 직전에 상태를 다시 판정한다. 화면에서 본 상태와 다르면 쓰지 않고, 새 상태를 보인다.
7. 3단계 대화상자(마법사의 프로젝트 단계, 그리고 "Not initialized" 행의 [Set Up…])의 구성은 다음과 같다. 기본값은 토큰 CSS 없음이다.
   - 토큰 CSS 선택 필드
   - 만들어질 변경 목록(`design/`, `.doan/config.json`, `.gitattributes` 한 줄)
   - [Set Up Project] 버튼

   [Set Up Project]를 누르면 앱이 `doan init --json --repo <폴더> [--token-css <절대 경로>]`를 실행한다.
   - 성공하면 다시 읽어 캔버스 목록 상태로 바뀐다.
   - 실패하면 CLI의 `error.message`와 앱이 정한 안내를 보인다.
8. `doan init --token-css <저장소 안 절대 경로>`가 성공한다.
   - `.doan/config.json`에는 저장소 기준 상대 경로가 저장된다. 대소문자는 입력한 값이 아니라 디스크에 있는 값을 따른다.
   - 저장소와 토큰 경로가 서로 다른 심볼릭 링크 접두(`/var` ↔ `/private/var`)로 들어와도 같은 저장소 안으로 판정한다.
   - 저장소 밖에 실제로 있는 파일의 절대 경로는 지금처럼 `usage_error`다.
9. 저장된 폴더를 `--repo`로 읽은 결과가 `repo_not_found`이면, 앱이 그 폴더를 cwd로 `doan ls`를 다시 실행한다. 이 다시 묻기는 두 시점에 한다(2026-10-24 사용자).
   - 읽을 때(시작 · Reopen)
   - [Set Up Project]로 init을 실행하기 직전

   위쪽 저장소를 찾으면 init하지 않는다. 저장 경로를 그 루트로 바꾸고, 이미 열린 같은 루트가 있으면 하나로 합친다. 그래서 앱 안에서는 중첩 저장소가 생기지 않는다.
10. 4단계(마법사의 첫 문장 단계, 그리고 "No canvases" 행의 [Copy first prompt])에서는 에이전트에게 보낼 영어 문장을 복사한다.
    - 문장에는 그 저장소의 절대 경로가 들어간다.
    - 복사 버튼은 클립보드 쓰기가 끝난 뒤에만 성공을 표시한다. 상태 문구는 comments-ui 복사와 같다.
11. 실사용 관찰을 사람의 허락 아래 수동으로 한다. 이 관찰은 완료 조건 12의 대상이 아니다.
    - 관찰 대상: 실제 Claude Code와 Codex. 각각 초기화된 빈 git 저장소(토큰 CSS 있음)에서 첫 문장만 받고, 스텁 → `doan skill` 경로로 캔버스를 만든다.
    - 남길 기록: 날짜, 버전, 막힌 곳, 고친 곳.
    - 통과 기준: 고친 본문으로 돌린 마지막 회차(최대 3회차)에서 두 에이전트 모두 `doan check` 오류가 0이다.
    - Codex 실행 허락을 받지 못하면 Codex 쪽은 미검증으로 보고한다.
12. 이 기능의 자동 검증은 실제 사용자 상태를 바꾸지 않는다. 앞뒤 값을 비교해 확인하는 대상은 다음과 같다.
    - `~/.local/bin/doan`(lstat · readlink)
    - `~/.agents/skills/doan`(트리 해시)
    - `~/.claude/skills/doan`(lstat · readlink)
    - `~/.claude.json`과 `$CLAUDE_CONFIG_DIR/.claude.json`의 `mcpServers.doan`
    - `~/.codex/config.toml`과 `$CODEX_HOME/config.toml`의 `[mcp_servers.doan]`
    - 실제 userData의 `folders.json` · `runtime.json` · `onboarding.json`

## 비목표

- #9 `dist`로 옮긴 것: Developer ID 서명 · 공증, dmg, brew cask, electron-updater, GitHub Releases CI, x64 · universal 빌드, `docs/OPERATIONS.md`. 이 기능의 패키지는 이 머신 아키텍처(arm64)의 서명 없는 `.app` 하나다.
- 웹(doan.design). PRODUCT §5 'Deferred'에 그대로 둔다.
- 라이선스 결정.
- Claude Code · Codex 밖의 에이전트 자동 설치(PRODUCT §2).
- 다음 수정과 설치는 하지 않는다: 셸 설정 파일(`.zshrc` 등) 수정, `/usr/local/bin` 설치, 관리자 권한 상승.
- 로그인 셸 밖에서 주입되는 환경(예: Orca가 자기 터미널에만 넣는 `CLAUDE_CONFIG_DIR`)의 감지.
- 저장소 단위(`project` 범위) MCP 등록이나 저장소 안 skill 설치.
- 앱에서 중첩 저장소 만들기. 이미 설정된 저장소 아래에 저장소를 따로 만들려면 터미널에서 `doan init`을 쓴다(PRODUCT §7 2026-10-21 cli-core Q10은 그대로 유지한다).
- 다음 동작은 없다. 사람이 "Set Up doan…"을 다시 실행한다.
  - 제거(uninstall) 흐름
  - 앱을 옮긴 뒤 깨진 링크의 자동 복구
  - 실행할 때마다 링크 상태를 알리는 것
- 새 단계가 생겼을 때 마법사를 다시 띄우는 버전 관리(`onboarding.json`에 버전을 두지 않는다).
- 샘플 캔버스 동봉(PRODUCT §5가 이미 제외).
