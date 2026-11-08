# provider-profile-isolation — tasks

순서: PoC → 결정 확인 → 순수 함수 → shell(프로세스 띄우기) → 실제 앱 확인 → 승격.

결정된 범위에는 새 화면과 문구가 없어 `/design-draft` 단계가 없다. 예외: P1이 결정 Q6의 'Antigravity를 막는' 분기로 가면 T2a를 한다.

PoC와 측정 작업(T0, T1)은 AGENTS.md 'Commands'에 없는 도구도 쓸 수 있다. 스크립트와 evidence는 `.scratch/provider-profile-isolation/`에 두고, 결과는 이 문서들이나 commit 메시지에 적는다. 실제 로그인은 그때마다 사용자 승인을 받는다.

PoC 결과(통과/실패, 측정값, 날짜)는 design.md §8 아래에 적는다. `.scratch/`는 commit되지 않기 때문이다.

## T0. PoC P1·P3 — Antigravity의 실제 상태 쓰기와 profile 안 작업

- pinned 1.3.0 archive를 `.scratch/provider-profile-isolation/`에 풀어 읽는다(실행 없음). 찾을 것:
  - `antigravity-cli` 디렉터리와 Keychain 항목을 쓰는 코드와 그 프로세스(ACP 서버, language server).
  - home을 찾는 방법.
  - 경로나 저장소를 바꾸는 변수와 인수.
  - agent에게 skill 경로를 알려 주는 문장.
- 격리 HOME(Keychains 링크 없음)에서 Antigravity 상태 확인만 돌리고 `app/runtime/real-state.ts` fingerprint를 전후로 비교한다.
- 사용자 승인 아래 Keychains를 링크하고 실제 로그인을 한다. 대화 한 턴을 돌리며 ACP frame을 기록하고, 로그아웃한다. Keychain 항목 `gemini | antigravity`는 속성만 전후로 기록한다.
- 끝나면 로그아웃하고 profile과 provider Keychain 항목을 지운 뒤 fingerprint로 확인한다.
- 검증: `.scratch/provider-profile-isolation/`의 일회성 스크립트(PoC 전용 도구 허용). 결과가 design.md §8 P1·P3에 있고 §3.2의 경로(1·2·3)와 §3.3의 분류((i)·(ii))가 정해진다.
- 사람의 `agy` 로그인이 바뀌는지도 전후로 확인한다(결정 Q6의 분기 근거).
- **사용자 승인 필요**(그때): 실제 로그인, 실제 Keychain을 건드리는 링크.
- **commit 경계**: `docs(feature): provider-profile-isolation PoC P1 and P3 results`

## T1. PoC P2 — Seatbelt fence

- 손으로 쓴 정책(design §3.1)과 `sandbox-exec -D`로 다섯 provider의 run을 띄운다. 띄우는 방법은 앱과 같은 명령과 환경이다(dev 앱을 고친 `.scratch` 사본이나 별도 스크립트).
- design §8 P2의 (a)–(e)를 provider마다 Ask first와 Full access에서 확인한다. Codex는 Accept edits에서도 확인한다. 실제 턴에서 `doan`이 skill 목록에 있는지 묻는다(POSTMORTEM 2026-11-07).
- 다른 profile에는 미끼 파일을 두고, agent가 `cat`과 파일 도구로 읽으려 할 때 실패하는지 본다. 실제 다른 provider의 대화 기록은 쓰지 않는다.
- 검증: `.scratch/provider-profile-isolation/`의 일회성 스크립트(PoC 전용 도구 허용). 결과가 design.md §8 P2에 provider × 모드 표로 있다.
- **사용자 승인 필요**(그때): 다섯 provider의 실제 로그인(T0의 Antigravity profile을 다시 쓴다).
- **commit 경계**: `docs(feature): provider-profile-isolation PoC P2 results`

## T2. 결정 확인

- Q1–Q6은 이미 결정됐다(design §10). 여기서는 PoC 결과를 그 결정에 적용한다: §3.2의 경로(1·2·3)와 Q6 분기, §3.3의 분류와 Q3 적용 여부.
- P2에서 실패한 provider가 있으면 §8 P2의 대안 (가)·(나)·(다) 중 하나를 추천과 함께 사용자에게 묻는다(남은 확인 필요).
- 결과에 맞게 spec·design·tasks를 고친다. PRODUCT·ARCHITECTURE는 T7에서 고친다.
- 검증: design.md §10의 '남은 확인 필요'가 결정으로 바뀌었고, §3.2·§3.3에 고른 경로가 적혀 있다.
- **commit 경계**: `docs(feature): provider-profile-isolation decisions`

## T2a. (조건부) Antigravity를 막는 화면

- P1에서 실제 상태 쓰기를 막을 방법이 없고 그 쓰기가 사람의 `agy` 로그인을 바꿀 때만 한다(결정 Q6).
- Doan의 `clarify` preset을 읽고 Settings > Agents의 Antigravity 줄 문구를 정한다. `/design-draft`로 초안을 그리고, 사용자가 앱에서 확인한다. 구현은 T4에 더한다(로그인과 새 대화 거절, 기존 대화의 resume 처리 포함).
- 검증: `doan check --json` 오류 0, `doan ls --json`에 나옴, 사용자가 앱에서 초안을 확인한다.
- **commit 경계**: `docs(design): draft Antigravity blocked state`

## T3. 순수 함수

- `fencePolicy`, `fenceArgs`, `fencedCommand`(design §4). T0 경로 1이면 Antigravity 환경 변수를 `providerEnv`에 더하고 `RESERVED`에 넣는다.
- 테스트: design §4의 사례 전부. 정책 스냅숏은 T1에서 통과한 정책 문장과 같아야 한다.
- 검증: `npm --prefix app test`, `npm --prefix app run typecheck`, `npm --prefix app run lint` 통과.
- **commit 경계**: `feat(app): fence policy for Doan-connection runs`

## T4. shell — run을 fence 안에서 띄운다

- Codex app-server(`runners.ts`), Claude `spawnClaudeCodeProcess`(`runners.ts`), ACP 서버(`acpRunner.ts`)가 Doan 연결 run일 때 `fencedCommand`를 쓴다. legacy external run은 그대로 둔다.
- main이 `realpath`로 푼 userData, profile, 실제 HOME을 lease 준비(`manager.ts` `acquire`/`launch` 또는 `conversation/prepare.ts`)에서 넘긴다.
- `sandbox-exec`가 없거나 띄우지 못하면 기존 시작 실패로 끝난다(결정 Q5).
- T0 경로 2이면 Antigravity의 `acpExec`(로그인·상태 확인·로그아웃)에도 fence를 붙인다.
- T0이 (i)이면 Antigravity 정책에 skill 경로 쓰기 금지를 넣는다(결정 Q3).
- 테스트: 세 runner 테스트(`runners.test.ts`, `acpRunner.test.ts`)에 Doan 연결 run은 `/usr/bin/sandbox-exec`로 시작하고 legacy external run은 아니라는 사례. fence 인수가 거절되면 프로세스를 띄우지 않고 실패한다는 사례.
- 검증: `npm --prefix app test` 통과, `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: `feat(app): run Doan-connection agents inside the userData fence`

## T5. 실제 앱 확인

- `/runtime-test`로 격리된 dev 앱에서 바뀐 동작만 짧게 확인한다.
  - 다섯 provider: 미끼 파일 읽기 실패, `doan work update`, 첨부 이미지, resume.
  - Codex Ask first: 자체 sandbox 명령과 `doan handoff`의 두 번 승인.
  - Antigravity: 연결 확인·한 턴·로그아웃 전후 real-state fingerprint와 Keychain 항목 속성.
  - T1에서 이미 확인했고 T3·T4가 바꾸지 않은 항목은 다시 하지 않는다.
- 검증: `/runtime-test` 보고서와 스크린샷, real-state 전후 비교가 같다.
- **사용자 승인 필요**: 실제 로그인.
- commit 없음(evidence는 `.scratch/`, 결과는 T7의 commit 메시지에 적는다).

## T6. 리뷰

- `/code-review`, `/refactor`, 필요하면 `/postmortem`(이 feature가 결함 수정이므로 Antigravity Keychain 변경과 profile 간 읽기를 POSTMORTEM에 적을지 판단한다).
- 검증: `node .agents/skills/verify/scripts/verify.mjs` 통과.
- **commit 경계**: refactor가 있으면 `refactor(app): …`

## T7. 승격과 정리

- `docs/ARCHITECTURE.md`(영어):
  - §7 'Agent conversation runtime and IPC'의 "The app does not sandbox the agent…"를 "Doan userData만 Doan 연결 대화 run에서 막는다"로 좁혀 고친다(결정 Q1).
  - §7 'Agent authentication'의 'Profiles'에 fence(막는 경로, 다시 여는 경로, 붙는 프로세스, fail closed)를 적는다.
  - 'Antigravity server'에 T0에서 더한 변수를 적는다.
  - 'Known limits'를 고친다:
    - 같은 uid의 다른 프로세스는 userData를 읽는다.
    - userData를 지워도 Claude·Codex Keychain 항목이 남는다.
    - 답하지 않은 `stop_required` 확인은 종료로 취소되고 연결이 남는다(결정 Q4).
    - P2·P3에서 남은 provider별 한계와, Q6에서 문서화로 간 Antigravity 쓰기.
- `docs/PRODUCT.md`(영어): Q6에서 Antigravity를 막았거나 P2 대안 (다)를 골랐으면 §3 'Resume and permissions'나 In scope 7을 고친다. 바꾸지 않으면 손대지 않는다.
- `docs/BACKLOG.md`: 네 줄을 지우고, 남은 것만 새 줄로 적는다.
- `docs/DIRECTORY.md`: 새 디렉터리가 없으면 손대지 않는다.
- `docs/features/provider-profile-isolation/`를 지운다.
- 검증: PRODUCT·ARCHITECTURE·BACKLOG에 이 feature 문서의 절이나 결정 번호를 가리키는 말이 없다(`grep -rn "provider-profile-isolation" docs`가 비어 있다).
- **commit 경계**: 문서마다 하나씩 — `docs(ARCHITECTURE): fence Doan-connection runs from other profiles`, `docs(BACKLOG): profile isolation defects settled`, (필요하면) `docs(PRODUCT): …`, 마지막에 `docs(feature): remove provider-profile-isolation`.
