# prompt-suggestion — spec

사람의 요청: "세션 중 다음 추천 입력어 Placeholder. 오른쪽 방향키로 인풋 … 구현 가능하면 하고 싶은데 내가 정확히 모르겠음 이 기능 구현 가능한건지"

대화 중 턴이 끝나면 agent가 예측한 다음 입력(이하 **다음 입력 제안**)을 docked composer의 placeholder 자리에 보인다. 입력란이 비어 있을 때 오른쪽 방향키를 누르면 그 제안이 입력란에 들어간다. 보내지는 않는다.

용어: Home과 새 대화 상태의 "suggested prompts"(PRODUCT §5 item 1, preset chip과 canvas 이름을 채우는 행)와는 다른 것이다. 이 문서에서는 둘을 섞지 않는다.

## 구현 가능한가(조사 요약)

Claude Code에서만 가능하다. 근거는 design '조사 결과'에 있다.

- **Claude Code**: 가능하다. 대화 runner가 쓰는 Claude Agent SDK(0.3.312)에 `promptSuggestions` 옵션이 있고, 켜면 CLI가 턴의 `result` 뒤에 `prompt_suggestion` 메시지를 최대 하나 보낸다. 다만 Doan은 턴마다 CLI를 새로 열고 `result` 직후 입력을 닫는데, 이 구조에서 제안이 실제로 오는지와 프로세스 종료가 얼마나 늦어지는지는 아직 확인하지 않았다(design 'PoC 의존', tasks P1).
- **Codex**: 다음 입력을 알려 주는 일반 알림은 없다. 실험 API인 `thread/prediction/updated`가 있지만, client가 ephemeral fork를 열어 예측을 직접 요청해야 하는 것으로 보인다. 이는 Doan이 모델 작업을 시작하고 세션을 fork하는 일이라 쓰지 않는다(PRODUCT §3 Out of scope 4, 'Resume and permissions'의 "never forks").
- **Cursor·Antigravity·GitHub Copilot(ACP)**: Doan의 ACP 처리와 저장소 안 자료에서 제안 메시지를 찾지 못했다.
- **Doan이 직접 생성**: 쓰지 않는다. Doan이 스스로 모델 요청을 시작하는 일이다(PRODUCT §3 Out of scope 4).

## 범위 확인(scope gate)

- PRODUCT §3 Out of scope 1–7 어디에도 걸리지 않는다고 본다. 제안은 사람이 보낸 턴 안에서 provider CLI가 스스로 만드는 출력이고, Doan은 SDK 옵션 하나로 받기만 한다. 제안은 새 턴을 시작하지 않고, 도구를 쓰거나 파일을 바꾸지 않으며(CLI 쪽 문자열 "No tools needed for suggestion"), 입력란에 넣어도 사람이 보내야 간다. CLI가 사람의 계정으로 짧은 모델 요청을 하나 더 하는 점은 사람이 받아들였다(design 결정 2).
- PRODUCT §5 items 2·3(캔버스 대화 패널, 프로젝트 Overview)의 docked composer 위에서 일어난다. Home composer는 새 대화만 시작하므로 대상이 아니다.
- PRODUCT·ARCHITECTURE에는 다음 입력 제안에 대한 규칙이 없다. 두 문서가 정하지 않은 점은 사람이 정했고, design '결정'에 있다.

**선행 조건**: provider-usage PR(브랜치 `feat/provider-usage`)이 main에 병합된 뒤 시작한다. 이 기능은 그 PR이 만든 턴 끝 처리(`runners.ts`의 `TURN_USAGE_MS`, `usageAtTurnEnd`)와 같은 자리, 같은 종료 시간 예산(`service.ts` `EXIT_WAIT_MS`)을 쓴다.

## 사용자

- **사람(앱 사용자)**: Claude Code 대화에서 턴이 끝난 뒤 다음에 할 말을 직접 쓰지 않고, 제안을 보고 오른쪽 방향키로 넣은 뒤 고치거나 그대로 보낸다.
- **에이전트**: 바뀌지 않는다. CLI, guide, skill stub, `doan check`, 턴 prompt는 그대로다. Claude Code는 자기 기능으로 제안을 만들 뿐, Doan이 agent에게 새로 요구하는 것은 없다.

## 문제(관찰한 사실)

1. docked composer의 placeholder는 고정 문구다. 기존 대화는 "Reply, / for presets", 새 대화는 Overview "Ask or describe what to design, / for presets"·캔버스 패널 "Ask, / for presets"이고, preset만 고르고 글이 없으면 preset의 문구다(`ProjectOverview.tsx` 90–91·308행, `CanvasConversationPanel.tsx` 93–94·392행).
2. Claude Runner는 `promptSuggestions`를 켜지 않는다(`runners.ts` `openClaude`의 `query` 옵션). 켜더라도 turn이 끝난 뒤의 event는 service가 버린다(`service.ts` `receive`: `live.terminal`이면 돌아감).
3. 입력란이 비어 있을 때 오른쪽 방향키는 아무 일도 하지 않는다. 옮길 caret이 없다(`chipField.ts` `arrow`는 비어 있으면 그냥 돌아간다).

## 완료 조건

1. **보이는 곳과 때.** 캔버스 대화 패널과 프로젝트 Overview의 docked composer에서, 보이는 대화가 Claude Code 대화이고 마지막 턴이 done으로 끝났으며 Claude Code가 그 턴의 제안을 보냈을 때, 입력란이 비어 있으면 placeholder 자리에 제안이 보인다. 다른 provider와 새 대화 상태에서는 지금 placeholder가 그대로다(design 결정 1).
2. **우선순위.** preset을 골랐고 글이 없으면 preset 문구가 이긴다(지금 규칙). 입력란이 읽기 전용(보내는 중, 목록에 없는 페이지, 같은 id를 가진 canvas)이면 제안을 보이지 않는다. 큐에 메시지가 있거나 돌려받은 draft가 있으면 보이지 않는다(design 결정 9).
3. **모양.** 제안은 지금 placeholder와 같은 글자색과 크기로 보인다. capsule 모양에서는 한 줄로 보이고 넘치면 말줄임으로 끝난다(DESIGN 'Narrow placeholder'). "→" 키 표시나 안내 줄은 따로 두지 않는다(design 결정 6).
4. **오른쪽 방향키.** 제안이 placeholder로 보이는 동안 입력란에서 수정키 없는 오른쪽 방향키를 누르면, 제안 전체가 입력란에 글로 들어가고 caret이 끝에 놓이며 포커스는 입력란에 남는다. 보내지 않는다. ⌘Z 한 번이면 빈 입력란으로 돌아간다.
5. **다른 키는 그대로.** 입력란에 글이나 chip이 있으면 오른쪽 방향키는 지금처럼 caret을 옮긴다. IME 조합 중(`isComposing`, `keyCode 229`)의 오른쪽 방향키, Shift·Option·Command·Control이 섞인 오른쪽 방향키는 제안을 넣지 않는다. Enter, Shift+Enter, `/` preset 목록, Backspace의 chip 지우기는 바뀌지 않는다. Enter·Tab도 바뀌지 않는다: 빈 입력란의 Enter는 제안을 보내지 않고, Tab은 포커스를 옮긴다(design 결정 8).
6. **지워지는 때.** 같은 대화의 다음 턴이 수락되면 제안은 사라진다. 대화를 archive하거나 지우면 사라진다. 창 reload와 대화 전환에는 남고 앱을 다시 시작하면 사라진다. 입력란을 비우면 다시 보인다(design 결정 3·4).
7. **다음 send를 늦추지 않음.** 제안을 켠 뒤에도 `turn.done` 직후의 send와 큐 전송이 `busy`로 거절되지 않는다(POSTMORTEM 2026-10-28). 제안이 아직 오지 않은 채 다음 send가 오면 그 제안은 버린다(design 결정 5).
8. **접근성.** 제안이 보이는 동안 입력란의 `aria-placeholder`는 제안 전체 글이고, 접근성 설명은 오른쪽 방향키로 넣을 수 있다고 알린다. 그 composer의 입력란에 포커스가 있고 비어 있으면 도착을 한 번 알린다(design 결정 7).
9. **기록과 세션.** 제안은 대화 event history에 남지 않는다(design 결정 3). 제안을 켜도 Claude 세션은 fork되지 않고, 다음 턴은 같은 세션과 transcript를 이어 간다(design 'PoC 의존' P1).

## 비목표

- Codex·Cursor·Antigravity·GitHub Copilot 대화의 제안. Codex 실험 API(`experimentalPredictionMode`, `thread/prediction/updated`)는 쓰지 않는다.
- Doan이 직접 모델에 요청해 제안을 만드는 일.
- Home composer, 새 대화 상태, 질문 카드의 Other 입력란.
- 제안을 바로 보내는 버튼, 제안 여러 개 고르기, 제안 다시 만들기.
- 제안을 켜고 끄는 Doan 설정(design 결정 2).
- 제안을 썼는지 provider에 알리는 일(CLI는 같은 프로세스의 다음 입력과 비교하지만, Doan은 턴마다 프로세스를 새로 연다).
