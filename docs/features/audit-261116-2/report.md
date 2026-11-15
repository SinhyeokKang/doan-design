# 코드베이스 audit — 2026-11-16 두 번째 (audit-loop 3라운드)

- 실행일: 2026-11-16
- 리뷰한 checkout: `develop` HEAD `b7fd099c1`. 1·2라운드 PR #212–#224가 모두 병합된 상태다.
- 워킹트리: 깨끗하다. 세션 전부터 untracked였던 `.doan/seen/`만 있다.
- 범위: 저장소 전체. 2라운드 PR(#221–#224)이 바꾼 영역의 회귀를 먼저 봤다.
- 완료 상태: **완료**(정적 범위). 리뷰어 원본은 `.scratch/audit/261116-r3/`에 있다.

## 실행 한계와 덜 본 곳

- 정적 검토만 했다. 불안정한 테스트는 CI 로그를 읽어 원인을 찾았다. SUSPECTED 항목은 수정 컨덕터가 probe로 먼저 확인한다.
- Copilot 1.0.105와 Claude 2.1.325 바이너리의 동작은 문자열을 뽑아 읽은 것이 근거다.
- 2라운드 이후 바뀌지 않은 코드는 이전 판정을 그대로 가져왔다.
  - 계약·경계 관점: 모듈 2–4, 10, 12, 15와 update·serve·document·prototype
  - 수명주기 관점: renderer 파일 7개(`prototype/main.tsx`, `PrototypeConversation.tsx`, `dotFieldWorker.ts`, `coverFlow.ts`, `components/ui/tooltip.tsx`, `ds/`, `public/`). 9개 파일은 일부만 읽었고, `restore/uiState.ts`, `formats/*`, `brand/*`는 grep으로만 봤다.
- `watch.test.ts` 실패 원인과 L3-11이 실제로 일어나는지는 실행으로 확인하지 못했다.

## 2라운드 수정의 상태

- 네 관점 모두 #221–#224의 회귀를 찾지 못했다.
  - Claude의 턴, 목록 읽기, usage, MCP 명령, sign-out MCP 단계는 모두 바깥 fence를 거친다.
  - `drop()` 하한, quit 정리 순서, `fill()` close, `USER_DATA` 목록과 묶음 테스트, canvas path schema 묶음, `SuggestionButton`, 공유된 WebGL 상수가 모두 유지된다.
- 수명주기 리뷰어는 L3-1을 #223의 회귀로 보고했다. 검증 결과 회귀가 아니라 #223 이전부터 있던 동작이었다(아래).

## 발견 — High (SUSPECTED, 경계·유지보수)

- **B3-1 = L3-4**: Copilot은 모든 프로세스에서 Doan Copilot profile 안의 패키지 캐시 JS를 서명 확인 없이 import한다. 경로는 `Library/Caches/copilot/pkg/darwin-arm64/<ver>/index.js` 또는 `~/.copilot/pkg/...`다.
  - fence 안의 Copilot 턴은 이 파일을 덮어쓸 수 있다.
  - fence 밖에서 도는 status check(`copilot -p`), sign-in, ACP 목록 읽기, usage read가 그 코드를 실행한다.
  - usage read는 앱을 켤 때마다 돈다.
- **B3-2 = C3-2 = M3-1**: Claude가 아닌 provider의 fence 밖 프로세스가 에이전트나 저장소가 쓸 수 있는 설정을 읽는다.
  - 대상 프로세스: ACP 목록 읽기(`prepare.ts:247-249`), Copilot·Cursor check·sign-in, Copilot usage read
  - 대상 설정: Copilot `hooks/*.json`·`mcp-config.json`, Cursor `hooks.json`·`mcp.json`, Antigravity `settings.json`·`mcp_config.json`
  - `fence.ts:47`은 "ACP는 항상 fence 안"이라고 적었는데, 사실과 다르다.
  - 1라운드 probe에서 ACP 목록 읽기는 저장소의 MCP·hook을 실행하지 않았다. profile 쪽 설정은 probe한 적이 없다.
- **B3-3**: #224로 Claude 자체 sandbox가 꺼지면서, 그 sandbox가 막던 Claude config 경로(`local/`, `jobs/`, `daemon/`, `seed-admin/`, `workflows/`)가 fence 안에서 쓰기 가능해졌다. fence 밖에서 도는 `claude auth login/status/logout`이 이 경로를 읽는지는 확인하지 않았다.

이 셋은 이미 정한 규칙 안에서 고친다. 규칙은 "fence 밖 프로세스가 읽는 설정 경로는 쓰기를 막거나, 그 프로세스를 바깥 fence로 돌린다"이다. 사용자가 정한 대로 probe로 확인한 것만 고친다.

## 발견 — Medium

- **G1 = C3-1 = B3-5 = L3-2 = M3-2**: `agentAuth/storage.ts:128` `writeSetting`이 Cursor stub과 Copilot `.copilot/settings.json`을 provider 프로세스를 띄울 때마다 blocking `readFileSync`로 읽는다. 에이전트가 이 파일을 FIFO나 `/dev/zero` 링크로 바꾸면 main이 멈춘다. usage read도 이 경로를 지나므로 앱을 켤 때마다 멈춘다(2026-11-15 FIFO 규칙 재발).
- **L3-7**: `AuthStorage.replace()`와 `stage()`가 `writeSync`의 반환값을 확인하지 않는다(`storage.ts:172,231`). 그래서 short write가 그대로 rename된다. vault가 잘리면 다시 로그인해야 하고, metadata가 잘리면 sign-in 저장소를 읽지 못한다.
- **L3-1 [회귀 아님]**: 이미 거부된 appQuit 쓰기가 다시 시도되면서 이후 모든 quit을 취소한다.
  - 원인: 256 MiB 상한이나 잘린 마지막 줄 때문에 거부된 쓰기가 `owedAppQuit`(`conversation/service.ts:866-871`)에 남아 매번 다시 시도된다.
  - 결과: Cmd+Q, Restart to Update, 로그아웃이 계속 취소된다(`index.ts:1747-1753`). 종료 중에는 대화 삭제도 막혀 있어 사용자가 풀 수 없다.
  - ARCHITECTURE 626행 "its known refusal does not cancel the quit"과 어긋난다.
  - #223 이전에도 무한 재시도가 있었고, 중간 커밋에서만 사라졌다가 #223이 의도적으로 다시 넣었다.
- **M3-10**: eval reader가 `$(…)`, 백틱 안, `env`·`xargs`·`timeout`·`nohup` 뒤에 있는 doan 실행을 읽지 못한다. 그런데 incomplete로 표시하지 않는다. 그래서 D5–D13 preset 검사, D6, R2, O2, O3b가 틀리게 판정한다.

## 발견 — Low (모두 사용자에게 보이지 않음)

| id | 내용 | 근거 |
|---|---|---|
| G2 = C3-3 = B3-6 = L3-3 | sign-in 링크 파일 poll이 `$TMPDIR`의 `doan-auth-link-*`를 100ms마다 main에서 blocking으로 읽는다. 같은 uid의 fence 안 에이전트가 찾아서 FIFO로 바꿀 수 있다 | `agentAuth/manager.ts:939`, `environment.ts:10` |
| G3 = B3-7 = L3-6 | agent setup이 lstat한 뒤에 읽고, 크기 상한이 없다(트리거는 SUSPECTED) | `agentSetup/runner.ts:82,85` |
| M3-3 | 2026-11-16 FIFO recurrence 줄은 `profileServers`가 고쳐졌다고 적었지만 바뀌지 않았다(트리거 없음) | `conversation/runners.ts:99` |
| M3-4 | 2026-11-09 fence 항목 4개가 지금은 없는 Claude 자체 sandbox 방식과 예전 fence 밖 프로세스 목록을 규칙처럼 적는다 | `docs/postmortem/2026-11.md` |
| B3-4 (a) | ARCHITECTURE 'Fence'의 fence 밖 목록(743행)에 Doan이 직접 띄우는 셸 probe(`$SHELL -lic`), 찾아낸 provider 바이너리의 실행, clone·`--git-init`의 git이 빠져 있다. 814행의 수용된 한계와 맞춘다 | ARCHITECTURE §7 |
| G4 = C3-4 = B3-8 = M3-7 | eval D4b의 `tee` 정규식이 `grep tee ~/.zshrc`를 실패시키고, `cp`·`sed -i`·`mv`로 쓰는 것은 놓친다 | `eval/scenarios/D4b/base.ts:21` |
| G5 = C3-5 = B3-9 | 값을 받는 알 수 없는 플래그가 `onboarding` 앞에 오면 O1/O2가 시도로 세지 않는다 | `eval/scenarios/O1/log.ts` |
| G6 = C3-6 = B3-10 | eval의 doan 명령 이름과 `run.go`를 묶는 drift 테스트가 없다 | `eval/lib/transcript.ts` |
| C3-7 | H5가 CLI가 거부하는 `doan config --git-init` 단독 실행을 쓰기로 센다 | `eval/scenarios/H5/checks.ts` |
| M3-11 | eval `openChecks`가 canvas 경로를 정규화하지 않아서 W4가 거짓 실패한다 | `eval/lib/open.ts:33` |
| M3-12 | eval의 작은 빈틈 4개: `--frame` 반복, W1 `external_url`이 소스와 묶여 있지 않음, R11 width meta 정규식, H2b의 자체 답변 추출 | eval |
| G7 = L3-5 = M3-5 + M3-6 | CI 불안정 테스트 두 개. `index.test.ts`는 cold import가 hook 10초를 넘고, 늦게 끝난 import가 창을 하나 더 남긴다. `watch.test.ts`는 300ms 정숙 뒤에 FSEvents가 늦게 도착한다(원인은 SUSPECTED) | `app/src/main/index.test.ts`, `watch.test.ts` |
| L3-8 | `doan init`과 `config --storage repo`가 팀의 `.gitattributes`를 제자리에서 다시 쓴다. 중간에 실패하면 기존 줄이 사라진다(git으로 복원 가능) | `cli/internal/cli/storage.go:144` |
| L3-10 | `doan export`가 존재 확인 뒤에 생긴 파일을 `--force` 없이 rename으로 덮어쓴다 | `cli/internal/cli/export.go` |
| L3-11 | `useProjectSkills`는 같은 key의 읽기가 진행 중이면 새 읽기를 하지 않는다. 그래서 턴이 끝날 때의 skill 재읽기가 버려질 수 있다 | `renderer/useProjectSkills.ts` |

기각: L3-9(ARCHITECTURE 993행이 kill 뒤 `.git`이 남는 것을 수용한다), M3-9(async 읽기 5곳이 모두 이미 `O_NONBLOCK`과 descriptor 검사를 한다).

## 사용자 결정 필요

- **B3-4 (b)**: Doan이 fence 밖에서 직접 띄우는 프로세스가 에이전트가 고칠 수 있는 파일을 실행한다. `$SHELL -lic`가 `~/.zshrc`를 실행하고, 그 PATH에서 찾은 provider 바이너리를 실행하고, clone이 사용자의 `~/.gitconfig`를 쓴다. ARCHITECTURE 814행은 `~/.zshrc`를 이름까지 들어 이 한계를 수용했다. 막을지는 정책 결정이다 → BACKLOG.

## Coverage

| # | 모듈 | 계약 | 경계 | 수명주기 | 유지보수 |
|---|---|---|---|---|---|
| 1–5 | CLI·schema | 이전 판정 유지(변경 없음) | 이전 판정 유지 | 완료(하위 리뷰어) | 이전 판정 유지·postmortem 재검색 |
| 6–9 | app main | 변경분과 후보 완료 | 완료 | 완료 | 완료 |
| 10, 12 | preload, 공유 | 이전 판정 유지 | 이전 판정 유지 | 부분(grep) | 이전 판정 유지 |
| 11 | renderer | 변경분 | 변경분과 후보 | 부분(7개 미독, 9개 일부) | 이전 판정 유지 |
| 13–14 | runtime, eval | 완료 | 완료(real-state) | 완료 | 완료(r2가 다시 읽지 않은 판정 로직까지 읽음) |
| 15 | packaging/CI | 이전 판정 유지 | 이전 판정 유지 | 완료 | 이전 판정 유지 |

## Postmortem 적용 점검

- 2026-11-15·16 항목의 부분 재발은 다음과 같다.
  - FIFO: G1, G2, G3, M3-3
  - eval reader: M3-10, M3-11, M3-12
  - 묶이지 않은 CLI 사실 복사본: G6, M3-12
  - 부하에서 깨지는 타이밍 테스트: G7
  - 설정 목록 없이 fence 밖에 둔 프로세스: B3-2
  - appQuit 규칙: L3-1
  - short write: L3-7
- 바뀐 파일에 걸린 이전 항목 62개: 재발 0, 유지 25, 부분 재발 2(M3-4), 이름만 겹침 35.

## Triage

- **사용자 결정 필요**: B3-4 (b) → BACKLOG
- **컨덕터로 고친다**:
  - `fix/provider-fence-gaps`: B3-1, B3-2, B3-3(probe로 먼저 확인), G1, L3-7, G2, G3, M3-3, M3-4, B3-4 (a)
  - `fix/lifecycle-3`: L3-1, L3-8, L3-10, L3-11, G7
  - `fix/eval-checks-3`: G4, G5, G6, C3-7, M3-10, M3-11, M3-12
