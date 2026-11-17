# provider-commands — design

## 영향받는 구성
- **앱 main**
  - `conversation/skills.ts`: 명령 목록을 파싱한다.
  - runner 보내기 경로: Claude는 Agent SDK, Codex는 app-server 요청, ACP는 `acp.ts`·`acpRunner.ts`를 쓴다.
  - 세션 연결: `runners.ts:181`의 세션 id 고정 검사와 `store.ts`의 `SessionBinding`을 바꾼다.
- **앱 renderer**
  - `/` 목록, Presets 팝오버, 하이라이트, 보내기 조립(PRODUCT §5 'Project skills'의 Lists·Highlight·Sending 규칙)
  - 큐 행, 스레드의 경계와 카드
- **CLI, 스킬, 캔버스 형식**: 영향 없음.

## 순수 함수로 뗄 부분 (`/tdd` 대상)
- `parseClaudeCommands(commands)`: `builtin: true` 항목 중 허용 목록에 있는 것만 고른다.
- `parseAcpCommands(update)`: `available_commands_update`에서 허용 목록에 있는 명령만 고른다.
- 허용 목록: 프로바이더별로 PoC에서 확인한 명령과 확인 CLI 버전을 담는 고정 표다. `minimumVersions.ts`처럼 버전을 함께 적는다. 실제 목록은 이 표와 CLI가 알려 준 목록의 교집합이다.
- `commandRequest(provider, text)`: 보낼 텍스트를 프로바이더 요청으로 바꾼다. Claude와 ACP는 텍스트를 그대로 보낸다. Codex는 `/compact` → `thread/compact/start`, `/review` → `review/start`로 바꾼다.
- `classifyFirstWord(text, lists)`: 첫 단어를 다음 넷 중 하나로 판정한다.
  - 허용 명령
  - 목록 밖 내장 명령(카드 대상)
  - 프로젝트 스킬: 이름이 명령과 같으면 스킬이 우선한다.
  - 일반 텍스트
  - 한글이 붙은 경우(`/compact해줘`)는 스킬 하이라이트 규칙과 같게 끊는다.
- 보내기 조립: 첫 단어가 명령이면 프리셋·스킬 고정 줄을 붙이지 않는다. 명령 뒤의 텍스트는 인자로 보낸다.
- 큐 규칙: 명령은 다른 메시지와 합치지 않는 별도 큐 행이 되고, Send now 대상이 아니다.
- 경계 뷰: 프로바이더 세션 기록 이벤트를 경계 행으로 바꾼다. Claude는 `compact_boundary`(`fixtures/claude-context.json:97`)를 쓰고, Codex는 `thread/compacted`를 쓴다.
- 카드 뷰: 명령 이름과 프로바이더에서 문구와 행동을 정한다.

## 형식 변경
- IPC 타입: `SkillSummary`에 행 종류(`skill` | `command`)를 추가한다. 디스크 형식이 아니므로 JSON Schema는 바뀌지 않는다.
- 대화 기록: 바꾸지 않는다(결정 4). 경계는 프로바이더 세션 기록에서 다시 만들고, 카드는 기록에 남기지 않는다.
- 세션 연결(`SessionBinding`): 필드는 그대로 두고 값만 새 id로 다시 쓴다(결정 5). 형식이 바뀌어야 한다면 PoC 뒤 이 절을 다시 열고, schema·`v`·TS/Go 공유 fixture(ARCHITECTURE §11)를 이 feature에 추가한다.

## ACP 명령 목록의 수명
- ACP 서버는 세션이 열린 뒤 `available_commands_update`를 보낸다. 지금 runner는 prompting 중인 `session/update`만 처리한다.
- 세션이 열려 있으면 마지막 update를 대화별로 보관해 목록으로 쓴다. 세션이 없으면(첫 메시지 전) 명령 행을 보이지 않는다. 이것은 스킬 목록의 "읽기 전에는 행 없음" 규칙과 같다.
- 연결이 바뀌면 그 연결로 받은 목록만 쓴다. 다음 postmortem 항목과 같은 이유다: 2026-11 "The Codex model list stayed the previous account's…"(`skills.ts:56` 주석이 가리키는 항목).

## 규칙·결정 영향
- PRODUCT §5 'Project skills'의 "not its built-in commands" 문구를 바꾼다.
- PRODUCT 'Resume and permissions'·'Session identity'에 예외를 둔다. 사람이 고른 `/clear`가 세션 id를 바꾸면, 대화가 새 id를 따라간다.
- 모두 마지막 task에서 고친다.

## PoC 의존 (task 1이 먼저다)
- Claude: SDK 대화에 후보 명령을 텍스트로 보내고 오는 메시지를 기록한다. 압축 경계는 fixture에 이미 있으므로 `/clear`의 세션 id 변화와 텍스트 결과 명령을 중심으로 본다.
- Codex: `thread/compact/start`, `review/start`의 실제 응답과 이벤트, `/clear`에 대응하는 요청이 있는지 확인한다. 요청 이름은 `codex app-server generate-json-schema`(0.167.1)로 확인했다.
- ACP 세 프로바이더: `available_commands_update`가 오는 시점과 내용, 그 명령을 보냈을 때의 결과를 확인한다.
- 결과는 프로바이더×명령 표로 남긴다. 각 칸은 '동작함 / 표시 필요 / 동작 안 함' 중 하나와 기대 결과, 확인 버전이다.

## postmortem에서 가져온 주의
- 2026-11 "The Codex model list stayed the previous account's…": 목록 읽기는 요청마다 자기 lease로 준비한다. 같은 `SkillCatalog` 경로를 쓴다.
- 2026-10 프로토타입 컴포저 설정 push 순서 문제(2026-10.md:311): 프로토타입 창 컴포저도 같은 목록과 규칙을 받는지 테스트한다.
- PoC와 dev 실행은 실제 HOME과 프로필을 쓰지 않는다. 격리된 `CLAUDE_CONFIG_DIR`/`CODEX_HOME`을 쓴다(AGENTS 'Commands').

## 결정
1. **`/clear`는 그대로 보낸다.** 같은 대화 안에서 컨텍스트를 비우고, 스레드에 경계를 남긴다. 경계 라벨은 "Context cleared — the agent won’t see messages above"다.
2. **목록 밖 내장 명령은 보내지 않고 카드로 알린다.** 첫 단어가 그 프로바이더의 내장 명령인데 허용 목록에 없으면(`/model` 등), 자동완성에 나오지 않는다. 보내면 프로바이더에 보내지 않고 턴도 시작하지 않는다. 카드는 다음과 같다.
   - 제목: "`/<name>` doesn’t run in Doan"
   - Doan에 같은 기능이 있을 때: 본문 "Choose the model from the model picker."와 버튼 "Open model picker"(명령별 문구 표)
   - 같은 기능이 없을 때: 본문 "Run it in <provider> in a terminal.", 버튼 없음
   - 닫기는 Dismiss이고, 보낸 텍스트는 컴포저로 돌아온다.
   - 내장 명령 이름을 아는 경로: Claude는 SDK의 `builtin` 목록, Codex는 PoC로 만든 고정 이름 표, ACP는 `available_commands_update`다.
3. **명령은 혼자서만 보낸다.** 명령을 고르면 프리셋 칩이 빠지고 "Presets don’t apply to commands"로 알린다. 명령 단어를 지우면 칩을 복원한다. 명령 메시지에는 고정 줄을 붙이지 않는다.
4. **경계만 재시작 뒤에 남는다.** 경계는 프로바이더 세션 기록 이벤트에서 다시 만든다. 카드는 이번 실행에서만 보인다.
5. **`/clear`로 세션 id가 바뀌면 새 id를 따라간다.** 사람이 고른 `/clear`에 한해 대화의 세션 연결을 새 id로 다시 쓴다. 다시 쓸 때도 profile·cwd 검증(PRODUCT 'Session identity')을 거친다.
6. **실행 중인 턴에 보낸 명령은 별도 큐 행이 된다.** 다른 메시지와 합치지 않고 턴이 끝난 뒤 혼자 간다. 명령 행에서 Send now는 비활성이다.
7. **명령 턴은 기존 턴 표시를 쓴다.**
   - 실행 중: 기존 진행 표시를 쓰고, 라벨은 명령별로 둔다. 예: "Compacting…"
   - 텍스트 결과: 일반 답변처럼 보인다.
   - 실패: 기존 턴 실패 표시를 쓴다.
   - 끝나면 컨텍스트 링을 갱신한다.
   - 대화 제목 규칙에서는 명령 턴을 뺀다.
8. **목록 규칙**
   - 명령 행은 스킬처럼 회색 타일에 터미널 아이콘이다.
   - Presets 팝오버에서는 Project 탭 뒤에 'Commands' 탭을 둔다.
   - 이름이 같으면 프로젝트 스킬이 우선한다.
   - 하이라이트는 스킬과 같은 규칙을 쓴다.
   - 질의가 명령 이름과 같으면 Enter는 보낸다.
   - 목록 읽기 중, 실패, 명령 없는 프로바이더는 스킬 목록 규칙을 그대로 따른다. 실패하면 행이 없고 마지막 목록을 유지한다.
   - 카드의 행동 버튼을 누르면 해당 picker로 포커스가 간다. 카드는 status로 알린다.

## 디자인 프리셋
- 아직 읽지 않았다. `/design-draft` 전에 clarify와 harden을 읽는다.
