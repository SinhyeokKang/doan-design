# 컨텍스트 링 서랍 — tasks

순서는 초안 → 순수 함수 → main(IPC) → UI → 실제 확인 → 승격이다. `──` 표시는 커밋 경계다.

0. **초안** (lead가 develop에서 끝낸다. conductor는 건너뛴다): `/design-draft`로 `.doan/canvases/context-ring-drawer.html`을 그린다(design '초안 요청'). 사용자가 앱에서 확정한다.
   - 확인: `doan check` 통과, `doan ls`에 프레임 `trigger`, `drawer`, `placements`가 나온다, 사용자 확정.
   ──
1. **순수 함수**: `contextDrawerView`, 링 버튼 접근 속성과 툴팁 표시 여부, 서랍 닫힘 조건과 포커스 반환 대상.
   - 확인: `npm --prefix app test`. 다음 케이스가 통과한다.
     - Claude Code(5h·Weekly), Codex, Copilot 행이 헤더 `rowView`와 같은 문구다.
     - Antigravity, legacy 대화, entry 없음 → 행 없음.
     - 읽는 중, 실패, 한도 도달, reset 지남.
     - 서랍이 열려 있으면 툴팁이 숨는다.
     - 대화 변경이나 링이 사라지면 닫히고 포커스가 돌아간다.
   ──
2. **사용량 IPC 허용**: `USAGE_CHANNELS.read`와 `changed`를 프로토타입 창에도 허용한다(`senderAllowed.ts`, 프로토타입 preload). 그 밖의 창과 프레임은 계속 거절한다.
   - 확인: `npm --prefix app test`. 메인 창과 프로토타입 창은 읽고, 캔버스 iframe과 다른 sender는 거절된다.
   ──
3. **링 버튼과 서랍 UI**
   - `ContextRing`을 버튼으로 바꾸고, 사용량 행을 헤더와 공용 컴포넌트로 뺀다. 헤더 DOM은 그대로다.
   - 서랍(Radix Popover)을 단다. 위로 열고, 포커스 가드를 적용하고, Escape나 바깥 누르기로 닫는다.
   - `DockedComposer`에 프로바이더, legacy 여부, entries를 연결한다. 오버뷰, 캔버스 패널, 프로토타입 창에 적용한다.
   - 히트 영역과 hover/pressed 표시는 pseudo-element로 그린다.
   - 확인: `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app test`(헤더 `AgentUsageButton` 테스트가 그대로 통과).
   - `/design-sync`로 `context-ring-drawer.html`과 비교한다. tray 안 모든 요소의 박스가 바꾸기 전 develop과 같다는 측정을 포함한다.
   ──
4. **실제 확인**: `/runtime-test`로 격리된 앱에서 확인한다(프로바이더 로그인이 필요하면 사용자에게 청한다).
   - 클릭, Space, Return으로 열린다. Escape와 바깥 누르기로 닫히고 포커스가 돌아간다. Tab으로 링에 닿는다.
   - 서랍을 열면 읽기가 일어나고, 헤더 popover와 같은 값이 보인다.
   - 프로토타입 창 패널에서도 열리고 같은 값이 보인다.
   - tray 레이아웃이 바뀌지 않는다(바꾸기 전과 스크린샷 비교).
   - 확인: `/runtime-test` 보고와 스크린샷.
5. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
   ──
6. **승격과 정리**
   - `docs/PRODUCT.md`: §5 'Context window ring'을 버튼과 서랍 규칙으로 다시 쓴다. 'Agent usage'의 읽기 시점에 서랍 열기를 더한다.
   - `docs/ARCHITECTURE.md`: 사용량 IPC가 프로토타입 창에도 열려 있음을 적는다.
   - `docs/design/`: `/design-sync`가 측정값을 적는다.
   - 마지막으로 `docs/features/context-ring-drawer/`를 지운다.
   - 확인: `grep -n "not a control" docs/PRODUCT.md`가 컨텍스트 링 줄을 보여주지 않고, 디렉터리가 지워져 있다.
