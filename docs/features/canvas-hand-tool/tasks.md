# canvas-hand-tool — tasks

## D. 초안

- [ ] D1. `/design-draft`: 도구모음(Select·Hand·Add to conversation, Hand 눌림), 끄는 동안 커서. 사용자가 앱에서 확인한다.
  - 검증: `go run ./cli/cmd/doan check --repo .` 오류 없음, 사용자 확인.

## T. 순수 함수 (`/tdd` → `/implement`)

- [ ] T1. `dragPan`, `activeTool`, `escapeStep`, `toolShortcut`, `parseCanvasMessage` Space.
  - 검증: `npm --prefix app test` green.

── commit: `feat(canvas): hand tool rules` ──

## S. 셸·UI

- [ ] T2. `canvasScript.ts`의 Space down/up 전달(편집 대상 제외, repeat 무시).
  - 검증: `npm --prefix app test` green.
- [ ] T3. `CanvasController.ts` 도구 상태·끌기 레이어·Space·V·H·Esc, `CanvasTools.tsx` Hand 버튼, `App.tsx` 도구 유지, `styles.css`.
  - 검증: `npm --prefix app test` green, `npm --prefix app run typecheck` 통과.

── commit: `feat(canvas): drag to pan with the hand tool and Space` ──

## R. 확인

- [ ] T4. `/design-sync`로 도구모음 대조, `/runtime-test`로 확인: Hand 끌기(프레임 위), Space 끌기, 입력창에서 Space·V·H 무시, Esc 순서, 캔버스 전환 뒤 Hand 유지, 픽 시작 시 Select, 끄는 중 창 밖으로 나갔다 오기.
  - 검증: runtime-test 스크린샷과 보드 transform 측정값.
- [ ] T5. `node .agents/skills/verify/scripts/verify.mjs` 통과.

## Z. 정리

- [ ] Z1. PRODUCT §5 item 2 'Toolbar'·'Notices and states'(Esc 순서), ARCHITECTURE §3 'Input', DESIGN(도구모음 측정값)을 현재 규칙으로 고친다. `docs/features/canvas-hand-tool/`을 지운다.
  - 검증: `grep -n "always pressed" docs/PRODUCT.md` 결과 없음, `ls docs/features/canvas-hand-tool` 실패.

── commit: `docs(product): hand tool` / `docs(architecture): drag layer input` / `docs(design): canvas tools with hand` / `docs(feature): remove canvas-hand-tool` ──
