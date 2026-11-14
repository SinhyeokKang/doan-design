# new-project-folder — spec

Project 단계(첫 실행과 Add Projects 페이지)의 'Open a local folder' 카드에 New folder를 둔다. 누르면 macOS 저장 창에서 이름과 위치를 정하고, Doan이 그 자리에 빈 폴더를 만든 뒤 Choose folder로 고른 폴더처럼 설정 패널로 넘어간다.

## 사용자

- **사람**: 아직 폴더가 없는 새 디자인 프로젝트를 Finder를 거치지 않고 Doan에서 시작한다.
- **에이전트**: 해당 없음. 에이전트는 이미 `mkdir`과 `doan init`으로 같은 일을 한다. CLI와 `doan onboarding`은 바뀌지 않는다.

## 문제

- 빈 폴더에서 Doan 프로젝트를 시작하는 일 자체는 된다. Include in Git은 저장소가 없는 폴더에서도 설정되고, Keep out of Git은 사람이 동의하면 `git init`을 한다(PRODUCT §5 item 0 'Doan files').
- 그런데 Project 단계에는 이미 있는 폴더를 고르는 길(Choose folder, 끌어 놓기, 'Your projects', GitHub URL)만 있다. 새 폴더는 Finder에서 먼저 만들어야 한다.
- Choose folder 창에는 macOS New Folder 버튼도 없다. 클론 위치 창(Choose Where to Clone)에만 있다(`app/src/main/index.ts` `chooseFolder`).

## 정한 점

1. **창은 macOS 저장 창**이다. 이름 칸과 위치를 한 시트에서 고르고, 버튼은 Create다. 앱이 그리는 대화상자는 없다.
2. **두 곳 모두**: 첫 실행의 Project 단계와 Add Projects 페이지. 두 화면은 같은 Project 단계를 쓴다.
3. **기본 위치는 클론과 같다**: 마지막으로 등록한 프로젝트의 부모 폴더, 등록된 프로젝트가 없으면 HOME(`projectStep.ts` `defaultDestination`의 부모 규칙).
4. **이미 있는 이름**: 아무것도 덮어쓰지 않는다. 클론의 `destination_exists`와 같은 모양의 알림에 다른 이름 고르기와 Use existing folder를 둔다. Use existing folder는 그 폴더를 Choose folder로 고른 것처럼 다룬다.
5. **Choose folder 창에도 macOS New Folder 버튼을 켠다**(`createDirectory`). 클론 위치 창과 같아진다.
6. **만든 뒤의 흐름은 Choose folder와 같다**: 만든 폴더를 바로 검사(inspect)하고, 빈 폴더이므로 설정 패널(Doan files 선택 포함)로 간다. 폴더를 만드는 것과 Doan 설정은 별개다. 설정 전에 그만두면 빈 폴더는 디스크에 남는다.
7. **등록된 Doan 프로젝트 안의 위치는 거부**한다. 클론 위치와 같은 규칙이다. 폴더를 만들기 전에 알림을 보이고 다른 위치를 고르게 한다.

## 완료 조건

- 첫 실행 Project 단계와 Add Projects 페이지의 'Open a local folder' 카드에 New folder 버튼이 있다. 키보드로 닿고, 다른 작업 중(`busy`)에는 Choose folder와 같이 비활성이다.
- New folder를 누르면 창에 붙은 macOS 저장 창이 열리고, 위치는 정한 점 3의 기본값이다. 취소하면 아무것도 바뀌지 않고 포커스가 New folder로 돌아온다.
- Create를 누르면 그 위치에 빈 폴더가 생기고 설정 패널이 그 폴더로 열린다. 저장 창이 열려 있는 동안 페이지는 다른 picker와 같이 잠긴다.
- 이미 있는 이름이면 폴더를 만들지 않고 알림을 보인다. Use existing folder는 그 폴더를 검사한다. 다른 이름을 고르면 저장 창이 다시 열린다.
- 폴더를 만들 수 없으면(권한, 사라진 위치 등) 알림에 이유와 다시 고르는 동작이 있고, 아무것도 만들어지지 않는다.
- 등록된 Doan 프로젝트 안의 위치를 고르면 폴더를 만들지 않고 클론과 같은 알림을 보인다.
- Choose folder 창에 macOS New Folder 버튼이 있다.
- PRODUCT §5 item 0 'Project step'과 item 1 'Add Projects'가 New folder를 적는다.

## 하지 않는 것

- 앱이 그리는 이름·위치 대화상자.
- 템플릿, 시작 캔버스, README 같은 파일 만들기. 폴더 하나만 만든다.
- `git init`을 New folder에서 하는 것. 저장소 생성은 기존 Keep out of Git 규칙만 따른다.
- CLI·`doan onboarding`에 폴더 만들기 추가.
- 설정을 그만둔 뒤 빈 폴더 지우기.
