# zero-setup-agents — spec

Doan을 설치한 뒤 사람이 아무 설정도 하지 않아도, 터미널이나 다른 앱에서 직접 실행하는 코딩 에이전트에게 "Doan을 써 줘"라고 시킬 수 있게 한다. ego lite의 온보딩을 최대한 그대로 참고한다(근거는 design.md '레퍼런스: ego lite').

## 사용자

- **에이전트**: 사용자가 Doan 밖에서 직접 띄우는 Claude Code, Codex, Cursor, Antigravity, GitHub Copilot 세션(이하 외부 세션). Doan 앱이 띄우는 앱 대화(Doan 프로필)는 대상이 아니다.
  - 받는 것: 전역 skill 위치에서 `doan` skill을 찾고, PATH의 `doan`으로 guide와 명령을 실행한다. Codex sandbox 안에서도 `doan active`가 동작한다.
- **사람**: 외부 세션을 연결하기 위해서는 Doan.app을 Applications에 넣고 한 번 실행하는 것 말고 아무것도 하지 않는다. 설정 화면은 없다. `~/.local/bin`이 PATH에 없으면 macOS 관리자 권한 대화상자에 한 번 답한다. 자동 설치가 일부 건너뛰어졌을 때만 Settings… > About에서 이유를 본다.

## 문제 (관찰한 사실)

- 외부 세션이 Doan을 쓰려면 사람이 Settings > Connections에서 Claude Code·Codex 행마다 Connect를 눌러야 한다(PRODUCT §5 item 0). 첫 실행은 skill·MCP를 설치하지 않는다.
- 전역 stub `~/.agents/skills/doan/SKILL.md`는 복사본이다. 앱이 바뀌어 stub이 달라지면 Settings가 Needs replacement를 보이고, Connect가 확인을 받은 뒤 교체한다(ARCHITECTURE §6).
- Cursor, Antigravity, Copilot 외부 세션에는 설치 경로가 없다. 사용자가 직접 설치해야 한다(PRODUCT §2 둘째 문단).
- Codex `--sandbox workspace-write`에서 셸 `doan active`는 앱 socket 연결이 막힌다(`connect: operation not permitted`, codex-cli 0.164.0, 2026-10-31 실험 run1). 지금은 MCP `active`로만 우회할 수 있고, MCP는 Connect로만 등록된다.
- 같은 sandbox에서 ego-browser는 동작한다. ego lite가 `~/.codex/rules/default.rules`에 `prefix_rule(pattern=["ego-browser"], decision="allow")`를 쓰기 때문이다. Codex는 `allow` rule에 맞는 명령을 "outside the sandbox without prompting" 실행한다(Codex 문서 Rules). doan에 같은 rule을 프로젝트 레이어에 걸자 `workspace-write`에서 `doan active`가 성공했다(실험 run2).
- 이 머신의 `~/.local/bin/doan`은 지워진 worktree(`onboard-l2`)의 앱을 가리키는 깨진 링크다. 링크가 특정 빌드를 직접 가리키면, 그 빌드가 사라질 때 링크도 깨진다.
- 기본 macOS zsh의 PATH에는 `~/.local/bin`이 없다. 지금은 Connections가 rc 파일에 넣을 줄을 안내한다(PRODUCT §5 item 0 machine setup 1).

## 완료 조건

1. `/Applications` 또는 `~/Applications` 바로 아래의 패키지 앱을 한 번 실행하면, 사람이 더 아무것도 하지 않아도(아래 4의 관리자 권한 대화상자는 예외) 다섯 프로바이더의 새 외부 세션이 `doan` skill을 찾고 `doan skill`을 실행한다. 프로바이더별 결과를 tasks.md T0 표(손으로 만든 배치)와 T6b(앱이 만든 배치)에 남긴다.
2. 같은 경로의 앱 번들을 새 버전으로 바꾸면, 링크를 다시 쓰지 않아도 다음 호출부터 새 CLI, stub, guide가 쓰인다.
3. 앱을 다른 허용 위치로 옮기면, 다음 실행에서 링크가 새 위치를 가리킨다. 두 허용 위치에 복사본이 모두 있으면 마지막에 실행한 복사본이 링크를 가져간다.
4. 로그인 셸 PATH에 `~/.local/bin`이 없으면, 앱이 macOS 관리자 권한 대화상자로 `/usr/local/bin/doan` 링크를 만든다(ego와 같은 방식). 사람이 취소하면 다시 자동으로 묻지 않고, About 알림이 rc 파일에 넣을 PATH 줄을 보인다.
5. Codex `workspace-write` + `approval_policy=never`에서 `doan active`와 `doan onboarding …`이 성공한다. ego처럼 모든 `doan` 명령이 sandbox 밖에서 승인 없이 실행된다. 나머지 네 프로바이더는 sandbox가 `doan active`를 막지 않는다(사람이 한 번 승인하면 앱에 닿는다). T0 측정에서 sandbox가 socket을 막은 것은 Codex뿐이었다.
6. Doan이 만들지 않은 파일과 링크는 바꾸거나 지우지 않는다. 그런 대상이 있으면 그 항목과, 그 항목을 거쳐 가는 항목만 건너뛴다.
7. 프로바이더 설정 폴더(`~/.claude`, `~/.codex`, `~/.gemini`)가 없으면 만들지 않는다. 그 프로바이더의 링크와 rule은 폴더가 생긴 뒤의 다음 실행에서 만든다.
8. 개발 빌드, translocation 상태의 앱, 허용 위치 밖의 패키지 복사본(`app/dist/…` 포함)은 아무것도 쓰지 않는다.
9. Settings에 Connections 카테고리가 없고, 앱이 MCP를 등록하는 기능이 없다. 저장된 `settingsSection: "connections"`는 About으로 열린다. `doan mcp` 명령은 그대로 남는다.
10. 건너뛴 항목이 있거나 쓰는 조건을 만족하지 않는 실행이면, Settings… > About의 doan command 행 아래에 항목마다 한 줄씩 영향받는 에이전트, 경로, 할 일이 보인다. 모두 설치됐으면 아무것도 보이지 않는다. 알림은 이번 실행의 결과이며, 원인을 치운 뒤 Doan을 다시 열면 다시 시도한다.
11. stub, guide, CLI `nextSteps`, 앱 문구에 Settings > Connections 안내가 없다. 에이전트가 Doan을 쓸 수 없을 때는 사람에게 Applications에서 Doan을 열고 Settings… > About을 보라고 안내한다. 바뀐 문구로 `/agent-eval` 라운드에서 이 문구 때문에 생긴 새 issue 행이 없다.

## 비목표

- MCP 자동 등록.
- `doan mcp` 명령과 MCP 제거 구현. 이 feature의 마지막 task(T9)에서 별도 feature로 시작한다. 착수 조건은 T1–T8 구현 완료이고, T0 프로바이더 표가 판단 근거다.
- 기존 Connect로 설치된 상태의 자동 이전. 앱이 아직 배포되지 않았으므로, Connect가 복사한 `~/.agents/skills/doan/` 디렉터리는 사람이 지운다. 단, Connect가 만든 옛 링크(번들 CLI를 가리키는 `~/.local/bin/doan`, 상대 Claude 링크)는 Doan이 만든 것으로 보고 교체한다(design.md '소유 판정').
- 언인스톨과 끄기(opt-out). 앱을 지우면 링크가 깨진 채 남는다. 링크를 지워도 다음 실행에서 다시 만든다. 같은 자리에 일반 파일을 두면 그 항목은 건너뛴다.
- 이미 떠 있는 에이전트 세션. skill 위치와 Codex rule은 세션을 시작할 때 읽히므로, Doan을 처음 실행하기 전에 띄운 세션은 새로 시작해야 Doan을 안다. 알리지 않는다.
- 자동 업데이트(electron-updater, #9 `dist`). 번들 교체가 어떻게 일어나든 완료 조건 2가 성립하면 된다.
- `CLAUDE_CONFIG_DIR`, `CODEX_HOME` 따르기. ego처럼 기본 위치(`~/.claude`, `~/.codex`)에만 쓴다.
- 실행을 막지 않는 승인 프롬프트 제거(Claude `permissions.allow` 등). 사람이 한 번 승인하면 진행되는 프롬프트는 각 에이전트의 평소 정책대로 둔다.
- 앱 대화의 Codex에 `doan` skill이 두 개 보이는 것. Codex 프로필은 실제 HOME의 `~/.agents/skills`도 읽어서, 전역 링크와 프로필 stub이 함께 보인다. 둘 다 같은 원본에서 나와 내용이 같으므로 받아들이고, T6b에서 Codex가 헷갈리지 않는지만 확인한다. agent-auth의 프로필 stub 쓰기는 바꾸지 않는다.
