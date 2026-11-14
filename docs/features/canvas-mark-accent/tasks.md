# canvas-mark-accent — tasks

`/ship` 하나로 간다. 작업 1은 리드가 develop에서 끝낸다(초안과 사용자 확인).

- [ ] 1. **`/design-draft`**(리드, develop): design.md '초안 요청'. 검증: `doan check --repo . --json`이 오류 0, `doan ls --repo . --json`이 `canvas-mark-accent`의 프레임 ID 다섯 개(`marks`, `bubble`, `jump`, `buddies`, `backgrounds`)를 보인다. 사용자의 앱 확인이 design.md '확인 기록'에 있다.
  - 커밋 경계: 초안.
- [ ] 2. **순수 함수**(design.md '순수 함수' 1–3).
  - 테스트: 버블 구성(선택 없음, Play 없음·있음, picker 불가 이유), 표시 박스와 `sizeBubblePlace`의 바깥 가장자리 기준(아래·안쪽·위), 버블과 Pick이 같은 앵커를 낸다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`. `/tdd` 보고서가 새로 실패해야 할 테스트 이름을 적고, `/implement` 뒤 모두 green이다.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 3. **오버레이와 버블 연결**(CSS, `CanvasController.ts`, `App.tsx`).
  - 테스트: 버블 버튼을 눌렀을 때 접힌 패널을 펼치고, 칩을 커서 자리에 넣고, 포커스를 필드로 옮기고, 선택을 유지한다. 비활성일 때는 아무것도 하지 않고 이유를 툴팁으로 보인다. 가용성이 바뀌어도 같은 버튼 요소다. 패널을 막 펼친 경우의 늦은 넣기를 확인한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: `test:` 하나, 구현 하나.
- [ ] 4. **`/design-sync`**: 초안의 다섯 프레임과 실제 앱의 computed style을 맞춘다. 다섯 버디, 세 배경, 대비 측정(design.md '대비 측정')을 포함한다.
  - 검증: `/design-sync`·`/runtime-test` 스킬의 `.scratch` 측정 스크립트(명령 미정 — 사용자 확인 필요, `node .scratch/design-sync/canvas-mark-accent/measure.mjs`를 제안한다).
  - 커밋 경계: 맞춘 구현과 DESIGN.md 측정값.
- [ ] 5. **`/runtime-test`**: 격리한 실제 앱에서 Select와 Picker 모드의 선택·호버, 버블의 Add to message(접힌 패널, 커서 자리, 포커스, 32곳 한도에서 포커스된 버튼 비활성화 뒤 `document.activeElement`), 점프 하이라이트(chip locate, `doan open`), 작업 중 프레임을 확인한다.
  - 검증: 명령 미정 — 사용자 확인 필요(`/runtime-test` 스킬의 `.scratch` probe).
- [ ] 6. **승격**: `docs/PRODUCT.md` §5 item 6(크기 버블의 Add to message, 선택 유지)과 item 2의 선택 표시 문장, `docs/DESIGN.md`('Overlay marks', 'Hover / selection outline', 'Size bubble with Play', 'Working-frame marker', 'Accent places' 표)를 현재 규칙으로 고친다. ARCHITECTURE는 바뀌지 않음을 확인한다. `docs/features/canvas-mark-accent/`를 지운다.
  - 검증: `rg -n "border-focus" docs/DESIGN.md`에 오버레이 표시가 남지 않는다. `git ls-files docs/features/canvas-mark-accent`가 빈 결과다.
  - 커밋 경계: 문서별 커밋.
