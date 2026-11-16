# 프로토타입 작성 계약 — tasks

순서는 순수 함수(check) → 재생 스크립트 → 가이드 → 실제 확인 → 평가 → 승격이다. 형식 변경은 없다(finding code는 schema가 열거하지 않는다). `──` 표시는 커밋 경계다.

1. **check 규칙**
   - `undefined_token`에서 `--doan-viewport-height`를 뺀다(링크된 스타일시트 포함 전체 범위).
   - 캔버스 자신의 스타일(`<style>`, `style` 속성)에서 대체값 없는 사용에 `viewport_height_no_fallback` 경고를 낸다.
   - `viewport_height_unit` 메시지에 변수 안내를 더한다.
   - 확인: `go test ./...`. 다음 케이스가 통과한다.
     - 대체값 있음 → finding 없음
     - 대체값 없음 → 경고 1개
     - `calc(var(--doan-viewport-height, 900px) - 64px)` → finding 없음
     - `style` 속성 안에서 대체값 없이 씀 → 경고
     - 대체값 안의 var(`var(--doan-viewport-height, var(--screen-h))`) → 바깥은 finding 없음, 안쪽 `--screen-h`는 지금처럼 검사
     - 대체값이 `100vh` → `viewport_height_unit`
     - 링크된 스타일시트에서 씀 → `undefined_token` 없음, `viewport_height_no_fallback` 없음
     - 다른 이름(`--doan-x`)과 대소문자가 다른 이름 → 지금처럼 `undefined_token`
     - 프레임 밖이나 표시되지 않은 프레임에서 씀 → 같은 규칙(check는 프레임을 모른다)
     - `viewport_height_unit` 메시지 테스트(`check_test.go`) 갱신
   ──
2. **재생 스크립트**: `prototypeScript.ts`의 `isolate`와 `isolate.js`의 시트에 `:root` 변수 규칙과 `@supports (height: 100dvh)` 규칙을 더한다. 프레임의 다른 규칙은 바꾸지 않는다.
   - 확인: `npm --prefix app test`, `go test ./...`.
     - `exportViewer.test.ts`의 "isolate.js is the prototype window's isolation" 테스트가 새 규칙을 포함해 통과한다.
     - `prototypeScript.test.ts`에서 두 규칙이 시트에 있고, 프레임 규칙이 지금과 같다.
   ──
3. **가이드**
   - 먼저 지금 plain·`--json` 출력 크기와 `skillOutputBudget`까지 남은 여유를 잰다.
   - 규칙 11, 14와 Agent rules 한 줄을 design의 초안대로 고친다. 넘치면 design의 순서대로 줄인다.
   - 확인: `go test ./...`. 예산 테스트와 가이드 계약 테스트가 통과한다. 계약 테스트는 다음 문장을 고정한다.
     - 변수 이름과 대체값 형태, 프레임이나 앱 루트의 height, 직접 정의하지 않음
     - WxH 의미, Fit/Responsive
     - 모달 위치, 스크립트 범위, `data-doan-id`, 재생마다 초기화, 상태 분리
     - 범위 확인 한 줄
   ──
3b. **평가 시나리오 W12**: `eval/scenarios/W12/`를 기존 시나리오(W11)와 같은 구성(`scenario.json`, `prompt.md`, `rubric.md`, `checks.ts`, `checks.test.ts`, `seed`, `fixtures/pass`·`fail`)으로 만든다.
   - 프롬프트: 헤더가 고정되고 본문이 안에서 스크롤되는 데스크톱 앱 화면을 재생할 수 있는 프로토타입으로 만들어 달라고 한다. 높이나 단위는 말하지 않는다.
   - 통과 조건(checks): 표시된 프레임이 있고 WxH가 데스크톱 viewport다. 높이에 `var(--doan-viewport-height, <px>)`를 쓰고 대체값이 WxH의 H와 같다. 캔버스에 vh 계열 단위가 없다. `doan check`에 `viewport_height_no_fallback`과 `viewport_height_unit`이 없다. 변수를 직접 정의하지 않는다.
   - fail fixture: `100vh`를 쓰거나, 내용 높이로 WxH를 정하거나, 대체값이 없는 경우.
   - 확인: `node --test 'eval/**/*.test.ts'`, `node eval/run.ts --self-test --scenarios W12`가 `self-test PASS`와 종료 코드 0.
   ──
4. **실제 확인**: `/runtime-test`로 격리된 앱에서 프레임 두 개(표시된 1440x900 하나는 `height: var(--doan-viewport-height, 900px)`로 헤더 고정과 내부 스크롤을 쓰고, 다른 하나는 표시하지 않음)가 있는 캔버스를 본다.
   - 보드: 900 높이로 보이고 안에서 스크롤된다. 표시하지 않은 프레임은 지금과 같다.
   - 썸네일: 대체값 높이로 찍힌다.
   - 재생: Fit에서 900이고, 창이 H보다 작아 축소될 때도 900이다. Responsive에서 창을 키우면 높이가 따라간다.
   - 변수를 쓰지 않는 기존 프로토타입 캔버스의 재생이 지금과 같다.
   - `doan export --frame --prototype` 파일: Chromium과 WebKit에서 열고 창 크기를 바꾸면 높이가 따라간다.
   - `--frame` 없는 캔버스 export 뷰어: 대체값을 쓴다.
   - 확인: `/runtime-test` 보고와 스크린샷. 실제 휴대폰 Safari는 확인하지 못한 항목으로 남긴다.
5. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs --eval`(W12 시나리오를 더하므로 `--eval`).
   - 확인: 종료 코드 0.
6. **에이전트 평가** (마지막 통합 전)
   - 준비: `npm --prefix app run package`.
   - `/agent-eval`로 W 계열 전부(새 W12 포함)와 X2를 Claude Code와 Codex로 돌린다(규칙 11은 모든 시나리오가 읽는다). 프로토타입 마크를 쓰는 시나리오는 W7, W11, W12다.
   - W7·W11·W12에서 에이전트가 질문으로 멈추지 않는지 본다.
   - W12에서 두 에이전트가 변수와 대체값을 쓰는지 본다. 실패하면 원인을 `docs/USABILITY-EVAL.md` Issues에 적는다.
   - 확인: `docs/usability-eval/rounds-2026-11.md`에 라운드 기록이 있고, 새 회귀가 없다.
   ──
7. **ARCHITECTURE 승격**
   - §1 convention 11과 14에 변수, 대체값 규칙, WxH 의미를 적는다.
   - §3 'Prototype window' 'Rendering in place'와 export 'Prototype page'에 재생 스크립트가 `:root`에 변수를 정한다는 것(vh와 dvh)을 적는다.
   - `doan check` 코드 표에 `viewport_height_no_fallback`을 더하고, `undefined_token` 행의 "even with a var() fallback"에 `--doan-viewport-height` 예외를 적는다. convention 7에 같은 예외가 필요하면 고친다.
   - 확인: `grep -n "doan-viewport-height\|viewport_height_no_fallback" docs/ARCHITECTURE.md`가 위 위치를 보여준다.
   ──
8. **PRODUCT 승격**
   - §3 Out of scope 2에 "a marked frame also gets `--doan-viewport-height` while playing" 구절을 더한다.
   - §5 item 2 'Prototype window', item 3 'Prototype file': 재생 문서는 `--doan-viewport-height`를 viewport 높이로 받는다.
   - 확인: `grep -n "doan-viewport-height" docs/PRODUCT.md`가 세 곳을 보여준다.
   ──
9. **BACKLOG**: 재생 상태 스크린샷 명령(또는 검증용 export 허용), 외부 링크 동작 결정, 실제 휴대폰 Safari 확인(4번에서 못 했으면)을 각각 한 항목으로 남긴다.
   - 확인: `grep -n "screenshot\|external link" docs/BACKLOG.md`.
   ──
10. **정리**: `docs/features/prototype-authoring-contract/`를 지운다. DIRECTORY는 바뀌지 않는다(디렉터리 추가·삭제 없음).
    - 확인: 디렉터리가 없다.
