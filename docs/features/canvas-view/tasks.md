# canvas-view — tasks

순서: PoC → 순수 함수 → 셸(I/O) → UI → e2e → 승격. `── commit ──`은 커밋 경계다. `/ship` · `/orchestrate`로 진행할 때 코드 경계는 `test:`(red) + `feat:` 커밋 한 쌍으로 나눠도 된다. 각 경계에서 `npm --prefix app test`와 `npm --prefix app run typecheck`가 통과해야 한다.

## 0. PoC 1 · PoC 3 (게이트)

- `.scratch/`에서 Electron 45 최소 앱으로 design.md 'PoC 의존'의 PoC 1 항목 1–6과 PoC 3을 확인한다.
- 결과를 PRODUCT §6에 날짜 · 버전과 함께 항목별 통과·실패로 기록한다. 실험으로 정한 값(주입 이벤트, 높이 측정 규칙과 상한)은 design.md에도 반영한다.
- 검증:
  - PRODUCT §6에 다음 결과가 각각 통과·실패로 적혀 있다.
    - 주입(OOPIF, 이벤트, 리로드 뒤 재주입)
    - 높이 다섯 사례(±1px, 무한 증가 없음, 50,000px 보드)
    - 휠 전달(iframe 위 일반 휠과 `ctrlKey` 휠, 배율 0.25·4에서 팬 거리 같음, 내부 스크롤 통과)
    - iframe 포커스 중 메뉴 단축키
    - 탐색 허용·거부
    - 선택·하이라이트
    - PoC 3 표식 오차 1px 이하
  - design.md 'PoC 의존'과 '정할 값'에 주입 이벤트와 높이 규칙·상한이 적혀 있다.
  - 하나라도 실패면 여기서 멈추고 사용자에게 재결정을 요청한다. 서버 응답 삽입으로만 되는 주입도 실패다.

── commit (`docs(product): record PoC 1 and 3 results`, `docs(feature): canvas-view PoC findings` 문서별로) ──

## 1. 뷰포트 계산

- `app/src/renderer/viewport.ts`: `zoomAt` · `panBy` · `fitWidth` · `fitFrame` · `resizeKeep` · `boardToScreen` · `screenToBoard` · `wheelAction`과 design.md '정할 값'의 상수.
- 경계 사례:
  - 배율 상·하한에서의 `zoomAt`. `zoomAt` 뒤 기준점이 같은 보드 좌표를 가리키는지
  - 뷰포트보다 큰 프레임과 작은 프레임, 세로로 긴 프레임(위쪽 맞춤), 폭·높이 0 프레임
  - 폭 0 · 높이 0 뷰포트, 높이 0 보드
  - 375px 보드의 `fitWidth`가 1을 넘지 않음
  - `resizeKeep` 뒤 배율과 왼쪽 위 보드 지점이 그대로인지
  - `wheelAction`: `deltaMode` 1·2, 마우스 휠 크기 `dy`(±100), 아주 큰 `dy`(`exp`가 `Infinity`나 0이 되는 값)도 [1/1.25, 1.25]로 잘리는지, Cmd만 눌린 경우
- 검증: `npm --prefix app test` 통과, `npm --prefix app run typecheck` 통과.

## 2. 메시지 검증과 화면 갱신 판단

- `app/src/renderer/canvasMessage.ts`: `parseCanvasMessage`. `app/src/renderer/canvasView.ts`: `canvasViewUpdate`.
- `parseCanvasMessage` 경계 사례:
  - `NaN` · `Infinity` · 음수 높이
  - 빈 `id`(살림), 문자열이 아닌 `id` · `title`(그 항목만 버림)
  - 1,000개를 넘는 프레임 배열, 200자를 넘는 문자열(자르고 `truncated`)
  - `wheel`의 `x` · `y` · `deltaMode` 값 검증
  - 알 수 없는 `type`, `null` · 배열 · 원시값
- `canvasViewUpdate` 경계 사례:
  - 열린 폴더의 `servedRev` 변경(`reload`), 다른 폴더의 `servedRev` 변경(`none`), 코멘트 수만 변경(`none`)
  - `width` 변경(`resize`)
  - 캔버스가 목록에서 빠짐, 폴더 닫힘, `notFound`(`clear`)
  - `error` · `cliError`(`errorLine`, 리로드 없음)
  - 같은 캔버스 경로가 두 폴더에 있을 때 키가 섞이지 않음
- 검증: `npm --prefix app test` 통과.

## 3. main 쪽 순수 판단

- `app/src/main/view.ts` `canvasRows`에 `width` 추가(양의 안전 정수만). `app/src/main/canvasFrame.ts`: `isCanvasFrame` · `allowFrameNavigation` · `fromAppFrame`.
- 경계 사례:
  - 다른 포트 · 다른 토큰 · `localhost` 호스트
  - 토큰 경로 접두어만 같은 URL(`/t/<token>x/`), 다른 폴더 키
  - `%2e%2e` · `/t/<token>/../`, userinfo URL(`http://127.0.0.1:<port>@evil/`)
  - `about:blank`에서 첫 `src`(허용), `data:` · `javascript:`(거부)
  - 손자 프레임(제한 대상 아님), `frame`이 `null`(거부)
  - `fromAppFrame`: 다른 webContents, 하위 프레임, `senderFrame`이 `null`
- 검증: `npm --prefix app test` 통과.

── commit (`feat(app): canvas view pure helpers`) ──

## 4. 서빙 경로 감시와 변경 구분

- `watch.ts`:
  - `doan ls` `scope` 중 `design`이 아닌 항목을 감시에 더한다. 디렉터리는 재귀로, 파일은 부모 디렉터리를 비재귀로 감시하고 이름으로 거른다. `.doan/` 아래 항목과 `design/` 안 항목은 감시하지 않는다.
  - 다시 읽을 때 scope가 바뀌면 감시 대상을 맞춘다.
  - 디바운스 동안 "다시 읽기 필요"와 "서빙 파일 변경" 두 플래그를 누적하고, `again` 재실행에도 잃지 않는다(`createRefresher` 변경).
- `shell.ts`: `Folder.servedRev`. 발행 규칙은 design.md 흐름 9와 같다.
  - `design/` 변경: `doan ls` 결과와 함께 한 번에 발행한다.
  - `tokenCss` · `serve`만 변경: `doan ls`를 돌리지 않고 즉시 발행한다.
  - scope 변경: `server.updateFolder` 뒤에 올린다.
  - 오래된 읽기를 버려도 증가분은 남는다.
- 경계 사례:
  - 원자적 저장(임시 파일을 쓰고 rename)한 `tokenCss`
  - scope에서 빠진 경로의 감시 해제
  - `.doan/` 변경만(올리지 않음), `serve: [".doan"]`(올리지 않음), `serve: ["design/assets"]`(이중 감시 없음)
  - `design/`와 `serve` 동시 변경, 200ms 안의 연속 변경(+1로 끝남)
  - `design/` 변경 중 `doan ls`가 실행 중일 때 들어온 `serve` 변경(플래그 유지)
  - config `serve` 추가로 scope가 바뀜(서버 갱신 뒤 +1)
  - 심링크된 `design`(실제 경로를 재귀 감시)
- 검증: `npm --prefix app test` 통과(`watch.test.ts` · `shell.test.ts`에 위 사례 추가).

── commit (`feat(app): watch served paths outside design/`) ──

## 5. main 셸

- `index.ts`:
  - 앱 메뉴 정의(design.md 흐름 7)와 메뉴 명령 IPC. preload에 `onViewCommand`를 더한다.
  - 세션 권한 요청 · 확인 · 장치 권한 거부.
  - IPC 핸들러에 `fromAppFrame` 적용.
  - 캔버스 프레임 탐색 제한(`will-frame-navigate` + `allowFrameNavigation`).
  - 주입. 이벤트는 PoC 1 결과에 따르고, reject는 무시한다.
- 주입 스크립트의 원본 위치와 빌드 방법은 PoC 1 결과로 정해 이 task를 시작할 때 design.md에 적는다.
- `electron.vite.config.ts`: CSP에 `frame-src http://127.0.0.1:*`.
- 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app run build` 성공, `npm --prefix app run e2e`의 기존 단계가 `runtime-test: PASS`(메뉴 · CSP · IPC 변경이 #4 동작을 깨지 않음). 새 동작은 task 7에서 확인한다.

── commit (`feat(app): load canvases in a sandboxed iframe`) ──

## 6. 렌더러 UI

- 사이드바 + 캔버스 뷰(보드 = iframe + 빈 overlay) + 툴바(Q5). 툴바는 축소 · 배율 % · 확대 · 맞춤 · 갱신 시각.
- 캔버스 선택(새 iframe 생성), 메시지 수신(`event.source` · `event.origin` 확인 + `parseCanvasMessage`).
- 줌·팬: 두 휠 경로가 같은 `wheelAction`을 거친다. 메뉴 명령, 맞춤, 창 크기 변경(`resizeKeep`).
- 프레임 목록과 점프(index, 점프 전 `measure`).
- `canvasViewUpdate` 결과 적용, spec 완료 조건 10의 화면 상태와 문구, `layout.href`로 열린 캔버스 표시 바꾸기.
- `<button>` · `aria-current` · `aria-label`, 다시 그린 뒤 표시와 포커스 복원. 캔버스 뷰는 사이드바 `replaceChildren` 트리 밖에 둔다.
- 텍스트는 `textContent`로만 넣는다(프레임 제목은 에이전트가 쓴 값).
- 검증: `npm --prefix app run typecheck` 통과, `npm --prefix app test` 통과. `grep -rn 'innerHTML\|insertAdjacentHTML' app/src/renderer`가 0건. 동작 확인은 task 7.

## 7. e2e 확장

`app/e2e/runtime.ts`에 다음 단계를 추가한다.

1. 캔버스를 고르기 전 안내 → 캔버스 열기 → "불러오는 중…" 뒤 보드 표시.
2. iframe 폭이 `doan:width`와 같고, 높이가 콘텐츠 높이와 ±1px 안이다.
3. 맞춤 배율이 뷰포트 폭에 맞고 1을 넘지 않는다(좁은 보드 포함).
4. 입력:
   - iframe 위 일반 휠로 팬된다. 같은 delta를 여백 위에서 주면 같은 거리를 움직인다.
   - iframe 위 `ctrlKey` 휠로 커서 기준 줌이 된다.
   - 캔버스 안 `overflow: auto` 요소 위 휠로는 그 요소만 스크롤된다.
   - 메뉴 확대 · 실제 크기 · 맞춤(`Menu` 항목 `click`을 main에서 호출)이 동작하고, `webContents.getZoomFactor()`가 1로 유지된다.
5. 창 크기를 바꿔도 배율과 왼쪽 위 지점이 유지된다.
6. 사이드바 프레임 목록 항목을 클릭하면 transform이 바뀌고 그 프레임이 뷰포트 안에 있다. 세로로 긴 프레임은 위쪽이 맞춰진다. 중복 id 두 항목이 각자 다른 위치로 이동한다. 프레임 0개 캔버스는 안내가 나온다.
7. 리로드:
   - 캔버스 파일을 수정하면 리로드되고 배율이 유지되며 갱신 시각이 바뀐다. 내용을 줄이면 높이도 준다.
   - `tokenCss`를 원자적 저장으로 수정하면 리로드된다.
   - 코멘트 파일만 바뀌거나 다른 폴더가 바뀌면 리로드되지 않는다(갱신 시각 그대로).
8. 상태:
   - `doan:width` 없는 캔버스는 안내가 나온다.
   - 열린 캔버스 파일을 지우면 "사라졌습니다" 안내가 나온다.
   - 폴더 config를 깨면 오류 줄이 나오고 화면은 유지된다.
9. 캔버스 안 링크:
   - 같은 폴더의 다른 캔버스로 가면 사이드바 표시가 바뀐다.
   - `http://127.0.0.1:<port>/t/<token>x/`(토큰 밖)와 다른 폴더 키로 가는 링크를 클릭한 뒤에도 iframe 프레임 URL이 원래 URL 그대로다.
10. 보안:
    - 앱 메인 프레임에서 `Notification.requestPermission()`이 `"denied"`이고, `navigator.permissions.query({name: "geolocation"})`의 `state`가 `"denied"`다.
    - 빌드된 렌더러 CSP meta에 `frame-src http://127.0.0.1:*`가 있다.
11. 스크린샷 `3-canvas.png`(맞춤 상태)와 `4-frame.png`(프레임 점프 뒤).

**변형 증명 표**: 아래 코드를 하나씩 잠시 지우고 해당 테스트가 실패하는지 확인한다. 결과는 handoff 문서와 PR 본문에 남기고, 승격 때 ARCHITECTURE에 한 줄로 적는다.

| 지울 코드 | 실패해야 하는 테스트 |
|---|---|
| 권한 핸들러 3개 | e2e 단계 10 권한 |
| `will-frame-navigate` 제한 | e2e 단계 9 토큰 밖 · 다른 폴더 키 |
| CSP `frame-src` 추가 | e2e 단계 10 CSP (지우면 iframe도 안 뜨므로 단계 1부터 실패) |
| 렌더러 `event.source` 확인 | `canvasMessage`/렌더러 수신 단위 테스트 (수신 판단을 함수로 떼어 테스트) |
| `fromAppFrame` 발신 프레임 조건 | task 3 `fromAppFrame` 단위 테스트 |

- 검증: `npm --prefix app run e2e`가 `runtime-test: PASS`, exit 0. `/runtime-test` 스킬로 실행하고 스크린샷을 열어 본다. 변형 표의 다섯 줄이 모두 "실패 확인"으로 기록되어 있다.

── commit (`feat(app): canvas view UI with zoom, pan and frame jumps`) ──

## 8. 문서 정리

- `docs/DIRECTORY.md`: 새 파일(`viewport.ts`, `canvasMessage.ts`, `canvasView.ts`, `canvasFrame.ts`, 주입 스크립트, 메뉴)을 반영한다.
- `.agents/skills/runtime-test/SKILL.md`: 'Steps' 1의 e2e 단계 목록에 캔버스 뷰를, 'Steps' 3의 스크린샷 목록에 `3-canvas.png` · `4-frame.png`를 추가한다.
- 검증: 두 문서에 새 파일과 단계, 스크린샷 이름이 있다.

── commit (`docs: directory and runtime-test for canvas view`) ──

## 9. 승격과 정리

- PRODUCT.md(영문):
  - §5 기능 분할 #5 행에 live reload를 더하고 완료 날짜를 적는다.
  - §7 결정 로그에 이번 결정과 근거를 적는다.
    - Q1 주입 방식, Q2 DOM 프레임 목록, Q3 휠 전달과 내부 스크롤 통과, Q4 서빙 경로 감시, Q5 사이드바 배치
    - 리뷰 결정: 앱 메뉴, Cmd+0 = 100% · Shift+1 = 맞춤, 늦게 생긴 `serve`는 다음 읽기, PoC 주입 실패 시 멈춤, 같은 폴더 키 안 탐색, 일시 오류 시 화면 유지, 줌 기본값, `.doan` 겹침 규칙, 프레임 메시지 자르기, 로딩 상태, overlay 층과 입력 방향
    - PoC 1로 정한 높이 측정 규칙
  - §8에 열린 질문 "#6 `doan active`와 #7 프레임 코멘트는 DOM 프레임과 `doan ls` 프레임 중 무엇을 기준으로 하나"를 추가한다.
  - §6 PoC 1 결과에 선택·하이라이트 관찰이 남아 있는지 확인한다(#6 근거).
- ARCHITECTURE.md(영문):
  - §3: 103행의 미래형 문장을 현재형 결정으로 바꾸고, 주입 방법 · 메시지 · 높이 규칙 · 줌 범위와 기본값 · overlay 층 · 입력 방향 · 탐색 제한 · 권한 deny-all · 변형 증명 결과를 적는다.
  - §7: 앱 메뉴, IPC 발신 프레임 확인, CSP `frame-src`.
  - §13: 감시 대상에 `design/` 밖 서빙 경로를 더하고(기존 'not watched' 문장 교체), 두 플래그와 `servedRev` 발행 · 리로드 규칙, `.doan` 겹침 규칙을 적는다.
- `docs/features/canvas-view/` 삭제.
- 검증:
  - `docs/features/canvas-view/`가 없다.
  - PRODUCT §5 #5 행에 live reload와 완료 날짜가 있다.
  - §7에 위 결정이 날짜와 함께 있고, §8에 프레임 목록 질문이 있다.
  - ARCHITECTURE §3 103행이 현재형이고, §3 · §7 · §13에 위 항목이 날짜와 함께 있다.

── commit (`docs(product)`, `docs(architecture)`, `docs(feature)` 문서별로 나눠서) ──
