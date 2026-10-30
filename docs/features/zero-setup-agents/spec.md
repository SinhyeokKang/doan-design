# zero-setup-agents — spec

Doan을 설치한 뒤 사람이 아무 설정도 하지 않아도, 터미널이나 다른 앱에서 직접 실행하는 코딩 에이전트에게 "Doan을 써 줘"라고 시킬 수 있게 한다. ego lite의 온보딩을 최대한 그대로 참고한다(근거는 design.md '레퍼런스: ego lite').

## 사용자

- **에이전트**: 사용자가 Doan 밖에서 직접 띄우는 Claude Code, Codex, Cursor, Antigravity, GitHub Copilot 세션(이하 외부 세션). Doan 앱이 띄우는 앱 대화(Doan 프로필)는 대상이 아니다.
  - 받는 것: 전역 skill 위치에서 `doan` skill을 찾고, PATH의 `doan`으로 guide와 명령을 실행한다. Codex sandbox 안에서도 `doan active`가 동작한다.
- **사람**: Doan.app을 Applications에 넣고 한 번 실행하는 것 말고는 아무것도 하지 않는다. 설정 UI를 보지 않는다. 자동 설치가 일부 실패했을 때만 About에서 이유를 본다.

## 문제 (관찰한 사실)

- 외부 세션이 Doan을 쓰려면 사람이 Settings > Connections에서 Claude Code·Codex 행마다 Connect를 눌러야 한다(PRODUCT §5 item 0). 첫 실행은 skill·MCP를 설치하지 않는다.
- 전역 stub `~/.agents/skills/doan/SKILL.md`는 복사본이다. 앱이 바뀌어 stub이 달라지면 Settings가 Needs replacement를 보이고, Connect가 확인을 받은 뒤 교체한다(ARCHITECTURE §6).
- Cursor, Antigravity, Copilot 외부 세션에는 설치 경로가 없다. 사용자가 직접 설치해야 한다(PRODUCT §2 직전 문단).
- Codex `--sandbox workspace-write`에서 셸 `doan active`는 앱 socket 연결이 막힌다(`connect: operation not permitted`, codex-cli 0.164.0, 2026-10-31 실험 run1). 지금은 MCP `active`로만 우회할 수 있고, MCP는 Connect로만 등록된다.
- 같은 sandbox에서 ego-browser는 동작한다. ego lite가 `~/.codex/rules/default.rules`에 `prefix_rule(pattern=["ego-browser"], decision="allow")`를 쓰기 때문이다. Codex는 `allow` rule에 맞는 명령을 "outside the sandbox without prompting" 실행한다(Codex 문서 Rules). doan에 같은 rule을 걸자 `workspace-write`에서 `doan active`가 성공했다(실험 run2).
- 이 머신의 `~/.local/bin/doan`은 지워진 worktree(`onboard-l2`)의 앱을 가리키는 깨진 링크다. 링크가 특정 빌드를 직접 가리키면, 그 빌드가 사라질 때 링크도 깨진다.

## 완료 조건

1. `/Applications` 또는 `~/Applications`에 있는 패키지 앱을 한 번 실행하면, 사람이 더 아무것도 하지 않아도 다섯 프로바이더의 새 외부 세션이 `doan` skill을 찾고 `doan skill`을 실행한다. 프로바이더별 확인 결과를 tasks.md T0 표에 남긴다.
2. 같은 경로의 앱 번들을 새 버전으로 바꾸면, 링크를 다시 쓰지 않아도 다음 호출부터 새 CLI, stub, guide가 쓰인다.
3. 앱을 다른 허용 위치로 옮기면, 다음 실행에서 링크가 새 위치를 가리킨다.
4. Codex `workspace-write` + `approval_policy=never`에서 `doan active`와 `doan onboarding …`이 성공한다. ego처럼 모든 `doan` 명령이 sandbox 밖에서 승인 없이 실행된다. 나머지 네 프로바이더도 기본 설정에서 `doan active`가 앱에 닿는다. 기본 sandbox가 socket을 막는 프로바이더는 T0에서 찾은 허용 방식(Codex rule에 해당하는 것)을 이 feature에 넣는다.
5. Doan이 만들지 않은 파일과 링크는 바꾸거나 지우지 않는다. 그런 대상이 있으면 그 항목만 건너뛴다.
6. 개발 빌드, translocation 상태의 앱, 허용 위치 밖의 패키지 복사본(`app/dist/…` 포함)은 아무것도 쓰지 않는다.
7. Settings에 Connections 카테고리가 없고, 앱이 MCP를 등록하는 기능이 없다. `doan mcp` 명령은 그대로 남는다.
8. 건너뛴 항목이 있거나 쓰는 조건을 만족하지 않는 실행이면 About의 doan command 행 아래에 이유와 경로가 한 줄로 보인다. 모두 설치됐으면 아무것도 보이지 않는다.
9. stub, guide, CLI `nextSteps`에 Settings > Connections 안내가 없다. 바뀐 문구로 `/agent-eval` 라운드를 통과한다.

## 비목표

- MCP 자동 등록.
- `doan mcp` 명령과 MCP 제거 구현. 이 feature의 마지막 task(T9)에서 별도 feature로 시작한다. 착수 조건은 T1–T8 구현 완료이고, T0 프로바이더 표가 판단 근거다.
- 기존 Connect로 설치된 상태(복사된 `~/.agents/skills/doan/`, 상대 Claude 링크)의 자동 이전. 앱이 아직 배포되지 않았으므로, 이 머신의 기존 항목은 사람이 지운다. 단, Doan 번들을 가리키던 옛 링크는 Doan이 만든 것으로 보고 교체한다(design.md '소유 판정').
- 언인스톨. 앱을 지우면 링크가 깨진 채 남는다.
- 자동 업데이트(electron-updater, #9 `dist`). 번들 교체가 어떻게 일어나든 완료 조건 2가 성립하면 된다.
- `/usr/local/bin` 설치와 관리자 권한. ego는 관리자 권한 osascript로 `/usr/local/bin`에 링크를 만드는 경로가 있지만, PRODUCT §5 item 0 'Not included'가 이것을 제외한다.
- `CLAUDE_CONFIG_DIR`, `CODEX_HOME` 따르기. ego처럼 기본 위치(`~/.claude`, `~/.codex`)에만 쓴다.
- 실행을 막지 않는 승인 프롬프트 제거(Claude `permissions.allow` 등). 사람이 한 번 승인하면 진행되는 프롬프트는 각 에이전트의 평소 정책대로 둔다. sandbox가 실행 자체를 막는 경우만 완료 조건 4에서 다룬다.
- Doan 프로필(앱 대화)에 stub을 쓰는 방식. agent-auth는 지금처럼 같은 원본 파일의 바이트를 쓴다.
