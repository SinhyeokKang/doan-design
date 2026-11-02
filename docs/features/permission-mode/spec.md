# permission-mode — spec

출처: 실사용 테스트 이슈 "도안에서 에이전트 사용 시, 권한 모드 변경 가능해야함". 결정은 대화에서 사용자가 했다.

## 사용자

- **사람**: 입력창(Home·Overview·캔버스 패널)에서 대화의 권한 모드를 고른다. 승인 요청을 매번 누르지 않고 일을 맡기거나, 반대로 읽기만 하게 묶는다.
- **에이전트**: 얻는 것이 없다. 고른 모드는 provider의 실행 옵션으로만 전달되고, 가이드·CLI·`doan check`는 바뀌지 않는다.

## 문제

- 지금 Doan은 provider에 권한 모드를 넘기지 않는다. Claude는 `permissionMode` 없이, Codex는 `approvalPolicy`·`sandbox` 없이 시작한다(`app/src/main/conversation/runners.ts`). 그래서 사용자 자신의 설정 파일이 정한 모드만 적용된다.
- 바꾸려면 Doan 밖에서 Claude·Codex 설정 파일을 고쳐야 한다. 실사용에서 편집 하나하나를 승인해야 해서 번거롭다.
- PRODUCT §3 'Agent conversation foundation contract' 'Resume and permissions'가 "no forced bypass or preset"으로 이 동작을 정해 두었다. 이 feature는 그 규칙을 바꾼다(사용자 승인됨).

## 결정 (대화에서 확정)

1. 피커는 입력창 도구 줄의 모델·노력 옆에 둔다. Settings 전용이 아니다.
2. 모드는 provider와 상관없이 공통 4개다: **기본(내 설정)** · **편집 자동 승인** · **계획(읽기 전용)** · **모두 허용**. 기본은 지금 동작 그대로 아무 모드도 넘기지 않는다.
3. Claude와 Codex가 대상이다. Cursor·Antigravity·Copilot(ACP)은 각 agent가 알려주는 mode를 PoC로 확인한 뒤, 공통 4개에 대응되는 것만 보여준다.
4. 모델·노력처럼 마지막 값을 provider별로 기억한다. 고르기만 해도 기억하고, Settings > Agents 'New conversations'의 값도 함께 바뀐다(#6과 같은 규칙).
5. '모두 허용'은 확인 없이 바로 바뀐다. 대신 피커 트리거가 경고색으로 바뀌어 켜져 있다는 것을 계속 보여준다.

## 완료 조건

- Home·Overview·캔버스 패널 입력창 도구 줄에 권한 모드 피커가 있고, 네 모드를 고를 수 있다.
- Claude 대화에서 '편집 자동 승인'으로 보낸 턴은 파일 편집에 승인 요청을 띄우지 않는다. '계획'으로 보낸 턴은 파일을 바꾸지 않는다. '모두 허용'으로 보낸 턴은 승인 요청을 띄우지 않는다. '기본'은 사용자 설정 그대로다(지금과 같다).
- Codex 대화에서도 같은 네 경우가 성립한다. 대화 중 모드를 바꾸면 다음 턴부터 적용되고, '기본'으로 돌아가면 사용자 설정으로 돌아간다.
- 고른 모드는 대화에 저장되어 재시작 뒤 그 대화를 이어 갈 때도 유지된다.
- 새 입력은 provider별 마지막 모드로 시작하고, Settings 'New conversations'에 같은 값이 보인다.
- '모두 허용'일 때 트리거가 경고색이다.
- ACP provider: PoC 결과에 따라 대응되는 모드만 피커에 보이고, 대응이 없으면 피커가 보이지 않는다(지금 동작).

## 비목표

- provider 고유 모드(Claude `dontAsk`·`auto`, Codex approval·sandbox의 다른 조합)를 그대로 보여주기.
- 한 턴 실행 중에 모드 바꾸기. 바꾼 모드는 다음 턴부터 적용한다.
- 셸 `doan check` 연결로 이어 가는 터미널 세션(legacy external path)의 모드 바꾸기. 그 경로는 모델·노력도 받지 않는다(PRODUCT §5 item 2 'Terminal session').
- '모두 허용'의 확인 대화상자.
- 프로젝트별 기본 모드.
