# provider-commands — design

## 영향받는 구성
- **앱 main**: `conversation/skills.ts`(명령 목록 파싱), 각 runner의 보내기 경로. Claude는 Agent SDK, Codex는 app-server, ACP는 `acp.ts`/`acpRunner.ts`가 해당한다.
- **앱 renderer**: `/` 목록과 Presets 팝오버의 행 종류에 명령을 추가하고, 하이라이트와 보내기 조립을 고친다(PRODUCT §5 'Project skills'의 Lists·Highlight·Sending 규칙).
- **CLI, 스킬, 캔버스 형식**: 영향 없음.

## 순수 함수로 뗄 부분 (`/tdd` 대상)
- `parseClaudeCommands(commands)`: `builtin: true` 항목 중 허용 목록에 있는 것만 고른다.
- 허용 목록: 프로바이더별로 PoC에서 확인한 명령만 담는 고정 표다. 버전마다 바뀌므로 CLI가 알려 준 목록과 교집합을 쓴다.
- 보내기 조립: 첫 단어가 명령이면 프리셋·스킬 고정 줄을 붙이지 않고 명령 텍스트만 보내는 규칙. 명령과 프리셋을 함께 고른 경우의 처리도 여기서 정한다.
- 스레드 표시: 명령 턴의 버블과 결과 줄 뷰. 예를 들어 압축 경계를 어떻게 보일지.

## 형식 변경
- `SkillSummary`에 행 종류(skill/command)가 필요하다. IPC 타입만 바뀌고 디스크 형식(JSON Schema)은 바뀌지 않는다. 대화 기록에 명령 턴을 남기는 방식이 기존 턴 형식으로 표현되지 않으면 그때 schema 변경을 다시 검토한다.

## 규칙·결정 영향
- PRODUCT §5 'Project skills'의 "not its built-in commands" 문구를 바꾼다. 마지막 승격 task에서 고친다.
- `/clear`는 대화를 비우고 새 컨텍스트로 시작한다. 이는 'Session identity' 계약(세션을 몰래 새로 시작하지 않는다)과 충돌할 수 있다. 결정 질문 1이다.

## PoC 의존 (task 1이 먼저다)
- Claude: SDK 대화에 `/compact`, `/init`, `/review`, `/context`, `/cost` 등을 텍스트로 보내면 어떤 메시지가 오는지 확인한다. compact boundary, local command output 등이 대상이다.
- Codex: app-server에 대응 요청(예: thread compact, review start)이 있는지 확인한다. 텍스트 `/compact`는 모델에 그대로 전달되는지도 확인한다.
- ACP(Cursor, Antigravity, Copilot): `available_commands_update`가 오는지, 그 명령이 동작하는지 확인한다.
- 결과는 프로바이더×명령 표로 남긴다. 동작함 / 동작하지만 결과 표시가 필요함 / 동작 안 함으로 나눈다.

## postmortem에서 가져온 주의
- 2026-11-06 (`skills.ts` 주석): 목록 읽기는 요청마다 자기 lease로 준비한다. 로그아웃이나 재연결 뒤의 목록이 섞이지 않게 같은 `SkillCatalog` 경로를 쓴다.
- 2026-11 격리: PoC는 실제 HOME과 프로필을 쓰지 않는다. 격리된 `CLAUDE_CONFIG_DIR`/`CODEX_HOME`에서 돌린다(AGENTS 'Commands' dev 실행 규칙).

## 디자인 프리셋
- 아직 읽지 않았다. UI 흐름이 정해지면 `/design-draft` 전에 clarify와 harden을 읽는다.

## 결정
1. **`/clear`는 그대로 보낸다.** 같은 대화 안에서 프로바이더가 컨텍스트를 비운다. 필요한 것은 두 가지다.
   - 스레드에 경계 표시를 남긴다. 그 위의 기록은 남지만, 에이전트는 기억하지 않는다는 뜻이다.
   - PRODUCT 'Resume and permissions'·'Session identity'에 예외 문구를 둔다. 사람이 명시적으로 고른 `/clear`는 '몰래 새로 시작'이 아니다. 세션 id가 바뀌는지는 PoC에서 확인하고, 바뀌면 대화가 새 id를 따라가게 한다.
2. **목록 밖 내장 명령은 스레드 카드로 알린다.** 첫 단어가 그 프로바이더의 내장 명령인데 허용 목록에 없으면(`/model` 등), 자동완성에는 나오지 않는다. 이런 명령이 보내지면 스레드에 카드를 하나 띄워 Doan에서는 동작하지 않는다고 알린다. Doan에 같은 기능이 있으면 카드가 그 자리를 알려 준다(예: `/model` → 모델 picker).
   - Doan은 이 명령을 프로바이더에 보내지 않고 카드만 남긴다. 턴은 시작하지 않으므로 사용량도 쓰지 않는다.
   - 내장 명령 이름이 아닌 `/` 단어는 지금처럼 일반 텍스트로 보낸다. 예를 들어 `/Users/...` 같은 경로가 그렇다.
3. **명령은 혼자서만 보낸다.** 명령을 고르면 프리셋 칩을 뺀다. 첫 단어가 허용된 명령인 메시지에는 프리셋·스킬 고정 줄을 붙이지 않고, 명령 뒤의 텍스트는 명령 인자로 그대로 보낸다.
