# 캔버스 거리 측정 — tasks

1. **Figma 추가 관찰.** '미확정 규칙'을 정할 사례를 관찰한다. 한 축만 겹칠 때 변 차이 0이 있는 경우와 없는 경우, 선택과 대상을 바꾼 경우, 대상 범위가 선택 안·밖·일부인 경우를 본다. 줌 50%·200%의 선 두께와 라벨 크기, 라벨보다 짧은 간격도 본다. design.md '관찰 기록'과 '미확정 규칙'을 확정한 규칙으로 고친다.
   - 검증: 관찰 표의 모든 사례를 하나의 규칙이 설명한다. 사례마다 캡처가 `.scratch/canvas-measure/`에 있다.
   - 커밋 경계: `docs(feature): canvas-measure settle measurement rules`
2. **`/design-draft`.** `.doan/canvases/`에 측정 초안을 그린다. 떨어짐, 대각선, 교차, 포함, ⌘⌥ 중첩, 측정 중 외곽선을 넣고, 측정 색 토큰과 대비를 정한다.
   - 검증: `doan check --repo .`와 `doan ls --repo .`에 오류가 없다. 사용자가 앱에서 초안을 확인한다.
3. **순수 함수 테스트(`/tdd`).** `measure.ts`의 `measureLines`, `measureLabel`, `measureLabelPlace` 테스트를 관찰 사례 01–05, 11–17로 쓴다.
   - 검증: `npm --prefix app test`에서 새 테스트가 red다.
   - 커밋 경계: `test(app): pin canvas distance measurement against observed Figma cases`
4. **순수 함수 구현.** `measureLabel`은 `sizeLabel`과 반올림을 공유한다.
   - 검증: `npm --prefix app test`와 `npm --prefix app run typecheck`가 통과한다.
5. **캔버스 스크립트와 메시지.** Option 상태에서도 hover 대상을 계산해 보내고, `hover` 메시지에 Option 여부를 싣는다. selection 채널은 건드리지 않는다.
   - 검증: `canvasScript.test.ts`와 `canvasMessage` 파서 테스트가 통과한다. Option-click 통과 테스트(`CanvasController.test.ts` "restores the cached hover after Alt keyup" 등)도 그대로 통과한다.
6. **overlay 그리기.** `drawMarks`가 `altHeld && selectedRect && hoverRect`일 때 측정 선·점선·라벨과 측정용 외곽선을 그린다. Hand, Picker, Capture area, 텍스트 드래그, Space 드래그 중에는 그리지 않는다.
   - 검증: `CanvasController.test.ts`에 측정 표시와 해제 테스트를 더하고 `npm --prefix app test`가 통과한다.
   - 커밋 경계: `feat(app): measure distances between the selection and the hovered target with Option`
7. **`/design-sync`와 `/runtime-test`.** 실제 앱에서 01·02·03·05·11을 재현해 초안과 computed style을 맞춘다. Option을 캔버스 안에서 떼는 포커스 이동 경우와 Option-click 동작도 확인한다.
   - 검증: 측정값과 화면 기록이 `docs/design/canvas.md`에 남는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
8. **문서 승격과 정리.** PRODUCT §5 item 4 'Selection'에 Option-hover 측정 규칙을 현재 규칙으로 쓴다. ARCHITECTURE §3 'Selection'에 hover 메시지의 Option 필드와 측정이 hover 채널만 쓴다는 점을 쓴다. `docs/design/canvas.md`에 측정 모양을 쓰고 `docs/features/canvas-measure/`를 지운다. 관찰용 Figma 파일을 지울지 사용자에게 묻는다.
   - 검증: `/doc-check` 대상 문서에 `canvas-measure` 참조가 남지 않는다. `node .agents/skills/verify/scripts/verify.mjs`가 통과한다.
   - 커밋 경계: 문서별로 나눈다(`docs(PRODUCT): ...`, `docs(ARCHITECTURE): ...`, `docs(design): ...`).
