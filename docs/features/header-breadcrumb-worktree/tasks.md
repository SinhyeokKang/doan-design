# 헤더 브레드크럼과 워크트리 — tasks

순서: 디자인 초안 → 순수 함수 → 공용 컴포넌트 → 세 화면 → 측정. `/ship`은 커밋 경계를 따른다.

1. **디자인 초안**: `/design-draft`로 사이드바 프로젝트 행, Overview 헤더, 캔버스 헤더의 셀렉트와 브레드크럼을 새 파일 `.doan/canvases/header-breadcrumb-worktree.html`에 그린다. 워크트리 하나·여럿, 캔버스 헤더의 비활성 행("No <canvas> here", "Reading…", 문제), 비Git 프로젝트, 960×600 줄임 순서를 포함한다. 사용자가 앱에서 확인한다.
   - 확인: `doan check` 통과(`.doan/canvases/header-breadcrumb-worktree.html`), 사용자 확인.
   - ── 커밋 경계 (`docs(design):` 초안) ──
2. **`worktreeLabel`, `worktreeSwitchModel`, `headerRowState`, `headerMove`, `canvasCrumbs`** 순수 함수와 테스트.
   - 사례: 워크트리 하나일 때 한 행, 비Git이면 셀렉트 없음, 숨겨진 워크트리 제외, detached, 문제 행(사이드바·Overview는 복구, 캔버스 헤더는 비활성), 캔버스가 없는 워크트리 비활성, 아직 읽는 워크트리 "Reading…", 대상 캔버스가 사라짐(stay), 목록에 없는 페이지·프로젝트 문제의 조각과 비활성 이유, 현재 행 다시 고르기.
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
3. **`WorktreeSwitch` 컴포넌트**와 Overview 헤더 적용. Git 프로젝트면 워크트리 하나여도 셀렉트다. 메뉴가 열린 동안 행 상태가 바뀌어도 포커스가 유지되는지 테스트한다.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
4. **사이드바 적용**: 프로젝트 행 칩을 `WorktreeSwitch`로 바꾼다. "…" 버튼과 같은 roving tabindex와 `stopPropagation`, 잠금 중 `aria-disabled`. "…" 메뉴의 Worktrees 구역은 그대로 둔다.
   - 확인: `npm --prefix app test` 초록(`ShellSidebar.test.tsx` 포함: ←/→ 접기와 typeahead가 셀렉트에서 동작하지 않음).
5. **캔버스 헤더 적용**: 브레드크럼 `nav`, 프로젝트 조각(Overview로 이동), `WorktreeSwitch`(비활성 행 포함), 캔버스 이름, 프레임 서랍 순서. 이동은 `headerMove`, 줌·위치 유지, 선택 해제, 사라진 캔버스는 토스트와 제자리. 세 곳이 같은 컴포넌트를 쓰는지, 두 root를 오갈 때 캔버스·대화 패널·Back/Forward가 새 root를 가리키는지 테스트로 고정한다.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run lint` 통과.
   - ── 커밋 경계 (`feat:`) ──
6. **`/design-sync`**: 세 화면을 초안과 측정해 맞추고 `docs/design/shell.md`, `docs/design/project.md`, `docs/design/canvas.md`에 기록한다. 960×600에서 캔버스 헤더 조각이 겹치지 않고 초안의 순서대로 줄어드는지 측정한다.
   - 확인: 세 문서에 측정값이 있고, 960×600 측정에서 겹침이 없다.
7. **실제 앱 확인**: `/runtime-test`로 워크트리 2개 프로젝트에서 세 곳의 셀렉트 이동, 워크트리 1개의 셀렉트, 캔버스 헤더의 비활성 행, 문제 워크트리 행, 문제 오버레이가 Overview 셀렉트를 덮는지, 프로젝트 문제일 때 캔버스 헤더 셀렉트가 비활성인지를 짧게 확인한다.
   - 확인: `/runtime-test` 스크린샷과 PASS 기록.
8. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: verify PASS.
9. **승격**: PRODUCT §5 item 1(사이드바), item 2('Canvas header'), item 3('Header')을 현재 규칙으로 고쳐 쓴다. 세 곳이 `WorktreeSwitch` 하나를 쓴다는 불변식을 ARCHITECTURE §7 'Renderer primitives'에 적는다. 새 디자인 섹션이 생기면 DESIGN.md 색인도 고친다(근거는 커밋 메시지). `docs/features/header-breadcrumb-worktree/`를 지운다.
   - 확인: `grep -rn "header-breadcrumb-worktree" docs/ app/` 결과 없음.
   - ── 커밋 경계 (`docs(PRODUCT):`, `docs(ARCHITECTURE):` 문서별) ──
