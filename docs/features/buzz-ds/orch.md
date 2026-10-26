# buzz-ds 지휘 — 2026-10-26

- 원본: [spec.md](./spec.md), [design.md](./design.md), [tasks.md](./tasks.md). 부모는 [buzz-restyle](../buzz-restyle/design.md)이다.
- 시작: `2c4b049`(main)에서 `feat-buzz-ds`를 만들었다. 이 브랜치가 통합 대상이다.
- Buzz 기준 커밋: `~/code/buzz-app` HEAD `c40dfdf4c81aabe759f3a4329c3e77f854746a59`(2026-10-26 지휘자 확인). 기준 커밋과 같으므로 워커는 작업 트리 파일을 읽어도 된다. clone은 읽기 전용이다.
- 지휘자는 batch 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋, A10 결론 승격이다.

## 결정 기록

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-26 | `/ship bypass` 대신 `/orchestrate`로 진행한다. S1~S4 구분과 task 순서는 그대로 둔다 | 사용자 |
| 2026-10-26 | A5 초안을 그린 뒤 지휘자 검토를 거쳐 사용자 확인을 받을 때까지 S3를 시작하지 않는다 | 사용자 |
| 2026-10-26 | 워커와 리뷰어는 Claude 모델만 쓴다 | AGENTS.md 'Runtime differences' 모델 경계 |
| 2026-10-26 | 단계마다 batch 하나, 모두 직렬이다. S1·S3·S4가 모두 `styles.css`·e2e 고정값을 건드리고, S2는 S1의 `tokens.css`를 링크하며, S3은 S2 초안에 맞춘다 | 지휘자 판단 — 파일 겹침과 선행 관계 |
| 2026-10-26 | A1·A2의 순수 함수 파일은 design.md의 가칭대로 `app/src/renderer/ds/checks.ts`(테스트는 같은 폴더 관례를 따름)로 둔다 | 지휘자 판단 — design.md '순수 함수로 분리할 부분' |
| 2026-10-26 | 비텍스트 3:1은 `border-prominent`, 포커스 링, 핀에만 적용한다. hairline과 입력 필드 채움 경계는 예외다(R1 🟡3) | 사용자 |
| 2026-10-26 | R1의 🟡1(다이얼로그 상단 8rem), 🟡2(`--raised` 등 남은 별칭의 역할 대응), 🟡3 반영, ⚪1(팔레트를 가리키는 별칭), ⚪6(Buzz 주석을 바꿔 쓴 주석)은 B3 brief에 넣는다. S1 파일이지만 A6·A7이 같은 파일을 다시 고치므로 수정 라운드를 따로 두지 않는다 | 지휘자 판단 — 중간 상태는 부모 공통 결정 12로 허용, 배포 없음 |
| 2026-10-26 | 공유 다이얼로그 크기: SetUpFolderConfirm(`.ob-dialog` 확인) compact 가운데, ProjectSetupDialog·AddProjectsDialog standard 상단 8rem. 초안 확인에서 사용자가 바꿀 수 있다 | 지휘자 판단 — B2 질문, compact는 짧은 확인, standard는 폼·목록 |
| 2026-10-26 | 토스트는 종류(type)를 새로 만들지 않는다. 성공·오류·실행 취소를 같은 무채색 floating 토스트로 그리고 문구로만 구분한다 | 지휘자 판단 — spec '내용과 동작은 그대로' |
| 2026-10-26 | 초안은 디자인 시스템 결정을 확인하는 대표 프레임 10개만 그린다(design.md '초안 요청'). 나머지 프레임과 공유 요소 초안은 각 화면 자식 feature가 구체화한다. A8은 `/design-sync` 없이 e2e로 확인한다 | 사용자 |
| 2026-10-26 | 위 결정을 고친다: 초안은 파운데이션과 컴포넌트 프리미티브 17개 프레임을 그리고, 화면 단위인 `shared-*` 5개만 뺀다. 사용자는 앞의 축소를 페이지 단위 축소로 생각했다. 토스트 판단(종류 없음)은 다시 유효하고, 공유 다이얼로그 크기 배정은 화면 자식으로 넘어간다 | 사용자 |
| 2026-10-26 | 위 두 축소를 모두 되돌린다. 초안은 처음 '초안 요청'의 22개 프레임(`shared-*` 포함)을 그린다. 앞서 정한 공유 다이얼로그 크기 배정과 토스트 판단이 다시 유효하다 | 사용자 |
| 2026-10-26 | A10(결론 승격과 `docs/features/buzz-ds/` 삭제)은 지휘자가 통합 뒤 직접 한다 | orchestrate 스킬 §5 |

## batch 표

| batch | 항목 | 파일 소유권 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | S1 = A1~A4 | `app/src/renderer/ds/`(새로), `app/src/renderer/tokens.css`, `styles.css`·`settings.css`의 `color-scheme`·`@import`·`@theme`, `app/src/main/index.ts`의 `themeSource`·`backgroundColor`와 그 테스트, 움직인 e2e 고정값 | 없음 | Opus high — APCA 식 구현, 토큰 역할 설계, 캔버스 iframe 색 선호 확인처럼 판단이 많고 틀리면 이후 모든 자식이 흔들린다 | tasks.md A1~A4 검증 전부(`npm --prefix app test`, typecheck, build, e2e 최종 PASS, `doan check --repo .` 정의되지 않은 변수 0, `dev-css.mjs`) | 통합(3572410·c8bef11·5198670·7032c32). e2e 최종 PASS 미검증(아래) |
| R1 | B1 리뷰 | 읽기 전용, `.scratch/review-B1.md` | B1 | Opus high — 토큰 구조와 대비 계산 검토 | `/code-review` 보고, 🔴 0 | 완료 — 🔴 0 🟡 3 |
| B2 | S2 = A5 | `design/buzz-ds.html`만 | B1 통합 | Opus medium — 프레임 22개 초안, 컨벤션은 정해져 있고 값은 S1 토큰에서 온다 | `doan check --repo .`에서 `design/buzz-ds.html` 오류 0, `doan ls --json`의 프레임 id가 '초안 요청'과 같음. 지휘자 초안 검토 → 사용자 확인 | 커밋 1c1a6b0(worktree `buzz-ds-b2`), 지휘자 검토 통과, 사용자 확인 대기 |
| B3 | S3 = A6~A8 | `app/src/renderer/**`(styles·settings·connectionRows CSS, `ds/`, 공용·공유 컴포넌트 TSX, `CommentPins.ts`), `app/e2e/*`, `/design-sync` 산출물. `design/` 초안은 고치지 않는다 | B2 사용자 확인 | Opus high — 셀렉터 60여 줄 대응, 공용 컴포넌트, 모션·포커스, design-sync 실측 | tasks.md A6~A8 검증 전부, `/design-sync` 두 번 | 대기 |
| R3 | B3 리뷰 | 읽기 전용, `.scratch/review-B3.md` | B3 | Opus high — 넓은 CSS 변경과 cascade 함정 | `/code-review` 보고, 🔴 0 | 대기 |
| B4 | S4 = A9 | `docs/DESIGN.md`만 | B3 통합 | Opus medium — 실측값 정리와 'UX audit recovery update' 재측정 | `grep -c 'buzz-ds 이전' docs/DESIGN.md` > 0, 절 위치, `verify.mjs --runtime` 통과 | 대기 |
| C | S4 = A10 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, `docs/features/buzz-ds/` 삭제 | B4 통합 | 지휘자 | tasks.md A10 검증 | 대기 |

모든 tasks 항목(A1~A10)이 위 행 하나에 속한다. 겹치는 파일이 있어 병렬 batch는 없다. 각 batch는 `feat-buzz-ds`에서 갈라진 child worktree에서 돌고, 지휘자가 cherry-pick으로 통합한다.

## 진행 기록

- 2026-10-26: orch.md 작성, `feat-buzz-ds` 생성.
- 2026-10-26: B1(Opus high, worktree `buzz-ds-b1`) 완료 보고 outcome failed — 커밋 902cda6·20458a9·f07ab36·646b446, e2e 최종 PASS 없음(comments-ui `08-hidden-quit-close` 포커스 대기 시간 초과 두 번). 실제 `/Applications/doan.app`이 실제 userData의 `ui-state.json`을 바꿔 첫 e2e가 멈췄고, 사용자 승인으로 지휘자가 정상 종료했다. B1 터미널 release.
- 2026-10-26: 지휘자 e2e 재현(646b446, R1 동시 실행 중) 실패 — comments-ui `:191` notice 개수 비교(기다림 없는 단언). 부하 없는 재실행 진행.
- 2026-10-26: R1(Opus high) 리뷰 — 🔴 0, 🟡 3, ⚪ 7. 보고서는 지휘자 `.scratch/review-B1.md`. R1 터미널 release.
- 2026-10-26: e2e 판정 — 부하 없는 재실행(646b446)도 comments-ui `08-hidden-quit-close`(`comments-ui.ts:566`, `window.isFocused()` 대기)에서 실패했다. main과 같은 앱 코드(지휘자 체크아웃)로 돌린 전체 e2e는 comments-ui `:191`(기다림 없는 notice 단언)에서, comments-ui 단독 실행 두 번은 각각 `:566`과 `:191`에서 실패했다. 두 실패는 B1 이전부터 있다. B1 코드에서 comments-ui 뒤 suite 10개(onboarding~settings)를 하나씩 따로 돌려 모두 PASS했다(참고 근거, 공식 게이트 아님. 로그: `buzz-ds-b1/.scratch/conductor/`). 사용자가 자리를 비운 동안 화면 잠금으로 창 포커스를 받지 못했을 가능성이 있다(추론). 전체 e2e 최종 PASS는 사용자가 돌아온 뒤 다시 확인한다.
- 2026-10-26: B1 통합. 통합 HEAD에서 `verify.mjs`는 계획된 `accentPlaces` red(A6에서 green)로 app-test에서 멈췄다(1 failed / 3064 passed). typecheck·build·`go test ./...` 통과, `doan check --repo .` 12개 캔버스 오류 0 경고 6(기존 `design/mock.css`).
- 2026-10-26: B2(Opus medium) 완료 — `design/buzz-ds.html` 22개 프레임과 `design/mock.css` 예시 색 6개, 커밋 1c1a6b0. 작업 중 범위 지시가 10개 → 17개 → 22개로 바뀌었고 최종본은 22개다. B2 터미널 release.
- 2026-10-26: 지휘자 초안 검토 — 지휘자가 다시 실행한 `doan check`: 캔버스 13, 오류 0, 경고 12(새 경고 6은 모두 `mock.css` hardcoded_color). `doan ls`: `buzz-ds` 1200px, 프레임 22개가 순서까지 같다. 초안 안에 hex·rgb·oklch 0건, 옛 별칭 사용 0건, `buzz`는 canvas id와 feature 이름에만 있다. 격리 dev 앱 스크린샷 23장(`buzz-ds-b2/.scratch/buzz-ds/draft/`)으로 buttons, menu·tooltip, dialog-anatomy, canvas-marks, accent-places, shared-project-setup을 확인했다. 발견: (1) 어두운 캔버스에서 프레임 점프 표시(2px `border-focus` + 반투명 검정 링)가 거의 보이지 않는다 — 사용자 결정 필요. (2) `shared-project-setup` Running 타일에서 Token CSS 경로가 `tokens.cs`/`s`로 글자 중간에서 줄바꿈된다 — 초안 수정. (3) 문서에 없던 시각 선택(행 안 액션 sm 32px, `.ob-card` → 설정 그룹, `.ob-chip` → 상태 pill, `.ob-msg` → 왼쪽 2px 선, 토스트 메시지 위·액션 아래, 다이얼로그 Close 버튼 없음)은 사용자 확인 대상으로 올린다.
- 2026-10-26: 지휘자가 레퍼런스 clone(`c40dfdf4`)과 직접 대조했다(사용자 요청). 같음: 토큰 공통 이름 119개의 라이트 값(rem↔px, 간접 참조 차이만), 타입 역할 8개, 버튼·아이콘 버튼 크기와 채움, 입력 필드, 툴팁, floating·메뉴 행, 다이얼로그 크기·패딩·모서리·모션, 토스트 폭·inset, 설정 그룹(`.ob-card`). 다름: 다이얼로그 위치(ds CSS는 가운데, R1 🟡1, 초안은 레퍼런스대로), instant 툴팁 모션, 강조된 메뉴 행의 보조 텍스트, 토스트 종류별 제목 색과 닫기 버튼(종류 없음 결정), 포커스 링 색(`border-focus` neutral-12 대 `text-standard`). 레퍼런스 근거 없음: 초안의 `.ob-chip` 상태 pill, `.ob-msg` 왼쪽 2px 선(레퍼런스의 필드 오류는 body-sm `text-danger` 글자만). 코드 구조: ds CSS의 버튼·툴팁·floating·다이얼로그·입력 블록이 레퍼런스 블록과 선언 집합·순서가 거의 같고 접두어만 다르다(R1 ⚪6 확장).
