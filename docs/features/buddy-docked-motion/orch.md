# buddy-docked-motion — orchestrate

- 기준: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md). 체인 [chain-261111](../chain-261111/chain.md) 링크 2.
- 시작 hash: `e37a35fb` (origin/develop)
- 통합 브랜치: `feat/buddy-docked-motion` (lead가 만듦, worktree `buddy-docked-motion-orch`)
- conductor 런타임: Claude Code. 워커도 Claude만 쓴다(모델 계열 넘기 없음).
- tasks 1(초안)은 develop에서 끝났다. 이 run은 tasks 2부터다.

## 결정 기록

| # | 내용 | 근거 |
|---|---|---|
| D1 | 링크 목표(체인 전체 사용자 결정): 시각적 drift 없이 렌더링 비용을 줄이고 PR 본문에 전후 수치를 남긴다. 움직이는 동안 LOD는 허용하고 멈춘 화면은 픽셀이 같아야 한다. ARCHITECTURE §3 렌더링 규칙을 바꿔야 하면 사용자에게 먼저 묻는다 | chain.md 인계 기록 2026-11-11 |
| D2 | 이 링크의 '전'은 버디가 없는 develop(`e37a35fb`)의 workspace(캔버스 페이지·Overview), '후'는 버디가 붙은 통합 HEAD다. 같은 조건에서 쉬는 상태와 대화 패널 입력 중의 프레임 비용(rAF 횟수, 메인 스레드 시간, GPU 프로세스 메모리)을 잰다. 버디 자체의 최적화(보이지 않을 때·Overview에서 쉬는 동안 rAF 정지, App 렌더와 무관한 자체 rAF)는 B에서 넣는다 | conductor 판단 — design '소유와 생명주기'와 링크 1 인계(host가 쉬는 동안 App을 최대 1Hz로만 렌더) |
| D3 | 버디 애니메이션은 App 렌더에 의존하지 않는다. 셸이 자기 rAF로 그리고, App/React는 상태 기계 입력이 바뀔 때만 셸에 넘긴다. 창이 숨으면(`document.hidden`) rAF를 멈춘다 | conductor 판단 — lead 브리프(링크 1 병합 결과), design '소유와 생명주기' |
| D4 | probe에서 버디를 멈추거나 숨기는 방법을 B가 만든다면 테스트 전용 훅이 아니라 이미 있는 신호(reduced motion, 창 숨김, 캡처 중 감추기 클래스)로 한다. 새 설정·preferences 키는 만들지 않는다(spec 비목표) | conductor 판단 — spec '비목표' |
| D5 | 새 모듈 이름은 A가 `/tdd`에서 정한다 | design '영향 범위' |

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort, 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | tasks 2, 3, 4 | `app/scripts/dockedBuddyGolden.mjs`, 새 golden JSON, 새 순수 모듈과 테스트(`app/src/renderer/` 아래), AGENTS.md 'Commands' 한 줄(따로 커밋) | 없음 | Opus high — golden 비트 일치와 상태 기계 우선순위가 틀리면 이후 배치가 모두 어긋난다 | tasks 2·3·4 확인 항목, `npm --prefix app run typecheck`·`lint`·`test`, 두 golden `--check` | 통합 `f113420a` |
| RA | A 리뷰 | 없음(보고만) | A | Opus high — 상태 기계와 golden 비교 범위 판단 | `/code-review` 🔴 0 | 대기 |
| B | tasks 5, 6, 7 | 새 DOM·WebGL 셸 모듈과 테스트, `DockedComposer.tsx`, `CanvasTools.tsx`, `App.tsx`, `styles.css`, 관련 테스트, `docs/DESIGN.md`(design-sync 측정) | A 통합 | Opus high — WebGL 컨텍스트 생명주기, StrictMode, portal z-index, 렌더 비용 | tasks 5·6·7 확인 항목, 위 앱 게이트, `/design-sync` | 대기 |
| RB | B 리뷰 | 없음(보고만) | B | Opus high — 생명주기·레이어·성능 회귀 | `/code-review` 🔴 0 | 대기 |
| M | tasks 8, 전후 측정(D2), 링크 3 인계 측정 | `.scratch/`만(보고만) | B 통합 | Opus medium — 정해진 probe 목록을 돌리고 측정값만 적는다 | 항목별 통과·실패, 측정 원본 `.scratch/` | 대기 |
| C | tasks 9, 10 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md`, README 확인, 이 디렉터리 삭제 | M | conductor | `verify: PASS`, tasks 10 확인 항목 | 대기 |

## 순서와 겹침

- 직렬: A → RA → B → RB → M → C. B는 A의 코어 인터페이스를 쓰고, M은 붙은 앱을 잰다. 병렬로 돌릴 배치가 없다.
- 겹침: A와 B는 파일이 겹치지 않지만 B가 A의 모듈을 import한다. `docs/DESIGN.md`는 B(측정)와 C(정리)가 쓰는데 시점이 다르다.
- GUI probe: B의 `/design-sync`, M의 `/runtime-test`만 있다. 동시에 돌지 않는다.

## 진행 기록
- A 완료(`d842b9ec`, `8e342094`, `f1d372cc` red, `a7ec3828`, 미통합). 모듈 이름: `dockedBuddyCore.ts`, `dockedBuddyShader.ts`, `dockedBuddyHit.ts`, golden `dockedBuddy.golden.json`(27 시나리오, 1.5 MB). typecheck·lint·test(10277)·두 golden `--check` 통과를 워커가 보고했다.
- D6(conductor 판단 — spec 결정 10과 design 'reduced motion: 표면과 숨김 변화는 즉시'): 초안 `settle()`이 시간이 멈춘 동안 클릭으로 간 툴바 방문을 forced로 바꾸지 않아, 큐가 끝나도 입력창으로 돌아오지 않는다. 초안·golden·코어를 함께 고친다(A2).
- A2 시작: 이전 워커 터미널은 재사용할 수 없어(`agent_unconfigured`) release하고, 같은 worktree에 새 워커(Opus high, `ctx_c10387e1951a`)를 띄웠다.
- A2 완료(`77495c4e`): 초안·코어 `settle()` 수정, golden 시나리오 `reducedVisit`·`hiddenVisit` 추가, 테스트 10280개 통과.
- RA(Opus high) 완료: 🔴 0, 🟡 3(rAF를 멈춰도 되는지 알리는 출력 없음, 버디 교체 API 없음, 우선순위 쌍 6개 테스트 없음), ⚪ 5. 근거 `bdm-a/.scratch/review-A.md`. golden·`--check` 변형 확인을 리뷰어가 다시 했다.
- A3 시작(`ctx_a7d21d44f0c3`): 🟡 1–3과 ⚪1(머리 주석)을 순수 모듈에서 고친다. golden은 바뀌지 않아야 한다.
- A3 완료: `dockedNeedsTime`, `setDockedBuddy`, 우선순위 쌍 테스트 6개, 머리 주석(테스트 10290개 통과). 변형 확인으로 새 테스트가 red가 되는 것을 워커가 확인했다.
- **A 통합**: `c830e99b`..`f113420a`(cherry-pick 7개). 통합 HEAD에서 두 golden `--check` 0, typecheck 0, dockedBuddy 테스트 79개 통과. bdm-a worktree 삭제, 브랜치 `SinhyeokKang/bdm-a`(`f4528051`)는 로컬·원격에 남김.
- B 시작(`ctx_d4926c34f8c6`, worktree `bdm-b`, Opus high).
- lead 알림: PR #166이 `closeToolbarTooltip`을 `forwardEscape`로 바꾼다. B에 그 메서드와 non-bubbling Esc에 기대지 말라고 전했다. #166 병합 뒤 lead 지시로 origin/develop을 병합한다.
- B 완료(`31fa5976`, `6bc4b9d0`, `1076336b`, `111701d4`, 미통합): 셸·연결·design-sync. 테스트 10316개, design-sync 300행 불일치 0(근거 `bdm-b/.scratch/design-sync/buddy-docked/`).
- RB(Opus high) 완료: 🔴 0, 🟡 4(Select 도구에서 툴바 버디 클릭이 보드로 감, Jump to latest 위에 그려짐, 텍스처 전 컨텍스트 손실, 매 프레임 문서 전체 querySelectorAll), ⚪ 7. 근거 `.scratch/review-B.md`.
- 사용자 결정 A: 터미널 세션 패널은 docked 카드가 입력을 받으므로 버디가 카드에 선다(spec 결정 9의 "터미널 세션 패널" 문구는 task 10에서 고친다).
- 사용자 결정 B: 캔버스 패널의 ResumeChoice 카드와 Overview의 moved 안내도 추천 프롬프트처럼 비켜줄 이유다.
- 쉼 판정은 PRODUCT §5 item 2 'Following'의 쉼(보드 위 포인터·타이핑 포함)을 그대로 쓴다. design의 "보드 위 포인터는 렌더러가 보지 못한다"는 사실과 달라 task 10에서 버린다(RB ⚪6, conductor 판단).
- B2 시작(`ctx_8197f6d0132b`): 🟡 1–4, 결정 B, ⚪ 1–5.
- B2 완료(`7eea201d`, `c5940643`): clip-path 실루엣 히트 요소, Jump to latest z 3, 손실 뒤 텍스처, 떠 있는 요소 목록 캐시, ⚪1·3·4·5, 결정 B(`data-notice`). 테스트 10319개, design-sync 재측정 305행 불일치 0. ⚪4는 사람 입력 뒤 1초 안의 스크롤만 쉼을 끝낸다(conductor 판단 — PRODUCT의 쉼은 사람의 움직임만 센다).
