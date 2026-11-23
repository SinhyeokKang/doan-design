# Overview 대화 목록 — tasks

순서: 시안 → 순수 함수 → 연결(App) → UI → 문서 승격. 포맷 변경이 없어서 스키마 단계는 없다.

1. **시안**: `/design-draft`로 `.doan/canvases/`에 Overview 오른쪽 패널 시안을 그린다. 프로젝트 대화 행과 캔버스 대화 행이 섞인 목록, current 행, 빈 목록, 처음 읽는 중, 읽기 실패, Delete 가능·불가 상태를 담는다. 헤더는 지금 그대로다.
   - 검증: `doan check --json`이 오류 없이 통과하고, `doan ls --json`에 캔버스가 나온다. 사람이 앱에서 시안을 확정한다.
   - ── 커밋 경계(시안, develop에 직접) ──
2. **행 목록 함수**: `canvasConversationRows`가 프로젝트 대화 행도 만들고, 결정된 순서로 정렬한다.
   - 검증: `npm --prefix app test`에서 새 테스트가 처음에 red였다가 green이 된다. 읽을 수 없는 프로젝트 대화와 `{ phase: "ended", working: true }` 경우를 포함한다.
3. **current 행 함수와 행 열기 분기**: 보여주는 대화에 맞춰 current 행 키를 정하고, 행 종류에 따라 가운데 열을 바꿀지 캔버스를 열지 정한다.
   - 검증: `npm --prefix app test` green. 대화를 고른 직후 목록 읽기 전에도 current가 맞는 경우를 포함한다.
   - ── 커밋 경계(test, 그다음 feat) ──
4. **연결**: `App.tsx`의 행 열기가 프로젝트 대화 행이면 `OverviewRun.select`를 부르고 composer에 포커스를 준다. 캔버스 행은 그대로다.
   - 검증: `npm --prefix app test`(App 단위 테스트) green, `npm --prefix app run typecheck` 통과.
5. **UI**: `CanvasConversationList.tsx`에서 프로젝트 대화 행, current 표시, 목록 이름, 빈 목록·로딩 문구를 구현한다. 헤더 Conversation menu에서 골라도 목록의 current 행이 함께 바뀌는지 확인한다.
   - 검증: `npm --prefix app test`(컴포넌트·키보드 테스트) green, `npm --prefix app run lint` 통과. `/design-sync`로 시안과 computed style이 일치한다. `/runtime-test` 짧은 프로브로 프로젝트 대화 행 클릭 → 가운데 열 전환, 캔버스 행 클릭 → 캔버스 열림을 확인한다.
   - ── 커밋 경계(feat) ──
6. **문서 승격**: PRODUCT §5 item 3(Project Overview 개요 문장, Canvas conversations 항목, Delete와 첫 목록 읽기 문장 중 목록 이름을 가리키는 부분), ARCHITECTURE §7 'Project Overview conversations', `docs/design/project.md`를 현재 규칙으로 고쳐 쓰고(영어, 문서별 커밋), `docs/features/overview-conversation-list/`를 지운다.
   - 검증: `node .agents/skills/verify/scripts/verify.mjs` PASS. `grep -n "Canvas conversations" docs/PRODUCT.md docs/ARCHITECTURE.md docs/design/project.md`의 결과가 새 이름과 맞는다.
   - ── 커밋 경계(docs, 문서마다) ──
