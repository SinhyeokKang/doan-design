# 프로토타입 재생에서 프레임만 보이기 — tasks

순서: 테스트(실패 확인) → 두 스크립트 구현 → 실제 앱 확인 → 문서 승격.

## T1. 판단 표와 격리 결과 테스트 (/tdd)

- `app/src/main/prototypeScript.test.ts` "in a real DOM"에 다음을 더한다.
  - 프레임 배경 표기별로 `html`의 `data-doan-proto-clear` 유무를 확인하는 표: `transparent`, `rgba(0,0,0,0)`, `rgb(255,255,255)`, `rgba(0,0,0,.5)`, `oklch(0.5 0.1 200 / 0)`, `color(srgb 1 1 1 / 0%)`, 배경색 없이 `linear-gradient`.
  - 자체 배경이 있는 프레임: `html`·`body`·중간 조상의 계산값 `background-image: none`, `background-color: rgba(0, 0, 0, 0)`, `box-shadow: none`, `outline-style: none`. 프레임 자신의 배경·`border-radius`·`box-shadow`는 그대로다.
  - 자체 배경이 없는 프레임: 조상의 배경·그림자가 그대로다.
  - 두 경우 모두 조상 `::before`·`::after`의 계산값 `display: none`, 프레임 자신의 `::before`는 그대로다.
- fake document 테스트 "resolving and isolating the frame"에 새 시트 규칙 텍스트를 확인하는 단언을 더한다.
- `app/src/main/exportViewer.test.ts`: `isolate.js`의 판단 함수 본문이 `prototypeScript.ts`와 같은지 비교하는 테스트를 더하고, srcdoc 실제 DOM에서 같은 표 일부(투명/불투명/그라디언트)와 조상 칠 제거를 확인한다.
- 검증: `npm --prefix app test`에서 새 테스트가 빨갛게 실패한다(구현 전).
- **커밋 경계**: `test: pin prototype isolation clearing ancestor paint`

## T2. 두 스크립트 구현 (/implement)

- `prototypeScript.ts`와 `isolate.js`의 `isolate`에 판단 함수, `data-doan-proto-clear` 부여, 시트 규칙 두 개를 같은 글자로 더한다. 주석에는 "왜"만 영어로 쓴다(`docs/features/`를 인용하지 않는다).
- 검증: `npm --prefix app test` 통과, `npm --prefix app run typecheck`·`npm --prefix app run lint` 통과.
- **커밋 경계**: `fix(prototype): paint only the frame while playing`

## T3. 전체 게이트

- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.

## T4. color-scheme 확인 (PoC)

- T1의 실제 DOM 테스트에 `:root { color-scheme: dark }` 캔버스를 하나 더해, 칠을 지운 뒤 iframe이 투명한지(호스트 색이 보이는지) 확인한다. Electron DOM 하네스의 호스트가 `color-scheme: light`인지 먼저 확인한다.
- 불투명하게 남으면 단언을 "남는다"로 고정하고, T6에서 ARCHITECTURE에 한계로 적는다.
- 검증: `npm --prefix app test` 결과와 관찰을 커밋 메시지에 남긴다.
- **커밋 경계**: T1 또는 T2 커밋에 포함한다.

## T5. 실제 앱 확인 (/runtime-test)

- 격리된 dev 앱(AGENTS.md 'Commands'의 `DOAN_CLI=… npm --prefix app run dev -- -- --user-data-dir=<tmp>`, 임시 HOME·SHELL)에 임시 저장소를 열고, `border-radius: 24px`인 흰 프레임과 gray-800 `body`를 가진 캔버스를 fit 모드로 재생한다. 모서리 바깥이 `.pw-box`의 흰색인지 스크린샷으로 확인한다. responsive 모드도 한 장 찍는다. 사용자 저장소(skillflo-web)는 열지 않는다.
- 같은 캔버스를 `go run ./cli/cmd/doan export --frame <id> --prototype --repo <tmp>`로 내보내 Playwright Chromium으로 열고 모서리가 페이지 배경색인지 확인한다.
- 검증: 스크린샷 두 장 이상과 측정값을 `.scratch/runtime-test/`에 남긴다.

## T6. 문서 승격과 기능 문서 삭제

- `docs/PRODUCT.md` §5 item 2 'Prototype window' 'Content': 조상은 레이아웃·칠·의사 요소 없이 남고, 프레임에 자체 배경이 없을 때만 조상 배경이 보인다는 규칙을 현재 규칙으로 적는다.
- `docs/ARCHITECTURE.md` §3 'Prototype window' 'Rendering in place': `data-doan-proto-clear` 판단(한 번, 칠에만 쓰고 상자에는 쓰지 않음), 두 시트 규칙, 두 스크립트의 글자 고정을 적는다. T4 결과가 한계면 함께 적는다.
- `docs/features/prototype-frame-only/`를 삭제한다.
- 검증: `/doc-check` 대상 절을 직접 읽고 코드와 맞는지 확인한다(문서만 바뀌므로 게이트는 대상 확인으로 충분하다).
- **커밋 경계**: `docs(PRODUCT): …`, `docs(ARCHITECTURE): …`, `docs(feature): remove prototype-frame-only`를 문서별로 나눈다.
