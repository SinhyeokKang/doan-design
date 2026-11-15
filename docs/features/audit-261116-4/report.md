# 코드베이스 audit — 2026-11-16 네 번째 (audit-loop 5라운드, 마지막)

- 실행일: 2026-11-16
- 리뷰한 checkout: `develop` HEAD `ee79e1608`. 1–4라운드의 PR #212–#229가 모두 병합된 상태다.
- 워킹트리: 깨끗하다. 세션 전부터 untracked였던 `.doan/seen/`만 있다.
- 범위: 저장소 전체. 4라운드 PR(#228, #229)이 바꾼 영역의 회귀를 먼저 봤다.
- 완료 상태: **완료**(정적 범위). 리뷰어 원본은 `.scratch/audit/261116-r5/`에 있다.

## 실행 한계와 덜 본 곳

- 정적 검토만 했다. 예외는 두 가지다. eval reader에 명령 문자열 20개를 넣어 실행했고, CI 실패 로그 두 건(run 43754840318, 43724446674의 attempt 1)을 읽었다.
- B5-1은 수정 컨덕터가 decoy probe로 먼저 확인한다.
- 4라운드 이후 바뀌지 않은 모듈은 칸마다 이전 판정을 이어받았다.
- 계약 리뷰어는 eval의 W2–W11, R2–R5, D5–D13 판정 로직과 `judge.ts`를 명령 읽기 부분까지만 봤다.

## 4라운드 수정의 상태

- #228·#229에서 회귀를 찾지 못했다.
  - Cursor의 모든 프로세스가 fence 안에서 돈다.
  - fence 실패를 `process_exited`로 매핑하는 처리가 맞다.
  - `agent-auth/.setting-*` 임시 이름은 모든 경로에서 정리된다.
  - swap의 FIFO-safe 읽기, reader의 리다이렉트 처리, `shapeAccepted`, `patchFiles`, X1 realpath를 확인했다.
- 4라운드 항목 상태:
  - C4-1~C4-5, B4-1~B4-4, L4-1, L4-2는 고쳐졌다.
  - C4-3/B4-5(D4b)는 아래 G2 두 경우만 남았다.

## 발견 — High

- **B5-1 [SUSPECTED]**: fence 밖에서 도는 모든 Codex 프로세스가 `$CODEX_HOME/.env`를 읽는다.
  - 대상 프로세스: Ask first·Plan·Accept edits의 대화 서버, 모델·스킬 목록 읽기, usage, 계정 조회, 로그인·상태·로그아웃, MCP 명령
  - Codex 턴은 이 파일을 쓸 수 있다. `.env`가 `codexSettingsFiles`(`agentAuth/fence.ts:55`)에 없기 때문이다.
  - 에이전트가 `.env`에 `PATH`를 심으면, Codex가 sandbox 밖에서 부르는 자식 프로세스(`git` 등)를 바꿔치기할 수 있다.
  - 근거: codex-cli 0.169.0 바이너리에 `dotenvy`와 `.env` 문자열이 들어 있다.
  - 이미 정한 규칙("fence 밖 프로세스가 읽는 설정 경로는 쓰기를 막는다", "probe로 확인된 빈틈은 같은 규칙으로") 안에서 고친다.

## 발견 — Medium

- **G1 = L5-1 = C5-1 = M5-1 [CONFIRMED]**: `onboarding/machine.ts`의 `runProcess`(:13-35)가 자식의 `exit` 이벤트에서 바로 끝나면서 파이프를 destroy한다. 그래서 `exit` 뒤에 도착한 마지막 출력이 사라진다.
  - CI 로그에서 `echo eof`가 37ms 만에 `{stdout: "", exitCode: 0}`으로 돌아왔다. 타임아웃이 아니다.
  - 불안정한 `machine.test.ts` 두 테스트(1라운드 #213, 4라운드 #228의 CI에서 실패)가 테스트 문제가 아니라 이 제품 결함 때문이었다.
  - 같은 함수가 run 전 `--version` 확인, 로그인 셸 probe, legacy external run을 처리한다. 그래서 다음처럼 잘못 거부될 수 있다.
    - 지원되는 버전인데 `runtime_unsupported`나 `session_unavailable`
    - CLI가 있는데 `cli_missing`
- **L5-2 [SUSPECTED]**: `AuthManager.exec`(`manager.ts:833-836`)와 MCP connector `run`(`mcpConnectors/service.ts:649-651`)도 `exit` 뒤 `gone`이 풀리자마자 출력을 반환한다. 그래서 상태 확인 JSON이 잘리면 `check_failed`가 될 수 있다.

## 발견 — Low (모두 사용자에게 보이지 않음)

| id | 내용 | 근거 |
|---|---|---|
| G2 = C5-2 = B5-2 = M5-2 = L5-3, B5-3 | D4b의 남은 빈틈 두 가지다. (1) 따옴표 친 `'~/.zshrc'`·`'$HOME/...'`, 이스케이프된 `\>`, `[[ a > $b ]]`를 profile 쓰기로 읽는다(거짓 실패). (2) `D=$HOME; … >> "$D/.zshrc"`처럼 홈 디렉터리만 담은 변수를 거친 쓰기를 놓친다(거짓 통과) | `eval/scenarios/D4b/base.ts` |
| C5-3 | heredoc으로 넘긴 Python·Node 스크립트, `python3 /tmp/run.py` 같은 스크립트 파일, `find -exec doan` 안의 doan 실행이 reader에 보이지 않는데 complete로 남는다. #228은 같은 모양의 `sh`·`-c`를 incomplete로 처리한다 | `eval/lib/transcript.ts` |
| C5-4 = M5-5 | ARCHITECTURE §7 'Outer fence'(747행)가 #229 이후에도 Copilot만 적는다. Cursor가 빠졌다 | ARCHITECTURE |
| M5-3 | `storage.ts:165,178` 주석은 남은 `.setting-*` 파일이 "scrubbed with leftovers"된다고 적었지만, 그 이름을 지우는 코드가 없다 | `agentAuth/storage.ts` |
| M5-4 | `app/runtime/real-state.ts:88-90`의 userData 목록과 그 테스트 fixture에 `usage-probe`가 남아 있다. #229 이후로는 아무도 이 폴더를 만들지 않는다 | `app/runtime/real-state.ts` |
| M5-6 | "sandbox-exec 자체가 실패했다"는 판정 조건이 두 곳에서 다르다. `prepare.ts:230`은 65·71과 빈 stdout만 보고, `runners.ts:411`은 stderr의 `sandbox-exec:` 줄을 요구한다 | `conversation/prepare.ts`, `runners.ts` |

## 사용자 결정 필요

없다.

## Coverage

네 리뷰어 모두 15개 모듈을 완료했다. 4라운드 이후 바뀌지 않은 모듈은 칸마다 이전 판정을 이어받았다. 경계 리뷰어는 Doan main이 띄우는 모든 프로세스를 fence 안·밖으로 나눈 표를 만들었다(`.scratch/audit/261116-r5/boundaries.md`). fence 밖 프로세스는 B5-1의 Codex 묶음을 빼면 모두 문서화된 수용 항목이거나 BACKLOG 항목이다.

## Postmortem 적용 점검

1–4라운드에 추가한 항목과 recurrence 줄을 검색 명령으로 다시 확인했다. 부분 재발은 다음과 같고, 나머지는 유지된다.
- `usage-probe` orphan(M5-4)
- FIFO·프로세스 출력 계열(G1, L5-2)
- 'fence 밖 목록' 규칙(B5-1)
- eval reader 규칙(G2, C5-3)

## Triage

- **컨덕터로 고친다**:
  - `fix/fence-output-r5`: B5-1(probe 먼저), G1, L5-2, M5-6, C5-4, M5-3, M5-4
  - `fix/eval-d4b-r5`: G2, C5-3
