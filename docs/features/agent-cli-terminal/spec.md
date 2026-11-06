# agent-cli-terminal — spec

첫 실행 Agent 단계와 Settings > Agents의 Install·Update가 provider 설치 페이지를 여는 대신, provider CLI의 설치·업데이트 명령을 담은 macOS 터미널 창을 연다. Claude Code, Codex, Cursor, GitHub Copilot 네 provider에 같은 방식을 적용한다. Antigravity는 Doan이 서버를 직접 내려받으므로 해당하지 않는다.

## 사용자

- **사람**: 첫 실행이나 Settings > Agents에서 Install·Update를 누르는 사람. 터미널에 보이는 명령을 확인하고 Return을 눌러 직접 실행한다.
- **에이전트**: 해당 없음. CLI, skill, `doan onboarding`의 응답은 바뀌지 않는다.

## 문제 (관찰된 사실)

- Codex 앱 사용자는 앱만 업데이트하고 CLI 업데이트는 미뤄 둔다. Codex 앱(`/Applications/ChatGPT.app`, bundle id `com.openai.codex`, 26.1027.61615)은 자기 CLI를 `Contents/Resources/codex-cli/bin/codex`(0.166.0-alpha.5.1)에 따로 번들한다. Doan이 검사하는 것은 login shell `PATH`의 `codex`이므로, 앱이 최신이어도 Update가 뜬다. 이 사용자들의 `PATH` `codex` 버전은 확인하지 않았다. 0.126.0보다 낮으면 완료 기준 2에 따라 설치 페이지가 열린다.
- Update를 누르면 `learn.chatgpt.com/docs/codex/cli` 페이지가 열린다(`app/src/main/settings.ts` `INSTALL_URLS`). 사용자는 이 페이지에서 무엇을 해야 할지 모르고 "앱은 최신인데?"라고 생각한다.
- 네 provider 모두 CLI 자체에 업데이트 명령이 있는데(`claude update`, `codex update`, `cursor-agent update`, `copilot update`), Doan은 이 명령을 알려 주지 않는다.
- 페이지로 돌아온 뒤 다시 검사하는 시점은 창이 처음 포커스를 받을 때 한 번뿐이다(`agentStep.ts` `windowFocused`). 업데이트가 끝나기 전에 Doan으로 돌아오면 이전 버전이 그대로 읽히고, 그 행에는 다시 검사할 방법이 없다.

## 완료 기준

1. CLI가 없는 provider 행의 Install은 그 provider의 공식 설치 명령이 담긴 터미널 창을 연다. 명령은 Return을 눌러야 실행되고, Return 전에 창을 닫으면 아무것도 실행되지 않는다.
2. 최소 버전보다 낮은 provider 행의 Update는 그 CLI의 업데이트 명령이 담긴 터미널 창을 연다. 같은 조건이 적용된다. 설치된 버전이 update 하위 명령을 가진 첫 버전(design.md '명령 표')보다 낮으면 지금처럼 설치 페이지를 연다.
3. 터미널에서 명령이 끝나면, 성공했을 때는 Doan으로 돌아가라는 줄을, 실패했을 때는 실패했다는 줄과 그 provider의 설치 페이지 주소를 보여 준다.
4. 클릭하기 전 helper는 지금 문구 그대로다("After you install/update it, Doan checks again when you return."). 터미널이 열리면 그 행의 helper가 터미널에서 Return을 누르라는 문구로 바뀐다. 설치 페이지가 열리면 helper는 그대로다.
5. 터미널이나 페이지가 열린 뒤 창이 포커스를 받으면 지금처럼 한 번 다시 검사한다. 그 뒤에도 원인(CLI 없음, 버전 낮음)이 남으면 그 행의 버튼이 Install·Update 대신 Check again이 된다. 행의 버튼은 언제나 하나다.
6. Check again과 포커스 복귀 검사는 원인이 CLI 없음이나 버전 낮음인 동안 계정 검사를 하지 않는다. 그래서 Copilot도 요청을 쓰지 않는다.
7. 터미널을 열지 못하면 그 행에 오류 알림이 붙고, 알림 안에 Open install page 버튼이 있다. 설치 페이지마저 열지 못하면 알림 문구가 페이지를 열지 못했다는 내용으로 바뀐다.
8. 원인이 풀리면(설치됨, 업데이트됨) 한 번 알린다. 행은 다음 상태(Sign in, Connected)로 바뀐다.
9. main은 renderer에게서 provider만 받는다. 명령, 설치·업데이트 구분, 스크립트 경로는 main이 자기 검사 결과와 고정 표로 정한다. 다른 키나 알 수 없는 provider, Antigravity가 오면 거부한다.
10. 첫 실행과 Settings > Agents가 같은 동작과 문구를 쓴다.

## 비목표

- Codex 앱에 번들된 CLI를 Doan이 대신 쓰는 일. PRODUCT §3 'Transport and evidence boundary'(설치된 CLI만 실행)와 ARCHITECTURE §7 'Versions'(검증한 버전만 허용)를 바꾸는 별도 결정이다.
- Doan이 명령을 직접 실행하는 일. ARCHITECTURE §7 'Versions'의 "Doan installs no provider CLI except the Antigravity server"를 유지한다.
- Doan 안의 터미널(Orca 방식). Doan에는 터미널 표면이 없다.
- iTerm, Ghostty 같은 다른 터미널을 고르는 설정. `.command`는 사람이 지정한 기본 앱으로 열린다.
- Codex 앱과 CLI가 따로 업데이트된다는 안내. 네 provider가 같은 문구를 쓴다.
- `version_incompatible`(Doan이 아직 읽지 못하는 새 버전)과 `version_unknown`의 복구 동작.
- 업데이트가 끝났는지 터미널에서 Doan으로 알리는 신호. 다시 검사는 포커스 복귀 한 번과 Check again뿐이다.
