# provider-commands — spec

## 사용자
- **사람**: Home, Overview, 캔버스 패널, 프로토타입 창의 컴포저에서 `/`를 쳐서 프로바이더 내장 명령을 고르고 보낸다.
- **에이전트**: 영향 없음. CLI, 스킬, 캔버스 규칙은 바뀌지 않는다.

## 문제
- 컴포저의 `/` 목록에는 Doan 프리셋과 프로젝트 스킬만 나온다. PRODUCT §5 'Project skills'가 Claude Code의 내장 명령을 명시적으로 뺐기 때문이다.
- 그래서 터미널에서 쓰던 `/compact` 같은 명령을 Doan에서는 고를 수 없다. 직접 쳐서 보내도 Doan 대화에서 어떻게 되는지 정해져 있지 않다.
  - 예: 그대로 전달되는지, 프리셋 줄이 앞에 붙어 깨지는지, 결과가 스레드에 어떻게 보이는지.
- Claude Agent SDK의 `initializationResult().commands`는 내장 명령을 `builtin: true`로 함께 돌려준다. 지금은 `parseClaudeSkills`(`app/src/main/conversation/skills.ts`)가 이것을 버린다.
- Codex의 내장 명령은 TUI 명령이다. app-server에서는 텍스트로 보내는 대신 별도 요청으로 대응해야 할 수 있다(미확인, PoC 대상).

## 완료 조건
- 연결된 프로바이더가 Doan 앱 대화에서 **실제로 동작한다고 PoC로 확인된** 내장 명령만 `/` 목록과 Presets 팝오버에 나온다.
- 목록의 명령을 골라 보내면, 프로바이더가 터미널에서와 같은 효과를 낸다. 그 결과는 스레드에서 보인다.
  - 예: `/compact`이면 압축이 끝났다는 표시가 남고, 컨텍스트 링이 줄어든다.
- 동작하지 않는 명령은 목록에 나오지 않는다. 이런 명령을 직접 쳐서 보낼 때의 처리는 design.md 결정을 따른다.
- 대화의 세션 정체성을 지킨다(PRODUCT 'Resume and permissions'). Doan은 세션을 몰래 새로 시작하거나 fork하지 않는다.

## 비목표
- 터미널 화면에서만 의미가 있는 명령: `/model`, `/config`, `/login`, `/logout`, `/permissions`, `/theme` 등. 이 설정은 Doan이 이미 자기 UI(모델·권한 picker, Settings)로 제공한다.
- MCP 프롬프트, claude.ai 커넥터, 플러그인 명령, 사용자 범위 명령. 지금의 'Project skills' 제외 범위를 유지한다.
- 명령 인자 입력을 돕는 UI. 인자는 텍스트로 쓴다.
