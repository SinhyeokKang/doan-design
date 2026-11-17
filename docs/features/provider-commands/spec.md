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
- design.md '허용 목록' 표의 명령만 그 프로바이더의 `/` 목록과 Presets 팝오버 'Commands' 탭에 나온다. 이 표는 PoC(2026-11-17)에서 확인한 명령과 확인 버전이다.
  - Claude Code: `/compact`, `/clear`, `/init`, `/review`, `/context`, `/usage`
  - Codex: `/compact`, `/review`
  - Cursor: `/copy-request-id`
  - Copilot: `/compact`, `/init`, `/review`, `/context`, `/usage`, `/session`, `/rename`
  - Antigravity: 없음
  - 확인 버전보다 낮은 CLI에서는 명령 행이 나오지 않는다. ACP는 서버가 알려 준 목록에 있을 때만 나온다.
- '동작함'으로 확인된 명령을 보내면 PoC 표에 적힌 기대 결과가 스레드에 나타난다.
  - `/compact`: 실행 중 표시, 끝나면 압축 경계, 컨텍스트 링 갱신. 요약 메시지와 명령 출력 줄은 숨긴다.
  - `/clear`(Claude만): 컨텍스트 지움 경계, 대화가 새 세션 id를 따라감
  - Codex `/review`: `review/start`로 보내고, 일반 답변처럼 보인다. 리뷰가 남기는 중단된 자식 턴은 숨긴다.
  - 텍스트 결과를 내는 명령: 일반 답변처럼 표시
  - 실패: 기존 턴 실패 표시
- 앱을 재시작한 뒤에도 압축·지움 경계가 보인다. 경계는 프로바이더 세션 기록의 이벤트에서 다시 만든다. 예외: Copilot의 압축 경계는 이번 실행에서만 보인다.
- 동작하지 않는다고 확인된 명령(design.md '허용 목록'의 카드 대상, 예: `/model`, Antigravity `/logout`)을 보내면 프로바이더에 보내지 않는다. 대신 정해진 문구의 카드가 뜨고, 보낸 텍스트는 컴포저로 돌아온다.
- 내장 명령 이름이 아닌 `/` 단어와, ACP 서버가 알려 주지만 확인하지 않은 명령은 지금처럼 일반 텍스트로 간다. 예를 들어 `/Users/...` 같은 경로가 그렇다.
- 사람이 고른 `/clear`만 세션 교체를 허용한다. 그 밖에는 Doan이 세션을 몰래 새로 시작하거나 fork하지 않는다(PRODUCT 'Resume and permissions').

## 비목표
- 터미널 화면에서만 의미가 있는 명령: `/model`, `/config`, `/login`, `/logout`, `/permissions`, `/theme` 등. Doan이 같은 기능을 자기 UI(모델·권한 picker, Settings)로 제공한다. 이 명령들은 결정 2의 카드 대상이다.
- MCP 프롬프트, claude.ai 커넥터, 플러그인 명령, 사용자 범위 명령. 지금의 'Project skills' 제외 범위를 유지한다.
- 명령 인자 입력을 돕는 UI. 인자는 텍스트로 쓴다.
- Antigravity `/plan`의 승인 흐름. BACKLOG에 남긴다.
- Claude `builtin: true` 목록의 번들 스킬(`deep-research`, `design` 등).
- 목록 밖 명령 카드를 앱 재시작 뒤에도 남기는 것. 카드는 이번 실행에서만 보인다.
