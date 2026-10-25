# comments-readability — 작업 순서

검증 명령은 AGENTS.md 'Commands'의 것만 쓴다. `[커밋]`은 커밋 경계다.

1. **순수 함수 테스트 먼저(`/tdd`)**: `targetLabel`, `warningText`, `emptyListText`, `commentsPanelState`, `pinLabel`.
   - 검증: `npm --prefix app test`에서 새 테스트가 red인 것을 확인한다.
2. **순수 함수 구현**.
   - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과. `[커밋]`
3. **패널 연결**: 카드, 작성기, 초안 대화상자의 대상 표시, 대상 줄 button/span, 경고와 읽기 실패 블록, identity 없음 블록, 빈 목록, 문구 항목.
   - 검증: `npm --prefix app test`(CommentsPanel, useComments 렌더 테스트) green. `[커밋]`
4. **배치와 표현**: 작성기 위치, Canvas 정보·안내 순서, 핀 aria와 Enter 포커스, Updated 배경, 대상 줄 hover.
   - 검증: `npm --prefix app test` green. `[커밋]`
5. **실제 창 측정(`/design-sync` 방식)**: 960×600과 1238×780에서 작성기 도달성, 대상 줄 계산 opacity·color, 핀 aria, Updated 대비를 잰다.
   - 검증: `node .scratch/design-sync/comments-readability/measure.mjs`로 측정한다(AGENTS의 `/design-sync` 측정 명령 형식). 결과를 DESIGN.md에 적는다.
6. **런타임 회귀**: `app/e2e/comments-ui.ts`에 추가한다.
   - doan-id 없는 요소의 대상 표시
   - 960×600에서 작성기 도달
   - 경고 문장
   - 읽기 실패 한 블록
   - id 없는 캔버스의 단일 블록
   - 검증: `npm --prefix app run e2e` 최종 PASS와 exit 0. `[커밋]`
7. **전체 게이트**: `node .agents/skills/verify/scripts/verify.mjs --runtime`
   - 검증: 최종 PASS, exit 0.
8. **결론 승격**: PRODUCT §5 항목 5(대상 표시, 경고 문장, 위치 판정 조건)와 §7 결정 로그, ARCH §3 "Presentation and data", DESIGN.md comments-ui 측정을 영어로 갱신한다. 그 뒤 `docs/features/comments-readability/`를 삭제한다.
   - 검증: 문서 diff 검토. `[커밋]`
