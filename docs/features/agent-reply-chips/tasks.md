# agent-reply-chips — tasks

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `parseReplyAnchor`, `replyUrlTransform` (shared, `app/src/main/conversation/`).
  - 검증: `npm --prefix app test` green. 맞는 프레임·요소 링크, 틀린 형식(`doan:x`, 빈 id, 대문자·밑줄 캔버스 id, `point`, 알 수 없는 종류), 퍼센트 인코딩, 200 단위 자르기, `https:`·`javascript:` 처리.
- [ ] T2. `replyChipTarget` (renderer).
  - 검증: `npm --prefix app test` green. 같은 캔버스 → locate, 같은 root의 다른 캔버스 → open, 목록에 없음 → missing, 다른 worktree의 같은 id는 그 대화의 root만 본다.

── commit: `feat(conversation): reply anchor links` ──

## S. 렌더링과 이동

- [ ] T3. `ConversationThread.tsx`: urlTransform, `a` 컴포넌트, `ReplyChip`(SentChip 모양과 not-found 안내 재사용). locate가 id를 셀렉터 문자열로 만들지 않는지 `canvasScript.ts`의 locate 경로를 확인하고, 만든다면 속성 비교로 바꾸는 task를 더한다.
  - 검증: `npm --prefix app test` green (`ConversationThread.test.tsx`에 칩·평문·https 케이스).
- [ ] T4. `App.tsx`·`CanvasConversationPanel.tsx`·`ProjectOverview.tsx`: `onReplyChip` 연결, 다른 캔버스 열고 이동, 없는 캔버스 토스트.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

── commit: `feat(thread): agent replies draw anchor chips` ──

## G. 가이드와 eval

- [ ] T5. `cli/internal/cli/skill.md`에 링크 형식과 쓰는 때. 앱 턴 프롬프트에 한 줄을 넣을지는 T6 결과로 정한다.
  - 검증: `go test ./...` 통과.
- [ ] T6. `/agent-eval` 시나리오 R9: 프레임 하나와 요소 하나를 고치게 하고, 답에 두 대상을 맞는 형식과 실제 id의 링크로 썼는지 검사한다. pass/fail fixture를 둔다.
  - 검증: `node eval/run.ts --self-test --scenarios R9`가 `self-test PASS`, exit 0. 실제 라운드 `node eval/run.ts --scenarios R9 --agents claude,codex` 결과를 `docs/USABILITY-EVAL.md`에 기록.

── commit: `docs(skill): name canvas targets with doan links` / `test(eval): R9 reply anchor links` ──

## R. 확인

- [ ] T7. `/runtime-test`: 에이전트 답 이벤트에 링크가 든 대화로 캔버스 패널과 Overview를 열고, 칩 모양, 같은 캔버스 locate, 다른 캔버스 열기, 없는 대상 안내, 형식 오류 평문을 확인한다. 실제 provider 없이 이벤트를 넣는 방법이 없으면 command undecided — needs user confirmation.
  - 검증: runtime-test 스크린샷.
- [ ] T8. `node .agents/skills/verify/scripts/verify.mjs --eval` 통과.

## Z. 정리

- [ ] Z1. PRODUCT §5 item 6(에이전트 답의 칩과 이동), ARCHITECTURE §1 'Agent rules'(링크 규칙)·§7(Markdown 링크 규칙), DESIGN(칩이 스레드에 놓이는 모양)을 현재 규칙으로 고친다. `docs/BACKLOG.md`의 해당 항목을 지운다. `docs/features/agent-reply-chips/`를 지운다.
  - 검증: `grep -n "only \`https:\` links become anchors" docs/ARCHITECTURE.md` 결과 없음, `grep -n "Anchor chips in the agent's replies" docs/BACKLOG.md` 결과 없음.

── commit: `docs(PRODUCT): anchor chips in agent replies` / `docs(ARCHITECTURE): doan links in replies` / `docs(design): reply chips` / `docs(backlog): …` / `docs(feature): remove agent-reply-chips` ──
