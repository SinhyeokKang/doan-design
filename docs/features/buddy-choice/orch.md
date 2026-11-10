# 버디 선택 — orchestrate

- 계획: [tasks.md](./tasks.md) 2·3단계와 4.1. 근거 문서: [spec.md](./spec.md), [design.md](./design.md).
- 시작 hash: `72a68b57` (origin/develop와 같음)
- 통합 브랜치: `feat/buddy-choice` (lead가 만들었다. conductor는 브랜치를 만들거나 바꾸지 않는다)
- 워커 worktree: `--worktree new-child --base-branch feat/buddy-choice`

## 결정 로그

- lead 브리프로 받은 결정(다시 묻지 않음): golden 정본 `.doan/assets/buddies/motion-preview.js`와 생성기 `app/scripts/doanyGolden.mjs`, broken notice는 버디 화면 셋 모두, 기존 사용자용 버디 화면은 첫 실행처럼 잠그고 `buddy` 키가 없을 때만 띄움, `.side .row`는 violet 예외로 둠, `/design-sync` 대상은 Welcome·Buddy 단계·기존 사용자용 버디 화면·Settings General, 3.7의 무서명 dmg 명령은 그 확인에만 승인, Welcome 사진은 상한 없이 커짐, 다크 모드 설치 디스크 라벨은 안 보여도 됨.
- 모델: 구현 워커는 Claude. 독립 리뷰 워커(`/code-review`)만 Codex `gpt-6.1-sol`로 돌리고 보고만 한다(사용자가 허락한 유일한 교차).
- B를 A와 병렬로 돌린다 — conductor 판단. B가 고치는 파일은 A와 겹치지 않는다. B가 A에 기대는 것은 `data-buddy` 속성 이름뿐이고, 이 이름은 design.md에 이미 정해져 있다. 3.4의 `/runtime-test`(`--buddy-9` 계산값)만 A 통합 뒤로 미룬다.
- `--hop-lift: 0`(`styles.css` `:root`)은 C가 쓴다 — conductor 판단, design.md '리그 일반화'. C는 A 통합 뒤에 시작하므로 `styles.css`가 겹치지 않는다.
- B가 `SettingsPage.tsx`의 `LEADS.general`과 `ShellSidebar.tsx`의 `SECTION_ICONS.general` 두 항목만 더한다 — conductor 판단. `general`을 추가하면 이 두 Record 때문에 typecheck가 깨진다. 본문은 D가 채운다.
- `--buddy-2`는 두지 않는다 — conductor 판단, design.md '전환층'의 'role이 실제로 읽는 단계만'. 2단계를 읽는 role(`--affordance-sidebar-hover`)은 violet에 남는다.
- B 리뷰부터 Codex를 쓰지 않고 리뷰 워커도 모두 Claude로 돌린다 — 사용자 결정. Codex 리뷰 워커가 B 리뷰 도중 사용량 한도에 걸렸다.
- 4.1(승격과 삭제)은 conductor가 통합 뒤 직접 한다(문서 커밋).

## 배치

| 배치 | task | 소유 파일 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | 2.1, 2.2, 2.3 | `tokens.css`, `styles.css`의 role·accent 규칙, `ds/controls.css`, `ds/checks.ts`·`ds/checks.test.ts` | 없음 | Opus high — 대비 검사 일반화와 Accent places 배정을 판단해야 하고, 틀리면 모든 화면 색이 틀린다 | `npm --prefix app test`, typecheck, 2.3 `/runtime-test` | 통합 `65fc96ce` |
| B | 3.1, 3.4 | `buddies.ts`, `preferences.ts`, `onboardingScene.ts`, `settingsSections.ts`, `index.ts`(창 쿼리), `App.tsx`의 `data-buddy` 적용과 그 테스트 | 없음(3.4 runtime 확인만 A 뒤) | Opus high — preferences 읽기 규칙 예외, 첫 페인트, 저장 응답 순서는 회귀 이력이 있는 영역이다 | `npm --prefix app test`, typecheck | 대기 |
| C | 3.2, 3.3 | `public/buddies/<id>/`·`public/buddies/eye.png`·`public/buddies/doany/`, `public/doany/README.md`, `Doany.tsx`(→ Buddy), `doanyRig.ts`, `doanyMotion.ts`, `doany.golden.json`, `app/scripts/doanyGolden.mjs`, `doany*.test.ts(x)`, `.doan/assets/buddies/motion-preview.js`, `styles.css` `:root`의 `--hop-lift`와 그림자 규칙 | A, B | Opus high — 셰이더 템플릿, golden 생성기, 텍스처 계약 순서까지 바이트 단위로 맞춰야 한다 | test, build, golden 재생성 무차이, `/runtime-test` 녹화(사람 확인) | 대기 |
| D | 3.5, 3.6 | `Onboarding.tsx`, `Onboarding.test.tsx`, Settings 페이지, `ShellSidebar.tsx`, `CanvasAgent.tsx`, `HomeComposerView.tsx`, `styles.css`의 Welcome·선택 카드 규칙, `public/buddies/group/`, `public/onboarding-grain.svg`(삭제), `ds/checks.test.ts`의 `violetAllowed`, 기존 사용자용 화면의 main 판단·잠금 경로 | C | Opus high — 화면이 가장 많고 잠금·포커스·저장 실패 상태가 얽혀 있다 | test, typecheck, `/design-sync` 4화면, `/runtime-test` | 대기 |
| E | 3.7 | `app/resources/installer-background*.png`, `app/package.json` `build.dmg` | 없음 | Sonnet medium — 캔버스 배경을 내보내고 좌표를 바꾸는 기계적 작업이다 | 크기 확인, 무서명 dmg 스크린샷 | 통합 `17f86b30` |
| 리뷰 | 배치마다 | 보고만 | 배치 완료 | A·E는 Codex `gpt-6.1-sol` medium으로 했다. B부터는 Claude Opus high(사용자 결정, 아래) | 🔴 0 | — |
| 4.1 | 4.1 | PRODUCT, ARCHITECTURE, AGENTS 'Commands', BACKLOG, DESIGN, DIRECTORY, 두 README, 이 디렉터리 삭제 | 전부 | conductor | `rg` 0건, verify 통과 | 대기 |

## 겹침과 순서

- 1차: A, B, E 병렬(파일 겹침 없음).
- 2차: C — A·B 통합 뒤(`styles.css`, 레지스트리).
- 3차: D — C 통합 뒤(`styles.css`, `ds/checks.test.ts`, `CanvasAgent`·Home이 `Buddy` 컴포넌트를 씀).
- GUI probe(`/runtime-test`, `/design-sync`)는 한 번에 한 워커만 돌린다. 1차에서는 A의 2.3만 GUI를 쓴다. E의 dmg 확인은 A의 2.3과 겹치지 않게 conductor가 순서를 정한다.

## 검토와 통합 기록

- Run `run_d5ce9794a770`. 1차 워커: A `ctx_d0e1ba0ddb89`(`buddy-accent`), B `ctx_94477bc9f9d6`(`buddy-registry`), E `ctx_652676da8d54`(`buddy-installer`). worktree는 `~/orca/workspaces/doan-design/<이름>`이다. 브리프는 conductor의 `.scratch/orch/`에 있다.
- Codex 리뷰 워커 첫 실행은 Codex 업데이트 프롬프트에 막혔다. lead가 codex-cli를 0.167.0으로 올린 뒤 다시 띄웠다.
- E: 리뷰 1회차 🔴 0·🟡 0. `b553929b`를 `17f86b30`으로 통합했다. dmg 창 콘텐츠는 640 × 536이고, 문장 하단이 Finder 경로 막대보다 위에 있다(워커 스크린샷, conductor도 확인).
- A: `33560211`. 2.3 probe 66건이 통과했다. 리뷰 1회차는 🔴 0·🟡 1이었다. 빠진 실측은 Send hover·pressed의 아이콘·스피너 색과 실제 턴의 Stop·Queue다. 수정 워커 `ctx_b3cac4b00964`에 보냈다(기존 터미널 재사용이 `agent_unconfigured`로 실패해 새로 띄웠다).
- A: 수정 1회차에서 빠진 실측 64건이 통과했다. Stop·Queue는 대화 IPC를 대체한 running turn으로 쟀다(conductor 승인, renderer·CSS는 실제 코드). 코드 변경이 없어 다시 리뷰하지 않고 `65fc96ce`로 통합했다.
- B: `04da0380`, `85993966`. Codex 리뷰가 사용량 한도로 멈춰 중단했고, Claude 리뷰 `ctx_02e64be312cd`로 다시 돌린다.
- B 리뷰(Claude)는 🔴 0·🟡 2·❓ 1이었다. `04da0380`·`85993966`을 `e43f7eb1`·`e44e6614`로 통합했다. ❓(기존 사용자용 버디 화면의 main 판단·IPC·잠금 담당)는 B 2라운드에 맡겼다 — conductor 판단, B가 `index.ts`와 preferences를 소유한다. App 잠금 연결과 App 테스트 16개의 스텁 한 줄도 B가 한다.
- 통합 HEAD `e44e6614`(A·B·E)에서 `verify.mjs`가 PASS다.
- C `ctx_6790d806da1a`(`buddy-rig`)를 띄웠다. 미뤄 둔 3.4 `/runtime-test`를 C가 먼저 돌려 통과했다. 콘텐츠가 처음 그려지는 rAF에서 `data-buddy`와 `--buddy-9`가 저장된 버디(popo, dori) 값이었고, 첫 로드와 재로드 모두 같았다.
- `public/buddies/`는 손실 없는 PNG로 두고 크기 상한을 3 MB에서 5 MB로 올린다 — 사용자 결정. oxipng를 적용해도 4.90 MB였다. pngquant 안(2.03 MB, PSNR 44–52 dB)은 쓰지 않는다. 4.1에서 BACKLOG·DESIGN에 반영할 것은 없다.
- C 3.3 녹화 다섯 개를 사람이 보고 진행하라고 했다("ㄱㄱ").
- C: `00891efc`·`ce50e190`을 `a9300dff`·`15f0dd58`로 통합했다. 리뷰(Claude)는 🔴 0이었다. golden `--check`가 일치하고, golden 차이는 tasks 3.3이 말한 네 가지뿐이다. tasks 3.2의 상한은 5 MB로 고쳤다.
- C 3.3 녹화: 사람이 다섯 녹화가 모션 미리보기와 "같아 보인다"고 판정했다.
- 단체 사진 앱 사본(oxipng 무손실, 약 1.76 MB)은 `public/buddies/` 5 MB 상한에서 뺀다 — conductor 판단. 그 상한은 버디 레이어를 두고 정한 값이고, 사진 위치는 design.md 대로 `public/buddies/group/`이다.
- Welcome 사진 너비는 창 너비의 1.4배를 넘지 않는다 — 사용자 결정. 상한 없음과 다섯 버디 눈이 보인다는 조건이 충돌했다. 그보다 높은 창에서는 사진이 아래 가장자리에 붙은 채 남고, 글자 묶음과의 간격이 넓어진다.
- 트랙패드(사람 확인): 한 번 스와이프, 양끝에서 멈춤, 세로 스크롤은 괜찮았다. 빠른 두 번 스와이프는 "걸린다". 가로 스크롤은 연속 스크롤 뒤 가장 가까운 카드에 붙는 방식으로 바꾼다 — 사용자 결정. spec 11과 design.md를 고쳤다.
- 트랙패드 결함: 커서를 움직이지 않으면 두 번째 스와이프가 먹지 않는다(사람 관찰). 원인을 확인하고 고친 뒤 conductor가 `/postmortem`으로 docs/POSTMORTEM.md에 남긴다 — 사람 요청.
- 트랙패드 3차(사람 확인): 커서를 움직이지 않고 이어서 하는 스와이프, 한 번·두 번·긴 flick, 양끝, 세로 스크롤 모두 괜찮았다. 속도만 "좀 느리다"고 해서 빠르게 조정 중이다.
- 트랙패드 4차: 카드당 600px로 바꾼 느낌을 사람이 "좋다 지금"이라고 했다.
- 방향키: Tab으로 카드 줄에 들어간 뒤 동작한다(사람 확인). 설계대로 둔다 — 사용자 결정.
- 960 × 600에서 Buddy 단계 Continue가 35px 아래에 있었다. 낮은 창에서는 카드와 간격을 줄여 스크롤 없이 Continue가 보이게 한다 — 사용자 결정. 780 이상은 그대로다. D 리뷰 결과와 함께 수정 라운드로 보낸다.
- D 수정 라운드: 780 미만에서 Buddy 단계와 기존 사용자 화면이 600까지 줄어 960 × 600에서 스크롤이 없다(fit probe 47 PASS). newer 상태는 notice 때문에 스크롤이 남는다(600에서 111px, 780에서 27px). 스크롤을 허용한다 — 사용자 결정.
- D: 리뷰 1회차 🔴 0·🟡 2, 2회차 🔴 0·🟡 0. 커밋 10개(3.5, 3.6, design-sync·runtime 수정)를 `b707138e`까지 통합했다. broken·failed notice 상태의 창 크기는 재지 않았다. newer와 같이 스크롤을 허용하는 것으로 본다.
