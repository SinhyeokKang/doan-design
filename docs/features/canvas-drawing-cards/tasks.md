# 캔버스 카드 — tasks

순서: 형식 → 순수 함수 → main(I/O) → renderer(UI) → 승격. `──` 표시는 커밋 경계다.

0. **초안**: `/design-draft`로 카드 상태(그리는 중, 끝남, handoff 대기·시작·거절·취소·missed, 캔버스 사라짐, 긴 파일 이름, 카드 여러 장)를 `.doan/canvases/`에 그린다. 사용자가 앱에서 확정한다.
   - 확인: `doan check` 통과, `doan ls`에 초안이 나온다, 사용자 확정.
   ──
1. **이벤트 형식**: `types.ts`에 `canvas.drawn` { canvas }를 더하고 `store.ts` `payload`가 `validCanvas`로 검증한다.
   - 확인: `npm --prefix app test` — store 테스트에서 올바른 `canvas.drawn`은 읽히고, canvas가 빠지거나 잘못되면 기록 읽기가 실패한다.
   ──
2. **순수 함수 `drawnCanvases`**: 스냅숏(경로·ID), 편집 경로, 목록, 이미 알린 것 → 새로 알릴 캔버스.
   - 확인: `npm --prefix app test` — 스냅숏에 경로/ID로 있는 것, 목록에 없는 것, 중복 목록, 이미 알린 것, `insideDesign`이 아닌 경로가 빠지는 케이스가 초록.
3. **unseen 제외**: `canvas.drawn`을 `handoff.missed`처럼 안 봄 계산에서 뺀다.
   - 확인: `npm --prefix app test` — 턴 끝 뒤 `canvas.drawn`이 붙어도 이미 본 대화가 다시 안 본 상태가 되지 않는다.
   ──
4. **main 연결**: 모든 턴에 받아들일 때 스냅숏을 잡고, `edit` activity 후보를 모으고, 폴더 갱신과 `promotionDeadline`까지 `canvas.drawn`을 한 번씩 쓴다. 삭제, 종료, 기록 실패 때 감시를 버리고, 쓰기 전에 대화·턴을 다시 확인한다. 기존 `HandoffTurn`과 `canvasesAtStart` 스냅숏을 합칠 경우 동작이 같다는 테스트를 먼저 둔다.
   - 확인: `npm --prefix app test` — 서비스 테스트에서 새 캔버스 2개 → 이벤트 2개, 기존 캔버스 편집 → 0개, 목록에 늦게 올라온 경우 → 기한 안에서 1개, 기한 뒤 → 0개, 삭제 뒤 → 쓰지 않음, 거절된 send의 경로 변경이 판정에 끼지 않음.
   ──
5. **renderer 카드 유도**: `threadItems`에서 `kind: "handoff"` 줄을 없애고, 경로별 `canvasCard`를 턴 끝에 모은다. handoff 결과와 missed는 카드 상태로 들어간다.
   - 확인: `npm --prefix app test` — 그리는 중 카드 N개 순서, 활동 그룹이 끊기지 않음, Send now 메시지와 indicator 사이 배치, handoff 요청만 있는 카드, 재시작 접힘에서 `drawing=false`, 이전 기록(`handoff.*`만 있음)이 카드로 그려짐.
6. **카드 UI**: 오버뷰, 캔버스 대화 패널, 프로토타입 창 패널에 카드를 그리고 Open을 연결한다(캔버스 열기, 시작된 handoff → 새 대화, 프로토타입 창 → 메인 창). 기존 handoff 줄 컴포넌트는 지운다.
   - 확인: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`. 화면 첫 구현이므로 `/design-sync`로 초안과 계산된 스타일을 비교한다.
   ──
7. **실제 앱 확인**: `/runtime-test`로 격리된 앱에서 프로젝트 대화와 캔버스 대화가 각각 새 캔버스 2개를 만드는 턴을 돌려, 카드 2장, 스피너, 끝 상태, Open, reload 뒤 유지를 본다. handoff 시작 카드도 본다.
   - 확인: `/runtime-test` 보고와 스크린샷. 실제 에이전트를 돌릴 수 없으면 확인하지 못한 항목으로 남긴다.
8. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
   ──
9. **승격과 정리**: `docs/PRODUCT.md` §5 item 2 'Handoff'와 'Missed line'의 원본 스레드 줄을 카드 규칙으로 다시 쓰고, 'Conversation panel'과 item 3 오버뷰 스레드에 카드를 적는다. `docs/ARCHITECTURE.md` §7에 턴 스냅숏·`canvas.drawn` 쓰기 규칙·unseen 제외를 적고, 이전 Doan이 읽지 못하는 이벤트 목록에 `canvas.drawn`을 더한다. 측정값은 `docs/DESIGN.md` 쪽에 `/design-sync`가 적는다. ACP 편집 경로 미확인 한계는 BACKLOG에 남긴다. 마지막으로 `docs/features/canvas-drawing-cards/`를 지운다.
   - 확인: PRODUCT·ARCHITECTURE에 handoff "line" 문구가 남지 않음(`grep -n "Hands off to" docs/PRODUCT.md`가 카드 문구만 보여줌), 디렉터리 삭제.
