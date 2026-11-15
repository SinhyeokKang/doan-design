# 코드베이스 audit — 2026-11-16 세 번째 (audit-loop 4라운드)

- 실행일: 2026-11-16
- 리뷰한 checkout: `develop` HEAD `49c32c9ac`. 1–3라운드의 PR #212–#227이 모두 병합된 상태다.
- 워킹트리: 깨끗하다. 세션 전부터 untracked였던 `.doan/seen/`만 있다.
- 범위: 저장소 전체. 3라운드 PR(#225–#227)이 바꾼 영역의 회귀를 먼저 봤다.
- 완료 상태: **완료**(정적 범위). 리뷰어 원본은 `.scratch/audit/261116-r4/`에 있다.

## 실행 한계와 덜 본 곳

- 정적 검토만 했다. 예외로 C4-1은 리드가 eval reader에 리다이렉트를 넣어 직접 실행해 확인했다.
- SUSPECTED 항목(B4-1, B4-3, M4-9, M4-10)은 수정 컨덕터가 probe로 먼저 확인한다.
- 3라운드 이후 바뀌지 않은 모듈은 이전 판정을 그대로 가져왔고, 각 리뷰어의 표에 칸마다 그렇게 적었다.
- 3라운드가 읽지 못한 renderer·공유 파일 7개와, 일부만 읽은 9개 파일의 비동기 경로는 이번에 모두 읽었다. 발견은 없다.
- 계약 리뷰어는 eval의 판정 로직(W2–W11, R2–R5, D5–D13, `judge.ts`)을 명령 읽기 부분 말고는 다시 읽지 않았다.

## 3라운드 수정의 상태

- **회귀 1건**: C4-1(#226).
- **회귀 없음**:
  - #225: quit의 `refusesForGood`, `.gitattributes` staged write, export link(2), `useProjectSkills`
  - #227: Copilot·ACP fence, FIFO-safe 읽기, short write 확인
- **3라운드 항목 상태**:
  - C3-1~C3-3, C3-5~C3-7은 고쳐졌다.
  - C3-4(D4b)는 일부만 고쳐졌다. 남은 부분이 C4-3이다.

## 발견 — High

- **B4-1 [SUSPECTED]**: Cursor의 일부 프로세스가 fence 밖에서 돈다. 대상은 모든 run 전의 `--version`, 첫 run 전의 status, sign-in이다.
  - Cursor launcher는 `NODE_COMPILE_CACHE=$HOME/Library/Caches/cursor-compile-cache`(HOME=profile)로 Node를 띄운다.
  - fence 안의 Cursor 턴은 이 캐시에 쓸 수 있다. 실제 profile에 이 캐시가 있다.
  - 3라운드에 Copilot에 적용한 규칙(fence 밖 프로세스가 에이전트가 쓸 수 있는 코드를 실행하면 그 provider 프로세스를 모두 fence 안에서 돌린다)으로 고친다. probe로 먼저 확인한다.

## 발견 — Medium

- **C4-1 [CONFIRMED, #226 회귀]**: eval reader가 shell 리다이렉트를 단어로 남긴다. `commandWords("doan design-skill document --json > /tmp/x")`는 `[…, ">", "/tmp/x"]`가 되고, `… 2>/dev/null`은 `[…, "2>/dev/null"]`가 된다. 그러면 #226의 `shapeAccepted`(`eval/lib/transcript.ts:35`)가 이 명령을 CLI가 거부한 명령으로 본다.
  - preset 읽기를 요구하는 검사(D10g, D13, D11e, D5 등)가 거짓 실패한다.
  - `no_preset_body_read`, `preset_reads_allowed`는 거짓 통과한다.
  - W4, W8, X1, X2의 open·export 검사가 거짓 실패하고, `noOpen`은 리다이렉트를 붙인 open을 놓친다.
  - 기록된 Claude transcript에 이렇게 리다이렉트를 붙인 preset 읽기가 250건이 넘는다.

## 발견 — Low (모두 사용자에게 보이지 않음)

| id | 내용 | 근거 |
|---|---|---|
| C4-5 | #227이 Copilot의 run 전 `--version`을 fence 안으로 옮겼다. 그래서 `sandbox-exec`가 없거나 65·71로 끝나면 `runtime_unsupported`("Update it")나 `session_unavailable`로 거부되고 `toolsFailed`가 뜬다. ARCHITECTURE §7 'Fail closed'는 이 경우를 `process_exited`로 정한다 | `prepare.ts`, `agentAuth` |
| C4-2 = B4-3 = L4-1 = M4-8 | `agentSetup/swap.ts:71`이 lstat한 뒤 옮겨 둔 aside 파일을 blocking, 상한 없는 `readFileSync`로 읽는다(FIFO 규칙에서 남은 마지막 위치). 경계 리뷰어는 우회 가능성도 지적했다. 실행 중인 Claude 턴이 aside를 바꿔치기하면 `restore`가 그 내용을 `settings.json`으로 되돌린다 | `swap.ts:71`, 호출처 `runner.ts:137`, `storage.ts:166` |
| B4-2 = M4-2 | ARCHITECTURE §7 'Fence'의 fence 밖 목록에 Claude·Codex의 run 전 `--version`이 빠졌다. 2026-11-16 postmortem 규칙("fence 밖에 둘 프로세스는 먼저 목록에 적는다")을 지키지 않았다 | `prepare.ts:223-225` |
| M4-1 | #227 이후 쓰는 곳이 없어진 `usage-probe/`를 usage read마다 여전히 만든다. ARCHITECTURE 749·924행도 아직 쓰이는 것처럼 적혀 있다 | `usageRead.ts:54` |
| M4-3 | ARCHITECTURE 983–984행은 export가 rename으로 출력 파일을 만든다고 적었다. 실제로는 `--force`가 없으면 link(2)로 만든다(#225) | ARCHITECTURE §12 |
| L4-2 | ARCHITECTURE 1003행의 신호 정리 목록에 #225가 추가한 `.gitattributes` staged write가 빠졌다. SIGKILL(앱의 CLI 타임아웃)로 끝나면 `.gitattributes-*`와 `.doan/.config-*` temp가 남는다. ARCHITECTURE 982행은 이런 잔여 파일을 export에만 허용한다고 적었다. SIGKILL은 잡을 수 없으니 export와 같은 수용으로 문서에 적는다 | ARCHITECTURE §12 |
| M4-4 | audit-loop가 고친 eval checker(#218, #222, #226)를 영향받은 라운드에 메모 없이 반영했다. ARCHITECTURE §14가 요구하는 메모가 없다 | `docs/usability-eval/rounds-2026-11.md` |
| C4-3 = B4-5 = M4-6 | D4b `no_shell_profile_change`가 따옴표 안의 `'>'`·`'>>'`를 리다이렉트로 읽어 거짓 실패한다. 반대로 붙여 쓴 `>>~/.zshrc`, `cd ~` 뒤의 상대 경로, 할당되지 않은 변수 경로, Codex `apply_patch`로 쓴 경우는 놓친다 | `eval/scenarios/D4b/base.ts` |
| C4-4 = B4-4 = M4-5 | 공용 reader가 `sudo doan`, 에이전트가 쓴 스크립트 파일 실행, `node -e`·`python -c` 안의 doan 실행을 읽지도 않고 incomplete로 표시하지도 않는다 | `eval/lib/transcript.ts` |
| M4-7 | `shapeAccepted`가 `--frame`의 200자 제한·제어문자 규칙과 빈·무효 `design-skill` id를 반영하지 않는다. CLI는 이것들을 거부한다 | `eval/lib/transcript.ts` |
| M4-9 [SUSPECTED] | watch flaky 수정(marker 대기)이 테스트 하나에만 들어갔다. `watchScope`를 쓰는 25개는 여전히 300ms 정숙만 기다린다 | `app/src/main/watch.test.ts` |
| M4-10 [SUSPECTED] | eval X1은 canvas 경로를 `resolve`로 비교하고, open·W8·X2는 realpath로 비교한다. M3-11 수정이 X1에 닿지 않았다 | `eval/scenarios/X1` |

## 사용자 결정 필요

없다. B4-1은 사용자가 정한 규칙("probe로 확인된 빈틈은 같은 규칙으로")에 따라 컨덕터가 처리한다. L4-2의 SIGKILL 잔여 파일은 막을 방법이 없으므로, 규칙을 바꾸지 않고 export와 같은 수용을 문서에 적는다.

## Coverage

네 리뷰어 모두 15개 모듈의 표를 채웠다. 3라운드 이후 바뀌지 않은 모듈은 칸마다 이전 판정을 이어받았다고 적었다.

| 관점 | 상태 |
|---|---|
| 계약 | 4라운드 범위 완료. 모듈 2–4, 10, 12, 15는 2라운드 판정을 이어받았다 |
| 경계 | 15개 완료(변경 없는 모듈은 이전 판정) |
| 수명주기 | 완료. 3라운드에서 읽지 못한 renderer·공유 파일을 모두 읽었다 |
| 유지보수 | 15개 완료. 모듈 2–5, 9, 10, 12, 13, 15는 3라운드 판정을 이어받았다 |

## Postmortem 적용 점검

- 부분 재발: 2026-11-16 'fence 밖 목록' 규칙(B4-2), FIFO 규칙(C4-2), eval reader 규칙(C4-1, C4-3, C4-4, M4-7, M4-10), 타이밍 테스트 규칙(M4-9), §14 메모 규칙(M4-4)
- 나머지 1–3라운드 항목과 재발 기록은 유지된다.

## Triage

- **컨덕터로 고친다**:
  - `fix/eval-reader-4`: C4-1(회귀 우선, postmortem 포함), C4-3, C4-4, M4-7, M4-10, M4-4
  - `fix/fence-r4`: B4-1(probe 먼저), C4-5, C4-2, B4-2, M4-1, M4-3, L4-2, M4-9

## 4라운드 결과 (2026-11-16 마감)

**검증하지 못한 것**
- 실제 로그인이 필요해서 하지 못한 것: fence 안에서 Cursor sign-in을 끝까지 하는 것. BACKLOG 'Not verified'에 넣었다.
- Claude settings merge의 새 temp 위치는 단위 테스트로만 확인했다.
- Claude·Codex의 run 전 `--version`은 probe하지 않았다. fence 밖 목록에 문서로만 적었다.
- 앱을 켤 때 사용자 HOME에서 도는 Cursor `--version`(readiness)은 여전히 fence 밖이다. 이 항목은 BACKLOG의 B3-4 (b) 결정 항목에 덧붙였다.
- CI의 `onboarding/machine.test.ts` 셸 probe 테스트 두 개가 다시 한 번 실패했다(1라운드 #213에서도 실패했다). 재실행에서는 통과했다.

**병합한 PR** (모두 develop)
- #228 eval reader: C4-1(#226 회귀, postmortem 포함), C4-3, C4-4, M4-7, M4-10, M4-4. 기록된 실행 957건으로 다시 확인했더니 Claude 실행 37건이 preset 읽기를 다시 제대로 센다. #226 reader로 채점한 라운드는 없어서, 기록된 결과가 바뀐 것은 없다.
- #229 fence: B4-1, C4-5, C4-2, B4-2, M4-1, M4-3, L4-2, M4-9.
  - B4-1(Cursor 컴파일 캐시)은 위조한 캐시 항목으로 확인했다. 그래서 Cursor의 모든 프로세스를 fence 안에서 돌린다.
  - 같은 계열인 Antigravity의 Python user-site 경로는 반증됐다.

**다음 라운드 후보**
- 불안정한 테스트 `onboarding/machine.test.ts`: 두 라운드에서 실패했다.
- 인용된 `'~'`가 들어간 리다이렉트 대상을 D4b가 profile로 본다(거짓 실패 쪽).
