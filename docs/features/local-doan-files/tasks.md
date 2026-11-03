# local-doan-files — tasks

순서: 형식(schema·fixture) → 순수 함수(Go) → CLI I/O → app UI → guide → 승격. UI(셋업 선택, Project Settings 모드)가 있으므로 `/feature-review` 뒤 `/design-draft`가 `.doan/canvases/local-doan-files.html`(셋업 폼의 선택, Project Settings의 두 모드, 로컬 전환 안내, Git 아님 비활성, 쓰기 실패)을 그리고 사용자가 앱에서 확인한 뒤 `/tdd`로 들어간다.

## T1. 형식

- `ls` 응답의 `storage`(와 정해지면 `trackedDoanFiles`)를 JSON Schema 정본에 더하고 TS·Go 공유 fixture를 만든다.
- 검증: `go test ./...`, `npm --prefix app test` green(fixture를 두 쪽이 읽음).
- **commit 경계**: `feat(formats): ls reports where Doan files are kept`

## T2. Go 순수 함수

- exclude 줄 더하기·빼기, 모드 판단, init 파일 계획(design §4).
- 검증: `go test ./...`, `go vet ./...` 통과. 실제 `git worktree add`로 만든 worktree에서 같은 exclude를 읽는 테스트 포함.
- **commit 경계**: `feat(cli): rules for keeping Doan files out of the repository`

## T3. CLI 명령

- `init --local`, `config`의 모드 옵션, `ls`의 새 필드, exclude 쓰기(design §2).
- 검증: `go test ./...` 통과. `go run ./cli/cmd/doan init --local --repo <tmp git repo> --json` 뒤 그 repo에서 `git status --porcelain`이 비어 있음(테스트 안에서 확인).
- **commit 경계**: `feat(cli): doan init --local and the storage option`

## T4. app UI

- 셋업 폼의 선택, Project Settings의 모드 표시·전환·안내, 경로 줄 문구, settings IPC(design §3).
- 검증: `npm --prefix app test` green, typecheck·build 통과. `/runtime-test`: 임시 git repo를 로컬로 셋업 → `git status` 깨끗함, Project Settings에서 레포로 바꿈 → exclude 줄 빠짐, 추적 중인 repo를 로컬로 바꿈 → 안내, Git 아닌 폴더 → 비활성. `/design-sync`로 초안과 비교.
- **commit 경계**: `feat(app): choose where Doan files are kept`

## T5. guide

- `skill.md`의 셋업 설명에 `--local`.
- 검증: `go test ./...`(skill 크기 예산 포함), `/agent-eval`: `npm --prefix app run package` 뒤 셋업 관련 시나리오(`eval/scenarios`에서 init·onboarding 시나리오 id 확인)를 두 에이전트로 돌려 통과.
- **commit 경계**: `docs(skill): set up a project with local Doan files`

## T6. 문서 승격과 feature 디렉터리 삭제

- `docs/PRODUCT.md`: §1 문제 4의 로컬 모드 한계, §3 Out of scope 6의 exclude 예외, §5 item 1 'Project Settings'·셋업, item 8 `doan init --local`.
- `docs/ARCHITECTURE.md`: §4 `ls`·`init`·`config` 계약, §11 schema, §13 'Read-only Git metadata'의 쓰기 예외와 규칙.
- `docs/DESIGN.md`: `/design-sync` 값. `docs/BACKLOG.md`: 확인하지 못한 표면.
- `docs/features/local-doan-files/` 삭제.
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과, `rg -n "docs/features/local-doan-files" docs app cli .agents eval AGENTS.md` 결과 없음.
- **commit 경계**: 문서별로 나눈다, 마지막에 `docs(feature): remove local-doan-files documents`.
