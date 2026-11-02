# permission-mode — orch

- 계획: [spec.md](./spec.md) · [design.md](./design.md) · [tasks.md](./tasks.md)
- 시작 커밋: `7f3be2ec` (main)
- 통합 브랜치: `feat/permission-mode`
- 컨덕터: Claude Code. 워커도 Claude만 쓴다(모델 교차 없음).

## 결정 기록

1. PoC는 워커 1개(PM-P)가 돌린다. 이 run에 한해 다음 두 가지를 허용한다(사용자). 실제 userData의 Doan profile(agent-auth)을 읽기 전용으로 쓰는 것, Claude·Codex·Cursor·Antigravity·Copilot에 모델 요청을 보내는 것. 대상은 `/tmp` 아래 임시 저장소다. Doan의 저장 파일은 바꾸지 않는다.
2. 배치 순서는 PM-P → PM-A(main) → PM-B(renderer), 직렬이다(사용자). renderer가 main의 IPC와 공통 id 모듈에 기대기 때문이다.
3. U2 실계정 확인은 PM-B가 격리된 패키지 앱에서 한다(사용자). 임시 HOME의 `Library/Keychains`를 실제 폴더에 연결하고, Claude·Codex로 로그인한다. 로그인 승인은 사용자가 브라우저에서 한다. 끝나면 만든 provider keyring 항목과 `<App> Safe Storage`를 지우고 확인한다(POSTMORTEM 'real sign-in').
4. 공통 id와 순수 함수는 renderer가 값으로 가져와도 되는 모듈 하나에 둔다. 경로는 PM-A가 정하고 handoff에 적는다. 그 모듈은 `formats/validate.ts`·ajv·Node 모듈에 닿지 않는다(`rendererImports.test.ts`). — 컨덕터 판단, 근거 POSTMORTEM 'renderer CSP'.
5. `/agent-eval`은 돌리지 않는다. 이 feature는 가이드, CLI 출력, `doan check` 규칙, skill stub을 바꾸지 않는다(design '영향 받는 부분'). — 컨덕터 판단, 근거 AGENTS 'Workflow'.
   - Doan에는 Claude만 로그인돼 있어서 다음과 같이 넓혔다(사용자). Claude는 Doan profile의 비밀이 아닌 파일을 `/tmp`로 복사하고, 키체인에서 현재 access token만 읽어 쓴다. refresh token은 쓰지 않고 키체인에도 쓰지 않는다. Codex·Cursor·Copilot은 임시 HOME에서 파일 저장 방식으로 새로 로그인하고, 사용자가 브라우저에서 승인한다. 끝나면 로그아웃하고 지운다. Antigravity 서버는 `/tmp`에 받는다. `~/.codex`는 쓰지 않는다(refresh token이 바뀌면 터미널 로그인이 깨진다).
   - 로그인한 임시 HOME은 PM-P가 끝날 때 모두 로그아웃하고 지웠다. Copilot 1.0.105에는 logout 명령이 없어서, GitHub의 OAuth 승인(앱 client `Ov23ctDVkRmgkPke0Mmm`)은 GitHub Settings > Applications에서 사용자가 철회해야 남지 않는다.
6. P4에서 대응이 어긋나면(예: Codex가 Default로 되돌아가지 않음) PM-A를 시작하기 전에 사용자에게 묻는다.
   - Codex Default(사용자): 사용자가 정하지 않았으면 `config/read`는 null을 돌려주고, 실제 값은 프로젝트 trust에 따라 달라진다. 그래서 runner가 서버를 열 때 `thread/start {cwd, ephemeral:true}`를 한 번 보내고, 응답의 approvalPolicy·sandbox를 Default 턴에 명시해서 넘긴다. 이 요청은 rollout을 쓰지 않고 모델 요청도 하지 않는다(PM-P 확인). override는 다음 턴과 `thread/resume` 뒤에도 남고, null로는 되돌아가지 않는다(0.163.0).

## 배치

| 배치 | 항목 | 파일 소유 | 선행 | 모델·노력 (이유) | 검증 게이트 | 상태 |
|---|---|---|---|---|---|---|
| PM-P | P1–P4 | `.scratch/permission-mode/`, `docs/features/permission-mode/design.md`(대응표·PoC 칸·Default의 범위), `tasks.md` P 체크 | 없음 | Opus high (실계정·실제 상태를 다루고, 결과가 이후 설계를 정한다) | design.md에 "P1/P2/P3에서 확인" 표시가 남지 않는다. 실제 Doan 저장 파일이 바뀌지 않았다는 전후 비교 | 진행 (run `run_3bf052bbc8b5`, dispatch `ctx_37ae685c9057`, worktree `pm-p-poc`) |
| PM-A | T1·T2의 main 쪽, S1, S2 | `app/src/main/conversation/{runners,acpRunner,models,service,store,ipc}.ts`와 테스트, `app/src/main/preferences.ts`와 테스트, `app/src/preload/`, 새 공통 모듈 | PM-P 통합 | Opus high (권한 전달, Codex 디스패처 규칙, 저장 형식 예외) | `npm --prefix app test`, `npm --prefix app run typecheck`, POSTMORTEM Codex dispatcher `rg` | 대기 |
| PM-B | T1·T2의 renderer 쪽(`restore/uiState.ts`, 마지막 사용·Settings 규칙), U1, U2 | `app/src/renderer/`(ComposerParts·HomeComposerView·DockedComposer·ProjectOverview·CanvasConversationPanel·SettingsAgents·rememberChoice·App·homeComposer·styles.css와 테스트), `app/src/restore/`, `docs/DESIGN.md` 측정값 | PM-A 통합 | Opus medium (기존 피커 패턴을 따르는 UI. 폭 단계와 상태 동기화에 판단이 든다) | `npm --prefix app test`, typecheck, `/design-sync`, `/runtime-test`(8칸 표·스크린샷), `node .agents/skills/verify/scripts/verify.mjs` | 대기 |
| 컨덕터 | Z1 | `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/BACKLOG.md`, `docs/features/permission-mode/` 삭제 | PM-B 통합 | — | Z1 검증 grep | 대기 |

- 리뷰: PM-A와 PM-B는 통합 전에 독립 리뷰 워커(`/code-review`, Opus high)를 거친다.
- D1(초안)은 main에서 끝났다(`6e4be0f7`, 사용자 확정 `e49b8944`).

## 파일 겹침과 순서

- PM-A와 PM-B는 파일이 겹치지 않는다. 그래도 PM-B는 PM-A의 IPC와 공통 모듈을 쓰므로 PM-A 통합 뒤에 시작한다.
- `docs/features/permission-mode/design.md`는 PM-P만 고친다. PM-A·PM-B는 설계와 다른 점을 handoff에 적고, 컨덕터가 반영할지 판단한다.
- tasks.md 체크는 각 배치가 자기 항목만 고친다.

## 항목 대응 확인

P1·P2·P3·P4 → PM-P. D1 → 완료. T1·T2 → PM-A(main)·PM-B(renderer). S1·S2 → PM-A. U1·U2 → PM-B. Z1 → 컨덕터. 주인 없는 항목: 없음.

## 리뷰·통합 기록

(아직 없음)
