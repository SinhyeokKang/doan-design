# 캔버스 변경 Dot 설계

## 영향과 근거

PRODUCT §5 item 1의 표시·읽음 규칙과 ARCHITECTURE §7 Seen canvases, §10 Moving between machines, §11 Device-local files 규칙을 변경한다. 저장소 메타데이터를 쓰지만 캔버스 HTML은 편집하지 않으며 Git 작업·서버 동기화는 추가하지 않는다.

대상은 `app/src/main/canvasSeen.ts`, `shell.ts`, `view.ts`, `watch.ts`, `index.ts`의 읽음 IPC, `document/bindings.ts`, renderer의 `canvasNotice.ts`, `homeConversations.ts`, `sidebarSize.ts`, `rightPanelOpen.ts`와 관련 표시다. 사이드바·Show sidebar·접힌 대화 패널의 기존 대화 종료 신호를 말풍선으로 구분하되 각 집계 범위는 유지한다. Show sidebar에는 캔버스 변경이나 기록 오류를 새로 집계하지 않는다. 접근성 설명도 모호한 new activity 대신 대화 종료임을 나타낸다. 프로젝트로 모이는 신호는 현재의 행 가시성·우선순위를 유지한다. 공유 CSS·에셋 변경에 따른 캔버스 재로드와 Dot 판정은 서로 별개다.

## 내용 비교와 공유 저장

mtime 대신 HTML 바이트의 내용 지문을 비교한다. 절대 경로나 머신 시각을 공유 키로 쓰지 않는다. 캔버스 ID를 기준으로 저장하되 중복 ID·이동·동명 worktree를 실제 목록 규칙에 맞춰 검증한다. 지문 계산을 위한 파일 읽기와 UI 판정을 분리하고, 읽는 동안 내용이 바뀌면 보이지 않은 버전을 읽음 처리하지 않는다.

PoC는 기존 `DocumentBindings.current()`의 서버 응답 바이트 지문·loader 세대·frame 증거를 우선 재사용한다. renderer가 보낸 지문이나 목록의 최신 디스크 지문만으로 실제 표시를 증명하지 않는다. 화면 A와 디스크 B가 다른 경우 A의 열람으로 B를 읽음 처리하지 않는다. 불완전·불안정 응답, 로딩 실패·중단, 이전 문서의 늦은 요청도 거부한다. 프로토타입·썸네일의 응답을 메인 캔버스 열람 근거로 쓰지 않는다.

메타데이터는 `.doan/` 아래 별도 파일에 저장하는 방향이다. 구체 경로·단일 파일/캔버스별 파일·버전·원자 저장과 충돌 처리는 PoC에서 결정한다. 제공 서버·Export에 포함하지 않는다. 저장 실패나 읽기 실패·잘못된 형식·새 버전을 정상적인 ‘기록 없음’으로 덮어쓰지 않는다. Git 충돌 파일도 임의 덮어쓰기하지 않는다. 읽기 실패와 최초 등록을 구분한다.

등록 해제·일시 목록 실패·캔버스 이동·일시 소실은 공유 파일 삭제의 근거가 아니다. 앱이 기록을 자동 정리하거나 Git 병합을 하지 않는다. ID 없음·중복은 공유 읽음 저장을 보류하고 기존 판정과 오류를 유지하며, 다른 ID나 경로로 대상을 추측하지 않는다.

`.doan` 또는 대상 파일의 symlink 교체로 저장소 밖을 쓰지 않는다. 읽은 뒤 외부에서 바뀐 메타데이터를 오래된 메모리로 덮지 않고 다시 읽어 판정하거나 실패로 남긴다. 새 저장 경로의 외부 복사·pull 등 파일 변경을 감시해 표시를 갱신하되, 자체 읽음 저장은 캔버스 재로드나 읽음 저장 반복을 유발하지 않는다. Doan이 pull이나 다른 Git 명령을 실행하는 것은 아니다.

처음 등록의 baseline 기록도 공유 저장 성공 여부를 확인하되 실패했다고 기존 캔버스에 Dot을 새로 만들지 않는다. 초기 목록 기준과 저장 미완료 상태를 구분하고, 재시도까지 새로 생긴 캔버스를 최초 baseline에 섞어 읽음 처리하지 않는다. 등록 후 기록 소실·손상·미지원 버전은 첫 등록으로 되돌리지 않고 마지막 판정과 오류를 유지한다.

기존 로컬 mtime 기록에는 당시 HTML 내용이 없으므로 그대로 지문으로 변환해 과거 내용을 봤다고 주장할 수 없다. 최초 전환에서만 기존 mtime 판정을 사용해 캔버스 미읽음을 보존하고, 이미 읽은 캔버스에는 현재 HTML의 지문을 기록한다. 과거 내용을 모르는 미읽음은 실제 열람 전까지 읽음 지문을 만들어 덮지 않는다. 공유 형식은 이 전환된 미읽음을 단순 기록 부재와 구분해야 한다. 다른 머신의 첫 등록도 이를 baseline으로 지우지 않는다. 변환 완료 후 mtime 판정으로 돌아가지 않으며, 중단 후 재시도해도 미읽음이 사라지지 않아야 한다. 유효한 공유 기록은 같은 대상의 로컬 기록보다 우선한다. 부분 공유 기록·남은 로컬 기록의 전환은 대상별 fixture로 고정한다.

## 순수 함수와 형식

- 공유 기록·현재 지문·초기 등록 상태 → new/changed/seen/unknown 판정.
- 렌더링 세대·표시된 지문·현재 파일 지문 → 읽음 저장 허용 판정.
- 공유 쓰기 성공/실패 → Dot·실패 안내·재시도 상태.
- 대화 상태·캔버스 상태·행 가시성 → 단일 슬롯의 아이콘·문구·행 대상.
- 이전 로컬 기록·공유 기록 → 마이그레이션 작업 순서와 재시도.

새 공유 메타데이터의 형식은 버전을 명시하고 잘못된 형식·미지원 버전을 구분한다. schema 채택과 TS/Go 소비 여부는 저장 경로 PoC에서 정한다. CLI가 소비한다면 두 언어의 공통 fixture를 추가하고, 앱 전용이면 CLI를 억지로 추가하지 않는다. `.doan/config.json`이나 소켓 버전 변경은 현재 계획하지 않는다. 캔버스 HTML 관례·`doan check` 규칙도 바꾸지 않는다.

## PoC와 UI

두 임시 checkout에서 같은 HTML+메타데이터를 서로 다른 절대 경로·mtime으로 복사해 판정을 비교한다. 공유 CSS만 변경, 공유 이미지 교체, HTML 동일 내용 재저장, HTML 변경 후 이전 내용 복원, 내용만 다르고 mtime·크기는 같은 HTML, 읽기만 한 대화 종료를 각각 분리한다. 외부 메타데이터만 변경, 자체 쓰기 감시, Git 충돌·손상·권한 거부·쓰기 중단·미지원 버전·새 캔버스·ID 충돌·worktree 이동도 fixture로 확인한다. 저장 경로·schema·버전·감시·실제 표시 근거를 확정하기 전 구현에 들어가지 않는다.

기존 화면은 현재 캔버스의 Dot을 숨기므로, 기존 미읽음의 저장 실패까지 숨기지 않도록 `sidebarSlots`의 표시 규칙을 바꾼다. 이 Dot은 성공적으로 저장된 후에만 제거한다. 이미 본 상태의 저장 실패에는 변경 미열람 문구 대신 읽음 저장 실패 tooltip·접근성 설명을 사용한다. 메뉴·상위 신호에 가려져도 상태는 남고 상위 신호가 없어지면 Dot이 다시 드러난다. 최초 baseline 실패에는 이 규칙으로 새 Dot을 만들지 않는다.

오류 UI는 지속 notice가 아닌 Retry 토스트다. 해당 캔버스·프로젝트 재진입 때 재시도하고 실패하면 다시 표시한다. 같은 화면에서 반복 토스트나 자동 재시도 루프는 없다. Retry 중 중복 실행을 막고 진행 상태를 알리며, 실패하면 이유와 Retry를 유지하고 성공하면 제거한다. 토스트 제거 시 Retry에 있던 포커스만 현재 캔버스 영역 또는 Overview의 안정된 컨트롤로 돌린다. 다른 포커스는 유지한다. 기록 복구 없이 Retry로 손상 파일을 덮지 않는다.

프리셋은 설치된 Doan 0.1.3 `shape`를 읽었다. DESIGN.md의 슬롯·상태 아이콘·토스트를 따르고 Dot은 현재 버디의 accent를 사용한다.

## 디자인 드래프트 요청

- 경로 `.doan/canvases/canvas-activity-notices.html`, 캔버스 ID `canvas-activity-notices`.
- `activity-sidebar`: 캔버스 변경 Dot·읽음·대화 종료 말풍선, 답변 요청/작업 중 우선순위와 프로젝트 집계 상태.
- `activity-collapsed`: Show sidebar·접힌 대화 패널의 대화 종료 말풍선을 현행 집계 범위로 표시한다. Show sidebar에 변경 Dot이나 기록 오류를 추가하지 않는다.
- `activity-save-failure`: 현재 캔버스의 저장 실패 Dot·설명, 상위 상태에 가려졌다 다시 드러나는 상태, Retry 토스트·재시도 중·성공 후 상태.
- `activity-recovery`: 최초 baseline 실패에 새 Dot 없음, 기록 손상/소실 시 기존 판정 유지, ID 문제, 재진입 실패 토스트를 타일로 구분한다.
- 현행 사이드바 행·상태 슬롯·버튼·토스트를 코드와 DESIGN.md에서 복사한다. Dot은 버디 accent이며 지속 notice를 추가하지 않는다. 말풍선 표현과 새 문구는 아래 '선택한 안'을 따른다.
- 이 초안은 확정된 표시 규칙만 그린다. 공유 저장 경로·형식·버전과 실제 열람 증명 PoC는 구현 선행 조건으로 남기며, 초안 검토를 PoC 통과로 기록하지 않는다.
- 서브에이전트 작성 후 주 에이전트가 렌더링을 검토·수정하고 원격에 푸시한다. 사용자 시각 확인은 이후 별도로 받으며, 푸시를 승인으로 기록하지 않는다.

### 초안 검토 상태

네 프레임에 30개 타일을 그렸다. 220px 사이드바 안의 204×32px 행, 기존 16px 상태 슬롯·8px Dot, 384px 토스트를 쓰며 토스트는 가로로 넘치지 않는다. 상위 신호·메뉴에 가려진 실패 Dot, Retry 진행/성공, 최초 baseline 실패, 기존 판정 없음, ID 문제, 재진입과 복구 상태를 구분했다.

#### 선택한 안

- 말풍선: 사이드바 행, 프로젝트 행 집계, 접힌 Show sidebar·Show conversation 배지 모두 원형 말풍선을 쓴다. 접힌 버튼의 배지는 14px이고 위·오른쪽 2px에 놓는다. 12px 사각 말풍선은 작은 상자처럼 보여 사각형 캔버스 행 아이콘과 비슷해 보이기 때문이다.
- 대화 종료 문구: tooltip은 `Conversation finished — unread`, 접근성 설명은 `Show sidebar, conversation finished unread`와 `Show conversation, conversation finished unread`다. “conversation ending”은 어색하게 읽혀 쓰지 않는다.
- 저장 실패·Retry 문구: 토스트는 `Couldn’t save checkout’s read state. This folder is read-only.`, tooltip은 `Read state could not be saved for checkout`이다. Retry 중에는 `Saving checkout’s read state.`와 비활성 `Retrying` 버튼을 보인다.
- 복구 토스트 문구: 최초 baseline 실패는 `Couldn’t save the initial read state. This folder is read-only.`, 기록 손상·기존 판정 없음은 `Read-state records couldn’t be read. Restore them, then retry.`, ID 문제는 `Couldn’t save the read state because the canvas ID is missing or duplicated. Fix the ID, then retry.`다. 기록 손상의 이전 미읽음/읽음 타일은 같은 문구를 쓰고 Dot 유지 여부만 다르다.
- 실패·복구 문구는 앱의 기존 `Couldn’t …` 표현에 맞춘다.

사용자가 이 초안을 시각 확인해 확정했다. 정적 초안이며 실제 토스트 수명·포커스 복귀·공유 읽음 저장·이동 PoC는 검증하지 않았다. 메타데이터 경로·형식·버전도 이 초안으로 확정하지 않는다.

## 회귀 예방 근거

POSTMORTEM 2026-11-07 root migration의 “Test a failure at every write, not only the success path.”를 적용한다. 마이그레이션 각 쓰기 사이에서 중단해도 재시작 시 동일하게 판단하고 재시도해야 한다. 같은 항목의 “never an unsaved normalised state”에 따라 저장하지 못한 공유 읽음을 성공으로 투영하지 않는다. 기존 파일을 먼저 지워 복구 근거를 잃지 않는다.
