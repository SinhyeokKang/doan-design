# agent-cli-terminal — spec

첫 실행 Agent 단계와 Settings > Agents의 Install·Update가 provider 설치 페이지를 여는 대신, provider CLI의 설치·업데이트 명령을 담은 macOS 터미널 창을 연다. Claude Code, Codex, Cursor, GitHub Copilot 네 provider에 같은 방식을 적용한다. Antigravity는 Doan이 서버를 직접 내려받으므로 해당하지 않는다.

## 사용자

- **사람**: 첫 실행이나 Settings > Agents에서 Install·Update를 누르는 사람. 터미널에 보이는 명령을 확인하고 Return을 눌러 직접 실행한다.
- **에이전트**: 해당 없음. CLI, skill, `doan onboarding`의 응답은 바뀌지 않는다.

## 문제 (관찰된 사실)

- Codex 앱 사용자는 앱만 업데이트하고 CLI 업데이트는 미뤄 둔다. Codex 앱(`/Applications/ChatGPT.app`, bundle id `com.openai.codex`, 26.1027.61615)은 자기 CLI를 `Contents/Resources/codex-cli/bin/codex`(0.166.0-alpha.5.1)에 따로 번들한다. Doan이 검사하는 것은 login shell `PATH`의 `codex`이므로, 앱이 최신이어도 Update가 뜬다.
- Update를 누르면 `learn.chatgpt.com/docs/codex/cli` 페이지가 열린다(`app/src/main/settings.ts` `INSTALL_URLS`). 사용자는 이 페이지에서 무엇을 해야 할지 모르고 "앱은 최신인데?"라고 생각한다.
- 네 provider 모두 CLI 자체에 업데이트 명령이 있는데(`claude update`, `codex update`, `cursor-agent update`, `copilot update`), Doan은 이 명령을 알려 주지 않는다.
- 페이지로 돌아온 뒤 다시 검사하는 시점은 창이 처음 포커스를 받을 때 한 번뿐이다(`agentStep.ts` `windowFocused`). 업데이트가 끝나기 전에 Doan으로 돌아오면 이전 버전이 그대로 읽히고, 다음 포커스에서는 다시 검사하지 않는다.

## 완료 기준

1. CLI가 없는 provider 행의 Install은 그 provider의 공식 설치 명령이 담긴 터미널 창을 연다. 명령은 Return을 눌러야 실행된다.
2. 최소 버전보다 낮은 provider 행의 Update는 그 CLI의 업데이트 명령이 담긴 터미널 창을 연다. 설치된 버전에 업데이트 명령이 없거나 그 여부를 확인하지 못한 경우에는 지금처럼 설치 페이지를 연다.
3. 터미널 창을 열지 못하면 행 아래에 오류와 설치 페이지를 여는 동작이 나온다.
4. 터미널을 연 provider는 원인(CLI 없음, 버전 낮음)이 풀릴 때까지 창이 포커스를 받을 때마다 다시 검사한다. Copilot도 이 원인일 때는 요청을 쓰지 않는 검사만 한다.
5. renderer는 provider와 동작(install, update)만 보내고, 실행할 명령 문자열은 main이 고정 표에서 고른다.
6. 첫 실행과 Settings > Agents가 같은 동작을 한다. 네 provider의 helper 문구는 같은 틀을 쓰고, Codex 앱과 CLI를 구분하는 안내는 따로 두지 않는다.
7. 설치 페이지는 대체 경로에만 남는다. 행의 버튼은 하나다.

## 비목표

- Codex 앱에 번들된 CLI를 Doan이 대신 쓰는 일. PRODUCT §3 'Transport and evidence boundary'(설치된 CLI만 실행)와 ARCHITECTURE §7 'Versions'(검증한 버전만 허용)를 바꾸는 별도 결정이다.
- Doan이 명령을 직접 실행하는 일. ARCHITECTURE §7 'Versions'의 "Doan installs no provider CLI except the Antigravity server"를 유지한다.
- Doan 안의 터미널(Orca 방식). Doan에는 터미널 표면이 없다.
- iTerm, Ghostty 같은 다른 터미널을 고르는 설정.
- `version_incompatible`(Doan이 아직 읽지 못하는 새 버전)과 `version_unknown`의 복구 동작.
- 업데이트가 끝났는지 터미널에서 Doan으로 알리는 신호. 다시 검사하는 시점은 창 포커스뿐이다.
