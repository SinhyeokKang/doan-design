# seen-local 설계

## 영향받는 구성 요소

- **앱(main)**: `seenRecords.ts`(공유 기록 읽기·쓰기), `canvasSeen.ts`(판정·계획, 기기 로컬 메모리), `readState.ts`(흐름·Retry). 렌더러의 점 표시(`canvasNotice.ts`)와 IPC(`CanvasRow.unseen`, `saveFailed`, `read-state:*`)는 바꾸지 않는다.
- **CLI·스킬**: 영향 없다. 지금도 CLI는 `.doan/seen/`을 읽지 않는다.
- **형식**: userData `canvas-seen.json`이 v2에서 v3으로 올라간다. 공유 스키마(`schema/`)는 없으므로 JSON Schema 변경은 없다(ARCHITECTURE §11 'Device-local files without shared schemas').

## 저장 구조

- `<userData>/canvas-seen.json` v3: root별로 `{ migrated: true, canvases: { <canvas-id>: { html } | { unseen: "migrated" } } }`.
- 키는 지금과 같이 root + 루트에서 유일한 캔버스 ID다. ID가 없거나 중복이면 지금처럼 기록하지 않는다. worktree는 root가 다르므로 각자 기록을 가진다.
- 쓰기는 기존 기기 로컬 파일과 같이 임시 파일 + rename. 더 새로운 `v`의 파일은 덮어쓰지 않는다.

## 전환(마이그레이션)

- root에 `migrated`가 없으면 한 번만 `.doan/seen/`을 읽는다.
  - 마커와 기록이 유효하면 그 값을 로컬 `canvases`로 복사한다.
  - 마커가 없으면 지금의 첫 등록처럼 첫 목록의 지문으로 기준선을 만든다.
  - v2의 `legacy`(mtime 기록)가 남은 root는 지금 변환 규칙(본 것은 `html`, 아니면 `unseen: "migrated"`)대로 로컬에 바로 쓴다.
  - 기록이 손상·충돌·읽기 불가·더 새 버전이면 읽을 수 있는 것만 쓰고, 나머지 캔버스는 기준선으로 본다. 판단: 공유 기록이 앞으로 쓰이지 않으므로 복구를 기다리게 하는 Retry를 남길 이유가 없다 → 확인 필요 항목으로 남기지 않고 이 규칙으로 정한다(리뷰에서 바뀔 수 있다).
- 복사 후 `migrated: true`를 기록하면 이 root는 다시 `.doan/seen/`을 열지 않는다.

## 순수 함수로 뺄 부분 (/tdd 대상)

- `migrateRoot(memory, reads, rows)` → 로컬 root 기록: 공유 기록 복사, 기준선, legacy 변환, 손상 기록 처리.
- `judge(rootRecord, rows, last)` → 판정: 공유 기록 대신 로컬 기록만 입력으로 받는다.
- `markShown(rootRecord, row, hash)` → 바뀐 root 기록 또는 null(이미 같으면 쓰지 않음).
- `parseLocalSeen(text)` / `localSeenText(value)`: v1·v2 → v3 변환 포함.

## 지울 것

- `seenRecords.ts`의 쓰기 경로(`writeSeen`, 바이트 재확인, 임시 파일 정리, 심볼릭 링크 거부). 읽기는 전환용으로만 남긴다.
- 공유 기록이 사라짐·충돌했을 때의 토스트와 Retry 경로 중 공유 기록에만 해당하는 것(`RootProblem` "records"/"unsupported").

## 규칙·결정 영향

- PRODUCT §5 item 1 'Canvas notice'의 "The record lives with the project…" 문단과 "Doan never deletes records…", 손상 기록 문장을 기기 로컬 기준으로 다시 쓴다.
- ARCHITECTURE 첫머리 'Project directory'의 `seen/` 언급, §7 'Seen canvases'의 Shared records·Writes, §11 기기 로컬 파일 목록을 고친다.
- git 명령(PRODUCT §3 Out of scope 6)은 지금도 쓰지 않고, 앞으로도 쓰지 않는다. 오히려 추적 파일 변경이 없어진다.
- `doan check` 규칙과 캔버스 규약은 바뀌지 않는다.

## postmortem 참고

- `docs/postmortem/2026-11.md`: FIFO로 된 seen 기록이 `open(2)`에서 libuv 스레드를 붙잡은 사례. 전환용 읽기도 `readRegularFileSync` 계열을 그대로 써서 일반 파일만 연다.

## PoC 의존

- 없다.
