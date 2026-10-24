# design-nav — orch

- 원본: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 해시: `922b1d8`(main)
- 통합 브랜치: `feat-design-nav`(main에서 만듦)
- 지휘: Claude Code(Opus). 직렬 체인 2번 고리(`.scratch/handoff/orch-chain.md`). 지휘자는 배치 코드를 고치지 않는다. 지휘자가 쓰는 것은 이 문서, 통합 커밋, 문서 최신화 커밋뿐이다.
- 지휘 자료(브리프·인계·리뷰·근거): `.scratch/orch/design-nav/`

## 결정 로그

| 날짜 | 결정 | 근거 |
|---|---|---|
| 2026-10-25 | Codex 워커를 넓게 쓴다. 배치마다 Opus와 Codex를 섞고, 각 배치는 다른 모델 계열이 리뷰한다 | 사용자: "codex 허가. 여기저기 많이 사용해도 됨"(체인 인계 규칙) |
| 2026-10-25 | 초안은 Codex(`gpt-6-astra` high)와 Claude(Opus high)가 같은 요청으로 각자 그린다. 지휘자가 더 나은 초안을 고르고, 다른 초안에서 가져올 부분을 붙인다 | 사용자 요구(tasks.md '앞선 단계') |
| 2026-10-25 | 초안 게이트는 지휘자가 확정한다. 사용자의 앱 내 확인은 건너뛴다. `/design-draft`가 사용자에게 묻는 질문도 지휘자가 받는다(워커는 `ask`) | 사용자(체인 인계 규칙, 세 기능 공통) |
| 2026-10-25 | 초안 요청: 캔버스 `design/design-nav.html`, canvas id `design-nav`. 프레임 id는 `workspace-tree`, `tree-rows`, `overview`, `overview-empty`, `quick-open`, `frame-highlight`, `toasts`다 | 지휘자 판단 — tasks.md '앞선 단계'가 꼽은 상태 목록을 프레임으로 나눴다. 기존 초안의 kebab-case id 관례를 따랐다 |
| 2026-10-25 | task 12(FirstPrompt 통합)는 이 기능에서 하지 않는다 | 지휘자 판단 — `app-setup`이 아직 main에 없다. 체인 순서상 나중에 병합되는 `app-setup`이 통합을 맡는다(orch-chain.md) |
| 2026-10-25 | 이 기능은 CLI·MCP 출력과 가이드를 바꾸지 않으므로 `/agent-eval` 회차를 돌리지 않는다 | spec '사용자' — CLI·MCP·스킬은 바뀌지 않는다. AGENTS.md `/agent-eval` 실행 조건에 해당하지 않는다 |
| 2026-10-25 | 썸네일 8초 제한: `load`가 8초 안에 끝나지 않으면 그때 그려진 화면을 찍는다(design.md). "Preview unavailable"은 iframe 로드 실패, 캡처 오류, 캡처까지 끝나지 않는 작업 전체 상한 초과일 때 보인다. tasks.md task 5의 "8초 제한 → 실패 표시"는 이 작업 전체 상한으로 읽는다 | 지휘자 판단 — design.md가 더 구체적이고, PoC 8에서 8초 시점 캡처가 빈 곳 없이 성공했다. P 인계가 두 문서의 차이를 알렸다 |
| 2026-10-25 | 앱이 꺼져 있는 동안 token CSS가 바뀌어도 다음 시작에서 썸네일이 stale이 되도록, 썸네일 메타에 token 파일 서명(경로·mtime·size)을 넣고 `thumbnailStale`이 비교한다 | 지휘자 판단 — design.md는 token CSS 변경을 폴더 전체 stale로 정했지만, A3 인계대로 메타만으로는 꺼진 동안의 변경을 알 수 없다. 메타 필드 하나로 막을 수 있다 |
| 2026-10-25 | 저장된 루트가 문제 상태(설정 안 됨·오류·CLI 오류·없음)이면 복원은 홈으로 간다 | 지휘자 판단 — design.md '재실행 복원'은 상태 줄과 함께 작업공간을 연다고 했지만, 먼저 main에 들어간 projects-home 결정(ARCHITECTURE: problem-row activation은 작업공간에 들어가지 않는다)과 어긋난다. 병합된 결정을 따른다 |
| 2026-10-25 | 트리 타입어헤드: 한 글자(또는 같은 글자 반복)는 현재 행 다음부터 찾고, 여러 글자 버퍼는 현재 행부터 찾는다("ab"를 이어 치면 "abacus"에 머문다) | 지휘자 판단 — R-A1은 design.md의 '다음 행' 문구대로 고치라고 권했다. 이어 치는 글자는 지금 일치를 좁히는 것이 보통의 트리·목록 동작이고, 다음 행부터 찾으면 이미 맞는 행을 건너뛴다 |
| 2026-10-25 | ⌘K 순서는 점수가 먼저이고, 현재 프로젝트는 같은 점수 안에서만 앞선다(design.md). spec의 "현재 프로젝트 결과가 먼저"는 승격 때 "같은 점수에서는"으로 맞춘다 | 지휘자 판단(R-A2 결정 항목 1) — design.md가 더 구체적이고 구현과 테스트가 이미 따른다 |
| 2026-10-25 | ⌘K 색인과 쿼리를 NFC로 정규화한다. 프레임 항목에 캔버스 이름을 더하지는 않는다 | 지휘자 판단(R-A2 결정 항목 2·3) — macOS에서 NFD로 저장된 한글 파일 이름이 IME(NFC) 입력과 맞지 않는다. 캔버스 이름 필드 추가는 spec·design의 필드 목록 밖이다 |

## 배치

| 배치 | tasks | 파일 소유 | 선행 | 모델 · 노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| DX | 앞선 단계(초안, Codex 쪽) | `design/design-nav.html`(자기 worktree) | — | Codex Astra high (사용자 지정) | `doan check` · `doan ls`(프레임 id 일치) | 대기 |
| DC | 앞선 단계(초안, Claude 쪽) | `design/design-nav.html`(자기 worktree) | — | Claude Opus high (사용자 지정, 공정 비교) | 위와 같다 | 대기 |
| P | 0 | `.scratch/design-nav/poc-thumb/`, `docs/PRODUCT.md` §6 | — | Codex Astra medium (Electron 캡처의 판단이 결과를 좌우한다) | 기준별 결과 표, PRODUCT §6 기록 커밋 | 대기 |
| A1 | 1 | `app/src/renderer/` 새 순수 함수 파일(트리·라벨·타입어헤드·행 동작·상한) + 테스트 | — | Claude Sonnet high (규칙이 문서에 다 있다) | `npm --prefix app test` · `typecheck` | 대기 |
| A2 | 2 | `app/src/renderer/` 새 순수 함수 파일(검색 색인·매칭·대상) + 테스트 | — | Codex Astra medium (점수·순서 규칙과 성능 기준) | 위와 같다 | 대기 |
| A3 | 3 | `app/src/main/` 새 순수 함수 파일(ui-state 파싱·복원 계획, 썸네일 키·stale·정리·큐), `app/src/renderer/` 새 `currentFrame` 파일 + 테스트 | — | Claude Sonnet high (순수 함수, 경계값이 문서에 있다) | 위와 같다 | 대기 |
| B | 4, 5 | `app/src/main/`(view·index·menuState·새 uiState·thumbnails), `app/src/preload/`, `app/src/renderer/index.html`(CSP), `app/e2e/real-state.ts`와 창 선택 헬퍼(`onboarding.ts`·`comments-ui.ts`·`projects-home.ts`) | A3 통합, task 5는 P 통과 | Claude Opus high (IPC 보안 계약, 숨김 창 수명, 원자적 쓰기) | test · typecheck · e2e(최종 PASS, exit 0) | 대기 |
| C1 | 6, 7 | `Sidebar.tsx`(+test), `CanvasController.ts`(+test), 연결에 필요한 `App.tsx`·`styles.css`, `app/e2e/` | A1 통합, B 통합, 초안 확정 | Codex Astra medium (트리 키보드·선택 경계. B와 다른 계열) | test · typecheck · e2e | 대기 |
| C2 | 8, 9, 10, 11 | 새 `ProjectOverview.tsx`·`QuickOpen.tsx`(+test), 복원 연결, `docs/DESIGN.md`; `App.tsx`·e2e 연결은 C1 통합 뒤 | A2 통합, B 통합, 초안 확정 | Claude Opus high (모달 포커스·복원 타이밍·design-sync) | test · typecheck · e2e, `/design-sync` 완료 조건 | 대기 |
| R-* | 배치별 리뷰 | 보고서만 | 각 구현 배치 | 다른 계열: A1·A3·B·C2 → Codex Astra medium, A2·C1 → Claude Opus high | `/code-review`, 🔴 0 | — |
| F | 13 | 고침은 각 배치 소유자에게 돌린다 | 전부 통합 | 전체 `/code-review`: Codex Astra medium. `/runtime-test`: 지휘자 | task 13 명령 모두 통과 | 대기 |
| G | 14 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DIRECTORY.md`, 이 디렉터리 삭제 | F | Codex Astra medium (문서 정확성), 리뷰 Claude Sonnet high | task 14 확인 | 대기 |

tasks.md의 앞선 단계와 task 0~14는 모두 위 배치 중 하나에 속한다. task 12는 결정 로그대로 하지 않는다.

## 순서와 파일 겹침

- 1파: DX ∥ DC ∥ P ∥ A1 ∥ A2 ∥ A3. 각자 새 파일만 만들거나(`design/`, `.scratch/`, 새 순수 함수 파일) PRODUCT §6만 고친다. DX와 DC는 같은 파일을 각자 worktree에 그리고, 고른 쪽만 통합한다.
- 2파: B(A3 통합 뒤). task 4를 먼저 하고, task 5는 P 결과(`show:false`/`offscreen` 선택)를 받은 뒤 한다.
- 3파: C1 ∥ C2(B 통합과 초안 확정 뒤). C1은 `Sidebar`·`CanvasController`·`App.tsx` 연결을 맡는다. C2는 새 컴포넌트와 단위 테스트를 먼저 만들고, `App.tsx`·e2e 연결은 C1 통합 뒤 이어 받는다(그때까지 '미룬 항목'). task 11 design-sync는 C2가 마지막에 한다.
- 각 배치는 `--worktree new-child --base-branch feat-design-nav`로 만든 자기 worktree에서 돈다.

## 초안 리뷰

2026-10-25, 지휘자가 두 초안의 Chromium 스크린샷(`.scratch/orch/design-nav/shots-DX/` 8장, `shots-DC/` 7장)과 인계 문서를 비교했다. 두 초안 모두 `doan check` 오류 0(기존 `mock.css` 경고 6), `doan ls`의 프레임 id 7개가 요청과 같다.

- **DC(Claude Opus, `95b0942`)를 골랐다.** 그린 상태가 더 많다. 개요는 3열 격자에 폴더 경로 머리글·개수, 프레임 수 변형(1 frame, 1,000+ frames), 긴 이름의 툴팁, 최근 변경의 절대 시각 툴팁, 개요로 가는 두 길을 그렸다. ⌘K는 캔버스 결과에 `design/` 아래 경로를 보이고, 긴 값의 잘림 순서와 Go 메뉴·메뉴 활성 표의 Quick Open 행을 그렸다. 트리 표에는 프레임 없는 캔버스 안내와 Overview가 현재인 상태가 있다.
- DX(Codex Astra high, `f8237c8`)의 장점: 캔버스 행을 두 줄(제목·파일 이름)로 나눠 240px에서도 둘 다 읽힌다. 감사 H2(둘 다 잘림)를 직접 푼다. 선택 표시를 속 빈 마름모로 그려 행 폭을 거의 쓰지 않는다(DC의 Selected 태그는 Select 버튼과 함께 있으면 제목을 심하게 자른다 — DC가 스스로 적었다). 작업공간 표본의 캔버스 내용이 줌 배율과 맞아 읽기 좋다.
- DC에 붙일 것(DC-rev): ① 두 줄 캔버스 행(44px, 폴더·프레임·Overview는 26px 유지) ② 선택 표시를 속 빈 마름모로 ③ 표본 캔버스 내용을 줌 배율에 맞게. 출처를 캔버스 머리말에 적는다.
- DC가 정하지 않은 채 그린 12개 선택: 1(사이드바 제목 Canvases + 개수, 프로젝트 행을 사이드바에서 뺌 — 제거는 홈에서), 2, 4, 6~12는 받아들인다. 3은 ①로, 5의 Selected 태그는 ②로 대체한다.
- **붙이기 차례(`5dadd63`)와 앱 렌더 확인(`99472dd`), 2026-10-25 지휘자 확정.** ①~③이 모두 반영됐다. `doan check` 오류 0(기존 경고 6), `doan ls` 프레임 id 7개가 같다(통합 HEAD에서 지휘자 재실행). 격리된 실제 앱에서 연 스크린샷(`shots-DC-app/`)의 요소 사각형 1,860개가 일반 Chromium과 0.6px 넘게 다른 것이 없고, 잘림·높이 고정 문제가 없다. 지휘자가 앱 렌더의 개요 프레임과 Chromium 렌더의 작업공간 프레임을 직접 확인했다. 호버·Select·⌘K 상호작용은 정적 초안이라 확인 대상이 아니다. 사용자 확인은 결정 로그대로 건너뛴다.

## 진행 기록
- 2026-10-25: Run `run_5fa531d27dc7`. 1파 시작 — DX(`ctx_1017df68b758`, Codex Astra high), DC(`ctx_6e84f37d44a7`, Opus high), P(`ctx_ccb8e36d909e`, Codex Astra medium), A1(`ctx_3a4edf6ff5d9`, Sonnet high), A2(`ctx_c737afc282e9`, Codex Astra medium), A3(`ctx_8e0b32221dd9`, Sonnet high). `launch.effective`가 요청과 같다.
- 2026-10-25: A2 완료(`2736239`, `f60af15`) — test 1457·typecheck 통과 보고. 교차 리뷰 R-A2(`ctx_4b514df50c43`, Opus high). A2 워커는 수정 차례에 대비해 유지(retain).
- 2026-10-25: A1 완료(`4cca494`) — test 1479·typecheck 통과 보고, 별도 `/code-review`는 돌리지 않았다. 가정 2개(여러 글자 타입어헤드는 현재 행부터 찾음, `capFrames`가 id·제목을 200자로 자름)는 R-A1이 함께 판단한다. 교차 리뷰 R-A1(`ctx_ca4337b75cc4`, Codex Astra medium). A1 워커 해제.
- 2026-10-25: P 완료·통합(`3a1530f`). PoC 8 통과 — 두 방식 모두 9개 조건 통과, `show:false` 유지(중앙값 655.77ms, 50회 메모리 −26.11MiB, offscreen은 +51.03MiB). 지휘자가 never-load 썸네일을 직접 확인했다. 근거: `.scratch/design-nav/poc-thumb/`. P 워커 해제.
- 2026-10-25: A3 완료(`1d51969`) — test 1525·typecheck 통과 보고(첫 전체 실행에서 원인을 못 적은 실패 1건, 재실행 녹색). 공유 모듈은 `app/src/restore/`. 서명 차이 2개(`parseUiState`가 저장 루트 목록을 받음, `thumbnailStale`에 폴더 변경 플래그)는 받아들였다. 교차 리뷰 R-A3(`ctx_60a3059e37b2`, Codex Astra medium). A3 워커 해제.
- 2026-10-25: R-A1 결과 🔴 0 · 🟡 2(여러 글자 타입어헤드 규칙이 문서와 다름, 이모지 등 보조 평면 문자 순환 깨짐) · ⚪ 1(정적·렌더링 `truncated` 뜻 차이 — C1 통합 주의점). 첫 🟡는 결정 로그대로 유지, 둘째는 A1-fix(Sonnet medium, `dn-a1`)로 보냈다. R-A1 워커 해제.
- 2026-10-25: R-A2 결과 🔴 0 · 🟡 1(경로를 `design/` 접두 그대로 색인해 `de` 같은 쿼리가 모든 캔버스에 접두 점수를 줌 — 재현) · ⚪ 3. A2-fix(`ctx_22d86446875e`, 같은 Codex 터미널 재사용)로 보냈다. R-A2 워커 해제.
- 2026-10-25: A1-fix 완료(`5ace8b6`), A1을 통합(`ad10c82`, `2836312`). 통합 HEAD typecheck·test 1480 통과(지휘자 실행). `dn-a1`·`dn-p` worktree 제거.
- 2026-10-25: A2-fix 질문 — `design/` 접두 문제를 postmortem에 남길지 → 남기지 않는다. 통합 전 리뷰에서 잡힌 버그라 회귀가 아니다.
- 2026-10-25: R-A3 결과 🔴 0 · 🟡 1(캡처 중 `forget`+`request`를 잃고, 이전 캡처의 실패가 새 요청까지 막음 — 재현). 지휘자 결정 2개(token 서명, 문제 루트는 홈)와 함께 A3-fix(`ctx` 아래, Sonnet high, `dn-a3`)로 보냈다. R-A3 워커 해제.
- 2026-10-25: DX 완료(`f8237c8`) — check 오류 0(기존 경고 6), 프레임 id 7개 일치, 스크린샷 8장 보고. DC를 기다려 비교한다. DX 워커는 피드백 루프에 대비해 유지.
- 2026-10-25: A2-fix 완료(`6fb0c64`, `08fcb4e`) — scope 상대 경로 색인, NFC, 결과에서 `fields` 제거, 성능 테스트에 부분 일치 쿼리 추가(처음 66.88ms 실패 → 상위 50개만 유지하도록 고쳐 통과). 지휘자가 diff를 확인했다(같은 순위의 입력 순서 유지). A2 통합(`6c49c70`~`c48462a`), 통합 HEAD typecheck·test 1496 통과. A2 워커 해제, `dn-a2` 제거.
- 2026-10-25: DC 완료(`95b0942`). 초안 비교 결과 DC를 골랐다(위 '초안 리뷰'). DC-rev(`ctx_6de50b873c7b`, Opus high, `dn-dc`)로 붙이기 차례를 보냈다. DX 워커 해제, DX 초안은 `.scratch/orch/design-nav/draft-DX-f8237c8.html`로 보존하고 `dn-dx`를 제거했다.
- 2026-10-25: A3-fix 완료(`39261c7`) — 큐에 `activeStale`, 메타에 token 서명(폴더 변경 플래그를 대체), 문제 루트는 홈. 큐 회귀 테스트 4개 red→green 보고. 지휘자가 큐 diff를 확인했다. A3 통합(`185d54d`, `510a12a`), 통합 HEAD typecheck·test 1582 통과. A3 워커 해제, `dn-a3` 제거. 1파 순수 함수 배치(A1·A2·A3) 완료.
- 2026-10-25: B 시작(`ctx_4325ed54a20a`, Opus high, `dn-b`). 결정 로그의 8초 규칙·token 서명·`show:false`를 브리프에 넣었다.
- 2026-10-25: DC-rev 완료(`5dadd63`) — 두 줄 캔버스 행(43행), 마름모 선택 표시(Select 슬롯은 그 앞), 표본 캔버스 배율, 머리말에 12개 결정과 출처. check 오류 0, 프레임 id 7개 유지. 지휘자가 `shots-DCrev/workspace-tree.png`을 확인했다. 실제 앱 렌더 확인을 DC-app(Sonnet high, `dn-dc`)으로 보냈다.
- 2026-10-25: DC-app 완료(`99472dd`). 초안 확정, 통합(`fbc50fa`, `4ce33c4`, `e1708fa`). `dn-dc` 제거.
