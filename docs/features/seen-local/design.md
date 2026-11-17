# seen-local 설계

## 영향받는 구성 요소

- **앱(main)**: `seenRecords.ts`, `canvasSeen.ts`, `readState.ts`, `watch.ts`, root 별칭 이동(`index.ts`의 `seenStore.copyRoots`). 렌더러의 점 표시(`app/src/renderer/canvasNotice.ts`)와 IPC(`CanvasRow.unseen`, `saveFailed`, `read-state:*`)는 바꾸지 않는다.
- **CLI·스킬**: 영향이 없다. CLI는 지금도 `.doan/seen/`을 읽지 않는다.
- **형식**: userData `canvas-seen.json`이 v2에서 v3으로 올라간다. 공유 스키마(`schema/`)는 없다(ARCHITECTURE §11 'Device-local files without shared schemas').

## 저장 구조

- `canvas-seen.json` v3에는 root별로 `{ migrated: true, canvases: { <canvas-id>: { html } | { unseen: "new" | "migrated" } } }`를 둔다.
- 키는 지금처럼 root와, 그 root에서 한 번만 쓰인 캔버스 ID다. ID가 없거나 여러 캔버스가 같은 ID를 쓰면 기록하지 않고 마지막 판정을 유지한다. git merge 뒤 기록이 있던 ID가 중복되면 기록은 그대로 두고, 중복이 풀린 뒤 다시 비교한다. worktree는 root가 다르므로 기록도 따로 가진다.
- `{unseen:"new"}`는 새 캔버스로 판정한 순간 쓴다. 그래서 재시작해도 점이 남는다. 보여 주면 `{html}`로 바뀐다.
- 쓰기는 다른 기기 로컬 파일과 같이 임시 파일에 쓰고 rename한다.
- 손상된 파일은 옆으로 옮기고 빈 상태에서 시작한다(`onboarding.json`과 같은 방식). `v` > 3인 파일은 덮어쓰지 않고, 그 실행 동안 메모리에서만 판정한다.
- 등록 해제는 root 기록을 지우지 않는다.
- `copyRoots`(별칭 → 실제 경로)는 실제 경로 쪽 값을 우선하고, 캔버스 단위로 빈 곳만 별칭 쪽 값으로 채운다. `migrated`는 둘 중 하나라도 true면 true다.

## 새 캔버스 판정

- root마다 메모리에만 상태를 둔다. 앱 시작이나 root 등록 뒤 첫 목록에서 기록이 없는 ID는 `{html}`로 기록한다. 이 기록을 디스크에 쓰지 못해도 해롭지 않다. 다음 실행의 첫 목록이 다시 기준선이 되기 때문이다. 그래서 지금의 frozen baseline은 필요 없다.
- 이후 목록에서 기록이 없는 ID가 나타나면 바로 판정하지 않고 2초 유예(pending)에 둔다.
  - 그 ID가 나타나기 2초 전부터 유예가 끝날 때까지 git 신호가 바뀌면 `{html}`로 기록한다. 점은 켜지지 않는다.
  - 그 사이 git 신호가 바뀌지 않으면 `{unseen:"new"}`로 기록하고 점을 켠다.
  - 유예 중에 캔버스가 보여지면 `{html}`로 기록한다.
- **git 신호**는 다음 값의 묶음이다. HEAD 파일 내용, 즉 브랜치 이름이나 detached 커밋. 그리고 `FETCH_HEAD`·`ORIG_HEAD`의 크기·mtime·내용 해시.
  - 같은 브랜치의 커밋은 ref만 바꾸고 이 묶음은 바꾸지 않는다. 그래서 에이전트의 커밋 직후에도 새 캔버스 점이 켜진다.
  - pull, merge, rebase는 `FETCH_HEAD`나 `ORIG_HEAD`를 쓴다. 브랜치 전환은 HEAD를 바꾼다.
- **경로 해석**: `.git`이 디렉터리면 gitdir이다. 파일이면 `gitdir:`을 따라간다(`onboarding/gitConfig.ts` `configPath`의 해석을 재사용한다). `FETCH_HEAD`·`ORIG_HEAD`·`HEAD`는 worktree별 gitdir에 있다. ref나 `packed-refs`는 읽지 않으므로 `commondir`을 해석할 필요가 없다. Go `cli/internal/repo/git_parse.go`의 `parseGitFile`·`parseHead`와 같은 규칙으로 파싱한다.
- **읽기**: 모든 git 파일은 `readRegularFileSync`(`app/src/main/regularFile.ts`)로 일반 파일만 연다. 읽을 수 없거나 git 저장소가 아니면 신호는 늘 같은 값이다. 그 경우 새 ID는 2초 뒤 점이 된다.
- **감시**: `watch.ts`는 `.doan/`을 이미 감시한다. 여기에 gitdir의 `HEAD`·`FETCH_HEAD`·`ORIG_HEAD`를 부모 디렉터리 감시로 추가한다. git 신호가 바뀌면 유예 중인 ID를 다시 판정한다. git 명령은 실행하지 않는다(PRODUCT §3 Out of scope 6).
- 판단 근거: pull·브랜치 전환·재시작 때 한꺼번에 들어오는 캔버스가 점을 남발한다. 사용자는 앱이 지켜본 것만 켜기로 정했다. git은 작업 트리를 먼저 쓰고 HEAD와 ref를 나중에 바꾸므로, 유예 없이 판정하면 경쟁이 생긴다.
- 기각한 대안: 한 목록에 새 ID가 N개 이상 나타나면 기준선으로 보는 방식. 에이전트가 한 번에 여러 캔버스를 만드는 경우와 구분하지 못한다.

## 전환(마이그레이션)

- root 기록에 `migrated`가 없으면 한 번만 `.doan/seen/`을 읽는다. 읽기 경로는 지금의 `readSeen`(일반 파일만 연다)을 재사용한다.
  - 유효한 기록은 그대로 복사한다.
  - 손상·충돌·읽기 불가·`v` > 1인 기록, 또는 마커가 없는 경우에는 이 기기의 v2 메모리가 아는 마지막 판정을 옮긴다. 켜져 있었으면 `unseen:"migrated"`, 아니면 `html`이다. 마지막 판정이 없으면 기준선(`html`)으로 쓴다. 토스트는 띄우지 않는다.
  - v2의 `legacy`(mtime) 기록이 남은 root는 지금 변환 규칙으로 로컬에 바로 쓴다.
  - 공유 기록에도 없고 이 기기가 '새 캔버스'로 판정하던 캔버스는 `unseen:"new"`로 둔다.
- 복사한 뒤 `migrated: true`를 쓰면 다시 `.doan/seen/`을 열지 않는다.
- **다운그레이드**: 이전 앱은 v3를 더 새 파일로 보고 쓰지 않는다. 메모리가 비어 있으므로 `.doan/seen/`을 정본으로 다시 읽고 다시 쓴다. 오래된 점과 추적 파일 변경이 돌아오지만 받아들인다.

## 순수 함수로 뺄 부분 (/tdd 대상)

- `parseLocalSeen(text)` / `localSeenText(value)`: v1·v2 → v3 변환, 손상 판정, 더 새 `v` 판정을 포함한다.
- `migrateRoot(v2Memory, reads, rows, lastVerdict)` → root 기록.
- `absorbFirst(rootRecord, rows, fingerprints)` → 첫 목록 기준선을 적용한 root 기록.
- `settlePending(pending, gitSignalHistory, now)` → `html` 또는 `unseen:"new"` 또는 계속 대기.
- `parseGitSignal(files)`, `resolveGitDir(dotGit)`.
- `judge(rootRecord, rows, last)` / `markShown(rootRecord, row, hash)`: 로컬 기록만 입력으로 받는다.
- `mergeRoots(real, alias)`: `copyRoots`의 v3 병합.

## 지울 것

- `seenRecords.ts`의 쓰기 경로: `writeSeen`, `SeenWriteError`, `recordText`, `readOnlyError`, 바이트 재확인, 임시 파일 정리, 심볼릭 링크 거부. 읽기는 전환용으로만 남긴다.
- `canvasSeen.ts`: `RootMemory.baseline`·`known`, `Phase`의 "migrate"·"baseline", `plan`, `RootProblem` "records"·"unsupported".
- `readState.ts`: frozen baseline 쓰기, `recordIds`, `writeProblem` "baseline", 공유 기록 토스트.
- `watch.ts`: `Change.seen`, `SEEN`과 그 소비처.
- `seenProof.ts`는 남긴다. 무엇이 화면에 보였는지 증명하는 일은 저장 위치와 무관하다.

## 규칙·결정 영향

- PRODUCT §5 item 1 'Canvas notice'를 다시 써야 한다.
  - 정의 문장의 "or that appeared since"
  - "The record lives with the project…" 문단
  - "lights canvases added after that", "Doan never deletes records…"
  - 손상 기록과 첫 등록 실패 문장
- ARCHITECTURE를 다시 써야 한다.
  - 첫머리 'Project directory'의 `seen/` 언급
  - §7 'Seen canvases'(Shared records, Verdicts, Device-local memory, Writes)
  - §11 기기 로컬 파일 목록
- git 명령은 실행하지 않는다. 오히려 추적 파일 변경이 없어진다. 앱은 git 파일을 읽기만 한다.
- `doan check` 규칙과 캔버스 규약은 바뀌지 않는다.

## postmortem 참고

- `docs/postmortem/2026-11.md`: FIFO인 seen 기록과 `.git`·`commondir`이 `open(2)`에서 libuv 스레드나 main을 붙잡았다. 새로 읽는 git 파일도 모두 `readRegularFileSync`로 연다.
- `docs/postmortem/2026-10.md`: `watch.ts` 재무장 사례. 대상이 교체되면 감시가 끊긴다. 그래서 git 파일도 부모 디렉터리를 감시한다.

## PoC 의존

- 없다.
