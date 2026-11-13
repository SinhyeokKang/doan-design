# prototype-responsive — tasks

spec.md '결정'(사용자 확인)을 따른다. 공유 포맷과 fixture 변경은 없다. 순서: PoC → 초안 → 순수 함수 → main·preload(I/O) → UI → 측정·확인 → 문서 승격. guide, CLI 출력, `doan check`가 바뀌지 않으므로 `/agent-eval`은 하지 않는다.

- [ ] 1. **PoC: Fit 축소**(design.md 'PoC 의존'). `.scratch/prototype-responsive/`에서 격리한 앱(임시 userData·HOME·SHELL·DOAN_RUNTIME)으로 프로토타입 창의 run iframe에 `transform: scale`을 걸고 (a) iframe 문서의 `innerWidth`·`innerHeight`·`matchMedia`·`100vh`, (b) 클릭·hover·드래그·휠·텍스트 선택, (c) 글자 선명도, (d) `capturePage` 결과, (e) 크기 변경 뒤 다시 불러오기 없이 입력 값·모달 유지를 확인한다. 결과(통과·실패, Electron 버전, 날짜)를 design.md 'PoC 의존' 아래에 적는다. 실패하면 design.md를 고치고 멈춰 사용자에게 결정 1을 다시 묻는다.
  - 검증: 명령 미정 — 사용자 확인 필요(안: `node .scratch/prototype-responsive/probe.mjs`, 스크린샷 포함).
- [ ] 2. **`/design-draft`**: 새 초안 `.doan/canvases/prototype-responsive.html`. 프레임: 콘텐츠 패널 아래의 모드 툴바(기본·hover·눌림·포커스, tooltip "Fit to 390 × 844"와 "Responsive"), Responsive와 Fit 1배·축소의 프레임 자리와 Fit 프레임 경계, 표시 폭 240 프레임의 두 모드, 툴바가 가리는 영역이 보이는 모바일 프레임, 대화 패널이 열린 두 모드(툴바가 콘텐츠 패널 가운데로 옮겨 감), 360 × 284 실패 화면 위의 툴바와 overlay 아래 여백, 344 폭 콘텐츠 패널. `clarify`로 문구를 확정하고 아이콘을 고른다. 기존 `frame-prototype.html`과 형제 feature의 초안은 고치지 않는다. 사용자가 앱에서 초안을 확인한다.
  - 검증: `doan check --repo . --json`, `doan ls --repo . --json`.
  - 커밋 경계: 초안.
- [ ] 3. **`/tdd`**: design.md '순수 함수로 뺄 것' 1–5를 테스트로 고정하고 red를 확인한다. `fit.test.ts`(`prototypeViewportBox`; `prototypeIframeBox` 테스트는 새 함수의 Responsive·Fit 경우로 옮긴다), `windowState.test.ts`(`setMode`, 처음 값 Responsive, 모드 유지, `CLOSED`에서 유지, 전환에 effect 없음, `run`의 표시 높이), `controller.test.ts`(전환은 view만 보냄, 캡처에 모드와 표시 크기), `requests.test.ts`(`parseModeRequest`), `host.test.ts`(스냅숏 상자 유지), `view.test.ts`(`modeTooltip`), `senderAllowed.test.ts`(`prototype:mode`는 프로토타입 role만).
  - 검증: `npm --prefix app test`가 새 테스트에서만 실패한다.
- [ ] 4. **`/implement` 순수 함수**: 1–5와 `ipc.ts`의 타입(`PrototypeMode`, `PrototypeView.mode`, `run`의 표시 높이, 채널, `PROTOTYPE_WINDOW_REQUESTS`). `PROTOTYPE_NARROW_BELOW`와 `prototypeIframeBox`를 지운다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 커밋 경계: 순수 함수와 테스트.
- [ ] 5. **main·preload**: `controller.ts`의 모드 입력과 캡처 인자, `prototypeWindow.ts`의 `capture` 사각형, `senderAllowed.ts`, `index.ts`의 `prototype:mode` 핸들러, `preload/prototype.ts`의 `setMode`와 채널 이름 고정 테스트.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`.
  - 커밋 경계: main·preload.
- [ ] 6. **UI**: `moveBetweenTools`를 `app/src/renderer/toolbarKeys.ts`로 옮기고 `CanvasTools.tsx`가 그것을 쓴다(`CanvasTools.test.tsx` 그대로 green). `PrototypeModeTools`(`doan-floating doan-canvas-tools`, `md` 버튼 두 개, `aria-pressed`, roving tabindex, ←/→, 공유 Tooltip, `onEscapeKeyDown` 없음)를 `.pw-panel` 안 `.pw-content` 앞에 두고 아래 20 위 가운데(z-index 6)에 놓는다. `ContentPanel`의 폭·높이 측정과 `prototypeViewportBox` 적용(`transform`), overlay 아래 padding 80, `styles.css`. `WindowShell.test.tsx`·`PrototypeWindow.test.tsx`에 Tab 순서(헤더 → 툴바의 눌린 버튼 → 프레임 콘텐츠), 포커스된 버튼의 눌림이 바뀌어도 같은 요소인지, tooltip이 열린 채 Esc가 tooltip만 닫는지, overlay가 콘텐츠를 `inert`로 만들어도 툴바가 쓸 수 있는지, 전환이 iframe 요소를 바꾸지 않는지, 정지 이미지가 찍힌 상자에 남는지를 더한다.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint`, `npm --prefix app run build`.
  - 커밋 경계: UI.
- [ ] 7. **`/design-sync`**: 초안과 실제 앱의 툴바(캡슐 92 × 50, 버튼 40 × 40, 눌림 채움, 아래 20 위 가운데, 대화 패널이 열렸을 때의 자리), 캔버스 툴바 Select/Hand와 같은 계산된 스타일, Fit 1배·축소의 프레임 자리, overlay 아래 여백을 맞추고 DESIGN.md 'Frame prototype'에 잰 값과 documented difference(정지 이미지에 찍힌 툴바)를 적는다.
  - 검증: `node .scratch/design-sync/prototype-responsive/measure.mjs`.
- [ ] 8. **`/runtime-test`**: 격리 앱에서 확인한다. 검증: probe 결과와 스크린샷이 아래 기대값과 같다.
  - Responsive에서 창을 640 → 480으로 줄이면 프레임 문서의 `innerWidth`가 624 → 464가 되고, 표시 폭 240 프레임도 패널을 채운다.
  - Fit으로 바꾸면 gen이 그대로이고 입력 값·열린 모달이 남는다. 창을 줄이면 `innerWidth`·`innerHeight`가 표시 크기 그대로이고 프레임이 줄어들며, 줄인 프레임의 버튼 클릭이 그 버튼에 닿는다.
  - 툴바 캡슐 위의 클릭은 프레임에 닿지 않고, 캡슐 양옆의 클릭은 프레임에 닿는다.
  - Reload, 드로어 선택, Back/Forward, 창 닫고 다시 Play 뒤에도 모드가 같다.
  - Fit 축소 중 캔버스 파일에서 표시를 지우면 정지 이미지가 줄인 프레임 자리에 남고, 360 × 284 창의 실패 화면에서 장면 끝의 Close가 툴바에 가리지 않는다.
  - 키보드: Tab으로 툴바의 눌린 버튼에 오고 ←/→, Enter/Space로 바꾸며, 바꾼 뒤 `document.activeElement`가 같은 버튼이다. tooltip이 열린 채 Esc를 누르면 tooltip만 닫힌다.
  - 빌드된 앱에서 프로토타입 창이 빈 화면 없이 뜬다.
- [ ] 9. `/code-review` → `/refactor` → `/verify`.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`.
- [ ] 10. **결론 승격**: 다음을 현재 규칙으로 고치고(근거는 커밋 메시지) `docs/features/prototype-responsive/`를 삭제한다. 문서마다 커밋한다.
  - PRODUCT §5 item 2 'Prototype window': 'One window'의 크기 문장을 두 모드로, 'Content'의 viewport 문장, 모드 툴바(자리, 가리는 영역, 이름과 tooltip, Tab 순서, 기억), 'Header'의 Tab 순서 문장.
  - ARCHITECTURE §3 'Prototype window' 'Rendering in place'(모드별 iframe 상자, 축소), 'Timeout and kill'(캡처 영역, 툴바가 찍힘), 'Fit'(`PROTOTYPE_NARROW_BELOW` 문장 삭제), 'One window'(모드 상태가 닫힘을 넘어 남음). §7 'Prototype window IPC'(모드 요청, preload API).
  - DESIGN.md 'Frame prototype'(7번에서 이미 고침), 'Run iframe' 줄의 "a frame narrower than 344 keeps its own width centred"를 모드별 값으로.
  - 형제 feature 문서가 아직 남아 있으면: `docs/features/prototype-conversation/design.md` '패널 폭'의 "마크가 344보다 좁은 프레임은 지금처럼 자기 폭을 지키고 가운데에 놓인다"를 "Responsive는 패널을 채우고, 표시 크기는 Fit이 지킨다"로, `docs/features/prototype-cli-export/design.md`와 tasks.md 2의 "모드 전환의 자리"(헤더 배치)를 빼도록 고친다. 이미 승격됐으면 PRODUCT·ARCHITECTURE의 해당 문장을 위 규칙으로 고친다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs`(문서만 바뀌면 대상 확인).
  - 커밋 경계: 문서 승격.
