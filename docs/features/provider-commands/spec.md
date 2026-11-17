# provider-commands — spec

## 사용자
- **사람**: 다섯 프로바이더(Claude Code, Codex, Cursor, Antigravity, GitHub Copilot)의 대화에서 `/`를 쳐서 프로바이더 내장 명령을 고르고 보낸다. 대상 컴포저는 Home, Overview, 캔버스 패널, 프로토타입 창이고, 네 곳 모두 같은 규칙을 따른다.
- **에이전트**: 영향 없음. CLI, 스킬, 캔버스 규칙은 바뀌지 않는다.

## 문제
- 컴포저의 `/` 목록에는 Doan 프리셋과 프로젝트 스킬만 나온다. PRODUCT §5 'Project skills'가 Claude Code의 내장 명령을 명시적으로 뺐기 때문이다.
- 그래서 터미널에서 쓰던 `/compact` 같은 명령을 Doan에서는 고를 수 없다. 직접 쳐서 보낼 때의 처리도 정해져 있지 않다. 예를 들어 그대로 전달되는지, 앞에 붙는 프리셋 줄 때문에 깨지는지, 결과가 어떻게 보이는지가 정해지지 않았다.
- 프로바이더별로 명령을 아는 경로가 다르다.
  - Claude: Agent SDK의 `initializationResult().commands`가 내장 명령을 `builtin: true`로 함께 돌려준다. 지금은 `parseClaudeSkills`(`app/src/main/conversation/skills.ts:29`)가 이것을 버린다.
  - Codex: 내장 명령은 TUI 명령이다. app-server(0.167.1)에는 대응 요청 `thread/compact/start`, `review/start`가 있다.
  - ACP 세 프로바이더: 명령 목록이 `available_commands_update`로 오지만, 지금은 받고 버린다(`acpRunner.ts:68`).

## 완료 조건
- task 1의 PoC 표에서 '동작함'이나 '표시 필요'로 확인된 명령만 그 프로바이더의 `/` 목록과 Presets 팝오버 'Commands' 탭에 나온다. 확인한 CLI 버전이 함께 기록된다.
  - 후보 명령: `/compact`, `/clear`, `/init`, `/review`, `/context`, `/cost`, 그리고 ACP 서버가 알려 주는 명령.
- '동작함'으로 확인된 명령을 보내면 PoC 표에 적힌 기대 결과가 스레드에 나타난다.
  - `/compact`: 실행 중 표시, 끝나면 압축 경계, 컨텍스트 링 갱신
  - `/clear`: 컨텍스트 지움 경계, 대화가 새 세션 id를 따라감
  - 텍스트 결과를 내는 명령: 일반 답변처럼 표시
  - 실패: 기존 턴 실패 표시
- 앱을 재시작한 뒤에도 압축·지움 경계가 보인다. 경계는 프로바이더 세션 기록의 이벤트에서 다시 만든다.
- 목록 밖 내장 명령(예: `/model`)을 보내면 프로바이더에 보내지 않는다. 대신 정해진 문구의 카드가 뜨고, 보낸 텍스트는 컴포저로 돌아온다.
- 내장 명령 이름이 아닌 `/` 단어는 지금처럼 일반 텍스트로 간다. 예를 들어 `/Users/...` 같은 경로가 그렇다.
- 사람이 고른 `/clear`만 세션 교체를 허용한다. 그 밖에는 Doan이 세션을 몰래 새로 시작하거나 fork하지 않는다(PRODUCT 'Resume and permissions').

## 비목표
- 터미널 화면에서만 의미가 있는 명령: `/model`, `/config`, `/login`, `/logout`, `/permissions`, `/theme` 등. Doan이 같은 기능을 자기 UI(모델·권한 picker, Settings)로 제공한다. 이 명령들은 결정 2의 카드 대상이다.
- MCP 프롬프트, claude.ai 커넥터, 플러그인 명령, 사용자 범위 명령. 지금의 'Project skills' 제외 범위를 유지한다.
- 명령 인자 입력을 돕는 UI. 인자는 텍스트로 쓴다.
- 목록 밖 명령 카드를 앱 재시작 뒤에도 남기는 것. 카드는 이번 실행에서만 보인다.
