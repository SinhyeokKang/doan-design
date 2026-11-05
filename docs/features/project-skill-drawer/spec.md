# project-skill-drawer — spec

사람의 요청(원문): "대화창에서 /로 프리셋 서랍 열잖아, 거기 검색으로 프로젝트 자체의 스킬을 검색하거나 /<project-skill> 입력하면 하이라이트 치고 에이전트에 전달할 수 있을까?"

사람이 더한 말(원문, 2026-11-06):

- "백엔드 개발자들 도안에서 코딩하더라" — tester 가운데 백엔드 개발자도 Doan에서 코딩한다. design과 상관없는 skill도 대상이다(design 결정 0).
- "지금 프롬프트 한 것 처럼 하는게 어떄?", "정확히 매치되는 스킬이 있으면 생기게했으면 좋겠음", "Enter로 확정 아니고 인라인에서 단어 단위로 /<slug> 정확히 매치하면 인라인 하이라이트" — 고른 skill을 chip 줄의 chip으로 보이지 않는다. 사람이 친 글 속에서 목록에 있는 skill과 **정확히 같은 단어** `/<이름>`이 보이는 동안 그 단어를 제자리에서 하이라이트한다(small-ui-tweaks 결정 7의 제안 문장 이름 하이라이트와 같은 모양). Enter나 고르기로 확정하는 단계는 없다(design 결정 4).

읽은 뜻: composer의 preset 목록(Presets 버튼의 popover와 `/` 목록)이 Doan의 design preset과 함께 **열린 project의 저장소에 있는 skill**(이 문서는 **project skill**이라 부른다)도 찾는다. composer의 글에 project skill 이름을 `/<이름>` 단어로 쓰면 그 단어가 하이라이트되고, 보낼 때 Doan이 "이 skill을 써라"는 고정 문장을 붙여 agent에게 전한다. 사람의 글은 친 그대로 간다.

## 범위 확인(scope gate)

- **PRODUCT §3 Out of scope 1–7 어디에도 직접 걸리지 않는다.**
  - Out of scope 4 'Autonomous agent wake-up': skill은 사람이 쓰고 사람이 보낸 메시지에만 실린다. Doan은 skill을 고르거나 실행하지 않고, 새 턴을 시작하지 않는다.
  - Doan은 skill 파일을 쓰거나 고치거나 읽지 않는다(ARCHITECTURE §6 'Stub' "Never installed per repo"). 목록은 provider에 묻는다(design 결정 1).
  - Out of scope 5 'Server': 목록은 이 기기의 provider CLI에서 읽는다.
- **PRODUCT가 다루지 않던 점은 사람이 정했다**(design 결정 0, 사람, 2026-11-06): 저장소의 project skill 전부가 대상이다. design과 상관없는 skill(배포, 리뷰 등)도 들어간다.
  - PRODUCT §5 Skills 13은 preset에 대해 "There is no classifier model, no rewrite of the user's request and no automatic review"를 정하고, 고른 preset은 사람의 글 앞의 고정 줄이다(ARCHITECTURE §7 'Design preset reads' 'Connecting a chosen preset'). 이 feature는 같은 원칙(고정 문장, 요청을 고쳐 쓰지 않음, 분류 모델 없음)을 project skill에 넓힌다.
  - PRODUCT §5 item 0 'Agent setup'의 "Not included: … project-scope skills"는 Doan이 저장소에 skill을 **설치하지 않는다**는 뜻이다(ARCHITECTURE §6 'Stub' "Never installed per repo"). 이 feature는 설치하지 않고 저장소에 이미 있는 skill을 보일 뿐이므로 충돌하지 않는다.
- **PRODUCT의 자리**(사람, 2026-11-06): §3 In scope 6 'Conversation'에 composer가 저장소의 skill을 이름으로 agent에게 전한다는 문장을 더하고, 규칙은 §5 item 1(composer)에 둔다. 'Send'의 글 한도 문장(지금 "32,768 code units of text plus the preset line")은 고정 줄 전부를 포함하도록 바뀐다. 마지막 task(Z1)에서 고친다.

## 사용자

- **사람(앱 사용자)**: Home, project Overview, 캔버스 conversation panel의 composer에서 `/`를 치거나 Presets 버튼을 눌러 저장소의 skill을 이름이나 설명으로 찾는다. 글에 `/<이름>`을 직접 쓰거나 목록에서 고르면, 그 단어가 글 속에서 하이라이트되어 skill로 알아들었음을 보인다. 보낸 메시지의 말풍선에서도 같은 단어가 하이라이트된다. agent가 그 skill을 실제로 썼는지는 agent의 답과 activity로 본다.
- **에이전트(Doan 앱 대화 안)**: 하이라이트된 skill이 있는 메시지를 받으면, 메시지 맨 앞의 고정 문장으로 어떤 skill을 쓰라는지 안다. agent는 자기 provider의 방법(Claude Code의 Skill 도구, Codex의 skill 목록)으로 그 skill을 불러 쓴다. CLI, guide(`doan skill`), skill stub, `doan check`는 바뀌지 않는다.
- **터미널 agent(Doan 밖)**: 바뀌지 않는다.

## 문제(관찰한 사실)

1. **목록에는 Doan의 design preset만 있다.** composer의 preset 목록은 CLI의 `doan design-skill --json` 목록(20개)만 보인다(`app/src/main/designSkills.ts`, `presetListView` `app/src/renderer/homeComposer.ts:404`). 검색도 preset의 title·id·scope·description만 본다(`searchPresets`, `homeComposer.ts:373`). 저장소의 skill(예: 이 저장소의 `.agents/skills/<name>/SKILL.md`와 `.claude/skills/<name>` 링크)은 목록에 없다.
2. **`/<이름>`을 쳐도 skill로 전달되지 않는다.** `/` 목록은 field가 `/`로 시작하고 줄바꿈이 없을 때만 열리고(`slashQuery`, `homeComposer.ts:471`), Enter는 목록의 강조된 preset을 고른다(`slashKey`, `HomeComposerView.tsx:144`). 맞는 preset이 없으면 Enter는 `/이름`을 보통 글로 보낸다. 글 속의 `/이름`은 아무 표시도 받지 않는다.
3. **보통 글로 보낸 `/이름`이 skill로 쓰일지는 provider마다 다르고, Doan이 정하지 않는다.** Doan의 턴 prompt는 항상 고정 안내 문장으로 시작하고, 사람의 글은 그 뒤 JSON의 `userText` 필드 안에 들어간다(`turnPrompt`, `app/src/main/conversation/prompt.ts:45-73`). 그래서 메시지 **맨 앞**의 `/name`만 펼치는 동작(Claude Code, Copilot의 맨 앞 규칙)은 Doan 대화에 닿지 않는다. 반대로 글 속 어디에 있든 이름을 잡는 동작도 있다: Cursor는 공백 뒤의 `/name`을, Codex는 `$name`을 글 어디서든 skill 선택으로 읽는다(design '조사 결과'). 같은 글이 provider에 따라 skill을 부르기도 하고 안 부르기도 한다.
4. **Doan 대화가 어떤 skill을 실제로 불러오는지는 provider마다 다르다.** Doan 대화는 Doan의 profile에서 돈다(PRODUCT §3 In scope 7). Claude Code는 `settingSources: ["user", "project", "local"]`(`runners.ts:285`)이고 user 범위는 Doan profile(`CLAUDE_CONFIG_DIR`)이라 doan stub만 있다. Codex는 `CODEX_HOME`이 Doan profile이다. Cursor, Antigravity, Copilot은 Doan이 정한 HOME에서 돈다(`app/src/main/agentAuth/providers.ts:112-139`). 저장소의 skill을 각 provider가 어디서 읽는지는 design '조사 결과'에 정리했다.

## 완료 조건

design '결정' 0–26(사람, 2026-11-06)을 따른다.

1. **대상.** composer의 provider가 Claude Code나 Codex일 때, 그 provider가 Doan 대화에서 불러오는 project skill이 목록과 하이라이트의 대상이다(결정 1·2). Claude의 `.claude/commands/*.md`도 project skill로 다룬다. 빼는 것: provider 내장 command(`builtin`), Doan의 `doan` stub, MCP prompt·claude.ai connector·plugin 항목(규칙은 P1에서 확정), Codex의 `scope !== "repo"`·`enabled === false`·`pluginId`가 있는 항목. 다른 provider, skill이 없는 저장소, 목록을 한 번도 받지 못한 채 읽기에 실패한 경우에는 skill 탭·행·하이라이트가 없고, preset 목록과 보내기는 그대로 된다(결정 5).
2. **목록.** Presets popover에는 "Project" 탭이 preset group 탭 뒤에 있다. `/` 목록과 검색 결과는 preset 뒤에 project skill 행을 보이고, 행 왼쪽에 아이콘 타일이 있다. Doan preset 행은 보라, skill 행은 회색이다(결정 5, 23). 검색은 이름과 설명으로 찾고 점수 규칙은 preset 검색과 같다. 검색어가 skill 이름과 정확히 같으면 그 행이 맨 위다. 단, 검색어가 preset id와도 정확히 같으면(예: 이 저장소의 `audit`) 그 preset 행이 맨 위이고 skill 행은 바로 아래다(결정 16). preset 읽기가 loading·error·옛 CLI여도 받은 skill 행은 그 아래에 보인다(결정 19). 검색 칸 placeholder와 접근 이름은 skill이 하나 이상일 때 "Search presets and skills", 아니면 지금처럼 "Search presets"이고, 버튼 이름 "Design presets"는 그대로다(결정 7). field 맨 앞 skill 단어 뒤에 공백이 오면 `/` 목록이 닫히고, 그 공백을 지우면 다시 열린다(결정 14). 확정 편집 뒤 새로 맞은 skill마다 "Project skill <name>"을 화면 읽기 프로그램에 한 번 알린다.
3. **하이라이트.** 사람의 글에서 목록의 skill 이름과 정확히 같은 단어 `/<이름>`(경계 규칙: design §4)이 있는 동안 그 단어가 제자리에서 하이라이트된다. 모양은 small-ui-tweaks 결정 7의 이름 하이라이트와 같은 값(`--surface-accent-subtle` 배경, `--text-accent-subtle` 글자, `--type-weight-medium`, 모서리 6px, padding 0 `--space-1h`)이다. 글자를 더하거나 지워 이름과 달라지는 순간 하이라이트가 사라진다. 이름 바로 뒤에 한글이 붙으면 거기서 이름이 끝난다: `/deploy로 배포해`는 `/deploy`만 하이라이트하고 조사는 밖이다(결정 11). `/` 앞에는 field 맨 앞이나 공백만 온다(결정 10). Enter나 다른 확정 단계는 없고, 하이라이트만 끄는 동작도 없다(결정 4, 13).
4. **글은 글이다.** 하이라이트된 단어는 보통 글자다. caret 이동, 지우기, 실행 취소, 복사·붙여넣기(plain text), IME 입력은 하이라이트가 없을 때와 같다. 붙여넣은 글과 되돌린 draft도 같은 규칙으로 하이라이트된다. `/Users/…` 같은 경로는 그 단어 전체가 목록의 skill 이름과 같을 때만 하이라이트된다. IME로 한글을 조합하는 동안에는 하이라이트를 다시 그리지 않는다. 그래서 조합 중인 글(`/deploy에서도`의 `에서도`)이 하이라이트 안에 보일 수 있고, 조합이 끝난 뒤 다시 정해진다(결정 20).
5. **고르기.** 목록에서 skill을 고르면 `/<이름>` 글과 공백 하나가 들어가고, caret은 그 공백 뒤에 있고, 같은 규칙으로 하이라이트된다. `/` 목록에서 고르면 field 맨 앞의 `/검색어`가 그 글로 바뀌고, Presets popover에서 고르면 caret 자리에 들어간다. `/` 검색어가 skill 이름과 정확히 같고 맨 위 행이 그 skill이면 Enter는 고르지 않고 보낸다(결정 17). preset을 고르는 동작은 지금 그대로다(chip 줄의 preset chip 하나). 목록이 열린 채 다시 읽은 결과로 행이 바뀌면 강조는 같은 행을 따라가고, 그 행이 없으면 맨 위로 간다. 고른 탭이 사라지면 첫 탭으로 간다.
6. **전달.** 보낼 때 하이라이트된 skill마다(같은 이름은 한 번, 처음 나온 순서, 조사·문장부호를 뗀 목록의 이름 그대로) "Use the project skill \`<name>\`." 한 줄을 사람의 글 앞에 붙인다. preset chip도 있으면 preset 줄이 먼저다. 사람의 글은 친 그대로(`/<이름>` 포함) 간다(결정 3). Doan은 skill 본문을 읽지 않는다. 32,768 code unit 한도는 고정 줄(preset 줄과 skill 줄)을 포함한 글로 센다.
7. **thread, 한 줄 글, 되돌린 draft.** 보낸 메시지의 말풍선은 글 속의 같은 단어를 보낸 skill 줄의 이름으로(그때의 목록이 아니라) 같은 모양으로 하이라이트하고, 고정 줄은 보이지 않는다. 대화 제목(sidebar slot, Canvas conversations, 메뉴), queue 행, 알림의 한 줄 글도 고정 줄을 뗀 사람의 글로 만든다(결정 18). queue에서 돌아온 draft와 Home의 Edit on Home은 고정 줄을 떼고 사람의 글만 되살린다. 하이라이트는 그때의 목록으로 다시 정해진다.
8. **목록을 다시 읽는 때.** composer를 처음 그릴 때, 목록(popover나 `/`)이 열릴 때, 턴이 끝날 때, Home에서 provider나 project를 바꿀 때 읽는다. root × provider마다 30초에 한 번까지이고, 읽는 동안과 실패했을 때는 마지막으로 받은 목록을 쓴다(결정 6, 21).
9. **Antigravity의 doan stub(사람, 2026-11-06: "그럼 그 run이 책임지도록. BACKLOG로 짬 떄리는게 아니고").** tasks P5가 Doan 연결 Antigravity 대화에서 `<GEMINI_HOME>/skills/doan` stub을 서버가 찾는지 서버 버전과 함께 기록한다. 찾지 못하면 이 feature의 run이 stub을 서버가 실제로 읽는 경로에 두고(tasks F1), 이미 있는 profile도 다음 provider 프로세스부터 그 경로에 stub을 가지며, 실제 Antigravity 턴 하나로 다시 확인한다. 찾으면 F1은 하지 않는다.
10. **바뀌지 않는 것.** Right Arrow의 next-message suggestion 받기(PRODUCT §5 item 3), Control+Enter의 Send now, `{{`·`}}` 규칙, anchor chip, preset chip은 그대로다.

## 비목표

- Doan이 skill을 실행하거나, skill 본문을 읽어 prompt에 넣거나, skill을 만들고 고치고 설치하는 일. Doan은 저장소의 skill 파일을 읽지도 쓰지도 않는다.
- Cursor, Copilot, Antigravity의 project skill(결정 2). 이 provider가 고른 composer에는 skill 탭·행·하이라이트가 없다.
- provider의 내장 slash command(`/compact`, `/init`, `/review` 등)와 사람의 user 범위 skill(`~/.claude/skills` 등)을 목록에 보이는 일.
- 하이라이트된 단어를 하나의 편집 단위(chip)로 만드는 일, Enter나 클릭으로 확정하는 일(결정 4).
- skill 인자(argument hint) 입력 UI. 인자는 사람이 이름 뒤의 글로 쓴다.
- terminal session(legacy external) 대화에서 그 사람의 user 범위 skill까지 보이는 일. terminal session의 docked composer는 다른 composer와 같은 목록(Doan 프로필로 읽은 목록)을 쓴다(design §1).
- `doan` skill 자체(Doan이 각 profile에 넣는 stub)를 목록에 보이는 일. Doan의 preset이 이미 그 역할을 한다. Claude 쪽은 이름 `doan`으로 거르므로, 저장소에 같은 이름의 진짜 project skill이 있으면 Claude에서는 보이지 않는다. 받아들인다.
- MCP prompt, claude.ai connector, plugin 항목을 목록에 보이는 일(PRODUCT §3 In scope 9가 따로 다룬다).
- Cursor·Copilot에서 글 속 `/name`이 provider 쪽 규칙으로 skill이 되는 일(문제 3). 그 composer에는 하이라이트가 없고, Doan은 그 동작을 바꾸지 않는다.
- Antigravity의 project skill. 아래 완료 조건 9의 doan stub 확인·수정은 Antigravity를 이 feature의 대상에 넣는 일이 아니다(결정 2).
