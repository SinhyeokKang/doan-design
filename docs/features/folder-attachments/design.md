# 폴더 첨부 설계

## 근거와 영향 범위

- PRODUCT §3 Conversation, §5 item 1 Attachments와 ARCHITECTURE §7 Model lists and attachments를 확장한다. §3 Out of scope에 해당하지 않는다.
- `app/src/main/attachments.ts`는 현재 regular file만 허용한다. `app/src/main/conversation/types.ts`의 `AttachmentRecord.kind`는 image/file만 표현한다. 폴더 종류와 표시를 추가해야 한다.
- Electron 선택창, main 첨부 검사, 대화 저장·프롬프트·제공자 전달, renderer 첨부 칩과 세 입력창을 다룬다. CLI와 캔버스 제공 범위는 넓히지 않는다.
- UI는 기존 첨부 칩과 DESIGN.md의 토큰·컨트롤을 따른다. 읽은 프리셋: 설치된 Doan 0.1.3의 `shape` (`doan design-skill shape --json`).

## 처리 경계

세 입력 경로가 main의 같은 폴더 검사와 첨부 등록을 사용한다. 실제 경로와 디렉터리 여부를 확인하고, 전송 수락 시 다시 검사한다. 이름·경로는 프롬프트의 신뢰하지 않는 데이터 영역에 넣는다. 디렉터리의 전체 크기나 파일 목록을 계산하려고 재귀 탐색하지 않는다.

기존 제공자 권한과 userData 보호를 유지한다. 프로젝트 밖 경로 첨부 허용과 제공자의 실제 읽기 허용은 별개다. 경로만 전달하며, 이미지 블록 처리에 폴더가 들어가지 않도록 구분한다.

## 순수 함수와 형식

- 첨부 종류별 표시와 프롬프트 descriptor 결정, 파일·폴더 혼합 한도 판정, 종류 변경·누락 결과 변환을 `/tdd` 대상으로 삼는다.
- 앱 내부 IPC와 대화 기록의 attachment 형식이 바뀐다. 기존 기록 읽기 호환성을 고정한다. 공유 JSON Schema·CLI 응답·소켓 버전 변경은 계획하지 않는다.
- 폴더 크기는 파일 크기로 해석하지 않는다. 구체 타입과 저장 표현은 기존 기록 reader를 조사한 뒤 구현 설계에 고정한다.
- 캔버스 관례와 `doan check` 규칙 변경은 없다.

## PoC와 회귀 예방

macOS 선택창의 파일·폴더 혼합 선택, 실제 Finder 드롭·붙여넣기, 다섯 제공자의 폴더 경로 처리를 먼저 확인한다. 현재 확인한 것은 코드와 문서이며 실제 동작 검증은 하지 않았다.

POSTMORTEM 2026-11-09의 userData 보호 예방 규칙은 “the decoy is blocked, and the run's own profile, `runtime.json` and attachments are reachable”이다. 외부 폴더를 허용해도 다른 제공자의 프로필 접근을 열지 않는 양방향 검증을 유지한다. 경로 오류는 POSTMORTEM 2026-10-22의 “test `ENOTDIR`, a NUL byte, an over-long name, a symlink loop”를 적용한다.
