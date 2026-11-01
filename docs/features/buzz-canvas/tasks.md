# buzz-canvas — tasks

선행: `buzz-shell`(main 병합). 순서는 초안 → 순수 함수 → renderer → 제거 → 실제 앱 → 승격이다. 커밋 경계는 `── commit ──`으로 표시한다. 검증 명령은 AGENTS.md 'Commands'에 있는 것만 쓴다.

## D. 초안

- [ ] D1. `/design-draft buzz-canvas`: `.doan/canvases/buzz-canvas.html`(design §0 프레임). 보드 바탕은 연한 회색, 캔버스 헤더는 Overview 헤더 상자에 서랍만(2026-11-01 user, 수정 1–4). 위·아래 inset 값, 알림 위치, 다시 로드 중 서랍의 비활성 여부, 문구(design §5, clarify 프리셋)를 초안에서 정한다. 사용자가 앱에서 초안을 확정한다.
  - 검증: `go run ./cli/cmd/doan check --repo .`와 `go run ./cli/cmd/doan ls --repo .`.

── commit: `docs(canvases): buzz-canvas draft` ──

## T. 순수 함수

- [ ] T1. `frameDrawerView`, `zoomControlView`, `zoomTo`, inset을 받는 `fitWidth`·`fitFrame`·`locateView`(design §3 표의 경우를 모두). `viewport.test.ts`의 32px 고정값을 inset 고정값으로 바꾼다.
  - 검증: `npm --prefix app test`.

── commit: `feat(renderer): frame drawer, zoom control and inset fitting models` ──

## R. renderer

- [ ] R1. 캔버스 헤더와 프레임 서랍: Overview 헤더(`.ov-head`) 상자의 헤더(캔버스 / 서랍, 구분선 없음), 서랍 트리거(지금 보는 프레임의 "번호. 이름", 비활성 이유), Radix 팝오버 목록(roving tabindex, 지금 보는 행 스크롤·포커스, 말줄임과 `title`, 잘린 목록 안내), 고르면 닫고 `selectFrame(index)`.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`.
  - 경우: 초안 가드가 거절(이동·선택 없음), 목록이 열린 사이 다시 로드로 프레임이 바뀜, Esc가 메뉴만 닫고 선택은 남음, 포커스가 서랍 버튼으로 돌아옴.
- [ ] R2. 배율 컨트롤러: −·값(메뉴 트리거)·+, 메뉴 Fit ⌘1·100% ⌘0·50%·200%, `CanvasController.zoomTo`, 프레임 없을 때 "—"와 비활성.
  - 검증: `npm --prefix app test`.
- [ ] R3. 도구모음: 하단 가운데 줄, 선택 피커(`aria-pressed="true"`, 툴팁). Tab 순서 서랍 → 배율 → 도구모음.
  - 검증: `npm --prefix app test`.
- [ ] R6. 캔버스 대화 패널 껍데기와 틀: 캔버스 페이지의 오른쪽 패널을 껍데기(헤더 "Conversation", 우상단 닫기, 빈 본문)로 바꾸고 `RightPanel`·Comments 패널·코멘트 핀·Review bar·Hand Off를 그리지 않는다(컴포넌트는 남김). 접혔을 때만 캔버스 헤더 우상단에 열기. shadcn `resizable`을 추가한다(`npx shadcn@4.22.1 add resizable` from `app/`; `react-resizable-panels`는 게시 2주가 지난 버전으로 `npm --prefix app install --save-exact`; design §2 '라이브러리'의 API 확인을 먼저). 토글 버튼, 경계 손잡이(끌기, 키보드, 두 번 클릭), 그리드 열 폭, 접힌 상태의 영역 모서리, `UiState.rightPanel` 저장·복원, 끄는 동안 보드 덮개.
  - 검증: `npm --prefix app test` (ui-state 왕복과 잘못된 값, 960 창 최대 폭, 폭 변경 뒤 뷰 기준 유지).
- [ ] R5. 에이전트 작업 표시: 이 캔버스의 현재 대화(`canvasConversationRows`와 같은 ID·경로 매칭)가 일하거나 응답을 기다리면 테두리 없이 숨쉬는 가장자리 그라디언트, malmoi `DotField`를 옮긴 흰 점 필드(자동 순회, 포인터 무시), 보드 위쪽 가운데 안내(점, 문구, Stop → `interruptConversation`; 왼쪽 아래 변경 표시는 그대로). 동작 줄이기에서 점 정지.
  - 검증: `npm --prefix app test` (다른 캔버스·프로젝트 대화는 표시 없음, 턴 끝에 사라짐, Stop 실패 시 안내 유지와 오류 토스트, 포인터를 막지 않음).
- [ ] R4. 보드 바탕, 오버레이(`.mark`·`.dims`·이동 하이라이트), `.canvas-status`, 알림, 겹침 순서를 초안 값으로. Fit·이동·locate가 inset을 쓴다.
  - 검증: `npm --prefix app test`, `npm --prefix app run build`.

── commit: `feat(renderer): buzz canvas controls and board` ──

## X. 제거

- [ ] X1. `.zctl` 띠, 캔버스 위 Reload 버튼, 쓰지 않게 된 `.zoom`·`.canvas-notice`·`.updated` 규칙을 지운다. 워크스페이스 토스트 여백을 다시 정한다.
  - 셀렉터 문자열 검색(POSTMORTEM 2026-10-30): `grep -rn "zctl\|\.zoom\b\|canvas-notice\|\.updated\b\|Reload canvas" app/src app/runtime`.
  - 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run build`, 위 grep에서 남은 줄이 모두 의도한 것.

── commit: `refactor(renderer): drop the bottom-right canvas control strip` ──

## V. 실제 앱

- [ ] V1. `/design-sync`: `buzz-canvas.html`의 프레임을 빌드한 앱에서 맞추고 DESIGN.md를 갱신한다. 960×600과 1238×780에서 컨트롤·작업 안내·알림·토스트·핀의 사각형이 겹치지 않는지 잰다. 어두운·밝은·violet 픽스처 캔버스 위 선택 표시를 확인한다.
  - 검증: `/design-sync` 절차의 측정 스크립트(`node .scratch/design-sync/<screen>/measure.mjs`).
- [ ] V2. `/runtime-test`: 서랍에서 프레임을 고른 뒤 `DOAN_RUNTIME=<tmp>/runtime.json <cli> active --json --repo <tmp repo>`가 그 프레임을 돌려준다. Quick Open 프레임 이동 뒤에는 선택이 바뀌지 않는다. 배율 메뉴 Esc 뒤 선택이 남는다. ⌘R과 로드 실패 Reload가 동작한다. 결과는 `.scratch/runtime-test/buzz-canvas/`에 남긴다.
  - 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과 뒤 `/runtime-test` probe.

## Z. 승격과 정리 (문서마다 커밋)

- [ ] Z1. PRODUCT §5 항목 5의 "bottom label" 규칙을 지운다(변경 표시 없앰, 2026-11-01 user). PRODUCT §5 항목 4·5: 캔버스 페이지에 Inspector와 Comments 화면이 없다는 현재 상태(선택과 `doan active`는 유지)를 적고, 오른쪽 패널을 캔버스 대화 패널 껍데기로 적는다. PRODUCT §5 항목 2·3: 서랍(이동하고 선택함), 배율 컨트롤러와 메뉴, 도구모음의 선택 피커, 에이전트 작업 표시(조건, 응답 대기 문구, Stop). §6 Open questions에 "에이전트가 작업 중인 곳을 캔버스에서 실시간으로 짚기(사용자는 실시간을 원함, 근거 PoC 필요, 다시 로드 때 프레임 비교는 대안)"를 더한다(spec 비목표).
  - 검증: `grep -n "Frame jumps are available" docs/PRODUCT.md`가 서랍을 함께 적는다.
  - ── commit: `docs(PRODUCT): canvas frame drawer and zoom controls` ──
- [ ] Z2. ARCHITECTURE §3 'Canvas view'의 32px 여백을 inset으로, §7 UiState의 `rightPanel`, 'Jump and current frame'에 서랍의 `selectFrame` 경로, 'Actions and focus'의 캔버스 안 Tab 순서.
  - 검증: `grep -n "margin 32px" docs/ARCHITECTURE.md` 결과 없음.
  - ── commit: `docs(ARCHITECTURE): canvas insets and frame drawer` ──
- [ ] Z3. DESIGN.md: 'Canvas area and right panel'의 캔버스 부분, 'Select and inspect'의 오버레이 부분에서 "buzz-ds 이전" 표시를 걷고 측정값을 적는다. 오른쪽 패널·Inspector 부분은 `buzz-inspector` 몫으로 남긴다.
  - 검증: `grep -n 'buzz-ds 이전' docs/DESIGN.md`에 남은 줄이 모두 다른 자식 몫.
  - ── commit: `docs(DESIGN): record the buzz canvas` ──
- [ ] Z4. 부모 `buzz-restyle`: tasks C8 체크, 공통 결정 6에 보존 예외(캔버스 페이지의 Inspector·Comments 화면 제거, 2026-11-01 user)를 적고 표 9·12번의 "오른쪽 패널" 서술을 고친다, spec 표 12번의 '오른쪽 패널의 표시·숨김' 중 틀(접기·펼치기·폭)을 8번으로 옮긴다(자동으로 여는 규칙은 12번에 남음), 표 8번에서 '입력창 요소 피커가 쓰는 선택 모드'를 빼고 12번에 더한다, 표 8번에 에이전트 작업 표시와 선행 `buzz-conversation`을 더한다, 공통 결정 2에 '에이전트 작업 표시(가장자리 그림자·점·안내)와 패널 손잡이 막대는 accent' 예외를 더한다(모두 2026-11-01 user), design.md 'DESIGN.md 절과 담당' 표 갱신. `docs/features/buzz-canvas/`를 지운다.
  - 검증: 디렉터리가 없다.
  - ── commit: `docs(feature): complete buzz-canvas` ──
