# 프로토타입 작성 계약 — tasks

순서는 형식 → 순수 함수 → 재생 스크립트 → 가이드 → 실제 확인 → 승격이다. `──` 표시는 커밋 경계다.

1. **finding 코드 형식 확인**: `doan check` 응답의 finding `code`를 schema(`schema/cli-envelope.v1.schema.json` 등)가 열거하는지 확인한다. 열거한다면 `viewport_height_no_fallback`을 더하고 fixture를 고친다.
   - 확인: `go test ./...`, `npm --prefix app test`(TS와 Go가 같은 fixture를 읽는 테스트가 통과).
   ──
2. **check 규칙**: `undefined_token`에서 `--doan-viewport-height`를 빼고, 대체값 없는 사용에 `viewport_height_no_fallback` 경고를 낸다.
   - 확인: `go test ./...`. 다음 케이스가 통과한다.
     - 대체값 있음 → finding 없음
     - 대체값 없음 → 경고 1개
     - `--doan-viewport-height`가 `undefined_token`으로 나오지 않음
     - 다른 이름 `--doan-x`는 지금처럼 `undefined_token`
     - 공유 스타일시트에서의 동작이 `viewport_height_unit`과 같은 범위
   ──
3. **재생 스크립트**: `prototypeScript.ts`의 `isolate`와 `isolate.js`의 프레임 규칙에 `--doan-viewport-height: 100vh !important`를 더한다. 프레임의 다른 규칙은 바꾸지 않는다.
   - 확인: `npm --prefix app test`, `node --test 'app/runtime/*.test.ts'`, `go test ./...`.
     - 재생 중 프레임과 그 자손에서 변수가 viewport 높이로 계산된다(Fit에서 H, Responsive에서 창 높이).
     - 두 스크립트의 규칙이 같다(drift).
     - 변수를 쓰지 않는 캔버스의 프레임 계산값이 지금과 같다.
   ──
4. **가이드**: `cli/internal/cli/skill.md`의 규칙 11, 14를 design의 문구 초안대로 고치고, 범위 확인 문장을 더한다.
   - 확인: `go test ./...`. `skillOutputBudget` 예산 테스트와, 새 문장(변수 이름과 대체값 형태, WxH 의미, Fit/Responsive, 모달 위치, 스크립트 범위, `data-doan-id`, 재생마다 초기화, 상태 분리, 범위 확인)을 고정한 가이드 계약 테스트가 통과한다.
   ──
5. **실제 앱 확인**: `/runtime-test`로 격리된 앱에서 `height: var(--doan-viewport-height, 900px)`로 헤더 고정과 내부 스크롤을 쓰는 1440x900 프레임을 본다.
   - 보드: 900 높이로 보이고 안에서 스크롤된다.
   - 재생: Fit에서 900이고, Responsive에서 창을 키우면 높이가 따라간다.
   - `doan export --frame --prototype` 파일을 브라우저에서 열고 창 크기를 바꾸면 높이가 따라간다.
   - 확인: `/runtime-test` 보고와 스크린샷.
6. **검증 게이트**: `node .agents/skills/verify/scripts/verify.mjs`.
   - 확인: 종료 코드 0.
7. **에이전트 평가**: `/agent-eval`로 프로토타입 시나리오(W7·W8·W11 등 프로토타입 마크를 쓰는 것)를 Claude Code와 Codex로 돌린다. 창 높이 레이아웃을 요구하는 시나리오가 없으면 그 추가가 필요한지 보고한다.
   - 확인: `docs/USABILITY-EVAL.md`에 라운드 기록이 있고, 새 회귀가 없다.
   ──
8. **승격과 정리**
   - `docs/ARCHITECTURE.md`
     - §1 convention 11과 14에 변수와 대체값 규칙, WxH 의미를 적는다.
     - §3 'Prototype window' 'Rendering in place'와 export 'Prototype page'에 재생 스크립트가 변수를 정한다는 것을 적는다.
     - `doan check` 코드 목록에 `viewport_height_no_fallback`을 더한다.
   - `docs/PRODUCT.md` §5 item 2 'Prototype window', item 3 'Prototype file': 재생 중 프레임은 `--doan-viewport-height`를 viewport 높이로 받는다.
   - `docs/BACKLOG.md`: 재생 상태 스크린샷 명령(또는 검증용 export 허용), 외부 링크 동작 결정을 각각 한 항목으로 남긴다.
   - 마지막으로 `docs/features/prototype-authoring-contract/`를 지운다.
   - 확인: `grep -n "doan-viewport-height" docs/PRODUCT.md docs/ARCHITECTURE.md`가 위 위치를 보여주고, 디렉터리가 지워져 있다.
