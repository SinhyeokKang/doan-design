# canvas-viewport-units — orch

- 계획: [spec](./spec.md) · [design](./design.md) · [tasks](./tasks.md)
- 시작 hash: `28b270c8` (main)
- 통합 브랜치: `feat/canvas-viewport-units`
- 지휘: Claude Code (Opus). 모델 교차: 사용자가 이 세션에서 Codex를 허가했다. 구현은 Claude, 독립 리뷰와 agent-eval은 Codex가 맡는다.

## 결정 로그

- D1 (지휘자 판단 — tasks Z1): `buzz-project-settings`의 dvh 값은 900px 창 기준으로 계산한 px로 바꾼다. 화면 모양을 유지하는 최소 수정만 하고 다른 내용은 건드리지 않는다.
- D2 (지휘자 판단 — design 'skills'): T3의 가이드 줄은 Go 배치(A)가, `loadingdone` 주입은 TS 배치(B)가 맡는다. 파일이 겹치지 않는다.
- D3 (지휘자 판단 — AGENTS 'Workflow'): T6 `/verify --eval`과 Z1의 문서 승격(ARCHITECTURE·BACKLOG, 디렉터리 삭제)은 지휘자가 통합 HEAD에서 한다. 캔버스 수정은 배치 C가 한다.
- D5 (사용자 결정, 배치 A 결과에서): `viewport_height_unit`은 캔버스 파일의 `<style>`·`style` 속성만 본다. 링크한 공유 스타일시트(앱 `ds/surfaces.css`의 `100dvh` 등)는 에이전트가 고칠 수 없는 제품 CSS라 경고하지 않는다. 가이드에 "링크한 CSS의 viewport 높이 단위는 캔버스에서 px로 덮어쓴다"를 더하고, `buzz-project-settings`의 `.doan-dialog[open]{max-height:none}`은 남긴다. spec·design·tasks에 반영했다.
- D6 (지휘자 판단 — 사용자 관찰 "ds 캔버스가 스크롤에 가려진다"): 배치 C의 runtime-test에 ds 캔버스(dialog·quick-open·project-settings·button) 측정을 더한다. ds 캔버스는 모두 Geist `@font-face`가 든 `tokens.css`를 링크하므로 폰트 경로(B)로 고쳐지는지 본다. `.doan/ds/dialog.html`의 expanded 다이얼로그는 링크한 `surfaces.css`의 `height: calc(100dvh - …)`를 덮어쓰지 않아 순환이 남는다. 잘리면 C가 캔버스에서 px로 덮어쓴다(D5의 가이드 규칙).
- D7 (사용자 결정, 오케스트레이션 중 추가 요청): 사이드바 캔버스는 마지막 수정 시각 내림차순으로 정렬한다. 두 그룹(Design system, Canvases) 모두다. 에이전트가 파일을 고치면 그 행이 바로 위로 옮겨지고, 키보드 포커스와 현재 캔버스는 같은 캔버스를 따라간다. mtime이 없거나 같으면 지금의 자연 정렬을 따른다. clone·pull 때 바뀐 mtime은 받아들인다(PRODUCT §3 Out of scope 6, Doan은 git 명령을 돌리지 않는다). 배치 E가 맡고, PRODUCT §5 item 1의 "natural order" 문장은 지휘자가 고친다.
- D8 (사용자 결정, 오케스트레이션 중 추가 요청): 추천 프롬프트 버튼을 한 단계 키우고, 문구는 지금의 명령형을 유지하되 사람이 실제로 칠 법한 자연스러운 말로 다듬고 짧게 둔다(요청 문장형은 사용자가 철회했다). 문구는 clarify 프리셋을 따른다. 초안 캔버스의 추천 프롬프트도 함께 바꾼다(초안은 결정을 따른다). 배치 F가 맡는다.
- D9 (사용자 결정, 오케스트레이션 중 추가 요청 — BACKLOG 'Marking canvases the person has not looked at'): 캔버스 행의 상태 자리에 '볼 것이 있다' 알림 dot을 띄운다. 대화 표시와 같은 맥락이고 같은 violet dot이다. 대상은 (1) 기존 대화 표시(권한 요청·작업 중·안 본 대화 끝), (2) 생겼지만 아직 안 본 캔버스, (3) 바뀌었지만 아직 안 본 캔버스다. '봤다'는 그 캔버스를 캔버스 페이지로 열었을 때이고, 열려 있는 동안의 변경도 본 것으로 친다. Overview 썸네일은 치지 않는다. 캔버스별 마지막으로 본 수정 시각을 기기별 앱 상태(userData)에 저장해 재시작 뒤에도 유지한다. 프로젝트를 처음 추가하거나 기능이 처음 들어간 뒤 처음 읽을 때 있던 캔버스는 본 것으로 친다. 배치 G가 맡는다.
- D10 (지휘자 판단 — PRODUCT §5 item 1 row slot 규칙): 캔버스 알림 dot의 자리와 우선순위는 대화 표시 규칙을 따른다. 대화 표시(권한 요청 > 작업 중 > 안 본 끝)가 있으면 그것이 이기고, 캔버스 행이 화면 밖(접힌 그룹·접힌 프로젝트)이면 프로젝트 행에 뜬다. 프로젝트 행의 캔버스 알림을 누르면 그 캔버스를 연다(여럿이면 가장 최근에 바뀐 것).
- D4 (지휘자 판단 — tasks T5): agent-eval은 `W1,W2`만 돌리고 새 시나리오는 두지 않는다.

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·effort와 이유 | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| A | T1, T3 중 가이드 줄 | `cli/internal/canvas/css.go`·테스트, `cli/internal/check/check.go`·테스트, `cli/internal/cli/skill.md`(+스킬 테스트) | 없음 | Claude Sonnet high — 기존 `hardcoded_color` 경로를 따르는 확장이지만 토크나이저 경계 케이스가 많다 | `go test ./...`, `go vet ./...`, `doan skill` 출력 확인 | 대기 |
| B | T2, T3 중 `loadingdone` 주입 | `app/src/main/canvasScript.ts`·`canvasScript.test.ts` | 없음 | Claude Opus high — 높이 고정 루프는 POSTMORTEM 진동 이력이 있어 틀리면 보드가 잘리거나 흔들린다 | `npm --prefix app test`, `npm --prefix app run typecheck` | 대기 |
| RA | A 리뷰 | 보고만 | A | Codex gpt-6-astra medium — 교차 모델 독립 리뷰 | `/code-review` 보고 | 대기 |
| RB | B 리뷰 | 보고만 | B | Codex gpt-6-astra medium — 교차 모델 독립 리뷰, 고정점 판단 | `/code-review` 보고 | 대기 |
| C | Z1 중 캔버스 수정, T4 `/runtime-test`(+ds 캔버스 D6, 사이드바 순서 D7, 추천 프롬프트 크기 D8, 알림 dot D9) | `.doan/canvases/buzz-project-settings.html`, `.doan/ds/dialog.html`(D6), `.scratch/` 픽스처 | A, B, E, F, G 통합 | Claude Opus medium — 실제 앱 격리 probe에 판단이 필요하다 | runtime-test 측정값·스크린샷, `doan check --repo .`에 `viewport_height_unit` 없음 | 대기 |
| D | T5 `/agent-eval` | `docs/USABILITY-EVAL.md` | A, B 통합 | Codex gpt-6.1-sol medium — 정해진 절차를 돌리는 작업 | `node eval/run.ts --self-test` PASS, W1·W2 라운드 기록 | 대기 |
| E | D7 사이드바 최신 수정순 | `app/src/renderer/ShellSidebar.tsx`·테스트, 비교 함수 파일 | 없음 | Claude Sonnet medium — 비교 함수 하나와 포커스 유지 테스트 | `npm --prefix app test`, typecheck | 대기 |
| F | D8 추천 프롬프트 크기·문구 | `homeComposer.ts`, `HomeComposerView.tsx`, `ProjectOverview.tsx`, `CanvasConversationPanel.tsx`, `styles.css`의 `.suggestion`, 관련 테스트, 초안 4개(buzz-home·buzz-project·buzz-canvas-conversation·doan-mascot) | 없음 | Claude Opus medium — UI 문구와 크기 판단, 여러 화면 | `npm --prefix app test`, typecheck, `doan check --repo .` | 대기 |
| RE·RF | E·F 리뷰 | 보고만 | E, F | Codex gpt-6-astra medium — 교차 모델 리뷰 | `/code-review` 보고 | 대기 |
| G | D9·D10 캔버스 알림 dot | 사이드바 row slot 계산·렌더, 본 상태 저장(main 상태 모듈), 캔버스 표시 시 본 처리, 테스트 | E | Claude Opus high — 상태 저장·재시작·첫 읽기 기준선 판단이 필요하고 틀리면 dot이 안 꺼지거나 전부 켜진다. 코딩 전 설계를 지휘자에게 ask로 받는다 | `npm --prefix app test`, typecheck | 대기 |
| 지휘자 | T6, Z1 문서 승격 | `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, 이 디렉터리 삭제 | C, D | — | `verify.mjs --eval` 통과 | 대기 |

## 겹침과 순서

- A와 B는 파일이 겹치지 않아 병렬로 돈다. E와 F도 A·B·서로와 파일이 겹치지 않아 병렬로 돈다. G는 E와 같은 `ShellSidebar.tsx`를 고치므로 E의 커밋 위에서 시작한다.
- C와 D는 A·B·E·F 통합 뒤에 병렬로 돈다. C는 GUI probe를, D는 패키지 빌드와 실제 에이전트를 쓰므로 서로 겹치지 않는다. 지휘자의 `/verify`는 C·D가 끝난 뒤에 돌린다.
- tasks 항목 대응: T1→A, T2→B, T3→A(가이드)+B(주입), T4→C, T5→D, T6→지휘자, Z1→C(캔버스)+지휘자(문서).
