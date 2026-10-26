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
| 2026-10-26 | A10(결론 승격과 `docs/features/buzz-ds/` 삭제)은 지휘자가 통합 뒤 직접 한다 | orchestrate 스킬 §5 |

## batch 표

| batch | 항목 | 파일 소유권 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| B1 | S1 = A1~A4 | `app/src/renderer/ds/`(새로), `app/src/renderer/tokens.css`, `styles.css`·`settings.css`의 `color-scheme`·`@import`·`@theme`, `app/src/main/index.ts`의 `themeSource`·`backgroundColor`와 그 테스트, 움직인 e2e 고정값 | 없음 | Opus high — APCA 식 구현, 토큰 역할 설계, 캔버스 iframe 색 선호 확인처럼 판단이 많고 틀리면 이후 모든 자식이 흔들린다 | tasks.md A1~A4 검증 전부(`npm --prefix app test`, typecheck, build, e2e 최종 PASS, `doan check --repo .` 정의되지 않은 변수 0, `dev-css.mjs`) | 준비 |
| R1 | B1 리뷰 | 읽기 전용, `.scratch/review-B1.md` | B1 | Opus high — 토큰 구조와 대비 계산 검토 | `/code-review` 보고, 🔴 0 | 대기 |
| B2 | S2 = A5 | `design/buzz-ds.html`만 | B1 통합 | Opus medium — 프레임 22개 초안, 컨벤션은 정해져 있고 값은 S1 토큰에서 온다 | `doan check --repo .`에서 `design/buzz-ds.html` 오류 0, `doan ls --json`의 프레임 id가 '초안 요청'과 같음. 지휘자 초안 검토 → 사용자 확인 | 대기 |
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
