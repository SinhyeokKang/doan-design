# 캔버스 카드 — tasks

순서는 형식 → 순수 함수 → main(I/O) → renderer(UI) → 승격이다. `──` 표시는 커밋 경계다.

0. **초안** (lead가 develop에서 conductor를 시작하기 전에 끝낸다. conductor는 이 task를 건너뛴다)
   - `/design-draft`로 새 파일 `.doan/canvases/canvas-drawing-cards.html`을 그린다. 기존 `canvas-handoff.html`은 고치지 않는다.
   - 그릴 상태: Drawing, Drawing + handoff 대기, Drawn, Handed off, 거절(same_canvas, Open 없음), 취소, missed, 사라짐, 긴 이름, 카드 여러 장(6장 이상), 권한·질문 카드와 Send now가 함께 있는 배치, 프로토타입 창의 좁은 패널.
   - 확인: `doan check` 통과, `doan ls`에 초안이 나온다, 사용자가 앱에서 확정한다.
   ──
1. **이벤트 형식**: `types.ts`에 `canvas.drawn` { canvas }를 더하고, `store.ts` `payload`가 `validCanvas`로 검증한다.
   - 확인: `npm --prefix app test`. store 테스트에서 올바른 `canvas.drawn`(id 있음·없음)은 읽히고, canvas가 빠지거나 잘못되면 기록 읽기가 실패한다.
   ──
2. **`drawnCanvases`**: `({ root, snapshot, edits, listed, announced })` → 새로 알릴 캔버스. `canvasesAt`과 정확히 한 번 목록된 행 필터를 재사용한다.
   - 확인: `npm --prefix app test`. 다음 케이스가 통과한다.
     - 절대·상대·`/private` 경로
     - 스냅숏에 경로로 있음 / ID로 있음
     - 스냅숏에서 ID가 없던 경로가 뒤에 ID를 얻음
     - id 없는 새 캔버스
     - 목록에 없음
     - 같은 경로가 두 번 목록됨
     - 같은 ID가 두 파일에 있음(`duplicate_canvas_id`)
     - 이미 알린 것
     - 새 캔버스 2개 → 2개
3. **unseen 제외**: main `summary.ts`의 `lastTurnSeq`와 renderer `overviewRun.ts`의 `isMarker`·`endSeq`에서 `canvas.drawn`을 `handoff.missed`처럼 뺀다.
   - 확인: `npm --prefix app test`. 턴 끝 뒤 `canvas.drawn`이 붙어도 이미 본 대화가 다시 안 본 상태가 되지 않는다(main, renderer 양쪽).
   ──
4. **main 연결**: `service.ts`에 턴 ID 키의 `drawWatches`를 더한다.
   - 모든 턴을 받아들일 때 스냅숏을 잡고, `receive()`에서 `insideDesign` 편집 경로를 모은다.
   - 수집 때와 `refreshed` 때 판정하고, `promotionDeadline`까지 `canvas.drawn`을 한 번씩 쓴다.
   - 삭제, 종료, 기록 실패 때 감시를 버리고, 쓰기 전에 대화와 턴을 다시 확인한다. 쓰기에 실패하면 로그만 남긴다.
   - 기존 `HandoffTurn`과 `canvasesAtStart`는 바꾸지 않는다. `state.ts`는 `canvas.drawn`을 접지 않는다.
   - 확인: `npm --prefix app test`. 서비스 테스트에서 다음을 확인한다.
     - Doan 프로젝트 대화, Doan 캔버스 대화, 레거시 외부 대화 각각에서 새 캔버스 2개 → 이벤트 2개
     - 기존 캔버스 편집 → 0개
     - 턴 도중 목록에 올라옴(`turn.done` 앞) / 턴 끝 뒤 기한 안에 올라옴(`turn.done` 뒤) → 1개
     - 기한 뒤 → 0개
     - Codex 서버가 살아 있어 `BIND_GRACE_MS`까지 기다림
     - 실패하거나 중단된 턴 → 기한 안에서 1개
     - 턴 도중 이름 변경이나 휴지통 → 0개
     - 쓰기 전 대화 삭제 → 쓰지 않고 기록을 다시 만들지 않음
     - 쓰기 실패 → 로그만, 턴 유지
     - 같은 새 경로를 두 턴이 편집 → 두 대화 모두 1개씩
     - 거절된 send의 `refreshCanvas`가 metadata를 바꿔도 판정이 같음(2026-11-15 포스트모템)
   ──
5. **renderer 카드 유도**: `threadItems.ts`에서 `kind: "handoff"` 줄을 없애고, 경로별 `canvasCard`(key `<turnId>:<path>`)를 턴 끝에 모은다. handoff 결과와 missed는 카드 상태로 들어간다. `turnStatus.ts`의 `ownEnd`가 끝쪽 카드를 건너뛴다.
   - 확인: `npm --prefix app test`. 다음 케이스가 통과한다.
     - 카드 N개가 처음 나온 순서
     - 활동 그룹이 나뉘지 않음
     - 순서 `카드 → Send now → 권한·질문 카드`와 `카드 → indicator`
     - 카드가 끝에 있어도 indicator 단계, `activityRun`, 스트리밍 답변이 지금과 같음
     - 턴 끝 뒤, 다음 턴이 시작된 뒤 늦게 온 `canvas.drawn`이 원래 턴 자리에 들어감
     - handoff 요청만 있는 카드(`drawn=false`)
     - Stop, 재시작 접힘, `live=false`에서 `drawing=false`
     - 옛 기록(`handoff.*`만 있음)이 카드로 그려짐
     - 상태가 바뀌어도 key가 그대로임
6. **`canvasCardText`와 줄을 읽던 곳**: 카드 상태 → 문구, 아이콘, Open 대상, 접근 이름. `handoffView.ts`와 `revealDecision.ts`가 카드 항목을 읽게 바꾼다.
   - 확인: `npm --prefix app test`. 다음 케이스가 통과한다.
     - Drawing, Drawing + 대기, Drawn, started(새 대화), refused(same_canvas → Open 없음, 그 밖의 사유 → 캔버스), cancelled, missed 각각의 문구와 Open 대상
     - 사라진 캔버스: "No longer in <project>", Open 없음
     - 프로토타입 창에서 Open 대상이 메인 창임
     - `handoffView`·`revealDecision` 기존 테스트를 카드 항목으로 옮겨 통과
   ──
7. **카드 UI**: `ConversationThread.tsx`에 카드 컴포넌트를 더하고 Open을 연결한다. 오버뷰, 캔버스 패널, 프로토타입 창에 같은 카드가 나온다. `.marker.handoff` 규칙과 기존 줄 컴포넌트를 지운다. 긴 이름은 가운데를 줄이고 툴팁을 보여준다. 접근 이름과 `role="group"`, 스피너 `aria-hidden`을 적용한다.
   - 확인: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`. `/design-sync`로 카드 컴포넌트만 `canvas-drawing-cards.html` 초안과 계산된 스타일로 비교한다.
   ──
8. **실제 앱 확인**: `/runtime-test`로 격리된 앱에서 다음을 본다.
   - 프로젝트 대화와 캔버스 대화가 각각 새 캔버스 2개를 만드는 턴: 카드 2장, 스피너, 끝 상태, Open, reload 뒤 유지
   - handoff 시작 카드와 그 Open
   - Stop을 누른 즉시 스피너가 멈춤, 재시작 뒤 `drawing=false`
   - 프로토타입 창 패널의 카드와 Open(메인 창을 앞으로)
   - 확인: `/runtime-test` 보고와 스크린샷. 실제 에이전트를 돌릴 수 없는 항목은 확인하지 못한 항목으로 남긴다.
9. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
   ──
10. **승격과 정리**
    - `docs/PRODUCT.md`
      - §5 item 2 'Handoff'의 원본 스레드 줄, 위치, 다중 시작의 "its lines carry each Open"을 카드 규칙으로 다시 쓴다.
      - 'Missed line', 'Turn indicator'의 "below a handoff line", 'Prototype window' 'Toward the main window'의 "a handoff line's or card's Open"을 카드 규칙으로 다시 쓴다.
      - 'Conversation panel'과 item 3 오버뷰 스레드에 카드를 적는다.
      - 기존 "drawing" 개념과 카드 Drawing이 별개라는 점, 동시 편집 때 두 스레드에 모두 카드가 생긴다는 점을 적는다.
    - `docs/ARCHITECTURE.md` §7
      - 'Missed lines' 문단(지금 607행 근처)을 카드 규칙으로 다시 쓴다.
      - `drawWatches`, `canvas.drawn` 쓰기 규칙, unseen 제외를 적는다.
      - 이전 Doan이 읽지 못하는 이벤트 목록에 `canvas.drawn`을 더한다.
    - `docs/design/conversation.md`
      - "Handoff line", "Refused start", "Missed line" 행, pending 줄 줄바꿈 메모, gone missed line 타일 메모, 회귀 포인터를 카드 측정값으로 바꾼다(`/design-sync`가 측정한다).
      - 프로토타입 창에 차이가 있으면 `docs/design/prototype.md`도 고친다.
    - `docs/BACKLOG.md`: Cursor·Antigravity·Copilot 편집 경로 항목(지금 missed 줄 항목)에 카드를 더하고, 앱 종료나 재시작 뒤 늦게 목록에 오른 캔버스는 카드를 얻지 못한다는 한계를 적는다.
    - POSTMORTEM은 필요 없다. 버그 수정이 아니다.
    - 마지막으로 `docs/features/canvas-drawing-cards/`를 지운다.
    - 확인: `grep -n "Missed line\|handoff line\|Handed off to <file>\|Hands off to" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design/*.md`가 카드 규칙의 문구만 보여주고, 디렉터리가 지워져 있다.
