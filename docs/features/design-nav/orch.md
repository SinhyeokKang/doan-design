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

## 진행 기록
