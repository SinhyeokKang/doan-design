# 버디 변경 24시간 잠금 — spec

## 사용자

- **사람**: Settings > General에서 버디를 바꾸는 사람. 바꾸기 전에 확인을 한 번 받고, 바꾼 뒤 24시간 동안은 다시 바꿀 수 없다.
- **에이전트**: 해당 없음. CLI·skill·`doan onboarding`에는 버디가 없다(ARCHITECTURE §7 'First-run onboarding' Buddy step).

## 문제

- 지금 Settings > General은 버디 행을 누르거나 화살표 키로 움직이는 즉시 저장하고, 횟수 제한이 없다(PRODUCT §5 item 0 'General'). 버디를 언제든 몇 번이든 바꿀 수 있다.
- 사용자는 버디를 한 번 바꾸면 한동안(24시간) 바꾸지 못하게 하려 한다.

## 결정 (사용자 확인)

1. **잠금 시작**: Settings > General에서 확인을 거쳐 버디를 바꿨을 때만 24시간 잠금이 시작된다. first run의 Buddy step과 buddy screen에서 고른 것은 잠금을 시작하지 않는다.
2. **확인 dialog**: Settings > General에서 지금 버디가 아닌 버디를 고르면 바로 저장하지 않고 확인 dialog를 연다. 24시간 동안 다시 바꿀 수 없다고 알리고, 확인하면 저장한다. 저장에 성공하면 dialog가 닫히고 Settings > General로 돌아오며, 버디 목록이 블러로 덮인다.
3. **화살표 키**: 버디 행에서 화살표 키는 포커스만 옮긴다. 클릭·Space·Enter만 확인 dialog를 연다.
4. **잠긴 동안**: 버디 목록(다섯 행)을 문제 프로젝트 overlay와 같은 블러로 덮는다. 블러 위 아이콘 자리에는 지금 버디를 Home처럼 움직이는 모습으로 보여주고(크기는 draft에서 정한다), 그 아래에 남은 시간을 보여준다.
5. **남은 시간 표시**: "You can change your buddy again in 23 hours." 형태로 보여준다. 1시간 미만이면 분 단위로 보여준다. 화면을 보는 동안 갱신되고, 0이 되면 블러가 사라진다.
6. **시계 기준**: 마지막 변경 시각을 preferences에 저장하고 시스템 시계와 비교한다. 시계를 앞으로 돌려 잠금을 푸는 것은 막지 않는다. 시계가 뒤로 가서 저장된 시각이 미래가 되면 잠금은 유지하되, 남은 시간은 24시간을 넘지 않는다.

## 완료 조건

- Settings > General에서 다른 버디 행을 클릭하거나 포커스한 행에서 Space·Enter를 누르면 확인 dialog가 열리고, 그동안 버디·accent·Home은 바뀌지 않는다.
- dialog에서 Cancel·Escape를 누르면 아무것도 저장하지 않고 닫히며, 포커스는 누른 행으로 돌아간다.
- dialog에서 확인하면 버디와 변경 시각이 함께 저장되고, Home·docked buddy·working notice·accent가 지금처럼 재시작 없이 바뀐다.
- 저장에 성공하면 버디 목록이 블러로 덮이고, 블러 위에 움직이는 지금 버디와 남은 시간이 보인다. 덮인 행은 클릭·포커스·선택을 받지 않는다.
- 저장에 실패하면 지금처럼 Buddy step의 실패 notice와 Retry가 그룹 위에 보이고, 잠금은 시작되지 않는다. Retry는 dialog 없이 같은 버디를 다시 저장한다.
- 버디 행에서 화살표 키를 누르면 포커스만 옮겨 가고, 저장도 dialog도 일어나지 않는다.
- 앱을 다시 실행해도 24시간이 지나기 전이면 블러가 다시 보인다. 24시간이 지나면 화면을 다시 열지 않아도 블러가 사라지고 행을 고를 수 있다.
- first run의 Buddy step과 buddy screen에서 고르면 지금처럼 바로 저장되고, 잠금은 시작되지 않는다.
- 저장된 변경 시각이 미래여도 남은 시간은 24시간을 넘지 않는다.

## 비목표

- 시계 조작을 감지하거나 막지 않는다.
- main은 잠금을 강제하지 않는다. 버디를 고르는 renderer는 하나이고, 잠금은 Settings > General에서만 의미가 있다.
- first run Buddy step과 buddy screen의 동작은 바꾸지 않는다.
- 잠금 시간(24시간)을 설정으로 바꾸게 하지 않는다.
- 이전 버전 Doan이 preferences를 다시 쓰면 변경 시각이 사라져 잠금이 풀린다. 이를 막지 않는다.
