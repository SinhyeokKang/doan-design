# permission-mode — spec

출처: 실사용 테스트 이슈 "도안에서 에이전트 사용 시, 권한 모드 변경 가능해야함". 결정은 대화에서 사용자가 했다.

## 사용자

- **사람**: 입력창(Home·Overview·캔버스 패널)에서 대화의 권한 모드를 고른다. 승인 요청을 매번 누르지 않고 일을 맡기거나, 반대로 읽기만 하게 묶는다.
- **에이전트**: 얻는 것이 없다. 고른 모드는 provider의 실행 옵션으로만 전달되고, 가이드·CLI·`doan check`는 바뀌지 않는다.

## 문제

- 지금 Doan은 provider에 권한 모드를 넘기지 않는다. Claude는 `permissionMode` 없이, Codex는 `approvalPolicy`·`sandbox` 없이 시작한다(`app/src/main/conversation/runners.ts`). 그래서 사용자 자신의 설정 파일이 정한 모드만 적용된다.
- 바꾸려면 Doan 밖에서 Claude·Codex 설정 파일을 고쳐야 한다. 실사용에서 편집 하나하나를 승인해야 해서 번거롭다.
- PRODUCT §3 'Agent conversation foundation contract' 'Resume and permissions'가 "no forced bypass or preset"으로 이 동작을 정해 두었다. 이 feature는 그 규칙을 바꾼다(사용자 승인됨).
- 새 규칙: 기본은 사용자 설정이고, 사람이 고른 모드만 적용한다. Doan은 스스로 모드를 고르지 않는다. 예외는 하나다. 사람이 Claude의 계획 승인 요청을 승인하면, 그 승인 뒤 SDK가 알려 준 모드로 피커가 바뀐다(결정 6). Doan은 승인 요청을 지어내지 않는다는 규칙은 그대로다.

## 결정 (대화에서 확정)

1. 피커는 모델·노력 옆에 둔다. Home 입력창은 도구 줄에, Overview·캔버스 패널 입력창(DockedComposer)은 `composer-tray`의 Effort 뒤에 둔다. Settings 전용이 아니다.
2. 모드는 provider와 상관없이 공통 4개이고, 라벨은 영어다: **Default** · **Accept edits** · **Plan (read-only)** · **Full access**. Default는 지금 동작 그대로 사용자 설정을 쓴다. 트리거 aria-label은 `Permission: <label>`, 메뉴 제목은 `Permissions · <provider>`다. 메뉴 항목마다 한 줄 설명을 둔다(문구는 `/design-draft`에서 정한다).
3. Claude·Codex와 ACP(Cursor·Antigravity·Copilot)가 대상이다. ACP는 모델 목록처럼 첫 턴 전에 mode 목록을 미리 읽고, 공통 4개에 대응되는 것만 보여준다.
4. 모델·노력처럼 마지막 값을 provider별로 기억한다. 고르기만 해도 기억하고, Settings > Agents 'New conversations'의 값도 함께 바뀐다(PRODUCT §5 item 0 'New conversations'의 "picked or sent" 규칙과 같다). Full access도 같은 규칙으로 기억한다.
5. Full access는 확인 없이 바로 바뀐다. 대신 트리거가 모드명을 텍스트로 보이고, 경고 아이콘과 경고색(`text-warning`·`affordance-warning`)으로 켜져 있다는 것을 계속 보여준다. 색만으로 알리지 않는다. 왼쪽 색 선은 쓰지 않는다.
6. Plan의 뜻: 사람이 승인 요청을 승인하지 않는 한 파일을 바꾸지 않는다. Claude는 `ExitPlanMode` 승인 요청이 실행으로 넘어가는 지점이다. 승인하면 그 대화의 저장 모드와 피커가 SDK가 알려 준 모드로 바뀐다. Codex Plan은 승인 요청 없이 읽기만 한다.
7. 기존 대화의 피커는 그 대화의 저장값을 보인다. 바꾸면 그 대화의 값과 provider별 마지막 사용 값이 함께 바뀐다. 저장값을 지금 provider에서 고를 수 없으면 안내 없이 Default로 보인다.
8. 턴 실행 중에도 피커를 바꿀 수 있고, 바꾼 값은 다음 턴부터 적용된다. 따로 안내하지 않는다. 큐에 쌓인 메시지는 실제로 보낼 때의 피커 값을 쓴다.
9. 터미널 세션(legacy external path)에서는 모델·노력처럼 고정 트리거(`is-fixed`, "Set in your terminal")를 보인다.
10. Settings 'New conversations'의 Permission 행은 Agent가 provider일 때만 보인다. Last used이면 Model·Effort처럼 숨는다.

## 완료 조건

- Home 입력창 도구 줄과 Overview·캔버스 패널 입력창 tray에 권한 모드 피커가 있고, 네 모드를 고를 수 있다.
- Claude 대화에서:
  - Accept edits로 보낸 턴은 파일 편집에 승인 요청을 띄우지 않는다.
  - Plan으로 보낸 턴은 사람이 승인 요청을 승인하지 않는 한 파일을 바꾸지 않는다. `ExitPlanMode`를 승인하면 피커가 SDK가 알려 준 모드로 바뀐다.
  - Full access로 보낸 턴은 승인 요청을 띄우지 않는다. 예외: 폴더 settings(`disableBypassPermissionsMode`)가 bypass를 막으면 SDK가 실패 없이 Default로 시작해 승인 요청을 띄운다. Doan은 따로 처리하지 않고, 피커는 Full access로 남는다.
  - Default는 사용자 설정 그대로다(지금과 같다).
- Codex 대화에서도 같은 네 경우가 성립한다. Codex Plan 턴은 파일을 바꾸지 않고 승인 요청도 띄우지 않는다. 대화 중 모드를 바꾸면 다음 턴부터 적용되고, Default로 돌아가면 사용자 설정으로 돌아간다.
- 고른 모드는 대화에 저장되어, 재시작 뒤 그 대화를 이어 갈 때도 유지된다.
- 새 입력은 provider별 마지막 모드로 시작한다. Settings 'New conversations'에서 provider를 골랐으면 Permission 행에 같은 값이 보인다.
- Full access일 때 트리거가 모드명, 경고 아이콘, `text-warning` 색을 보인다.
- 터미널 세션에서는 고정 트리거가 보이고 모드를 바꿀 수 없다.
- ACP provider: design.md 대응표에서 확정한 모드만 피커에 보이고, 대응표가 빈 provider는 피커가 없다(지금 동작).

## 비목표

- provider 고유 모드(Claude `dontAsk`·`auto`, Codex approval·sandbox의 다른 조합)를 그대로 보여주기.
- 한 턴 실행 중에 그 턴의 모드 바꾸기. 바꾼 모드는 다음 턴부터 적용한다.
- 셸 `doan check` 연결로 이어 가는 터미널 세션(legacy external path)의 모드 바꾸기. 그 경로는 모델·노력도 받지 않는다(PRODUCT §5 item 2 'Terminal session').
- Full access의 확인 대화상자.
- 프로젝트별 기본 모드.
- 턴마다 그 턴의 모드를 이벤트에 기록하기.
