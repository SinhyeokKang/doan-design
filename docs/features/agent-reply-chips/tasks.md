# agent-reply-chips — tasks

## D. 드래프트

- [x] D1. `/design-draft`: 에이전트 답의 인라인 칩(Markdown 문단·목록·표 안), ` · <캔버스 이름>`이 붙은 칩, 답 블록 아래의 "No longer in the canvas", 비활성 칩, 평문으로 남은 형식 오류 링크를 새 draft `.doan/canvases/agent-reply-chips.html`에 그린다(프레임과 문구는 design.md '초안 요청'). 토스트 문구(`"missing"`·`"duplicate"`)는 clarify preset을 읽고 정한다. 사용자가 2026-11-03 chain-261103 시작 점검에서 확정했다(캔버스 이름은 잘리지 않음, 레이아웃이 없을 때 목록 행의 프레임 제목, 칩 전용 목록 읽는 중 문구).
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .` 통과, 사용자가 앱에서 draft를 확인한다.

## T. 순수 함수와 locate 기반 (`/tdd` → `/implement`)

- [ ] T0. 요소 locate가 selector 없이 동작한다: `Anchor.element.selector`를 선택 필드로 바꾸고(`app/src/main/conversation/types.ts`), `canvasScript.ts`는 doanId 후보를 selector 분기 밖에서 `data-doan-id` 속성 값 비교로 계산한다. `CanvasController.locate`는 selector가 없으면 보내지 않는다.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. 케이스: selector 없는 요소 대상이 doanId로 찾아진다, 같은 doanId가 둘이면 missing, 사람 칩(selector 있음)의 기존 결과가 그대로다, `validAnchor`는 selector 없는 사람 앵커를 지금처럼 거부한다.
- [ ] T1. `parseReplyAnchor`(`app/src/main/conversation/` 아래 type import만 쓰는 새 파일)와 `replyUrlTransform`(renderer).
  - 검증: `npm --prefix app test` green. 케이스: 맞는 프레임·요소 링크; 형식 오류 — `doan:x`, 빈 id, 대문자·밑줄 캔버스 id, `point`, 알 수 없는 종류, 네 조각 이상(`doan:d/frame/a/b`), `%2F`가 든 id는 통과, 깨진 퍼센트 인코딩(`%E0%A4%A`), `?`·`#`, 디코드 뒤 제어 문자, 200 단위 초과(201은 null, 200은 통과), `DOAN:`, `doan://open?root=…`; `replyUrlTransform`은 `doan:`을 그대로 두고 `https:`는 그대로, `javascript:`는 빈 문자열.
- [ ] T2. `replyChipTarget` (renderer).
  - 검증: `npm --prefix app test` green. 케이스: 같은 캔버스 → locate, Overview가 보이는 동안(`openCanvasId` null) 같은 id → open, 같은 root의 다른 캔버스 → open, 목록에 없음 → missing, 두 행이 같은 id → duplicate, 목록 읽는 중·프로젝트 문제 → unavailable, id 없는 행은 무시, 다른 worktree의 같은 id는 보지 않는다.

── commit: `feat(canvas): locate an element by its doan id alone` / `feat(conversation): reply anchor links` ──

## S. 렌더링과 이동

- [ ] T3. `ConversationThread.tsx`: `replyUrlTransform`, `a` 컴포넌트, `ReplyChip`(SentChip 모양과 not-found 안내 재사용), `Actions` context 확장.
  - 검증: `npm --prefix app test` green. `ConversationThread.test.tsx`와 `ConversationThread.locate.test.tsx`에 케이스: 칩·평문·https; 코드 스팬·코드 블록 안 링크는 칩이 아니다; `<doan:…>` autolink; 한글·공백 id(퍼센트 인코딩)가 칩이 된다; `doan:` href의 `<a>`가 없다; `doan://open` 링크는 평문; 같은 캔버스 칩 이름은 열린 캔버스 프레임 제목, 다른 캔버스 칩은 목록 행의 제목과 ` · <캔버스 이름>`(열린 캔버스에 같은 frame id가 있어도 빌리지 않는다), 이름과 캔버스 이름은 따로 그려 이름만 말줄임된다; 열린 캔버스에 레이아웃이 없으면 같은 캔버스 칩 이름은 목록 행의 프레임 제목이다; 접근성 이름 두 가지; 같은 캔버스 칩만 `locateDisabled`를 따른다; 같은 캔버스 missing 안내가 답 블록 아래에 뜬다; 링크 텍스트가 이름에 쓰이지 않는다.
- [ ] T4. `CanvasController.ts`·`App.tsx`·`CanvasConversationPanel.tsx`·`ProjectOverview.tsx`: `openCanvas`의 `{ frame } | { element }` 대상과 `pendingLocate`, `onReplyChip` 연결(Quick Open `pick` 경로), 토스트.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. 다른 캔버스를 열면 방문 기록이 하나 늘고 같은 캔버스 locate는 늘지 않는다(Back/Forward); 요소 대상은 첫 레이아웃 뒤 locate된다; 대상이 없으면 토스트 없이 캔버스만 열린다; 로드 실패는 `unavailableCanvasMessage`; B를 여는 중 C 칩을 누르면 B의 대기 locate를 버린다; 이동 중 대화를 바꾸면 대기 locate를 버린다; 두 root가 같은 캔버스 id를 가질 때 다른 root의 대기 locate를 쓰지 않는다; Overview에서 연다; 다른 캔버스 칩은 `decideOpen`을 거쳐 locked 페이지·first run에서는 아무것도 하지 않는다; missing·duplicate·unavailable은 토스트 한 번, 목록을 읽는 중인 칩은 "Project is still being read. Try again shortly."(Quick Open 문구는 그대로). 구현 뒤 POSTMORTEM 2026-10-27 'Shell navigation shortcuts…' 항목의 `rg`를 돌린다.

── commit: `feat(thread): agent replies draw anchor chips` ──

## G. 턴 프롬프트와 eval

- [ ] T5. `app/src/main/conversation/prompt.ts` 턴 프롬프트에 한 줄: 답에서 프레임·요소를 가리킬 때 `[name](doan:<canvas-id>/frame/<id>)`·`[name](doan:<canvas-id>/element/<doan-id>)`를 쓰고 id는 퍼센트 인코딩한다. 이 줄은 `OPEN_GUIDANCE` 줄과 함께 두고, 이 링크가 캔버스를 열어 주겠다는 제안이나 `doan://` 링크가 아니라 답이 가리키는 위치임을 밝혀 `OPEN_GUIDANCE`와 부딪치지 않게 쓴다(canvas-open-offer가 바꾼 규칙 J: 에이전트는 `doan://` 링크를 최종 답에 넣지 않고, 앱 대화에서는 열어 줄지도 묻지 않는다). ARCHITECTURE §14에 따라 R8b를 R8c로 바꾼다(`prompt.md`를 새 `turnPrompt` 출력으로, R8b 디렉터리는 지운다). R8c rubric은 `doan:` 위치 링크를 허용하고, `doan://` 링크와 열어 주겠다는 제안은 R8b처럼 partial로 둔다.
  - 검증: `npm --prefix app test` green(prompt 테스트), `node --test 'eval/**/*.test.ts'` green(R8c `prompt.test.ts`), `go run ./cli/cmd/doan skill` 출력이 바뀌지 않았다(`git diff --exit-code cli/internal/cli/skill.md`).
- [ ] T6. `/agent-eval` 시나리오 R9: 앱 대화처럼 `turnPrompt`로 만든 프롬프트(R8c 방식)로 프레임 하나와 요소 하나를 고치게 하고, 최종 답에 두 대상을 맞는 형식과 실제 id의 링크로 썼는지 검사한다. 답 추출은 H4의 `finalAnswer`를 `eval/lib`로 옮겨 재사용하고 인라인 코드도 뺀다. `fixtures/{pass,fail}.transcript.txt`를 둔다.
  - 검증: `node eval/run.ts --self-test --scenarios R9,R8c`가 `self-test PASS`, exit 0. 그다음 `npm --prefix app run package` 후 `node eval/run.ts --scenarios R9,R8c --agents claude,codex --round agent-reply-chips`에서 두 에이전트 모두 pass. 실패하면 `--repeat 2 --round agent-reply-chips-repeat`로 다시 본다. 실패가 프롬프트 문구 때문이면 T5를 고치고 같은 라운드 절차를 반복한다. 결과는 `docs/USABILITY-EVAL.md`에 기록한다.

── commit: `feat(prompt): name canvas targets with doan links` / `test(eval): R9 reply anchor links, R8c` / `docs(usability-eval): agent-reply-chips round` ──

## R. 확인

- [ ] T7. `/runtime-test`: `app/runtime/`의 격리 지원으로 임시 userData에 `conversations/index.json`(v2)과 `<id>.jsonl`을 미리 넣는다. 캔버스 대화와 프로젝트 대화에 링크가 든 `agent.message`를 두고 앱을 띄운다(선례: `.scratch/orch-buzz-project/rt-evidence/buzz-project/lib.mjs`). probe는 `.scratch/runtime-test/agent-reply-chips/probe.mjs`다. 캔버스 패널과 Overview에서 칩 모양과 이름, 같은 캔버스 locate, 다른 캔버스 열기와 Back, 없는 대상, 없는 캔버스 토스트, 형식 오류 평문을 확인한다.
  - 검증: probe exit 0과 완료 마커, 상태별 스크린샷, 실제 사용자 상태(real-state)의 전후가 같다.
- [ ] T8. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## Z. 정리

- [ ] Z1. 현재 규칙으로 고친다:
  - PRODUCT §3 In scope 2(에이전트 답도 칩으로 가리킨다), §5 item 6(에이전트 답의 칩과 이동; "chips point only into the open canvas"와 "Locate is disabled while the canvas is not shown"을 사람 칩으로 한정).
  - ARCHITECTURE §7 Markdown 링크 규칙(line ~429), §7 'Deep links'의 reply chip 문장, §7 'Input and prompt'(턴 프롬프트의 링크 줄), §3 'Picking and locate'(selector 없는 doanId locate), §14(R8c, R9, `finalAnswer` 위치).
  - DESIGN(칩이 스레드에 놓이는 모양, 안내 위치).
  - `docs/BACKLOG.md`의 해당 항목을 지운다. `docs/features/agent-reply-chips/`를 지운다.
  - 검증:
    - `grep -n "only \`https:\` links become anchors" docs/ARCHITECTURE.md` 결과 없음.
    - `grep -n "Anchor chips in the agent's replies" docs/BACKLOG.md` 결과 없음.
    - `grep -n "doan:<canvas-id>/frame/" docs/ARCHITECTURE.md` 결과 있음.
    - `grep -n "chips point only into the open canvas" docs/PRODUCT.md` 결과가 사람 칩으로 한정된 문장뿐이다.
    - `test ! -d docs/features/agent-reply-chips`.

── commit: `docs(PRODUCT): anchor chips in agent replies` / `docs(ARCHITECTURE): doan links in replies` / `docs(design): reply chips` / `docs(backlog): drop reply anchor chips` / `docs(feature): remove agent-reply-chips` ──
