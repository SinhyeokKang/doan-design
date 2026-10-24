# onboard — spec

PRODUCT §5 기능 #8 `onboard-dist`를 둘로 나눈 앞쪽이다(2026-10-24 사용자). 이 기능은 첫 실행 온보딩과 앱 번들 CLI, 그리고 그 둘을 확인할 서명 없는 로컬 패키지 빌드를 다룬다. 공증 dmg · brew cask · electron-updater · Releases CI는 새 기능 #9 `dist`로 옮긴다. #9는 온보딩 뒤에 이어질 앱 전체 사이클 완성도 작업이 끝난 다음으로 미룬다(2026-10-24 사용자: "배포 관련은 다 뒤로 미뤄"). 서명 없는 로컬 `.app` 빌드는 배포가 아니라 온보딩 1단계와 MCP 경로를 실제 앱으로 확인하는 수단이라 이 기능에 남긴다(2026-10-24 사용자). 나눈 이유: 저장소가 비공개(2026-10-24 `gh repo view` 기준 `PRIVATE`)라 공개 Releases에서 업데이트를 받을 수 없고, 이 머신에는 Developer ID 서명 인증서가 없으며(`security find-identity -v -p codesigning` → 0개), 라이선스도 정해지지 않았다. 지금 하면 검증할 수 없는 작업만 남는다.

## 사용자

- **사람**(앱 사용자): 앱을 처음 띄우면 CLI 설치와 에이전트 연결을 앱 안에서 끝낸다. 설정되지 않은 저장소는 터미널 없이 앱에서 설정한다. 캔버스가 없는 저장소에서는 에이전트에게 보낼 첫 문장을 복사한다.
- **에이전트**(Claude Code · Codex): 설치된 skill 스텁을 발견하면 `doan skill`로 본문을 읽는다. 사용자 범위로 등록된 `doan` MCP 서버를 쓴다. 고친 본문만 읽고도 첫 캔버스를 만들어 `doan check`을 통과시킬 수 있다.

## 문제 (관찰한 사실, 2026-10-24 main `7c1e78c`)

1. 앱은 CLI를 `DOAN_CLI` 환경 변수, 그다음 `PATH`의 `doan`에서만 찾는다(`app/src/main/cli.ts` `cliCommand`). 앱 번들 안에는 CLI가 없고, 패키지 빌드 설정도 없다(`app/package.json`에 `build` · `dev` · `e2e` · `test` · `typecheck`만 있다).
2. skill 스텁을 설치하는 코드가 없다. `doan skill`은 본문을 내지만, 에이전트가 그 명령을 알게 해 줄 `SKILL.md`는 사람이 직접 만들어야 한다.
3. MCP는 사람이 `claude mcp add` · `codex mcp add`를 직접 실행해야 등록된다.
4. `.doan/`이 없는 저장소는 사이드바에 "Not initialized"와 "Run in a terminal: `doan init`"으로만 보인다(`app/src/renderer/projectRow.ts`). 앱 안에서는 설정할 수 없다.
5. `doan init --token-css`에 저장소 안의 절대 경로를 주면 `usage_error`다(PRODUCT §8 열린 질문). 앱의 파일 선택 창은 절대 경로를 돌려준다.
6. 초기화되지 않은 하위 폴더(`repo/web`)를 열어 둔 뒤 부모(`repo`)에서 `doan init`을 하면, 앱은 `--repo repo/web`으로 읽으므로 계속 "Not initialized"를 보인다(PRODUCT §8 열린 질문). 이번에 앱에 설정 버튼이 생기면 그 버튼이 `repo/web` 안에 저장소를 하나 더 만든다.
7. 캔버스가 없는 프로젝트는 "No canvases"만 보이고 다음에 할 일을 알려 주지 않는다.
8. 지금 skill 본문은 이미 설정되고 캔버스가 있는 저장소를 전제로 쓰였다. 처음 쓰는 에이전트가 이 본문만 읽고 첫 캔버스를 끝까지 만드는지 관찰한 적이 없다.

## 완료 조건

1. `npm --prefix app run package`(이 기능에서 만든다)가 서명 없는 `.app`을 만들고, 그 안의 `Contents/Resources/bin/doan skill --json`이 `result.version`으로 앱의 `package.json` 버전을 돌려준다.
2. 패키지된 앱은 `DOAN_CLI`가 없을 때 번들 안의 CLI를 쓴다. `DOAN_CLI`가 있으면 그것을 쓴다(e2e · dev).
3. `onboarding.json`이 없는 userData로 앱을 띄우면 설정 화면이 열린다. 설정 화면은 단계마다 상태를 보이고, 단계마다 건너뛸 수 있다. 앱 메뉴 "Set Up Doan…"으로 다시 연다.
4. 1단계: `~/.local/bin/doan`이 앱 번들의 `doan`을 가리키는 심볼릭 링크로 생긴다. `~/.local/bin`이 사용자 로그인 셸의 `PATH`에 없으면, 셸에 추가할 한 줄을 복사할 수 있게 보인다. 앱은 셸 설정 파일을 고치지 않는다.
5. 2단계: 앱이 Claude Code와 Codex가 설치되어 있는지 따로 감지한다. 사람이 고른 에이전트에 다음을 한다.
   - skill 스텁을 `~/.agents/skills/doan/SKILL.md`에 쓴다. Claude Code를 고르면 `~/.claude/skills/doan`을 `../../.agents/skills/doan`으로 링크한다.
   - MCP를 `claude mcp add --scope user doan -- <~/.local/bin/doan 절대 경로> mcp`, `codex mcp add doan -- <같은 경로> mcp`로 등록한다.
6. 1 · 2단계의 대상 경로나 MCP 이름에 doan이 만들지 않은 것이 이미 있으면 덮어쓰지 않는다. 그 상태와 경로를 보인다. 바꿀 수 있는 경우(심볼릭 링크, 같은 이름의 MCP 등록)에만 확인 대화상자를 거쳐 바꾼다.
7. 3단계: "Not initialized" 프로젝트에 설정 동작이 생긴다. 토큰 CSS 파일을 고르거나 "없음"을 고르면 앱이 번들 `doan init --json --repo <폴더> [--token-css <절대 경로>]`를 실행한다. 성공하면 다시 읽어 캔버스 목록 상태로 바뀐다. 실패하면 CLI의 메시지를 보인다.
8. `doan init --token-css <저장소 안 절대 경로>`가 성공하고, `.doan/config.json`에 저장소 기준 상대 경로(디스크 표기 그대로)가 저장된다. 저장소 밖 절대 경로는 지금처럼 `usage_error`다.
9. 저장된 폴더를 `--repo`로 읽은 결과가 `repo_not_found`이면, 앱이 그 폴더를 cwd로 `doan ls`를 다시 실행한다. 위쪽 저장소를 찾으면 저장 경로를 그 루트로 바꾸고, 이미 열린 루트와 겹치면 하나로 합친다. 그래서 위 문제 6의 경우 "Not initialized"가 사라지고 설정 동작도 보이지 않는다.
10. 4단계: 캔버스가 없는 프로젝트는 에이전트에게 보낼 첫 문장(영어)을 복사할 수 있게 보인다. 복사는 클립보드 쓰기가 끝난 뒤에만 성공을 표시한다.
11. 실제 Claude Code와 Codex가 각각 빈 임시 저장소에서 첫 문장만 받고, 스텁 → `doan skill` 경로로 캔버스를 만든다. 결과는 `doan check` 오류 0이다. 관찰에서 막힌 곳을 skill 본문에 반영했다.
12. 이 기능의 모든 자동 검증은 실제 `~/.local/bin`, `~/.agents`, `~/.claude`, `~/.codex`, `~/Library/Application Support/doan/`을 바꾸지 않는다. 앞뒤 상태를 비교해 확인한다.

## 비목표

- #9 `dist`로 옮긴 것: Developer ID 서명 · 공증, dmg, brew cask, electron-updater, GitHub Releases CI, x64 · universal 빌드. 이 기능의 패키지는 이 머신 아키텍처(arm64)의 서명 없는 `.app` 하나다.
- 웹(doan.design). PRODUCT §5 'Deferred'에 그대로 둔다.
- 라이선스 결정.
- Claude Code · Codex 밖의 에이전트 자동 설치(PRODUCT §2).
- 셸 설정 파일(`.zshrc` 등) 수정, `/usr/local/bin` 설치, 관리자 권한 상승.
- 저장소 단위(`project` 범위) MCP 등록이나 저장소 안 skill 설치.
- 제거(uninstall) 흐름, 앱을 옮긴 뒤 깨진 링크의 자동 복구. 사람이 "Set Up Doan…"을 다시 실행한다.
- 샘플 캔버스 동봉(PRODUCT §5가 이미 제외).
