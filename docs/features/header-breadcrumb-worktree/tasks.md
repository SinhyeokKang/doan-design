# 헤더 브레드크럼과 워크트리 — tasks

순서: 순수 함수 → 공용 컴포넌트 → 세 화면 → 디자인 확인. `/ship`은 커밋 경계를 따른다.

1. **디자인 초안**: `/design-draft`로 사이드바 프로젝트 행, Overview 헤더, 캔버스 헤더의 셀렉트와 브레드크럼을 그린다(960×600 줄임 순서 포함). 사용자가 앱에서 확인한다.
   - 확인: `doan check` 통과, 사용자 확인.
   - ── 커밋 경계 (`docs(design):` 초안) ──
2. **`worktreeLabel`, `worktreeSwitchModel`, `canvasCrumbs`, `hasCanvas`** 순수 함수와 테스트(워크트리 하나일 때 한 행, 숨겨진 워크트리 제외, detached, 문제 행, 캔버스 헤더 거르기, 대상 캔버스가 사라졌을 때).
   - 확인: `npm --prefix app test` 초록.
   - ── 커밋 경계 (`test:` → `feat:`) ──
3. **`WorktreeSwitch` 컴포넌트**와 Overview 헤더 적용. 워크트리 하나여도 셀렉트다.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run typecheck` 통과.
4. **사이드바 적용**: 프로젝트 행 칩을 `WorktreeSwitch`로 바꾼다. "…" 메뉴의 Worktrees 구역은 그대로 둔다. 행 버튼과 셀렉트가 중첩되지 않는다.
   - 확인: `npm --prefix app test` 초록(`ShellSidebar.test.tsx` 포함).
5. **캔버스 헤더 적용**: 프로젝트 조각(Overview로 이동), `WorktreeSwitch`(그 캔버스가 있는 워크트리만), 캔버스 이름, 프레임 서랍 순서. 세 곳이 같은 컴포넌트를 쓰는지 테스트로 고정한다.
   - 확인: `npm --prefix app test` 초록, `npm --prefix app run lint` 통과.
   - ── 커밋 경계 (`feat:`) ──
6. **`/design-sync`**: 세 화면을 초안과 측정해 맞추고 `docs/design/shell.md`, `docs/design/project.md`, `docs/design/canvas.md`에 기록한다.
   - 확인: `/design-sync` 측정 기록.
7. **실제 앱 확인**: `/runtime-test`로 워크트리 2개 프로젝트에서 세 곳의 셀렉트 이동, 워크트리 1개의 셀렉트, 캔버스 헤더 거르기, 문제 워크트리 행을 짧게 확인한다.
   - 확인: `/runtime-test` 스크린샷과 PASS 기록.
8. **최종 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: verify PASS.
9. **승격**: PRODUCT §5 item 1(사이드바, 'Project menu'), item 2('Canvas header'), item 3('Header')을 현재 규칙으로 고쳐 쓰고(근거는 커밋 메시지), `docs/features/header-breadcrumb-worktree/`를 지운다.
   - 확인: `grep -rn "header-breadcrumb-worktree" docs/ app/` 결과 없음.
   - ── 커밋 경계 (`docs(PRODUCT):`) ──
