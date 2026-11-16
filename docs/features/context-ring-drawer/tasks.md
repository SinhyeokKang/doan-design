# 컨텍스트 링 서랍 — tasks

순서는 초안 → 레이아웃 기준 → 순수 함수 → main(IPC) → UI → 리뷰 → 실제 확인 → 승격이다. 각 코드 task는 `/tdd`(red 확인) → `/implement` 순서로 하고, UI task 뒤에 `/code-review`를 둔다. `──` 표시는 커밋 경계다. 가이드, CLI 출력, `doan check`, skill stub이 바뀌지 않으므로 `/agent-eval`은 필요 없다.

0. **초안** (lead가 develop에서 끝낸다. conductor는 건너뛴다): `/design-draft`로 `.doan/canvases/context-ring-drawer.html`을 그린다(design '초안 요청').
   - 확인: `doan check` 통과, `doan ls`에 프레임 `trigger`, `drawer`, `placements`가 나온다. 확정은 사용자가 앱에서 보고 "확정"이라고 말할 때만이다.
   ──
1. **레이아웃 기준 측정**: 구현 전에 브랜치 기준 sha에서 `.scratch/context-ring-drawer/baseline.json`에 tray 자식마다 `getBoundingClientRect`(x, y, w, h)와 tray 높이를 기록한다. 측정은 격리된 앱에서 seeded 대화로 한다.
   - 구성: Codex 대화, Copilot 대화(피커 없음), 터미널 세션 고정 tray, 캔버스 패널 347과 280(아이콘만 남은 tray), 오버뷰, 링 없음(새 대화).
   - 확인: 측정 스크립트(`node .scratch/context-ring-drawer/measure.mjs`, AGENTS.md 'Commands'의 `/design-sync` 측정 방식)가 exit 0이고 구성마다 값이 기록된다.
2. **순수 함수**: `contextDrawerView`, 링 버튼 접근 속성과 툴팁 열림 여부, 서랍 닫힘과 포커스 반환, main `visible` 계산.
   - 확인: `npm --prefix app test`. 다음 케이스가 통과한다.
     - Claude Code(5h·Weekly), Codex, Copilot 행이 헤더 `rowView`와 같은 문구다.
     - Antigravity, legacy 대화, 터미널 세션, entry 없음 → 행 없음, Refresh 없음.
     - 읽는 중, 실패, 한도 도달, 열린 동안 reset이 지나 문구가 바뀜, 다른 읽기에 합류한 Refresh의 busy.
     - 열린 동안 Context 값 갱신.
     - 열린 동안 로그아웃, 계정 교체, 마지막 연결 사라짐 → 행만 사라짐, 포커스가 Refresh에 있었으면 서랍 컨테이너로.
     - 서랍이 열려 있으면 툴팁이 숨는다. 닫힌 직후 focus로는 열리지 않고, 다음 hover로는 열린다.
     - 대화 변경이나 링이 사라짐(삭제, status line) → 닫힘. 포커스가 안에 있었으면 composer 입력, 아니면 그대로.
     - Cursor와 status line → 트리거 없음.
     - `visible`: 메인 창 숨김 + 프로토타입 창 표시 → 읽음. 둘 다 숨김 → 읽지 않음.
   ──
3. **사용량 IPC를 프로토타입 창으로 넓힘**
   - `senderAllowed.ts`에 프로토타입 창의 read 허용을 더한다.
   - `publish`에서 `prototype.send`도 부른다.
   - `visible`을 넓힌다.
   - `preload/prototype.ts`에 read와 구독을 노출한다.
   - `usageIpc.ts` 주석을 고친다.
   - 확인: `npm --prefix app test`.
     - 메인 창과 프로토타입 창은 읽고, 캔버스 iframe과 다른 sender는 거절된다.
     - `changed`가 두 창에 간다.
     - `preload/prototype.test.ts`가 리터럴 채널을 고정한다.
   ──
4. **링 버튼과 서랍 UI**
   - `ContextRing`을 버튼으로 바꾸고, 사용량 행을 헤더와 공용으로 쓴다(헤더 markup은 그대로).
   - 서랍(Radix Popover, dialog, `side="top"`, `align="end"`)을 단다.
   - host 구독, `SharedWithMain`과 `ConversationCalls` 경로, `usageHidden` prop을 연결한다. 오버뷰, 캔버스 패널, 프로토타입 창 패널에 적용한다.
   - 히트 영역과 hover/pressed 채움은 `::before`로 그린다. CSS 셀렉터를 옮긴다.
   - 확인: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`(헤더 `AgentUsageButton` 테스트가 그대로 통과). 그다음 `/design-sync`로 `context-ring-drawer.html`과 비교한다.
5. **레이아웃 불변 판정**: 1의 측정을 구현 뒤 같은 구성으로 다시 잰다.
   - 확인: 측정 스크립트가 exit 0이고, 모든 구성에서 tray 자식의 박스와 tray 높이가 기준과 차이 0px다. 히트 영역이 이웃 피커와 겹치지 않는다(경계 좌표에서 `elementFromPoint`가 각자의 요소를 돌려준다).
6. **코드 리뷰**: `/code-review`, 지적은 `/refactor`로 반영한다.
   - 확인: 🔴 0.
   ──
7. **실제 확인**: `/runtime-test`로 격리된 앱에서 확인한다. 사용량은 기존 측정처럼 주입하고, 실제 로그인은 쓰지 않는다.
   - 클릭, Space, Return으로 열린다. Escape와 바깥 누르기로 닫히고 포커스가 링으로 돌아온다. Tab과 Shift+Tab 순서가 맞다.
   - 서랍을 열면 읽기가 일어나고, 헤더 popover와 같은 값이 보인다. 한 창에서 헤더 popover와 서랍이 동시에 열리지 않는다.
   - 프로토타입 창 280 패널에서 서랍이 잘리지 않는다. 프로토타입 창 헤더 근처를 네이티브 클릭으로 눌러 바깥 누르기가 동작한다. 메인 창을 닫은 뒤에도 프로토타입 창에서 읽힌다.
   - reduced motion에서 열림 애니메이션이 없다.
   - 확인: `/runtime-test` 보고와 스크린샷.
8. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
   ──
9. **ARCHITECTURE 승격**: §7 Agent usage IPC 줄, §3 Prototype window 'Sender role'과 'Narrow reads'(근거: `UsageEntry`에 신원 없음).
   - 확인: `grep -n "agent-usage" docs/ARCHITECTURE.md`가 프로토타입 창 허용을 보여준다.
   ──
10. **PRODUCT 승격**: §5 'Context window ring'을 버튼과 서랍 규칙으로, 'Agent usage'의 읽기 시점과 숨김 규칙을, 'Prototype window' 대화 패널 서술을 고친다.
    - 확인: `grep -n "The ring is not a control" docs/PRODUCT.md`가 0줄이다.
   ──
11. **DESIGN과 BACKLOG**
    - `docs/design/canvas-conversation.md` 'Context window ring'의 행("span", "not focusable", "A press opens no dialog", "Tab skips the ring", "role image")을 새 측정으로 바꾼다. `docs/DESIGN.md` 인덱스에 새 초안이 필요하면 더한다.
    - `docs/BACKLOG.md`의 링 VoiceOver 항목(83행 근처)을 버튼과 `aria-expanded` 기준으로 고치거나 지운다.
    - 확인: `grep -n "not focusable\|role image" docs/design/canvas-conversation.md`가 링 행을 보여주지 않는다.
   ──
12. **정리**: `docs/features/context-ring-drawer/`를 지운다.
    - 확인: 디렉터리가 없다.
