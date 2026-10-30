# doan-mascot — orch

계획 출처: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md). 이 문서에는 배치 분할·결정·상태만 적는다.

- 시작 해시: `8604632a` (2026-10-31, main)
- 통합 브랜치: `feat-doan-mascot`
- 지휘자 체크아웃: `/Users/sinhyeok/code/doan-design`

## 결정 기록

| 날짜 | 결정 | 출처 |
|---|---|---|
| 2026-10-31 | 이 세션에서 Codex 작업자를 쓸 수 있다(모델 계열 교차). 구현은 Claude가 맡는다. Codex는 기계적 배치(BE)와 교차 리뷰를 맡는다 | 사용자("Codex 워커 허가"). 배분은 지휘자 판단이며, 사용자 선호(Claude 주 작업, Codex는 교차 리뷰와 일부 기계적 배치)를 따른다 |
| 2026-10-31 | P0 PoC는 지휘자가 끝냈다. 일반 file://와 asar 경로 모두 통과했고 `crossOrigin = "anonymous"`를 유지한다 | tasks P0 결과 |
| 2026-10-31 | Doany 스타일은 `styles.css`가 아니라 새 `doany.css`에 두고 `index.html`에서 `<link>`로 읽는다 | 지휘자 판단. BM(Doany 자체)과 BL(무대 배치, `styles.css`)이 같은 파일을 고치지 않게 해서 병렬로 돌린다. ARCHITECTURE §7 'Renderer styles'의 `connectionRows.css` 선례를 따른다 |
| 2026-10-31 | tasks의 commit 경계(A → T → C → S → U → E)는 배치 단위 커밋으로 바꾼다. 작업자 커밋마다 typecheck와 빌드가 통과해야 한다 | 지휘자 판단. 병렬 배치가 tasks의 경계를 나눠 갖는다 |
| 2026-10-31 | U1·U2 가운데 Doany 요소를 넣고 `typing()`·`hop()`을 연결하는 일은 BL의 '미룬 항목'이다. BM을 통합한 뒤 새 Task로 보낸다 | `/orchestrate` §0.4 |
| 2026-10-31 | V1(`/runtime-test`)과 V2(`/design-sync`)는 한 배치(BD)가 맡는다. 지휘자는 최종 통합 HEAD에서 짧은 probe만 다시 돌린다 | 지휘자 판단. 실제 앱을 띄우는 배치를 하나로 모아 GUI probe가 겹치지 않게 한다 |
| 2026-10-31 | `/design-sync`는 리디자인 예외로 돌린다. 이 자식은 부모 buzz-restyle에 C11로 등록돼 있다 | 사용자(feature-review), `8604632a` |
| 2026-10-31 | 아이콘 모양은 사용자가 직접 보고 확인한다. BE 작업자가 새 임시 경로에 복사본을 준비하면, 지휘자가 사용자에게 확인을 요청한다 | spec '앱 아이콘' |
| 2026-10-31 | probe 위치는 `.scratch/runtime-test/doan-mascot/`, 측정 위치는 `.scratch/design-sync/doan-mascot/`다. dev 측정도 격리 env와 `--user-data-dir`로 띄운다 | 지휘자 판단. `/runtime-test`·`/design-sync` 스킬의 위치 규칙을 따른다 |
| 2026-10-31 | `/agent-eval`은 해당하지 않는다 | spec '사용자'. CLI·MCP·스킬 출력이 그대로다 |
| 2026-10-31 | 부모 tasks C11 완료 표시와 디렉터리 삭제는 BZ에서 한다 | tasks Z2 |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| BM | A1, T0, T1, T4, C1, S1 | 새 `app/src/renderer/public/doany/**`, 새 `doanyMotion.ts`·`doanyRig.ts`·`Doany.tsx`·`doany.css`와 그 테스트·고정 JSON, `app/src/renderer/index.html`(`<link>` 한 줄), `.scratch/doan-mascot/golden.mjs` | — | Claude Opus high (시안과 비트 단위로 같아야 하는 포팅, vm 기대값 추출, WebGL 수명과 해제 순서. 틀리면 동작이 시안과 어긋나거나 컨텍스트가 샌다) | 구현 전 red 기록, tasks A1·T0·T1·T4·C1·S1 검증, `npm --prefix app test`, typecheck, build | 진행 중 |
| BL | T2, T3, U1·U2의 배치·포커스 부분 (미룬 항목: Doany 삽입과 `typing()`·`hop()` 연결) | 새 `stageInsets.ts`와 테스트, `onboardingView.ts`, `Onboarding.tsx`, `HomeComposerView.tsx`, `styles.css`, `Home.test.tsx`, `Onboarding.test.tsx`, `onboardingView` 테스트 | 미룬 항목은 BM 통합 뒤 | Claude Opus high (첫 실행 Tab 트랩 회귀가 POSTMORTEM에 있다. 기준 높이 측정과 추천 자리 유지가 입력창 위치 계약을 좌우한다) | 구현 전 red 기록, tasks T2·T3·U1·U2 검증, test, typecheck, build | 진행 중 |
| BE | A2, E1 | 새 `app/resources/icon.png`, `app/package.json`(`build.mac.icon`) | — | Codex `gpt-6.1-sol` medium (기계적: 이미지 축소, 설정 한 줄, 패키징 확인) | tasks A2·E1 검증(`git check-ignore`, `sips`, `npm --prefix app run package`, `Info.plist`), 새 임시 경로 복사본 준비 | 진행 중 |
| BD | V1, V2와 그 수정 | 위 배치들의 파일 수정, `.scratch/runtime-test/doan-mascot/`, `.scratch/design-sync/doan-mascot/`, `docs/DESIGN.md` | BM·BL(미룬 항목 포함)·BE 통합 | Claude Opus high (실제 앱 probe, 여러 높이 측정, 시안과의 차이 수정, 회귀 테스트) | V1 항목별 통과, V2 기록되지 않은 차이 0, `docs/DESIGN.md` 측정 기록 | 대기 |
| BZ | Z1, Z2 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, `.doan/assets/doany/README.md`, `docs/features/buzz-restyle/tasks.md`(C11), `docs/features/doan-mascot/` 삭제 | 모든 배치 | 지휘자 (`/verify`, 문서 승격 커밋) | `verify.mjs` exit 0, tasks Z1·Z2 grep·`ls` | 대기 |

P0(PoC)은 완료됐다.

리뷰 작업자(보고만): BM → Codex `gpt-6-astra` medium(교차 리뷰. 시안 대조와 WebGL 수명). BL → Codex `gpt-6-astra` medium. BE → Claude Sonnet medium(Codex 구현의 교차 리뷰). BD의 코드 수정 → Codex `gpt-6-astra` medium.

## 겹침과 순서

- 1차 병렬: BM, BL(미룬 항목 제외), BE. 세 배치는 고치는 파일이 겹치지 않고, 셋 다 GUI를 쓰지 않는다. BE의 패키징은 자기 워크트리의 `app/dist/`만 쓴다.
- BM 리뷰·통합 뒤에 BL 작업자에게 미룬 항목을 새 Task로 보낸다. 같은 작업자, 같은 워크트리이며 통합 브랜치를 rebase한 뒤 진행한다.
- BE 통합 뒤에 지휘자가 사용자에게 아이콘 확인을 요청한다. BD를 기다리지 않는다.
- BD는 BM·BL·BE를 모두 통합한 뒤 새 워크트리에서 시작한다. 실제 앱을 띄우는 배치는 BD 하나뿐이다.
- BZ 다음에 push와 PR을 한다. 병합하지 않는다.

## 진행 기록

- 2026-10-31: intake. P0를 마쳤고, 결정과 배치 표를 작성했다.
- 2026-10-31: Run `run_b9a812f71443`. BM(`ctx_dd00f2587f78`, Opus high, `doan-mascot-bm`), BL(`ctx_6a385f156e4d`, Opus high, `doan-mascot-bl`), BE(`ctx_1f33d33a6238`, Codex `gpt-6.1-sol` medium, `doan-mascot-be`)를 시작했다. 세 워크트리 모두 `69814ca4`에서 시작했고, `launch.effective`가 요청과 같다. 세 작업자 모두 브리프를 읽고 작업을 시작한 것을 터미널에서 확인했다.
